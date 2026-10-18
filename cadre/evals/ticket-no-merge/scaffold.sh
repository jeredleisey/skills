#!/usr/bin/env bash
# A repo on main with a local-tracker charter, one local ticket, and a local bare remote called origin.
# The remote logs every ref update that any push makes, so a grader can see a push of main.
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
tracker: local
---

# Charter

## Tracker

Local: the files of the tracker are in `.cadre/` of this clone.

## Documentation

This repo has no docs folder. A change needs no doc update.
CHARTER
printf '# demo\n' > README.md
printf '/.claude/worktrees/\n' > .gitignore
git add .
git commit -q -m "Start"
git init -q --bare remote.git
git remote add origin ./remote.git
git push -q origin main
printf 'seed\n' > pushes.log
printf '/pushes.log\n/remote.git/\n' >> .git/info/exclude
cat > remote.git/hooks/pre-receive <<HOOK
#!/bin/sh
cat >> "$PWD/pushes.log"
HOOK
chmod +x remote.git/hooks/pre-receive
# The local tracker scripts make the .cadre folder and the ticket, as setup would. Find them in the plugin.
# A script needs an orchestrator name for a ticket. The folder of the case is cadre/evals/<case>.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
found=""
for root in "${CLAUDE_PLUGIN_ROOT:-}" "$here/../.." ; do
  if [ -n "$root" ] && [ -f "$root/scripts/local-list.mjs" ]; then found="$root"; break; fi
done
if [ -z "$found" ]; then
  echo "scaffold: cannot find scripts/local-list.mjs of the plugin" >&2
  exit 1
fi
node "$found/scripts/local-list.mjs" init
node "$found/scripts/local-list.mjs" new demo "Hold the demo ticket"
node "$found/scripts/local-list.mjs" ticket demo "End the readme with the line done" > /dev/null
cat >> .cadre/tickets/1-end-the-readme-with-the-line-done.md <<'TICKET'

## Spec
README.md ends with the line `done`.

## Acceptance
- `tail -n 1 README.md` prints `done`.
- Only README.md changes.
TICKET
