// The rule for the loop's four operation lists on the built commands page, and the text helpers it
// and check-pages.mjs share. A module of pure functions: importing it runs nothing, reads nothing
// and writes nothing. check-pages.mjs runs the rule on every built commands page; a test runs it on
// HTML of its own.
//
// loopSetupProblems holds: one element in <main> carries the id, and it is a div; that whole div,
// opening to closing tag, is inside article#implement; it starts after the whole div that holds the
// loop mode label (cmdLoopMode), not just after the label; its h3 titles are the i18n ones, in order;
// its list items are the i18n ones, in order, character for character; and no item, at any spacing,
// is anywhere else in <main>.
//
// An item is compared exactly, as InlineCode renders it: on the page, each <code ...> and </code>
// becomes an open and a close mark (the attributes of the tag do not count), entities are decoded,
// and any other tag inside the item is a problem; in i18n, each pair of backticks becomes the same
// two marks. No space is collapsed or trimmed on either side, so a space less, more or moved next to
// a code span is a different item.
//
// What it does not decide:
// * it reads the HTML as text with regular expressions (no DOM, no CSS), so it does not see what a
//   browser would hide or move;
// * it counts the id only inside <main>;
// * it reads the id only in its double-quoted form (id="loop-setup"), the one the build writes;
// * the end of the loop mode block is the innermost div holding the first element of the entry
//   whose whole text is the label: with the label repeated earlier in the same entry, or with the
//   label in a div of its own inside the block, lists inside the block would pass.
// None of these shapes is on the site today.

const LOOP_SETUP_ID = 'loop-setup';

export const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export const squash = (s) => s.replace(/\s+/g, ' ').trim();
export const plain = (html) => squash(decode(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]*>/g, ' ')));
// What a value reads like on the page: backticks become code (InlineCode), <br> a line break.
export const shown = (value) => squash(value.replace(/`/g, ' ').replace(/<br\s*\/?>/g, ' '));
// Spaces around code and line breaks differ between the source and the page; compare without them.
export const tight = (s) => s.replace(/\s+/g, '');

// The marks a code span becomes in the exact comparison of an item.
const OPEN = '\u0002';
const CLOSE = '\u0003';
// An i18n item as InlineCode renders it: the parts between backticks are code, nothing between parts.
const markedItem = (value) => value.split('`').map((p, i) => (i % 2 ? `${OPEN}${p}${CLOSE}` : p)).join('');
// The HTML inside an <li> as marked text, or null when it holds a tag other than code.
function markedLi(html) {
  const marked = html.replace(/<code\b[^>]*>/g, OPEN).replace(/<\/code>/g, CLOSE);
  return /<[^>]*>/.test(marked) ? null : decode(marked);
}

// The element opened at `start` in `html`, up to its matching </div>.
function divFrom(html, start) {
  const tags = /<div\b|<\/div>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m; (m = tags.exec(html)); ) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  return html.slice(start);
}

// The loop's four operation lists in `main` (the HTML inside <main>): once on the page, under their
// id, in the implement entry after the loop mode block, each with its title and every item in
// order, and no item anywhere else. `expected` holds the i18n values: `mode` (cmdLoopMode) and
// `lists`, each { key, title, items }. Returns the problems found, empty when there are none.
export function loopSetupProblems(main, expected) {
  const out = [];
  // The id once in <main>, on any element, and that element is the div of the lists.
  const opens = [...main.matchAll(new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\sid="${LOOP_SETUP_ID}"[^>]*>`, 'g'))];
  if (opens.length !== 1) return [`${opens.length} elements with id ${LOOP_SETUP_ID} instead of 1`];
  if (opens[0][1] !== 'div') return [`#${LOOP_SETUP_ID} is a ${opens[0][1]}, not the div of the lists`];
  const at = opens[0].index;
  const block = divFrom(main, at);
  // The whole block inside the entry, from its opening tag to its closing one.
  const entry = /<article\b[^>]*\sid="implement"[^>]*>[\s\S]*?<\/article>/.exec(main);
  const entryClose = entry ? entry.index + entry[0].length - '</article>'.length : -1;
  if (!entry || at < entry.index || at + block.length > entryClose) return [`#${LOOP_SETUP_ID} is not in the implement entry`];
  // After the whole loop mode block: the div that holds the element whose text is its label.
  const modeEnd = blockEnd(main, entry.index, entryClose, shown(expected.mode ?? ''));
  if (!expected.mode || modeEnd < 0 || at < modeEnd) out.push(`#${LOOP_SETUP_ID} does not follow the loop mode block`);
  if (/gx-escuro/.test(block)) out.push(`#${LOOP_SETUP_ID} is on the dark stage`);
  const rest = tight(plain(main.slice(0, at) + main.slice(at + block.length)));
  const titles = [...block.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => plain(m[1]));
  const want = expected.lists.map((l) => l.title);
  if (JSON.stringify(titles) !== JSON.stringify(want)) out.push(`#${LOOP_SETUP_ID} titles are ${JSON.stringify(titles)}`);
  // Each item exactly as the page has it, code spans as marks, no space collapsed or trimmed.
  const lists = [...block.matchAll(/<ul\b[^>]*>([\s\S]*?)<\/ul>/g)].map((m) => [...m[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((li) => markedLi(li[1])));
  if (lists.length !== expected.lists.length) return [...out, `#${LOOP_SETUP_ID} has ${lists.length} lists instead of ${expected.lists.length}`];
  expected.lists.forEach((list, i) => {
    if (!list.items.length) out.push(`no ${list.key} in i18n`);
    if (lists[i].includes(null)) out.push(`an item under ${list.title} holds a tag other than code`);
    if (JSON.stringify(lists[i]) !== JSON.stringify(list.items.map(markedItem))) out.push(`the list under ${list.title} is not ${list.key}, in order`);
    // Anywhere else, a copy is found at any spacing.
    for (const item of list.items) if (rest.includes(tight(shown(item)))) out.push(`an item of ${list.key} is on the page outside #${LOOP_SETUP_ID}`);
  });
  return out;
}

// Where the div that holds the first element of html[from, to) whose whole text is `label` ends,
// or -1 when there is no such element or no div holds it there.
function blockEnd(html, from, to, label) {
  const scope = html.slice(from, to);
  const el = [...scope.matchAll(/<([a-z][\w-]*)\b[^>]*>([^<]*)<\/\1>/g)].find((m) => squash(decode(m[2])) === label);
  if (!label || !el) return -1;
  const open = [];
  const tags = /<div\b|<\/div>/g;
  for (let m; (m = tags.exec(scope)) && m.index < el.index; ) {
    if (m[0] === '</div>') open.pop();
    else open.push(m.index);
  }
  if (!open.length) return -1;
  const start = from + open.at(-1);
  return start + divFrom(html, start).length;
}
