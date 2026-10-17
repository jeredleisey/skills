// Tests for setup-check.mjs at its command line: arguments and environment in, one line and an exit code out.
// Each external command is replaced through CADRE_NODE_CMD or CADRE_GH_CMD with a small Node fake.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, 'setup-check.mjs');
const dir = mkdtempSync(join(tmpdir(), 'cadre-setup-check-'));
after(() => rmSync(dir, { recursive: true, force: true }));

// A fake command: it writes `out` to stdout and `err` to stderr, then exits with `code`.
let n = 0;
function fake({ out = '', err = '', code = 0 }) {
  const file = join(dir, `fake${n++}.mjs`);
  writeFileSync(file, `process.stdout.write(${JSON.stringify(out)});process.stderr.write(${JSON.stringify(err)});process.exit(${code});`);
  return `"${process.execPath}" "${file}"`;
}

function run(args, env) {
  const e = { ...process.env };
  delete e.CADRE_NODE_CMD;
  delete e.CADRE_GH_CMD;
  const r = spawnSync(process.execPath, [script, ...args], { env: { ...e, ...env }, encoding: 'utf8' });
  return { line: r.stdout.trim(), code: r.status, lines: r.stdout.split('\n').filter(Boolean).length };
}

test('node: Node 22 or later passes', () => {
  const r = run(['node'], { CADRE_NODE_CMD: fake({ out: 'v22.4.1\n' }) });
  assert.deepEqual([r.line, r.code, r.lines], ['ok node v22.4.1', 0, 1]);
});

test('node: Node is missing, so setup stops with an install note', () => {
  const r = run(['node'], { CADRE_NODE_CMD: 'cadre-no-such-command-xyz --version' });
  assert.match(r.line, /^stop: .*install/i);
  assert.match(r.line, /Node/);
  assert.equal(r.code, 1);
  assert.equal(r.lines, 1);
});

test('node: a version below 22 stops with an install note', () => {
  const r = run(['node'], { CADRE_NODE_CMD: fake({ out: 'v18.19.0\n' }) });
  assert.match(r.line, /^stop: .*22/);
  assert.equal(r.code, 1);
});

test('node: output that is not a version is unknown, not a pass', () => {
  const r = run(['node'], { CADRE_NODE_CMD: fake({ out: 'hello\n' }) });
  assert.match(r.line, /^unknown: /);
  assert.equal(r.code, 2);
});

test('gh: success passes', () => {
  const r = run(['gh', 'octo/repo'], { CADRE_GH_CMD: fake({ out: '{"full_name":"octo/repo"}' }) });
  assert.deepEqual([r.line, r.code, r.lines], ['ok gh octo/repo', 0, 1]);
});

test('gh: a 404 stops, names gh auth switch, and says the account can be wrong', () => {
  const r = run(['gh', 'octo/repo'], { CADRE_GH_CMD: fake({ err: 'gh: Not Found (HTTP 404)\n', code: 1 }) });
  assert.match(r.line, /^stop: /);
  assert.match(r.line, /gh auth switch/);
  assert.match(r.line, /wrong account/);
  assert.equal(r.code, 1);
  assert.equal(r.lines, 1);
});

test('gh: a 401 stops and names gh auth switch', () => {
  const r = run(['gh', 'octo/repo'], { CADRE_GH_CMD: fake({ err: 'gh: Bad credentials (HTTP 401)\n', code: 1 }) });
  assert.match(r.line, /^stop: /);
  assert.match(r.line, /gh auth switch/);
  assert.equal(r.code, 1);
});

test('gh: an unknown failure is not a pass', () => {
  const r = run(['gh', 'octo/repo'], { CADRE_GH_CMD: fake({ err: 'gh: Server Error (HTTP 500)\n', code: 1 }) });
  assert.match(r.line, /^unknown: /);
  assert.equal(r.code, 2);
});

test('gh: a 403 is not a pass', () => {
  const r = run(['gh', 'octo/repo'], { CADRE_GH_CMD: fake({ err: 'gh: Forbidden (HTTP 403)\n', code: 1 }) });
  assert.match(r.line, /^unknown: /);
  assert.equal(r.code, 2);
});

test('gh: a missing gh command stops with an install note', () => {
  const r = run(['gh', 'octo/repo'], { CADRE_GH_CMD: 'cadre-no-such-command-xyz' });
  assert.match(r.line, /^stop: .*gh/);
  assert.equal(r.code, 1);
});

test('gh: the command gets the repo path and the host', () => {
  const log = join(dir, 'args.txt');
  const file = join(dir, 'args.mjs');
  writeFileSync(file, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(" ")); process.exit(0);`);
  const r = run(['gh', 'octo/repo', 'ghe.example.com'], { CADRE_GH_CMD: `"${process.execPath}" "${file}"` });
  assert.equal(r.code, 0);
  assert.equal(readFileSync(log, 'utf8'), 'api --hostname ghe.example.com repos/octo/repo');
});

test('gh: a bad repo name is refused before any command runs', () => {
  const marker = join(dir, 'ran');
  const file = join(dir, 'marker.mjs');
  writeFileSync(file, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "x");`);
  const r = run(['gh', 'octo/repo; echo hi'], { CADRE_GH_CMD: `"${process.execPath}" "${file}"` });
  assert.match(r.line, /^unknown: /);
  assert.equal(r.code, 2);
  assert.equal(existsSync(marker), false);
});

test('usage: no check name gives an error on stderr and exit 64', () => {
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(r.status, 64);
  assert.equal(r.stdout, '');
});

test('node: a crash of the version command is unknown, not "not installed"', () => {
  const r = run(['node'], { CADRE_NODE_CMD: fake({ err: 'segmentation fault\n', code: 139 }) });
  assert.match(r.line, /^unknown: /);
  assert.equal(r.code, 2);
});

test('gh: not signed in (no HTTP code) stops and names gh auth', () => {
  const r = run(['gh', 'octo/repo'], { CADRE_GH_CMD: fake({ err: 'To get started with GitHub CLI, please run:  gh auth login\n', code: 4 }) });
  assert.match(r.line, /^stop: .*gh auth switch/);
  assert.equal(r.code, 1);
});

test('gh: a host that starts with a dash is refused', () => {
  const r = run(['gh', 'octo/repo', '-x'], { CADRE_GH_CMD: fake({ out: '{}' }) });
  assert.match(r.line, /^unknown: /);
  assert.equal(r.code, 2);
});

test('gh: a repo name with dot segments is refused', () => {
  const r = run(['gh', 'octo/..'], { CADRE_GH_CMD: fake({ out: '{}' }) });
  assert.match(r.line, /^unknown: /);
  assert.equal(r.code, 2);
});
