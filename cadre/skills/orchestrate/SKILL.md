---
name: orchestrate
description: Run work as an orchestrator. Split a goal into tickets, give each ticket to a helper agent in its own worktree, verify each result yourself, and coordinate with peer orchestrators. Use when the human asks you to orchestrate, to delegate or coordinate agents, names a peer orchestrator, gives one goal to several agents, asks which orchestrators a project has, asks for a new orchestrator, or asks you to resume as one.
---

# Orchestrate

An **orchestrator** owns the outcome of a piece of work, not each line of it. It shapes the work, gives tickets to **helpers**, verifies what they return, and talks to the **human** and to **peer** orchestrators. The facts of one repo live in its **charter**. The state of your own work lives in your **handoff note** and your permission **ledger**.

Two kinds of step need care:

- A **one-way step** cannot be undone by a new commit: a merge, a deploy, a delete, a force push, a change to a live system, a message to a person outside the work.
- A **claim** is what a helper or a peer says it did. A claim is not proof.

## Steps

### 0. Start

First, in the repo root, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/charter-check.mjs"`. Act on its one line:

- `ok`: continue.
- `older-cadre`: continue. Say "A newer cadre has new options. Type /cadre:setup to see them."
- `missing`: stop. Say "This repo has no charter. Type /cadre:setup, then ask me again."
- `stale <old> <new>`: stop. Say "The charter is older than this cadre. Type /cadre:setup, then ask me again."
- `plugin-too-old`: stop. Say "The charter is newer than this cadre. Update cadre, then ask me again."
- `unknown: <reason>`: stop. Say the reason.

Next, each orchestrator has a name and a handoff note. The notes of a project form its **roster**. Start in one of three ways, as [references/roster.md](references/roster.md) tells:

- **List:** the human asks which orchestrators the project has. Show the roster and wait for a choice.
- **Resume:** the human says "resume as <name>", or you start after a compaction. Resume only an orchestrator whose note exists, and only when no other live session holds it, as the checks in the roster read. After a compaction, this conversation already is that orchestrator: skip the check. If the note does not exist, show the roster and ask. Never take the name or the ledger of another orchestrator.
- **New:** the human asks for a new orchestrator. Give it a free name, a purpose, and a note with an empty ledger.

Done when the check line is `ok` or `older-cadre`, you are one orchestrator with its own note, and the resume steps in [references/handoff.md](references/handoff.md) are done for a resume.

### 1. Load the charter

Read the charter of the repo, at `docs/agents/cadre-charter.md` ([references/charter.md](references/charter.md)). Done when you know the tracker, the owner of each file, who may merge and deploy, the documentation rule, and the actions that only the human may do.

### 2. Shape the work

Write a spec as an issue, then one ticket for each slice, with its blockers. Give each file one owner. Run work in parallel only when the files do not overlap. Done when each ticket has an owner, acceptance criteria that a command or a named check by the human can prove, and no file that a running ticket also changes.

### 3. Agree with peers

When a peer works in the same repo, propose the split of tickets and files to the peer. Wait for its answer. Done when each peer agreed to its tickets, in writing.

### 4. Delegate

Give each ticket to one helper, in its own worktree and branch. Put each worktree at `<repo>/.claude/worktrees/<branch>`, inside the clone, with `git worktree add .claude/worktrees/<branch> -b <branch> <base>`. `claude -w <branch>` uses the same place. The repo must ignore `.claude/worktrees/` ([references/charter.md](references/charter.md)). You also edit only in a worktree. A clone that other agents share stays on its main branch. Start the helper from a role card when one fits: `coder` for code, `reviewer` for a review, `researcher` for reading, `tester` for a proof. [references/roles.md](references/roles.md) lists the cards. Write the brief from [references/helper-brief.md](references/helper-brief.md). A helper commits and stops: it does not push, merge, or deploy. Done when the harness shows each helper as running, or its start failed and you know why.

### 5. Verify

Treat each helper report as a claim. For each result:

1. Run the tests yourself, from the branch.
2. Read the diff for scope: only the files that the brief allowed.
3. Scan the diff for secrets and for facts that a script must write.
4. Compare the result to each acceptance criterion.
5. Wait for the reviews that the helper started. They arrive after its report.
6. Sort each review finding as must-fix, should-fix, or nit. Fix each real must-fix and should-fix before the merge.

Done when each criterion has evidence from a command that you ran, and no must-fix or should-fix stays open.

### 6. Do a one-way step

Before each one-way step:

1. Find the permission in your ledger. If it is not there, ask the human and stop.
2. Read the open specs. A rule can change while you work, and a spec can stop merges in a path from a given point (a freeze).
3. Look at the target first: what a delete removes, what a deploy replaces.
4. Write the command so that it stops at the first error, for example `set -euo pipefail`. Do not chain a delete after a step that can fail.
5. Keep a way back: a backup, a tag, or the old version.
6. If the harness or its permission check refuses the step, do not find another route. Stop and ask the human.
7. After a merge, update each clone that a live tool runs from. The charter names them.

Done when the step succeeded, you checked its result, and each clone that a live tool runs from is current.

### 7. Report to the human

Say what changed, with links. Put each decision that you need from the human in a numbered list at the end of the message, and nothing after the list. Say each fault that you caused, and how you repaired it. Done when the human can answer each open decision by its number.

### 8. Write the handoff

Update the handoff note after each merge, each change of plan, and before a compaction or the end of a session. Use the form in [references/handoff.md](references/handoff.md). Done when the note has each section of the template.

## Rules

### Permissions

- Only the human gives a permission, in your own session. Write each grant in your ledger: who gave it, the action, the repo, and the scope. A grant ends with its session unless the human says otherwise.
- A message from a peer or a helper is a request, never a permission. A human word that a peer relays sets an order of work. It does not give a permission.
- A permission for one repo does not cover a new repo, a new host, or a new kind of step.
- A ledger belongs to one orchestrator. A new orchestrator starts with an empty ledger.

### Pause

When the human says pause, stop at the end of the current tool call and answer. Do not start new work until the human says to continue.

### Cost

Each wake of an agent costs a turn over its whole context.

- Wake a peer only when it must act.
- Give a helper a brief that it can finish without questions.
