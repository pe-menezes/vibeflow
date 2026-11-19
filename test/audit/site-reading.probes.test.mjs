// Audit probes for the home page reading work (body-size running text, the demo before the loop,
// the loop's four operation lists moved to the implement entry of the commands page). They read the
// sources only, with no build, and bind to content, not to line numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loopSetupProblems } from '../../site/scripts/loop-setup.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const component = (name) => read(`site/src/components/${name}.astro`);
const template = (src) =>
  src.replace(/^---[\s\S]*?\n---\n/, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

// The components of the home page whose running text the reading work moved to the body size.
const HOME = ['HowItWorks', 'Loop', 'LiveDemo', 'UseCases', 'Features', 'Editions', 'ContactForm'];

// Contract: spec 2c, the four lists come after the "loop mode" block of the implement entry, before
// its output. Regression: the lists block moved above the loop mode block, or into it right under
// its label. Why the executor's test misses it: it takes the first `{cmd.loop && (` of the template
// as the start of the loop mode block, and the lists' own guard can be that first one.
test('the loop lists of the commands page come after the whole loop mode block and before the output', () => {
  const markup = template(component('CommandsDocs'));
  const label = markup.indexOf('{cmd.loop.label}');
  const link = markup.indexOf('{cmd.loop.link}');
  const lists = markup.indexOf('cmd.loop.setup');
  const output = markup.indexOf('{cmd.output}');
  assert.ok(label >= 0 && link > label, 'the loop mode block renders its label, then its link back to the home loop');
  const blockEnd = markup.indexOf('</div>', link);
  assert.ok(lists > blockEnd, 'the lists start after the loop mode block has closed');
  assert.ok(output > lists, 'and before the output of the entry');
});

// Contract: spec decision 3 and criterion 3, running text changes size only by swapping one token of
// the design system scale for another, with no new size. Regression: a running text rule shrunk by
// the `font` shorthand, by redefining a `--fs-*` token inside the component, by an inline style, or
// in a `<style>` block with attributes (is:global). Why the executor's test misses it: it reads only
// `font-size:` declarations, only inside plain `<style>` blocks (mutants of the audit survived).
test('the home components set sizes only by font-size in their plain style block', () => {
  for (const name of HOME) {
    const src = component(name);
    const blocks = [...src.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/g)];
    for (const [, attrs, css] of blocks) {
      const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
      assert.ok(!/(?:^|[\s;{])font\s*:/.test(body), `${name}: a font shorthand sets a size the reading test does not see`);
      assert.ok(!/(?:^|[\s;{])--fs-[\w-]+\s*:/.test(body), `${name}: a type scale token is redefined in the component`);
      if (attrs.trim()) assert.ok(!/font-size\s*:/.test(body), `${name}: a font size in <style${attrs}>, outside the block the reading test reads`);
    }
    const inline = [...template(src).matchAll(/\sstyle=(?:"([^"]*)"|\{([^}]*)\})/g)].map((m) => m[1] ?? m[2]);
    for (const style of inline) assert.ok(!/font|--fs-/.test(style), `${name}: an inline style sets a font size: ${style}`);
  }
});

// Contract: spec decision 2, the moved lists keep their keys, and every key the commands and anatomy
// pages read exists in both languages in the same form. Regression: a key turns from a text into a
// list (or back) in one language only. Why the executor's test misses it: its `has` accepts a text or
// a list in each file on its own, so a key can be a text in pt-br and a list in en (mutant T1 of the
// audit passed the whole site suite).
test('every key the commands and anatomy pages read has the same form in both languages', () => {
  const en = read('site/src/i18n/en.ts');
  const pt = read('site/src/i18n/pt-br.ts');
  const form = (text, key) => {
    if (new RegExp(`\\n\\s*${key}:\\s*'`).test(text)) return 'text';
    if (new RegExp(`\\n\\s*${key}:\\s*\\[\\s*'`).test(text)) return 'list';
    return 'missing';
  };
  const known = new Set([...en.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
  const keys = new Set();
  for (const name of ['CommandsDocs', 'VibeflowAnatomy']) {
    for (const m of component(name).matchAll(/\bt\.(\w+)/g)) if (known.has(m[1])) keys.add(m[1]);
  }
  assert.ok(keys.size > 50, 'the two pages read their texts from i18n');
  for (const key of keys) {
    const a = form(en, key);
    assert.notEqual(a, 'missing', `${key} in en.ts`);
    assert.equal(form(pt, key), a, `${key} is a ${a} in en.ts and a ${form(pt, key)} in pt-br.ts`);
  }
  for (const key of ['loopOnItems', 'loopHostsItems', 'loopCompanyItems', 'loopReqItems']) {
    assert.ok(keys.has(key), `the commands page reads ${key}`);
    assert.equal(form(en, key), 'list', `${key} is a list`);
  }
});

// The commands page check of the loop's lists (check-pages.mjs, loopSetupProblems) on two entry
// shapes the generated forms of the executor's test do not build: the entry's blocks wrapped in one
// body div, and the loop mode label gone from the entry.
const LOOP_EXPECTED = {
  mode: 'Loop mode',
  lists: [
    { key: 'loopOnItems', title: 'Turning it on', items: ['Off by default. Without `--loop`, `implement` runs phases 0 to 8.'] },
    { key: 'loopHostsItems', title: 'Hosts', items: ['Codex opens a new task.'] },
    { key: 'loopCompanyItems', title: 'In a company', items: ['One OK per feature.'] },
    { key: 'loopReqItems', title: 'Requirements', items: ['Node.js 18 or newer.'] },
  ],
};
const loopSetup = () =>
  `<div class="entry-block entry-setup" id="loop-setup">${LOOP_EXPECTED.lists
    .map((l) => `<div class="entry-group"><h3 class="entry-label">${l.title}</h3><ul class="entry-list">${l.items.map((i) => `<li>${i.replace(/`([^`]*)`/g, '<code class="ic">$1</code>')}</li>`).join('')}</ul></div>`)
    .join('')}</div>`;
const LOOP_FLAGS = '<dl class="entry-defs"><div class="entry-def"><dt><code class="gx-chip">--loop</code></dt><dd>Phases 0 to 3.</dd></div></dl>';
const loopModeBlock = (inside = '') => `<div class="entry-block"><p class="gx-rotulo entry-label">Loop mode</p>${inside}${LOOP_FLAGS}</div>`;
const PHASES = '<div class="entry-block"><p class="entry-label">Phases</p><p>Phase 0.</p></div>';
const OUTPUT = '<dl class="entry-defs entry-output"><div class="entry-def"><dt>Output</dt><dd>Code.</dd></div></dl>';
const commandsMain = (implement, genSpec = '<p>Writes the spec.</p>') =>
  `<article id="gen-spec" class="doc-entry">${genSpec}</article><article id="implement" class="doc-entry"><header class="entry-head"><h2>implement</h2></header>${implement}</article>`;

// Contract: spec 2c and C6 of fix round 1, the lists come after the whole loop mode block, and the
// end of that block is the div that holds its label, the innermost one. Regression: blockEnd takes
// the outermost open div (open[0]) instead of the innermost, so an entry whose blocks sit in one body
// div reads as if the loop mode block ran to the end of the entry. Why the executor's test misses it:
// its entries put every block straight in the article, where the outermost and innermost open div
// around the label are the same one (the open[0] mutant passes all 432 cases).
test('the loop lists check reads the end of the loop mode block when the entry wraps its blocks in one div', () => {
  const after = commandsMain(`<div class="entry-body">${PHASES}${loopModeBlock()}${loopSetup()}${OUTPUT}</div>`);
  assert.deepEqual(loopSetupProblems(after, LOOP_EXPECTED), [], 'after the loop mode block, inside the body div: right');
  const inside = commandsMain(`<div class="entry-body">${PHASES}${loopModeBlock(loopSetup())}${OUTPUT}</div>`);
  assert.ok(loopSetupProblems(inside, LOOP_EXPECTED).length > 0, 'inside the loop mode block, inside the body div: a problem');
});

// Contract: C6 of fix round 1 fails closed, an implement entry with no loop mode block cannot pass,
// even with the label elsewhere on the page (where the general key check of check-pages still finds
// it). Regression: a missing label read as "nothing to follow" (dropping `modeEnd < 0`), so the lists
// pass with the loop mode block gone. Why the executor's test misses it: every one of its entries
// has the label in the implement entry.
test('the loop lists check finds a problem when the implement entry has no loop mode label', () => {
  const html = commandsMain(`${PHASES}<div class="entry-block">${LOOP_FLAGS}</div>${loopSetup()}${OUTPUT}`, '<div><p class="gx-rotulo entry-label">Loop mode</p></div>');
  assert.ok(loopSetupProblems(html, LOOP_EXPECTED).length > 0);
});
