// Tests for preset-discover.mjs at its command line: environment in, one line
// and an exit code out. The list command is replaced through CADRE_PLUGIN_LIST_CMD.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, 'preset-discover.mjs');
const dir = mkdtempSync(join(tmpdir(), 'cadre-preset-'));
let n = 0;
after(() => rmSync(dir, { recursive: true, force: true }));

// A shell command that runs a small Node program.
function nodeCmd(source) {
  const file = join(dir, `cmd${n++}.mjs`);
  writeFileSync(file, source);
  return `"${process.execPath}" "${file}"`;
}
const prints = (text) => nodeCmd(`process.stdout.write(${JSON.stringify(text)});`);
const listing = (entries) => prints(JSON.stringify(entries));

// A plugin folder. `file` is the text of cadre-presets.json, or null for no file.
function plugin(id, file, extra = {}) {
  const installPath = join(dir, `plugin${n++}`);
  mkdirSync(installPath);
  if (file !== null) {
    writeFileSync(join(installPath, 'cadre-presets.json'), typeof file === 'string' ? file : JSON.stringify(file));
  }
  return { id, version: '1.0.0', scope: 'user', enabled: true, installPath, ...extra };
}
const preset = (answers = {}, defaults = {}) => ({ preset_schema: 1, answers, defaults });

function run(cmd, args = []) {
  const env = { ...process.env, CADRE_PLUGIN_LIST_CMD: cmd };
  const r = spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8' });
  return { line: r.stdout.trim(), err: r.stderr.trim(), code: r.status };
}

test('no plugin gives count 0', () => {
  const r = run(listing([]));
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.line), { count: 0, presets: [] });
});

test('a plugin with no preset file gives count 0', () => {
  const r = run(listing([plugin('plain@acme', null)]));
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.line).count, 0);
});

test('one preset plugin gives count 1 with its id, answers, and defaults', () => {
  const p = plugin('acme-preset@example-org', preset({ tracker: 'ghe' }, { skill_pack: 'superpowers' }));
  const r = run(listing([plugin('plain@acme', null), p]));
  assert.equal(r.code, 0);
  assert.equal(r.line.split('\n').length, 1);
  assert.deepEqual(JSON.parse(r.line), {
    count: 1,
    presets: [{
      plugin: 'acme-preset@example-org',
      answers: { tracker: 'ghe' },
      defaults: { skill_pack: 'superpowers' },
      notes: {},
    }],
  });
});

test('two preset plugins give count 2 with both ids and answers', () => {
  const a = plugin('one@example-org', preset({ tracker: 'ghe' }));
  const b = plugin('two@example-org', preset({ tracker: 'ado' }));
  const r = run(listing([a, b]));
  assert.equal(r.code, 0);
  const out = JSON.parse(r.line);
  assert.equal(out.count, 2);
  assert.deepEqual(out.presets.map((p) => [p.plugin, p.answers.tracker]), [['one@example-org', 'ghe'], ['two@example-org', 'ado']]);
});

test('notes pass through', () => {
  const p = plugin('n@example-org', { ...preset({ tracker: 'ghe' }), notes: { tracker: 'Use the org tracker.' } });
  const out = JSON.parse(run(listing([p])).line);
  assert.deepEqual(out.presets[0].notes, { tracker: 'Use the org tracker.' });
});

test('a file with CRLF line ends and a BOM is read', () => {
  const text = '\uFEFF{\r\n  "preset_schema": 1,\r\n  "answers": {"tracker": "ghe"}\r\n}\r\n';
  const r = run(listing([plugin('crlf@example-org', text)]));
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.line).presets[0].answers, { tracker: 'ghe' });
});

test('a disabled plugin with a file is skipped', () => {
  const p = plugin('off@example-org', preset({ tracker: 'ghe' }), { enabled: false });
  const r = run(listing([p]));
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.line).count, 0);
});

test('a plugin with no installPath is skipped', () => {
  const r = run(listing([{ id: 'ghost@example-org', enabled: true }]));
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.line).count, 0);
});

test('a plugin whose folder is gone is skipped', () => {
  const p = plugin('gone@example-org', null, { installPath: join(dir, 'does-not-exist') });
  const r = run(listing([p]));
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.line).count, 0);
});

test('one plugin listed in two scopes counts once', () => {
  const p = plugin('dup@example-org', preset({ tracker: 'ghe' }));
  const r = run(listing([p, { ...p, scope: 'project' }]));
  assert.equal(JSON.parse(r.line).count, 1);
});

test('a failed list command gives unknown and exit 2', () => {
  const r = run(nodeCmd('process.exit(3);'));
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
});

test('a list command that prints nothing gives unknown', () => {
  const r = run(prints(''));
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
});

test('unparseable list output gives unknown', () => {
  const r = run(prints('not json'));
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
});

test('list output that is not an array gives unknown', () => {
  const r = run(prints('{"plugins": []}'));
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
});

test('a preset file that is not JSON gives unknown with the plugin id', () => {
  const r = run(listing([plugin('bad@example-org', '{ nope')]));
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: bad@example-org: /);
});

test('a preset file of the wrong shape gives unknown with the plugin id', () => {
  for (const file of [[], { preset_schema: 1, answers: [] }, { preset_schema: 1, defaults: 'x' }, { preset_schema: 1, notes: { a: 1 } }]) {
    const r = run(listing([plugin('shape@example-org', file)]));
    assert.equal(r.code, 2, JSON.stringify(file));
    assert.match(r.line, /^unknown: shape@example-org: /);
  }
});

test('an unknown preset_schema gives unknown with the plugin id', () => {
  for (const schema of [2, '1', undefined]) {
    const r = run(listing([plugin('new@example-org', { preset_schema: schema, answers: {} })]));
    assert.equal(r.code, 2);
    assert.match(r.line, /^unknown: new@example-org: .*schema/);
  }
});

test('one bad file stops the run even when another preset is good', () => {
  const good = plugin('good@example-org', preset({ tracker: 'ghe' }));
  const bad = plugin('bad@example-org', '{ nope');
  const r = run(listing([good, bad]));
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: bad@example-org: /);
});

test('an unreadable preset path gives unknown, not a skip', () => {
  const p = plugin('dir@example-org', null);
  mkdirSync(join(p.installPath, 'cadre-presets.json'));
  const r = run(listing([p]));
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: dir@example-org: /);
});

test('a preset file with a plugin that has no id gives unknown', () => {
  const p = plugin('x@example-org', preset());
  delete p.id;
  const r = run(listing([p]));
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
});

test('a null value in answers, defaults, or notes gives unknown with the plugin id', () => {
  for (const part of ['answers', 'defaults', 'notes']) {
    const r = run(listing([plugin('null@example-org', { preset_schema: 1, [part]: { tracker: null } })]));
    assert.equal(r.code, 2, part);
    assert.match(r.line, /^unknown: null@example-org: /);
  }
});

test('a project-scope entry for another repo is skipped', () => {
  const other = join(dir, 'other-repo');
  const here = join(dir, 'this-repo');
  mkdirSync(other);
  mkdirSync(here);
  const p = plugin('proj@example-org', preset({ tracker: 'ghe' }), { scope: 'project', projectPath: other });
  const r = run(listing([p]), [here]);
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.line).count, 0);
});

test('a project-scope entry for this repo counts', () => {
  const here = join(dir, 'this-repo');
  mkdirSync(here, { recursive: true });
  const p = plugin('proj@example-org', preset({ tracker: 'ghe' }), { scope: 'project', projectPath: here });
  assert.equal(JSON.parse(run(listing([p]), [here]).line).count, 1);
});

test('the repo root defaults to the current folder', () => {
  const here = join(dir, 'cwd-repo');
  mkdirSync(here, { recursive: true });
  const p = plugin('proj@example-org', preset(), { scope: 'project', projectPath: here });
  const env = { ...process.env, CADRE_PLUGIN_LIST_CMD: listing([p]) };
  const r = spawnSync(process.execPath, [script], { env, cwd: here, encoding: 'utf8' });
  assert.equal(JSON.parse(r.stdout).count, 1);
});

test('a user-scope entry counts in any repo', () => {
  const here = join(dir, 'any-repo');
  mkdirSync(here, { recursive: true });
  const p = plugin('user@example-org', preset());
  assert.equal(JSON.parse(run(listing([p]), [here]).line).count, 1);
});

test('one id with several entries keeps the first that applies here', () => {
  const other = join(dir, 'other-repo');
  const here = join(dir, 'this-repo');
  mkdirSync(other, { recursive: true });
  mkdirSync(here, { recursive: true });
  const a = plugin('multi@example-org', preset({ tracker: 'other' }), { scope: 'project', projectPath: other });
  const b = plugin('multi@example-org', preset({ tracker: 'here' }));
  const out = JSON.parse(run(listing([a, b]), [here]).line);
  assert.equal(out.count, 1);
  assert.equal(out.presets[0].answers.tracker, 'here');
});

test('an answers value of null gives unknown with the plugin id', () => {
  const r = run(listing([plugin('nul@example-org', { preset_schema: 1, answers: null })]));
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: nul@example-org: /);
});

test('an installPath that is a file, not a folder, is skipped', () => {
  const file = join(dir, `afile${n++}`);
  writeFileSync(file, 'x');
  const r = run(listing([{ id: 'file@example-org', enabled: true, installPath: file }]));
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.line).count, 0);
});

test('a second scope with an unreadable file does not spoil a good entry', () => {
  const good = plugin('twice@example-org', preset({ tracker: 'ghe' }));
  const bad = plugin('twice@example-org', null, { scope: 'project' });
  mkdirSync(join(bad.installPath, 'cadre-presets.json'));
  const r = run(listing([good, bad]));
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.line).count, 1);
});
