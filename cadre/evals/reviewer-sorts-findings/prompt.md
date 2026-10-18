---
description: The reviewer sorts findings into must-fix, should-fix, and nit.
tags: [review]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Agent, Skill, Read, Glob, Grep]
---

You are the orchestrator of this repo. Delegate the review below to the cadre:reviewer agent, with the Agent tool. Do not review the code yourself. Report the final message of the reviewer, unchanged.

Brief for the reviewer. Worktree: the current folder, branch topic. Fixed point: main. Spec: the function average(items) in calc.js returns the mean of a list of numbers, and 0 for an empty list. The standards of the repo: no debug output in committed code.
If git does not run in your sandbox, review this diff of calc.js since main, and still report in the form of your card:

```
+// Return the mean of a list of numbers. Return 0 for an empty list.
+// This is usefull for the totals page.
+export function average(items) {
+  if (items.length === 0) return 0;
+  console.log('debug', items);
+  return sum(items) / (items.length + 1);
+}
```
