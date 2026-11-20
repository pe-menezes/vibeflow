// Checks on the built pages for what the contained home page keeps and what it sent to the commands
// page, in both languages. Run it after `astro build`:
//
//   node scripts/check-home.mjs
//
// It exits with 1 and lists every problem it finds.
//
// * the home page: the closing stage is dark and links to the repository; the demo, the use cases,
//   the list of the ten commands and the contact form are not on it, and no element carries their
//   ids (demo, use-cases, commands, contact);
// * the commands page ends with the use cases, the answers and notes of the editions, and the
//   contact form, in that order, after the reference entries and with nothing after them;
// * the four use cases, in the order of today;
// * the three answers (each title in a dt, its body in the dd after it, inline code as code) and the
//   three notes, in the order of today;
// * the form keeps its destination, method, field names and ids, has an announced error region
//   with the error of the page language, and a focusable success message.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputs = [join(siteDir, 'dist'), join(siteDir, '.vercel', 'output', 'static')].filter((d) => existsSync(d));
const problems = [];
const fail = (msg) => problems.push(msg);

const LEFT_HOME = ['demo', 'use-cases', 'commands', 'contact'];
const COMMANDS_END = ['use-cases', 'edition-answers', 'contact'];
const ANSWERS = ['editionsCost', 'editionsCode', 'editionsFirst'];
const NOTES = ['editionsLoopKit', 'editionsHermesScan', 'editionsGitDisclaimer'];
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
// Text compared with no whitespace and no backticks: inline code turns `x` into <code>x</code>.
const squash = (s) => s.replace(/`/g, '').replace(/\s+/g, '');
// The spans a value sets between backticks, which InlineCode shows as code, and the code shown.
const codeSpans = (value) => value.split('`').filter((_, i) => i % 2 === 1);
const shownCode = (html) => [...html.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/g)].map((m) => plain(m[1]));
const sameCode = (html, value) => JSON.stringify(shownCode(html)) === JSON.stringify(codeSpans(value).map((c) => c.replace(/\s+/g, ' ').trim()));

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
    const key = (k) => i18nValue(lang, k) ?? `(missing ${k})`;

    const homeFile = join(out, lang, 'index.html');
    if (!existsSync(homeFile)) fail(`${label}: /${lang}/ is missing`);
    else {
      const html = readFileSync(homeFile, 'utf8');
      const where = `${label}: /${lang}/`;
      for (const id of LEFT_HOME) if (new RegExp(`\\sid="${id}"`).test(html)) fail(`${where} still has #${id}`);
      if (/<form\b/.test(html)) fail(`${where} still has a form`);
      const cta = /<section class="[^"]*\bgx-escuro\b[^"]*\bcta\b[\s\S]*?<\/section>/.exec(html)?.[0];
      if (!cta) fail(`${where} without the dark closing stage`);
      else if (!cta.includes('href="https://github.com/pe-menezes/vibeflow"')) fail(`${where} closing without the GitHub link`);
    }

    const file = join(out, lang, 'commands', 'index.html');
    if (!existsSync(file)) {
      fail(`${label}: /${lang}/commands/ is missing`);
      continue;
    }
    const html = readFileSync(file, 'utf8');
    const where = `${label}: /${lang}/commands/`;
    const main = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? '';

    // The order: the reference, then the three blocks, and nothing after them.
    const opens = [...main.matchAll(/<section\b[^>]*>/g)].map((m) => ({ at: m.index, id: /\sid="([^"]*)"/.exec(m[0])?.[1] }));
    const tail = opens.filter((o) => COMMANDS_END.includes(o.id));
    if (JSON.stringify(tail.map((o) => o.id)) !== JSON.stringify(COMMANDS_END)) fail(`${where} ends with ${JSON.stringify(tail.map((o) => o.id))}`);
    else {
      const first = tail[0].at;
      const lastEntry = [...main.matchAll(/<article\b[^>]*class="doc-entry/g)].at(-1)?.index ?? -1;
      if (lastEntry < 0 || lastEntry > first) fail(`${where} the blocks do not follow the reference entries`);
      const after = opens.filter((o) => o.at > first && !COMMANDS_END.includes(o.id));
      if (after.length) fail(`${where} has another section among or after the blocks`);
      const contactEnd = main.indexOf('</section>', tail[2].at);
      const rest = main.slice(contactEnd + '</section>'.length).replace(/<script\b[\s\S]*?<\/script>/g, '').trim();
      if (contactEnd < 0 || rest) fail(`${where} has content after the contact form`);
    }

    const cases = section(main, 'use-cases');
    if (!cases) fail(`${where} without the use cases section`);
    else {
      const titles = [...cases.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => plain(m[1]));
      const expected = [1, 2, 3, 4].map((i) => decode(key(`uc${i}Title`)));
      if (JSON.stringify(titles) !== JSON.stringify(expected)) fail(`${where} use cases are ${JSON.stringify(titles)}`);
    }

    const answers = section(main, 'edition-answers');
    if (!answers) fail(`${where} without the answers and notes of the editions`);
    else {
      if (!plain(answers).startsWith(key('editionsLabel'))) fail(`${where} the answers do not open with editionsLabel`);
      if (/<h[1-6]\b/.test(answers)) fail(`${where} the answers carry a heading`);
      const dl = /<dl\b[^>]*>([\s\S]*?)<\/dl>/.exec(answers)?.[1] ?? '';
      const pairs = [...dl.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/g)];
      if (pairs.length !== ANSWERS.length) fail(`${where} ${pairs.length} answers instead of ${ANSWERS.length}`);
      pairs.forEach((m, i) => {
        const base = ANSWERS[i];
        if (!base) return;
        if (plain(m[1]) !== key(`${base}Title`)) fail(`${where} answer ${i + 1} title is not ${base}Title`);
        if (squash(plain(m[2])) !== squash(key(`${base}Body`))) fail(`${where} answer ${i + 1} body is not ${base}Body`);
        if (!sameCode(m[2], key(`${base}Body`))) fail(`${where} answer ${i + 1} shows ${JSON.stringify(shownCode(m[2]))} as code`);
      });
      const notes = [...answers.matchAll(/<p class="ed-note"[^>]*>([\s\S]*?)<\/p>/g)];
      if (notes.length !== NOTES.length) fail(`${where} ${notes.length} notes instead of ${NOTES.length}`);
      notes.forEach((m, i) => {
        const k = NOTES[i];
        if (!k) return;
        if (squash(plain(m[1])) !== squash(key(k))) fail(`${where} note ${i + 1} is not ${k}`);
        if (!sameCode(m[1], key(k))) fail(`${where} note ${i + 1} shows ${JSON.stringify(shownCode(m[1]))} as code`);
      });
      if (dl && notes.length && answers.indexOf('<dl') > answers.indexOf('class="ed-note"')) fail(`${where} the notes come before the answers`);
    }

    const contact = section(main, 'contact');
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
