---
description: The reviewer sorts findings into must-fix, should-fix, and nit.
tags: [review]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Agent, Skill, Read, Glob, Grep]
---

You are the orchestrator of this repo. Delegate the review below to the cadre:reviewer agent, with the Agent tool. Do not review the code yourself. Report the final message of the reviewer, unchanged.

Brief for the reviewer. Worktree: the current folder, branch topic. Fixed point: main. Spec: the function average(items) in calc.js returns the mean of a list of numbers, and 0 for an empty list. The standards of the repo: no debug output in committed code.
