// Checks on how the home page reads, from the sources and with no build:
//
// * the type: every CSS rule of the home page components that sets a font size is classified here,
//   either as running text (a sentence one reads: paragraph, list item with a sentence,
//   description) or as something else (label, control, link, command name, mono output, sheet
//   data, display heading). Running text takes the body size (--fs-body), the long notes the
//   control size (--fs-ui); nothing uses a literal size but the display headings, and every size
//   is a token of the design system scale. Inside the block where the pipeline scene pins, the
//   step descriptions take one declaration of their own, at the control size (spec 1c, measured).
// * the order: the home pages run hero, pipeline, demo, loop, use cases, commands, editions,
//   closing, contact; the loop on the home page keeps its head, its five steps and its links, and
//   its four operation lists live in the `implement` entry of the commands page, after the loop
//   mode block, under an id of their own that the home loop links to with a sentence of its own
//   (loopSetupLink).
//
// What only the built HTML can show (the lists once on the commands page with every item, none of
// them on the home page, the link landing) lives in site/scripts/check-pipeline.mjs and
// site/scripts/check-pages.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const component = (name) => read(`site/src/components/${name}.astro`);
const styleOf = (src) => [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const template = (src) =>
  src.replace(/^---[\s\S]*?\n---\n/, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const frontmatter = (src) => /^---\n([\s\S]*?)\n---\n/.exec(src)?.[1] ?? '';

// Split on commas that are not inside parentheses.
function splitTop(list) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++;
    else if (list[i] === ')') depth--;
    else if (list[i] === ',' && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out.map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

// The rules of a stylesheet, each with the media query it sits in (null at the top level).
function cssRules(css, media = null) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let start = 0;
  for (;;) {
    const open = text.indexOf('{', start);
    if (open < 0) break;
    let depth = 1;
    let close = open + 1;
    for (; close < text.length && depth > 0; close++) {
      if (text[close] === '{') depth++;
      else if (text[close] === '}') depth--;
    }
    const prelude = text.slice(start, open).trim();
    const body = text.slice(open + 1, close - 1);
    if (prelude.startsWith('@media')) rules.push(...cssRules(body, prelude.slice(6).trim()));
    else rules.push({ media, selectors: splitTop(prelude), body });
    start = close;
  }
  return rules;
}
const fontSizes = (body) => [...body.matchAll(/(?:^|[\s;])font-size:\s*([^;]+);/g)].map((m) => m[1].trim());

const SCENE_QUERY = '(min-width: 860px) and (min-height: 660px) and (prefers-reduced-motion: no-preference)';
// The one rule that may keep the control size for running text: the step descriptions inside the
// block where the scene pins (spec 1c). It is written without the loose mark, pinned or loose
// alike, so the scene's measure of the stage gives one answer.
const SCENE_STEP = { component: 'HowItWorks', media: SCENE_QUERY, selector: ':global(html.motion-ok) .pipe-step__desc' };

// Running text on the home page: selector, the size it takes, and why it is running text.
const BODY = 'var(--fs-body)';
const UI = 'var(--fs-ui)';
const RUNNING = {
  HowItWorks: {
    '.pipe-step__desc': [BODY, 'the description of each pipeline step, a sentence'],
  },
  Loop: {
    '.loop-step p': [BODY, 'the description of each of the five roles, a sentence'],
  },
  LiveDemo: {
    '.demo-questions': [BODY, 'the questions the agent asks in the example, sentences'],
    '.demo-verified': [BODY, 'the checks the audit verified in the example, sentences'],
    '.demo-turn--mark p:not(.gx-rotulo)': [BODY, 'what each later step of the example says, a sentence'],
    '.demo-sheet__dod': [BODY, 'the success criteria on the spec sheet, each one a sentence'],
  },
  UseCases: {
    '.uc-row div p': [BODY, 'the description of each use case, a paragraph'],
  },
  Features: {
    '.cmd-desc': [BODY, 'the description of each command, a sentence'],
  },
  Editions: {
    '.ed-desc': [BODY, 'the description of each edition, a sentence'],
    '.ed-steps li': [BODY, 'the install steps in Claude Code Desktop, each one a sentence'],
    '.ed-tag': [BODY, 'the closing line of the editions, two short sentences'],
    '.ed-answers dd': [BODY, 'the body of each of the three answers above the editions, sentences'],
    '.ed-note': [UI, 'the notes under the editions, 60 to 80 words each (spec 1b)'],
  },
  ContactForm: {
    '.contact-error': [BODY, 'the error message of the form, a sentence'],
  },
};

// Everything else that sets a size on the home page: selector, the size it takes, and what it is.
// A display heading may take a literal size; nothing else may. The sizes are the ones these
// components had at 30e6ae6: this redesign changes running text only.
const LEDE = 'var(--fs-lede)';
const LABEL = 'var(--fs-label)';
const META = 'var(--fs-meta)';
const D3 = 'var(--fs-d3)';
const OTHER = {
  HowItWorks: {
    '.pipe-sub': [LEDE, 'the lede of the section'],
    '.pipe-gate': [LABEL, 'a gate label of the band'],
    '.pipe-step__cmd': [D3, 'a command name'],
    '.pipe-step__out': [META, 'the output of a step, mono'],
    '.pipe-extra': [META, 'the line with the extra commands, a list of command names'],
  },
  Loop: {
    '.loop-title': ['clamp(2.4rem, 6.4vw, 5.2rem)', 'the display heading of the thesis (literal size)'],
    '.loop-sub': [LEDE, 'the lede of the section'],
    '.loop-num': [LABEL, 'a step number'],
    '.loop-step h3': [D3, 'a role name'],
    '.loop-more': [UI, 'the links of the section'],
  },
  LiveDemo: {
    '.demo-said': ['clamp(1.45rem, 2.5vw, 2.05rem)', 'what the person says, a display quote (literal size)'],
    '.demo-sheet .gx-ficha .v': [UI, 'a field value of the spec sheet, data'],
    '.demo-sheet__files': [META, 'file names, mono'],
    '.demo-sheet__verdict': [META, 'the verdict chip and its status line'],
  },
  UseCases: {
    '.uc-row h3': [D3, 'a use case title'],
    '.uc-route': [META, 'the route of commands, mono'],
  },
  Features: {
    '.cmd-name h3': [D3, 'a command name'],
    '.cmd-tier': [LABEL, 'a tier label'],
    '.cmd-details': [META, 'a details link'],
  },
  Editions: {
    '.ed-name h3': [D3, 'an edition name'],
    '.ed-cmd-text': [META, 'an install command, mono'],
    '.ed-steps li::before': [META, 'a step number'],
    '.ed-answers dt': [BODY, 'the title of each of the three answers, a short heading set off by weight'],
  },
  ContactForm: {
    '.contact-success': [LEDE, 'the success message, at the lede size'],
  },
};
const LITERAL_OK = new Set(['.loop-title', '.demo-said']);
const HOME_COMPONENTS = Object.keys(RUNNING);

const SCALE = new Set([...read('site/src/styles/genius/genius-tudo.css').matchAll(/^\s*(--fs-[a-z0-9]+):/gm)].map((m) => m[1]));

const isScene = (name, rule, sel) => name === SCENE_STEP.component && rule.media === SCENE_STEP.media && sel === SCENE_STEP.selector;

test('every rule of the home page that sets a font size is classified as running text or not', () => {
  const unclassified = [];
  for (const name of HOME_COMPONENTS) {
    for (const rule of cssRules(styleOf(component(name)))) {
      if (!fontSizes(rule.body).length) continue;
      for (const sel of rule.selectors) {
        if (isScene(name, rule, sel)) continue;
        if (!(sel in RUNNING[name]) && !(sel in OTHER[name])) unclassified.push(`${name}: ${sel}${rule.media ? ` (in @media ${rule.media})` : ''}`);
      }
    }
  }
  assert.deepEqual(unclassified, [], 'a rule that sets a font size is in neither list');
});

test('running text on the home page takes the body size, the long notes the control size, and no literal size', () => {
  const wrong = [];
  for (const name of HOME_COMPONENTS) {
    for (const rule of cssRules(styleOf(component(name)))) {
      for (const sel of rule.selectors) {
        if (isScene(name, rule, sel) || !(sel in RUNNING[name])) continue;
        const [expected] = RUNNING[name][sel];
        for (const size of fontSizes(rule.body)) {
          if (size !== expected) wrong.push(`${name}: ${sel} takes ${size}, not ${expected}`);
        }
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('the running text list is not empty or stale: each selector is on the page and sets its size', () => {
  for (const name of HOME_COMPONENTS) {
    const src = component(name);
    const markup = template(src);
    const rules = cssRules(styleOf(src));
    for (const [sel, [expected, why]] of Object.entries(RUNNING[name])) {
      assert.ok(why.length > 0, `${name}: ${sel} has its reason`);
      const cls = /\.([\w-]+)/.exec(sel)?.[1];
      assert.ok(cls && new RegExp(`class=["{][^>]*\\b${cls}\\b`).test(markup), `${name}: ${sel} styles nothing in the markup`);
      const own = rules.filter((r) => r.media === null && r.selectors.includes(sel)).flatMap((r) => fontSizes(r.body));
      assert.deepEqual(own, [expected], `${name}: ${sel} sets its size once at the top level, to ${expected}`);
    }
  }
  const tokens = Object.values(RUNNING).flatMap((m) => Object.values(m).map(([size]) => size));
  assert.ok(tokens.filter((s) => s === BODY).length >= 10, 'running text at the body size');
  assert.ok(tokens.includes(UI), 'the notes at the control size');
});

test('what is not running text keeps its size: each label, control, datum and heading takes the size listed', () => {
  const wrong = [];
  for (const name of HOME_COMPONENTS) {
    const rules = cssRules(styleOf(component(name)));
    for (const [sel, [expected, why]] of Object.entries(OTHER[name])) {
      assert.ok(why.length > 0, `${name}: ${sel} has its reason`);
      const sizes = rules.filter((r) => r.selectors.includes(sel)).flatMap((r) => fontSizes(r.body));
      if (!sizes.length) wrong.push(`${name}: ${sel} sets no size`);
      for (const size of sizes) if (size !== expected) wrong.push(`${name}: ${sel} takes ${size}, not ${expected}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('every font size on the home page is a token of the design system scale, but the display headings', () => {
  for (const token of ['--fs-label', '--fs-meta', '--fs-ui', '--fs-body']) assert.ok(SCALE.has(token), `${token} in the scale`);
  const wrong = [];
  for (const name of HOME_COMPONENTS) {
    for (const rule of cssRules(styleOf(component(name)))) {
      for (const size of fontSizes(rule.body)) {
        const token = /^var\((--fs-[a-z0-9]+)\)$/.exec(size)?.[1];
        if (token && SCALE.has(token)) continue;
        if (rule.selectors.every((s) => LITERAL_OK.has(s))) continue;
        wrong.push(`${name}: ${rule.selectors.join(', ')} takes ${size}`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('where the scene pins, the step descriptions take one declaration of their own, pinned or loose alike', () => {
  const rules = cssRules(styleOf(component('HowItWorks')));
  const inBlock = rules.filter((r) => r.media === SCENE_QUERY && r.selectors.some((s) => /\.pipe-step__desc\b/.test(s)) && fontSizes(r.body).length);
  assert.equal(inBlock.length, 1, 'one rule sets the size of the step descriptions where the scene pins');
  assert.deepEqual(inBlock[0].selectors, [SCENE_STEP.selector], 'the rule is for the step descriptions only, under the motion class');
  assert.ok(!/data-scene-loose/.test(inBlock[0].selectors.join()), 'the size does not depend on the loose mark, so the measure gives one answer');
  const sizes = fontSizes(inBlock[0].body);
  assert.equal(sizes.length, 1, 'one declaration');
  // The control size, measured (spec 1c, 19/11): with the body size there, 18 of 154 screens stop
  // pinning, all in Portuguese, one of them 1024x700, where the scene has to pin.
  assert.equal(sizes[0], UI, 'where the scene pins, the step descriptions take the control size');
  const elsewhere = rules.filter((r) => r.media !== SCENE_QUERY && r.selectors.some((s) => /\.pipe-step__desc\b/.test(s))).flatMap((r) => fontSizes(r.body));
  assert.deepEqual(elsewhere, [BODY], 'outside the block the step descriptions take the body size');
});

// ------------------------------------------------------------------ the order

const HOME_ORDER = ['Hero', 'HowItWorks', 'LiveDemo', 'Loop', 'UseCases', 'Features', 'Editions', 'FinalCTA', 'ContactForm'];
const LIST_KEYS = [
  ['loopOnTitle', 'loopOnItems'],
  ['loopHostsTitle', 'loopHostsItems'],
  ['loopCompanyTitle', 'loopCompanyItems'],
  ['loopReqTitle', 'loopReqItems'],
];

test('the home pages run hero, pipeline, demo, loop, use cases, commands, editions, closing, contact', () => {
  for (const lang of ['en', 'pt-br']) {
    const main = /<main>([\s\S]*?)<\/main>/.exec(read(`site/src/pages/${lang}/index.astro`))?.[1] ?? '';
    const sections = [...main.matchAll(/<([A-Z]\w*)\s+lang="([^"]+)"\s*\/>/g)];
    assert.deepEqual(sections.map((m) => m[1]), HOME_ORDER, `${lang}: the order of the sections`);
    for (const m of sections) assert.equal(m[2], lang, `${lang}: ${m[1]} in the page language`);
  }
});

const idOf = (src) => /^const LOOP_SETUP_ID = '([a-z][a-z0-9-]*)';$/m.exec(frontmatter(src))?.[1];

test('the home loop keeps its head, steps and links, and none of the four operation lists', () => {
  const loop = component('Loop');
  for (const [title, items] of LIST_KEYS) {
    assert.ok(!new RegExp(`\\bt\\.${title}\\b`).test(template(loop)), `the home loop no longer shows t.${title} as a list title`);
    assert.ok(!new RegExp(`\\bt\\.${items}\\b`).test(loop), `the home loop no longer reads t.${items}`);
  }
  assert.ok(!/loop-lists?\b/.test(loop), 'no list block left on the stage');
  for (const key of ['loopLabel', 'loopTitle', 'loopSubtitle', 'loopMore', 'loopMoreHref']) {
    assert.match(loop, new RegExp(`\\bt\\.${key}\\b`), `the loop keeps t.${key}`);
  }
  for (let n = 1; n <= 5; n++) {
    assert.match(loop, new RegExp(`\\bt\\.loopStep${n}Title\\b`));
    assert.match(loop, new RegExp(`\\bt\\.loopStep${n}Desc\\b`));
  }
});

test('the home loop links to the lists on the commands page, with loopSetupLink as its text', () => {
  const loop = component('Loop');
  const commands = component('CommandsDocs');
  const id = idOf(loop);
  assert.ok(id, 'Loop.astro names the id of the lists');
  assert.equal(idOf(commands), id, 'the commands page uses the same id');
  // The four list titles title the lists on the commands page; the home loop reads none of them.
  for (const [title] of LIST_KEYS) assert.ok(!new RegExp(`\\bt\\.${title}\\b`).test(loop), `Loop.astro no longer reads t.${title}`);
  const markup = template(loop);
  assert.match(markup, /<a href=\{`\/\$\{lang\}\/commands#\$\{LOOP_SETUP_ID\}`\} class="gx-link">\{t\.loopSetupLink\}<\/a>/, 'the link to the lists, with loopSetupLink as its text');
  assert.equal(loop.split('t.loopSetupLink').length, 2, 't.loopSetupLink once');
  assert.match(markup, /href=\{t\.loopMoreHref\}/, 'the link to the README stays');
});

test('the four lists sit in the implement entry of the commands page, after the loop mode block, under their id', () => {
  const src = component('CommandsDocs');
  const fm = frontmatter(src);
  const entry = /\{\s*\n\s{4}id: 'implement',[\s\S]*?\n {2}\},\n/.exec(fm)?.[0] ?? '';
  assert.ok(entry, 'the implement entry');
  const at = LIST_KEYS.flatMap(([title, items]) => [entry.indexOf(`t.${title}`), entry.indexOf(`t.${items}`)]);
  assert.ok(at.every((i) => i > 0), 'the implement entry carries the four titles and their items');
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in the order of the home page');
  for (const [title, items] of LIST_KEYS) {
    assert.equal(fm.split(`t.${title}`).length, 2, `t.${title} once`);
    assert.equal(fm.split(`t.${items}`).length, 2, `t.${items} once`);
  }
  const markup = template(src);
  const loopBlock = markup.indexOf('{cmd.loop && (');
  const setup = markup.indexOf('id={LOOP_SETUP_ID}');
  const output = markup.indexOf('entry-output');
  assert.ok(loopBlock >= 0 && setup > loopBlock && setup < output, 'the lists follow the loop mode block, before the output');
  assert.equal(markup.split('id={LOOP_SETUP_ID}').length, 2, 'one element carries the id');
  const block = markup.slice(setup, output);
  assert.match(block, /\{cmd\.loop\.setup\.map\(/, 'built from the entry\'s own list');
  assert.match(block, /<InlineCode text=\{item\} \/>/, 'inline code in the items, as on the home page');
  assert.match(block, /<ul class="entry-list">/, 'each list a plain list of the reading column');
  assert.ok(!/gx-escuro/.test(block), 'not on the dark stage');
});

test('the commands page link to the home loop still points at its section', () => {
  assert.match(template(component('CommandsDocs')), /href=\{`\/\$\{lang\}\/#loop`\}/);
});
