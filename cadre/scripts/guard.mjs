// A PreToolUse hook on Bash. It guards the one-way steps of git and GitHub.
// Usage: node guard.mjs push|merge        (the hook JSON arrives on stdin)
//   push   a push to the default branch, a force push, or a delete of a remote branch
//   merge  gh pr merge, also with --auto
// Output and exit code:
//   nothing, exit 0         the command is not guarded, or the charter allows it for the orchestrator
//   permissionDecision ask  exit 0   the orchestrator needs the word of the human
//   permissionDecision deny exit 0   the call has agent_id (even empty or null), so a helper made it
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

const GUARDS = ['push', 'merge'];
const CHARTER = 'docs/agents/cadre-charter.md';
const FALLBACK = ['main', 'master', 'dev', 'develop', 'trunk'];
const SPECIAL = /[$*?[~`{]/;

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

// A command word without its path, its .exe, or its case.
const norm = (w) => w.split(/[\\/]/).pop().replace(/\.exe$/i, '').toLowerCase();
const tokensOf = (words) => words.flatMap((w) => w.split(/\s+/)).filter(Boolean).map(norm);
const quote = (w) => `'${w.replace(/'/g, `'\\''`)}'`;

// Wrappers run the command that follows their options. `values` take the next word,
// `flags` do not. `skip` is the count of positional words before the command.
const w = (values, flags, extra = {}) => ({ values: new Set(values), flags: new Set(flags), ...extra });
const WRAPPERS = {
  sudo: w(['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T', '-U', '-r', '-t', '--user', '--group', '--host', '--prompt', '--chdir', '--role', '--type', '--close-from', '--other-user', '--command-timeout'],
    ['-A', '-b', '-E', '-e', '-H', '-i', '-K', '-k', '-l', '-n', '-P', '-S', '-s', '-V', '-v', '--askpass', '--background', '--preserve-env', '--login', '--non-interactive', '--shell', '--stdin', '--reset-timestamp', '--remove-timestamp', '--validate', '--edit', '--list']),
  doas: w(['-u', '-C'], ['-n', '-s']),
  env: w(['-u', '-C', '--unset', '--chdir'], ['-i', '-0', '-v', '--ignore-environment', '--null', '--debug'], { assign: true }),
  nice: w(['-n', '--adjustment'], []),
  ionice: w(['-c', '-n', '-p', '-P', '-u', '--class', '--classdata', '--pid', '--pgid', '--uid'], ['-t', '--ignore']),
  nohup: w([], []),
  time: w(['-f', '-o', '--format', '--output'], ['-p', '-a', '-v', '--append', '--portability', '--verbose']),
  command: w([], ['-p', '-v', '-V']),
  exec: w(['-a'], ['-c', '-l']),
  timeout: w(['-s', '-k', '--signal', '--kill-after'], ['-v', '--foreground', '--preserve-status', '--verbose'], { skip: 1 }),
  watch: w(['-n', '--interval'], ['-d', '-t', '-x', '-e', '-b', '-c', '-g', '-p', '-q', '-r', '-w', '-C', '--differences', '--no-title', '--exec', '--errexit', '--beep', '--color', '--chgexit', '--precise', '--equexit']),
  stdbuf: w(['-i', '-o', '-e', '--input', '--output', '--error'], []),
  setsid: w([], ['-c', '-f', '-w', '--ctty', '--fork', '--wait']),
  caffeinate: w(['-t', '-w'], ['-d', '-i', '-m', '-s', '-u']),
  busybox: w([], []),
  xargs: w(['-I', '-n', '-P', '-L', '-d', '-E', '-s', '-a', '--max-args', '--max-procs', '--max-lines', '--delimiter', '--eof', '--max-chars', '--arg-file'],
    ['-0', '-t', '-r', '-p', '-x', '-o', '-i', '-l', '-e', '--null', '--verbose', '--no-run-if-empty', '--interactive', '--open-tty', '--exit']),
  ssh: w(['-B', '-b', '-c', '-D', '-E', '-e', '-F', '-I', '-i', '-J', '-L', '-l', '-m', '-O', '-o', '-p', '-Q', '-R', '-S', '-W', '-w'],
    ['-4', '-6', '-A', '-a', '-C', '-f', '-G', '-g', '-K', '-k', '-M', '-N', '-n', '-q', '-s', '-T', '-t', '-V', '-v', '-X', '-x', '-Y', '-y'], { skip: 1, remote: true }),
};

// The words after a wrapper and its options, or null when an option is not known.
function unwrap(name, words) {
  const spec = WRAPPERS[name];
  let i = 0;
  for (; i < words.length; i++) {
    const a = words[i];
    if (spec.assign && /^[A-Za-z_][A-Za-z0-9_]*=/.test(a)) continue;
    if (a === '--') {
      i++;
      break;
    }
    if (!a.startsWith('-') || a === '-') break;
    if (name === 'env' && (a === '-S' || a.startsWith('--split-string'))) return null;
    if (a.startsWith('--')) {
      const opt = a.split('=')[0];
      if (spec.values.has(opt)) {
        if (!a.includes('=')) i++;
        continue;
      }
      if (spec.flags.has(opt)) continue;
      return null;
    }
    if (spec.values.has(a)) {
      i++;
      continue;
    }
    if (spec.values.has(a.slice(0, 2)) || /^-\d+$/.test(a)) continue;
    if ([...a.slice(1)].every((ch) => spec.flags.has(`-${ch}`))) continue;
    return null;
  }
  return words.slice(i + (spec.skip ?? 0));
}

// A shell with no -c and no script reads its commands from stdin.
function isBareShell(args) {
  let script = false;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (/^<{1,3}-?$/.test(a)) i++;
    else if (a === '>' || a === '>>') i++;
    else if (a.startsWith('<') || a.startsWith('>') || /^[0-9]+>/.test(a) || a.startsWith('-')) continue;
    else script = true;
  }
  return !script;
}

// The directory after `cd`, or null when the guard cannot tell.
function afterCd(dir, args, text) {
  if (args[0] !== 'cd' || dir === null || /[()`]/.test(text)) return null;
  const dest = args.slice(1).find((a) => !a.startsWith('-'));
  return dest === undefined || SPECIAL.test(dest) ? null : resolve(dir, dest);
}

const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir']);

// Every command that the text may run, as { args, dir }. `dir` is the folder where it runs, or
// null when the guard cannot tell. A wrapper, a leading assignment, `bash -c`, `eval`, `ssh`, and
// `find -exec` are opened, so that the command inside is seen. An entry with args[0] of `?` holds
// the words of a command that the guard cannot read.
function commandsOf(text, dir, depth = 0) {
  const raw = [];
  scan(text.replace(/\\\r?\n/g, ''), raw);
  if (depth > 5) return [{ args: ['?', ...tokensOf(raw.flat())], dir }];
  const out = [];
  let feeds = false;
  for (let words of raw) {
    let unreadable = false;
    for (;;) {
      if (words[0] === undefined) break;
      if (KEYWORDS.has(words[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) {
        words = words.slice(1);
        continue;
      }
      const wrapper = norm(words[0]);
      if (!Object.hasOwn(WRAPPERS, wrapper)) break;
      const rest = unwrap(wrapper, words.slice(1));
      if (rest === null) {
        unreadable = true;
        break;
      }
      if (WRAPPERS[wrapper].remote || (rest.length === 1 && /\s/.test(rest[0]))) {
        out.push(...commandsOf(rest.join(' '), dir, depth + 1));
        words = [];
        break;
      }
      words = rest;
    }
    if (unreadable) {
      out.push({ args: ['?', ...tokensOf(words.slice(1))], dir });
      continue;
    }
    if (words.length === 0) continue;
    const name = norm(words[0]);
    const args = [name, ...words.slice(1)];
    if (name === 'cd' || name === 'pushd' || name === 'popd') {
      dir = afterCd(dir, args, text);
      continue;
    }
    if (SHELLS.has(name)) {
      const c = args.findIndex((a, i) => i > 0 && /^-[a-z]*c$/.test(a));
      if (c !== -1 && args[c + 1] !== undefined) out.push(...commandsOf(args[c + 1], dir, depth + 1));
      else if (isBareShell(args)) feeds = true;
    } else if (name === 'eval') out.push(...commandsOf(args.slice(1).join(' '), dir, depth + 1));
    else if (name === 'find') {
      args.forEach((a, i) => {
        if (!FIND_EXEC.has(a)) return;
        let end = i + 1;
        while (end < args.length && args[end] !== ';' && args[end] !== '+') end++;
        out.push(...commandsOf(args.slice(i + 1, end).map(quote).join(' '), dir, depth + 1));
      });
    }
    out.push({ args, dir });
  }
  if (feeds) out.push({ args: ['?', ...tokensOf(raw.flat())], dir });
  return out;
}

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
  const known = knownDefault(repo, remote);
  if (known) return new Set([known]);
  const names = new Set(FALLBACK);
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

const place = (cwd, to) => (cwd === null || to === undefined || SPECIAL.test(to) ? null : resolve(cwd, to));

function pushReason({ args, dir }) {
  const repo = { cwd: dir, gitDir: null };
  let i = 1;
  while (i < args.length && args[i].startsWith('-')) {
    const a = args[i];
    const opt = a.startsWith('--') ? a.split('=')[0] : a;
    let value;
    if (GIT_VALUE_OPTIONS.has(opt)) value = a.startsWith('--') && a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[++i];
    i++;
    if (opt === '-C' || opt === '--work-tree') repo.cwd = place(repo.cwd, value);
    else if (opt === '--git-dir') {
      if (place(repo.cwd, value) === null) repo.cwd = null;
      else repo.gitDir = place(repo.cwd, value);
    }
  }
  if (args[i] !== 'push') return null;
  let force = false;
  let del = false;
  let wide = false;
  let repoOption = false;
  let ambiguous = false;
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
      const opt = eq === -1 ? a : a.slice(0, eq);
      if (opt === '--force' || opt === '--force-with-lease' || opt === '--force-if-includes') force = true;
      else if (opt === '--delete') del = true;
      else if (['--all', '--branches', '--mirror', '--prune'].includes(opt)) wide = true;
      else if (opt === '--repo' || PUSH_VALUE_OPTIONS.has(opt)) {
        repoOption ||= opt === '--repo';
        if (eq === -1) loose.push(args[++i] ?? '');
        else loose.push(a.slice(eq + 1));
      } else if ((opt === '--recurse-submodules' || opt === '--signed') && eq === -1) ambiguous = true;
    } else if (/^-[A-Za-z]+$/.test(a)) {
      if (a.includes('f')) force = true;
      if (a.includes('d')) del = true;
      if (a === '-o') loose.push(args[++i] ?? '');
    } else positional.push(a);
  }
  if (del) return 'a delete of a remote branch';
  if (force) return 'a force push';
  if (wide) return 'a push of all branches';
  const branches = defaultBranches(repo, positional[0]);
  if (positional.length <= (ambiguous ? 2 : 1)) {
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

const GH_VALUE_OPTIONS = new Set(['-R', '--repo', '--hostname']);

function mergeReason({ args }) {
  const words = [];
  for (let i = 1; i < args.length && words.length < 2; i++) {
    if (GH_VALUE_OPTIONS.has(args[i])) i++;
    else if (!args[i].startsWith('-')) words.push(args[i]);
  }
  return args[0] === 'gh' && words[0] === 'pr' && words[1] === 'merge' && !args.includes('--disable-auto') ? 'a merge of a pull request' : null;
}

// An entry that the guard cannot read matches when its words include the words of the command.
const holds = (args, need) => need.every((word) => args.includes(word));

const MATCH = {
  push: (entries) => {
    for (const e of entries) {
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
      if (e.args[0] === '?' && holds(e.args, ['gh', 'pr', 'merge'])) return 'a command that the guard cannot read, with a merge in it';
      const reason = mergeReason(e);
      if (reason) return reason;
    }
    return null;
  },
};

// ---- the settings: the charter and the personal file ----

const NONE = { off: false, allow: new Set() };

// Read the charter from origin/<default branch>. Any fault returns NONE, which is guards on.
function readCharter(cwd) {
  try {
    const repo = { cwd, gitDir: null };
    const branch = knownDefault(repo);
    if (!branch) return NONE;
    const text = git(['show', `origin/${branch}:${CHARTER}`], repo);
    if (text === null) return NONE;
    const { values, lists } = parseFrontMatter(text, ['guards', 'allow']);
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

// ---- main ----

function decide(guard, input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('the hook input is not an object');
  const command = input.tool_input?.command;
  if (typeof command !== 'string') throw new Error('tool_input.command is not a string');
  const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd();
  const reason = MATCH[guard](commandsOf(command, cwd));
  if (reason === null) return null;
  // Only an absent agent_id means the main session. An empty or null one counts as a helper.
  if ('agent_id' in input) {
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
