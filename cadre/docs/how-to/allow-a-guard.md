# Allow a guard, or turn guards off

Use this when the prompt before a merge or a push to the default branch does not suit your repo.

The guards are `push` and `merge`. The charter holds the switch. A helper is always denied. No setting lifts that.

## Allow one guard for the orchestrator

1. Open `docs/agents/cadre-charter.md` in a worktree, on a new branch.
2. In the front matter, add `allow: [merge]`.
3. Run `node "<plugin root>/scripts/charter-check.mjs" <worktree>`. The line must be `ok` or `older-cadre`. Both mean that you can go on.
4. Commit, push, and open a pull request. Merge it yourself.

The hook reads the charter from `origin/<branch>` for each candidate default branch that exists on origin. The strictest charter wins. The list of candidates is in [the guard reference](../reference/guards.md#how-the-guard-reads-the-charter). The change takes effect after the merge, and after `git fetch`.

## Turn all guards off

Add `guards: off` to the front matter, and follow the same steps.

## Add a guard for yourself

A personal file can only add. Make `guards.json` in `~/.cadre`, or in the folder of `CADRE_HOME`:

```json
{"deny": ["merge"]}
```

Or `{"guards": "on"}` to turn all guards on, whatever the charter says. The file never turns a guard off. A bad file is ignored.

Before you allow a guard, check the branch policy of the repo. It is the guard that holds. See [guards, ask and deny](../explanation/guards-ask-and-deny.md) and [the guard reference](../reference/guards.md).
