# The tracker is the record

An orchestrator keeps no private memory. Its purpose, its ledger, its holder, and its checkpoints live in one tracker item.

## Why

A session ends. A context is compacted. A person changes machine. If the state lived in the session, each of these would lose it. A tracker item survives all of them, and a new session rebuilds from it.

The tracker also gives the human one place to look. The item shows who owns the orchestrator, which grants it holds, and what it plans next.

## What goes in it

- **Purpose and repos.** What the orchestrator is for.
- **Ledger.** The permissions that the human granted. Only the owner can grant a row. A resume deletes a row that someone else wrote.
- **Holder.** The session and host id that act as the orchestrator now.
- **Checkpoints.** New comments that record decisions, what waits for the human, and the next steps. Only added, never edited.

The host is a random id, not a device name, so a public issue holds no fact about a person.

## Why the rule is a script

A resume reads the item through a script, not by eye. The script checks the owner, the holder, and each checkpoint. It trusts a checkpoint only if the owner wrote it, with the marker line and the three sections. The marker time is text that the agent writes, so it does not rank the checkpoints. On GitHub and Azure DevOps, the comment that the tracker created last wins. A marker time more than 5 minutes after that creation time is not trusted. The local file has no creation time. There, the last checkpoint in the file wins, and a marker time more than 5 minutes ahead of now is not trusted. A line from a peer or a helper is no proof.

## Three trackers, one form

GitHub holds the item as an issue. Azure DevOps holds it as a work item, with the same four sections as HTML. The local tracker holds it as a file in `.cadre/`. The form and the checks are the same. Only the calls differ, and the local file ranks checkpoints by their order.

## What follows

Because the tracker is the record, a helper brief points to tickets, not to chat. A checkpoint is written after each merge. And agent teams, if on, mirror tickets as tasks without taking their place: a resume never reads the task list.

See [the orchestrator issue](../reference/orchestrator-item.md).
