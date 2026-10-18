// Tests for grant-check-ado.mjs at its command line. The ADO client is replaced through CADRE_ADO_CMD.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, makeFake } from './ado-fake.mjs';

const script = join(import.meta.dirname, 'grant-check-ado.mjs');
const dir = mkdtempSync(join(tmpdir(), 'cadre-grant-ado-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const ado = makeFake(join(dir, 'ado'));

const SESSION = '11111111-2222-3333-4444-555555555555';
const OLD_SESSION = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const P = `${BASE}/Example%20Project`;
const ME = `GET ${BASE}/_apis/connectionData?api-version=7.1-preview.1`;
const ITEM = `GET ${P}/_apis/wit/workitems/7?api-version=7.1`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HEADER = ['Granted by', 'Action', 'Repo or host', 'Scope', 'When'];
const description = (rows) =>
  `<h2>Ledger</h2><table><tr>${HEADER.map((c) => `<th>${c}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
const row = (by, action, scope, when) => [by, action, 'acme/widgets', scope, when];
const user = (name) => ({ authenticatedUser: { properties: { Account: { $value: name } } } });
const item = (rows, desc = description(rows)) => ({
  id: 7,
  fields: {
    'System.TeamProject': 'Example Project',
    'System.Tags': 'cadre:orchestrator',
    'System.AssignedTo': { uniqueName: 'ada' },
    'System.Description': desc,
  },
});
const charter = '---\ncharter_schema: 1\nwritten_by: cadre 0.1.0\ntracker: ado\nado_org: example-org\nado_project: Example Project\n---\n\n# Charter\n';

function run(args, rows, { me = 'ada', withCharter = true, desc } = {}) {
  const work = mkdtempSync(join(dir, 'work-'));
  if (withCharter) {
    mkdirSync(join(work, 'docs', 'agents'), { recursive: true });
    writeFileSync(join(work, 'docs', 'agents', 'cadre-charter.md'), charter);
  }
  const env = ado.env({ [ME]: { status: 200, body: user(me) }, [ITEM]: { status: 200, body: item(rows, desc) } });
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: work, env: { ...process.env, ...env } });
  return { lines: r.stdout.split('\n').filter(Boolean), err: r.stderr.trim(), code: r.status };
}
const ask = (rows, opts) => run(['7', SESSION, 'merge pull request'], rows, opts);

test('wrong arguments give a usage line and exit 64', () => {
  for (const args of [[], ['7'], ['7', SESSION], ['x', SESSION, 'merge'], ['7', SESSION, 'merge', 'extra']]) {
    const r = run(args, []);
    assert.equal(r.code, 64);
    assert.match(r.err, /^usage: /);
  }
});

test('an owner row counts, a row of this session counts, and two rows print in row order', () => {
  const r = ask([
    row('ada', 'Merge Pull Request', 'first', '2026-10-18 indefinite'),
    row('grace', 'merge pull request', 'bad', '2026-10-18 indefinite'),
    row('ada', 'merge pull request', 'third', `2026-10-18 session ${SESSION}`),
  ]);
  assert.deepEqual([r.lines, r.code], [['granted row=1 scope="first"', 'granted row=3 scope="third"'], 0]);
});

test('a bad row, an ended row, an action with no row, and a substring give none', () => {
  assert.deepEqual(ask([row('grace', 'merge pull request', 'x', '2026-10-18 indefinite')]).lines, ['none']);
  assert.equal(ask([row('grace', 'merge pull request', 'x', '2026-10-18 indefinite')]).code, 1);
  assert.equal(ask([row('ada', 'merge pull request', 'x', `2026-10-18 session ${OLD_SESSION}`)]).code, 1);
  assert.equal(ask([row('ada', 'open pull request', 'x', '2026-10-18 indefinite')]).code, 1);
  assert.equal(ask([row('ada', 'merge pull request now', 'x', '2026-10-18 indefinite')]).code, 1);
});

test('another user gets not-owner, and a missing charter is unknown', () => {
  const rows = [row('ada', 'merge pull request', 'x', '2026-10-18 indefinite')];
  assert.deepEqual([ask(rows, { me: 'grace' }).lines, ask(rows, { me: 'grace' }).code], [['not-owner login=grace assignee=ada'], 1]);
  const r = ask(rows, { withCharter: false });
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: /);
});

test('a description with no Ledger section is unknown', () => {
  const r = ask([], { desc: '<h2>Purpose</h2><p>Ship it.</p>' });
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: .*Ledger/);
});
