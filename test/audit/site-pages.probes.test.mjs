// Behavior probes from the independent audit of the commands and anatomy pages (site/), part 4 of
// the new-site work. They run the index script each component ships, unchanged, against a small
// stand-in for the browser: entries laid out at the heights the built pages measured in headless
// Chrome at 1280x900, an IntersectionObserver that honours the rootMargin the script asks for,
// scroll listeners and animation frames. Each case states, as comments, the contract it protects,
// the plausible regression that breaks it, and why the implementer's tests did not catch it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const COMPONENTS = {
  commands: 'site/src/components/CommandsDocs.astro',
  anatomy: 'site/src/components/VibeflowAnatomy.astro',
};

// Layouts of the built pages, measured in headless Chrome at 1280x900 (en): each entry's id, its
// top on the page and its height; the page height; the scroll margin a jump lands at.
const LAYOUTS = {
  commands: {
    pageHeight: 12318,
    scrollMargin: 24,
    entries: [
      ['analyze', 489, 1170], ['discover', 1659, 750], ['gen-spec', 2410, 1531], ['implement', 3940, 1606],
      ['prompt-pack', 5546, 750], ['audit', 6297, 1655], ['quick', 7952, 776], ['hotfix', 8728, 1081],
      ['teach', 9810, 1287], ['stats', 11097, 904],
    ],
  },
  anatomy: {
    pageHeight: 5016,
    scrollMargin: 24,
    entries: [
      ['index-md', 690, 783], ['patterns', 1473, 706], ['conventions-md', 2178, 578], ['decisions-md', 2756, 552],
      ['loop-folders', 3308, 576], ['patterns-vs-conventions', 3884, 594], ['manual', 4478, 221],
    ],
  },
};
const VIEWPORT = 900;

// The index script of a component: the inline <script> that sets aria-current, or the module it imports.
function indexScript(component) {
  const src = readFileSync(join(ROOT, component), 'utf8');
  const scripts = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let code = scripts.find((s) => s.includes('aria-current'));
  if (!code) {
    for (const s of scripts) {
      for (const m of s.matchAll(/import\s+(?:[^'"]*from\s+)?['"](\.[^'"]+)['"]/g)) {
        const text = readFileSync(resolve(dirname(join(ROOT, component)), m[1]), 'utf8');
        if (text.includes('aria-current')) code = text.replace(/^\s*export\s+(default\s+)?/gm, '');
      }
    }
  }
  assert.ok(code, `${component}: no index script that sets aria-current`);
  if (typeof nodeModule.stripTypeScriptTypes === 'function') return nodeModule.stripTypeScriptTypes(code, { mode: 'strip' });
  return code
    .replace(/<(?:HTML\w*Element|Element|string|number|boolean)(?:\s*,\s*(?:HTML\w*Element|Element|string|number|boolean))*>/g, '')
    .replace(/:\s*\w+\s+is\s+[\w.]+(?=\s*=>)/g, '')
    .replace(/\sas\s+[A-Z]\w*/g, '');
}

// A page with the layout above, the index of the component, and the script running in it.
function page(name) {
  const layout = LAYOUTS[name];
  let scrollY = 0;
  const listeners = [];
  const frames = [];
  const timers = [];
  const observers = [];

  const attrs = () => {
    const map = new Map();
    return {
      setAttribute: (k, v) => map.set(k, String(v)),
      removeAttribute: (k) => map.delete(k),
      getAttribute: (k) => (map.has(k) ? map.get(k) : null),
      hasAttribute: (k) => map.has(k),
    };
  };
  const classList = () => {
    const set = new Set();
    return { add: (...c) => c.forEach((x) => set.add(x)), remove: (...c) => c.forEach((x) => set.delete(x)), toggle: (c, on) => ((on ?? !set.has(c)) ? set.add(c) : set.delete(c)), contains: (c) => set.has(c) };
  };
  const entries = layout.entries.map(([id, top, height]) => ({
    id, pageTop: top, height, offsetTop: top, offsetHeight: height, ...attrs(), classList: classList(),
    getBoundingClientRect() { const t = this.pageTop - scrollY; return { top: t, bottom: t + this.height, height: this.height, left: 0, right: 800, width: 800, y: t, x: 0 }; },
  }));
  const byId = new Map(entries.map((e) => [e.id, e]));
  const links = entries.map((e) => {
    const a = { hash: `#${e.id}`, href: `http://x/#${e.id}`, ...attrs(), classList: classList(), dataset: {}, closest: () => null };
    a.setAttribute('href', `#${e.id}`);
    return a;
  });
  const linkSelector = (sel) => /\ba\b/.test(sel);
  const toc = {
    ...attrs(), classList: classList(), dataset: { docToc: '' },
    querySelectorAll: (sel) => (linkSelector(sel) ? links : []),
    querySelector: (sel) => (linkSelector(sel) ? links[0] : null),
  };
  toc.setAttribute('data-doc-toc', '');

  class FakeIntersectionObserver {
    constructor(callback, options = {}) {
      this.callback = callback;
      const parts = String(options.rootMargin ?? '0px').trim().split(/\s+/);
      const [t, r = t, b = t, l = r] = parts;
      const px = (v) => (v.endsWith('%') ? (parseFloat(v) / 100) * VIEWPORT : parseFloat(v));
      this.top = px(t);
      this.bottom = px(b);
      this.targets = new Map();
      observers.push(this);
    }
    observe(el) { this.targets.set(el, undefined); }
    unobserve(el) { this.targets.delete(el); }
    disconnect() { this.targets.clear(); }
    takeRecords() { return []; }
    deliver() {
      const rootTop = -this.top;
      const rootBottom = VIEWPORT + this.bottom;
      const changed = [];
      for (const [el, was] of this.targets) {
        const rect = el.getBoundingClientRect();
        const isIntersecting = rect.top <= rootBottom && rect.bottom >= rootTop;
        if (was !== isIntersecting) {
          this.targets.set(el, isIntersecting);
          changed.push({ target: el, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0, boundingClientRect: rect });
        }
      }
      if (changed.length) this.callback(changed, this);
    }
  }

  const doc = {
    querySelectorAll: (sel) => (/data-doc-toc|doc-toc/.test(sel) ? [toc] : linkSelector(sel) ? links : []),
    querySelector: (sel) => (/data-doc-toc|doc-toc/.test(sel) ? toc : null),
    getElementById: (id) => byId.get(id) ?? null,
    documentElement: { get scrollHeight() { return layout.pageHeight; }, clientHeight: VIEWPORT, get scrollTop() { return scrollY; } },
    addEventListener: (type, fn) => listeners.push([type, fn]),
  };
  const win = {
    IntersectionObserver: FakeIntersectionObserver,
    innerHeight: VIEWPORT,
    get scrollY() { return scrollY; },
    get pageYOffset() { return scrollY; },
    location: { hash: '' },
    addEventListener: (type, fn) => listeners.push([type, fn]),
    removeEventListener: () => {},
    requestAnimationFrame: (fn) => frames.push(fn),
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    getComputedStyle: () => ({ scrollMarginTop: `${layout.scrollMargin}px` }),
  };
  win.window = win;
  win.document = doc;

  const flush = () => {
    for (let round = 0; round < 5; round++) {
      observers.forEach((o) => o.deliver());
      listeners.filter(([type]) => type === 'scroll').forEach(([, fn]) => fn({ type: 'scroll' }));
      frames.splice(0).forEach((fn) => fn(0));
      timers.splice(0).forEach((fn) => fn());
    }
  };
  const code = indexScript(COMPONENTS[name]);
  const run = new Function('window', 'document', 'IntersectionObserver', 'requestAnimationFrame', 'setTimeout', 'clearTimeout', 'location', 'matchMedia', 'getComputedStyle', 'innerHeight', code);
  run(win, doc, FakeIntersectionObserver, win.requestAnimationFrame, win.setTimeout, win.clearTimeout, win.location, win.matchMedia, win.getComputedStyle, VIEWPORT);
  flush();

  const maxScroll = layout.pageHeight - VIEWPORT;
  return {
    ids: layout.entries.map(([id]) => id),
    maxScroll,
    scrollTo(y) { scrollY = Math.max(0, Math.min(y, maxScroll)); flush(); },
    // A jump from the index: the browser puts the entry's top at the scroll margin, or stops at the page end.
    jumpTo(id) { win.location.hash = `#${id}`; this.scrollTo(byId.get(id).pageTop - layout.scrollMargin); return scrollY === maxScroll; },
    current() {
      const marked = links.filter((a) => a.getAttribute('aria-current') !== null);
      assert.ok(marked.length <= 1, `more than one current link: ${marked.map((a) => a.hash)}`);
      if (marked.length) assert.equal(marked[0].getAttribute('aria-current'), 'location', 'the current link is exposed as aria-current="location"');
      return marked.length ? marked[0].hash.slice(1) : null;
    },
  };
}

function sequence(p, from, to, step) {
  const seen = [];
  for (let y = from; step > 0 ? y <= to + step : y >= to + step; y += step) {
    p.scrollTo(y);
    const c = p.current();
    if (c && seen.at(-1) !== c) seen.push(c);
  }
  return seen;
}

// Contract: on the commands page, the index follows the reading in both directions: scrolling down
//   marks every command once, in page order, the last one at the bottom of the page, and scrolling
//   back up marks them again in reverse, with one current link at a time, as aria-current="location".
// Breaks when: the observer margin or the pick of the current entry changes so an entry is skipped,
//   two links are current at once, or the mark stops following on the way up.
// Not covered by: test/site-pages.test.mjs only checks that the script text mentions aria-current.
test('commands index: scrolling down and back up marks every command in order, one at a time', () => {
  const p = page('commands');
  assert.deepEqual(sequence(p, 0, p.maxScroll, 120), p.ids, 'going down');
  assert.deepEqual(sequence(p, p.maxScroll, 0, -120), [...p.ids].reverse(), 'going up');
});

// Contract: on the anatomy page, the same: every section is marked going down and going up, and at
//   the bottom of the page the last section ("Want the full picture?", #manual) is the current one.
// Breaks when: the last section is shorter than the upper band of the screen and the script keeps
//   the section above it, as it does today (headless Chrome, 1280 and 1440: #manual is never marked).
// Not covered by: test/site-pages.test.mjs runs no part of the script.
test('anatomy index: scrolling marks every section, the last one at the bottom of the page', () => {
  const p = page('anatomy');
  assert.deepEqual(sequence(p, 0, p.maxScroll, 120), p.ids, 'going down');
  assert.deepEqual(sequence(p, p.maxScroll, 0, -120), [...p.ids].reverse(), 'going up');
});

// Contract: a jump from the index marks the entry jumped to: after following the link to an entry,
//   that entry's link is the current one (the jump puts the entry at the scroll margin, 24 px).
// Breaks when: the entry above still shows its last pixels above the scroll margin and the script
//   picks the first entry in view, as it does today (headless Chrome, 1280 and 1440, both pages and
//   both languages: every link but the first marks the entry before it).
// Not covered by: test/site-pages.test.mjs runs no part of the script.
for (const name of ['commands', 'anatomy']) {
  test(`${name} index: a jump from the index marks the entry jumped to`, () => {
    const p = page(name);
    const wrong = [];
    for (const id of p.ids) {
      p.scrollTo(0);
      const atEnd = p.jumpTo(id);
      if (atEnd) continue; // the page end stops the jump short; the bottom case is the scrolling probe's
      const c = p.current();
      if (c !== id) wrong.push(`#${id} marks ${c ? `#${c}` : 'nothing'}`);
    }
    assert.deepEqual(wrong, []);
  });
}
