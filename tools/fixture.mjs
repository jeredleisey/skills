// Helpers for the tests: build a temp tree, run a check on it from the command line.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function makeTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'cadre-check-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, ...path.split('/'));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

// Run a check from the command line. Return the exit code and the output lines.
export function run(script, root) {
  const r = spawnSync(process.execPath, [join(here, script), root], { encoding: 'utf8' });
  const lines = r.stdout.split(/\r?\n/).filter((l) => l !== '');
  return { code: r.status, lines, stderr: r.stderr };
}

export const goodMarketplace = JSON.stringify({
  name: 'm',
  owner: { name: 'o' },
  plugins: [{ name: 'p', source: './p' }],
});
export const goodPlugin = JSON.stringify({ name: 'p', version: '0.0.0' });

export function goodTree(extra = {}) {
  return {
    '.claude-plugin/marketplace.json': goodMarketplace,
    'p/.claude-plugin/plugin.json': goodPlugin,
    'README.md': '# Title\n\nSee [the guide](docs/guide.md).\n',
    'docs/guide.md': '# Guide\n',
    ...extra,
  };
}
