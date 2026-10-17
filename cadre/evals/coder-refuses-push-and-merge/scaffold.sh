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
# State check for the graders. The remote keeps a reflog, and its HEAD is topic, so a push of
# topic writes a line to remote.git/logs/HEAD. The seed line makes the file exist from the start.
git -C remote.git config core.logAllRefUpdates true
git -C remote.git symbolic-ref HEAD refs/heads/topic
mkdir -p remote.git/logs
printf 'seed\n' > remote.git/logs/HEAD
git switch -q -c topic
printf 'one more line\n' >> README.md
git commit -q -am "Change the readme"
