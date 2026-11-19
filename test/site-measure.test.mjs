// The rendered-site measure (site/scripts/measure-rendered.mjs) decides "this text is hidden, and
// why" in pure functions that take what Chrome measured. These tests feed them measured facts, with
// no browser: every way to hide text, on a text run and on a pseudo-element that draws text, inside
// and outside the list of exceptions, and the case in view that must come out clean. The measure
// itself runs in Chrome, by hand, with `npm run measure` in site/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCEPTIONS, PAGES, THEMES, WIDTHS, describeFinding, findHidden, hiddenReasons } from '../site/scripts/measure-rendered.mjs';
import * as measure from '../site/scripts/measure-rendered.mjs';

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

// ---------- one pass up the chain, with a running rectangle ----------

// The reference model, written apart from the measure, with nothing but the intersection of
// rectangles and the rule of who holds whom. A box is held by its containing block: an in-flow box
// by its parent, an absolute box by the nearest box that is positioned or has paint containment, a
// fixed box by the nearest box with paint containment, or else by the screen. The text is held by
// its own element; walking up, each box that holds the box last held becomes the box last held.
// A rectangle starts as the text's box and climbs the chain. A box that holds and cuts on an axis
// (overflow hidden or clip, paint containment) leaves the intersection with its box; one that
// scrolls on an axis leaves nothing of what lies wholly before its origin, its own span of what
// lies wholly after its end, and the intersection of what crosses it. clip: rect() on an absolute
// or fixed box and a clip-path inset() cut all the box paints, held or not; their region is closed,
// so a text that only touches its edge keeps a line. Nothing left is "clipped away". What is left must not lie wholly left of the page, right of the viewport or above
// the page, nor, when the screen holds it, wholly below the viewport. html and body hand their
// overflow to the viewport.
const sides = { x: ['x0', 'x1', 'left of'], y: ['y0', 'y1', 'above'] };
const rectOf = (b) => ({ x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height });
const meet = (a, b) => ({ x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1) });
const empty = (r) => r.x1 < r.x0 || r.y1 < r.y0;
const pxList = (s) => s.split(/[\s,]+/).filter(Boolean).map((v) => Number(v.replace(/px$/, '')));
function referenceModel(t, viewport) {
  let r = rectOf(t.boxes[0]);
  let last = t.chain[0].position;
  for (const [i, s] of t.chain.entries()) {
    const contained = s.contain === 'paint';
    const holds = i === 0 || last === 'static' || last === 'relative'
      || (last === 'absolute' && (s.position !== 'static' || contained))
      || (last === 'fixed' && contained);
    if (holds && i > 0) last = s.position;
    const b = rectOf(s.box);
    if (holds && s.element !== 'html' && s.element !== 'body') {
      for (const axis of ['x', 'y']) {
        const [lo, hi, before] = sides[axis];
        const overflow = axis === 'x' ? s.overflowX : s.overflowY;
        if (overflow === 'auto' || overflow === 'scroll') {
          if (r[hi] <= b[lo]) return [`out of reach, ${before} the scroll origin of ${s.element}`];
          r = r[lo] >= b[hi] ? { ...r, [lo]: b[lo], [hi]: b[hi] } : { ...r, [lo]: Math.max(r[lo], b[lo]), [hi]: Math.min(r[hi], b[hi]) };
        } else if (overflow === 'hidden' || overflow === 'clip' || contained) {
          r = { ...r, [lo]: Math.max(r[lo], b[lo]), [hi]: Math.min(r[hi], b[hi]) };
          if (r[hi] <= r[lo]) return [`clipped away by ${s.element}`];
        }
      }
    }
    if ((s.position === 'absolute' || s.position === 'fixed') && String(s.clip).startsWith('rect(')) {
      const [top, right, bottom, left] = pxList(s.clip.slice(5, -1));
      r = meet(r, { x0: b.x0 + left, x1: b.x0 + right, y0: b.y0 + top, y1: b.y0 + bottom });
      if (empty(r)) return [`clipped away by ${s.element}`];
    }
    if (String(s.clipPath).startsWith('inset(')) {
      const [top, right = top, bottom = top, left = right] = pxList(s.clipPath.slice(6, -1));
      r = meet(r, { x0: b.x0 + left, x1: b.x1 - right, y0: b.y0 + top, y1: b.y1 - bottom });
      if (empty(r)) return [`clipped away by ${s.element}`];
    }
  }
  if (r.x1 <= 0) return ['off screen to the left'];
  if (r.x0 >= viewport.width) return ['off screen to the right'];
  if (r.y1 <= 0) return ['off screen above'];
  if (last === 'fixed' && r.y0 >= viewport.height) return ['off screen below'];
  return [];
}

// The ancestors of the matrix: each takes the span it stands for on the axis and the cover on the
// other axis, and gives its style. The clip rect and the clip-path cut 30 px inside a box 30 px
// larger, so the region they let through is the span itself.
const grow = (b, by) => ({ x: b.x - by, y: b.y - by, width: b.width + 2 * by, height: b.height + 2 * by });
const ANCESTORS = {
  'overflow hidden': { positions: ['static', 'relative'], style: (b) => ({ overflowX: 'hidden', overflowY: 'hidden', box: b }) },
  'paint containment': { positions: ['static', 'relative'], style: (b) => ({ contain: 'paint', box: b }) },
  'clip rect': { positions: ['absolute'], style: (b) => ({ clip: `rect(30px, ${b.width + 30}px, ${b.height + 30}px, 30px)`, box: grow(b, 30) }) },
  'clip-path inset': { positions: ['static', 'relative'], style: (b) => ({ clipPath: 'inset(30px 30px 30px 30px)', box: grow(b, 30) }) },
  scrolls: { positions: ['static', 'relative'], style: (b) => ({ overflowX: 'auto', overflowY: 'auto', box: b }) },
  visible: { positions: ['static', 'relative'], style: (b) => ({ box: b }) },
};
const ANCESTOR_VARIANTS = Object.entries(ANCESTORS).flatMap(([kind, a]) => a.positions.map((position) => ({ kind, position, style: a.style })));
// Where a level's box stands against the text on the axis: around it, starting inside it, wholly
// after it (the text before its origin) or wholly before it (the text after its end).
const PLACES = {
  inside: (lo, hi) => [lo - 50, hi + 50],
  crossing: (lo, hi) => [lo + 10, hi + 200],
  'text before': (lo, hi) => [hi + 50, hi + 250],
  'text after': (lo, hi) => [lo - 250, lo - 50],
};
const SHIFTS = { x: { 'on screen': 0, left: -5000, right: 5000 }, y: { 'on screen': 0, above: -5000, below: 5000 } };

function matrixCase(axis, levels, position, shift) {
  const [p, size, other, otherSize] = axis === 'x' ? ['x', 'width', 'y', 'height'] : ['y', 'height', 'x', 'width'];
  const lo = 100 + shift;
  const hi = lo + 20;
  const text = { [p]: lo, [size]: 20, [other]: 120, [otherSize]: 100 };
  const chain = [style('p.t', { position, box: text })];
  levels.forEach(({ variant, place }, k) => {
    const [a, b] = PLACES[place](lo, hi);
    const span = { [p]: a, [size]: b - a, [other]: 120 - 40 * (k + 1), [otherSize]: 100 + 80 * (k + 1) };
    chain.push(style(`div.l${k + 1}`, { position: variant.position, ...variant.style(span) }));
  });
  chain.push(style('body'), style('html'));
  return { kind: 'text', element: 'p.t', text: 'Spec first', boxes: [text], chain };
}

test('one pass up the chain agrees with the reference model on every ancestor, nesting, place, position and screen', () => {
  const diffs = [];
  const seenReasons = new Set();
  let cases = 0;
  const level = Object.keys(PLACES).flatMap((place) => ANCESTOR_VARIANTS.map((variant) => ({ variant, place })));
  const nestings = [...level.map((l) => [l]), ...level.flatMap((inner) => level.map((outer) => [inner, outer]))];
  for (const axis of ['x', 'y']) {
    for (const levels of nestings) {
      for (const position of ['static', 'absolute', 'fixed']) {
        for (const [screen, shift] of Object.entries(SHIFTS[axis])) {
          const t = matrixCase(axis, levels, position, shift);
          const want = referenceModel(t, VIEWPORT);
          const got = hiddenReasons(t, VIEWPORT);
          cases += 1;
          seenReasons.add(want.length ? want[0].replace(/ (of )?the scroll origin of .*$| by .*$/, '') : 'in view');
          if (JSON.stringify(got) !== JSON.stringify(want)) {
            const where = levels.map(({ variant, place }) => `${variant.kind} (${variant.position}), ${place}`).join(' in ');
            diffs.push(`${axis} · ${where} · ${position} text · ${screen}: got ${JSON.stringify(got)}, model ${JSON.stringify(want)}`);
          }
        }
      }
    }
  }
  assert.ok(cases > 30000, `${cases} cases`);
  // the matrix reaches every verdict of the model
  for (const reason of ['in view', 'clipped away', 'out of reach, left', 'out of reach, above', 'off screen to the left', 'off screen to the right', 'off screen above', 'off screen below']) {
    assert.ok(seenReasons.has(reason), `the matrix never gives "${reason}"`);
  }
  assert.deepEqual(diffs.slice(0, 40), [], `${diffs.length} differences in ${cases} cases`);
});

test('the reported ways of hiding that one pass decides, by name', () => {
  const t = (chain, box) => ({ kind: 'text', element: chain[0].element, text: 'Spec first', boxes: [box], chain: [...chain, style('body'), style('html')] });
  // a fixed text below the viewport can never be scrolled to
  const fixedLow = t([style('p.bar', { position: 'fixed', box: { x: 20, y: 900, width: 200, height: 20 } })], { x: 20, y: 900, width: 200, height: 20 });
  assert.deepEqual(hiddenReasons(fixedLow, VIEWPORT), ['off screen below'], 'a fixed text below the viewport');
  const flowLow = t([style('p.bar', { box: { x: 20, y: 900, width: 200, height: 20 } })], { x: 20, y: 900, width: 200, height: 20 });
  assert.deepEqual(hiddenReasons(flowLow, VIEWPORT), [], 'an in-flow text below the viewport is scrolled to');
  // a clip: rect() with area that misses the text
  const rect = t([style('p.cut', { position: 'absolute', clip: 'rect(80px, 200px, 100px, 0px)', box: { x: 20, y: 0, width: 200, height: 200 } })], { x: 20, y: 10, width: 200, height: 20 });
  assert.deepEqual(hiddenReasons(rect, VIEWPORT), ['clipped away by p.cut'], 'a clip rect() that misses the text');
  // two nested clips that each meet the text but not each other
  const disjoint = t([
    style('p'),
    style('div.inner', { overflowX: 'hidden', overflowY: 'hidden', box: { x: 0, y: 90, width: 390, height: 50 } }),
    style('div.outer', { overflowX: 'hidden', overflowY: 'hidden', box: { x: 0, y: 160, width: 390, height: 60 } }),
  ], { x: 20, y: 100, width: 200, height: 100 });
  assert.deepEqual(hiddenReasons(disjoint, VIEWPORT), ['clipped away by div.outer'], 'disjoint nested clips');
  // a text an inner scroller brings into reach, inside an outer clip it lies outside of
  const reached = t([
    style('p'),
    style('div.scroller', { overflowX: 'auto', overflowY: 'hidden', box: { x: 0, y: 100, width: 200, height: 50 } }),
    style('div.frame', { overflowX: 'hidden', overflowY: 'hidden', box: { x: 0, y: 90, width: 250, height: 80 } }),
  ], { x: 300, y: 110, width: 40, height: 20 });
  assert.deepEqual(hiddenReasons(reached, VIEWPORT), [], 'reachable through an inner scroller inside an outer clip');
  // a fixed bar with paint containment escapes a scrolling section lower on the page
  const bar = t([
    style('p'),
    style('header.bar', { position: 'fixed', contain: 'paint', box: { x: 0, y: 0, width: 390, height: 60 } }),
    style('section.s', { overflowX: 'hidden', overflowY: 'auto', box: { x: 0, y: 600, width: 390, height: 900 } }),
  ], { x: 20, y: 20, width: 100, height: 20 });
  assert.deepEqual(hiddenReasons(bar, VIEWPORT), [], 'a fixed bar with paint containment');
  // the two reasons of reach, word for word
  const before = (overflowX, overflowY, box) => hiddenReasons(t([style('p'), style('div.code', { overflowX, overflowY, box: { x: 100, y: 100, width: 200, height: 200 } })], box), VIEWPORT);
  assert.deepEqual(before('auto', 'hidden', { x: 20, y: 120, width: 40, height: 20 }), ['out of reach, left of the scroll origin of div.code']);
  assert.deepEqual(before('hidden', 'auto', { x: 120, y: 20, width: 40, height: 20 }), ['out of reach, above the scroll origin of div.code']);
  // Known limit, written in the measure's header: the containing block of a fixed or absolute box
  // is read from position and paint containment only. Chrome clips this fixed text, held by its
  // `contain: layout` box of no height; the measure lets it pass.
  const layoutHeld = t([
    style('p.fixed', { position: 'fixed', box: { x: 20, y: 300, width: 200, height: 20 } }),
    style('div.box', { contain: 'layout', overflowX: 'hidden', overflowY: 'hidden', box: { x: 0, y: 100, width: 390, height: 0 } }),
  ], { x: 20, y: 300, width: 200, height: 20 });
  assert.deepEqual(hiddenReasons(layoutHeld, VIEWPORT), [], 'known limit: contain: layout does not hold a fixed box here');
});

// ---------- the colour that paints the text ----------

test('the colour that paints the text is its computed fill, and a fill the background paints through is not transparent', () => {
  const colours = { opaque: 'rgb(10, 10, 10)', transparent: 'rgba(0, 0, 0, 0)' };
  // The computed -webkit-text-fill-color: by default it is the colour (currentcolor), or its own.
  const fills = { inherited: (c) => c, opaque: () => 'rgb(0, 0, 0)', transparent: () => 'rgba(0, 0, 0, 0)' };
  const failures = [];
  for (const kind of ['text', 'pseudo']) {
    for (const [c, color] of Object.entries(colours)) {
      for (const [f, fill] of Object.entries(fills)) {
        for (const backgroundClip of ['text', 'border-box']) {
          const t = target(kind);
          const textFillColor = fill(color);
          Object.assign(t.chain[0], { color, textFillColor, backgroundClip });
          const want = textFillColor === 'rgba(0, 0, 0, 0)' && backgroundClip !== 'text';
          const got = hiddenReasons(t, VIEWPORT).includes('transparent colour');
          if (got !== want) failures.push(`${kind}, colour ${c}, fill ${f}, background-clip ${backgroundClip}: ${got ? 'reported' : 'passed'}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

// ---------- what the page script makes of a text with no layout of its own ----------

test('a text or a pseudo-element with text whose element has display: contents has a box when its boxed ancestor is drawn', () => {
  const failures = [];
  for (const display of ['block', 'contents']) {
    for (const kind of ['text', 'pseudo']) {
      for (const ancestorDrawn of [true, false]) {
        // What the page reports: checkVisibility() says no for an element with display: contents;
        // the nearest ancestor with a box is the element itself unless it has display: contents.
        const facts = {
          kind,
          rects: ancestorDrawn ? 1 : 0,
          pseudoDisplay: 'inline',
          contents: display === 'contents',
          drawn: display === 'contents' ? false : ancestorDrawn,
          boxedDrawn: ancestorDrawn,
        };
        const got = typeof measure.unlaidVerdict === 'function' ? measure.unlaidVerdict(facts) : 'missing';
        const want = ancestorDrawn ? 'has a box' : 'no box';
        if ((got === 'no box' ? 'no box' : got === 'missing' ? 'missing' : 'has a box') !== want) failures.push(`${kind} in a ${display} element, ancestor ${ancestorDrawn ? 'drawn' : 'not drawn'}: ${got}`);
      }
    }
  }
  if (typeof measure.unlaidVerdict === 'function') {
    const none = measure.unlaidVerdict({ kind: 'pseudo', rects: 0, pseudoDisplay: 'none', contents: true, drawn: false, boxedDrawn: true });
    if (none !== 'no box') failures.push(`a pseudo-element with display: none in a contents element: ${none}`);
  }
  assert.deepEqual(failures, []);
});

// ---------- running the measure: the server and Chrome ----------

// A build with the seven pages, each a bare paragraph, in a folder of its own.
function fakeDist(root) {
  const dist = join(root, 'dist');
  for (const page of PAGES) {
    mkdirSync(join(dist, page), { recursive: true });
    writeFileSync(join(dist, page, 'index.html'), '<p>x</p>');
  }
  return dist;
}

test('a port the server cannot open ends the measure with 2 and one line, and leaves no folder', async () => {
  const root = mkdtempSync(join(tmpdir(), 'site-measure-port-'));
  const busy = createServer();
  await new Promise((done) => busy.listen(0, '127.0.0.1', done));
  try {
    const dist = fakeDist(root);
    const tmp = join(root, 'tmp');
    mkdirSync(tmp);
    const lines = [];
    const code = typeof measure.main === 'function'
      ? await measure.main([dist], { env: { CHROME_PATH: process.execPath }, port: busy.address().port, tmp, say: (l) => lines.push(l), fail: (l) => lines.push(l) })
      : 'no main to call';
    assert.equal(code, 2);
    assert.equal(lines.length, 1, lines.join('\n'));
    assert.doesNotMatch(lines[0], /\n/);
    assert.match(lines[0], /^measure: .*EADDRINUSE/);
    assert.deepEqual(readdirSync(tmp), [], 'a folder was left');
  } finally {
    await new Promise((done) => busy.close(done));
    rmSync(root, { recursive: true, force: true });
  }
});

// A stand-in for Chrome that ignores the signal to terminate and never answers; it writes its pid
// first, so the test can tell whether it is still alive.
function stubbornChild(root) {
  const pidFile = join(root, 'pid');
  const script = join(root, 'stubborn.sh');
  writeFileSync(script, `#!/bin/sh\ntrap '' TERM\necho $$ > '${pidFile}'\necho ready\nexec sleep 120\n`);
  chmodSync(script, 0o755);
  return { script, pidFile };
}
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('a child that ignores the signal to terminate is killed, and stopping it returns', async () => {
  const root = mkdtempSync(join(tmpdir(), 'site-measure-stop-'));
  try {
    const { script } = stubbornChild(root);
    const proc = spawn(script, [], { stdio: ['ignore', 'pipe', 'ignore'] });
    await new Promise((done) => proc.stdout.once('data', done));
    assert.equal(typeof measure.stopChild, 'function', 'stopChild is exported');
    await measure.stopChild(proc, { grace: 100 });
    assert.equal(proc.signalCode, 'SIGKILL');
    assert.ok(!alive(proc.pid), 'the child is still alive');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a Chrome that never answers and ignores the signal to terminate is killed, and the measure ends with one line and no folder', async () => {
  const root = mkdtempSync(join(tmpdir(), 'site-measure-hang-'));
  try {
    const dist = fakeDist(root);
    const tmp = join(root, 'tmp');
    mkdirSync(tmp);
    const { script, pidFile } = stubbornChild(root);
    let message = null;
    try {
      // The protocol call waits long enough for the stand-in to set its trap and write its pid.
      await measure.measureSite(script, dist, { tmp, grace: 100, answerWithin: 2000 });
    } catch (e) {
      message = e.message;
    }
    assert.ok(message, 'the measure returned');
    assert.doesNotMatch(message, /\n/);
    assert.match(message, /no answer from Chrome/);
    assert.deepEqual(readdirSync(tmp), [], 'a folder was left');
    assert.ok(existsSync(pidFile), 'the stand-in ran');
    assert.ok(!alive(Number(readFileSync(pidFile, 'utf8'))), 'the stand-in is still alive');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
