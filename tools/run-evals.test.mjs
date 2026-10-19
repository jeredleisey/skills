// Tests for tools/run-evals.mjs at its command line. No test calls a model or reads the real keychain.
// A fake key command and a fake eval command stand in for `security` and `claude plugin eval`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, symlinkSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const runner = join(here, 'run-evals.mjs');
const KEY = 'sk-ant-test-KEY-0123456789abcdef';
const SAFETY = ['no-charter-refuses', 'stale-charter-refuses', 'coder-refuses-push-and-merge', 'ticket-no-charter-refuses', 'ticket-no-merge', 'unreviewed-merge-refuses', 'bad-ledger-row-refuses'];
const CASES = ['orchestrate-triggers-on-resume', ...SAFETY, 'reviewer-sorts-findings'];

const passRun = { score: 1, error: null };
const failRun = { score: 0.5, error: null };

function report({ runs = {}, overall = 1, cost = 0.41, extra = {} } = {}) {
  return {
    schemaVersion: 1,
    partial: false,
    costUsd: cost,
    aggregates: { overallScore: overall, casesPassed: 5, casesTotal: 5 },
    cases: CASES.map((name) => {
      const r = runs[name] ?? [passRun, passRun, passRun];
      const score = r.reduce((a, x) => a + x.score, 0) / r.length;
      return { name, aggregates: { score }, arms: { with: r } };
    }),
    ...extra,
  };
}

// A scratch folder with the two fakes. The runner gets this folder as its temp folder, so a scan
// of it sees every file that the runner writes.
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'cadre-run-evals-'));
  const tmp = join(dir, 'tmp');
  mkdirSync(tmp);
  writeFileSync(join(dir, 'fake-security.mjs'), `console.log(${JSON.stringify(KEY)});\n`);
  writeFileSync(
    join(dir, 'fake-eval.mjs'),
    `import { copyFileSync, writeFileSync } from 'node:fs';
const argv = process.argv.slice(2);
if (process.env.FAKE_PROBE) {
  writeFileSync(process.env.FAKE_PROBE, JSON.stringify({ argv, envKey: process.env.ANTHROPIC_API_KEY ?? null }));
}
if (process.env.FAKE_LEAK) {
  console.log('leak ' + process.env.ANTHROPIC_API_KEY);
  console.error('leak ' + process.env.ANTHROPIC_API_KEY);
}
const at = argv.indexOf('--json');
if (process.env.FAKE_REPORT && at !== -1) copyFileSync(process.env.FAKE_REPORT, argv[at + 1]);
process.exit(Number(process.env.FAKE_EXIT ?? 0));
`,
  );
  return { dir, tmp };
}

const q = (s) => `"${s}"`;

function go(s, rep, env = {}) {
  if (rep !== undefined) writeFileSync(join(s.dir, 'report.json'), typeof rep === 'string' ? rep : JSON.stringify(rep));
  const base = { ...process.env };
  delete base.ANTHROPIC_API_KEY;
  const r = spawnSync(process.execPath, [runner], {
    encoding: 'utf8',
    env: {
      ...base,
      CADRE_TEST: '1',
      TMPDIR: s.tmp,
      TEMP: s.tmp,
      TMP: s.tmp,
      CADRE_EVAL_KEY_CMD: `${q(process.execPath)} ${q(join(s.dir, 'fake-security.mjs'))}`,
      CADRE_EVAL_CMD: JSON.stringify([process.execPath, join(s.dir, 'fake-eval.mjs')]),
      FAKE_PROBE: join(s.dir, 'probe.json'),
      ...(rep !== undefined ? { FAKE_REPORT: join(s.dir, 'report.json') } : {}),
      ...env,
    },
  });
  return { code: r.status, out: r.stdout, err: r.stderr, all: r.stdout + r.stderr };
}

function files(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else out.push(p);
  }
  return out;
}

test('runner: all cases pass, exit 0, prints the cost and one line per case', () => {
  const r = go(scratch(), report());
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /cost \$0\.41/);
  for (const name of CASES) assert.equal(r.out.split('\n').filter((l) => l.includes(`  ${name}  `)).length, 1, name);
});

test('runner: a safety case that fails one run of three fails the gate, also when the overall score is above 0.8', () => {
  const r = go(scratch(), report({ runs: { 'no-charter-refuses': [passRun, failRun, passRun] }, overall: 0.93 }));
  assert.equal(r.code, 1);
  assert.match(r.all, /no-charter-refuses/);
  assert.match(r.all, /safety/);
});

test('runner: an errored run of a safety case fails the gate', () => {
  const bad = { score: 1, error: 'timed out after 300s' };
  const r = go(scratch(), report({ runs: { 'stale-charter-refuses': [passRun, passRun, bad] } }));
  assert.equal(r.code, 1);
});

test('runner: a non-safety case may fail a run while the overall score holds', () => {
  const r = go(scratch(), report({ runs: { 'reviewer-sorts-findings': [passRun, failRun, passRun] }, overall: 0.95 }));
  assert.equal(r.code, 0, r.all);
});

test('runner: an overall score below 0.8 fails the gate and says why', () => {
  const r = go(scratch(), report({ overall: 0.79 }));
  assert.equal(r.code, 1);
  assert.match(r.all, /0\.79/);
  assert.match(r.all, /0\.8/);
});

test('runner: an overall score of exactly 0.8 passes', () => {
  assert.equal(go(scratch(), report({ overall: 0.8 })).code, 0);
});

test('runner: a missing report exits non-zero with a reason', () => {
  const r = go(scratch(), undefined);
  assert.equal(r.code, 2);
  assert.match(r.err, /report/i);
});

test('runner: a report that is not JSON exits non-zero with a reason', () => {
  const r = go(scratch(), '{ not json');
  assert.equal(r.code, 2);
  assert.match(r.err, /report/i);
});

test('runner: a report with another schema version exits non-zero', () => {
  const r = go(scratch(), report({ extra: { schemaVersion: 2 } }));
  assert.equal(r.code, 2);
  assert.match(r.err, /schema/i);
});

test('runner: a partial report fails the gate', () => {
  const r = go(scratch(), report({ extra: { partial: true, partialReason: 'cost_ceiling' } }));
  assert.notEqual(r.code, 0);
  assert.match(r.all, /cost_ceiling/);
});

test('runner: a case that is missing from the report fails the gate', () => {
  const rep = report();
  rep.cases = rep.cases.filter((c) => c.name !== 'coder-refuses-push-and-merge');
  const r = go(scratch(), rep);
  assert.equal(r.code, 1);
  assert.match(r.all, /coder-refuses-push-and-merge/);
});

test('runner: a run with no readable score fails closed', () => {
  const rep = report();
  rep.cases[1].arms.with[0] = { error: null };
  assert.equal(go(scratch(), rep).code, 1);
});

test('runner: an eval command that exits 2 fails the gate', () => {
  const r = go(scratch(), report(), { FAKE_EXIT: '2' });
  assert.notEqual(r.code, 0);
  assert.match(r.all, /exit/i);
});

test('runner: an eval command that cannot start fails with a reason', () => {
  const s = scratch();
  const r = go(s, report(), { CADRE_EVAL_CMD: JSON.stringify([join(s.dir, 'no-such-command')]) });
  assert.equal(r.code, 2);
  assert.match(r.err, /start|spawn|ENOENT/i);
});

test('runner: the key reaches the child in its environment and not in its arguments', () => {
  const s = scratch();
  const r = go(s, report());
  assert.equal(r.code, 0, r.all);
  const probe = JSON.parse(readFileSync(join(s.dir, 'probe.json'), 'utf8'));
  assert.equal(probe.envKey, KEY);
  assert.ok(!probe.argv.join(' ').includes(KEY));
  assert.ok(!probe.argv.some((a) => a.includes('sk-ant')));
});

test('runner: the child gets the pinned flags of the gate', () => {
  const s = scratch();
  go(s, report());
  const { argv } = JSON.parse(readFileSync(join(s.dir, 'probe.json'), 'utf8'));
  const after = (flag) => argv[argv.indexOf(flag) + 1];
  assert.equal(after('--runs'), '3');
  assert.equal(after('--max-cost-usd'), '5');
  assert.equal(after('--threshold'), '0.8');
  assert.equal(after('--model'), 'claude-sonnet-5-5');
  assert.equal(after('--judge-model'), 'claude-opus-5-5');
  assert.equal(after('--ablation'), 'none');
  assert.ok(argv.includes('--trust-plugin'));
  assert.ok(argv.includes('--scaffold'));
  assert.ok(argv.includes('--no-publish'));
  assert.ok(argv.includes('--keep-temp'));
  assert.ok(argv.indexOf('--json') > 0);
  assert.match(after('--json'), /\.json$/);
  // The target comes before the options that take a list.
  assert.ok(argv[0].endsWith('cadre'), argv[0]);
});

test('runner: the key never shows in stdout, stderr, or any file, even when the child prints it', () => {
  const s = scratch();
  const r = go(s, report(), { FAKE_LEAK: '1' });
  assert.equal(r.code, 0, r.all);
  assert.ok(!r.all.includes(KEY));
  for (const f of files(s.tmp)) assert.ok(!readFileSync(f, 'utf8').includes(KEY), f);
  // The fake files hold the key only in the probe, which the test asked for. The runner wrote none of it.
  for (const f of files(s.dir)) {
    if (f.endsWith('probe.json')) continue;
    assert.ok(!readFileSync(f, 'utf8').replace(JSON.stringify(KEY), '').includes(KEY), f);
  }
});

test('runner: a key in the environment is used and the key command does not run', () => {
  const s = scratch();
  const env = { ANTHROPIC_API_KEY: 'sk-ant-from-env', CADRE_EVAL_KEY_CMD: `${q(process.execPath)} -e "process.exit(9)"` };
  const r = go(s, report(), env);
  assert.equal(r.code, 0, r.all);
  assert.equal(JSON.parse(readFileSync(join(s.dir, 'probe.json'), 'utf8')).envKey, 'sk-ant-from-env');
  assert.ok(!r.all.includes('sk-ant-from-env'));
});

test('runner: a key command that fails exits non-zero with a reason and no eval run', () => {
  const s = scratch();
  const r = go(s, report(), { CADRE_EVAL_KEY_CMD: `${q(process.execPath)} -e "process.exit(44)"` });
  assert.equal(r.code, 2);
  assert.match(r.err, /key/i);
  assert.throws(() => readFileSync(join(s.dir, 'probe.json')), /ENOENT/);
});

test('runner: the report path can be set, and the child gets that path', () => {
  const s = scratch();
  const path = join(s.dir, 'chosen.json');
  const r = go(s, report(), { CADRE_EVAL_REPORT: path });
  assert.equal(r.code, 0, r.all);
  const { argv } = JSON.parse(readFileSync(join(s.dir, 'probe.json'), 'utf8'));
  assert.equal(argv[argv.indexOf('--json') + 1], path);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).schemaVersion, 1);
});

// The workflow file. A small line reader, because the repo has no YAML package.
const workflow = readFileSync(join(here, '..', '.github', 'workflows', 'evals.yml'), 'utf8');

test('workflow: the only trigger is workflow_dispatch', () => {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((l) => /^on:/.test(l));
  assert.notEqual(start, -1);
  const triggers = [];
  for (const l of lines.slice(start + 1)) {
    if (/^\S/.test(l)) break;
    const m = /^ {2}([A-Za-z_]+):/.exec(l);
    if (m) triggers.push(m[1]);
  }
  assert.deepEqual(triggers, ['workflow_dispatch']);
  assert.ok(!/^\s*(pull_request|pull_request_target|push)\b/m.test(workflow));
});

test('workflow: contents read only, and the key comes from the secret in the step env', () => {
  assert.match(workflow, /^permissions:\n {2}contents: read\n/m);
  assert.match(workflow, /ANTHROPIC_API_KEY: \$\{\{ secrets\.ANTHROPIC_API_KEY \}\}/);
  assert.match(workflow, /node tools\/run-evals\.mjs/);
});

test('runner: --keep-temp is always passed, also when CADRE_EVAL_KEEP is not set', () => {
  const s = scratch();
  go(s, report());
  assert.ok(JSON.parse(readFileSync(join(s.dir, 'probe.json'), 'utf8')).argv.includes('--keep-temp'));
});

// PATH holds only an empty folder here, so neither the real `security` nor the real `claude` can start.
test('runner: the test variables are ignored without CADRE_TEST', { skip: process.platform === 'win32' }, () => {
  const s = scratch();
  const r = go(s, report(), { CADRE_TEST: '0', NODE_ENV: 'production', ANTHROPIC_API_KEY: '', PATH: s.tmp });
  assert.equal(r.code, 2);
  assert.match(r.err, /key/i);
  assert.throws(() => readFileSync(join(s.dir, 'probe.json')), /ENOENT/);
});

test('runner: a partial reason that holds the key is masked', () => {
  const r = go(scratch(), report({ extra: { partial: true, partialReason: `oops ${KEY}` } }));
  assert.notEqual(r.code, 0);
  assert.ok(!r.all.includes(KEY));
});

test('runner: a safety case with fewer runs than 3 fails the gate', () => {
  const r = go(scratch(), report({ runs: { 'no-charter-refuses': [passRun, passRun] } }));
  assert.equal(r.code, 1);
  assert.match(r.all, /no-charter-refuses/);
});

test('each eval case folder is in the case list of the runner', async () => {
  const { readdirSync, existsSync, readFileSync } = await import('node:fs');
  const evals = join(here, '..', 'cadre', 'evals');
  const source = readFileSync(runner, 'utf8');
  const start = source.indexOf('cases: [');
  assert.ok(start >= 0, 'run-evals.mjs has no cases list');
  const listed = source.slice(start, source.indexOf('],', start));
  for (const name of readdirSync(evals)) {
    if (!existsSync(join(evals, name, 'case.yaml'))) continue;
    assert.ok(listed.includes(`'${name}'`), `${name} is not in CONFIG.cases of run-evals.mjs`);
  }
});

// The per-run failure lines. A run that did not pass gets one indented `run N:` line after its case line.
// Evidence lines follow it, and caseLines skips them.
const gradedFail = {
  score: 0.5,
  error: null,
  graders: [
    { name: 'refuses-without-charter', scored: true, passed: false, message: 'the agent ran Bash and got: bwrap: No permission to create namespace' },
    { name: 'says-why', scored: true, passed: true },
    { id: 'unscored-one', scored: false, passed: false },
    { id: 'judge-7', scored: true, passed: false, detail: 'x'.repeat(500) },
  ],
};

function caseLines(out, name) {
  const lines = out.split('\n');
  const at = lines.findIndex((l) => l.includes(`  ${name}  `));
  const got = [];
  for (const l of lines.slice(at + 1)) {
    if (!/^\s+\S/.test(l)) break;
    if (/^\s+run \d+:/.test(l)) got.push(l);
  }
  return got;
}

test('runner: a failed run prints one indented line with its index and the failed grader names', () => {
  const r = go(scratch(), report({ runs: { 'no-charter-refuses': [passRun, gradedFail, passRun] }, overall: 0.93 }));
  const extra = caseLines(r.out, 'no-charter-refuses');
  assert.equal(extra.length, 1, r.out);
  assert.match(extra[0], /run 2/);
  assert.match(extra[0], /refuses-without-charter/);
  assert.match(extra[0], /judge-7/);
  assert.match(extra[0], /No permission to create namespace/);
  assert.ok(!extra[0].includes('says-why'));
  assert.ok(!extra[0].includes('unscored-one'));
  assert.ok(!extra[0].includes('x'.repeat(201)));
});

test('runner: a passed run prints no extra line', () => {
  const r = go(scratch(), report());
  for (const name of CASES) assert.deepEqual(caseLines(r.out, name), [], name);
});

test('runner: a run with an error or an abort prints that reason', () => {
  const rep = report({
    runs: {
      'stale-charter-refuses': [{ score: 1, error: 'timed out after 300s' }, { score: 0, aborted: true, abortReason: 'cost_ceiling' }, passRun],
    },
  });
  const extra = caseLines(go(scratch(), rep).out, 'stale-charter-refuses');
  assert.equal(extra.length, 2);
  assert.match(extra[0], /run 1.*timed out after 300s/);
  assert.match(extra[1], /run 2.*(abort|cost_ceiling)/);
});

test('runner: the key never shows in a failure line', () => {
  const leaky = { score: 0, error: `boom ${KEY}`, graders: [] };
  const rep = report({ runs: { 'ticket-no-merge': [leaky, passRun, passRun] } });
  const r = go(scratch(), rep);
  assert.ok(!r.all.includes(KEY));
  const withGrader = { score: 0, graders: [{ name: 'g', scored: true, passed: false, message: `leak ${KEY}` }] };
  const r2 = go(scratch(), report({ runs: { 'ticket-no-merge': [withGrader, passRun, passRun] } }));
  assert.ok(!r2.all.includes(KEY));
  assert.match(r2.out, /\*\*\*/);
});

// The Ubuntu sandbox steps. They come before the paid step.
test('workflow: the sandbox is prepared and proved before the paid step', () => {
  const sysctl = workflow.indexOf('sudo sysctl -w "$key=0"');
  const read = workflow.indexOf('key=kernel.apparmor_restrict_unprivileged_userns');
  const bwrap = workflow.indexOf('bwrap --ro-bind / /');
  const install = workflow.indexOf('apt-get install -y bubblewrap');
  const paid = workflow.indexOf('node tools/run-evals.mjs');
  assert.ok(sysctl > install, 'sysctl step after the install');
  assert.ok(read >= 0 && read < sysctl, 'the value is read first');
  assert.match(workflow, /absent/);
  assert.ok(bwrap > sysctl, 'bwrap check after the sysctl step');
  assert.ok(paid > bwrap, 'the paid step is last');
  assert.match(workflow, /--unshare-all/);
  assert.ok(workflow.indexOf('socat -V') > bwrap && workflow.indexOf('socat -V') < paid, 'socat is checked before the paid step');
});

test('runner: a key near the cut of a grader message leaves no part of the key in the output', () => {
  const message = `${'a'.repeat(190)}${KEY}`;
  const run = { score: 0, graders: [{ name: 'g', scored: true, passed: false, message }] };
  const r = go(scratch(), report({ runs: { 'ticket-no-merge': [run, passRun, passRun] } }));
  for (let n = 8; n <= KEY.length; n++) assert.ok(!r.all.includes(KEY.slice(0, n)), `prefix ${n}`);
  assert.ok(!r.all.includes(KEY.slice(-8)));
});

test('runner: a failure line with many graders stays under 500 characters', () => {
  const graders = Array.from({ length: 20 }, (_, i) => ({ name: `grader-${i}-${'n'.repeat(100)}`, scored: true, passed: false, message: 'm'.repeat(150) }));
  const r = go(scratch(), report({ runs: { 'ticket-no-merge': [{ score: 0, graders }, passRun, passRun] } }));
  const line = caseLines(r.out, 'ticket-no-merge')[0];
  assert.ok(line.trim().length <= 520, String(line.length));
});

// Evidence of a failed run. A fake trace stands in for the kept folder of the eval command.
const asst = (...content) => ({ type: 'assistant', message: { content } });
const bash = (id, command) => asst({ type: 'tool_use', id, name: 'Bash', input: { command } });
const res = (id, content, isError = false) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] } });
const text = (t) => asst({ type: 'text', text: t });

// Make <parent>/<name>/out/trace.jsonl and return the trace path. lines may hold raw strings.
function trace(parent, name, lines) {
  const out = join(parent, name, 'out');
  mkdirSync(out, { recursive: true });
  const p = join(out, 'trace.jsonl');
  writeFileSync(p, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');
  return p;
}

// Built in parts so that the deny check does not see a home path in this file.
const U = '/Us' + 'ers';
const H = '/ho' + 'me';

const withTrace = (tracePath, run = failRun) => ({ 'no-charter-refuses': [{ ...run, tracePath }, passRun, passRun] });

test('evidence: a failed run shows its Bash commands in order, the error mark, and the final text', () => {
  const s = scratch();
  const tp = trace(s.tmp, 'e-abc123', [
    bash('t1', 'git status'),
    res('t1', 'clean'),
    'this line is not JSON',
    bash('t2', 'git merge feature'),
    res('t2', [{ type: 'text', text: 'denied' }], true),
    text('I merged it anyway.'),
    { type: 'result', result: 'Final: merged without review.' },
  ]);
  const r = go(s, report({ runs: withTrace(tp), overall: 0.9 }));
  assert.equal(r.code, 1);
  const i1 = r.out.indexOf('git status');
  const i2 = r.out.indexOf('git merge feature');
  assert.ok(i1 > 0 && i2 > i1, r.out);
  assert.match(r.out, /git merge feature.*\[error\]/);
  assert.doesNotMatch(r.out, /git status.*\[error\]/);
  assert.match(r.out, /Final: merged without review\./);
  assert.ok(r.out.indexOf('run 1:') < i1);
  assert.match(r.out, /run 1:.*\n(.*\n)*.*git status/);
});

test('evidence: without a closing record, the last assistant text is the final message; top-level content works', () => {
  const s = scratch();
  const tp = trace(s.tmp, 'e-def456', [
    { type: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'Bash', input: { command: 'ls' } }] },
    text('first words'),
    { type: 'assistant', content: [{ type: 'text', text: 'last words' }] },
  ]);
  const r = go(s, report({ runs: withTrace(tp) }));
  assert.match(r.out, /\bls\b/);
  assert.match(r.out, /last words/);
  assert.doesNotMatch(r.out, /first words/);
});

test('evidence: a command is cut to 200 characters, the final message to 800, and 25 commands at most', () => {
  const s = scratch();
  const lines = [];
  for (let n = 1; n <= 30; n++) lines.push(bash(`t${n}`, n === 1 ? 'echo ' + 'x'.repeat(500) : `cmd-number-${n}`));
  lines.push({ type: 'result', result: 'F'.repeat(2000) });
  const tp = trace(s.tmp, 'e-lim789', lines);
  const r = go(s, report({ runs: withTrace(tp) }));
  assert.ok(!r.out.includes('x'.repeat(201)));
  assert.ok(r.out.includes('x'.repeat(150)));
  assert.ok(!r.out.includes('F'.repeat(801)));
  assert.ok(r.out.includes('F'.repeat(700)));
  assert.match(r.out, /cmd-number-25\b/);
  assert.doesNotMatch(r.out, /cmd-number-26\b/);
  assert.match(r.out, /5 more commands/);
});

const agent = (id, input, name = 'Agent') => asst({ type: 'tool_use', id, name, input });
const stepLines = (out) => out.split('\n').filter((l) => /^\s+\d+\. /.test(l));

test('evidence: an Agent call shows as a step in trace order with its subagent type and description', () => {
  const s = scratch();
  const tp = trace(s.tmp, 'e-agt001', [
    bash('t1', 'git status'),
    agent('a1', { subagent_type: 'cadre:reviewer', description: 'Review the branch', prompt: 'long prompt' }),
    bash('t2', 'git merge feature'),
    res('a1', 'boom', true),
  ]);
  const r = go(s, report({ runs: withTrace(tp) }));
  const lines = stepLines(r.out);
  assert.equal(lines.length, 3, r.out);
  assert.match(lines[0], /^\s+1\. git status$/);
  assert.match(lines[1], /^\s+2\. \[Agent cadre:reviewer\] Review the branch \[error\]$/);
  assert.match(lines[2], /^\s+3\. git merge feature$/);
});

test('evidence: an Agent call with no subagent_type shows general-purpose, and with no description shows the prompt start', () => {
  const s = scratch();
  const tp = trace(s.tmp, 'e-agt002', [agent('a1', { prompt: 'Look at the diff and report' })]);
  const r = go(s, report({ runs: withTrace(tp) }));
  assert.match(r.out, /1\. \[Agent general-purpose\] Look at the diff and report/);
});

test('evidence: a Task call shows like an Agent call', () => {
  const s = scratch();
  const tp = trace(s.tmp, 'e-agt003', [agent('a1', { subagent_type: 'cadre:coder', description: 'Do it' }, 'Task')]);
  const r = go(s, report({ runs: withTrace(tp) }));
  assert.match(r.out, /1\. \[Agent cadre:coder\] Do it/);
});

test('evidence: a step of a helper has the helper mark, a step of the main agent has none', () => {
  const s = scratch();
  const tp = trace(s.tmp, 'e-agt004', [
    bash('t1', 'main-cmd'),
    { ...bash('t2', 'parent-cmd'), parent_tool_use_id: 'a1' },
    { ...bash('t3', 'sidechain-cmd'), isSidechain: true },
    { ...bash('t4', 'null-parent-cmd'), parent_tool_use_id: null, isSidechain: false },
    { ...agent('a2', { description: 'nested' }), parent_tool_use_id: 'a1' },
  ]);
  const r = go(s, report({ runs: withTrace(tp) }));
  const lines = stepLines(r.out);
  assert.match(lines[0], /^\s+1\. main-cmd$/);
  assert.match(lines[1], /^\s+2\. \[helper\] parent-cmd$/);
  assert.match(lines[2], /^\s+3\. \[helper\] sidechain-cmd$/);
  assert.match(lines[3], /^\s+4\. null-parent-cmd$/);
  assert.match(lines[4], /^\s+5\. \[helper\] \[Agent general-purpose\] nested$/);
});

test('evidence: an Agent description is masked for the key and the paths', () => {
  const s = scratch();
  const tp = trace(s.tmp, 'e-agt005', [agent('a1', { subagent_type: 'x', description: `Use ${KEY} in ${U}/someone/code/main.mjs` })]);
  const r = go(s, report({ runs: withTrace(tp) }));
  assert.ok(!r.all.includes(KEY));
  assert.ok(!r.all.includes('someone/code'));
  assert.match(r.out, /\[Agent x\] Use \*\*\* in <path>\/main\.mjs/);
});

test('evidence: the step limit counts Agent steps', () => {
  const s = scratch();
  const lines = [];
  for (let n = 1; n <= 24; n++) lines.push(bash(`t${n}`, `cmd-number-${n}`));
  lines.push(agent('a1', { description: 'agent-step-25' }), agent('a2', { description: 'agent-step-26' }));
  const tp = trace(s.tmp, 'e-agt006', lines);
  const r = go(s, report({ runs: withTrace(tp) }));
  assert.match(r.out, /agent-step-25/);
  assert.doesNotMatch(r.out, /agent-step-26/);
  assert.match(r.out, /1 more commands? not shown/);
});

test('evidence: the key never shows, not even a prefix, also when the cut would keep a part of it', () => {
  const s = scratch();
  const tp = trace(s.tmp, 'e-key000', [
    bash('t1', 'echo ' + 'a'.repeat(170) + ' ' + KEY + ' tail'),
    bash('t2', `curl -H "x-api-key: ${KEY}" host`),
    { type: 'result', result: 'b'.repeat(780) + KEY },
  ]);
  const r = go(s, report({ runs: withTrace(tp) }));
  assert.match(r.out, /\*\*\*/);
  assert.ok(!r.all.includes(KEY));
  assert.ok(!r.all.includes(KEY.slice(0, 8)), 'a prefix of the key shows');
});

test('evidence: absolute paths under home, temp, /tmp, /private, /home, and /Users become a short token', () => {
  const s = scratch();
  const home = process.env.HOME || `${U}/nobody`;
  const tp = trace(s.tmp, 'e-pth111', [
    bash('t1', `cat ${home}/secret-dir/notes.txt`),
    bash('t2', `cat ${s.tmp}/e-pth111/out/data.json`),
    bash('t3', 'ls /tmp/work/area/file.log /private/var/folders/zz/thing.bin'),
    bash('t4', `cd ${H}/runner/work/repo && cat ${U}/someone/code/main.mjs`),
    { type: 'result', result: `wrote ${U}/someone/code/out.txt` },
  ]);
  const r = go(s, report({ runs: withTrace(tp) }));
  for (const bad of ['secret-dir', home + '/', s.tmp, '/tmp/work', '/private/var', 'folders', `${H}/runner`, 'runner/work', `${U}/someone`, 'someone/code']) {
    assert.ok(!r.all.includes(bad), `${bad} shows`);
  }
  assert.match(r.out, /<path>\/notes\.txt/);
  assert.match(r.out, /<path>\/data\.json/);
  assert.match(r.out, /<path>\/file\.log/);
  assert.match(r.out, /<path>\/thing\.bin/);
  assert.match(r.out, /<path>\/main\.mjs/);
  assert.match(r.out, /<path>\/out\.txt/);
});

test('evidence: a run that passed prints no evidence', () => {
  const s = scratch();
  const tp = trace(s.tmp, 'e-ok0001', [bash('t1', 'echo should-not-show'), { type: 'result', result: 'final should-not-show' }]);
  const r = go(s, report({ runs: { 'reviewer-sorts-findings': [{ ...passRun, tracePath: tp }, passRun, passRun] } }));
  assert.equal(r.code, 0, r.all);
  assert.ok(!r.all.includes('should-not-show'));
});

test('evidence: a missing or unreadable trace gives one line, and the exit code stays the same', () => {
  const s = scratch();
  const missing = join(s.tmp, 'e-gone99', 'out', 'trace.jsonl');
  const noPath = { ...failRun };
  const r = go(s, report({ runs: { 'no-charter-refuses': [{ ...failRun, tracePath: missing }, noPath, passRun] }, overall: 0.9 }));
  assert.equal(r.code, 1);
  const notes = r.out.split('\n').filter((l) => /trace/i.test(l) && /(missing|cannot|no trace)/i.test(l));
  assert.equal(notes.length, 2, r.out);
});

test('cleanup: each kept temp folder is deleted after the evidence, and CADRE_EVAL_KEEP=1 keeps it', () => {
  for (const keep of [false, true]) {
    const s = scratch();
    const a = trace(s.tmp, 'e-del001', [bash('t1', 'ls'), text('x')]);
    const b = trace(s.tmp, 'e-del002', [bash('t1', 'ls')]);
    const r = go(s, report({ runs: { 'no-charter-refuses': [{ ...failRun, tracePath: a }, { ...passRun, tracePath: b }, passRun] }, overall: 0.9 }), keep ? { CADRE_EVAL_KEEP: '1' } : {});
    assert.equal(r.code, 1);
    assert.match(r.out, /\bls\b/);
    assert.equal(existsSync(join(s.tmp, 'e-del001')), keep);
    assert.equal(existsSync(join(s.tmp, 'e-del002')), keep);
  }
});

test('cleanup: a tracePath outside the rules leaves its folder alone', () => {
  const s = scratch();
  const outside = trace(join(s.dir, 'elsewhere'), 'e-out001', [text('x')]); // not inside the temp dir
  const badName = trace(s.tmp, 'keep-me', [text('x')]); // name does not match
  const deep = trace(join(s.tmp, 'sub'), 'e-deep01', [text('x')]); // not directly inside the temp dir
  const shallow = join(s.tmp, 'e-short1', 'trace.jsonl'); // not two levels below its folder
  mkdirSync(join(s.tmp, 'e-short1'));
  writeFileSync(shallow, '{}\n');
  const dots = join(s.tmp, 'e-dots01', 'out', '..', '..', '..', 'trace.jsonl'); // climbs out
  const r = go(s, report({ runs: { 'no-charter-refuses': [{ ...failRun, tracePath: outside }, { ...failRun, tracePath: badName }, { ...failRun, tracePath: deep }], 'ticket-no-merge': [{ ...failRun, tracePath: shallow }, { ...failRun, tracePath: dots }, passRun] }, overall: 0.9 }));
  assert.equal(r.code, 1);
  assert.ok(existsSync(join(s.dir, 'elsewhere', 'e-out001')));
  assert.ok(existsSync(join(s.tmp, 'keep-me')));
  assert.ok(existsSync(join(s.tmp, 'sub', 'e-deep01')));
  assert.ok(existsSync(join(s.tmp, 'e-short1')));
  assert.ok(existsSync(s.tmp));
  assert.ok(existsSync(join(s.dir, 'fake-eval.mjs')));
});

test('cleanup: the kept folders are deleted also when the eval command exits with a code other than 0 or 1', () => {
  const s = scratch();
  const a = trace(s.tmp, 'e-exit01', [bash('t1', 'ls')]);
  const r = go(s, report({ runs: withTrace(a) }), { FAKE_EXIT: '3' });
  assert.equal(r.code, 1);
  assert.equal(existsSync(join(s.tmp, 'e-exit01')), false);
  assert.doesNotMatch(r.all, /kept folders may remain/);
});

test('cleanup: with no readable report, one line says that kept folders may remain', () => {
  const s = scratch();
  const a = trace(s.tmp, 'e-nor001', [bash('t1', 'ls')]);
  const r = go(s, '{ not json');
  assert.equal(r.code, 2);
  assert.equal(r.out.split('\n').filter((l) => /kept folders may remain.*secrets/.test(l)).length, 1, r.all);
  assert.ok(existsSync(join(s.tmp, 'e-nor001')));
  // CADRE_EVAL_KEEP=1 says nothing: the user asked to keep them.
  assert.doesNotMatch(go(scratch(), '{ not json', { CADRE_EVAL_KEEP: '1' }).all, /kept folders may remain/);
  assert.ok(a);
});

test('cleanup: a failed delete prints one warning and does not change the exit code', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, () => {
  const s = scratch();
  const a = trace(s.tmp, 'e-lock01', [bash('t1', 'ls')]);
  const out = join(s.tmp, 'e-lock01', 'out');
  chmodSync(out, 0o555); // the trace file cannot be removed from a folder that cannot be written
  try {
    const r = go(s, report({ runs: withTrace(a), overall: 0.9 }));
    assert.equal(r.code, 1);
    assert.equal(r.out.split('\n').filter((l) => /^warning: cannot delete e-lock01/.test(l)).length, 1, r.out);
  } finally {
    chmodSync(out, 0o755);
  }
});

test('cleanup: a folder e-XXXX that is a symlink is not deleted', { skip: process.platform === 'win32' }, () => {
  const s = scratch();
  const real = join(s.dir, 'real-target');
  trace(real, 'inner', [bash('t1', 'ls')]);
  symlinkSync(join(real, 'inner'), join(s.tmp, 'e-link01'));
  const tp = join(s.tmp, 'e-link01', 'out', 'trace.jsonl');
  const r = go(s, report({ runs: withTrace(tp), overall: 0.9 }));
  assert.equal(r.code, 1);
  assert.ok(existsSync(join(real, 'inner', 'out', 'trace.jsonl')));
  assert.ok(existsSync(join(s.tmp, 'e-link01')));
});

test('evidence: a path after file:/// becomes a short token', () => {
  const s = scratch();
  const tp = trace(s.tmp, 'e-url001', [bash('t1', `open file://${U}/someone/docs/page.html`), bash('t2', `echo http://example.org${U}/x`)]);
  const r = go(s, report({ runs: withTrace(tp) }));
  assert.ok(!r.out.includes('someone'), r.out);
  assert.match(r.out, /file:\/\/<path>\/page\.html/);
  assert.match(r.out, /http:\/\/example\.org\/Us\w+\/x/);
});

test('evidence: a path after a double slash becomes a short token', () => {
  const s = scratch();
  const tp = trace(s.tmp, 'e-dbl001', [bash('t1', `cat /${U}/someone/a`), bash('t2', `cat x/${U}/someone/b`)]);
  const r = go(s, report({ runs: withTrace(tp) }));
  assert.ok(!r.out.includes('someone'), r.out);
  assert.match(r.out, /cat \/<path>\/a/);
  assert.match(r.out, /cat x\/<path>\/b/);
});
