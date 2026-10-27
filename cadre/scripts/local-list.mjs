// Make, list, and change the files of the local tracker, so that no agent reads or writes one by hand.
// Usage: node local-list.mjs init
//        node local-list.mjs orchestrators
//        node local-list.mjs new <name> <purpose> [session-id]
//        node local-list.mjs put <name> <Purpose|Repos|Ledger|Holder> <file>
//        node local-list.mjs checkpoint <name> <file>
//        node local-list.mjs latest <name>
//        node local-list.mjs state <name> <open|closed>
//        node local-list.mjs ticket <orchestrator name> <title>
//        node local-list.mjs work <orchestrator name>
// Run it inside the repo or in one of its worktrees. The files are in .cadre/ of the main clone (local-store.mjs).
// Output and exit code:
//   ok <command> <file or id>   exit 0   init, new, put, state, ticket, checkpoint (the id is its marker time)
//   orchestrator name=<slug> owner=<user, percent-encoded> state=<open|closed> holder=<session|none> purpose=<text>
//   ticket n=<n> state=open title=<title>
//                               one line for each item, exit 0. The last field is the rest of the line.
//   <block>                     exit 0   latest: the newest trusted checkpoint, from its marker line to its end
//   none                        exit 0   the list is empty, or latest found no checkpoint
//   refuse: <reason>            exit 1   the name is taken, the user is not the owner, or the input is not valid
//   unknown: <reason>           exit 2   a read or a write failed, or a file is corrupt. This is never none.
//   usage message on stderr              exit 64
// A write changes one section and keeps the rest. It holds `<file>.lock` (an exclusive create) from the read to
// the re-read. A lock that stays about 2 seconds gives `unknown: busy`. A lock older than 30 seconds is stale,
// and the next write takes it over. The new text is parsed as a read parses it, before the write: input that
// would leave an unreadable file changes nothing. The write goes to a temp file in the same folder, then a
// rename, and the script reads the file again. A put or a checkpoint needs the owner. A file in the folder that is not
// valid is unknown, so a list is never shorter than the truth.
// A ticket is tickets/<n>-<slug>.md with the lines `state: open|closed` and `work: <orchestrator>`.
// An agent changes the state line of a ticket by hand. `work` lists the open tickets of one orchestrator.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHolder, pickCheckpoint, same } from './resume-core.mjs';
import { createExclusive, ensure, localUser, locate, newFile, parseFile, slug, validate, withLock, writeAtomic } from './local-store.mjs';
import { say } from './out.mjs';

const refuse = (reason) => say(`refuse: ${reason}`, 1);
const SHAPES = [
  'init', 'orchestrators', 'new <name> <purpose> [session-id]', 'put <name> <Purpose|Repos|Ledger|Holder> <file>',
  'checkpoint <name> <file>', 'latest <name>', 'state <name> <open|closed>', 'ticket <orchestrator name> <title>', 'work <orchestrator name>',
];
const usage = () => {
  console.error(`usage: local-list.mjs ${SHAPES.join(' | ')}`);
  process.exit(64);
};

const now = () => new Date().toISOString().slice(0, 19) + 'Z';
function hostId() {
  const r = spawnSync(process.execPath, [join(import.meta.dirname, 'host-id.mjs')], { encoding: 'utf8', timeout: 20000 });
  const id = r.stdout.trim();
  if (r.status !== 0 || !/^[0-9a-f]{32}$/.test(id)) throw new Error('cannot read the host id of this machine');
  return id;
}
const files = (folder) => (existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.md') && !f.startsWith('.')).sort() : []);
const oneLine = (text, what) => {
  if (/[\r\n\u0000]/.test(text) || !text.trim()) throw new Error(`${what} must be one line of text`);
  return text.trim();
};

// Read one orchestrator file. Return { file, text, parsed, holder }.
function load(where, name) {
  const file = join(where.folder, 'orchestrators', `${slug(name)}.md`);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(e.code === 'ENOENT' ? `there is no file for ${name}` : `cannot read ${file}: ${e.message}`);
  }
  const parsed = parseFile(text);
  return { file, text, parsed };
}

// The line range of a section: from its heading to the next heading or the first checkpoint.
function sectionRange(lines, title) {
  let start = -1;
  let fenced = false;
  for (const [i, line] of lines.entries()) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (!fenced && /^cadre-checkpoint v1(\s|$)/.test(line)) return start < 0 ? null : [start, i];
    if (!fenced && /^##\s/.test(line)) {
      if (start >= 0) return [start, i];
      if (line.replace(/^##\s+/, '').trim().toLowerCase() === title.toLowerCase()) start = i;
    }
  }
  return start < 0 ? null : [start, lines.length];
}

// Write the new text of an orchestrator file, then read it again. The owner only.
function change(where, name, edit) {
  const file = join(where.folder, 'orchestrators', `${slug(name)}.md`);
  if (!existsSync(file)) throw new Error(`there is no file for ${name}`);
  // A refusal exits the process and skips the `finally` of withLock. So change() refuses after withLock frees the lock.
  const result = withLock(file, () => {
    const cur = load(where, name);
    if (!same(localUser(), cur.parsed.owner)) return { refusal: `${localUser()} is not the owner (${cur.parsed.owner}) of ${name}` };
    const text = edit(cur.text.replace(/\r\n/g, '\n'));
    validate(text); // the new file must read as a valid file, or nothing is written
    writeAtomic(cur.file, text);
    if (readFileSync(cur.file, 'utf8') !== text) throw new Error(`the file for ${name} changed during the write: run the command again`);
    return { file: cur.file };
  });
  if (result.refusal) refuse(result.refusal);
  return result.file;
}

const setUp = (where) => {
  if (!existsSync(where.folder)) throw new Error('not set up; run /cadre:setup');
};

const [command, ...args] = process.argv.slice(2);
const takes = (min, max = min) => args.length >= min && args.length <= max;
try {
  const where = locate();
  if (command === 'init' && takes(0)) {
    say(`ok init ${ensure(where)}`, 0);
  } else if (command === 'orchestrators' && takes(0)) {
    setUp(where);
    const rows = files(join(where.folder, 'orchestrators')).map((f) => {
      const name = f.slice(0, -3);
      try {
        const { parsed } = load(where, name);
        const holder = parseHolder(parsed.sections.get('holder') ?? []);
        const purpose = (parsed.sections.get('purpose') ?? []).find((l) => l.trim()) ?? '';
        return `orchestrator name=${name} owner=${encodeURIComponent(parsed.owner)} state=${parsed.state} holder=${holder.session} purpose=${purpose.trim()}`;
      } catch (e) {
        throw new Error(`${f}: ${e.message}`);
      }
    });
    say(rows.length ? rows : 'none', 0);
  } else if (command === 'new' && takes(2, 3)) {
    const [name, purpose, session] = args;
    if (!slug(name)) refuse('the name has no letter or digit');
    const holder = session ? { session, host: hostId(), since: now() } : { session: 'none', host: 'none', since: 'none' };
    const text = newFile(localUser(), oneLine(name, 'the name'), oneLine(purpose, 'the purpose'), holder);
    validate(text); // bad input writes nothing, and the name stays free
    const file = join(ensure(where, 'orchestrators'), `${slug(name)}.md`);
    if (!createExclusive(file, text)) refuse(`the name ${name} is taken`);
    say(`ok new ${file}`, 0);
  } else if (command === 'put' && takes(3)) {
    const [name, title, input] = args;
    const known = ['Purpose', 'Repos', 'Ledger', 'Holder'].find((t) => t.toLowerCase() === title.toLowerCase());
    if (!known) refuse(`${title} is not a section: use Purpose, Repos, Ledger, or Holder`);
    const content = readFileSync(input, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
    if (!content.trim()) refuse('the new text is empty');
    if (/^##\s|^cadre-checkpoint v1/m.test(content)) refuse('the new text holds a heading or a marker line');
    if (known === 'Holder') parseHolder(content.split('\n'));
    const file = change(where, name, (text) => {
      const lines = text.split('\n');
      const range = sectionRange(lines, known);
      if (!range) throw new Error(`the file has no ${known} section`);
      lines.splice(range[0], range[1] - range[0], `## ${known}`, ...content.split('\n'), '');
      return lines.join('\n');
    });
    say(`ok put ${file}`, 0);
  } else if (command === 'checkpoint' && takes(2)) {
    const [name, input] = args;
    const content = readFileSync(input, 'utf8').replace(/\r\n/g, '\n').trim();
    const heads = content.split('\n').filter((l) => /^##\s/.test(l)).map((l) => l.replace(/^##\s+/, '').trim().toLowerCase());
    if (!['decisions', 'waiting for the human', 'next, in order'].every((h) => heads.includes(h)) || /^cadre-checkpoint v1/m.test(content)) {
      refuse('a checkpoint needs the sections Decisions, Waiting for the human, and Next, in order, and no marker line');
    }
    const id = now();
    change(where, name, (text) => `${text.replace(/\s+$/, '')}\n\ncadre-checkpoint v1 ${id}\n\n${content}\n`);
    say(`ok checkpoint ${id}`, 0);
  } else if (command === 'latest' && takes(1)) {
    const { parsed } = load(where, args[0]);
    const picked = pickCheckpoint(parsed.checkpoints.map((c) => ({ ...c, author: parsed.owner })), parsed.owner);
    const block = parsed.checkpoints.filter((c) => c.id === picked.id).at(-1);
    say(block ? block.lines.join('\n').replace(/\s+$/, '') : 'none', 0);
  } else if (command === 'state' && takes(2)) {
    if (args[1] !== 'open' && args[1] !== 'closed') usage();
    const file = change(where, args[0], (text) => text.replace(/^state:.*$/m, `state: ${args[1]}`));
    say(`ok state ${file}`, 0);
  } else if (command === 'ticket' && takes(2)) {
    const [name, title] = args;
    if (!slug(name) || !slug(title)) refuse('the name and the title need a letter or a digit');
    const folder = ensure(where, 'tickets');
    const last = Math.max(0, ...readdirSync(folder).map((f) => Number(/^(\d+)-/.exec(f)?.[1] ?? 0)));
    for (let n = last + 1; ; n++) {
      const file = join(folder, `${n}-${slug(title)}.md`);
      if (createExclusive(file, `# ${oneLine(title, 'the title')}\nstate: open\nwork: ${oneLine(name, 'the name')}\n`)) say(`ok ticket ${file}`, 0);
    }
  } else if (command === 'work' && takes(1)) {
    setUp(where);
    const folder = join(where.folder, 'tickets');
    const rows = [];
    for (const f of files(folder)) {
      const text = readFileSync(join(folder, f), 'utf8').replace(/\r\n/g, '\n');
      const get = (key) => text.match(new RegExp(`^${key}:[ \\t]*(\\S.*?)\\s*$`, 'm'))?.[1];
      const title = /^# (\S.*?)\s*$/m.exec(text)?.[1];
      const n = /^(\d+)-/.exec(f)?.[1];
      const state = get('state');
      if (!n || !title || !get('work') || (state !== 'open' && state !== 'closed')) throw new Error(`${f} is not a ticket file`);
      if (state === 'open' && slug(get('work')) === slug(args[0])) rows.push({ n: Number(n), title });
    }
    rows.sort((a, b) => a.n - b.n);
    say(rows.length ? rows.map((r) => `ticket n=${r.n} state=open title=${r.title}`) : 'none', 0);
  } else usage();
} catch (e) {
  say(`unknown: ${e.message}`, 2);
}
