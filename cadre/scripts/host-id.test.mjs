// Tests for host-id.mjs at its command line: environment in, one line and an exit code out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, 'host-id.mjs');

function run(cadreHome) {
  const r = spawnSync(process.execPath, [script], {
    env: { ...process.env, CADRE_HOME: cadreHome },
    encoding: 'utf8',
  });
  return { line: r.stdout.trim(), code: r.status, lines: r.stdout.split('\n').filter(Boolean).length };
}

const tmp = () => mkdtempSync(join(tmpdir(), 'cadre-host-id-'));

test('the first call makes the file and prints 32 hex characters', () => {
  const home = tmp();
  const r = run(home);
  assert.equal(r.code, 0);
  assert.equal(r.lines, 1);
  assert.match(r.line, /^[0-9a-f]{32}$/);
  assert.equal(readFileSync(join(home, 'host-id'), 'utf8').trim(), r.line);
});

test('a second call prints the same id', () => {
  const home = tmp();
  const first = run(home);
  const second = run(home);
  assert.equal(second.code, 0);
  assert.equal(second.line, first.line);
});

test('two folders get two different ids', () => {
  assert.notEqual(run(tmp()).line, run(tmp()).line);
});

test('the file has mode 0600 where the OS supports it', { skip: process.platform === 'win32' }, () => {
  const home = tmp();
  run(home);
  assert.equal(statSync(join(home, 'host-id')).mode & 0o777, 0o600);
});

test('the folder is made when it is missing', () => {
  const home = join(tmp(), 'a', 'b');
  const r = run(home);
  assert.equal(r.code, 0);
  assert.match(r.line, /^[0-9a-f]{32}$/);
});

test('a corrupt file gives unknown and exit 2, and the file stays', () => {
  const home = tmp();
  writeFileSync(join(home, 'host-id'), 'not an id\n');
  const r = run(home);
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
  assert.equal(readFileSync(join(home, 'host-id'), 'utf8'), 'not an id\n');
});

test('a failed write gives unknown and exit 2, with no id on the line', () => {
  const dir = tmp();
  const blocker = join(dir, 'blocker');
  writeFileSync(blocker, 'a file, not a folder');
  const r = run(join(blocker, 'home'));
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
  assert.doesNotMatch(r.line, /[0-9a-f]{32}/);
});

test('the id file is read as it is, with no new id on each call', () => {
  const home = tmp();
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'host-id'), '0123456789abcdef0123456789abcdef\n');
  assert.equal(run(home).line, '0123456789abcdef0123456789abcdef');
});
