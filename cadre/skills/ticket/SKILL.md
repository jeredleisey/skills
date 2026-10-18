---
name: ticket
description: Do one ticket with /cadre:ticket <ticket>. One ticket, no orchestrator issue, no ledger, no checkpoint. A coder does the work in a worktree, you verify it, a reviewer reads it, and you open one pull request with no auto-merge. Use the full orchestrator for merges, deploys, and many tickets.
disable-model-invocation: true
---

# Ticket

`/cadre:ticket <ticket>` does one ticket from the start to an open pull request. It makes no orchestrator issue, no ledger, and no checkpoint. The full orchestrator is the opt-in for merges, deploys, and work across many tickets.

## Consent

The command of the human is the consent for exactly one push of the branch of this ticket and one pull request. It is no other consent. This skill never:

- pushes the default branch or any other branch,
- merges, completes, or enables auto-merge,
- deploys, releases, or tags,
- deletes a branch, a tag, or a file on a remote,
- changes a setting, a ruleset, or a secret,
- writes a ledger or a checkpoint.

If the ticket asks for any of these, do the rest of the work, open the pull request, and stop. Tell the human to use `/cadre:orchestrate` for that step.

## Steps

### 0. Check the charter

Run the charter check and act on its outcomes as [orchestrate step 0](../orchestrate/SKILL.md#0-start) says: the script call and the seven outcome lines, with the same stops. The orchestrator issue part of that step (List, Resume, New) does not apply here. Then read the charter ([charter reference](../orchestrate/references/charter.md)).

Done when the check line is `ok` or `older-cadre`, and you know the tracker, the default branch, and the documentation rule.

### 1. Read the ticket

The `<ticket>` is, by the tracker of the charter:

- GitHub: an issue number. Run `gh issue view <n>`.
- ADO: a work item id. Run `az boards work-item show --id <id>` with the organization and the project of the charter.
- Local: the number or the path of a file in `.cadre/tickets/` of the main clone. Find the file with Glob: a number `<n>` matches `.cadre/tickets/<n>-*.md`, and a path is used as given. Read it with the Read tool. Never write it.

If the ticket has no acceptance criterion that a command or a named check can prove, stop and say what is missing.

Done when you can state each acceptance criterion and the files that the work touches.

### 2. Make the worktree

Choose a branch name from the ticket, for example `ticket-<n>-<slug>`. If the name exists, add a number. First find the default branch. Run `git fetch origin`, then `git symbolic-ref --short refs/remotes/origin/HEAD` (run `git remote set-head origin --auto` first if it is unset) and remove the `origin/` prefix. Local: the default branch is the value of `git config init.defaultBranch` when that branch exists, else `main` if it exists, else `master` if it exists, and there is no fetch. Then run `git worktree add .claude/worktrees/<branch> -b <branch> origin/<default>`. Local: use `<default>` with no `origin/`. The `.gitignore` must ignore `.claude/worktrees/`: if it does not, stop and say so.

Done when `git status` in the worktree shows the new branch and a clean tree.

### 3. Brief and start the helper

Write the brief from the [helper brief](../orchestrate/references/helper-brief.md). Start the card that fits ([roles](../orchestrate/references/roles.md)): `cadre:coder` for code, with the Agent tool. Give each answer that the card needs, because a card has no human to ask. Add the documentation rule of the charter to the write limits. The helper commits and stops.

Done when the helper returned its final message, or its start failed and you know why.

### 4. Verify

Do step 5 of [orchestrate](../orchestrate/SKILL.md#5-verify). Treat the helper report as a claim. Run its checks, then start a `cadre:reviewer` with the base as the fixed point. Sort each finding as must-fix, should-fix, or nit.

Done when each criterion has evidence from a command that you ran, and the reviewer report is in.

### 5. Fix the findings

Send each must-fix and should-fix back to the same helper, with `SendMessage` to its name. When it commits, run step 4 again on the new commit. Do not fix a finding yourself: you may not edit the work of the helper. A nit is left, and you name it in the report. If a finding stays open after two rounds, stop and report it.

Done when no must-fix or should-fix stays open, and the tests pass on the final commit.

### 6. Push and open the pull request

Push only this branch: `git push -u origin <branch>`. Do not push the default branch. Then open one pull request, with no auto-merge:

- GitHub: `gh pr create --base <default> --head <branch>`.
- ADO: `az repos pr create --source-branch <branch> --target-branch <default> --title "<title>" --description "<text>"` with the repository, the project, and the organization of the charter. Never add `--auto-complete`.
- Local: make no push and no pull request. Say the branch name. The human reviews and merges it by hand.

Describe the ticket, the change, and the evidence of step 4. Link the ticket.

Done when the pull request is open. On the local tracker: the branch holds the helper commits and the fixes, and `git status` in the worktree is clean.

### 7. Report

Say what changed, with the pull request link or the branch name, and the evidence for each criterion. Name each nit and each open finding. Say that the human merges the pull request. If the ticket asked for a step from the Consent list, name it and say to use `/cadre:orchestrate`. Put each decision that you need in a numbered list at the end, and nothing after it.

Done when the human can answer each open decision by its number.

## Rules

- Never do a step from the Consent list. A refusal by the harness or a guard ends that step: do not find another route.
- Edit only in the worktree. Never touch the clone that other agents share.
- A secret never goes in the brief, the diff, or the pull request text.
