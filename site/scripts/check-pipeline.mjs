// Checks on the built home pages for the pipeline scene, the loop and the editions, the parts only
// the generated HTML can show. Run it after `npm run build`, from site/:
//   node scripts/check-pipeline.mjs
// It exits with 1 and lists every problem it finds.
//
// * the pipeline: the four gates and the four steps are in the document, lit and not hidden, each
//   step with its name, description and output; the band is an image named by pipelineFlowLabel;
//   the verdict and the extra commands line are there;
// * the order of the sections: hero, pipeline, demo, loop, use cases, commands, editions, closing,
//   contact;
// * the loop: a dark stage, the thesis with its second line struck, every step of today, none of
//   the four operation lists (they live on the commands page), one link to them with
//   loopSetupLink as its text, and the link to the details;
// * the editions: six agents in today's order, each copy button holding an exact i18n command and
//   the feedback of its language, the Claude Code tabs with both panels in the document, and the
//   texts of the three answers above the rows (where and in what order is the source test's).
// Every expected text is read from src/i18n.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputs = [join(siteDir, 'dist'), join(siteDir, '.vercel', 'output', 'static')].filter((d) => existsSync(d));
const problems = [];
const fail = (msg) => problems.push(msg);

const unescape = (s) => s.replace(/\\(.)/g, '$1');
function i18nText(lang) {
  return readFileSync(join(siteDir, 'src', 'i18n', `${lang}.ts`), 'utf8');
}
// The value of a string key, single-quoted as the i18n files write them.
function i18nValue(lang, key) {
  const m = new RegExp(`\\n\\s*${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(i18nText(lang));
  return m ? unescape(m[1]) : undefined;
}
// The items of an array key of single-quoted strings.
function i18nArray(lang, key) {
  const m = new RegExp(`\\n\\s*${key}:\\s*\\[([\\s\\S]*?)\\n\\s*\\]`).exec(i18nText(lang));
  return m ? [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => unescape(x[1])) : undefined;
}

const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const plain = (html) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
// Text compared with no whitespace and no backticks: inline code turns `x` into <code>x</code>.
const squash = (s) => s.replace(/`/g, '').replace(/<br\s*\/?>/g, '').replace(/\s+/g, '');
const attr = (tag, name) => {
  const v = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return v === undefined ? undefined : decode(v);
};
const isHidden = (tag) => /\shidden(\s|=|>|\/)/.test(tag);

function section(html, id) {
  return new RegExp(`(<section\\b[^>]*\\sid="${id}"[^>]*>)([\\s\\S]*?)</section>`).exec(html);
}

function checkPipeline(html, lang, where) {
  const key = (k) => i18nValue(lang, k) ?? `(missing ${k})`;
  const found = section(html, 'how');
  if (!found) return fail(`${where}: no #how section`);
  const body = found[2];
  const text = squash(plain(body));
  for (const k of ['pipelineLabel', 'howTitle', 'howSubtitle', 'pipelineExtra', 'pipelineExtraList', 'featSeeAll']) {
    if (!text.includes(squash(key(k)))) fail(`${where}: pipeline without ${k}`);
  }
  if (!/<canvas[^>]*data-flow="pipeline"/.test(body)) fail(`${where}: pipeline without its canvas`);
  const band = /<div[^>]*class="[^"]*\bpipe-band\b[^"]*"[^>]*>/.exec(body)?.[0] ?? '';
  if (attr(band, 'role') !== 'img') fail(`${where}: the pipeline band is not role="img"`);
  if (attr(band, 'aria-label') !== key('pipelineFlowLabel')) fail(`${where}: the pipeline band is not named by pipelineFlowLabel`);

  const gates = [...body.matchAll(/<span[^>]*\sdata-gate\b[^>]*>([\s\S]*?)<\/span>/g)];
  if (gates.length !== 4) fail(`${where}: ${gates.length} gates instead of 4`);
  gates.forEach((g, i) => {
    if (plain(g[1]) !== key(`step${i + 1}Title`)) fail(`${where}: gate ${i + 1} reads "${plain(g[1])}"`);
    if (attr(g[0], 'data-active') !== 'true' || isHidden(g[0])) fail(`${where}: gate ${i + 1} is not lit at rest`);
  });

  const steps = [...body.matchAll(/(<li[^>]*\sdata-step\b[^>]*>)([\s\S]*?)<\/li>/g)];
  if (steps.length !== 4) fail(`${where}: ${steps.length} steps instead of 4`);
  steps.forEach((s, i) => {
    const n = i + 1;
    if (attr(s[1], 'data-active') !== 'true' || isHidden(s[1])) fail(`${where}: step ${n} is not lit at rest`);
    if (/\shidden(\s|=|>)/.test(s[2])) fail(`${where}: step ${n} hides something`);
    const stepText = squash(plain(s[2]));
    for (const k of [`step${n}Title`, `pipelineStep${n}Desc`, `heroQuickStart${n}Desc`]) {
      if (!stepText.includes(squash(key(k)))) fail(`${where}: step ${n} without ${k}`);
    }
  });

  const end = /<span[^>]*\sdata-scene-end\b[^>]*>([\s\S]*?)<\/span>/.exec(body);
  if (!end) fail(`${where}: pipeline without its verdict`);
  else if (isHidden(end[0])) fail(`${where}: the verdict is hidden at rest`);
}

// The loop's four operation lists, by i18n prefix, and the id they live under on the commands page.
const LOOP_LISTS = ['loopOn', 'loopHosts', 'loopCompany', 'loopReq'];
const LOOP_SETUP_ID = 'loop-setup';

function checkLoop(html, lang, where) {
  const key = (k) => i18nValue(lang, k) ?? `(missing ${k})`;
  const found = section(html, 'loop');
  if (!found) return fail(`${where}: no #loop section`);
  if (!/\bgx-escuro\b/.test(attr(found[1], 'class') ?? '')) fail(`${where}: the loop is not on the dark stage`);
  const body = found[2];
  if (/\shidden(\s|=|>)/.test(body)) fail(`${where}: the loop hides something`);

  const [first, second] = key('loopTitle').split(/<br\s*\/?>/);
  const h2 = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(body)?.[1] ?? '';
  if (plain(h2) !== `${first} ${second}`.trim()) fail(`${where}: loop title reads "${plain(h2)}"`);
  const strike = /<span[^>]*class="[^"]*\bloop-strike\b[^"]*"[^>]*>([\s\S]*?)<\/span>/.exec(h2);
  if (!strike || plain(strike[1]) !== second) fail(`${where}: the strike is not on "${second}"`);

  const text = squash(plain(body));
  const strings = ['loopLabel', 'loopSubtitle', 'loopMore'];
  for (let n = 1; n <= 5; n++) strings.push(`loopStep${n}Title`, `loopStep${n}Desc`);
  for (const k of strings) if (!text.includes(squash(key(k)))) fail(`${where}: loop without ${k}`);
  // The four operation lists moved to the implement entry of the commands page (check-pages.mjs
  // finds them there): none of their items is left in the section, which links to them instead,
  // with loopSetupLink as the link text.
  for (const b of LOOP_LISTS) {
    const items = i18nArray(lang, `${b}Items`);
    if (!items?.length) fail(`${where}: no ${b}Items in i18n`);
    for (const item of items ?? []) if (text.includes(squash(item))) fail(`${where}: loop still shows an item of ${b}Items`);
  }
  if (/<ul\b/.test(body)) fail(`${where}: loop still has a list besides its steps`);
  const setup = [...body.matchAll(/<a\b[^>]*\shref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].filter((m) => m[1] === `/${lang}/commands#${LOOP_SETUP_ID}`);
  const setupText = key('loopSetupLink');
  if (setup.length !== 1) fail(`${where}: ${setup.length} links to /${lang}/commands#${LOOP_SETUP_ID} instead of 1`);
  else if (plain(setup[0][2]) !== setupText) fail(`${where}: the link to the lists reads "${plain(setup[0][2])}"`);
  const steps = (/<ol\b[^>]*>([\s\S]*?)<\/ol>/.exec(body)?.[1].match(/<li\b/g) ?? []).length;
  if (steps !== 5) fail(`${where}: ${steps} loop steps in the ordered list instead of 5`);
  if (!body.includes(`href="${key('loopMoreHref')}"`)) fail(`${where}: loop without the loopMoreHref link`);
}

// The sections of the home page, in order: by id, and by class for the two that have none (the
// hero and the closing stage).
const HOME_ORDER = ['hero', 'how', 'demo', 'loop', 'use-cases', 'commands', 'editions', 'cta', 'contact'];
function checkOrder(html, where) {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? '';
  const order = [...main.matchAll(/<section\b[^>]*>/g)].map((m) => {
    const classes = (attr(m[0], 'class') ?? '').split(/\s+/);
    return attr(m[0], 'id') ?? classes.find((c) => c === 'hero' || c === 'cta') ?? classes.join('.');
  });
  if (JSON.stringify(order) !== JSON.stringify(HOME_ORDER)) fail(`${where}: sections in the order ${JSON.stringify(order)}`);
}

const EDITIONS = ['codexTitle', 'hermesTitle', 'claudeTitle', 'cursorTitle', 'copilotTitle', 'opencodeTitle'];
const COMMANDS = ['codexInstall', 'codexInstall2', 'hermesInstall', 'hermesInstall2', 'claudeInstall', 'claudeInstall2', 'cursorInstall', 'copilotInstall', 'opencodeInstall'];

function checkEditions(html, lang, where) {
  const key = (k) => i18nValue(lang, k) ?? `(missing ${k})`;
  const found = section(html, 'editions');
  if (!found) return fail(`${where}: no #editions section`);
  const body = found[2];
  if (/\shidden(\s|=|>)/.test(body)) fail(`${where}: the editions hide something`);

  const names = [...body.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => plain(m[1]));
  const expected = EDITIONS.map(key);
  if (JSON.stringify(names) !== JSON.stringify(expected)) fail(`${where}: editions ${JSON.stringify(names)} instead of ${JSON.stringify(expected)}`);

  const buttons = [...body.matchAll(/<button[^>]*\sdata-copy="[^"]*"[^>]*>([\s\S]*?)<\/button>/g)];
  const copies = buttons.map((b) => attr(b[0], 'data-copy')).sort();
  const commands = COMMANDS.map(key).sort();
  if (JSON.stringify(copies) !== JSON.stringify(commands)) fail(`${where}: copy buttons hold ${JSON.stringify(copies)}`);
  for (const b of buttons) {
    if (attr(b[0], 'data-copied') !== key('copied')) fail(`${where}: a copy button without the ${lang} feedback`);
    if (plain(b[1]) !== key('copyLabel')) fail(`${where}: a copy button reads "${plain(b[1])}"`);
  }

  const tabs = [...body.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
  if (tabs.length !== 2) fail(`${where}: ${tabs.length} Claude Code tabs instead of 2`);
  for (const tab of tabs) {
    const id = attr(tab, 'aria-controls');
    const panel = new RegExp(`<div[^>]*\\sid="${id}"[^>]*>`).exec(body)?.[0];
    if (!panel || !/\sdata-gx-painel\b/.test(panel)) fail(`${where}: tab without its panel (${id})`);
    else if (isHidden(panel)) fail(`${where}: panel ${id} is hidden at rest`);
  }

  const text = squash(plain(body));
  const strings = ['editionsLabel', 'editionsTitle2', 'editionsSubtitle2', 'claudeDesktopLabel', 'claudeCliLabel',
    'claudeStep1', 'claudeStep2', 'claudeStep4', 'claudeStep5', 'editionsLoopKit', 'editionsHermesScan',
    'editionsGitDisclaimer', 'editionsTagline', 'editionsCostTitle', 'editionsCostBody', 'editionsCodeTitle',
    'editionsCodeBody', 'editionsFirstTitle', 'editionsFirstBody', ...EDITIONS.map((k) => k.replace('Title', 'Desc')), ...COMMANDS];
  for (const k of strings) if (!text.includes(squash(key(k)))) fail(`${where}: editions without ${k}`);
}

if (!outputs.length) fail('no build output found (dist/ or .vercel/output/static/)');

for (const out of outputs) {
  for (const lang of ['en', 'pt-br']) {
    const file = join(out, lang, 'index.html');
    const where = relative(siteDir, file);
    if (!existsSync(file)) {
      fail(`${where} is missing`);
      continue;
    }
    const html = readFileSync(file, 'utf8');
    checkOrder(html, where);
    checkPipeline(html, lang, where);
    checkLoop(html, lang, where);
    checkEditions(html, lang, where);
  }
}

if (problems.length) {
  console.error(`check-pipeline: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-pipeline: ok (${outputs.map((o) => relative(siteDir, o)).join(', ')})`);
