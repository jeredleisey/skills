# The roster

The roster is the list of orchestrators of one project. Each entry is a handoff note, `orchestrator-handoff-<name>.md`, in the memory folder of the project ([handoff.md](handoff.md)). The `description` in the front matter of the note is the purpose of that orchestrator.

## List

Do this when the human asks which orchestrators the project has, or when a resume finds no note.

1. Find each `orchestrator-handoff-*.md` in the memory folder of the project.
2. From the front matter of each note, read the name, the purpose, and the status. Read the date in its first line.
3. For each entry, fill the `Live` column with the checks of [Check for a live holder](#check-for-a-live-holder). Use the `session` of the note for check A.
4. Show one table, newest first, and stop:

   | Name | Purpose | Last update | Status | Live |
   | --- | --- | --- | --- | --- |

5. End with the choices: resume one by its name, or start a new one.

Done when the human has the table and the choices, and you did not start as any of them.

## Resume

1. Find the note of the name. If none exists, do the List steps, and say that the name has no note.
2. If this conversation already is that orchestrator, for example after a compaction, go to step 5. The live session that the List steps find is then you.
3. Find out if another session holds the name. Do the checks of [Check for a live holder](#check-for-a-live-holder), and decide from the facts that they read:
   - Check A shows `self`: you already are that orchestrator. Go to step 4.
   - Check A shows `held`: stop. Tell the human which session holds the name (pid, name, folder), so that the human can close it. That is a report, not a question.
   - Check A shows `free`: take the name. Do not ask the human.
   - Check A shows `unknown`: ask the human, and give the reason that the script printed.
4. If the status is `retired`, ask the human before you resume it.
5. Write your own session id in `session` and your host in `host`, in the front matter. In Claude Code, the id is in `$CLAUDE_CODE_SESSION_ID`, and the host is the output of `node <plugin root>/scripts/host-id.mjs` (see [Check for a live holder](#check-for-a-live-holder) for the plugin root). Then do the resume steps in [handoff.md](handoff.md).

## Check for a live holder

Run this check for a handoff note. It reads a fact with a command.

- **Check A.** If the `host` of the note is not this host (the output of `node <plugin root>/scripts/host-id.mjs`), the result of check A is `unknown`: the script sees only this machine. Otherwise run `node <plugin root>/scripts/holder-check.mjs <session>` with the `session` id of the note. The plugin root is the folder that holds `skills/`, `agents/`, and `scripts/`. It is two folders above the base directory that the harness prints when the skill loads. `holder-check.mjs` prints one line. Decide from the printed line only, not from the exit code. A node crash also exits 1. No line means `unknown`.
  - `held pid=... name=... cwd=... status=...` (exit 0): another live session holds that id.
  - `free` (exit 1): no live session holds it.
  - `unknown: <reason>` (exit 2): the check cannot tell, for example when `claude agents` fails or is missing, a process cannot be read, or its output does not parse. The script never says `free` after a failure.
  - `self pid=...` (exit 3): this session holds it. The script compares the pid with `$CLAUDE_PID`.
  - A usage message (exit 64): the call has no session id.

Notes on the checks:

- The script runs `claude agents --json`, a documented interface of Claude Code. It lists the active sessions on this machine. The script drops an entry only when it proves that the pid is dead or is another program. A live process named `claude`, a path that contains `claude`, or a versioned file name gives `held`. A live process named `node` (an npm install) or a Git Bash shell can be Claude, or can be a reused pid. So it gives `unknown`, and you ask the human. Set `CLAUDE_AGENTS_JSON_CMD` to use another command, for example `cat fixture.json` in a test.
- A `free` result for a session id does not prove that the orchestrator is gone. A new session can hold the name with a new id, or on another host.
- A session name in place of an id gives `unknown`. A note with no `session` gives the usage message. Count that as `unknown` too.

## New

1. Ask the human for a name and a one-sentence purpose, if the request has none. Suggest a name that fits the names of the project.
2. Make sure that the name is free: no note has it, also a note with `status: retired`.
3. Write the note from the template in [handoff.md](handoff.md), with `status: active`, your session in `session`, and an empty ledger. Add its pointer to the memory index.
4. Ask the human for the permissions of the new orchestrator. It has none at the start.

Done when the note exists and the roster shows the new orchestrator.

## Retire

When the human retires an orchestrator, set `status: retired` in its note, write the reason in the note. Keep the note, so that the roster keeps its history. In the memory index, mark its pointer as retired, or remove the pointer, so that the index stays short.
