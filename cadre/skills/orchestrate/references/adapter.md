# The adapter of a repo

The adapter holds the facts of one repo that an orchestrator needs. The skill holds none of them. Put the adapter at `docs/agents/orchestration.md`, and add one line to `AGENTS.md` that points to it.

## The questions

Ask the human each question that the repo cannot answer. Read `AGENTS.md`, `CLAUDE.md`, and the docs first, and ask only about the gaps.

1. Where is the tracker, and which command reaches it?
2. Which files or folders does each orchestrator own? What happens to that ownership when code moves to a new repo?
3. Who may merge, and with which merge method? Who may deploy, and how?
4. Which documentation must follow a change, and who writes it?
5. Which actions does only the human do? For example: a payment, a change of account, a restart of a host, a delete of data.
6. Which secrets exist, where do they live, and how does a command read one without a print?
7. Which traps does this repo or this machine have? For example: a wrong default account, a shared clone that nobody may edit.
8. Which skills does this repo use for a spec, the tickets, the tests, and the review?
9. Which clones does a live tool run from, so that they need an update after a merge?

## Setup check

Check that the `.gitignore` of the repo ignores `.claude/worktrees/`. Helpers work in worktrees at `<repo>/.claude/worktrees/<branch>`, and `claude -w` uses the same place. If the `.gitignore` does not ignore it, the adapter pull request adds the line `.claude/worktrees/`.

## The template

```markdown
# Orchestration

The facts of this repo for an orchestrator. The process is in the skill `orchestrate`.

## Tracker
<where, and the exact command prefix>

## Owners
| Path | Owner | Note |
| --- | --- | --- |

When code moves to another repo, <rule>.

## Merge and deploy
- Merge: <who>, <method>, <when>.
- Deploy: <who>, <command>, <what it backs up first>.

## Documentation
<the rule>

## Only the human
- <action>

## Secrets
<the names of the stores, never the values>

## Traps
- <trap and its fix>

## Skills
<the skills for a spec, the tickets, the tests, and the review>

## Live clones
- <path>: <the tool that runs from it>
```
