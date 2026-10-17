// Tests for branch-policy-ado.mjs at its command line: arguments and environment in, lines and an exit code out.
// The ADO client is replaced through CADRE_ADO_CMD by a fake that answers from a table.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, makeFake } from './ado-fake.mjs';

const script = join(import.meta.dirname, 'branch-policy-ado.mjs');
const dir = mkdtempSync(join(tmpdir(), 'cadre-policy-ado-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const ado = makeFake(dir);

const P = `${BASE}/Example%20Project`;
const REPO = `GET ${P}/_apis/git/repositories/acme?api-version=7.1`;
const POLICIES = `GET ${P}/_apis/policy/configurations?api-version=7.1`;
const REVIEWERS = 'fa4e907d-c16b-4a4c-9dfa-4906e5d171dd';
const BUILD = '0609b952-1397-4640-95ec-e00a01b2c241';
const COMMENTS = 'c6a1889d-b943-4856-b76f-9e46bb6b0df2';

const scope = (over = {}) => ({ repositoryId: 'r1', refName: 'refs/heads/main', matchKind: 'Exact', ...over });
const policy = (typeId, over = {}, settings = {}) => ({
  id: 1,
  isEnabled: true,
  isBlocking: true,
  isDeleted: false,
  type: { id: typeId },
  settings: { scope: [scope()], ...settings },
  ...over,
});
const reviewers = (over, settings) => policy(REVIEWERS, over, { minimumApproverCount: 2, ...settings });
const build = (over, settings) => policy(BUILD, over, settings);
const comments = (over, settings) => policy(COMMENTS, over, settings);
const all = () => [reviewers(), build(), comments()];
const list = (value) => ({ status: 200, body: { count: value.length, value } });
const repo = { status: 200, body: { id: 'r1', name: 'acme', defaultBranch: 'refs/heads/main' } };

function run(routes = {}, args = ['example-org', 'Example Project', 'acme']) {
  const env = ado.env({ [REPO]: repo, [POLICIES]: list(all()), ...routes });
  const r = spawnSync(process.execPath, [script, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' });
  return { lines: r.stdout.split('\n').filter(Boolean), code: r.status, err: r.stderr, env };
}
const withPolicies = (value) => run({ [POLICIES]: list(value) });

test('a blocking reviewers, build, and comment policy on the branch gives ok', () => {
  const r = run();
  assert.deepEqual([r.lines, r.code], [['ok'], 0]);
  assert.deepEqual(ado.requests(r.env).map((q) => `${q.method} ${q.url}`), [REPO, POLICIES]);
});

test('no policy gives each gap on its own line, in a fixed order, and no ok', () => {
  const r = withPolicies([]);
  assert.deepEqual(r.lines, [
    'gap: no blocking policy requires a review',
    'gap: no blocking build validation policy',
    'gap: no blocking policy requires comment resolution',
    'gap: no blocking policy covers the branch, so it can take a direct push',
    'gap: no blocking policy covers the branch, so it can take a force push',
  ]);
  assert.equal(r.code, 0);
});

test('one policy on the branch means pushes are blocked, so only its own gaps show', () => {
  assert.deepEqual(withPolicies([build()]).lines, ['gap: no blocking policy requires a review', 'gap: no blocking policy requires comment resolution']);
  assert.deepEqual(withPolicies([reviewers(), comments()]).lines, ['gap: no blocking build validation policy']);
});

test('a reviewers policy with a minimum of 0 is a review gap', () => {
  assert.deepEqual(withPolicies([reviewers({}, { minimumApproverCount: 0 }), build(), comments()]).lines, ['gap: no blocking policy requires a review']);
  assert.deepEqual(withPolicies([reviewers({}, { minimumApproverCount: undefined }), build(), comments()]).lines, ['gap: no blocking policy requires a review']);
});

test('a policy that is disabled, deleted, or not blocking does not count', () => {
  for (const over of [{ isEnabled: false }, { isDeleted: true }, { isBlocking: false }, { isBlocking: undefined }]) {
    assert.deepEqual(withPolicies([reviewers(over), build(), comments()]).lines, ['gap: no blocking policy requires a review'], JSON.stringify(over));
  }
});

test('the scope decides: another repo, another branch, and no scope do not count', () => {
  for (const settings of [{ scope: [scope({ repositoryId: 'r2' })] }, { scope: [scope({ refName: 'refs/heads/dev' })] }, { scope: [] }, { scope: undefined }, { scope: [scope({ refName: null })] }]) {
    assert.deepEqual(withPolicies([build({}, settings), reviewers(), comments()]).lines, ['gap: no blocking build validation policy'], JSON.stringify(settings));
  }
});

test('a policy for all repos of the project, a prefix scope, and a second scope entry count', () => {
  for (const settings of [
    { scope: [scope({ repositoryId: null })] },
    { scope: [scope({ refName: 'refs/heads/', matchKind: 'Prefix' })] },
    { scope: [scope({ refName: 'refs/heads/ma', matchKind: 'Prefix' })] },
    { scope: [scope({ refName: 'refs/heads/dev' }), scope()] },
    { scope: [scope({ repositoryId: 'R1' })] },
  ]) {
    assert.deepEqual(withPolicies([build({}, settings), reviewers(), comments()]).lines, ['ok'], JSON.stringify(settings));
  }
  assert.deepEqual(withPolicies([build({}, { scope: [scope({ refName: 'refs/heads/dev', matchKind: 'Prefix' })] }), reviewers(), comments()]).lines, ['gap: no blocking build validation policy']);
});

test('a paged answer is read to the end, through the continuation token', () => {
  const second = `${POLICIES}&continuationToken=tok%2F2`;
  const r = run({ [POLICIES]: { ...list([reviewers()]), continuation: 'tok/2' }, [second]: list([build(), comments()]) });
  assert.deepEqual(r.lines, ['ok']);
  assert.equal(ado.requests(r.env).length, 3);
});

test('a repo name with a space, and the default branch of another name, are read', () => {
  const url = `GET ${P}/_apis/git/repositories/my%20repo?api-version=7.1`;
  const r = run({ [url]: { status: 200, body: { id: 'r9', defaultBranch: 'refs/heads/trunk' } }, [POLICIES]: list([reviewers(), build(), comments()].map((p) => ({ ...p, settings: { ...p.settings, scope: [scope({ repositoryId: 'r9', refName: 'refs/heads/trunk' })] } }))) }, ['example-org', 'Example Project', 'my repo']);
  assert.deepEqual(r.lines, ['ok']);
});

const BAD = [
  { status: 302, body: '<html>Sign in</html>' },
  { status: 401, body: '' },
  { status: 203, body: '<html/>' },
  { status: 200, body: '' },
  { status: 200, body: '<html>not json</html>' },
  { status: 404, body: '{}' },
  { status: 500, body: '{}' },
  { crash: true },
];

test('a failed read of the repo or of the policies gives one unknown line and never ok', () => {
  for (const key of [REPO, POLICIES]) {
    for (const answer of BAD) {
      const r = run({ [key]: answer });
      assert.equal(r.lines.length, 1, `${key} ${JSON.stringify(answer)}`);
      assert.match(r.lines[0], /^unknown: /);
      assert.equal(r.code, 2);
    }
  }
  assert.match(run({ [POLICIES]: BAD[1] }).lines[0], /AZURE_DEVOPS_EXT_PAT/);
});

test('a failure on a later page gives unknown, not the gaps of the first page', () => {
  const r = run({ [POLICIES]: { ...list([reviewers()]), continuation: 'tok' }, [`${POLICIES}&continuationToken=tok`]: { status: 401, body: '' } });
  assert.deepEqual([r.lines.length, r.code], [1, 2]);
  assert.match(r.lines[0], /^unknown: /);
});

test('an answer of the wrong shape is unknown', () => {
  for (const routes of [
    { [REPO]: { status: 200, body: { id: 'r1' } } },
    { [REPO]: { status: 200, body: { id: 'r1', defaultBranch: 'main' } } },
    { [REPO]: { status: 200, body: { defaultBranch: 'refs/heads/main' } } },
    { [POLICIES]: { status: 200, body: { count: 0 } } },
    { [POLICIES]: { status: 200, body: { value: 'x' } } },
    { [POLICIES]: { status: 200, body: [] } },
  ]) {
    const r = run(routes);
    assert.match(r.lines[0], /^unknown: /, JSON.stringify(routes));
    assert.deepEqual([r.lines.length, r.code], [1, 2]);
  }
});

test('a policy of an odd shape does not hide a gap and does not crash', () => {
  const r = withPolicies([null, 5, {}, { type: null, settings: null }, reviewers(), build(), comments()]);
  assert.deepEqual(r.lines, ['ok']);
});

test('usage: the wrong argument count gives exit 64, and a bad org gives unknown with no call', () => {
  for (const args of [[], ['example-org', 'p'], ['example-org', 'p', 'r', 'x']]) assert.equal(run({}, args).code, 64);
  const r = run({}, ['bad org', 'p', 'r']);
  assert.deepEqual([r.lines.length, r.code], [1, 2]);
  assert.deepEqual(ado.requests(r.env), []);
});
