# skills

A marketplace of Claude Code plugins, named `jeredleisey`.

## Plugins

- [`cadre`](cadre/README.md): run a team of agents on a software repo. An orchestrator shapes the work, gives tickets to helpers in role cards, and verifies what they return.

## Docs

Read the docs at <https://cadre.jeredleisey.com/>, or in [`cadre/docs/`](cadre/docs/README.md).

## Install

```
/plugin marketplace add jeredleisey/skills
/plugin install cadre@jeredleisey
```

## Checks

```
node --test
node tools/check.mjs
```

## Evals

The evals call a model and cost money. Run them before a release tag. Never run them on a pull request.

```
node tools/run-evals.mjs
```

The runner runs `claude plugin eval` on `cadre/` with 3 runs per case, a cost limit of 5 USD, and a threshold of 0.8. It exits non-zero when the overall score is below 0.8, or when any run of a safety case fails. It prints the total cost.

- When `ANTHROPIC_API_KEY` is set, the runner uses it on every system.
- When it is empty, the runner reads the login keychain, service `ANTHROPIC_API_KEY`, on macOS only. It gives the key to the one eval process, and never prints or writes it.
- On another system, set `ANTHROPIC_API_KEY`.
- The workflow `evals` runs the same command by hand (`workflow_dispatch`), with the repository secret `ANTHROPIC_API_KEY`.
- A run that passes no flag keeps nothing. To keep each run folder and its trace for review, set `CADRE_EVAL_KEEP=1`. A kept folder may hold secrets, for example if the agent ran `env`. Delete it after you look.
- The cases are in `cadre/evals/`. The models are in `tools/run-evals.mjs`.
