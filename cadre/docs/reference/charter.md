# The charter

Reference for the charter file of a repo. For the reason that a charter exists, see [The orchestrator model](../explanation/orchestrator-model.md).

## File

| Fact | Value |
| --- | --- |
| Path | `docs/agents/cadre-charter.md` |
| Form | Markdown with YAML front matter |
| Written by | `/cadre:setup`, in a pull request |
| Written by an orchestrator | Never |

The front matter starts on line 1 with `---` and ends at the next `---`. A byte order mark is accepted.

## Front matter

Front matter holds only what a script or a hook reads.

| Field | Values | Default | Read by |
| --- | --- | --- | --- |
| `charter_schema` | A positive integer. It rises only when an old charter cannot work. | None. Required. | [`charter-check`](scripts.md#charter-check) |
| `written_by` | `cadre <version>`, the version that wrote the file. | None. Required. | [`charter-check`](scripts.md#charter-check) |
| `guards` | `off` turns the guards off. Any other value leaves them on. | Absent: guards on. | [`guard`](guards.md) |
| `allow` | A list of guards that the repo allows, from `push` and `merge`. | Absent: none. | [`guard`](guards.md) |
| `skill_pack` | `mattpocock-skills`, `superpowers`, or `none`. | Absent: `none`. | [`skill-map`](scripts.md#skill-map) |
| `capabilities` | Overrides of the skill map, as items `<capability>=<skill or none>`. | Absent: no override. | [`skill-map`](scripts.md#skill-map) |
| `tracker` | `ado` for Azure DevOps. `local` for the local tracker. | Absent: GitHub. | [`resume-read-ado`](scripts.md#resume-read-ado) reads `ado`. The skills read `local` and the absence. |
| `ado_org` | The ADO organization. | Absent for GitHub. | [`resume-read-ado`](scripts.md#resume-read-ado) |
| `ado_project` | The ADO project. | Absent for GitHub. | [`resume-read-ado`](scripts.md#resume-read-ado) |

The reading scripts skip any other front matter field.

### Rules of the parser

- A blank line, a comment line, an indented line, and a `- ` list line are skipped.
- Any other line must be `key: value`. Else the script gives `unknown`.
- A key that a script reads and that appears twice gives `unknown`.
- A value can be in single or double quotes. The quotes are removed.
- A list can be an inline `[a, b]`, a comma list, or `- item` lines.
- `capabilities` takes the inline list `[a=b, c=d]` or `- a=b` lines, never a mix. A capability appears once. A capability that does not exist gives `unknown`.
- `charter-check` keeps its own copy of the parser. `charter-front-matter.mjs` serves the other scripts. The two follow the same rules.

## Body

The body is for agents. It says only what an agent cannot derive from the repo. Each section is optional in the file, and the skills read them as prose.

| Section | Content |
| --- | --- |
| `# Charter` | The title. |
| `## Tracker` | GitHub: host, owner, repo. ADO: org, project, area path, item type. Local: the area path and item type do not apply. |
| `## Owners` | A table with the columns Path, Owner, Note. Then the rule for when code moves to another repo. |
| `## Merge and deploy` | Who merges and by what method and when. Who deploys, with which command, and what it backs up first. |
| `## Extra cards` | A table with the columns Name, Job, When to use. It is prose, not front matter, because the orchestrator reads it. |
| `## Documentation` | The rule for the documentation that follows a change. |
| `## Only the human` | The actions that only the human does. |
| `## Secrets` | The names of the stores. Never the values. |
| `## Traps` | Each trap and its fix. |
| `## Live clones` | Each path and the tool that runs from it. |

## Where the facts are read

| Fact | Source |
| --- | --- |
| Charter on the guard side | The commit `origin/<default branch>`, never the working tree. See [Guards](guards.md#how-the-guard-reads-the-charter). |
| Charter on the skill-map side and the resume side | The working tree of the repo root that the script gets, or the current folder. |

## Worktrees

Helpers work in worktrees at `<repo>/.claude/worktrees/<branch>`. The `.gitignore` of the repo must ignore `.claude/worktrees/`. `/cadre:setup` adds the line.

## Related

- [Guards](guards.md)
- [Role cards](role-cards.md)
- [Presets](presets.md)
