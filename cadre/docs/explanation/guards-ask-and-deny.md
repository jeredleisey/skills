# Guards: ask for the orchestrator, deny for a helper

Cadre adds hooks on the Bash tool. They guard four one-way steps: a push to the default branch, a force push, a delete of a remote branch, and a pull-request merge or completion.

## Two answers

A hook gives one of two answers. It asks, or it denies.

- For the orchestrator, it asks. The human sees a prompt and decides. The orchestrator can do the step only with a yes.
- For a helper, it denies. No prompt, no choice.

The hook tells them apart by the field `agent_id` in the hook input. A helper call has it, even when empty. So a helper cannot pass by looking like the orchestrator.

## Why a helper is always denied

A helper has no human to ask. A prompt in a subagent has no one to answer it. And a helper works from a brief, which can be wrong. A merge is a decision for the orchestrator and its owner. So the charter can never lift the denial.

## Why the charter is read from the remote

The hook reads `guards` and `allow` from the charter on `origin/<default branch>`. It never reads the working tree. If it did, a helper could edit the charter in its worktree and switch the guard off. A charter on the default branch passed review in a pull request.

A missing or unreadable charter counts as guards on. A fault in the hook blocks the command, so a failure never lets a step through.

## What a guard does not do

The hooks slow an agent and stop a slip. They are not a lock. They guard the Bash tool only. They do not see the PowerShell tool, interpreters such as `python3 -c`, shell aliases, a script on disk, `gh api` merges, or REST calls on ADO.

The branch policy of the repo is the guard that holds. It runs on the host, so no agent route avoids it. Setup reports its gaps, and cadre never lowers it. A human who wants a stronger guard closes those gaps.

## The knobs

The charter can switch a guard off or allow it for the orchestrator. A personal file can only add. The reason for the asymmetry: a person can make their own session stricter, but a file on one machine must not weaken a team rule.

See [allow a guard](../how-to/allow-a-guard.md) and [the guard reference](../reference/guards.md).
