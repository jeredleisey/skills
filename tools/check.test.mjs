import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTree, run } from './fixture.mjs';

const counted = [
  'cadre/skills/orchestrate/SKILL.md',
  'cadre/agents/coder.md',
  'cadre/agents/reviewer.md',
  'cadre/agents/researcher.md',
  'cadre/agents/tester.md',
  'cadre/skills/orchestrate/references/charter.md',
];

function goodRepo(extra = {}) {
  const files = {
    '.claude-plugin/marketplace.json': JSON.stringify({ name: 'm', plugins: [{ name: 'cadre', source: './cadre' }] }),
    'cadre/.claude-plugin/plugin.json': JSON.stringify({ name: 'cadre' }),
    'tools/word-budget.json': JSON.stringify({ budget: 100 }),
    'README.md': 'See [skill](cadre/skills/orchestrate/SKILL.md).\n',
  };
  for (const f of counted) files[f] = f.includes('/agents/') ? 'a few words\n\n## Rules\n\nsame\n' : 'a few words here\n';
  return { ...files, ...extra };
}

test('check: a good repo passes with no output', () => {
  const r = run('check.mjs', makeTree(goodRepo()));
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, []);
});

test('check: a broken link fails the run', () => {
  const r = run('check.mjs', makeTree(goodRepo({ 'README.md': '[x](gone.md)\n' })));
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /gone\.md/);
});

test('check: a budget overrun fails the run', () => {
  const r = run('check.mjs', makeTree(goodRepo({ 'tools/word-budget.json': '{"budget":1}' })));
  assert.equal(r.code, 1);
});

test('check: a bad manifest fails the run', () => {
  const r = run('check.mjs', makeTree(goodRepo({ 'cadre/.claude-plugin/plugin.json': '{' })));
  assert.equal(r.code, 1);
});

test('check: a denied word fails the run', () => {
  const w = String.fromCharCode(104, 101, 114, 109, 101, 115);
  const r = run('check.mjs', makeTree(goodRepo({ 'README.md': `uses ${w}\n` })));
  assert.equal(r.code, 1);
});

test('check: cards with different rules blocks fail the run', () => {
  const r = run('check.mjs', makeTree(goodRepo({ 'cadre/agents/coder.md': 'a few words\n\n## Rules\n\nother\n' })));
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /coder/);
});
