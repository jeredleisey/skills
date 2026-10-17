// Write text to stdout and wait until all of it is written. A script that calls process.exit() right
// after console.log() on a pipe loses the part that the reader has not taken yet (a pipe holds 16 to 64 KB).
// writeSync blocks until the reader takes the data, and it retries when the pipe is full.
import { writeSync } from 'node:fs';

export function writeOut(text) {
  const bytes = Buffer.from(text, 'utf8');
  let done = 0;
  while (done < bytes.length) {
    try {
      done += writeSync(1, bytes, done);
    } catch (e) {
      if (e.code === 'EPIPE') return;
      if (e.code !== 'EAGAIN') throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
    }
  }
}
