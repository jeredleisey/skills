// Check a grant in an Azure DevOps (ADO) orchestrator item before a one-way step.
// Usage: node grant-check-ado.mjs <work-item-id> <session-id> "<action>"      (run in the repo root)
// The output lines and the exit codes are those of grant-check.mjs (GitHub). The charter, the owner check, the
// description rules, and the Ledger parse are those of resume-read-ado.mjs. The script makes GET calls only.
// CADRE_ADO_CMD replaces the ADO client (see ado.mjs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { orgUrl, projectUrl, readJson } from './ado.mjs';
import { parseFrontMatter } from './charter-front-matter.mjs';
import { grantAnswer, grantLines, same } from './resume-core.mjs';
import { say as done } from './out.mjs';

const unknown = (reason) => done(`unknown: ${reason}`, 2);

const [itemId, sessionArg, action, ...extra] = process.argv.slice(2);
if (!/^[0-9]+$/.test(itemId ?? '') || !sessionArg || !(action ?? '').trim() || extra.length > 0) {
  console.error('usage: grant-check-ado.mjs <work-item-id> <session-id> "<action>"');
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
let lines;
try {
  lines = grantLines(headRow.cells, bodyRows.map((r) => r.cells).filter((cells) => !cells.every((c) => c === '')), assignee, sessionArg, action);
} catch (e) {
  unknown(e.message);
}

done(...grantAnswer(lines));
