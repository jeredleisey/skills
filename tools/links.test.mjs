import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTree, run, goodTree } from './fixture.mjs';

test('links: a tree with good links passes', () => {
  const r = run('check-links.mjs', makeTree(goodTree()));
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, []);
});

test('links: a broken relative link fails and names file and target', () => {
  const r = run('check-links.mjs', makeTree(goodTree({ 'README.md': 'See [x](docs/gone.md).\n' })));
  assert.equal(r.code, 1);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /^README\.md:1: .*docs\/gone\.md/);
});

test('links: a link with a fragment resolves by its file', () => {
  const r = run('check-links.mjs', makeTree(goodTree({ 'README.md': '[x](docs/guide.md#part)\n' })));
  assert.equal(r.code, 0);
});

test('links: a link in a nested folder resolves from that folder', () => {
  const files = goodTree({ 'docs/a.md': '[up](../README.md) [peer](guide.md) [bad](../nope.md)\n' });
  const r = run('check-links.mjs', makeTree(files));
  assert.equal(r.code, 1);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /nope\.md/);
});

test('links: web links, mail links, and page anchors are not checked', () => {
  const text = '[a](https://example.com/x) [b](mailto:a@b.c) [c](#top)\n';
  const r = run('check-links.mjs', makeTree(goodTree({ 'README.md': text })));
  assert.equal(r.code, 0);
});

test('links: an @import that points to a missing file fails', () => {
  const r = run('check-links.mjs', makeTree(goodTree({ 'CLAUDE.md': '@AGENTS.md\n' })));
  assert.equal(r.code, 1);
  assert.match(r.lines[0], /^CLAUDE\.md:1: .*AGENTS\.md/);
});

test('links: an @import that points to an existing file passes', () => {
  const r = run('check-links.mjs', makeTree(goodTree({ 'CLAUDE.md': '@AGENTS.md\n', 'AGENTS.md': '# a\n' })));
  assert.equal(r.code, 0);
});

test('links: a link inside a code block is not checked', () => {
  const text = '```\n[x](nowhere.md)\n```\nand `[y](nowhere.md)` too\n';
  const r = run('check-links.mjs', makeTree(goodTree({ 'README.md': text })));
  assert.equal(r.code, 0);
});

test('links: a link to a folder that exists passes', () => {
  const r = run('check-links.mjs', makeTree(goodTree({ 'README.md': '[d](docs/)\n' })));
  assert.equal(r.code, 0);
});
