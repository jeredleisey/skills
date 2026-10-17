// Tests for branch-policy.mjs at its command line: arguments and environment in, lines and an exit code out.
// A fake gh (a Node script) answers each `gh api` endpoint from a table in a JSON file.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, 'branch-policy.mjs');
const base = mkdtempSync(join(tmpdir(), 'cadre-policy-'));
after(() => rmSync(base, { recursive: true, force: true }));

const fake = join(base, 'fake-gh.mjs');
writeFileSync(
  fake,
  `import { readFileSync, appendFileSync } from 'node:fs';
const routes = JSON.parse(readFileSync(process.env.FAKE_GH_ROUTES, 'utf8'));
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_GH_ROUTES + '.log', args.join(' ') + '\\n');
const hit = routes[args[args.length - 1]];
if (!hit) { console.error('gh: Not Found (HTTP 404)'); process.exit(1); }
if (hit.status && hit.status !== 200) { console.error(hit.message ?? 'gh: error (HTTP ' + hit.status + ')'); process.exit(1); }
console.log(JSON.stringify(hit.body));
`,
);

let n = 0;
// `routes` maps an endpoint to { body } or { status, message }.
function run(routes, args = ['acme/app'], env = {}) {
  const file = join(base, `routes-${n++}.json`);
  writeFileSync(file, JSON.stringify(routes));
  const e = { ...process.env, CADRE_GH_CMD: `"${process.execPath}" "${fake}"`, FAKE_GH_ROUTES: file, ...env };
  const r = spawnSync(process.execPath, [script, ...args], { env: e, encoding: 'utf8' });
  return { lines: r.stdout.split('\n').filter(Boolean), code: r.status, err: r.stderr, log: file + '.log' };
}

const repo = { body: { default_branch: 'main' } };
const rules = (...types) => ({ body: types.map((type) => ({ type })) });
const full = {
  'repos/acme/app': repo,
  'repos/acme/app/rules/branches/main': rules('pull_request', 'non_fast_forward', 'deletion', 'required_status_checks'),
  'repos/acme/app/branches/main/protection': { status: 404, message: 'gh: Branch not protected (HTTP 404)' },
};

test('a ruleset with all four rules and no protection gives ok', () => {
  const r = run(full);
  assert.deepEqual([r.lines, r.code], [['ok'], 0]);
});

test('no rule and no protection gives each gap on its own line, and no ok', () => {
  const r = run({ ...full, 'repos/acme/app/rules/branches/main': rules() });
  assert.deepEqual(r.lines, [
    'gap: no rule requires a pull request',
    'gap: no review is required',
    'gap: force push is allowed',
    'gap: the branch can be deleted',
    'gap: no required status check',
  ]);
  assert.equal(r.code, 0);
});

test('each gap shows alone when the other rules are present', () => {
  const only = (drop) => run({ ...full, 'repos/acme/app/rules/branches/main': rules(...['pull_request', 'non_fast_forward', 'deletion', 'required_status_checks'].filter((t) => t !== drop)) }).lines;
  assert.deepEqual(only('pull_request'), ['gap: no rule requires a pull request', 'gap: no review is required']);
  assert.deepEqual(only('non_fast_forward'), ['gap: force push is allowed']);
  assert.deepEqual(only('deletion'), ['gap: the branch can be deleted']);
  assert.deepEqual(only('required_status_checks'), ['gap: no required status check']);
});

test('a pull request rule or protection with no approving review is a review gap, apart from the pull request gap', () => {
  const zero = { body: [{ type: 'pull_request', parameters: { required_approving_review_count: 0 } }, { type: 'non_fast_forward' }, { type: 'deletion' }, { type: 'required_status_checks' }] };
  assert.deepEqual(run({ ...full, 'repos/acme/app/rules/branches/main': zero }).lines, ['gap: no review is required']);
  const one = { body: [{ type: 'pull_request', parameters: { required_approving_review_count: 1 } }, { type: 'non_fast_forward' }, { type: 'deletion' }, { type: 'required_status_checks' }] };
  assert.deepEqual(run({ ...full, 'repos/acme/app/rules/branches/main': one }).lines, ['ok']);
  const classic = { body: { required_pull_request_reviews: { required_approving_review_count: 0 } } };
  assert.deepEqual(run({ ...full, 'repos/acme/app/rules/branches/main': rules('non_fast_forward', 'deletion', 'required_status_checks'), 'repos/acme/app/branches/main/protection': classic }).lines, ['gap: no review is required']);
  assert.deepEqual(run({ ...full, 'repos/acme/app/rules/branches/main': zero, 'repos/acme/app/branches/main/protection': { body: { required_pull_request_reviews: { required_approving_review_count: 2 } } } }).lines, ['ok']);
});

test('classic branch protection closes the gaps that it covers', () => {
  const protection = {
    body: {
      required_pull_request_reviews: { required_approving_review_count: 1 },
      required_status_checks: { contexts: ['ci'] },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
    },
  };
  assert.deepEqual(run({ ...full, 'repos/acme/app/rules/branches/main': rules(), 'repos/acme/app/branches/main/protection': protection }).lines, ['ok']);
  const loose = { body: { allow_force_pushes: { enabled: true }, allow_deletions: { enabled: true } } };
  assert.deepEqual(run({ ...full, 'repos/acme/app/rules/branches/main': rules(), 'repos/acme/app/branches/main/protection': loose }).lines, [
    'gap: no rule requires a pull request',
    'gap: no review is required',
    'gap: force push is allowed',
    'gap: the branch can be deleted',
    'gap: no required status check',
  ]);
});

test('rules and protection together: a gap closes if either one covers it', () => {
  const protection = { body: { allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false } } };
  const r = run({ ...full, 'repos/acme/app/rules/branches/main': rules('pull_request', 'required_status_checks'), 'repos/acme/app/branches/main/protection': protection });
  assert.deepEqual(r.lines, ['ok']);
});

test('the default branch name comes from the repo, and a host is passed to gh', () => {
  const routes = {
    'repos/acme/app': { body: { default_branch: 'trunk' } },
    'repos/acme/app/rules/branches/trunk': rules('pull_request', 'non_fast_forward', 'deletion', 'required_status_checks'),
    'repos/acme/app/branches/trunk/protection': { status: 404, message: 'gh: Branch not protected (HTTP 404)' },
  };
  const r = run(routes, ['acme/app', 'ghe.example.com']);
  assert.deepEqual(r.lines, ['ok']);
  assert.match(readFileSync(r.log, 'utf8'), /^api --hostname ghe\.example\.com repos\/acme\/app$/m);
});

test('an unreadable policy gives one unknown line, never ok', () => {
  const cases = [
    { 'repos/acme/app': { status: 404, message: 'gh: Not Found (HTTP 404)' } },
    { ...full, 'repos/acme/app': { status: 403, message: 'gh: Resource not accessible (HTTP 403)' } },
    { ...full, 'repos/acme/app/rules/branches/main': { status: 403, message: 'gh: Forbidden (HTTP 403)' } },
    { ...full, 'repos/acme/app/branches/main/protection': { status: 403, message: 'gh: Upgrade to GitHub Pro (HTTP 403)' } },
    { ...full, 'repos/acme/app/branches/main/protection': { status: 404, message: 'gh: Not Found (HTTP 404)' } },
    { ...full, 'repos/acme/app': { body: {} } },
    { ...full, 'repos/acme/app/rules/branches/main': { body: { not: 'a list' } } },
  ];
  for (const routes of cases) {
    const r = run(routes);
    assert.equal(r.lines.length, 1, JSON.stringify(routes));
    assert.match(r.lines[0], /^unknown: \S/);
    assert.equal(r.code, 2);
  }
});

test('a missing gh gives unknown', () => {
  const r = spawnSync(process.execPath, [script, 'acme/app'], { env: { ...process.env, CADRE_GH_CMD: 'cadre-no-such-command-xyz' }, encoding: 'utf8' });
  assert.match(r.stdout.trim(), /^unknown: /);
  assert.equal(r.status, 2);
});

test('a bad argument gives unknown and changes nothing', () => {
  for (const args of [[], ['acme'], ['acme/app', 'bad host'], ['acme/app; rm -rf x']]) {
    const r = run(full, args);
    assert.equal(r.lines.length, 1);
    assert.match(r.lines[0], /^unknown: /);
    assert.equal(r.code, 2);
  }
});
