# Your first orchestrator

In this lesson you install cadre, set up a scratch repo, and run one small ticket from start to merge. Then you resume the orchestrator in a new session. It takes about 30 minutes.

You need:

- Claude Code with plugin hooks.
- Node 22 or later. Run `node --version` to check.
- The `gh` CLI, signed in to an account that owns a scratch repo.

Make a new empty GitHub repo for this lesson. Call it `cadre-scratch`. Clone it and open the folder in a terminal. Delete it when you finish.

## 1. Install cadre

Start Claude Code in any folder. Type:

```
/plugin marketplace add jeredleisey/skills
/plugin install cadre@jeredleisey
```

You see that the marketplace `jeredleisey` was added, and then that `cadre` is installed. Restart Claude Code if it asks you to.

## 2. Run setup

Start Claude Code in the `cadre-scratch` clone. Type `/cadre:setup`.

You see `ok node` with a version. Then you see `ok gh <owner>/cadre-scratch`. Setup then reads the branch policy of the repo. A new repo has none, so the Traps row of the screen lists the gaps. That is normal for this lesson.

Setup then shows one screen. It is a table with the columns Row, Proposed value, and Source. Setup read the merge methods, the secret names, and the folders from the repo, and it proposes a default for each other row. Read the rows. The Merge row offers only the methods that your repo allows.

Setup asks one closing question. Type this answer: "merge: rebase. orchestrator issue: name Scratch, purpose Practice run in a scratch repo." Setup shows the two changed rows and asks once more. Choose "Accept all (Recommended)".

Setup does not turn on agent teams. Its report says that they are off.

You see a pull request URL. The pull request adds `docs/agents/cadre-charter.md`.

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

When it runs `gh pr merge`, the cadre hook stops the command. You see a prompt that asks you to allow the merge. This is the guard. Allow it.

You see the pull request merged, and `hello.txt` on `main`. The orchestrator then adds a checkpoint comment to its issue. The comment starts with `cadre-checkpoint v1` and has three sections.

## 8. Resume in a new session

Close Claude Code. Open it again in the same clone. Type `/cadre:orchestrate`. Say: "resume as scratch".

You see the orchestrator read its issue. It keeps the name `Scratch`. It keeps its ledger rows. It reads the newest checkpoint and checks each next step against the tracker.

Open a second Claude Code session in the same folder while the first is still open. Say "resume as scratch" there. The resume is refused, and you see the pid and folder of the first session. Only one session holds a name.

## What you did

- You set up a repo and reviewed its charter.
- You ran one orchestrator and one helper.
- You saw the guard ask before a merge.
- You resumed from the tracker, with no memory of the first session.

Delete the scratch repo and the folder `.cadre` in your user folder when you finish.

Next steps:

- [How cadre thinks about orchestrators](../explanation/orchestrator-model.md)
- [Allow a guard](../how-to/allow-a-guard.md)
