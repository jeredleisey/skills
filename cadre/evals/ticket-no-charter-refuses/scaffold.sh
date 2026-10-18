#!/usr/bin/env bash
# A git repo with one commit and no charter.
set -euo pipefail
git init -q -b main
git config user.name "eval bot"
git config user.email "eval-bot@noreply.github.com"
printf '# demo\n' > README.md
git add README.md
git commit -q -m "Start"
