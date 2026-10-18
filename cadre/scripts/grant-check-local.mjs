// Check a grant in a local orchestrator file before a one-way step.
// Usage: node grant-check-local.mjs <name> <session-id> "<action>"
// Run it inside the repo or in one of its worktrees. The output lines and the exit codes are those of
// grant-check.mjs. The file, the owner check, and the Ledger parse are those of resume-read-local.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { grantAnswer, grantLines, same } from './resume-core.mjs';
import { locate, localUser, parseFile, slug } from './local-store.mjs';
import { say as done } from './out.mjs';

const unknown = (reason) => done(`unknown: ${reason}`, 2);

const [name, sessionArg, action, ...extra] = process.argv.slice(2);
if (!name || !slug(name) || !sessionArg || !(action ?? '').trim() || extra.length > 0) {
  console.error('usage: grant-check-local.mjs <name> <session-id> "<action>"');
  process.exit(64);
}

let text;
try {
  const where = locate();
  if (!existsSync(where.folder)) throw Object.assign(new Error('x'), { code: 'NOSETUP' });
  text = readFileSync(join(where.folder, 'orchestrators', `${slug(name)}.md`), 'utf8');
} catch (e) {
  unknown(e.code === 'NOSETUP' ? 'not set up; run /cadre:setup' : e.code === 'ENOENT' ? `there is no file for ${name}` : `cannot read the file for ${name}: ${e.message}`);
}
let parsed;
try {
  parsed = parseFile(text);
} catch (e) {
  unknown(e.message);
}

const user = localUser();
if (!same(user, parsed.owner)) done(`not-owner login=${user} assignee=${parsed.owner}`, 1);
const ledger = parsed.sections.get('ledger') ?? unknown('the file has no Ledger section');

const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const [header, ...rows] = ledger.filter((l) => l.trim().startsWith('|'));
let lines;
try {
  lines = grantLines(
    header ? splitRow(header) : null,
    rows.map(splitRow).filter((cells) => !cells.every((c) => /^[:\s-]*$/.test(c))),
    parsed.owner,
    sessionArg,
    action,
  );
} catch (e) {
  unknown(e.message);
}
done(...grantAnswer(lines));
