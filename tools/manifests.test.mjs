import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTree, run, goodTree } from './fixture.mjs';

test('manifests: a good tree passes with no output', () => {
  const r = run('check-manifests.mjs', makeTree(goodTree()));
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, []);
});

test('manifests: invalid JSON fails and names the file', () => {
  const r = run('check-manifests.mjs', makeTree(goodTree({ 'p/.claude-plugin/plugin.json': '{ nope' })));
  assert.equal(r.code, 1);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /^p\/\.claude-plugin\/plugin\.json: /);
});

test('manifests: a manifest with no name fails', () => {
  const r = run('check-manifests.mjs', makeTree(goodTree({ 'p/.claude-plugin/plugin.json': '{}' })));
  assert.equal(r.code, 1);
  assert.match(r.lines[0], /name/);
});

test('manifests: a plugin source folder that does not exist fails', () => {
  const bad = JSON.stringify({ name: 'm', plugins: [{ name: 'q', source: './missing' }] });
  const r = run('check-manifests.mjs', makeTree(goodTree({ '.claude-plugin/marketplace.json': bad })));
  assert.equal(r.code, 1);
  assert.match(r.lines[0], /missing/);
});

test('manifests: a marketplace with an empty plugin list fails', () => {
  const bad = JSON.stringify({ name: 'm', plugins: [] });
  const r = run('check-manifests.mjs', makeTree(goodTree({ '.claude-plugin/marketplace.json': bad })));
  assert.equal(r.code, 1);
});

test('manifests: a tree with no manifest fails', () => {
  const r = run('check-manifests.mjs', makeTree({ 'README.md': '# x\n' }));
  assert.equal(r.code, 1);
});

test('manifests: a plugin entry with no source fails', () => {
  const bad = JSON.stringify({ name: 'm', plugins: [{ name: 'q' }] });
  const r = run('check-manifests.mjs', makeTree(goodTree({ '.claude-plugin/marketplace.json': bad })));
  assert.equal(r.code, 1);
  assert.match(r.lines[0], /source/);
});
