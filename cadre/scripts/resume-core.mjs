// The rules that do not depend on the tracker: the Markdown and HTML parse of the issue body, the Holder,
// the Ledger audit, the checkpoint, and the grant match. The three resume reads and the three grant checks
// all call it, so each one reads the issue the same way.
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

const SESSION_IN_WHEN = /session\s+(\S+)/i;

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
    const s = SESSION_IN_WHEN.exec(cells[4] ?? '');
    if (s && !(sessionArg && same(s[1], sessionArg))) ended.push(n);
  });
  return { bad, ended };
}

export const MARKER = /^cadre-checkpoint v1 (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/;
const SECTIONS = ['decisions', 'waiting for the human', 'next, in order'];

// Choose the newest checkpoint. `entries` is [{ id, author, firstLine, headings, created }], `headings` in lower case.
// Only the owner writes one. It needs the marker line and the three sections.
// `created` is the time that the tracker gave the comment, in ms or as an ISO string. The marker time is text that the
// author wrote, so it is not proof of when. With `{ hasCreated: true }` (GitHub and ADO) the rules are:
//   - an entry with no valid `created` is skipped, and it is not in `ignored`
//   - an entry whose marker time is more than 5 minutes after its `created` is ignored, and its id goes in `ignored`.
//     This holds whatever the clock reads now.
//   - the trusted entry with the latest `created` wins. On a tie, the later entry in the list wins.
// With no `hasCreated` (the local file, which has no creation time) the order in the list ranks the entries, and the last
// one wins. The local file has no other clock, so a marker time more than 5 minutes ahead of now is ignored there,
// and its id goes in `ignored`.
// Return { id, index, ignored }. `index` is the place of the winner in `entries`, or -1. Ids may repeat in a local file.
export function pickCheckpoint(entries, assignee, { hasCreated = false } = {}) {
  const limit = Date.now() + 5 * 60 * 1000;
  const slack = 5 * 60 * 1000;
  const ignored = [];
  let newest = null;
  entries.forEach((c, index) => {
    if (!same(c.author, assignee)) return;
    const m = MARKER.exec(c.firstLine);
    const time = m ? Date.parse(m[1]) : NaN;
    if (Number.isNaN(time)) return;
    if (!SECTIONS.every((h) => c.headings.includes(h))) return;
    let rank = index;
    if (hasCreated) {
      const created = typeof c.created === 'number' ? c.created : typeof c.created === 'string' ? Date.parse(c.created) : NaN;
      if (!Number.isFinite(created)) return;
      if (time > created + slack) return void ignored.push(c.id);
      rank = created;
    } else if (time > limit) return void ignored.push(c.id);
    if (!newest || rank >= newest.rank) newest = { rank, id: c.id, index };
  });
  return { id: newest ? newest.id : null, index: newest ? newest.index : -1, ignored };
}

export const okLine = ({ who, holder, checkpoint, state, bad, ended }) =>
  `ok holder=${who} session=${holder.session} checkpoint=${checkpoint.id ?? 'none'} ignored=${list(checkpoint.ignored)} state=${state} bad-rows=${rowList(bad)} ended-rows=${rowList(ended)}`;

// ---- the parse of a tracker body, shared by the resume reads and the grant checks ----
// Each function throws an Error with the reason. The caller prints `unknown: <reason>`.

// Split a Markdown body into sections by `##` heading. Return a Map of lower case title to lines.
// A heading in a code fence, a heading twice, and a code fence that is not closed throw.
export function markdownSections(body) {
  const sections = new Map();
  let current = null;
  let fenced = false;
  for (const line of String(body ?? '').replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    else if (/^##\s/.test(line)) {
      if (fenced) throw new Error('a heading is inside a code fence');
      const title = line.replace(/^##\s+/, '').trim();
      if (sections.has(title.toLowerCase())) throw new Error(`the body has the heading ${title} twice`);
      sections.set(title.toLowerCase(), (current = []));
      continue;
    }
    if (current) current.push(line);
  }
  if (fenced) throw new Error('a code fence is not closed');
  return sections;
}

// The cells of the Ledger table in Markdown lines. Return { header, rows }: `header` is null with no table, and
// the parse drops the separator rows and the empty rows. An escaped bar in a cell splits the cell, so the row has
// a wrong width and it is a bad row: it fails closed.
export function markdownLedger(lines) {
  const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const [header, ...rows] = lines.filter((l) => l.trim().startsWith('|'));
  return { header: header ? splitRow(header) : null, rows: rows.map(splitRow).filter((cells) => !cells.every((c) => /^[:\s-]*$/.test(c))) };
}

export const decodeHtml = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

// Split the HTML description of an ADO item into sections. A heading is exactly <h2>Name</h2>, and none is twice.
// Return a Map of lower case title to the HTML after the heading.
export function htmlSections(html) {
  const text = html.replace(/\r\n/g, '\n');
  const headings = [...text.matchAll(/<h2>([^<]*)<\/h2>/g)];
  if ((text.match(/<h2\b/gi) ?? []).length !== headings.length) throw new Error('a heading is not in the form <h2>Name</h2>');
  const sections = new Map();
  headings.forEach((h, i) => {
    const title = decodeHtml(h[1]).trim().toLowerCase();
    if (sections.has(title)) throw new Error(`the description has the heading ${decodeHtml(h[1]).trim()} twice`);
    sections.set(title, text.slice(h.index + h[0].length, i + 1 < headings.length ? headings[i + 1].index : undefined));
  });
  return sections;
}

// The Ledger section of an ADO description: one <table>, a header row of <th> cells, rows of <td> cells with text only.
// Return { header, rows } as markdownLedger does.
export function htmlLedger(section) {
  const tableBlock = /^\s*<table>([\s\S]*)<\/table>\s*$/.exec(section);
  if (!tableBlock || /<\/?table\b/i.test(tableBlock[1])) throw new Error('the Ledger section is not one <table>');
  const grid = [];
  for (const row of tableBlock[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<(th|td)>([^<]*)<\/\1>/g)];
    if (row[1].replace(/<(th|td)>[^<]*<\/\1>/g, '').trim() !== '') throw new Error('a Ledger row holds markup inside or beside its cells');
    grid.push({ kinds: cells.map((c) => c[1]), cells: cells.map((c) => decodeHtml(c[2]).trim()) });
  }
  if (tableBlock[1].replace(/<tr>[\s\S]*?<\/tr>/g, '').trim() !== '') throw new Error('the Ledger table holds something besides rows');
  const [head, ...body] = grid;
  if (!head || head.kinds.some((k) => k !== 'th') || body.some((r) => r.kinds.some((k) => k !== 'td'))) throw new Error('the Ledger table has no header row of <th> cells and rows of <td> cells');
  return { header: head.cells, rows: body.map((r) => r.cells).filter((cells) => !cells.every((c) => c === '')) };
}

// Check a grant before a one-way step. The three grant-check scripts call it, after the same owner check and
// the same Ledger parse as the resume read. Return the lines `granted row=<k> scope=<Scope as a JSON string>`, one
// for each row that counts and whose Action cell equals `action` as a whole, ignoring case and outer white
// space. A row counts when auditLedger lists it as neither bad nor ended, and its When is `<date> indefinite`
// exactly (ignoring case) or names `session`. The list is empty when no row counts. The function never reads the Scope.
export function grantLines(header, rows, owner, session, action) {
  const { bad, ended } = auditLedger(header, rows, owner, session);
  const want = String(action).trim().toLowerCase();
  const lines = [];
  rows.forEach((cells, i) => {
    const k = i + 1;
    if (bad.includes(k) || ended.includes(k)) return;
    const named = SESSION_IN_WHEN.exec(cells[4])?.[1];
    const live = named ? same(named, session) : /^\d{4}-\d{2}-\d{2}\s+indefinite$/i.test(cells[4].trim());
    if (live && cells[1].trim().toLowerCase() === want) lines.push(`granted row=${k} scope=${JSON.stringify(cells[3])}`);
  });
  return lines;
}

// The line and the code of a grant check: the granted lines with exit 0, or `none` with exit 1.
export const grantAnswer = (lines) => (lines.length ? [lines, 0] : ['none', 1]);
