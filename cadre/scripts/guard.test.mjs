// Tests for guard.mjs at its seam: hook JSON on stdin and environment in, hook output and an exit code out.
// Each test makes a repo folder (git init) and a cadre home folder in a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, 'guard.mjs');
const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

// A repo on branch `branch` and an empty cadre home. Returns both paths.
function world(branch = 'feature') {
  const base = mkdtempSync(join(tmpdir(), 'cadre-guard-'));
  made.push(base);
  const repo = join(base, 'repo');
  const home = join(base, 'home');
  mkdirSync(repo);
  mkdirSync(home);
  spawnSync('git', ['init', '-q', '-b', branch], { cwd: repo });
  return { repo, home };
}

const charter = (w, front) => {
  mkdirSync(join(w.repo, 'docs', 'agents'), { recursive: true });
  writeFileSync(join(w.repo, 'docs', 'agents', 'cadre-charter.md'), `---\ncharter_schema: 1\nwritten_by: cadre 0.1.0\n${front}---\n\n# Charter\n`);
};

// Run `guard.mjs <guard>`. `input` is an object (hook JSON) or a string (sent as it is).
function run(w, guard, input, env = {}) {
  const e = { ...process.env, CADRE_HOME: w.home, ...env };
  delete e.CADRE_DEFAULT_BRANCH;
  Object.assign(e, env);
  const stdin = typeof input === 'string' ? input : JSON.stringify(input);
  const r = spawnSync(process.execPath, [script, guard], { input: stdin, env: e, encoding: 'utf8' });
  return { out: r.stdout.trim(), err: r.stderr.trim(), code: r.status };
}

const hook = (w, command, extra = {}) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command },
  cwd: w.repo,
  ...extra,
});

const decision = (r) => (r.out ? JSON.parse(r.out).hookSpecificOutput : null);
const pass = (r) => assert.deepEqual([r.out, r.code], ['', 0]);
function assertDecision(r, kind) {
  assert.equal(r.code, 0, r.err);
  const d = decision(r);
  assert.equal(d.hookEventName, 'PreToolUse');
  assert.equal(d.permissionDecision, kind);
  assert.ok(d.permissionDecisionReason.length > 0 && !d.permissionDecisionReason.includes('\n'));
  return d;
}

test('push to the default branch asks from the orchestrator', () => {
  const w = world();
  assertDecision(run(w, 'push', hook(w, 'git push origin main')), 'ask');
});

test('push to the default branch is denied for a call with agent_id, with a reason', () => {
  const w = world();
  const d = assertDecision(run(w, 'push', hook(w, 'git push origin main', { agent_id: 'agent-abc123' })), 'deny');
  assert.match(d.permissionDecisionReason, /helper never pushes or merges/);
});

test('a normal push to a non-default branch passes with no decision', () => {
  const w = world();
  pass(run(w, 'push', hook(w, 'git push origin feature')));
  pass(run(w, 'push', hook(w, 'git push -u origin feature:feature')));
});

test('a force push asks, in each form', () => {
  const w = world();
  for (const c of [
    'git push --force origin feature',
    'git push -f origin feature',
    'git push --force-with-lease origin feature',
    'git push --force-with-lease=feature origin feature',
    'git push -uf origin feature',
    'git push origin +feature',
    'git push origin +feature:feature',
  ]) assertDecision(run(w, 'push', hook(w, c)), 'ask');
});

test('a delete of a remote branch asks, in each form', () => {
  const w = world();
  for (const c of ['git push origin :feature', 'git push --delete origin feature', 'git push origin --delete feature', 'git push -d origin feature'])
    assertDecision(run(w, 'push', hook(w, c)), 'ask');
});

test('a refspec that targets the default branch asks', () => {
  const w = world();
  for (const c of ['git push origin HEAD:main', 'git push origin feature:refs/heads/master', 'git push --all origin', 'git push --mirror'])
    assertDecision(run(w, 'push', hook(w, c)), 'ask');
});

test('a bare push asks only when the current branch is the default branch', () => {
  const main = world('main');
  assertDecision(run(main, 'push', hook(main, 'git push')), 'ask');
  assertDecision(run(main, 'push', hook(main, 'git push origin HEAD')), 'ask');
  const feature = world('feature');
  pass(run(feature, 'push', hook(feature, 'git push')));
  pass(run(feature, 'push', hook(feature, 'git push origin HEAD')));
});

test('git global options before push do not hide it', () => {
  const w = world();
  assertDecision(run(w, 'push', hook(w, 'git -C other -c a.b=c push origin main')), 'ask');
});

test('the default branch comes from CADRE_DEFAULT_BRANCH, then from origin/HEAD, else main and master', () => {
  const w = world();
  assertDecision(run(w, 'push', hook(w, 'git push origin develop'), { CADRE_DEFAULT_BRANCH: 'develop' }), 'ask');
  pass(run(w, 'push', hook(w, 'git push origin main'), { CADRE_DEFAULT_BRANCH: 'develop' }));
  spawnSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk'], { cwd: w.repo });
  assertDecision(run(w, 'push', hook(w, 'git push origin trunk')), 'ask');
  pass(run(w, 'push', hook(w, 'git push origin main')));
});

test('chained and nested commands match', () => {
  const w = world();
  for (const c of [
    'cd x && git push origin main',
    'npm test; git push origin main',
    'git status | cat\ngit push origin main',
    '(cd x && git push origin main)',
    'echo $(git push origin main)',
    'FOO=bar git push origin main',
    'bash -c "git push origin main"',
    "sh -c 'cd x && git push origin main'",
    'eval "git push origin main"',
    'sudo git push origin main',
  ]) assertDecision(run(w, 'push', hook(w, c)), 'ask');
});

test('a push named inside a quoted string, an echo, or a comment does not match', () => {
  const w = world();
  for (const c of [
    'echo "git push origin main"',
    "echo 'git push --force'",
    'git commit -m "do not git push origin main"',
    'grep -r "git push" .',
    'ls # git push origin main',
    'echo git push origin main',
  ]) pass(run(w, 'push', hook(w, c)));
});

test('gh pr merge asks from the orchestrator and is denied for a helper, also with --auto', () => {
  const w = world();
  for (const c of ['gh pr merge 5', 'gh pr merge 5 --auto --rebase', 'gh -R acme/app pr merge 5', 'cd x && gh pr merge'])
    assertDecision(run(w, 'merge', hook(w, c)), 'ask');
  assertDecision(run(w, 'merge', hook(w, 'gh pr merge 5 --auto', { agent_id: 'a1' })), 'deny');
});

test('other gh and git commands pass the merge guard, and a merge passes the push guard', () => {
  const w = world();
  pass(run(w, 'merge', hook(w, 'gh pr view 5')));
  pass(run(w, 'merge', hook(w, 'gh pr create --title merge')));
  pass(run(w, 'merge', hook(w, 'git merge feature')));
  pass(run(w, 'push', hook(w, 'gh pr merge 5')));
  pass(run(w, 'merge', hook(w, 'git push origin main')));
});

test('a crash blocks: bad stdin, wrong shape, or an unknown guard exits 2 with a reason on stderr', () => {
  const w = world();
  for (const input of ['not json', '', '[]', '{}', JSON.stringify({ tool_input: { command: 5 } }), JSON.stringify({ tool_name: 'Bash', tool_input: {} })]) {
    const r = run(w, 'push', input);
    assert.equal(r.code, 2, `input ${input}`);
    assert.equal(r.out, '');
    assert.ok(r.err.length > 0);
  }
  const r = run(w, 'deploy', hook(w, 'ls'));
  assert.equal(r.code, 2);
  assert.equal(run(w, '', hook(w, 'ls')).code, 2);
});

// ---- the charter and the personal file ----

const personal = (w, obj) => writeFileSync(join(w.home, 'guards.json'), typeof obj === 'string' ? obj : JSON.stringify(obj));
const push = (w, extra) => run(w, 'push', hook(w, 'git push origin main', extra));
const merge = (w) => run(w, 'merge', hook(w, 'gh pr merge 5'));

test('guards: off in the charter passes both guards, also for a helper', () => {
  const w = world();
  charter(w, 'guards: off\n');
  pass(push(w));
  pass(push(w, { agent_id: 'a1' }));
  pass(merge(w));
});

test('allow: [merge] passes the merge guard and leaves the push guard on', () => {
  const w = world();
  charter(w, 'allow: [merge]\n');
  pass(merge(w));
  assertDecision(push(w), 'ask');
});

test('allow as a block list, with quotes and unknown names, is read', () => {
  const w = world();
  charter(w, 'allow:\n  - "merge"\n  - other\n');
  pass(merge(w));
  assertDecision(push(w), 'ask');
  charter(w, 'allow: push\nnested:\n  kind: x\n');
  pass(push(w));
  assertDecision(merge(w), 'ask');
});

test('a charter with other front matter fields still holds the guards on', () => {
  const w = world();
  charter(w, 'tracker:\n  kind: github\nskill_pack: none\n');
  assertDecision(push(w), 'ask');
  charter(w, 'guards: on\n');
  assertDecision(push(w), 'ask');
  charter(w, 'guards: maybe\n');
  assertDecision(push(w), 'ask');
});

test('an unreadable charter gives ask, and a missing charter gives ask', () => {
  const w = world();
  assertDecision(push(w), 'ask');
  writeFileSync(join(w.repo, 'docs'), 'a file where a folder should be');
  assertDecision(push(w), 'ask');
  rmSync(join(w.repo, 'docs'));
  mkdirSync(join(w.repo, 'docs', 'agents', 'cadre-charter.md'), { recursive: true });
  assertDecision(push(w), 'ask');
});

test('a charter with broken front matter gives ask, even if it says guards: off', () => {
  const w = world();
  mkdirSync(join(w.repo, 'docs', 'agents'), { recursive: true });
  const file = join(w.repo, 'docs', 'agents', 'cadre-charter.md');
  writeFileSync(file, '---\nguards: off\nthis line is not a key\n---\n');
  assertDecision(push(w), 'ask');
  writeFileSync(file, '---\nguards: off\n');
  assertDecision(push(w), 'ask');
  writeFileSync(file, 'guards: off\n');
  assertDecision(push(w), 'ask');
  writeFileSync(file, '---\nguards: off\nguards: on\n---\n');
  assertDecision(push(w), 'ask');
});

test('the charter is read at the repo root when cwd is a subfolder', () => {
  const w = world();
  charter(w, 'guards: off\n');
  mkdirSync(join(w.repo, 'src'));
  pass(run(w, 'push', { ...hook(w, 'git push origin main'), cwd: join(w.repo, 'src') }));
});

test('a personal file can add a guard that the charter turned off', () => {
  const w = world();
  charter(w, 'guards: off\n');
  personal(w, { guards: 'on' });
  assertDecision(push(w), 'ask');
  assertDecision(merge(w), 'ask');
});

test('a personal deny list keeps the named guard on, over allow and over guards: off', () => {
  const w = world();
  charter(w, 'allow: [merge, push]\n');
  personal(w, { deny: ['merge'] });
  assertDecision(merge(w), 'ask');
  pass(push(w));
  charter(w, 'guards: off\n');
  assertDecision(merge(w), 'ask');
  pass(push(w));
});

test('a personal file cannot remove a guard or allow one', () => {
  const w = world();
  for (const body of [
    { guards: 'off' },
    { allow: ['push', 'merge'] },
    { guards: 'off', allow: ['push', 'merge'], deny: [], off: true },
    { deny: 'merge' },
    'not json',
    '[]',
    '{"guards": ["off"]}',
  ]) {
    personal(w, body);
    assertDecision(push(w), 'ask');
    assertDecision(merge(w), 'ask');
    assertDecision(push(w, { agent_id: 'a1' }), 'deny');
  }
});

test('a personal file does not loosen a charter that has the guards on, and an unreadable one is ignored', () => {
  const w = world();
  mkdirSync(join(w.home, 'guards.json'));
  assertDecision(push(w), 'ask');
});

// ---- review findings: targets that the guard cannot read, wrappers, and one false positive ----

test('a push target that the guard cannot read asks', () => {
  const w = world();
  for (const c of [
    'git push origin $(echo main)',
    'B=main; git push origin $B',
    "git push origin 'refs/heads/*:refs/heads/*'",
    'git push origin "*:*"',
    'git push origin x:heads/main',
    'xargs git push origin main',
  ]) assertDecision(run(w, 'push', hook(w, c)), 'ask');
});

test('gh pr merge --disable-auto passes', () => {
  const w = world();
  pass(run(w, 'merge', hook(w, 'gh pr merge 5 --disable-auto')));
});
