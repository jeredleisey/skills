// Tell if a live Claude Code session on this machine holds a session id.
// Usage: node holder-check.mjs <session-id>
// Output and exit code:
//   held pid=<pid> name=<name> cwd=<cwd> status=<status>   exit 0   another session holds it
//   free                                                   exit 1   no live session holds it
//   unknown: <reason>                                      exit 2   the check cannot tell
//   self pid=<pid>                                         exit 3   this session holds it
//   usage message on stderr                                exit 64  wrong arguments
// The source is `claude agents --json`, which prints a JSON array of the active
// sessions with the fields pid, sessionId, name, cwd, kind, and status. A listed
// pid can be stale, and a pid can go to a new process. So for each entry with the
// id, the script checks that the process is alive and can be Claude. It says free
// only when it can prove that each listed pid is dead or is another program. Any
// failure to run a command, to parse its output, or to read a process gives unknown.
// A process named node (an npm install) or a shell of Git Bash on Windows can be
// Claude, so it counts as a possible Claude process and gives held.
// Set CLAUDE_AGENTS_JSON_CMD to a shell command that prints the sessions, for
// example a test that reads a fixture. Set CADRE_PROCESS_CMD to a shell command
// that checks one process. It gets the pid in the variable CADRE_PID. It prints
// `dead`, or `alive <process name>`, and exits 0. Any other result cannot be checked.
// Set CLAUDE_PID to the pid of this session, so that the script can print self.
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Names of a process that can be Claude: a native install, an npm install (node),
// and the shells of Git Bash on Windows.
const MAYBE_CLAUDE = new Set(['node', 'nodejs', 'bun', 'bash', 'sh', 'mintty', 'git-bash']);

function done(line, code) {
  console.log(line);
  process.exit(code);
}

function runShell(cmd, env = {}) {
  return spawnSync(cmd, {
    shell: true,
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

// The process check of this OS: { alive: false }, { alive: true, name }, or a throw.
function readProcess(pid) {
  try {
    process.kill(pid, 0);
  } catch (e) {
    if (e.code === 'ESRCH') return { alive: false };
    if (e.code !== 'EPERM') throw e; // EPERM: the process exists, and this user does not own it
  }
  let name;
  if (process.platform === 'linux') {
    name = readFileSync(`/proc/${pid}/comm`, 'utf8');
  } else if (process.platform === 'win32') {
    const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
    const m = /^"([^"]+)","(\d+)"/m.exec(out);
    if (!m || m[2] !== String(pid)) throw new Error('tasklist does not list the pid');
    name = m[1];
  } else {
    name = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' });
  }
  name = name.trim();
  if (!name) throw new Error('empty process name');
  return { alive: true, name };
}

function checkProcess(pid) {
  const custom = process.env.CADRE_PROCESS_CMD;
  if (!custom) return readProcess(pid);
  const r = runShell(custom, { CADRE_PID: String(pid) });
  if (r.status !== 0) throw new Error(`the command exited ${r.status ?? r.error?.code}`);
  const text = r.stdout.trim();
  if (text === 'dead') return { alive: false };
  const m = /^alive\s+(\S.*)$/.exec(text);
  if (m) return { alive: true, name: m[1].trim() };
  throw new Error('the command printed an unknown result');
}

function programName(name) {
  return basename(name.replaceAll('\\', '/')).toLowerCase().replace(/\.exe$/, '');
}

// A native install can run from a file named for its version, for example
// .../claude/versions/2.1.5, so a name is another program only when it matches none of these.
function canBeClaude(name) {
  const program = programName(name);
  return program === 'claude' || MAYBE_CLAUDE.has(program) || /^[0-9]+(\.[0-9]+)*$/.test(program) ||
    name.toLowerCase().includes('claude');
}

if (process.argv.length !== 3 || !process.argv[2]) {
  console.error('usage: holder-check.mjs <session-id>');
  process.exit(64);
}
const want = process.argv[2];
if (!UUID.test(want)) done(`unknown: not a session id: ${want}`, 2); // a name cannot be checked

const cmd = process.env.CLAUDE_AGENTS_JSON_CMD || 'claude agents --json';
const r = runShell(cmd);
if (r.status !== 0) done(`unknown: the command failed: ${cmd}`, 2);
if (!r.stdout.trim()) done(`unknown: the command printed nothing: ${cmd}`, 2);

let list;
try {
  list = JSON.parse(r.stdout);
} catch {
  list = null;
}
if (!Array.isArray(list) || list.some((s) => s === null || typeof s !== 'object' || Array.isArray(s))) {
  done('unknown: the output is not a JSON array of sessions', 2);
}

let failed = '';
let held = '';
for (const s of list.filter((entry) => entry.sessionId === want)) {
  const pid = String(s.pid ?? '');
  if (!/^[0-9]+$/.test(pid)) {
    failed = `no pid in the entry for ${want}`;
    continue;
  }
  let p;
  try {
    p = checkProcess(Number(pid));
  } catch (e) {
    failed = `cannot check process ${pid}: ${e.message}`;
    continue;
  }
  if (!p.alive) continue; // a stale entry: its process died
  if (!canBeClaude(p.name)) continue; // the pid went to another program
  if (pid === (process.env.CLAUDE_PID ?? '')) done(`self pid=${pid}`, 3); // self wins over another entry
  held ||= `held pid=${pid} name=${s.name ?? ''} cwd=${s.cwd ?? ''} status=${s.status ?? ''}`;
}
if (held) done(held, 0);
if (failed) done(`unknown: ${failed}`, 2);
done('free', 1);
