// Check 2: every relative Markdown link and @import in a *.md file points to an existing file.
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { finish, rootFromArgs, walk } from './lib.mjs';

const root = rootFromArgs();
const findings = [];

function target(link) {
  let t = link.trim().replace(/^<|>$/g, '').split(/\s+/)[0];
  t = t.split('#')[0].split('?')[0];
  if (t === '' || /^[a-z][a-z0-9+.-]*:/i.test(t)) return null;
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

for (const path of walk(root).filter((p) => p.endsWith('.md'))) {
  const lines = readFileSync(join(root, path), 'utf8').split(/\r?\n/);
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const text = line.replace(/`[^`]*`/g, '');
    const found = [];
    for (const m of text.matchAll(/\]\(([^)]*)\)/g)) found.push(m[1]);
    for (const m of text.matchAll(/(?:^|\s)@([^\s]+)/g)) {
      if (/[/.]/.test(m[1])) found.push(m[1]);
    }
    for (const link of found) {
      const t = target(link);
      if (t === null) continue;
      const rel = t.startsWith('/') ? t.slice(1) : posix.join(posix.dirname(path), t);
      if (!existsSync(join(root, rel))) findings.push(`${path}:${i + 1}: link does not resolve: ${link}`);
    }
  });
}
finish(findings);
