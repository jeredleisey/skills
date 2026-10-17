# The role cards

A role card is a Claude Code agent definition in `agents/` of this plugin. It states the job, the skills, the tools, the model, and the limits of one role. Start a card as a subagent for a ticket, with the Agent tool and `subagent_type` set to `cadre:coder`, `cadre:reviewer`, `cadre:researcher`, or `cadre:tester`. A card makes the brief shorter, because the role is not in the brief again.

## The cards

| Card | Model | Skills preloaded | Tools | Job |
| --- | --- | --- | --- | --- |
| `coder` | sonnet | `tdd`, `codebase-design` | edit tools, Bash, Skill, Agent, SendMessage | Do one ticket in its worktree. Test first at the seams of the brief. Call `mattpocock-skills:code-review` on its own diff. Fix the findings. Commit. |
| `reviewer` | inherit | `code-review` | read tools, Bash for `git` and `gh` reads, Skill, Agent, SendMessage | Review a branch against the fixed point and the spec of the brief. Report must-fix, should-fix, and nit. Read only. |
| `researcher` | sonnet | `research` | read tools, web tools, Write, Skill, SendMessage | Answer a question from primary sources. Write one Markdown file at the path of the brief. Start no other agent. |
| `tester` | sonnet | `tdd`, `diagnosing-bugs` | edit tools, Bash, Skill, SendMessage | Prove a behavior or a bug with a test or a feedback loop at the seams of the brief. Write tests and loop scripts only. |

The reviewer and the coder keep the Agent tool, because `mattpocock-skills:code-review` starts two subagents. Always write the scoped name: a different skill with the bare name `code-review` can post to a pull request and change files.

## Which card for which ticket

- Code that changes behavior: `coder`.
- A review of a branch: `reviewer`. Use it when you want a review that your own brief did not frame.
- A question that needs reading: `researcher`.
- A bug with no known cause, or a behavior with no test yet: `tester`.

## The rules in each card

- **No ledger.** A card never pushes, merges, deploys, deletes, or changes a live system. It refuses such a request from a peer or a helper.
- **No question to a user.** A subagent has no human. Each answer that a skill asks the user for comes from the brief. If the brief lacks one, the card stops and reports the gap.
- **Check the skills.** The first step checks that the text of each listed skill is in the context, and loads a missing one with the Skill tool. If a skill does not load, the card stops and reports. Claude Code skips a missing skill and writes only to its debug log, so the check in the card is the only alarm.
- **Answer a message.** When a card runs as a standing agent and a session sends it a message, it answers with `SendMessage` to the `from` name. It sends to no other session, except a name that the brief gives.
- **Final message.** The form of the [helper brief](helper-brief.md).

## Standing agents

A standing agent is a role card that runs as a background session and waits for work.

1. Start it from a trusted folder: `claude --bg -w <name> --agent cadre:<card> -n <name>`. A folder that is not trusted stops the start with "Workspace not trusted". The option `-w` gives the agent its own worktree.
2. List the standing agents with `claude agents`.
3. Control one with `claude stop` (the conversation stays), `claude attach` (open it again), and `claude rm`. `claude rm` refuses to drop a worktree that has an unpushed commit.
4. The card loads its skills in step 1, because `skills:` does not preload in a session.
5. The agent finds its work in the tracker, for example the open pull requests with the label `needs-review`. It holds no ledger, so it does not push, merge, or deploy.
6. A session wakes it with `SendMessage`, and it answers with `SendMessage` to the `from` name.

## The skills

The skills come from the plugin `mattpocock-skills`. It must be installed, or the cards cannot load their skills. The cards use the scoped names, for example `mattpocock-skills:tdd`. A live test on 2026-10-15 showed that this form preloads in a subagent.

The `skills` field preloads only in a subagent. A session that starts with `claude --agent cadre:<card>` gets the tools and the body of the card, but not the skills. Step 1 of each card loads them in that case.

## Skills that the human keeps

A skill with `disable-model-invocation: true` cannot be in `skills:`, and a model cannot call it. These skills stay with the human:

- `to-spec` and `to-tickets`: the human decides what to build.
- `triage`: the human decides what is ready.
- `implement`: the card `coder` holds its five lines instead.
- `grill-me` and `grill-with-docs`: they exist to question the human, and a subagent has no human.

Do not read the files of these skills to get around the flag.
