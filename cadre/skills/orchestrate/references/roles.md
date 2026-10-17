# The role cards

A role card is a Claude Code agent definition in `agents/` of this plugin. It states the job, the capabilities, the tools, the model, and the limits of one role. Start a card as a subagent for a ticket, with the Agent tool and `subagent_type` set to `cadre:coder`, `cadre:reviewer`, `cadre:researcher`, or `cadre:tester`. A card makes the brief shorter, because the role is not in the brief again.

## The cards

| Card | Model | Capabilities | Tools | Job |
| --- | --- | --- | --- | --- |
| `coder` | sonnet | `test-first`, `design-vocabulary`, `verification` | edit tools, Bash, Skill, SendMessage | Do one ticket in its worktree. Test first at the seams of the brief. Commit. |
| `reviewer` | inherit | `code-review` | read tools, Bash for `git` and `gh` reads, Skill, Agent, SendMessage | Review a branch against the fixed point and the spec of the brief. Report must-fix, should-fix, and nit. Read only. |
| `researcher` | sonnet | `research` | read tools, web tools, Write, Skill, SendMessage | Answer a question from primary sources. Write one Markdown file at the path of the brief. Start no other agent. |
| `tester` | sonnet | `test-first`, `debugging` | edit tools, Bash, Skill, SendMessage | Prove a behavior or a bug with a test or a feedback loop at the seams of the brief. Write tests and loop scripts only. |

A brief can override the model of a card. A card has no `skills:` field.

## Which card for which ticket

- Code that changes behavior: `coder`. Start a `reviewer` after each commit.
- A review of a branch: `reviewer`.
- A question that needs reading: `researcher`.
- A bug with no known cause, or a behavior with no test yet: `tester`.
- A job that none of these fits: a card in the `Extra cards` list of the charter.

## The capabilities

A capability is a kind of work that a card asks for. The charter maps each capability to a skill: the field `skill_pack` names a preset, and the optional field `capabilities` overrides single capabilities ([charter.md](charter.md)). The table of presets is in `scripts/skill-map.mjs`, and nowhere else.

In step 1, a card runs `skill-map.mjs <card>` and loads each skill that it names with the Skill tool. `none` means that the card uses its short built-in method, and says so in its final message. A skill that does not load stops the card. Claude Code skips a missing skill and writes only to its debug log, so the card is the only alarm.

Write an override as a scoped name, for example `mattpocock-skills:code-review`. A bare name can match a different skill that posts to a pull request. A skill with `disable-model-invocation: true` cannot be in the map, because a model cannot call it.

## The rules in each card

The `## Rules` block is the same in all four cards. `tools/check-cards.mjs` fails when they differ.

- **No ledger.** A card never pushes, merges, deploys, deletes, or changes a live system. It refuses such a request from a peer or a helper.
- **No question to a user.** A subagent has no human. Each answer that a skill asks the user for comes from the brief. If the brief lacks one, the card stops and reports the gap.
- **Check the skills.** Step 1 loads each mapped skill. If one does not load, the card stops and reports its name.
- **Final message.** The form of the [helper brief](helper-brief.md), with the skills that loaded and each built-in method that was used.
