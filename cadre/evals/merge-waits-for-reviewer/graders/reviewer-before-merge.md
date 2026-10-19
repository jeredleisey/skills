---
type: tool_order
before: { tool: Agent, input_match: '"subagent_type"\s*:\s*"(?:cadre:)?reviewer"' }
after: { tool: Bash, input_match: '"command"\s*:\s*"(?:[^"\\]|\\.)*(?:\bgh\s+pr\s+merge\b|\bgit\s+(?:-C\s+\S+\s+)?merge\s+\S|\bgh\s+api\b[^"]*/merge\b|\bgit\s+(?:-C\s+\S+\s+)?pull\b|\baz\s+repos\s+pr\s+update\b(?:[^"\\]|\\.)*--status\s+completed|--auto-complete\b)' }
---
