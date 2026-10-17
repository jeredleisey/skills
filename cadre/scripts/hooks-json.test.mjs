// Checks the shape of cadre/hooks/hooks.json: it parses, it guards Bash, and each command names a script that exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const plugin = join(import.meta.dirname, '..');
const file = join(plugin, 'hooks', 'hooks.json');

function handlers() {
  const config = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(config.hooks.PreToolUse), 'hooks.PreToolUse is a list');
  return config.hooks.PreToolUse.flatMap((group) => {
    assert.equal(group.matcher, 'Bash');
    return group.hooks;
  });
}

test('hooks.json parses and has one PreToolUse handler for each guard', () => {
  const guards = handlers().map((h) => /guard\.mjs"? (\w+)$/.exec(h.command)?.[1]);
  assert.deepEqual(guards.sort(), ['merge', 'push']);
});

test('each handler blocks on failure and on a timeout, and has an if filter that git.exe and gh.exe pass', () => {
  for (const h of handlers()) {
    assert.equal(h.type, 'command');
    assert.equal(h.onFailure, 'block');
    assert.match(h.if, /^Bash\(\*(git|gh)\*\)$/);
    // Docs: a hook that times out counts as a failure, and onFailure block then blocks the call.
    assert.equal(h.timeout, 10);
  }
});

test('each command runs an existing script of the plugin through node', () => {
  for (const h of handlers()) {
    const m = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)" (push|merge)$/.exec(h.command);
    assert.ok(m, `command form: ${h.command}`);
    assert.ok(existsSync(join(plugin, ...m[1].split('/'))), `${m[1]} exists`);
  }
});
