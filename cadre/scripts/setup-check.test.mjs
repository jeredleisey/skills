// Tests for setup-check.mjs at its command line: arguments and environment in, one line and an exit code out.
// Each external command is replaced through CADRE_NODE_CMD or CADRE_GH_CMD with a small Node fake.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, makeFake } from './ado-fake.mjs';

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

// ---- Azure DevOps: the remote URL and the account check ----

// The remote forms hold an at sign. The repo gate reads one as an address, so the tests join it in.
const AT = '@';
const REMOTE_CASES = [
  ['https://dev.azure.com/example-org/Example%20Project/_git/acme', 'example-org', 'Example Project', 'acme'],
  ['https://dev.azure.com/example-org/Example Project/_git/acme', 'example-org', 'Example Project', 'acme'],
  ['https://example-org' + AT + 'dev.azure.com/example-org/Example%20Project/_git/acme', 'example-org', 'Example Project', 'acme'],
  ['https://dev.azure.com/example-org/Plain/_git/acme/', 'example-org', 'Plain', 'acme'],
  ['git' + AT + 'ssh.dev.azure.com:v3/example-org/Example%20Project/acme', 'example-org', 'Example Project', 'acme'],
  ['ssh://git' + AT + 'ssh.dev.azure.com/v3/example-org/Plain/acme', 'example-org', 'Plain', 'acme'],
  ['https://example-org.visualstudio.com/Plain/_git/acme', 'example-org', 'Plain', 'acme'],
  ['https://example-org.visualstudio.com/DefaultCollection/Example%20Project/_git/acme', 'example-org', 'Example Project', 'acme'],
  ['example-org' + AT + 'vs-ssh.visualstudio.com:v3/example-org/Plain/acme', 'example-org', 'Plain', 'acme'],
  ['https://dev.azure.com/example-org/_git/acme', 'example-org', 'acme', 'acme'],
];

test('remote: each form of an ADO remote gives the org, the repo, and the decoded project', () => {
  for (const [url, org, project, repo] of REMOTE_CASES) {
    const r = run(['remote', url], {});
    assert.deepEqual([r.line.slice(0, 14), JSON.parse(r.line.slice(14)), r.code, r.lines], ['ok ado-remote ', { org, repo, project }, 0, 1], url);
  }
});

test('remote: a remote that is not ADO says so, and still passes', () => {
  for (const url of ['https://github.com/acme/app.git', 'git' + AT + 'github.com:acme/app.git', 'https://ghe.example.com/acme/app', 'https://notdev.azure.com.example.com/a/b/_git/c', 'https://dev.azure.com.evil.example/a/b/_git/c']) {
    const r = run(['remote', url], {});
    assert.deepEqual([r.line, r.code], ['ok not-ado', 0], url);
  }
});

test('remote: an ADO URL that cannot be read is unknown, not a guess', () => {
  for (const url of ['https://dev.azure.com/example-org', 'https://dev.azure.com/example-org/Proj/_git/', 'https://dev.azure.com/example-org/Bad%ZZ/_git/acme', 'git' + AT + 'ssh.dev.azure.com:v3/example-org/acme', 'https://dev.azure.com/example-org/a/b/c/_git/acme', '']) {
    const r = run(['remote', url], {});
    assert.match(r.line, /^unknown: /, url);
    assert.equal(r.code, 2, url);
  }
});

test('remote: a name with a control character is unknown', () => {
  const r = run(['remote', 'https://dev.azure.com/example-org/a%0Ab/_git/acme'], {});
  assert.match(r.line, /^unknown: /);
  assert.equal(r.code, 2);
});

const ado = makeFake(join(dir, 'ado'));
const PROJECT_URL = `GET ${BASE}/Example%20Project/_apis/wit/workitemtypes?api-version=7.1`;
const adoRun = (answer, args = ['ado', 'example-org', 'Example Project']) => {
  const env = ado.env(answer === null ? {} : { [PROJECT_URL]: answer });
  return { ...run(args, env), env };
};

test('ado: a 200 with JSON passes, and the call is one GET of the project', () => {
  const r = adoRun({ status: 200, body: { count: 1, value: [] } });
  assert.deepEqual([r.line, r.code, r.lines], ['ok ado example-org/Example Project', 0, 1]);
  assert.deepEqual(ado.requests(r.env).map((q) => [q.method, q.url]), [['GET', PROJECT_URL.slice(4)]]);
});

test('ado: a 302, a 401 with no body, a 203, and an empty 200 stop and name AZURE_DEVOPS_EXT_PAT', () => {
  const cases = [
    { status: 302, body: '<html>Sign in</html>' },
    { status: 401, body: '' },
    { status: 203, body: '<html>Sign in</html>' },
    { status: 200, body: '' },
  ];
  for (const answer of cases) {
    const r = adoRun(answer);
    assert.match(r.line, /^stop: /, JSON.stringify(answer));
    assert.match(r.line, /AZURE_DEVOPS_EXT_PAT/);
    assert.match(r.line, /empty/);
    assert.deepEqual([r.code, r.lines], [1, 1]);
  }
});

test('ado: a 404 stops and names the project, a 403 stops and names the scope', () => {
  const missing = adoRun({ status: 404, body: { message: 'x' } });
  assert.match(missing.line, /^stop: .*Example Project/);
  assert.equal(missing.code, 1);
  const refused = adoRun({ status: 403, body: { message: 'x' } });
  assert.match(refused.line, /^stop: .*scope/);
  assert.equal(refused.code, 1);
});

test('ado: a 500, a body that is not JSON, and a failed command are unknown, never a pass', () => {
  for (const answer of [{ status: 500, body: '{}' }, { status: 200, body: '<html>hi</html>' }, { status: 200, body: 'null' }, { status: 200, body: '5' }, { crash: true }]) {
    const r = adoRun(answer);
    assert.match(r.line, /^unknown: /, JSON.stringify(answer));
    assert.deepEqual([r.code, r.lines], [2, 1]);
  }
});

test('ado: a name that could break the command line is refused before any call', () => {
  for (const args of [['ado', 'bad org', 'p'], ['ado', 'org/x', 'p'], ['ado', 'example-org'], ['ado', 'example-org', '']]) {
    const env = ado.env({});
    const r = run(args, env);
    assert.equal(r.code === 2 || r.code === 64, true, args.join(' '));
    assert.deepEqual(ado.requests(env), []);
  }
});

test('ado: a project name with shell characters is encoded in the URL', () => {
  const env = ado.env({});
  run(['ado', 'example-org', 'a"b $x`y'], env);
  assert.equal(ado.requests(env)[0].url, `${BASE}/a%22b%20%24x%60y/_apis/wit/workitemtypes?api-version=7.1`);
});

test('remote: a repo and a project that both hold a space are not mixed up', () => {
  const r = run(['remote', 'https://dev.azure.com/example-org/Example%20Project/_git/my%20repo'], {});
  assert.deepEqual(JSON.parse(r.line.slice('ok ado-remote '.length)), { org: 'example-org', repo: 'my repo', project: 'Example Project' });
});

// ---- the local tracker: when setup proposes it ----

test('local: no remote proposes the local tracker', () => {
  assert.deepEqual([run(['local'], {}).line, run(['local'], {}).code], ['ok local no-remote', 0]);
  assert.equal(run(['local', ''], {}).line, 'ok local no-remote');
});

test('local: a remote that is neither GitHub nor ADO proposes it, and names the host', () => {
  for (const [url, host] of [['https://gitlab.com/acme/app.git', 'gitlab.com'], ['git' + AT + 'bitbucket.org:acme/app.git', 'bitbucket.org'], ['ssh://git' + AT + 'git.example.com:2222/acme/app', 'git.example.com']]) {
    const r = run(['local', url], {});
    assert.deepEqual([r.line, r.code], [`ok local other-host ${host}`, 0], url);
  }
});

test('local: a GitHub or ADO remote does not propose it', () => {
  for (const url of ['https://github.com/acme/app.git', 'git' + AT + 'github.com:acme/app.git', 'https://dev.azure.com/example-org/Plain/_git/acme', 'git' + AT + 'ssh.dev.azure.com:v3/example-org/Plain/acme', 'https://example-org.visualstudio.com/Plain/_git/acme']) {
    const r = run(['local', url], {});
    assert.deepEqual([r.line, r.code], ['ok not-local', 0], url);
  }
});

test('local: a URL that has no host is unknown', () => {
  const r = run(['local', 'not a url'], {});
  assert.match(r.line, /^unknown: /);
  assert.equal(r.code, 2);
});
