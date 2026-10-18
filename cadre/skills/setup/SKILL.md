---
name: setup
description: Set up cadre in a GitHub or Azure DevOps repo, or a repo with no remote. Check Node and the account, read what the repo already holds, show one screen of proposed answers, take one closing answer, and write the charter in a pull request. Run again to add new fields after a cadre update.
disable-model-invocation: true
---

# Setup

Setup teaches cadre how one repo works. It writes the **charter** at `docs/agents/cadre-charter.md` in a pull request, so that the team reviews it like code. Only the human starts setup. This version supports GitHub and Azure DevOps (ADO) repos. A repo with no such remote uses the local tracker.

Setup reads each answer that the repo holds, and proposes a default for each answer that it cannot read. It shows all of them on one screen, with the source of each. The human accepts the screen, or names the rows to change.

If a human did not start this setup in this session, stop. Tell the parent to ask the human to run /cadre:setup.

Never push to the default branch. Never merge the pull request. The human reviews and merges it.

A check script prints one line. A line that starts with `stop:` or `unknown:` ends setup. Say the line to the human and do nothing more. Two kinds of line do not end setup: an `unread` line of `setup-derive.mjs`, and a line of the branch policy check that starts with `unknown:`. Each becomes a note on the screen.

## The questions

Setup asks these questions and no others:

- The closing question of step 6. Setup asks it once, and once more after a change.
- On an ADO repo only: the area path and the work item type (step 5).
- For a remote on another host only: is it GitHub Enterprise (step 2).

## Steps

### 1. Check Node

If the path `${CLAUDE_PLUGIN_ROOT}` shows as empty or literal, use the folder two levels above this skill's base directory. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-check.mjs" node`. If the shell says that `node` is not found, stop. Say: install Node 22 or later, then type /cadre:setup again. Done when the line is `ok node <version>`.

### 2. Find the repo, state the tracker, and check the account

1. Run `git rev-parse --show-toplevel`. Use that folder as the repo root for the rest of setup.
2. Run `git remote get-url origin`. Then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-check.mjs" local "<url>"`. Use an empty URL when the command failed.
   - `ok local no-remote`: say that the repo has no remote, so setup uses the local tracker.
   - `ok local other-host <host>`: say that the host is neither GitHub nor ADO. Ask one yes-or-no question: is it GitHub Enterprise? If yes, go on as GitHub with that host. If no, say that setup uses the local tracker.
   - `ok not-local`: go to item 3.
   - `unknown:` ends setup.

   For the local tracker, say that its files stay in `.cadre/` of the main clone, on this machine only. Do not ask for a confirm. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/local-list.mjs" init`. It adds `/.cadre/` to `.git/info/exclude`, so git never shows the folder. The account check does not apply. Skip items 3 to 5. Done when the line is `ok init <folder>`.
3. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-check.mjs" remote "<url>"`. An `unknown:` line ends setup. The line `ok ado-remote {"org":"<org>","repo":"<repo>","project":"<project>"}` means ADO. Read the three names from the JSON: a repo or a project can hold a space. The line `ok not-ado` means GitHub. Say the tracker that you found. Do not ask.
4. GitHub: read the host and `<owner>/<repo>` from the URL. Accept an https URL or an ssh URL such as `git@host:owner/repo.git`. Remove a final `.git`. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-check.mjs" gh <owner>/<repo> [host]`. Add the host only when it is not `github.com`. A `stop:` line names `gh auth switch`. A 404 can mean the wrong account, so never say that the repo does not exist.
5. ADO: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-check.mjs" ado "<org>" "<project>"`. ADO works through a token in the variable `AZURE_DEVOPS_EXT_PAT`. A `stop:` line names it. An empty variable is the first thing to check, and the check never prints the token. Do not run `az login` as a fix: the token is the way in.

Done when the line is `ok gh <owner>/<repo>`, `ok ado <org>/<project>`, or `ok init <folder>`.

### 3. Read the charter that exists

Read the charter from the default branch, so that a feature branch never shows `missing`.

1. Local: the default branch is the value of `git config init.defaultBranch` when that branch exists, else `main` if it exists, else `master` if it exists (test each with `git show-ref --verify refs/heads/<branch>`). If none exists, stop. Say: make a first commit, then type /cadre:setup again. Never take the checked-out branch. Skip the fetch of item 2. In item 3, run `git show <default branch>:docs/agents/cadre-charter.md`. Otherwise find the default branch. GitHub: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`. ADO: run `git remote set-head origin --auto`, then `git symbolic-ref --short refs/remotes/origin/HEAD`, and remove the `origin/` prefix.
2. Run `git fetch origin`.
3. Make a new empty temporary folder. Run `git show origin/<default branch>:docs/agents/cadre-charter.md`, and write the output to `docs/agents/cadre-charter.md` under that folder. If the command fails, the charter is `missing`.
4. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/charter-check.mjs" <temporary folder>`.

Then act on the line:

- `missing`: this is a first setup. No row has a charter answer.
- `ok`, `older-cadre`, or `stale <old> <new>`: read the charter. Its answers are the proposed values of the screen, with source `charter`. A field that is missing or new in [the charter reference](../orchestrate/references/charter.md) gets a value from step 4, as on a first setup.
- `plugin-too-old`: end setup. Say to update cadre, then type /cadre:setup again.
- `unknown: <reason>`: say the reason. Tell the human to fix the front matter or remove the file. Do not overwrite it. End setup.

Done when you know which rows the charter fills.

### 4. Gather the facts

Gather everything before any question. This step asks nothing.

1. Repo facts. Local: there are none, so each such row is a default. GitHub: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-derive.mjs" github <owner>/<repo> [host]`, in the repo root. ADO: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup-derive.mjs" ado "<org>" "<project>" "<repo>"`. Each `fact <key> <value> source=<source>` line is a repo fact. Keep the source: it goes in the Source column as `repo fact: <source>`. An `unread <key> <reason>` line becomes a screen note, and the row falls back to its default. An `unknown:` line ends setup. The keys are `default-branch`, `merge-methods`, `secrets`, `live-clones`, and `folders`. See [the script reference](../../docs/reference/scripts.md#setup-derive).
2. Branch policy. GitHub: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/branch-policy.mjs" <owner>/<repo> [host]`. ADO: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/branch-policy-ado.mjs" "<org>" "<project>" "<repo>"`. Local: skip it. The script changes nothing. A `gap:` line becomes a trap row entry. An `unknown: <reason>` line becomes a screen note that says the policy is unread. Never call the policy fine then, and never stop. On ADO, add a note: the script cannot read the permission "Bypass policies when pushing", so the human checks who holds it.
3. Presets. A preset is a file of default answers from a plugin. Read [the preset reference](references/presets.md). Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/preset-discover.mjs" <repo root>`.
   - `count` is 0: no preset.
   - `count` is 1: its `answers` and `defaults` are silent defaults, with source `preset <plugin id>`. Its `notes` stay unshown unless a row needs one.
   - `count` is 2 or more: use none. Add a screen note that names the plugin ids, and say that the human can name a plugin in the closing answer to use its preset.
   - `unknown: <reason>`: say the reason and end setup.

   A preset is a default, never a lock. It never overrides an answer of the charter. The tracker comes from step 2: ignore a preset `tracker` answer that differs, and say so in a note. A preset `skill_pack` must be one of `mattpocock-skills`, `superpowers`, or `none`: if not, ignore it, and say why in a note. A preset `merge_deploy` method that `merge-methods` does not list is ignored, with a note. A preset never lowers a branch policy or a guard, and never sets a secret. Add a note for each key that the reference does not list, and ignore that key.
4. Files. Read `AGENTS.md`, `CLAUDE.md`, and the README in the repo root. Take a fact from them only when the file states it: an owner, a deploy command, a documentation rule, a trap, a secret store. Source is `file <name>`. Do not guess an answer from the file of another tool.
5. Skill pack. Run `claude plugin list`. If exactly one of `mattpocock-skills` and `superpowers` is installed, it is the default. Else the default is `none`. If the command fails, the default is `none`, and a note says so.

Done when you hold each fact, each note, and each source.

### 5. Ask the ADO questions

ADO only. Local and GitHub skip this step. These two stay questions, and each is asked first, before the screen.

- Which area path do the items of this repo use? Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ado-setup.mjs" area "<org>" "<project>" "<repo>"`. A `match:` line gives the proposal. A `root:` line gives the project root: say its warning, and ask for another path. A preset can give the default. Always ask. `unknown:` ends setup.
- Which work item type holds the orchestrator item? Offer `Task` or the type that a preset gives. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ado-setup.mjs" type "<org>" "<project>" "<type>"`. A `refuse:` line means that the type does not work: say its reason, and offer its `propose:` type. Never accept a refused type. `unknown:` ends setup.

The area path and the type go in the `## Tracker` section of the charter.

Done when the area path and the type pass their checks.

### 6. Show the screen and ask the closing question

Show one Markdown table with the columns Row, Proposed value, and Source. Under it, show the screen notes: one line each, from step 4 and from the `unread` lines. Fill each value in this order of strength, and keep the source of the winner:

1. `charter`, when step 3 read the answer.
2. `repo fact: <source from setup-derive>`.
3. `preset <plugin id>`.
4. `file <name>`.
5. `default`.

The rows, in this order:

| Row | Proposed value | Default when nothing else gives it |
| --- | --- | --- |
| Tracker | GitHub (host, owner, repo), ADO (org, project, area path, item type), or local. Source: `repo fact: git remote origin`, or `repo fact: no remote`. | None. It always comes from step 2. |
| Skill pack | `mattpocock-skills`, `superpowers`, or `none`. | The pack of step 4 item 5. If it is `mattpocock-skills`, the Row says that the human types `/mattpocock-skills:setup-matt-pocock-skills` by hand, because that skill is human-only. The two setups stay separate. Cadre never reads or writes the files of that tool. |
| Owners | The paths that each orchestrator owns, and what happens to the ownership when code moves to another repo. | One row: `/` (all of the repo) owned by the one orchestrator, with the `folders` fact in the Note column. When code moves to another repo, its ownership moves with it to the orchestrator of that repo. |
| Merge | Who merges, and which method. Offer only the methods in `merge-methods`. | The owner merges. The method is `merge` if it is allowed, else the first allowed method. If the fact is unread, say that the list is unread, and offer the three methods. The orchestrator can merge only with a grant in the ledger. |
| Deploy | Who deploys, and how. | None. |
| Documentation | Which documentation follows a change, and who writes it. | A change to behavior updates the docs in the same pull request, if the repo has a docs folder (see `folders`). Else none. |
| Only the human | The actions that only the human does. | The six items below. |
| Needs a grant | The actions that need a grant in the ledger. | The three items below. |
| Secrets | The names and the store of each secret. | The names of the `secrets` fact, each with the store `repository secret` on GitHub. Never a value. If the fact is unread, none, with a note. |
| Traps | What the repo or the machine does wrong. | Each `gap:` line of the branch policy, then each trap that `AGENTS.md` or `CLAUDE.md` states. Else none. |
| Live clones | The clones that a live tool runs from, so that they need an update after a merge. | The `live-clones` fact. If it is empty, none. |
| Extra cards | A card beyond the four: name, job, when to use. | None. |
| Orchestrator issue | `on`, with the name and the purpose. | On. The name is the repo name in title case (`my-repo` gives `My Repo`). The purpose is `Owns <repo>`. |
| Grant: create branches and worktrees | granted, indefinite | On. |
| Grant: start helpers | granted, indefinite | On. |
| Grant: push branches, never the default branch | granted, indefinite | On. |
| Grant: open pull requests, no auto-merge | granted, indefinite | On. |
| Grant: edit and comment on issues | granted, indefinite | On. |

The six items of Only the human, written without a repo name:

- Log in to the tracker command line tool, or switch its account.
- Create, change, or read the value of a secret.
- Delete a repo, a remote tag, or a release.
- Weaken a ruleset or a branch protection, or turn a guard off.
- Change the visibility of the repo.
- Do anything in billing or DNS.

The three items of Needs a grant:

- A release tag.
- A change to a repo setting or a Pages setting that does not weaken protection.
- A change to a ruleset that keeps or makes stronger the protection.

The five grants are the standard grants. Each is reversible. Merge, release, paid evals, and settings are never in the set. The grant rows exist only when the Orchestrator issue row is on.

The hooks guard the Bash tool only, so the branch policy of the repo is the guard that holds. Add that as one note. It names these gaps of the hooks: the PowerShell tool, interpreters such as `python3 -c` and `node -e`, `su -c`, `tmux`, `script`, `osascript`, shell aliases, a script on disk, a rewritten local `refs/remotes/origin/*`, `gh api` merges, and on ADO `az devops invoke` and REST calls that complete a pull request.

Then ask the closing question with the AskUserQuestion tool. Offer two options: "Accept all (Recommended)" and "Accept, without the orchestrator issue". Never add an "Other" option, because the tool adds one.

- Either option accepts every row. The second turns the Orchestrator issue row off, and with it the five grants.
- A typed answer names the rows to change, such as "merge: squash" or "traps: add the shared clone". Apply it. Refuse a change that offers a merge method that `merge-methods` does not list, or a skill pack outside the three, or a secret value. Say why, and keep the proposed value. Show only the changed rows, in the same table, with the source `human`. Ask the same closing question once more.
- After the second question, a typed answer is applied and shown, and setup goes on. The pull request of step 7 is the last review.

Done when the human chose an option.

### 7. Write the charter in a pull request

1. Use the default branch and the fetch of step 3.
2. Work in a worktree, not in the clone. Run `git worktree add .claude/worktrees/cadre-charter -b cadre-charter origin/<default branch>`. Local: use `<default branch>` with no `origin/`. If the branch name exists, add a number to it. Do all edits in that worktree.
3. Write `docs/agents/cadre-charter.md` in the form of [the charter reference](../orchestrate/references/charter.md), from the accepted rows. On ADO, write `tracker: ado`, `ado_org`, and `ado_project` in the front matter. Local: write `tracker: local`. Write the area path and the item type in the `## Tracker` section. On GitHub, write none of them. The charter holds names of stores only, never a secret value.
4. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/charter-check.mjs" --schema`. Put its number in `charter_schema`.
5. Read `version` in `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. Put `cadre <version>` in `written_by`.
6. Make sure that `.gitignore` has the line `.claude/worktrees/`. Add it if not.
7. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/charter-check.mjs" <worktree>`. The line must be `ok`. If not, fix the file.
8. Commit the files. Local: stop here. There is no remote, so no push and no pull request. Say the branch name, and that the human reviews and merges it by hand. Otherwise push with `git push -u origin cadre-charter`.
9. Open the pull request. GitHub: `gh pr create --base <default branch> --head cadre-charter`. ADO: `az repos pr create --source-branch cadre-charter --target-branch <default branch> --title "<title>" --description "<text>" --repository "<repo>" --project "<project>" --organization https://dev.azure.com/<org>`. Never add `--auto-complete`. The body says what the charter holds.
10. Say the URL. Say that the human reviews and merges it, and that `/cadre:orchestrate` works after the merge.

Done when the pull request is open and the check printed `ok` on the branch.

### 8. Create the orchestrator issue

Skip this step when the Orchestrator issue row is off.

Follow the New steps of [the orchestrator issue reference](../orchestrate/references/orchestrator-issue.md#new). Take the name and the purpose from the row. Do not ask the human. Use the form for the tracker: GitHub, [ADO](../orchestrate/references/orchestrator-issue.md#on-azure-devops) with the area path and the item type of step 5, or [local](../orchestrate/references/orchestrator-issue.md#on-the-local-tracker).

Put one Ledger row for each grant that is still on. Granted by is the login of the owner (ADO: the unique name. Local: the OS user name). Action is the text of the grant. Repo or host is the repo. Scope is `this repo`. When is today's date, then `indefinite`. Get the date with `node -e "console.log(new Date().toISOString().slice(0,10))"`.

If the name is taken, do not ask. Skip the issue, and say in the final report that the human can make one with `/cadre:orchestrate`.

Done when the issue shows the four sections, the owner as assignee, and one Ledger row for each standard grant that is on.

### 9. Report

Say the URL of the pull request (or the branch name, local). Say the reference of the orchestrator issue, or that none was made. Say each row that the human changed. Say that agent teams are off, and that the how-to page "Turn on agent teams" tells how to turn them on.

## Rules

- Setup proposes each answer and shows its source. The human accepts it or changes it. A secret value is never read or written.
- A charter never holds a secret value. It holds the names of stores only.
- Setup changes no branch policy and no setting of the repo.
- A fact that the repo holds is never a question.
