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

You see `ok node` with a version. Then you see `ok gh <owner>/cadre-scratch`. Setup then reports the branch policy of the repo. A new repo has none, so you see `gap:` lines. That is normal for this lesson.

Setup asks its questions one at a time. For the scratch repo, answer like this:

1. Skill pack: `none`.
2. Owners: "All files, one orchestrator."
3. Merge: "I merge, by rebase."
4. Documentation: "None."
5. Only the human: "None."
6. Secrets, traps, live clones: "None."
7. Extra card: "None."

Setup may offer agent teams. Say no.

You see a pull request URL. The pull request adds `docs/agents/cadre-charter.md`.

## 3. Merge the charter

Open the pull request on GitHub. Read the charter. Merge it yourself. Then, in the clone, run `git pull`.

Cadre never merges this pull request for you. You see the charter on `main`.

## 4. Start an orchestrator

Type `/cadre:orchestrate`. Say: "new orchestrator scratch".

The orchestrator asks for a purpose if you did not give one. Say: "Practice run in a scratch repo."

You see a new issue in the repo, titled `Orchestrator: Scratch`. It has the label `cadre:orchestrator` and you are the assignee. Its body has four sections: Purpose, Repos, Ledger, and Holder. The Ledger is empty.

## 5. Give it one ticket

Say: "Add a file `hello.txt` with the line `hello`. Give the ticket to a coder."

The orchestrator writes a ticket as an issue with the label `cadre:work:scratch`. It makes a worktree and a branch, and starts a `coder` helper with a brief. The brief names the base, the write limit (`hello.txt` only), and the check: the file exists and holds the line `hello`.

You see the helper run. It commits to its branch and stops. It does not push.

## 6. Watch it verify

The orchestrator treats the helper report as a claim. You see it check the result itself. It runs the check from the branch and reads the diff. It then starts a `reviewer` helper, which reports must-fix, should-fix, and nit findings.

The orchestrator then reports to you. The end of its message has a numbered list of decisions. One decision is the merge.

## 7. Merge, with the guard prompt

Say yes to the merge. Give the permission in your own words, for example: "Yes, merge the pull request for hello.txt."

The orchestrator adds a row to the Ledger of its issue. It then pushes the branch and opens a pull request. A push of an ordinary branch passes with no prompt.

When it runs `gh pr merge`, the cadre hook stops the command. You see a prompt that asks you to allow the merge. This is the guard. Allow it.

You see the pull request merged, and `hello.txt` on `main`. The orchestrator then adds a checkpoint comment to its issue. The comment starts with `cadre-checkpoint v1` and has three sections.

## 8. Resume in a new session

Close Claude Code. Open it again in the same clone. Type `/cadre:orchestrate`. Say: "resume as scratch".

You see the orchestrator read its issue. It keeps the name `Scratch`. It keeps the ledger row. It reads the newest checkpoint and checks each next step against the tracker.

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
