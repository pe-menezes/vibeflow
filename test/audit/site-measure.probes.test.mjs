// Audit probes for the site scripts (site-restos, part 1): the rendered measure's pure decision
// (hiddenReasons, findHidden and the shipped EXCEPTIONS), the selector reader of check-build, and
// the two-phase write of make-assets. No build and no browser: what needs Chrome stays in the audit
// report, with the command that runs it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
// Not covered by: test/site-measure.test.mjs builds every chain with `position: static`, so both
// mutations of the `holds` line survive it (audit report, mutants r15 and r16).
test('an absolute text is clipped by a positioned ancestor that misses it and escapes a static one', () => {
  const card = (position) => box('div.card', { position, overflowX: 'hidden', overflowY: 'hidden', box: { x: 0, y: 100, width: 390, height: 50 } });
  const tip = () => box('span.tip', { position: 'absolute', box: { x: 20, y: 700, width: 40, height: 20 } });
  const at = [{ x: 20, y: 700, width: 40, height: 20 }];
  const clipped = hiddenReasons(text([tip(), card('relative'), box('section'), ...ROOTS()], at), VIEWPORT);
  assert.ok(clipped.some((r) => r === 'clipped away by div.card'), JSON.stringify(clipped));
  assert.deepEqual(hiddenReasons(text([tip(), card('static'), box('section'), ...ROOTS()], at), VIEWPORT), []);
});

// The four exceptions the measure ships with, each seen at both widths and in both themes.
const hiddenIn = (scope) => text([box('p', { display: 'none' }), scope, ...ROOTS()], []);
const seen = (target, width, theme) => ({ page: '/en/', width, theme, viewport: { width, height: 844 }, targets: [target] });

// Contract: each exception the measure ships with excuses hidden text only at the width its reason
// names: .desktop-only and .flow-verdict at 390, #mobile-menu at 1280; #form-success everywhere
// (measure-rendered.mjs, EXCEPTIONS, each restricted to one width by its reason).
// Breaks when: an exception loses its width, so the wide navigation, the phone menu or the verdict
// note could vanish at the width where the reader needs it and the measure would still say ok; or
// the width is moved to the other screen.
// Not covered by: test/site-measure.test.mjs scopes a made-up exception (#how) and only checks that
// each shipped entry has a reason, so dropping `width: 390` from .flow-verdict survives it (audit
// report, mutants l01, l02, l03, l05).
test('each shipped exception excuses hidden text only at its own width, in both themes', () => {
  const cases = [
    ['nav.nav.desktop-only', 390],
    ['div.flow-verdict', 390],
    ['nav#mobile-menu.mobile-menu', 1280],
  ];
  const failures = [];
  for (const [scope, width] of cases) {
    for (const theme of ['light', 'dark']) {
      for (const w of [390, 1280]) {
        const found = findHidden([seen(hiddenIn(box(scope)), w, theme)]).length;
        const want = w === width ? 0 : 1;
        if (found !== want) failures.push(`${scope} at ${w}, ${theme}: ${found} found, ${want} expected`);
      }
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
// Breaks when: today's code, which skips the off-screen test on an axis as soon as any ancestor
// scrolls on it. `overflow-x: hidden` makes the computed overflow-y `auto`, so text pushed above
// the page inside such a box passes; `text-indent: -9999px` inside an `overflow-x: auto` box passes
// too. Both pass `npm run measure` on a broken copy of the site (audit report, f26 and f27). The
// case turns green when the gap closes.
// Not covered by: the executor's scroll case puts the text to the right of the box, the one side a
// scroll does reach.
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
// Breaks when: today's code, which reads clip rect(), inset(), circle() and ellipse() but not a
// polygon of no area; `clip-path: polygon(0 0, 0 0, 0 0)` on a section title passes
// `npm run measure` on a broken copy (audit report, f15). The case turns green when the gap closes.
// Not covered by: test/site-measure.test.mjs hides by clip with rect() and inset(50%) only.
test('a clip-path polygon of no area clips the text away', () => {
  const t = text([box('h2.title', { clipPath: 'polygon(0px 0px, 0px 0px, 0px 0px)', box: { x: 20, y: 100, width: 350, height: 40 } }), ...ROOTS()], [{ x: 20, y: 100, width: 200, height: 30 }]);
  assert.notDeepEqual(hiddenReasons(t, VIEWPORT), []);
});

// ---------- the selector reader of check-build ----------

// Contract: a selector is under the motion gate only when one compound requires both html and
// .motion-ok (check-build.mjs, `gated`; spec 1b).
// Breaks when: the gate test looks for html in one compound and .motion-ok in any other, so
// `html .motion-ok .x{opacity:0}`, which hides .x for every reader whose page has a .motion-ok
// element, passes the build.
// Not covered by: the executor's product writes the gate always on html itself and its negation as
// html:not(.motion-ok); no case splits html and the class (audit report, mutant s04).
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
// Not covered by: the executor's text rules are one compound each (`.x::after`), so reading the
// first compound instead of the last survives them (audit report, mutant s12).
test('text given to a pseudo-element by a selector with ancestors counts as text', () => {
  const css = '.card .tip::after{content:"help"}.tip::after{opacity:0}.tip:hover::after{opacity:1}';
  assert.ok(checkCss(css, 'x.css').some((p) => /\.tip::after sets opacity 0 at rest/.test(p)), checkCss(css, 'x.css').join('\n'));
});

// Contract: an escaped comma is part of a name, not a cut in the selector list (selectors.mjs,
// `scan`, "is not escaped").
// Breaks when: the reader stops skipping escapes, so `.a\,.b` splits into `.a\` and `.b`, and a
// rule wholly under the gate fails the build for a selector that does not exist.
// Not covered by: the executor's escaped comma sits inside brackets (`[data-label=a\,b]`), where the
// bracket alone already protects it (audit report, mutant s06).
test('an escaped comma does not split a selector under the gate', () => {
  assert.deepEqual(checkCss('html.motion-ok .a\\,.b{opacity:0}', 'x.css'), []);
  assert.ok(checkCss('.a\\,.b{opacity:0}', 'x.css').length > 0);
});

// Contract: the declarations of a rule count whatever rules it nests (check-build.mjs reads the
// CSS rule by rule; spec 1b, the alarm).
// Breaks when: today's code, whose rule walker takes the text from the last `;` or `}` to a `{` as
// the selector, so `.x{opacity:0;html.motion-ok &{opacity:1}}` hands `opacity:0` to the nested
// selector and the hiding rule passes. The site does not nest CSS today (audit report). The case
// turns green when the gap closes.
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
// Not covered by: the executor's host forms keep the port at 443 or none and the scheme at https
// (audit report, mutants h01 and h06).
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
// Breaks when: today's code, which copies the five files one by one and the manifest last, so a
// copy that fails part way (a destination file that cannot be written) leaves four new PNGs with
// the old favicon.ico and the old manifest (audit report, step 5). The case turns green when the
// gap closes.
// Not covered by: the executor injects the failure only while the files are made in the stage
// folder, before any copy starts.
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
