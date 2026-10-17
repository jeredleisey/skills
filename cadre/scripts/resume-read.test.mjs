// Tests for resume-read.mjs at its command line: arguments and environment in,
// one line and an exit code out. The gh command is replaced through CADRE_GH_CMD
// by a small Node program that serves fixtures. The host id comes from a file in
// a temporary CADRE_HOME.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, 'resume-read.mjs');
const dir = mkdtempSync(join(tmpdir(), 'cadre-resume-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const HOST = 'a'.repeat(32);
const OTHER_HOST = 'b'.repeat(32);
const SESSION = '11111111-2222-3333-4444-555555555555';
const OLD_SESSION = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// A stand-in for gh. FAKE_FAIL names the call that fails: user, issue, or comments.
const fakeGh = join(dir, 'fake-gh.mjs');
writeFileSync(fakeGh, `
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2).join(' ');
const kind = /api user/.test(args) ? 'user' : /\\/comments/.test(args) ? 'comments' : 'issue';
if (process.env.FAKE_FAIL === kind) { console.error('gh: fail'); process.exit(1); }
if (kind === 'user') process.stdout.write(process.env.FAKE_USER + '\\n');
else process.stdout.write(readFileSync(process.env['FAKE_' + kind.toUpperCase()], 'utf8'));
`);

let n = 0;
function write(value) {
  const file = join(dir, `fixture${n++}.json`);
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}

function body({ session = 'none', host = 'none', since = 'none', rows = [], holder = true, ledger = true } = {}) {
  const table = [
    '| Granted by | Action | Repo or host | Scope | When |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
  return [
    '## Purpose', 'Ship the acme report.', '',
    '## Repos', 'acme/widgets', '',
    ...(ledger ? ['## Ledger', table, ''] : []),
    ...(holder ? ['## Holder', `session: ${session}`, `host: ${host}`, `since: ${since}`, ''] : []),
  ].join('\n');
}

const issue = (over = {}) => ({
  state: 'open',
  assignees: [{ login: 'ada' }],
  body: body(),
  ...over,
});
const comment = (id, time, extra = '', login = 'ada') => ({
  id,
  user: { login },
  body: `cadre-checkpoint v1 ${time}\n\n## Decisions\n- none\n${extra}`,
});

function run(args, { user = 'ada', iss = issue(), comments = [], host = HOST, fail = '', env = {} } = {}) {
  const home = mkdtempSync(join(dir, 'home-'));
  if (host) writeFileSync(join(home, 'host-id'), `${host}\n`);
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CADRE_HOME: home,
      CADRE_GH_CMD: `"${process.execPath}" "${fakeGh}"`,
      FAKE_USER: user,
      FAKE_ISSUE: write(iss),
      FAKE_COMMENTS: write(comments),
      FAKE_FAIL: fail,
      ...env,
    },
  });
  return { line: r.stdout.trim(), err: r.stderr.trim(), code: r.status, lines: r.stdout.split('\n').filter(Boolean).length };
}
const fields = (line) => Object.fromEntries(line.split(' ').slice(1).map((p) => p.split('=')));

test('no argument gives a usage line and exit 64', () => {
  const r = run([]);
  assert.equal(r.code, 64);
  assert.match(r.err, /^usage: /);
});

test('an issue number that is not a number gives exit 64', () => {
  assert.equal(run(['four']).code, 64);
});

test('a user who is not the assignee is refused', () => {
  const r = run(['4'], { user: 'grace' });
  assert.deepEqual([r.line, r.code], ['not-owner login=grace assignee=ada', 1]);
});

test('the owner check ignores case', () => {
  assert.equal(run(['4'], { user: 'ADA' }).code, 0);
});

test('an issue with no assignee gives unknown', () => {
  const r = run(['4'], { iss: issue({ assignees: [] }) });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: .*assignee/);
});

test('an issue with two assignees gives unknown', () => {
  const r = run(['4'], { iss: issue({ assignees: [{ login: 'ada' }, { login: 'grace' }] }) });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: .*assignee/);
});

test('a failed gh call gives unknown, never ok', () => {
  for (const fail of ['user', 'issue', 'comments']) {
    const r = run(['4'], { fail });
    assert.equal(r.code, 2, fail);
    assert.match(r.line, /^unknown: /, fail);
  }
});

test('the owner of a free orchestrator gets ok with holder=free', () => {
  const r = run(['4']);
  assert.equal(r.code, 0);
  assert.equal(r.lines, 1);
  assert.deepEqual(fields(r.line), {
    holder: 'free', session: 'none', checkpoint: 'none', state: 'open', 'bad-rows': 'none', 'ended-rows': 'none',
  });
  assert.match(r.line, /^ok /);
});

test('a holder on this host is same-host and gives its session', () => {
  const r = run(['4'], { iss: issue({ body: body({ session: SESSION, host: HOST, since: '2026-10-17T08:00:00Z' }) }) });
  const f = fields(r.line);
  assert.equal(f.holder, 'same-host');
  assert.equal(f.session, SESSION);
});

test('a holder on another host is other-host', () => {
  const r = run(['4'], { iss: issue({ body: body({ session: SESSION, host: OTHER_HOST }) }) });
  assert.equal(fields(r.line).holder, 'other-host');
});

test('a session with no host line gives unknown', () => {
  const text = body().replace('host: none\n', '');
  const r = run(['4'], { iss: issue({ body: text }) });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: .*Holder/);
});

test('a body with no Holder section gives unknown', () => {
  const r = run(['4'], { iss: issue({ body: body({ holder: false }) }) });
  assert.equal(r.code, 2);
});

test('a held session and a missing host id file gives unknown', () => {
  const r = run(['4'], { host: '', env: { CADRE_RANDOM_CMD: 'exit 1' }, iss: issue({ body: body({ session: SESSION, host: HOST }) }) });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
});

test('a closed issue reports state=closed', () => {
  const r = run(['4'], { iss: issue({ state: 'closed' }) });
  assert.equal(fields(r.line).state, 'closed');
});

test('a row that the owner did not grant is a bad row', () => {
  const rows = [
    ['ada', 'merge', 'acme/widgets', 'pull requests', `2026-10-17 session ${SESSION}`],
    ['grace', 'push', 'acme/widgets', 'main', '2026-10-17 indefinite'],
    ['ADA', 'tag', 'acme/widgets', 'releases', '2026-10-17 indefinite'],
  ];
  const r = run(['4', SESSION], { iss: issue({ body: body({ rows }) }) });
  const f = fields(r.line);
  assert.equal(f['bad-rows'], '2');
  assert.equal(f['ended-rows'], 'none');
});

test('a session row of another session ended', () => {
  const rows = [
    ['ada', 'merge', 'acme/widgets', 'pull requests', `2026-10-16 session ${OLD_SESSION}`],
    ['ada', 'merge', 'acme/widgets', 'docs', `2026-10-17 session ${SESSION}`],
    ['ada', 'tag', 'acme/widgets', 'releases', '2026-10-17 indefinite'],
  ];
  const r = run(['4', SESSION], { iss: issue({ body: body({ rows }) }) });
  assert.equal(fields(r.line)['ended-rows'], '1');
});

test('with no session argument each session row ended', () => {
  const rows = [
    ['ada', 'merge', 'acme/widgets', 'docs', `2026-10-17 session ${SESSION}`],
    ['ada', 'tag', 'acme/widgets', 'releases', '2026-10-17 indefinite'],
    ['ada', 'push', 'acme/widgets', 'docs', `2026-10-17 session ${OLD_SESSION}`],
  ];
  const r = run(['4'], { iss: issue({ body: body({ rows }) }) });
  assert.equal(fields(r.line)['ended-rows'], '1,3');
});

test('a row that is both ungranted and ended is listed in each', () => {
  const rows = [['grace', 'push', 'acme/widgets', 'main', `2026-10-17 session ${OLD_SESSION}`]];
  const f = fields(run(['4', SESSION], { iss: issue({ body: body({ rows }) }) }).line);
  assert.equal(f['bad-rows'], '1');
  assert.equal(f['ended-rows'], '1');
});

test('a body with no Ledger section gives unknown', () => {
  const r = run(['4'], { iss: issue({ body: body({ ledger: false }) }) });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: .*Ledger/);
});

test('the newest checkpoint is the one with the latest marker time', () => {
  const comments = [
    comment(101, '2026-10-17T09:00:00Z'),
    comment(102, '2026-10-17T11:30:00Z'),
    comment(103, '2026-10-17T10:00:00Z'),
    { id: 104, user: { login: 'ada' }, body: 'looks good, thanks' },
  ];
  assert.equal(fields(run(['4'], { comments }).line).checkpoint, '102');
});

test('a comment with a bad marker is not a checkpoint', () => {
  const comments = [
    comment(101, '2026-10-17T09:00:00Z'),
    { id: 102, user: { login: 'ada' }, body: 'cadre-checkpoint v2 2026-10-17T12:00:00Z\n' },
    { id: 103, user: { login: 'ada' }, body: 'cadre-checkpoint v1 yesterday\n' },
    { id: 104, user: { login: 'ada' }, body: 'Note: cadre-checkpoint v1 2026-10-17T13:00:00Z\n' },
  ];
  assert.equal(fields(run(['4'], { comments }).line).checkpoint, '101');
});

test('comments in pages (an array of arrays) are read', () => {
  const comments = [[comment(101, '2026-10-17T09:00:00Z')], [comment(102, '2026-10-17T10:00:00Z')]];
  assert.equal(fields(run(['4'], { comments }).line).checkpoint, '102');
});

test('output that is not JSON gives unknown', () => {
  const r = run(['4'], { iss: 'not json' });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
});

test('a checkpoint that the owner did not write is ignored', () => {
  const comments = [
    comment(101, '2026-10-17T09:00:00Z'),
    comment(102, '2026-10-17T12:00:00Z', '', 'grace'),
    { id: 103, body: 'cadre-checkpoint v1 2026-10-17T13:00:00Z\n' },
  ];
  assert.equal(fields(run(['4'], { comments }).line).checkpoint, '101');
});
