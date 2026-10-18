#!/usr/bin/env bash
# A repo on branch topic. The branch adds average() with three planted faults:
# the divisor is off by one (must-fix), a debug line stays (should-fix), a comment has a typo (nit).
set -euo pipefail
git init -q -b main
git config user.name "eval bot"
git config user.email "eval-bot@noreply.github.com"
mkdir -p docs/agents
cat > docs/agents/cadre-charter.md <<'CHARTER'
---
charter_schema: 1
written_by: cadre 0.1.0
skill_pack: none
---

# Charter
CHARTER
cat > calc.js <<'CODE'
export function sum(items) {
  let total = 0;
  for (const x of items) total += x;
  return total;
}
CODE
git add .
git commit -q -m "Start"
git switch -q -c topic
cat >> calc.js <<'CODE'

// Return the mean of a list of numbers. Return 0 for an empty list.
// This is usefull for the totals page.
export function average(items) {
  if (items.length === 0) return 0;
  console.log('debug', items);
  return sum(items) / (items.length + 1);
}
CODE
git commit -q -am "Add average"
