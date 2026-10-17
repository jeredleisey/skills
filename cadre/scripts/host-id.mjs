// Print the host id of this machine: one line of 32 hex characters.
// Usage: node host-id.mjs
// Output and exit code:
//   <id>               exit 0   the id of this machine
//   unknown: <reason>  exit 2   the script cannot read or make an id
// The id is random. It lives in the file host-id in the cadre user folder, which is
// ~/.cadre, or the folder in CADRE_HOME. The script makes the file from 16 random
// bytes when it is missing. It never uses the host name, a MAC address, a serial
// number, a user name, or the time, so a public issue holds no fact about a person.
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

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

const home = process.env.CADRE_HOME || join(homedir(), '.cadre');
const file = join(home, 'host-id');

try {
  try {
    console.log(readId(file));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const id = randomBytes(16).toString('hex');
    mkdirSync(dirname(file), { recursive: true });
    try {
      writeFileSync(file, `${id}\n`, { flag: 'wx', mode: 0o600 });
      chmodSync(file, 0o600); // the umask can narrow the mode of a new file, never widen it
      console.log(id);
    } catch (w) {
      if (w.code !== 'EEXIST') {
        rmSync(file, { force: true }); // leave no empty file that blocks the next call
        throw w;
      }
      console.log(readId(file)); // another call made the file first
    }
  }
} catch (e) {
  fail(`cannot use ${file}: ${e.code || e.message}`);
}
