# Set up cadre on an Azure DevOps repo

Use this when your repo has an Azure DevOps (ADO) remote and cadre is installed.

1. Set the variable `AZURE_DEVOPS_EXT_PAT` to a personal access token. Check it is not empty: `[ -n "$AZURE_DEVOPS_EXT_PAT" ] && echo ok`. Cadre never prints the token.
2. Do not run `az login` as a fix. The token is the way in.
3. Open the repo in Claude Code. Type `/cadre:setup`.
4. Setup reads the organization, project, and repo from the remote URL. A space in a name is fine.
5. Answer the two ADO questions first:
   - The area path of the items of this repo. Setup proposes a match. A project root gives a warning, and setup asks for another path.
   - The work item type that holds the orchestrator issue. Use `Task` or another type. Setup refuses a type that does not work and offers another.
6. Read the screen. Setup shows one table of rows with a proposed value and a source for each. On ADO it cannot read the secret names, so that row is a default.
7. Answer the one closing question. Choose "Accept all", or "Accept, without the orchestrator issue". Or type the rows to change.
8. Setup runs `az repos pr create` and gives you the URL. Open that pull request. Review the charter. Complete it yourself. Setup never adds auto-complete.

Setup creates the orchestrator issue, as a work item, with the five standard grants in its Ledger, unless you turned that row off. Agent teams stay off.

Setup writes `tracker: ado`, `ado_org`, and `ado_project` in the charter front matter.

Setup cannot read the permission "Bypass policies when pushing". Check who holds it. The hooks do not cover `az devops invoke` or REST calls that complete a pull request. The branch policy of the repo covers them. The script `ado-call.mjs` refuses a `POST` or `PATCH` to a pull request, and says to use `az repos pr update`, which the guard reads.

See [the orchestrator issue](../reference/orchestrator-item.md) for how an orchestrator is stored on ADO.
