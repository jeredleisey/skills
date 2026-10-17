import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTree, run } from './fixture.mjs';

const rules = '## Rules\n\n- **No ledger.** Never push.\n- **Final message.** Use the brief.\n';
const card = (name, extra = '', block = rules) =>
  `---\nname: ${name}\nmodel: sonnet\n${extra}---\n\n# ${name}\n\n## Steps\n\n1. Do it.\n\n${block}`;

function cards(over = {}) {
  const files = {};
  for (const n of ['coder', 'reviewer', 'researcher', 'tester']) files[`cadre/agents/${n}.md`] = card(n);
  return { ...files, ...over };
}

test('cards: four cards with the same rules block pass', () => {
  const r = run('check-cards.mjs', makeTree(cards()));
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, []);
});

test('cards: a rules block that differs fails and names the card', () => {
  const r = run('check-cards.mjs', makeTree(cards({ 'cadre/agents/tester.md': card('tester', '', rules + '- **Extra.** More.\n') })));
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /tester/);
});

test('cards: a difference in line endings only passes', () => {
  const r = run('check-cards.mjs', makeTree(cards({ 'cadre/agents/coder.md': card('coder').replace(/\n/g, '\r\n') })));
  assert.equal(r.code, 0);
});

test('cards: a skills field fails and names the card', () => {
  const r = run('check-cards.mjs', makeTree(cards({ 'cadre/agents/coder.md': card('coder', 'skills:\n  - a:b\n') })));
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /coder.*skills/);
});

test('cards: a skills line in the body is not a front matter field', () => {
  const r = run('check-cards.mjs', makeTree(cards({ 'cadre/agents/coder.md': card('coder', '', rules + '\nskills: none here\n') })));
  assert.equal(r.code, 1); // the rules block differs from the others
  assert.doesNotMatch(r.lines.join('\n'), /skills field/);
});

test('cards: a card with no rules block fails', () => {
  const r = run('check-cards.mjs', makeTree(cards({ 'cadre/agents/reviewer.md': '---\nname: reviewer\n---\n\n# R\n' })));
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /reviewer.*Rules/);
});

test('cards: a missing card fails', () => {
  const files = cards();
  delete files['cadre/agents/researcher.md'];
  const r = run('check-cards.mjs', makeTree(files));
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /researcher/);
});
