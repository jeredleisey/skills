// Tests for teams-setting.mjs at its command line: arguments and environment in, a file, one line, and an exit code out.
// Every test uses a temporary folder. CLAUDE_CONFIG_DIR points the user scope at one.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, 'teams-setting.mjs');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'cadre-teams-setting-')));
after(() => rmSync(base, { recursive: true, force: true }));

let n = 0;
function sandbox() {
  const root = join(base, `case${n++}`);
  const repo = join(root, 'repo');
  const config = join(root, 'config');
  mkdirSync(repo, { recursive: true });
  mkdirSync(config, { recursive: true });
  return { repo, config };
}

function run(args, config, cwd) {
  const r = spawnSync(process.execPath, [script, ...args], { env: { ...process.env, CLAUDE_CONFIG_DIR: config }, cwd, encoding: 'utf8' });
  return { line: r.stdout.trim(), err: r.stderr.trim(), code: r.status };
}

const KEY = 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS';
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

test('local is the default scope and writes .claude/settings.local.json, creating the folder and file', () => {
  const { repo, config } = sandbox();
  const file = join(repo, '.claude', 'settings.local.json');
  for (const args of [[], ['local'], ['local', repo]]) {
    rmSync(join(repo, '.claude'), { recursive: true, force: true });
    const r = run(args, config, repo);
    assert.deepEqual([r.code, r.line], [0, file], args.join(' '));
    assert.deepEqual(read(file), { env: { [KEY]: '1' } });
  }
});

test('project writes .claude/settings.json of the repo root', () => {
  const { repo, config } = sandbox();
  const file = join(repo, '.claude', 'settings.json');
  const r = run(['project', repo], config, base);
  assert.deepEqual([r.code, r.line], [0, file]);
  assert.deepEqual(read(file), { env: { [KEY]: '1' } });
  assert.equal(existsSync(join(repo, '.claude', 'settings.local.json')), false);
});

test('user writes settings.json in CLAUDE_CONFIG_DIR', () => {
  const { repo, config } = sandbox();
  const file = join(config, 'settings.json');
  const r = run(['user', repo], config, repo);
  assert.deepEqual([r.code, r.line], [0, file]);
  assert.deepEqual(read(file), { env: { [KEY]: '1' } });
  assert.equal(existsSync(join(repo, '.claude')), false);
});

test('every other key stays, in the env object and outside it', () => {
  const { repo, config } = sandbox();
  const file = join(config, 'settings.json');
  writeFileSync(file, JSON.stringify({ model: 'x', permissions: { allow: ['Bash(ls)'] }, env: { OTHER: 'a', [KEY]: '0' } }));
  assert.equal(run(['user'], config, repo).code, 0);
  assert.deepEqual(read(file), { model: 'x', permissions: { allow: ['Bash(ls)'] }, env: { OTHER: 'a', [KEY]: '1' } });
});

test('a second run changes nothing', () => {
  const { repo, config } = sandbox();
  const file = join(repo, '.claude', 'settings.local.json');
  run(['local', repo], config, base);
  const first = readFileSync(file, 'utf8');
  const r = run(['local', repo], config, base);
  assert.deepEqual([r.code, r.line], [0, file]);
  assert.equal(readFileSync(file, 'utf8'), first);
});

test('a file that is not valid JSON is refused and not changed', () => {
  const { repo, config } = sandbox();
  mkdirSync(join(repo, '.claude'));
  const file = join(repo, '.claude', 'settings.local.json');
  writeFileSync(file, '{ "env": ');
  const r = run(['local', repo], config, base);
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: .+/);
  assert.equal(r.line.split('\n').length, 1);
  assert.equal(readFileSync(file, 'utf8'), '{ "env": ');
});

test('a file that is JSON but not an object, or has a bad env, is refused and not changed', () => {
  for (const text of ['[]', 'null', '{"env": []}', '{"env": "x"}']) {
    const { repo, config } = sandbox();
    mkdirSync(join(repo, '.claude'));
    const file = join(repo, '.claude', 'settings.local.json');
    writeFileSync(file, text);
    const r = run(['local', repo], config, base);
    assert.deepEqual([r.code, /^unknown: /.test(r.line)], [2, true], text);
    assert.equal(readFileSync(file, 'utf8'), text);
  }
});

test('an unknown scope is refused and writes nothing', () => {
  const { repo, config } = sandbox();
  const r = run(['global', repo], config, base);
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
  assert.equal(existsSync(join(repo, '.claude')), false);
});
