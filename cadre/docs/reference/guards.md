# Guards

Reference for the hooks that guard the one-way steps of git and GitHub. For the reason that a guard asks and does not deny, see [Guards ask and deny](../explanation/guards-ask-and-deny.md).

## Hooks

The hooks are in `hooks/hooks.json`. Each runs `node` on a script in `${CLAUDE_PLUGIN_ROOT}/scripts/`, with a timeout of 10 seconds.

| Event | Matcher | Filter (`if`) | Script and argument | On failure |
| --- | --- | --- | --- | --- |
| `PreToolUse` | `Bash` | `Bash(*git*)` | `guard.mjs push` | `block` |
| `PreToolUse` | `Bash` | `Bash(*gh*)` | `guard.mjs merge` | `block` |
| `PreToolUse` | `Bash` | `Bash(*az*)` | `guard.mjs merge` | `block` |
| `TaskCompleted` | none | none | `task-completed.mjs` | none set |

The hook input is JSON on stdin.

## The two guards

### push

Matches a `git push` that does one of these:

| Match | Examples |
| --- | --- |
| A push to the default branch | `git push origin main`, `git push origin HEAD:main` |
| A push of the current branch when it is, or may be, the default branch | `git push`, `git push origin` on `main`, or on a detached HEAD |
| A force push | `--force`, `-f`, `--force-with-lease`, `--force-if-includes`, a refspec that starts with `+` |
| A delete of a remote branch | `--delete`, `-d`, a refspec `:<branch>` |
| A push of all branches | `--all`, `--branches`, `--mirror`, `--prune` |
| A `send-pack` | `git send-pack` |
| A git setting that changes a push, in a command whose text holds `push` | `-c alias.*`, `-c remote.<name>.push`, `-c push.default`, and `git config` with those keys |
| A command that the guard cannot read | See [Unreadable commands](#unreadable-commands). |

A push that does not match passes with no prompt. These pass: a push of an ordinary branch, `--tags` alone, and a command with `--help` or `-h`. `--follow-tags` does not pass by itself: it pushes the branch too.

The guard reads `git -C <dir>`, `--git-dir`, `--work-tree`, and `cd`. It accepts a unique prefix of a long option, as git does. A prefix that fits more than one option is unreadable.

**Default branch names.** These count, with no network call:

- `main`, `master`, `dev`, `develop`, `trunk`.
- `CADRE_DEFAULT_BRANCH`. When it is set, the remote HEAD is not read.
- The branch in `refs/remotes/<remote>/HEAD`, for the remote of the push and for `origin`, only when `CADRE_DEFAULT_BRANCH` is not set.
- `init.defaultBranch`.
- The remote HEAD of the remote of the current branch.

### merge

Matches:

| Match | Notes |
| --- | --- |
| `gh pr merge`, with or without `--auto`, `--squash`, `--rebase`, `--merge`, `--admin` | `gh pr merge --disable-auto` alone passes. With a merge flag it does not. `-R`, `--repo`, and `--hostname` are skipped as options. |
| `az repos pr update` with `--status completed` | The value is read ignoring case. |
| `az repos pr update` or `az repos pr create` with `--auto-complete` | A bare flag, `true`, or any value other than `false`, `no`, `n`, `f`, `0` matches. |
| A command that the guard cannot read | See [Unreadable commands](#unreadable-commands). |

`--help` and `-h` pass. The guard accepts a unique prefix of `--status` (from 4 characters) and of `--auto-complete` (from 4 characters), as `az` does.

### Unreadable commands

The scanner reads quotes, `$( )`, backticks, comments, heredocs, redirections, and a backslash-newline. It opens these wrappers: `sudo`, `doas`, `env`, `nice`, `ionice`, `nohup`, `time`, `command`, `exec`, `timeout`, `watch`, `stdbuf`, `setsid`, `caffeinate`, `busybox`, `xargs`, `ssh`, `find -exec`, `eval`, and a shell with `-c` (`bash`, `sh`, `zsh`, `dash`, or `ksh`). It follows `cd`.

Some unreadable commands always match:

- A variable as the subcommand of `git`, `gh`, or `az`. For `gh`, a variable as the word after `pr` also counts. For `az`, a variable as the group, or as the word after `repos` or `repos pr`, also counts.
- `eval` with a variable in its words.
- `git push` or `gh pr merge` through `xargs`, because `xargs` adds arguments that the guard cannot see.

A variable as the command word is weaker. That command matches only when its text holds the word `push` or `merge`, or an `az` pull request update or create with a completion.

An unreadable entry of the kind `?` matches on its words only. The words must hold `git push`, `gh pr merge`, or an `az` pull request update or create with a completion. The text test applies to the entries above, not to this kind.

These cases are parses of a readable `git push`, not text matches:

- An option that the guard cannot tell from another always matches.
- A refspec with a glob or a variable matches only after the remote, or with `--repo`.
- A `-C` target that is a variable, or a working folder that the guard cannot tell, matches when the push has no refspec, and when the destination of a refspec is `HEAD` or `@`, because the guard cannot name the current branch. So `git -C $x push origin HEAD` and `git -C $x push origin feature:HEAD` match, `HEAD:feature` passes, and `git -C $x push origin feature` passes. A `--tags` push with no refspec passes.

## Decision

The hook answers in one of four ways.

| Result | Output | Exit | When |
| --- | --- | --- | --- |
| Pass | Nothing | 0 | The command is not guarded, or the charter allows it for the orchestrator. |
| Ask | `permissionDecision: ask` with a reason | 0 | The orchestrator needs the word of the human. |
| Deny | `permissionDecision: deny` with a reason | 0 | A helper made the call. |
| Block | A reason on stderr | 2 | The hook faults. See [Failure](#failure). |

The JSON is `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"<ask|deny>","permissionDecisionReason":"<text>"}}`.

### The helper

The hook input of a helper has the key `agent_id` or the key `agent_type`. A key that is present counts, even when it is empty or null. A hook input with neither key is the orchestrator.

A helper is always denied a matching command. The reason is: `A helper never pushes or merges. This is <reason>. Tell the orchestrator.` Nothing lifts this: not the charter, not the personal file.

### The orchestrator

For a match, the guard reads the charter and the personal file. The command passes only when both hold:

1. The guard is open: the charter has `guards: off`, or `allow` lists this guard.
2. The personal file does not force it on: no `{"guards": "on"}`, and no `deny` entry for this guard.

Else the result is ask, with the reason `The <guard> guard asks for your word: <reason>.`

## How the guard reads the charter

- The guard reads `docs/agents/cadre-charter.md` from a commit, with `git show origin/<name>:<path>`, never from the working tree. A helper cannot edit the file to switch a guard off.
- It tests each candidate default branch that exists as a remote ref `refs/remotes/origin/<name>`. The candidates are `CADRE_DEFAULT_BRANCH` or the `origin/HEAD` branch, `init.defaultBranch`, `main`, `master`, `dev`, `develop`, and `trunk`.
- The strictest result wins. `guards: off` counts only when each candidate says it. `allow` is the intersection of the lists.
- A candidate with no charter gives guards on. So does no candidate, and any fault.

| Charter field | Effect |
| --- | --- |
| `guards: off` | Both guards pass for the orchestrator. |
| `allow: [push]` | The push guard passes for the orchestrator. |
| `allow: [merge]` | The merge guard passes for the orchestrator. |
| Absent | Both guards ask. |

## The personal file

Path: `guards.json` in `CADRE_HOME`, or `~/.cadre`. It can only add.

| Content | Effect |
| --- | --- |
| `{"guards": "on"}` | Both guards ask the orchestrator, whatever the charter says. |
| `{"deny": ["merge"]}` | The listed guards ask the orchestrator. Entries that are not strings are skipped. |

It never turns a guard off. A file that is missing, not JSON, or not an object adds nothing. An unknown key adds nothing.

## Failure

The hook blocks the command with exit code 2 and the stderr text `cadre guard blocks this command, because the guard failed: <reason>` when:

- The guard argument is not `push` or `merge`.
- The hook input is not JSON, or not an object.
- `tool_input.command` is not a string.
- The command holds a NUL byte.
- The commands nest more than 4 levels deep (`bash -c`, `eval`, `ssh`).

A fault while the guard reads the charter or the personal file does not block. The charter fault gives guards on. The personal file fault adds nothing. A `git` call that fails or takes more than 5 seconds gives no answer. For a push with no target, no answer counts as a match.

`CADRE_GIT_CMD` (test-only) replaces the `git` program.

## TaskCompleted hook

`task-completed.mjs` makes sure that, with agent teams on, only the lead completes a task, after it verifies.

| Condition | Result |
| --- | --- |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is not `1`, `true`, `yes`, or `on` (any case) | Nothing, exit 0. |
| Teams are on, and the input has neither `agent_id` nor `teammate_name` | Nothing, exit 0. This is the lead. |
| Teams are on, and the input has `agent_id` or `teammate_name` | Exit 2. Stderr: `Only the lead completes a task, after it verifies. Report the result to the lead.` |
| Teams are on, and the input is not JSON or not an object, or the hook faults | Exit 2. Stderr: `cadre blocks this completion, because the hook failed: <reason>`. |

A field that is present counts, even when empty or null. `agent_type` is not used here, because a lead that runs with `--agent` has it. The hook cannot tell a `TaskUpdate` completion from a teammate that ends its turn with tasks in progress, so it blocks both. The `onFailure` setting has no effect on this event, so the script catches each fault itself.

## Not covered

The hooks stop a slip. They are not a lock. The hooks do not cover:

- The PowerShell tool on Windows. The hooks guard the Bash tool only.
- Interpreters, such as `python3 -c`.
- Merges through `gh api`.
- Shell aliases.
- A script on disk.
- Any step that is not a `git push`, a `gh pr merge`, or an `az repos pr` completion. A deploy, a delete of a file, and a message to a person have no hook.

The branch policy of the repo is the guard that holds. `/cadre:setup` reports it with [`branch-policy`](scripts.md#branch-policy) or [`branch-policy-ado`](scripts.md#branch-policy-ado), and names each gap.
