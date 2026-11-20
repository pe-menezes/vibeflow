// Checks on the built commands and anatomy pages, in both languages. A program: run it after
// `npm run build` (`node scripts/check-pages.mjs` in site/); it always runs the checks, exits with 1
// and lists every problem it finds. Do not import it; what a test needs is in loop-setup.mjs.
//
// * every anchor these pages had before the redesign still exists;
// * every in-page link lands on an id of the same page, and the index links to every entry;
// * every i18n text the component uses is on the page, in that page's language, every item of a
//   list included;
// * on the commands page, the four operation lists of the loop sit once in the implement entry,
//   after the loop mode block, under their own id, with the i18n items character for character,
//   and none of their items is anywhere else (the rule and its limits are in loop-setup.mjs);
// * no element of the page content carries the hidden attribute, but the ones a script shows later
//   (SHOWN_LATER of home-rules.mjs: the success message of the contact form, at the end of the
//   commands page).
//
// What it does not decide: it reads the HTML as text with regular expressions (no DOM, no CSS), so
// it does not see what a browser would hide or move. The check of every text of the two pages
// other than the loop's list items compares with all spaces removed.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isShownLater } from './home-rules.mjs';
import { decode, loopSetupProblems, plain, shown, tight } from './loop-setup.mjs';

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputs = [join(siteDir, 'dist'), join(siteDir, '.vercel', 'output', 'static')].filter((d) => existsSync(d));
const problems = [];
const fail = (msg) => problems.push(msg);

// The ids the built pages had at the start of the redesign (commit 52704a8).
const HEADER_IDS = ['header', 'hamburger', 'mobile-menu'];
const PAGES = {
  commands: {
    component: 'CommandsDocs.astro',
    // ...and the id of the loop's operation lists, in the implement entry.
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

// The loop's four operation lists, moved from the home page to the implement entry.
const LOOP_LISTS = ['loopOn', 'loopHosts', 'loopCompany', 'loopReq'];
// What the loop's lists should be on a page, read from the i18n file of its language.
function loopSetupExpected(lang) {
  return {
    mode: i18nValue(lang, 'cmdLoopMode'),
    lists: LOOP_LISTS.map((b) => ({ key: `${b}Items`, title: i18nValue(lang, `${b}Title`), items: i18nArray(lang, `${b}Items`) ?? [] })),
  };
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
      for (const m of main.matchAll(/<[a-z][^>]*\shidden(\s|=|>)[^>]*>?/g)) {
        const id = /\sid="([^"]*)"/.exec(m[0])?.[1];
        if (!isShownLater(id)) fail(`${where}: content with the hidden attribute${id ? ` (#${id})` : ''}`);
      }

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
