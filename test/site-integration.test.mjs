// Integration of the new site: the build runs every HTML check, and check-build.mjs proves the
// three checks the part 1 audit asked for (anchors with a target, nothing hidden at rest in the
// markup, one h1 per page), the per-page hreflang and the root page's canonical.
//
// The checks run on HTML in memory, no build: a small site that passes is built here, and each
// broken case is generated as the product of the forms and the ways to break them, so no case is
// picked by hand. The real built site is checked by `npm run build`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPages, checkCss } from '../site/scripts/check-build.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const SITE = 'https://www.vibeflow.run';

// ---------- a small site that passes ----------

function head(page, extra = '') {
  const rest = page.replace(/^(en|pt-br)\//, '');
  return `<head><link rel="canonical" href="${SITE}/${page}">` +
    `<link rel="alternate" hreflang="en" href="${SITE}/en/${rest}">` +
    `<link rel="alternate" hreflang="pt-BR" href="${SITE}/pt-br/${rest}">` +
    `<link rel="alternate" hreflang="x-default" href="${SITE}/en/${rest}">${extra}</head>`;
}

function home(lang, ids = {}) {
  const how = ids.how ?? 'how';
  const analyze = ids.analyze ?? 'analyze';
  return `<!doctype html><html lang="${lang}">${head(`${lang}/`)}<body>` +
    `<header><a href="/${lang}/#${how}">How</a><a href="/${lang}/commands">Commands</a><a href="/${lang}/anatomy">Anatomy</a></header>` +
    `<nav class="mobile-menu" id="mobile-menu" hidden><a href="/${lang}/#${how}">How</a></nav>` +
    `<section class="hero"><h1>Title</h1><p class="hero-sub">Subtitle</p></section>` +
    `<div class="section" id="${how}"><ul><li class="card">Item</li></ul>` +
    `<a href="#${how}">Here</a><a href="/${lang}/commands#${analyze}">Analyze</a></div>` +
    `<form><p class="contact-success" id="form-success" role="status" hidden>Thanks</p></form>` +
    `</body></html>`;
}

function commands(lang, ids = {}) {
  const analyze = ids.analyze ?? 'analyze';
  const how = ids.how ?? 'how';
  return `<!doctype html><html lang="${lang}">${head(`${lang}/commands/`)}<body>` +
    `<header><a href="/${lang}/#${how}">How</a></header>` +
    `<h1>Commands</h1><nav><a href="#${analyze}">Analyze</a></nav>` +
    `<article id="${analyze}"><p class="cmd-text">Reads the code</p></article>` +
    `<a href="/${lang}/#${how}">Back</a></body></html>`;
}

function anatomy(lang) {
  return `<!doctype html><html lang="${lang}">${head(`${lang}/anatomy/`)}<body>` +
    `<h1>Anatomy</h1><a href="#patterns">Patterns</a><div class="section" id="patterns"><p>Text</p></div>` +
    `<a href="/${lang}/commands">Commands</a></body></html>`;
}

const rootPage = () =>
  `<!doctype html><html lang="en"><head><link rel="canonical" href="${SITE}/en/"></head>` +
  `<body><main><h1>Vibeflow</h1><p><a href="/en/">Go to Vibeflow</a></p></main></body></html>`;

function site() {
  return {
    '': rootPage(),
    'en/': home('en'),
    'pt-br/': home('pt-br'),
    'en/commands/': commands('en'),
    'pt-br/commands/': commands('pt-br'),
    'en/anatomy/': anatomy('en'),
    'pt-br/anatomy/': anatomy('pt-br'),
  };
}

// A problem starts with the page, `/<page>: `, and says what is wrong.
const named = (problems, page, re) => problems.some((p) => p.startsWith(`/${page}: `) && re.test(p));

test('the small site passes every check', () => {
  assert.deepEqual(checkPages(site()), []);
});

// ---------- item 2: every anchor has a target ----------

// Each form of link, with the page it sits on, the page it targets and the id it targets.
const LINK_FORMS = [
  { form: '#x', page: 'commands/', target: 'commands/', id: 'analyze', href: () => '#analyze' },
  { form: '/<lang>/#x', page: 'commands/', target: '', id: 'how', href: (l) => `/${l}/#how` },
  { form: '/<lang>/<page>#x', page: '', target: 'commands/', id: 'analyze', href: (l) => `/${l}/commands#analyze` },
];

// Each way to break it, applied to a whole site; returns the page that must be named.
const BREAKS = {
  'target swapped': (pages, f) => {
    for (const l of ['en', 'pt-br']) {
      const page = `${l}/${f.page}`;
      const before = pages[page];
      pages[page] = before.replaceAll(`href="${f.href(l)}"`, `href="${f.href(l).replace(f.id, `${f.id}-x`)}"`);
      assert.notEqual(pages[page], before, 'the link was swapped');
    }
    return `en/${f.page}`;
  },
  'target removed': (pages, f) => {
    for (const l of ['en', 'pt-br']) pages[`${l}/${f.target}`] = pages[`${l}/${f.target}`].replace(` id="${f.id}"`, '');
    return `en/${f.page}`;
  },
  'target only in the other language': (pages, f) => {
    pages[`pt-br/${f.target}`] = pages[`pt-br/${f.target}`].replace(` id="${f.id}"`, '');
    return `pt-br/${f.page}`;
  },
};

for (const f of LINK_FORMS) {
  for (const [way, breakIt] of Object.entries(BREAKS)) {
    test(`anchor ${f.form}, ${way}: check-build fails and names the page`, () => {
      const pages = site();
      const page = breakIt(pages, f);
      const problems = checkPages(pages);
      assert.ok(named(problems, page, /no target/), problems.join('\n'));
    });
  }
}

// ---------- item 2: nothing hidden at rest in the markup ----------

// The places: the hero text, an item of a section, and a page that is not the home page.
const PLACES = [
  { place: 'hero text', page: 'en/', cls: 'hero-sub' },
  { place: 'section item', page: 'en/', cls: 'card' },
  { place: 'inner page', page: 'en/commands/', cls: 'cmd-text' },
];

// The forms the part 1 audit lists in A3, each as a change to the tag that carries the class.
const ATTR = (style) => (html, cls) => html.replace(`class="${cls}"`, `class="${cls}" style="${style}"`);
const CSS = (decl) => (html, cls) => html.replace('</head>', `<style>.${cls}{${decl}}</style></head>`);
const HIDE_FORMS = {
  'style opacity:0': ATTR('opacity:0'),
  'style opacity:.0': ATTR('opacity:.0'),
  'style opacity:0%': ATTR('opacity: 0%'),
  'style visibility:hidden': ATTR('visibility:hidden'),
  'style display:none': ATTR('display: none'),
  'style translateX(-200vw)': ATTR('transform: translateX(-200vw)'),
  'style left:-9999px': ATTR('position:absolute;left:-9999px'),
  'hidden attribute': (html, cls) => html.replace(`class="${cls}"`, `class="${cls}" hidden`),
  'css opacity:.0': CSS('opacity:.0'),
  'css opacity:0%': CSS('opacity:0%'),
};

for (const p of PLACES) {
  for (const [form, apply] of Object.entries(HIDE_FORMS)) {
    test(`hidden at rest, ${form} on the ${p.place}: check-build fails and names the page`, () => {
      const pages = site();
      pages[p.page] = apply(pages[p.page], p.cls);
      assert.notEqual(pages[p.page], site()[p.page], 'the form was applied');
      const problems = checkPages(pages);
      assert.ok(named(problems, p.page, /at rest/), problems.join('\n'));
    });
  }
}

test('the hidden attribute is allowed only on the listed elements a script shows later', () => {
  assert.deepEqual(checkPages(site()), []);
  const pages = site();
  pages['en/'] = pages['en/'].replace('id="form-success"', 'id="form-error"');
  assert.ok(named(checkPages(pages), 'en/', /at rest/));
});

// ---------- item 2: exactly one h1 per page ----------

for (const page of ['en/', 'en/commands/', 'pt-br/anatomy/', '']) {
  for (const [count, change] of [
    [0, (h) => h.replace(/<h1>([\s\S]*?)<\/h1>/, '<p>$1</p>')],
    [2, (h) => h.replace('</body>', '<h1>Again</h1></body>')],
  ]) {
    test(`${count} h1 on /${page}: check-build fails and names the page`, () => {
      const pages = site();
      pages[page] = change(pages[page]);
      assert.ok(named(checkPages(pages), page, /h1/));
    });
  }
  test(`one h1 on /${page} passes`, () => {
    assert.ok(!checkPages(site()).some((p) => /h1/.test(p)));
  });
}

// ---------- item 2: the two false positives of A4, each beside a real case that still fails ----------

test('a decorative pseudo-element at opacity 0 shown on hover is not hidden text', () => {
  const css = '.copy::after{content:"";opacity:0}.copy:hover::after{opacity:1}';
  assert.deepEqual(checkCss(css, 'x.css'), []);
  // The scoped form Astro writes.
  assert.deepEqual(checkCss('.copy[data-astro-cid-a1]:after{content:\'\';opacity:0}.copy[data-astro-cid-a1]:hover:after{opacity:.6}', 'x.css'), []);
});

test('a pseudo-element with text, or a real element, at opacity 0 until hover still fails', () => {
  assert.ok(checkCss('.copy::after{content:"Copied";opacity:0}.copy:hover::after{opacity:1}', 'x.css').some((p) => /at rest/.test(p)));
  assert.ok(checkCss('.copy span{opacity:0}.copy:hover span{opacity:1}', 'x.css').some((p) => /at rest/.test(p)));
  assert.ok(checkCss('.copy::after{content:"";opacity:0}', 'x.css').some((p) => /at rest/.test(p)), 'never shown');
});

test('a translated id on an inner page is not a difference in structure', () => {
  const pages = site();
  pages['pt-br/commands/'] = commands('pt-br', { analyze: 'analisar' });
  pages['pt-br/'] = home('pt-br', { analyze: 'analisar' });
  assert.deepEqual(checkPages(pages), []);
});

test('a translated id on the home page, or an inner page with an id more, still differs', () => {
  const homeIds = site();
  homeIds['pt-br/'] = home('pt-br', { how: 'como' });
  homeIds['pt-br/commands/'] = commands('pt-br', { how: 'como' });
  assert.ok(checkPages(homeIds).some((p) => /differ in ids/.test(p)));

  const extra = site();
  extra['pt-br/commands/'] = commands('pt-br', { analyze: 'analisar' }).replace('<h1>', '<h1 id="topo">');
  extra['pt-br/'] = home('pt-br', { analyze: 'analisar' });
  assert.ok(checkPages(extra).some((p) => /commands\/ differ in ids/.test(p)));
});

// ---------- item 3: hreflang per page ----------

test('hreflang points at the same page in the other language, with x-default in English', () => {
  for (const [label, page, change] of [
    ['pt-BR at the home page', 'en/commands/', (h) => h.replace(`hreflang="pt-BR" href="${SITE}/pt-br/commands/"`, `hreflang="pt-BR" href="${SITE}/pt-br/"`)],
    ['en at the home page', 'pt-br/anatomy/', (h) => h.replace(`hreflang="en" href="${SITE}/en/anatomy/"`, `hreflang="en" href="${SITE}/en/"`)],
    ['no x-default', 'en/', (h) => h.replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, '')],
    ['x-default in Portuguese', 'pt-br/', (h) => h.replace(`hreflang="x-default" href="${SITE}/en/"`, `hreflang="x-default" href="${SITE}/pt-br/"`)],
  ]) {
    const pages = site();
    pages[page] = change(pages[page]);
    assert.notEqual(pages[page], site()[page], label);
    assert.ok(named(checkPages(pages), page, /hreflang/), label);
  }
});

test('Layout.astro writes the hreflang of the same page and an x-default', () => {
  const layout = read('site/src/layouts/Layout.astro');
  assert.match(layout, /hreflang="x-default"/);
  assert.doesNotMatch(layout, /new URL\('\/(en|pt-br)\/', site\)/, 'no alternate fixed at a home page');
});

// ---------- item 4: the root page ----------

test('the root page is checked for its canonical to /en/', () => {
  const pages = site();
  pages[''] = pages[''].replace(/<link rel="canonical"[^>]*>/, '');
  assert.ok(named(checkPages(pages), '', /canonical/));
});

test('the root page redirects to /en/, with no literal colour, a visible link and a canonical', () => {
  const root = read('site/src/pages/index.astro');
  assert.match(root, /http-equiv="refresh" content="0;url=\/en\/"/);
  assert.match(root, /location\.replace\('\/en\/'\)/);
  assert.match(root, /<a href="\/en\/">/);
  assert.doesNotMatch(root, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black)\b/i, 'no literal colour');
  assert.doesNotMatch(root, /-9999|style=/, 'nothing pushed off screen');
  assert.match(root, /rel="canonical"/);
  assert.match(root, /new URL\('\/en\/', Astro\.site\)/);
});

// ---------- item 1: the build runs the four checks ----------

test('npm run build runs the four checks after astro build, and assets is its own script', () => {
  const pkg = JSON.parse(read('site/package.json'));
  assert.equal(
    pkg.scripts.build,
    'astro build && node scripts/check-build.mjs && node scripts/check-pipeline.mjs && node scripts/check-home.mjs && node scripts/check-pages.mjs',
  );
  assert.equal(pkg.scripts.assets, 'node scripts/make-assets.mjs');
});
