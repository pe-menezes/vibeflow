// Probes for the site scripts: the rendered measure's pure decision (hiddenReasons, findHidden and
// the shipped EXCEPTIONS), the selector reader of check-build, and the two-phase write of
// make-assets. Each names the contract it holds, the change that breaks it and why the main tests
// miss that change. No build and no browser: what needs Chrome is run by hand with
// `npm run measure` on a broken copy of the build.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findHidden, hiddenReasons } from '../../site/scripts/measure-rendered.mjs';
import { checkCss, checkPages } from '../../site/scripts/check-build.mjs';
import { chromeVersion, collectSources, generateAssets } from '../../site/scripts/make-assets.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SITE_DIR = join(ROOT, 'site');

// ---------- the measure's decision ----------

// The computed style of one box, as the measure reads it from Chrome.
const box = (element, extra = {}) => ({
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
  box: { x: 0, y: 0, width: 390, height: 2000 },
  ...extra,
});
const ROOTS = () => [box('body'), box('html')];
const VIEWPORT = { width: 390, height: 844 };
const text = (chain, boxes) => ({ kind: 'text', element: chain[0].element, text: 'Spec first', boxes, chain });

// Contract: an absolutely positioned text is clipped by the overflow of a positioned ancestor and
// escapes the overflow of a static one (measure-rendered.mjs, "overflow cuts what its box holds,
// except what escapes it by absolute or fixed position"; spec 1a, a clip that cuts the text away).
// Breaks when: the containing-block walk in hiddenReasons stops checking positioned ancestors of an
// absolute box (a text in a `position: relative; overflow: hidden; height: 0` card passes), or
// stops letting it escape static ones (a tooltip that leaves a static overflow box is reported).
// Not covered by: test/site-measure.test.mjs builds most chains with `position: static`, so
// dropping either half of the rule of who holds an absolute box survives it.
test('an absolute text is clipped by a positioned ancestor that misses it and escapes a static one', () => {
  const card = (position) => box('div.card', { position, overflowX: 'hidden', overflowY: 'hidden', box: { x: 0, y: 100, width: 390, height: 50 } });
  const tip = () => box('span.tip', { position: 'absolute', box: { x: 20, y: 700, width: 40, height: 20 } });
  const at = [{ x: 20, y: 700, width: 40, height: 20 }];
  const clipped = hiddenReasons(text([tip(), card('relative'), box('section'), ...ROOTS()], at), VIEWPORT);
  assert.ok(clipped.some((r) => r === 'clipped away by div.card'), JSON.stringify(clipped));
  assert.deepEqual(hiddenReasons(text([tip(), card('static'), box('section'), ...ROOTS()], at), VIEWPORT), []);
});

// The four exceptions the measure ships with, each seen at both widths and in both themes.
const hiddenIn = (scope, owner = 'p') => text([box(owner, { display: 'none' }), scope, ...ROOTS()], []);
const seen = (target, width, theme) => ({ page: '/en/', width, theme, viewport: { width, height: 844 }, targets: [target] });

// Contract: each exception the measure ships with excuses hidden text only at the width its reason
// names: .desktop-only at 390, #mobile-menu at 1280, and in .flow-verdict only the note (small) at
// 390, never another text of that block such as the PASS chip; #form-success everywhere
// (measure-rendered.mjs, EXCEPTIONS, each restricted to one width by its reason, the verdict one to
// its element).
// Breaks when: an exception loses its width, so the wide navigation, the phone menu or the verdict
// note could vanish at the width where the reader needs it and the measure would still say ok; the
// width is moved to the other screen; or the verdict exception covers its whole block again, so the
// PASS chip of the hero flow band could vanish on a phone.
// Not covered by: test/site-measure.test.mjs scopes a made-up exception (#how) and checks the
// shipped verdict entry in the light theme only, so dropping the width of .desktop-only or
// #mobile-menu survives it.
test('each shipped exception excuses hidden text only at its own width, in both themes', () => {
  const cases = [
    ['nav.nav.desktop-only', 'p', 390],
    ['div.flow-verdict', 'small', 390],
    ['nav#mobile-menu.mobile-menu', 'p', 1280],
  ];
  const failures = [];
  for (const [scope, owner, width] of cases) {
    for (const theme of ['light', 'dark']) {
      for (const w of [390, 1280]) {
        const found = findHidden([seen(hiddenIn(box(scope), owner), w, theme)]).length;
        const want = w === width ? 0 : 1;
        if (found !== want) failures.push(`${owner} in ${scope} at ${w}, ${theme}: ${found} found, ${want} expected`);
      }
    }
  }
  for (const theme of ['light', 'dark']) {
    for (const w of [390, 1280]) {
      const chip = findHidden([seen(hiddenIn(box('div.flow-verdict'), 'span.gx-chip.gx-chip--marcado'), w, theme)]).length;
      if (chip !== 1) failures.push(`the chip in div.flow-verdict at ${w}, ${theme}: ${chip} found, 1 expected`);
    }
  }
  for (const w of [390, 1280]) {
    if (findHidden([seen(hiddenIn(box('div#form-success')), w, 'light')]).length) failures.push(`#form-success at ${w} reported`);
  }
  assert.deepEqual(failures, []);
});

// Contract: text wholly out of view is reported (spec 1a, wholly off screen); a box that
// scrolls excuses only what scrolling can bring into view, and nothing before its scroll origin
// can be scrolled to.
// Breaks when: the off-screen test on an axis is skipped as soon as any ancestor scrolls on it.
// `overflow-x: hidden` makes the computed overflow-y `auto`, so text pushed above the page inside
// such a box passes; `text-indent: -9999px` inside an `overflow-x: auto` box passes too.
// Not covered by: the scroll case of test/site-measure.test.mjs that sees the text as in view puts
// it to the right of the box, the one side a scroll does reach.
test('text before the scroll origin of a scrolling ancestor is out of view', () => {
  const above = text(
    [box('p'), box('div.band', { overflowX: 'hidden', overflowY: 'auto', box: { x: 0, y: 100, width: 390, height: 200 } }), ...ROOTS()],
    [{ x: 20, y: -99000, width: 200, height: 20 }],
  );
  const left = text(
    [box('p'), box('div.code', { overflowX: 'auto', overflowY: 'auto', box: { x: 0, y: 100, width: 390, height: 200 } }), ...ROOTS()],
    [{ x: -9979, y: 120, width: 300, height: 20 }],
  );
  assert.notDeepEqual(hiddenReasons(above, VIEWPORT), [], 'above the origin of an overflow-x: hidden box');
  assert.notDeepEqual(hiddenReasons(left, VIEWPORT), [], 'left of the origin of an overflow-x: auto box');
});

// Contract: a clip that leaves nothing of the text is reported (spec 1a, a clip that cuts it away).
// Breaks when: a polygon of no area is not read as one, so `clip-path: polygon(0 0, 0 0, 0 0)` on a
// section title passes.
// Not covered by: the list of ways to hide in test/site-measure.test.mjs clips with rect() and
// inset(50%) only.
test('a clip-path polygon of no area clips the text away', () => {
  const t = text([box('h2.title', { clipPath: 'polygon(0px 0px, 0px 0px, 0px 0px)', box: { x: 20, y: 100, width: 350, height: 40 } }), ...ROOTS()], [{ x: 20, y: 100, width: 200, height: 30 }]);
  assert.notDeepEqual(hiddenReasons(t, VIEWPORT), []);
});

// Contract: the reach of a scrolling box is decided by its own edges, apart from the edges of the
// page: text wholly before its origin is out of reach even when it sits on the page, text wholly
// after its end is in reach only as far as the box itself is, and a text touching an edge counts
// as wholly on that side; a box that does not hold the text (a static box under an absolute text)
// changes nothing (measure-rendered.mjs, hiddenReasons, "Reach"; spec 1a, wholly off screen).
// Breaks when: the before-origin branch is dropped on y (text pulled up above the top of an
// `overflow-x: hidden` section, still on the page, passes), the after-end branch is dropped on y,
// the final left or above test reads the text boxes instead of the reach, an edge comparison loses
// its `=`, or the reach climbs ancestors that do not hold the text (an absolute tooltip beside a
// static scrolling box is reported).
// Not covered by: the one-axis product of test/site-measure.test.mjs puts the box inside the page
// at 50 px, so every text before its origin is also off the page and the page test alone reports
// it; its boxes off screen get texts after their end that are off screen too; it has no edge case
// and no positioned text.
test('the reach of a scrolling box follows its own edges, apart from the page edges', () => {
  const scroller = (extra) => box('div.band', { overflowX: 'hidden', overflowY: 'auto', ...extra });
  const reasons = (chain, at) => hiddenReasons(text([...chain, ...ROOTS()], [at]), VIEWPORT);
  const on = { x: 20, width: 200 };
  // before the origin on y, and still on the page
  assert.notDeepEqual(reasons([box('p'), scroller({ box: { x: 0, y: 500, width: 390, height: 200 } })], { ...on, y: 200, height: 20 }), [], 'above the origin, on the page');
  // after the end of a box wholly above the page, the text itself on the page
  assert.notDeepEqual(reasons([box('p'), scroller({ box: { x: 0, y: -1000, width: 390, height: 200 } })], { ...on, y: 500, height: 20 }), [], 'after the end of a box above the page');
  // after the end of a box wholly left of the page, the text itself on screen
  const leftBox = box('div.code', { overflowX: 'auto', overflowY: 'hidden', box: { x: -1000, y: 100, width: 200, height: 200 } });
  assert.notDeepEqual(reasons([box('p'), leftBox], { x: 50, y: 120, width: 100, height: 20 }), [], 'after the end of a box left of the page');
  // edges: ending at the origin is before it; starting at the end is after it
  const code = box('div.code', { overflowX: 'auto', overflowY: 'hidden', box: { x: 100, y: 100, width: 290, height: 200 } });
  assert.notDeepEqual(reasons([box('p'), code], { x: 60, y: 120, width: 40, height: 20 }), [], 'ending at the origin');
  const wide = box('div.code', { overflowX: 'auto', overflowY: 'hidden', box: { x: 0, y: 100, width: 390, height: 200 } });
  assert.deepEqual(reasons([box('p'), wide], { x: 390, y: 120, width: 40, height: 20 }), [], 'starting at the end');
  // an absolute text is not held by a static scrolling box, so its origin does not bound it
  const tip = box('span.tip', { position: 'absolute', box: { x: 20, y: 120, width: 40, height: 20 } });
  const staticCode = box('div.code', { overflowX: 'auto', overflowY: 'hidden', box: { x: 100, y: 100, width: 290, height: 200 } });
  assert.deepEqual(reasons([tip, staticCode, box('section')], { x: 20, y: 120, width: 40, height: 20 }), [], 'absolute text beside a static scroller');
});

// Contract: paint containment cuts what leaves the box on each axis on its own, and a static
// contained box that holds an absolute text is itself held by its ancestors, so their overflow
// cuts it (measure-rendered.mjs, paintContained; spec 1a, a clip that cuts the text away).
// Breaks when: the containment cut is dropped on x (a text pushed to the right out of a
// `contain: paint` box passes while its row is inside the box), or the mode is not reset after a
// contained box (an absolute text inside a contained card inside a zero-height `overflow: hidden`
// wrapper passes).
// Not covered by: the containment cases of test/site-measure.test.mjs give the box a height of 0
// whenever the text is outside it, so the cut on y alone reports every one, and they never nest a
// contained box in another box that cuts.
test('paint containment cuts on each axis alone and hands an absolute text on to its ancestors', () => {
  const contained = box('div.c', { contain: 'paint', box: { x: 20, y: 100, width: 200, height: 200 } });
  const right = hiddenReasons(text([box('p'), contained, ...ROOTS()], [{ x: 300, y: 120, width: 40, height: 20 }]), VIEWPORT);
  assert.ok(right.some((r) => r.startsWith('clipped away')), `outside on x only: ${JSON.stringify(right)}`);
  const wrap = box('div.wrap', { overflowX: 'hidden', overflowY: 'hidden', box: { x: 0, y: 100, width: 390, height: 0 } });
  const card = box('div.card', { contain: 'paint', box: { x: 0, y: 100, width: 390, height: 200 } });
  const tip = box('span.tip', { position: 'absolute', box: { x: 20, y: 150, width: 40, height: 20 } });
  const nested = hiddenReasons(text([tip, card, wrap, ...ROOTS()], [{ x: 20, y: 150, width: 40, height: 20 }]), VIEWPORT);
  assert.ok(nested.includes('clipped away by div.wrap'), `contained card in a closed wrapper: ${JSON.stringify(nested)}`);
});

// Contract: a fixed or absolute box escapes the overflow and the scroll of the ancestors that do
// not hold it, whatever containment it has itself; its own paint containment holds only what is
// inside it (measure-rendered.mjs, "overflow cuts what its box holds, except what escapes it by
// absolute or fixed position"; CSS Containment, paint containment makes the box the containing
// block of its descendants, not of itself).
// Breaks when: a box with paint containment is taken to be held by its ancestors even when it is
// itself fixed or absolute: a fixed bar with `contain: paint` inside an `overflow-x: hidden`
// section lower on the page is reported "out of reach, above the scroll origin", and inside a
// static zero-height `overflow: hidden` wrapper "clipped away".
// Not covered by: the containment cases of test/site-measure.test.mjs put `contain` on a static
// ancestor only.
test('a fixed or absolute box with paint containment still escapes its ancestors', () => {
  const at = [{ x: 20, y: 20, width: 100, height: 20 }];
  const bar = box('header.bar', { position: 'fixed', contain: 'paint', box: { x: 0, y: 0, width: 390, height: 60 } });
  const section = box('section.s', { overflowX: 'hidden', overflowY: 'auto', box: { x: 0, y: 600, width: 390, height: 900 } });
  assert.deepEqual(hiddenReasons(text([box('p'), bar, section, ...ROOTS()], at), VIEWPORT), [], 'fixed bar in a scrolling section');
  const wrap = box('div.wrap', { overflowX: 'hidden', overflowY: 'hidden', box: { x: 0, y: 500, width: 390, height: 0 } });
  assert.deepEqual(hiddenReasons(text([box('p'), { ...bar, contain: 'content' }, wrap, ...ROOTS()], at), VIEWPORT), [], 'fixed bar in a closed wrapper');
  const tip = box('div.tip', { position: 'absolute', contain: 'strict', box: { x: 20, y: 700, width: 100, height: 30 } });
  const card = box('div.card', { overflowX: 'hidden', overflowY: 'hidden', box: { x: 0, y: 100, width: 390, height: 50 } });
  assert.deepEqual(hiddenReasons(text([box('span'), tip, card, box('section'), ...ROOTS()], [{ x: 25, y: 705, width: 50, height: 20 }]), VIEWPORT), [], 'absolute tip out of a static card');
});

// What is left of a text after one pass up its chain, run on a chain that ends at body and html.
const leftOf = (chain, boxes) => hiddenReasons(text([...chain, ...ROOTS()], boxes), VIEWPORT);

// Contract: a scrolling box shows what it holds only inside its own box, so of a text that crosses
// its end only the part inside the box is left for the boxes further up (measure-rendered.mjs,
// header, "leaves the part inside it of what crosses it").
// Breaks when: a text that crosses the end of a scrolling box is passed up whole, so an outer
// `overflow: hidden` frame that misses the scrolling box but meets the overflowing part of the text
// lets a text pass that can never be seen.
// Not covered by: the one-pass matrix of test/site-measure.test.mjs places every level against the
// text alone, so an outer level always meets the part inside the inner one when it meets the text.
test('a text crossing the end of a scrolling box keeps only the part inside that box', () => {
  const code = box('div.code', { overflowX: 'auto', overflowY: 'hidden', box: { x: 0, y: 100, width: 100, height: 200 } });
  const at = [{ x: 50, y: 120, width: 300, height: 20 }];
  const apart = box('div.frame', { overflowX: 'hidden', overflowY: 'hidden', box: { x: 200, y: 50, width: 190, height: 300 } });
  assert.deepEqual(leftOf([box('p'), code, apart], at), ['clipped away by div.frame'], 'a frame that misses the scrolling box');
  const over = box('div.frame', { overflowX: 'hidden', overflowY: 'hidden', box: { x: 60, y: 50, width: 330, height: 300 } });
  assert.deepEqual(leftOf([box('p'), code, over], at), [], 'a frame that meets the part inside the scrolling box');
});

// Contract: clip: rect() cuts only an absolute or fixed box, and an auto offset stands for the
// edge it names: auto right is the width of the box, auto bottom its height (CSS 2.1, clip;
// measure-rendered.mjs, clipRectRegion).
// Breaks when: a clip on a static box is read as a cut, so a stray `clip` on a paragraph reports
// it; or auto right and auto bottom are swapped, so `clip: rect(0px, auto, auto, 0px)`, which cuts
// nothing, reports a text on a wide and short box, or misses one on a narrow and tall box.
// Not covered by: test/site-measure.test.mjs and its matrix give clip: rect() only to absolute
// boxes and only in px, with no auto.
test('clip: rect() cuts only an absolute or fixed box, and auto stands for the edge it names', () => {
  const flat = box('p.cut', { clip: 'rect(80px, 200px, 100px, 0px)', box: { x: 20, y: 0, width: 200, height: 200 } });
  assert.deepEqual(leftOf([flat], [{ x: 20, y: 10, width: 200, height: 20 }]), [], 'a clip on a static box');
  const wide = box('p.cut', { position: 'absolute', clip: 'rect(0px, auto, auto, 0px)', box: { x: 0, y: 100, width: 390, height: 40 } });
  assert.deepEqual(leftOf([wide], [{ x: 200, y: 110, width: 100, height: 20 }]), [], 'auto right on a wide and short box');
  const tall = box('p.cut', { position: 'absolute', clip: 'rect(0px, auto, auto, 0px)', box: { x: 0, y: 100, width: 100, height: 400 } });
  assert.deepEqual(leftOf([tall], [{ x: 10, y: 400, width: 80, height: 20 }]), [], 'auto bottom on a narrow and tall box');
  const cut = box('p.cut', { position: 'absolute', clip: 'rect(auto, auto, 20px, auto)', box: { x: 0, y: 100, width: 390, height: 400 } });
  assert.deepEqual(leftOf([cut], [{ x: 10, y: 400, width: 80, height: 20 }]), ['clipped away by p.cut'], 'a bottom offset that leaves the text out');
});

// Contract: clip: rect() and clip-path on one box both cut what the box paints, so only what lies
// in both regions is left (measure-rendered.mjs, clipRegion).
// Breaks when: only one of the two regions is kept, so a box whose clip keeps its top and whose
// clip-path keeps its bottom passes a text that neither leaves visible.
// Not covered by: no case of test/site-measure.test.mjs gives one box both a clip and a clip-path.
test('clip: rect() and a clip-path on one box both cut what it paints', () => {
  const both = box('div.box', { position: 'absolute', clip: 'rect(0px, auto, 40px, auto)', clipPath: 'inset(60px 0px 0px 0px)', box: { x: 0, y: 100, width: 390, height: 100 } });
  assert.deepEqual(leftOf([box('p'), both], [{ x: 20, y: 110, width: 200, height: 80 }]), ['clipped away by div.box']);
  const meeting = box('div.box', { position: 'absolute', clip: 'rect(0px, auto, 70px, auto)', clipPath: 'inset(30px 0px 0px 0px)', box: { x: 0, y: 100, width: 390, height: 100 } });
  assert.deepEqual(leftOf([box('p'), meeting], [{ x: 20, y: 110, width: 200, height: 80 }]), [], 'the two regions meet over the text');
});

// Contract: a clip-path inset() is measured from each of its four sides, each against its own
// edge of the box (CSS Shapes, inset(); measure-rendered.mjs, shapeRegion).
// Breaks when: the right and bottom insets are read as the left and top ones, so
// `inset(0 200px 0 0)` keeps the whole width and a text in the cut-off right part passes.
// Not covered by: the matrix of test/site-measure.test.mjs uses one inset on all four sides, and the
// shape cases there read only whether a shape has an area.
test('a clip-path inset() is measured from each of its own sides', () => {
  const owner = (clipPath) => box('p.cut', { clipPath, box: { x: 0, y: 100, width: 390, height: 40 } });
  assert.deepEqual(leftOf([owner('inset(0px 200px 0px 0px)')], [{ x: 300, y: 110, width: 80, height: 20 }]), ['clipped away by p.cut'], 'right inset');
  assert.deepEqual(leftOf([owner('inset(0px 200px 0px 0px)')], [{ x: 20, y: 110, width: 80, height: 20 }]), [], 'right inset, text on the kept side');
  assert.deepEqual(leftOf([owner('inset(0px 0px 30px 0px)')], [{ x: 20, y: 115, width: 80, height: 20 }]), ['clipped away by p.cut'], 'bottom inset');
  assert.deepEqual(leftOf([owner('inset(0px 0px 30px 0px)')], [{ x: 20, y: 102, width: 80, height: 6 }]), [], 'bottom inset, text on the kept side');
});

// Contract: a text with several lines is in view while some part of any line is left, and is
// reported only when nothing of any line is (measure-rendered.mjs, header, "some part left on
// screen").
// Breaks when: the pass starts from the first line alone, so a paragraph whose first line is cut
// off by a frame and whose second line shows is reported.
// Not covered by: every case of test/site-measure.test.mjs and its matrix gives the text one box.
test('a text with several lines is in view while any of its lines is', () => {
  const frame = box('div.frame', { overflowX: 'hidden', overflowY: 'hidden', box: { x: 0, y: 115, width: 390, height: 300 } });
  const lines = [{ x: 20, y: 90, width: 300, height: 20 }, { x: 20, y: 120, width: 120, height: 20 }];
  assert.deepEqual(leftOf([box('p'), frame], lines), [], 'the second line shows');
  const out = [{ x: 20, y: 50, width: 300, height: 20 }, { x: 20, y: 80, width: 120, height: 20 }];
  assert.deepEqual(leftOf([box('p'), frame], out), ['clipped away by div.frame'], 'no line shows');
});

// Contract: a text that only reaches an edge of the screen has nothing on it: ending at the top or
// the left edge of the page, or starting at the right edge of the viewport or, held by a fixed box,
// at its bottom edge, is off screen; one pixel over the edge is in view (measure-rendered.mjs,
// header, "must not lie wholly to the left, to the right or above, nor ... wholly below").
// Breaks when: one of the four final comparisons loses its `=`.
// Not covered by: the screen positions of test/site-measure.test.mjs and its matrix sit thousands
// of pixels away from every edge.
test('a text on the very edge of the screen is off it, and one pixel over is in view', () => {
  const flow = (b) => leftOf([box('p')], [b]);
  assert.deepEqual(flow({ x: 20, y: -20, width: 100, height: 20 }), ['off screen above']);
  assert.deepEqual(flow({ x: -100, y: 100, width: 100, height: 20 }), ['off screen to the left']);
  assert.deepEqual(flow({ x: 390, y: 100, width: 100, height: 20 }), ['off screen to the right']);
  assert.deepEqual(flow({ x: 289, y: -19, width: 100, height: 20 }), [], 'one pixel on the page, top and right');
  const fixed = (y) => leftOf([box('p.bar', { position: 'fixed', box: { x: 20, y, width: 100, height: 20 } })], [{ x: 20, y, width: 100, height: 20 }]);
  assert.deepEqual(fixed(844), ['off screen below']);
  assert.deepEqual(fixed(843), [], 'one pixel on the screen, bottom');
});

// Contract: a text whose fill is transparent is not hidden when an ancestor paints it with its
// background through background-clip: text, which clips that background to the text of the
// element and of everything inside it (CSS Backgrounds 4, background-clip: text; measure-rendered.mjs,
// header, "unless background-clip: text paints the text with the background").
// Breaks when: only the element that owns the text is asked for background-clip: text, as it is
// now, so the links inside a paragraph with a gradient fill are reported as transparent although
// they show the gradient; Chrome draws them (a broken copy of /en/anatomy/ with
// `.footer-links{background:linear-gradient(...);background-clip:text;-webkit-text-fill-color:transparent}`).
// The case is marked todo until the measure reads background-clip: text up the chain.
// Not covered by: the colour cases of test/site-measure.test.mjs set background-clip on the element
// that owns the text only.
test('a transparent fill painted by the background of an ancestor through background-clip: text is not transparent', { todo: 'open gap: background-clip: text is read on the owner of the text only' }, () => {
  const fill = { color: 'rgb(10, 10, 10)', textFillColor: 'rgba(0, 0, 0, 0)' };
  const link = box('a.gx-link', { ...fill, backgroundClip: 'border-box' });
  const band = box('p.footer-links', { ...fill, backgroundClip: 'text' });
  assert.deepEqual(leftOf([link, band], [{ x: 20, y: 100, width: 60, height: 20 }]), []);
});

// ---------- the selector reader of check-build ----------

// Contract: a selector is under the motion gate only when one compound requires both html and
// .motion-ok (check-build.mjs, `gated`; spec 1b).
// Breaks when: the gate test looks for html in one compound and .motion-ok in any other, so
// `html .motion-ok .x{opacity:0}`, which hides .x for every reader whose page has a .motion-ok
// element, passes the build.
// Not covered by: the product of test/site-integration.test.mjs writes the gate always on html
// itself and its negation as html:not(.motion-ok); no case splits html and the class.
test('html and .motion-ok in different compounds are not the gate', () => {
  for (const css of ['html .motion-ok .x{opacity:0}', 'html.a .motion-ok .x{opacity:0}', 'html > body.motion-ok .x{visibility:hidden}']) {
    assert.ok(checkCss(css, 'x.css').some((p) => /at rest/.test(p)), css);
  }
  assert.deepEqual(checkCss('html.a.motion-ok .x{opacity:0}', 'x.css'), []);
});

// Contract: a pseudo-element draws text when any rule for it, written with ancestors or not, gives
// it content; then an opacity 0 at rest fails even with a hover rule (check-build.mjs,
// `mayDrawText`, which reads the last compound of each selector).
// Breaks when: the pseudo-element is looked for in another compound than the last, so the text
// given by `.card .tip::after` no longer counts and `.tip::after{opacity:0}` passes as a decoration
// shown on hover.
// Not covered by: the text rules of test/site-integration.test.mjs are one compound each
// (`.x::after`), so reading the first compound instead of the last survives them.
test('text given to a pseudo-element by a selector with ancestors counts as text', () => {
  const css = '.card .tip::after{content:"help"}.tip::after{opacity:0}.tip:hover::after{opacity:1}';
  assert.ok(checkCss(css, 'x.css').some((p) => /\.tip::after sets opacity 0 at rest/.test(p)), checkCss(css, 'x.css').join('\n'));
});

// Contract: an escaped comma is part of a name, not a cut in the selector list (selectors.mjs,
// `scan`, "is not escaped").
// Breaks when: the reader stops skipping escapes, so `.a\,.b` splits into `.a\` and `.b`, and a
// rule wholly under the gate fails the build for a selector that does not exist.
// Not covered by: the escaped comma of test/site-integration.test.mjs sits inside brackets
// (`[data-label=a\,b]`), where the bracket alone already protects it.
test('an escaped comma does not split a selector under the gate', () => {
  assert.deepEqual(checkCss('html.motion-ok .a\\,.b{opacity:0}', 'x.css'), []);
  assert.ok(checkCss('.a\\,.b{opacity:0}', 'x.css').length > 0);
});

// Contract: the declarations of a rule count whatever rules it nests (check-build.mjs reads the
// CSS rule by rule; spec 1b, the alarm).
// Breaks when: the rule walker takes the text from the last `;` or `}` to a `{` as the selector, as
// it does now, so `.x{opacity:0;html.motion-ok &{opacity:1}}` hands `opacity:0` to the nested
// selector and the hiding rule passes. The site does not nest CSS, and check-build.mjs states this
// limit in its header; the case is marked todo until the walker reads nesting.
// Not covered by: no test of check-build writes nested CSS.
test('a hiding declaration before a nested rule still fails', { todo: 'open gap: walkCss loses the declarations written before a nested rule' }, () => {
  assert.ok(checkCss('.x{opacity:0;html.motion-ok &{opacity:1}}', 'x.css').length > 0);
});

// ---------- the site link by host ----------

const SITE = 'https://www.vibeflow.run';
const head = (page) => {
  if (!page) return `<head><link rel="canonical" href="${SITE}/en/"></head>`;
  const rest = page.replace(/^(en|pt-br)\//, '');
  return `<head><link rel="canonical" href="${SITE}/${page}"><link rel="alternate" hreflang="en" href="${SITE}/en/${rest}">` +
    `<link rel="alternate" hreflang="pt-BR" href="${SITE}/pt-br/${rest}"><link rel="alternate" hreflang="x-default" href="${SITE}/en/${rest}"></head>`;
};
function smallSite(link) {
  const pages = { '': `<html>${head('')}<body><main><h1>Vibeflow</h1><a href="/en/">Go</a></main></body></html>` };
  for (const l of ['en', 'pt-br']) {
    pages[`${l}/`] = `<html>${head(`${l}/`)}<body><h1>Home</h1><section id="how"><p>Text</p></section></body></html>`;
    pages[`${l}/commands/`] = `<html>${head(`${l}/commands/`)}<body><h1>Commands</h1><p>A</p>${link ? `<a href="${link(l)}">L</a>` : ''}</body></html>`;
    pages[`${l}/anatomy/`] = `<html>${head(`${l}/anatomy/`)}<body><h1>Anatomy</h1><p>Text</p></body></html>`;
  }
  return pages;
}

// Contract: a link is a link to a page of the site when its host is the site's on the default port
// of http or https; another port or another scheme is another origin and is not checked
// (check-build.mjs, `resolve`: "a link to another host or scheme leaves before anything is
// decoded").
// Breaks when: the port or the scheme test is dropped, so `https://www.vibeflow.run:8443/...` or
// `ftp://www.vibeflow.run/...` is read as a page of this site and fails the build for an id it
// was never meant to have.
// Not covered by: the host forms of test/site-integration.test.mjs keep the port at 443 or none and
// the scheme at https.
test('a link to the site host on another port or scheme is another origin', () => {
  assert.deepEqual(checkPages(smallSite()), []);
  for (const href of [(l) => `https://www.vibeflow.run:8443/${l}/#nowhere`, (l) => `ftp://www.vibeflow.run/${l}/#nowhere`]) {
    assert.deepEqual(checkPages(smallSite(href)), [], href('en'));
  }
  assert.ok(checkPages(smallSite((l) => `http://www.vibeflow.run:80/${l}/#nowhere`)).some((p) => /no target/.test(p)), 'http on :80 is the site');
});

// ---------- the asset generator's two-phase write ----------

// Contract: a failure on the way leaves site/public/ and the manifest as they were, so no new image
// sits beside an old manifest (spec 1c; make-assets.mjs header).
// Breaks when: the five files are copied one by one and the manifest last with nothing put back, so
// a copy that fails part way (a destination file that cannot be written) leaves four new PNGs with
// the old favicon.ico and the old manifest.
// Not covered by: the staging test of test/site-assets.test.mjs injects the failure only while the
// files are made in the stage folder, before any copy starts; this one fails a real copy, by a
// read-only destination.
test('a copy that fails part way leaves the destination as it was', () => {
  const root = mkdtempSync(join(tmpdir(), 'site-assets-probe-'));
  const files = ['og-image.png', 'favicon-32.png', 'favicon-64.png', 'apple-touch-icon.png', 'favicon.ico'];
  try {
    const publicDir = join(root, 'public');
    const manifestPath = join(root, 'scripts', 'assets', 'manifest.json');
    const tmp = join(root, 'tmp');
    mkdirSync(publicDir, { recursive: true });
    mkdirSync(dirname(manifestPath), { recursive: true });
    mkdirSync(tmp);
    for (const f of files) writeFileSync(join(publicDir, f), `old ${f}`);
    writeFileSync(manifestPath, '{"old":true}\n');
    const age = (path) => (readFileSync(path, 'utf8').startsWith('old ') || readFileSync(path, 'utf8').includes('"old"') ? 'old' : 'new');
    const snapshot = () => Object.fromEntries([...files.map((f) => [f, age(join(publicDir, f))]), ['manifest.json', age(manifestPath)]]);
    const before = snapshot();
    chmodSync(join(publicDir, 'favicon.ico'), 0o444);
    try {
      generateAssets({
        sources: collectSources(SITE_DIR),
        shoot: () => readFileSync(join(SITE_DIR, 'public', 'favicon-32.png')),
        chromeVersion: 'Probe Chrome 1.0', publicDir, manifestPath, tmp,
      });
    } catch {
      // the failure is expected; what matters is the destination
    } finally {
      chmodSync(join(publicDir, 'favicon.ico'), 0o644);
    }
    assert.deepEqual(snapshot(), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The all-or-nothing copy: what a failed copy may touch, and what its error says.

const ASSET_FILES = ['og-image.png', 'favicon-32.png', 'favicon-64.png', 'apple-touch-icon.png', 'favicon.ico'];
// A folder for one run of the generator: public/ with the five old files and a file of someone
// else, the manifest folder with a file of someone else and no manifest yet, an empty tmp/, and a
// file beside them all.
function assetYard() {
  const root = mkdtempSync(join(tmpdir(), 'site-assets-yard-'));
  const publicDir = join(root, 'public');
  const manifestPath = join(root, 'scripts', 'assets', 'manifest.json');
  const tmp = join(root, 'tmp');
  mkdirSync(publicDir, { recursive: true });
  mkdirSync(dirname(manifestPath), { recursive: true });
  mkdirSync(tmp);
  for (const f of ASSET_FILES) writeFileSync(join(publicDir, f), `old ${f}`);
  writeFileSync(join(publicDir, 'robots.txt'), 'not the generator\'s');
  writeFileSync(join(dirname(manifestPath), 'notes.json'), '{"not":"the generator\'s"}\n');
  writeFileSync(join(root, 'beside.txt'), 'not the generator\'s');
  return { root, publicDir, manifestPath, tmp };
}
// Every file and folder under a root, with the sha256 of each file.
function tree(root) {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const rel = path.slice(root.length + 1);
      if (statSync(path).isDirectory()) { out[`${rel}/`] = 'dir'; walk(path); } else out[rel] = createHash('sha256').update(readFileSync(path)).digest('hex');
    }
  };
  walk(root);
  return out;
}
const generate = (yard, copy) => generateAssets({
  sources: collectSources(SITE_DIR),
  shoot: () => readFileSync(join(SITE_DIR, 'public', 'favicon-32.png')),
  chromeVersion: 'Probe Chrome 1.0', publicDir: yard.publicDir, manifestPath: yard.manifestPath, tmp: yard.tmp, copy,
});

// Contract: a copy that fails on any of the six destinations writes and removes nothing but those
// destinations and the generator's own folder under tmp: every other file and folder, beside the
// destinations or not, is as it was, and a destination that did not exist is gone again
// (make-assets.mjs, copyAll, "gets back the bytes it had (or is removed when it did not exist)";
// spec 1c, a failure leaves site/public/ and the manifest as they were).
// Breaks when: the put-back of a destination that did not exist removes more than that file, as
// `rmSync(dirname(to), { recursive: true })` does to the whole manifest folder; or any write of
// the put-back lands beside the destination.
// Not covered by: the "did not exist" case of test/site-assets.test.mjs checks only that the
// manifest is gone and that favicon.ico is old; its six-destination case lists the folders but
// always has a manifest.
test('a failed copy touches nothing but the six destinations and its own temp folder', () => {
  const failures = [];
  for (const failOn of [...ASSET_FILES, 'manifest.json']) {
    const yard = assetYard();
    try {
      const before = tree(yard.root);
      let message = '';
      try {
        generate(yard, (from, to) => {
          if (to.endsWith(`/${failOn}`)) {
            writeFileSync(to, readFileSync(from).subarray(0, 10));
            throw new Error(`probe failure on ${failOn}`);
          }
          copyFileSync(from, to);
        });
      } catch (e) {
        message = e.message;
      }
      if (!message.includes(`probe failure on ${failOn}`)) failures.push(`${failOn}: the failure did not surface (${message})`);
      const after = tree(yard.root);
      if (JSON.stringify(after) !== JSON.stringify(before)) failures.push(`${failOn}: ${JSON.stringify({ before, after })}`);
    } finally {
      rmSync(yard.root, { recursive: true, force: true });
    }
  }
  assert.deepEqual(failures, []);
});

// Contract: when putting a destination back fails too, the error says so and names the file, on
// the same line as the copy failure (make-assets.mjs, copyAll, "could not put back"; the
// generator's header, every failure is one line).
// Breaks when: a failed put-back is swallowed by its own catch, or the message drops the list or
// the names, so a half-replaced public/ looks like a clean failure that left everything as it was.
// Not covered by: no test in test/site-assets.test.mjs makes the put-back itself fail.
test('a put-back that fails too is said in the one line of the error, with the file', () => {
  const yard = assetYard();
  try {
    const og = join(yard.publicDir, 'og-image.png');
    let message = null;
    try {
      generate(yard, (from, to) => {
        if (to.endsWith('/favicon-32.png')) {
          // og-image.png was already replaced; turn it into a folder so its old bytes cannot go back
          rmSync(og);
          mkdirSync(og);
          throw new Error('probe failure on favicon-32.png');
        }
        copyFileSync(from, to);
      });
    } catch (e) {
      message = e.message;
    }
    assert.ok(message, 'the failure surfaced');
    assert.doesNotMatch(message, /\n/);
    assert.match(message, /probe failure on favicon-32\.png/);
    assert.match(message, /could not put back/);
    assert.ok(message.includes(og), `names the file that stayed: ${message}`);
    assert.equal(readFileSync(join(yard.publicDir, 'favicon-64.png'), 'utf8'), 'old favicon-64.png', 'a file never reached is untouched');
  } finally {
    rmSync(yard.root, { recursive: true, force: true });
  }
});

// Contract: the guard against symbolic links looks at the six destinations only: a link beside
// them, in public/ or in the manifest folder, pointing somewhere or nowhere, neither stops the
// generator nor is touched by it, and the six destinations are written (make-assets.mjs,
// refuseLinks, "A destination that is a symbolic link").
// Breaks when: the guard refuses any link it finds in public/ or the manifest folder, so a
// repository that keeps an unrelated link there can no longer make its assets; or the copy follows
// or replaces a link that is not one of its destinations.
// Not covered by: the link cases of test/site-assets.test.mjs put the link on a destination every
// time, and no case keeps a link beside them.
test('a symbolic link beside the six destinations does not stop the generator and is left as it is', () => {
  const yard = assetYard();
  try {
    const target = join(yard.root, 'elsewhere.txt');
    writeFileSync(target, 'not the generator\'s');
    const beside = join(yard.publicDir, 'robots-link.txt');
    symlinkSync(target, beside);
    const dangling = join(dirname(yard.manifestPath), 'old.json');
    symlinkSync(join(yard.root, 'nowhere.json'), dangling);
    const manifest = generate(yard, copyFileSync);
    assert.ok(manifest && manifest.outputs['favicon.ico'], 'the generator made its outputs');
    for (const f of ASSET_FILES) {
      assert.ok(!lstatSync(join(yard.publicDir, f)).isSymbolicLink(), `${f} is a plain file`);
      assert.notEqual(readFileSync(join(yard.publicDir, f), 'utf8'), `old ${f}`, `${f} was written`);
    }
    assert.ok(existsSync(yard.manifestPath), 'the manifest was written');
    assert.ok(lstatSync(beside).isSymbolicLink() && readlinkSync(beside) === target, 'the link in public/ is as it was');
    assert.ok(lstatSync(dangling).isSymbolicLink() && readlinkSync(dangling) === join(yard.root, 'nowhere.json'), 'the dangling link is as it was');
    assert.equal(readFileSync(target, 'utf8'), 'not the generator\'s', 'the target of the link is as it was');
    assert.ok(!existsSync(join(yard.root, 'nowhere.json')), 'nothing was written through the dangling link');
  } finally {
    rmSync(yard.root, { recursive: true, force: true });
  }
});

// Contract: a Chrome that does not answer --version in time is killed outright, as the screenshot
// is, and is an error of one line (make-assets.mjs, header, "it is then killed, in the screenshots
// and in the version query alike").
// Breaks when: the version query falls back to the default signal to terminate, so a Chrome that
// ignores it holds the generator for as long as it likes; a stand-in that leaves a mark when asked
// to terminate shows the difference without timing anything.
// Not covered by: the stand-in of test/site-assets.test.mjs ignores the signal and then ends on its
// own, so with the default signal the query still returns, only later, with the same message.
test('a version query that does not answer is killed, never asked to terminate', () => {
  const work = mkdtempSync(join(tmpdir(), 'site-assets-version-probe-'));
  try {
    const mark = join(work, 'asked-to-terminate');
    const stub = join(work, 'chrome.sh');
    writeFileSync(stub, `#!/bin/sh\ntrap 'echo asked > "${mark}"; exit 0' TERM\nwhile :; do sleep 1; done\n`);
    chmodSync(stub, 0o755);
    let message = null;
    try {
      chromeVersion(stub, { timeout: 2000 });
    } catch (e) {
      message = e.message;
    }
    assert.ok(message, 'the query failed');
    assert.doesNotMatch(message, /\n/);
    assert.match(message, /--version/);
    assert.ok(!existsSync(mark), 'the stand-in was asked to terminate instead of being killed');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
