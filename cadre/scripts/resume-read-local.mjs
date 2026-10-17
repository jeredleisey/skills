// Read a local orchestrator file for a resume: owner check, holder, ledger audit, newest checkpoint.
// Usage: node resume-read-local.mjs <name> [session-id]
// Run it inside the repo or in one of its worktrees. The output lines, the exit codes, and the rules
// are those of resume-read.mjs (see its header), with these differences:
//   - The file is .cadre/orchestrators/<name>.md in the main clone (see local-store.mjs).
//   - The owner is the `owner:` line of the file. The user is the OS user name, or CADRE_LOCAL_USER.
//   - The state is the `state:` line. A checkpoint id is the time of its marker line, not a comment id.
//     There is no author to check: the file is the owner's, and the owner check covers it.
// The file is unknown when it is missing, a section is missing or twice, or a heading is in a code fence.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditLedger, holderWho, okLine, parseHolder, pickCheckpoint, same } from './resume-core.mjs';
import { locate, localUser, parseFile, slug } from './local-store.mjs';

function done(line, code) {
  console.log(line);
  process.exit(code);
}
const unknown = (reason) => done(`unknown: ${reason}`, 2);

const [name, sessionArg, ...extra] = process.argv.slice(2);
if (!name || !slug(name) || extra.length > 0) {
  console.error('usage: resume-read-local.mjs <name> [session-id]');
  process.exit(64);
}

let file;
let text;
try {
  file = join(locate().folder, 'orchestrators', `${slug(name)}.md`);
  text = readFileSync(file, 'utf8');
} catch (e) {
  unknown(e.code === 'ENOENT' ? `there is no file for ${name}` : `cannot read the file for ${name}: ${e.message}`);
}
let parsed;
try {
  parsed = parseFile(text);
} catch (e) {
  unknown(e.message);
}

const user = localUser();
if (!same(user, parsed.owner)) done(`not-owner login=${user} assignee=${parsed.owner}`, 1);
const section = (title) => parsed.sections.get(title.toLowerCase()) ?? unknown(`the file has no ${title} section`);

let holder;
let who;
try {
  holder = parseHolder(section('Holder'));
  who = holderWho(holder, sessionArg);
} catch (e) {
  unknown(e.message);
}

const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const [header, ...rows] = section('Ledger').filter((l) => l.trim().startsWith('|'));
let audit;
try {
  audit = auditLedger(
    header ? splitRow(header) : null,
    rows.map(splitRow).filter((cells) => !cells.every((c) => /^[:\s-]*$/.test(c))),
    parsed.owner,
    sessionArg,
  );
} catch (e) {
  unknown(e.message);
}

const checkpoint = pickCheckpoint(parsed.checkpoints.map((c) => ({ ...c, author: parsed.owner })), parsed.owner);
done(okLine({ who, holder, checkpoint, state: parsed.state, bad: audit.bad, ended: audit.ended }), 0);
