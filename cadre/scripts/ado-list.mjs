// List work items of one tag on Azure DevOps (ADO), so that no agent reads a list by hand. Change nothing.
// Usage: node ado-list.mjs orchestrators <org> <project>
//        node ado-list.mjs work <org> <project> <name>
// Output and exit code:
//   item id=<id> state=<state> type=<type> owner=<unique name|none> title=<title>
//                         one line for each item, exit 0. The title is the rest of the line.
//   none                  exit 0   the read worked and the list is empty
//   unknown: <reason>     exit 2   a read failed, or the list may be cut short. This is never none.
//   usage message on stderr        exit 64
// orchestrators: every item with the tag cadre:orchestrator, in any state. A new name is free only when
//   no line has its title. So a list that may be cut short is unknown, never a shorter list.
// work: the items with the tag cadre:work:<name> whose state is in the category Proposed or InProgress.
//   The category comes from the work item type. A state name is never compared.
// The calls: a WIQL query for the ids, then the items in groups of 200. Each item is kept only when its
// tags hold the exact tag. WIQL stops at 20000 ids, so 20000 or more gives `unknown: too many results; narrow the query`.
// Any status but 200, a 302, a 203, an empty body, and a body that is not JSON give `unknown: <reason>`.
// CADRE_ADO_CMD replaces the ADO client (see ado.mjs).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectUrl, readJson } from './ado.mjs';

function say(lines, code) {
  for (const line of lines) console.log(line);
  process.exit(code);
}
const unknown = (reason) => say([`unknown: ${reason}`], 2);

const [command, org, project, name, ...extra] = process.argv.slice(2);
if (!['orchestrators', 'work'].includes(command) || !org || !project || (command === 'work' && !name) || extra.length > (command === 'work' ? 0 : 1) || (command === 'orchestrators' && name !== undefined)) {
  console.error('usage: ado-list.mjs orchestrators <org> <project> | work <org> <project> <name>');
  process.exit(64);
}

const CAP = 20000;
const GROUP = 200;
const tag = command === 'orchestrators' ? 'cadre:orchestrator' : `cadre:work:${name}`;
if (command === 'work' && !/^[^'";,\u0000-\u001f\u007f]+$/.test(name)) unknown('the name holds a character that a tag cannot hold');

let base;
try {
  base = projectUrl(org, project);
} catch (e) {
  unknown(e.message);
}
const tmp = mkdtempSync(join(tmpdir(), 'cadre-ado-list-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
function call(what, method, url, body) {
  try {
    let file;
    if (body !== undefined) {
      file = join(tmp, `body${n++}.json`);
      writeFileSync(file, JSON.stringify(body));
    }
    return readJson(what, method, url, file).json;
  } catch (e) {
    return unknown(e.message);
  }
}

const found = call('the query', 'POST', `${base}/_apis/wit/wiql?api-version=7.1`, {
  query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Tags] CONTAINS '${tag}'`,
})?.workItems;
if (!Array.isArray(found)) unknown('the query answer has no list');
if (found.length >= CAP) unknown('too many results; narrow the query');
const ids = found.map((w) => w?.id);
if (ids.some((id) => !Number.isInteger(id))) unknown('the query answer has an id that is not a number');
if (ids.length === 0) say(['none'], 0);

const items = [];
for (let i = 0; i < ids.length; i += GROUP) {
  const group = ids.slice(i, i + GROUP);
  const value = call('the items', 'POST', `${base}/_apis/wit/workitemsbatch?api-version=7.1`, {
    ids: group,
    fields: ['System.Id', 'System.Title', 'System.State', 'System.WorkItemType', 'System.Tags', 'System.AssignedTo'],
  })?.value;
  if (!Array.isArray(value) || value.length !== group.length || group.some((id) => !value.some((v) => v?.id === id))) unknown('the items answer does not hold each item that was asked for');
  items.push(...value);
}

let open = () => true;
if (command === 'work') {
  const list = call('the work item types', 'GET', `${base}/_apis/wit/workitemtypes?api-version=7.1`)?.value;
  if (!Array.isArray(list)) unknown('the work item types answer has no list');
  open = (f) => {
    const category = list.find((t) => t?.name === f['System.WorkItemType'])?.states?.find((s) => s?.name === f['System.State'])?.category;
    if (category === undefined) unknown(`the type ${String(f['System.WorkItemType']).slice(0, 40)} lists no state ${String(f['System.State']).slice(0, 40)}`);
    return category === 'Proposed' || category === 'InProgress';
  };
}

const lines = [];
for (const item of items) {
  const f = item.fields ?? {};
  if (!String(f['System.Tags'] ?? '').split(';').some((t) => t.trim() === tag)) continue;
  if (!open(f)) continue;
  const owner = typeof f['System.AssignedTo']?.uniqueName === 'string' && f['System.AssignedTo'].uniqueName !== '' ? f['System.AssignedTo'].uniqueName : 'none';
  const title = String(f['System.Title'] ?? '').replace(/\s+/g, ' ').trim();
  lines.push(`item id=${item.id} state=${f['System.State']} type=${f['System.WorkItemType']} owner=${owner} title=${title}`);
}
say(lines.length > 0 ? lines : ['none'], 0);
