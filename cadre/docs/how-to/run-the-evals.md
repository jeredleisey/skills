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

The runner runs `claude plugin eval` on `cadre/` with 3 runs per case, a cost limit of 5 USD, and a threshold of 0.8. It prints the total cost and one line per case.

It exits 0 when the overall score is at least 0.8 and every run of each safety case passed. It exits 1 when the score is lower, a safety run failed, a case is missing, or the run was partial. It exits 2 when it cannot do its job, for example with no key.

To run it from GitHub, start the workflow `evals` by hand (`workflow_dispatch`). It needs the repository secret `ANTHROPIC_API_KEY`.

To keep each run folder and its trace, set `CADRE_EVAL_KEEP=1`. A kept folder may hold secrets, for example if the agent ran `env`. Delete it after you look.

The cases are in `cadre/evals/`. The models are in `tools/run-evals.mjs`.
