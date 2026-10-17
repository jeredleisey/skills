// Tests for holder-check.mjs at its command line: arguments and environment in,
// one line and an exit code out. The two external commands are replaced through
// CLAUDE_AGENTS_JSON_CMD and CADRE_PROCESS_CMD, except in the two tests that
// use a real process.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, 'holder-check.mjs');
const dir = mkdtempSync(join(tmpdir(), 'cadre-holder-'));
const ID = '11111111-2222-3333-4444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
let n = 0;
after(() => rmSync(dir, { recursive: true, force: true }));

// A shell command that runs a small Node program.
function nodeCmd(source) {
  const file = join(dir, `cmd${n++}.mjs`);
  writeFileSync(file, source);
  return `"${process.execPath}" "${file}"`;
}
const prints = (text) => nodeCmd(`process.stdout.write(${JSON.stringify(text)});`);
const agents = (list) => prints(JSON.stringify(list));
const session = (pid, extra = {}) => ({
  pid, sessionId: ID, name: 'lead', cwd: '/work/repo', kind: 'interactive', status: 'idle', ...extra,
});

function run(args, env = {}) {
  const base = { ...process.env };
  delete base.CLAUDE_PID;
  delete base.CLAUDE_AGENTS_JSON_CMD;
  delete base.CADRE_PROCESS_CMD;
  const r = spawnSync(process.execPath, [script, ...args], { env: { ...base, ...env }, encoding: 'utf8' });
  return { line: r.stdout.trim(), err: r.stderr.trim(), code: r.status };
}

test('no argument gives a usage line and exit 64', () => {
  const r = run([]);
  assert.equal(r.code, 64);
  assert.match(r.err, /^usage: /);
});

test('two arguments give exit 64', () => {
  assert.equal(run([ID, ID]).code, 64);
});

test('a session name in place of an id gives unknown', () => {
  const r = run(['lead'], { CLAUDE_AGENTS_JSON_CMD: agents([]) });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: not a session id/);
});

test('a session that no entry lists is free', () => {
  const r = run([ID], { CLAUDE_AGENTS_JSON_CMD: agents([session(1, { sessionId: OTHER })]) });
  assert.deepEqual([r.line, r.code], ['free', 1]);
});

test('an empty list is free', () => {
  const r = run([ID], { CLAUDE_AGENTS_JSON_CMD: agents([]) });
  assert.deepEqual([r.line, r.code], ['free', 1]);
});

test('a failing claude agents gives unknown', () => {
  const r = run([ID], { CLAUDE_AGENTS_JSON_CMD: nodeCmd('process.exit(1);') });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: the command failed/);
});

test('no output from claude agents gives unknown', () => {
  const r = run([ID], { CLAUDE_AGENTS_JSON_CMD: prints('') });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
});

test('output that is not a JSON array gives unknown', () => {
  for (const text of ['not json', '{"sessionId":"x"}', '[1]']) {
    const r = run([ID], { CLAUDE_AGENTS_JSON_CMD: prints(text) });
    assert.equal(r.code, 2, text);
    assert.match(r.line, /^unknown: /, text);
  }
});

test('an entry with no pid gives unknown, not free', () => {
  const r = run([ID], { CLAUDE_AGENTS_JSON_CMD: agents([session(undefined)]) });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: no pid/);
});

test('a listed pid whose process is dead gives free', () => {
  const r = run([ID], {
    CLAUDE_AGENTS_JSON_CMD: agents([session(4242)]),
    CADRE_PROCESS_CMD: prints('dead'),
  });
  assert.deepEqual([r.line, r.code], ['free', 1]);
});

test('a live Claude process gives held with the fields of the entry', () => {
  const r = run([ID], {
    CLAUDE_AGENTS_JSON_CMD: agents([session(4242)]),
    CADRE_PROCESS_CMD: prints('alive claude'),
  });
  assert.deepEqual([r.line, r.code], ['held pid=4242 name=lead cwd=/work/repo status=idle', 0]);
});

test('the process command gets the pid in CADRE_PID', () => {
  const r = run([ID], {
    CLAUDE_AGENTS_JSON_CMD: agents([session(4242)]),
    CADRE_PROCESS_CMD: nodeCmd('process.stdout.write(process.env.CADRE_PID === "4242" ? "alive claude" : "dead");'),
  });
  assert.equal(r.code, 0);
});

test('the pid of this session gives self', () => {
  const r = run([ID], {
    CLAUDE_AGENTS_JSON_CMD: agents([session(4242)]),
    CADRE_PROCESS_CMD: prints('alive claude'),
    CLAUDE_PID: '4242',
  });
  assert.deepEqual([r.line, r.code], ['self pid=4242', 3]);
});

test('self wins over another entry with the same id', () => {
  const r = run([ID], {
    CLAUDE_AGENTS_JSON_CMD: agents([session(1111), session(4242)]),
    CADRE_PROCESS_CMD: prints('alive claude'),
    CLAUDE_PID: '4242',
  });
  assert.deepEqual([r.line, r.code], ['self pid=4242', 3]);
});

test('a pid that cannot be checked gives unknown, not free', () => {
  const r = run([ID], {
    CLAUDE_AGENTS_JSON_CMD: agents([session(4242)]),
    CADRE_PROCESS_CMD: nodeCmd('process.exit(2);'),
  });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: cannot check process 4242/);
});

test('process output that the check does not know gives unknown, not free', () => {
  const r = run([ID], {
    CLAUDE_AGENTS_JSON_CMD: agents([session(4242)]),
    CADRE_PROCESS_CMD: prints('maybe'),
  });
  assert.equal(r.code, 2);
  assert.match(r.line, /^unknown: /);
});

test('a live process with an ambiguous name gives unknown, not free and not held', () => {
  for (const name of ['node', 'node.exe', 'nodejs', 'bash.exe', 'sh', 'mintty.exe', 'git-bash.exe']) {
    const r = run([ID], {
      CLAUDE_AGENTS_JSON_CMD: agents([session(4242)]),
      CADRE_PROCESS_CMD: prints(`alive ${name}`),
    });
    assert.equal(r.code, 2, name);
    assert.match(r.line, /^unknown: process 4242 is named /, name);
  }
});

test('a held entry wins over an entry with an ambiguous name', () => {
  const r = run([ID], {
    CLAUDE_AGENTS_JSON_CMD: agents([session(1111), session(2222)]),
    CADRE_PROCESS_CMD: nodeCmd('process.stdout.write(process.env.CADRE_PID === "2222" ? "alive claude" : "alive node");'),
  });
  assert.match(r.line, /^held pid=2222/);
});

test('the pid of this session gives self even when the process is named node', () => {
  const r = run([ID], {
    CLAUDE_AGENTS_JSON_CMD: agents([session(4242)]),
    CADRE_PROCESS_CMD: prints('alive node'),
    CLAUDE_PID: '4242',
  });
  assert.deepEqual([r.line, r.code], ['self pid=4242', 3]);
});

test('an id in upper case matches an entry in lower case, and the reverse', () => {
  const env = { CADRE_PROCESS_CMD: prints('alive claude') };
  const upper = OTHER.toUpperCase();
  const lowerList = run([upper], { ...env, CLAUDE_AGENTS_JSON_CMD: agents([session(4242, { sessionId: OTHER })]) });
  assert.match(lowerList.line, /^held/);
  const upperList = run([OTHER], { ...env, CLAUDE_AGENTS_JSON_CMD: agents([session(4242, { sessionId: upper })]) });
  assert.match(upperList.line, /^held/);
});

test('a native install that runs from a versioned file name counts as possibly Claude', () => {
  for (const name of ['2.1.5', '/opt/app/claude/versions/2.1.5']) {
    const r = run([ID], {
      CLAUDE_AGENTS_JSON_CMD: agents([session(4242)]),
      CADRE_PROCESS_CMD: prints(`alive ${name}`),
    });
    assert.match(r.line, /^held/, name);
  }
});

test('a live process of another program means the pid was reused, so free', () => {
  const r = run([ID], {
    CLAUDE_AGENTS_JSON_CMD: agents([session(4242)]),
    CADRE_PROCESS_CMD: prints('alive firefox'),
  });
  assert.deepEqual([r.line, r.code], ['free', 1]);
});

test('a live entry wins over a dead entry', () => {
  const r = run([ID], {
    CLAUDE_AGENTS_JSON_CMD: agents([session(1111, { name: 'dead' }), session(2222, { name: 'live' })]),
    CADRE_PROCESS_CMD: nodeCmd('process.stdout.write(process.env.CADRE_PID === "2222" ? "alive claude" : "dead");'),
  });
  assert.deepEqual([r.line, r.code], ['held pid=2222 name=live cwd=/work/repo status=idle', 0]);
});

test('a held entry wins over an entry that cannot be checked', () => {
  const r = run([ID], {
    CLAUDE_AGENTS_JSON_CMD: agents([session(1111), session(2222)]),
    CADRE_PROCESS_CMD: nodeCmd('process.stdout.write(process.env.CADRE_PID === "2222" ? "alive claude" : "wat"); '),
  });
  assert.equal(r.code, 0);
  assert.match(r.line, /^held pid=2222/);
});

// Real processes, with no replacement of the process check.
const children = [];
after(() => children.forEach((c) => c.kill()));

test('a real live node process for a listed session gives held or unknown, not free', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  children.push(child);
  await new Promise((resolve) => child.once('spawn', resolve));
  const r = run([ID], { CLAUDE_AGENTS_JSON_CMD: agents([session(child.pid)]) });
  assert.notEqual(r.line, 'free');
  assert.match(r.line, /^(held|unknown)/);
});

test('a real dead pid gives free', async () => {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await new Promise((resolve) => child.once('exit', resolve));
  const r = run([ID], { CLAUDE_AGENTS_JSON_CMD: agents([session(child.pid)]) });
  assert.deepEqual([r.line, r.code], ['free', 1]);
});
