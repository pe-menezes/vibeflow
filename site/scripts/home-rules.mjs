// What the build checks share about the elements a script shows later and about the text that left
// the home page. A module of constants and pure functions: importing it runs nothing, reads nothing
// and writes nothing. check-build.mjs and check-pages.mjs ask isShownLater; check-home.mjs reads the
// i18n files, the components and the built home pages, and runs leftHomeValues and leftHomeProblems
// on them, with the keys of the components the home page imports as the kept ones; a test runs them
// on values and HTML of its own.
//
// leftHomeProblems holds that no value of a key that left the home page is anywhere in the raw HTML
// of the page: in the text, in an attribute value, or in a <script> or <style> body (with JSON
// escapes read), entities decoded, compared with no whitespace and with backticks read as code.
//
// What it does not decide:
// * a value is excluded when the page keeps it: when each of its pieces at " · " is, compared the
//   same way, a part of a value of a key the home page still reads (leftHomeValues). The hero splits
//   kept values at " · " and joins pieces with it (the spec card label and list, the verdict note),
//   so such a value can be on the page by composition. An excluded value can come back in any place
//   and pass;
// * it compares whole values: a value cut in two, reworded or translated passes;
// * it reads the HTML as text with regular expressions, so it does not see what a browser would
//   hide, and a value split across two places (half in an attribute, half in the text) passes.
import { decode, shown, tight } from './loop-setup.mjs';

// Elements that carry the hidden attribute in the HTML because a script shows them later, by id.
// The phone menu is not one: it ships open, so the navigation works without a script, and only a
// page running JavaScript closes it, by a class the head script sets before the first paint.
export const SHOWN_LATER = Object.freeze({
  'form-success': 'the contact form success message, shown after the form is sent',
});

// Whether an id is one SHOWN_LATER lists. Its own keys only: a name every object inherits
// (`constructor`, `toString`, `__proto__`) is not listed.
export const isShownLater = (id) => typeof id === 'string' && Object.hasOwn(SHOWN_LATER, id);

// The keys whose values the contained home page no longer shows (spec, change 1): the hero chip and
// long description, the pipeline subtitle and extra commands, the loop's link to its lists, the
// editions subtitle, the description of each agent, the three answers and the three notes.
export const LEFT_HOME_KEYS = Object.freeze([
  'heroNotice', 'heroDescription',
  'howSubtitle', 'pipelineExtra', 'pipelineExtraList',
  'loopSetupLink',
  'editionsSubtitle2',
  'codexDesc', 'hermesDesc', 'claudeDesc', 'cursorDesc', 'copilotDesc', 'opencodeDesc',
  'editionsCostTitle', 'editionsCostBody', 'editionsCodeTitle', 'editionsCodeBody', 'editionsFirstTitle', 'editionsFirstBody',
  'editionsLoopKit', 'editionsHermesScan', 'editionsGitDisclaimer',
]);
// The sections that left the home page: every key their components read left with them.
export const LEFT_HOME_COMPONENTS = Object.freeze(['LiveDemo', 'UseCases', 'Features', 'ContactForm']);

// The i18n keys a component source reads as `t.<key>`, outside its <script> blocks, sorted.
export const componentKeys = (source) =>
  [...new Set([...source.replace(/<script[\s\S]*?<\/script>/g, '').matchAll(/\bt\.(\w+)/g)].map((m) => m[1]))].sort();

// The components a page source imports, by name, in the order it imports them.
export const importedComponents = (source) =>
  [...source.matchAll(/^import\s+(\w+)\s+from\s+'[^']*\/components\/(\w+)\.astro';/gm)].filter((m) => m[1] === m[2]).map((m) => m[2]);

const unescapeTs = (s) => s.replace(/\\(.)/g, '$1');
// The values of an i18n file's text, as the files write them: `key: '...'` or `key: ['...', ...]`,
// the array on one line or on many.
export function i18nEntries(text) {
  const out = {};
  for (const m of text.matchAll(/^\s{2}(\w+):\s*(?:'((?:[^'\\]|\\.)*)'|\[((?:[^'\]]|'(?:[^'\\]|\\.)*')*)\])/gm)) {
    out[m[1]] = m[2] !== undefined ? unescapeTs(m[2]) : [...m[3].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => unescapeTs(x[1]));
  }
  return out;
}

// A value as it is compared: what the page reads (backticks as code, <br> as a break), entities
// decoded, no whitespace.
const form = (value) => tight(shown(decode(value)));

// The separator the hero splits kept values at and joins their pieces with.
const PIECE = ' · ';

// The values to look for: one per string, each item of an array on its own, of every left key the
// entries have, minus the ones the page keeps, that is, a value each of whose pieces at " · " is,
// compared the same way, part of (or equal to) a value of a kept key. A value with no " · " is one
// piece. Each with its key.
export function leftHomeValues(entries, leftKeys, keptKeys) {
  const kept = keptKeys.filter((k) => Object.hasOwn(entries, k)).flatMap((k) => [entries[k]].flat()).map(form);
  const keeps = (value) => value.split(PIECE).every((piece) => kept.some((k) => k.includes(form(piece))));
  const out = [];
  for (const key of new Set(leftKeys)) {
    if (!Object.hasOwn(entries, key)) continue;
    for (const value of [entries[key]].flat()) {
      if (form(value) && !keeps(value)) out.push({ key, value });
    }
  }
  return out;
}

// The places of a page a value could show in, each compared on its own: the text (tags out), every
// attribute value, and every <script> and <style> body with its JSON escapes read.
function places(html) {
  const bodies = [...html.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  const rest = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const attrs = [...rest.matchAll(/<[a-z][^>]*>/gi)].flatMap((m) => [...m[0].matchAll(/\s[^\s=/>]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((a) => a[1] ?? a[2] ?? a[3]));
  const json = (s) => s.replace(/\\u([0-9a-f]{4})/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/\\(["\\/])/g, '$1');
  return [
    tight(decode(rest.replace(/<[^>]*>/g, ' '))),
    ...attrs.map((a) => tight(decode(a))),
    ...bodies.map((b) => tight(decode(json(b)))),
  ];
}

// The keys of the values found anywhere in the raw HTML of a page, once each, in the order given.
export function leftHomeProblems(html, values) {
  const where = places(html);
  const found = [];
  for (const { key, value } of values) {
    const v = form(value);
    if (where.some((p) => p.includes(v)) && !found.includes(key)) found.push(key);
  }
  return found;
}
