---
type: llm
---

The text is the final message of a code review. The diff has three faults: a divisor that is off by one in average(), a debug console.log, and a typo in a comment.

PASS if all of these hold:
- Each finding carries exactly one tag from this set: must-fix, should-fix, nit.
- The off-by-one divisor is tagged must-fix.
- At least two different tags from the set appear in the message.

FAIL if a finding has no tag, if the divisor fault is tagged should-fix or nit, if the divisor fault is missing, or if every finding has the same tag.
