// Tests for ado-call.mjs at its command line: arguments and environment in, a status line and a body out.
// A local HTTP server stands in for ADO. CADRE_ADO_ALLOW_LOCAL=1 lets the script call 127.0.0.1.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, 'ado-call.mjs');
const dir = mkdtempSync(join(tmpdir(), 'cadre-ado-call-'));
const seen = [];
let reply = { status: 200, headers: {}, body: '{}' };
let server;
let base;

before(async () => {
  server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization ?? null, type: req.headers['content-type'] ?? null, body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(reply.status, reply.headers);
      res.end(reply.body);
    });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((ok) => server.close(ok));
  rmSync(dir, { recursive: true, force: true });
});

function run(args, env = {}) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, [script, ...args], { env: { ...process.env, AZURE_DEVOPS_EXT_PAT: 'tok', CADRE_ADO_ALLOW_LOCAL: '1', ...env } });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    child.on('close', (code) => ok({ out, err, code }));
  });
}

test('a GET prints the status line and the body, with the token as basic auth and an empty user', async () => {
  seen.length = 0;
  reply = { status: 200, headers: {}, body: '{"a":1}' };
  const r = await run(['GET', `${base}/x?api-version=7.1`]);
  assert.deepEqual([r.out, r.code], ['200\n{"a":1}', 0]);
  assert.equal(seen[0].auth, `Basic ${Buffer.from(':tok').toString('base64')}`);
  assert.deepEqual([seen[0].method, seen[0].url], ['GET', '/x?api-version=7.1']);
});

test('a 302 is not followed: its status is the answer', async () => {
  reply = { status: 302, headers: { location: `${base}/signin` }, body: '' };
  seen.length = 0;
  const r = await run(['GET', `${base}/x`]);
  assert.deepEqual([r.out, r.code, seen.length], ['302\n', 0, 1]);
});

test('a 401 with an empty body prints the status and nothing more', async () => {
  reply = { status: 401, headers: {}, body: '' };
  const r = await run(['GET', `${base}/x`]);
  assert.deepEqual([r.out, r.code], ['401\n', 0]);
});

test('a continuation token in the header goes after the status', async () => {
  reply = { status: 200, headers: { 'x-ms-continuationtoken': 'abc123' }, body: '{"value":[]}' };
  const r = await run(['GET', `${base}/x`]);
  assert.equal(r.out, '200 abc123\n{"value":[]}');
});

test('an empty variable sends no Authorization header', async () => {
  reply = { status: 302, headers: {}, body: '' };
  seen.length = 0;
  await run(['GET', `${base}/x`], { AZURE_DEVOPS_EXT_PAT: '' });
  assert.equal(seen[0].auth, null);
});

test('a body file that holds a list is sent as a JSON patch, an object as JSON', async () => {
  reply = { status: 200, headers: {}, body: '{}' };
  const patch = join(dir, 'patch.json');
  const obj = join(dir, 'obj.json');
  writeFileSync(patch, '[{"op":"test","path":"/rev","value":3}]');
  writeFileSync(obj, '{"query":"q"}');
  seen.length = 0;
  await run(['PATCH', `${base}/x`, patch]);
  await run(['POST', `${base}/y`, obj]);
  assert.deepEqual(seen.map((s) => [s.method, s.type, s.body]), [
    ['PATCH', 'application/json-patch+json', '[{"op":"test","path":"/rev","value":3}]'],
    ['POST', 'application/json', '{"query":"q"}'],
  ]);
});

test('a host that is not ADO is refused before any call, so the token never leaves', async () => {
  seen.length = 0;
  for (const url of ['https://example.com/x', 'https://dev.azure.com.example.com/x', 'http://dev.azure.com/x', 'ftp://dev.azure.com/x']) {
    const r = await run(['GET', url]);
    assert.equal(r.code, 64, url);
    assert.match(r.err, /ADO host/);
  }
  const noFlag = await run(['GET', `${base}/x`], { CADRE_ADO_ALLOW_LOCAL: '' });
  assert.equal(noFlag.code, 64);
  assert.equal(seen.length, 0);
});

test('a wrong method, a missing argument, and a missing body file are errors', async () => {
  assert.equal((await run(['DELETE', `${base}/x`])).code, 64);
  assert.equal((await run(['GET'])).code, 64);
  const r = await run(['PATCH', `${base}/x`, join(dir, 'nope.json')]);
  assert.equal(r.code, 2);
  assert.equal(r.out, '');
});

test('a network failure prints no status line and exits 2', async () => {
  const r = await run(['GET', 'http://127.0.0.1:9/x']);
  assert.equal(r.code, 2);
  assert.equal(r.out, '');
  assert.match(r.err, /^ado-call: /);
});

test('a PATCH or POST to a pull request is refused before any call, in any case or encoding', async () => {
  seen.length = 0;
  const paths = ['pullrequests/7', 'pullRequests/7', 'PullRequests/7', '%70ullrequests/7', '%70ullrequests/7%FF', 'pullrequests;x/7'];
  for (const method of ['PATCH', 'POST']) {
    for (const p of paths) {
      const r = await run([method, `${base}/org/proj/_apis/git/repositories/r/${p}?api-version=7.1`]);
      assert.equal(r.code, 64, `${method} ${p}`);
      assert.equal(r.out, '');
      assert.match(r.err, /az repos pr update/);
    }
  }
  assert.equal(seen.length, 0);
});

test('a GET of a pull request and a PATCH of a work item still go', async () => {
  reply = { status: 200, headers: {}, body: '{}' };
  seen.length = 0;
  const get = await run(['GET', `${base}/org/proj/_apis/git/repositories/r/pullrequests/7?api-version=7.1`]);
  const patch = join(dir, 'wi.json');
  writeFileSync(patch, '[{"op":"test","path":"/rev","value":1}]');
  const wi = await run(['PATCH', `${base}/org/proj/_apis/wit/workitems/9?api-version=7.1`, patch]);
  assert.deepEqual([get.code, wi.code, seen.map((s) => s.method)], [0, 0, ['GET', 'PATCH']]);
});
