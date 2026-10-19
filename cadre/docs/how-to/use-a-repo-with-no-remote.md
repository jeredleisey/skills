# Use cadre on a repo with no remote

Use this when the repo has no `origin`, the remote is a path on this machine, or the remote is neither GitHub nor ADO. Cadre then offers the local tracker.

1. Make sure that the repo has a commit on `main`, `master`, or the branch of `init.defaultBranch`. With no such branch, setup stops and says to make a first commit.
2. Type `/cadre:setup`.
3. Setup says that the repo has no remote, or that the remote is a path, so it uses the local tracker. For another host, it asks one yes-or-no question: is it GitHub Enterprise? Say no to use the local tracker.
4. Setup runs `local-list.mjs init` with no confirm. The command adds `/.cadre/` to `.git/info/exclude`.
5. Read the screen and answer the one closing question. A local repo has no repo facts, so most rows are defaults. Setup commits the charter to a branch named `cadre-charter`. It does not push and does not open a pull request.
6. Review and merge that branch by hand.

The tracker is on this machine only. For where it lives, who owns it, and what the charter holds, see [the orchestrator issue](../reference/orchestrator-item.md) and [the charter](../reference/charter.md).

Run each tracker command inside the repo or one of its worktrees. Never edit a tracker file by hand, except the `state:` line of a ticket.
