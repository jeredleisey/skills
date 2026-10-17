// Read an orchestrator item on Azure DevOps (ADO) for a resume: owner check, holder, ledger audit, newest checkpoint.
// Usage: node resume-read-ado.mjs <work-item-id> [session-id]      (run in the repo root)
// The output lines and the exit codes are those of resume-read.mjs (GitHub). Only `state` differs in how it is read:
//   state=closed when the state of the item is in the category Completed or Removed, else open. The script
//   reads the category from the work item type. It never compares a state name.
// The org and the project come from `ado_org` and `ado_project` in the charter at docs/agents/cadre-charter.md
// of the current folder, and the charter must have `tracker: ado`.
// The item must have the tag cadre:orchestrator and be in that project. The owner check comes next. The account
// of the token (connectionData) must equal the one assignee, by unique name, ignoring case.
// The description is HTML. The form is in references/orchestrator-issue.md. The script is strict:
//   - a heading is exactly <h2>Name</h2>, and no heading is twice
//   - Ledger is one <table> with a header row of <th> cells and rows of <td> cells that hold text only
//   - Holder is one <pre> block with the three lines of the GitHub form
// A checkpoint is a comment by the owner. Its first text is the marker "cadre-checkpoint v1 <ISO UTC time>", and it
// has the three headings, as <h2> in HTML or as `##` lines in Markdown. A deleted comment does not count.
// Any other status than 200, a 302, an empty body, and a body that is not JSON give `unknown: <reason>`.
// The script never prints ok after a failure. It makes GET calls only.
// CADRE_ADO_CMD replaces the ADO client (see ado.mjs). The host id comes from host-id.mjs, so CADRE_HOME applies.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { orgUrl, projectUrl, readJson } from './ado.mjs';
import { parseFrontMatter } from './charter-front-matter.mjs';
import { auditLedger, holderWho, okLine, parseHolder, pickCheckpoint, same } from './resume-core.mjs';
import { say as done } from './out.mjs';

const unknown = (reason) => done(`unknown: ${reason}`, 2);

const [itemId, sessionArg, ...extra] = process.argv.slice(2);
if (!/^[0-9]+$/.test(itemId ?? '') || extra.length > 0) {
  console.error('usage: resume-read-ado.mjs <work-item-id> [session-id]');
  process.exit(64);
}

// ---- the charter ----

let org;
let project;
try {
  const text = readFileSync(join(process.cwd(), 'docs', 'agents', 'cadre-charter.md'), 'utf8');
  const { values } = parseFrontMatter(text, ['tracker', 'ado_org', 'ado_project']);
  if (values.tracker !== 'ado') throw new Error('the charter does not have tracker: ado');
  if (!values.ado_org || !values.ado_project) throw new Error('the charter lacks ado_org or ado_project');
  ({ ado_org: org, ado_project: project } = values);
} catch (e) {
  unknown(e.code === 'ENOENT' ? 'there is no charter in this folder' : `the charter is not usable: ${e.message}`);
}

// ---- reads ----

function read(what, url) {
  try {
    return readJson(what, 'GET', url).json;
  } catch (e) {
    return unknown(e.message);
  }
}
let orgBase;
let base;
try {
  orgBase = orgUrl(org);
  base = projectUrl(org, project);
} catch (e) {
  unknown(e.message);
}

const me = read('the user', `${orgBase}/_apis/connectionData?api-version=7.1-preview.1`)?.authenticatedUser?.properties?.Account?.$value;
if (typeof me !== 'string' || me.trim() === '') unknown('the token has no account name');
const item = read('the work item', `${base}/_apis/wit/workitems/${itemId}?api-version=7.1`);
const fields = item?.fields;
if (typeof fields !== 'object' || fields === null) unknown('the work item has no fields');

if (!String(fields['System.Tags'] ?? '').split(';').some((t) => t.trim() === 'cadre:orchestrator')) unknown(`item ${itemId} lacks the tag cadre:orchestrator`);
if (!same(String(fields['System.TeamProject'] ?? ''), project)) unknown(`item ${itemId} is not in the project ${project}`);
const assigned = fields['System.AssignedTo'];
const assignee = typeof assigned === 'object' && assigned !== null && !Array.isArray(assigned) ? assigned.uniqueName : undefined;
if (typeof assignee !== 'string' || assignee.trim() === '') unknown('the item needs exactly one assignee with a unique name');
if (!same(me.trim(), assignee.trim())) done(`not-owner login=${me.trim()} assignee=${assignee.trim()}`, 1);

// ---- the state, by category ----

const typeName = String(fields['System.WorkItemType'] ?? '');
if (typeName === '') unknown('the item has no work item type');
const states = read('the work item type', `${base}/_apis/wit/workitemtypes/${encodeURIComponent(typeName)}?api-version=7.1`)?.states;
const stateName = String(fields['System.State'] ?? '');
const category = (Array.isArray(states) ? states : []).find((s) => s?.name === stateName)?.category;
if (category === undefined) unknown(`the type ${typeName} lists no state ${stateName}`);
const KNOWN = ['Proposed', 'InProgress', 'Resolved', 'Completed', 'Removed'];
if (!KNOWN.includes(category)) unknown(`the state category ${String(category).slice(0, 30)} is not one that this script knows`);
const state = category === 'Completed' || category === 'Removed' ? 'closed' : 'open';

// ---- the description ----

const decode = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const html = fields['System.Description'];
if (typeof html !== 'string') unknown('the item has no description');
const text = html.replace(/\r\n/g, '\n');

const headings = [...text.matchAll(/<h2>([^<]*)<\/h2>/g)];
if ((text.match(/<h2\b/gi) ?? []).length !== headings.length) unknown('a heading is not in the form <h2>Name</h2>');
const sections = new Map();
headings.forEach((h, i) => {
  const title = decode(h[1]).trim().toLowerCase();
  if (sections.has(title)) unknown(`the description has the heading ${decode(h[1]).trim()} twice`);
  sections.set(title, text.slice(h.index + h[0].length, i + 1 < headings.length ? headings[i + 1].index : undefined));
});
const section = (name) => sections.get(name.toLowerCase()) ?? unknown(`the description has no ${name} section`);

// Holder: one <pre> block
const holderBlock = /^\s*<pre>([^<]*)<\/pre>\s*$/.exec(section('Holder'));
if (!holderBlock) unknown('the Holder section is not one <pre> block of text');
let holder;
let who;
try {
  holder = parseHolder(decode(holderBlock[1]).split('\n'));
  who = holderWho(holder, sessionArg);
} catch (e) {
  unknown(e.message);
}

// Ledger: one table
const tableBlock = /^\s*<table>([\s\S]*)<\/table>\s*$/.exec(section('Ledger'));
if (!tableBlock || /<\/?table\b/i.test(tableBlock[1])) unknown('the Ledger section is not one <table>');
const grid = [];
for (const row of tableBlock[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
  const cells = [...row[1].matchAll(/<(th|td)>([^<]*)<\/\1>/g)];
  if (row[1].replace(/<(th|td)>[^<]*<\/\1>/g, '').trim() !== '') unknown('a Ledger row holds markup inside or beside its cells');
  grid.push({ kinds: cells.map((c) => c[1]), cells: cells.map((c) => decode(c[2]).trim()) });
}
if (tableBlock[1].replace(/<tr>[\s\S]*?<\/tr>/g, '').trim() !== '') unknown('the Ledger table holds something besides rows');
const [headRow, ...bodyRows] = grid;
if (!headRow || headRow.kinds.some((k) => k !== 'th') || bodyRows.some((r) => r.kinds.some((k) => k !== 'td'))) unknown('the Ledger table has no header row of <th> cells and rows of <td> cells');
let audit;
try {
  audit = auditLedger(headRow.cells, bodyRows.map((r) => r.cells).filter((cells) => !cells.every((c) => c === '')), assignee, sessionArg);
} catch (e) {
  unknown(e.message);
}

// ---- the checkpoint ----

const entries = [];
let url = `${base}/_apis/wit/workItems/${itemId}/comments?api-version=7.1-preview.4&%24top=200`;
const seen = new Set();
for (let pages = 0; ; pages++) {
  if (pages >= 50) unknown('the comments have more than 50 pages');
  const answer = read('the comments', url);
  if (!Array.isArray(answer?.comments)) unknown('the comments answer has no list');
  for (const c of answer.comments) {
    if (c?.isDeleted === true || typeof c?.text !== 'string') continue;
    const first = /^\s*(?:<(?:p|div)>)?\s*([^<\n]*)/.exec(c.text);
    entries.push({
      id: c.id,
      author: String(c?.createdBy?.uniqueName ?? ''),
      firstLine: first ? decode(first[1]).trim() : '',
      headings: [...[...c.text.matchAll(/<h2>([^<]*)<\/h2>/gi)].map((m) => m[1]), ...[...c.text.matchAll(/^##[ \t]+(.*)$/gm)].map((m) => m[1])].map((h) => decode(h).trim().toLowerCase()),
    });
  }
  const next = answer.continuationToken;
  if (typeof next !== 'string' || next === '') break;
  if (seen.has(next)) unknown('the comments repeat a page token');
  seen.add(next);
  url = `${base}/_apis/wit/workItems/${itemId}/comments?api-version=7.1-preview.4&%24top=200&continuationToken=${encodeURIComponent(next)}`;
}
const checkpoint = pickCheckpoint(entries, assignee);

done(okLine({ who, holder, checkpoint, state, bad: audit.bad, ended: audit.ended }), 0);
