---
type: regex
target: { source: file, path: pushes.log }
pattern: 'refs/heads/main'
match: not_contains
---
