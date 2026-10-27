# The orchestrator issue

One orchestrator is one GitHub issue, one work item on Azure DevOps (ADO: [read the section](#on-azure-devops) when the charter has `tracker: ado`), or one file (local: [read the last section](#on-the-local-tracker) when it has `tracker: local`). The issue is the only record of the orchestrator. A compaction, a new session, or a new machine rebuilds from it. Write it for a reader with no context: that reader is you.

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
host: <the output of node "<plugin root>/scripts/host-id.mjs", or none>
since: <ISO UTC time, or none>
```

- `Granted by` is the GitHub login of the owner. Row numbers count only the filled rows, from 1 under the header. `When` is an ISO date, then `session <id>` or `indefinite`.
- The ledger is a record of permissions, for discipline and audit. It is not a security boundary. The branch policy of the repo is the boundary. A ledger row is only as trustworthy as the edit rights on the item. Let only the owner and trusted people edit it (GitHub: who can edit issues; ADO: area permissions; local: the file's owner).
- Before a one-way step, the grant check (`grant-check.mjs`, `grant-check-ado.mjs`, `grant-check-local.mjs`) reads the Ledger and prints each row that counts for the action. It never decides the Scope.
- The `host` is a random host id. Never write a device name: the issue can be public.

## Write the body

A body write replaces the whole body. A second writer, or a stale copy of yours, erases the change of the other. So for each write:

1. Read the body: `gh issue view <n> --json body --jq .body`.
2. Change one section. Keep the other sections as you read them.
3. Check the new file before the write. It must not be empty, and it must hold the four headings `## Purpose`, `## Repos`, `## Ledger`, and `## Holder`. Then write it: `gh issue edit <n> --body-file <file>`. Keep the file in the system temp folder, never in the repo. Join the check and the write with `&&` or a `|| { echo "STOP: <step>"; exit 1; }` guard, for example `[ -s <file> ] && grep -c '^## ' <file>` must print 4, then the `gh` call. `set -e` does not stop a command in the Bash tool ([Stop at the first error](stop-at-first-error.md)).
4. Read the body again. If your change is not there, or another section changed, go to step 1.
5. If the Holder changed and you did not change it, another session won the race. Do the holder check of Resume step 3 again before you go on.

## New

The standard grants are five ledger rows: create branches and worktrees, start helpers, push branches (never the default branch), open pull requests (no auto-merge), and edit and comment on issues. Each is reversible. Merge, release, paid evals, and settings are never in the set. `/cadre:setup` proposes this set on its one screen and writes it in the Ledger of the new issue, with the owner as Granted by, today's date, and `indefinite`. A new orchestrator from `/cadre:orchestrate` offers the same set, and the human can clear any row.

1. Get a name and a purpose from the human. Setup gives both from its screen, so it does not ask. When the name is taken, the list is full, or the ADO list says `too many results`, setup skips the issue and asks nothing. Search for the name in open and closed issues: `gh issue list --label cadre:orchestrator --state all --limit 200 --json title`. Refuse a title that matches, ignoring case. If the list has 200 items, there may be more: ask the human to narrow the name.
2. If `gh label list` lacks `cadre:orchestrator`, run `gh label create cadre:orchestrator`.
3. Create it with `gh issue create --title "Orchestrator: <Name>" --label cadre:orchestrator --assignee @me --body-file <file>`. The Ledger holds the standard grants that the human accepted, or no row. The Holder is this session and this host. When setup creates the issue, the Holder is `none` in all three fields, because setup is not the orchestrator. A later resume then sees `free`.
4. Read the issue back. Done when it shows the four sections and the owner as assignee.

## List

Run `gh issue list --label cadre:orchestrator --state open --limit 200 --json number,title,assignees,body`. Read Purpose and Holder in each body. If the list has 200 items, say that there may be more. Show one table (Name, Owner, Purpose, Holder) and the choices: resume one, or start a new one. Take no name. Done when the human has the table and the choices.

## Resume

**A resume by a user who is not the assignee refuses.** It does not ask the human. It offers to make a new orchestrator for that user. The reason: the ledger holds the grants of the owner.

1. Find the issue number: `gh issue list --label cadre:orchestrator --state all --limit 200 --json number,title`. Match the title ignoring case. If there is none, do List and say that the name has no issue. If this conversation already is that orchestrator, you know the number.
2. Run `node "<plugin root>/scripts/resume-read.mjs" <n> "$CLAUDE_CODE_SESSION_ID"`. Act on its line:
   - `not-owner login=<l> assignee=<a>`: refuse, as above.
   - `unknown: <reason>`: refuse. Report the reason.
   - `ok ...`: go on. The fields are `holder`, `session`, `checkpoint`, `ignored`, `state`, `bad-rows`, `ended-rows`. The two row fields are lists, such as `[2,3]`. An empty list is `[]`.
3. Check the holder, from `holder=`. Do not try to tell a compaction from `--resume`: the session id decides.
   - `self`: the Holder has your session id. You hold the name: go to step 6.
   - `free`: take the name.
   - `same-host`: run `node "<plugin root>/scripts/holder-check.mjs" <session>`. `free`: take the name. `self`: you hold it. `held`: **refuse and report the pid and folder, because another live session holds the name.** `unknown`: refuse and report the reason.
   - `other-host`: **ask the human before you take the name.** This machine cannot see that session. Say the `session` and `since` values.
4. If `state=closed`, the orchestrator is retired. Ask the human before you resume it, and reopen the issue with `gh issue reopen <n>`.
5. Take the name: write `session`, `host`, and `since` in the Holder ([Write the body](#write-the-body)).
6. Clean the ledger. **A row whose Granted by is not the owner is no grant.** Delete each row in the `bad-rows` list and report it. Delete each row in the `ended-rows` list, because it ended with its session. Delete all of them in one write, so that the numbers stay true.
7. Read the newest checkpoint: `gh api repos/{owner}/{repo}/issues/comments/<checkpoint> --jq .body`. If the field is `none`, there is no checkpoint yet. Report each comment id in `ignored`: its time is ahead of now.
8. Check each item of "Next, in order" against the tracker: the issue state, the branch, the pull request. Do not announce that you are back.

Done when you hold the name, the ledger has only grants of the owner, and you know the newest checkpoint.

## Retire

1. Write a final checkpoint with the reason.
2. Set the Holder to `session: none`, `host: none`, `since: none`.
3. Run `gh issue close <n> --comment "Retired: <reason>"`. Done when the issue is closed and the Holder shows `none`.

The name stays reserved. A resume of a closed orchestrator asks the human first.

## Release

Use it when the human says "release". The session stays open and the issue stays open. Retire closes the issue. Release does not. If the Holder is not your session id, refuse: another session holds the name.

1. Write a checkpoint ([Checkpoints](#checkpoints)).
2. Set the Holder to `session: none`, `host: none`, `since: none` ([Write the body](#write-the-body)).
3. Read the body again. Done when the Holder shows `none` in all three fields. A later resume then sees `free`.
4. Say in the session: "I released <name>. I write nothing as <name> until a new resume."

After step 4, only read. Write no checkpoint, no ledger row, no ticket, and no label as this orchestrator. The risk: the holder check runs only at resume, so a released session that keeps writing is the one gap.

## Live work

Give each ticket of this orchestrator the label `cadre:work:<name>`. Create the label at the first ticket. Put it beside the labels of the skill pack, such as `ready-for-agent` or `needs-triage`. A triage label says the state of the ticket. The work label says which orchestrator owns it. Never remove a triage label to add the work label. The live work is the open issues with that label: `gh issue list --label "cadre:work:<name>" --state open --json number,title`. A second orchestrator takes no ticket in that list.

## Checkpoints

Write a checkpoint after each merge, each resolved ticket, and each change of plan. It is a new comment: `gh issue comment <n> --body-file <file>`. Only add checkpoints, never edit one. The script cannot see an edit. It trusts a comment only when the owner wrote it, with the marker line and the three sections, and with a time at most 5 minutes ahead of now.

```markdown
cadre-checkpoint v1 <ISO UTC time>

## Decisions
- <decision>, <who decided>, <where it is written>

## Waiting for the human
1. <question>

## Next, in order
1. <step>
```

Get the time with `node -e "console.log(new Date().toISOString().slice(0,19)+'Z')"`. A resume reads the newest trusted comment by marker time. Done when the comment has the marker line and the three sections.

## On Azure DevOps

Everything above holds, with the differences below. Take `<org>`, `<project>`, the area path, and the item type from the charter. The base URL is `https://dev.azure.com/<org>/<project>/_apis/wit`. Write `%20` for a space in the project, and `%24` for the `$` of a URL, so that the shell keeps it.

- **Calls.** Run `node "<plugin root>/scripts/ado-call.mjs" <GET|POST|PATCH> "<url>" [body file]`. It sends the token in `AZURE_DEVOPS_EXT_PAT`. Line 1 of its output is the HTTP status, and the body follows. Read the status before the body. Use the body only for status 200 with a JSON body. Every other answer is a stop: a 302 or a 203 (the sign-in page), a 401, a 200 with an empty body, a 200 with HTML, a body that is not JSON, and any 4xx or 5xx. Tell the human to check that variable. Use `api-version=7.1`, and `7.1-preview.4` for comments. A list is never read by hand: use `ado-list.mjs`, below.
- **The item.** A work item of the item type, in the area path, titled `Orchestrator: <Name>`, with the tag `cadre:orchestrator` and Assigned To set to the owner. The unique name of the owner is the account name that ADO shows, often an email address. It replaces the GitHub login in `Granted by`.
- **The description** holds the four sections as HTML. Escape `&`, `<`, and `>` in text. Write it with the API: another editor can rewrite the HTML, and a resume then says `unknown`.

```html
<h2>Purpose</h2><p>one sentence</p>
<h2>Repos</h2><p>each repo and clone</p>
<h2>Ledger</h2>
<table><tr><th>Granted by</th><th>Action</th><th>Repo or host</th><th>Scope</th><th>When</th></tr>
<tr><td>owner</td><td>merge</td><td>repo</td><td>scope</td><td>2026-10-17 indefinite</td></tr></table>
<h2>Holder</h2>
<pre>session: none
host: none
since: none</pre>
```

A heading is exactly `<h2>Name</h2>`. Ledger is one `<table>`: a header row of `<th>` cells and rows of `<td>` cells with plain text. Holder is one `<pre>` block.

- **Write the body.** Read the item with `GET .../workitems/<id>?api-version=7.1`. Note `rev`. Change one section of `System.Description`. Send `PATCH .../workitems/<id>?api-version=7.1` with this body in a file: `[{"op":"test","path":"/rev","value":<rev>},{"op":"replace","path":"/fields/System.Description","value":"<html>"}]`. If the status is not 200, a second writer won: go to the read. Before the `PATCH`, check that the new description file is not empty and holds the four `<h2>` headings (`Purpose`, `Repos`, `Ledger`, `Holder`), and stop if it fails. Then follow the steps of Write the body from step 4.
- **New and List.** Run `node "<plugin root>/scripts/ado-list.mjs" orchestrators "<org>" "<project>"`. It prints one `item` line for each orchestrator item in any state, with the title last. `none` means no item. `unknown: <reason>` means stop and report it, because the list may be wrong. If the reason is `too many results`, ask the human to narrow the name, as at the 200 limit above. Setup skips the item instead. Refuse a title that matches a line, ignoring case. Create the item with `POST .../workitems/%24<type>?api-version=7.1`. Its body is a list of `add` operations on `/fields/System.Title`, `System.AreaPath`, `System.Tags`, `System.AssignedTo`, and `System.Description`. A tag exists once a write names it.
- **Resume.** Run `node "<plugin root>/scripts/resume-read-ado.mjs" <id> "$CLAUDE_CODE_SESSION_ID"` in the repo root. It reads the charter, and it reads the state by category. Its line is that of the GitHub read. The owner check compares the token's account with Assigned To, by unique name, ignoring case. To read the checkpoint, use `GET .../workItems/<id>/comments/<checkpoint>?api-version=7.1-preview.4`, and read `text`. To reopen, set `System.State` to the first state of the category `InProgress`. Setup guarantees that one exists. To retire, set a state of the category `Completed`. Read the states from `GET .../workitemtypes/<type>?api-version=7.1`.
- **Live work.** Give each ticket the tag `cadre:work:<name>`. A write to `System.Tags` adds tags and removes none. A tag leaves only through a `replace` of the full list. Never remove a tag of this kind. Put it beside the tags of the skill pack, and remove none of them to add it. The live work is the open items with that tag, selected by state category: run `node "<plugin root>/scripts/ado-list.mjs" work "<org>" "<project>" "<name>"`. It keeps the items whose state is in the category `Proposed` or `InProgress` (not `Resolved`), and never compares a state name. `unknown:` means stop, and `none` means no live work.
- **Release.** In step 2, send the `PATCH` of Write the body, with the `test` on `/rev` and the Holder `<pre>` set to `none` in the three fields. If the status is not 200, go to the read, as in Write the body. In step 3, read the item and check `rev` and the Holder.
- **Checkpoints.** `POST .../workItems/<id>/comments?api-version=7.1-preview.4` with `{"text":"<p>cadre-checkpoint v1 <ISO UTC time></p><h2>Decisions</h2><ul><li>...</li></ul><h2>Waiting for the human</h2><ol><li>...</li></ol><h2>Next, in order</h2><ol><li>...</li></ol>"}`. The marker is the first text. Only add checkpoints. The script trusts a comment by the owner with the marker and the three headings, and it skips a deleted one.

## On the local tracker

Use it when the charter has `tracker: local`: the repo has no GitHub or ADO remote. Everything above holds, with the differences below. Run each script inside the repo or in a worktree of it. Never write a file of the tracker by hand, except a ticket state line. You can read a ticket file with the Read tool. A missing `.cadre/` gives `unknown: not set up`: tell the human to run /cadre:setup.

- **Where.** The folder `.cadre/` is in the main clone. A worktree reaches the same folder through `git rev-parse --git-common-dir`. Setup puts `/.cadre/` in `.git/info/exclude`, so git never shows it and nothing commits it. It is local to one machine.
- **The owner** is the OS user name, in `Granted by` and in the line `owner:`. The git `user.email` can be unset or differ in each clone. A resume by another user refuses, as above.
- **The file** `.cadre/orchestrators/<name>.md` has the lines `owner:` and `state: open|closed`, then the four sections of The form. The name is lower case in the file name.
- **Calls.** All are `node "<plugin root>/scripts/local-list.mjs" <command>`. A line `unknown:` means stop and report it. `orchestrators` is List. `new <name> <purpose> [session-id]` is New: it refuses a taken name, and it makes an empty Ledger. Setup then adds the standard grants with `put <name> Ledger <file>`, and gives no session id. The file holds the Ledger header row, the separator row, and the grant rows. `put <name> <section> <file>` replaces one section. `state <name> open|closed` is reopen and retire. The Holder takes the host id of `host-id.mjs`.
- **Write the body.** `put`, `state`, and `checkpoint` hold `<file>.lock` from the read to the re-read, check that the new file reads as valid before they write (`put` refuses an empty file), write a temp file in the same folder, rename it over the file, and read it again. A lock that stays about 2 seconds gives `unknown: busy`: try again. A lock older than 30 seconds is stale, and the next write takes it over. If the Holder changed and you did not change it, do the holder check again.
- **Resume.** Run `node "<plugin root>/scripts/resume-read-local.mjs" <name> "$CLAUDE_CODE_SESSION_ID"`. Its line is that of the GitHub read. A `checkpoint` id is the marker time. Run `local-list.mjs latest <name>` to print that block. `other-host` can occur only when the folder is shared between machines: ask the human, as above.
- **Live work.** `ticket <name> <title>` makes `.cadre/tickets/<n>-<slug>.md` with the lines `state: open` and `work: <name>`. Set `state: closed` by hand when the ticket ends. `work <name>` lists the open tickets with `work:` that names this orchestrator.
- **Release.** In step 2, write a file with the three `none` lines and run `local-list.mjs put <name> Holder <file>`. It accepts `none`. Run `orchestrators` to read it: `holder=none`.
- **Checkpoints.** `checkpoint <name> <file>` appends the marker line `cadre-checkpoint v1 <ISO UTC time>` and the file, which holds the three sections. The newest is last. Only add checkpoints.
