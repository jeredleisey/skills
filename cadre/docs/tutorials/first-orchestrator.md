# Your first orchestrator

In this lesson you install cadre, set up a scratch repo, and run one small ticket from start to merge. Then you resume the orchestrator in a new session. It takes about 30 minutes.

This lesson uses GitHub. Cadre also works on Azure DevOps. See [Set up on Azure DevOps](../how-to/set-up-on-azure-devops.md).

## Before you start

You use Claude Code in one of three places: the terminal (the `claude` command), the Claude desktop app (the Code tab), or the VS Code extension. The lesson is the same in each. Step 1 and step 2 say where they differ.

Check each item in a terminal. Install what is missing.

| Item | Check | Install |
| --- | --- | --- |
| Claude Code | Terminal: `claude --version`. VS Code: the version of the extension in the Extensions view. Desktop: **Claude > Check for Updates…** | <https://code.claude.com/docs> |
| Node 22 or later | `node --version` | <https://nodejs.org> (the LTS version) |
| git | `git --version` | <https://git-scm.com/downloads> |
| The GitHub CLI | `gh --version` | <https://cli.github.com> |
| A `gh` login | `gh auth status` shows the account that will own the scratch repo | `gh auth login` |

Cadre runs Node scripts and the `gh` command through the Bash tool of Claude Code, in each of the three places. So each item must work in a terminal on the same computer.

If you have more than one GitHub account, `gh auth status` shows which one is active. Switch with `gh auth switch`. The scratch repo must belong to the active account.

## Make a scratch repo

Make a new GitHub repo for this lesson. Call it `cadre-scratch`. Add a README when you make it, or push a first commit. Setup needs a commit on the default branch, and an empty repo has none. Clone it and open the folder in a terminal. Delete it when you finish.

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

You see `ok node` with a version. Then you see `ok gh <owner>/cadre-scratch`. Setup then reads the branch policy of the repo. A new repo has no branch rules. Setup lists each gap in the Traps row of the screen. If GitHub refuses to show the rules, you see a note that the policy is unread. Both are normal for this lesson.

Setup then shows one screen. It is a table with the columns Row, Proposed value, and Source. Setup read the merge methods, the secret names, and the folders from the repo, and it proposes a default for each other row. Read the rows. The Merge row offers only the methods that your repo allows.

Setup asks one closing question. Type this answer: "merge: rebase. orchestrator issue: name Scratch, purpose Practice run in a scratch repo." Setup shows the two changed rows and asks once more. Choose "Accept all (Recommended)".

Setup does not turn on agent teams. Its report says that they are off.

You see a pull request URL. The pull request adds `docs/agents/cadre-charter.md`. It also adds the line `.claude/worktrees/` to `.gitignore` when that line is missing.

## 3. Merge the charter

Open the pull request on GitHub. Read the charter. Merge it yourself. Then, in the clone, run `git pull`.

Cadre never merges this pull request for you. You see the charter on `main`.

## 4. Find the orchestrator

Setup also made an orchestrator issue, because the row was on. Type `/cadre:orchestrate`. Say: "resume as scratch".

To make another orchestrator later, say "new orchestrator <name>". It asks for a purpose if you did not give one, and it offers the same five standard grants.

You see the issue in the repo, titled `Orchestrator: Scratch`. It has the label `cadre:orchestrator` and you are the assignee. Its body has four sections: Purpose, Repos, Ledger, and Holder. The Ledger holds the five standard grants, each with you as Granted by.

## 5. Give it one ticket

Say: "Add a file `hello.txt` with the line `hello`. Give the ticket to a coder."

The orchestrator writes a ticket as an issue with the label `cadre:work:scratch`. It makes a worktree and a branch, and starts a `coder` helper with a brief. The brief names the base, the write limit (`hello.txt` only), and the check: the file exists and holds the line `hello`.

You see the helper run. It commits to its branch and stops. It does not push.

## 6. Watch it verify

The orchestrator treats the helper report as a claim. You see it check the result itself. It runs the check from the branch and reads the diff. It then starts a `reviewer` helper, which reports must-fix, should-fix, and nit findings.

The orchestrator then reports to you. The end of its message has a numbered list of decisions. One decision is the merge.

## 7. Merge, with the guard prompt

Say yes to the merge. Give the permission in your own words, for example: "Yes, merge the pull request for hello.txt."

The orchestrator adds a sixth row to the Ledger of its issue, for the merge. It then pushes the branch and opens a pull request. A push of an ordinary branch passes with no prompt.

When it runs `gh pr merge`, the cadre hook stops the command. You see a prompt that asks you to allow the merge. The prompt names the plugin as `[plugin:cadre]`. This is the guard. Allow it. The guard asks also in auto mode. Do not run this lesson with permission prompts turned off, because then you may not see the guard.

You see the pull request merged, and `hello.txt` on `main`. The orchestrator then adds a checkpoint comment to its issue. The comment starts with `cadre-checkpoint v1` and has three sections.

## 8. Resume in a new session

Close the session. Start a new session in the same clone, as in step 2. Type `/cadre:orchestrate`. Say: "resume as scratch".

You see the orchestrator read its issue. It keeps the name `Scratch`. It keeps the five standard grants. It deletes the merge grant, because that grant ended with its session. It reads the newest checkpoint and checks each next step against the tracker.

Open a second session in the same folder while the first is still open. Say "resume as scratch" there. The resume is refused, and you see the pid and folder of the first session. Only one session holds a name.

## What you did

- You set up a repo and reviewed its charter.
- You ran one orchestrator and one helper.
- You saw the guard ask before a merge.
- You resumed from the tracker, with no memory of the first session.

Delete the scratch repo and the folder `.cadre` in your user folder when you finish.

Next steps:

- [How cadre thinks about orchestrators](../explanation/orchestrator-model.md)
- [Allow a guard](../how-to/allow-a-guard.md)
