// Shared code of the Azure DevOps (ADO) scripts: the remote URL and the REST client.
// Every ADO call goes through one command, so a test can replace it.
//   <command> <METHOD> "<url>" ["<body file>"]
// The command prints the HTTP status on line 1, with a continuation token after a space when the
// answer has one, and then the body. The default command is ado-call.mjs, which reads the token
// from AZURE_DEVOPS_EXT_PAT. CADRE_ADO_CMD (a shell command) replaces it. A test uses that.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const PAT_HINT = 'Check AZURE_DEVOPS_EXT_PAT: an empty variable is the first thing to check, then an expired token, then the scope of the token.';

// ---- the remote URL ----

const hostOf = (text) => {
  const url = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:]+)(?::\d+)?\/(.*)$/.exec(text);
  if (url) return { host: url[1].toLowerCase(), path: url[2] };
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/.exec(text);
  return scp ? { host: scp[1].toLowerCase(), path: scp[2] } : null;
};

function decode(segment) {
  let value;
  try {
    value = decodeURIComponent(segment);
  } catch {
    throw new Error(`the ADO remote has a bad percent code in ${segment}`);
  }
  if (value === '' || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('the ADO remote has an empty name or a control character');
  return value;
}

// Read an ADO remote URL. Return { org, project, repo }, or null when the remote is not ADO.
// Throw an Error with the reason when the host is ADO and the path is not readable.
export function parseRemote(url) {
  const found = hostOf(String(url ?? '').trim());
  if (!found) return null;
  const { host } = found;
  const parts = found.path.split('/');
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  const bad = () => new Error('the ADO remote is not <org>/<project>/_git/<repo> or v3/<org>/<project>/<repo>');
  let org;
  let rest;
  if (host === 'dev.azure.com') [org, ...rest] = parts;
  else if (host === 'ssh.dev.azure.com' || host === 'vs-ssh.visualstudio.com') {
    if (parts[0] !== 'v3') throw bad();
    if (parts.length !== 4) throw bad();
    return { org: decode(parts[1]), project: decode(parts[2]), repo: decode(parts[3]) };
  } else {
    const m = /^([a-z0-9][a-z0-9-]*)\.visualstudio\.com$/.exec(host);
    if (!m) return null;
    org = m[1];
    rest = parts[0]?.toLowerCase() === 'defaultcollection' ? parts.slice(1) : parts;
  }
  if (!org) throw bad();
  if (rest.length === 3 && rest[1] === '_git') return { org: decode(org), project: decode(rest[0]), repo: decode(rest[2]) };
  if (rest.length === 2 && rest[0] === '_git') return { org: decode(org), project: decode(rest[1]), repo: decode(rest[1]) };
  throw bad();
}

// ---- the REST client ----

export const ORG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const orgUrl = (org) => {
  if (!ORG.test(org ?? '')) throw new Error('the ADO organization is not a name');
  return `https://dev.azure.com/${org}`;
};
export const projectUrl = (org, project) => {
  if (typeof project !== 'string' || project === '' || /[\u0000-\u001f\u007f]/.test(project)) throw new Error('the ADO project is not a name');
  return `${orgUrl(org)}/${encodeURIComponent(project)}`;
};

const UNSAFE = /["`$\\\s]/;
const UNSAFE_PATH = /["`$]/;

// Run one call. Return { status, continuation, body } (body is text), or throw an Error with the reason.
export function request(method, url, bodyFile) {
  if (UNSAFE.test(url) || (bodyFile !== undefined && UNSAFE_PATH.test(bodyFile))) throw new Error('the ADO call holds a character that is not safe in a command');
  const command = process.env.CADRE_ADO_CMD || `"${process.execPath}" "${join(import.meta.dirname, 'ado-call.mjs')}"`;
  const tail = bodyFile === undefined ? '' : ` "${bodyFile}"`;
  const r = spawnSync(`${command} ${method} "${url}"${tail}`, { shell: true, encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    const why = (r.stderr ?? '').split('\n').find((l) => l.trim() !== '');
    throw new Error(`the ADO client failed: ${why?.slice(0, 200) ?? (r.error ? r.error.message : `exit ${r.status}`)}`);
  }
  const nl = r.stdout.indexOf('\n');
  const first = nl === -1 ? r.stdout : r.stdout.slice(0, nl);
  const m = /^(\d{3})(?: (\S+))?\r?$/.exec(first);
  if (!m) throw new Error('the ADO client printed no status line');
  return { status: Number(m[1]), continuation: m[2] ?? null, body: nl === -1 ? '' : r.stdout.slice(nl + 1) };
}

// A status that shows a dead sign-in: 302 and 203 are the sign-in page, 401 has no body.
export const isAuthFailure = (status, body) => status === 302 || status === 203 || status === 401 || (status === 200 && body.trim() === '');

// Read one answer that must be a 200 with a JSON body. Throw an Error with the reason otherwise.
export function readJson(what, method, url, bodyFile) {
  const r = request(method, url, bodyFile);
  if (isAuthFailure(r.status, r.body)) throw new Error(`ADO did not accept the token for ${what} (HTTP ${r.status}). ${PAT_HINT}`);
  if (r.status !== 200) throw new Error(`ADO answered HTTP ${r.status} for ${what}`);
  try {
    return { ...r, json: JSON.parse(r.body) };
  } catch {
    throw new Error(`the answer for ${what} is not JSON`);
  }
}
