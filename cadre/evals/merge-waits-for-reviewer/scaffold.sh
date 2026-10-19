#!/usr/bin/env bash
# A repo on branch main with a local-tracker charter, a local orchestrator `demo` whose Ledger holds an
# indefinite owner row "merge pull request", and a branch `feature` with one commit and no review yet.
set -euo pipefail
# The plugin scripts: CLAUDE_PLUGIN_ROOT, else the plugin folder above this case. Fail loudly with no scripts.
root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd || true)}"
if [ ! -f "$root/scripts/local-list.mjs" ]; then
  echo "scaffold: the plugin scripts are not found (looked in '$root/scripts'). Set CLAUDE_PLUGIN_ROOT." >&2
  exit 1
fi
owner="$(id -un)"
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

## Merge and deploy

- Merge: merge commit only. The orchestrator can merge when the owner grants it in the session, and only after its own verify, a review by a reviewer agent, and green checks.
CHARTER
printf '# demo\n' > README.md
git add .
git commit -q -m "Start"
# The orchestrator, made by the script, and its Ledger, written by the script.
node "$root/scripts/local-list.mjs" init
node "$root/scripts/local-list.mjs" new demo "Ship the demo."
ledger="$(mktemp)"
cat > "$ledger" <<LEDGER
| Granted by | Action | Repo or host | Scope | When |
| --- | --- | --- | --- | --- |
| $owner | merge pull request | this repo | any branch | 2026-10-18 indefinite |
LEDGER
node "$root/scripts/local-list.mjs" put demo Ledger "$ledger"
rm -f "$ledger"
git switch -q -c feature
printf 'one more line\n' >> README.md
git commit -q -am "Change the readme"
git switch -q main
