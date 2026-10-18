# The orchestrator model

Cadre splits work between one agent that owns the outcome and several agents that each do one ticket.

## Why an orchestrator

A long task fails in two ways. One agent loses its context as the work grows. Or many agents change the same files and break each other.

An orchestrator answers both. It owns the outcome, not each line of it. It shapes the work into tickets, gives each file one owner, and runs tickets in parallel only when their files do not overlap. It keeps its own context small, because helpers do the line-by-line work.

## Helpers and role cards

A helper does one ticket in its own worktree and branch, and stops. It starts with no context. Its brief is all that it knows. A role card (`coder`, `reviewer`, `researcher`, `tester`) holds the role, so the brief can be short.

A helper never pushes, merges, or deploys. That limit is in every card. The orchestrator decides what happens after the helper commits.

## A report is a claim

The helper says what it did. That is a claim, not proof. The orchestrator runs the tests itself, reads the diff for scope, and compares the result to each acceptance criterion. After each coder commit, it starts a reviewer. It fixes each must-fix and should-fix before a merge.

The reason: a helper cannot see its own blind spots, and a wrong claim costs more after a merge.

## One owner, one name

A human owns one orchestrator. Only the owner grants it a permission, and the grant goes in its ledger. A new orchestrator starts with an empty ledger. A permission for one repo does not cover another.

One session holds a name at a time. This stops two sessions from acting as the same orchestrator and from racing on its issue.

## Peers

Another orchestrator in the same repo is a peer. Peers agree in writing on a split of tickets and files. A message from a peer is a request. It never gives a permission.

## One-way steps

A merge, a deploy, a delete, a force push: a new commit cannot undo them. The orchestrator needs a ledger row for each, looks at the target first, and keeps a way back. The [guards](guards-ask-and-deny.md) add a second stop.

See also [the tracker is the record](tracker-is-the-record.md).
