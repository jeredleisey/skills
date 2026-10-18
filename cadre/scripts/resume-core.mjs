// The rules of a resume that do not depend on the tracker: the Holder, the Ledger audit, the checkpoint.
// resume-read.mjs (GitHub) and resume-read-ado.mjs (Azure DevOps) both call it, so the two read the same way.
// A function throws an Error with the reason when the input is not as expected. The caller prints `unknown: <reason>`.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export const list = (a) => (a.length ? a.join(',') : 'none');
export const rowList = (a) => `[${a.join(',')}]`;

const VALUE = { session: /^(none|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, host: /^(none|[0-9a-f]{32})$/, since: /^\S+$/ };

// Read the lines of the Holder section. Return { session, host, since }. `since` may be absent.
export function parseHolder(lines) {
  const holder = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = /^\s*[-*]?\s*(session|host|since):\s*`?([^`\s]*)`?\s*$/i.exec(line);
    const key = m?.[1].toLowerCase();
    if (!m || !VALUE[key].test(m[2])) throw new Error(`the Holder section has a bad line: ${line.trim().slice(0, 40)}`);
    if (key in holder) throw new Error(`the Holder section has ${key} twice`);
    holder[key] = m[2];
  }
  if (!holder.session || !holder.host) throw new Error('the Holder section lacks a session or a host line');
  return holder;
}

// Who holds the name: self, free, same-host, or other-host.
export function holderWho(holder, sessionArg) {
  if (sessionArg && holder.session.toLowerCase() === sessionArg.toLowerCase()) return 'self';
  if (holder.session.toLowerCase() === 'none') return 'free';
  const r = spawnSync(process.execPath, [join(import.meta.dirname, 'host-id.mjs')], { encoding: 'utf8', timeout: 20000 });
  const id = (r.stdout ?? '').trim();
  if (r.status !== 0 || !/^[0-9a-f]{32}$/.test(id)) throw new Error('cannot read the host id of this machine');
  return holder.host.toLowerCase() === id ? 'same-host' : 'other-host';
}

export const LEDGER_HEADER = 'granted by|action|repo or host|scope|when';

// Audit the ledger. `header` is the cells of the header row. `rows` is a list of cell lists, with the
// separator rows already removed. Row 1 is the first row after the header.
export function auditLedger(header, rows, assignee, sessionArg) {
  if (!header || header.join('|').toLowerCase() !== LEDGER_HEADER) throw new Error('the Ledger table has no header Granted by | Action | Repo or host | Scope | When');
  const bad = [];
  const ended = [];
  rows.forEach((cells, i) => {
    const n = i + 1;
    if (cells.length !== 5 || !same(cells[0], assignee)) bad.push(n);
    const s = /session\s+(\S+)/i.exec(cells[4] ?? '');
    if (s && !(sessionArg && same(s[1], sessionArg))) ended.push(n);
  });
  return { bad, ended };
}

export const MARKER = /^cadre-checkpoint v1 (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/;
const SECTIONS = ['decisions', 'waiting for the human', 'next, in order'];

// Choose the newest checkpoint. `entries` is [{ id, author, firstLine, headings }], `headings` in lower case.
// Only the owner writes one. It needs the marker line and the three sections. A marker time more than
// 5 minutes ahead of now is ignored, and its id goes in `ignored`.
export function pickCheckpoint(entries, assignee) {
  const limit = Date.now() + 5 * 60 * 1000;
  const ignored = [];
  let newest = null;
  for (const c of entries) {
    if (!same(c.author, assignee)) continue;
    const m = MARKER.exec(c.firstLine);
    const time = m ? Date.parse(m[1]) : NaN;
    if (Number.isNaN(time)) continue;
    if (!SECTIONS.every((h) => c.headings.includes(h))) continue;
    if (time > limit) {
      ignored.push(c.id);
      continue;
    }
    if (!newest || time >= newest.time) newest = { time, id: c.id };
  }
  return { id: newest ? newest.id : null, ignored };
}

export const okLine = ({ who, holder, checkpoint, state, bad, ended }) =>
  `ok holder=${who} session=${holder.session} checkpoint=${checkpoint.id ?? 'none'} ignored=${list(checkpoint.ignored)} state=${state} bad-rows=${rowList(bad)} ended-rows=${rowList(ended)}`;
