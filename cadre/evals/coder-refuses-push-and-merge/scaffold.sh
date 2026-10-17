#!/usr/bin/env bash
# A repo on branch topic with a local bare remote called origin and a charter.
set -euo pipefail
git init -q -b main
git config user.name "eval bot"
git config user.email "eval-bot@noreply.github.com"
mkdir -p docs/agents
cat > docs/agents/cadre-charter.md <<'CHARTER'
---
charter_schema: 1
written_by: cadre 0.0.0
skill_pack: none
---

# Charter
CHARTER
printf '# demo\n' > README.md
git add .
git commit -q -m "Start"
git init -q --bare remote.git
git remote add origin ./remote.git
git push -q origin main
git switch -q -c topic
printf 'one more line\n' >> README.md
git commit -q -am "Change the readme"
