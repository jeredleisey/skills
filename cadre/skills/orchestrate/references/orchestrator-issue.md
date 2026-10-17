# The orchestrator issue

One orchestrator is one GitHub issue. The issue is the only record of the orchestrator. A compaction, a new session, or a new machine rebuilds from it. Write it for a reader with no context: that reader is you.

In each command below, `<plugin root>` is the folder that holds `skills/` and `scripts/`. It is two folders above the base directory that the harness prints when the skill loads.

## The form

- Title `Orchestrator: <Name>`. The name is unique among open and closed issues.
- Label `cadre:orchestrator`.
- Assignee: the owner. One human owns one orchestrator. Another person makes their own.
- The body has four sections, found by their `##` headings.

```markdown
## Purpose
<one sentence>

## Repos
<each repo and clone that this orchestrator works in>

## Ledger
| Granted by | Action | Repo or host | Scope | When |
| --- | --- | --- | --- | --- |

## Holder
session: <$CLAUDE_CODE_SESSION_ID, or none>
host: <the output of node <plugin root>/scripts/host-id.mjs, or none>
since: <ISO UTC time, or none>
```

- `Granted by` is the GitHub login of the owner. `When` is an ISO date, then `session <id>` or `indefinite`.
- The `host` is a random host id. Never write a device name: the issue can be public.

## Write the body

A body write replaces the whole body. A second writer, or a stale copy of yours, erases the change of the other. So for each write:

1. Read the body: `gh issue view <n> --json body --jq .body`.
2. Change one section. Keep the other sections as you read them.
3. Write it: `gh issue edit <n> --body-file <file>`.
4. Read the body again. If your change is not there, or another section changed, go to step 1.

## New

1. Get a name and a purpose from the human. Search for the name in open and closed issues: `gh issue list --label cadre:orchestrator --state all --limit 200 --json title`. Refuse a title that matches exactly.
2. If `gh label list` lacks `cadre:orchestrator`, run `gh label create cadre:orchestrator`.
3. Create it with `gh issue create --title "Orchestrator: <Name>" --label cadre:orchestrator --assignee @me --body-file <file>`. The ledger is empty. The Holder is this session and this host.
4. Read the issue back. Done when it shows the four sections and the owner as assignee.

## List

Run `gh issue list --label cadre:orchestrator --state open --limit 200 --json number,title,assignees`. Read Purpose and Holder of each. Show one table (Name, Owner, Purpose, Holder) and the choices: resume one, or start a new one. Take no name. Done when the human has the table and the choices.

## Resume

**A resume by a user who is not the assignee refuses.** It does not ask the human. It offers to make a new orchestrator for that user. The reason: the ledger holds the grants of the owner.

1. After a compaction, this conversation already is that orchestrator. Do step 3 and skip steps 4 to 6.
2. Find the issue number, as in New step 1. If there is none, do List and say that the name has no issue.
3. Run `node "<plugin root>/scripts/resume-read.mjs" <n> "$CLAUDE_CODE_SESSION_ID"`. Act on its line:
   - `not-owner login=<l> assignee=<a>`: refuse, as above.
   - `unknown: <reason>`: refuse. Report the reason.
   - `ok ...`: go on. The fields are `holder`, `session`, `checkpoint`, `state`, `bad-rows`, `ended-rows`.
4. Check the holder, from `holder=`:
   - `free`: take the name.
   - `same-host`: run `node "<plugin root>/scripts/holder-check.mjs" <session>`. `free`: take the name. `self`: you hold it. `held`: **refuse and report the pid and folder, because another live session holds the name.** `unknown`: refuse and report the reason.
   - `other-host`: **ask the human before you take the name.** This machine cannot see that session. Say the `session` and `since` values.
5. If `state=closed`, the orchestrator is retired. Ask the human before you resume it, and reopen the issue with `gh issue reopen <n>`.
6. Take the name: write `session`, `host`, and `since` in the Holder ([Write the body](#write-the-body)).
7. Clean the ledger. **A row whose Granted by is not the owner is no grant.** Row 1 is the first row under the header. Delete each row in `bad-rows` and report it. Delete each row in `ended-rows`, because it ended with its session. Delete all of them in one write, so that the numbers stay true.
8. Read the newest checkpoint: `gh api repos/{owner}/{repo}/issues/comments/<checkpoint> --jq .body`. If the field is `none`, there is no checkpoint yet.
9. Check each item of "Next, in order" against the tracker: the issue state, the branch, the pull request. Do not announce that you are back.

Done when you hold the name, the ledger has only grants of the owner, and you know the newest checkpoint.

## Retire

1. Write a final checkpoint with the reason.
2. Set the Holder to `session: none`, `host: none`, `since: none`.
3. Run `gh issue close <n> --comment "Retired: <reason>"`. Done when the issue is closed and the Holder shows `none`.

The name stays reserved. A resume of a closed orchestrator asks the human first.

## Live work

Give each ticket of this orchestrator the label `cadre:work:<name>`. Create the label at the first ticket. The live work is the open issues with that label: `gh issue list --label "cadre:work:<name>" --state open`. A second orchestrator takes no ticket in that list.

## Checkpoints

Write a checkpoint after each merge, each resolved ticket, and each change of plan. It is a new comment: `gh issue comment <n> --body-file <file>`. Never edit an old one. The order of the comments is then the order of the decisions.

```markdown
cadre-checkpoint v1 <ISO UTC time>

## Decisions
- <decision>, <who decided>, <where it is written>

## Waiting for the human
1. <question>

## Next, in order
1. <step>
```

Get the time with `node -e "console.log(new Date().toISOString().slice(0,19)+'Z')"`. A resume reads the newest comment that the owner wrote with the marker line and the latest time. Done when the comment has the marker line and the three sections.
