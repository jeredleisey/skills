# The charter of a repo

The charter holds the facts of one repo that an orchestrator needs. The skill holds none of them. It lives at `docs/agents/cadre-charter.md`, committed in the repo. `/cadre:setup` writes it in a pull request. An orchestrator never writes it.

## The front matter

Front matter holds only what a script or a hook reads.

| Field | Meaning |
| --- | --- |
| `charter_schema` | An integer. It rises only when an old charter cannot work. |
| `written_by` | `cadre <version>`, the version that wrote the file. |
| `tracker` | `kind`, `host`, and `repo`. |
| `skill_pack` | `mattpocock-skills`, `superpowers`, or `none`. |

## The body

The body is for agents. Say only what an agent cannot derive from the repo.

```markdown
---
charter_schema: 1
written_by: cadre <version>
tracker:
  kind: github
  host: github.com
  repo: <owner>/<repo>
skill_pack: <preset>
---

# Charter

## Owners
| Path | Owner | Note |
| --- | --- | --- |

When code moves to another repo, <rule>.

## Merge and deploy
- Merge: <who>, <method>, <when>.
- Deploy: <who>, <command>, <what it backs up first>.

## Documentation
<the rule>

## Only the human
- <action>

## Secrets
<the names of the stores, never the values>

## Traps
- <trap and its fix>

## Live clones
- <path>: <the tool that runs from it>
```

## Worktrees

Helpers work in worktrees at `<repo>/.claude/worktrees/<branch>`. The `.gitignore` of the repo must ignore `.claude/worktrees/`. `/cadre:setup` adds the line.
