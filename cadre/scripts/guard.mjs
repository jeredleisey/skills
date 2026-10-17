// A PreToolUse hook on Bash. It guards the one-way steps of git and GitHub.
// Usage: node guard.mjs push|merge        (the hook JSON arrives on stdin)
//   push   a push to the default branch, a force push, or a delete of a remote branch
//   merge  gh pr merge, also with --auto
// Output and exit code:
//   nothing, exit 0        the command is not guarded, or the charter allows it
//   permissionDecision ask  exit 0   the orchestrator needs the word of the human
//   permissionDecision deny exit 0   the call has agent_id, so a helper made it
//   a reason on stderr      exit 2   the hook cannot tell: it blocks the command
// The charter, docs/agents/cadre-charter.md at the repo root of cwd, can set `guards: off` and
// `allow: [<guard>]`. A missing, unreadable, or unparseable charter leaves the guards on.
// A personal file, guards.json in CADRE_HOME or ~/.cadre, can only add: {"guards": "on"} or
// {"deny": [<guard>]}. It never turns a guard off. A bad personal file is ignored.
// The default branch comes from CADRE_DEFAULT_BRANCH, then from refs/remotes/<remote>/HEAD of the repo.
// If both are missing, `main` and `master` count. No command here uses the network.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { parseFrontMatter } from './charter-front-matter.mjs';

const GUARDS = ['push', 'merge'];
const CHARTER = 'docs/agents/cadre-charter.md';

// ---- the shell scanner: split a command line into commands, each a list of words ----

function closeParen(text, from) {
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return text.length;
}

// Push each command of `text` onto `out`. Text in single quotes is data. A $( ) span or a pair of
// backticks is a command of its own, also inside double quotes. A comment is data.
function scan(text, out) {
  let words = [];
  let cur = null;
  const endWord = () => {
    if (cur !== null) words.push(cur);
    cur = null;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) out.push(words);
    words = [];
  };
  // Scan a $( ) span or a backtick pair that starts at i. Return the index after it, or -1.
  const nested = (i) => {
    if (text.startsWith('$(', i)) {
      const end = closeParen(text, i + 2);
      scan(text.slice(i + 2, end), out);
      return end + 1;
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      const stop = end === -1 ? text.length : end;
      scan(text.slice(i + 1, stop), out);
      return stop + 1;
    }
    return -1;
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const after = c === '$' || c === '`' ? nested(i) : -1;
    if (after !== -1) {
      cur = (cur ?? '') + '$()';
      i = after;
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end === -1 ? text.length : end;
      cur = (cur ?? '') + text.slice(i + 1, stop);
      i = stop + 1;
    } else if (c === '"') {
      cur = cur ?? '';
      i++;
      while (i < text.length && text[i] !== '"') {
        const inner = text[i] === '$' || text[i] === '`' ? nested(i) : -1;
        if (inner !== -1) {
          cur += '$()';
          i = inner;
        } else if (text[i] === '\\' && i + 1 < text.length) {
          cur += text[i + 1];
          i += 2;
        } else cur += text[i++];
      }
      i++;
    } else if (c === '\\') {
      cur = (cur ?? '') + (text[i + 1] ?? '');
      i += 2;
    } else if (c === '#' && cur === null) {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '\n' || ';&|()'.includes(c)) {
      endCommand();
      i++;
    } else if (/\s/.test(c)) {
      endWord();
      i++;
    } else {
      cur = (cur ?? '') + c;
      i++;
    }
  }
  endCommand();
}

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const KEYWORDS = new Set(['{', '!', 'if', 'then', 'do', 'else', 'elif', 'while', 'until']);
const WRAPPERS = new Set(['env', 'sudo', 'command', 'exec', 'time', 'nice', 'nohup', 'xargs']);

// Every command that the text may run, as a list of words. A wrapper, a leading assignment, and
// the text of `bash -c` or `eval` are opened, so that the command inside is seen.
function commandsOf(text, depth = 0) {
  const raw = [];
  scan(text, raw);
  const out = [];
  for (let words of raw) {
    let wrapped = false;
    for (;;) {
      const w = words[0];
      if (w === undefined) break;
      if (KEYWORDS.has(w) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) words = words.slice(1);
      else if (WRAPPERS.has(w)) {
        words = words.slice(1);
        wrapped = true;
      } else if (wrapped && w.startsWith('-')) words = words.slice(1);
      else break;
    }
    if (words.length === 0) continue;
    const name = basename(words[0]).replace(/\.exe$/i, '');
    const c = words.findIndex((w) => /^-[a-z]*c$/.test(w));
    if (depth < 5 && SHELLS.has(name) && c !== -1 && words[c + 1] !== undefined) out.push(...commandsOf(words[c + 1], depth + 1));
    else if (depth < 5 && name === 'eval') out.push(...commandsOf(words.slice(1).join(' '), depth + 1));
    out.push([name, ...words.slice(1)]);
  }
  return out;
}

// ---- git and the repo ----

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 ? r.stdout.trim() : null;
}

const currentBranch = (cwd) => git(['symbolic-ref', '--short', '-q', 'HEAD'], cwd) || null;

function defaultBranches(cwd, remote) {
  if (process.env.CADRE_DEFAULT_BRANCH) return new Set([process.env.CADRE_DEFAULT_BRANCH]);
  const name = /^[A-Za-z0-9._-]+$/.test(remote ?? '') ? remote : 'origin';
  const head = git(['symbolic-ref', '--short', '-q', `refs/remotes/${name}/HEAD`], cwd);
  if (head?.startsWith(`${name}/`)) return new Set([head.slice(name.length + 1)]);
  return new Set(['main', 'master']);
}

// ---- the match of each guard: return a short reason, or null when the command is not guarded ----

const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);
const PUSH_VALUE_OPTIONS = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);

function pushReason(args, cwd) {
  let i = 1;
  while (i < args.length && args[i].startsWith('-')) i += GIT_VALUE_OPTIONS.has(args[i]) ? 2 : 1;
  if (args[i] !== 'push') return null;
  let force = false;
  let del = false;
  let wide = false;
  const positional = [];
  for (i += 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--') positional.push(...args.slice(i + 1));
    else if (PUSH_VALUE_OPTIONS.has(a)) i++;
    else if (a.startsWith('--')) {
      const opt = a.split('=')[0];
      if (opt === '--force' || opt === '--force-with-lease' || opt === '--force-if-includes') force = true;
      else if (opt === '--delete') del = true;
      else if (['--all', '--branches', '--mirror', '--prune'].includes(opt)) wide = true;
    } else if (/^-[A-Za-z]+$/.test(a)) {
      if (a.includes('f')) force = true;
      if (a.includes('d')) del = true;
    } else positional.push(a);
  }
  if (del) return 'a delete of a remote branch';
  if (force) return 'a force push';
  if (wide) return 'a push of all branches';
  const remote = positional[0];
  const refspecs = positional.slice(1);
  const branches = defaultBranches(cwd, remote);
  if (refspecs.length === 0) {
    const now = currentBranch(cwd);
    return now === null || branches.has(now) ? 'a push of the current branch, which may be the default branch' : null;
  }
  for (const spec of refspecs) {
    if (spec.startsWith('+')) return 'a force push';
    const colon = spec.indexOf(':');
    if (colon === 0) return 'a delete of a remote branch';
    let target = colon === -1 ? spec : spec.slice(colon + 1);
    if (/[$*?[~]/.test(spec)) return 'a push with a target that the guard cannot read';
    if (target === 'HEAD' || target === '@') target = currentBranch(cwd) ?? 'main';
    if (branches.has(target.replace(/^(refs\/)?heads\//, ''))) return 'a push to the default branch';
  }
  return null;
}

const GH_VALUE_OPTIONS = new Set(['-R', '--repo', '--hostname']);

function mergeReason(args) {
  const words = [];
  for (let i = 1; i < args.length && words.length < 2; i++) {
    if (GH_VALUE_OPTIONS.has(args[i])) i++;
    else if (!args[i].startsWith('-')) words.push(args[i]);
  }
  return args[0] === 'gh' && words[0] === 'pr' && words[1] === 'merge' && !args.includes('--disable-auto') ? 'a merge of a pull request' : null;
}

const MATCH = {
  push: (commands, cwd) => {
    for (const c of commands) if (c[0] === 'git') {
      const reason = pushReason(c, cwd);
      if (reason) return reason;
    }
    return null;
  },
  merge: (commands) => {
    for (const c of commands) {
      const reason = mergeReason(c);
      if (reason) return reason;
    }
    return null;
  },
};

// ---- the settings: the charter and the personal file ----

const NONE = { off: false, allow: new Set() };

// Read the charter. Any fault returns NONE, which is guards on.
function readCharter(cwd) {
  try {
    const root = git(['rev-parse', '--show-toplevel'], cwd) ?? cwd;
    const { values, lists } = parseFrontMatter(readFileSync(join(root, ...CHARTER.split('/')), 'utf8'), ['guards', 'allow']);
    return { off: values.guards === 'off', allow: new Set(lists.allow) };
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

function loadConfig(cwd) {
  return { ...readCharter(cwd), ...readPersonal() };
}

// ---- main ----

function decide(guard, input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('the hook input is not an object');
  const command = input.tool_input?.command;
  if (typeof command !== 'string') throw new Error('tool_input.command is not a string');
  const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd();
  const reason = MATCH[guard](commandsOf(command), cwd);
  if (reason === null) return null;
  const config = loadConfig(cwd);
  const open = config.off || config.allow.has(guard);
  if (open && !config.forceOn && !config.deny.has(guard)) return null;
  const helper = input.agent_id !== undefined && input.agent_id !== null;
  return {
    permissionDecision: helper ? 'deny' : 'ask',
    permissionDecisionReason: helper
      ? `A helper never pushes or merges. This is ${reason}. Tell the orchestrator.`
      : `The ${guard} guard asks for your word: ${reason}.`,
  };
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
