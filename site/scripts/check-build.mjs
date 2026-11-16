// Checks on the built site that only the generated HTML and CSS can show. `npm run build` runs it
// after `astro build`; it exits with 1 and lists every problem it finds.
//
// * the seven pages exist;
// * no old domain and no Google Fonts request anywhere in the output;
// * canonical, hreflang, og:url and the share images come from https://www.vibeflow.run;
// * nothing is hidden at rest: no fade-in or reveal markup, and no CSS that hides content unless
//   it is gated by a class a script adds when motion is allowed;
// * both languages have the same structure (ids, in-page links, buttons and sections);
// * the hero title carries the highlighted term in both languages;
// * the hero call shows heroSubtitle and then heroDescription, and the flow band is an image named
//   by heroFlowLabel with the heroFlowBefore and heroFlowAfter notes, all read from src/i18n.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://www.vibeflow.run';
const PAGES = ['', 'en/', 'pt-br/', 'en/commands/', 'en/anatomy/', 'pt-br/commands/', 'pt-br/anatomy/'];
const BANNED = ['vibeflow.dev', 'vibeflow-two.vercel.app', 'fonts.googleapis.com', 'fonts.gstatic.com'];
// Classes a script adds only when motion is allowed or a piece is played; CSS under them may hide.
const GATES = ['.motion-ok', '.gx-tocando'];

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputs = [join(siteDir, 'dist'), join(siteDir, '.vercel', 'output', 'static')].filter((d) => existsSync(d));
const problems = [];
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

const hidesOpacity = (body) => /(^|;)\s*opacity\s*:\s*0(\.0+)?\s*(!important)?\s*(;|$)/.test(body);
const hidesVisibility = (body) => /(^|;)\s*visibility\s*:\s*hidden/.test(body);
const gated = (selector) => GATES.some((g) => selector.includes(g));

function checkCss(css, where) {
  const hidingKeyframes = new Set();
  walkCss(css, (selector, body, stack) => {
    const frames = stack.find((s) => /^@(-webkit-)?keyframes\s/.test(s));
    if (frames && hidesOpacity(body)) hidingKeyframes.add(frames.split(/\s+/)[1]);
  });
  walkCss(css, (selector, body, stack) => {
    if (stack.some((s) => /^@(-webkit-)?keyframes\s/.test(s))) return;
    if (/\.(fade-in|reveal)\b/.test(selector)) fail(`${where}: rule for ${selector}`);
    if (gated(selector)) return;
    if (hidesOpacity(body)) fail(`${where}: ${selector} sets opacity 0 at rest`);
    if (hidesVisibility(body)) fail(`${where}: ${selector} sets visibility hidden at rest`);
    for (const m of body.matchAll(/animation(-name)?\s*:\s*([^;]+)/g)) {
      for (const name of hidingKeyframes) {
        if (new RegExp(`(^|[\\s,])${name}([\\s,]|$)`).test(m[2])) fail(`${where}: ${selector} runs ${name}, which starts hidden, without a motion gate`);
      }
    }
  });
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

// The structure of a page with the language taken out of its links. Links to the site itself must
// match one for one; an external link may point at a document in the page's language, so only
// their number has to match.
function structure(html) {
  const neutral = (href) => href.replace(/^\/(en|pt-br)(\/|$)/, '/{lang}$2');
  const hrefs = [...html.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  const internal = (h) => h.startsWith('/') || h.startsWith('#');
  return {
    ids: [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
    links: hrefs.filter(internal).map(neutral),
    externalLinks: hrefs.filter((h) => !internal(h)).length,
    buttons: (html.match(/<button\b/g) ?? []).length,
    sections: (html.match(/<section\b/g) ?? []).length,
    copies: [...html.matchAll(/\sdata-copy="/g)].length,
  };
}

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
    if (file.endsWith('.css')) checkCss(text, rel);
    if (file.endsWith('.html')) {
      for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) checkCss(m[1], `${rel} <style>`);
    }
  }

  for (const page of PAGES.filter((p) => p)) {
    const file = join(out, page, 'index.html');
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8');
    const rel = relative(siteDir, file);

    const canonical = tags(html, /<link[^>]*rel="canonical"[^>]*>/g).map((t) => attr(t, 'href'));
    if (canonical.length !== 1 || canonical[0] !== `${SITE}/${page}`) fail(`${rel}: canonical is ${canonical}`);
    const alternates = tags(html, /<link[^>]*rel="alternate"[^>]*>/g);
    const hreflang = Object.fromEntries(alternates.map((t) => [attr(t, 'hreflang'), attr(t, 'href')]));
    if (hreflang.en !== `${SITE}/en/` || hreflang['pt-BR'] !== `${SITE}/pt-br/`) fail(`${rel}: hreflang ${JSON.stringify(hreflang)}`);
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

  for (const page of ['', 'commands/', 'anatomy/']) {
    const en = join(out, 'en', page, 'index.html');
    const pt = join(out, 'pt-br', page, 'index.html');
    if (!existsSync(en) || !existsSync(pt)) continue;
    const a = structure(readFileSync(en, 'utf8'));
    const b = structure(readFileSync(pt, 'utf8'));
    for (const key of Object.keys(a)) {
      if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) fail(`${label}: /en/${page} and /pt-br/${page} differ in ${key}`);
    }
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
