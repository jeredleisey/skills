// A PreToolUse hook on Bash. It guards the one-way steps of git and GitHub.
// Usage: node guard.mjs push|merge        (the hook JSON arrives on stdin)
//   push   a push to the default branch, a force push, or a delete of a remote branch
//   merge  gh pr merge, also with --auto. On Azure DevOps: az repos pr update with --status completed or
//          --auto-complete (alone or true), and az repos pr create with --auto-complete
// Output and exit code:
//   nothing, exit 0         the command is not guarded, or the charter allows it for the orchestrator
//   permissionDecision ask  exit 0   the orchestrator needs the word of the human
//   permissionDecision deny exit 0   the call has agent_id (even empty or null) or agent_type, so a helper made it
//   a reason on stderr      exit 2   the hook cannot tell: it blocks the command
// A helper is always denied. The charter never lifts that.
// The charter is read from the commit origin/<default branch> of the repo of cwd, never from the
// working tree, so a helper cannot edit it to switch a guard off. It can set `guards: off` and
// `allow: [<guard>]`, which pass the orchestrator only. No default branch, no file, or any
// fault leaves the guards on.
// A personal file, guards.json in CADRE_HOME or ~/.cadre, can only add: {"guards": "on"} or
// {"deny": [<guard>]}. It never turns a guard off. A bad personal file is ignored.
// The default branch comes from CADRE_DEFAULT_BRANCH, then from refs/remotes/<remote>/HEAD.
// Without both, these names count: main, master, dev, develop, trunk, init.defaultBranch, and the
// remote HEAD of the remote of the current branch. No command here uses the network.
// CADRE_GIT_CMD replaces the git program (a path). A test uses it.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseFrontMatter } from './charter-front-matter.mjs';
import { commandsOf, HAS_VARIABLE, SPECIAL } from './shell-words.mjs';

const GUARDS = ['push', 'merge'];
const CHARTER = 'docs/agents/cadre-charter.md';
const FALLBACK = ['main', 'master', 'dev', 'develop', 'trunk'];

// ---- git and the repo. A repo is { cwd, gitDir }. A null cwd means that the guard cannot tell. ----

function git(args, repo) {
  if (repo.cwd === null) return null;
  const prefix = repo.gitDir ? ['--git-dir', repo.gitDir] : [];
  const r = spawnSync(process.env.CADRE_GIT_CMD || 'git', [...prefix, ...args], { cwd: repo.cwd, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 ? r.stdout.trim() : null;
}

const currentBranch = (repo) => git(['symbolic-ref', '--short', '-q', 'HEAD'], repo) || null;

// The default branch when the environment or the remote HEAD names it, else null.
function knownDefault(repo, remote) {
  if (process.env.CADRE_DEFAULT_BRANCH) return process.env.CADRE_DEFAULT_BRANCH;
  const name = /^[A-Za-z0-9._-]+$/.test(remote ?? '') ? remote : 'origin';
  const head = git(['symbolic-ref', '--short', '-q', `refs/remotes/${name}/HEAD`], repo);
  return head?.startsWith(`${name}/`) ? head.slice(name.length + 1) : null;
}

function defaultBranches(repo, remote) {
  // The usual names always count, so a moved origin/HEAD cannot lift the guard.
  const names = new Set(FALLBACK);
  for (const r of [remote, 'origin']) {
    const known = knownDefault(repo, r);
    if (known) names.add(known);
  }
  if (repo.cwd === null) return names;
  const init = git(['config', 'init.defaultBranch'], repo);
  if (init) names.add(init);
  const now = currentBranch(repo);
  const upstream = now ? git(['config', `branch.${now}.remote`], repo) : null;
  const head = upstream ? knownDefault(repo, upstream) : null;
  if (head) names.add(head);
  return names;
}

// ---- the match of each guard: return a short reason, or null when the command is not guarded ----

const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);
const PUSH_VALUE_OPTIONS = new Set(['--push-option', '--receive-pack', '--exec']);
const UNREADABLE = 'a push with a target that the guard cannot read';

// A git setting that can turn another command into a push, or change where a push goes.
const changesPush = (setting) => {
  const key = setting.split('=')[0].toLowerCase();
  return key.startsWith('alias.') || /^remote\..*\.push$/.test(key) || key === 'push.default';
};

// The long options of git push. git accepts a unique prefix of one.
const PUSH_LONG = ['all', 'branches', 'prune', 'mirror', 'dry-run', 'porcelain', 'delete', 'tags', 'follow-tags', 'signed', 'no-signed', 'atomic', 'push-option', 'receive-pack', 'exec', 'repo', 'force', 'force-with-lease', 'force-if-includes', 'no-force-with-lease', 'no-force-if-includes', 'set-upstream', 'upstream', 'thin', 'no-thin', 'quiet', 'verbose', 'progress', 'verify', 'no-verify', 'recurse-submodules', 'no-recurse-submodules', 'ipv4', 'ipv6', 'help'];

// The full name of a long option, or null when a prefix fits more than one option.
function longOption(given) {
  const bare = given.slice(2);
  if (PUSH_LONG.includes(bare)) return given;
  const hits = PUSH_LONG.filter((o) => o.startsWith(bare));
  if (hits.length > 1) return null;
  return hits.length === 1 ? `--${hits[0]}` : given;
}

const place = (cwd, to) => (cwd === null || to === undefined || SPECIAL.test(to) ? null : resolve(cwd, to));

function pushReason({ args, dir, text }) {
  const repo = { cwd: dir, gitDir: null };
  const settings = [];
  let i = 1;
  while (i < args.length && args[i].startsWith('-')) {
    const a = args[i];
    const opt = a.startsWith('--') ? a.split('=')[0] : a;
    let value;
    if (GIT_VALUE_OPTIONS.has(opt)) value = a.startsWith('--') && a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[++i];
    i++;
    if (opt === '-c') settings.push(value ?? '');
    if (opt === '-C' || opt === '--work-tree') repo.cwd = place(repo.cwd, value);
    else if (opt === '--git-dir') {
      if (place(repo.cwd, value) === null) repo.cwd = null;
      else repo.gitDir = place(repo.cwd, value);
    }
  }
  const sub = args[i] ?? '';
  if (HAS_VARIABLE.test(sub)) return 'a git command that the guard cannot read';
  if (sub === 'send-pack') return 'a send-pack, which pushes';
  if (sub === 'config') {
    const [key, value] = args.slice(i + 1).filter((a) => !a.startsWith('-'));
    if (value !== undefined) settings.push(`${key}=${value}`);
  }
  if (settings.some(changesPush) && /push/i.test(text ?? '')) return 'a setting that changes what a push does';
  if (sub !== 'push') return null;
  let force = false;
  let del = false;
  let wide = false;
  let repoOption = false;
  let ambiguous = false;
  let help = false;
  let tags = false;
  let followTags = false;
  const positional = [];
  const loose = [];
  for (i += 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const opt = longOption(eq === -1 ? a : a.slice(0, eq));
      if (opt === null) return 'a push option that the guard cannot tell from another';
      if (opt === '--help') help = true;
      else if (opt === '--tags') tags = true;
      else if (opt === '--follow-tags') followTags = true;
      else if (opt === '--force' || opt === '--force-with-lease' || opt === '--force-if-includes') force = true;
      else if (opt === '--delete') del = true;
      else if (['--all', '--branches', '--mirror', '--prune'].includes(opt)) wide = true;
      else if (opt === '--repo' || PUSH_VALUE_OPTIONS.has(opt)) {
        repoOption ||= opt === '--repo';
        if (eq === -1) loose.push(args[++i] ?? '');
        else loose.push(a.slice(eq + 1));
      } else if ((opt === '--recurse-submodules' || opt === '--signed') && eq === -1) ambiguous = true;
    } else if (/^-[A-Za-z0-9]+$/.test(a)) {
      if (a === '-h') help = true;
      if (a.includes('f')) force = true;
      if (a.includes('d')) del = true;
      if (a === '-o') loose.push(args[++i] ?? '');
    } else positional.push(a);
  }
  if (help) return null;
  if (del) return 'a delete of a remote branch';
  if (force) return 'a force push';
  if (wide) return 'a push of all branches';
  const branches = defaultBranches(repo, positional[0]);
  // --tags alone pushes tags and no branch. --follow-tags pushes the branch too.
  const tagsOnly = tags && !followTags;
  if (!tagsOnly && positional.length <= (ambiguous ? 2 : 1)) {
    if (repo.cwd === null) return 'a push in a repo that the guard cannot tell';
    const now = currentBranch(repo);
    if (now === null || branches.has(now)) return 'a push of the current branch, which may be the default branch';
  }
  // A word before the first positional may be a remote or a value: test every word as a refspec.
  const specs = [...positional.map((spec, k) => ({ spec, full: k > 0 || repoOption })), ...loose.map((spec) => ({ spec, full: false }))];
  for (const { spec, full } of specs) {
    if (spec.startsWith('+')) return 'a force push';
    if (full && SPECIAL.test(spec)) return UNREADABLE;
    const colon = spec.indexOf(':');
    if (full && colon === 0) return 'a delete of a remote branch';
    let target = colon === -1 ? spec : spec.slice(colon + 1);
    if (target === 'HEAD' || target === '@') {
      target = currentBranch(repo);
      if (target === null) return 'a push of the current branch, which git cannot name';
    }
    if (branches.has(target.replace(/^(refs\/)?heads\//, ''))) return 'a push to the default branch';
  }
  return null;
}

const MERGE_FLAGS = new Set(['--auto', '--merge', '-m', '--squash', '-s', '--rebase', '-r', '--admin']);
const GH_VALUE_OPTIONS = new Set(['-R', '--repo', '--hostname']);

function mergeReason({ args }) {
  if (args[0] !== 'gh') return null;
  const words = [];
  for (let i = 1; i < args.length && words.length < 2; i++) {
    if (GH_VALUE_OPTIONS.has(args[i])) i++;
    else if (!args[i].startsWith('-')) words.push(args[i]);
  }
  if (HAS_VARIABLE.test(words[0] ?? '') || (words[0] === 'pr' && HAS_VARIABLE.test(words[1] ?? ''))) return 'a gh command that the guard cannot read';
  if (words[0] !== 'pr' || words[1] !== 'merge') return null;
  if (args.includes('--help') || args.includes('-h')) return null;
  // Only a command that just turns auto-merge off passes.
  const disableOnly = args.includes('--disable-auto') && !args.some((a) => MERGE_FLAGS.has(a));
  return disableOnly ? null : 'a merge of a pull request';
}

const AZ_VALUE_OPTIONS = new Set(['-o', '--output', '--query', '--subscription']);
const OFF_WORDS = new Set(['false', 'no', 'n', 'f', '0']);
// az takes a unique prefix of an option, so each name matches from a minimum length.
const optionIs = (given, full, min) => given.length >= min && full.startsWith(given);

// Azure DevOps. Return a reason when the command completes a pull request or turns on auto-complete.
function azReason({ args }) {
  if (args[0] !== 'az' && args[0] !== 'az.cmd') return null;
  const words = [];
  for (let i = 1; i < args.length && words.length < 3; i++) {
    if (AZ_VALUE_OPTIONS.has(args[i])) i++;
    else if (!args[i].startsWith('-')) words.push(args[i]);
  }
  const [group, sub, verb] = words;
  if (HAS_VARIABLE.test(group ?? '') || (group === 'repos' && HAS_VARIABLE.test(sub ?? '')) || (group === 'repos' && sub === 'pr' && HAS_VARIABLE.test(verb ?? ''))) return 'an az command that the guard cannot read';
  if (group !== 'repos' || sub !== 'pr' || (verb !== 'update' && verb !== 'create')) return null;
  if (args.includes('--help') || args.includes('-h')) return null;
  for (let i = 1; i < args.length; i++) {
    if (!args[i].startsWith('--')) continue;
    const eq = args[i].indexOf('=');
    const name = eq === -1 ? args[i] : args[i].slice(0, eq);
    const next = eq === -1 ? args[i + 1] : args[i].slice(eq + 1);
    const value = next !== undefined && (eq !== -1 || !next.startsWith('-')) ? next : undefined;
    if (verb === 'update' && optionIs(name, '--status', 4)) {
      if (HAS_VARIABLE.test(value ?? '')) return 'an az command with a status that the guard cannot read';
      if (value?.toLowerCase() === 'completed') return 'the completion of a pull request on Azure DevOps';
    } else if (optionIs(name, '--auto-complete', 4)) {
      if (HAS_VARIABLE.test(value ?? '')) return 'an az command with an auto-complete value that the guard cannot read';
      if (value === undefined || !OFF_WORDS.has(value.toLowerCase())) return 'auto-complete of a pull request on Azure DevOps';
    }
  }
  return null;
}

// An entry that the guard cannot read matches when its words include the words of the command.
const holds = (args, need) => need.every((word) => args.includes(word));

// The text of a command that holds the words of an az pull request update or create with a completion.
const azWords = (t) => /\baz(\.cmd)?\b/i.test(t) && /\bpr\b/i.test(t) && /\b(update|create)\b/i.test(t) && (/\bcompleted\b/i.test(t) || /--au/i.test(t));
const LITERAL = { push: /\bpush\b/, merge: { test: (t) => /\bmerge\b/.test(t) || azWords(t) } };
const UNREADABLE_VARIABLE = 'a command with a variable that the guard cannot read';

// An entry of `!` is a command that the guard cannot read. It matches when it always does, or when
// the command text holds the word of the guard.
const unreadableFor = (e, guard) => e.args[0] === '!' && (e.guard === 'both' || e.guard === guard) && (e.always || LITERAL[guard].test(e.text));

const MATCH = {
  push: (entries) => {
    for (const e of entries) {
      if (e.args[0] === '!') {
        if (unreadableFor(e, 'push')) return UNREADABLE_VARIABLE;
        continue;
      }
      if (e.args[0] === '?' && holds(e.args, ['git', 'push'])) return 'a command that the guard cannot read, with a push in it';
      if (e.args[0] === 'git') {
        const reason = pushReason(e);
        if (reason) return reason;
      }
    }
    return null;
  },
  merge: (entries) => {
    for (const e of entries) {
      if (e.args[0] === '!') {
        if (unreadableFor(e, 'merge')) return UNREADABLE_VARIABLE;
        continue;
      }
      if (e.args[0] === '?' && holds(e.args, ['gh', 'pr', 'merge'])) return 'a command that the guard cannot read, with a merge in it';
      if (e.args[0] === '?' && (holds(e.args, ['az', 'pr']) || holds(e.args, ['az.cmd', 'pr'])) && (e.args.includes('update') || e.args.includes('create')) && e.args.some((a) => a === 'completed' || a.startsWith('--au'))) return 'a command that the guard cannot read, with a completion in it';
      const reason = azReason(e) ?? mergeReason(e);
      if (reason) return reason;
    }
    return null;
  },
};

// ---- the settings: the charter and the personal file ----

const NONE = { off: false, allow: new Set() };

// Read the charter from every candidate default branch that exists as a remote ref: the default
// that the environment or origin/HEAD names, init.defaultBranch, and the usual names. The strictest
// wins, so a helper cannot move origin/HEAD to a branch that has guards: off. A candidate with no
// charter, or any fault, returns NONE, which is guards on. `allow` is the intersection.
function readCharter(cwd) {
  try {
    const repo = { cwd, gitDir: null };
    const names = new Set([knownDefault(repo), git(['config', 'init.defaultBranch'], repo), ...FALLBACK].filter(Boolean));
    let off = true;
    let allow = null;
    for (const name of names) {
      if (git(['rev-parse', '--verify', '-q', `refs/remotes/origin/${name}`], repo) === null) continue;
      const text = git(['show', `origin/${name}:${CHARTER}`], repo);
      if (text === null) return NONE;
      const { values, lists } = parseFrontMatter(text, ['guards', 'allow']);
      off &&= values.guards === 'off';
      const these = new Set(lists.allow);
      allow = allow === null ? these : new Set([...allow].filter((x) => these.has(x)));
    }
    return allow === null ? NONE : { off, allow };
  } catch {
    return NONE;
  }
}

// Read the personal file. It can only add, so a fault or an unknown key adds nothing.
function readPersonal() {
  try {
    const file = join(process.env.CADRE_HOME || join(homedir(), '.cadre'), 'guards.json');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const deny = Array.isArray(data.deny) ? data.deny.filter((n) => typeof n === 'string') : [];
    return { forceOn: data.guards === 'on', deny: new Set(deny) };
  } catch {
    return { forceOn: false, deny: new Set() };
  }
}

// ---- main ----

function decide(guard, input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('the hook input is not an object');
  const command = input.tool_input?.command;
  if (typeof command !== 'string') throw new Error('tool_input.command is not a string');
  if (command.includes('\0')) throw new Error('the command holds a NUL byte');
  const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd();
  const reason = MATCH[guard](commandsOf(command, cwd));
  if (reason === null) return null;
  // Docs: agent_id is set inside a subagent or an in-process teammate. agent_type is set there too,
  // and in a session that runs with --agent. A field that is present counts, even empty or null.
  // Only a hook input with neither field is the orchestrator.
  if ('agent_id' in input || 'agent_type' in input) {
    return { permissionDecision: 'deny', permissionDecisionReason: `A helper never pushes or merges. This is ${reason}. Tell the orchestrator.` };
  }
  const config = { ...readCharter(cwd), ...readPersonal() };
  const open = config.off || config.allow.has(guard);
  if (open && !config.forceOn && !config.deny.has(guard)) return null;
  return { permissionDecision: 'ask', permissionDecisionReason: `The ${guard} guard asks for your word: ${reason}.` };
}

try {
  const guard = process.argv[2];
  if (!GUARDS.includes(guard)) throw new Error(`the guard must be one of: ${GUARDS.join(', ')}`);
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch (e) {
    throw new Error(`the hook input is not JSON: ${e.message}`);
  }
  const result = decide(guard, input);
  if (result) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...result } }));
} catch (e) {
  console.error(`cadre guard blocks this command, because the guard failed: ${e.message}`);
  process.exit(2);
}
