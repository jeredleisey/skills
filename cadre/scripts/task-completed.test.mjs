// Tests for task-completed.mjs at its command line: hook JSON on stdin and the environment in, exit code and stderr out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const plugin = join(import.meta.dirname, '..');
const script = join(import.meta.dirname, 'task-completed.mjs');

function run(stdin, teams = '1') {
  const env = { ...process.env };
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

test('teams on: a completion with agent_type is blocked', () => {
  assert.equal(run({ agent_type: 'coder' }).code, 2);
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
  assert.equal(h.onFailure, 'block');
  assert.equal(typeof h.timeout, 'number');
  const m = /^\${CLAUDE_PLUGIN_ROOT}\/(.+)$/.exec(h.args[0]);
  assert.ok(m, `script argument: ${h.args[0]}`);
  assert.ok(existsSync(join(plugin, ...m[1].split('/'))), `${m[1]} exists`);
});
