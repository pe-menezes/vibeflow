// Checks on the built site that only the generated HTML and CSS can show. `npm run build` runs it
// after `astro build`; it exits with 1 and lists every problem it finds.
//
// For hidden text it is an alarm, not the proof. It reads the HTML and the CSS as text, with no
// browser, so the build can stop the usual ways of hiding text early; that no text is hidden at
// rest is proved in Chrome by `npm run measure` (scripts/measure-rendered.mjs). Selectors are read
// by scripts/selectors.mjs. Two questions no reader of the CSS answers without the document, so
// this alarm leaves them to the measure:
// * whether two different selectors fall on the same element: a pseudo-element given text by one
//   selector and hidden by another that is neither broader nor narrower (`a::after{content:"help"}`
//   with `.tip::after{opacity:0}`, or `.x.a` with `.x.b`) passes here;
// * whether two selectors never apply together: text that exists only under one theme
//   (`html[data-theme="dark"] .x::after{content:"help"}`) fails here the empty hover decoration of
//   the other theme.
//
// * the seven pages exist;
// * no old domain and no Google Fonts request anywhere in the output;
// * canonical, og:url and the share images come from https://www.vibeflow.run, the root page's
//   canonical is /en/, and hreflang points at the same page in the other language, with an
//   x-default in English;
// * nothing is hidden at rest: no fade-in or reveal markup, no CSS that hides content unless it is
//   gated by a class a script adds when motion is allowed, no style attribute that hides or pushes
//   text off screen, no hidden attribute outside SHOWN_LATER, and exactly one h1 per page;
// * every in-page and cross-page anchor (#x, /<lang>/#x, /<lang>/<page>#x) has its target id;
// * both languages have the same structure (ids, in-page links, buttons and sections); an inner
//   page may translate its ids when both languages have the same number of them, on the same
//   elements, in the same order;
// * the hero title carries the highlighted term in both languages;
// * the hero call shows heroSubtitle and then heroDescription, and the flow band is an image named
//   by heroFlowLabel with the heroFlowBefore and heroFlowAfter notes, all read from src/i18n.
//
// checkPages and checkCss are exported so the checks can run on HTML in memory.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandSelectors, serialize } from './selectors.mjs';

const SITE = 'https://www.vibeflow.run';
// The hosts of the site: a link to either, in any spelling URL accepts, is a link to a page here.
const SITE_HOSTS = new Set(['www.vibeflow.run', 'vibeflow.run']);
const PAGES = ['', 'en/', 'pt-br/', 'en/commands/', 'en/anatomy/', 'pt-br/commands/', 'pt-br/anatomy/'];
const INNER = ['commands/', 'anatomy/'];
const BANNED = ['vibeflow.dev', 'vibeflow-two.vercel.app', 'fonts.googleapis.com', 'fonts.gstatic.com'];
// Classes a script adds only when motion is allowed or a piece is played; CSS under them may hide.
const GATES = ['.motion-ok', '.gx-tocando'];
// Elements that carry the hidden attribute in the HTML because a script shows them later, by id.
// The phone menu is not one: it ships open, so the navigation works without a script, and only a
// page running JavaScript closes it, by a class the head script sets before the first paint.
const SHOWN_LATER = {
  'form-success': 'the contact form success message, shown after the form is sent',
};

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');
let problems = [];
const fail = (msg) => problems.push(msg);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// Visits every rule of a stylesheet with its selector, its declarations and the enclosing at-rules.
function walkCss(css, visit) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let buf = '';
  for (const ch of text) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      const selector = stack.pop();
      if (selector !== undefined && buf.trim()) visit(selector, buf.trim(), [...stack]);
      buf = '';
    } else {
      buf += ch;
    }
  }
}

// A zero in any of its spellings: 0, 0.0, .0, 0%, 0.0%.
const ZERO = String.raw`(?:0*\.?0+|0+\.)%?`;
const hidesOpacity = (body) => new RegExp(String.raw`(^|;)\s*opacity\s*:\s*${ZERO}\s*(!important)?\s*(;|$)`).test(body);
const hidesVisibility = (body) => /(^|;)\s*visibility\s*:\s*(hidden|collapse)/.test(body);
const hidesDisplay = (body) => /(^|;)\s*display\s*:\s*none/.test(body);
// A selector, parsed by selectors.mjs with :is() and :where() expanded, is gated when one of its
// compounds requires the gate itself: html with the class motion-ok, or the play class. What sits
// inside :not() or another selector function, or in an attribute value, is not a requirement and
// does not gate.
const has = (compound, kind, name) => compound.some((s) => s.kind === kind && s.name === name);
const gated = (complex) => complex.compounds.some((c) => (has(c, 'type', 'html') && has(c, 'class', 'motion-ok')) || has(c, 'class', 'gx-tocando'));

// A length far enough to put text off screen: a negative value of at least 100vw, 100vh, 100%,
// 1000px or 50em/rem.
function offScreen(value) {
  const m = /^-\s*(\d*\.?\d+)\s*(px|em|rem|vw|vh|%|svw|dvw|lvw)?$/.exec(value.trim());
  if (!m) return false;
  const n = Number(m[1]);
  const unit = m[2] ?? 'px';
  if (unit === 'px') return n >= 1000;
  if (unit === 'em' || unit === 'rem') return n >= 50;
  return n >= 100;
}
function pushesOffScreen(body) {
  for (const m of body.matchAll(/(?:^|;)\s*(left|right|top|bottom|inset|inset-inline-start|inset-inline-end|text-indent|margin-left|margin-right|margin-top|margin-inline-start|translate)\s*:\s*([^;]+)/g)) {
    if (m[2].split(/\s+/).some(offScreen)) return true;
  }
  for (const m of body.matchAll(/translate(?:X|Y|3d)?\(\s*([^)]*)\)/g)) {
    if (m[1].split(/\s*,\s*/).some(offScreen)) return true;
  }
  return false;
}

// The pseudo-element a selector's last compound asks for, 'before' or 'after' (in the double- or
// the single-colon form a minifier writes), or undefined.
const pseudoOf = (complex) => complex.compounds.at(-1)?.find((s) => s.kind === 'pseudo-element' && /^(before|after)$/.test(s.name))?.name;
const SHOWN_ON = /^(hover|focus-visible|focus-within|focus)$/;
const isState = (s) => s.kind === 'pseudo-class' && SHOWN_ON.test(s.name);
// A pseudo-element draws text when its content is anything but an empty string or none.
const drawsText = (content) => content !== undefined && !/^(["'])\1$|^none$|^normal$/.test(content.trim());
// One spelling of a simple selector: the pseudo-elements in the double-colon form.
const spell = (s) => (s.kind === 'pseudo-element' ? `::${s.name}${s.args === undefined ? '' : `(${s.args})`}` : s.raw);
// A selector with the hover and focus states taken out, spelt one way, so the rule a hover shows
// and the rule that hides at rest compare equal.
const atRest = (complex) => complex.compounds
  .map((c, i) => (i ? complex.combinators[i - 1] : '') + c.filter((s) => !isState(s)).map(spell).join(''))
  .join('');

// The simple selectors of the last compound of a selector, with its pseudo-element, the hover and
// focus states and the universal selector taken out, and the pseudo-element itself.
function pseudoTarget(complex) {
  const last = complex.compounds.at(-1) ?? [];
  const simples = new Set(last.filter((s) => s.kind !== 'pseudo-element' && s.kind !== 'universal' && !isState(s)).map(spell));
  return { kind: pseudoOf(complex), simples };
}
const within = (a, b) => [...a].every((s) => b.has(s));

export function checkCss(css, where) {
  const found = [];
  const hidingKeyframes = new Set();
  const texts = [];
  const shownOnHover = new Set();
  walkCss(css, (selector, body, stack) => {
    const frames = stack.find((s) => /^@(-webkit-)?keyframes\s/.test(s));
    if (frames && hidesOpacity(body)) hidingKeyframes.add(frames.split(/\s+/)[1]);
    if (frames) return;
    for (const complex of expandSelectors(selector)) {
      if (!pseudoOf(complex)) continue;
      const content = /(?:^|;)\s*content\s*:\s*([^;]+)/.exec(body)?.[1];
      if (drawsText(content)) texts.push(pseudoTarget(complex));
      const shown = complex.compounds.some((c) => c.some(isState));
      if (shown && /(^|;)\s*opacity\s*:/.test(body) && !hidesOpacity(body)) shownOnHover.add(atRest(complex));
    }
  });
  // A pseudo-element draws text when any rule for the same pseudo-element that may apply to it (its
  // last compound asks for no more than this one, or this one for no more than it) gives it text.
  const mayDrawText = (complex) => {
    const me = pseudoTarget(complex);
    return texts.some((t) => t.kind === me.kind && (within(t.simples, me.simples) || within(me.simples, t.simples)));
  };
  // A decorative pseudo-element (no text in any rule) that a hover or focus rule shows is not
  // hidden content.
  const decorativeShownLater = (complex) => Boolean(pseudoOf(complex)) && shownOnHover.has(atRest(complex)) && !mayDrawText(complex);
  walkCss(css, (selector, body, stack) => {
    if (stack.some((s) => /^@(-webkit-)?keyframes\s/.test(s))) return;
    if (/\.(fade-in|reveal)\b/.test(selector)) found.push(`${where}: rule for ${selector}`);
    // Each selector of a list, and of an :is() or :where() list inside it, is judged on its own:
    // one under the gate does not excuse the others.
    for (const complex of expandSelectors(selector)) {
      if (gated(complex)) continue;
      const part = serialize(complex);
      if (hidesOpacity(body) && !decorativeShownLater(complex)) found.push(`${where}: ${part} sets opacity 0 at rest`);
      if (hidesVisibility(body)) found.push(`${where}: ${part} sets visibility hidden at rest`);
      for (const m of body.matchAll(/animation(-name)?\s*:\s*([^;]+)/g)) {
        for (const name of hidingKeyframes) {
          if (new RegExp(`(^|[\\s,])${name}([\\s,]|$)`).test(m[2])) found.push(`${where}: ${part} runs ${name}, which starts hidden, without a motion gate`);
        }
      }
    }
  });
  return found;
}

// What hides content at rest in the markup of one page: a style attribute that hides or pushes
// off screen, the hidden attribute on anything SHOWN_LATER does not list, and an h1 count other
// than one.
function checkMarkup(html, where) {
  const found = [];
  for (const m of html.matchAll(/<([a-z][\w-]*)\b[^>]*>/gi)) {
    const tag = m[0];
    const style = attr(tag, 'style');
    if (style !== undefined) {
      const body = decode(style);
      if (hidesOpacity(body)) found.push(`${where}: <${m[1]}> style sets opacity 0 at rest`);
      if (hidesVisibility(body)) found.push(`${where}: <${m[1]}> style sets visibility hidden at rest`);
      if (hidesDisplay(body)) found.push(`${where}: <${m[1]}> style sets display none at rest`);
      if (pushesOffScreen(body)) found.push(`${where}: <${m[1]}> style pushes it off screen at rest`);
    }
    if (/\shidden(\s|=|\/?>)/.test(tag.replace(/"[^"]*"/g, '""')) && !/^<(input|template)\b/i.test(tag)) {
      const id = attr(tag, 'id');
      if (!id || !(id in SHOWN_LATER)) found.push(`${where}: <${m[1]}${id ? `#${id}` : ''}> has the hidden attribute at rest`);
    }
  }
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) found.push(...checkCss(m[1], `${where} <style>`).map((p) => p.replace(`${where} <style>: `, `${where}: <style> `)));
  const h1 = (html.match(/<h1\b/g) ?? []).length;
  if (h1 !== 1) found.push(`${where}: ${h1} h1 elements, not one`);
  return found;
}

// The value of a string key in an i18n file, single-quoted as the files write them.
function i18nValue(lang, key) {
  const text = readFileSync(join(siteDir, 'src', 'i18n', `${lang}.ts`), 'utf8');
  const m = new RegExp(`\\n\\s*${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(text);
  return m ? m[1].replace(/\\(.)/g, '$1') : undefined;
}
const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const plain = (html) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const tags = (html, re) => [...html.matchAll(re)].map((m) => m[0]);

// The page a site link goes to ('en/commands/', '' for the root) and its fragment, or null when the
// link is not a page of the site. The link is read as a URL against the page it sits on, and it is
// a site link when its host is the site's, in any spelling (capitals, the default port, with or
// without www, a query right after the host) or relative; a query is dropped, and a link to
// another host or scheme leaves before anything is decoded. A fragment that does not decode comes
// back raw with `malformed` set.
function resolve(href, page) {
  let url;
  try {
    url = new URL(href, `${SITE}/${page}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !SITE_HOSTS.has(url.hostname) || url.port !== '') return null;
  const hash = href.indexOf('#');
  const path = url.pathname;
  const raw = hash < 0 ? '' : href.slice(hash + 1);
  let frag = raw;
  let malformed = false;
  try {
    frag = decodeURIComponent(raw);
  } catch {
    malformed = true;
  }
  const to = resolvePath(path, page);
  return to && { ...to, frag, malformed };
}
function resolvePath(path, page) {
  if (path === '') return { page };
  if (path === '/') return { page: '' };
  const m = /^\/(en|pt-br)(?:\/([\w-]*))?\/?$/.exec(path);
  return m ? { page: `${m[1]}/${m[2] ? `${m[2]}/` : ''}` } : null;
}

const ids = (html) => [...html.matchAll(/<([a-z][\w-]*)\b[^>]*?\sid="([^"]+)"/gi)].map((m) => ({ tag: m[1].toLowerCase(), id: m[2] }));
const links = (html) => [...html.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map((m) => decode(m[1]));

// Every site link of every page goes to a page that exists, and its fragment to an id there.
function checkAnchors(pages) {
  const found = [];
  const idsOf = Object.fromEntries(Object.entries(pages).map(([p, html]) => [p, new Set(ids(html).map((x) => x.id))]));
  for (const [page, html] of Object.entries(pages)) {
    for (const href of links(html)) {
      const to = resolve(href, page);
      if (!to) continue;
      if (!(to.page in pages)) found.push(`/${page}: link ${href} goes to a page that does not exist`);
      else if (to.malformed) found.push(`/${page}: link ${href} has a fragment that does not decode`);
      else if (to.frag && !idsOf[to.page].has(to.frag)) found.push(`/${page}: link ${href} has no target`);
    }
  }
  return found;
}

// An inner page may translate its ids: when both languages have the same number of ids, on the
// same elements in the same order, the Portuguese id at each position stands for the English one.
// The map is read only on the Portuguese page and on links to it.
function translatedIds(en, pt) {
  const a = ids(en);
  const b = ids(pt);
  if (a.length !== b.length || a.some((x, i) => x.tag !== b[i].tag)) return new Map();
  return new Map(b.map((x, i) => [x.id, a[i].id]));
}

// The structure of a page with the language taken out of its links, and translated ids read as the
// English ones. Links to the site itself must match one for one; an external link may point at a
// document in the page's language, so only their number has to match.
function structure(html, page, idMaps) {
  // Only a Portuguese page's ids are translated; an English id is read as it is, even when it
  // happens to be a Portuguese id of the same page.
  const map = (target) => (target.startsWith('pt-br/') && idMaps[target.slice('pt-br/'.length)]) || new Map();
  const english = (href) => {
    const to = resolve(href, page);
    const mapped = to?.frag && map(to.page).get(to.frag);
    return mapped ? href.replace(/#.*$/, `#${mapped}`) : href;
  };
  const neutral = (href) => english(href).replace(/^\/(en|pt-br)(\/|$)/, '/{lang}$2');
  const hrefs = links(html);
  const internal = (h) => h.startsWith('/') || h.startsWith('#');
  const own = map(page);
  return {
    ids: ids(html).map((x) => own.get(x.id) ?? x.id),
    links: hrefs.filter(internal).map(neutral),
    externalLinks: hrefs.filter((h) => !internal(h)).length,
    buttons: (html.match(/<button\b/g) ?? []).length,
    sections: (html.match(/<section\b/g) ?? []).length,
    copies: [...html.matchAll(/\sdata-copy="/g)].length,
  };
}

// The canonical of every page, and on the pages in a language the hreflang of the same page in
// both languages with x-default in English. The root page only redirects, so its canonical is /en/.
function checkAlternates(html, page) {
  const found = [];
  const canonical = tags(html, /<link[^>]*rel="canonical"[^>]*>/g).map((t) => attr(t, 'href'));
  const want = page ? `${SITE}/${page}` : `${SITE}/en/`;
  if (canonical.length !== 1 || canonical[0] !== want) found.push(`/${page}: canonical is ${canonical}`);
  if (!page) return found;
  const rest = page.replace(/^(en|pt-br)\//, '');
  const hreflang = Object.fromEntries(tags(html, /<link[^>]*rel="alternate"[^>]*>/g).map((t) => [attr(t, 'hreflang'), attr(t, 'href')]));
  const expected = { en: `${SITE}/en/${rest}`, 'pt-BR': `${SITE}/pt-br/${rest}`, 'x-default': `${SITE}/en/${rest}` };
  if (JSON.stringify(hreflang, Object.keys(expected).sort()) !== JSON.stringify(expected, Object.keys(expected).sort()) || Object.keys(hreflang).length !== 3) {
    found.push(`/${page}: hreflang ${JSON.stringify(hreflang)}`);
  }
  return found;
}

// The checks that read the pages themselves: canonical and hreflang, nothing hidden at rest in the
// markup, one h1, every anchor with a target, and the same structure in both languages. `pages`
// maps a page ('', 'en/', 'pt-br/commands/', ...) to its HTML; each problem starts with the page.
export function checkPages(pages) {
  const found = [];
  for (const [page, html] of Object.entries(pages)) {
    found.push(...checkAlternates(html, page), ...checkMarkup(html, `/${page}`));
  }
  found.push(...checkAnchors(pages));
  const idMaps = {};
  for (const rest of INNER) {
    if (pages[`en/${rest}`] && pages[`pt-br/${rest}`]) idMaps[rest] = translatedIds(pages[`en/${rest}`], pages[`pt-br/${rest}`]);
  }
  for (const rest of ['', ...INNER]) {
    const en = pages[`en/${rest}`];
    const pt = pages[`pt-br/${rest}`];
    if (!en || !pt) continue;
    const a = structure(en, `en/${rest}`, idMaps);
    const b = structure(pt, `pt-br/${rest}`, idMaps);
    for (const key of Object.keys(a)) {
      if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) found.push(`/en/${rest} and /pt-br/${rest} differ in ${key}`);
    }
  }
  return found;
}

function main() {
const outputs = [join(siteDir, 'dist'), join(siteDir, '.vercel', 'output', 'static')].filter((d) => existsSync(d));
if (!outputs.length) fail('no build output found (dist/ or .vercel/output/static/)');

for (const out of outputs) {
  const label = relative(siteDir, out);
  for (const page of PAGES) {
    if (!existsSync(join(out, page, 'index.html'))) fail(`${label}: page /${page} is missing`);
  }

  const files = walk(out).filter((f) => /\.(html|css|js|mjs|xml|txt|json)$/.test(f));
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(siteDir, file);
    for (const banned of BANNED) if (text.includes(banned)) fail(`${rel} mentions ${banned}`);
    if (text.includes(['', 'Users', ''].join('/'))) fail(`${rel} carries a machine path`);
    if (file.endsWith('.css')) problems.push(...checkCss(text, rel));
  }

  const pages = Object.fromEntries(PAGES.filter((p) => existsSync(join(out, p, 'index.html'))).map((p) => [p, readFileSync(join(out, p, 'index.html'), 'utf8')]));
  for (const p of checkPages(pages)) fail(`${label} ${p}`);

  for (const page of PAGES.filter((p) => p)) {
    const file = join(out, page, 'index.html');
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8');
    const rel = relative(siteDir, file);

    for (const prop of ['og:url', 'og:image']) {
      const v = tags(html, new RegExp(`<meta[^>]*property="${prop}"[^>]*>`, 'g')).map((t) => attr(t, 'content'));
      if (v.length !== 1 || !v[0].startsWith(`${SITE}/`)) fail(`${rel}: ${prop} is ${v}`);
    }
    const tw = tags(html, /<meta[^>]*name="twitter:image"[^>]*>/g).map((t) => attr(t, 'content'));
    if (tw.length !== 1 || !tw[0].startsWith(`${SITE}/`)) fail(`${rel}: twitter:image is ${tw}`);

    if (!/<body[^>]*data-gx-acento="violet"/.test(html)) fail(`${rel}: body without the violet accent`);
    if (/class="[^"]*\b(fade-in|reveal)\b/.test(html)) fail(`${rel}: fade-in or reveal markup`);
    if (/\sdata-reveal\b/.test(html)) fail(`${rel}: data-reveal markup`);
    const preloads = tags(html, /<link[^>]*rel="preload"[^>]*>/g);
    if (preloads.length !== 1 || attr(preloads[0], 'href') !== '/fonts/newsreader-latin.woff2') fail(`${rel}: preloads ${preloads}`);
  }

  for (const lang of ['en', 'pt-br']) {
    const file = join(out, lang, 'index.html');
    if (!existsSync(file)) continue;
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(readFileSync(file, 'utf8'))?.[1] ?? '';
    if (!/<em[^>]*>\s*<mark[^>]*>\s*spec-driven\s*<\/mark>\s*<\/em>/i.test(h1)) fail(`${label}: /${lang}/ title without the highlighted term`);

    const html = readFileSync(file, 'utf8');
    const key = (k) => i18nValue(lang, k) ?? `(missing ${k})`;
    const call = plain(/<div class="hero-side[^"]*"[^>]*>([\s\S]*?)<div class="hero-actions"/.exec(html)?.[1] ?? '');
    const sub = call.indexOf(key('heroSubtitle'));
    const desc = call.indexOf(key('heroDescription'));
    if (sub < 0) fail(`${label}: /${lang}/ hero call without heroSubtitle`);
    if (desc < 0 || desc < sub) fail(`${label}: /${lang}/ hero call without heroDescription after heroSubtitle`);

    const bandTag = /<div class="flow-band"[^>]*>/.exec(html)?.[0] ?? '';
    if (attr(bandTag, 'role') !== 'img') fail(`${label}: /${lang}/ flow band is not role="img"`);
    if (decode(attr(bandTag, 'aria-label') ?? '') !== key('heroFlowLabel')) fail(`${label}: /${lang}/ flow band not named by heroFlowLabel`);
    if (/\saria-hidden=/.test(bandTag)) fail(`${label}: /${lang}/ flow band is hidden from screen readers`);
    for (const [cls, k] of [['flow-note--before', 'heroFlowBefore'], ['flow-note--after', 'heroFlowAfter']]) {
      const note = new RegExp(`<p class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</p>`).exec(html);
      if (!note || plain(note[1]) !== key(k)) fail(`${label}: /${lang}/ flow band without the ${k} note`);
      else if (!/\saria-hidden="true"/.test(note[0])) fail(`${label}: /${lang}/ ${k} note is read inside the image`);
    }
  }
}

if (problems.length) {
  console.error(`check-build: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-build: ok (${outputs.map((o) => relative(siteDir, o)).join(', ')})`);
}

// Run as a program, by its real path or through a symbolic link: Node gives import.meta.url the
// real path and argv[1] the path typed, so both are resolved before they are compared.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isMain()) main();
