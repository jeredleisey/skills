// Read the setup answers that the repo already holds. Change nothing.
// Usage, in the repo root:
//   node setup-derive.mjs github <owner/repo> [host]      (the default host is github.com)
//   node setup-derive.mjs ado <org> <project> <repo>
// Output, one line for each fact, in this order, then exit 0:
//   fact <key> <JSON value> source=<where the fact came from>
//   unread <key> <reason>        this one fact cannot be read. The other facts still print.
//   unknown: <reason>            exit 2   a name is bad, or the tracker repo cannot be read
//   usage message on stderr      exit 64
// The keys, in order:
//   default-branch   the name of the default branch (string)
//   merge-methods    sorted list of merge, rebase, squash (ADO adds rebase-merge).
//                    GitHub: the repo settings allow_*_merge, narrowed by allowed_merge_methods of each
//                    pull_request rule on the default branch. A rule with no list does not narrow.
//                    GitHub: settings that the account cannot see (not booleans) give unread.
//                    ADO: each policy "Require a merge strategy" that is enabled, blocking, not deleted,
//                    and in scope of the default branch. Their lists are intersected. A policy with no
//                    allow* setting is the older form, read from useSquashMerge. With no policy, all four.
//   secrets          GitHub: the names from `gh secret list --json name`, never a value.
//                    ADO: always unread, because the PAT cannot read pipeline variables.
//   live-clones      absolute paths of the clones of this repo that a marketplace of source type
//                    "directory" points at. The files are settings.json (extraKnownMarketplaces) and
//                    plugins/known_marketplaces.json of CLAUDE_CONFIG_DIR (else ~/.claude). A clone matches
//                    when the realpath of its git common dir is the one of the current folder.
//                    A path that does not exist is skipped. A missing file is not a fault.
//   folders          the top-level folders that git tracks at HEAD
// The script makes no write call: gh api (GET), gh secret list, and ADO GET calls, and read-only git.
// Seams: CADRE_GH_CMD replaces gh (see branch-policy.mjs). CADRE_ADO_CMD replaces the ADO client (see ado.mjs).
// CLAUDE_CONFIG_DIR names the Claude config folder.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { projectUrl, readJson } from './ado.mjs';
import { livePolicies } from './ado-policy-scope.mjs';
import { say } from './out.mjs';

const unknown = (reason) => say([`unknown: ${reason}`], 2);
const usage = () => {
  console.error('usage: setup-derive.mjs github <owner/repo> [host] | setup-derive.mjs ado <org> <project> <repo>');
  process.exit(64);
};

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'github' ? rest.length < 1 || rest.length > 2 : mode === 'ado' ? rest.length !== 3 : true) usage();

const firstLine = (text) => String(text).split('\n').find((l) => l.trim() !== '')?.slice(0, 200) ?? 'no message';
const lines = [];
const fact = (key, value, source) => lines.push(`fact ${key} ${JSON.stringify(value)} source=${source}`);
const unread = (key, reason) => lines.push(`unread ${key} ${reason}`);
const METHODS = ['merge', 'rebase', 'squash'];

// ---- the tracker ----

// One tracker gives: default branch, merge methods, secrets. Each returns { value, source } or { error }.
function github() {
  const [repo, host] = rest;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repo)) unknown('the repo is not <owner>/<repo>');
  if (host !== undefined && !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host)) unknown('the host is not a host name');
  const gh = (args) => {
    const r = spawnSync(`${process.env.CADRE_GH_CMD || 'gh'} ${args.join(' ')}`, { shell: true, encoding: 'utf8', timeout: 30000 });
    const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim();
    if (r.status !== 0) return { error: firstLine(text) };
    try {
      return { body: JSON.parse(r.stdout) };
    } catch {
      return { error: 'the answer of gh is not JSON' };
    }
  };
  const api = (endpoint) => gh(['api', ...(host ? ['--hostname', host] : []), endpoint]);

  const info = api(`repos/${repo}`);
  if (info.error) unknown(`cannot read the repo: ${info.error}`);
  const branch = info.body?.default_branch;
  if (typeof branch !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(branch)) unknown('the repo has no usable default branch name');

  return {
    branch: { value: branch, source: 'repo settings' },
    methods() {
      const rules = api(`repos/${repo}/rules/branches/${branch}?per_page=100`);
      if (rules.error) return { error: `cannot read the rulesets: ${rules.error}` };
      if (!Array.isArray(rules.body)) return { error: 'the rulesets answer is not a list' };
      for (const k of ['allow_merge_commit', 'allow_squash_merge', 'allow_rebase_merge']) {
        if (typeof info.body[k] !== 'boolean') return { error: 'the repo settings are not visible to this account' };
      }
      const on = { merge: info.body.allow_merge_commit, squash: info.body.allow_squash_merge, rebase: info.body.allow_rebase_merge };
      let value = METHODS.filter((m) => on[m] === true);
      const ids = [];
      for (const rule of rules.body) {
        const allowed = rule?.parameters?.allowed_merge_methods;
        if (rule?.type !== 'pull_request' || !Array.isArray(allowed)) continue;
        value = value.filter((m) => allowed.includes(m));
        ids.push(`ruleset ${rule.ruleset_id}`);
      }
      return { value, source: ['repo settings', ...new Set(ids)].join(', ') };
    },
    secrets() {
      const list = gh(['secret', 'list', '--repo', host ? `${host}/${repo}` : repo, '--json', 'name']);
      if (list.error) return { error: `cannot read the secret list: ${list.error}` };
      if (!Array.isArray(list.body)) return { error: 'the secret list is not a list' };
      return { value: list.body.map((s) => s?.name).filter((s) => typeof s === 'string').sort(), source: 'gh secret list' };
    },
  };
}

const MERGE_POLICY = 'fa4e907d-c16b-4a4c-9dfa-4916e5d171ab';
const ADO_METHODS = { allowNoFastForward: 'merge', allowSquash: 'squash', allowRebase: 'rebase', allowRebaseMerge: 'rebase-merge' };

function azure() {
  const [org, project, repo] = rest;
  let base;
  try {
    base = projectUrl(org, project);
  } catch (e) {
    unknown(e.message);
  }
  const read = (what, url) => {
    try {
      return readJson(what, 'GET', url);
    } catch (e) {
      return { error: e.message };
    }
  };
  const info = read('the repo', `${base}/_apis/git/repositories/${encodeURIComponent(repo)}?api-version=7.1`);
  if (info.error) unknown(`cannot read the repo: ${info.error}`);
  const branch = info.json?.defaultBranch;
  if (typeof info.json?.id !== 'string' || info.json.id === '') unknown('the repo has no id');
  if (typeof branch !== 'string' || !/^refs\/heads\/\S+$/.test(branch)) unknown('the repo has no usable default branch');

  return {
    branch: { value: branch.slice('refs/heads/'.length), source: 'repo record' },
    methods() {
      const policies = [];
      const seen = new Set();
      let url = `${base}/_apis/policy/configurations?api-version=7.1`;
      for (let pages = 0; ; pages++) {
        if (pages >= 50) return { error: 'the policies have more than 50 pages' };
        const answer = read('the policy configurations', url);
        if (answer.error) return { error: answer.error };
        if (!Array.isArray(answer.json?.value)) return { error: 'the policy answer has no list' };
        policies.push(...answer.json.value);
        if (!answer.continuation) break;
        if (seen.has(answer.continuation)) return { error: 'the policies repeat a page token' };
        seen.add(answer.continuation);
        url = `${base}/_apis/policy/configurations?api-version=7.1&continuationToken=${encodeURIComponent(answer.continuation)}`;
      }
      const live = livePolicies(policies, info.json.id, branch).filter((p) => p.type?.id?.toLowerCase() === MERGE_POLICY);
      let value = Object.values(ADO_METHODS);
      for (const p of live) {
        const set = p.settings;
        let allowed;
        if (Object.keys(ADO_METHODS).some((k) => typeof set[k] === 'boolean')) allowed = Object.entries(ADO_METHODS).filter(([k]) => set[k] === true).map(([, m]) => m);
        else if (typeof set.useSquashMerge === 'boolean') allowed = [set.useSquashMerge ? 'squash' : 'merge']; // the older form
        else return { error: `policy ${p.id} has no allow* setting and no useSquashMerge` };
        value = value.filter((m) => allowed.includes(m));
      }
      return { value: value.sort(), source: live.length > 0 ? live.map((p) => `policy ${p.id}`).join(', ') : 'no merge strategy policy' };
    },
    secrets: () => ({ error: 'the PAT cannot read pipeline variables' }),
  };
}

// ---- the local facts ----

const git = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30000 });
  return r.status === 0 ? { out: r.stdout.trim() } : { error: firstLine(r.stderr || r.error?.message) };
};
const commonDir = (cwd) => {
  const r = git(cwd, ['rev-parse', '--git-common-dir']);
  if (r.error) return r;
  try {
    return { out: realpathSync(resolve(cwd, r.out)) };
  } catch (e) {
    return { error: e.message };
  }
};

function liveClones() {
  const mine = commonDir(process.cwd());
  if (mine.error) return { error: `cannot read the git folder of this repo: ${mine.error}` };
  const config = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  const files = [
    ['settings.json', join(config, 'settings.json'), 'extraKnownMarketplaces'],
    ['plugins/known_marketplaces.json', join(config, 'plugins', 'known_marketplaces.json'), null],
  ];
  const paths = new Set();
  const used = [];
  for (const [label, file, key] of files) {
    if (!existsSync(file)) continue;
    let table;
    try {
      const json = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
      table = key ? json?.[key] : json;
    } catch (e) {
      return { error: `${label} is not valid JSON: ${e.message}` };
    }
    used.push(key ? `${label} ${key}` : label);
    if (typeof table !== 'object' || table === null || Array.isArray(table)) continue;
    for (const entry of Object.values(table)) {
      const src = entry?.source;
      if (src?.source !== 'directory' || typeof src.path !== 'string' || src.path === '') continue;
      const path = resolve(src.path);
      if (!existsSync(path)) continue;
      const theirs = commonDir(path);
      if (!theirs.error && theirs.out === mine.out) paths.add(path);
    }
  }
  return { value: [...paths].sort(), source: used.length > 0 ? used.join(', ') : 'no marketplace file' };
}

function folders() {
  const r = git(process.cwd(), ['ls-tree', '-d', '--name-only', 'HEAD']);
  if (r.error) return { error: `cannot read the tree at HEAD: ${r.error}` };
  return { value: r.out.split('\n').filter(Boolean).sort(), source: 'git ls-tree HEAD' };
}

// ---- the report ----

const tracker = mode === 'github' ? github() : azure();
fact('default-branch', tracker.branch.value, tracker.branch.source);
for (const [key, read] of [['merge-methods', tracker.methods], ['secrets', tracker.secrets], ['live-clones', liveClones], ['folders', folders]]) {
  const r = read();
  if (r.error) unread(key, r.error);
  else fact(key, r.value, r.source);
}
say(lines, 0);
