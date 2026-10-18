---
charter_schema: 1
written_by: cadre 0.1.0
skill_pack: mattpocock-skills
---

# Charter

## Tracker

GitHub: host `github.com`, owner `jeredleisey`, repo `skills`.

## Owners

| Path | Owner | Note |
| --- | --- | --- |
| `/` (all of the repo) | the one orchestrator | Includes `cadre/`, `tools/`, `.github/`, `.githooks/`, `.claude-plugin/`, and the docs site files. |

When code moves to another repo, its ownership moves with it to the orchestrator of that repo.

## Merge and deploy

- Merge: merge commit only. The owner (`jeredleisey`) merges. The orchestrator can merge when the owner grants it in the session, and only after its own verify, a review, and green CI. The merge guard asks each time.
- Deploy: the `docs` workflow publishes GitHub Pages on each merge to `main`. A release is a `cadre--vX.Y.Z` tag, made with `claude plugin tag --push` after the eval gate passes. The owner makes it, or the orchestrator makes it when the owner says so.

## Extra cards

The orchestrator reads this list, so it is prose and not front matter.

| Name | Job | When to use |
| --- | --- | --- |

None. The four cards cover the work.

## Documentation

A change to cadre behavior updates `cadre/docs/`, the README that names the behavior, and `cadre/GLOSSARY.md` when a term changes, in the same pull request. The coder writes the change. The reviewer checks each doc claim against the code. The orchestrator checks it before the merge.

The release notes go in the GitHub release of each `cadre--vX.Y.Z` tag. The orchestrator writes them when it makes the tag. There is no separate CHANGELOG file.

## Only the human

- Log in to `gh`, or switch the `gh` account.
- Create, change, or read the value of a secret.
- Delete a repo, a remote tag, or a release.
- Weaken a ruleset or a branch protection, or turn a guard off.
- Change the visibility of the repo.
- Do anything in billing or DNS.

These need a grant in the ledger for the session:

- A paid eval run, with a limit from `--max-cost-usd`.
- A change to a repo setting or a Pages setting that does not weaken protection.
- A change to a ruleset that keeps or makes stronger the protection.
- A release tag.

## Secrets

- `ANTHROPIC_API_KEY`, local: the login keychain of the owner's Mac, service `ANTHROPIC_API_KEY`. Only `tools/run-evals.mjs` reads it, into the environment of the one eval process. It never prints the value.
- `ANTHROPIC_API_KEY`, CI: the repository secret `ANTHROPIC_API_KEY` for the `evals` workflow. It is not set yet. The owner adds it before the first manual run.
- GitHub auth: the `gh` keyring. The local git config of the clone has a credential helper that runs `gh auth token --user jeredleisey` when git asks. It always uses the `jeredleisey` account, so no token is in a file. Do not replace it with `gh auth git-credential`: that helper uses the active `gh` account, which can be the work account.

## Traps

- The installed cadre in `~/.claude/plugins/cache` is a copy, not this clone. An edit there is lost, and the tests here do not test it. To try local changes, start a session with `claude --plugin-dir <clone>/cadre`.
- Never run `claude plugin marketplace add` on this clone. It points the `jeredleisey` marketplace to the clone, but the user settings pin it to the GitHub source.
- On this machine, `gh` and git can use a work account by default. This repo needs the `jeredleisey` account. After a new clone, set the local `user.name` and `user.email` of the clone, and run `git config core.hooksPath .githooks`.
- The repo is public. Never put a private name, an organization, a home path, or a work email in a file, an issue, a pull request, or a comment. The deny check covers files only.
- An eval run costs money. It leaves `cadre/evals/results/`, which holds home paths and fails the deny check. Delete that folder after you read it. A run kept with `CADRE_EVAL_KEEP=1` can hold secrets, so delete it too.
- Git does not work in the eval sandbox on macOS.
- Run the tests with `node --test` and no folder argument. `node --test tools/` fails on Node 24.

## Live clones

None. No live tool runs from a clone. The installed plugin updates through `/plugin` from the GitHub marketplace after a release tag.
