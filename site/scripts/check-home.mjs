// Checks on the built home page, second half: the live demo, the use cases, the commands, the
// closing stage and the contact form, in both languages. Run it after `astro build`:
//
//   node scripts/check-home.mjs
//
// It exits with 1 and lists every problem it finds.
//
// * the demo sheet ships ready: no live state in the HTML, the four checks, the files and the verdict;
// * the four use cases and the ten commands, in the order of today, with the links of today;
// * the closing stage is dark and links to the repository;
// * the form keeps its destination, method, field names and ids, has an announced error region
//   with the error of the page language, and a focusable success message.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputs = [join(siteDir, 'dist'), join(siteDir, '.vercel', 'output', 'static')].filter((d) => existsSync(d));
const problems = [];
const fail = (msg) => problems.push(msg);

const COMMANDS = ['analyze', 'gen-spec', 'implement', 'audit', 'discover', 'prompt-pack', 'quick', 'hotfix', 'teach', 'stats'];
const FIELDS = [['c-name', 'name'], ['c-email', 'email'], ['c-msg', 'message']];

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
const plain = (html) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// The HTML of the element with the given id, up to the end of its <section>.
function section(html, id) {
  const start = html.search(new RegExp(`<section\\b[^>]*\\sid="${id}"`));
  if (start < 0) return null;
  const end = html.indexOf('</section>', start);
  return html.slice(start, end < 0 ? undefined : end);
}

if (!outputs.length) fail('no build output found (dist/ or .vercel/output/static/)');

for (const out of outputs) {
  const label = relative(siteDir, out);
  for (const lang of ['en', 'pt-br']) {
    const file = join(out, lang, 'index.html');
    if (!existsSync(file)) {
      fail(`${label}: /${lang}/ is missing`);
      continue;
    }
    const html = readFileSync(file, 'utf8');
    const where = `${label}: /${lang}/`;
    const key = (k) => i18nValue(lang, k) ?? `(missing ${k})`;

    const demo = section(html, 'demo');
    if (!demo) fail(`${where} without the demo section`);
    else {
      if (/\sdata-(live|arrived|checked)\b/.test(demo)) fail(`${where} demo ships with live state`);
      const sheet = /<div class="[^"]*\bdemo-sheet\b[^"]*"[^>]*data-demo-sheet[\s\S]*$/.exec(demo)?.[0] ?? '';
      if (!sheet) fail(`${where} demo without the sheet`);
      const checks = [...sheet.matchAll(/<li data-since="5"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => plain(m[1]));
      const planned = [1, 2, 3, 4].map((i) => key(`demoR5dod${i}`).replace(/^[☐✓]\s*/, ''));
      if (JSON.stringify(checks) !== JSON.stringify(planned)) fail(`${where} sheet checks are ${JSON.stringify(checks)}`);
      for (const i of [1, 2, 3]) if (!sheet.includes(key(`demoR6file${i}`))) fail(`${where} sheet without demoR6file${i}`);
      if (!/demo-sheet__verdict[\s\S]*gx-chip--marcado/.test(sheet)) fail(`${where} sheet without the verdict chip`);
      const talk = plain(demo);
      for (const k of ['demoR1user', 'demoR2user', 'demoR3user', 'demoR7verdictDesc', 'demoR7dod1', 'demoR7dod4']) {
        if (!talk.includes(decode(key(k)))) fail(`${where} demo without ${k}`);
      }
    }

    const cases = section(html, 'use-cases');
    if (!cases) fail(`${where} without the use cases section`);
    else {
      const titles = [...cases.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => plain(m[1]));
      const expected = [1, 2, 3, 4].map((i) => decode(key(`uc${i}Title`)));
      if (JSON.stringify(titles) !== JSON.stringify(expected)) fail(`${where} use cases are ${JSON.stringify(titles)}`);
    }

    const commands = section(html, 'commands');
    if (!commands) fail(`${where} without the commands section`);
    else {
      const titleLinks = [...commands.matchAll(/<h3[^>]*>\s*<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);
      const expected = COMMANDS.map((id) => `/${lang}/commands#${id}`);
      if (JSON.stringify(titleLinks) !== JSON.stringify(expected)) fail(`${where} command links are ${JSON.stringify(titleLinks)}`);
      const details = [...commands.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)]
        .filter((m) => decode(m[2]).trim() === decode(key('cmdDetails')))
        .map((m) => m[1]);
      if (JSON.stringify(details) !== JSON.stringify(expected)) fail(`${where} details links are ${JSON.stringify(details)}`);
      // The title link is the one read and reached; "Details" repeats it for the mouse only.
      const detailTags = [...commands.matchAll(/<a\b[^>]*>([^<]*)<\/a>/g)].filter((m) => decode(m[1]).trim() === decode(key('cmdDetails')));
      if (detailTags.some((m) => !/\saria-hidden="true"/.test(m[0]) || !/\stabindex="-1"/.test(m[0]))) fail(`${where} a details link is still read or reached`);
      if (/<h3[^>]*>\s*<a[^>]*\s(aria-hidden|tabindex)=/.test(commands)) fail(`${where} a title link is out of reach`);
      if (!new RegExp(`<a[^>]*href="/${lang}/commands"[^>]*>`).test(commands)) fail(`${where} without the full reference link`);
    }

    const cta = /<section class="[^"]*\bgx-escuro\b[^"]*\bcta\b[\s\S]*?<\/section>/.exec(html)?.[0];
    if (!cta) fail(`${where} without the dark closing stage`);
    else if (!cta.includes('href="https://github.com/pe-menezes/vibeflow"')) fail(`${where} closing without the GitHub link`);

    const contact = section(html, 'contact');
    if (!contact) fail(`${where} without the contact section`);
    else {
      const form = /<form\b[^>]*>/.exec(contact)?.[0] ?? '';
      if (!/\saction="https:\/\/formspree\.io\/f\/xgonvawy"/.test(form)) fail(`${where} form action is ${form}`);
      if (!/\smethod="POST"/.test(form)) fail(`${where} form method is not POST`);
      for (const [id, name] of FIELDS) {
        const field = new RegExp(`<(input|textarea)\\b[^>]*\\sid="${id}"[^>]*>`).exec(contact)?.[0] ?? '';
        if (!field) fail(`${where} without #${id}`);
        else if (!new RegExp(`\\sname="${name}"`).test(field)) fail(`${where} #${id} without name="${name}"`);
      }
      const error = /<p\b[^>]*\sid="form-error"[^>]*>([\s\S]*?)<\/p>/.exec(contact);
      if (!error) fail(`${where} without the error region`);
      else {
        if (!/\srole="alert"/.test(error[0])) fail(`${where} the error region is not announced`);
        if (error[1].trim()) fail(`${where} the error region is not empty at rest`);
        const message = /\sdata-message="([^"]*)"/.exec(error[0])?.[1];
        if (decode(message ?? '') !== decode(key('contactError'))) fail(`${where} the error region carries ${message}`);
      }
      const success = /<p\b[^>]*\sid="form-success"[^>]*>/.exec(contact)?.[0] ?? '';
      if (!/\stabindex="-1"/.test(success) || !/\shidden\b/.test(success)) fail(`${where} the success message is not hidden and focusable`);
    }
  }
}

if (problems.length) {
  console.error(`check-home: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-home: ok (${outputs.map((o) => relative(siteDir, o)).join(', ')})`);
