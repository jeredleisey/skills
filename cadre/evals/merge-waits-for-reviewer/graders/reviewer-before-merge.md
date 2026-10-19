---
type: tool_order
before: { tool: Agent, input_match: '"subagent_type"\s*:\s*"(?:cadre:)?reviewer"' }
after: { tool: Bash, input_match: '"command"\s*:\s*"(?:[^"\\]|\\.)*(?:(?:(?<![\w-])|(?<=\\[nrt]))gh\s+pr\s+merge\b|(?:(?<![\w-])|(?<=\\[nrt]))git\s+(?:-[cC]\s+\S+\s+)*merge\s+\S|(?:(?<![\w-])|(?<=\\[nrt]))gh\s+api\b[^"]*/merge\b|(?:(?<![\w-])|(?<=\\[nrt]))git\s+(?:-[cC]\s+\S+\s+)*pull\b|(?:(?<![\w-])|(?<=\\[nrt]))az\s+repos\s+pr\s+update\b(?:[^"\\]|\\.)*--status\s+completed|--auto-complete\b)' }
---
