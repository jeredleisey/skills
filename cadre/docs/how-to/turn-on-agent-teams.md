# Turn on agent teams

Use this when you want the orchestrator to mirror each ticket as a task. Agent teams are experimental in Claude Code. Cadre works with them or without them.

## During setup

Type `/cadre:setup`. At the last step, setup asks: turn on agent teams? Say yes. Choose a scope:

- `local`: the file is `.claude/settings.local.json`. This is the default. Keep it out of git with a rule in `.gitignore`. The script checks the rule and prints a `note:` line if it is missing.
- `project`: the file is `.claude/settings.json`. It is committed, so the whole team gets the setting. Setup puts the file in a pull request.
- `user`: the file is `settings.json` in your Claude config folder. It covers every repo.

## By hand

Run:

```
node "<plugin root>/scripts/teams-setting.mjs" local <repo root>
```

The script sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to `1` in `env`. It keeps every other key. It prints the path of the file. `unknown: <reason>` means nothing was written.

## What changes

Only the lead completes a task, after it verifies the result. A hook (`task-completed.mjs`) blocks a completion that a helper or a teammate makes. The tracker stays the only record. A resume rebuilds from it, not from the task list.
