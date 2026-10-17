import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTree, run, goodTree } from './fixture.mjs';

// A denied word is built at run time, so that no source file holds it.
const word = (...codes) => String.fromCharCode(...codes);
const wordA = word(104, 101, 114, 109, 101, 115);
const hyphenPair = word(115, 109, 45, 101, 110, 101, 114, 103, 121); // two tokens, one hit when joined
const camelPair = word(83, 77, 69, 110, 101, 114, 103, 121);
const wordB = word(116, 111, 114, 105);

test('deny: a clean tree passes with no output', () => {
  const r = run('check-deny.mjs', makeTree(goodTree()));
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, []);
});

test('deny: a file with a denied word fails, names file and line, and does not print the word', () => {
  const r = run('check-deny.mjs', makeTree(goodTree({ 'docs/x.md': `fine\nuses ${wordA} here\n` })));
  assert.equal(r.code, 1);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /^docs\/x\.md:2: /);
  assert.ok(!r.lines[0].toLowerCase().includes(wordA));
});

test('deny: case does not matter', () => {
  const r = run('check-deny.mjs', makeTree(goodTree({ 'a.txt': wordA.toUpperCase() })));
  assert.equal(r.code, 1);
});

test('deny: a word with a hyphen or in camel case hits the joined token', () => {
  assert.equal(run('check-deny.mjs', makeTree(goodTree({ 'a.txt': `x ${hyphenPair} y` }))).code, 1);
  assert.equal(run('check-deny.mjs', makeTree(goodTree({ 'a.txt': `x ${camelPair} y` }))).code, 1);
});

test('deny: a whole token only, so a longer word that holds a denied one passes', () => {
  const r = run('check-deny.mjs', makeTree(goodTree({ 'a.txt': 'history editorial factory' })));
  assert.equal(r.code, 0);
  assert.equal(run('check-deny.mjs', makeTree(goodTree({ 'a.txt': `a ${wordB} b` }))).code, 1);
});

test('deny: a denied word in a file name fails', () => {
  const r = run('check-deny.mjs', makeTree(goodTree({ [`notes-${wordA}.txt`]: 'ok\n' })));
  assert.equal(r.code, 1);
});

test('deny: the .git folder is not scanned', () => {
  const r = run('check-deny.mjs', makeTree(goodTree({ '.git/config': wordA })));
  assert.equal(r.code, 0);
});

test('deny: a home path fails, on each system', () => {
  for (const p of ['/Users/' + 'bob/code', '/home/' + 'bob/code', 'C:' + '\\Users\\' + 'bob']) {
    const r = run('check-deny.mjs', makeTree(goodTree({ 'a.txt': `see ${p}\n` })));
    assert.equal(r.code, 1, p);
  }
});

test('deny: an email address fails, except the two noreply forms', () => {
  const at = '@';
  const bad = run('check-deny.mjs', makeTree(goodTree({ 'a.txt': `mail bob${at}example.com\n` })));
  assert.equal(bad.code, 1);
  const ok = `1+bob${at}users.noreply.github.com and noreply${at}anthropic.com\n`;
  assert.equal(run('check-deny.mjs', makeTree(goodTree({ 'a.txt': ok }))).code, 0);
});

test('deny: the owner name and the author name are allowed', () => {
  const r = run('check-deny.mjs', makeTree(goodTree({ 'a.txt': 'Jered Leisey, github.com/jeredleisey/skills\n' })));
  assert.equal(r.code, 0);
});
