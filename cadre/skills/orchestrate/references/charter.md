# The charter of a repo

The charter holds the facts of one repo that an orchestrator needs. The skill holds none of them. It lives at `docs/agents/cadre-charter.md`, committed in the repo. `/cadre:setup` writes it in a pull request. An orchestrator never writes it.

## The front matter

Front matter holds only what a script or a hook reads.

| Field | Meaning |
| --- | --- |
| `charter_schema` | An integer. It rises only when an old charter cannot work. |
| `written_by` | `cadre <version>`, the version that wrote the file. |
| `guards` | `off` turns the guards off. Absent when on, the default. |
| `allow` | A list of guards that the repo allows, such as `[merge]`. Absent when none. |
| `skill_pack` | The preset of the skill map: `mattpocock-skills`, `superpowers`, or `none`. Absent means `none`. |
| `capabilities` | Overrides of the skill map, as items `<capability>=<skill or none>`. Write the inline list `[a=b, c=d]` or `- a=b` lines, never a mix. A capability appears once. Absent when none. |
| `tracker` | `ado` for Azure DevOps, `local` for the local tracker. Absent for GitHub, the default. |
| `ado_org`, `ado_project` | The ADO organization and project. Absent for GitHub. |

A ticket that adds a script or a hook that reads another field adds that field here.

## Guards

The guards are `push` and `merge`. A hook reads `guards` and `allow` from the charter on every candidate `origin/<branch>`, strictest wins, never from the working tree. They pass the orchestrator only. A helper is always denied. A missing or unreadable charter counts as guards on. The hooks stop a slip. The branch policy of the repo is the guard that holds, and `/cadre:setup` reports its gaps and what the hooks miss.

A personal file `guards.json` in `$CADRE_HOME`, or `~/.cadre`, can only add: `{"guards": "on"}` or `{"deny": ["merge"]}`. It never turns a guard off.

## The body

The body is for agents. Say only what an agent cannot derive from the repo.

```markdown
---
charter_schema: 1
written_by: cadre <version>
skill_pack: <mattpocock-skills, superpowers, or none>
---

# Charter

## Tracker
<GitHub: host, owner, repo. ADO: org, project, area path, item type>

## Owners
| Path | Owner | Note |
| --- | --- | --- |

When code moves to another repo, <rule>.

## Merge and deploy
- Merge: <who>, <method>, <when>.
- Deploy: <who>, <command>, <what it backs up first>.

## Extra cards
The orchestrator reads this list, so it is prose and not front matter.

| Name | Job | When to use |
| --- | --- | --- |

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
