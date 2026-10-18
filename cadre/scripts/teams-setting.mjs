// Turns on agent teams in one settings file, so that /cadre:setup can offer it.
// Usage: node teams-setting.mjs [local|project|user] [repo-root]
//   local    <repo>/.claude/settings.local.json  (the default; Claude Code ignores it in git only when
//            a .gitignore rule says so, and this script checks that rule)
//   project  <repo>/.claude/settings.json        (a committed file)
//   user     <CLAUDE_CONFIG_DIR or ~/.claude>/settings.json
// The repo root is the current folder when it is not given. The user scope ignores it.
// It sets env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS to "1" and keeps every other key.
// A missing file is created. A file that already has the value stays as it is. A BOM is accepted.
// The write goes to a temporary file in the same folder, then a rename.
// The rename is tried again on a Windows lock error (see renameWithRetry in local-store.mjs).
// For local, git check-ignore tests the file. If git says "not ignored" (exit 1), a second line
// follows. CADRE_GIT_CMD replaces git (a shell command). A test uses it.
// Output and exit code:
//   <path>              exit 0   the file has the setting, and this is the path
//   note: <path> is not in .gitignore; add it so it is not committed   (second line, local only)
//   unknown: <reason>   exit 2   the file or the scope is wrong. Nothing is written.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { renameWithRetry } from './local-store.mjs';

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

const scope = process.argv[2] || 'local';
const root = resolve(process.argv[3] || process.cwd());
const file = fileOf(scope, root);
let settings = {};
if (existsSync(file)) {
  try {
    settings = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    fail(`${file} is not valid JSON: ${e.message}`);
  }
  if (!isObject(settings)) fail(`${file} does not hold a JSON object`);
  if (settings.env !== undefined && !isObject(settings.env)) fail(`env in ${file} is not an object`);
}
if (settings.env?.[KEY] !== '1') {
  settings.env = { ...settings.env, [KEY]: '1' };
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`);
    renameWithRetry(temp, file);
  } catch (e) {
    rmSync(temp, { force: true });
    fail(`cannot write ${file}: ${e.message}`);
  }
}
console.log(file);
if (scope === 'local') {
  const git = process.env.CADRE_GIT_CMD;
  const r = git ? spawnSync(`${git} check-ignore -q "${file}"`, { shell: true, cwd: root }) : spawnSync('git', ['check-ignore', '-q', file], { cwd: root });
  if (r.status === 1) console.log(`note: ${file} is not in .gitignore; add it so it is not committed`);
}
