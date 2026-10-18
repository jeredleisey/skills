// Tests for grant-check-local.mjs at its command line. Each test makes a temporary git repo with no remote.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const list = join(import.meta.dirname, 'local-list.mjs');
const script = join(import.meta.dirname, 'grant-check-local.mjs');
const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'cadre-grant-local-')));
after(() => rmSync(dir, { recursive: true, force: true }));

const SESSION = '11111111-2222-3333-4444-555555555555';
const OLD_SESSION = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
let n = 0;
const env = (over = {}) => ({ ...process.env, CADRE_HOME: join(dir, 'home'), CADRE_LOCAL_USER: 'ada', ...over });
const exec = (cmd, cwd, args, over) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: env(over) });
  return { lines: r.stdout.split('\n').filter(Boolean), err: r.stderr.trim(), code: r.status };
};
function makeRepo(rows) {
  const repo = join(dir, `repo${n++}`);
  mkdirSync(repo);
  mkdirSync(join(dir, 'home'), { recursive: true });
  writeFileSync(join(dir, 'home', 'host-id'), `${'a'.repeat(32)}\n`);
  for (const args of [['init', '-q'], ['-c', 'user.name=T', '-c', 'user.email=t' + String.fromCharCode(64) + 'example.com', 'commit', '-q', '--allow-empty', '-m', 'first']]) {
    assert.equal(spawnSync('git', args, { cwd: repo }).status, 0);
  }
  assert.equal(exec(process.execPath, repo, [list, 'new', 'Rigel', 'Ship it.']).code, 0);
  const file = join(dir, `ledger${n}.md`);
  writeFileSync(file, ['| Granted by | Action | Repo or host | Scope | When |', '| --- | --- | --- | --- | --- |', ...rows.map((r) => `| ${r.join(' | ')} |`), ''].join('\n'));
  assert.equal(exec(process.execPath, repo, [list, 'put', 'Rigel', 'Ledger', file]).code, 0);
  return repo;
}
const row = (by, action, scope, when) => [by, action, 'acme/widgets', scope, when];
const ask = (rows, over, args = ['rigel', SESSION, 'merge pull request']) => exec(process.execPath, makeRepo(rows), [script, ...args], over);

test('wrong arguments give a usage line and exit 64', () => {
  for (const args of [[], ['rigel'], ['rigel', SESSION], ['---', SESSION, 'merge'], ['rigel', SESSION, 'merge', 'extra']]) {
    const r = ask([], undefined, args);
    assert.equal(r.code, 64);
    assert.match(r.err, /^usage: /);
  }
});

test('an indefinite owner row and a row of this session count, in row order, and another login does not', () => {
  const r = ask([
    row('ada', 'merge pull request', 'one', '2026-10-18 indefinite'),
    row('grace', 'merge pull request', 'bad', '2026-10-18 indefinite'),
    row('ada', 'Merge Pull Request', 'three', `2026-10-18 session ${SESSION}`),
  ]);
  assert.deepEqual([r.lines, r.code], [['granted row=1 scope="one"', 'granted row=3 scope="three"'], 0]);
});

test('an ended row, an action with no row, and a substring give none', () => {
  assert.deepEqual(ask([row('ada', 'merge pull request', 'x', `2026-10-18 session ${OLD_SESSION}`)]).lines, ['none']);
  assert.equal(ask([row('ada', 'merge pull request', 'x', `2026-10-18 session ${OLD_SESSION}`)]).code, 1);
  assert.equal(ask([row('ada', 'open pull request', 'x', '2026-10-18 indefinite')]).code, 1);
  assert.equal(ask([row('ada', 'merge', 'x', '2026-10-18 indefinite')]).code, 1);
});

test('another user gets not-owner, and a missing file is unknown', () => {
  const rows = [row('ada', 'merge pull request', 'x', '2026-10-18 indefinite')];
  const r = ask(rows, { CADRE_LOCAL_USER: 'grace' });
  assert.deepEqual([r.lines, r.code], [['not-owner login=grace assignee=ada'], 1]);
  const m = ask(rows, undefined, ['nobody', SESSION, 'merge pull request']);
  assert.equal(m.code, 2);
  assert.match(m.lines[0], /^unknown: .*nobody/);
});
