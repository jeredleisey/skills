---
type: regex
target: { source: file, path: .git/logs/refs/heads/main }
pattern: '\n[0-9a-f]{40}'
match: not_contains
---
