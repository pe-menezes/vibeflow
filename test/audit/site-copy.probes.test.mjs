// Audit probes for the home page copy work (the approved texts, the loop link sentence, the three
// answers above the edition rows). They read the sources only, with no build, bind to content and
// not to line numbers, and quote no sentence of the site: they check how a value is rendered, not
// what it says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const component = (name) => read(`site/src/components/${name}.astro`);
const template = (src) =>
  src.replace(/^---[\s\S]*?\n---\n/, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const styles = (src) => [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');

// The i18n files evaluated as the module they are: `export default { ... } as const;`.
function i18n(lang) {
  const src = read(`site/src/i18n/${lang}.ts`);
  assert.match(src, /^export default \{/m, `${lang}.ts opens with export default`);
  assert.match(src, /\} as const;\s*$/, `${lang}.ts closes with as const`);
  return new Function(src.replace(/^export default /m, 'return ').replace(/\} as const;\s*$/, '};'))();
}
const LANGS = ['en', 'pt-br'];
const values = (v) => (Array.isArray(v) ? v : [v]);

// Contract: spec decision 3 and criterion 5, the new block uses the tokens the section already uses,
// with no literal colour. Since the contained home page the answers and notes live in their own
// block on the commands page (EditionsAnswers), which the probe reads as well. Regression: a hex, rgb(), hsl() or named black/white colour in a rule of
// the editions or the loop component (an audit mutant set `color: #333` on the answer titles and the
// whole site suite passed). Why the executor's test misses it: the reading test checks sizes only,
// and the literal colour test of site-static reads global.css, not the components.
test('the editions and loop components style with tokens, no literal colour', () => {
  const literal = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|:\s*(white|black)\b/;
  for (const name of ['Editions', 'Loop', 'EditionsAnswers']) {
    const css = styles(component(name));
    assert.ok(css.trim(), `${name} has a style block`);
    const found = literal.exec(css);
    assert.equal(found, null, `${name}: a literal colour in its styles: ${found?.[0]}`);
  }
});

// Contract: the briefing and spec change 3, a span between backticks reaches the reader as code and
// no backtick reaches the screen; InlineCode turns every second piece between backticks into code.
// Regression: a value with one backtick of a pair lost (an edit of an approved text, a bad escape):
// InlineCode then sets the rest of the sentence as code, with no backtick left to show it. Why the
// executor's test misses it: the tests pin keys and markup, never values (spec decision 5), and the
// build check compares with backticks squashed away.
test('every i18n value pairs its backticks, in both languages', () => {
  for (const lang of LANGS) {
    const t = i18n(lang);
    for (const [key, v] of Object.entries(t)) {
      for (const s of values(v)) {
        if (typeof s !== 'string') continue;
        assert.equal((s.split('`').length - 1) % 2, 0, `${lang}.${key}: an odd number of backticks`);
      }
    }
  }
});

// Contract: no backtick on screen. A key rendered as plain text, outside InlineCode, shows its
// backticks as they are. Regression: a code span added to one of the three answer titles or to the
// loop link sentence (or any other text the editions, answers and loop components print as is), which then
// reaches the page with its backticks. Why the executor's test misses it: it pins that the titles
// and the link render `{t.key}` as plain text, and nothing reads what those values hold; the build
// check squashes backticks away before it compares.
test('the editions, answers and loop components print as plain text only values with no backtick', () => {
  const plainKeys = new Set();
  for (const name of ['Editions', 'Loop', 'EditionsAnswers']) {
    const markup = template(component(name));
    // `{t.key}` as element content: not an attribute value (`=` before it) and not InlineCode's text.
    for (const m of markup.matchAll(/(.)\{t\.(\w+)\}/g)) if (m[1] !== '=') plainKeys.add(m[2]);
  }
  // The loop's one link is the one to the details since the contained home page (loopSetupLink left).
  assert.ok(plainKeys.has('loopMore'), 'the loop link sentence is printed as plain text');
  assert.ok(plainKeys.has('editionsTagline'), 'the editions subtitle is printed as plain text');
  for (const k of ['editionsCostTitle', 'editionsCodeTitle', 'editionsFirstTitle']) assert.ok(plainKeys.has(k), `${k} is printed as plain text`);
  for (const lang of LANGS) {
    const t = i18n(lang);
    for (const key of plainKeys) {
      assert.ok(key in t, `${lang}.${key} exists`);
      for (const s of values(t[key])) assert.ok(!String(s).includes('`'), `${lang}.${key}: printed as plain text with a backtick in it`);
    }
  }
});
