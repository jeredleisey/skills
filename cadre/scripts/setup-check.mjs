// Checks that /cadre:setup runs before it asks a question. Each prints one line.
// Usage: node setup-check.mjs node
//        node setup-check.mjs gh <owner/repo> [host]
// Output and exit code:
//   ok node <version>       exit 0   Node 22 or later is installed
//   ok gh <owner/repo>      exit 0   the gh account can see the repo
//   stop: <what to do>      exit 1   setup must stop and tell the human this
//   unknown: <reason>       exit 2   the check cannot tell. This is never a pass.
//   usage message on stderr          exit 64  wrong arguments
// The `node` check cannot run when Node is missing. The skill tells the agent that
// "command not found" for `node` is the same stop.
// CADRE_NODE_CMD replaces `node --version` (a shell command). A test uses it.
// CADRE_GH_CMD replaces `gh` (a shell command). The script adds: api [--hostname <host>] repos/<owner>/<repo>
import { spawnSync } from 'node:child_process';

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

const [check, ...rest] = process.argv.slice(2);
if (check === 'node' && rest.length === 0) checkNode();
else if (check === 'gh' && rest.length >= 1 && rest.length <= 2) checkGh(rest[0], rest[1]);
else {
  console.error('usage: node setup-check.mjs node | gh <owner/repo> [host]');
  process.exit(64);
}
