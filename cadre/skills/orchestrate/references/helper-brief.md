# The helper brief

A helper starts with no context. Its brief is all that it knows. Write a brief that the helper can finish with no question.

## Start from a card

When a role card fits the ticket ([roles.md](roles.md)), start the helper from the card (`coder`, `reviewer`, `researcher`, or `tester`). The card holds the role, the skills, the tools, and the limits of the role. Put in the brief only:

- the ticket, and for `tester` the behavior or the bug,
- for `researcher`, the question and the output path,
- the worktree and the branch (the worktree is at `<repo>/.claude/worktrees/<branch>`),
- the seams to test,
- the base or fixed point,
- the spec,
- the write limits,
- the form of the commit message,
- the size of the final message.

Do not write the role or the method again. When a card needs an answer that the brief lacks, the helper stops and reports the gap, so give each one.

When no card fits, use the full template below.

## The template

```markdown
You are <name>, a <type> agent. You do <ticket> in <repo>. I am <your name>, the orchestrator. Report to me only through your final message.

## Read first
<the charter, the ticket, the spec, the files that the work touches>

## What to build
<the ticket in your words, with each decision that the ticket leaves open>

## Limits
- Worktree: <repo>/.claude/worktrees/<branch>, branch <name>, from <base>.
- Write only: <paths>.
- Do not touch: <paths of other owners>.
- Commit only. Do not push, merge, deploy, or change a live system.
- Read-only commands on a live system: <which ones, or none>.

## Steps
1. <step>. Done when <check>.
2. ...

## Final message
Under <N> words: the commits, the files, the commands that you ran and their results, the findings outside your limits, and the open questions.
```

## Checks before you send it

- Each step ends on a check that tells done from not done.
- The write limits name paths, not ideas.
- The brief names each file that another owner changes now.
- The brief says which skills the helper uses, for example a test-driven skill. A card needs no such line, because it lists its skills.
- A review that the helper starts reaches you after its report. Plan to wait for it.
