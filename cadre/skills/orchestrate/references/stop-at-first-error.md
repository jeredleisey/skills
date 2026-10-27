# Stop at the first error

Step 6 item 5 of the skill points here.

## The fault

In the Bash tool, `set -e` has no effect. The tool runs the command as `eval "<command>" && true`. A shell ignores errexit for a command that is an operand of an `&&` list. So a failed step does not stop the next step. A subshell, as in `( set -e; ... )`, does not help. The same holds in bash and in zsh. A script file that bash runs by itself, such as `bash -e <file>`, is a new shell and does stop.

The harm is real. A step that built a new issue body failed. The next line, `gh issue edit <n> --body-file <file>`, still ran with an empty file and erased the body.

## The two forms that work

1. A guard after each step that can fail, or that a later step needs: `step || { echo "STOP: <step>"; exit 1; }`. The `exit 1` ends the command at once.
2. Write the steps to a file in the system temp folder, and run `bash -e <file>`. The file may use `set -euo pipefail`.

A test in the source repo of cadre shows both forms, and shows that `set -e` does not stop.

## Rules

- Put a guard before every step that deletes, writes, pushes, or merges, when an earlier step can fail. Do not chain a delete after a step that can fail.
- A pipe hides the failure of its first command. Guard the pipe, or use `bash -e <file>` with `set -o pipefail`.
- Check that a file that you build is not empty before a step sends it. See Write the body in `orchestrator-issue.md`.
