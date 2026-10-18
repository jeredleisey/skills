# cadre

Cadre is a Claude Code plugin that runs a team of agents on a software repo. An orchestrator shapes the work and gives tickets to helpers in role cards. It verifies what they return. Each repo states its rules in a charter that your team reviews like code.

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

1. In your repo, type `/cadre:setup`. Setup checks Node and your account, asks its questions, and opens a pull request with the charter.
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

Agent teams are optional and experimental in Claude Code. Setup can turn them on. With teams on, the orchestrator mirrors each ticket as a task.

## More

The docs are in [`docs/`](docs/README.md): a tutorial, how-to guides, explanation, and reference. Read them on the site at <https://cadre.jeredleisey.com/>. To test an install on Windows 11, use [the Windows checklist](docs/how-to/check-a-windows-install.md).
