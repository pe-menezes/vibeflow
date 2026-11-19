// A small reader of CSS selectors, enough for the build check (check-build.mjs) to tell which
// selectors a rule stands for and what each one requires. It splits a selector list on the commas
// outside quotes, brackets and parentheses; splits a complex selector into compounds on the
// combinators outside them; reads each compound into its simple selectors (type, universal, id,
// class, attribute with any operator, pseudo-class with its arguments, pseudo-element); and expands
// :is() and :where() into the selectors of their lists. Arguments of other pseudo-classes, such as
// :not(.a .b), stay whole and opaque: they are not requirements of the element.

// Walks a text one character at a time and calls visit(i, top) for each, where top is true when the
// character sits outside quotes, brackets and parentheses and is not escaped. Returns false when a
// quote, a bracket or a parenthesis is left open.
function scan(text, visit) {
  let depth = 0;
  let bracket = 0;
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') {
      visit(i, false);
      if (i + 1 < text.length) visit(i + 1, false);
      i += 1;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      visit(i, false);
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      visit(i, false);
      continue;
    }
    if (ch === '[') bracket += 1;
    else if (ch === ']') bracket = Math.max(0, bracket - 1);
    else if (bracket === 0 && ch === '(') depth += 1;
    else if (bracket === 0 && ch === ')') depth = Math.max(0, depth - 1);
    const top = depth === 0 && bracket === 0 && !'[]()'.includes(ch);
    visit(i, top);
  }
  return depth === 0 && bracket === 0 && quote === '';
}

// The selectors of a list: `:is(.a, .b), [data-x="a,b"]` is two selectors, not four.
export function selectorList(text) {
  const cuts = [];
  scan(text, (i, top) => { if (top && text[i] === ',') cuts.push(i); });
  const parts = [];
  let start = 0;
  for (const cut of [...cuts, text.length]) {
    parts.push(text.slice(start, cut).trim());
    start = cut + 1;
  }
  return parts.filter(Boolean);
}

// The end (exclusive) of a bracket or parenthesis group that opens at `open`, quotes respected.
function groupEnd(text, open) {
  const close = text[open] === '[' ? ']' : ')';
  let depth = 0;
  let quote = '';
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') { i += 1; continue; }
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === text[open]) depth += 1;
    else if (ch === close && (depth -= 1) === 0) return i + 1;
  }
  return text.length;
}

// The length of an identifier (with escapes) that starts at i.
function identEnd(text, i) {
  let j = i;
  while (j < text.length) {
    if (text[j] === '\\') j += 2;
    else if (/[\w-]/.test(text[j]) || text.charCodeAt(j) > 0x7f) j += 1;
    else break;
  }
  return j;
}
const unescape = (s) => s.replace(/\\(.)/g, '$1');
const ATTRIBUTE = /^\[\s*([^\s~|^$*=\]]+)\s*(?:([~|^$*]?=)\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?:[^\s\]\\]|\\.)+)\s*([is])?\s*)?\]$/i;

// The simple selectors of one compound, each { kind, name, raw } and, for an attribute, its
// operator and value, and for a pseudo-class or pseudo-element with arguments, `args`.
export function parseCompound(text) {
  const simples = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    let end;
    let simple;
    if (ch === '*') {
      end = i + 1;
      simple = { kind: 'universal', name: '*' };
    } else if (ch === '&') {
      end = i + 1;
      simple = { kind: 'nesting', name: '&' };
    } else if (ch === '#' || ch === '.') {
      end = identEnd(text, i + 1);
      simple = { kind: ch === '#' ? 'id' : 'class', name: unescape(text.slice(i + 1, end)) };
    } else if (ch === '[') {
      end = groupEnd(text, i);
      const m = ATTRIBUTE.exec(text.slice(i, end));
      simple = m
        ? { kind: 'attribute', name: unescape(m[1]), op: m[2] ?? '', value: m[3] === undefined ? undefined : unescape(m[3].replace(/^(["'])([\s\S]*)\1$/, '$2')) }
        : { kind: 'attribute', name: text.slice(i + 1, end - 1).trim(), op: '?' };
    } else if (ch === ':') {
      const element = text[i + 1] === ':';
      const start = i + (element ? 2 : 1);
      end = identEnd(text, start);
      const name = unescape(text.slice(start, end)).toLowerCase();
      let args;
      if (text[end] === '(') {
        const close = groupEnd(text, end);
        args = text.slice(end + 1, close - 1).trim();
        end = close;
      }
      // :before and :after are the old single-colon spelling of the pseudo-elements.
      const legacy = !element && /^(before|after|first-line|first-letter)$/.test(name);
      simple = { kind: element || legacy ? 'pseudo-element' : 'pseudo-class', name, ...(args === undefined ? {} : { args }) };
    } else {
      end = identEnd(text, i);
      if (end === i) end = i + 1;
      simple = { kind: 'type', name: unescape(text.slice(i, end)).toLowerCase() };
    }
    simples.push({ ...simple, raw: text.slice(i, end) });
    i = end;
  }
  return simples;
}

// A complex selector: its compounds, each a list of simple selectors, and the combinator before
// each compound but the first (' ', '>', '+' or '~').
export function parseComplex(text) {
  const compounds = [];
  const combinators = [];
  let current = '';
  let pending = null;
  const flush = () => {
    if (!current) return;
    if (compounds.length) combinators.push(pending ?? ' ');
    compounds.push(parseCompound(current));
    current = '';
    pending = null;
  };
  scan(text, (i, top) => {
    const ch = text[i];
    if (top && /[\s>+~]/.test(ch)) {
      if (current) flush();
      if (ch !== ' ' && !/\s/.test(ch)) pending = ch;
      return;
    }
    current += ch;
  });
  flush();
  return { compounds, combinators };
}

export const serialize = ({ compounds, combinators }) =>
  compounds.map((c, i) => (i ? (combinators[i - 1] === ' ' ? ' ' : ` ${combinators[i - 1]} `) : '') + c.map((s) => s.raw).join('')).join('');

const SPREAD = new Set(['is', 'where', 'matches', '-webkit-any']);

// The complex selectors a parsed complex selector stands for, with each :is() and :where() replaced
// by each selector of its list. A complex selector inside the list keeps its own ancestors ahead of
// the compound it joins: `a:is(.b .c) d` stands for `.b a.c d` (as a set of requirements, which is
// what the build check reads).
function expandComplex(complex) {
  for (let k = 0; k < complex.compounds.length; k += 1) {
    const compound = complex.compounds[k];
    const at = compound.findIndex((s) => s.kind === 'pseudo-class' && SPREAD.has(s.name) && s.args !== undefined);
    if (at < 0) continue;
    const rest = compound.filter((_, i) => i !== at);
    return selectorList(compound[at].args).flatMap((alt) => expandComplex(parseComplex(alt)).flatMap((inner) => {
      const last = inner.compounds.length - 1;
      const merged = [...rest, ...inner.compounds[last]];
      // The compound before keeps its combinator to the merged compound when the inner selector is
      // one compound; otherwise it is an ancestor of the inner selector's first compound.
      const before = k > 0 ? [...complex.combinators.slice(0, k - 1), last > 0 ? ' ' : complex.combinators[k - 1]] : [];
      return expandComplex({
        compounds: [...complex.compounds.slice(0, k), ...inner.compounds.slice(0, last), merged, ...complex.compounds.slice(k + 1)],
        combinators: [...before, ...inner.combinators, ...complex.combinators.slice(k)],
      });
    }));
  }
  return [complex];
}

// Every complex selector a selector list stands for, :is() and :where() expanded.
export function expandSelectors(text) {
  return selectorList(text).flatMap((part) => expandComplex(parseComplex(part)));
}

// Whether a selector text is well formed for this reader: quotes, brackets and parentheses closed.
export const balanced = (text) => scan(text, () => {});
