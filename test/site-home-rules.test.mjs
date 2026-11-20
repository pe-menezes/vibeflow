// Checks on site/scripts/home-rules.mjs, the module the build checks share: the elements a script
// shows later, and the values of the keys that left the home page, looked for in raw HTML. The
// build runs these rules on the built pages (check-build.mjs, check-pages.mjs, check-home.mjs);
// here they run on values and HTML of the test's own, with no build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEFT_HOME_COMPONENTS,
  LEFT_HOME_KEYS,
  SHOWN_LATER,
  componentKeys,
  i18nEntries,
  importedComponents,
  isShownLater,
  leftHomeProblems,
  leftHomeValues,
} from '../site/scripts/home-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('home-rules.mjs imported runs nothing, says nothing and writes nothing', () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'home-rules-')));
  try {
    const scripts = join(tmp, 'site', 'scripts');
    mkdirSync(scripts, { recursive: true });
    for (const name of ['home-rules.mjs', 'loop-setup.mjs']) copyFileSync(join(root, 'site', 'scripts', name), join(scripts, name));
    const listing = () => readdirSync(tmp, { recursive: true }).sort();
    const before = listing();
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', 'const m = await import(process.argv[1]); if (typeof m.isShownLater !== "function") process.exit(2);', join(scripts, 'home-rules.mjs')], { cwd: tmp, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout + run.stderr, '');
    assert.deepEqual(listing(), before);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('an id is shown later only when SHOWN_LATER lists it as its own key, never by a name every object inherits', () => {
  for (const id of Object.keys(SHOWN_LATER)) assert.equal(isShownLater(id), true, id);
  const inherited = Object.getOwnPropertyNames(Object.prototype);
  assert.ok(inherited.includes('constructor') && inherited.includes('toString'));
  for (const id of [...inherited, '', 'form-error', undefined, null]) assert.equal(isShownLater(id), false, String(id));
});

test('i18nEntries reads strings and arrays as the i18n files write them', () => {
  const entries = i18nEntries("export default {\n  a: 'one',\n  b: 'it\\'s',\n  c: [\n    'x',\n    'y ] z',\n  ],\n  d: '',\n  e: ['p', 'q'],\n};\n");
  assert.deepEqual(entries, { a: 'one', b: "it's", c: ['x', 'y ] z'], d: '', e: ['p', 'q'] });
  for (const lang of ['en', 'pt-br']) {
    const real = i18nEntries(read(`site/src/i18n/${lang}.ts`));
    const keys = [...read(`site/src/i18n/${lang}.ts`).matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
    assert.deepEqual(Object.keys(real), keys, `${lang}: every key read`);
  }
});

test('every key that left the home page is in both languages, and every component that left is in the repository', () => {
  for (const lang of ['en', 'pt-br']) {
    const entries = i18nEntries(read(`site/src/i18n/${lang}.ts`));
    for (const key of LEFT_HOME_KEYS) assert.ok(Object.hasOwn(entries, key) && String(entries[key]).length > 0, `${lang}: ${key}`);
  }
  for (const name of LEFT_HOME_COMPONENTS) assert.ok(componentKeys(read(`site/src/components/${name}.astro`)).length > 0, name);
});

// The exclusion rule: a left value each of whose pieces at " · " is part of a kept value, compared
// with no whitespace, with backticks read as code and entities decoded, is not looked for; any other
// left value is.
test('a left value is looked for unless each of its pieces at " · " is part of a value the page keeps', () => {
  const entries = {
    gone: 'Gone for good',
    part: 'Ship it',
    spaced: 'ship   it',
    coded: 'run `npm test` now',
    list: ['first item', 'kept tail'],
    composed: 'spec · auth',
    halfComposed: 'spec · billing',
    dotted: 'spec·auth',
    entity: 'kept &amp; tail',
    keep: 'We ship it today, with the kept tail & a spec.',
    keepCode: 'Always run npm test now.',
    keepCmd: '$ gen-spec "auth"',
    empty: '   ',
  };
  const left = ['gone', 'part', 'spaced', 'coded', 'list', 'composed', 'halfComposed', 'dotted', 'entity', 'missing', 'empty'];
  const got = leftHomeValues(entries, left, ['keep', 'keepCode', 'keepCmd']);
  assert.deepEqual(got, [
    { key: 'gone', value: 'Gone for good' },
    { key: 'part', value: 'Ship it' },
    { key: 'list', value: 'first item' },
    { key: 'halfComposed', value: 'spec · billing' },
    { key: 'dotted', value: 'spec·auth' },
    { key: 'entity', value: 'kept &amp; tail' },
  ]);
  // With nothing kept, every non-empty left value is looked for.
  assert.equal(leftHomeValues(entries, left, []).length, 10);
});

test('importedComponents names the components a page source imports, and the home pages import the five sections, the header and the footer', () => {
  const src = "---\nimport Layout from '../../layouts/Layout.astro';\nimport Hero from '../../components/Hero.astro';\nimport Other from '../../components/Footer.astro';\n// import Gone from '../../components/Gone.astro';\n---\n";
  assert.deepEqual(importedComponents(src), ['Hero']);
  for (const lang of ['en', 'pt-br']) {
    assert.deepEqual(importedComponents(read(`site/src/pages/${lang}/index.astro`)), ['Header', 'Hero', 'HowItWorks', 'Loop', 'Editions', 'FinalCTA', 'Footer'], lang);
  }
});

// The forms a left value could come back in (the review of 2e367d2): in an attribute, in a JSON
// script, in a paragraph of another section, and as the content of a section that lost its id.
const VALUES = [
  { key: 'heroDescription', value: 'A long description of what it does & why' },
  { key: 'howSubtitle', value: 'Four steps, from idea to `audit`' },
  { key: 'uc1Title', value: 'Ship a feature' },
];
const page = (extra) =>
  `<!doctype html><html><head><title>Home</title></head><body><main>` +
  `<section id="hero"><h1>Title</h1><p class="hero-lede"><b>Kept call</b></p></section>` +
  `<section id="how"><h2>How</h2></section>${extra}</main></body></html>`;
const FORMS = {
  'in an attribute': page('<a href="/en/" title="A long description of what it does &amp; why">x</a>'),
  'in a single-quoted attribute': page("<div data-x='Ship a feature'></div>"),
  'in a JSON script': page('<script type="application/json">{"sub":"Four steps, from idea to audit"}</script>'),
  'in a JSON script, escaped': page('<script type="application/json">{"d":"A long description of what it does \\u0026 why"}</script>'),
  'in a paragraph of another section': page('<section id="loop"><p>Four steps, from idea to <code>audit</code></p></section>'),
  'as the use cases with no id': page('<div class="uc"><h3>Ship a feature</h3><p>More</p></div>'),
  'in a style body': page('<style>.x::after{content:"Ship a feature"}</style>'),
  'across lines and entities': page('<p>A long description\n  of what it does &#38; why</p>'),
};

test('a left value is found in the text, an attribute, a script or a style of the page, in every form', () => {
  assert.deepEqual(leftHomeProblems(page(''), VALUES), [], 'the clean page');
  for (const [name, html] of Object.entries(FORMS)) {
    assert.notDeepEqual(leftHomeProblems(html, VALUES), [], name);
  }
  assert.deepEqual(leftHomeProblems(FORMS['in a paragraph of another section'], VALUES), ['howSubtitle']);
});
