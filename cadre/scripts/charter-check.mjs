// Check the charter of a repo against this plugin. Print one line.
// Usage: node charter-check.mjs [repo-root]      (the default root is the current folder)
// Output and exit code:
//   ok                       exit 0   same schema, and the charter is not older than the plugin
//   older-cadre              exit 0   same schema, written by an older cadre: continue with a note
//   missing                  exit 1   the repo has no charter
//   stale <old> <new>        exit 1   the charter schema is older than the plugin schema
//   plugin-too-old           exit 1   the charter schema is newer than the plugin schema
//   unknown: <reason>        exit 2   the check cannot tell. Treat it as a refusal.
// The charter is docs/agents/cadre-charter.md. It is Markdown with YAML front matter.
// The script reads two fields: `charter_schema` (a positive integer) and `written_by: cadre <version>`.
// Any other front matter is skipped. The parser is strict about the lines at the top level.
// The plugin version comes from .claude-plugin/plugin.json of the plugin that holds this script.
// The plugin schema is the constant below. Raise it only when an old charter cannot work.
// A test can set CADRE_SCHEMA to a positive integer to replace the constant.
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PLUGIN_SCHEMA = 1;
const CHARTER = 'docs/agents/cadre-charter.md';
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

function unquote(value) {
  const m = /^(["'])(.*)\1$/.exec(value);
  return m ? m[2] : value;
}

// Return { charter_schema, written_by } from the front matter, or throw an Error with the reason.
function readFields(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0] !== '---') throw new Error('the front matter does not start on line 1');
  const end = lines.indexOf('---', 1);
  if (end === -1) throw new Error('the front matter has no closing ---');
  const found = {};
  for (const [i, line] of lines.slice(1, end).entries()) {
    if (line.trim() === '' || /^\s/.test(line) || line.startsWith('#') || line.startsWith('- ') || line === '-') continue;
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/.exec(line);
    if (!m) throw new Error(`front matter line ${i + 2} is not a key and a value`);
    if (m[1] === 'charter_schema' || m[1] === 'written_by') {
      if (m[1] in found) throw new Error(`${m[1]} appears twice`);
      found[m[1]] = unquote((m[2] ?? '').trim());
    }
  }
  for (const key of ['charter_schema', 'written_by']) if (!(key in found)) throw new Error(`${key} is missing`);
  return found;
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

const root = resolve(process.argv[2] ?? '.');
const file = join(root, ...CHARTER.split('/'));

let schema = PLUGIN_SCHEMA;
if (process.env.CADRE_SCHEMA !== undefined) {
  if (!/^[1-9][0-9]*$/.test(process.env.CADRE_SCHEMA)) unknown('CADRE_SCHEMA is not a positive integer');
  schema = Number(process.env.CADRE_SCHEMA);
}

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

if (!/^[1-9][0-9]*$/.test(fields.charter_schema)) unknown(`${CHARTER}: charter_schema is not a positive integer`);
const written = /^cadre (\S+)$/.exec(fields.written_by);
const writtenParts = written ? parts(written[1]) : null;
if (!writtenParts) unknown(`${CHARTER}: written_by is not "cadre <version>"`);

const charterSchema = Number(fields.charter_schema);
if (charterSchema < schema) say(`stale ${charterSchema} ${schema}`, 1);
if (charterSchema > schema) say('plugin-too-old', 1);
say(compare(writtenParts, readPluginVersion()) < 0 ? 'older-cadre' : 'ok', 0);
