// Tests for the second half of the home page: the live demo, the use cases, the commands, the
// closing stage and the contact form (site/src/components/*.astro and site/src/lib/demo.js).
//
// * the stage of the spec sheet comes from a pure function, proved by property with inputs from a
//   seeded generator written here; the oracles are written in this file;
// * the content of the starting commit stays whole: every i18n key a component used there is still
//   used, the four use cases and the ten commands keep their order and their links;
// * the sheet is an accent: ready at rest, dimmed only under a mark the script adds, by opacity, so
//   what has not arrived reads weaker than what has in both themes;
// * the form keeps its destination, method, field names, ids and the fetch submit, and its script,
//   run against a fake fetch, reports success and failure in the page's language;
// * each command is reached once by keyboard and screen reader: the second link to it is a mouse
//   shortcut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const componentPath = (name) => join(root, 'site', 'src', 'components', `${name}.astro`);
const read = (name) => readFileSync(componentPath(name), 'utf8');
const demo = await import('../site/src/lib/demo.js').catch(() => null);

// The i18n keys each component used in the commit this part started from, in the order they first
// appear. The list is the oracle: it was transcribed from that commit once and does not change.
const BASE_KEYS = {
  LiveDemo: [
    'demoLabel', 'demoTitle', 'demoSubtitle', 'demoR1user', 'demoChallengeLabel', 'demoR2q1', 'demoR2q2',
    'demoR2q3', 'demoR2user', 'demoPushbackLabel', 'demoR3q1', 'demoR3q2', 'demoR3user', 'demoR4label',
    'demoOutputScope', 'demoR4scope', 'demoOutputAntiScope', 'demoR4antiscope', 'demoR5label', 'demoR5dod1',
    'demoR5dod2', 'demoR5dod3', 'demoR5dod4', 'demoOutputBudget', 'demoR5budget', 'demoR6label', 'demoR6file1',
    'demoR6file2', 'demoR6file3', 'demoR6status', 'demoR7label', 'demoR7verdict', 'demoR7dod1', 'demoR7dod2',
    'demoR7dod3', 'demoR7dod4', 'demoR7patterns', 'demoR7verdictDesc',
  ],
  UseCases: [
    'uc1Title', 'uc1Role', 'uc1Desc', 'uc1Flow', 'uc2Title', 'uc2Role', 'uc2Desc', 'uc2Flow', 'uc3Title', 'uc3Role',
    'uc3Desc', 'uc3Flow', 'uc4Title', 'uc4Role', 'uc4Desc', 'uc4Flow', 'useCasesLabel', 'useCasesTitle2',
    'useCasesSubtitle2',
  ],
  Features: [
    'feat1Title', 'feat1Desc', 'feat1For', 'feat1Highlights', 'feat2Title', 'feat2Desc', 'feat2For',
    'feat2Highlights', 'feat3Title', 'feat3Desc', 'feat3For', 'feat3Highlights', 'feat4Title', 'feat4Desc',
    'feat4For', 'feat4Highlights', 'feat5Title', 'feat5Desc', 'feat5For', 'feat5Highlights', 'feat6Title',
    'feat6Desc', 'feat6For', 'feat6Highlights', 'feat7Title', 'feat7Desc', 'feat7For', 'feat7Highlights',
    'feat10Title', 'cmdHotfixDesc', 'feat10For', 'feat10Highlights', 'feat8Title', 'feat8Desc', 'feat8For',
    'feat8Highlights', 'feat9Title', 'feat9Desc', 'feat9For', 'feat9Highlights', 'cmdLabel', 'cmdGridTitle',
    'featuresSubtitle', 'cmdDetails', 'cmdFullRef',
  ],
  FinalCTA: ['ctaTitle2', 'ctaBadgeOS', 'ctaBadgeMIT', 'ctaBadgeFree', 'ctaGithub', 'ctaCreator'],
  ContactForm: [
    'contactTitle', 'contactHeading', 'contactSubtitle', 'contactName', 'contactNamePlaceholder', 'contactEmail',
    'contactEmailPlaceholder', 'contactMessage', 'contactMessagePlaceholder', 'contactSend', 'contactSuccess',
  ],
};
const COMPONENTS = Object.keys(BASE_KEYS);

// `t.key` as the components write it, and not the tail of another name (document.getElementById).
const keysIn = (source) => [...new Set([...source.matchAll(/(?<![\w$.])t\.(\w+)/g)].map((m) => m[1]))];

// mulberry32: the test's own generator.
function generator(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cases(seed, count, build) {
  const r = generator(seed);
  const between = (lo, hi) => lo + (hi - lo) * r();
  const int = (lo, hi) => Math.floor(between(lo, hi + 1));
  return Array.from({ length: count }, () => build({ r, between, int }));
}

// A conversation laid out down the page: marks in document order, each with the stage it brings
// (never lower than the one before), the section's bottom below the last mark, and a viewport.
function layout(g) {
  const count = g.int(1, 14);
  const marks = [];
  let top = g.between(-200, 1600);
  let stage = 1;
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      top += g.between(8, 420);
      if (g.r() < 0.6) stage += g.int(1, 2);
    }
    marks.push({ top, stage });
  }
  const bottom = top + g.between(20, 900);
  const viewport = g.between(320, 1500);
  return { marks, bottom, viewport };
}

// The same layout after scrolling down by `by` pixels.
const scrolled = ({ marks, bottom, viewport }, by) => ({
  marks: marks.map((m) => ({ ...m, top: m.top - by })),
  bottom: bottom - by,
  viewport,
});

const stageOf = ({ marks, bottom, viewport }) => demo.demoStage(marks, { bottom, viewport });
const lastOf = (marks) => Math.max(1, ...marks.map((m) => m.stage));
const lineOf = (viewport) => viewport * demo.DEMO_LINE;
const endVisible = ({ bottom, viewport }) => bottom <= viewport + 2;

test('demo: the module exports the stage function and its line', () => {
  assert.ok(demo, 'site/src/lib/demo.js loads');
  assert.equal(typeof demo.demoStage, 'function');
  assert.ok(demo.DEMO_LINE > 0 && demo.DEMO_LINE <= 1, 'the line sits inside the viewport');
  assert.equal(demo.FIRST_STAGE, 1);
});

test('demo: the stage never goes back while the page scrolls down', () => {
  assert.ok(demo, 'site/src/lib/demo.js loads');
  for (const c of cases(301, 400, (g) => ({ base: layout(g), steps: Array.from({ length: 12 }, () => g.between(0, 400)) }))) {
    let at = c.base;
    let previous = stageOf(at);
    for (const step of c.steps) {
      at = scrolled(at, step);
      const now = stageOf(at);
      assert.ok(now >= previous, `stage went from ${previous} to ${now} after scrolling ${step}px`);
      previous = now;
    }
  }
});

test('demo: the last stage arrives when the last mark passes the line or the section end shows', () => {
  assert.ok(demo, 'site/src/lib/demo.js loads');
  for (const c of cases(302, 400, (g) => ({ base: layout(g), by: g.between(0, 6000) }))) {
    const at = scrolled(c.base, c.by);
    const last = lastOf(at.marks);
    const lastMark = at.marks[at.marks.length - 1];
    if (lastMark.top < lineOf(at.viewport)) assert.equal(stageOf(at), last, 'last mark past the line');
    if (endVisible(at)) assert.equal(stageOf(at), last, 'end of the section on screen');
  }
});

test('demo: with no mark past the line, the first stage holds', () => {
  assert.ok(demo, 'site/src/lib/demo.js loads');
  for (const c of cases(303, 400, (g) => ({ base: layout(g), below: g.between(1, 600) }))) {
    // Scroll so the first mark sits at or below the line.
    const line = lineOf(c.base.viewport);
    const at = scrolled(c.base, c.base.marks[0].top - (line + c.below));
    assert.ok(at.marks.every((m) => m.top >= line));
    if (endVisible(at)) continue;
    assert.equal(stageOf(at), 1);
  }
  assert.equal(demo.demoStage([], { bottom: 5000, viewport: 800 }), 1, 'no marks at all');
});

test('demo: in between, the stage is the highest one among the marks past the line', () => {
  assert.ok(demo, 'site/src/lib/demo.js loads');
  for (const c of cases(304, 400, (g) => ({ base: layout(g), by: g.between(-800, 4000) }))) {
    const at = scrolled(c.base, c.by);
    const stage = stageOf(at);
    assert.ok(Number.isInteger(stage) && stage >= 1 && stage <= lastOf(at.marks), `stage ${stage} in range`);
    if (endVisible(at)) continue;
    const passed = at.marks.filter((m) => m.top < lineOf(at.viewport)).map((m) => m.stage);
    assert.equal(stage, Math.max(1, ...passed));
  }
});

test('content: every i18n key a component used at the start is still used', () => {
  for (const name of COMPONENTS) {
    const now = new Set(keysIn(read(name)));
    const missing = BASE_KEYS[name].filter((k) => !now.has(k));
    assert.deepEqual(missing, [], `${name} no longer uses ${missing.join(', ')}`);
  }
});

test('use cases: four rows, in the order of today, as rows and not cards', () => {
  const source = read('UseCases');
  const order = [...source.matchAll(/t\.uc(\d)Title/g)].map((m) => Number(m[1]));
  assert.deepEqual(order, [1, 2, 3, 4]);
  assert.doesNotMatch(source, /class="[^"]*card/, 'no card markup');
  assert.match(source, /<ol\b|<ul\b/, 'a list');
});

test('commands: ten rows, in the order of today, with the links of today', () => {
  const source = read('Features');
  const ids = [...source.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['analyze', 'gen-spec', 'implement', 'audit', 'discover', 'prompt-pack', 'quick', 'hotfix', 'teach', 'stats']);
  const titles = [...source.matchAll(/t\.(feat\d+)Title/g)].map((m) => m[1]);
  assert.deepEqual(titles, ['feat1', 'feat2', 'feat3', 'feat4', 'feat5', 'feat6', 'feat7', 'feat10', 'feat8', 'feat9']);
  assert.match(source, /href=\{`\/\$\{lang\}\/commands#\$\{cmd\.id\}`\}[^>]*>[\s\S]*?\{t\.cmdDetails\}/, 'details link per command');
  assert.match(source, /href=\{`\/\$\{lang\}\/commands`\}[^>]*>\s*\{t\.cmdFullRef\}/, 'full reference link');
  assert.doesNotMatch(source, /class="[^"]*card/, 'no card markup');
});

test('closing: the dark stage keeps the GitHub link and the badges', () => {
  const source = read('FinalCTA');
  assert.match(source, /class="[^"]*\bgx-escuro\b/, 'dark stage from the design system');
  assert.match(source, /href="https:\/\/github\.com\/pe-menezes\/vibeflow"/);
  assert.equal((source.match(/gx-chip--escuro/g) ?? []).length >= 3, true, 'three badges as dark chips');
});

test('form: destination, method, names, ids and the fetch submit of today', () => {
  const source = read('ContactForm');
  assert.match(source, /const FORMSPREE_ID = 'xgonvawy';/);
  assert.match(source, /action=\{`https:\/\/formspree\.io\/f\/\$\{FORMSPREE_ID\}`\}/);
  assert.match(source, /<form\b[^>]*\smethod="POST"/);
  assert.match(source, /<form\b[^>]*\sid="contact-form"/);
  for (const [tag, id, name] of [['input', 'c-name', 'name'], ['input', 'c-email', 'email'], ['textarea', 'c-msg', 'message']]) {
    const field = new RegExp(`<${tag}\\b[^>]*>`, 'g');
    const found = [...source.matchAll(field)].map((m) => m[0]).find((s) => s.includes(` id="${id}"`));
    assert.ok(found, `${tag}#${id}`);
    assert.match(found, new RegExp(`\\sname="${name}"`), `${id} keeps name="${name}"`);
    assert.match(found, /\srequired\b/, `${id} stays required`);
    assert.match(found, /class="[^"]*\bgx-campo__entrada\b/, `${id} uses the design system field`);
  }
  assert.equal((source.match(/class="gx-campo\b/g) ?? []).length, 3, 'three design system fields');
  assert.match(source, /fetch\(contactForm\.action,\s*\{[\s\S]*?method:\s*'POST'[\s\S]*?new FormData\(contactForm\)/);
});

test('demo: the sheet is ready at rest and only dims under the mark the script adds', () => {
  const source = read('LiveDemo');
  assert.match(source, /from '\.\.\/lib\/demo\.js'/, 'the script uses the pure stage function');
  assert.match(source, /data-demo-sheet/, 'the sheet is marked');
  const markup = source.split(/<script\b/)[0];
  assert.doesNotMatch(markup, /\sdata-(live|arrived|checked)\b/, 'no live state in the markup');
  assert.match(source, /matchMedia\('\(min-width:\s*980px\) and \(prefers-reduced-motion:\s*no-preference\)'\)/, 'live only on wide screens with motion');
  const style = /<style>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? '';
  for (const m of style.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = m[1].trim();
    if (/data-arrived="false"|:not\(\[data-checked/.test(selector)) {
      assert.match(selector, /\[data-live\]/, `${selector} dims only while the sheet is live`);
    }
  }
  for (const k of ['demoR5dod1', 'demoR5dod2', 'demoR5dod3', 'demoR5dod4', 'demoR7verdict', 'demoR6file1']) {
    assert.match(markup, new RegExp(`t\\.${k}\\b`), `${k} in the markup`);
  }
});

test('nothing is hidden at rest in the five components', () => {
  for (const name of COMPONENTS) {
    const source = read(name);
    const style = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    assert.doesNotMatch(style, /opacity\s*:\s*0(\.0+)?\s*(;|\}|$)/m, `${name}: opacity 0`);
    assert.doesNotMatch(style, /visibility\s*:\s*hidden/, `${name}: visibility hidden`);
    assert.doesNotMatch(style, /display\s*:\s*none/, `${name}: display none`);
  }
});

test('i18n: the labels the new design needs exist in both languages', () => {
  const en = readFileSync(join(root, 'site', 'src', 'i18n', 'en.ts'), 'utf8');
  const pt = readFileSync(join(root, 'site', 'src', 'i18n', 'pt-br.ts'), 'utf8');
  const source = read('LiveDemo');
  for (const key of ['demoSheetLabel', 'demoSheetName']) {
    assert.match(source, new RegExp(`t\\.${key}\\b`), `LiveDemo uses ${key}`);
    assert.match(en, new RegExp(`\\n\\s*${key}:`), `en.ts has ${key}`);
    assert.match(pt, new RegExp(`\\n\\s*${key}:`), `pt-br.ts has ${key}`);
  }
});

// ---------------------------------------------------------------------------------------------
// The dimmed sheet, measured in both themes with the design system's own tokens.

const stylesDir = join(root, 'site', 'src', 'styles');
const DESIGN = readFileSync(join(stylesDir, 'genius', 'genius-tudo.css'), 'utf8');
const NIGHT = readFileSync(join(stylesDir, 'genius', 'genius-noite.css'), 'utf8');
const GLOBAL = readFileSync(join(stylesDir, 'global.css'), 'utf8');
const styleOf = (source) => [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

// Custom properties of the first block that opens with `open`.
function tokenBlock(css, open) {
  const start = css.indexOf(open);
  assert.ok(start >= 0, `token block ${open}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const LIGHT_TOKENS = tokenBlock(DESIGN, ':root {');
const THEMES = {
  light: LIGHT_TOKENS,
  dark: { ...LIGHT_TOKENS, ...tokenBlock(NIGHT, ':root[data-theme="dark"]') },
};

// Plain rules (selector list and declarations), media blocks flattened.
function rulesOf(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
    decls: Object.fromEntries([...m[2].matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map((d) => [d[1], d[2].trim()])),
  }));
}
const DEMO_RULES = rulesOf(styleOf(read('LiveDemo')));
const SITE_RULES = [...DEMO_RULES, ...rulesOf(GLOBAL), ...rulesOf(DESIGN)];

// The last value of `prop` for an exact selector, the component first, then the site and the design system.
function declared(selector, prop) {
  for (const rules of [DEMO_RULES, SITE_RULES]) {
    const found = rules.filter((r) => r.selectors.includes(selector) && prop in r.decls).at(-1);
    if (found) return found.decls[prop];
  }
  return null;
}
const firstDeclared = (selectors, prop) => selectors.map((s) => declared(s, prop)).find((v) => v !== null) ?? null;

function resolveColor(value, tokens) {
  let v = value;
  for (let i = 0; i < 10 && /var\(/.test(v); i++) v = v.replace(/var\((--[\w-]+)\)/g, (_, name) => tokens[name] ?? `(missing ${name})`);
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)?.[1];
  assert.ok(hex, `${value} resolves to a hex colour (${v})`);
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (fg, bg, alpha) => fg.map((c, i) => alpha * c + (1 - alpha) * bg[i]);

// The rule that dims an item of the sheet while it has not arrived, and the item types it carries:
// `carrier` holds data-since (its own colour, then its parent's), `inner` is the text inside it
// with a colour of its own (component rule first), `dimInner` the suffix a dim rule would use.
const DIM = '.demo-sheet[data-live] [data-arrived="false"]';
const SHEET_ITEMS = {
  'field key': { carrier: ['.gx-ficha'], inner: ['.demo-sheet .gx-ficha .k', '.gx-ficha .k'], dimInner: '.k' },
  'field value': { carrier: ['.gx-ficha'], inner: ['.demo-sheet .gx-ficha .v', '.gx-ficha .v'], dimInner: '.v' },
  check: { carrier: ['.demo-sheet__dod li', '.demo-sheet__dod'], inner: [], dimInner: null },
  file: { carrier: ['.demo-sheet__files'], inner: ['code'], dimInner: 'code' },
  'verdict text': { carrier: ['.demo-sheet__verdict'], inner: [], dimInner: null },
};

test('demo: what has not arrived reads weaker than what has, in both themes, and stays readable', (t) => {
  const opacity = Number(declared(DIM, 'opacity') ?? 1);
  const card = ['.gx-cartao'];
  for (const [theme, tokens] of Object.entries(THEMES)) {
    const paper = resolveColor(firstDeclared(['.gx-cartao'], 'background'), tokens);
    for (const [item, { carrier, inner, dimInner }] of Object.entries(SHEET_ITEMS)) {
      const arrivedInk = firstDeclared([...inner, ...carrier, ...card], 'color');
      const dimmedInk = firstDeclared([...(dimInner ? [`${DIM} ${dimInner}`] : []), ...inner, DIM, ...carrier, ...card], 'color');
      const arrived = contrast(resolveColor(arrivedInk, tokens), paper);
      const dimmed = contrast(over(resolveColor(dimmedInk, tokens), paper, opacity), paper);
      t.diagnostic(`${theme} · ${item}: arrived ${arrived.toFixed(2)}:1, dimmed ${dimmed.toFixed(2)}:1`);
      assert.ok(dimmed < arrived, `${theme} · ${item}: dimmed ${dimmed.toFixed(2)} reads lower than arrived ${arrived.toFixed(2)}`);
      assert.ok(dimmed >= 3, `${theme} · ${item}: dimmed ${dimmed.toFixed(2)} stays at 3:1 or more`);
    }
  }
});

test('demo: the sheet dims by opacity alone, with an opacity transition, and the verdict chip stays unfilled', () => {
  const opacity = Number(declared(DIM, 'opacity'));
  assert.ok(opacity > 0 && opacity < 1, `the dim rule sets an opacity between 0 and 1 (${declared(DIM, 'opacity')})`);
  const dimRules = DEMO_RULES.filter((r) => r.selectors.some((s) => s.startsWith(DIM)));
  for (const rule of dimRules) {
    if (rule.selectors.every((s) => / \.gx-chip$/.test(s))) continue;
    assert.ok(!('color' in rule.decls), `${rule.selectors.join(', ')} changes no colour: the same rule holds in both themes`);
  }
  assert.match(declared('.demo-sheet [data-since]', 'transition') ?? '', /\bopacity\b/, 'arriving fades in');
  assert.equal(declared(`${DIM} .gx-chip`, 'background'), 'transparent', 'the chip stays unfilled until the verdict');
});

// ---------------------------------------------------------------------------------------------
// The contact form script, run against a fake fetch: nothing is sent.

function i18nValue(lang, key) {
  const text = readFileSync(join(root, 'site', 'src', 'i18n', `${lang}.ts`), 'utf8');
  const m = new RegExp(`\\n\\s*${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(text);
  return m ? m[1].replace(/\\(.)/g, '$1') : undefined;
}

// The attributes of a start tag, with `{t.key}` values resolved in `lang`.
function attributes(tag, lang) {
  const out = {};
  for (const m of tag.matchAll(/\s([\w-]+)(?:=(?:"([^"]*)"|\{([^}]*)\}))?/g)) {
    const expr = m[3]?.trim();
    out[m[1]] = expr ? i18nValue(lang, /^t\.(\w+)$/.exec(expr)?.[1] ?? '') ?? `(unresolved ${expr})` : m[2] ?? '';
  }
  return out;
}

// A small page built from the component's markup: the elements the script reaches by id, the
// submit button, and the three fields with what the visitor typed.
function contactPage(lang) {
  const source = read('ContactForm');
  const markup = source.split(/<script\b/)[0];
  const doc = { activeElement: null };
  const node = (tag, inner = '') => {
    const attrs = attributes(tag, lang);
    const el = {
      attrs,
      hidden: 'hidden' in attrs,
      textContent: inner.replace(/\{t\.(\w+)\}/g, (_, k) => i18nValue(lang, k)).trim(),
      dataset: Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()), v])),
      focus() { if ('tabindex' in attrs || /^(button|input|textarea|a)$/.test(tag.slice(1).split(/\s/)[0])) doc.activeElement = el; },
    };
    return el;
  };
  const byId = (id) => {
    const m = new RegExp(`(<([a-z]+)\\b[^>]*\\sid="${id}"[^>]*>)([\\s\\S]*?)</\\2>`).exec(markup);
    return m ? node(m[1], m[3]) : null;
  };
  const buttonTag = /(<button\b[^>]*class="[^"]*\bcontact-submit\b[^>]*>)([\s\S]*?)<\/button>/.exec(markup);
  const button = node(buttonTag[1], buttonTag[2]);
  button.disabled = false;
  const fields = ['c-name', 'c-email', 'c-msg'].map((id) => ({ id, value: `typed into ${id}` }));
  const form = byId('contact-form');
  const handlers = {};
  form.action = /action=\{`([^`]+)`\}/.exec(markup)[1].replace('${FORMSPREE_ID}', /const FORMSPREE_ID = '([^']+)'/.exec(source)[1]);
  form.addEventListener = (type, f) => { handlers[type] = f; };
  form.querySelector = (sel) => (sel === '.contact-submit' ? button : null);
  form.resets = 0;
  form.reset = () => { form.resets++; };
  const elements = { 'contact-form': form };
  for (const id of [...markup.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1])) elements[id] ??= byId(id);
  const calls = [];
  const replies = [];
  class FormData { constructor(f) { this.form = f; } }
  const context = {
    document: { getElementById: (id) => elements[id] ?? null, get activeElement() { return doc.activeElement; } },
    fetch: (url, init) => { calls.push({ url, init }); return new Promise((ok, fail) => replies.push({ ok, fail })); },
    FormData,
  };
  const code = (/<script>([\s\S]*?)<\/script>/.exec(source)?.[1] ?? '').replace(/\s+as\s+HTML\w+(\s*\|\s*null)?/g, '');
  vm.runInNewContext(code, context);
  const submit = (reply) => {
    const done = handlers.submit({ preventDefault() {} });
    const r = replies.at(-1);
    if (reply === 'ok') r.ok({ ok: true });
    else if (reply === 'http error') r.ok({ ok: false, status: 500 });
    else r.fail(new TypeError('network'));
    return done;
  };
  const fail = () => replies.at(-1).fail(new TypeError('network'));
  return { elements, button, fields, form, calls, doc, submit, fail, handlers };
}

// What a sighted visitor reads in the region announced on failure.
function errorRegion(page) {
  const announced = Object.values(page.elements).filter((el) => el && (/^(alert|status)$/.test(el.attrs.role ?? '') || 'aria-live' in el.attrs));
  return announced.filter((el) => el.attrs.id !== 'form-success');
}
const shown = (el) => (el.hidden ? '' : el.textContent);

test('form: a failed send shows the error of the page language in an announced region and keeps what was typed', async () => {
  for (const lang of ['en', 'pt-br']) {
    const message = i18nValue(lang, 'contactError');
    assert.ok(message, `${lang} has contactError`);
    for (const failure of ['http error', 'network error']) {
      const page = contactPage(lang);
      assert.equal(typeof page.handlers.submit, 'function', `${lang}: the script handles submit`);
      const regions = errorRegion(page);
      assert.equal(regions.length, 1, `${lang}: one announced region for the error besides the success message`);
      const [region] = regions;
      assert.equal(shown(region), '', `${lang}: no error at rest`);
      await page.submit(failure);
      assert.equal(shown(region), message, `${lang} · ${failure}: the visitor reads contactError`);
      assert.equal(page.button.disabled, false, `${lang} · ${failure}: the button is usable again`);
      assert.equal(page.button.textContent, i18nValue(lang, 'contactSend'), `${lang} · ${failure}: the button reads its label`);
      assert.equal(page.elements['contact-body'].hidden, false, `${lang} · ${failure}: the form stays`);
      assert.equal(page.elements['form-success'].hidden, true, `${lang} · ${failure}: no success message`);
      assert.deepEqual(page.fields.map((f) => f.value), ['c-name', 'c-email', 'c-msg'].map((id) => `typed into ${id}`), 'what was typed stays');
      assert.equal(page.form.resets, 0, 'the form is not reset');
      // Sending again clears the old error while the request is out, so a second failure is announced anew.
      const again = page.handlers.submit({ preventDefault() {} });
      assert.equal(shown(region), '', `${lang}: the error clears while sending again`);
      assert.equal(page.calls.length, 2, 'a second request');
      page.fail();
      await again;
      assert.equal(shown(region), message, `${lang} · ${failure}: a second failure shows the error again`);
    }
  }
});

test('form: a successful send moves the focus to the success message and shows no error', async () => {
  for (const lang of ['en', 'pt-br']) {
    const page = contactPage(lang);
    await page.submit('ok');
    const success = page.elements['form-success'];
    assert.equal(page.calls.length, 1, `${lang}: one request, to the fake fetch`);
    assert.equal(page.calls[0].url, 'https://formspree.io/f/xgonvawy');
    assert.equal(page.elements['contact-body'].hidden, true, `${lang}: the form is hidden`);
    assert.equal(success.hidden, false, `${lang}: the success message shows`);
    assert.equal(success.textContent, i18nValue(lang, 'contactSuccess'));
    assert.equal(page.doc.activeElement, success, `${lang}: the focus is on the success message`);
    for (const region of errorRegion(page)) assert.equal(shown(region), '', `${lang}: no error after success`);
  }
});

test('form: after a failure, a retry that succeeds clears the error', async () => {
  for (const lang of ['en', 'pt-br']) {
    const page = contactPage(lang);
    const [region] = errorRegion(page);
    assert.ok(region, `${lang}: an announced region for the error`);
    await page.submit('network error');
    assert.equal(shown(region), i18nValue(lang, 'contactError'));
    await page.submit('ok');
    assert.equal(shown(region), '', `${lang}: the error is gone`);
    assert.equal(page.doc.activeElement, page.elements['form-success']);
  }
});

test('commands: each command is one stop for the keyboard and the screen reader', () => {
  const source = read('Features');
  const row = /<li class="cmd-row">([\s\S]*?)<\/li>/.exec(source)?.[1] ?? '';
  const links = [...row.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
  const title = links.find((a) => /\{cmd\.title\}/.test(a));
  const details = links.find((a) => /\{t\.cmdDetails\}/.test(a));
  assert.ok(title && details, 'a title link and a details link per command');
  assert.doesNotMatch(title, /aria-hidden|tabindex/, 'the title link is the one that is read and reached');
  assert.match(details, /\saria-hidden="true"/, 'the details link is out of the screen reader');
  assert.match(details, /\stabindex="-1"/, 'the details link is out of the tab order');
});

test('no machine path in the files of this part', () => {
  const files = [...COMPONENTS.map(componentPath), join(root, 'site', 'src', 'lib', 'demo.js')];
  for (const file of files) {
    const rel = relative(root, file);
    let text = '';
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      assert.fail(`${rel} exists`);
    }
    assert.ok(!text.includes(['', 'Users', ''].join('/')), `${rel} carries a machine path`);
  }
});
