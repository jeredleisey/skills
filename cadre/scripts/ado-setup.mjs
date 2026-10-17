// Reads that /cadre:setup makes on Azure DevOps (ADO) before it asks. Each prints one line. Change nothing.
// Usage: node ado-setup.mjs area <org> <project> <repo>
//        node ado-setup.mjs type <org> <project> <work item type>
// area output (exit 0):
//   match: <area path>        an area of the project has the name of the repo. Propose it.
//                             Another match lower in the tree shows as "(also: <path>, ...)".
//   root: <project> <warning>  no area matches. Propose the project root, and say that items land there.
// type output:
//   ok type: <name>                                         exit 0   the type is enabled and has a state in
//                                                                    each category: Proposed, InProgress, Completed
//   refuse: <reason>. propose: <type>. <reason>             exit 1   disabled, missing, or without those states
//   refuse: <reason>. No other enabled type fits.           exit 1
// The proposal is Task when it is enabled and fits. Else it is the first fitting type of the requirement
// level, then of the task level.
//   unknown: <reason>                                       exit 2   a read failed. This is never a pass.
//   usage message on stderr                                 exit 64
// CADRE_ADO_CMD replaces the ADO client. See ado.mjs.
import { projectUrl, readJson } from './ado.mjs';
import { say } from './out.mjs';

const unknown = (reason) => say(`unknown: ${reason}`, 2);

const [command, org, project, name, ...extra] = process.argv.slice(2);
if (!['area', 'type'].includes(command) || !org || !project || !name || extra.length > 0) {
  console.error('usage: ado-setup.mjs area <org> <project> <repo> | type <org> <project> <work item type>');
  process.exit(64);
}

let base;
try {
  base = projectUrl(org, project);
} catch (e) {
  unknown(e.message);
}
function read(what, path) {
  try {
    return readJson(what, 'GET', `${base}/_apis/${path}`).json;
  } catch (e) {
    return unknown(e.message);
  }
}

const squash = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

function area() {
  const root = read('the area tree', 'wit/classificationnodes/areas?%24depth=4&api-version=7.1');
  if (typeof root?.name !== 'string') unknown('the area tree has no name');
  const want = squash(name);
  const found = [];
  // Breadth first, so that the shallowest match comes first.
  let level = [{ node: root, path: root.name }];
  while (level.length > 0) {
    const next = [];
    for (const { node, path } of level) {
      for (const child of Array.isArray(node.children) ? node.children : []) {
        if (typeof child?.name !== 'string') continue;
        next.push({ node: child, path: `${path}\\${child.name}` });
        if (want !== '' && squash(child.name) === want) found.push(`${path}\\${child.name}`);
      }
    }
    level = next;
  }
  if (found.length === 0) say(`root: ${root.name}. No area matches ${name}. Items then land at the project root, which names no program.`, 0);
  say(`match: ${found[0]}${found.length > 1 ? ` (also: ${found.slice(1).join(', ')})` : ''}`, 0);
}

function type() {
  const list = read('the work item types', 'wit/workitemtypes?api-version=7.1')?.value;
  if (!Array.isArray(list)) unknown('the work item types answer has no list');
  const byName = new Map(list.filter((t) => typeof t?.name === 'string').map((t) => [t.name.toLowerCase(), t]));
  const hasState = (t, category) => Array.isArray(t.states) && t.states.some((s) => s?.category === category);
  // A reason that the type does not fit, or null when it fits.
  const problem = (t, label) => {
    if (!t) return `${label} is not a work item type of this project`;
    if (t.isDisabled === true) return `${t.name} is disabled in this project`;
    for (const category of ['Proposed', 'InProgress', 'Completed']) if (!hasState(t, category)) return `${t.name} has no state in the category ${category}`;
    return null;
  };
  const chosen = byName.get(name.toLowerCase());
  const why = problem(chosen, name);
  if (why === null) say(`ok type: ${chosen.name}`, 0);

  const fits = (candidate) => candidate.toLowerCase() !== name.toLowerCase() && problem(byName.get(candidate.toLowerCase()), candidate) === null;
  let proposal = fits('Task') ? byName.get('task').name : null;
  if (proposal === null) {
    const categories = read('the work item type categories', 'wit/workitemtypecategories?api-version=7.1')?.value;
    if (!Array.isArray(categories)) unknown('the categories answer has no list');
    for (const level of ['Microsoft.RequirementCategory', 'Microsoft.TaskCategory']) {
      const members = categories.find((c) => c?.referenceName === level)?.workItemTypes;
      const hit = (Array.isArray(members) ? members : []).map((m) => m?.name).find((n) => typeof n === 'string' && fits(n));
      if (hit) {
        proposal = byName.get(hit.toLowerCase()).name;
        break;
      }
    }
  }
  if (proposal === null) say(`refuse: ${why}. No other enabled type fits.`, 1);
  say(`refuse: ${why}. propose: ${proposal}. ${proposal} is enabled and has the states that an orchestrator item needs.`, 1);
}

if (command === 'area') area();
else type();
