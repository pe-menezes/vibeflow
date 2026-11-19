// The rendered-site measure (site/scripts/measure-rendered.mjs) decides "this text is hidden, and
// why" in pure functions that take what Chrome measured. These tests feed them measured facts, with
// no browser: every way to hide text, on a text run and on a pseudo-element that draws text, inside
// and outside the list of exceptions, and the case in view that must come out clean. The measure
// itself runs in Chrome, by hand, with `npm run measure` in site/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCEPTIONS, PAGES, THEMES, WIDTHS, findHidden, hiddenReasons } from '../site/scripts/measure-rendered.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VIEWPORT = { width: 390, height: 844 };

// The computed style of one box in the chain, as the measure reads it from Chrome.
const style = (element, extra = {}) => ({
  element,
  id: /#([\w-]+)/.exec(element)?.[1] ?? '',
  classes: [...element.matchAll(/\.([\w-]+)/g)].map((m) => m[1]),
  display: 'block',
  visibility: 'visible',
  opacity: '1',
  fontSize: '16px',
  color: 'rgb(10, 10, 10)',
  textFillColor: 'rgb(10, 10, 10)',
  clip: 'auto',
  clipPath: 'none',
  overflowX: 'visible',
  overflowY: 'visible',
  position: 'static',
  box: { x: 0, y: 0, width: 390, height: 400 },
  ...extra,
});

// A text in view: a run of text in a paragraph, or the ::after of a button that draws "Copy", inside
// a section with an id, in the body.
function target(kind) {
  const owner = kind === 'text'
    ? [style('p.lede', { box: { x: 20, y: 100, width: 350, height: 40 } })]
    : [style('button.copy::after', { display: 'inline', box: { x: 20, y: 100, width: 40, height: 20 } }), style('button.copy', { display: 'inline-block', box: { x: 20, y: 100, width: 60, height: 20 } })];
  return {
    kind,
    element: owner[0].element,
    text: kind === 'text' ? 'Spec first' : 'Copy',
    boxes: [{ x: 20, y: 100, width: 40, height: 20 }],
    chain: [...owner, style('section#how'), style('body'), style('html')],
  };
}

// Each way to hide the text: the change to the measured facts, and the reason it must come out with.
const set = (at, extra) => (t) => { Object.assign(t.chain[at], extra); };
const HIDE = {
  'no box': { reason: 'no box', apply: (t) => { t.boxes = []; } },
  'display: none on the owner': { reason: 'display: none', apply: (t) => { t.boxes = []; set(0, { display: 'none' })(t); } },
  'display: none on an ancestor': { reason: 'display: none', apply: (t) => { t.boxes = []; set(t.chain.length - 3, { display: 'none' })(t); } },
  'visibility hidden': { reason: 'visibility: hidden', apply: set(0, { visibility: 'hidden' }) },
  'visibility collapse': { reason: 'visibility: collapse', apply: set(0, { visibility: 'collapse' }) },
  'opacity 0 on the owner': { reason: 'opacity 0', apply: set(0, { opacity: '0' }) },
  'opacity 0 on an ancestor': { reason: 'opacity 0 on an ancestor', apply: (t) => set(t.chain.length - 3, { opacity: '0' })(t) },
  'font size 0': { reason: 'font size 0', apply: (t) => { set(0, { fontSize: '0px' })(t); t.boxes = [{ x: 20, y: 100, width: 0, height: 0 }]; } },
  'transparent colour': { reason: 'transparent colour', apply: set(0, { color: 'rgba(0, 0, 0, 0)', textFillColor: 'rgba(0, 0, 0, 0)' }) },
  'transparent text fill': { reason: 'transparent colour', apply: set(0, { textFillColor: 'rgba(0, 0, 0, 0)' }) },
  'clip to nothing': { reason: 'clipped away', apply: set(0, { position: 'absolute', clip: 'rect(0px, 0px, 0px, 0px)' }) },
  'clip-path that closes': { reason: 'clipped away', apply: set(0, { clipPath: 'inset(50%)' }) },
  'overflow hidden on a box that misses the text': { reason: 'clipped away', apply: (t) => set(t.chain.length - 3, { overflowX: 'hidden', overflowY: 'hidden', box: { x: 0, y: 600, width: 390, height: 50 } })(t) },
  'overflow clip on an empty box': { reason: 'clipped away', apply: (t) => set(t.chain.length - 3, { overflowX: 'clip', overflowY: 'clip', box: { x: 20, y: 100, width: 0, height: 0 } })(t) },
  'off screen to the left': { reason: 'off screen to the left', apply: (t) => { t.boxes = [{ x: -2000, y: 100, width: 40, height: 20 }]; } },
  'off screen to the right': { reason: 'off screen to the right', apply: (t) => { t.boxes = [{ x: VIEWPORT.width + 10, y: 100, width: 40, height: 20 }]; } },
  'off screen above': { reason: 'off screen above', apply: (t) => { t.boxes = [{ x: 20, y: -500, width: 40, height: 20 }]; } },
};

test('a text and a pseudo-element with text in view come out clean', () => {
  for (const kind of ['text', 'pseudo']) assert.deepEqual(hiddenReasons(target(kind), VIEWPORT), [], kind);
});

test('each way to hide text, on a text run and on a pseudo-element, comes out with its reason', () => {
  const failures = [];
  for (const kind of ['text', 'pseudo']) {
    for (const [way, { reason, apply }] of Object.entries(HIDE)) {
      const t = target(kind);
      apply(t);
      const reasons = hiddenReasons(t, VIEWPORT);
      if (reasons.length !== 1 || !reasons[0].startsWith(reason)) failures.push(`${kind}, ${way}: ${JSON.stringify(reasons)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('text partly off screen, partly clipped, or in a box that only scrolls is not hidden', () => {
  const partly = target('text');
  partly.boxes = [{ x: -30, y: 100, width: 60, height: 20 }];
  assert.deepEqual(hiddenReasons(partly, VIEWPORT), []);
  const half = target('text');
  Object.assign(half.chain[1], { overflowX: 'hidden', overflowY: 'hidden', box: { x: 0, y: 110, width: 390, height: 50 } });
  assert.deepEqual(hiddenReasons(half, VIEWPORT), []);
  const scrolls = target('text');
  Object.assign(scrolls.chain[1], { overflowX: 'auto', overflowY: 'hidden', box: { x: 0, y: 100, width: 390, height: 50 } });
  scrolls.boxes = [{ x: 500, y: 110, width: 40, height: 20 }];
  assert.deepEqual(hiddenReasons(scrolls, VIEWPORT), [], 'reachable by scrolling its box');
  const faint = target('text');
  faint.chain[0].opacity = '0.4';
  faint.chain[2].opacity = '0.5';
  assert.deepEqual(hiddenReasons(faint, VIEWPORT), []);
});

// What the measure saw on one page, at one width, in one theme.
const seen = (targets, width = 390, theme = 'light') => ({ page: '/en/', width, theme, viewport: { width, height: 844 }, targets });

test('a hidden text inside an element of the exceptions is not reported, and the same text outside is', () => {
  const exceptions = [{ match: '#how', reason: 'shown later by a script' }];
  const failures = [];
  for (const kind of ['text', 'pseudo']) {
    for (const [way, { apply }] of Object.entries(HIDE)) {
      const inside = target(kind);
      apply(inside);
      const outside = target(kind);
      apply(outside);
      outside.chain = outside.chain.map((s) => (s.id === 'how' ? { ...s, element: 'section#why', id: 'why' } : s));
      const found = findHidden([seen([inside, outside])], exceptions);
      if (found.length !== 1 || !found[0].chain.some((s) => s.id === 'why')) failures.push(`${kind}, ${way}: ${JSON.stringify(found.map((f) => f.element))}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('an exception scoped to a width or a theme covers only that width or theme', () => {
  const hidden = () => {
    const t = target('text');
    HIDE['display: none on an ancestor'].apply(t);
    return t;
  };
  const exceptions = [{ match: '#how', width: 1280, theme: 'dark', reason: 'wide screens, dark theme' }];
  assert.equal(findHidden([seen([hidden()], 1280, 'dark')], exceptions).length, 0);
  assert.equal(findHidden([seen([hidden()], 390, 'dark')], exceptions).length, 1);
  assert.equal(findHidden([seen([hidden()], 1280, 'light')], exceptions).length, 1);
  const byClass = [{ match: '.copy', reason: 'a class' }];
  const pseudo = target('pseudo');
  HIDE['opacity 0 on the owner'].apply(pseudo);
  assert.equal(findHidden([seen([pseudo])], byClass).length, 0);
});

test('a report names the page, the width, the theme, the element and the reason', () => {
  const t = target('pseudo');
  HIDE['opacity 0 on the owner'].apply(t);
  const [found] = findHidden([seen([t], 1280, 'dark')], []);
  assert.equal(found.page, '/en/');
  assert.equal(found.width, 1280);
  assert.equal(found.theme, 'dark');
  assert.equal(found.element, 'button.copy::after');
  assert.deepEqual(found.reasons, ['opacity 0']);
});

test('the measure covers the seven pages, two widths and two themes, and every exception has its reason', () => {
  assert.deepEqual([...PAGES].sort(), ['/', '/en/', '/en/anatomy/', '/en/commands/', '/pt-br/', '/pt-br/anatomy/', '/pt-br/commands/']);
  assert.deepEqual(WIDTHS, [390, 1280]);
  assert.deepEqual(THEMES, ['light', 'dark']);
  assert.ok(EXCEPTIONS.some((e) => e.match === '#form-success'), 'the form success message is listed');
  for (const e of EXCEPTIONS) {
    assert.match(e.match, /^[#.][\w-]+$/, `${e.match}: an id or a class`);
    assert.ok(typeof e.reason === 'string' && e.reason.length > 10, `${e.match}: a reason`);
  }
});

test('npm run measure runs the script by hand, outside the build, and the script is not a check-* the build must run', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'site', 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.measure, 'node scripts/measure-rendered.mjs');
  assert.doesNotMatch(pkg.scripts.build, /measure/);
  const names = readdirSync(join(ROOT, 'site', 'scripts'));
  assert.ok(names.includes('measure-rendered.mjs'));
  const source = readFileSync(join(ROOT, 'site', 'scripts', 'measure-rendered.mjs'), 'utf8');
  assert.match(source, /setScriptExecutionDisabled/, 'the page runs with JavaScript off');
  assert.match(source, /127\.0\.0\.1/, 'served on the loopback address');
});
