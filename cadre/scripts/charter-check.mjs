// Check the charter of a repo against this plugin. Print one line.
// Usage: node charter-check.mjs [repo-root]      (the default root is the current folder)
//        node charter-check.mjs --schema         (print the plugin schema, exit 0)
// Output and exit code:
//   ok                       exit 0   same schema, and the charter is not older than the plugin
//   older-cadre              exit 0   same schema, written by an older cadre: continue with a note
//   missing                  exit 1   the repo has no charter
//   stale <old> <new>        exit 1   the charter schema is older than the plugin schema
//   plugin-too-old           exit 1   the charter schema is newer than the plugin schema
//   unknown: <reason>        exit 2   the check cannot tell. Treat it as a refusal.
// The charter is docs/agents/cadre-charter.md. It is Markdown with YAML front matter.
// The script reads two fields: `charter_schema` (a positive integer) and `written_by: cadre <version>`.
// Any other front matter is skipped. The parser is charter-front-matter.mjs. It is strict about the lines at the top level.
// The plugin version comes from .claude-plugin/plugin.json of the plugin that holds this script.
// The plugin schema is the constant below. Raise it only when an old charter cannot work.
// Only a test sets CADRE_SCHEMA, to a positive integer, to replace the constant.
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseFrontMatter } from './charter-front-matter.mjs';

const PLUGIN_SCHEMA = 1;
const CHARTER = 'docs/agents/cadre-charter.md';
const POSITIVE_INT = /^[1-9][0-9]*$/;
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;

function say(line, code) {
  console.log(line);
  process.exit(code);
}
const unknown = (reason) => say(`unknown: ${reason}`, 2);

function parts(version) {
  const m = VERSION.exec(version);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

// Return { charter_schema, written_by } from the front matter, or throw an Error with the reason.
function readFields(text) {
  const { values } = parseFrontMatter(text, ['charter_schema', 'written_by']);
  for (const key of ['charter_schema', 'written_by']) if (!(key in values)) throw new Error(`${key} is missing`);
  return values;
}

function readPluginVersion() {
  const file = join(import.meta.dirname, '..', '.claude-plugin', 'plugin.json');
  let version;
  try {
    version = JSON.parse(readFileSync(file, 'utf8')).version;
  } catch (e) {
    unknown(`cannot read the plugin version: ${e.code || e.message}`);
  }
  const p = typeof version === 'string' ? parts(version) : null;
  if (!p) unknown('the plugin version is not a version');
  return p;
}

let schema = PLUGIN_SCHEMA;
if (process.env.CADRE_SCHEMA !== undefined) {
  if (!POSITIVE_INT.test(process.env.CADRE_SCHEMA)) unknown('CADRE_SCHEMA is not a positive integer');
  schema = Number(process.env.CADRE_SCHEMA);
}
if (process.argv[2] === '--schema') say(String(schema), 0);

const root = resolve(process.argv[2] ?? '.');
const file = join(root, ...CHARTER.split('/'));

try {
  if (!statSync(root).isDirectory()) unknown(`${root} is not a folder`);
} catch (e) {
  unknown(`cannot read ${root}: ${e.code || e.message}`);
}

let text;
try {
  text = readFileSync(file, 'utf8');
} catch (e) {
  if (e.code === 'ENOENT') say('missing', 1);
  unknown(`cannot read ${CHARTER}: ${e.code || e.message}`);
}

let fields;
try {
  fields = readFields(text);
} catch (e) {
  unknown(`${CHARTER}: ${e.message}`);
}

if (!POSITIVE_INT.test(fields.charter_schema)) unknown(`${CHARTER}: charter_schema is not a positive integer`);
const written = /^cadre (\S+)$/.exec(fields.written_by);
const writtenParts = written ? parts(written[1]) : null;
if (!writtenParts) unknown(`${CHARTER}: written_by is not "cadre <version>"`);

const charterSchema = Number(fields.charter_schema);
if (charterSchema < schema) say(`stale ${charterSchema} ${schema}`, 1);
if (charterSchema > schema) say('plugin-too-old', 1);
say(compare(writtenParts, readPluginVersion()) < 0 ? 'older-cadre' : 'ok', 0);
