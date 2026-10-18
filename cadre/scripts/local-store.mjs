// Shared code of the local tracker: where the folder is, how a file is written, how a file is read.
// The folder is `.cadre/` in the main clone. `git rev-parse --git-common-dir` gives the same answer in a
// worktree, so each worktree of a repo reaches one folder. Setup adds the folder to `.git/info/exclude`.
// A function throws an Error with the reason. The caller prints `unknown: <reason>`.
import { spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, linkSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { LEDGER_HEADER, parseHolder } from './resume-core.mjs';
import { basename, dirname, join, resolve } from 'node:path';

// The owner is the OS user name: it exists on each machine and it does not change with a repo config.
// The git user.email can be unset, or differ from clone to clone. CADRE_LOCAL_USER replaces it in a test.
export const localUser = () => process.env.CADRE_LOCAL_USER || userInfo().username;

export const slug = (name) => String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Return { clone, common, folder } for the repo that holds the current folder.
export function locate() {
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8', timeout: 20000 });
  if (r.status !== 0 || !r.stdout.trim()) throw new Error('this folder is not in a git repo');
  const common = realpathSync.native(resolve(r.stdout.trim()));
  if (basename(common) !== '.git') throw new Error('the repo has no main clone (it is bare)');
  const clone = dirname(common);
  return { clone, common, folder: join(clone, '.cadre') };
}

// Make the folders, and add the folder to .git/info/exclude. Safe to run again.
export function ensure(where, ...sub) {
  const exclude = join(where.common, 'info', 'exclude');
  mkdirSync(dirname(exclude), { recursive: true });
  const text = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
  if (!text.split(/\r?\n/).includes('/.cadre/')) appendFileSync(exclude, `${text && !text.endsWith('\n') ? '\n' : ''}/.cadre/\n`);
  const path = join(where.folder, ...sub);
  mkdirSync(path, { recursive: true });
  return path;
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Rename a file. On Windows a rename over a file that another process holds open fails with EPERM, EBUSY,
// or EACCES, often for a short time (a virus scan, the indexer). Try again with a longer wait each time:
// 10 tries over about 1 second. After the last try, throw the last error. Any other error throws at once.
// A test injects `rename` and `wait`.
export function renameWithRetry(from, to, { tries = 10, rename = renameSync, wait = sleep } = {}) {
  for (let i = 1; ; i++) {
    try {
      return rename(from, to);
    } catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i >= tries) throw e;
      wait(25 * i);
    }
  }
}

// Write a file in two steps: a temp file in the same folder, then a rename. A reader never sees half a file.
// When the write fails, the temp file is removed. `options` goes to renameWithRetry.
export function writeAtomic(file, text, options) {
  const temp = join(dirname(file), `.${basename(file)}.${process.pid}.tmp`);
  try {
    writeFileSync(temp, text);
    renameWithRetry(temp, file, options);
  } catch (e) {
    rmSync(temp, { force: true });
    throw e;
  }
}

// Make a new file, or return false when the name exists. A temp file is linked to the final name,
// so a second writer cannot replace the first, and a reader never sees half a file.
export function createExclusive(file, text) {
  const temp = join(dirname(file), `.${basename(file)}.${process.pid}.tmp`);
  writeFileSync(temp, text);
  try {
    linkSync(temp, file);
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  } finally {
    rmSync(temp, { force: true });
  }
}

export function newFile(owner, name, purpose, holder) {
  return [
    `# Orchestrator: ${name}`, `owner: ${owner}`, 'state: open', '',
    '## Purpose', purpose, '',
    '## Repos', '', '',
    '## Ledger', '| Granted by | Action | Repo or host | Scope | When |', '| --- | --- | --- | --- | --- |', '',
    '## Holder', `session: ${holder.session}`, `host: ${holder.host}`, `since: ${holder.since}`, '',
  ].join('\n');
}

// Read the text of an orchestrator file. Return { owner, state, sections, checkpoints }.
// The lines before the first `##` heading hold `owner:` and `state:` (open or closed), each once.
// The file ends in checkpoints. A checkpoint starts at a line `cadre-checkpoint v1 ...` outside a code fence.
// The body is the text before the first checkpoint. It is unknown when a section heading is twice, a heading is
// inside a code fence, or a code fence is not closed. `sections` maps a lower case title to its lines.
// Each checkpoint is { id, firstLine, headings }. The id is the time of its marker line, or the line itself.
export function parseFile(text) {
  const body = [];
  const checkpoints = [];
  let fenced = false;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (!fenced && /^cadre-checkpoint v1(\s|$)/.test(line)) checkpoints.push({ id: line.trim().split(' ')[2] ?? line.trim(), firstLine: line.trim(), headings: [], lines: [line] });
    else if (checkpoints.length > 0) {
      checkpoints.at(-1).lines.push(line);
      if (!fenced && /^##\s/.test(line)) checkpoints.at(-1).headings.push(line.replace(/^##\s+/, '').trim().toLowerCase());
    } else body.push(line);
  }
  if (fenced) throw new Error('a code fence is not closed');

  const head = {};
  const sections = new Map();
  let current = null;
  let inFence = false;
  for (const line of body) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    else if (/^##\s/.test(line)) {
      if (inFence) throw new Error('a heading is inside a code fence');
      const title = line.replace(/^##\s+/, '').trim();
      if (sections.has(title.toLowerCase())) throw new Error(`the file has the heading ${title} twice`);
      sections.set(title.toLowerCase(), (current = []));
      continue;
    }
    if (current) current.push(line);
    else {
      const m = /^(owner|state):[ \t]*(\S.*?)\s*$/.exec(line);
      if (m) {
        if (m[1] in head) throw new Error(`the file has ${m[1]} twice`);
        head[m[1]] = m[2];
      }
    }
  }
  if (!head.owner) throw new Error('the file has no owner line');
  if (head.state !== 'open' && head.state !== 'closed') throw new Error('the state line is not open or closed');
  return { owner: head.owner, state: head.state, sections, checkpoints };
}

// Check the text of a file that is about to be written, as a read does: the file parses, the Holder has its
// fields, and the Ledger has its header. Throw an Error with the reason. A write calls it before it writes.
export function validate(text) {
  const parsed = parseFile(text);
  const section = (title) => parsed.sections.get(title) ?? (() => { throw new Error(`the file has no ${title} section`); })();
  for (const title of ['purpose', 'repos']) section(title);
  parseHolder(section('holder'));
  const header = section('ledger').find((l) => l.trim().startsWith('|'));
  const cells = header?.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().toLowerCase());
  if (!cells || cells.join('|') !== LEDGER_HEADER) throw new Error('the Ledger table has no header Granted by | Action | Repo or host | Scope | When');
  return parsed;
}

export const LOCK_WAIT_MS = 2000;
export const LOCK_STALE_MS = 30000;

// Hold `<file>.lock` while `work` runs. The lock is made with an exclusive create. A lock that exists is
// waited for, about 2 seconds, and then the call throws `busy`. A lock older than 30 seconds is stale (its
// writer died), and the call takes it over.
export function withLock(file, work) {
  const lock = `${file}.lock`;
  const end = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      closeSync(openSync(lock, 'wx'));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age = 0;
      try {
        age = Date.now() - statSync(lock).mtimeMs;
      } catch {
        continue; // the lock went away: try again at once
      }
      if (age > LOCK_STALE_MS) {
        rmSync(lock, { force: true });
        continue;
      }
      if (Date.now() >= end) throw new Error('busy');
      sleep(25);
    }
  }
  try {
    return work();
  } finally {
    rmSync(lock, { force: true });
  }
}
