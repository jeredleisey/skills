// Check 5: the four role cards have the same `## Rules` block, and no card has a `skills:` field.
// The block runs from the line `## Rules` to the next `## ` heading, or to the end of the file.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { finish, rootFromArgs } from './lib.mjs';

const cards = ['coder', 'reviewer', 'researcher', 'tester'];
const root = rootFromArgs();
const findings = [];
const blocks = {};

for (const name of cards) {
  const path = `cadre/agents/${name}.md`;
  if (!existsSync(join(root, path))) {
    findings.push(`${path}: file is missing`);
    continue;
  }
  const lines = readFileSync(join(root, path), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (lines.slice(1, end === -1 ? lines.length : end).some((l) => /^skills:/.test(l))) {
      findings.push(`${path}: the front matter has a skills field`);
    }
  }
  const start = lines.indexOf('## Rules');
  if (start === -1) {
    findings.push(`${path}: no "## Rules" block`);
    continue;
  }
  let stop = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (stop === -1) stop = lines.length;
  blocks[name] = lines.slice(start, stop).join('\n').trim();
}

const names = Object.keys(blocks);
for (const name of names.slice(1)) {
  if (blocks[name] !== blocks[names[0]]) findings.push(`cadre/agents/${name}.md: the Rules block differs from ${names[0]}.md`);
}
finish(findings);
