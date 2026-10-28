// The ADO client. One REST call, no other work. The token never leaves for another host.
// Usage: node ado-call.mjs <GET|POST|PATCH> <url> [body file]
// Output and exit code:
//   <status>[ <continuation token>]   line 1, then the body    exit 0   any HTTP answer, a 302 and a 401 too
//   a reason on stderr                                         exit 2   no answer, or the body file is unreadable
//   usage message on stderr                                    exit 64  wrong arguments, a host that is not ADO, or a POST or PATCH to a pull request
// The token is AZURE_DEVOPS_EXT_PAT, sent as basic auth with an empty user. An empty variable sends no
// header, and ADO then answers 302. A redirect is never followed.
// A body file that holds a JSON list goes as application/json-patch+json, any other file as application/json.
// Only a test sets CADRE_ADO_ALLOW_LOCAL=1, which lets the script call http://127.0.0.1.
import { readFileSync } from 'node:fs';

const [method, url, bodyFile, ...extra] = process.argv.slice(2);
const stop = (message, code) => {
  console.error(message);
  process.exit(code);
};

if (!['GET', 'POST', 'PATCH'].includes(method) || !url || extra.length > 0) stop('usage: ado-call.mjs <GET|POST|PATCH> <url> [body file]', 64);
let target;
try {
  target = new URL(url);
} catch {
  stop('usage: the url is not a URL', 64);
}
const host = target.hostname.toLowerCase();
const adoHost = target.protocol === 'https:' && (host === 'dev.azure.com' || /^[a-z0-9][a-z0-9-]*\.visualstudio\.com$/.test(host));
const localHost = process.env.CADRE_ADO_ALLOW_LOCAL === '1' && target.protocol === 'http:' && host === '127.0.0.1';
if (!adoHost && !localHost) stop(`usage: ${host} is not an ADO host, so the token stays here`, 64);

// The guard reads `az repos pr update`, but it cannot read a REST write. So a write to a pull request goes through az.
// Each segment is decoded alone. A write with a segment that does not decode is refused, so the check fails closed.
const writesPullRequest = target.pathname.split('/').some((segment) => {
  try {
    return decodeURIComponent(segment).toLowerCase().split(';')[0] === 'pullrequests';
  } catch {
    return true;
  }
});
if (method !== 'GET' && writesPullRequest) {
  stop('usage: ado-call does not write to a pull request, or to a path that does not decode. Complete or change a pull request with az repos pr update, so that the guard sees it', 64);
}

const headers = { Accept: 'application/json' };
const token = process.env.AZURE_DEVOPS_EXT_PAT ?? '';
if (token !== '') headers.Authorization = `Basic ${Buffer.from(`:${token}`).toString('base64')}`;
let body;
if (bodyFile !== undefined) {
  try {
    body = readFileSync(bodyFile, 'utf8');
  } catch (e) {
    stop(`ado-call: cannot read the body file: ${e.code || e.message}`, 2);
  }
  let list = false;
  try {
    list = Array.isArray(JSON.parse(body));
  } catch {
    list = false;
  }
  headers['Content-Type'] = list ? 'application/json-patch+json' : 'application/json';
}

try {
  const res = await fetch(target, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  const next = res.headers.get('x-ms-continuationtoken');
  process.stdout.write(`${res.status}${next ? ` ${next}` : ''}\n${text}`);
} catch (e) {
  stop(`ado-call: no answer from ${host}: ${e.cause?.code || e.message}`, 2);
}
