// Tests for task-completed.mjs at its command line: hook JSON on stdin and the environment in, exit code and stderr out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const plugin = join(import.meta.dirname, '..');
const script = join(import.meta.dirname, 'task-completed.mjs');

function run(stdin, teams = '1', extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  if (teams !== null) env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = teams;
  const input = typeof stdin === 'string' ? stdin : JSON.stringify({ hook_event_name: 'TaskCompleted', task_id: 't1', task_subject: 'x', ...stdin });
  const r = spawnSync(process.execPath, [script], { env, input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr.trim() };
}

test('teams on: a completion with agent_id is blocked with a one-line reason', () => {
  const r = run({ agent_id: 'agent-abc123' });
  assert.equal(r.code, 2);
  assert.equal(r.err.split('\n').length, 1);
  assert.match(r.err, /lead/);
});

test('teams on: a completion with teammate_name is blocked, for a teammate in a split pane', () => {
  const r = run({ teammate_name: 'implementer' });
  assert.equal(r.code, 2);
  assert.match(r.err, /lead/);
});

test('teams on: agent_type alone passes, so a lead started with --agent completes tasks', () => {
  assert.equal(run({ agent_type: 'coordinator' }).code, 0);
});

test('teams on: an empty agent_id still counts', () => {
  assert.equal(run({ agent_id: '' }).code, 2);
  assert.equal(run({ agent_id: null }).code, 2);
});

test('teams on: a completion with neither field passes', () => {
  const r = run({});
  assert.deepEqual([r.code, r.out, r.err], [0, '', '']);
});

test('teams off: a completion with agent_id passes', () => {
  for (const teams of [null, '', '0', 'false']) {
    assert.equal(run({ agent_id: 'a1' }, teams).code, 0, `value ${teams}`);
  }
});

test('teams off: bad stdin passes, because the hook does nothing', () => {
  assert.equal(run('not json', null).code, 0);
});

test('teams on: each true value turns the hook on', () => {
  for (const teams of ['1', 'true', 'TRUE', 'yes', 'on']) {
    assert.equal(run({ agent_id: 'a1' }, teams).code, 2, `value ${teams}`);
  }
});

test('teams on: a throw inside the hook still blocks with exit 2', () => {
  // The preload makes readFileSync throw an error that is not a parse error.
  // NODE_OPTIONS reads a backslash in a quoted path as an escape, so the path uses forward slashes.
  const preload = join(import.meta.dirname, 'task-completed-throw.cjs').replaceAll('\\', '/');
  const r = run({ agent_id: 'a1' }, '1', { NODE_OPTIONS: `--require "${preload}"` });
  assert.equal(r.code, 2);
  assert.match(r.err, /blocks/);
});

test('teams on: bad stdin blocks', () => {
  for (const bad of ['not json', '', '[]', 'null', '"x"']) {
    const r = run(bad);
    assert.equal(r.code, 2, `input ${JSON.stringify(bad)}`);
    assert.match(r.err, /blocks/);
  }
});

test('hooks.json has a TaskCompleted handler that runs an existing script in exec form', () => {
  const config = JSON.parse(readFileSync(join(plugin, 'hooks', 'hooks.json'), 'utf8'));
  const groups = config.hooks.TaskCompleted;
  assert.ok(Array.isArray(groups));
  const list = groups.flatMap((g) => g.hooks);
  assert.equal(list.length, 1);
  const h = list[0];
  assert.equal(h.type, 'command');
  assert.equal(h.command, 'node');
  // Docs: onFailure has no effect on TaskCompleted, so the script blocks by itself and the entry omits it.
  assert.equal('onFailure' in h, false);
  assert.equal(typeof h.timeout, 'number');
  const m = /^\${CLAUDE_PLUGIN_ROOT}\/(.+)$/.exec(h.args[0]);
  assert.ok(m, `script argument: ${h.args[0]}`);
  assert.ok(existsSync(join(plugin, ...m[1].split('/'))), `${m[1]} exists`);
});
