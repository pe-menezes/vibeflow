// Audit probes for the contained home page (five sections, the blocks that moved to the end of the
// commands page, the type scale one step up). They read the sources only, with no build, bind to
// content and not to line numbers, and quote no sentence of the site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEFT_HOME_COMPONENTS,
  LEFT_HOME_KEYS,
  componentKeys,
  i18nEntries,
  importedComponents,
  leftHomeProblems,
  leftHomeValues,
} from '../../site/scripts/home-rules.mjs';

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
// The script runs on stand-ins for the elements, whose querySelectorAll matches a selector by class
// token, by attribute (present or equal to a value) and by tag, the forms the script asks with, and
// stops on any other form, so a tab whose class no longer carries the token the script asks for is
// not found (fix round 3, C4: a terminal tab with the class `gx-aba--active` opened both panels).
test('with the design system script running, the Claude Code tabs open the terminal panel and hide the desktop one', async () => {
  const markup = template(component('Editions'));
  const group = /<div[^>]*\sdata-gx-abas\b[^>]*>([\s\S]*?)<\/div>/.exec(markup);
  assert.ok(group, 'the tab group');
  const attrs = (tag) => Object.fromEntries([...tag.matchAll(/\s([\w-]+)(?:="([^"]*)")?/g)].map((m) => [m[1], m[2] ?? '']));
  // One compound selector, as the script writes them: a tag, `.class` tokens, `[attr]` and
  // `[attr="value"]`. Any other form (lists, combinators, pseudo-classes) stops the probe.
  const matches = (el, sel) => {
    if (!sel || !/^(?:[a-z][\w-]*)?(?:\.[\w-]+|\[[\w-]+(?:="[^"]*")?\])*$/i.test(sel)) throw new Error(`selector form the stand-ins do not read: ${sel}`);
    const tag = /^[a-z][\w-]*/i.exec(sel)?.[0];
    if (tag && tag.toLowerCase() !== el.tag) return false;
    const classes = (el.attrs.class ?? '').split(/\s+/).filter(Boolean);
    for (const m of sel.matchAll(/\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g)) {
      if (m[1] !== undefined && !classes.includes(m[1])) return false;
      if (m[2] !== undefined && !(m[2] in el.attrs)) return false;
      if (m[3] !== undefined && el.attrs[m[2]] !== m[3]) return false;
    }
    return true;
  };
  const makeEl = (tagText) => {
    const a = attrs(tagText);
    const el = {
      tag: /^<([a-z][\w-]*)/i.exec(tagText)[1].toLowerCase(),
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
  const tabs = [...group[1].matchAll(/<button\b[^>]*>/g)].map((m) => makeEl(m[0]));
  const panels = [...markup.matchAll(/<div\b[^>]*\srole="tabpanel"[^>]*>/g)].map((m) => makeEl(m[0]));
  assert.equal(tabs.length, 2, 'two buttons in the tab group');
  assert.equal(panels.length, 2, 'two panels');
  const groupEl = makeEl(group[0]);
  const all = [groupEl, ...tabs, ...panels];
  const doc = {
    getElementById: (id) => all.find((e) => e.attrs.id === id) ?? null,
    querySelectorAll: (sel) => all.filter((e) => matches(e, sel)),
  };
  Object.assign(groupEl, { ownerDocument: doc, querySelectorAll: (sel) => tabs.filter((e) => matches(e, sel)) });
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

// Contract: the install commands of the editions break only at their break points (reaudit 1, PG-1;
// fix round 3, A1; and the comment over cmdHtml): a "/" with something before and after it in the
// word is followed by <wbr>; so is an "@" with something before and after it, unless what follows it
// up to the next "/", "@" or the end of the word is a version (`latest`, `next`, or anything that
// starts with a digit), so `setup-vibeflow@latest` stays one piece; a leading "/" or "@" (as in
// `/plugin` or `@scope/pkg`) and a trailing one are not; nothing else breaks a word; the pieces read
// the command exactly, escaped for HTML.
// Regression: the split pattern of cmdHtml is simplified or reordered (`(?<=\/|[^@]@)`,
// `(?<=[^/]\/|@)`, `(?<=[/@])`) and a leading "/" or "@" ends a line alone, the "@" break is lost
// again, or the version test is dropped or widened (a break before `latest`, or none before a name
// that only starts like a version word, such as `nextjs`). Why the executor's test misses it: it
// runs cmdHtml only on today's install commands; none of them starts a word with "@", and the "/"
// rules are checked nowhere.
// Oracle: for a word w, a break follows index i exactly when 0 < i < w.length - 1 and either w[i] is
// "/", or w[i] is "@" and the text after it up to the next "/", "@" or the end of w is not `latest`
// or `next` and does not start with a digit. The words come from a seeded generator (the same 400
// as before this round, plus the 8 written by hand) and from a list written by hand around the
// version test, so a failure names an input that reproduces.
test('cmdHtml breaks a word after an inner "/", or an inner "@" not followed by a version, only, and its pieces read the command', () => {
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
  assert.equal(inputs.length, 408, 'the 8 written by hand and the 400 generated');
  // Around the version test: versions, names that only start like one, and a version mid-word.
  const versioned = ['npx a@1.2.3', 'a@next', 'a@nextjs', 'a@latest-x', 'a@latest/b', 'x@0', 'x@v1', '@s/p@9/q@r', 'a@latest@b', 'a@next@'];
  const isVersion = (s) => s === 'latest' || s === 'next' || /^[0-9]/.test(s);

  for (const cmd of [...inputs, ...versioned]) {
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
      const inner = (i) => i > 0 && i < text.length - 1;
      const want = [...text].flatMap((ch, i) =>
        (ch === '/' && inner(i)) || (ch === '@' && inner(i) && !isVersion(text.slice(i + 1).split(/[/@]/)[0])) ? [i] : []);
      assert.deepEqual(got, want, `${JSON.stringify(cmd)}: breaks of ${JSON.stringify(text)} after these indexes`);
    });
  }
});

// The values check-home looks for on the home page of a language, computed from today's sources the
// way check-home computes them (the left keys of home-rules.mjs and of the four components that left,
// minus what the components the home page imports read), with extra kept keys when a case adds them.
function homeLookup(lang, extraKept = []) {
  const entries = i18nEntries(read(`site/src/i18n/${lang}.ts`));
  const leftKeys = [...LEFT_HOME_KEYS, ...LEFT_HOME_COMPONENTS.flatMap((n) => componentKeys(component(n)))];
  const home = importedComponents(read(`site/src/pages/${lang}/index.astro`));
  const keptKeys = [...home.flatMap((n) => componentKeys(component(n))), ...extraKept];
  return { entries, values: leftHomeValues(entries, leftKeys, keptKeys) };
}
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const homePage = (extra) =>
  `<!doctype html><html><head><title>t</title></head><body><main><section id="loop"><p>x</p></section>${extra}</main></body></html>`;
// A value in the forms of the review, as the build writes it: in an attribute (`title={t.x}`) and in
// a JSON script (`JSON.stringify(t.x)`) the value goes as it is, backticks included; in a paragraph
// it goes as InlineCode renders it, backticks as <code>.
const reviewForms = (v) => ({
  attribute: `<span title="${escHtml(v)}"></span>`,
  'JSON script': `<script type="application/json">${JSON.stringify({ d: v }).replace(/</g, '\\u003c')}</script>`,
  'paragraph of another section': `<section id="editions"><p>${escHtml(v).replace(/`([^`]*)`/g, '<code>$1</code>')}</p></section>`,
});

// Contract: fix round 3, C2 and C3: no value of a key the spec lists as gone from the home page
// (change 1) comes back anywhere in its raw HTML, in an attribute, a JSON script or a paragraph of
// another section, and the use cases do not come back without their id; the exclusion of values the
// page keeps never drops a key of that list. Regression: the exclusion rule of leftHomeValues widens
// (a looser piece rule, a short kept value) or the list of left keys shrinks, and a listed key stops
// being looked for, while check-home stays green on a clean page. Why the executor's test misses it:
// site-home-rules runs the exclusion and the search on values of its own; on the real i18n and
// components the list is computed only inside check-home, at build time, which CI does not run, and
// check-home fails on a shrunk list only when it is empty. The values with backticks in an attribute
// or a script are the case of R2-3 below, open, and are left out here.
// The oracle is written here, from the spec (change 1 and the answers and notes of change 2), and
// nothing recomputes it: the keys and the components that left the home page.
const SPEC_LEFT_KEYS = [
  'heroNotice', 'heroDescription', 'howSubtitle', 'pipelineExtra', 'pipelineExtraList', 'loopSetupLink',
  'editionsSubtitle2', 'codexDesc', 'hermesDesc', 'claudeDesc', 'cursorDesc', 'copilotDesc', 'opencodeDesc',
  'editionsCostTitle', 'editionsCostBody', 'editionsCodeTitle', 'editionsCodeBody', 'editionsFirstTitle',
  'editionsFirstBody', 'editionsLoopKit', 'editionsHermesScan', 'editionsGitDisclaimer',
];
const SPEC_LEFT_COMPONENTS = ['LiveDemo', 'UseCases', 'Features', 'ContactForm'];
test('check-home, on today\'s sources, looks for every value of every key the spec lists as gone, and finds each in the forms of the review', () => {
  for (const key of SPEC_LEFT_KEYS) assert.ok(LEFT_HOME_KEYS.includes(key), `home-rules lists ${key}`);
  for (const name of SPEC_LEFT_COMPONENTS) assert.ok(LEFT_HOME_COMPONENTS.includes(name), `home-rules lists ${name}`);
  for (const lang of ['en', 'pt-br']) {
    const { entries, values } = homeLookup(lang);
    assert.deepEqual(leftHomeProblems(homePage(''), values), [], `${lang}: the clean page`);
    let plainValues = 0;
    for (const key of SPEC_LEFT_KEYS) {
      const items = [entries[key]].flat();
      assert.ok(items.length > 0, `${lang}: ${key} has a value`);
      for (const v of items) {
        assert.ok(values.some((x) => x.key === key && x.value === v), `${lang}: ${key} is looked for`);
        for (const [name, extra] of Object.entries(reviewForms(v))) {
          if (v.includes('`') && name !== 'paragraph of another section') continue;
          if (!v.includes('`')) plainValues += 1;
          assert.ok(leftHomeProblems(homePage(extra), values).includes(key), `${lang}: ${key} in an ${name}`);
        }
      }
    }
    assert.ok(plainValues > 0, `${lang}: some listed value has no backtick`);
    // The use cases back as a block with no id: the text of every key UseCases reads.
    const uc = componentKeys(component('UseCases')).filter((k) => typeof entries[k] === 'string');
    assert.ok(uc.length > 0, 'UseCases reads keys');
    const block = `<div class="uc">${uc.map((k) => `<p>${escHtml(entries[k])}</p>`).join('')}</div>`;
    assert.ok(leftHomeProblems(homePage(block), values).some((k) => uc.includes(k)), `${lang}: the use cases with no id`);
  }
});

// Reaudit 2, finding R2-1 (open, low by the brief's ceiling): the kept keys are the keys the home
// components read, with no exception for the left ones, so a left key read again by a home
// component (Loop.astro with `{t.heroDescription}`, FinalCTA.astro with the UseCases keys) is a kept
// key, its value is not looked for, and the four checks and the site tests pass with it on the page.
// Contract: the same as above (a key of the spec list is never kept). Regression: today's code.
// Kept as todo so the case reruns without failing the suite; the fix turns it green.
test('a key the spec lists as gone is still looked for when a home component reads it again', { todo: 'R2-1, reaudit 2: open' }, () => {
  for (const lang of ['en', 'pt-br']) {
    for (const key of SPEC_LEFT_KEYS) {
      const { values } = homeLookup(lang, [key]);
      assert.ok(values.some((x) => x.key === key), `${lang}: ${key} read by a home component is no longer looked for`);
    }
  }
});

// Reaudit 2, finding R2-3 (open, defect): leftHomeProblems compares a value as the page reads it,
// backticks removed (shown), and an attribute or a script body as written, so a listed value with
// backticks (the bodies of two answers and the three notes, in both languages) put in an attribute
// or a JSON script the way the build writes it, backticks included, is not found, and check-home
// passes with it on the page. Contract: fix round 3, C3 (attributes and scripts included).
// Regression: today's code. Kept as todo so the case reruns without failing the suite; the fix
// turns it green.
test('a listed value with backticks is found in an attribute and in a JSON script, as the build writes them', { todo: 'R2-3, reaudit 2: open' }, () => {
  let seen = 0;
  for (const lang of ['en', 'pt-br']) {
    const { entries, values } = homeLookup(lang);
    for (const key of SPEC_LEFT_KEYS) {
      for (const v of [entries[key]].flat().filter((x) => x.includes('`'))) {
        seen += 1;
        const forms = reviewForms(v);
        for (const name of ['attribute', 'JSON script']) {
          assert.ok(leftHomeProblems(homePage(forms[name]), values).includes(key), `${lang}: ${key} in an ${name}`);
        }
      }
    }
  }
  assert.ok(seen > 0, 'some listed value has backticks');
});
