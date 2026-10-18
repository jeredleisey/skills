// Read the branch policy of the default branch of an Azure DevOps (ADO) repo and report each gap. Change nothing.
// Usage: node branch-policy-ado.mjs <org> <project> <repo>
// Output and exit code:
//   gap: <what is missing>   one line for each gap, then exit 0
//   ok                       exit 0   no gap
//   unknown: <reason>        exit 2   the script cannot read the policy. This is never ok.
//   usage message on stderr  exit 64
// A policy counts when it is enabled, blocking, not deleted, and its scope holds the default branch of the
// repo. A scope entry holds it when the repository id is null or the id of the repo, and the ref name is
// equal (matchKind Exact, or none) or a prefix (matchKind Prefix).
// The checks, in this order:
//   a review is required         a policy of type "Minimum number of reviewers" with a minimum of 1 or more
//                                (a second gap when each such policy counts the vote of the author, creatorVoteCounts)
//   build validation             a policy of type Build
//   comment resolution           a policy of type "Comment requirements"
//   direct push, force push      ADO blocks both on a branch that has a blocking policy. With none, one gap
//                                for each. The permission "Bypass policies when pushing" is not read here.
// The script makes GET calls only: the repo, and policy/configurations, read to the last page.
// CADRE_ADO_CMD replaces the ADO client (see ado.mjs).
import { projectUrl, readJson } from './ado.mjs';
import { say } from './out.mjs';
import { pathToFileURL } from 'node:url';

// The scope test and the policy filter. setup-derive.mjs imports them.
export const covers = (entry, repoId, branch) => {
  if (typeof entry?.refName !== 'string') return false;
  const repoOk = entry.repositoryId === null || (typeof entry.repositoryId === 'string' && entry.repositoryId.toLowerCase() === repoId.toLowerCase());
  const refOk = entry.matchKind === 'Prefix' ? branch.startsWith(entry.refName) : entry.refName === branch;
  return repoOk && refOk;
};
export const livePolicies = (policies, repoId, branch) =>
  policies.filter(
    (p) => p?.isEnabled === true && p.isBlocking === true && p.isDeleted !== true && Array.isArray(p.settings?.scope) && p.settings.scope.some((entry) => covers(entry, repoId, branch)),
  );


// Run the script only when it is the entry point, not when another script imports the helpers.
if (pathToFileURL(process.argv[1] ?? '').href === import.meta.url) {
const unknown = (reason) => say([`unknown: ${reason}`], 2);

const [org, project, repo, ...extra] = process.argv.slice(2);
if (!org || !project || !repo || extra.length > 0) {
  console.error('usage: branch-policy-ado.mjs <org> <project> <repo>');
  process.exit(64);
}

const TYPE = {
  reviewers: 'fa4e907d-c16b-4a4c-9dfa-4906e5d171dd',
  build: '0609b952-1397-4640-95ec-e00a01b2c241',
  comments: 'c6a1889d-b943-4856-b76f-9e46bb6b0df2',
};

function read(what, url) {
  try {
    return readJson(what, 'GET', url);
  } catch (e) {
    return unknown(e.message);
  }
}

let base;
try {
  base = projectUrl(org, project);
} catch (e) {
  unknown(e.message);
}

const info = read('the repo', `${base}/_apis/git/repositories/${encodeURIComponent(repo)}?api-version=7.1`).json;
const branch = info?.defaultBranch;
if (typeof info?.id !== 'string' || info.id === '') unknown('the repo has no id');
if (typeof branch !== 'string' || !/^refs\/heads\/\S+$/.test(branch)) unknown('the repo has no usable default branch');

const policies = [];
let url = `${base}/_apis/policy/configurations?api-version=7.1`;
const seen = new Set();
for (let pages = 0; ; pages++) {
  if (pages >= 50) unknown('the policies have more than 50 pages');
  const answer = read('the policy configurations', url);
  if (!Array.isArray(answer.json?.value)) unknown('the policy answer has no list');
  policies.push(...answer.json.value);
  if (!answer.continuation) break;
  if (seen.has(answer.continuation)) unknown('the policies repeat a page token');
  seen.add(answer.continuation);
  url = `${base}/_apis/policy/configurations?api-version=7.1&continuationToken=${encodeURIComponent(answer.continuation)}`;
}

const live = livePolicies(policies, info.id, branch);
const has = (typeId, test = () => true) => live.some((p) => p.type?.id?.toLowerCase() === typeId && test(p));

const gaps = [];
const needs = (p) => Number(p.settings.minimumApproverCount) >= 1;
if (!has(TYPE.reviewers, needs)) gaps.push('gap: no blocking policy requires a review');
else if (!has(TYPE.reviewers, (p) => needs(p) && p.settings.creatorVoteCounts !== true)) gaps.push("gap: the author's own vote counts toward the minimum of reviewers");
if (!has(TYPE.build)) gaps.push('gap: no blocking build validation policy');
if (!has(TYPE.comments)) gaps.push('gap: no blocking policy requires comment resolution');
if (live.length === 0) {
  gaps.push('gap: no blocking policy covers the branch, so it can take a direct push');
  gaps.push('gap: no blocking policy covers the branch, so it can take a force push');
}
say(gaps.length > 0 ? gaps : ['ok'], 0);
}
