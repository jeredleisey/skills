# The orchestrator item

Reference for the tracker item that holds one orchestrator. The item is the only record of the orchestrator. For the reason, see [The tracker is the record](../explanation/tracker-is-the-record.md).

The charter field `tracker` picks the form: absent for a GitHub issue, `ado` for an ADO work item, `local` for a file. See [The charter](charter.md).

## Forms

| Fact | GitHub | Azure DevOps | Local |
| --- | --- | --- | --- |
| Item | Issue | Work item of the item type in the charter | File `.cadre/orchestrators/<name>.md` in the main clone |
| Title | `Orchestrator: <Name>` | `Orchestrator: <Name>` | First line `# Orchestrator: <name>` |
| Name unique among | Open and closed issues | Items in any state (`ado-list orchestrators`) | Files of the folder (the file name is the slug) |
| Marker | Label `cadre:orchestrator` | Tag `cadre:orchestrator` | The folder |
| Owner | The one assignee | Assigned To, by unique name | The line `owner: <OS user name>` |
| Body | Markdown, sections by `##` heading | HTML description, sections by `<h2>` | Markdown, sections by `##` heading |
| State | Open or closed | State category: `Completed` or `Removed` is closed | The line `state: open` or `state: closed` |
| Checkpoint | A comment | A comment | Text appended at the end of the file |
| Read by | [`resume-read`](scripts.md#resume-read) | [`resume-read-ado`](scripts.md#resume-read-ado) | [`resume-read-local`](scripts.md#resume-read-local) |
| List by | `gh issue list` | [`ado-list`](scripts.md#ado-list) | [`local-list`](scripts.md#local-list) |

One human owns one orchestrator. The Granted by cell of each ledger row is the owner: the GitHub login, the ADO unique name (often an email address), or the OS user name.

A ledger row is only as trustworthy as the edit rights on the item. Let only the owner and trusted people edit it (GitHub: who can edit issues; ADO: area permissions; local: the file's owner).

## Sections

The body has four sections, found by their headings. A heading twice, a heading in a code fence, or a code fence that is not closed makes the item `unknown`.

| Section | Content |
| --- | --- |
| Purpose | One sentence. |
| Repos | Each repo and clone that the orchestrator works in. |
| Ledger | A table of the permissions that the human gave. |
| Holder | Three lines: `session`, `host`, `since`. |

### Ledger

The header row must be, ignoring case: `Granted by | Action | Repo or host | Scope | When`. A separator row and an empty row are skipped.

| Column | Content |
| --- | --- |
| Granted by | The owner. |
| Action | The step that the human allowed. |
| Repo or host | Where. |
| Scope | How far. |
| When | An ISO date, then `session <id>` or `indefinite`. |

Row numbers count the filled rows, from 1 under the header. Audit, done by each resume script:

- A row is bad when it does not have 5 cells, or its Granted by is not the owner (compared ignoring case). It is listed in `bad-rows`, as in `bad-rows=[2,3]`.
- A row has ended when its When holds `session <id>` with an id other than the id of the asking session. It is listed in `ended-rows`, as in `ended-rows=[6]`. With no asking session, each such row ended.

Before a one-way step, the [grant check](scripts.md#grant-check) reads the Ledger with the same audit and prints each row that counts for the action.

### Holder

| Line | Value |
| --- | --- |
| `session` | `$CLAUDE_CODE_SESSION_ID`, or `none`. A session id is a UUID. |
| `host` | The output of [`host-id`](scripts.md#host-id) (32 lower case hex characters), or `none`. |
| `since` | An ISO UTC time with no space, or `none`. The line can be absent when read. |

The reader accepts a leading `-` or `*`, and the value in backticks. The key is read ignoring case. A line that is not one of the three, a bad value, or a key twice makes the item `unknown`. A Holder with no `session` or no `host` also does.

The host is a random id. A device name is never written, because the issue can be public.

The result of the Holder check is the `holder` field of the resume line. See [`resume-read`](scripts.md#resume-read).

## Checkpoint

A checkpoint records decisions, what waits for the human, and the next steps. It is added, never edited.

```markdown
cadre-checkpoint v1 <ISO UTC time>

## Decisions
- <decision>, <who decided>, <where it is written>

## Waiting for the human
1. <question>

## Next, in order
1. <step>
```

| Part | Rule |
| --- | --- |
| Marker line | `cadre-checkpoint v1 <time>`. The time is `YYYY-MM-DDTHH:MM:SSZ`, with optional fractions of a second. On GitHub it is the first line of the comment. On ADO it is the first text of the comment, in a `<p>` or `<div>` or bare. |
| Sections | `Decisions`, `Waiting for the human`, and `Next, in order`, each as a heading. Compared ignoring case. In an ADO comment, an `<h2>` or a `##` line. |
| Author | The owner. A GitHub comment is by the login of the owner. An ADO comment is by the unique name of the owner. A local file has no author check. |
| Time | At most 5 minutes ahead of now. A later one is ignored, and its id is listed in `ignored`. |

Selection: the trusted comment with the latest marker time wins. On a tie, the later one wins. A deleted ADO comment does not count.

The checkpoint id is the comment id on GitHub and ADO, and the marker time in a local file.

### Local checkpoints

A local file ends with its checkpoints. A checkpoint starts at a line `cadre-checkpoint v1 ...` outside a code fence. `local-list checkpoint` appends the marker line and the content. The newest is last.

## Azure DevOps item

| Fact | Value |
| --- | --- |
| Fields written at creation | `System.Title`, `System.AreaPath`, `System.Tags`, `System.AssignedTo`, `System.Description` |
| Description | HTML with the four sections. |
| Heading | Exactly `<h2>Name</h2>`. |
| Ledger | One `<table>`. A header row of `<th>` cells. Rows of `<td>` cells with plain text. No other markup. |
| Holder | One `<pre>` block with the three lines. |
| Escapes | `&`, `<`, and `>` in text. |
| Comments API | `api-version=7.1-preview.4` |
| Other calls | `api-version=7.1` |
| Write of the description | A `PATCH` with `test` on `/rev` and `replace` on `/fields/System.Description`. A status other than 200 means a second writer won. |
| Closed | State category `Completed` or `Removed`. |
| Open | State category `Proposed`, `InProgress`, or `Resolved`. |
| Reopen | Set `System.State` to the first state of the category `InProgress`. |
| Retire | Set a state of the category `Completed`. |

A write to `System.Tags` adds tags and removes none. A tag leaves only through a `replace` of the full list.

Calls go through [`ado-call`](scripts.md#ado-call).

## Local file

```markdown
# Orchestrator: <name>
owner: <user>
state: open

## Purpose
<text>

## Repos

## Ledger
| Granted by | Action | Repo or host | Scope | When |
| --- | --- | --- | --- | --- |

## Holder
session: none
host: none
since: none

cadre-checkpoint v1 <ISO UTC time>

## Decisions
...
```

| Fact | Value |
| --- | --- |
| Folder | `.cadre/` in the main clone. A worktree reaches it through `git rev-parse --git-common-dir`. |
| Git | `/.cadre/` is in `.git/info/exclude`. Nothing commits it. |
| Orchestrator files | `.cadre/orchestrators/<slug>.md` |
| Slug | Lower case. Each run of characters outside `a-z0-9` becomes `-`. No leading or trailing `-`. |
| Head lines | `owner:` and `state:`, each once, before the first heading. `state` is `open` or `closed`. |
| Required sections | Purpose, Repos, Ledger, Holder |
| Ticket files | `.cadre/tickets/<n>-<slug>.md` |
| Lock | `<file>.lock` during a write. About 2 seconds of wait, then `unknown: busy`. Stale after 30 seconds. |

## Live work

The live work of an orchestrator is its open tickets. A second orchestrator takes no ticket in that list.

| Tracker | Mark on a ticket | Open means | Listed by |
| --- | --- | --- | --- |
| GitHub | Label `cadre:work:<name>` | The issue is open | `gh issue list --label "cadre:work:<name>" --state open` |
| ADO | Tag `cadre:work:<name>` | State category `Proposed` or `InProgress`. Not `Resolved`. A state name is never compared. | [`ado-list work`](scripts.md#ado-list) |
| Local | Line `work: <orchestrator>` | The line `state: open` | [`local-list work`](scripts.md#local-list) |

A local ticket file has the lines `# <title>`, `state: open` or `closed`, and `work: <orchestrator>`. A file in `tickets/` without them makes `work` give `unknown`.
