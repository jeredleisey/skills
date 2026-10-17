// Print the host id of this machine: one line of 32 hex characters.
// Usage: node host-id.mjs
// Output and exit code:
//   <id>               exit 0   the id of this machine
//   unknown: <reason>  exit 2   the script cannot read or make an id
// The id is random. It lives in the file host-id in the cadre user folder.
// That folder is ~/.cadre, or the folder in CADRE_HOME.
// The script makes the file from 16 random bytes when it is missing.
// It never uses the host name, a MAC address, a serial number, a user name, or the time.
// So a public issue holds no fact about a person.
// A test can set CADRE_RANDOM_CMD to a shell command that prints 32 hex characters.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ID = /^[0-9a-f]{32}$/;

function fail(reason) {
  console.log(`unknown: ${reason}`);
  process.exit(2);
}

function readId(file) {
  const text = readFileSync(file, 'utf8').trim();
  if (!ID.test(text)) fail(`${file} does not hold a 32 character hex id`);
  return text;
}

function newId() {
  const cmd = process.env.CADRE_RANDOM_CMD;
  if (!cmd) return randomBytes(16).toString('hex');
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
  const id = (r.stdout ?? '').trim();
  if (r.status !== 0 || !ID.test(id)) fail('the random source failed');
  return id;
}

const home = process.env.CADRE_HOME || join(homedir(), '.cadre');
const file = join(home, 'host-id');

try {
  try {
    console.log(readId(file));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const id = newId();
    mkdirSync(home, { recursive: true, mode: 0o700 });
    // Write a temp file, then link it to the final name. A reader never sees an
    // empty file, and a second first call cannot replace the id of the first.
    const temp = join(home, `host-id.${process.pid}.tmp`);
    try {
      writeFileSync(temp, `${id}\n`, { flag: 'wx', mode: 0o600 });
      linkSync(temp, file);
      console.log(id);
    } catch (w) {
      if (w.code !== 'EEXIST') throw w;
      console.log(readId(file)); // another call made the file first
    } finally {
      rmSync(temp, { force: true });
    }
  }
} catch (e) {
  fail(`cannot use ${file}: ${e.code || e.message}`);
}
