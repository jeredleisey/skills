// Tests for ado-list.mjs at its command line: arguments and environment in, lines and an exit code out.
// The ADO client is replaced through CADRE_ADO_CMD by a fake that answers from a table.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, makeFake } from './ado-fake.mjs';

const script = join(import.meta.dirname, 'ado-list.mjs');
const dir = mkdtempSync(join(tmpdir(), 'cadre-ado-list-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const ado = makeFake(dir);

const P = `${BASE}/Example%20Project`;
const WIQL = `POST ${P}/_apis/wit/wiql?api-version=7.1`;
const BATCH = `POST ${P}/_apis/wit/workitemsbatch?api-version=7.1`;
const TYPES = `GET ${P}/_apis/wit/workitemtypes?api-version=7.1`;

const ids = (n, from = 1) => ({ status: 200, body: { workItems: Array.from({ length: n }, (_, i) => ({ id: from + i })) } });
const row = (id, over = {}, tags = 'cadre:orchestrator') => ({
  id,
  fields: { 'System.Id': id, 'System.Title': `Orchestrator: N${id}`, 'System.State': 'Doing', 'System.WorkItemType': 'Issue', 'System.Tags': tags, 'System.AssignedTo': { uniqueName: 'ada' }, ...over },
});
const batch = (...rows) => ({ status: 200, body: { count: rows.length, value: rows } });
const types = { status: 200, body: { value: [{ name: 'Issue', states: [{ name: 'New', category: 'Proposed' }, { name: 'Doing', category: 'InProgress' }, { name: 'Fixed', category: 'Resolved' }, { name: 'Done', category: 'Completed' }, { name: 'Gone', category: 'Removed' }] }] } };

function run(args, routes) {
  const env = ado.env(routes);
  const r = spawnSync(process.execPath, [script, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
  return { lines: r.stdout.split('\n').filter(Boolean), code: r.status, err: r.stderr, env };
}
const orch = (routes) => run(['orchestrators', 'example-org', 'Example Project'], routes);
const work = (routes, name = 'acme') => run(['work', 'example-org', 'Example Project', name], routes);

test('orchestrators: items of every state are listed, one line each, with the title last', () => {
  const r = orch({ [WIQL]: ids(2), [BATCH]: batch(row(1), row(2, { 'System.State': 'Done', 'System.AssignedTo': undefined })) });
  assert.deepEqual(r.lines, ['item id=1 state=Doing type=Issue owner=ada title=Orchestrator: N1', 'item id=2 state=Done type=Issue owner=none title=Orchestrator: N2']);
  assert.equal(r.code, 0);
});

test('orchestrators: the query asks for the tag in the project, with no filter on the state', () => {
  const r = orch({ [WIQL]: ids(1), [BATCH]: batch(row(1)) });
  const q = JSON.parse(ado.requests(r.env)[0].body).query;
  assert.match(q, /\[System\.TeamProject\] = @project/);
  assert.match(q, /\[System\.Tags\] CONTAINS 'cadre:orchestrator'/);
  assert.doesNotMatch(q, /System\.State/);
});

test('an empty result prints none', () => {
  const r = orch({ [WIQL]: ids(0) });
  assert.deepEqual([r.lines, r.code], [['none'], 0]);
});

test('ids are read in groups of 200, and every item comes back', () => {
  const rows = (from, n) => batch(...Array.from({ length: n }, (_, i) => row(from + i)));
  const r = orch({ [WIQL]: ids(450), [BATCH]: [rows(1, 200), rows(201, 200), rows(401, 50)] });
  assert.equal(r.lines.length, 450);
  assert.deepEqual(ado.requests(r.env).filter((q) => q.url.includes('workitemsbatch')).map((q) => JSON.parse(q.body).ids.length), [200, 200, 50]);
});

test('the cap of 20000 ids, or more, gives unknown and tells the human to narrow the query', () => {
  for (const n of [20000, 20001]) {
    const r = orch({ [WIQL]: ids(n) });
    assert.deepEqual(r.lines, ['unknown: too many results; narrow the query']);
    assert.equal(r.code, 2);
  }
});

test('a batch that returns fewer items than it was asked for gives unknown', () => {
  const r = orch({ [WIQL]: ids(2), [BATCH]: batch(row(1)) });
  assert.match(r.lines[0], /^unknown: /);
  assert.equal(r.code, 2);
});

test('an item without the exact tag is dropped, and a tag that only starts like it is not a match', () => {
  const r = orch({ [WIQL]: ids(3), [BATCH]: batch(row(1), row(2, {}, 'cadre:orchestrators'), row(3, {}, 'x; cadre:orchestrator')) });
  assert.deepEqual(r.lines.map((l) => l.split(' ')[1]), ['id=1', 'id=3']);
});

test('work: only items in the category Proposed or InProgress are live, by category and never by name', () => {
  const states = ['New', 'Doing', 'Fixed', 'Done', 'Gone'];
  const rows = states.map((s, i) => row(i + 1, { 'System.State': s }, 'cadre:work:acme'));
  const r = work({ [WIQL]: ids(5), [BATCH]: batch(...rows), [TYPES]: types });
  assert.deepEqual(r.lines.map((l) => l.split(' ')[1]), ['id=1', 'id=2']);
  const renamed = { status: 200, body: { value: [{ name: 'Issue', states: [{ name: 'Done', category: 'InProgress' }] }] } };
  const r2 = work({ [WIQL]: ids(1), [BATCH]: batch(row(1, { 'System.State': 'Done' }, 'cadre:work:acme')), [TYPES]: renamed });
  assert.equal(r2.lines.length, 1);
  assert.match(JSON.parse(ado.requests(r.env)[0].body).query, /CONTAINS 'cadre:work:acme'/);
});

test('work: a state that its type does not list, or an item of no listed type, gives unknown', () => {
  assert.match(work({ [WIQL]: ids(1), [BATCH]: batch(row(1, { 'System.State': 'Odd' }, 'cadre:work:acme')), [TYPES]: types }).lines[0], /^unknown: /);
  assert.match(work({ [WIQL]: ids(1), [BATCH]: batch(row(1, { 'System.WorkItemType': 'Bug' }, 'cadre:work:acme')), [TYPES]: types }).lines[0], /^unknown: /);
});

test('work: no ids means none, with no read of the types', () => {
  const r = work({ [WIQL]: ids(0) });
  assert.deepEqual(r.lines, ['none']);
  assert.equal(ado.requests(r.env).length, 1);
});

const BAD = [
  { status: 302, body: '<html>Sign in</html>' },
  { status: 401, body: '' },
  { status: 203, body: '<html/>' },
  { status: 200, body: '' },
  { status: 200, body: '<html>Sign in</html>' },
  { status: 200, body: 'null' },
  { status: 500, body: '{}' },
  { status: 400, body: '{}' },
  { crash: true },
];

test('each read that fails in any way gives one unknown line, never none, never a list', () => {
  const good = { [WIQL]: ids(1), [BATCH]: batch(row(1, {}, 'cadre:work:acme')), [TYPES]: types };
  for (const key of [WIQL, BATCH, TYPES]) {
    for (const answer of BAD) {
      const r = work({ ...good, [key]: answer });
      assert.equal(r.lines.length, 1, `${key} ${JSON.stringify(answer)}`);
      assert.match(r.lines[0], /^unknown: /);
      assert.equal(r.code, 2);
    }
  }
  assert.match(work({ ...good, [WIQL]: BAD[0] }).lines[0], /AZURE_DEVOPS_EXT_PAT/);
  assert.match(orch({ [WIQL]: BAD[3] }).lines[0], /AZURE_DEVOPS_EXT_PAT/);
});

test('a name that could break the query is refused before any call', () => {
  for (const name of ["a'b", 'a;b', 'a,b', 'a\nb']) {
    const r = work({}, name);
    assert.deepEqual([r.lines.length, r.code], [1, 2], JSON.stringify(name));
    assert.deepEqual(ado.requests(r.env), []);
  }
});

test('usage: a wrong subcommand or argument count gives exit 64', () => {
  for (const args of [[], ['orchestrators'], ['work', 'example-org', 'p'], ['nope', 'a', 'b'], ['orchestrators', 'a', 'b', 'c']]) assert.equal(run(args, {}).code, 64, args.join(' '));
});

test('a large list reaches a reader that is slow, with no line cut off', async () => {
  const { spawn } = await import('node:child_process');
  const long = 'x'.repeat(1000);
  const rows = batch(...Array.from({ length: 200 }, (_, i) => row(i + 1, { 'System.Title': `${long} ${i + 1}` })));
  const env = { ...process.env, ...ado.env({ [WIQL]: ids(200), [BATCH]: rows }) };
  const child = spawn(process.execPath, [script, 'orchestrators', 'example-org', 'Example Project'], { env });
  let out = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (c) => (out += c));
  // Stop reading at the first data, and read on 400 ms later, so a slow runner cannot hide a lost tail.
  child.stdout.once('data', () => {
    child.stdout.pause();
    setTimeout(() => child.stdout.resume(), 400);
  });
  await new Promise((ok) => child.on('close', ok));
  const lines = out.split('\n').filter(Boolean);
  assert.equal(lines.length, 200);
  assert.ok(lines.every((l) => l.startsWith('item id=') && l.endsWith(` ${l.split(' ')[1].slice(3)}`) ), 'each line is whole');
});
