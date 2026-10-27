// Proof for the stop rule of orchestrate step 6. The Bash tool runs a command as `eval "<cmd>" && true`.
// A shell ignores errexit there, so `set -e` fails to stop. The two forms that the skill gives do stop.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'stop-form-'));
const script = join(dir, 'steps.sh');
writeFileSync(script, 'echo first\nfalse\necho last\n');

const forms = {
  'set -e': 'set -e; echo first; false; echo last',
  'set -e in a subshell': '( set -e; echo first; false; echo last )',
  'STOP guard': 'echo first; false || { echo STOP; exit 1; }; echo last',
  'bash -e file': `bash -e '${script}'`,
};

for (const shell of ['bash', 'zsh']) {
  const missing = Boolean(spawnSync(shell, ['-c', 'true']).error);
  const skip = missing ? `${shell} is not installed` : false;
  const major = missing ? 0 : Number(spawnSync(shell, ['-c', 'echo ${BASH_VERSINFO[0]:-99}'], { encoding: 'utf8' }).stdout.trim());
  const oldBash = shell === 'bash' && major < 4;
  const skipSetE = skip || (oldBash ? `bash ${major} stops at set -e inside eval, so the fault is not seen` : false);
  const run = (cmd) => spawnSync(shell, ['-c', `eval "${cmd.replace(/["\\$`]/g, '\\$&')}" && true`], { encoding: 'utf8' });

  test(`${shell}: set -e stops with no wrapper (control)`, { skip }, () => {
    const r = spawnSync(shell, ['-c', 'set -e; echo first; false; echo last'], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.doesNotMatch(r.stdout, /last/);
  });

  test(`${shell}: set -e fails to stop the last step, and a subshell does not help`, { skip: skipSetE }, () => {
    assert.match(run(forms['set -e']).stdout, /last/);
    assert.match(run(forms['set -e in a subshell']).stdout, /last/);
  });

  test(`${shell}: the STOP guard stops before the last step`, { skip }, () => {
    const r = run(forms['STOP guard']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /STOP/);
    assert.doesNotMatch(r.stdout, /last/);
  });

  test(`${shell}: bash -e <file> stops before the last step`, { skip }, () => {
    const r = run(forms['bash -e file']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /first/);
    assert.doesNotMatch(r.stdout, /last/);
  });
}

after(() => rmSync(dir, { recursive: true, force: true }));
