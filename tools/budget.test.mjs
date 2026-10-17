import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTree, run } from './fixture.mjs';

const counted = [
  'cadre/skills/orchestrate/SKILL.md',
  'cadre/agents/coder.md',
  'cadre/agents/reviewer.md',
  'cadre/agents/researcher.md',
  'cadre/agents/tester.md',
  'cadre/skills/orchestrate/references/adapter.md',
];

// Each counted file holds `words` words. Other files are not counted.
function tree(words, budget) {
  const files = { 'tools/word-budget.json': JSON.stringify({ budget }), 'cadre/GLOSSARY.md': 'ignored '.repeat(500) };
  for (const f of counted) files[f] = Array(words).fill('w').join(' ') + '\n';
  return files;
}

test('budget: a count at the budget passes', () => {
  const r = run('check-budget.mjs', makeTree(tree(10, 60)));
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, []);
});

test('budget: a count over the budget fails and shows both numbers', () => {
  const r = run('check-budget.mjs', makeTree(tree(10, 59)));
  assert.equal(r.code, 1);
  assert.match(r.lines[0], /60/);
  assert.match(r.lines[0], /59/);
});

test('budget: a missing counted file fails', () => {
  const files = tree(10, 100);
  delete files['cadre/agents/tester.md'];
  const r = run('check-budget.mjs', makeTree(files));
  assert.equal(r.code, 1);
  assert.match(r.lines[0], /tester\.md/);
});

test('budget: a missing budget file fails', () => {
  const files = tree(10, 100);
  delete files['tools/word-budget.json'];
  const r = run('check-budget.mjs', makeTree(files));
  assert.equal(r.code, 1);
});

test('budget: words are counted across line breaks and blank lines', () => {
  const files = tree(0, 5);
  files['cadre/agents/coder.md'] = 'one two\n\nthree\r\nfour   five six\n';
  const r = run('check-budget.mjs', makeTree(files));
  assert.equal(r.code, 1);
  assert.match(r.lines[0], /\b6\b/);
});
