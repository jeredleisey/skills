// Find the preset files of the enabled plugins on this machine.
// Usage: node preset-discover.mjs
// Output and exit code:
//   {"count":N,"presets":[{"plugin","answers","defaults","notes"}]}   exit 0   N can be 0
//   unknown: <reason>                                                 exit 2   a command or a file failed
//   unknown: <plugin>: <reason>                                       exit 2   a preset file is bad
// The source is `claude plugin list --json`, a JSON array of plugin entries.
// Each entry has the fields id, enabled, and installPath.
// A plugin counts when it is enabled and its installPath holds cadre-presets.json.
// An entry with no installPath, or with no file there, has no preset.
// One plugin can be listed in two scopes. It counts once, by id.
// A failure never gives count 0, and a bad file is never skipped.
// Set CADRE_PLUGIN_LIST_CMD to a shell command that prints the list.
// A test can use it to read a fixture.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = 'cadre-presets.json';
const SCHEMA = 1;

function done(line, code) {
  console.log(line);
  process.exit(code);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The checked parts of one preset file, or a throw with the reason.
function parsePreset(text) {
  let data;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('the file is not JSON');
  }
  if (!isObject(data)) throw new Error('the file is not a JSON object');
  if (data.preset_schema !== SCHEMA) throw new Error(`unknown preset_schema, this cadre reads ${SCHEMA}`);
  const out = {};
  for (const key of ['answers', 'defaults', 'notes']) {
    const value = data[key] ?? {};
    if (!isObject(value)) throw new Error(`${key} is not an object`);
    if (Object.values(value).some((v) => v === null)) throw new Error(`${key} holds a null value`);
    out[key] = value;
  }
  if (Object.values(out.notes).some((v) => typeof v !== 'string')) throw new Error('a note is not a string');
  return out;
}

const cmd = process.env.CADRE_PLUGIN_LIST_CMD || 'claude plugin list --json';
const r = spawnSync(cmd, {
  shell: true,
  encoding: 'utf8',
  timeout: 30000,
  stdio: ['ignore', 'pipe', 'ignore'],
});
if (r.status !== 0) done(`unknown: the command failed: ${cmd}`, 2);
if (!r.stdout.trim()) done(`unknown: the command printed nothing: ${cmd}`, 2);

let list;
try {
  list = JSON.parse(r.stdout);
} catch {
  list = null;
}
if (!Array.isArray(list) || list.some((p) => !isObject(p))) {
  done('unknown: the output is not a JSON array of plugins', 2);
}

const seen = new Set();
const presets = [];
for (const p of list) {
  if (p.enabled !== true || typeof p.installPath !== 'string' || !p.installPath) continue;
  let text;
  try {
    text = readFileSync(join(p.installPath, FILE), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') continue; // no file: no preset
    done(`unknown: ${p.id ?? p.installPath}: cannot read ${FILE}: ${e.code ?? e.message}`, 2);
  }
  if (typeof p.id !== 'string' || !p.id) done(`unknown: ${p.installPath}: the entry has a preset file and no id`, 2);
  if (seen.has(p.id)) continue;
  seen.add(p.id);
  try {
    presets.push({ plugin: p.id, ...parsePreset(text) });
  } catch (e) {
    done(`unknown: ${p.id}: ${e.message}`, 2);
  }
}
done(JSON.stringify({ count: presets.length, presets }), 0);
