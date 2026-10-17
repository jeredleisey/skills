// A stand-in for the ADO client, for tests. It is not a test file.
// The scripts run `<CADRE_ADO_CMD> <METHOD> "<url>" ["<body file>"]`. This fake answers from a table.
// The table is a JSON file named by FAKE_ADO_ROUTES. Its keys are "METHOD url". A value is
//   { status, body, continuation }  body is an object (sent as JSON) or a string (sent as it is)
//   { crash: true }                 the command fails with exit 1
// A key that is not in the table answers 404. Each request is appended to <table>.log as one JSON line.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function makeFake(dir) {
  mkdirSync(dir, { recursive: true });
  const program = join(dir, 'fake-ado.mjs');
  writeFileSync(
    program,
    `import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const [method, url, bodyFile] = process.argv.slice(2);
const table = process.env.FAKE_ADO_ROUTES;
const routes = JSON.parse(readFileSync(table, 'utf8'));
const body = bodyFile && existsSync(bodyFile) ? readFileSync(bodyFile, 'utf8') : null;
appendFileSync(table + '.log', JSON.stringify({ method, url, body }) + '\\n');
const hit = routes[method + ' ' + url];
if (!hit) { process.stdout.write('404\\n{"message":"no such route"}'); process.exit(0); }
if (hit.crash) { console.error('fake: crash'); process.exit(1); }
const text = typeof hit.body === 'string' ? hit.body : JSON.stringify(hit.body ?? {});
process.stdout.write((hit.status ?? 200) + (hit.continuation ? ' ' + hit.continuation : '') + '\\n' + text);
`,
  );
  let n = 0;
  return {
    // The environment for one run. `routes` maps "METHOD url" to an answer.
    env(routes) {
      const file = join(dir, `routes-${n++}.json`);
      writeFileSync(file, JSON.stringify(routes));
      return { CADRE_ADO_CMD: `"${process.execPath}" "${program}"`, FAKE_ADO_ROUTES: file };
    },
    // The requests of one run, as [{ method, url, body }].
    requests(env) {
      try {
        return readFileSync(env.FAKE_ADO_ROUTES + '.log', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
      } catch {
        return [];
      }
    },
  };
}

export const BASE = 'https://dev.azure.com/example-org';
