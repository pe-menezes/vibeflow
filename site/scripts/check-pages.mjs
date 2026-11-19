// Checks on the built commands and anatomy pages, in both languages. Run it after `npm run build`
// (`node scripts/check-pages.mjs` in site/); it exits with 1 and lists every problem it finds.
//
// * every anchor these pages had before the redesign still exists;
// * every in-page link lands on an id of the same page, and the index links to every entry;
// * every i18n text the component uses is on the page, in that page's language, every item of a
//   list included;
// * on the commands page, the four operation lists of the loop sit once in the implement entry,
//   after the loop mode block, under their own id, and none of their items is anywhere else;
// * no element of the page content carries the hidden attribute.
//
// The lists check is loopSetupProblems, exported so a test can run it on HTML of its own; imported,
// this file runs nothing. It holds: one element in <main> carries the id, and it is a div; that
// whole div, opening to closing tag, is inside article#implement; it starts after the whole div
// that holds the loop mode label (cmdLoopMode), not just after the label; its h3 titles and its
// list items are the i18n ones, in order, each item compared with its spaces collapsed (one space
// less or more is a different item); and no item, at any spacing, is anywhere else in <main>.
// What it does not decide: it reads the HTML as text with regular expressions (no DOM, no CSS),
// so it does not see what a browser would hide or move, and it counts the id only inside <main>.
// The check of every other text of the two pages still compares with all spaces removed.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');

// The ids the built pages had at the start of the redesign (commit 52704a8).
const HEADER_IDS = ['header', 'hamburger', 'mobile-menu'];
const PAGES = {
  commands: {
    component: 'CommandsDocs.astro',
    // ...and the id of the loop's operation lists, which the home loop links to.
    ids: [...HEADER_IDS, 'analyze', 'discover', 'gen-spec', 'implement', 'prompt-pack', 'audit', 'quick', 'hotfix', 'teach', 'stats', 'loop-setup'],
  },
  anatomy: {
    component: 'VibeflowAnatomy.astro',
    ids: [...HEADER_IDS],
  },
};

const i18nText = (lang) => readFileSync(join(siteDir, 'src', 'i18n', `${lang}.ts`), 'utf8');
const unescape = (s) => s.replace(/\\(.)/g, '$1');
// The value of a string key in an i18n file, single-quoted as the files write them.
function i18nValue(lang, key) {
  const m = new RegExp(`\\n\\s*${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(i18nText(lang));
  return m ? unescape(m[1]) : undefined;
}
// The items of an array key of single-quoted strings.
function i18nArray(lang, key) {
  const m = new RegExp(`\\n\\s*${key}:\\s*\\[([\\s\\S]*?)\\n\\s*\\]`).exec(i18nText(lang));
  return m ? [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => unescape(x[1])) : undefined;
}

// The loop's four operation lists, moved from the home page to the implement entry, under this id.
const LOOP_LISTS = ['loopOn', 'loopHosts', 'loopCompany', 'loopReq'];
const LOOP_SETUP_ID = 'loop-setup';
const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const squash = (s) => s.replace(/\s+/g, ' ').trim();
const plain = (html) => squash(decode(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]*>/g, ' ')));
// What a value reads like on the page: backticks become code (InlineCode), <br> a line break.
const shown = (value) => squash(value.replace(/`/g, ' ').replace(/<br\s*\/?>/g, ' '));
// Spaces around code and line breaks differ between the source and the page; compare without them.
const tight = (s) => s.replace(/\s+/g, '');

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

// What the loop's lists should be on a page, read from the i18n file of its language.
function loopSetupExpected(lang) {
  return {
    mode: i18nValue(lang, 'cmdLoopMode'),
    lists: LOOP_LISTS.map((b) => ({ key: `${b}Items`, title: i18nValue(lang, `${b}Title`), items: i18nArray(lang, `${b}Items`) ?? [] })),
  };
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
  // Each item as the page reads it, with its spaces collapsed (plain does it), not removed: a space
  // less or more inside the text is a different item.
  const lists = [...block.matchAll(/<ul\b[^>]*>([\s\S]*?)<\/ul>/g)].map((m) => [...m[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((li) => plain(li[1])));
  if (lists.length !== expected.lists.length) return [...out, `#${LOOP_SETUP_ID} has ${lists.length} lists instead of ${expected.lists.length}`];
  expected.lists.forEach((list, i) => {
    const items = list.items.map(shown);
    if (!items.length) out.push(`no ${list.key} in i18n`);
    if (JSON.stringify(lists[i]) !== JSON.stringify(items)) out.push(`the list under ${list.title} is not ${list.key}, in order`);
    // Anywhere else, a copy is found at any spacing.
    for (const item of items) if (rest.includes(tight(item))) out.push(`an item of ${list.key} is on the page outside #${LOOP_SETUP_ID}`);
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

function run() {
  const outputs = [join(siteDir, 'dist'), join(siteDir, '.vercel', 'output', 'static')].filter((d) => existsSync(d));
  const problems = [];
  const fail = (msg) => problems.push(msg);

  if (!outputs.length) fail('no build output found (dist/ or .vercel/output/static/)');

  for (const out of outputs) {
    const label = relative(siteDir, out);
    for (const [page, spec] of Object.entries(PAGES)) {
      const source = readFileSync(join(siteDir, 'src', 'components', spec.component), 'utf8');
      const keys = [...new Set([...source.matchAll(/\bt\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))];
      for (const lang of ['en', 'pt-br']) {
        const file = join(out, lang, page, 'index.html');
        const where = `${label}/${lang}/${page}/`;
        if (!existsSync(file)) {
          fail(`${where}: missing`);
          continue;
        }
        const html = readFileSync(file, 'utf8');
        const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
        for (const id of spec.ids) if (!ids.has(id)) fail(`${where}: anchor #${id} is gone`);

        const main = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? '';
        if (!main) fail(`${where}: no <main>`);
        for (const m of main.matchAll(/<a\s[^>]*href="#([^"]*)"/g)) {
          if (!ids.has(m[1])) fail(`${where}: link to #${m[1]} lands nowhere`);
        }
        const nav = /<nav class="doc-toc[^"]*"[^>]*>([\s\S]*?)<\/nav>/.exec(main)?.[1];
        if (!nav) fail(`${where}: no index`);
        else {
          const linked = new Set([...nav.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]));
          const entries = [...main.matchAll(/<(article|section)\s[^>]*id="([^"]+)"[^>]*class="doc-entry/g)].map((m) => m[2]);
          if (!entries.length) fail(`${where}: no entries`);
          for (const id of entries) if (!linked.has(id)) fail(`${where}: the index has no link to #${id}`);
        }
        if (/<[a-z][^>]*\shidden(\s|=|>)/.test(main)) fail(`${where}: content with the hidden attribute`);

        const text = tight(plain(main));
        const hrefs = new Set([...main.matchAll(/\shref="([^"]+)"/g)].map((m) => decode(m[1])));
        for (const key of keys) {
          const items = i18nArray(lang, key);
          if (items) {
            if (!items.length) fail(`${where}: ${key} has no ${lang} items`);
            for (const item of items) if (!text.includes(tight(shown(item)))) fail(`${where}: an item of ${key} is not on the page`);
            continue;
          }
          const value = i18nValue(lang, key);
          if (value === undefined) {
            fail(`${where}: ${key} has no ${lang} value`);
            continue;
          }
          if (/^https?:\/\//.test(value)) {
            if (!hrefs.has(value)) fail(`${where}: no link to ${key}`);
          } else if (!text.includes(tight(shown(value)))) {
            fail(`${where}: ${key} is not on the page`);
          }
        }
        if (page === 'commands') for (const p of loopSetupProblems(main, loopSetupExpected(lang))) fail(`${where}: ${p}`);
      }
    }
  }

  if (problems.length) {
    console.error(`check-pages: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`check-pages: ok (${outputs.map((o) => relative(siteDir, o)).join(', ')})`);
}

// Run as a program, by its real path or through a symbolic link: Node gives import.meta.url the
// real path and argv[1] the path typed, so both are resolved before they are compared. Imported (by
// a test), the file only defines its functions.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isMain()) run();
