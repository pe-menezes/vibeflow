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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputs = [join(siteDir, 'dist'), join(siteDir, '.vercel', 'output', 'static')].filter((d) => existsSync(d));
const problems = [];
const fail = (msg) => problems.push(msg);

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

// The loop's four operation lists: once on the page, under their id, in the implement entry after
// the loop mode block, each with its title and every item in order, and no item anywhere else.
function checkLoopSetup(main, lang, where) {
  const opens = [...main.matchAll(new RegExp(`<div\\b[^>]*\\sid="${LOOP_SETUP_ID}"[^>]*>`, 'g'))];
  if (opens.length !== 1) return fail(`${where}: ${opens.length} elements with id ${LOOP_SETUP_ID} instead of 1`);
  const at = opens[0].index;
  const entry = /<article\b[^>]*\sid="implement"[^>]*>[\s\S]*?<\/article>/.exec(main);
  if (!entry || at < entry.index || at > entry.index + entry[0].length) return fail(`${where}: #${LOOP_SETUP_ID} is not in the implement entry`);
  const mode = i18nValue(lang, 'cmdLoopMode');
  const before = plain(main.slice(entry.index, at));
  if (!mode || !before.includes(shown(mode))) fail(`${where}: #${LOOP_SETUP_ID} does not follow the loop mode block`);
  const block = divFrom(main, at);
  if (/gx-escuro/.test(block)) fail(`${where}: #${LOOP_SETUP_ID} is on the dark stage`);
  const rest = tight(plain(main.slice(0, at) + main.slice(at + block.length)));
  const titles = [...block.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => plain(m[1]));
  const expected = LOOP_LISTS.map((b) => i18nValue(lang, `${b}Title`));
  if (JSON.stringify(titles) !== JSON.stringify(expected)) fail(`${where}: #${LOOP_SETUP_ID} titles are ${JSON.stringify(titles)}`);
  const lists = [...block.matchAll(/<ul\b[^>]*>([\s\S]*?)<\/ul>/g)].map((m) => [...m[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((li) => tight(plain(li[1]))));
  if (lists.length !== LOOP_LISTS.length) return fail(`${where}: #${LOOP_SETUP_ID} has ${lists.length} lists instead of ${LOOP_LISTS.length}`);
  LOOP_LISTS.forEach((b, i) => {
    const items = (i18nArray(lang, `${b}Items`) ?? []).map((item) => tight(shown(item)));
    if (!items.length) fail(`${where}: no ${b}Items in i18n`);
    if (JSON.stringify(lists[i]) !== JSON.stringify(items)) fail(`${where}: the list under ${expected[i]} is not ${b}Items, in order`);
    for (const item of items) if (rest.includes(item)) fail(`${where}: an item of ${b}Items is on the page outside #${LOOP_SETUP_ID}`);
  });
}

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
      if (page === 'commands') checkLoopSetup(main, lang, where);
    }
  }
}

if (problems.length) {
  console.error(`check-pages: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-pages: ok (${outputs.map((o) => relative(siteDir, o)).join(', ')})`);
