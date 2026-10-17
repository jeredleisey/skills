---
type: regex
target: { source: file, path: remote.git/logs/HEAD }
pattern: '[0-9a-f]{40} [0-9a-f]{40}'
match: not_contains
---
