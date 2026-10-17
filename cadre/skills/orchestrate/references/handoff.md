# The handoff note and the resume

A compaction or a new session keeps your role but loses your newer decisions. The handoff note keeps them. Write it for a reader with no context: that reader is you after a compaction.

## Where it lives

In the memory folder of the project, if the harness has one, as `orchestrator-handoff-<name>.md` with the name in lowercase, and with a pointer in the memory index. If the harness has no memory, use a local notes folder that git ignores. Each note in that folder is one entry of the roster ([roster.md](roster.md)).

Keep the ledger of permissions in the same note.

## The template

```markdown
---
name: orchestrator-handoff-<name>
description: <Name>: <the purpose of this orchestrator, in one sentence>
metadata:
  type: project
  orchestrator: <Name>
  session: <the id of the session that last wrote this note, for example $CLAUDE_CODE_SESSION_ID>
  host: <the host of that session, the output of node ${CLAUDE_PLUGIN_ROOT}/scripts/host-id.mjs>
  status: active        # active | retired
---

# Handoff: <your name>

Written <date and time>. Check each item against the tracker before you act on it.

## Who I am
<name, session name, repos and clones>

## Roles
<each orchestrator and helper, and what each owns>

## Ledger
| Granted by | Action | Repo or host | Scope | When |
| --- | --- | --- | --- | --- |

## In progress
- <ticket>: <state>, <branch or worktree>, <what waits>

## Decisions since the spec
- <decision>, <who made it>, <where it is written>

## Waiting for the human
1. <question>

## Next, in order
1. <step>
```

## The resume steps

1. Read the handoff note and the adapter.
2. Check each item of "In progress" against the tracker: the state of the issue, the branch, the pull request.
3. Check the ledger. Remove each grant that ended with its session.
4. Contact a peer only when your work needs it. Do not announce that you are back.
