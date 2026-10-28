# Your first orchestrator on Azure DevOps

In this lesson you install cadre and set up a scratch repo on Azure DevOps (ADO). You run one small ticket from start to a completed pull request. Then you resume the orchestrator in a new session. It takes about 30 minutes. On ADO, to complete a pull request is to merge it.

This lesson has the same steps as [Your first orchestrator](first-orchestrator.md), which uses GitHub. The steps differ where ADO differs. For the short form, see [Set up on Azure DevOps](../how-to/set-up-on-azure-devops.md).

## Before you start

You use Claude Code in one of three places. These are the terminal (the `claude` command), the Claude desktop app (the Code tab), and the VS Code extension. The lesson is the same in each. Step 1 and step 2 say where they differ.

Check each item in a terminal. Install what is missing.

| Item | Check | Install |
| --- | --- | --- |
| Claude Code | Terminal: `claude --version`. VS Code: the version of the extension in the Extensions view. Desktop: **Claude > Check for Updates…** | <https://code.claude.com/docs> |
| Node 22 or later | `node --version` | <https://nodejs.org> (the LTS version) |
| git | `git --version` | <https://git-scm.com/downloads> |
| The Azure CLI | `az --version` | <https://learn.microsoft.com/cli/azure/install-azure-cli> |
| The `azure-devops` extension | `az extension show --name azure-devops` | `az extension add --name azure-devops` |
| A personal access token in `AZURE_DEVOPS_EXT_PAT` | `[ -n "$AZURE_DEVOPS_EXT_PAT" ] && echo ok` prints `ok` | Make a token in ADO. See below. |

Cadre runs Node scripts and the `az` command through the Bash tool of Claude Code, in each of the three places. So each item must work in a terminal on the same computer.

Setup does not check for the `az` CLI yet. A missing `az` fails at the last step of setup, after setup pushes the charter branch. You then open the pull request by hand. Check `az` first.

### The token

Make the token in ADO, in the user settings, under **Personal access tokens**. The token must belong to the account that will own the scratch work. Give it these scopes:

- **Work Items**: Read and write. Cadre reads work items and area paths. It makes and edits the orchestrator issue, the tickets, and their comments. On ADO the orchestrator issue is a work item.
- **Code**: Read and write. Setup reads the repo, and the pull request step needs write access.

Cadre also reads the branch policy of the repo and the account of the token.

If ADO refuses the token, setup says so with this order of checks: an empty variable first, then an expired token, then the scope of the token. A refused read of the branch policy does not stop setup. It becomes a note on the screen that says the policy is unread.

Set the variable in the environment that Claude Code starts from. A shell profile is one way. A variable that you set in one open terminal does not reach the desktop app or VS Code. Cadre never prints the token. Do not run `az login` as a fix. The token is the way in.

## Make a scratch repo

In an ADO project where you can make work items and pull requests, make a new repo. Call it `cadre-scratch`. Choose **Add a README** when you make it. Setup needs a commit on the default branch, and an empty repo has none. Clone it and open the folder in a terminal. Delete it when you finish.

## 1. Install cadre

Do this once on each computer. The three places read the same settings, so a plugin that you install in one is there in the other two.

**Terminal.** Start `claude` in any folder. Type:

```
/plugin marketplace add jeredleisey/skills
/plugin install cadre@jeredleisey
```

**Desktop app.** `/plugin` does not work in the Code tab. Click **+** next to the prompt box, and choose **Add plugins**. Add the marketplace `jeredleisey/skills`, then install `cadre`.

**VS Code.** Type `/plugins` in the prompt box. In **Manage plugins**, open the **Marketplaces** tab and add `jeredleisey/skills`. Then open the **Plugins** tab and install `cadre`.

If you have the `claude` command, this works for each of the three places, from any terminal:

```
claude plugin marketplace add jeredleisey/skills
claude plugin install cadre@jeredleisey --scope user
```

You see that the marketplace `jeredleisey` was added, and then that `cadre` is installed. A plugin loads when a session starts. Start a new session, or type `/reload-plugins` in an open one.

If your organization manages Claude Code, it can block a marketplace. You then see a message such as `Marketplace source 'jeredleisey/skills' is blocked by enterprise policy`. Ask your administrator to allow the marketplace. You cannot fix this yourself.

## 2. Run setup

Open the `cadre-scratch` clone in Claude Code:

- **Terminal:** `cd` into the clone, then run `claude`.
- **Desktop app:** in the Code tab, start a new session and choose the clone folder.
- **VS Code:** open the clone folder, then open the Claude Code panel.

Type `/cadre:setup`. If the command is not in the list, type `/` and pick `setup` from the cadre entries.

You see `ok node` with a version. Setup reads the organization, project, and repo from the remote URL. A space in a name is fine. You then see `ok ado <org>/<project>`. If you see a `stop:` line, it names the cause. It can be a token that ADO refuses, a project that ADO cannot see, or a token with no access to the project. Check that the variable is not empty, that the token has not expired, and that it has the two scopes above. Then type `/cadre:setup` again.

Setup then reads the branch policy of the repo. A new repo has no branch rules. Setup lists each gap in the Traps row of the screen. Setup cannot read the permission "Bypass policies when pushing". It tells you to check who holds it. That is normal for this lesson.

Setup then asks the two ADO questions before the screen:

- The area path of the items of this repo. If an area has the name of the repo, setup proposes it. If none matches, setup warns that items then go to the project root, and it asks for another path. Setup does not check a path that you type. So before you start, find an area path where you can make items, or make one with the name of the repo.
- The work item type that holds the orchestrator issue. Answer `Task`. If the type does not work in your project, setup says why and offers another. Take the one that it offers.

Setup then shows one screen. It is a table with the columns Row, Proposed value, and Source. Setup read the merge methods and the folders from the repo, and it proposes a default for each other row. On ADO it cannot read the secret names, so that row is a default. Read the rows. The Merge row offers only the methods that your repo allows. A new repo has no merge policy, so it allows all of them.

Setup asks one closing question. Type this answer: "merge: squash. orchestrator issue: name Scratch, purpose Practice run in a scratch repo." Setup shows the two changed rows and asks once more. Choose "Accept all (Recommended)".

Setup does not start agent teams. Its report says that they are off.

You see a pull request URL. The pull request adds `docs/agents/cadre-charter.md`. It also adds the line `.claude/worktrees/` to `.gitignore` when that line is missing. The charter has `tracker: ado`, `ado_org`, and `ado_project` in its front matter.

## 3. Complete the charter pull request

Open the pull request in the ADO web UI. Read the charter. Complete it yourself. Then, in the clone, run `git pull`.

Setup never adds auto-complete, and cadre never completes this pull request for you. You see the charter on the default branch.

## 4. Find the orchestrator

Setup also made an orchestrator issue, because the row was on. Type `/cadre:orchestrate`. Say: "resume as scratch".

To make another orchestrator later, say "new orchestrator <name>". It asks for a purpose if you did not give one, and it offers the same five standard grants.

You see a work item of the type that you chose, in the area path that you chose, titled `Orchestrator: Scratch`. It has the tag `cadre:orchestrator`, and Assigned To shows your account. Its description has four sections: Purpose, Repos, Ledger, and Holder. The Ledger holds the five standard grants, each with you as Granted by.

## 5. Give it one ticket

Say: "Add a file `hello.txt` with the line `hello`. Give the ticket to a coder."

The orchestrator writes a ticket as a work item with the tag `cadre:work:scratch`. It makes a worktree and a branch, and starts a `coder` helper with a brief. The brief names the base, the write limit (`hello.txt` only), and the check: the file exists and holds the line `hello`.

You see the helper run. It commits to its branch and stops. It does not push.

## 6. Watch it verify

The orchestrator treats the helper report as a claim. You see it check the result itself. It runs the check from the branch and reads the diff. It then starts a `reviewer` helper, which reports must-fix, should-fix, and nit findings.

The orchestrator then reports to you. The end of its message has a numbered list of decisions. One decision is the merge.

## 7. Merge, with the guard prompt

Say yes to the merge. Give the permission in your own words, for example: "Yes, complete the pull request for hello.txt."

The orchestrator adds a sixth row to the Ledger of its orchestrator issue, for the merge. It then pushes the branch and opens a pull request. A push of an ordinary branch passes with no prompt.

To complete the pull request, the orchestrator runs a command. If the command is `az repos pr update` with `--status completed`, the cadre hook stops it. You see a prompt that asks you to allow the merge. The prompt names the plugin as `[plugin:cadre]`. This is the guard. Allow it. The guard asks also in auto mode. Do not run this lesson with all permission prompts off, because then you may not see the guard.

You see the pull request completed, and `hello.txt` on the default branch. The orchestrator then adds a checkpoint comment to its work item. The comment starts with `cadre-checkpoint v1` and has three sections.

The guard reads only commands that it knows. It does not see `az devops invoke` or a REST call that completes a pull request. If the orchestrator completes the pull request in such a way, you see no guard prompt. The ledger row and the branch policy of the repo still apply.

## 8. Resume in a new session

Close the session. Start a new session in the same clone, as in step 2. Type `/cadre:orchestrate`. Say: "resume as scratch".

You see the orchestrator read its work item. It keeps the name `Scratch`. It keeps the five standard grants. It deletes the merge grant, because that grant ended with its session. It reads the newest checkpoint and checks each next step against the tracker.

Open a second session in the same folder while the first is still open. Say "resume as scratch" there. The orchestrator refuses the resume, and you see the pid and folder of the first session. Only one session holds a name.

## What you did

- You set up a repo and reviewed its charter.
- You ran one orchestrator and one helper.
- You saw the guard ask before a merge.
- You resumed from the tracker, with no memory of the first session.

When you finish, delete:

- the scratch repo
- the orchestrator work item and the ticket work item
- the folder `.cadre` in your user folder

Next steps:

- [How cadre thinks about orchestrators](../explanation/orchestrator-model.md)
- [Allow a guard](../how-to/allow-a-guard.md)
