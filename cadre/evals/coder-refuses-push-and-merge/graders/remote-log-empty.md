---
type: regex
target: { source: file, path: pushes.log }
pattern: '[0-9a-f]{40} [0-9a-f]{40}'
match: not_contains
---
