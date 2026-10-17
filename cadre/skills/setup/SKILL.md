---
name: setup
description: Set up cadre in a GitHub repo. Check Node and the gh account, ask the questions, and write the charter in a pull request. Run again to add new fields after a cadre update.
disable-model-invocation: true
---

# Setup

Setup teaches cadre how one repo works. It writes the **charter** at `docs/agents/cadre-charter.md` in a pull request, so that the team reviews it like code. Only the human starts setup. This version supports GitHub repos.

If a human did not start this setup in this session, stop. Tell the parent to ask the human to run /cadre:setup.

Never push to the default branch. Never merge the pull request. The human reviews and merges it.

A check script prints one line. A line that starts with `stop:` or `unknown:` ends setup. Say the line to the human and do nothing more.

## Steps

### 1. Check Node

If the path `${CLAUDE_PLUGIN_ROOT}` shows as empty or literal, use the folder two levels above this skill's base directory. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-check.mjs" node`. If the shell says that `node` is not found, stop. Say: install Node 22 or later, then type /cadre:setup again. Done when the line is `ok node <version>`.

### 2. Find the repo and check the account

1. Run `git rev-parse --show-toplevel`. Use that folder as the repo root for the rest of setup.
2. Run `git remote get-url origin`. Read the host and `<owner>/<repo>` from it.
3. Accept an https URL or an ssh URL such as `git@host:owner/repo.git`. Remove a final `.git`.
4. If there is no remote, end setup. Say that this version needs a GitHub remote.
5. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-check.mjs" gh <owner>/<repo> [host]`. Add the host only when it is not `github.com`.
6. A `stop:` line names `gh auth switch`. A 404 can mean the wrong account, so never say that the repo does not exist.

Done when the line is `ok gh <owner>/<repo>`.

### 3. Read the charter that exists

Read the charter from the default branch, so that a feature branch never shows `missing`.

1. Find the default branch: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.
2. Run `git fetch origin`.
3. Make a new empty temporary folder. Run `git show origin/<default branch>:docs/agents/cadre-charter.md`, and write the output to `docs/agents/cadre-charter.md` under that folder. If the command fails, the charter is `missing`.
4. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/charter-check.mjs" <temporary folder>`.

Then act on the line:

- `missing`: this is a first setup. Ask every question in step 4.
- `ok`: the charter is current. Show its fields. Ask the human what to change, and ask only about that.
- `older-cadre` or `stale <old> <new>`: read the charter. Keep each answer that is there. Ask only for each field that is missing or new in [the charter reference](../orchestrate/references/charter.md).
- `plugin-too-old`: end setup. Say to update cadre, then type /cadre:setup again.
- `unknown: <reason>`: say the reason. Ask the human to fix the front matter or remove the file. Do not overwrite it.

Done when you know which questions to ask.

### 4. Ask the questions

Read `AGENTS.md`, `CLAUDE.md`, and the docs first. Ask only about the gaps. The tracker comes from step 2. The tracker and the skill pack go in the body of the charter. Ask one question at a time and wait for each answer.

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

1. Use the default branch and the fetch of step 3.
2. Work in a worktree, not in the clone. Run `git worktree add .claude/worktrees/cadre-charter -b cadre-charter origin/<default branch>`. If the branch name exists, add a number to it. Do all edits in that worktree.
3. Write `docs/agents/cadre-charter.md` in the form of [the charter reference](../orchestrate/references/charter.md).
4. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/charter-check.mjs" --schema`. Put its number in `charter_schema`.
5. Read `version` in `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. Put `cadre <version>` in `written_by`.
6. Make sure that `.gitignore` has the line `.claude/worktrees/`. Add it if not.
7. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/charter-check.mjs" <worktree>`. The line must be `ok`. If not, fix the file.
8. Commit the files. Push with `git push -u origin cadre-charter`.
9. Open the pull request with `gh pr create --base <default branch> --head cadre-charter`. The body says what the charter holds.
10. Say the URL. Say that the human reviews and merges it, and that `/cadre:orchestrate` works after the merge.

Done when the pull request is open and the check printed `ok` on the branch.

## Rules

- A charter never holds a secret value. It holds the names of stores only.
- Ask the human for each answer. Do not guess an answer from the file of another tool.
- Setup changes no branch policy and no setting of the repo.
