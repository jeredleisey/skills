#!/usr/bin/env bash
# A git repo whose charter has schema 1. The prompt sets the plugin schema to 2.
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
git add docs
git commit -q -m "Add the charter"
