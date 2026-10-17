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
  const guards = handlers().map((h) => h.args?.[1]);
  assert.deepEqual(guards.sort(), ['merge', 'merge', 'push']);
});

test('each handler blocks on failure and on a timeout, and has an if filter that git.exe and gh.exe pass', () => {
  for (const h of handlers()) {
    assert.equal(h.type, 'command');
    assert.equal(h.onFailure, 'block');
    // Docs state case-insensitive matching for PowerShell and WebFetch rules, not for Bash. One lowercase
    // entry is kept. The script lowercases the command word and strips .exe itself.
    assert.match(h.if, /^Bash\(\*(git|gh|az)\*\)$/);
    // Docs: a hook that times out counts as a failure, and onFailure block then blocks the call.
    assert.equal(h.timeout, 10);
  }
});

test('each command runs an existing script of the plugin through node, in exec form', () => {
  // Docs: exec form (command plus args) spawns node with no shell, so it works on Windows and macOS.
  for (const h of handlers()) {
    assert.equal(h.command, 'node');
    assert.equal(h.args.length, 2);
    const m = /^\${CLAUDE_PLUGIN_ROOT}\/(.+)$/.exec(h.args[0]);
    assert.ok(m, `script argument: ${h.args[0]}`);
    assert.ok(['push', 'merge'].includes(h.args[1]));
    assert.ok(existsSync(join(plugin, ...m[1].split('/'))), `${m[1]} exists`);
  }
});

test('a command of az, git, or gh reaches the guard that matches it through an if filter', () => {
  const reaches = (guard, command) =>
    handlers().some((h) => {
      const m = /^Bash\(\*(\w+)\*\)$/.exec(h.if);
      return h.args[1] === guard && m && command.toLowerCase().includes(m[1]);
    });
  assert.ok(reaches('merge', 'az repos pr update --id 5 --status completed'));
  assert.ok(reaches('merge', 'az.cmd repos pr update --id 5 --auto-complete true'));
  assert.ok(reaches('merge', 'gh pr merge 5'));
  assert.ok(reaches('push', 'git push origin main'));
});
