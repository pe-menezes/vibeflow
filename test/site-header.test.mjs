// Checks on the site header (site/src/components/Header.astro): the language link leads to the same
// page in the other language, and the two button labels come from i18n in the page language.
// None of this needs the build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const LIB = 'site/src/lib/language-path.js';
const I18N = { en: 'site/src/i18n/en.ts', 'pt-br': 'site/src/i18n/pt-br.ts' };
const OTHER = { en: 'pt-br', 'pt-br': 'en' };

// The paths of a page, written with no language: the root of a language with and without the
// trailing slash, the two inner pages with and without it, and a deeper path.
const PAGE_PATHS = ['/', '', '/commands/', '/commands', '/anatomy/', '/anatomy', '/commands/deeper/page/'];

const loadLib = async () => {
  assert.ok(existsSync(join(root, LIB)), `${LIB} exists`);
  return import(`../${LIB}`);
};

test('the language link target is the same path in the other language, and going back returns the start', async () => {
  const { switchLanguagePath } = await loadLib();
  let cases = 0;
  for (const from of ['en', 'pt-br']) {
    const to = OTHER[from];
    for (const rest of PAGE_PATHS) {
      const start = `/${from}${rest}`;
      const target = switchLanguagePath(start, from);
      assert.equal(target, `/${to}${rest}`, `from ${start}`);
      assert.equal(switchLanguagePath(target, to), start, `back from ${target}`);
      cases++;
    }
    // A path without a language is read as a path of the page language: the target is that path
    // in the other language, and going back gives it with the page language written in.
    for (const bare of ['/commands/', '/anatomy', '/commands/deeper/page/']) {
      const target = switchLanguagePath(bare, from);
      assert.equal(target, `/${to}${bare}`, `from ${bare} on a ${from} page`);
      assert.equal(switchLanguagePath(target, to), `/${from}${bare}`, `back from ${target}`);
      cases++;
    }
    // A segment that only starts like a language is not one.
    for (const lookalike of ['/english/', '/en-us/commands/', '/pt-brx/', '/pt/']) {
      assert.equal(switchLanguagePath(lookalike, from), `/${to}${lookalike}`, `from ${lookalike} on a ${from} page`);
      cases++;
    }
  }
  assert.equal(cases, 28);
});

test('the language link of the header goes through that function, and switchPath is gone', () => {
  const header = read('site/src/components/Header.astro');
  assert.match(header, /import \{ switchLanguagePath \} from '\.\.\/lib\/language-path\.js';/);
  const link = /<a\b[^>]*\bclass="[^"]*\blang-toggle\b[^"]*"[^>]*>/.exec(header)?.[0] ?? '';
  assert.ok(link, 'the language link is there');
  assert.match(link, /\shref=\{switchLanguagePath\(Astro\.url\.pathname, lang\)\}/);
  for (const file of [...Object.values(I18N), 'site/src/components/Header.astro']) {
    assert.ok(!/\bswitchPath\b/.test(read(file)), `${file} still carries switchPath`);
  }
});

// The value of a string key in an i18n file, single-quoted as the files write them.
function i18nValue(file, key) {
  const m = new RegExp(`\\n\\s*${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(read(file));
  return m ? m[1].replace(/\\(.)/g, '$1') : undefined;
}

test('the theme and menu buttons are named from i18n, in the page language', () => {
  const header = read('site/src/components/Header.astro');
  const theme = /<button\b[^>]*\bclass="[^"]*\btheme-toggle\b[^"]*"[^>]*>/.exec(header)?.[0] ?? '';
  const menu = /<button\b[^>]*\bid="hamburger"[^>]*>/.exec(header)?.[0] ?? '';
  assert.ok(theme && menu, 'both buttons are there');
  assert.match(theme, /\saria-label=\{t\.headerThemeLabel\}/);
  assert.match(menu, /\saria-label=\{t\.headerMenuLabel\}/);
  assert.ok(!/\saria-label="/.test(header), 'no aria-label with literal text');
  for (const file of Object.values(I18N)) {
    for (const key of ['headerThemeLabel', 'headerMenuLabel']) {
      const value = i18nValue(file, key);
      assert.ok(typeof value === 'string' && value.trim() !== '', `${file} ${key} has text`);
    }
  }
  // English keeps the labels the buttons had; Portuguese says the theme one in Portuguese.
  assert.equal(i18nValue(I18N.en, 'headerThemeLabel'), 'Toggle theme');
  assert.equal(i18nValue(I18N.en, 'headerMenuLabel'), 'Menu');
  assert.notEqual(i18nValue(I18N['pt-br'], 'headerThemeLabel'), 'Toggle theme');
});

test('the two languages carry the same keys in the same order, the new ones in the header block', () => {
  const keys = (file) => [...read(file).matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(keys(I18N['pt-br']), keys(I18N.en));
  for (const file of Object.values(I18N)) {
    const text = read(file);
    const block = /\n  \/\/ Header\n([\s\S]*?)\n\n/.exec(text)?.[1] ?? '';
    for (const key of ['headerThemeLabel', 'headerMenuLabel']) {
      assert.match(block, new RegExp(`^  ${key}:`, 'm'), `${file}: ${key} sits in the header block`);
    }
  }
});
