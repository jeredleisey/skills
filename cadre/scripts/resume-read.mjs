// Read an orchestrator issue for a resume: owner check, holder, ledger audit, newest checkpoint.
// Usage: node resume-read.mjs <issue-number> [session-id]
// Output and exit code:
//   ok holder=<free|self|same-host|other-host> session=<id|none> checkpoint=<comment id|none>
//      ignored=<list|none> state=<open|closed> bad-rows=<list|none> ended-rows=<list|none>   exit 0
//   not-owner login=<login> assignee=<login>                              exit 1
//   unknown: <reason>                                                     exit 2
//   usage message on stderr                                               exit 64
// The issue must carry the label cadre:orchestrator and must not be a pull request.
// The owner check comes next. The tracker user must equal the one assignee.
// holder=self: the session of the Holder equals session-id. No process check is needed.
// Otherwise holder compares the host line of the Holder section with the host id of this machine.
// The body is unknown when a section heading is twice, a heading is inside a code fence,
// the Ledger header is not the expected one, or the Holder holds anything but its three fields.
// bad-rows: ledger rows (1 is the first row after the header) whose Granted by is not the assignee.
// ended-rows: ledger rows whose When holds "session <id>" with an id other than session-id.
// With no session-id, each such row ended.
// checkpoint: the id of the comment with the marker line "cadre-checkpoint v1 <ISO UTC time>"
// and the latest time, written by the assignee, with the three sections.
// ignored: ids of such comments with a marker time more than 5 minutes ahead of now.
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
if (issue.pull_request) unknown(`#${issueNumber} is a pull request`);
if (!(Array.isArray(issue.labels) ? issue.labels : []).some((l) => l?.name === 'cadre:orchestrator')) {
  unknown(`#${issueNumber} lacks the label cadre:orchestrator`);
}
const assignees = Array.isArray(issue.assignees) ? issue.assignees : [];
if (assignees.length !== 1 || !assignees[0]?.login) unknown(`the issue needs exactly one assignee, it has ${assignees.length}`);
const assignee = assignees[0].login;
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
if (!same(login, assignee)) done(`not-owner login=${login} assignee=${assignee}`, 1);

const text = String(issue.body ?? '').replace(/\r\n/g, '\n');
// Split the body into sections by `##` heading. A heading in a code fence, or twice, is unknown.
const sections = new Map();
{
  let current = null;
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    else if (/^##\s/.test(line)) {
      if (fenced) unknown('a heading is inside a code fence');
      const title = line.replace(/^##\s+/, '').trim();
      if (sections.has(title.toLowerCase())) unknown(`the body has the heading ${title} twice`);
      sections.set(title.toLowerCase(), (current = []));
      continue;
    }
    if (current) current.push(line);
  }
  if (fenced) unknown('a code fence is not closed');
}
function section(name) {
  return sections.get(name.toLowerCase()) ?? unknown(`the body has no ${name} section`);
}

// Holder
const holder = {};
const VALUE = { session: /^(none|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, host: /^(none|[0-9a-f]{32})$/, since: /^\S+$/ };
for (const line of section('Holder')) {
  if (!line.trim()) continue;
  const m = /^\s*[-*]?\s*(session|host|since):\s*`?([^`\s]*)`?\s*$/i.exec(line);
  const key = m?.[1].toLowerCase();
  if (!m || !VALUE[key].test(m[2])) unknown(`the Holder section has a bad line: ${line.trim().slice(0, 40)}`);
  if (key in holder) unknown(`the Holder section has ${key} twice`);
  holder[key] = m[2];
}
if (!holder.session || !holder.host) unknown('the Holder section lacks a session or a host line');
let who = 'free';
if (sessionArg && holder.session.toLowerCase() === sessionArg.toLowerCase()) {
  who = 'self';
} else if (holder.session.toLowerCase() !== 'none') {
  const r = spawnSync(process.execPath, [join(import.meta.dirname, 'host-id.mjs')], { encoding: 'utf8', timeout: 20000 });
  const id = (r.stdout ?? '').trim();
  if (r.status !== 0 || !/^[0-9a-f]{32}$/.test(id)) unknown('cannot read the host id of this machine');
  who = holder.host.toLowerCase() === id ? 'same-host' : 'other-host';
}

// Ledger
const bad = [];
const ended = [];
const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const [header, ...rows] = section('Ledger').filter((l) => l.trim().startsWith('|'));
if (!header || splitRow(header).join('|').toLowerCase() !== 'granted by|action|repo or host|scope|when') {
  unknown('the Ledger table has no header Granted by | Action | Repo or host | Scope | When');
}
let rowNumber = 0;
for (const line of rows) {
  const cells = splitRow(line);
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
const SECTIONS = ['decisions', 'waiting for the human', 'next, in order'];
const limit = Date.now() + 5 * 60 * 1000;
const ignored = [];
let newest = null;
for (const c of comments.flat()) {
  if (!same(String(c?.user?.login ?? ''), assignee)) continue; // only the owner writes a checkpoint
  const m = MARKER.exec(String(c?.body ?? '').split('\n')[0].trim());
  const time = m ? Date.parse(m[1]) : NaN;
  if (Number.isNaN(time)) continue;
  const headings = String(c.body).split('\n').filter((l) => /^##\s/.test(l)).map((l) => l.replace(/^##\s+/, '').trim().toLowerCase());
  if (!SECTIONS.every((h) => headings.includes(h))) continue;
  if (time > limit) {
    ignored.push(c.id);
    continue;
  }
  if (!newest || time >= newest.time) newest = { time, id: c.id };
}

const list = (a) => (a.length ? a.join(',') : 'none');
done(
  `ok holder=${who} session=${holder.session} checkpoint=${newest ? newest.id : 'none'} ignored=${list(ignored)} state=${String(issue.state).toLowerCase()} bad-rows=${list(bad)} ended-rows=${list(ended)}`,
  0,
);
