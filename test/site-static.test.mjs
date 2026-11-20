// Static checks on the site sources: copied design system and fonts match their recorded hashes,
// the old domains and the Google Fonts request are gone, nothing is hidden at rest, global.css
// carries no literal colour, the theme script honours both choices, and no machine path leaks.
// None of this needs the build; what only the built HTML can show lives in site/scripts/check-build.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const read = (p) => readFileSync(join(root, p), 'utf8');
const sha256 = (p) => createHash('sha256').update(readFileSync(join(root, p))).digest('hex');

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

// The design system files as they are at tag v3.0.0-alpha.3 of genius-design-system.
const DESIGN_SYSTEM = {
  'site/src/styles/genius/genius-tudo.css': '5e55ddcc8c2ad2b06a7997dcff208704d03020ef18038dfff579450487386399',
  'site/src/styles/genius/genius-noite.css': 'e502f5a6cde641b17edf8f8ed39b59537604bdab48ae8caf435ca4400cd38274',
  'site/src/scripts/genius/genius.js': '5ecd4937221306ba98af8bf0aaf0d1dd65e3bf74e5c9ad9764125f39ca922bdf',
};

test('design system files are copied unedited and match ORIGIN.json', () => {
  const origin = JSON.parse(read('site/src/styles/genius/ORIGIN.json'));
  assert.equal(origin.version, '3.0.0-alpha.3');
  assert.match(origin.source, /genius-design-system 3\.0\.0-alpha\.3/);
  const listed = Object.fromEntries(origin.files.map((f) => [f.path, f.sha256]));
  assert.deepEqual(Object.keys(listed).sort(), Object.keys(DESIGN_SYSTEM).sort());
  for (const [path, hash] of Object.entries(DESIGN_SYSTEM)) {
    assert.equal(listed[path], hash, `ORIGIN.json hash for ${path}`);
    assert.equal(sha256(path), hash, `content of ${path}`);
  }
});

test('fonts are self-hosted and match the table in ORIGIN.md', () => {
  const dir = 'site/public/fonts';
  const md = read(`${dir}/ORIGIN.md`);
  const rows = [...md.matchAll(/^\|\s*`([^`]+\.woff2)`\s*\|.*\|\s*`([0-9a-f]{64})`\s*\|\s*(https:\/\/\S+)\s*\|\s*$/gm)];
  const table = Object.fromEntries(rows.map((m) => [m[1], m[2]]));
  const woff2 = readdirSync(join(root, dir)).filter((f) => f.endsWith('.woff2')).sort();
  assert.equal(woff2.length, 8, 'eight woff2 files');
  assert.deepEqual(Object.keys(table).sort(), woff2, 'every woff2 is in the table, and only those');
  for (const f of woff2) assert.equal(sha256(`${dir}/${f}`), table[f], `hash of ${f}`);
  for (const f of ['OFL-Geist.txt', 'OFL-JetBrainsMono.txt', 'OFL-Newsreader.txt']) {
    assert.ok(existsSync(join(root, dir, f)), `${f} present`);
  }
});

test('the site has its real address and no old domain or Google Fonts request', () => {
  assert.match(read('site/astro.config.mjs'), /site:\s*'https:\/\/www\.vibeflow\.run'/);
  for (const file of walk(join(site, 'src'))) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(root, file);
    for (const banned of ['vibeflow.dev', 'vibeflow-two.vercel.app', 'fonts.googleapis.com', 'fonts.gstatic.com']) {
      assert.ok(!text.includes(banned), `${rel} mentions ${banned}`);
    }
  }
});

test('the layout loads the hosted fonts, preloading only Newsreader normal latin', () => {
  const layout = read('site/src/layouts/Layout.astro');
  const preloads = [...layout.matchAll(/<link[^>]*rel="preload"[^>]*>/g)].map((m) => m[0]);
  assert.equal(preloads.length, 1);
  assert.match(preloads[0], /href="\/fonts\/newsreader-latin\.woff2"/);
  assert.match(preloads[0], /as="font"/);
  assert.match(preloads[0], /crossorigin/);
  const css = read('site/src/styles/global.css');
  const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
  assert.equal(faces.length, 8, 'one @font-face per woff2');
  for (const f of faces) assert.match(f, /font-display:\s*swap/);
  assert.match(read('site/src/layouts/Layout.astro'), /data-gx-acento="violet"/);
});

test('nothing is hidden at rest: no fade-in or reveal, no opacity 0 in global.css', () => {
  const css = read('site/src/styles/global.css');
  assert.ok(!/\.fade-in|\.reveal\b/.test(css), 'global.css still styles fade-in or reveal');
  assert.ok(!/opacity\s*:\s*0(\s*[;}!]|$)/m.test(css), 'global.css sets opacity 0');
  for (const file of walk(join(site, 'src'))) {
    if (!/\.(astro|css|js|ts)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    const rel = relative(root, file);
    if (rel.includes('/genius/')) continue;
    assert.ok(!/class(=|:list=)[^>]*\b(fade-in|reveal)\b/.test(text), `${rel} uses fade-in or reveal`);
    assert.ok(!/data-reveal/.test(text), `${rel} uses data-reveal`);
  }
});

test('global.css has no literal colour', () => {
  const css = read('site/src/styles/global.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const literal = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|:\s*(white|black)\b/g;
  const found = css.match(literal);
  assert.equal(found, null, `literal colours: ${found}`);
});

// The alias block that bridged the old variable names to tokens is gone with the last section that
// read it; --section-gap, a measure of the site and not an alias, stays with the same values.
const ALIASES = [
  '--bg-primary', '--bg-secondary', '--bg-card', '--bg-card-hover', '--bg-code', '--bg-header', '--bg-header-glass',
  '--text-primary', '--text-secondary', '--text-muted',
  '--accent-light', '--accent-dark', '--accent-glow', '--accent-glow-strong', '--accent-gradient',
  '--success', '--success-light', '--danger', '--danger-light', '--warning', '--warning-light',
  '--border', '--border-light', '--border-accent',
  '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-full',
  '--font-sans', '--max-width',
];

// Every custom property declaration of a stylesheet, with the at-rules it sits in.
function declarations(css) {
  const out = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      stack.push(css.slice(start, i).trim().replace(/\s+/g, ' '));
      start = i + 1;
    } else if (ch === '}' || ch === ';') {
      const m = /^\s*(--[\w-]+)\s*:\s*([^;]*?)\s*$/.exec(css.slice(start, i));
      if (m) out.push({ name: m[1], value: m[2], at: stack.filter((p) => p.startsWith('@')) });
      if (ch === '}') stack.pop();
      start = i + 1;
    }
  }
  return out;
}

test('global.css: the alias block is gone, and no file under site/src reads an alias', () => {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = new Set();
  for (const file of walk(join(site, 'src', 'styles', 'genius'))) {
    for (const d of declarations(strip(readFileSync(file, 'utf8')))) tokens.add(d.name);
  }
  // A name the design system declares itself is a token, not an alias.
  const aliases = ALIASES.filter((name) => !tokens.has(name));
  const declared = declarations(strip(read('site/src/styles/global.css'))).map((d) => d.name);
  assert.deepEqual(aliases.filter((name) => declared.includes(name)), [], 'global.css still declares aliases');
  const reads = [];
  for (const file of walk(join(site, 'src'))) {
    if (!/\.(astro|css|js|ts|mjs)$/.test(file)) continue;
    const rel = relative(root, file);
    if (rel.includes('/genius/')) continue;
    for (const m of strip(readFileSync(file, 'utf8')).matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (aliases.includes(m[1])) reads.push(`${rel}: var(${m[1]})`);
    }
  }
  assert.deepEqual(reads, []);
});

test('global.css: --section-gap keeps its values, 2rem wide and 1.25rem under 768px', () => {
  const css = read('site/src/styles/global.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const gaps = declarations(css).filter((d) => d.name === '--section-gap');
  const wide = gaps.filter((d) => d.at.length === 0).map((d) => d.value);
  const narrow = gaps.filter((d) => d.at.join() === '@media (max-width: 768px)').map((d) => d.value);
  assert.deepEqual(wide, ['2rem']);
  assert.deepEqual(narrow, ['1.25rem']);
  assert.equal(gaps.length, 2, `--section-gap declared ${gaps.length} times`);
});

// Runs the inline theme script of the layout against a fake document.
function runThemeScript(saved, reduceMotion) {
  const layout = read('site/src/layouts/Layout.astro');
  const scripts = [...layout.matchAll(/<script is:inline>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1, 'one inline script in the head');
  const classes = new Set();
  const html = { dataset: {}, classList: { add: (c) => classes.add(c) } };
  const document = { documentElement: html };
  const localStorage = { getItem: (k) => (k === 'theme' ? saved : null) };
  const matchMedia = (q) => ({ matches: q.includes('reduce') ? reduceMotion : false });
  new Function('document', 'localStorage', 'matchMedia', 'window', scripts[0])(
    document, localStorage, matchMedia, { matchMedia, localStorage },
  );
  return { theme: html.dataset.theme, classes };
}

test('the saved theme is applied before paint in both directions, and none means the system', () => {
  assert.equal(runThemeScript('dark', false).theme, 'dark');
  assert.equal(runThemeScript('light', false).theme, 'light');
  assert.equal(runThemeScript(null, false).theme, undefined);
  assert.equal(runThemeScript('purple', false).theme, undefined);
  assert.ok(runThemeScript(null, false).classes.has('motion-ok'), 'motion class when motion is allowed');
  assert.ok(!runThemeScript(null, true).classes.has('motion-ok'), 'no motion class under reduced motion');
});

test('the theme button flips the theme the page shows', async () => {
  const { nextTheme } = await import('../site/src/lib/theme.js');
  assert.equal(nextTheme('dark', false), 'light');
  assert.equal(nextTheme('dark', true), 'light');
  assert.equal(nextTheme('light', false), 'dark');
  assert.equal(nextTheme('light', true), 'dark');
  assert.equal(nextTheme(undefined, true), 'light');
  assert.equal(nextTheme(undefined, false), 'dark');
  const header = read('site/src/components/Header.astro');
  assert.match(header, /nextTheme/);
  assert.match(header, /localStorage\.setItem\('theme'/);
  assert.ok(!/localStorage\.removeItem/.test(header), 'the choice is never erased');
});

test('the favicon is the new mark, the same path as the header logo', () => {
  const header = read('site/src/components/Header.astro');
  const favicon = read('site/public/favicon.svg');
  const d = header.match(/<path class="brand-path" d="([^"]+)"/);
  assert.ok(d, 'the header carries the mark');
  assert.ok(favicon.includes(d[1]), 'the favicon draws the same path');
});

test('the build runs the HTML checks after astro build', () => {
  const pkg = JSON.parse(read('site/package.json'));
  assert.equal(
    pkg.scripts.build,
    'astro build && node scripts/check-build.mjs && node scripts/check-pipeline.mjs && node scripts/check-home.mjs && node scripts/check-pages.mjs',
  );
  assert.ok(existsSync(join(site, 'scripts', 'check-build.mjs')));
});

// The value of a string key in an i18n file, single-quoted as the files write them.
function i18nValue(file, key) {
  const m = new RegExp(`\\n\\s*${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(read(file));
  return m ? m[1].replace(/\\(.)/g, '$1') : undefined;
}

test('the flow band notes and label have their keys in both languages', () => {
  const expected = {
    'site/src/i18n/en.ts': {
      heroFlowBefore: 'no spec',
      heroFlowAfter: 'with a spec',
      heroFlowLabel: 'Tangled lines enter from the left, pass through a spec and leave in order, up to a PASS verdict.',
    },
    'site/src/i18n/pt-br.ts': {
      heroFlowBefore: 'sem spec',
      heroFlowAfter: 'com spec',
      heroFlowLabel: 'Linhas desordenadas entram pela esquerda, passam por uma spec e saem alinhadas até o veredito PASS.',
    },
  };
  for (const [file, keys] of Object.entries(expected)) {
    for (const [key, value] of Object.entries(keys)) assert.equal(i18nValue(file, key), value, `${file} ${key}`);
  }
});

test('the hero names the flow band, shows its two notes and keeps its inside out of screen readers', () => {
  const hero = read('site/src/components/Hero.astro');
  const band = /<div class="flow-band"([^>]*)>([\s\S]*?)\n  <\/div>/.exec(hero);
  assert.ok(band, 'the flow band is there');
  assert.match(band[1], /\srole="img"/);
  assert.match(band[1], /\saria-label=\{t\.heroFlowLabel\}/);
  assert.doesNotMatch(band[1], /aria-hidden/, 'the band itself is read');
  assert.match(band[2], /flow-note--before[^>]*>\{t\.heroFlowBefore\}</);
  assert.match(band[2], /flow-note--after[^>]*>\{t\.heroFlowAfter\}</);
  // Every direct child of the band is hidden from screen readers.
  const children = [...band[2].matchAll(/\n    <(\w+)([^>]*)>/g)];
  assert.ok(children.length >= 5, 'canvas, two notes, spec card and verdict');
  for (const [, tag, attrs] of children) assert.match(attrs, /aria-hidden="true"/, `<${tag}${attrs}>`);
});

test('the hero call shows the subtitle alone, without the description', () => {
  const hero = read('site/src/components/Hero.astro');
  const side = /<div class="hero-side[^>]*>([\s\S]*?)<div class="hero-actions">/.exec(hero)?.[1] ?? '';
  assert.equal(side.split('{t.heroSubtitle}').length, 2, 'heroSubtitle is shown, once');
  assert.ok(!/\bt\.heroDescription\b/.test(hero), 'heroDescription is not shown');
  assert.equal(side.split('{t.').length, 2, 'nothing else in the call');
});

test('no machine path in the files of this part', () => {
  const needle = ['', 'Users', ''].join('/');
  const files = [
    'site/astro.config.mjs',
    'site/package.json',
    'site/src/layouts/Layout.astro',
    'site/src/components/Header.astro',
    'site/src/components/Hero.astro',
    'site/src/components/Footer.astro',
    'site/src/styles/global.css',
    'site/public/favicon.svg',
    'site/scripts/check-build.mjs',
    ...walk(join(site, 'src', 'styles', 'genius')).map((f) => relative(root, f)),
    ...walk(join(site, 'src', 'scripts', 'genius')).map((f) => relative(root, f)),
    ...walk(join(site, 'src', 'lib')).map((f) => relative(root, f)),
    ...walk(join(site, 'public', 'fonts')).map((f) => relative(root, f)).filter((f) => !f.endsWith('.woff2')),
    ...readdirSync(join(root, 'test')).filter((f) => /^site-.*\.test\.mjs$/.test(f)).map((f) => `test/${f}`),
  ];
  for (const f of files) {
    assert.ok(existsSync(join(root, f)), `${f} exists`);
    assert.ok(!read(f).includes(needle), `${f} carries a machine path`);
  }
});
