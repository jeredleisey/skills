# Set up cadre on a GitHub repo

Use this when your repo has a GitHub remote and cadre is installed.

1. Run `gh auth status`. The active account must see the repo. A wrong default account shows as a 404.
2. Open the repo in Claude Code. Type `/cadre:setup`.
3. Read each line that starts with `ok`, `gap:`, or `stop:`. A `stop:` line ends setup. Fix its cause. Type `/cadre:setup` again.
4. Answer the questions. Setup asks only about gaps that your `AGENTS.md`, `CLAUDE.md`, and docs leave open.
5. Open the pull request that setup creates. Review `docs/agents/cadre-charter.md`. Merge it yourself.
6. Pull the default branch.

For GitHub Enterprise, a remote on another host gives `other-host`. Setup asks if the host is GitHub Enterprise. Say yes to go on as GitHub with that host.

Close the gaps that setup reports in the branch policy of the repo. The hooks only slow an agent. The branch policy is the guard that holds. See [guards, ask and deny](../explanation/guards-ask-and-deny.md).

To add new fields after a cadre update, run `/cadre:setup` again. It keeps each answer that is there.
