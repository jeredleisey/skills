// A TaskCompleted hook. With agent teams on, only the lead completes a task, after it verifies.
// Usage: node task-completed.mjs        (the hook JSON arrives on stdin)
// Output and exit code:
//   nothing, exit 0     agent teams are off, or the call has no agent_id and no agent_type (the lead)
//   a reason on stderr  exit 2   the completion is blocked: a helper or teammate made it, or the hook cannot tell
// Docs: exit code 2 stops the completion and feeds stderr back to the model. agent_id is set for a
// subagent or an in-process teammate. agent_type is set there too, and in a session run with --agent.
// A field that is present counts, even empty or null. This is the rule of guard.mjs.
// Agent teams are on when CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS is 1, true, yes, or on.
import { readFileSync } from 'node:fs';

const teamsOn = /^(1|true|yes|on)$/i.test(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS ?? '');

try {
  if (teamsOn) {
    let input;
    try {
      input = JSON.parse(readFileSync(0, 'utf8'));
    } catch (e) {
      throw new Error(`the hook input is not JSON: ${e.message}`);
    }
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('the hook input is not an object');
    if ('agent_id' in input || 'agent_type' in input) {
      console.error('Only the lead completes a task, after it verifies. Report the result to the lead.');
      process.exit(2);
    }
  }
} catch (e) {
  console.error(`cadre blocks this completion, because the hook failed: ${e.message}`);
  process.exit(2);
}
