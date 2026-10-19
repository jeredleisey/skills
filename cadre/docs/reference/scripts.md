# Scripts

Reference for the scripts in `cadre/scripts/`. Each section is one script that a skill, a role card, or a person runs. For why the scripts exist, see [The tracker is the record](../explanation/tracker-is-the-record.md).

## Conventions

- Run a script as `node "<plugin root>/scripts/<name>.mjs" <arguments>`. `<plugin root>` is the folder that holds `skills/` and `scripts/`.
- Node 22 or later is required.
- A script prints its result on stdout and exits.
- Exit code 0 is a result. Exit code 1 is a refusal, a stop, or a plain result that is not a pass. Examples are `free`, `missing`, and the `none` of a grant check. Exit code 2 is `unknown: <reason>` on stdout. Exit code 2 can also come with a reason on stderr. `ado-call` writes `ado-call: ...`. A script that prints through `out` also writes a reason when the reader of stdout takes no data for 10 seconds. The hooks `guard` and `task-completed` exit 2 with a reason on stderr. This blocks the call. The section of each hook gives its codes. Exit code 3 is `self` of `holder-check` only. Exit code 64 is wrong arguments, with a usage message on stderr. Only a script that takes arguments and checks them exits 64. `charter-check`, `preset-discover`, `skill-map`, `host-id`, `branch-policy`, and `teams-setting` never exit 64. `skill-map` with no card gives `unknown: no card given`, exit 2. If a script that prints through `out` fails to write to stdout with an error other than a full pipe or a closed pipe, Node exits 1 with a stack trace. Each section gives the codes of its script. A script uses only those codes.
- Each list of `unknown` reasons gives the common ones. Most other faults also print `unknown: <reason>` with exit 2. A few uncaught faults exit 1 with a stack trace, as the sections say.
- `unknown:` is never a pass. Treat it as a refusal.
- `ado-policy-scope.mjs` is a shared module, not a command. `branch-policy-ado` and `setup-derive` import it to find the policies that cover the default branch.
- The scripts use internal modules: `out`, `ado`, `resume-core`, `local-store`, `shell-words`, and `charter-front-matter`. `guard` alone uses `shell-words`. `charter-check`, `skill-map`, `guard`, `resume-read-ado`, and `grant-check-ado` use `charter-front-matter`. They are not user-facing and have no section here.
- `ado-fake.mjs` and `task-completed-throw.cjs` are test stand-ins. No skill or hook runs them.

Environment variables marked **test-only** replace a program or a source so that a test can read a fixture. Do not set them in use.

| Variable | Kind | Used by |
| --- | --- | --- |
| `CADRE_HOME` | user | `host-id`, each `resume-read` script and `local-list` (through the host id), `guard` (personal file) |
| `CLAUDE_PID` | user | `holder-check` |
| `CADRE_DEFAULT_BRANCH` | user | `guard` |
| `AZURE_DEVOPS_EXT_PAT` | user | `ado-call` and each script that calls ADO |
| `CLAUDE_CONFIG_DIR` | user | `teams-setting`, `setup-derive` |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | user | `task-completed` (the hook works when it is `1`, `true`, `yes`, or `on`), `teams-setting` (sets it) |
| `CADRE_SCHEMA` | test-only | `charter-check` |
| `CADRE_NODE_CMD` | test-only | `setup-check` |
| `CADRE_GH_CMD` | test-only | `setup-check`, `resume-read`, `grant-check`, `branch-policy`, `setup-derive` |
| `CADRE_ADO_CMD` | test-only | `setup-check`, `setup-derive`, and each ADO script |
| `CADRE_PLUGIN_LIST_CMD` | test-only | `preset-discover` |
| `CADRE_RANDOM_CMD` | test-only | `host-id` |
| `CLAUDE_AGENTS_JSON_CMD`, `CADRE_PROCESS_CMD` | test-only | `holder-check` |
| `CADRE_ADO_ALLOW_LOCAL` | test-only | `ado-call` |
| `CADRE_GIT_CMD` | test-only | `teams-setting`, `guard` |
| `CADRE_LOCAL_USER` | test-only | `local-list`, `resume-read-local`, `grant-check-local` |

## charter-check

Compare the charter of a repo with this plugin.

```
node charter-check.mjs [repo-root]
node charter-check.mjs --schema
```

| Argument | Meaning |
| --- | --- |
| `repo-root` | The repo. The default is the current folder. |
| `--schema` | Print the schema number of the plugin and exit 0. |

The script reads `docs/agents/cadre-charter.md` and the version in `.claude-plugin/plugin.json`. It reads only `charter_schema` and `written_by`. See [The charter](charter.md).

Environment: `CADRE_SCHEMA` (test-only): a positive integer that replaces the schema of the plugin. A value that is not a positive integer gives `unknown: CADRE_SCHEMA is not a positive integer`.

| Output | Exit | Meaning |
| --- | --- | --- |
| `ok` | 0 | Same schema, and the charter is not older than the plugin. |
| `older-cadre` | 0 | Same schema, written by an older cadre version. Continue with a note. |
| `missing` | 1 | The repo has no charter file. |
| `stale <old> <new>` | 1 | The charter schema is lower than the plugin schema. |
| `plugin-too-old` | 1 | The charter schema is higher than the plugin schema. |
| `unknown: <reason>` | 2 | The check cannot tell. |
| `<number>` | 0 | With `--schema` only. A bad `CADRE_SCHEMA` gives `unknown:` and exit 2 first, also with `--schema`. |

`unknown` reasons include: no front matter on line 1, no closing `---`, a top-level line that is not `key: value`, a repeated or missing field, a `charter_schema` that is not a positive integer, a `written_by` that is not `cadre <version>`, and a plugin version that cannot be read.

## setup-check

The checks that `/cadre:setup` runs before it asks a question. Each check prints one line.

```
node setup-check.mjs node
node setup-check.mjs gh <owner/repo> [host]
node setup-check.mjs remote <url>
node setup-check.mjs ado <org> <project>
node setup-check.mjs local [url]
```

| Check | Arguments | What it proves |
| --- | --- | --- |
| `node` | none | Node 22 or later is installed. |
| `gh` | `<owner/repo>`, optional host | The `gh` account can see the repo. Runs `gh api [--hostname <host>] repos/<owner>/<repo>`. |
| `remote` | `<url>` | Whether the remote is an Azure DevOps URL. |
| `ado` | `<org> <project>` | The token in `AZURE_DEVOPS_EXT_PAT` can read the work item types of the project. |
| `local` | optional `[url]` | Whether the repo has no remote on `github.com` or ADO. |

Environment: `AZURE_DEVOPS_EXT_PAT` is the token for `ado`. It is the real user token, not a test variable. These are test-only: `CADRE_NODE_CMD` replaces `node --version`. `CADRE_GH_CMD` replaces `gh`. `CADRE_ADO_CMD` replaces the ADO client.

Output lines that exit 0:

| Output | Check |
| --- | --- |
| `ok node <version>` | `node` |
| `ok gh <owner/repo>` | `gh` |
| `ok ado-remote {"org":..,"repo":..,"project":..}` | `remote`. The names are URL-decoded JSON strings. A repo or a project can hold a space. |
| `ok not-ado` | `remote`. The remote is not an ADO URL. |
| `ok ado <org>/<project>` | `ado` |
| `ok local no-remote` | `local`. No URL, or an empty one. Propose the local tracker. |
| `ok local path-remote` | `local`. The remote is a path on this machine. |
| `ok local other-host <host>` | `local`. The host is neither GitHub nor ADO. |
| `ok not-local` | `local`. The remote is on `github.com` or ADO. Any other host gives `ok local other-host <host>`. |

Output lines that exit 1 start with `stop:` and say what the human must do:

| Check | Cause |
| --- | --- |
| `node` | Node is missing or not on PATH, or its major version is below 22. |
| `gh` | HTTP 404, HTTP 401, gh not signed in, or gh not installed. |
| `ado` | The token is refused (HTTP 302, 203, 401, or an empty 200 body: the line names `AZURE_DEVOPS_EXT_PAT`), HTTP 404 (project not visible), or HTTP 403 (no access). |

Exit 2 is `unknown: <reason>`: a command failed, the Node version output is not a version, the repo is not `<owner>/<repo>`, the host is not a host name, there is no remote URL (`remote`), the remote URL has no host (`local`), the ADO remote path is not readable, the ADO answer is another status, or the ADO answer is not JSON. Exit 64 is wrong arguments.

A missing `node` cannot run this script. A "command not found" for `node` is the same stop.

## setup-derive

Read the setup answers that the repo already holds. It changes nothing. `/cadre:setup` runs it before it asks a question.

```
node setup-derive.mjs github <owner/repo> [host]
node setup-derive.mjs ado <org> <project> <repo>
```

Run it in the repo root. The default host is `github.com`.

| Output | Exit | Meaning |
| --- | --- | --- |
| `fact <key> <JSON value> source=<source>` | 0 | One line for each fact that was read. |
| `unread <key> <reason>` | 0 | One fact cannot be read. The other facts still print. |
| `unknown: <reason>` | 2 | A name is bad, or the tracker repo cannot be read. |

The facts, in this order:

| Key | Value | Source |
| --- | --- | --- |
| `default-branch` | The name of the default branch. | `repo settings` (GitHub) or `repo record` (ADO). |
| `merge-methods` | A sorted list of `merge`, `rebase`, and `squash`. ADO adds `rebase-merge`. | GitHub: `repo settings`, then `ruleset <ruleset id>` for each narrowing ruleset. ADO: `policy <id>` for each live merge strategy policy, or `no merge strategy policy`. |
| `secrets` | The names of the secrets, never a value. | `gh secret list`. On ADO it is always `unread`, because the token cannot read pipeline variables. |
| `live-clones` | The absolute paths of the clones that a marketplace of source type `directory` points at. | `settings.json extraKnownMarketplaces` and `plugins/known_marketplaces.json`, joined by a comma, for each file that was read. Else `no marketplace file`. Only clones of this repo are listed, matched by the git common dir. |
| `folders` | The top-level folders that git tracks at `HEAD`. | `git ls-tree HEAD`. |

On GitHub, `merge-methods` is the repo settings `allow_*_merge`, narrowed by the `allowed_merge_methods` of each `pull_request` rule on the default branch. Settings that the account cannot see give `unread`. On ADO, it is the intersection of the lists of each enabled, blocking policy "Require a merge strategy" in scope of the default branch. With no policy, all methods are allowed.

Exit 64 is wrong arguments. Environment: `CADRE_GH_CMD` and `CADRE_ADO_CMD` (test-only) replace `gh` and the ADO client. `CLAUDE_CONFIG_DIR` names the Claude config folder.

## preset-discover

Find the preset files of the enabled plugins. See [Presets](presets.md).

```
node preset-discover.mjs [repo-root]
```

| Argument | Meaning |
| --- | --- |
| `repo-root` | The repo. The default is the current folder. |

Environment: `CADRE_PLUGIN_LIST_CMD` (test-only) is a shell command that prints the plugin list. The default is `claude plugin list --json`.

| Output | Exit | Meaning |
| --- | --- | --- |
| `{"count":N,"presets":[{"plugin","answers","defaults","notes"}]}` | 0 | `N` can be 0. |
| `unknown: <reason>` | 2 | A command or a file failed. |
| `unknown: <plugin>: <reason>` | 2 | A preset file is bad. |

Rules of discovery are in [Presets](presets.md#discovery).

## skill-map

Print the skill for each capability of one role card.

```
node skill-map.mjs <card> [repo-root]
```

| Argument | Meaning |
| --- | --- |
| `card` | `coder`, `reviewer`, `researcher`, or `tester`. |
| `repo-root` | The repo. The default is the current folder. |

The script reads `skill_pack` and `capabilities` from the charter. The table of presets is the constant `PRESETS` in the script. See [Role cards](role-cards.md#the-skill-map).

| Output | Exit | Meaning |
| --- | --- | --- |
| `<capability> <skill name>` | 0 | One line for each capability of the card. The skill is `none` when the card uses its built-in method. |
| `unknown: <reason>` | 2 | No card given, an unknown card, no charter, a bad charter, a bad `skill_pack`, a bad `capabilities` item, an unknown capability, a capability twice, or a mix of the inline list and `- a=b` lines. |

## host-id

Print the host id of this machine.

```
node host-id.mjs
```

No arguments. Environment: `CADRE_HOME` is the user folder, `~/.cadre` by default. `CADRE_RANDOM_CMD` (test-only) is a shell command that prints 32 hex characters.

The id is kept in the file `host-id` in the user folder. The script makes the file from 16 random bytes when it is missing. It uses no host name, MAC address, serial number, user name, or time.

| Output | Exit | Meaning |
| --- | --- | --- |
| `<id>` | 0 | 32 lower case hex characters. |
| `unknown: <reason>` | 2 | The script cannot read or make the file, the file does not hold a 32 character hex id, or the random source failed. |

## holder-check

Tell if a live Claude Code session on this machine holds a session id.

```
node holder-check.mjs <session-id>
```

| Argument | Meaning |
| --- | --- |
| `session-id` | A session UUID. A name gives `unknown`. |

Environment:

| Variable | Meaning |
| --- | --- |
| `CLAUDE_PID` | The pid of this session. A match gives `self`. |
| `CLAUDE_AGENTS_JSON_CMD` (test-only) | Replaces `claude agents --json`. |
| `CADRE_PROCESS_CMD` (test-only) | A shell command that checks one process. It gets the pid in `CADRE_PID`. It prints `dead` or `alive <process name>`, and exits 0. |

The source is `claude agents --json`, a JSON array of sessions with the fields `pid`, `sessionId`, `name`, `cwd`, `kind`, and `status`. For each entry with the id, the script checks the process of the pid.

| Process | Result |
| --- | --- |
| Dead | The entry is stale. It does not count. |
| Named `claude`, a versioned file name, or a name that holds `claude` | `held`. |
| Named `node`, `nodejs`, `bash`, `sh`, `mintty`, or `git-bash` | `unknown`, unless the pid equals `CLAUDE_PID`. |
| Any other name | The pid went to another program. The entry does not count. |

| Output | Exit | Meaning |
| --- | --- | --- |
| `held pid=<pid> name=<name> cwd=<cwd> status=<status>` | 0 | Another session holds it. `name` is the session name from the entry. `held` wins over `unknown` when entries disagree. |
| `free` | 1 | Each listed pid is dead or is another program, or no entry has the id. |
| `unknown: <reason>` | 2 | A command, a parse, or a process check failed, or a name is ambiguous. |
| `self pid=<pid>` | 3 | This session holds it. It wins over another entry. |
| usage message on stderr | 64 | Wrong arguments. |

## resume-read

Read a GitHub orchestrator issue for a resume: owner check, holder, ledger audit, newest checkpoint. See [The orchestrator issue](orchestrator-item.md).

```
node resume-read.mjs <issue-number> [session-id]
```

| Argument | Meaning |
| --- | --- |
| `issue-number` | Digits only. |
| `session-id` | The session that asks. Without it, no holder is `self` and each session row in the ledger counts as ended. |

Environment: `CADRE_GH_CMD` (test-only) replaces `gh`. `CADRE_HOME` applies to the host id.

The script first reads the login of `gh`, then the issue. The issue must not be a pull request. It must carry the label `cadre:orchestrator`. It must have exactly one assignee, and that login must equal the login of `gh`, ignoring case.

| Output | Exit |
| --- | --- |
| `ok holder=<who> session=<id\|none> checkpoint=<comment id\|none> ignored=<list\|none> state=<open\|closed> bad-rows=[<n>,...] ended-rows=[<n>,...]` | 0 |
| `not-owner login=<login> assignee=<login>` | 1 |
| `unknown: <reason>` | 2 |
| usage message on stderr | 64 |

The fields of the `ok` line are the same for each resume script:

| Field | Values |
| --- | --- |
| `holder` | `free`: the Holder session is `none`. `self`: the Holder session equals `session-id`. `same-host`: another session, and the Holder host equals the host id of this machine. `other-host`: another session on another host. |
| `session` | The session of the Holder, or `none`. |
| `checkpoint` | The id of the newest trusted checkpoint, or `none`. |
| `ignored` | Comma list of the ids of checkpoints with a marker time more than 5 minutes ahead of now, or `none`. |
| `state` | `open` or `closed`. |
| `bad-rows` | List of ledger rows with a wrong cell count, or a Granted by that is not the assignee. The parse drops the separator row and the empty rows. Row 1 is the first data row. It looks like `[2,3]`. An empty list is `[]`. |
| `ended-rows` | List of ledger rows whose When holds `session <id>` with an id other than `session-id`. It looks like `[6]`. An empty list is `[]`. |

`unknown` reasons include: a pull request, a missing label, a number of assignees other than one, a `##` heading twice or inside a code fence, a code fence not closed, a missing section, a Holder that holds anything but `session`, `host`, and `since`, a wrong Ledger header, a `gh` call that failed, and output that is not JSON.

## resume-read-ado

Read an Azure DevOps work item for a resume.

```
node resume-read-ado.mjs <work-item-id> [session-id]
```

Run it in the repo root. The output lines and exit codes are those of [resume-read](#resume-read). Differences:

- The org and the project come from `ado_org` and `ado_project` in the charter of the current folder. The charter must have `tracker: ado`.
- The item must have the tag `cadre:orchestrator` and be in that project.
- The owner check compares the account of the token (`connectionData`) with the one assignee, by unique name, ignoring case. The `login` and `assignee` of `not-owner` are those names.
- `state=closed` when the state of the item is in the category `Completed` or `Removed`. Else `open`. The script reads the category from the work item type and never compares a state name. A category that is not `Proposed`, `InProgress`, `Resolved`, `Completed`, or `Removed` gives `unknown`.
- The description must be strict HTML. A heading is exactly `<h2>Name</h2>`. Ledger is one `<table>` with a header row of `<th>` cells and rows of `<td>` cells with text only. Holder is one `<pre>` block.
- A checkpoint is a comment by the owner. The marker is its first text. The three headings can be `<h2>` or `##` lines. A deleted comment does not count. The comment list is read to the last page. More than 50 pages, or a repeated page token, gives `unknown`.
- A status other than 200, a 302, an empty body, and a body that is not JSON give `unknown`.
- The script makes GET calls only.

Environment: `AZURE_DEVOPS_EXT_PAT`, `CADRE_ADO_CMD` (test-only), `CADRE_HOME`.

## resume-read-local

Read a local orchestrator file for a resume.

```
node resume-read-local.mjs <name> [session-id]
```

Run it in the repo or in a worktree of it. The output lines and exit codes are those of [resume-read](#resume-read). Differences:

- The file is `.cadre/orchestrators/<name>.md` in the main clone. The name is slugged: lower case, runs of other characters become `-`, and a leading or trailing `-` is cut.
- The owner is the `owner:` line. The user is the OS user name, or `CADRE_LOCAL_USER` (test-only).
- `state` is the `state:` line.
- A `checkpoint` id is the time of the marker line, not a comment id.
- The script checks no author of a checkpoint. The file is the owner's.
- A missing `.cadre/` gives `unknown: not set up; run /cadre:setup`. A missing file gives `unknown: there is no file for <name>`.
- A name with no letter or digit gives exit 64.

## grant-check

Read the Ledger of a GitHub orchestrator issue before a one-way step, and print each row that grants the action. See [The orchestrator issue](orchestrator-item.md).

```
node grant-check.mjs <issue-number> <session-id> "<action>"
```

| Argument | Meaning |
| --- | --- |
| `issue-number` | Digits only. |
| `session-id` | The session that asks. A row of another session has ended. |
| `action` | The step. It must equal the Action cell as a whole, ignoring case and outer white space. A part of a cell does not match. |

Environment: `CADRE_GH_CMD` (test-only) replaces `gh`.

The issue check, the owner check, and the Ledger parse are those of [resume-read](#resume-read). A row counts when it is not a bad row and not an ended row of that read, and its When is `<YYYY-MM-DD> indefinite` or names `session-id`. The script never decides the Scope. The orchestrator reads it.

| Output | Exit |
| --- | --- |
| `granted row=<k> scope=<Scope cell as a JSON string>`, one line for each row that counts, in row order | 0 |
| `none`: no row counts | 1 |
| `not-owner login=<login> assignee=<login>` | 1 |
| `unknown: <reason>` | 2 |
| usage message on stderr | 64 |

`unknown` reasons are those of resume-read for the issue and the Ledger. A missing Holder section is not one: the grant check does not read the Holder.

A cell cannot hold a bar. An escaped `\|` splits the cell, so the row has a wrong width. It is a bad row and does not count, so the check fails closed.

## grant-check-ado

Read an Azure DevOps work item before a one-way step.

```
node grant-check-ado.mjs <work-item-id> <session-id> "<action>"
```

Run it in the repo root. The output lines and exit codes are those of [grant-check](#grant-check). Differences:

- The org and the project come from the charter of the current folder, which must have `tracker: ado`.
- The item must have the tag `cadre:orchestrator` and be in that project. The owner check compares the account of the token with the one assignee, by unique name, ignoring case.
- The description must be strict HTML, as [resume-read-ado](#resume-read-ado) says. A missing Ledger section gives `unknown`.
- The script makes GET calls only. It reads no state, Holder, or comment.

Environment: `AZURE_DEVOPS_EXT_PAT`, `CADRE_ADO_CMD` (test-only).

## grant-check-local

Read a local orchestrator file before a one-way step.

```
node grant-check-local.mjs <name> <session-id> "<action>"
```

Run it in the repo or in a worktree of it. The output lines and exit codes are those of [grant-check](#grant-check). Differences:

- The file is `.cadre/orchestrators/<name>.md` in the main clone. The owner is the `owner:` line. The user is the OS user name, or `CADRE_LOCAL_USER` (test-only).
- A missing `.cadre/` gives `unknown: not set up; run /cadre:setup`. A missing file gives `unknown: there is no file for <name>`. A missing Ledger section gives `unknown`.
- A name with no letter or digit gives exit 64.

## ado-call

The ADO client. One REST call, and no other work.

```
node ado-call.mjs <GET|POST|PATCH> <url> [body file]
```

| Argument | Meaning |
| --- | --- |
| method | `GET`, `POST`, or `PATCH`. |
| `url` | An `https` URL on `dev.azure.com` or `<name>.visualstudio.com`. Any other host gives exit 64, so the token never leaves for another host. |
| `body file` | Optional. A file that holds a JSON list goes as `application/json-patch+json`. Any other file goes as `application/json`. |

Environment: `AZURE_DEVOPS_EXT_PAT` is sent as basic auth with an empty user. An empty variable sends no header, and ADO then answers 302. A redirect is never followed. `CADRE_ADO_ALLOW_LOCAL=1` (test-only) lets the script call `http://127.0.0.1`.

| Output | Exit | Meaning |
| --- | --- | --- |
| Line 1: `<status>[ <continuation token>]`, then the body | 0 | Any HTTP answer, a 302 and a 401 too. |
| `ado-call: no answer from <host>: <code>` on stderr | 2 | `<code>` is the error code, or the error message when there is no code. Any failure of the fetch: no answer in 30 seconds, a refused connection, a failed name lookup, or a failed TLS handshake. |
| `ado-call: cannot read the body file: <code>` on stderr | 2 | The body file cannot be read. |
| Usage message on stderr | 64 | Wrong arguments, a URL that is not valid, or a host that is not ADO. |

The continuation token comes from the header `x-ms-continuationtoken`. Read the status before the body. Only a 200 with a JSON body is an answer.

## ado-list

List work items of one tag on ADO. It changes nothing.

```
node ado-list.mjs orchestrators <org> <project>
node ado-list.mjs work <org> <project> <name>
```

| Command | Items listed |
| --- | --- |
| `orchestrators` | Each item with the tag `cadre:orchestrator`, in any state. |
| `work` | Each item with the tag `cadre:work:<name>` whose state is in the category `Proposed` or `InProgress`. |

The script runs a WIQL query for the ids, then reads the items in groups of 200. It keeps an item only when its tags hold the exact tag. A name with a quote, a semicolon, a comma, or a control character gives `unknown`.

Environment: `AZURE_DEVOPS_EXT_PAT`, `CADRE_ADO_CMD` (test-only).

| Output | Exit | Meaning |
| --- | --- | --- |
| `item id=<id> state=<state> type=<type> owner=<unique name\|none> title=<title>` | 0 | One line for each item. `state` and `type` can hold spaces, for example `type=Product Backlog Item`, so do not split the line on spaces. The title has its white space collapsed and is the rest of the line. |
| `none` | 0 | The read worked and the list is empty. |
| `unknown: <reason>` | 2 | A read failed, the list may be cut short, or the org or the project name is bad. A bad `work` name gives `unknown: the name holds a character that a tag cannot hold`. |
| usage message on stderr | 64 | Wrong arguments. |

WIQL stops at 20000 ids, so 20000 or more gives `unknown: too many results; narrow the query`. A status other than 200, a 302, a 203, an empty body, and a body that is not JSON give `unknown`.

## ado-setup

Reads that `/cadre:setup` makes on ADO. Each prints one line. It changes nothing.

```
node ado-setup.mjs area <org> <project> <repo>
node ado-setup.mjs type <org> <project> <work item type>
```

Environment: `AZURE_DEVOPS_EXT_PAT`, `CADRE_ADO_CMD` (test-only).

| Output | Exit | Meaning |
| --- | --- | --- |
| `match: <area path>` | 0 | An area of the project has the name of the repo, compared with only letters and digits, ignoring case. Another match shows as `(also: <path>, ...)`. The shallowest match is first. |
| `root: <project>. No area matches <repo>. Items then land at the project root, which names no program.` | 0 | No area matches. |
| `ok type: <name>` | 0 | The type is enabled and has a state in each category: `Proposed`, `InProgress`, `Completed`. |
| `refuse: <reason>. propose: <type>. <type> is enabled and has the states that an orchestrator item needs.` | 1 | The type is disabled, missing, or lacks those states. |
| `refuse: <reason>. No other enabled type fits.` | 1 | No other type fits. |
| `unknown: <reason>` | 2 | A read failed. |
| usage message on stderr | 64 | Wrong arguments. |

The proposed type is `Task` when it fits. Else it is the first fitting type of the category `Microsoft.RequirementCategory`, then of `Microsoft.TaskCategory`. The area tree is read to depth 4.

## local-list

Make, list, and change the files of the local tracker.

```
node local-list.mjs init
node local-list.mjs orchestrators
node local-list.mjs new <name> <purpose> [session-id]
node local-list.mjs put <name> <Purpose|Repos|Ledger|Holder> <file>
node local-list.mjs checkpoint <name> <file>
node local-list.mjs latest <name>
node local-list.mjs state <name> <open|closed>
node local-list.mjs ticket <orchestrator name> <title>
node local-list.mjs work <orchestrator name>
```

Run it in the repo or in a worktree. The files are in `.cadre/` of the main clone. Environment: `CADRE_LOCAL_USER` (test-only), `CADRE_HOME`.

| Command | Effect |
| --- | --- |
| `init` | Make `.cadre/` and add `/.cadre/` to `.git/info/exclude`. Safe to run again. |
| `orchestrators` | List each orchestrator file. |
| `new` | Make a file. It refuses a taken name. With a `session-id`, the Holder is that session, this host, and now. Without it, the Holder is `none`. |
| `put` | Replace the text of one section, from a file. The text must hold no `##` heading and no marker line. The Holder text must be valid. Owner only. |
| `checkpoint` | Append the marker line and the file. The file needs the three checkpoint sections and no marker line. Owner only. |
| `latest` | Print the newest trusted checkpoint block. |
| `state` | Set the `state:` line. Owner only. |
| `ticket` | Make `.cadre/tickets/<n>-<slug>.md`. `n` is one more than the highest number. |
| `work` | List the open tickets of one orchestrator. |

| Output | Exit | Meaning |
| --- | --- | --- |
| `ok <command> <file or id>` | 0 | After `init`, `new`, `put`, `state`, `ticket`, `checkpoint`. For `checkpoint` the id is the marker time. |
| `orchestrator name=<slug> owner=<user, percent-encoded> state=<open\|closed> holder=<session\|none> purpose=<text>` | 0 | One line for each orchestrator. |
| `ticket n=<n> state=open title=<title>` | 0 | One line for each open ticket, in order of `n`. |
| The checkpoint block | 0 | `latest`. From the marker line to the end. |
| `none` | 0 | The list is empty, or `latest` found no checkpoint. |
| `refuse: <reason>` | 1 | The name is taken, or the name has no letter or digit. The user is not the owner. A section name is wrong. The new text holds a heading or a marker line. A checkpoint lacks the three sections, or holds a marker line. The `<orchestrator name>` or the title of `ticket` has no letter or digit. |
| `unknown: <reason>` | 2 | A read or write failed, or a file is not valid. Some bad input also gives it: a name or a purpose that is not one line, a Holder that is not valid, or text that fails the check before the write. Never `none`. |
| usage message on stderr | 64 | Wrong arguments, or a `state` value other than `open` or `closed`. |

A write holds the lock file `<file>.lock` (an exclusive create) from the read to the re-read. A lock that stays about 2 seconds gives `unknown: busy`. A lock older than 30 seconds is stale and the next write takes it over. The new text is checked as a read checks it, before the write. The write goes to a temp file in the same folder, then a rename. When the rename fails with `EPERM`, `EBUSY`, or `EACCES`, the script tries it again. It makes at most 10 tries in about 1 second. On Windows, another process such as a virus scan can hold the file open for a short time. The script reads the file again. A file in the folder that is not valid gives `unknown`, so a list is never shorter than the truth.

A ticket file has the lines `# <title>`, `state: open|closed`, and `work: <orchestrator>`. A person or an agent changes the `state` line of a ticket by hand.

## branch-policy

Read the branch policy of the default branch of a GitHub repo and report each gap. It changes nothing.

```
node branch-policy.mjs <owner/repo> [host]
```

| Argument | Meaning |
| --- | --- |
| `owner/repo` | The repo. |
| `host` | A GitHub host name. With no host, the script passes no `--hostname`, and `gh` uses its own default host. |

Environment: `CADRE_GH_CMD` (test-only) replaces `gh`. The script runs `gh api` with GET only: the repo, `rules/branches/<branch>`, and `branches/<branch>/protection`.

Each of five checks is covered by a ruleset rule or by classic branch protection:

| Gap line | Covered by |
| --- | --- |
| `gap: no rule requires a pull request` | Rule `pull_request`, or protection with required pull request reviews. |
| `gap: no review is required` | A source with a count of approving reviews other than 0. A source with no count counts as a review. |
| `gap: force push is allowed` | Rule `non_fast_forward`, or protection with force push off. |
| `gap: the branch can be deleted` | Rule `deletion`, or protection with deletion off. |
| `gap: no required status check` | Rule `required_status_checks`, or protection with status checks. |

| Output | Exit | Meaning |
| --- | --- | --- |
| `gap: <what is missing>` | 0 | One line for each gap. |
| `ok` | 0 | No gap. |
| `unknown: <reason>` | 2 | The script cannot read the policy, or the repo is not `<owner>/<repo>`, or the host is not a host name. Never `ok`. |

The script never exits 64. A bad argument gives `unknown`.

"Branch not protected" from the protection call is an answer, not a fault. Any other failure is `unknown`.

## branch-policy-ado

Read the branch policy of the default branch of an ADO repo and report each gap. It changes nothing.

```
node branch-policy-ado.mjs <org> <project> <repo>
```

Environment: `AZURE_DEVOPS_EXT_PAT`, `CADRE_ADO_CMD` (test-only). The script makes GET calls only: the repo, and `policy/configurations` to the last page (50 pages at most). More than 50 pages gives `unknown`.

A policy counts when it is enabled, blocking, and not deleted, and its scope holds the default branch of the repo. A scope entry holds it when the repository id is null or the id of the repo, and the ref name is a prefix (match kind `Prefix`) or equal (any other match kind). An entry with no `refName` never covers the branch.

| Gap line | Condition |
| --- | --- |
| `gap: no blocking policy requires a review` | No policy of type "Minimum number of reviewers" with a minimum of 1 or more. |
| `gap: the author's own vote counts toward the minimum of reviewers` | Each such policy counts the vote of the author. |
| `gap: no blocking build validation policy` | No policy of type Build. |
| `gap: no blocking policy requires comment resolution` | No policy of type "Comment requirements". |
| `gap: no blocking policy covers the branch, so it can take a direct push` | No counting policy at all. |
| `gap: no blocking policy covers the branch, so it can take a force push` | No counting policy at all. |

The permission "Bypass policies when pushing" is not read.

| Output | Exit | Meaning |
| --- | --- | --- |
| `gap: <what is missing>` | 0 | One line for each gap. |
| `ok` | 0 | No gap. |
| `unknown: <reason>` | 2 | The script cannot read the policy. Never `ok`. |
| usage message on stderr | 64 | Wrong arguments. |

## teams-setting

Turn on agent teams in one settings file. Setup does not call it. A human runs it, as the how-to page says.

```
node teams-setting.mjs [local|project|user] [repo-root]
```

| Scope | File |
| --- | --- |
| `local` (default) | `<repo>/.claude/settings.local.json` |
| `project` | `<repo>/.claude/settings.json` |
| `user` | `settings.json` in `CLAUDE_CONFIG_DIR`, or `~/.claude` |

The repo root is the current folder by default. The `user` scope ignores it.

The script sets `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to `"1"` and keeps every other key. A missing file is created. If the script cannot make the `.claude/` folder, Node exits 1 with a stack trace. A failed write can leave an empty `.claude/` folder. A file that has the value stays as it is. A byte order mark is accepted. The write goes to a temp file in the same folder, then a rename. When the rename fails with `EPERM`, `EBUSY`, or `EACCES`, the script tries it again, at most 10 tries in about 1 second.

For `local`, `git check-ignore` tests the file. `CADRE_GIT_CMD` (test-only) replaces `git`.

| Output | Exit | Meaning |
| --- | --- | --- |
| `<path>` | 0 | The file has the setting. |
| `note: <path> is not in .gitignore; add it so it is not committed` | 0 | A second line, `local` only, when git says "not ignored". |
| `unknown: <reason>` | 2 | The scope is wrong, the file is not valid JSON or not an object, `env` is not an object, or the write failed. Nothing is written. |

## guard and task-completed

`guard.mjs` and `task-completed.mjs` are hooks. Do not run them by hand. See [Guards](guards.md).

| Output | Exit | Meaning |
| --- | --- | --- |
| Nothing, or one JSON line with `permissionDecision` `ask` or `deny` (`guard` only) | 0 | The call passes, or the hook asks or denies by its JSON answer. |
| A reason on stderr | 2 | The hook blocks the call. `guard` blocks only when it faults: a bad argument, bad input, or an exception. An unreadable command gets ask or deny, not a block. `task-completed` blocks a completion by a helper or teammate, and it blocks when it faults. It does both only when agent teams are on. With teams off it exits 0. |

Neither hook uses the codes 1, 3, or 64.
