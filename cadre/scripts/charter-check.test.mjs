// Tests for charter-check.mjs at its command line: arguments and environment in, one line and an exit code out.
// Each test builds a plugin folder (with the script, its module, and a plugin.json) and a repo folder in a temp folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sources = ['charter-check.mjs', 'charter-front-matter.mjs'];
const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

// A plugin folder at version `version`, and an empty repo folder. Returns both paths.
function setup(version = '0.2.0', { manifest } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'cadre-charter-'));
  made.push(base);
  const plugin = join(base, 'cadre');
  mkdirSync(join(plugin, 'scripts'), { recursive: true });
  mkdirSync(join(plugin, '.claude-plugin'));
  for (const name of sources) copyFileSync(join(import.meta.dirname, name), join(plugin, 'scripts', name));
  writeFileSync(join(plugin, '.claude-plugin', 'plugin.json'), manifest ?? JSON.stringify({ name: 'cadre', version }));
  const repo = join(base, 'repo');
  mkdirSync(repo);
  return { plugin, repo };
}

function charter(repo, text) {
  mkdirSync(join(repo, 'docs', 'agents'), { recursive: true });
  writeFileSync(join(repo, 'docs', 'agents', 'cadre-charter.md'), text);
}

function run({ plugin }, args, env = {}) {
  const e = { ...process.env, ...env };
  if (!('CADRE_SCHEMA' in env)) delete e.CADRE_SCHEMA;
  const r = spawnSync(process.execPath, [join(plugin, 'scripts', 'charter-check.mjs'), ...args], { env: e, encoding: 'utf8' });
  return { line: r.stdout.trim(), code: r.status, lines: r.stdout.split('\n').filter(Boolean).length };
}

const front = (schema, by, extra = '') => `---\ncharter_schema: ${schema}\nwritten_by: cadre ${by}\n${extra}---\n\n# Charter\n`;

test('ok: the schema and the version match', () => {
  const t = setup('0.2.0');
  charter(t.repo, front(1, '0.2.0'));
  const r = run(t, [t.repo]);
  assert.deepEqual([r.line, r.code, r.lines], ['ok', 0, 1]);
});

test('ok: the charter was written by a newer cadre with the same schema', () => {
  const t = setup('0.2.0');
  charter(t.repo, front(1, '0.10.0'));
  assert.equal(run(t, [t.repo]).line, 'ok');
});

test('ok: nested fields, lists, comments, and CRLF line ends do not disturb the check', () => {
  const t = setup('0.2.0');
  const extra = 'nested:\n  kind: x\n  repo: o/r\n# a comment\nlist:\n- one\nflat: none\n';
  charter(t.repo, front(1, '0.2.0', extra).replace(/\n/g, '\r\n'));
  assert.equal(run(t, [t.repo]).line, 'ok');
});

test('missing: the repo has no charter', () => {
  const t = setup();
  const r = run(t, [t.repo]);
  assert.deepEqual([r.line, r.code], ['missing', 1]);
});

test('missing: the repo root is the current folder when no argument is given', () => {
  const t = setup();
  const r = spawnSync(process.execPath, [join(t.plugin, 'scripts', 'charter-check.mjs')], { cwd: t.repo, encoding: 'utf8' });
  assert.equal(r.stdout.trim(), 'missing');
});

test('stale: the charter schema is older than the plugin schema', () => {
  const t = setup('0.2.0');
  charter(t.repo, front(1, '0.1.0'));
  const r = run(t, [t.repo], { CADRE_SCHEMA: '2' });
  assert.deepEqual([r.line, r.code], ['stale 1 2', 1]);
});

test('older-cadre: same schema, older written_by, and the exit code lets orchestrate continue', () => {
  const t = setup('0.2.0');
  charter(t.repo, front(1, '0.1.9'));
  const r = run(t, [t.repo]);
  assert.deepEqual([r.line, r.code], ['older-cadre', 0]);
});

test('older-cadre: versions compare as numbers, not as text', () => {
  const t = setup('0.10.0');
  charter(t.repo, front(1, '0.9.0'));
  assert.equal(run(t, [t.repo]).line, 'older-cadre');
});

test('plugin-too-old: the charter schema is newer than the plugin schema', () => {
  const t = setup('0.2.0');
  charter(t.repo, front(2, '0.3.0'));
  const r = run(t, [t.repo]);
  assert.deepEqual([r.line, r.code], ['plugin-too-old', 1]);
});

const unparseable = {
  'no front matter': '# Charter\n\nNo front matter.\n',
  'front matter not closed': '---\ncharter_schema: 1\nwritten_by: cadre 0.2.0\n',
  'front matter not at the start': '\n\n' + front(1, '0.2.0'),
  'empty file': '',
  'missing charter_schema': '---\nwritten_by: cadre 0.2.0\n---\n',
  'missing written_by': '---\ncharter_schema: 1\n---\n',
  'schema is not an integer': front('one', '0.2.0'),
  'schema is a decimal': front('1.5', '0.2.0'),
  'schema is zero': front(0, '0.2.0'),
  'schema is repeated': front(1, '0.2.0', 'charter_schema: 2\n'),
  'written_by has no version': '---\ncharter_schema: 1\nwritten_by: cadre\n---\n',
  'written_by names another tool': front(1, '0.2.0').replace('cadre 0.2.0', 'other 0.2.0'),
  'a top-level line is not a key': front(1, '0.2.0', 'this is not yaml\n'),
};
for (const [name, text] of Object.entries(unparseable)) {
  test(`unknown, never ok: ${name}`, () => {
    const t = setup('0.2.0');
    charter(t.repo, text);
    const r = run(t, [t.repo]);
    assert.match(r.line, /^unknown: .+/);
    assert.equal(r.code, 2);
    assert.equal(r.lines, 1);
  });
}

test('unknown: the charter path is a folder', () => {
  const t = setup();
  mkdirSync(join(t.repo, 'docs', 'agents', 'cadre-charter.md'), { recursive: true });
  assert.match(run(t, [t.repo]).line, /^unknown: /);
});

test('unknown: the plugin version cannot be read', () => {
  const t = setup('0.2.0', { manifest: '{ not json' });
  charter(t.repo, front(1, '0.2.0'));
  const r = run(t, [t.repo]);
  assert.match(r.line, /^unknown: /);
  assert.equal(r.code, 2);
});

test('unknown: the plugin version is not a version', () => {
  const t = setup('latest');
  charter(t.repo, front(1, '0.2.0'));
  assert.match(run(t, [t.repo]).line, /^unknown: /);
});

test('unknown: the repo root does not exist', () => {
  const t = setup();
  assert.match(run(t, [join(t.repo, 'nope')]).line, /^unknown: /);
});

test('unknown: the schema override is not a positive integer', () => {
  const t = setup();
  charter(t.repo, front(1, '0.2.0'));
  assert.match(run(t, [t.repo], { CADRE_SCHEMA: 'x' }).line, /^unknown: /);
});

test('--schema prints the plugin schema and nothing else', () => {
  const t = setup();
  const r = run(t, ['--schema']);
  assert.deepEqual([r.line, r.code, r.lines], ['1', 0, 1]);
  assert.equal(run(t, ['--schema'], { CADRE_SCHEMA: '3' }).line, '3');
});

test('ok: a byte order mark before the front matter is skipped', () => {
  const t = setup('0.2.0');
  charter(t.repo, '\uFEFF' + front(1, '0.2.0'));
  assert.equal(run(t, [t.repo]).line, 'ok');
});

test('ok: quoted values are read', () => {
  const t = setup('0.2.0');
  charter(t.repo, '---\ncharter_schema: "1"\nwritten_by: \'cadre 0.2.0\'\n---\n');
  assert.equal(run(t, [t.repo]).line, 'ok');
});

test('unknown, never ok: written_by is repeated', () => {
  const t = setup('0.2.0');
  charter(t.repo, front(1, '0.2.0', 'written_by: cadre 0.1.0\n'));
  const r = run(t, [t.repo]);
  assert.match(r.line, /^unknown: /);
  assert.equal(r.code, 2);
});

test('ok: a Windows-style path argument works', { skip: process.platform !== 'win32' }, () => {
  const t = setup('0.2.0');
  charter(t.repo, front(1, '0.2.0'));
  assert.equal(run(t, [t.repo.replace(/\//g, '\\')]).line, 'ok');
});
