---
name: setup
description: Set up cadre in a GitHub repo. Check Node and the gh account, ask the questions, and write the charter in a pull request. Run again to add new fields after a cadre update.
disable-model-invocation: true
---

# Setup

Setup teaches cadre how one repo works. It writes the **charter** at `docs/agents/cadre-charter.md` in a pull request, so that the team reviews it like code. Only the human starts setup. This version supports GitHub repos. Run it from the root of the repo.

Never push to the default branch. Never merge the pull request. The human reviews and merges it.

## Steps

### 1. Check Node

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-check.mjs" node`. If the shell says that `node` is not found, that is the same stop. On a line that starts with `stop:`, say the line to the human and end setup. On `unknown:`, say the reason and end setup. Done when the line is `ok node <version>`.

### 2. Find the repo and check the account

1. Run `git remote get-url origin`. Read the host and `<owner>/<repo>` from it. If the host is not `github.com`, ask the human for the host of the GitHub Enterprise server. If there is no remote, end setup and say that this version needs a GitHub remote.
2. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-check.mjs" gh <owner>/<repo> [host]`. Add the host only when it is not `github.com`.
3. On a line that starts with `stop:`, say the line to the human and end setup. The line names `gh auth switch`. A 404 can mean the wrong account, so do not say that the repo does not exist. On `unknown:`, say the reason and end setup.

Done when the line is `ok gh <owner>/<repo>`.

### 3. Read the charter that exists

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/charter-check.mjs"`.

- `missing`: this is a first setup. Ask every question in step 4.
- `ok`: the charter is current. Show its fields and ask the human what to change. Ask only about that.
- `older-cadre` or `stale <old> <new>`: read the charter. Keep each answer that is there. Ask only for each field that is missing or new in [the charter reference](../orchestrate/references/charter.md).
- `plugin-too-old`: end setup and say "The charter is newer than this cadre. Update cadre, then type /cadre:setup again."
- `unknown: <reason>`: say the reason. Ask the human to fix the front matter or to remove the file. Do not overwrite it.

Done when you know which questions to ask.

### 4. Ask the questions

Read `AGENTS.md`, `CLAUDE.md`, and the docs first. Ask only about the gaps. Ask one question at a time and wait for each answer.

1. Which skill pack does this repo use? Offer three presets:
   - `mattpocock-skills`. Say that the human types `/mattpocock-skills:setup-matt-pocock-skills` by hand, because that skill is human-only. The two setups stay separate. Cadre never reads or writes the files of that tool.
   - `superpowers`.
   - `none`. The role cards use a short built-in method.
2. Which files or folders does each orchestrator own? What happens to that ownership when code moves to a new repo?
3. Who may merge, and with which merge method? Who may deploy, and how?
4. Which documentation must follow a change, and who writes it?
5. Which actions does only the human do? For example: a payment, a change of account, a restart of a host, a delete of data.
6. Which secrets exist, where do they live, and how does a command read one without a print?
7. Which traps does this repo or this machine have? For example: a wrong default account, a shared clone that nobody may edit.
8. Which clones does a live tool run from, so that they need an update after a merge?

Done when each question has an answer, or the human says "none".

### 5. Write the charter in a pull request

1. Run `git status`. If the tree is not clean, stop and ask the human what to do with the changes.
2. Run `git remote show origin`, or `gh repo view --json defaultBranchRef`, to find the default branch. Make a branch from it: `git switch -c cadre-charter <default branch>`. If the branch name exists, add a number to it.
3. Write `docs/agents/cadre-charter.md` in the form of [the charter reference](../orchestrate/references/charter.md). Set `charter_schema` to the value of the constant `PLUGIN_SCHEMA` in `${CLAUDE_PLUGIN_ROOT}/scripts/charter-check.mjs`. Set `written_by` to `cadre ` and the `version` in `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. Leave out each field that is at its default.
4. Make sure that `.gitignore` has the line `.claude/worktrees/`. Add it if not.
5. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/charter-check.mjs"`. The line must be `ok`. If not, fix the file.
6. Commit the files, push the branch with `git push -u origin cadre-charter`, and open the pull request with `gh pr create --base <default branch> --title "Add the cadre charter" --body "<what the charter holds and the questions that the human answered>"`.
7. Say the URL of the pull request. Say that the human reviews and merges it, and that `/cadre:orchestrate` works after the merge.

Done when the pull request is open and the check printed `ok` on the branch.

## Rules

- A charter never holds a secret value. It holds the names of stores only.
- Ask the human for each answer. Do not guess an answer from another tool's file.
- Setup changes no branch policy and no setting of the repo.
