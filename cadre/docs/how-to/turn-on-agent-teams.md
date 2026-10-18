# Turn on agent teams

Use this when you want the orchestrator to mirror each ticket as a task. Agent teams are experimental in Claude Code. Cadre works with them or without them.

Setup does not turn on agent teams. Its final report says that they are off. Turn them on by hand with the script.

## By hand

Run the script with one of these scopes:

- `local`: the file is `.claude/settings.local.json`. Keep it out of git with a rule in `.gitignore`. The script checks the rule and prints a `note:` line if it is missing.
- `project`: the file is `.claude/settings.json`. It is committed, so the whole team gets the setting. Put the file in a pull request.
- `user`: the file is `settings.json` in your Claude config folder. It covers every repo.

For example:

```
node "<plugin root>/scripts/teams-setting.mjs" local <repo root>
```

The script sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to `1` in `env`. It keeps every other key. It prints the path of the file. `unknown: <reason>` means nothing was written.

## What changes

Only the lead completes a task, after it verifies the result. A hook (`task-completed.mjs`) blocks a completion that a helper or a teammate makes. The tracker stays the only record. A resume rebuilds from it, not from the task list.
