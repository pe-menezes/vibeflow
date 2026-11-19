// Integration of the new site: the build runs every HTML check, and check-build.mjs proves the
// three checks the part 1 audit asked for (anchors with a target, nothing hidden at rest in the
// markup, one h1 per page), the per-page hreflang and the root page's canonical.
//
// The checks run on HTML in memory, no build: a small site that passes is built here, and each
// broken case is generated as the product of the forms and the ways to break them, so no case is
// picked by hand. The real built site is checked by `npm run build`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
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
    `<nav class="mobile-menu" id="mobile-menu"><a href="/${lang}/#${how}">How</a></nav>` +
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

// ---------- the header navigation on a narrow screen without JavaScript ----------

test('the phone menu back to what it was, hidden in the markup, fails the check', () => {
  for (const page of ['en/', 'pt-br/']) {
    const pages = site();
    pages[page] = pages[page].replace('id="mobile-menu"', 'id="mobile-menu" hidden');
    assert.ok(named(checkPages(pages), page, /mobile-menu.*hidden attribute at rest/), page);
  }
});

// The display of an element of the header, from the header's own rules, on a narrow or wide
// screen, with or without the class the head script adds before the first paint, menu open or not.
// Rules apply in source order; the ones this header writes never rely on specificity to win.
function headerRules() {
  const style = /<style>([\s\S]*?)<\/style>/.exec(read('site/src/components/Header.astro'))[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const stack = [];
  let buf = '';
  for (const ch of style) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      const selector = stack.pop();
      if (buf.trim()) rules.push({ selector, body: buf.trim(), at: [...stack] });
      buf = '';
    } else buf += ch;
  }
  return rules;
}
function displayOf(classes, { narrow, js, open }) {
  let display = null;
  for (const { selector, body, at } of headerRules()) {
    if (at.some((a) => a !== '@media (max-width: 859px)')) continue;
    if (at.length && !narrow) continue;
    const value = /(?:^|;)\s*display\s*:\s*([^;]+)/.exec(body)?.[1]?.trim();
    if (!value) continue;
    for (const raw of selector.split(',').map((s) => s.trim())) {
      let part = raw.replace(/:global\(([^()]*(?:\([^()]*\))?[^()]*)\)/g, '$1');
      if (part.startsWith('html.js ')) {
        if (!js) continue;
        part = part.slice('html.js '.length);
      }
      if (part.endsWith(':not([data-open])')) {
        if (open) continue;
        part = part.slice(0, -':not([data-open])'.length);
      }
      if (classes.includes(part)) display = value;
    }
  }
  return display;
}
const MENU = ['.mobile-menu'];
const BUTTON = ['.hamburger', '.mobile-only'];
const WIDE_NAV = ['.nav', '.desktop-only'];

test('narrow screen without JavaScript: the phone menu is in view and the menu button, which needs a script, is not', () => {
  assert.notEqual(displayOf(MENU, { narrow: true, js: false, open: false }) ?? 'block', 'none');
  assert.equal(displayOf(BUTTON, { narrow: true, js: false, open: false }), 'none');
  assert.equal(displayOf(WIDE_NAV, { narrow: true, js: false, open: false }), 'none');
});

test('narrow screen with JavaScript: the menu is closed at load, the button shows, and opening shows the menu', () => {
  assert.equal(displayOf(MENU, { narrow: true, js: true, open: false }), 'none');
  assert.notEqual(displayOf(BUTTON, { narrow: true, js: true, open: false }) ?? 'none', 'none');
  assert.notEqual(displayOf(MENU, { narrow: true, js: true, open: true }) ?? 'block', 'none');
});

test('wide screen: the wide navigation shows and the phone menu does not, with or without JavaScript', () => {
  for (const js of [false, true]) {
    for (const open of [false, true]) {
      assert.equal(displayOf(MENU, { narrow: false, js, open }), 'none', `js ${js}, open ${open}`);
      assert.notEqual(displayOf(WIDE_NAV, { narrow: false, js, open }) ?? 'block', 'none');
      assert.equal(displayOf(BUTTON, { narrow: false, js, open }), 'none');
    }
  }
});

test('the phone menu ships open in the markup with the four links, and the class that closes it is set before the first paint', () => {
  const header = read('site/src/components/Header.astro');
  const menu = /<nav class="mobile-menu[^"]*" id="mobile-menu"([^>]*)>([\s\S]*?)<\/nav>/.exec(header);
  assert.ok(menu, 'the phone menu is in the header');
  assert.ok(!/\shidden\b/.test(menu[1]), 'the phone menu has no hidden attribute');
  for (const key of ['navHow', 'navCommands', 'navAnatomy', 'navInstall']) assert.ok(menu[2].includes(`{t.${key}}`), key);
  // The script toggles data-open, never the hidden attribute.
  const script = /<script>([\s\S]*?)<\/script>/.exec(header)[1];
  assert.ok(/toggleAttribute\('data-open'/.test(script), 'the menu button toggles data-open');
  assert.ok(!/\.hidden\s*=/.test(script), 'the script does not set hidden');
  const inline = /<script is:inline>([\s\S]*?)<\/script>/.exec(read('site/src/layouts/Layout.astro'))[1];
  assert.ok(/classList\.add\('js'\)/.test(inline), 'the head script marks the page as running JavaScript');
});

test('check-build no longer lists the phone menu among the elements shown later', () => {
  assert.ok(!/'mobile-menu'\s*:/.test(read('site/scripts/check-build.mjs')));
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

// Each selector of a list is judged on its own: a rule fails when any selector that hides text sits
// outside the motion gate, whatever the other selectors of the list are.
const GATE_SELECTORS = { gated: 'html.motion-ok .lede', 'gated by play': '.gx-tocando .lede', open: '.hero' };
const HIDES = {
  'opacity 0': '{opacity:0}',
  'opacity 0%': '{opacity:0%}',
  'visibility hidden': '{visibility:hidden}',
  'visibility collapse': '{visibility:collapse}',
  'a keyframe that starts hidden': '{animation:rise .4s both}',
};
const KEYFRAMES = '@keyframes rise{from{opacity:0}to{opacity:1}}';

test('a selector list passes only when every selector that hides sits under the gate', () => {
  const names = Object.keys(GATE_SELECTORS);
  const lists = names.flatMap((a) => names.flatMap((b) => [[a], [a, b], [b, a, a]]));
  const failures = [];
  for (const list of lists) {
    for (const [how, decl] of Object.entries(HIDES)) {
      const selector = list.map((n) => GATE_SELECTORS[n]).join(', ');
      const css = `${KEYFRAMES}${selector}${decl}`;
      const flagged = checkCss(css, 'x.css').length > 0;
      const shouldFlag = list.includes('open');
      if (flagged !== shouldFlag) failures.push(`${selector} ${how}: ${flagged ? 'fails' : 'passes'}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('a comma inside a selector function does not split the list', () => {
  assert.deepEqual(checkCss('html.motion-ok :is(.a, .b){opacity:0}', 'x.css'), []);
  assert.ok(checkCss(':is(.a, .b), html.motion-ok .c{opacity:0}', 'x.css').length > 0);
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

// ---------- second review: the shape of a selector list ----------

// Each shape a list of selectors can take, with the commas a selector may carry inside quotes or
// brackets. A rule fails when any selector that hides sits outside the gate, whatever the shape.
const LIST_SHAPES = {
  'at the top': (s) => s.join(', '),
  'inside :is()': (s) => `:is(${s.join(', ')})`,
  'inside :where()': (s) => `:where(${s.join(', ')})`,
  nested: (s) => `:is(${s[0]}${s.length > 1 ? `, :where(${s.slice(1).join(', ')})` : ''})`,
};
const COMMAS = {
  'no comma': '',
  'comma in quotes': '[data-label="a,b"]',
  'comma in single quotes': "[data-label='a,b']",
  'comma in brackets': '[data-label=a\\,b]',
};
const LIST_GATES = { under: 'html.motion-ok .lede', out: '.hero' };
const LIST_HIDES = { 'opacity 0': '{opacity:0}', 'visibility hidden': '{visibility:hidden}', 'a keyframe that starts hidden': '{animation:rise .4s both}' };

test('a selector list is judged the same at the top, inside :is() or :where(), nested, and with commas in quotes or brackets', () => {
  const lists = [['under'], ['out'], ['under', 'under'], ['under', 'out'], ['out', 'under'], ['out', 'out']];
  const failures = [];
  for (const [shape, join] of Object.entries(LIST_SHAPES)) {
    for (const [comma, extra] of Object.entries(COMMAS)) {
      for (const list of lists) {
        for (const [how, decl] of Object.entries(LIST_HIDES)) {
          const selector = join(list.map((g) => `${LIST_GATES[g]}${extra}`));
          const flagged = checkCss(`${KEYFRAMES}${selector}${decl}`, 'x.css').length > 0;
          const shouldFlag = list.includes('out');
          if (flagged !== shouldFlag) failures.push(`${shape}, ${comma}, ${list}, ${how}: ${selector} ${flagged ? 'fails' : 'passes'}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

// Only a selector that requires html.motion-ok (or the play class) is gated; a negation is no gate.
const GATE_FORMS = {
  'html.motion-ok': { selector: 'html.motion-ok .x', gated: true },
  'html.motion-ok with a negation elsewhere': { selector: 'html.motion-ok .x:not(.y)', gated: true },
  '.gx-tocando': { selector: '.gx-tocando .x', gated: true },
  'loose .motion-ok': { selector: '.motion-ok .x', gated: false },
  'html:not(.motion-ok)': { selector: 'html:not(.motion-ok) .x', gated: false },
  ':not(.motion-ok) in the middle': { selector: 'html .wrap:not(.motion-ok) .x', gated: false },
  ':not(.gx-tocando)': { selector: ':not(.gx-tocando) .x', gated: false },
  'motion-ok in an attribute value': { selector: 'html[data-x=".motion-ok"] .x', gated: false },
};

test('only a selector that requires html.motion-ok counts as the motion gate', () => {
  const failures = [];
  for (const [form, { selector, gated }] of Object.entries(GATE_FORMS)) {
    for (const [how, decl] of Object.entries(LIST_HIDES)) {
      const flagged = checkCss(`${KEYFRAMES}${selector}${decl}`, 'x.css').length > 0;
      if (flagged === gated) failures.push(`${form}, ${how}: ${selector} ${flagged ? 'fails' : 'passes'}`);
    }
  }
  assert.deepEqual(failures, []);
});

// ---------- second review: a pseudo-element is decoration only when no rule gives it text ----------

const CONTENT_PLACES = {
  'in the same rule': (c) => `.x.tip::after{content:${c};opacity:0}`,
  'in a broader selector': (c) => `.x::after{content:${c}}.x.tip::after{opacity:0}`,
  'in a broader selector, single-colon form': (c) => `.x:after{content:${c}}.x.tip:after{opacity:0}`,
  nowhere: () => '.x.tip::after{opacity:0}',
};
const CONTENTS = { text: '"help"', empty: '""' };

test('a pseudo-element at opacity 0 passes only when it draws no text in any rule and a hover shows it', () => {
  const failures = [];
  for (const [place, rules] of Object.entries(CONTENT_PLACES)) {
    for (const [kind, c] of Object.entries(CONTENTS)) {
      for (const hover of [true, false]) {
        const css = rules(c) + (hover ? '.x.tip:hover::after{opacity:1}' : '');
        const flagged = checkCss(css, 'x.css').some((p) => /at rest/.test(p));
        const shouldFlag = !hover || (place !== 'nowhere' && kind === 'text');
        if (flagged !== shouldFlag) failures.push(`${place}, ${kind}, hover ${hover}: ${css} ${flagged ? 'fails' : 'passes'}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

// ---------- second review: every form of link to the site has its anchor checked ----------

// Each form of link: the page it sits on, its href for a fragment, and whether it is the site's.
const HREF_FORMS = [
  { form: '#x', page: 'commands/', id: 'analyze', href: (l, f) => `#${f}` },
  { form: '/<lang>/#x', page: 'commands/', id: 'how', href: (l, f) => `/${l}/#${f}` },
  { form: '/<lang>/<page>#x', page: '', id: 'analyze', href: (l, f) => `/${l}/commands#${f}` },
  { form: '/<lang>/?q#x', page: 'commands/', id: 'how', href: (l, f) => `/${l}/?q=x#${f}` },
  { form: '/<lang>/<page>?q#x', page: '', id: 'analyze', href: (l, f) => `/${l}/commands/?q=x#${f}` },
  { form: 'absolute /<lang>/#x', page: 'commands/', id: 'how', href: (l, f) => `${SITE}/${l}/#${f}` },
  { form: 'absolute /<lang>/<page>#x', page: '', id: 'analyze', href: (l, f) => `${SITE}/${l}/commands#${f}` },
  { form: 'external', page: '', id: 'how', external: true, href: (l, f) => `https://example.com/#${f}` },
];
const TARGET_STATES = { exists: (id) => id, missing: (id) => `${id}-x`, 'does not decode': () => '100%' };

for (const f of HREF_FORMS) {
  for (const [state, frag] of Object.entries(TARGET_STATES)) {
    test(`link ${f.form}, target ${state}: ${f.external || state === 'exists' ? 'passes' : 'fails and names the page'}`, () => {
      const pages = site();
      for (const l of ['en', 'pt-br']) {
        pages[`${l}/${f.page}`] = pages[`${l}/${f.page}`].replace('</body>', `<a href="${f.href(l, frag(f.id))}">Link</a></body>`);
      }
      let problems;
      assert.doesNotThrow(() => { problems = checkPages(pages); });
      if (f.external || state === 'exists') assert.deepEqual(problems, []);
      else assert.ok(named(problems, `en/${f.page}`, state === 'missing' ? /no target/ : /does not decode/), problems.join('\n'));
    });
  }
}

// ---------- third review: selectors read by a parser, not by a pattern ----------

// Each writing of the motion gate: the class on html, or inside :is() with an attribute of each
// operator, whose `~`, `|`, `^`, `$` and `*` are not combinators.
const ATTR_OPS = ['~=', '|=', '^=', '$=', '*='];
const UNDER = {
  'html.motion-ok': 'html.motion-ok .lede',
  ...Object.fromEntries(ATTR_OPS.map((op) => [`html:is(.motion-ok[data-state${op}"on"])`, `html:is(.motion-ok[data-state${op}"on"]) .lede`])),
};
const OUT = '.hero';
const NEGATED = 'html:not(.motion-ok) .lede';
// What each selector of the list carries besides the gate: commas in quotes or brackets, a
// negation with a space inside, an attribute of each operator with a space in its value.
const DECORATIONS = {
  none: '',
  'comma in quotes': '[data-label="a,b"]',
  'comma in brackets': '[data-label=a\\,b]',
  ':not(.a .b)': ':not(.a .b)',
  ...Object.fromEntries(ATTR_OPS.map((op) => [`attribute ${op}`, `[data-k${op}"a b"]`])),
};
// The gate of each selector of a list: all under it, one out, all out, or the gate negated.
const GATE_LISTS = {
  'all under': ['under', 'under'],
  'one out': ['under', 'out'],
  'all out': ['out', 'out'],
  'gate negated': ['negated'],
  'one under, one negated': ['under', 'negated'],
};

test('the parser judges every shape of list, every decoration and every writing of the gate the same way', () => {
  const failures = [];
  let cases = 0;
  for (const [shape, join] of Object.entries(LIST_SHAPES)) {
    for (const [decoration, extra] of Object.entries(DECORATIONS)) {
      for (const [writing, under] of Object.entries(UNDER)) {
        for (const [gates, list] of Object.entries(GATE_LISTS)) {
          const selectors = list.map((g) => `${g === 'under' ? under : g === 'out' ? OUT : NEGATED}${extra}`);
          for (const [how, decl] of Object.entries(LIST_HIDES)) {
            cases += 1;
            const selector = join(selectors);
            const flagged = checkCss(`${KEYFRAMES}${selector}${decl}`, 'x.css').length > 0;
            const shouldFlag = list.some((g) => g !== 'under');
            if (flagged !== shouldFlag) failures.push(`${shape}, ${decoration}, ${writing}, ${gates}, ${how}: ${selector} ${flagged ? 'fails' : 'passes'}`);
          }
        }
      }
    }
  }
  assert.ok(cases > 3000, `${cases} cases`);
  assert.deepEqual(failures.slice(0, 20), [], `${failures.length} of ${cases} cases judged wrong`);
});

test('a pseudo-element given text by a broader rule fails whatever the hiding rule carries, a space inside :not() included', () => {
  const failures = [];
  for (const [decoration, extra] of Object.entries(DECORATIONS)) {
    for (const [place, rules] of Object.entries({
      'same rule': (d) => `.x.tip${d}::after{content:"help";opacity:0}`,
      'broader rule': (d) => `.x::after{content:"help"}.x.tip${d}::after{opacity:0}`,
      'broader rule, single colon': (d) => `.x:after{content:"help"}.x.tip${d}:after{opacity:0}`,
    })) {
      const css = `${rules(extra)}.x.tip${extra}:hover::after{opacity:1}`;
      if (!checkCss(css, 'x.css').some((p) => /at rest/.test(p))) failures.push(`${decoration}, ${place}: ${css} passes`);
    }
    // The same rules with no text anywhere stay decoration shown on hover.
    const empty = `.x::after{content:""}.x.tip${extra}::after{opacity:0}.x.tip${extra}:hover::after{opacity:1}`;
    if (checkCss(empty, 'x.css').length) failures.push(`${decoration}, no text: ${empty} fails`);
  }
  assert.deepEqual(failures, []);
});

// Each spelling of a link to the site, by its host and not by the text it starts with, and an
// external host that is never checked. `page` is where the link sits and `target` the page with the
// id it names.
const HOST_FORMS = [
  { form: 'https://www.vibeflow.run/<lang>/#x', page: 'commands/', target: '', id: 'how', href: (l, f) => `https://www.vibeflow.run/${l}/#${f}` },
  { form: 'with :443', page: 'commands/', target: '', id: 'how', href: (l, f) => `https://www.vibeflow.run:443/${l}/#${f}` },
  { form: 'in capitals', page: 'commands/', target: '', id: 'how', href: (l, f) => `HTTPS://WWW.VIBEFLOW.RUN/${l}/#${f}` },
  { form: 'without www', page: '', target: 'commands/', id: 'analyze', href: (l, f) => `https://vibeflow.run/${l}/commands#${f}` },
  { form: '? right after the host', page: 'commands/', target: 'root', id: 'main', href: (l, f) => `https://www.vibeflow.run?x=1#${f}` },
  { form: 'relative', page: '', target: 'commands/', id: 'analyze', href: (l, f) => `commands/#${f}` },
  { form: 'another host', page: '', target: 'commands/', id: 'analyze', external: true, href: (l, f) => `https://vibeflow.example.com/${l}/commands#${f}` },
];

for (const f of HOST_FORMS) {
  for (const [state, frag] of Object.entries({ exists: (id) => id, missing: (id) => `${id}-x` })) {
    test(`site link ${f.form}, target ${state}: ${f.external || state === 'exists' ? 'passes' : 'fails and names the page'}`, () => {
      const pages = site();
      pages[''] = pages[''].replace('<main>', '<main id="main">');
      for (const l of ['en', 'pt-br']) {
        pages[`${l}/${f.page}`] = pages[`${l}/${f.page}`].replace('</body>', `<a href="${f.href(l, frag(f.id))}">Link</a></body>`);
      }
      const problems = checkPages(pages);
      if (f.external || state === 'exists') assert.deepEqual(problems, []);
      else assert.ok(named(problems, `en/${f.page}`, /no target/), problems.join('\n'));
    });
  }
}

test('check-build says in its header that it is an alarm, that the proof is npm run measure, and the limits left', () => {
  const header = read('site/scripts/check-build.mjs').split('\nimport ')[0];
  assert.match(header, /alarm/i);
  assert.match(header, /npm run measure/);
  assert.match(header, /same element/i, 'two selectors that fall on the same element');
  assert.match(header, /never (apply|hold|match) together/i, 'two selectors that never apply together');
  assert.match(header, /nested/i, 'nested CSS is not read in full');
  assert.match(header, /before a nested rule/i, 'a declaration written before a nested rule is lost');
  for (const spelling of [/trailing dot/i, /percent/i, /without (the )?slashes/i, /protocol-relative/i]) {
    assert.match(header, spelling, `the rare spelling of the site address: ${spelling}`);
  }
});

// ---------- second review: translated ids read only on the Portuguese page ----------

// An inner page with the given ids, in-page links in the given order, and the home page's link to
// its first id.
function innerSite(enIds, ptIds, ptLinks = ptIds) {
  const page = (lang, ids, order) =>
    `<!doctype html><html lang="${lang}">${head(`${lang}/commands/`)}<body><h1>Commands</h1><nav>` +
    order.map((id) => `<a href="#${id}">${id}</a>`).join('') + '</nav>' +
    ids.map((id) => `<article id="${id}"><p>Text</p></article>`).join('') + '</body></html>';
  const pages = site();
  pages['en/commands/'] = page('en', enIds, enIds);
  pages['pt-br/commands/'] = page('pt-br', ptIds, ptLinks);
  pages['en/'] = home('en', { analyze: enIds[0] });
  pages['pt-br/'] = home('pt-br', { analyze: ptIds[0] });
  return pages;
}
const ID_SEQUENCES = ['a', 'b', 'c'].flatMap((x) => ['a', 'b', 'c'].filter((y) => y !== x).map((y) => [x, y]));

test('every pair of translated id sequences on an inner page passes, and links in another order still differ', () => {
  const failures = [];
  for (const en of ID_SEQUENCES) {
    for (const pt of ID_SEQUENCES) {
      const same = checkPages(innerSite(en, pt));
      if (same.length) failures.push(`[${en}] and [${pt}]: ${same.join('; ')}`);
      const swapped = checkPages(innerSite(en, pt, [...pt].reverse()));
      if (!swapped.some((p) => /commands\/ differ in links/.test(p))) failures.push(`[${en}] and [${pt}] with links swapped: passes`);
    }
  }
  assert.deepEqual(failures, []);
});

// ---------- audit A1: each check runs as a program by its real path and through a link ----------

const CHECKS = ['check-build.mjs', 'check-pipeline.mjs', 'check-home.mjs', 'check-pages.mjs'];
// The modules of site/scripts the checks import.
const HELPERS = readdirSync(join(ROOT, 'site', 'scripts')).filter((n) => n.endsWith('.mjs') && !CHECKS.includes(n) && CHECKS.some((c) => read(`site/scripts/${c}`).includes(`./${n}'`)));

test('each check run through a symbolic link checks the same as by its real path, on an output with no pages', () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'site-checks-')));
  try {
    mkdirSync(join(tmp, 'real', 'site', 'scripts'), { recursive: true });
    mkdirSync(join(tmp, 'real', 'site', 'dist'));
    symlinkSync(join(tmp, 'real'), join(tmp, 'alias'));
    for (const helper of HELPERS) copyFileSync(join(ROOT, 'site', 'scripts', helper), join(tmp, 'real', 'site', 'scripts', helper));
    for (const name of CHECKS) {
      copyFileSync(join(ROOT, 'site', 'scripts', name), join(tmp, 'real', 'site', 'scripts', name));
      symlinkSync(join(tmp, 'real', 'site', 'scripts', name), join(tmp, `link-${name}`));
      for (const path of [join(tmp, 'real', 'site', 'scripts', name), join(tmp, `link-${name}`), join(tmp, 'alias', 'site', 'scripts', name)]) {
        const run = spawnSync(process.execPath, [path], { encoding: 'utf8' });
        assert.notEqual(run.status, 0, `${name} by ${path.slice(tmp.length)} exits with 0 on an output with no pages`);
        assert.ok(run.stderr.length > 0, `${name} by ${path.slice(tmp.length)} says nothing`);
        assert.doesNotMatch(run.stderr, /ERR_MODULE_NOT_FOUND|Cannot find module/, `${name} by ${path.slice(tmp.length)} fails to load, not to check`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('check-build run through a symbolic link checks the real output the same as by its real path', () => {
  const real = join(ROOT, 'site', 'scripts', 'check-build.mjs');
  if (!existsSync(join(ROOT, 'site', 'dist'))) return;
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'site-checks-')));
  try {
    symlinkSync(real, join(tmp, 'check-build.mjs'));
    const byReal = spawnSync(process.execPath, [real], { encoding: 'utf8' });
    const byLink = spawnSync(process.execPath, [join(tmp, 'check-build.mjs')], { encoding: 'utf8' });
    assert.equal(byLink.status, byReal.status);
    assert.equal(byLink.stdout + byLink.stderr, byReal.stdout + byReal.stderr);
    assert.ok((byReal.stdout + byReal.stderr).length > 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
