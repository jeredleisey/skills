// Turns on agent teams in one settings file, so that /cadre:setup can offer it.
// Usage: node teams-setting.mjs [local|project|user] [repo-root]
//   local    <repo>/.claude/settings.local.json  (the default; Claude Code keeps it out of git)
//   project  <repo>/.claude/settings.json        (a committed file)
//   user     <CLAUDE_CONFIG_DIR or ~/.claude>/settings.json
// The repo root is the current folder when it is not given. The user scope ignores it.
// It sets env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS to "1" and keeps every other key.
// A missing file is created. A file that already has the value stays as it is.
// Output and exit code:
//   <path>              exit 0   the file has the setting, and this is the path
//   unknown: <reason>   exit 2   the file or the scope is wrong. Nothing is written.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const KEY = 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS';
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(reason) {
  console.log(`unknown: ${reason}`);
  process.exit(2);
}

function fileOf(scope, root) {
  if (scope === 'local') return join(root, '.claude', 'settings.local.json');
  if (scope === 'project') return join(root, '.claude', 'settings.json');
  if (scope === 'user') return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json');
  return fail(`the scope must be local, project, or user, not ${scope}`);
}

const file = fileOf(process.argv[2] || 'local', resolve(process.argv[3] || process.cwd()));
let settings = {};
if (existsSync(file)) {
  try {
    settings = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`${file} is not valid JSON: ${e.message}`);
  }
  if (!isObject(settings)) fail(`${file} does not hold a JSON object`);
  if (settings.env !== undefined && !isObject(settings.env)) fail(`env in ${file} is not an object`);
}
if (settings.env?.[KEY] !== '1') {
  settings.env = { ...settings.env, [KEY]: '1' };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
}
console.log(file);
