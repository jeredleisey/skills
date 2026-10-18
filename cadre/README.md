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

Cadre adds hooks on `git push` and on merge commands. When the orchestrator pushes or merges, the hook asks you first. A helper is refused, unless the charter allows it. The hooks only slow an agent and stop a slip. The branch policy of your repo is the guard that holds. Setup reports the policy and names each gap.

## Agent teams

Agent teams are optional and experimental in Claude Code. Setup can turn them on. With teams on, the orchestrator mirrors each ticket as a task.

## More

The full docs come in `cadre/docs/`. To test an install on Windows 11, use [the Windows checklist](docs/how-to/check-a-windows-install.md).
