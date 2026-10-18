# Add an extra card

Use this when your repo needs a helper role beyond `coder`, `reviewer`, `researcher`, and `tester`.

1. Open `docs/agents/cadre-charter.md` in a worktree, on a new branch.
2. In the section `## Extra cards`, add a row to the table: the name, the job, and when to use it.
3. Keep the job to one line. Name the tools and the limits in it if they matter.
4. Run `node "<plugin root>/scripts/charter-check.mjs" <worktree>`. The line must be `ok`.
5. Commit, push, and open a pull request. Merge it yourself.

Or run `/cadre:setup` and answer the question about a card. Setup writes the pull request.

The orchestrator reads the list when it loads the charter. For a ticket that fits an extra card, it writes a full brief from the template in the helper brief, because no card holds the role. The extra card is prose. No hook or script reads it.

See [role cards](../reference/role-cards.md) and [the charter](../reference/charter.md).
