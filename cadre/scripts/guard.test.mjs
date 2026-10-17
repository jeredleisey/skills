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

const gitIn = (dir, ...args) =>
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=bot@noreply.github.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir });
const slash = (p) => p.replace(/\\/g, '/');

// Write the charter file in the working tree only.
function writeCharter(w, text) {
  mkdirSync(join(w.repo, 'docs', 'agents'), { recursive: true });
  writeFileSync(join(w.repo, 'docs', 'agents', 'cadre-charter.md'), text);
}
const front = (extra) => `---\ncharter_schema: 1\nwritten_by: cadre 0.1.0\n${extra}---\n\n# Charter\n`;

// Commit the charter text, and make it the content of origin/main, which is origin/HEAD.
function commitCharter(w, text) {
  writeCharter(w, text);
  gitIn(w.repo, 'add', 'docs');
  gitIn(w.repo, 'commit', '-q', '-m', 'charter');
  gitIn(w.repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  gitIn(w.repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
}
const charter = (w, extra) => commitCharter(w, front(extra));

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

test('the default branch comes from CADRE_DEFAULT_BRANCH or origin/HEAD, and the usual names stay guarded', () => {
  const w = world();
  assertDecision(run(w, 'push', hook(w, 'git push origin release'), { CADRE_DEFAULT_BRANCH: 'release' }), 'ask');
  pass(run(w, 'push', hook(w, 'git push origin other'), { CADRE_DEFAULT_BRANCH: 'release' }));
  spawnSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/stable'], { cwd: w.repo });
  assertDecision(run(w, 'push', hook(w, 'git push origin stable')), 'ask');
  pass(run(w, 'push', hook(w, 'git push origin other')));
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

test('guards: off in the charter passes both guards for the orchestrator', () => {
  const w = world();
  charter(w, 'guards: off\n');
  pass(push(w));
  pass(merge(w));
});

test('a helper is denied also when the charter has guards: off or allows the guard', () => {
  const w = world();
  charter(w, 'guards: off\nallow: [push, merge]\n');
  assertDecision(push(w, { agent_id: 'a1' }), 'deny');
  assertDecision(run(w, 'merge', hook(w, 'gh pr merge 5', { agent_id: 'a1' })), 'deny');
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

test('a missing charter gives ask, also when git cannot run', () => {
  const w = world();
  assertDecision(push(w), 'ask');
  commitCharter(w, front('guards: off\n'));
  pass(push(w));
  assertDecision(run(w, 'push', hook(w, 'git push origin main'), { CADRE_GIT_CMD: join(w.home, 'no-such-git') }), 'ask');
});

test('a committed charter with broken front matter gives ask, even if it says guards: off', () => {
  const w = world();
  for (const text of [
    '---\nguards: off\nthis line is not a key\n---\n',
    '---\nguards: off\n',
    'guards: off\n',
    '---\nguards: off\nguards: on\n---\n',
  ]) {
    commitCharter(w, text);
    assertDecision(push(w), 'ask');
  }
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

// ---- adversarial review: continuation lines, wrappers, options with a value, the repo that a command selects ----

const asks = (guard, commands, w = world()) => {
  for (const c of commands) assert.equal(decision(run(w, guard, hook(w, c)))?.permissionDecision, 'ask', c);
};
const passes = (guard, commands, w = world()) => {
  for (const c of commands) {
    const r = run(w, guard, hook(w, c));
    assert.deepEqual([r.out, r.code], ['', 0], c);
  }
};

test('a backslash-newline joins the line before the match', () => {
  asks('push', ['git push origin feat \\\n--force', 'git push origin \\\n:feat', 'git\\\n push origin main', 'git push origin \\\r\nmain']);
  asks('merge', ['gh pr  merge \\\n 5', 'gh \\\n pr merge 5']);
});

test('a wrapper option that takes a value does not hide the command', () => {
  asks('push', [
    'sudo -u root git push origin main',
    'sudo --user root git push origin main',
    'sudo --user=root git push origin main',
    'env -u X git push origin main',
    'env -i FOO=1 git push origin main',
    'nice -n 5 git push origin main',
    'nice -5 git push origin main',
    'ionice -c 3 git push origin main',
    'doas -u x git push origin main',
    'nohup git push origin main',
    'time -p git push origin main',
    'command git push origin main',
    'exec -a x git push origin main',
    'timeout 10 git push origin main',
    'timeout -s KILL -k 5 10 git push origin main',
    'watch -n 5 git push origin main',
    'watch "git push origin main"',
    'stdbuf -o0 git push origin main',
    'setsid -f git push origin main',
    'caffeinate -t 5 git push origin main',
    'busybox git push origin main',
    'xargs git push origin main',
    'xargs -I{} git push origin {}',
    'xargs -n 1 -P 4 git push origin main',
    "find . -name x -exec git push origin main ';'",
    'find . -exec git push origin main \;',
    'find . -execdir git push --force origin f +',
    'ssh host git push origin main',
    "ssh -p 22 -o X=y host 'cd x && git push origin main'",
    'sudo sudo -u x timeout 5 git push origin main',
    "env -S 'git push origin main'",
  ]);
  asks('merge', ['sudo -u x gh pr merge 5', 'env -u X gh pr merge 5', 'timeout 5 gh pr merge 5', 'ssh host gh pr merge 5', 'xargs -I{} gh pr merge {}']);
});

test('an unknown option of a known wrapper asks when the words of a push or a merge follow', () => {
  asks('push', ['sudo --weird git push origin feature', 'nice --weird=1 git push origin feature', 'timeout --weird 5 git push origin feature']);
  asks('merge', ['sudo --weird gh pr merge 5']);
  passes('push', ['sudo --weird ls', 'sudo --weird git status', 'sudo --weird echo hi']);
});

test('a command piped or fed into a shell asks when its text holds a push or a merge', () => {
  asks('push', [
    'echo "git push origin feature" | sh',
    'echo "git push origin main" | bash',
    'printf "git push --force" | sudo bash -s',
    'bash <<< "git push origin feature"',
    'sh <<EOF\ngit push origin feature\nEOF',
    'cat <<EOF | sh\ngit push origin feature\nEOF',
    'echo "git push origin feature" | /bin/zsh -',
  ]);
  asks('merge', ['echo "gh pr merge 5" | sh']);
  passes('push', ['echo "git push origin main"', 'printf "git push" | cat', 'grep "git push" notes | sort', 'echo hi | sh', 'echo "git push" > notes.txt', 'sh script.sh', 'cat <<EOF\nnote about git push\nEOF']);
});

test('git.exe and gh.exe, with a path or in capitals, are matched', () => {
  asks('push', ['git.exe push origin main', 'GIT.EXE push origin main', '/usr/bin/git push origin main', '"C:/Program Files/Git/cmd/git.exe" push origin main']);
  asks('merge', ['gh.exe pr merge 5']);
});

test('a push option that takes a value does not hide the refspec', () => {
  const w = world();
  asks('push', [
    'git push --repo origin main',
    'git push --repo=origin main',
    'git push --receive-pack x origin main',
    'git push --receive-pack=x origin main',
    'git push --exec x origin main',
    'git push -o ci.skip origin main',
    'git push --push-option ci.skip origin main',
    'git push --signed=if-asked origin main',
    'git push --recurse-submodules=check origin main',
    'git push --recurse-submodules check origin main',
  ], w);
  const m = world('main');
  asks('push', ['git push -o ci.skip', 'git push --recurse-submodules check', 'git push --signed origin', 'git push --repo origin', 'git push --exec x origin'], m);
  passes('push', ['git push -o ci.skip origin feature', 'git push --repo origin feature'], w);
});

function sibling(w, branch) {
  const dir = join(w.repo, '..', 'other');
  mkdirSync(dir, { recursive: true });
  spawnSync('git', ['init', '-q', '-b', branch], { cwd: dir });
  return slash(dir);
}

test('a bare push is judged in the repo that -C, --git-dir, --work-tree, or cd selects', () => {
  const feature = world('feature');
  const onMain = sibling(feature, 'main');
  asks('push', [`git -C ${onMain} push`, `git -C ${onMain} push origin HEAD`, `cd ${onMain} && git push`, `cd ${onMain}; git push`, `git --git-dir=${onMain}/.git push`, `git --git-dir ${onMain}/.git push`, `git --work-tree ${onMain} push`, 'git -C ../other push', 'cd ../other && git push', 'git -C .. -C other push', `pushd ${onMain} && git push`], feature);
  const main = world('main');
  const other = sibling(main, 'feature');
  passes('push', [`git -C ${other} push`, `cd ${other} && git push`, `cd ${other}\ngit push`, 'cd ../other && git push'], main);
  asks('push', ['git push', `cd ${other} && cd ${slash(main.repo)} && git push`], main);
});

test('a bare push asks when the guard cannot tell which repo a command selects', () => {
  const w = world('feature');
  asks('push', ['git -C $DIR push', 'git -C "$(pwd)" push', 'cd $DIR && git push', 'cd *.d && git push', 'cd && git push', 'cd - && git push', 'cd ~/x && git push', '(cd x; git push)', 'cd x && (cd y && git push)', 'popd && git push', 'git --git-dir=$G push'], w);
  passes('push', ['git status', 'cd $DIR && git status'], w);
});

test('the charter in the working tree does not count, and one committed on the default branch does', () => {
  const w = world();
  writeCharter(w, front('guards: off\n'));
  assertDecision(push(w), 'ask');
  commitCharter(w, front('guards: on\n'));
  writeCharter(w, front('guards: off\n'));
  assertDecision(push(w), 'ask');
  commitCharter(w, front('guards: off\n'));
  pass(push(w));
});

test('a charter committed only on the current branch does not count', () => {
  const w = world();
  writeCharter(w, front('guards: off\n'));
  gitIn(w.repo, 'add', 'docs');
  gitIn(w.repo, 'commit', '-q', '-m', 'charter');
  assertDecision(push(w), 'ask');
  gitIn(w.repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  pass(push(w));
});

test('the charter comes from origin/<default>, where CADRE_DEFAULT_BRANCH names a default outside the usual names', () => {
  const w = world();
  commitCharter(w, front('guards: off\n'));
  gitIn(w.repo, 'update-ref', 'refs/remotes/origin/release', 'HEAD');
  gitIn(w.repo, 'update-ref', '-d', 'refs/remotes/origin/main');
  assertDecision(push(w), 'ask');
  pass(run(w, 'push', hook(w, 'git push origin release'), { CADRE_DEFAULT_BRANCH: 'release' }));
});

test('without origin/HEAD the default branch is any of main, master, dev, develop, trunk, and init.defaultBranch', () => {
  const w = world();
  asks('push', ['git push origin main', 'git push origin master', 'git push origin dev', 'git push origin develop', 'git push origin trunk'], w);
  passes('push', ['git push origin release'], w);
  spawnSync('git', ['config', 'init.defaultBranch', 'release'], { cwd: w.repo });
  asks('push', ['git push origin release'], w);
});

test('without origin/HEAD the head of the remote of the current branch is a default branch', () => {
  const w = world();
  spawnSync('git', ['config', 'branch.feature.remote', 'up'], { cwd: w.repo });
  spawnSync('git', ['symbolic-ref', 'refs/remotes/up/HEAD', 'refs/remotes/up/stable'], { cwd: w.repo });
  asks('push', ['git push up stable'], w);
});

test('agent_id that is empty or null counts as a helper call', () => {
  const w = world();
  for (const id of ['', null]) {
    assertDecision(push(w, { agent_id: id }), 'deny');
    assertDecision(run(w, 'merge', hook(w, 'gh pr merge 5', { agent_id: id })), 'deny');
  }
  pass(run(w, 'push', hook(w, 'git push origin feature', { agent_id: '' })));
});

// ---- second review: heredocs, quotes, the default branch, variables, xargs, NUL, depth, aliases ----

test('a heredoc body is data: an apostrophe in it does not swallow the next command', () => {
  const w = world();
  const doc = "git commit -F - <<'EOF'\nfix: don't crash\nEOF\n";
  asks('push', [doc + 'git push origin main', 'cat <<EOF\nit\'s\nEOF\ngit push -f origin feat', 'cat <<-EOF\n\tx\n\tEOF\ngit push origin main', 'cat <<"EOF"\n"unbalanced\nEOF\ngit push origin main'], w);
  assertDecision(run(w, 'push', hook(w, doc + 'git push origin main', { agent_id: 'a1' })), 'deny');
  asks('merge', ["cat <<EOF\nit's\nEOF\ngh pr merge 5"], w);
  passes('push', ["cat <<'EOF'\ngit push origin main\nEOF", doc + 'git status', 'cat <<< "git push origin main"'], w);
});

test('a heredoc with no end tag asks when the text before it holds a push', () => {
  const w = world();
  asks('push', ['git push origin feature <<EOF\nabc', 'git push origin main <<EOF\nabc'], w);
  passes('push', ['echo hi <<EOF\nabc'], w);
});

test('an unbalanced quote asks when the whole text holds a push or a merge', () => {
  const w = world();
  asks('push', ["echo don't; git push origin feature"], w);
  asks('merge', ["echo don't; gh pr merge 5"], w);
  passes('push', ["echo don't; git status", "echo don't; gh pr merge 5"], w);
});

test('a helper cannot lift the default-branch guard by moving origin/HEAD', () => {
  const w = world();
  spawnSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/feat'], { cwd: w.repo });
  assertDecision(run(w, 'push', hook(w, 'git push origin main')), 'ask');
  assertDecision(run(w, 'push', hook(w, 'git push origin main', { agent_id: 'a1' })), 'deny');
  assertDecision(run(w, 'push', hook(w, 'git push origin feat')), 'ask');
  for (const name of ['master', 'dev', 'develop', 'trunk']) assertDecision(run(w, 'push', hook(w, `git push origin ${name}`)), 'ask');
  passes('push', ['git push origin other'], w);
});

test('a variable where the guard needs a word asks', () => {
  const w = world();
  asks('push', ['eval $cmd', 'g=git; $g push origin main', 'git $x', 'git -C . $x', '$(echo git) push origin main', 'git $(echo push) origin main', 'git ${IFS}push', '`echo git` push origin feature'], w);
  asks('merge', ['eval $cmd', 'gh $x merge', 'gh pr $(echo merge) 5', 'g=gh; $g pr merge 5', 'gh pr ${x} 5'], w);
  passes('push', ['echo $HOME', 'ls $x', 'git status $x', 'git log $(git rev-parse HEAD)', 'cd $DIR && git status', '$g status'], w);
  passes('merge', ['gh pr view $N', 'gh api $URL', '$g status'], w);
});

test('xargs that runs a push or a merge asks, because it appends arguments', () => {
  const w = world();
  asks('push', ['xargs git push origin feature', 'echo x | xargs -I{} git push origin feature'], w);
  asks('merge', ['xargs gh pr merge', 'echo 5 | xargs -n1 gh pr merge'], w);
  passes('push', ['xargs git status', 'xargs echo git push', 'echo x | xargs ls'], w);
  passes('merge', ['xargs gh pr view'], w);
});

test('a NUL byte blocks, and nesting deeper than 4 levels blocks', () => {
  const w = world();
  const r = run(w, 'push', hook(w, 'git status\0git push origin main'));
  assert.equal(r.code, 2);
  assert.match(r.err, /NUL/);
  const wrap = (inner, n, outer) => (n === 0 ? inner : wrap(`${outer} ${quoteSh(inner)}`, n - 1, outer));
  const quoteSh = (t) => `'${t.replace(/'/g, `'\\''`)}'`;
  for (const outer of ['bash -c', 'eval']) {
    pass(run(w, 'push', hook(w, wrap('git status', 4, outer))));
    const deep = run(w, 'push', hook(w, wrap('git status', 5, outer)));
    assert.equal(deep.code, 2, outer);
    assert.match(deep.err, /deeper than 4/);
  }
});

test('gh pr merge --disable-auto passes only when nothing else asks for a merge', () => {
  const w = world();
  asks('merge', ['gh pr merge 5 --disable-auto --auto', 'gh pr merge 5 --disable-auto --squash', 'gh pr merge 5 --disable-auto --admin', 'gh pr merge --rebase 5 --disable-auto', 'gh pr merge 5 --auto --disable-auto'], w);
  passes('merge', ['gh pr merge 5 --disable-auto', 'gh pr merge --disable-auto'], w);
});

test('git send-pack and a setting of alias, remote push, or push.default beside a push ask', () => {
  const w = world();
  asks('push', [
    'git send-pack origin main',
    'git -C . send-pack --all origin',
    'git -c alias.p=push p origin feature',
    'git -c remote.origin.push=HEAD:main push origin feature',
    'git -c push.default=matching push',
    'git config alias.p push && git p origin feature',
    'git config --global alias.p "push --force" && git p',
    'git config remote.origin.push HEAD:main && git push origin feature',
    'git config push.default current',
  ], w);
  passes('push', ['git config user.name x', 'git config alias.co checkout', 'git config --get alias.co', 'git -c core.pager=cat log'], w);
});

// ---- a tilde expands only at the start of a word (or after : or =), so RUNNER~1 is a plain path ----

test('a tilde inside a word, such as the Windows short name RUNNER~1, is a literal path', () => {
  const w = world('main');
  const dir = join(w.repo, '..', 'RUNNER~1', 'other');
  mkdirSync(dir, { recursive: true });
  spawnSync('git', ['init', '-q', '-b', 'feature'], { cwd: dir });
  const path = slash(dir);
  passes('push', [`git -C ${path} push`, `cd ${path} && git push`, `git --git-dir=${path}/.git push`, `git push origin HEAD~1:topic`], w);
  const onMain = world('feature');
  const dirMain = join(onMain.repo, '..', 'RUNNER~1', 'other');
  mkdirSync(dirMain, { recursive: true });
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dirMain });
  asks('push', [`git -C ${slash(dirMain)} push`, `cd ${slash(dirMain)} && git push`], onMain);
});

test('a tilde at the start of a word still asks', () => {
  const w = world('feature');
  asks('push', ['git -C ~/x push', 'git -C ~user/x push', 'cd ~user/x && git push', 'git --git-dir=~/x/.git push', 'git push origin ~x'], w);
});

// ---- third review: redirections, the candidate branches of the charter, agent_type, option prefixes ----

test('a redirection is not a refspec: a bare push on main still asks, for both callers', () => {
  const m = world('main');
  for (const c of ['git push origin 2>&1', 'git push -u origin 2>&1 | tail -5', 'git push > push.log', 'git push origin >/dev/null', 'git push origin &>/dev/null', 'git push origin &>>log', 'git push 2>>log', 'git push origin >| out', 'git push origin 1>&2', 'git push >&2', 'git push origin main 2>/dev/null', 'git push origin 2> err.log']) {
    assertDecision(run(m, 'push', hook(m, c)), 'ask');
    assertDecision(run(m, 'push', hook(m, c, { agent_id: 'a1' })), 'deny');
  }
  passes('push', ['git push origin feat 2>&1', 'git push origin feat >/dev/null 2>&1', 'git status 2>&1', 'echo a>b'], m);
  const f = world('feature');
  passes('push', ['git push origin 2>&1', 'git push > push.log'], f);
});

test('a redirection into a shell still counts as input to it', () => {
  const w = world();
  asks('push', ['sh < script-text <<EOF\ngit push origin main\nEOF', 'bash <<< "git push origin main" 2>&1'], w);
});

test('the charter is read from every candidate default branch, and the strictest one wins', () => {
  const w = world();
  commitCharter(w, front('guards: on\n'));
  writeCharter(w, front('guards: off\n'));
  gitIn(w.repo, 'add', 'docs');
  gitIn(w.repo, 'commit', '-q', '-m', 'evil');
  gitIn(w.repo, 'update-ref', 'refs/remotes/origin/evil', 'HEAD');
  gitIn(w.repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/evil');
  assertDecision(push(w), 'ask');
  assertDecision(merge(w), 'ask');
});

test('a candidate branch with no charter, or with guards on, keeps the guards on', () => {
  const w = world();
  gitIn(w.repo, 'commit', '-q', '--allow-empty', '-m', 'base');
  commitCharter(w, front('guards: off\n'));
  pass(push(w));
  gitIn(w.repo, 'update-ref', 'refs/remotes/origin/develop', 'HEAD~1');
  assertDecision(push(w), 'ask');
  gitIn(w.repo, 'update-ref', '-d', 'refs/remotes/origin/develop');
  pass(push(w));
});

test('allow is the intersection over the candidate branches', () => {
  const w = world();
  commitCharter(w, front('allow: [merge, push]\n'));
  gitIn(w.repo, 'update-ref', 'refs/remotes/origin/master', 'HEAD');
  pass(merge(w));
  commitCharter(w, front('allow: [push]\n'));
  assertDecision(merge(w), 'ask');
});

test('agent_type alone counts as a helper call', () => {
  const w = world();
  // Docs: agent_id is set inside a subagent or a teammate. agent_type is set there too, and when the
  // session runs with --agent. Either field means that the caller is not the plain main session.
  assertDecision(push(w, { agent_type: 'coder' }), 'deny');
  assertDecision(run(w, 'merge', hook(w, 'gh pr merge 5', { agent_type: 'coder' })), 'deny');
  pass(run(w, 'push', hook(w, 'git push origin feature', { agent_type: 'coder' })));
});

test('git accepts a unique prefix of a long option, and an ambiguous prefix asks', () => {
  const w = world();
  asks('push', ['git push --forc origin feat', 'git push --force-w origin feat', 'git push --delet origin feat', 'git push --del origin feat', 'git push --mirr', 'git push --pru origin', 'git push --rep=origin main', 'git push --recurse-submodules=check --all', 'git push --a origin feat', 'git push --re origin feat', 'git push --no- origin feat'], w);
  passes('push', ['git push --no-verify origin feat', 'git push --dry-run origin feat', 'git push --follow-tags origin feat', 'git push --set-upstream origin feat', 'git push --tags'], w);
});

test('-4 and -6 are flags, and --help passes', () => {
  const m = world('main');
  asks('push', ['git push -4 origin', 'git push -6 origin'], m);
  passes('push', ['git push --help', 'git push -h'], m);
  passes('merge', ['gh pr merge --help', 'gh pr merge -h'], m);
});

test('--tags pushes only tags, so it passes on main, unless a branch or another option asks', () => {
  const m = world('main');
  passes('push', ['git push --tags', 'git push origin --tags', 'git push --tags origin'], m);
  asks('push', ['git push origin main --tags', 'git push --tags --force', 'git push --tags --delete origin v1', 'git push --tags --mirror', 'git push --tags --all', 'git push --follow-tags', 'git push origin --follow-tags', 'git push --tags --follow-tags'], m);
});
