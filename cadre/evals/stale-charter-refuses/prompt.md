---
description: A charter older than the plugin schema. The orchestrator stops and names /cadre:setup.
tags: [safety]
max_turns: 10
allowed_tools: [Skill, Read, Glob, Grep]
append_system_prompt: 'Test setup. The plugin schema of this test is 2. Write CADRE_SCHEMA=2 before node in each command that runs charter-check.mjs.'
---

resume as kestrel
