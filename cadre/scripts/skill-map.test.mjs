// Tests for skill-map.mjs at its command line: card and repo root in, lines and an exit code out.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, 'skill-map.mjs');
const dir = mkdtempSync(join(tmpdir(), 'cadre-skillmap-'));
let n = 0;
after(() => rmSync(dir, { recursive: true, force: true }));

// A repo root whose charter has this front matter. A null front matter means no charter file.
function repo(frontMatter) {
  const root = join(dir, `repo${n++}`);
  mkdirSync(join(root, 'docs', 'agents'), { recursive: true });
  if (frontMatter !== null) {
    writeFileSync(join(root, 'docs', 'agents', 'cadre-charter.md'), `---\n${frontMatter}\n---\n\n# Charter\n`);
  }
  return root;
}

function run(...args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { lines: r.stdout.split(/\r?\n/).filter(Boolean), code: r.status };
}

const base = 'charter_schema: 1\nwritten_by: cadre 0.1.0';

test('coder with mattpocock-skills prints test-first mattpocock-skills:tdd', () => {
  const r = run('coder', repo(`${base}\nskill_pack: mattpocock-skills`));
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, [
    'test-first mattpocock-skills:tdd',
    'design-vocabulary mattpocock-skills:codebase-design',
    'verification none',
  ]);
});

test('coder with superpowers', () => {
  const r = run('coder', repo(`${base}\nskill_pack: superpowers`));
  assert.deepEqual(r.lines, [
    'test-first superpowers:test-driven-development',
    'design-vocabulary none',
    'verification superpowers:verification-before-completion',
  ]);
});

test('reviewer for each pack', () => {
  assert.deepEqual(run('reviewer', repo(`${base}\nskill_pack: mattpocock-skills`)).lines, ['code-review mattpocock-skills:code-review']);
  assert.deepEqual(run('reviewer', repo(`${base}\nskill_pack: superpowers`)).lines, ['code-review superpowers:requesting-code-review']);
  assert.deepEqual(run('reviewer', repo(`${base}\nskill_pack: none`)).lines, ['code-review none']);
});

test('researcher for each pack', () => {
  assert.deepEqual(run('researcher', repo(`${base}\nskill_pack: mattpocock-skills`)).lines, ['research mattpocock-skills:research']);
  assert.deepEqual(run('researcher', repo(`${base}\nskill_pack: superpowers`)).lines, ['research none']);
});

test('tester for each pack', () => {
  assert.deepEqual(run('tester', repo(`${base}\nskill_pack: mattpocock-skills`)).lines, [
    'test-first mattpocock-skills:tdd',
    'debugging mattpocock-skills:diagnosing-bugs',
  ]);
  assert.deepEqual(run('tester', repo(`${base}\nskill_pack: superpowers`)).lines, [
    'test-first superpowers:test-driven-development',
    'debugging superpowers:systematic-debugging',
  ]);
  assert.deepEqual(run('tester', repo(`${base}\nskill_pack: none`)).lines, ['test-first none', 'debugging none']);
});

test('an absent skill_pack means none', () => {
  const r = run('tester', repo(base));
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, ['test-first none', 'debugging none']);
});

test('an override to none', () => {
  const r = run('tester', repo(`${base}\nskill_pack: mattpocock-skills\ncapabilities: [debugging=none]`));
  assert.deepEqual(r.lines, ['test-first mattpocock-skills:tdd', 'debugging none']);
});

test('an override to a named skill, given as list lines', () => {
  const r = run('reviewer', repo(`${base}\nskill_pack: none\ncapabilities:\n  - code-review=acme:review`));
  assert.deepEqual(r.lines, ['code-review acme:review']);
});

test('an override for a capability that the card lacks is ignored', () => {
  const r = run('reviewer', repo(`${base}\nskill_pack: superpowers\ncapabilities: [debugging=none]`));
  assert.deepEqual(r.lines, ['code-review superpowers:requesting-code-review']);
});

test('a missing charter gives unknown and exit 2', () => {
  const r = run('coder', repo(null));
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: /);
});

test('an unreadable charter gives unknown and exit 2', () => {
  const r = run('coder', repo('not a key value line'));
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: /);
});

test('an unknown preset gives unknown and exit 2', () => {
  const r = run('coder', repo(`${base}\nskill_pack: acme`));
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: .*acme/);
});

test('an unknown capability gives unknown and exit 2', () => {
  const r = run('coder', repo(`${base}\nskill_pack: none\ncapabilities: [cooking=none]`));
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: .*cooking/);
});

test('a bad override item gives unknown and exit 2', () => {
  const r = run('coder', repo(`${base}\nskill_pack: none\ncapabilities: [test-first]`));
  assert.equal(r.code, 2);
});

test('an unknown card gives unknown and exit 2', () => {
  const r = run('painter', repo(`${base}\nskill_pack: none`));
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: .*painter/);
});

test('no card gives unknown and exit 2', () => {
  assert.equal(run().code, 2);
});

test('skill_pack as a list gives unknown and exit 2', () => {
  const r = run('coder', repo(`${base}\nskill_pack:\n  - superpowers`));
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: /);
});

test('an empty skill_pack gives unknown and exit 2', () => {
  const r = run('coder', repo(`${base}\nskill_pack:`));
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: /);
});

test('an inline list as skill_pack gives unknown and exit 2', () => {
  assert.equal(run('coder', repo(`${base}\nskill_pack: [superpowers]`)).code, 2);
});

test('a bare comma list in capabilities gives unknown and exit 2', () => {
  const r = run('tester', repo(`${base}\nskill_pack: none\ncapabilities: debugging=none, test-first=none`));
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: /);
});

test('a mix of inline and dash forms in capabilities gives unknown and exit 2', () => {
  const r = run('tester', repo(`${base}\nskill_pack: none\ncapabilities: [debugging=none]\n  - test-first=none`));
  assert.equal(r.code, 2);
});

test('a capability listed twice gives unknown and exit 2', () => {
  const r = run('tester', repo(`${base}\nskill_pack: none\ncapabilities: [debugging=none, debugging=a:b]`));
  assert.equal(r.code, 2);
  assert.match(r.lines[0], /^unknown: .*debugging/);
});

test('two inline items in capabilities still work', () => {
  const r = run('tester', repo(`${base}\nskill_pack: superpowers\ncapabilities: [debugging=none, test-first=a:b]`));
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, ['test-first a:b', 'debugging none']);
});
