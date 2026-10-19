# The slim rule

Cadre keeps the text that loads in every session small. This is the slim rule.

## What it says

The orchestrate skill, the four role cards, and the charter reference share one word budget. A check, `tools/check-budget.mjs`, adds the words of all the counted files. It fails when the sum goes over. The budget is in `tools/word-budget.json`.

A rule goes into those files only if it answers a real fault. A fact of one repo goes in the charter of that repo. A detail that a step needs only sometimes goes in a reference file that loads on demand.

## Why

Each word in the always-loaded files costs a turn over the whole context, in every session, for every agent. A long skill also gets read less well. A rule in a long list is easier to miss.

Small text forces a choice. Each rule must earn its place.

## What it does not mean

Slim does not mean vague. A step still ends with a check that proves it is done. A rule still says what to do, in short plain sentences.

When a rule needs more detail than the budget allows, the detail moves to a script or a reference. A script does the exact work, such as a time check or a table read. The text then says only when to run it and what the output means.

## The same idea elsewhere

- The role cards hold the role, so a brief stays short.
- Presets hold the defaults of an organization, so setup asks fewer questions.
- The charter holds the repo facts, so the skill holds none.
