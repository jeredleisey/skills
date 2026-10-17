// Print the skill for each capability of one role card. Print one line per capability.
// Usage: node skill-map.mjs <card> [repo-root]      (the default root is the current folder)
// Output and exit code:
//   <capability> <skill name>     exit 0   one line per capability of the card, or "none"
//   unknown: <reason>             exit 2   no charter, a bad charter, or an unknown card, preset, or capability
// The charter is docs/agents/cadre-charter.md. The script reads two front matter fields:
//   skill_pack     a preset name from PRESETS below. Absent means none.
//   capabilities   overrides, as items `<capability>=<skill name or none>`, in an inline list or `- item` lines.
// PRESETS is the one table of the skill map. The spec table in the docs points here.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseFrontMatter } from './charter-front-matter.mjs';
import { writeOut } from './out.mjs';

const PRESETS = {
  'mattpocock-skills': {
    'test-first': 'mattpocock-skills:tdd',
    'debugging': 'mattpocock-skills:diagnosing-bugs',
    'code-review': 'mattpocock-skills:code-review',
    'research': 'mattpocock-skills:research',
    'design-vocabulary': 'mattpocock-skills:codebase-design',
    'verification': 'none',
  },
  superpowers: {
    'test-first': 'superpowers:test-driven-development',
    'debugging': 'superpowers:systematic-debugging',
    'code-review': 'superpowers:requesting-code-review',
    'research': 'none',
    'design-vocabulary': 'none',
    'verification': 'superpowers:verification-before-completion',
  },
  none: {
    'test-first': 'none',
    'debugging': 'none',
    'code-review': 'none',
    'research': 'none',
    'design-vocabulary': 'none',
    'verification': 'none',
  },
};

const CARDS = {
  coder: ['test-first', 'design-vocabulary', 'verification'],
  reviewer: ['code-review'],
  researcher: ['research'],
  tester: ['test-first', 'debugging'],
};

function say(lines, code) {
  writeOut(`${lines.join('\n')}\n`);
  process.exit(code);
}
const unknown = (reason) => say([`unknown: ${reason}`], 2);

const [card, rootArg] = process.argv.slice(2);
if (!card) unknown('no card given');
if (!Object.hasOwn(CARDS, card)) unknown(`unknown card ${card}`);

let fields;
try {
  const text = readFileSync(join(resolve(rootArg ?? '.'), 'docs', 'agents', 'cadre-charter.md'), 'utf8');
  fields = parseFrontMatter(text, ['skill_pack', 'capabilities']);
} catch (e) {
  unknown(`charter: ${e.message}`);
}

let pack = 'none';
if ('skill_pack' in fields.values) {
  pack = fields.values.skill_pack;
  if (!Object.hasOwn(PRESETS, pack)) unknown(`bad skill_pack "${pack}", use one of ${Object.keys(PRESETS).join(', ')}`);
}

const map = { ...PRESETS[pack] };
// Two forms: the inline list `[a=b, c=d]`, or `- a=b` lines. The parser reads both into `lists`.
const raw = fields.values.capabilities;
const items = fields.lists.capabilities ?? [];
if (raw !== undefined && raw !== '') {
  const inline = /^\[(.*)\]$/.exec(raw);
  if (!inline) unknown('capabilities must be an inline list [a=b, c=d] or "- a=b" lines');
  const count = inline[1].trim() === '' ? 0 : inline[1].split(',').length;
  if (items.length !== count) unknown('capabilities mixes the inline list and "- a=b" lines');
}
const seen = new Set();
for (const item of items) {
  const m = /^([^=\s]+)\s*=\s*(\S+)$/.exec(item);
  if (!m) unknown(`bad capabilities item "${item}", use <capability>=<skill or none>`);
  if (!Object.hasOwn(map, m[1])) unknown(`unknown capability ${m[1]}`);
  if (seen.has(m[1])) unknown(`capability ${m[1]} is listed twice`);
  seen.add(m[1]);
  map[m[1]] = m[2];
}

say(CARDS[card].map((c) => `${c} ${map[c]}`), 0);
