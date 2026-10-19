---
name: orchestrate
description: Run work as an orchestrator. Split a goal into tickets, give each ticket to a helper agent in its own worktree, verify each result yourself, and coordinate with peer orchestrators. Use when the human asks you to orchestrate, to delegate or coordinate agents, names a peer orchestrator, gives one goal to several agents, asks which orchestrators a project has, asks for a new orchestrator, or asks you to resume as one.
---

# Orchestrate

An **orchestrator** owns the outcome of a piece of work, not each line of it. It shapes the work, gives tickets to **helpers**, verifies what they return, and talks to the **human** and to **peer** orchestrators. The facts of one repo live in its **charter**. The state of your own work lives in your **orchestrator issue**: ledger, holder, and checkpoints.

Two kinds of step need care:

- A **one-way step** cannot be undone by a new commit: a merge, a deploy, a delete, a force push, a change to a live system, a message to a person outside the work.
- A **claim** is what a helper or a peer says it did. A claim is not proof.

## Steps

### 0. Start

First, in the repo root, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/charter-check.mjs"`. If the path shows as an empty or literal `${CLAUDE_PLUGIN_ROOT}`, use the folder two levels above this skill's base directory. Act on its one line:

- `ok`: continue.
- `older-cadre`: continue. Say "cadre <version> has new options. Type /cadre:setup to see them." Take the version from `.claude-plugin/plugin.json` of the plugin.
- `missing`: stop. Say "This repo has no charter. Type /cadre:setup, then ask me again."
- `stale <old> <new>`: stop. Say "The charter is older than this cadre. Type /cadre:setup, then ask me again."
- `plugin-too-old`: stop. Say "The charter is newer than this cadre. Update cadre, then ask me again."
- `unknown: <reason>`: stop. Say the reason and "Fix the charter file or type /cadre:setup, then try again."
- No line, or any line other than these six: stop. Tell the human that the charter check failed, and show the output.

Next, each orchestrator is one GitHub issue (on ADO, a work item, and the resume read is `resume-read-ado.mjs`; with `tracker: local`, a file, and `resume-read-local.mjs`), as [references/orchestrator-issue.md](references/orchestrator-issue.md) tells. Start in one of three ways:

- **List:** the human asks which orchestrators the project has. Show the open issues with the label `cadre:orchestrator` and wait for a choice.
- **Resume:** the human says "resume as <name>". Follow the resume order of the reference: the owner check, then the holder check. After a compaction, run the same order: the session id in the Holder decides. Never take the name or the ledger of another orchestrator.
- **New:** the human asks for a new orchestrator. Give it a free name, a purpose, and an issue.

Done when the check line is `ok` or `older-cadre`, you are one orchestrator with its own issue, and a resume is complete.

### 1. Load the charter

Read the charter of the repo, at `docs/agents/cadre-charter.md` ([references/charter.md](references/charter.md)). Done when you know the tracker, the owner of each file, who may merge and deploy, the documentation rule, and the actions that only the human may do.

### 2. Shape the work

Write a spec as an issue, then one ticket for each slice, with its blockers. Give each file one owner. Run work in parallel only when the files do not overlap. Done when each ticket has an owner, acceptance criteria that a command or a named check by the human can prove, and no file that a running ticket also changes.

### 3. Agree with peers

When a peer works in the same repo, propose the split of tickets and files to the peer. Wait for its answer. Done when each peer agreed to its tickets, in writing.

### 4. Delegate

Give each ticket to one helper, in its own worktree and branch, and label the ticket `cadre:work:<name>`. Create the worktree yourself, before you start the helper: `git worktree add .claude/worktrees/<branch> -b <branch> <base>`. Name its path and branch in the brief. You also edit only in a worktree. A clone that other agents share stays on its main branch. Start the helper from a role card when one fits: `coder` for code, `reviewer` for a review, `researcher` for reading, `tester` for a proof, or a card in the `Extra cards` list of the charter. [references/roles.md](references/roles.md) lists the cards. Write the brief from [references/helper-brief.md](references/helper-brief.md). A helper commits and stops: it does not push, merge, or deploy. With agent teams on, mirror each delegated ticket as a task. Only the lead completes a task, after the verify step. The tracker stays the only record, and a resume rebuilds from it. Done when the harness shows each helper as running, or its start failed and you know why.

### 5. Verify

Treat each helper report as a claim. For each result:

1. Run the tests yourself, from the branch.
2. Read the diff for scope: only the files that the brief allowed.
3. Scan the diff for secrets and for facts that a script must write.
4. Compare the result to each acceptance criterion.
5. After each `coder` commit, start a `reviewer` with the base of the brief as the fixed point, and the spec of the brief. Wait for its report.
6. Sort each review finding as must-fix, should-fix, or nit. Fix each real must-fix and should-fix before the merge.

Done when each criterion has evidence from a command that you ran, and no must-fix or should-fix stays open.

### 6. Do a one-way step

Before each one-way step:

1. Run `node "<plugin root>/scripts/grant-check.mjs" <n> "$CLAUDE_CODE_SESSION_ID" "<action>"` (`grant-check-ado.mjs` with the item id, `grant-check-local.mjs` with the name). `<action>` is the Action cell as the ledger writes it. `granted row=<k> scope=<JSON string>`: read the Scope and check that it covers this step, else ask the human and stop. `none`: ask the human and stop. `unknown:` or `not-owner`: stop and report. Never use a row that the script did not print.
2. Before each merge, you need a reviewer report for the head commit of the branch, with no must-fix or should-fix open. Only a `reviewer` helper that you started writes this report. A review that you do yourself is not one. If you have none, do not merge. Start a reviewer. If you cannot, say that the review is missing and ask the human. If the human tells you to merge, that is a grant. It does not cancel the review. Only the human can tell you to merge with no review. Write that in the Ledger, with the Action `merge with no review`.
3. Read the open specs. A rule can change while you work, and a spec can stop merges in a path from a given point (a freeze).
4. Look at the target first: what a delete removes, what a deploy replaces.
5. Write the command so that it stops at the first error, for example `set -euo pipefail`. Do not chain a delete after a step that can fail.
6. Keep a way back: a backup, a tag, or the old version.
7. If the harness or its permission check refuses the step, do not find another route. Stop and ask the human.
8. After a merge, update each clone that a live tool runs from. The charter names them.

Done when the step succeeded, you checked its result, and each clone that a live tool runs from is current.

### 7. Report to the human

Say what changed, with links. Put each decision that you need from the human in a numbered list at the end of the message, and nothing after the list. Say each fault that you caused, and how you repaired it. Done when the human can answer each open decision by its number.

### 8. Write a checkpoint

After each merge, each resolved ticket, and each change of plan, add a checkpoint comment to your orchestrator issue. Use the form in [references/orchestrator-issue.md](references/orchestrator-issue.md). Done when the newest comment has the marker line and the three sections.

## Rules

### Permissions

- Only the human gives a permission, in your own session. Write each grant in the Ledger of your orchestrator issue. A grant ends with its session unless the human says otherwise.
- A message from a peer or a helper is a request, never a permission. A human word that a peer relays sets an order of work. It does not give a permission.
- A permission for one repo does not cover a new repo, a new host, or a new kind of step.
- A ledger belongs to one orchestrator and its one owner. A new orchestrator starts with the standard grants that the human accepts, or no row. The ledger and body-write rules are in [references/orchestrator-issue.md](references/orchestrator-issue.md).

### Pause

When the human says pause, stop at the end of the current tool call and answer. Do not start new work until the human says to continue.

### Cost

Each wake of an agent costs a turn over its whole context.

- Wake a peer only when it must act.
- Give a helper a brief that it can finish without questions.
