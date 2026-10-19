# Set up cadre on a GitHub repo

Use this when your repo has a GitHub remote and cadre is installed.

1. Run `gh auth status`. The active account must see the repo. A wrong default account shows as a 404.
2. Open the repo in Claude Code. Type `/cadre:setup`.
3. Read each line that starts with `ok`, `stop:`, or `unknown:`. A `stop:` or `unknown:` line ends setup. Fix its cause. Type `/cadre:setup` again. A `gap:` line of the branch policy is not shown as a line. Setup puts it in the Traps row of the screen.
4. Read the screen. Setup reads the merge methods, the secret names, the live clones, and the folders from the repo. It shows one table of rows with a proposed value and a source for each. A row with source `default` is a proposal that the repo does not hold.
5. Answer the one closing question. Choose "Accept all", or "Accept, without the orchestrator issue". Or type the rows to change. Setup applies the change, shows the changed rows, and asks once more.
6. Open the pull request that setup creates. Review `docs/agents/cadre-charter.md`. Merge it yourself.
7. Pull the default branch.

Setup also creates the orchestrator issue, with the five standard grants in its Ledger, unless you turned that row off. Agent teams stay off. See [turn on agent teams](turn-on-agent-teams.md).

For GitHub Enterprise, a remote on another host gives `other-host`. Setup asks one yes-or-no question: is the host GitHub Enterprise? Say yes to go on as GitHub with that host.

Close the gaps that setup reports in the branch policy of the repo. The hooks only slow an agent. The branch policy is the guard that holds. See [guards, ask and deny](../explanation/guards-ask-and-deny.md).

To add new fields after a cadre update, run `/cadre:setup` again. It keeps each answer that is there.
