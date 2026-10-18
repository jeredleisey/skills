// Read named top-level fields from the front matter of a charter.
// charter-check.mjs and guard.mjs both use this module.
//   - The front matter starts on line 1 with --- and ends at the next ---.
//   - A blank line, a comment, an indented line, and a list line are skipped.
//   - Any other line must be `key: value`, or the parser throws an Error with the reason.
//   - A named key that appears twice throws.
// Return { values, lists }. `values` maps a named key to its text, without quotes.
// `lists` maps a named key to its items: those of an inline `[a, b]`, a comma list, or the `- item` lines.

function unquote(value) {
  const m = /^(["'])(.*)\1$/.exec(value);
  return m ? m[2] : value;
}

export function parseFrontMatter(text, names) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0] !== '---') throw new Error('the front matter does not start on line 1');
  const end = lines.indexOf('---', 1);
  if (end === -1) throw new Error('the front matter has no closing ---');
  const values = {};
  const lists = {};
  let current = null;
  for (const [i, line] of lines.slice(1, end).entries()) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && current) lists[current].push(unquote(item[1].trim()));
    if (line.trim() === '' || /^\s/.test(line) || line.startsWith('#') || line.startsWith('- ') || line === '-') continue;
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/.exec(line);
    if (!m) throw new Error(`front matter line ${i + 2} is not a key and a value`);
    current = null;
    if (names.includes(m[1])) {
      if (m[1] in values) throw new Error(`${m[1]} appears twice`);
      values[m[1]] = unquote((m[2] ?? '').trim());
      const inline = /^\[(.*)\]$/.exec(values[m[1]]);
      const flat = inline ? inline[1] : values[m[1]];
      lists[m[1]] = flat === '' ? [] : flat.split(',').map((x) => unquote(x.trim()));
      current = m[1];
    }
  }
  return { values, lists };
}
