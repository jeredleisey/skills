// Write text to stdout and wait until all of it is written. A script that calls process.exit() right
// after console.log() on a pipe loses the part that the reader has not taken yet (a pipe holds 16 to 64 KB).
// writeSync blocks until the reader takes the data, and it retries when the pipe is full. It gives up
// after about 10 seconds: a reader that takes nothing for that long is gone.
import { writeSync } from 'node:fs';

const WAIT_MS = 2;
const GIVE_UP_MS = 10000;

export function writeOut(text) {
  const bytes = Buffer.from(text, 'utf8');
  let done = 0;
  let waited = 0;
  while (done < bytes.length) {
    try {
      const n = writeSync(1, bytes, done);
      if (n > 0) waited = 0;
      done += n;
    } catch (e) {
      if (e.code === 'EPIPE' || e.code === 'EOF') return; // the reader closed the pipe
      if (e.code !== 'EAGAIN') throw e;
      if (waited >= GIVE_UP_MS) {
        console.error('the reader of stdout took no data for 10 seconds');
        process.exit(2);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, WAIT_MS);
      waited += WAIT_MS;
    }
  }
}

// Print one line, or each line of a list, wait until it is written, and exit.
export function say(lines, code) {
  writeOut((Array.isArray(lines) ? lines : [lines]).map((l) => `${l}\n`).join(''));
  process.exit(code);
}
