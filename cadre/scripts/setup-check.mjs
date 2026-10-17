// Checks that /cadre:setup runs before it asks a question. Each prints one line.
// Usage: node setup-check.mjs node
//        node setup-check.mjs gh <owner/repo> [host]
//        node setup-check.mjs remote <url>
//        node setup-check.mjs ado <org> <project>
//        node setup-check.mjs local [url]
// Output and exit code:
//   ok node <version>       exit 0   Node 22 or later is installed
//   ok gh <owner/repo>      exit 0   the gh account can see the repo
//   ok ado-remote {"org":..,"repo":..,"project":..}   exit 0   the remote is an Azure DevOps (ADO) URL. The names
//                                    are URL-decoded JSON strings, and a repo or a project can hold a space.
//   ok not-ado              exit 0   the remote is not an ADO URL
//   ok local no-remote      exit 0   there is no remote: propose the local tracker
//   ok local other-host <host>  exit 0   the host is neither GitHub nor ADO: propose it, or ask if it is GitHub Enterprise
//   ok local path-remote    exit 0   the remote is a path on this machine, with no host
//   ok not-local            exit 0   the remote is GitHub or ADO
//   ok ado <org>/<project>  exit 0   the token in AZURE_DEVOPS_EXT_PAT can read the project
//   stop: <what to do>      exit 1   setup must stop and tell the human this
//   unknown: <reason>       exit 2   the check cannot tell. This is never a pass.
//   usage message on stderr          exit 64  wrong arguments
// The `node` check cannot run when Node is missing. The skill tells the agent that
// "command not found" for `node` is the same stop.
// CADRE_NODE_CMD replaces `node --version` (a shell command). A test uses it.
// CADRE_GH_CMD replaces `gh` (a shell command). The script adds: api [--hostname <host>] repos/<owner>/<repo>
// CADRE_ADO_CMD replaces the ADO client (a shell command, see ado.mjs). The ado check stops on a 302, a 401,
// a 203, or an empty body, and the line names AZURE_DEVOPS_EXT_PAT. A 404 and a 403 stop with their own line.
import { spawnSync } from 'node:child_process';
import { isAuthFailure, PAT_HINT, parseRemote, projectUrl, request } from './ado.mjs';

const MIN_NODE = 22;
const INSTALL_NODE = `Install Node ${MIN_NODE} or later from https://nodejs.org (a managed laptop may need your IT team), then type /cadre:setup again.`;

function say(line, code) {
  console.log(line);
  process.exit(code);
}

function exec(command) {
  const r = spawnSync(command, { shell: true, encoding: 'utf8', timeout: 30000 });
  return { ok: r.status === 0, status: r.status, text: `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim(), error: r.error };
}

const missing = (r) => r.status === 127 || /not found|not recognized|ENOENT|cannot find/i.test(r.text) || r.error?.code === 'ENOENT';

function checkNode() {
  const r = exec(process.env.CADRE_NODE_CMD || 'node --version');
  if (!r.ok && missing(r)) say(`stop: Node is not installed or not on PATH. ${INSTALL_NODE}`, 1);
  if (!r.ok) say(`unknown: the Node version command failed: ${r.text.split('\n')[0].slice(0, 200) || `exit ${r.status}`}`, 2);
  const m = /^v(\d+)\.\d+\.\d+/.exec(r.text);
  if (!m) say('unknown: the Node version output is not a version', 2);
  if (Number(m[1]) < MIN_NODE) say(`stop: Node ${m[1]} is too old. ${INSTALL_NODE}`, 1);
  say(`ok node ${r.text.split('\n')[0]}`, 0);
}

function checkGh(repo, host) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repo ?? '')) say('unknown: the repo is not <owner>/<repo>', 2);
  if (host !== undefined && !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host)) say('unknown: the host is not a host name', 2);
  const args = ['api', ...(host ? ['--hostname', host] : []), `repos/${repo}`];
  const r = exec(`${process.env.CADRE_GH_CMD || 'gh'} ${args.join(' ')}`);
  if (r.ok) say(`ok gh ${repo}`, 0);
  if (/HTTP 404/.test(r.text)) {
    say(`stop: gh cannot see ${repo} (HTTP 404). A 404 can mean the repo does not exist, or that gh uses the wrong account. Type "gh auth switch", then type /cadre:setup again.`, 1);
  }
  if (/HTTP 401/.test(r.text)) {
    say(`stop: gh is not signed in for ${repo} (HTTP 401). Type "gh auth switch" to pick an account, or "gh auth login", then type /cadre:setup again.`, 1);
  }
  if (/gh auth login|not logged in/i.test(r.text)) {
    say('stop: gh is not signed in. Type "gh auth login", or "gh auth switch" to pick another account, then type /cadre:setup again.', 1);
  }
  if (missing(r)) say('stop: gh is not installed or not on PATH. Install the GitHub CLI from https://cli.github.com, then type /cadre:setup again.', 1);
  say(`unknown: gh failed: ${r.text.split('\n')[0].slice(0, 200) || `exit ${r.status}`}`, 2);
}

function checkRemote(url) {
  if (!url) say('unknown: no remote URL', 2);
  let found;
  try {
    found = parseRemote(url);
  } catch (e) {
    say(`unknown: ${e.message}`, 2);
  }
  say(found ? `ok ado-remote ${JSON.stringify(found)}` : 'ok not-ado', 0);
}

function checkLocal(url) {
  if (!url?.trim()) say('ok local no-remote', 0);
  if (/^(\/|\.\.?[\\/]|~[\\/]|file:\/\/|[A-Za-z]:[\\/])/.test(url.trim())) say('ok local path-remote', 0);
  const m = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:]+)(?::\d+)?\//.exec(url.trim()) || /^(?:[^@/\s]+@)?([^:/\s]+):./.exec(url.trim());
  if (!m) say('unknown: the remote URL has no host', 2);
  const host = m[1].toLowerCase();
  if (host === 'github.com') say('ok not-local', 0);
  try {
    if (parseRemote(url)) say('ok not-local', 0);
  } catch {
    say('ok not-local', 0); // an ADO host with a bad path: the remote check reports it
  }
  say(`ok local other-host ${host}`, 0);
}

// A read of the work item types of the project proves three things: the host, the project, and the token scope.
function checkAdo(org, project) {
  let r;
  try {
    r = request('GET', `${projectUrl(org, project)}/_apis/wit/workitemtypes?api-version=7.1`);
  } catch (e) {
    say(`unknown: ${e.message}`, 2);
  }
  if (isAuthFailure(r.status, r.body)) say(`stop: ADO did not accept the token (HTTP ${r.status}). ${PAT_HINT} Then type /cadre:setup again.`, 1);
  if (r.status === 404) say(`stop: ADO cannot see the project ${project} in ${org} (HTTP 404). Check the names of the organization and the project, and that the token covers this organization.`, 1);
  if (r.status === 403) say(`stop: the token has no access to the project ${project} (HTTP 403). Make a token with the scope Work Items (Read) and Code (Read), then type /cadre:setup again.`, 1);
  if (r.status !== 200) say(`unknown: ADO answered HTTP ${r.status}`, 2);
  try {
    if (typeof JSON.parse(r.body) !== 'object' || JSON.parse(r.body) === null) throw new Error('x');
  } catch {
    say('unknown: the answer of ADO is not JSON', 2);
  }
  say(`ok ado ${org}/${project}`, 0);
}

const [check, ...rest] = process.argv.slice(2);
if (check === 'node' && rest.length === 0) checkNode();
else if (check === 'remote' && rest.length === 1) checkRemote(rest[0]);
else if (check === 'local' && rest.length <= 1) checkLocal(rest[0]);
else if (check === 'ado' && rest.length === 2) checkAdo(rest[0], rest[1]);
else if (check === 'gh' && rest.length >= 1 && rest.length <= 2) checkGh(rest[0], rest[1]);
else {
  console.error('usage: node setup-check.mjs node | gh <owner/repo> [host] | remote <url> | local [url] | ado <org> <project>');
  process.exit(64);
}
