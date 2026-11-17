// Checks on the built commands and anatomy pages, in both languages. Run it after `npm run build`
// (`node scripts/check-pages.mjs` in site/); it exits with 1 and lists every problem it finds.
//
// * every anchor these pages had before the redesign still exists;
// * every in-page link lands on an id of the same page, and the index links to every entry;
// * every i18n text the component uses is on the page, in that page's language;
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
    ids: [...HEADER_IDS, 'analyze', 'discover', 'gen-spec', 'implement', 'prompt-pack', 'audit', 'quick', 'hotfix', 'teach', 'stats'],
  },
  anatomy: {
    component: 'VibeflowAnatomy.astro',
    ids: [...HEADER_IDS],
  },
};

// The value of a string key in an i18n file, single-quoted as the files write them.
function i18nValue(lang, key) {
  const text = readFileSync(join(siteDir, 'src', 'i18n', `${lang}.ts`), 'utf8');
  const m = new RegExp(`\\n\\s*${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(text);
  return m ? m[1].replace(/\\(.)/g, '$1') : undefined;
}
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
    }
  }
}

if (problems.length) {
  console.error(`check-pages: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-pages: ok (${outputs.map((o) => relative(siteDir, o)).join(', ')})`);
