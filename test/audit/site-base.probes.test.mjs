// Behavior probes from the independent audit of the new site, part 1 (base and hero). Each case
// states, as comments, the contract it protects, the plausible regression that breaks it and why
// the implementer's tests miss it. None needs the build or a browser.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heroGeometry } from '../../site/src/lib/flow.js';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SRC = join(ROOT, 'site', 'src');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

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

// Contract: the sections not migrated yet keep reading the old variable names as aliases of
// design-system tokens (spec, part 1), and the flow canvas reads its colours from tokens by name.
// A var() whose name is defined nowhere makes the element lose its colour or size in silence.
// Every var(--x) used under site/src without a fallback is defined in the copied design system,
// in global.css or in the file that uses it; every token the scripts read by getPropertyValue is
// defined in the design system or in global.css.
// Breaks when: the alias cleanup of part 3 removes an alias a component still reads, a component
// is migrated with a misspelt token (--ink-6, --accent-txt), or a design-system update renames a
// token the canvas reads (--ink-4), which leaves the canvas with a stale colour.
// Not covered by: site-static checks that global.css has no literal colour and that the copied
// files match their hashes; nothing checks that a name read is a name defined, and the build
// passes with an undefined custom property.
test('every CSS variable the site reads is defined: design system, global.css or the same file', () => {
  const files = walk(SRC).filter((f) => /\.(astro|css|js|ts|mjs)$/.test(f));
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
  const defined = (text) => new Set([...strip(text).matchAll(/(?:^|[\s;{"'`(])(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const shared = new Set();
  for (const f of files) {
    const rel = relative(ROOT, f);
    if (rel.startsWith('site/src/styles/')) for (const name of defined(readFileSync(f, 'utf8'))) shared.add(name);
  }
  assert.ok(shared.has('--ink') && shared.has('--accent') && shared.has('--section-gap'), 'tokens and site variables are found where they live');
  const missing = [];
  for (const f of files) {
    const rel = relative(ROOT, f);
    const text = strip(readFileSync(f, 'utf8'));
    const local = defined(text);
    for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
      if (m[2]) continue;
      if (!shared.has(m[1]) && !local.has(m[1])) missing.push(`${rel}: var(${m[1]})`);
    }
    for (const m of text.matchAll(/getPropertyValue\(\s*['"](--[\w-]+)['"]\s*\)/g)) {
      if (!shared.has(m[1])) missing.push(`${rel}: getPropertyValue('${m[1]}')`);
    }
    // The canvas reads names through a helper: v('--ink-4').
    for (const m of text.matchAll(/\bv\(\s*'(--[\w-]+)'\s*\)/g)) {
      if (!shared.has(m[1])) missing.push(`${rel}: v('${m[1]}')`);
    }
  }
  assert.deepEqual([...new Set(missing)], [], 'variables read but never defined');
});

// Contract: both languages have the same structure, and the keys of en.ts and pt-br.ts stay equal
// as a set (spec, criterion 4); every key the hero reads exists in both.
// Breaks when: a key is added to one language only (the hero gained three in this part, and the
// other parts add more), so the other page renders an empty string where the text should be.
// Not covered by: site-static pins the values of the three keys this part added; check-build
// compares ids, links, buttons and sections between the pages but not their text, and the site has
// no type checker in the build, so `t.someKey` on a missing key builds and renders nothing.
test('i18n: en.ts and pt-br.ts have the same keys, and every key the hero reads is in both', () => {
  const keys = (file) => [...read(file).matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);
  const en = keys('site/src/i18n/en.ts');
  const pt = keys('site/src/i18n/pt-br.ts');
  assert.ok(en.length > 100, 'keys are read from en.ts');
  assert.equal(new Set(en).size, en.length, 'no key repeated in en.ts');
  assert.equal(new Set(pt).size, pt.length, 'no key repeated in pt-br.ts');
  assert.deepEqual(
    { onlyEn: en.filter((k) => !pt.includes(k)), onlyPt: pt.filter((k) => !en.includes(k)) },
    { onlyEn: [], onlyPt: [] },
  );
  const used = [...read('site/src/components/Hero.astro').matchAll(/\bt\.(\w+)/g)].map((m) => m[1]);
  assert.ok(used.includes('heroFlowLabel'), 'the hero reads its keys through t.');
  for (const k of new Set(used)) assert.ok(en.includes(k) && pt.includes(k), `the hero reads t.${k}, present in both languages`);
});

// Contract: in the hero the gate, where every line becomes still, parallel and immune to the
// pointer, is the centre of the spec card (spec, part 1). The card is placed by the CSS of
// Hero.astro (left: N% with translate(-50%), and another N% under the narrow breakpoint) and the
// gate by heroGeometry() in flow.js; the two must say the same place at every width.
// Breaks when: the card is moved in the CSS (or the breakpoint changes) without the gate, or the
// gate fraction in flow.js changes without the card; the lines then settle beside the card.
// Not covered by: site-flow takes the gate from heroGeometry() itself, so moving it to 40% or 80%
// of the width passes every flow test (audit mutants G1 and G2 survived).
test('hero: the gate of the flow is the centre of the spec card at every width', () => {
  const hero = read('site/src/components/Hero.astro');
  const style = hero.slice(hero.indexOf('<style>'));
  const wide = /\.flow-spec\s*\{[^}]*?\bleft:\s*([\d.]+)%/.exec(style);
  assert.ok(wide, 'the spec card has a left position in percent');
  const narrow = /@media\s*\(max-width:\s*(\d+)px\)\s*\{\s*\.flow-spec\s*\{[^}]*?\bleft:\s*([\d.]+)%/.exec(style);
  assert.ok(narrow, 'the spec card has a narrow-screen position');
  const cardBlock = /\.flow-spec\s*\{[^}]*\}/.exec(style)[0];
  assert.match(cardBlock, /transform:\s*translate\(-50%,/, 'the card is centred on its left position');
  const breakpoint = Number(narrow[1]);
  const widePart = Number(wide[1]) / 100;
  const narrowPart = Number(narrow[2]) / 100;
  // Whole-pixel widths from a fixed generator (a CSS media query sees whole viewport pixels),
  // plus both sides of the breakpoint.
  let s = 20261116;
  const next = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const widths = [breakpoint, breakpoint + 1, ...Array.from({ length: 300 }, () => Math.round(280 + next() * 2400))];
  for (const w of widths) {
    const expected = (w <= breakpoint ? narrowPart : widePart) * w;
    assert.ok(Math.abs(heroGeometry(w).gate - expected) <= 1e-9 * w, `gate at width ${w}: ${heroGeometry(w).gate}, card centre ${expected}`);
  }
});
