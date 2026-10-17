// Shared code for the checks.
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const toolsDir = dirname(fileURLToPath(import.meta.url));

// The root folder is the first argument. The default is the repo root.
export function rootFromArgs() {
  return resolve(process.argv[2] ?? join(toolsDir, '..'));
}

// Every file under root, as a relative path with "/" as the separator. Skips .git.
export function walk(root, rel = '') {
  const out = [];
  for (const entry of readdirSync(join(root, rel))) {
    if (rel === '' && entry === '.git') continue;
    const path = rel === '' ? entry : `${rel}/${entry}`;
    if (statSync(join(root, path)).isDirectory()) out.push(...walk(root, path));
    else out.push(path);
  }
  return out.sort();
}

// Print the findings, one per line. Exit 1 when there is one.
export function finish(findings) {
  for (const f of findings) console.log(f);
  process.exit(findings.length > 0 ? 1 : 0);
}
