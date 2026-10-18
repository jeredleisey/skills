# Do one ticket

Use this to do one ticket with no orchestrator issue, no ledger, and no checkpoint. It is the fastest way to try cadre. The repo needs a charter, so run `/cadre:setup` first.

1. Type `/cadre:ticket <ticket>`. The ticket is a GitHub issue number, an Azure DevOps work item id, or a local ticket file in `.cadre/tickets/`. The tracker of the charter decides which.
2. The command runs the charter check of [the orchestrator](../reference/charter.md). With no charter, it stops and tells you to type `/cadre:setup`.
3. It reads the ticket. It stops when the ticket has no acceptance criterion that a command can prove.
4. It makes a worktree and a branch from the default branch, and starts a `coder` with a brief.
5. It verifies the result itself: the tests, the scope of the diff, a secret scan, and each criterion. A `reviewer` then reads the branch.
6. The coder fixes each must-fix and should-fix. The command leaves each nit and names it in the report.
7. The command pushes the branch and opens one pull request with no auto-merge. On the local tracker, it pushes nothing and tells you the branch name.
8. Review the pull request and merge it yourself.

## What your command allows

Your command is the consent for one push of the branch of the ticket and one pull request. It is no other consent. The command never merges, deploys, releases, deletes, or changes a setting. It writes no ledger and no checkpoint.

If the ticket asks for one of these steps, the command opens the pull request and stops. Use `/cadre:orchestrate` for that step, and for work across many tickets.
