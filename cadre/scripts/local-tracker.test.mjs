// Tests for the local tracker at the command line: local-list.mjs and resume-read-local.mjs.
// Each test makes a temporary git repo with no remote. The owner comes from CADRE_LOCAL_USER, and the
// host id from a file in a temporary CADRE_HOME. A live-session check is replaced through CLAUDE_AGENTS_JSON_CMD.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const list = join(import.meta.dirname, 'local-list.mjs');
const resume = join(import.meta.dirname, 'resume-read-local.mjs');
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cadre-local-')));
after(() => rmSync(dir, { recursive: true, force: true }));

const HOST = 'a'.repeat(32);
const SESSION = '11111111-2222-3333-4444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

let n = 0;
function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t' + String.fromCharCode(64) + 'example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}
function makeRepo() {
  const repo = join(dir, `repo${n++}`);
  mkdirSync(repo);
  git(repo, 'init', '-q');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'first');
  return repo;
}
function env(over = {}) {
  const home = join(dir, 'home');
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'host-id'), `${HOST}\n`);
  return { ...process.env, CADRE_HOME: home, CADRE_LOCAL_USER: 'ada', CLAUDE_AGENTS_JSON_CMD: `"${process.execPath}" -e "console.log('[]')"`, ...over };
}
function run(script, cwd, args, over) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: env(over) });
  return { line: r.stdout.trim(), lines: r.stdout.split('\n').filter(Boolean), err: r.stderr.trim(), code: r.status };
}
const ls = (cwd, ...args) => run(list, cwd, args);
const rs = (cwd, args, over) => run(resume, cwd, args, over);
const fields = (line) => Object.fromEntries(line.split(' ').slice(1).map((p) => p.split('=')));
const orchFile = (repo, name) => join(repo, '.cadre', 'orchestrators', `${name}.md`);

test('new makes the file in the clone, and git never shows the folder', () => {
  const repo = makeRepo();
  const r = ls(repo, 'new', 'Rigel', 'Ship the report.', SESSION);
  assert.deepEqual([r.line, r.code], [`ok new ${orchFile(repo, 'rigel')}`, 0]);
  const text = readFileSync(orchFile(repo, 'rigel'), 'utf8');
  for (const h of ['## Purpose', '## Repos', '## Ledger', '## Holder']) assert.ok(text.includes(h), h);
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.match(readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8'), /^\/\.cadre\/$/m);
  assert.deepEqual(readdirSync(join(repo, '.cadre', 'orchestrators')), ['rigel.md']); // no temp file stays
});

const OK_FREE = { holder: 'free', session: 'none', checkpoint: 'none', ignored: 'none', state: 'open', 'bad-rows': 'none', 'ended-rows': 'none' };

test('resume: the owner of a free orchestrator gets ok with holder=free', () => {
  const repo = makeRepo();
  ls(repo, 'new', 'Rigel', 'Ship the report.');
  const r = rs(repo, ['Rigel', SESSION]);
  assert.equal(r.code, 0);
  assert.equal(r.lines.length, 1);
  assert.match(r.line, /^ok /);
  assert.deepEqual(fields(r.line), OK_FREE);
});

test('resume: a holder with the same session is self, and another session sees same-host', () => {
  const repo = makeRepo();
  ls(repo, 'new', 'Rigel', 'Ship the report.', SESSION);
  assert.equal(fields(rs(repo, ['rigel', SESSION]).line).holder, 'self');
  const other = fields(rs(repo, ['rigel', OTHER]).line);
  assert.deepEqual([other.holder, other.session], ['same-host', SESSION]);
});

test('resume: a holder from another host id is other-host', () => {
  const repo = makeRepo();
  ls(repo, 'new', 'Rigel', 'Ship the report.', SESSION);
  const home = join(dir, 'home-other');
  mkdirSync(home);
  writeFileSync(join(home, 'host-id'), `${'b'.repeat(32)}\n`);
  assert.equal(fields(rs(repo, ['rigel', OTHER], { CADRE_HOME: home }).line).holder, 'other-host');
});

test('resume: a user who is not the owner is refused', () => {
  const repo = makeRepo();
  ls(repo, 'new', 'Rigel', 'Ship the report.');
  const r = rs(repo, ['rigel', SESSION], { CADRE_LOCAL_USER: 'grace' });
  assert.deepEqual([r.line, r.code], ['not-owner login=grace assignee=ada', 1]);
  assert.equal(rs(repo, ['rigel', SESSION], { CADRE_LOCAL_USER: 'ADA' }).code, 0); // case is ignored
});

test('resume: a missing file is unknown, and a bad argument is usage', () => {
  const repo = makeRepo();
  const r = rs(repo, ['nobody', SESSION]);
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: .*nobody/);
  assert.equal(rs(repo, []).code, 64);
  assert.match(rs(repo, []).err, /^usage: /);
});

const temp = (text) => {
  const file = join(dir, `in${n++}.md`);
  writeFileSync(file, text);
  return file;
};
const CP = (time) => `\ncadre-checkpoint v1 ${time}\n\n## Decisions\n- none\n\n## Waiting for the human\n1. none\n\n## Next, in order\n1. none\n`;
const append = (repo, text) => writeFileSync(orchFile(repo, 'rigel'), readFileSync(orchFile(repo, 'rigel'), 'utf8') + text);
const stamp = (ms) => new Date(Date.now() + ms).toISOString().slice(0, 19) + 'Z';

test('checkpoint: one appended by the script is found, and the newest marker time wins', () => {
  const repo = makeRepo();
  ls(repo, 'new', 'Rigel', 'Ship the report.');
  const r = ls(repo, 'checkpoint', 'Rigel', temp('## Decisions\n- a\n\n## Waiting for the human\n1. none\n\n## Next, in order\n1. b\n'));
  assert.equal(r.code, 0);
  const id = /^ok checkpoint (\S+)$/.exec(r.line)?.[1];
  assert.match(id, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.equal(fields(rs(repo, ['rigel', SESSION]).line).checkpoint, id);
  append(repo, CP('2020-01-01T00:00:00Z')); // older, and later in the file
  assert.equal(fields(rs(repo, ['rigel', SESSION]).line).checkpoint, id);
  const later = new Date(Date.parse(id) + 1000).toISOString().slice(0, 19) + 'Z';
  append(repo, CP(later));
  assert.equal(fields(rs(repo, ['rigel', SESSION]).line).checkpoint, later);
});

test('checkpoint: a time more than 5 minutes ahead is ignored and named, and a marker with no sections is skipped', () => {
  const repo = makeRepo();
  ls(repo, 'new', 'Rigel', 'Ship the report.');
  append(repo, CP('2026-10-01T00:00:00Z'));
  append(repo, CP(stamp(3600 * 1000)));
  append(repo, '\ncadre-checkpoint v1 2026-10-02T00:00:00Z\n\njust text\n');
  const f = fields(rs(repo, ['rigel', SESSION]).line);
  assert.deepEqual([f.checkpoint, f.ignored], ['2026-10-01T00:00:00Z', stamp(3600 * 1000)]);
});

test('checkpoint: a marker line inside a code fence is not a checkpoint', () => {
  const repo = makeRepo();
  ls(repo, 'new', 'Rigel', 'Ship the report.');
  const edit = (inside) => writeFileSync(orchFile(repo, 'rigel'), readFileSync(orchFile(repo, 'rigel'), 'utf8').replace('## Repos', `\`\`\`\n${inside}\n\`\`\`\n\n## Repos`));
  edit('cadre-checkpoint v1 2026-10-01T00:00:00Z');
  assert.equal(fields(rs(repo, ['rigel', SESSION]).line).checkpoint, 'none');
  edit(CP('2026-10-02T00:00:00Z')); // its headings are then in a fence: unknown
  assert.equal(rs(repo, ['rigel', SESSION]).code, 2);
});

test('put: a Holder written by the script is read back as self, and the Ledger audit names bad rows', () => {
  const repo = makeRepo();
  ls(repo, 'new', 'Rigel', 'Ship the report.');
  const holder = `session: ${SESSION}\nhost: ${HOST}\nsince: 2026-10-17T08:00:00Z\n`;
  assert.deepEqual([ls(repo, 'put', 'Rigel', 'Holder', temp(holder)).line.split(' ').slice(0, 2).join(' '), ls(repo, 'put', 'Rigel', 'holder', temp(holder)).code], ['ok put', 0]);
  assert.equal(fields(rs(repo, ['rigel', SESSION]).line).holder, 'self');
  const ledger = `| Granted by | Action | Repo or host | Scope | When |\n| --- | --- | --- | --- | --- |\n| ada | merge | acme | all | 2026-10-17 indefinite |\n| grace | merge | acme | all | 2026-10-17 indefinite |\n| ada | push | acme | all | 2026-10-17 session ${OTHER} |\n`;
  ls(repo, 'put', 'Rigel', 'Ledger', temp(ledger));
  const f = fields(rs(repo, ['rigel', SESSION]).line);
  assert.deepEqual([f['bad-rows'], f['ended-rows'], f.holder], ['2', '3', 'self']);
  assert.match(readFileSync(orchFile(repo, 'rigel'), 'utf8'), /## Purpose\nShip the report\.\n/); // the other sections stay
});

test('put and checkpoint: refused for a user who is not the owner, and for an unknown section', () => {
  const repo = makeRepo();
  ls(repo, 'new', 'Rigel', 'Ship the report.');
  const before = readFileSync(orchFile(repo, 'rigel'), 'utf8');
  const other = (...a) => run(list, repo, a, { CADRE_LOCAL_USER: 'grace' });
  assert.equal(other('put', 'Rigel', 'Purpose', temp('x\n')).code, 1);
  assert.equal(other('checkpoint', 'Rigel', temp('x\n')).code, 1);
  assert.equal(ls(repo, 'put', 'Rigel', 'Secrets', temp('x\n')).code, 1);
  assert.equal(readFileSync(orchFile(repo, 'rigel'), 'utf8'), before);
});

test('a corrupt file gives unknown and never ok', () => {
  const good = (r) => readFileSync(orchFile(r, 'rigel'), 'utf8');
  const cases = {
    'a heading twice': (t) => t + '\n## Purpose\nagain\n',
    'no Holder': (t) => t.replace(/## Holder[\s\S]*$/, ''),
    'a bad Holder line': (t) => t.replace('session: none', 'session: sometimes'),
    'a bad Ledger header': (t) => t.replace('Granted by', 'Who'),
    'a heading in a fence': (t) => t.replace('## Repos', '```\n## Repos\n```'),
    'a fence not closed': (t) => t + '\n```\n',
    'no owner': (t) => t.replace(/^owner: .*\n/m, ''),
    'two owners': (t) => t.replace('state: open', 'owner: grace\nstate: open'),
    'a bad state': (t) => t.replace('state: open', 'state: maybe'),
    'an empty file': () => '',
    'binary noise': () => '\u0000\u0001 not a file',
  };
  for (const [what, change] of Object.entries(cases)) {
    const repo = makeRepo();
    ls(repo, 'new', 'Rigel', 'Ship the report.');
    writeFileSync(orchFile(repo, 'rigel'), change(good(repo)));
    const r = rs(repo, ['rigel', SESSION]);
    assert.equal(r.code, 2, what);
    assert.match(r.line, /^unknown: /, what);
  }
});

test('a worktree reaches the same folder, and the file is not in the worktree', () => {
  const repo = makeRepo();
  const tree = join(dir, `tree${n++}`);
  git(repo, 'worktree', 'add', '-q', '-b', 'side', tree);
  const made = ls(tree, 'new', 'Rigel', 'Ship the report.');
  assert.equal(made.line, `ok new ${orchFile(repo, 'rigel')}`);
  assert.ok(existsSync(orchFile(repo, 'rigel')));
  assert.equal(existsSync(join(tree, '.cadre')), false);
  assert.deepEqual(fields(rs(tree, ['rigel', SESSION]).line), OK_FREE);
  assert.equal(git(tree, 'status', '--porcelain'), '');
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('new refuses a name that is taken, ignoring case, and a name with no letter', () => {
  const repo = makeRepo();
  assert.equal(ls(repo, 'new', 'Rigel', 'One.').code, 0);
  const text = readFileSync(orchFile(repo, 'rigel'), 'utf8');
  for (const name of ['rigel', 'RIGEL', ' Rigel ']) {
    const r = ls(repo, 'new', name, 'Two.');
    assert.deepEqual([r.code, r.line.startsWith('refuse: ')], [1, true], name);
  }
  assert.equal(ls(repo, 'new', '!!!', 'Two.').code, 1);
  assert.equal(readFileSync(orchFile(repo, 'rigel'), 'utf8'), text);
});

test('orchestrators lists one line for each file, and none for an empty tracker', () => {
  const repo = makeRepo();
  assert.deepEqual([ls(repo, 'orchestrators').line, ls(repo, 'orchestrators').code], ['none', 0]);
  ls(repo, 'new', 'Rigel', 'Ship the report.', SESSION);
  ls(repo, 'new', 'Mara', 'Fix the pump.');
  const r = ls(repo, 'orchestrators');
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, [
    'orchestrator name=mara owner=ada state=open holder=none purpose=Fix the pump.',
    `orchestrator name=rigel owner=ada state=open holder=${SESSION} purpose=Ship the report.`,
  ]);
});

test('orchestrators gives unknown when one file is corrupt, never a shorter list', () => {
  const repo = makeRepo();
  ls(repo, 'new', 'Rigel', 'Ship the report.');
  ls(repo, 'new', 'Mara', 'Fix the pump.');
  writeFileSync(orchFile(repo, 'mara'), 'junk');
  const r = ls(repo, 'orchestrators');
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: .*mara/);
});

test('tickets: ticket makes a numbered file, and work lists the open tickets of one orchestrator', () => {
  const repo = makeRepo();
  ls(repo, 'new', 'Rigel', 'Ship the report.');
  assert.equal(ls(repo, 'work', 'Rigel').line, 'none');
  const a = ls(repo, 'ticket', 'Rigel', 'Fix the pump!');
  const b = ls(repo, 'ticket', 'rigel', 'Write the docs');
  const c = ls(repo, 'ticket', 'Mara', 'Other work');
  assert.deepEqual([a.code, a.line], [0, `ok ticket ${join(repo, '.cadre', 'tickets', '1-fix-the-pump.md')}`]);
  assert.equal(b.line, `ok ticket ${join(repo, '.cadre', 'tickets', '2-write-the-docs.md')}`);
  assert.equal(c.code, 0);
  assert.equal(readFileSync(join(repo, '.cadre', 'tickets', '1-fix-the-pump.md'), 'utf8'), '# Fix the pump!\nstate: open\nwork: Rigel\n');
  const closed = join(repo, '.cadre', 'tickets', '2-write-the-docs.md');
  writeFileSync(closed, readFileSync(closed, 'utf8').replace('state: open', 'state: closed'));
  assert.deepEqual(ls(repo, 'work', 'RIGEL').lines, ['ticket n=1 state=open title=Fix the pump!']);
  assert.deepEqual(ls(repo, 'work', 'Mara').lines, ['ticket n=3 state=open title=Other work']);
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('tickets: a ticket file with no state line gives unknown for work', () => {
  const repo = makeRepo();
  ls(repo, 'ticket', 'Rigel', 'One');
  writeFileSync(join(repo, '.cadre', 'tickets', '1-one.md'), '# One\nwork: Rigel\n');
  assert.equal(ls(repo, 'work', 'Rigel').code, 2);
});

test('state: close and reopen an orchestrator, and the resume reads it', () => {
  const repo = makeRepo();
  ls(repo, 'new', 'Rigel', 'Ship the report.');
  assert.equal(ls(repo, 'state', 'Rigel', 'closed').code, 0);
  assert.equal(fields(rs(repo, ['rigel', SESSION]).line).state, 'closed');
  assert.equal(ls(repo, 'state', 'Rigel', 'open').code, 0);
  assert.equal(fields(rs(repo, ['rigel', SESSION]).line).state, 'open');
  assert.equal(ls(repo, 'state', 'Rigel', 'half').code, 64);
});

test('a folder that is not a git repo gives unknown', () => {
  const plain = join(dir, `plain${n++}`);
  mkdirSync(plain);
  const r = run(list, plain, ['orchestrators'], { GIT_CEILING_DIRECTORIES: dir });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
});

test('init adds the exclude line once and makes no other change', () => {
  const repo = makeRepo();
  assert.equal(ls(repo, 'init').line, `ok init ${join(repo, '.cadre')}`);
  ls(repo, 'init');
  const lines = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8').split('\n').filter((l) => l === '/.cadre/');
  assert.equal(lines.length, 1);
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('a second resume while another live session holds the name is held, through holder-check', () => {
  const repo = makeRepo();
  ls(repo, 'new', 'Rigel', 'Ship the report.', SESSION);
  const f = fields(rs(repo, ['rigel', OTHER]).line);
  assert.deepEqual([f.holder, f.session], ['same-host', SESSION]);
  const agents = join(dir, `agents${n++}.json`);
  writeFileSync(agents, JSON.stringify([{ pid: 4242, sessionId: SESSION, name: 'rigel', cwd: repo, kind: 'interactive', status: 'busy' }]));
  const check = spawnSync(process.execPath, [join(import.meta.dirname, 'holder-check.mjs'), f.session], {
    encoding: 'utf8',
    env: { ...env(), CLAUDE_AGENTS_JSON_CMD: `"${process.execPath}" -e "process.stdout.write(require('fs').readFileSync(process.argv[1],'utf8'))" "${agents}"`, CADRE_PROCESS_CMD: `"${process.execPath}" -e "console.log('alive claude')"` },
  });
  assert.match(check.stdout, /^held pid=4242 /);
  assert.equal(check.status, 0);
});
