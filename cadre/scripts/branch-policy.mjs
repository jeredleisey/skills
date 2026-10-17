// Read the branch policy of the default branch of a GitHub repo and report each gap. Change nothing.
// Usage: node branch-policy.mjs <owner/repo> [host]      (the default host is github.com)
// Output and exit code:
//   gap: <what is missing>   one line for each gap, then exit 0
//   ok                       exit 0   no gap: rules or protection cover all five checks
//   unknown: <reason>        exit 2   the script cannot read the policy. This is never ok.
// The five checks, each covered by a ruleset rule or by classic branch protection:
//   a pull request is required, a review is required, force push is blocked, delete is blocked,
//   a status check is required.
// The gap for a missing pull request and the gap for a missing review are two lines. A pull request
// rule or protection with 0 approving reviews is a review gap only.
// The script runs `gh api` with GET only: repo, rules/branches/<branch>, branches/<branch>/protection.
// CADRE_GH_CMD replaces `gh` (a shell command). A test uses it.
import { spawnSync } from 'node:child_process';
import { writeOut } from './out.mjs';

function say(lines, code) {
  writeOut(lines.map((l) => `${l}\n`).join(''));
  process.exit(code);
}
const unknown = (reason) => say([`unknown: ${reason}`], 2);

const [repo, host] = process.argv.slice(2);
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repo ?? '')) unknown('the repo is not <owner>/<repo>');
if (host !== undefined && !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host)) unknown('the host is not a host name');

// Run one `gh api` read. Return { ok, body, text }. `body` is the parsed JSON when ok.
function api(endpoint) {
  const args = ['api', ...(host ? ['--hostname', host] : []), endpoint];
  const r = spawnSync(`${process.env.CADRE_GH_CMD || 'gh'} ${args.join(' ')}`, { shell: true, encoding: 'utf8', timeout: 30000 });
  const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim();
  if (r.status !== 0) return { ok: false, text };
  try {
    return { ok: true, body: JSON.parse(r.stdout), text };
  } catch {
    return { ok: false, text: 'the answer of gh is not JSON' };
  }
}

const firstLine = (text) => text.split('\n').find((l) => l.trim() !== '')?.slice(0, 200) ?? 'no message';
const fail = (what, r) => unknown(`cannot read ${what}: ${firstLine(r.text)}`);

const repoInfo = api(`repos/${repo}`);
if (!repoInfo.ok) fail('the repo', repoInfo);
const branch = repoInfo.body?.default_branch;
if (typeof branch !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(branch)) unknown('the repo has no usable default branch name');

const ruleSet = api(`repos/${repo}/rules/branches/${branch}`);
if (!ruleSet.ok) fail('the rulesets', ruleSet);
if (!Array.isArray(ruleSet.body)) unknown('the rulesets answer is not a list');
const types = new Set(ruleSet.body.map((rule) => rule?.type));

// Classic protection. "Branch not protected" is an answer, not a fault. Any other failure is a fault.
let protection = null;
const classic = api(`repos/${repo}/branches/${branch}/protection`);
if (classic.ok) protection = classic.body ?? {};
else if (!/Branch not protected/i.test(classic.text)) fail('the branch protection', classic);

// Each source of a review rule gives its count of approving reviews. A source with no count counts as a review.
const counts = [];
const prRule = ruleSet.body.find((rule) => rule?.type === 'pull_request');
if (prRule) counts.push(prRule.parameters?.required_approving_review_count);
if (protection?.required_pull_request_reviews) counts.push(protection.required_pull_request_reviews.required_approving_review_count);

const gaps = [];
if (!types.has('pull_request') && !protection?.required_pull_request_reviews) gaps.push('gap: no rule requires a pull request');
if (!counts.some((count) => count !== 0)) gaps.push('gap: no review is required');
if (!types.has('non_fast_forward') && protection?.allow_force_pushes?.enabled !== false) gaps.push('gap: force push is allowed');
if (!types.has('deletion') && protection?.allow_deletions?.enabled !== false) gaps.push('gap: the branch can be deleted');
if (!types.has('required_status_checks') && !protection?.required_status_checks) gaps.push('gap: no required status check');
say(gaps.length > 0 ? gaps : ['ok'], 0);
