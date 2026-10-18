# Presets

Reference for the preset file that a plugin ships to give default answers to `/cadre:setup`.

A preset is a default. It is never a lock. The human can change every answer. A preset never overrides an answer that the charter holds. It never lowers a branch policy or a guard, and it never sets a secret.

## File

| Fact | Value |
| --- | --- |
| Name | `cadre-presets.json` |
| Place | The root of the plugin (`installPath`) |
| Who can ship one | Any plugin |
| Read by | [`preset-discover`](scripts.md#preset-discover) |
| Encoding | JSON. A byte order mark is accepted. |

```json
{
  "preset_schema": 1,
  "answers": { "tracker": "<value>" },
  "defaults": { "skill_pack": "<value>" },
  "notes": { "tracker": "<one line>" }
}
```

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `preset_schema` | Yes | The integer `1` | Any other value is an error. |
| `answers` | No | Object | Answers that setup shows. The human confirms or changes each one. |
| `defaults` | No | Object | The default of a question that setup still asks. |
| `notes` | No | Object | One line for a key, shown with that key. |

A missing object counts as `{}`. A value in `answers` or `defaults` can be any JSON value except `null`. A value in `notes` must be a string. A `null` value in any of the three objects is an error.

## Question keys

| Key | Question |
| --- | --- |
| `tracker` | Which tracker, host, and owner? (found in the account check) |
| `skill_pack` | Which skill pack? Setup writes it to the front matter of the charter. |
| `owners` | Which paths does each orchestrator own? |
| `merge_deploy` | Who may merge and deploy, and how? |
| `documentation` | Which documentation follows a change? |
| `only_human` | Which actions does only the human do? |
| `secrets` | Which secrets exist, and where do they live? |
| `traps` | Which traps does the repo or the machine have? |
| `live_clones` | Which clones does a live tool run from? |

Setup ignores a key that is not in this table. It tells the human the key and the plugin.

## Discovery

The command is `node preset-discover.mjs [repo-root]`. The source is `claude plugin list --json`, a JSON array of plugin entries. Each entry has the fields `id`, `enabled`, `installPath`, and optionally `projectPath`.

| Rule | Detail |
| --- | --- |
| An entry counts only when | `enabled` is `true`, and `installPath` is a non-empty string. |
| Scope | An entry with a `projectPath` counts only when it equals the repo root. An entry with no `projectPath` (user scope) counts everywhere. |
| Path compare | Both paths go through the real path. On Windows the compare ignores case. |
| No file | An entry whose `installPath` has no `cadre-presets.json` (or is not a folder) has no preset. |
| One plugin, two scopes | The plugin counts once, by `id`, from the first entry that applies here. |
| A file and no id | An error. |
| Any other read failure | An error. |
| A bad file | An error. It is never skipped, so that setup never ignores a preset that the admin meant to apply. |
| A failure | Never `count` 0. |

A file is bad when it is not JSON, is not an object, has a `preset_schema` other than `1`, has an object field that is not an object, holds a `null` value, or has a note that is not a string.

## Output

One line and an exit code.

| Output | Exit |
| --- | --- |
| `{"count":N,"presets":[{"plugin","answers","defaults","notes"}]}` | 0 |
| `unknown: <reason>` or `unknown: <plugin>: <reason>` | 2 |

`plugin` is the `id` of the entry. `count` is `0` when no enabled plugin ships a file.
