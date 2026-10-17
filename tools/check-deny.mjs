// Check 4: the repo holds no denied word, home path, or email address.
// The denied words are stored as sha256 hashes, so that this repo does not hold them in clear text.
// A line is split into tokens on each character outside [a-z0-9]. Each token and each pair of
// adjacent tokens (joined with no separator) is hashed and compared to the list.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { finish, rootFromArgs, toolsDir, walk } from './lib.mjs';

const denied = new Set(JSON.parse(readFileSync(join(toolsDir, 'deny-hashes.json'), 'utf8')).hashes);
const hash = (s) => createHash('sha256').update(s).digest('hex');

function hasDeniedWord(text) {
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((t, i) => denied.has(hash(t)) || (i + 1 < tokens.length && denied.has(hash(t + tokens[i + 1]))));
}

const homePath = /\/Users\/[A-Za-z0-9._-]+|C:\\Users\\|\/home\/[A-Za-z0-9._-]+/i;
const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const allowedEmail = (e) => e.toLowerCase().endsWith('noreply.github.com') || e.toLowerCase().endsWith('noreply@anthropic.com');

function problem(line) {
  if (hasDeniedWord(line)) return 'denied word';
  if (homePath.test(line)) return 'home path';
  if ((line.match(email) ?? []).some((e) => !allowedEmail(e))) return 'email address';
  return null;
}

const root = rootFromArgs();
const findings = [];
for (const path of walk(root)) {
  const why = hasDeniedWord(path) ? 'denied word in the file name' : null;
  if (why) findings.push(`${path}: ${why}`);
  readFileSync(join(root, path), 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      const p = problem(line);
      if (p) findings.push(`${path}:${i + 1}: ${p}`);
    });
}
finish(findings);
