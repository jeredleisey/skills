import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// A grader matches its input_match against the JSON text of the tool input. In that text a line
// break is the two characters \n, so \bgit never matches a git command at the start of a line.
// These tests read the real graders and run their patterns on real command shapes.

const evals = join(import.meta.dirname, '..', 'cadre', 'evals');

// Each input_match of each grader file, as { file, pattern }. The pattern is single-quoted YAML.
function patterns() {
  const out = [];
  for (const c of readdirSync(evals, { withFileTypes: true })) {
    if (!c.isDirectory()) continue;
    let files;
    try { files = readdirSync(join(evals, c.name, 'graders')); } catch { continue; }
    for (const f of files.filter((x) => x.endsWith('.md'))) {
      const text = readFileSync(join(evals, c.name, 'graders', f), 'utf8');
      for (const m of text.matchAll(/input_match: '((?:[^']|'')*)'/g)) {
        out.push({ file: `${c.name}/${f}`, pattern: m[1].replace(/''/g, "'") });
      }
    }
  }
  return out;
}

// The last input_match of a file: for a tool_order grader, that is the one of `after`.
const find = (file) => {
  const p = patterns().filter((x) => x.file === file).at(-1);
  assert.ok(p, `no input_match in ${file}`);
  return new RegExp(p.pattern);
};
const bash = (command) => JSON.stringify({ command, description: 'x' });
const heredoc = (last) => `cat > $TMPDIR/l.txt <<EOF\n| a | b |\nEOF\nset -euo pipefail\n${last}`;

test('graders: every input_match is a valid regex', () => {
  for (const p of patterns()) assert.doesNotThrow(() => new RegExp(p.pattern), p.file);
});

test('graders: no input_match starts a command word with \\b, which misses the start of a line', () => {
  for (const p of patterns()) assert.doesNotMatch(p.pattern, /\\b(?:git|gh|az)\b/, p.file);
});

const merge = [
  'bad-ledger-row-refuses/no-merge-command.md',
  'ticket-no-merge/no-merge-command.md',
  'merge-waits-for-reviewer/reviewer-before-merge.md',
];

for (const file of merge) {
  test(`graders: ${file} finds a merge on its own line, and after git -c`, () => {
    const re = find(file);
    assert.match(bash('git merge --no-ff feature -m "m"'), re);
    assert.match(bash(heredoc('git merge --no-ff feature -m "m"')), re);
    assert.match(bash('git -c core.editor=true merge --no-ff feature'), re);
    assert.match(bash('git -C /x/cwd merge feature'), re);
    assert.match(bash(heredoc('gh pr merge 3 --merge')), re);
  });

  test(`graders: ${file} ignores git merge-base and a word that ends in git`, () => {
    const re = find(file);
    assert.doesNotMatch(bash('git merge-base main feature'), re);
    assert.doesNotMatch(bash('node grant-check-local.mjs demo s "merge pull request"'), re);
    assert.doesNotMatch(bash('legit merge feature'), re);
  });
}

test('graders: the coder no-merge and no-push find a command on its own line', () => {
  assert.match(bash(heredoc('git merge feature')), find('coder-refuses-push-and-merge/no-merge.md'));
  assert.match(bash(heredoc('git push origin main')), find('coder-refuses-push-and-merge/no-push.md'));
  assert.match(bash(heredoc('git push origin main')), find('ticket-no-merge/no-push-of-default-branch.md'));
});

for (const c of ['no-charter-refuses', 'stale-charter-refuses', 'ticket-no-charter-refuses']) {
  test(`graders: ${c} no-proceeding-commands finds git commit and gh on their own line`, () => {
    const re = find(`${c}/no-proceeding-commands.md`);
    assert.match(bash(heredoc('git commit -m x')), re);
    assert.match(bash(heredoc('gh issue list')), re);
    assert.doesNotMatch(bash('git status && git log -1'), re);
  });
}
