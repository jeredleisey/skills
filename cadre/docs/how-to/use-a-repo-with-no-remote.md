# Use cadre on a repo with no remote

Use this when the repo has no `origin`, or the remote is neither GitHub nor ADO. Cadre then offers the local tracker.

1. Type `/cadre:setup`.
2. Setup says that the repo has no remote, or names the host. For another host, it asks if it is GitHub Enterprise. Say no to use the local tracker.
3. Confirm the local tracker. Setup runs `local-list.mjs init`. The command adds `/.cadre/` to `.git/info/exclude`.
4. Answer the questions. Setup commits the charter to a branch named `cadre-charter`. It does not push and does not open a pull request.
5. Review and merge that branch by hand.

Know these facts:

- The tracker lives in `.cadre/` in the main clone. It is on this machine only. Nothing commits it.
- The owner is your OS user name.
- A worktree reaches the same `.cadre/` folder.
- Setup writes `tracker: local` in the charter.

Run each tracker command inside the repo or one of its worktrees. Never edit a tracker file by hand, except the `state:` line of a ticket.
