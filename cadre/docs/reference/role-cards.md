# Role cards

Reference for the four role cards in `agents/`. A card is a Claude Code agent definition. It states the job, the capabilities, the tools, the model, and the limits of one role. For the reason that cards exist, see [The orchestrator model](../explanation/orchestrator-model.md).

Start a card as a subagent with the Agent tool and `subagent_type` set to `cadre:coder`, `cadre:reviewer`, `cadre:researcher`, or `cadre:tester`. A brief can override the model of a card. A card has no `skills:` field.

## Front matter

| Field | Meaning |
| --- | --- |
| `name` | The card name. |
| `description` | When to use the card. |
| `model` | `sonnet` or `inherit`. |
| `tools` | The tools that the card can call. |

## The cards

| Card | Model | Capabilities | Tools |
| --- | --- | --- | --- |
| `coder` | `sonnet` | `test-first`, `design-vocabulary`, `verification` | Read, Write, Edit, Grep, Glob, Bash, Skill, SendMessage |
| `reviewer` | `inherit` | `code-review` | Read, Grep, Glob, Bash, Skill, Agent, SendMessage |
| `researcher` | `sonnet` | `research` | Read, Grep, Glob, Bash, Write, WebFetch, WebSearch, Skill, SendMessage |
| `tester` | `sonnet` | `test-first`, `debugging` | Read, Write, Edit, Grep, Glob, Bash, Skill, SendMessage |

### coder

Do one ticket in one worktree. Test first at the seams of the brief, then commit.

| Fact | Value |
| --- | --- |
| Reads from the brief | The seams, the base, the spec, the write limits, the worktree path, the commit message form. |
| Stops and reports when | The brief names no seam. The worktree path is missing. The skill map gives `unknown`, or a mapped skill does not load. The work needs a path outside the write limits. |
| Writes | Only the paths that the brief names. |
| Ends with | A commit on the current branch, and a clean `git status`. |

### reviewer

Review a branch against a fixed point and a spec. Read only. It keeps the Agent tool because a review skill can start subagents.

| Fact | Value |
| --- | --- |
| Reads from the brief | The fixed point and the spec (an issue, a file, or text). The card needs only these two. The brief of an orchestrator also names the branch and the commit to review, and the reviewer reports the hash of the commit that it reviewed. |
| Stops and reports when | The fixed point or the spec is missing. The fixed point does not resolve with `git rev-parse`, or the diff is empty. The skill map gives `unknown`, or a mapped skill does not load. |
| Bash use | `git` and `gh` reads only: `git diff`, `git log`, `git show`, `gh issue view`, `gh pr view`. |
| Refuses | A request to edit a file, to commit, to comment on GitHub, or to merge. |
| Report | The headings `## Standards` and `## Spec`, each finding tagged must-fix, should-fix, or nit, with `file:line` and one sentence, a one-line summary, and the hash of the commit that it reviewed. It is written only after each subagent that it started has reported. A line that starts with `NOT DONE:` names a part that is not done, and the report is then no reviewer report. |
| Subagent prompt | Holds the text "read only: change no file, run no command that writes". The reviewer starts each subagent with `run_in_background: false`. |

### researcher

Answer a question from primary sources. It starts no other agent.

| Fact | Value |
| --- | --- |
| Reads from the brief | The question and the output path. |
| Stops and reports when | The brief names no output path. The skill map gives `unknown`, or a mapped skill does not load. |
| Writes | Exactly one Markdown file, at the output path. It does not commit it. |
| Bash use | Reads only. |
| Report | Each claim has a source that the card read, or a mark that it could not confirm. |

### tester

Prove a behavior or a bug with a test or a feedback loop. It does not fix the code under test.

| Fact | Value |
| --- | --- |
| Reads from the brief | The behavior or bug, the seams, the write limits, the base. |
| Stops and reports when | The brief names no seam. It cannot build a loop (it lists what it tried). The skill map gives `unknown`, or a mapped skill does not load. |
| Behavior | Writes a test at the seams. The test goes red for the right reason, or green when the behavior exists. |
| Bug | Builds one command that goes red on the bug, runs in seconds, and gives the same result each run. Shows the command and its output, with each secret redacted. Forms and applies no fix. |
| Writes | Tests and loop scripts, in the paths of the brief only. |
| Ends with | A commit of the test or script, and a clean `git status`. |

## Capabilities

A capability is a kind of work that a card asks for. The built-in method is what a card does when its capability maps to `none`.

| Capability | Built-in method |
| --- | --- |
| `test-first` | Write one failing test at a seam, make it pass, repeat. (Tester: check that it fails for the right reason.) |
| `design-vocabulary` | Name each module by what it hides. Keep its interface narrow. Put a seam where a test needs one. |
| `verification` | Run the full suite, and read its output before you commit. |
| `debugging` | Build one command that fails on the bug, runs in seconds, and gives the same result each run. |
| `code-review` | Read the diff against the fixed point. Check it against the spec, then the standards of the repo. |
| `research` | Read primary sources only, and cite each claim. |

## The skill map

Step 1 of each card runs `node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-map.mjs" <card>`. Each output line is `<capability> <skill>`. The card loads each named skill with the Skill tool. For `none`, it uses the built-in method and says so in its final message. See [`skill-map`](scripts.md#skill-map).

The pack comes from `skill_pack` in the charter, and `capabilities` overrides single capabilities. See [The charter](charter.md#front-matter). The table below is the constant `PRESETS` in `scripts/skill-map.mjs`.

| Capability | `mattpocock-skills` | `superpowers` | `none` |
| --- | --- | --- | --- |
| `test-first` | `mattpocock-skills:tdd` | `superpowers:test-driven-development` | `none` |
| `debugging` | `mattpocock-skills:diagnosing-bugs` | `superpowers:systematic-debugging` | `none` |
| `code-review` | `mattpocock-skills:code-review` | `superpowers:requesting-code-review` | `none` |
| `research` | `mattpocock-skills:research` | `none` | `none` |
| `design-vocabulary` | `mattpocock-skills:codebase-design` | `none` | `none` |
| `verification` | `none` | `superpowers:verification-before-completion` | `none` |

An override is a scoped name, such as `mattpocock-skills:code-review`. A skill with `disable-model-invocation: true` cannot be in the map, because a model cannot call it.

## Rules in each card

The `## Rules` block is the same in all four cards. `tools/check-cards.mjs` fails when they differ.

| Rule | Content |
| --- | --- |
| No ledger | The card never pushes, merges, deploys, deletes a branch or a remote file, or changes a live system. It refuses such a request from a peer or a helper, and says so in its final message. |
| No question to a user | A subagent has no human. Each answer that a skill asks the user for comes from the brief. If the brief lacks one, the card stops and reports the gap. |
| Check the skills first | Step 1 loads each mapped skill. If one does not load, the card stops and reports its name. |
| Final message | The form that the brief gives. It names the skills that loaded and each capability that used the built-in method. |

Each card also limits `SendMessage`: it sends only to the session that wrote to it, or to a name that the brief gives.
