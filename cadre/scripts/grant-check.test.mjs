// Tests for grant-check.mjs at its command line: arguments and environment in, lines and an exit code out.
// The gh command is replaced through CADRE_GH_CMD by a small Node program that serves fixtures.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, 'grant-check.mjs');
const dir = mkdtempSync(join(tmpdir(), 'cadre-grant-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const SESSION = '11111111-2222-3333-4444-555555555555';
const OLD_SESSION = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const fakeGh = join(dir, 'fake-gh.mjs');
writeFileSync(fakeGh, `
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2).join(' ');
if (/api user/.test(args)) process.stdout.write(process.env.FAKE_USER + '\\n');
else process.stdout.write(readFileSync(process.env.FAKE_ISSUE, 'utf8'));
`);

let n = 0;
function body(rows, { ledger = true } = {}) {
  const table = ['| Granted by | Action | Repo or host | Scope | When |', '| --- | --- | --- | --- | --- |', ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
  return ['## Purpose', 'Ship it.', '', ...(ledger ? ['## Ledger', table, ''] : []), '## Holder', 'session: none', 'host: none', 'since: none', ''].join('\n');
}
const row = (by, action, scope, when) => [by, action, 'acme/widgets', scope, when];

function run(args, rows, { user = 'ada', ledger = true } = {}) {
  const file = join(dir, `issue${n++}.json`);
  writeFileSync(file, JSON.stringify({ state: 'open', labels: [{ name: 'cadre:orchestrator' }], assignees: [{ login: 'ada' }], body: body(rows, { ledger }) }));
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CADRE_GH_CMD: `"${process.execPath}" "${fakeGh}"`, FAKE_USER: user, FAKE_ISSUE: file },
  });
  return { lines: r.stdout.split('\n').filter(Boolean), err: r.stderr.trim(), code: r.status };
}
const ask = (rows, action = 'merge pull request', opts) => run(['4', SESSION, action], rows, opts);

test('wrong arguments give a usage line and exit 64', () => {
  for (const args of [[], ['4'], ['4', SESSION], ['four', SESSION, 'merge'], ['4', SESSION, ' '], ['4', SESSION, 'merge', 'extra']]) {
    const r = run(args, []);
    assert.equal(r.code, 64);
    assert.deepEqual(r.lines, []);
    assert.match(r.err, /^usage: /);
  }
});

test('an owner row with indefinite counts, and the Scope prints as a JSON string', () => {
  const r = ask([row('ada', 'merge pull request', 'only "docs/" PRs', '2026-10-18 indefinite')]);
  assert.deepEqual([r.lines, r.code], [['granted row=1 scope="only \\"docs/\\" PRs"'], 0]);
});

test('a row of this session counts', () => {
  const r = ask([row('ada', 'merge pull request', 'one PR', `2026-10-18 session ${SESSION}`)]);
  assert.deepEqual([r.lines, r.code], [['granted row=1 scope="one PR"'], 0]);
});

test('a row of another session has ended and does not count', () => {
  const r = ask([row('ada', 'merge pull request', 'one PR', `2026-10-18 session ${OLD_SESSION}`)]);
  assert.deepEqual([r.lines, r.code], [['none'], 1]);
});

test('a row granted by another login does not count', () => {
  const r = ask([row('grace', 'merge pull request', 'all', '2026-10-18 indefinite')]);
  assert.deepEqual([r.lines, r.code], [['none'], 1]);
});

test('a row of the wrong width does not count', () => {
  const r = ask([['ada', 'merge pull request', 'all', '2026-10-18 indefinite']]);
  assert.deepEqual([r.lines, r.code], [['none'], 1]);
});

test('a When that is neither indefinite nor this session does not count', () => {
  const r = ask([row('ada', 'merge pull request', 'all', '2026-10-18')]);
  assert.deepEqual([r.lines, r.code], [['none'], 1]);
});

test('a When that only holds the word indefinite in a longer text does not count', () => {
  const r = ask([row('ada', 'merge pull request', 'all', '2026-10-18 not indefinite, ask first')]);
  assert.deepEqual([r.lines, r.code], [['none'], 1]);
});

test('an escaped bar in a cell makes the row bad, so it fails closed', () => {
  const r = ask([row('ada', 'merge pull request', 'a \\| b', '2026-10-18 indefinite')]);
  assert.deepEqual([r.lines, r.code], [['none'], 1]);
});

test('an action with no row gives none and exit 1', () => {
  const r = ask([row('ada', 'open pull request', 'all', '2026-10-18 indefinite')]);
  assert.deepEqual([r.lines, r.code], [['none'], 1]);
});

test('the action matches as a whole cell, ignoring case and outer white space', () => {
  const rows = [row('ada', '  Merge Pull Request ', 'all', '2026-10-18 indefinite')];
  assert.equal(ask(rows, 'merge pull request').code, 0);
  assert.equal(ask(rows, ' MERGE PULL REQUEST  ').code, 0);
});

test('a substring does not match, in either direction', () => {
  assert.equal(ask([row('ada', 'merge pull request into main', 'all', '2026-10-18 indefinite')]).code, 1);
  assert.equal(ask([row('ada', 'merge', 'all', '2026-10-18 indefinite')]).code, 1);
});

test('two matching rows print two lines in row order, and a bad row between them keeps its number', () => {
  const r = ask([
    row('ada', 'merge pull request', 'first', '2026-10-18 indefinite'),
    row('grace', 'merge pull request', 'bad', '2026-10-18 indefinite'),
    row('ada', 'merge pull request', 'third', `2026-10-18 session ${SESSION}`),
  ]);
  assert.deepEqual([r.lines, r.code], [['granted row=1 scope="first"', 'granted row=3 scope="third"'], 0]);
});

test('no Ledger section is unknown, exit 2', () => {
  const r = ask([], undefined, { ledger: false });
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: .*Ledger/);
});

test('a Ledger with the wrong header is unknown', () => {
  const file = join(dir, 'h.json');
  writeFileSync(file, JSON.stringify({ state: 'open', labels: [{ name: 'cadre:orchestrator' }], assignees: [{ login: 'ada' }], body: '## Ledger\n| a | b |\n| - | - |\n' }));
  const r = spawnSync(process.execPath, [script, '4', SESSION, 'merge'], { encoding: 'utf8', env: { ...process.env, CADRE_GH_CMD: `"${process.execPath}" "${fakeGh}"`, FAKE_USER: 'ada', FAKE_ISSUE: file } });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /^unknown: /);
});

test('a user who is not the assignee gets not-owner, exit 1, and no granted line', () => {
  const r = ask([row('ada', 'merge pull request', 'all', '2026-10-18 indefinite')], undefined, { user: 'grace' });
  assert.deepEqual([r.lines, r.code], [['not-owner login=grace assignee=ada'], 1]);
});
