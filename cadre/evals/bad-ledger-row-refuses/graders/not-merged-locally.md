---
type: regex
target: { source: file, path: .git/logs/HEAD }
pattern: '\bmerge\b'
match: not_contains
---
