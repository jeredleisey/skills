# skills

A marketplace of Claude Code plugins. The marketplace is `jeredleisey`. The plugin `cadre` is in `cadre/`.

## Rules for a change

- Each change is a branch and a pull request. Do not push to `main`.
- Run `node --test` and `node tools/check.mjs` before you push. Both must pass. Node 22 or later is needed, and no package install.
- Write each rule of the skill so that it answers a real fault.
- The word budget in `tools/word-budget.json` caps the words that an orchestrator and its helpers read on every run. When a change needs more words, first move detail from the skill or the card into a reference that a step points to. Raise the budget only with a reason in the pull request. Never cut a rule or a check to fit the budget.
- Keep each fact of one repo, one person, or one organization out of the plugin. Such facts do not belong in this repo.
