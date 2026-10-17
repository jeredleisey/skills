---
name: setup
description: Set up cadre in a GitHub repo. Check Node and the gh account, apply presets, ask the questions, and write the charter in a pull request. Run again to add new fields after a cadre update.
disable-model-invocation: true
---

# Setup

Setup teaches cadre how one repo works. It writes the **charter** at `docs/agents/cadre-charter.md` in a pull request, so that the team reviews it like code. Only the human starts setup. This version supports GitHub repos.

If a human did not start this setup in this session, stop. Tell the parent to ask the human to run /cadre:setup.

Never push to the default branch. Never merge the pull request. The human reviews and merges it.

A check script prints one line. A line that starts with `stop:` or `unknown:` ends setup. Say the line to the human and do nothing more. The one exception is step 5: an `unknown:` line there does not end setup.

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

### 3. Find the presets

A preset is a file of default answers from a plugin. Read [the preset reference](references/presets.md). Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/preset-discover.mjs" <repo root>`, with the repo root of step 2.

Then act on the line:

- `count` is 0: ask the questions that step 6 leaves, as step 4 says.
- `count` is 1: show its answers. The human confirms or changes each one. Show its defaults as the default of the question that setup still asks.
- `count` is 2 or more: show the plugin ids. The human chooses one, or none of them. Then treat it as count 1. Never mix two presets.
- `unknown: <reason>`: say the reason and end setup.

A human can change any preset answer. A preset is a default, never a lock. This version supports GitHub only. If a preset `tracker` answer names another tracker, say that this version cannot use it. Ignore that answer, and keep the GitHub tracker of step 2. A preset value of `skill_pack` must be one of the three choices of step 6. If not, treat it as not set, and say why. If the charter already holds an answer and the preset gives another, keep the charter answer. Show the preset value as a note. A preset never lowers a branch policy or a guard, and never sets a secret. Show each key with its note. Tell the human about each key that the reference does not list, and ignore that key.

Step 3 feeds the questions of step 6. If step 4 finds a charter that is `ok`, show the preset answers as notes only.

Done when you hold one preset or none.

### 4. Read the charter that exists

Read the charter from the default branch, so that a feature branch never shows `missing`.

1. Find the default branch: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.
2. Run `git fetch origin`.
3. Make a new empty temporary folder. Run `git show origin/<default branch>:docs/agents/cadre-charter.md`, and write the output to `docs/agents/cadre-charter.md` under that folder. If the command fails, the charter is `missing`.
4. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/charter-check.mjs" <temporary folder>`.

Then act on the line:

- `missing`: this is a first setup. Ask every question in step 6.
- `ok`: the charter is current. Show its fields. Ask the human what to change, and ask only about that.
- `older-cadre` or `stale <old> <new>`: read the charter. Keep each answer that is there. Ask only for each field that is missing or new in [the charter reference](../orchestrate/references/charter.md).
- `plugin-too-old`: end setup. Say to update cadre, then type /cadre:setup again.
- `unknown: <reason>`: say the reason. Ask the human to fix the front matter or remove the file. Do not overwrite it.

Done when you know which questions to ask.

### 5. Report the branch policy

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/branch-policy.mjs" <owner>/<repo> [host]`. Add the host only when it is not `github.com`. The script changes nothing.

Say each line to the human. A `gap:` line names a rule that GitHub does not enforce on the default branch. The hooks only slow an agent and stop a slip. The branch policy of the repo is the guard that holds.

The hooks guard the Bash tool only. They do not cover these:

- the PowerShell tool
- interpreters such as `python3 -c`, `node -e`, `perl`, and `ruby`
- `su -c`, `tmux`, `script`, and `osascript`
- shell aliases, a function that wraps a push, and a script on disk
- a local `refs/remotes/origin/*` that a helper rewrote
- `gh api` merges
- `az repos pr update --status completed` and auto-complete on Azure DevOps

The branch policy of the repo covers all of them, and it is the guard that holds. This step reports its gaps.

Use the lines when the human answers the merge question of step 6.

`unknown: <reason>` means that the policy is unread. Say the reason, and do not say that the policy is fine. Then go on.

Done when the human has heard each line.

### 6. Ask the questions

Read `AGENTS.md`, `CLAUDE.md`, and the docs first. Ask only about the gaps. The tracker comes from step 2. A preset from step 3 can give the answers and the defaults. The tracker goes in the body of the charter. The skill pack goes in its front matter, as `skill_pack`. Ask one question at a time and wait for each answer. Do not ask again about an answer that the human confirmed in step 3. Show a preset default as `default: <value>`, and let the human type another value.

1. Which skill pack does this repo use? Offer three choices:
   - `mattpocock-skills`. Whether the answer came from a preset or from this question, say that the human types `/mattpocock-skills:setup-matt-pocock-skills` by hand, because that skill is human-only. The two setups stay separate. Cadre never reads or writes the files of that tool.
   - `superpowers`.
   - `none`. The role cards use a short built-in method.
2. Which files or folders does each orchestrator own? What happens to that ownership when code moves to a new repo?
3. Who may merge, and with which merge method? Who may deploy, and how?
4. Which documentation must follow a change, and who writes it?
5. Which actions does only the human do? For example: a payment, a change of account, a restart of a host, a delete of data.
6. Which secrets exist, where do they live, and how does a command read one without a print?
7. Which traps does this repo or this machine have? For example: a wrong default account, a shared clone that nobody may edit.
8. Which clones does a live tool run from, so that they need an update after a merge?
9. Does this repo need a card beyond the four? Name, job, when to use.

Done when each question has an answer, or the human says "none".

### 7. Write the charter in a pull request

1. Use the default branch and the fetch of step 4.
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
