// Check a grant in a GitHub orchestrator issue before a one-way step.
// Usage: node grant-check.mjs <issue-number> <session-id> "<action>"
// Output and exit code:
//   granted row=<k> scope=<Scope cell as a JSON string>   one line for each row that counts, in row order   exit 0
//   none                                                  no row counts                                      exit 1
//   not-owner login=<login> assignee=<login>              as in resume-read.mjs                              exit 1
//   unknown: <reason>                                                                                        exit 2
//   usage message on stderr                                                                                  exit 64
// The issue check, the owner check, and the Ledger parse are those of resume-read.mjs. A row counts when it is
// not a bad row and not an ended row of that read, and its When is `<YYYY-MM-DD> indefinite` or names session-id. The Action
// cell must equal the action as a whole, ignoring case and outer white space. The script never decides the
// Scope. The orchestrator reads it. The script makes read calls only.
// Set CADRE_GH_CMD to use another command than gh, for example a fixture in a test.
import { spawnSync } from 'node:child_process';
import { grantAnswer, grantLines, markdownLedger, markdownSections, same } from './resume-core.mjs';
import { say as done } from './out.mjs';

const unknown = (reason) => done(`unknown: ${reason}`, 2);

const [issueNumber, sessionArg, action, ...extra] = process.argv.slice(2);
if (!/^[0-9]+$/.test(issueNumber ?? '') || !sessionArg || !(action ?? '').trim() || extra.length > 0) {
  console.error('usage: grant-check.mjs <issue-number> <session-id> "<action>"');
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

let lines;
try {
  const ledger = markdownSections(issue.body).get('ledger') ?? unknown('the body has no Ledger section');
  const { header, rows } = markdownLedger(ledger);
  lines = grantLines(header, rows, assignee, sessionArg, action);
} catch (e) {
  unknown(e.message);
}
done(...grantAnswer(lines));
