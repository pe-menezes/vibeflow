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
import { EXCEPTIONS, PAGES, THEMES, WIDTHS, describeFinding, findHidden, hiddenReasons } from '../site/scripts/measure-rendered.mjs';

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

// ---------- the reach of a scrolling box ----------

// The oracle for one axis, written apart from the measure: the text's reach starts as its own span
// and climbs the chain. A box that scrolls on the axis cannot reach what lies wholly before its
// origin (out of reach), brings into its own span what lies wholly after its end, and leaves alone
// what crosses it. A box that cuts on the axis cuts away what lies wholly outside it. A visible box
// changes nothing. The reach left at the end must have some part on screen: not wholly left of the
// page or right of the viewport on x, not wholly above the page on y.
function reachOracle(axis, overflow, text, box, viewport) {
  const end = (s) => s.at + s.size;
  let reach = text;
  if (overflow === 'auto' || overflow === 'scroll') {
    if (end(text) <= box.at) return 'hidden';
    if (text.at >= end(box)) reach = box;
  } else if (overflow === 'hidden') {
    if (end(text) <= box.at || text.at >= end(box)) return 'hidden';
  }
  if (end(reach) <= 0) return 'hidden';
  if (axis === 'x' && reach.at >= viewport.width) return 'hidden';
  return 'in view';
}

test('a scrolling box reaches what lies after its end and not what lies before its origin, on each axis', () => {
  const failures = [];
  const boxPlaces = { x: { inside: 50, left: -1000, right: 1000 }, y: { inside: 50, above: -1000 } };
  for (const axis of ['x', 'y']) {
    const [p, size, other, otherSize] = axis === 'x' ? ['x', 'width', 'y', 'height'] : ['y', 'height', 'x', 'width'];
    for (const overflow of ['auto', 'scroll', 'hidden', 'visible']) {
      for (const [place, at] of Object.entries(boxPlaces[axis])) {
        const box = { at, size: 200 };
        const texts = { before: { at: at - 100, size: 40 }, crossing: { at: at + 180, size: 40 }, after: { at: at + 300, size: 40 } };
        for (const [where, span] of Object.entries(texts)) {
          const t = target('text');
          // The box holds the text on the other axis, so only this axis decides.
          Object.assign(t.chain[1], {
            [axis === 'x' ? 'overflowX' : 'overflowY']: overflow,
            box: { [p]: box.at, [size]: box.size, [other]: 90, [otherSize]: 60 },
          });
          t.boxes = [{ [p]: span.at, [size]: span.size, [other]: 100, [otherSize]: 20 }];
          const want = reachOracle(axis, overflow, span, box, VIEWPORT);
          const got = hiddenReasons(t, VIEWPORT).length ? 'hidden' : 'in view';
          if (got !== want) failures.push(`${axis}, ${overflow}, box ${place}, text ${where}: ${got}, expected ${want} ${JSON.stringify(hiddenReasons(t, VIEWPORT))}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('two scrolling boxes, one inside the other, each bound the reach of what they hold', () => {
  const nested = (innerX, textX) => {
    const t = target('text');
    t.chain[0] = style('p.lede', { overflowX: 'visible', box: { x: textX, y: 100, width: 40, height: 20 } });
    t.chain.splice(1, 0, style('div.inner', { overflowX: 'auto', box: { x: innerX, y: 90, width: 100, height: 60 } }));
    Object.assign(t.chain[2], { overflowX: 'auto', box: { x: 50, y: 80, width: 200, height: 80 } });
    t.boxes = [{ x: textX, y: 100, width: 40, height: 20 }];
    return hiddenReasons(t, VIEWPORT);
  };
  // the text after the end of the inner box, which lies after the end of the outer box: in reach
  assert.deepEqual(nested(400, 600), []);
  // the text after the end of the inner box, which lies before the origin of the outer box: out of reach
  assert.notDeepEqual(nested(-400, -200), []);
  // the text before the origin of the inner box, inside the outer one: out of reach
  assert.notDeepEqual(nested(100, 20), []);
});

// ---------- clips that leave nothing ----------

test('every basic clip-path shape is read: only a shape of no area clips the text away, in px and in percent', () => {
  // The owner's box is 200 x 100 at (20, 100); the text sits inside it.
  const shapes = {
    inset: { zero: ['inset(50px 0px 50px 0px)', 'inset(50% 0% 50% 0%)'], part: ['inset(10px 20px)', 'inset(10% 20%)'], whole: ['inset(0px)', 'inset(0%)'] },
    circle: { zero: ['circle(0px at 50% 50%)', 'circle(0% at 50% 50%)'], part: ['circle(30px at 50% 50%)', 'circle(20% at 50% 50%)'], whole: ['circle(500px at 50% 50%)', 'circle(100% at 50% 50%)'] },
    ellipse: { zero: ['ellipse(0px 40px at 50% 50%)', 'ellipse(40% 0% at 50% 50%)'], part: ['ellipse(50px 20px at 50% 50%)', 'ellipse(25% 20% at 50% 50%)'], whole: ['ellipse(400px 400px at 50% 50%)', 'ellipse(100% 100% at 50% 50%)'] },
    polygon: { zero: ['polygon(0px 0px, 0px 0px, 0px 0px)', 'polygon(0% 0%, 50% 50%, 100% 100%)'], part: ['polygon(0px 0px, 100px 0px, 0px 50px)', 'polygon(0% 0%, 50% 0%, 0% 50%)'], whole: ['polygon(0px 0px, 200px 0px, 200px 100px, 0px 100px)', 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'] },
    rect: { zero: ['rect(50px 200px 50px 0px)', 'rect(0% 30% 100% 30%)'], part: ['rect(10px 150px 80px 10px)', 'rect(10% 80% 90% 10%)'], whole: ['rect(0px 200px 100px 0px)', 'rect(auto auto auto auto)'] },
    xywh: { zero: ['xywh(10px 10px 0px 50px)', 'xywh(10% 10% 50% 0%)'], part: ['xywh(10px 10px 50px 50px)', 'xywh(10% 10% 50% 50%)'], whole: ['xywh(0px 0px 200px 100px)', 'xywh(0% 0% 100% 100%)'] },
  };
  const failures = [];
  for (const [shape, areas] of Object.entries(shapes)) {
    for (const [area, [inPx, inPercent]] of Object.entries(areas)) {
      for (const [unit, clipPath] of [['px', inPx], ['%', inPercent]]) {
        const t = target('text');
        Object.assign(t.chain[0], { clipPath, box: { x: 20, y: 100, width: 200, height: 100 } });
        const reasons = hiddenReasons(t, VIEWPORT);
        const want = area === 'zero';
        if (want !== reasons.some((r) => r.startsWith('clipped away'))) failures.push(`${shape}, ${area}, ${unit} (${clipPath}): ${JSON.stringify(reasons)}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('a shape with a reference box keyword is read, and a path() or url() clip is not reported', () => {
  const reasons = (clipPath) => {
    const t = target('text');
    Object.assign(t.chain[0], { clipPath, box: { x: 20, y: 100, width: 200, height: 100 } });
    return hiddenReasons(t, VIEWPORT);
  };
  assert.notDeepEqual(reasons('polygon(evenodd, 0px 0px, 0px 0px, 0px 0px) border-box'), []);
  assert.notDeepEqual(reasons('padding-box inset(50%)'), []);
  assert.deepEqual(reasons('path("M0 0 L0 0 Z")'), []);
  assert.deepEqual(reasons('url("#c")'), []);
  assert.deepEqual(reasons('polygon(0% 0%, 100% 100%, 100% 0%, 0% 100%)'), [], 'a crossed polygon still has area');
});

test('paint containment cuts what leaves the box on both axes, like overflow: clip; other containment does not', () => {
  const failures = [];
  for (const contain of ['none', 'layout', 'size', 'paint', 'strict', 'content', 'layout paint']) {
    for (const [where, boxes] of [['inside', [{ x: 30, y: 110, width: 40, height: 20 }]], ['outside below', [{ x: 30, y: 400, width: 40, height: 20 }]], ['outside right', [{ x: 300, y: 110, width: 40, height: 20 }]]]) {
      const t = target('text');
      Object.assign(t.chain[1], { contain, box: { x: 20, y: 100, width: 200, height: 0 } });
      if (where === 'inside') t.chain[1].box.height = 100;
      t.boxes = boxes;
      const want = where !== 'inside' && /paint|strict|content/.test(contain);
      const reasons = hiddenReasons(t, VIEWPORT);
      if (want !== reasons.some((r) => r.startsWith('clipped away'))) failures.push(`${contain}, ${where}: ${JSON.stringify(reasons)}`);
    }
  }
  // An absolute text escapes a static overflow box, but not a box with paint containment.
  const tip = target('text');
  tip.chain[0].position = 'absolute';
  Object.assign(tip.chain[1], { contain: 'paint', box: { x: 20, y: 100, width: 200, height: 0 } });
  tip.boxes = [{ x: 30, y: 400, width: 40, height: 20 }];
  if (!hiddenReasons(tip, VIEWPORT).some((r) => r.startsWith('clipped away'))) failures.push('absolute text in a paint-contained box');
  assert.deepEqual(failures, []);
});

// What the measure saw on one page, at one width, in one theme.
const seen = (targets, width = 390, theme = 'light') => ({ page: '/en/', width, theme, viewport: { width, height: 844 }, targets });

test('an exception may name an element inside its block: it covers that element and what it holds, and nothing else of the block', () => {
  const inBlock = (owner) => {
    const t = target('text');
    t.chain = [style(owner, { display: 'none' }), style('div.band'), style('section#how'), style('body'), style('html')];
    t.element = owner;
    t.boxes = [];
    return t;
  };
  const inside = () => {
    const t = inBlock('b');
    t.chain.splice(1, 0, style('small.note'));
    return t;
  };
  const exceptions = [{ match: '.band', element: 'small', width: 390, reason: 'the note of the band, left out on a narrow screen' }];
  assert.equal(findHidden([seen([inBlock('small.note')], 390)], exceptions).length, 0, 'the named element');
  assert.equal(findHidden([seen([inside()], 390)], exceptions).length, 0, 'inside the named element');
  assert.equal(findHidden([seen([inBlock('span.chip')], 390)], exceptions).length, 1, 'another element of the block');
  assert.equal(findHidden([seen([inBlock('small.note')], 1280)], exceptions).length, 1, 'the named element at another width');
  const outside = inBlock('small.note');
  outside.chain[1] = style('div.other');
  assert.equal(findHidden([seen([outside], 390)], exceptions).length, 1, 'the same element outside the block');
});

test('the shipped verdict exception covers the note at 390 and not the chip', () => {
  const verdict = (owner) => {
    const t = target('text');
    t.chain = [style(owner, { visibility: 'hidden' }), style('div.flow-verdict'), style('div.hero-flow'), style('body'), style('html')];
    t.element = owner;
    return t;
  };
  assert.equal(findHidden([seen([verdict('small')], 390)]).length, 0, 'the note at 390');
  assert.equal(findHidden([seen([verdict('span.gx-chip.gx-chip--marcado')], 390)]).length, 1, 'the chip at 390');
  assert.equal(findHidden([seen([verdict('small')], 1280)]).length, 1, 'the note at 1280');
});

test('a page measured with no text at all is a finding that names the page, the width and the theme', () => {
  const found = findHidden([seen([], 1280, 'dark'), seen([target('text')], 390, 'light')]);
  assert.equal(found.length, 1);
  assert.equal(found[0].page, '/en/');
  assert.equal(found[0].width, 1280);
  assert.equal(found[0].theme, 'dark');
  const line = describeFinding(found[0]);
  assert.match(line, /^\/en\/ · 1280px · dark · /);
  assert.match(line, /no text/);
  assert.equal(findHidden([seen([], 390, 'light')], [{ match: '#how', reason: 'an exception covers no empty page' }]).length, 1);
});

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
