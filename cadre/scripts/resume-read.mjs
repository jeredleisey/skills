// Read an orchestrator issue for a resume: owner check, holder, ledger audit, newest checkpoint.
// Usage: node resume-read.mjs <issue-number> [session-id]
// Output and exit code:
//   ok holder=<free|same-host|other-host> session=<id|none> checkpoint=<comment id|none>
//      state=<open|closed> bad-rows=<list|none> ended-rows=<list|none>   exit 0
//   not-owner login=<login> assignee=<login>                              exit 1
//   unknown: <reason>                                                     exit 2
//   usage message on stderr                                               exit 64
// The owner check comes first. The tracker user must equal the one assignee.
// holder compares the host line of the Holder section with the host id of this machine.
// bad-rows: ledger rows (1 is the first row after the header) whose Granted by is not the assignee.
// ended-rows: ledger rows whose When holds "session <id>" with an id other than session-id.
// With no session-id, each such row ended.
// checkpoint: the id of the comment with the marker line "cadre-checkpoint v1 <ISO UTC time>"
// and the latest time, written by the assignee.
// The script never prints ok after a failure.
// Set CADRE_GH_CMD to use another command than gh, for example a fixture in a test.
// The host id comes from host-id.mjs, so CADRE_HOME applies.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

function done(line, code) {
  console.log(line);
  process.exit(code);
}
const unknown = (reason) => done(`unknown: ${reason}`, 2);

const [issueNumber, sessionArg, ...extra] = process.argv.slice(2);
if (!/^[0-9]+$/.test(issueNumber ?? '') || extra.length > 0) {
  console.error('usage: resume-read.mjs <issue-number> [session-id]');
  process.exit(64);
}

const gh = process.env.CADRE_GH_CMD || 'gh';
function ghRead(what, args) {
  const r = spawnSync(`${gh} ${args}`, { shell: true, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'] });
  if (r.status !== 0 || !r.stdout.trim()) unknown(`gh failed to read ${what}`);
  return r.stdout;
}
function ghJson(what, args) {
  try {
    return JSON.parse(ghRead(what, args));
  } catch {
    return unknown(`the output for ${what} is not JSON`);
  }
}

const login = ghRead('the user', 'api user --jq .login').trim();
const issue = ghJson('the issue', `api repos/{owner}/{repo}/issues/${issueNumber}`);
const assignees = Array.isArray(issue.assignees) ? issue.assignees : [];
if (assignees.length !== 1 || !assignees[0]?.login) unknown(`the issue needs exactly one assignee, it has ${assignees.length}`);
const assignee = assignees[0].login;
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
if (!same(login, assignee)) done(`not-owner login=${login} assignee=${assignee}`, 1);

const text = String(issue.body ?? '').replace(/\r\n/g, '\n');
function section(name) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${name}`.toLowerCase());
  if (start < 0) return unknown(`the body has no ${name} section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return end < 0 ? rest : rest.slice(0, end);
}

// Holder
const holder = {};
for (const line of section('Holder')) {
  const m = /^\s*[-*]?\s*(session|host|since):\s*`?([^`\s]*)`?\s*$/i.exec(line);
  if (m) holder[m[1].toLowerCase()] = m[2];
}
if (!holder.session || !holder.host) unknown('the Holder section lacks a session or a host line');
let who = 'free';
if (holder.session.toLowerCase() !== 'none') {
  const r = spawnSync(process.execPath, [join(import.meta.dirname, 'host-id.mjs')], { encoding: 'utf8', timeout: 20000 });
  const id = (r.stdout ?? '').trim();
  if (r.status !== 0 || !/^[0-9a-f]{32}$/.test(id)) unknown('cannot read the host id of this machine');
  who = holder.host.toLowerCase() === id ? 'same-host' : 'other-host';
}

// Ledger
const bad = [];
const ended = [];
const rows = section('Ledger').filter((l) => l.trim().startsWith('|')).slice(1); // drop the header
let rowNumber = 0;
for (const line of rows) {
  const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  if (cells.every((c) => /^[:\s-]*$/.test(c))) continue; // the separator, or an empty row
  rowNumber += 1;
  if (cells.length !== 5 || !same(cells[0], assignee)) bad.push(rowNumber);
  const s = /session\s+(\S+)/i.exec(cells[4] ?? '');
  if (s && !(sessionArg && same(s[1], sessionArg))) ended.push(rowNumber);
}

// Checkpoint
const MARKER = /^cadre-checkpoint v1 (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/;
const comments = ghJson('the comments', `api --paginate --slurp repos/{owner}/{repo}/issues/${issueNumber}/comments`);
if (!Array.isArray(comments)) unknown('the comments are not a JSON array');
let newest = null;
for (const c of comments.flat()) {
  if (!same(String(c?.user?.login ?? ''), assignee)) continue; // only the owner writes a checkpoint
  const m = MARKER.exec(String(c?.body ?? '').split('\n')[0].trim());
  const time = m ? Date.parse(m[1]) : NaN;
  if (Number.isNaN(time)) continue;
  if (!newest || time >= newest.time) newest = { time, id: c.id };
}

const list = (a) => (a.length ? a.join(',') : 'none');
done(
  `ok holder=${who} session=${holder.session} checkpoint=${newest ? newest.id : 'none'} state=${String(issue.state).toLowerCase()} bad-rows=${list(bad)} ended-rows=${list(ended)}`,
  0,
);
