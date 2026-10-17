// Read a shell command line for guard.mjs. No command here runs anything.
//   commandsOf(text, dir)  every command that the text may run, as { args, dir, text }
//   HAS_VARIABLE, SPECIAL  patterns for a word that the guard cannot read
// The scanner splits the text into commands and words. It reads quotes, $( ), backticks, comments,
// heredocs, redirections, and a backslash-newline. It opens wrappers (sudo, env, timeout, xargs,
// ssh, find -exec, bash -c, eval), so that the command inside is seen. It follows `cd`, so each
// entry carries the folder where it runs, or null when the guard cannot tell.
// An entry with args[0] of `?` holds the words of a command that the guard cannot read. An entry
// with args[0] of `!` holds a command with a variable where the guard needs a word.
import { resolve } from 'node:path';

export const HAS_VARIABLE = /[$`]/;
// A tilde expands only at the start of a word, or after : or =. Inside a word it is a literal.
export const SPECIAL = /[$*?[`{]|^~|[:=]~/;
const REDIRECTION = /^(&>>|&>|<<<|<<-|<<|>>|>\||>&|<&|<>|>|<)/;

function closeParen(text, from) {
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return text.length;
}

// Push each command of `text` onto `out`. `state.unbalanced` becomes true at a quote with no end.
// Text in single quotes is data. A $( ) span or a pair of backticks is a command of its own, also
// inside double quotes. A <( ) or >( ) span is a command of its own and one argument. A comment is data.
function scan(text, out, state) {
  let words = [];
  let redirs = [];
  let pending = null;
  let cur = null;
  const endWord = () => {
    if (cur !== null && pending !== null) redirs.push({ op: pending, target: cur });
    else if (cur !== null) words.push(cur);
    if (cur !== null) pending = null;
    cur = null;
  };
  const endCommand = () => {
    endWord();
    pending = null;
    if (words.length > 0) {
      words.redirs = redirs;
      out.push(words);
    }
    words = [];
    redirs = [];
  };
  // Scan a $( ) span, a <( ) or >( ) process substitution, or a backtick pair that starts at i.
  // Return the index after it, or -1.
  const nested = (i) => {
    if (text[i + 1] === '(' && '$<>'.includes(text[i])) {
      const end = closeParen(text, i + 2);
      scan(text.slice(i + 2, end), out, state);
      return end + 1;
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      const stop = end === -1 ? text.length : end;
      if (end === -1) state.unbalanced = true;
      scan(text.slice(i + 1, stop), out, state);
      return stop + 1;
    }
    return -1;
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const after = '$`<>'.includes(c) ? nested(i) : -1;
    if (after !== -1) {
      cur = (cur ?? '') + '$()';
      i = after;
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      if (end === -1) state.unbalanced = true;
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
      if (i >= text.length) state.unbalanced = true;
      i++;
    } else if (c === '\\') {
      cur = (cur ?? '') + (text[i + 1] ?? '');
      i += 2;
    } else if (c === '#' && cur === null) {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '<' || c === '>' || (c === '&' && text[i + 1] === '>')) {
      // A redirection is an operator and its target. It is not an argument. Its & is not a break.
      const op = REDIRECTION.exec(text.slice(i))[0];
      if (cur !== null && /^[0-9]+$/.test(cur)) cur = null;
      else endWord();
      pending = op;
      i += op.length;
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

// Cut each heredoc body out of the text. A body is data, not shell text. Return the kept text, the
// bodies, and `unterminated`: the text before the body of a heredoc that has no end tag, else null.
function stripHeredocs(text) {
  const lines = text.split('\n');
  const kept = [];
  const bodies = [];
  let unterminated = null;
  let quote = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    kept.push(line);
    const tags = [];
    for (let k = 0; k < line.length; k++) {
      const c = line[k];
      if (quote === null && c === '\\') k++;
      else if (quote === '"' && c === '\\') k++;
      else if (quote === null && (c === "'" || c === '"')) quote = c;
      else if (quote === c) quote = null;
      else if (quote === null && c === '<' && line[k + 1] === '<' && line[k + 2] !== '<' && line[k - 1] !== '<') {
        const m = /^(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|\\?([A-Za-z_0-9]+))/.exec(line.slice(k + 2));
        if (m) tags.push({ dash: m[1] === '-', tag: m[2] ?? m[3] ?? m[4] });
      }
    }
    for (const { dash, tag } of tags) {
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j].replace(/\r$/, '');
        if ((dash ? l.replace(/^\t+/, '') : l) === tag) break;
        body.push(lines[j]);
      }
      bodies.push(body.join('\n'));
      if (j >= lines.length) {
        unterminated = kept.join('\n');
        i = lines.length;
        break;
      }
      i = j;
    }
  }
  return { text: kept.join('\n'), bodies, unterminated };
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

// A shell with no -c and no script reads its commands from stdin. Redirections are not in args.
function isBareShell(args) {
  let script = false;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-')) script = true;
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
export function commandsOf(text, dir, depth = 0) {
  if (depth > 4) throw new Error('nesting of bash -c, sh -c, eval, or ssh is deeper than 4 levels');
  const raw = [];
  const state = { unbalanced: false };
  const doc = stripHeredocs(text.replace(/\\\r?\n/g, ''));
  scan(doc.text, raw, state);
  const out = [];
  if (doc.unterminated !== null) out.push({ args: ['?', ...tokensOf([doc.unterminated])], dir });
  if (state.unbalanced) out.push({ args: ['?', ...tokensOf([doc.text])], dir });
  let feeds = false;
  for (let words of raw) {
    let unreadable = false;
    let viaXargs = false;
    for (;;) {
      if (words[0] === undefined) break;
      if (KEYWORDS.has(words[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) {
        words = words.slice(1);
        continue;
      }
      const wrapper = norm(words[0]);
      if (!Object.hasOwn(WRAPPERS, wrapper)) break;
      const rest = unwrap(wrapper, words.slice(1));
      viaXargs ||= wrapper === 'xargs';
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
    // xargs appends arguments that the guard cannot see, so it asks for a push or a merge.
    if (viaXargs && name === 'git' && args.includes('push')) out.push({ args: ['!'], guard: 'push', always: true, text });
    if (viaXargs && name === 'gh' && args.includes('pr') && args.includes('merge')) out.push({ args: ['!'], guard: 'merge', always: true, text });
    if (HAS_VARIABLE.test(words[0])) {
      out.push({ args: ['!'], guard: 'both', always: false, text });
      continue;
    }
    if (name === 'cd' || name === 'pushd' || name === 'popd') {
      dir = afterCd(dir, args, text);
      continue;
    }
    if (SHELLS.has(name)) {
      const c = args.findIndex((a, i) => i > 0 && /^-[a-z]*c$/.test(a));
      if (c !== -1 && args[c + 1] !== undefined) out.push(...commandsOf(args[c + 1], dir, depth + 1));
      else if (isBareShell(args)) feeds = true;
    } else if (name === 'eval') {
      if (args.slice(1).some((a) => HAS_VARIABLE.test(a))) out.push({ args: ['!'], guard: 'both', always: true, text });
      out.push(...commandsOf(args.slice(1).join(' '), dir, depth + 1));
    }
    else if (name === 'find') {
      args.forEach((a, i) => {
        if (!FIND_EXEC.has(a)) return;
        let end = i + 1;
        while (end < args.length && args[end] !== ';' && args[end] !== '+') end++;
        out.push(...commandsOf(args.slice(i + 1, end).map(quote).join(' '), dir, depth + 1));
      });
    }
    out.push({ args, dir, text });
  }
  if (feeds) {
    const targets = raw.flatMap((w) => (w.redirs ?? []).map((r) => r.target));
    out.push({ args: ['?', ...tokensOf([...raw.flat(), ...targets, ...doc.bodies])], dir });
  }
  return out;
}
