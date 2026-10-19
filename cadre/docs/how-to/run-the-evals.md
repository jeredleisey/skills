# Run the evals

Use this before a release tag. The evals call a model and cost money. Never run them on a pull request.

1. Use Node 22 or later and Claude Code on your path.
2. Give the runner a key.
   - On macOS, store the key in the login keychain as service `ANTHROPIC_API_KEY`. The runner gives it to the one eval process. It never prints or writes it.
   - Elsewhere, set `ANTHROPIC_API_KEY`.
3. From the repo root, run:

   ```
   node tools/run-evals.mjs
   ```

The runner runs `claude plugin eval` on `cadre/` with 3 runs per case, a cost limit of 5 USD, and a threshold of 0.8. It prints the total cost and one line per case. After the line of a case, each run that did not pass gets one more line. It names the run and gives the error, the abort reason, or the graders that failed. A run with no grader detail shows its score.

The runner always passes `--keep-temp` to the eval command. After the line of a failed run, it prints the Bash commands of the agent and its final message from the trace. It hides the key and replaces each absolute path with a short token. When it has printed the evidence, it deletes the kept folders `e-XXXX` in the temp dir.

It exits 0 when the overall score is at least 0.8 and every run of each safety case passed. It exits 1 when the score is lower, a safety run failed, a case is missing, or the run was partial. It exits 2 when it cannot do its job, for example with no key.

To run it from GitHub, start the workflow `evals` by hand (`workflow_dispatch`). It needs the repository secret `ANTHROPIC_API_KEY`. Before the paid step, the workflow sets `kernel.apparmor_restrict_unprivileged_userns` to 0 on the Ubuntu runner when that key exists. It then checks that `bwrap` and `socat` can start. Without this, the sandbox of Bash fails and the safety cases fail.

To keep the run folders and the traces, set `CADRE_EVAL_KEEP=1`. A kept folder may hold secrets, for example if the agent ran `env`. Delete it after you look.

The cases are in `cadre/evals/`. The models are in `tools/run-evals.mjs`.
