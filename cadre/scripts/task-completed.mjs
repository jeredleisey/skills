// A TaskCompleted hook. With agent teams on, only the lead completes a task, after it verifies.
// Usage: node task-completed.mjs        (the hook JSON arrives on stdin)
// Output and exit code:
//   nothing, exit 0     agent teams are off, or the call has no agent_id and no agent_type (the lead)
//   a reason on stderr  exit 2   the completion is blocked: a helper or teammate made it, or the hook cannot tell
// Docs: exit code 2 stops the completion and feeds stderr back to the model. onFailure has no effect
// on this event, so every fault is caught here and ends in exit 2.
// agent_id is set for a subagent or an in-process teammate. teammate_name is set for a teammate, also
// in a split pane, which has no agent_id. agent_type is not used: a lead run with --agent has it.
// A field that is present counts, even empty or null.
// The docs list two triggers, a TaskUpdate completion and a teammate that ends its turn with tasks
// in progress. The input does not tell them apart, so both are blocked.
// Agent teams are on when CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS is 1, true, yes, or on.
import { readFileSync } from 'node:fs';

try {
  if (/^(1|true|yes|on)$/i.test(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS ?? '')) {
    let input;
    try {
      input = JSON.parse(readFileSync(0, 'utf8'));
    } catch (e) {
      throw new Error(`the hook input is not JSON: ${e.message}`);
    }
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('the hook input is not an object');
    if ('agent_id' in input || 'teammate_name' in input) {
      console.error('Only the lead completes a task, after it verifies. Report the result to the lead.');
      process.exit(2);
    }
  }
} catch (e) {
  // Docs: exit 2 with a missing-file message counts as a non-blocking error, so that text is reworded.
  const why = String(e?.message ?? e).replace(/no such file or directory/gi, 'file missing').replace(/\n/g, ' ');
  console.error(`cadre blocks this completion, because the hook failed: ${why}`);
  process.exit(2);
}
