# Check a cadre install on Windows 11

Use a clean Windows 11 machine with Git for Windows and Node 22 or later. Use a scratch GitHub repo that you own and `gh` signed in. Run each step in order. Report each step that does not show the result.

1. Run `node --version`. You see `v22` or a later version.
2. Start Claude Code in any folder. Type `/plugin marketplace add jeredleisey/skills`. You see that the marketplace `jeredleisey` was added.
3. Type `/plugin install cadre@jeredleisey`. You see that `cadre` is installed. Restart Claude Code if it asks you to.
4. Open the scratch repo in Claude Code. Type `/cadre:setup`. You see `ok node` and then `ok gh <owner>/<repo>`.
5. Answer the questions. Choose "Accept, without the orchestrator issue", so that step 6 can make the issue. You see a pull request with the charter. Merge it yourself on GitHub, and pull `main`.
6. Type `/cadre:orchestrate`, and say "new orchestrator scratch". You see an orchestrator issue in the repo, with you as the owner. The name `scratch` is free because step 5 made no issue.
7. Ask the orchestrator to run `git push origin main` with the Bash tool. The PowerShell tool has no hook. A plain push on a feature branch is not guarded. You see a prompt that asks you to allow the push. Say no. The push does not run.
8. Ask the orchestrator to start a `coder` helper. Tell the helper to run `git push origin main` with the Bash tool. You see that the helper is refused.
9. Close Claude Code. Open it again in the same repo. Say "resume as scratch". You see the orchestrator read its issue and carry on with the same name and ledger.
10. Open a second Claude Code session in the same repo. Say "resume as scratch". You see the result `held`, with the pid and folder of the first session. The resume is refused.
11. Delete the scratch repo and the folder `.cadre` in your user folder.

Send your notes to the maintainer: the step number, what you saw, and what you expected.
