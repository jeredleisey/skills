# cadre

Cadre is a Claude Code plugin that runs agents on a software repo with the discipline of a team.

## What you get

- **Your rules, stated once.** Each repo states its rules in a charter: who merges, who deploys, what only a person may do. Your team reviews the charter like code.
- **A pull request you can trust.** A helper does the ticket in its own worktree. The session that runs the ticket verifies the result, and a separate reviewer reads it before you see the pull request.
- **A record anyone can resume.** The orchestrator keeps its state in one issue. A new session, or a teammate, continues from that issue.

## What it costs

Each ticket that changes code runs at least one coder and one reviewer. The table shows the helper tokens of three tickets in one session of this repo. The session that runs the ticket adds its own context on top.

| Ticket | Helper tokens |
| --- | --- |
| Small: one output format, one review round | about 170,000 |
| Medium: a new script, two review rounds | about 220,000 |
| Large: a skill rewrite, two review rounds | about 350,000 |

## What it refuses

- A helper never pushes, merges, deploys, or deletes. Its role card forbids these steps. A hook also denies a helper each guarded step through the Bash tool: a push to the default branch, a force push, a delete of a remote branch, and a merge. See [Guards](#guards) for what the hooks do not cover.
- The orchestrator merges or deploys only with a grant from you in its ledger. It first verifies the result, and a reviewer reads the head commit of the branch. Only you can let a merge go with no review.
- The skills keep secret values out of the charter, the briefs, and the diffs. The charter holds the names of secret stores only.

The branch policy of your repo is still the guard that holds. Cadre slows an agent and stops a slip. It is not a security boundary.

## How it works

An orchestrator shapes the work and gives tickets to helpers in role cards: coder, reviewer, researcher, and tester. It treats each helper report as a claim, and it verifies the claim before it acts.

## Requirements

- Claude Code with plugin hooks.
- Node 22 or later.
- For a GitHub repo: the `gh` CLI, signed in.
- For an Azure DevOps repo: a token in the variable `AZURE_DEVOPS_EXT_PAT`.

## Install

```
/plugin marketplace add jeredleisey/skills
/plugin install cadre@jeredleisey
```

## First use

Try `/cadre:ticket <ticket>` first. It does one ticket with no orchestrator issue: a coder works in a worktree, you verify the result, a reviewer reads it, and you get one pull request with no auto-merge. It never merges or deploys. See [Do one ticket](docs/how-to/do-one-ticket.md).

To run merges, deploys, or many tickets, use the orchestrator:

1. In your repo, type `/cadre:setup`. Setup checks Node and your account, reads what the repo already holds, and shows one screen of proposed answers with the source of each. You answer one closing question. Setup then opens a pull request with the charter and creates the orchestrator issue.
2. Review the charter pull request and merge it yourself.
3. Type `/cadre:orchestrate`. Say "new orchestrator <name>" to start one. Say "resume as <name>" to continue one.

## Guards

Cadre adds hooks on the Bash tool. The hook asks you before the orchestrator does one of these:

- a push to the default branch
- a force push
- a delete of a remote branch
- a pull-request merge or completion (`gh pr merge`, `az repos pr update --status completed`, or auto-complete)

A push of an ordinary branch passes with no prompt. A helper is always denied these steps. The charter can switch a guard off or allow it for the orchestrator only.

The hooks do not cover:

- the PowerShell tool on Windows (the hooks guard the Bash tool only)
- interpreters such as `python3 -c`
- merges through `gh api`
- shell aliases
- a script on disk

The branch policy of your repo is the guard that holds. Setup reports the policy and names each gap.

## Agent teams

Agent teams are optional and experimental in Claude Code. Setup leaves them off, and [the how-to page](docs/how-to/turn-on-agent-teams.md) tells how to turn them on. With teams on, the orchestrator mirrors each ticket as a task.

## More

The docs are in [`docs/`](docs/README.md): a tutorial, how-to guides, explanation, and reference. Read them on the site at <https://cadre.jeredleisey.com/>. To test an install on Windows 11, use [the Windows checklist](docs/how-to/check-a-windows-install.md).
