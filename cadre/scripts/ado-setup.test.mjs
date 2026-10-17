// Tests for ado-setup.mjs at its command line: arguments and environment in, one line and an exit code out.
// The ADO client is replaced through CADRE_ADO_CMD by a fake that answers from a table.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, makeFake } from './ado-fake.mjs';

const script = join(import.meta.dirname, 'ado-setup.mjs');
const dir = mkdtempSync(join(tmpdir(), 'cadre-ado-setup-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const ado = makeFake(dir);

function run(args, routes) {
  const env = ado.env(routes);
  const r = spawnSync(process.execPath, [script, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
  return { line: r.stdout.trim(), code: r.status, lines: r.stdout.split('\n').filter(Boolean).length, err: r.stderr, env };
}

// ---- area ----

const AREAS = `GET ${BASE}/Example%20Project/_apis/wit/classificationnodes/areas?%24depth=4&api-version=7.1`;
const node = (name, children = []) => ({ name, hasChildren: children.length > 0, children });
const tree = (...children) => ({ status: 200, body: { ...node('Example Project', children), structureType: 'area', path: '\\Example Project\\Area' } });
const area = (routes, repo = 'acme') => run(['area', 'example-org', 'Example Project', repo], { [AREAS]: routes });

test('area: an area that matches the repo name is proposed with its full path', () => {
  const r = area(tree(node('Other'), node('Acme')));
  assert.deepEqual([r.line, r.code, r.lines], ['match: Example Project\\Acme', 0, 1]);
});

test('area: a match ignores case, dashes, underscores, and spaces', () => {
  assert.equal(area(tree(node('Acme App')), 'acme-app').line, 'match: Example Project\\Acme App');
  assert.equal(area(tree(node('acme_app')), 'Acme-App').line, 'match: Example Project\\acme_app');
});

test('area: a nested match gives the whole path, and the shallowest match wins', () => {
  assert.equal(area(tree(node('Teams', [node('acme')]))).line, 'match: Example Project\\Teams\\acme');
  assert.match(area(tree(node('Teams', [node('acme')]), node('acme'))).line, /^match: Example Project\\acme \(also: Example Project\\Teams\\acme\)$/);
});

test('area: no match proposes the root and warns that items land at the root', () => {
  const r = area(tree(node('Other')));
  assert.match(r.line, /^root: Example Project\. .*root/);
  assert.equal(r.code, 0);
  assert.equal(r.lines, 1);
  assert.match(area(tree()).line, /^root: /);
});

test('area: the call asks for the tree with a depth', () => {
  const r = area(tree());
  assert.deepEqual(ado.requests(r.env).map((q) => [q.method, q.url]), [['GET', AREAS.slice(4)]]);
});

test('area: a dead sign-in, a bad body, and a body with no name are unknown', () => {
  for (const answer of [{ status: 302, body: '<html/>' }, { status: 401, body: '' }, { status: 203, body: '<html/>' }, { status: 200, body: '' }, { status: 200, body: 'nope' }, { status: 200, body: { children: [] } }, { status: 500, body: '{}' }, { crash: true }]) {
    const r = area(answer);
    assert.match(r.line, /^unknown: /, JSON.stringify(answer));
    assert.deepEqual([r.code, r.lines], [2, 1]);
  }
  assert.match(area({ status: 302, body: '' }).line, /AZURE_DEVOPS_EXT_PAT/);
});

// ---- type ----

const TYPES = `GET ${BASE}/Example%20Project/_apis/wit/workitemtypes?api-version=7.1`;
const CATEGORIES = `GET ${BASE}/Example%20Project/_apis/wit/workitemtypecategories?api-version=7.1`;
const states = [{ name: 'New', category: 'Proposed' }, { name: 'Doing', category: 'InProgress' }, { name: 'Done', category: 'Completed' }];
const wit = (name, over = {}) => ({ name, isDisabled: false, states, ...over });
const types = (...list) => ({ status: 200, body: { count: list.length, value: list } });
const cats = (requirement, task) => ({
  status: 200,
  body: { value: [{ referenceName: 'Microsoft.RequirementCategory', workItemTypes: requirement.map((name) => ({ name })) }, { referenceName: 'Microsoft.TaskCategory', workItemTypes: task.map((name) => ({ name })) }] },
});
const type = (answer, name = 'Issue', extra = {}) => run(['type', 'example-org', 'Example Project', name], { [TYPES]: answer, ...extra });

test('type: an enabled type with a Proposed and a Completed state passes, with its own spelling', () => {
  const r = type(types(wit('Issue'), wit('Task')), 'issue');
  assert.deepEqual([r.line, r.code, r.lines], ['ok type: Issue', 0, 1]);
});

test('type: a disabled type is refused and Task is proposed with one reason', () => {
  const r = type(types(wit('Issue', { isDisabled: true }), wit('Task')));
  assert.match(r.line, /^refuse: Issue is disabled in this project\. propose: Task\. /);
  assert.deepEqual([r.code, r.lines], [1, 1]);
});

test('type: a missing type is refused and Task is proposed', () => {
  const r = type(types(wit('Task')), 'Story');
  assert.match(r.line, /^refuse: Story is not a work item type of this project\. propose: Task\. /);
  assert.equal(r.code, 1);
});

test('type: with no Task, the first enabled type of the requirement level, then of the task level, is proposed', () => {
  const list = types(wit('Issue', { isDisabled: true }), wit('Story', { isDisabled: true }), wit('Change'), wit('Bug'));
  const first = type(list, 'Issue', { [CATEGORIES]: cats(['Issue', 'Story', 'Change'], ['Bug']) });
  assert.match(first.line, /^refuse: Issue is disabled .* propose: Change\. /);
  const second = type(types(wit('Issue', { isDisabled: true }), wit('Bug')), 'Issue', { [CATEGORIES]: cats(['Issue'], ['Bug']) });
  assert.match(second.line, /propose: Bug\. /);
});

test('type: no enabled type anywhere is a refusal with no proposal', () => {
  const r = type(types(wit('Issue', { isDisabled: true })), 'Issue', { [CATEGORIES]: cats(['Issue'], []) });
  assert.match(r.line, /^refuse: Issue is disabled in this project\. No other enabled type fits/);
  assert.equal(r.code, 1);
});

test('type: an enabled type with no Proposed or no Completed state is refused', () => {
  const noProposed = type(types(wit('Issue', { states: [{ name: 'Doing', category: 'InProgress' }, { name: 'Done', category: 'Completed' }] }), wit('Task')));
  assert.match(noProposed.line, /^refuse: Issue has no state in the category Proposed\. propose: Task\./);
  const noDone = type(types(wit('Issue', { states: [{ name: 'New', category: 'Proposed' }] }), wit('Task')));
  assert.match(noDone.line, /^refuse: Issue has no state in the category Completed\./);
});

test('type: a type name that is Task and disabled does not propose itself', () => {
  const r = type(types(wit('Task', { isDisabled: true }), wit('Bug')), 'Task', { [CATEGORIES]: cats([], ['Task', 'Bug']) });
  assert.match(r.line, /propose: Bug\. /);
});

test('type: a dead sign-in, a bad body, a missing list, and a failed category read are unknown', () => {
  for (const answer of [{ status: 302, body: '<html/>' }, { status: 401, body: '' }, { status: 200, body: '' }, { status: 200, body: 'nope' }, { status: 200, body: { value: 'x' } }, { status: 403, body: '{}' }, { crash: true }]) {
    const r = type(answer);
    assert.match(r.line, /^unknown: /, JSON.stringify(answer));
    assert.deepEqual([r.code, r.lines], [2, 1]);
  }
  const noCategories = type(types(wit('Issue', { isDisabled: true })), 'Issue', { [CATEGORIES]: { status: 500, body: '{}' } });
  assert.match(noCategories.line, /^unknown: /);
  assert.equal(noCategories.code, 2);
});

test('usage: a wrong subcommand or argument count gives exit 64 and no call', () => {
  for (const args of [[], ['area'], ['area', 'example-org', 'p'], ['type', 'example-org', 'p'], ['nope', 'a', 'b', 'c']]) {
    const r = run(args, {});
    assert.equal(r.code, 64, args.join(' '));
    assert.equal(r.line, '');
  }
});
