// Behavior probes from the independent audit of the site leftovers, part 2 (the header's language
// link and labels, and the pipeline scene's media listener). Each case states, as comments, the
// contract it protects, the plausible regression that breaks it and why the implementer's tests
// miss it. None needs the build or a browser.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const LANGS = ['en', 'pt-br'];
const OTHER = { en: 'pt-br', 'pt-br': 'en' };

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// The route of each page file of a language, as Astro builds it: `x/index.astro` is `x/`, and
// `x/y.astro` is `x/y/`; the language root is ''.
function routesOf(lang) {
  const dir = join(ROOT, 'site', 'src', 'pages', lang);
  return walk(dir)
    .filter((p) => p.endsWith('.astro'))
    .map((p) => relative(dir, p).split(sep).join('/').replace(/\.astro$/, '').replace(/(^|\/)index$/, ''))
    .map((rest) => (rest ? `${rest}/` : ''));
}

// Contract: from every page of the site, the header's language link leads to the same page in the
// other language, and that page exists (spec 2a, criterion 5), whether Astro hands the header the
// path with the trailing slash (the build) or without it (the dev server, a link without it); and
// each page hands the header the language of its own folder, which the target and the two labels
// are computed from.
// Breaks when: a page is added in one language only, so its header links to a missing page; the
// target function drops or rewrites the rest of the path for a shape of route the site has; or a
// page copied from the other language keeps `<Header lang>` of the source, so the link points at
// the page itself and the labels speak the other language.
// Not covered by: test/site-header.test.mjs runs the function on a hand-written list of paths and
// never ties it to the page files, nor checks that the target exists or what language each page
// passes; the build's check-build checks that the target exists, but the CI does not build the site.
test('header language link: from every page file, the target is the same page in the other language, and it exists', async () => {
  const { switchLanguagePath } = await import('../../site/src/lib/language-path.js');
  const pages = Object.fromEntries(LANGS.map((lang) => [lang, new Set(routesOf(lang))]));
  assert.ok(pages.en.size >= 3 && pages['pt-br'].size >= 3, 'page files are read for both languages');
  for (const lang of LANGS) {
    const to = OTHER[lang];
    for (const rest of pages[lang]) {
      const file = join('site', 'src', 'pages', lang, rest, 'index.astro');
      if (existsSync(join(ROOT, file))) {
        const headers = [...read(file).matchAll(/<Header\b([^>]*)\/?>/g)].map((m) => /\blang="([^"]*)"/.exec(m[1])?.[1]);
        assert.deepEqual(headers, [lang], `${file} renders one header, in its folder's language`);
      }
      for (const pathname of [`/${lang}/${rest}`, `/${lang}/${rest}`.replace(/\/$/, '')]) {
        const target = switchLanguagePath(pathname, lang);
        const m = /^\/(en|pt-br)(?:\/(.*))?$/.exec(target);
        assert.ok(m, `${pathname} (${lang}) leads to ${target}, a path in a language`);
        assert.equal(m[1], to, `${pathname} (${lang}) leads to the other language`);
        const targetRest = (m[2] ?? '').replace(/\/?$/, '/').replace(/^\/$/, '');
        assert.equal(targetRest, rest, `${pathname} (${lang}) leads to the same page`);
        assert.ok(pages[to].has(targetRest), `${pathname} (${lang}) leads to ${target}, a page that exists`);
      }
    }
  }
});

// Contract: every i18n key a page, layout or component reads as `t.<key>` has a value in both
// languages; with the header's switchPath gone (spec 2a) and its two labels added (spec 2b),
// nothing may still read a key that is not there.
// Breaks when: any component keeps or brings back `t.switchPath`, or reads a label key that one
// language lacks; Astro renders `href={undefined}` as a link with no href and an undefined label
// as no label, `astro build` does not type-check, and check-build reads only links with an href.
// Not covered by: test/site-header.test.mjs looks for switchPath only in Header.astro and the two
// i18n files; test/site-pages.test.mjs checks the keys of the commands and anatomy components only,
// and the site-base probe those of the hero only.
test('i18n: every key read as t.<key> anywhere under site/src exists in en.ts and pt-br.ts', () => {
  const keysOf = (file) => new Set([...read(file).matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  const en = keysOf('site/src/i18n/en.ts');
  const pt = keysOf('site/src/i18n/pt-br.ts');
  assert.ok(en.size > 100 && pt.size > 100, 'keys are read from both i18n files');
  const files = walk(join(ROOT, 'site', 'src'))
    .filter((p) => /\.(astro|ts|js|mjs)$/.test(p))
    .filter((p) => !relative(ROOT, p).split(sep).join('/').startsWith('site/src/i18n/'));
  let readers = 0;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (!/\bconst t = useTranslations\(/.test(src)) continue;
    readers++;
    const name = relative(ROOT, file).split(sep).join('/');
    for (const [, key] of src.matchAll(/(?<![\w$.])t\.(\w+)/g)) {
      assert.ok(en.has(key), `${name} reads t.${key}, missing in en.ts`);
      assert.ok(pt.has(key), `${name} reads t.${key}, missing in pt-br.ts`);
    }
  }
  assert.ok(readers >= 5, `files that bind t from useTranslations are found (${readers})`);
});

// A stand-in for the scene's DOM whose media query list delivers events by type, as a browser's
// MediaQueryList does: a change of the query reaches only the `change` listeners (and `onchange`).
// The stage fits the screen, so the scene pins wherever the query and the motion class allow it.
function typedMediaHarness() {
  const node = () => ({ dataset: {}, hidden: false });
  const gates = [node(), node(), node(), node()];
  const steps = [node(), node(), node(), node()];
  const end = node();
  const trackHeight = 3300;
  const stageHeight = 1000;
  let top = 0;
  const PAD = 40;
  const box = (from, height) => ({ getBoundingClientRect: () => ({ top: PAD + from, bottom: PAD + from + height, height }) });
  const band = box(240, 300);
  const stage = { offsetHeight: stageHeight, children: [box(0, 200), band, box(580, 200)], padding: { paddingTop: `${PAD}px`, paddingBottom: `${PAD}px` } };
  const attrs = new Set();
  const one = { '[data-scene-track]': { getBoundingClientRect: () => ({ top, height: trackHeight }) }, '[data-scene-stage]': stage, '[data-scene-band]': band, '[data-scene-end]': end };
  const root = {
    querySelector: (selector) => one[selector] ?? null,
    querySelectorAll: (selector) => (selector === '[data-gate]' ? gates : selector === '[data-step]' ? steps : []),
    hasAttribute: (name) => attrs.has(name),
    toggleAttribute: (name, force = !attrs.has(name)) => { if (force) attrs.add(name); else attrs.delete(name); return force; },
  };
  const windowListeners = {};
  const mql = {
    matches: true,
    onchange: null,
    typed: {},
    addEventListener(type, f) { (this.typed[type] ??= []).push(f); },
  };
  const names = ['matchMedia', 'document', 'addEventListener', 'innerHeight', 'getComputedStyle'];
  const saved = Object.fromEntries(names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define('matchMedia', () => mql);
  define('document', { documentElement: { classList: { contains: (name) => name === 'motion-ok' } } });
  define('addEventListener', (type, f) => { (windowListeners[type] ??= []).push(f); });
  define('innerHeight', stageHeight);
  define('getComputedStyle', (el) => el.padding ?? { paddingTop: '0px', paddingBottom: '0px' });
  const restore = () => {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
  const scrollTo = (progress) => {
    top = -progress * (trackHeight - stageHeight);
    for (const f of windowListeners.scroll ?? []) f();
  };
  const changeMedia = (value) => {
    mql.matches = value;
    const event = { type: 'change', matches: value, media: '' };
    for (const f of mql.typed.change ?? []) f(event);
    if (typeof mql.onchange === 'function') mql.onchange(event);
  };
  const lit = () => steps.map((s) => s.dataset.active);
  return { root, flow: { goTo() {} }, end, scrollTo, changeMedia, restore, lit };
}

// Contract: when the scene's media query flips with the page open (reduced motion turned on or
// off, a tablet rotated across the query), the scene follows it: it lets go, with the four steps
// lit and the verdict shown, and pins again, with one step lit, when the query matches again
// (spec 2c).
// Breaks when: the scene listens to the media query under another event name than `change` (a
// typo, or an event a MediaQueryList never fires), so no browser ever calls it.
// Not covered by: the stand-ins of test/site-pipeline.test.mjs and of the site-pipeline probe store
// every listener of the media query whatever its event type and call them all; binding the
// listener to `'changes'` survives both (measured by the audit on a scratch copy).
test('pipeline scene: it follows the change event of its media query, both ways', async () => {
  const { bindPipelineScene } = await import('../../site/src/lib/pipeline-scene.js');
  const h = typedMediaHarness();
  try {
    bindPipelineScene(h.root, h.flow);
    h.scrollTo(0.4);
    assert.deepEqual(h.lit(), ['false', 'true', 'false', 'false'], 'pinned at load: one step lit');
    h.changeMedia(false);
    assert.deepEqual(h.lit(), ['true', 'true', 'true', 'true'], 'the query stops matching: four steps lit');
    assert.equal(h.end.hidden, false, 'the query stops matching: the verdict shows');
    h.changeMedia(true);
    assert.deepEqual(h.lit(), ['false', 'true', 'false', 'false'], 'the query matches again: one step lit');
  } finally {
    h.restore();
  }
});
