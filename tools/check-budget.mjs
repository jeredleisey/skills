// Check 3: the words that load in every session stay within the budget.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { finish, rootFromArgs } from './lib.mjs';

const counted = [
  'cadre/skills/orchestrate/SKILL.md',
  'cadre/agents/coder.md',
  'cadre/agents/reviewer.md',
  'cadre/agents/researcher.md',
  'cadre/agents/tester.md',
  'cadre/skills/orchestrate/references/charter.md',
];

const root = rootFromArgs();
const findings = [];
let budget;
try {
  budget = JSON.parse(readFileSync(join(root, 'tools/word-budget.json'), 'utf8')).budget;
  if (!Number.isInteger(budget)) throw new Error('budget is not an integer');
} catch (e) {
  findings.push(`tools/word-budget.json: ${e.message}`);
}

let total = 0;
for (const path of counted) {
  if (!existsSync(join(root, path))) {
    findings.push(`${path}: file is missing`);
    continue;
  }
  total += readFileSync(join(root, path), 'utf8').split(/\s+/).filter(Boolean).length;
}
if (findings.length === 0 && total > budget) findings.push(`word budget: ${total} words, budget ${budget}. Move detail into a reference that this check does not count. Or raise the budget, with a reason in the pull request. Never cut a rule or a check to fit.`);
finish(findings);
