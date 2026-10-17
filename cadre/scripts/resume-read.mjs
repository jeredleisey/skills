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
import { auditLedger, holderWho, okLine, parseHolder, pickCheckpoint, same } from './resume-core.mjs';

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
let holder;
let who;
try {
  holder = parseHolder(section('Holder'));
  who = holderWho(holder, sessionArg);
} catch (e) {
  unknown(e.message);
}

// Ledger
const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const [header, ...rows] = section('Ledger').filter((l) => l.trim().startsWith('|'));
let audit;
try {
  audit = auditLedger(
    header ? splitRow(header) : null,
    rows.map(splitRow).filter((cells) => !cells.every((c) => /^[:\s-]*$/.test(c))), // not the separator, or an empty row
    assignee,
    sessionArg,
  );
} catch (e) {
  unknown(e.message);
}

// Checkpoint
const comments = ghJson('the comments', `api --paginate --slurp repos/{owner}/{repo}/issues/${issueNumber}/comments`);
if (!Array.isArray(comments)) unknown('the comments are not a JSON array');
const checkpoint = pickCheckpoint(
  comments.flat().map((c) => {
    const body = String(c?.body ?? '');
    return {
      id: c?.id,
      author: String(c?.user?.login ?? ''),
      firstLine: body.split('\n')[0].trim(),
      headings: body.split('\n').filter((l) => /^##\s/.test(l)).map((l) => l.replace(/^##\s+/, '').trim().toLowerCase()),
    };
  }),
  assignee,
);

done(okLine({ who, holder, checkpoint, state: String(issue.state).toLowerCase(), bad: audit.bad, ended: audit.ended }), 0);
