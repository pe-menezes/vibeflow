// Probes for the site scripts: the rendered measure's pure decision (hiddenReasons, findHidden and
// the shipped EXCEPTIONS), the selector reader of check-build, and the two-phase write of
// make-assets. Each names the contract it holds, the change that breaks it and why the main tests
// miss that change. No build and no browser: what needs Chrome is run by hand with
// `npm run measure` on a broken copy of the build.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findHidden, hiddenReasons } from '../../site/scripts/measure-rendered.mjs';
import { checkCss, checkPages } from '../../site/scripts/check-build.mjs';
import { collectSources, generateAssets } from '../../site/scripts/make-assets.mjs';

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
