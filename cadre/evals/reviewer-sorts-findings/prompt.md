---
description: The reviewer sorts findings into must-fix, should-fix, and nit.
tags: [review]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Agent, Skill, Read, Glob, Grep]
---

Start the cadre:reviewer agent with this brief, and give me its final message.

Brief. Worktree: the current folder, branch topic. Fixed point: main. Spec: the function average(items) in calc.js returns the mean of a list of numbers, and 0 for an empty list. The standards of the repo: no debug output in committed code.
