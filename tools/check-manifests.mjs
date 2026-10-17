// Check 1: every .claude-plugin/*.json parses and holds the fields that Claude Code needs.
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { finish, rootFromArgs, walk } from './lib.mjs';

const root = rootFromArgs();
const findings = [];
const isManifest = (p) => /(^|\/)\.claude-plugin\/[^/]+\.json$/.test(p);
const manifests = walk(root).filter(isManifest);

if (manifests.length === 0) findings.push('no .claude-plugin manifest found');

for (const path of manifests) {
  let data;
  try {
    data = JSON.parse(readFileSync(join(root, path), 'utf8'));
  } catch (e) {
    findings.push(`${path}: not valid JSON (${e.message})`);
    continue;
  }
  if (typeof data.name !== 'string' || data.name === '') findings.push(`${path}: missing name`);
  if (!path.endsWith('/marketplace.json') && path !== '.claude-plugin/marketplace.json') continue;
  if (!Array.isArray(data.plugins) || data.plugins.length === 0) {
    findings.push(`${path}: plugins must be a non-empty list`);
    continue;
  }
  const base = posix.dirname(posix.dirname(path));
  for (const [i, plugin] of data.plugins.entries()) {
    if (typeof plugin.name !== 'string' || plugin.name === '') findings.push(`${path}: plugin ${i} has no name`);
    if (typeof plugin.source !== 'string') {
      findings.push(`${path}: plugin ${plugin.name ?? i} has no source`);
      continue;
    }
    const folder = join(root, base, plugin.source);
    if (!existsSync(folder)) findings.push(`${path}: source folder ${plugin.source} does not exist`);
  }
}
finish(findings);
