// Audit probes for the contained home page (five sections, the blocks that moved to the end of the
// commands page, the type scale one step up). They read the sources only, with no build, bind to
// content and not to line numbers, and quote no sentence of the site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const component = (name) => read(`site/src/components/${name}.astro`);
const template = (src) =>
  src.replace(/^---[\s\S]*?\n---\n/, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

// Every file under site/src with the given extensions, the copied design system left out.
function files(dir, exts) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (rel === 'site/src/styles/genius' || rel === 'site/src/scripts/genius') continue;
    if (statSync(join(root, rel)).isDirectory()) out.push(...files(rel, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(rel);
  }
  return out;
}

// The declarations of a stylesheet, each with the chain of rule preludes it sits under
// (`@media (...)`, `:root`, ...). Comments out; enough of CSS for custom properties.
function declarationsWithContext(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const stack = [];
  let buf = '';
  for (const ch of text) {
    if (ch === '{') {
      stack.push(buf.trim().replace(/\s+/g, ' '));
      buf = '';
    } else if (ch === '}' || ch === ';') {
      const d = buf.trim();
      const i = d.indexOf(':');
      if (i > 0 && stack.length && /^--?[\w-]+$/.test(d.slice(0, i).trim())) {
        out.push({ context: [...stack], property: d.slice(0, i).trim(), value: d.slice(i + 1).trim().replace(/\s+/g, ' ') });
      }
      buf = '';
      if (ch === '}') stack.pop();
    } else buf += ch;
  }
  return out;
}

const SCALE = {
  '--fs-label': '12.5px',
  '--fs-data': '13.5px',
  '--fs-meta': '15px',
  '--fs-ui': '16px',
  '--fs-body': '18px',
  '--fs-lede': 'clamp(20px, 1.7vw, 24px)',
};

// Contract: spec change 3 and criterion 5, the scale of the site holds "in both themes and on every
// page" and wins over the design system in the computed style. Regression: a second declaration of a
// scale token anywhere in the site's own CSS (global.css or a component, layout or page style),
// under a theme selector (`:root[data-theme="dark"]`, which outranks `:root`), inside a media query
// (a phone scale), or on another element, so one theme, one width or one page reads another size.
// Why the executor's test misses it: it merges the declarations of the top-level rules whose
// selector is exactly `:root` in global.css, so a rule with another selector, or a `:root` nested in
// `@media`, is not read at all and the test still passes.
test('the six scale tokens are declared once each, in global.css, on a top-level :root, with the scale values', () => {
  const found = [];
  for (const file of files('site/src', ['.css', '.astro'])) {
    const src = read(file);
    const css = file.endsWith('.css') ? src : [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    for (const d of declarationsWithContext(css)) if (d.property in SCALE) found.push({ file, ...d });
  }
  for (const [token, value] of Object.entries(SCALE)) {
    const decls = found.filter((d) => d.property === token);
    assert.deepEqual(
      decls.map((d) => [d.file, d.context.join(' > '), d.value]),
      [['site/src/styles/global.css', ':root', value]],
      `${token}: every declaration in the site's own CSS`,
    );
  }
});

// Contract: spec change 1, "the tab that opens selected is the terminal one" on a page that runs the
// script, while without the script both panels show. Regression: the tab script of the copied design
// system, refreshed from its source, picks the first tab instead of the one marked selected, or the
// markup gains a second selected tab or loses the panel wiring (aria-controls, data-gx-painel), and
// the desktop panel opens. Why the executor's test misses it: it reads the aria-selected attributes
// of the markup and never runs the script that decides which panel the visitor sees.
test('with the design system script running, the Claude Code tabs open the terminal panel and hide the desktop one', async () => {
  const markup = template(component('Editions'));
  const group = /<div[^>]*\sdata-gx-abas\b[^>]*>([\s\S]*?)<\/div>/.exec(markup);
  assert.ok(group, 'the tab group');
  const attrs = (tag) => Object.fromEntries([...tag.matchAll(/\s([\w-]+)(?:="([^"]*)")?/g)].map((m) => [m[1], m[2] ?? '']));
  const makeEl = (a) => {
    const el = {
      attrs: { ...a },
      hidden: 'hidden' in a,
      style: { setProperty() {} },
      offsetLeft: 0,
      offsetWidth: 0,
      getAttribute: (k) => (k in el.attrs ? el.attrs[k] : null),
      setAttribute: (k, v) => { el.attrs[k] = String(v); },
      hasAttribute: (k) => k in el.attrs,
      addEventListener() {},
    };
    return el;
  };
  const tabs = [...group[1].matchAll(/<button\b[^>]*>/g)].map((m) => makeEl(attrs(m[0])));
  const panels = [...markup.matchAll(/<div\b[^>]*\srole="tabpanel"[^>]*>/g)].map((m) => makeEl(attrs(m[0])));
  assert.equal(tabs.length, 2, 'two tabs');
  assert.equal(panels.length, 2, 'two panels');
  const doc = {
    getElementById: (id) => panels.find((p) => p.attrs.id === id) ?? null,
    querySelectorAll: (sel) => (sel === '[data-gx-abas]' ? [groupEl] : []),
  };
  const groupEl = { ...makeEl(attrs(group[0])), ownerDocument: doc, querySelectorAll: (sel) => (sel === '.gx-aba' ? tabs : []) };
  const { iniciar } = await import(join(root, 'site/src/scripts/genius/genius.js'));
  const saved = globalThis.addEventListener;
  try {
    globalThis.addEventListener = undefined;
    iniciar(doc);
  } finally {
    globalThis.addEventListener = saved;
  }
  const shown = panels.filter((p) => !p.hidden).map((p) => p.attrs.id);
  assert.deepEqual(shown, ['ed-panel-cli'], 'the panel shown once the script runs');
  assert.deepEqual(tabs.filter((t) => t.attrs['aria-selected'] === 'true').map((t) => t.attrs.id), ['ed-tab-cli'], 'the tab selected once the script runs');
});

// Contract: spec change 2 and criterion 6, the demo, the use cases, the list of commands and the
// contact left the home page, "no internal link points at them", and every internal link has a
// target. Regression: a link to a home anchor that is gone (`/${lang}/#contact`, `/${lang}/#use-cases`,
// `/${lang}/#demo`, `/${lang}/#commands`) written in a component the executor's list does not read
// (UseCases, ContactForm, EditionsAnswers, a page or the layout), or with an id it does not name.
// Why the executor's test misses it: it reads nine named components for four named ids; the build
// check that resolves every link runs in `npm run build`, which the CI does not run.
test('every link to an anchor of the home page lands on an id one of its five sections or the header defines', () => {
  const homeIds = new Set();
  for (const name of ['Header', 'Hero', 'HowItWorks', 'Loop', 'Editions', 'FinalCTA']) {
    for (const m of template(component(name)).matchAll(/\sid="([^"{}]+)"/g)) homeIds.add(m[1]);
  }
  for (const id of ['how', 'loop', 'editions']) assert.ok(homeIds.has(id), `the home page defines #${id}`);
  const links = [];
  for (const file of files('site/src', ['.astro', '.ts', '.js'])) {
    const src = read(file);
    const re = /(?:\$\{lang\}|\/en|\/pt-br|https:\/\/www\.vibeflow\.run(?:\/en|\/pt-br)?)\/#([A-Za-z][\w-]*)|href="\/#([A-Za-z][\w-]*)"/g;
    for (const m of src.matchAll(re)) links.push({ file: relative(root, join(root, file)), id: m[1] ?? m[2] });
  }
  assert.ok(links.length > 0, 'the site links to the home anchors somewhere');
  const lost = links.filter((l) => !homeIds.has(l.id));
  assert.deepEqual(lost, [], 'links to a home anchor that is not on the home page');
});

// Contract: the install commands of the editions break only at their break points (reaudit 1, PG-1,
// and the comment over cmdHtml): a "/" or an "@" with something before and after it in the word is
// followed by <wbr>; a leading "/" or "@" (as in `/plugin` or `@scope/pkg`) and a trailing one are
// not; nothing else breaks a word; the pieces read the command exactly, escaped for HTML.
// Regression: the split pattern of cmdHtml is simplified or reordered (`(?<=\/|[^@]@)`,
// `(?<=[^/]\/|@)`, `(?<=[/@])`) and a leading "/" or "@" ends a line alone, or the "@" break is lost
// again. Why the executor's test misses it: it runs cmdHtml only on today's install commands and
// checks only the "@"; none of them starts a word with "@", and the "/" rules are checked nowhere.
// Oracle: for a word w, a break follows index i exactly when w[i] is "/" or "@", 0 < i < w.length - 1.
// The words come from a seeded generator, so a failure names an input that reproduces.
test('cmdHtml breaks a word after an inner "/" or "@" only, and its pieces read the command', () => {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(component('Editions'))?.[1] ?? '';
  const start = fm.indexOf('const escapeHtml');
  assert.ok(start >= 0, 'Editions.astro defines escapeHtml before cmdHtml');
  const cmdHtml = new Function(`${fm.slice(start).replace(/\((\w+): string\)/g, '($1)')}\nreturn cmdHtml;`)();
  const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  let seed = 20261120;
  const rand = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const ATOMS = ['alpha', 'b', 'x-y', '--flag', 'v1.2.3', 'a&b', 'c<d>', 'q"r'];
  const SEPS = ['/', '@'];
  const word = () => {
    let w = rand(3) === 0 ? SEPS[rand(2)] : '';
    const n = 1 + rand(4);
    for (let i = 0; i < n; i++) w += (i ? SEPS[rand(2)] : '') + ATOMS[rand(ATOMS.length)];
    if (rand(6) === 0) w += SEPS[rand(2)];
    return w;
  };
  const inputs = ['/plugin install a@b-c', '@scope/pkg@latest --x', 'npx a-b@latest', 'p/q/r/s', '@', '/', 'a@', 'a/'];
  for (let i = 0; i < 400; i++) inputs.push(Array.from({ length: 1 + rand(4) }, word).join(' '));

  for (const cmd of inputs) {
    const html = cmdHtml(cmd);
    assert.equal(html.replace(/<span class="ed-cmd-part">[^<]*<\/span>|<wbr>| /g, ''), '', `${JSON.stringify(cmd)}: only parts, breaks and spaces`);
    assert.equal(unescape(html.replace(/<[^>]+>/g, '')), cmd, `${JSON.stringify(cmd)}: the parts read the command`);
    const words = html.split(/ (?=<span\b)/);
    const plainWords = cmd.split(' ');
    assert.equal(words.length, plainWords.length, `${JSON.stringify(cmd)}: one display word per word`);
    words.forEach((w, k) => {
      const pieces = w.split('<wbr>').map((p) => unescape(/^<span class="ed-cmd-part">([^<]*)<\/span>$/.exec(p)?.[1] ?? '\u0000'));
      assert.ok(!pieces.includes('\u0000'), `${JSON.stringify(cmd)}: each break sits between two whole parts`);
      const got = [];
      let at = -1;
      for (const p of pieces.slice(0, -1)) got.push((at += p.length));
      const text = plainWords[k];
      const want = [...text].flatMap((ch, i) => ((ch === '/' || ch === '@') && i > 0 && i < text.length - 1 ? [i] : []));
      assert.deepEqual(got, want, `${JSON.stringify(cmd)}: breaks of ${JSON.stringify(text)} after these indexes`);
    });
  }
});
