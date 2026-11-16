// Tests for the second half of the home page: the live demo, the use cases, the commands, the
// closing stage and the contact form (site/src/components/*.astro and site/src/lib/demo.js).
//
// * the stage of the spec sheet comes from a pure function, proved by property with inputs from a
//   seeded generator written here; the oracles are written in this file;
// * the content of the starting commit stays whole: every i18n key a component used there is still
//   used, the four use cases and the ten commands keep their order and their links;
// * the sheet is an accent: ready at rest, dimmed only under a mark the script adds;
// * the form keeps its destination, method, field names, ids and the fetch submit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const componentPath = (name) => join(root, 'site', 'src', 'components', `${name}.astro`);
const read = (name) => readFileSync(componentPath(name), 'utf8');
const demo = await import('../site/src/lib/demo.js').catch(() => null);

// The commit this part started from, and the i18n keys each component used there, in the order
// they first appear. When the commit is in the clone, the lists are checked against it.
const BASE = '52704a8';
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

function baseSource(name) {
  try {
    return execFileSync('git', ['show', `${BASE}:site/src/components/${name}.astro`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

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

test('content: the key lists are the ones the starting commit uses', (t) => {
  for (const name of COMPONENTS) {
    const source = baseSource(name);
    if (source === null) {
      t.diagnostic(`${BASE} is not in this clone (shallow checkout): ${name} checked against the written list`);
      continue;
    }
    assert.deepEqual(keysIn(source), BASE_KEYS[name], `${name} at ${BASE}`);
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
