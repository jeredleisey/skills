# Presets

A preset is a file of default answers that a plugin ships. An org admin can ship one in any plugin. The file is `cadre-presets.json` at the root of that plugin. Setup finds it with `scripts/preset-discover.mjs <repo root>` in the plugin root. A plugin enabled for one project counts only in that project. A user-wide plugin counts everywhere.

A preset is a default. It is never a lock. The human can change every answer. A preset never overrides an answer that the charter holds. It never lowers a branch policy or a guard, and it never sets a secret.

## The file

```json
{
  "preset_schema": 1,
  "answers": { "tracker": "<value>" },
  "defaults": { "skill_pack": "<value>" },
  "notes": { "tracker": "<one line>" }
}
```

| Field | Meaning |
| --- | --- |
| `preset_schema` | The integer `1`. Any other value is an error. |
| `answers` | Answers that setup shows. The human confirms or changes each one. |
| `defaults` | The default of a question that setup still asks. |
| `notes` | One line for a key, shown with that key. |

Each of the last three is optional, and each is an object. A value in `answers` or `defaults` can be any JSON value except `null`. A value in `notes` is a string.

## The question keys

| Key | Question |
| --- | --- |
| `tracker` | Which tracker, host, and owner? (found in the account check) |
| `skill_pack` | Which skill pack? (setup writes it to the front matter of the charter) |
| `owners` | Which paths does each orchestrator own? |
| `merge_deploy` | Who may merge and deploy, and how? |
| `documentation` | Which documentation follows a change? |
| `only_human` | Which actions does only the human do? |
| `secrets` | Which secrets exist, and where do they live? |
| `traps` | Which traps does the repo or the machine have? |
| `live_clones` | Which clones does a live tool run from? |

Setup ignores a key that is not in this table. It tells the human the key and the plugin.

## The output of the script

One line and an exit code.

- `{"count": N, "presets": [{"plugin", "answers", "defaults", "notes"}]}` and exit 0. `count` is `0` when no enabled plugin ships a file.
- `unknown: <reason>` or `unknown: <plugin>: <reason>` and exit 2. A bad preset file is an error, so that setup never ignores a preset that the admin meant to apply.
