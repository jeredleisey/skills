// The one command that CI calls. It runs checks 1 to 5 and fails if any of them fails.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { rootFromArgs, toolsDir } from './lib.mjs';

const root = rootFromArgs();
let failed = false;
for (const script of ['check-manifests.mjs', 'check-links.mjs', 'check-budget.mjs', 'check-deny.mjs', 'check-cards.mjs']) {
  const r = spawnSync(process.execPath, [join(toolsDir, script), root], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
