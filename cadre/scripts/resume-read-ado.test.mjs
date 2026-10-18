// Tests for resume-read-ado.mjs at its command line: arguments and environment in, one line and an exit code out.
// The ADO client is replaced through CADRE_ADO_CMD by a fake that answers from a table. The org and the
// project come from the charter in the current folder. The host id comes from a file in a temporary CADRE_HOME.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, makeFake } from './ado-fake.mjs';

const script = join(import.meta.dirname, 'resume-read-ado.mjs');
const dir = mkdtempSync(join(tmpdir(), 'cadre-resume-ado-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const ado = makeFake(join(dir, 'ado'));

const HOST = 'a'.repeat(32);
const OTHER_HOST = 'b'.repeat(32);
const SESSION = '11111111-2222-3333-4444-555555555555';
const OLD_SESSION = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const P = `${BASE}/Example%20Project`;
const ME = `GET ${BASE}/_apis/connectionData?api-version=7.1-preview.1`;
const ITEM = `GET ${P}/_apis/wit/workitems/7?api-version=7.1`;
const TYPE = `GET ${P}/_apis/wit/workitemtypes/Issue?api-version=7.1`;
const COMMENTS = `GET ${P}/_apis/wit/workItems/7/comments?api-version=7.1-preview.4&%24top=200`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HEADER = ['Granted by', 'Action', 'Repo or host', 'Scope', 'When'];
const table = (rows, header = HEADER) =>
  `<table><tr>${header.map((c) => `<th>${c}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
function description({ session = 'none', host = 'none', since = 'none', rows = [], holder = true, ledger = true, header } = {}) {
  return [
    '<h2>Purpose</h2><p>Ship the acme report.</p>',
    '<h2>Repos</h2><p>acme/widgets</p>',
    ...(ledger ? ['<h2>Ledger</h2>', table(rows, header)] : []),
    ...(holder ? ['<h2>Holder</h2>', `<pre>session: ${session}\nhost: ${host}\nsince: ${since}</pre>`] : []),
  ].join('\n');
}

const user = (name) => ({ authenticatedUser: { id: 'x', providerDisplayName: 'Ada', properties: { Account: { $type: 'System.String', $value: name } } } });
const item = (over = {}, fields = {}) => ({
  id: 7,
  rev: 4,
  fields: {
    'System.TeamProject': 'Example Project',
    'System.WorkItemType': 'Issue',
    'System.State': 'Doing',
    'System.Tags': 'other; cadre:orchestrator',
    'System.AssignedTo': { displayName: 'Ada', uniqueName: 'ada' },
    'System.Description': description(),
    ...fields,
  },
  ...over,
});
const typeAnswer = { name: 'Issue', states: [{ name: 'New', category: 'Proposed' }, { name: 'Doing', category: 'InProgress' }, { name: 'Done', category: 'Completed' }, { name: 'Gone', category: 'Removed' }] };
const comment = (id, time, { by = 'ada', extra = '', html = true, deleted = false } = {}) => ({
  id,
  isDeleted: deleted,
  createdBy: { uniqueName: by },
  text: html
    ? `<p>cadre-checkpoint v1 ${time}</p><h2>Decisions</h2><ul><li>none</li></ul><h2>Waiting for the human</h2><ol><li>none</li></ol><h2>Next, in order</h2><ol><li>none</li></ol>${extra}`
    : `cadre-checkpoint v1 ${time}\n\n## Decisions\n- none\n\n## Waiting for the human\n1. none\n\n## Next, in order\n1. none\n${extra}`,
});
const page = (list, token) => ({ status: 200, body: { count: list.length, comments: list, ...(token ? { continuationToken: token } : {}) } });

function charterText(extra = 'tracker: ado\nado_org: example-org\nado_project: Example Project\n') {
  return `---\ncharter_schema: 1\nwritten_by: cadre 0.1.0\n${extra}---\n\n# Charter\n`;
}

// Run in a folder with a charter. `routes` replaces single entries of the default table.
function run(args, { me = user('ada'), it = item(), comments = [], routes = {}, charter = charterText(), host = HOST, extraEnv = {} } = {}) {
  const work = mkdtempSync(join(dir, 'work-'));
  if (charter !== null) {
    mkdirSync(join(work, 'docs', 'agents'), { recursive: true });
    writeFileSync(join(work, 'docs', 'agents', 'cadre-charter.md'), charter);
  }
  const home = mkdtempSync(join(dir, 'home-'));
  if (host) writeFileSync(join(home, 'host-id'), `${host}\n`);
  const table = {
    [ME]: { status: 200, body: me },
    [ITEM]: { status: 200, body: it },
    [TYPE]: { status: 200, body: typeAnswer },
    [COMMENTS]: page(comments),
    ...routes,
  };
  const env = { ...ado.env(table), CADRE_HOME: home, ...extraEnv };
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: work, env: { ...process.env, ...env } });
  return { line: r.stdout.trim(), err: r.stderr.trim(), code: r.status, lines: r.stdout.split('\n').filter(Boolean).length, env };
}
const fields = (line) => Object.fromEntries(line.split(' ').slice(1).map((p) => p.split('=')));
const withDescription = (d) => item({}, { 'System.Description': d });
const held = (edit = (d) => d) => withDescription(edit(description({ session: SESSION, host: HOST, since: '2026-10-17T08:00:00Z' })));

test('no argument, or an id that is not a number, gives a usage line and exit 64', () => {
  for (const args of [[], ['four'], ['7', 's', 'extra']]) {
    const r = run(args);
    assert.equal(r.code, 64);
    assert.equal(r.line, '');
    assert.match(r.err, /^usage: /);
  }
});

test('the owner of a free orchestrator gets ok with the same fields as the GitHub read', () => {
  const r = run(['7']);
  assert.deepEqual([r.code, r.lines], [0, 1]);
  assert.match(r.line, /^ok /);
  assert.deepEqual(fields(r.line), { holder: 'free', session: 'none', checkpoint: 'none', ignored: 'none', state: 'open', 'bad-rows': '[]', 'ended-rows': '[]' });
});

test('the reads are GET calls of the user, the item, the states of its type, and the comments', () => {
  const r = run(['7']);
  assert.deepEqual(ado.requests(r.env).map((q) => `${q.method} ${q.url}`), [ME, ITEM, TYPE, COMMENTS].map((k) => k));
});

// ---- charter ----

test('a missing charter, another tracker, and a missing org or project give unknown, with no call', () => {
  for (const charter of [null, charterText(''), charterText('tracker: github\n'), charterText('tracker: ado\nado_org: example-org\n'), charterText('tracker: ado\nado_project: Example Project\n'), '---\nbroken line\n---\n']) {
    const r = run(['7'], { charter });
    assert.match(r.line, /^unknown: /, String(charter));
    assert.equal(r.code, 2);
    assert.deepEqual(ado.requests(r.env), []);
  }
});

// ---- owner ----

test('a user who is not the assignee is refused, before the body is read', () => {
  const r = run(['7'], { me: user('grace'), it: item({}, { 'System.Description': 'no sections at all' }) });
  assert.deepEqual([r.line, r.code], ['not-owner login=grace assignee=ada', 1]);
});

test('the owner check ignores case', () => {
  assert.equal(run(['7'], { me: user('ADA') }).code, 0);
});

test('an item with no assignee, or one with no unique name, gives unknown', () => {
  for (const assigned of [undefined, '', {}, { displayName: 'Ada' }, ['ada']]) {
    const r = run(['7'], { it: item({}, { 'System.AssignedTo': assigned }) });
    assert.equal(r.code, 2, JSON.stringify(assigned));
    assert.match(r.line, /^unknown: .*assignee/);
  }
});

test('the user answer must hold an account name', () => {
  for (const me of [{}, { authenticatedUser: {} }, user('')]) {
    const r = run(['7'], { me });
    assert.equal(r.code, 2);
    assert.match(r.line, /^unknown: /);
  }
});

test('an item without the tag cadre:orchestrator, or in another project, gives unknown', () => {
  for (const [field, value, pattern] of [['System.Tags', 'other', /tag/], ['System.Tags', 'cadre:orchestrators', /tag/], ['System.TeamProject', 'Other Project', /project/]]) {
    const r = run(['7'], { it: item({}, { [field]: value }) });
    assert.equal(r.code, 2);
    assert.match(r.line, new RegExp(`^unknown: .*${pattern.source}`));
  }
});

// ---- state by category ----

test('the state comes from the category of the state, never from its name', () => {
  const closed = run(['7'], { it: item({}, { 'System.State': 'Done' }) });
  assert.equal(fields(closed.line).state, 'closed');
  assert.equal(fields(run(['7'], { it: item({}, { 'System.State': 'Gone' }) }).line).state, 'closed');
  assert.equal(fields(run(['7'], { it: item({}, { 'System.State': 'New' }) }).line).state, 'open');
  const renamed = { name: 'Issue', states: [{ name: 'Doing', category: 'Completed' }] };
  assert.equal(fields(run(['7'], { routes: { [TYPE]: { status: 200, body: renamed } } }).line).state, 'closed');
});

test('a state that the type does not list, and a category that is new, give unknown', () => {
  const r = run(['7'], { it: item({}, { 'System.State': 'Mystery' }) });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: .*state/);
  const odd = { name: 'Issue', states: [{ name: 'Doing', category: 'Strange' }] };
  assert.equal(run(['7'], { routes: { [TYPE]: { status: 200, body: odd } } }).code, 2);
});

test('the type name goes into the URL encoded', () => {
  const url = `GET ${P}/_apis/wit/workitemtypes/Change%20Request?api-version=7.1`;
  const r = run(['7'], { it: item({}, { 'System.WorkItemType': 'Change Request' }), routes: { [url]: { status: 200, body: { states: [{ name: 'Doing', category: 'InProgress' }] } } } });
  assert.equal(r.code, 0, r.line);
});

// ---- holder ----

test('a holder on this host is same-host, on another host is other-host, and the same session is self', () => {
  const same = fields(run(['7'], { it: held() }).line);
  assert.deepEqual([same.holder, same.session], ['same-host', SESSION]);
  assert.equal(fields(run(['7'], { it: withDescription(description({ session: SESSION, host: OTHER_HOST })) }).line).holder, 'other-host');
  assert.equal(fields(run(['7', SESSION], { it: held() }).line).holder, 'self');
  assert.equal(fields(run(['7', OLD_SESSION], { it: held() }).line).holder, 'same-host');
});

test('a held session and no host id gives unknown', () => {
  const r = run(['7'], { it: held(), host: '', extraEnv: { CADRE_RANDOM_CMD: 'exit 1' } });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
});

test('a Holder that is missing, has a field twice, or holds garbage gives unknown', () => {
  const cases = [
    description({ holder: false }),
    held((d) => d.replace('since:', 'host: none\nsince:')).fields['System.Description'],
    held((d) => d.replace(`host: ${HOST}`, 'host: my-laptop')).fields['System.Description'],
    held((d) => d.replace('</pre>', '\nfree to take</pre>')).fields['System.Description'],
    held((d) => d.replace(`session: ${SESSION}`, 'session: lead')).fields['System.Description'],
    held((d) => d.replace(/<pre>[\s\S]*<\/pre>/, 'session: none')).fields['System.Description'],
    held((d) => d.replace('<pre>', '<div>').replace('</pre>', '</div>')).fields['System.Description'],
    held((d) => d.replace('</pre>', '</pre><pre>x</pre>')).fields['System.Description'],
  ];
  for (const d of cases) {
    const r = run(['7'], { it: withDescription(d) });
    assert.equal(r.code, 2, d);
    assert.match(r.line, /^unknown: .*Holder/, d);
  }
});

test('the Holder is read from escaped text, so a heading in the text is not a heading', () => {
  const d = held((x) => x.replace(`since: 2026-10-17T08:00:00Z`, 'since: 2026-10-17T08:00:00Z\n&lt;h2&gt;Holder&lt;/h2&gt;'));
  const r = run(['7'], { it: d });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: .*Holder/);
});

// ---- the description ----

test('a heading twice, a heading that is not <h2>Name</h2>, and a missing Ledger give unknown', () => {
  const cases = [
    [description() + '\n<h2>Holder</h2><pre>session: none\nhost: none\nsince: none</pre>', /twice/],
    [description().replace('<h2>Purpose</h2>', '<h2 class="x">Purpose</h2>'), /heading/],
    [description().replace('<h2>Purpose</h2>', '<h2><b>Purpose</b></h2>'), /heading/],
    [description({ ledger: false }), /Ledger/],
    ['', /Ledger|Holder/],
  ];
  for (const [d, pattern] of cases) {
    const r = run(['7'], { it: withDescription(d) });
    assert.equal(r.code, 2, d);
    assert.match(r.line, new RegExp(`^unknown: .*${pattern.source}`), d);
  }
});

test('a description that is not text gives unknown', () => {
  for (const value of [undefined, null, 5, {}]) assert.equal(run(['7'], { it: withDescription(value) }).code, 2);
});

test('a Ledger with another header, a bare list, or markup in a cell gives unknown', () => {
  const cases = [
    description({ header: ['Granted by', 'Action', 'Where', 'Scope', 'When'] }),
    description({ ledger: false }) + '<h2>Ledger</h2><p>none</p>',
    description().replace('</table>', '<tr><td>ada</td><td><b>x</b></td><td>a</td><td>b</td><td>c</td></tr></table>'),
    description().replace('</table>', '<tr><th>ada</th><td>x</td><td>a</td><td>b</td><td>c</td></tr></table>'),
    description().replace('</table>', '</table><table></table>'),
  ];
  for (const d of cases) {
    const r = run(['7'], { it: withDescription(d) });
    assert.equal(r.code, 2, d);
    assert.match(r.line, /^unknown: .*(Ledger|header)/, d);
  }
});

test('a row that the owner did not grant is a bad row, and a row of the wrong width too', () => {
  const rows = [
    ['ada', 'merge', 'acme/widgets', 'pull requests', `2026-10-17 session ${SESSION}`],
    ['grace', 'push', 'acme/widgets', 'main', '2026-10-17 indefinite'],
    ['ADA', 'tag', 'acme/widgets', 'releases', '2026-10-17 indefinite'],
    ['ada', 'tag', 'acme/widgets', 'releases'],
  ];
  const f = fields(run(['7', SESSION], { it: withDescription(description({ rows })) }).line);
  assert.equal(f['bad-rows'], '[2,4]');
  assert.equal(f['ended-rows'], '[]');
});

test('a session row of another session ended, and with no session each session row ended', () => {
  const rows = [
    ['ada', 'merge', 'acme/widgets', 'pull requests', `2026-10-16 session ${OLD_SESSION}`],
    ['ada', 'merge', 'acme/widgets', 'docs', `2026-10-17 session ${SESSION}`],
    ['ada', 'tag', 'acme/widgets', 'releases', '2026-10-17 indefinite'],
  ];
  const it = withDescription(description({ rows }));
  assert.equal(fields(run(['7', SESSION], { it }).line)['ended-rows'], '[1]');
  assert.equal(fields(run(['7'], { it }).line)['ended-rows'], '[1,2]');
});

test('escaped text in a cell is read as text, and an empty row is skipped', () => {
  const rows = [
    ['ada', 'merge', 'acme/a&b', '<main>', '2026-10-17 indefinite'],
    ['', '', '', '', ''],
  ];
  const f = fields(run(['7'], { it: withDescription(description({ rows })) }).line);
  assert.deepEqual([f['bad-rows'], f['ended-rows']], ['[]', '[]']);
});

// ---- checkpoints ----

test('the newest checkpoint is the one with the latest marker time, in HTML or in Markdown', () => {
  const comments = [
    comment(101, '2026-10-17T09:00:00Z'),
    comment(102, '2026-10-17T11:30:00Z', { html: false }),
    comment(103, '2026-10-17T10:00:00Z'),
    { id: 104, createdBy: { uniqueName: 'ada' }, text: '<p>looks good, thanks</p>' },
  ];
  assert.equal(fields(run(['7'], { comments }).line).checkpoint, '102');
});

test('a comment with a bad marker, from another author, deleted, or with a missing section is not a checkpoint', () => {
  const partial = { id: 109, createdBy: { uniqueName: 'ada' }, text: '<p>cadre-checkpoint v1 2026-10-17T14:00:00Z</p><h2>Decisions</h2><h2>Next, in order</h2>' };
  const comments = [
    comment(101, '2026-10-17T09:00:00Z'),
    { ...comment(102, '2026-10-17T12:00:00Z'), text: 'cadre-checkpoint v2 2026-10-17T12:00:00Z\n## Decisions\n## Waiting for the human\n## Next, in order' },
    { ...comment(103, '2026-10-17T12:00:00Z'), text: '<p>Note: cadre-checkpoint v1 2026-10-17T13:00:00Z</p><h2>Decisions</h2><h2>Waiting for the human</h2><h2>Next, in order</h2>' },
    comment(104, '2026-10-17T15:00:00Z', { by: 'grace' }),
    comment(105, '2026-10-17T16:00:00Z', { deleted: true }),
    { id: 106, text: comment(0, '2026-10-17T17:00:00Z').text },
    partial,
  ];
  assert.equal(fields(run(['7'], { comments }).line).checkpoint, '101');
});

test('the author is compared by unique name, ignoring case', () => {
  assert.equal(fields(run(['7'], { comments: [comment(101, '2026-10-17T09:00:00Z', { by: 'Ada' })] }).line).checkpoint, '101');
});

test('a marker time more than 5 minutes ahead is ignored and reported, and a time of now is accepted', () => {
  const now = new Date().toISOString().slice(0, 19) + 'Z';
  const f = fields(run(['7'], { comments: [comment(101, '2026-10-17T09:00:00Z'), comment(102, '2099-01-01T00:00:00Z'), comment(103, now)] }).line);
  assert.deepEqual([f.checkpoint, f.ignored], ['103', '102']);
});

test('comments in pages are all read, through the continuation token of each page', () => {
  const second = `${COMMENTS}&continuationToken=tok%2F2`;
  const third = `${COMMENTS}&continuationToken=tok3`;
  const routes = {
    [COMMENTS]: page([comment(101, '2026-10-17T09:00:00Z')], 'tok/2'),
    [second]: page([comment(102, '2026-10-17T10:00:00Z')], 'tok3'),
    [third]: page([comment(103, '2026-10-17T08:00:00Z')]),
  };
  const r = run(['7'], { routes });
  assert.equal(fields(r.line).checkpoint, '102');
  assert.equal(ado.requests(r.env).length, 6);
});

test('a page that repeats its token, or too many pages, gives unknown', () => {
  const loop = run(['7'], { routes: { [COMMENTS]: page([], 'same'), [`${COMMENTS}&continuationToken=same`]: page([], 'same') } });
  assert.equal(loop.code, 2);
  assert.match(loop.line, /^unknown: .*page/);
});

test('a comments answer with no list gives unknown', () => {
  for (const body of [{ count: 0 }, { comments: 'x' }, []]) assert.equal(run(['7'], { routes: { [COMMENTS]: { status: 200, body } } }).code, 2);
});

// ---- a failed read is never ok ----

const BAD = [
  { status: 302, body: '<html>Sign in</html>' },
  { status: 401, body: '' },
  { status: 203, body: '<html>Sign in</html>' },
  { status: 200, body: '' },
  { status: 200, body: '<html>not json</html>' },
  { status: 500, body: '{}' },
  { status: 404, body: '{}' },
  { crash: true },
];

test('each read that fails in any way gives unknown, one line, exit 2', () => {
  for (const key of [ME, ITEM, TYPE, COMMENTS]) {
    for (const answer of BAD) {
      const r = run(['7'], { routes: { [key]: answer } });
      assert.match(r.line, /^unknown: /, `${key} ${JSON.stringify(answer)}`);
      assert.deepEqual([r.code, r.lines], [2, 1]);
    }
  }
});

test('a dead sign-in names AZURE_DEVOPS_EXT_PAT', () => {
  for (const answer of [BAD[0], BAD[1], BAD[2], BAD[3]]) assert.match(run(['7'], { routes: { [ME]: answer } }).line, /AZURE_DEVOPS_EXT_PAT/);
});

test('a failure on the second page of comments gives unknown', () => {
  const routes = { [COMMENTS]: page([comment(101, '2026-10-17T09:00:00Z')], 'tok'), [`${COMMENTS}&continuationToken=tok`]: { status: 401, body: '' } };
  const r = run(['7'], { routes });
  assert.equal(r.code, 2);
});
