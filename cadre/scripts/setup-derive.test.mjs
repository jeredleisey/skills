// Tests for setup-derive.mjs at its command line: arguments and environment in, lines and an exit code out.
// Seams: CADRE_GH_CMD (a fake gh), CADRE_ADO_CMD (ado-fake.mjs), CLAUDE_CONFIG_DIR, and a temp git repo.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, makeFake } from './ado-fake.mjs';

const script = join(import.meta.dirname, 'setup-derive.mjs');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'cadre-derive-')));
after(() => rmSync(base, { recursive: true, force: true }));
const ado = makeFake(join(base, 'ado'));

const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=tester', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
// A git repo with tracked folders docs and src (and a file at the top that is not a folder).
function makeRepo(name) {
  const dir = join(base, name);
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'src', 'a.txt'), 'a');
  writeFileSync(join(dir, 'docs', 'b.txt'), 'b');
  writeFileSync(join(dir, 'top.txt'), 't');
  git(dir, 'init', '-q');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}
const root = makeRepo('root');
const other = makeRepo('other');
git(root, 'worktree', 'add', '-q', join(base, 'root-wt'), '-b', 'wt');
const worktree = join(base, 'root-wt');

// ---- fake gh: answers from a table keyed by the argument string ----
const fakeGh = join(base, 'fake-gh.mjs');
writeFileSync(
  fakeGh,
  `import { readFileSync, appendFileSync } from 'node:fs';
const routes = JSON.parse(readFileSync(process.env.FAKE_GH_ROUTES, 'utf8'));
const key = process.argv.slice(2).join(' ');
appendFileSync(process.env.FAKE_GH_ROUTES + '.log', key + '\\n');
const hit = routes[key];
if (!hit) { console.error('gh: Not Found (HTTP 404)'); process.exit(1); }
if (hit.fail) { console.error(hit.fail); process.exit(1); }
console.log(JSON.stringify(hit.body));
`,
);
let n = 0;
const configDir = (files = {}) => {
  const dir = join(base, `cfg-${n++}`);
  mkdirSync(join(dir, 'plugins'), { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  return dir;
};
const dirMarket = (path) => ({ source: { source: 'directory', path } });

function runGh(routes, { args = ['github', 'acme/app'], cwd = root, config = configDir() } = {}) {
  const file = join(base, `routes-${n++}.json`);
  writeFileSync(file, JSON.stringify(routes));
  const env = { ...process.env, CADRE_GH_CMD: `"${process.execPath}" "${fakeGh}"`, FAKE_GH_ROUTES: file, CLAUDE_CONFIG_DIR: config };
  const r = spawnSync(process.execPath, [script, ...args], { env, cwd, encoding: 'utf8' });
  return { lines: r.stdout.split('\n').filter(Boolean), code: r.status, err: r.stderr, log: () => readFileSync(file + '.log', 'utf8').split('\n').filter(Boolean) };
}
const settings = { allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: false, default_branch: 'main' };
const ghRoutes = (over = {}) => ({
  'api repos/acme/app': { body: settings },
  'api repos/acme/app/rules/branches/main?per_page=100': { body: [] },
  'secret list --repo acme/app --json name': { body: [{ name: 'TOKEN_B' }, { name: 'TOKEN_A' }] },
  ...over,
});

test('github: each key prints in order with its source, and nothing is written', () => {
  const r = runGh(ghRoutes());
  assert.deepEqual(r.lines, [
    'fact default-branch "main" source=repo settings',
    'fact merge-methods ["merge","squash"] source=repo settings',
    'fact secrets ["TOKEN_A","TOKEN_B"] source=gh secret list',
    'fact live-clones [] source=no marketplace file',
    'fact folders ["docs","src"] source=git ls-tree HEAD',
  ]);
  assert.equal(r.code, 0);
  for (const call of r.log()) assert.doesNotMatch(call, /-X|--method|POST|PUT|PATCH|DELETE|--field|-f /);
});

test('github: a ruleset that narrows the merge methods narrows the fact, and the source names it', () => {
  const rules = [
    { type: 'pull_request', ruleset_id: 25317952, parameters: { allowed_merge_methods: ['squash', 'rebase'] } },
    { type: 'pull_request', ruleset_id: 7, parameters: {} },
    { type: 'deletion', ruleset_id: 8 },
  ];
  const r = runGh(ghRoutes({ 'api repos/acme/app/rules/branches/main?per_page=100': { body: rules } }));
  assert.equal(r.lines[1], 'fact merge-methods ["squash"] source=repo settings, ruleset 25317952');
});

test('github: all three methods allowed gives the sorted three', () => {
  const r = runGh(ghRoutes({ 'api repos/acme/app': { body: { ...settings, allow_rebase_merge: true } } }));
  assert.equal(r.lines[1], 'fact merge-methods ["merge","rebase","squash"] source=repo settings');
});

test('github: repo settings that are not visible give unread for merge-methods, not an empty list', () => {
  const { allow_squash_merge, ...hidden } = settings;
  const r = runGh(ghRoutes({ 'api repos/acme/app': { body: hidden } }));
  assert.equal(r.lines[1], 'unread merge-methods the repo settings are not visible to this account');
  assert.equal(r.lines.length, 5);
});

test('github: a secret list that fails gives unread for secrets and the other facts still print', () => {
  const r = runGh(ghRoutes({ 'secret list --repo acme/app --json name': { fail: 'gh: HTTP 403: Resource not accessible' } }));
  assert.equal(r.lines[2], 'unread secrets cannot read the secret list: gh: HTTP 403: Resource not accessible');
  assert.equal(r.lines.length, 5);
  assert.equal(r.code, 0);
});

test('github: a rules read that fails gives unread for merge-methods only', () => {
  const r = runGh(ghRoutes({ 'api repos/acme/app/rules/branches/main?per_page=100': { fail: 'gh: boom' } }));
  assert.equal(r.lines[0], 'fact default-branch "main" source=repo settings');
  assert.match(r.lines[1], /^unread merge-methods cannot read the rulesets: gh: boom/);
  assert.equal(r.lines.length, 5);
});

test('github: a repo that cannot be read gives unknown and exit 2', () => {
  const r = runGh({});
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: cannot read the repo/);
  assert.equal(r.lines.length, 1);
});

test('github: a host goes to gh api and to --repo', () => {
  const r = runGh(
    {
      'api --hostname ghe.example.com repos/acme/app': { body: settings },
      'api --hostname ghe.example.com repos/acme/app/rules/branches/main?per_page=100': { body: [] },
      'secret list --repo ghe.example.com/acme/app --json name': { body: [] },
    },
    { args: ['github', 'acme/app', 'ghe.example.com'] },
  );
  assert.equal(r.code, 0);
  assert.equal(r.lines[2], 'fact secrets [] source=gh secret list');
});

test('live-clones: a directory marketplace of this repo is listed, one of another repo is not', () => {
  const config = configDir({
    'settings.json': { extraKnownMarketplaces: { mine: dirMarket(root), theirs: dirMarket(other), gone: dirMarket(join(base, 'missing')), web: { source: { source: 'github', repo: 'a/b' } } } },
    'plugins/known_marketplaces.json': { wt: dirMarket(worktree), mine2: dirMarket(root) },
  });
  const r = runGh(ghRoutes(), { config });
  assert.equal(r.lines[3], `fact live-clones ${JSON.stringify([root, worktree])} source=settings.json extraKnownMarketplaces, plugins/known_marketplaces.json`);
});

test('live-clones: a marketplace file that is not JSON gives unread for live-clones only', () => {
  const r = runGh(ghRoutes(), { config: configDir({ 'settings.json': '{nope' }) });
  assert.match(r.lines[3], /^unread live-clones /);
  assert.equal(r.lines.length, 5);
});

// ---- ado ----
const P = `${BASE}/Example%20Project`;
const REPO = `GET ${P}/_apis/git/repositories/acme?api-version=7.1`;
const POLICIES = `GET ${P}/_apis/policy/configurations?api-version=7.1`;
const MERGE = 'fa4e907d-c16b-4a4c-9dfa-4916e5d171ab';
const repoAnswer = { status: 200, body: { id: 'r1', name: 'acme', defaultBranch: 'refs/heads/main' } };
const list = (value) => ({ status: 200, body: { count: value.length, value } });
const mergePolicy = (settings, over = {}) => ({
  id: 12,
  isEnabled: true,
  isBlocking: true,
  isDeleted: false,
  type: { id: MERGE },
  settings: { scope: [{ repositoryId: 'r1', refName: 'refs/heads/main', matchKind: 'Exact' }], ...settings },
  ...over,
});
function runAdo(routes = {}, { cwd = root, config = configDir() } = {}) {
  const env = ado.env({ [REPO]: repoAnswer, [POLICIES]: list([]), ...routes });
  const r = spawnSync(process.execPath, [script, 'ado', 'example-org', 'Example Project', 'acme'], { env: { ...process.env, ...env, CLAUDE_CONFIG_DIR: config }, cwd, encoding: 'utf8' });
  return { lines: r.stdout.split('\n').filter(Boolean), code: r.status, env };
}

test('ado: with no merge policy all four methods show, secrets are unread, and the rest print', () => {
  const r = runAdo();
  assert.deepEqual(r.lines, [
    'fact default-branch "main" source=repo record',
    'fact merge-methods ["merge","rebase","rebase-merge","squash"] source=no merge strategy policy',
    'unread secrets the PAT cannot read pipeline variables',
    'fact live-clones [] source=no marketplace file',
    'fact folders ["docs","src"] source=git ls-tree HEAD',
  ]);
  assert.equal(r.code, 0);
  assert.deepEqual([...new Set(ado.requests(r.env).map((q) => q.method))], ['GET']);
});

test('ado: a merge strategy policy narrows the methods, and the source names it', () => {
  const r = runAdo({ [POLICIES]: list([mergePolicy({ allowSquash: true, allowNoFastForward: true, allowRebase: false })]) });
  assert.equal(r.lines[1], 'fact merge-methods ["merge","squash"] source=policy 12');
});

test('ado: a policy that is off, or scoped to another branch, does not narrow', () => {
  const other = mergePolicy({ allowSquash: true }, { id: 13, settings: { allowSquash: true, scope: [{ repositoryId: 'r1', refName: 'refs/heads/dev', matchKind: 'Exact' }] } });
  const off = mergePolicy({ allowSquash: true }, { isEnabled: false });
  const r = runAdo({ [POLICIES]: list([other, off]) });
  assert.equal(r.lines[1], 'fact merge-methods ["merge","rebase","rebase-merge","squash"] source=no merge strategy policy');
});

test('ado: a scope with matchKind Prefix, or a null repositoryId, narrows', () => {
  const scoped = (scope) => mergePolicy({ allowSquash: true }, { settings: { allowSquash: true, scope: [scope] } });
  for (const scope of [{ repositoryId: 'r1', refName: 'refs/heads/', matchKind: 'Prefix' }, { repositoryId: null, refName: 'refs/heads/main', matchKind: 'Exact' }]) {
    assert.equal(runAdo({ [POLICIES]: list([scoped(scope)]) }).lines[1], 'fact merge-methods ["squash"] source=policy 12', JSON.stringify(scope));
  }
});

test('ado: a deleted policy is ignored', () => {
  const r = runAdo({ [POLICIES]: list([mergePolicy({ allowSquash: true }, { isDeleted: true })]) });
  assert.equal(r.lines[1], 'fact merge-methods ["merge","rebase","rebase-merge","squash"] source=no merge strategy policy');
});

test('ado: a second page of policies is read through the continuation token', () => {
  const next = `${POLICIES}&continuationToken=tok2`;
  const r = runAdo({ [POLICIES]: { status: 200, continuation: 'tok2', body: { value: [] } }, [next]: list([mergePolicy({ allowSquash: true })]) });
  assert.equal(r.lines[1], 'fact merge-methods ["squash"] source=policy 12');
});

test('ado: the older policy form reads useSquashMerge, and with neither form the policy id is named', () => {
  assert.equal(runAdo({ [POLICIES]: list([mergePolicy({ useSquashMerge: true })]) }).lines[1], 'fact merge-methods ["squash"] source=policy 12');
  assert.equal(runAdo({ [POLICIES]: list([mergePolicy({ useSquashMerge: false })]) }).lines[1], 'fact merge-methods ["merge"] source=policy 12');
  assert.match(runAdo({ [POLICIES]: list([mergePolicy({})]) }).lines[1], /^unread merge-methods policy 12 /);
});

test('ado: two live policies, one in the older form, are intersected', () => {
  const both = list([mergePolicy({ allowSquash: true, allowNoFastForward: true }), mergePolicy({ useSquashMerge: true }, { id: 14 })]);
  assert.match(runAdo({ [POLICIES]: both }).lines[1], /^fact merge-methods \["squash"\] source=policy 12, policy 14$/);
  const none = list([mergePolicy({ allowSquash: true }), mergePolicy({ useSquashMerge: false }, { id: 14 })]);
  assert.match(runAdo({ [POLICIES]: none }).lines[1], /^fact merge-methods \[\] source=policy 12, policy 14$/);
});

test('ado: a policy read that fails gives unread for merge-methods only', () => {
  const r = runAdo({ [POLICIES]: { status: 500, body: {} } });
  assert.match(r.lines[1], /^unread merge-methods ADO answered HTTP 500/);
  assert.equal(r.lines.length, 5);
});

test('ado: a repo that cannot be read gives unknown and exit 2', () => {
  const r = runAdo({ [REPO]: { status: 404, body: {} } });
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: /);
});

test('ado: live-clones works as on GitHub', () => {
  const config = configDir({ 'settings.json': { extraKnownMarketplaces: { mine: dirMarket(root) } } });
  const r = runAdo({}, { config });
  assert.equal(r.lines[3], `fact live-clones ${JSON.stringify([root])} source=settings.json extraKnownMarketplaces`);
});

// ---- arguments ----
test('bad arguments: usage errors exit 64, a bad name exits 2', () => {
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: root });
  for (const args of [[], ['nope'], ['github'], ['ado', 'a', 'b'], ['github', 'a/b', 'h', 'x']]) assert.equal(run(...args).status, 64, args.join(' '));
  const bad = run('github', 'not-a-repo');
  assert.equal(bad.status, 2);
  assert.match(bad.stdout, /^unknown: /);
});

test('a folder that is not a git repo gives unread for folders and live-clones', () => {
  const dir = join(base, 'plain');
  mkdirSync(dir);
  const r = runGh(ghRoutes(), { cwd: dir });
  assert.match(r.lines[3], /^unread live-clones /);
  assert.match(r.lines[4], /^unread folders /);
});
