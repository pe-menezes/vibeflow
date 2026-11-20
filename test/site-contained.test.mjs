// Checks on the contained home page, from the sources and with no build:
//
// * the home pages run five sections, each a direct child of <main> outside any expression: hero,
//   pipeline, loop, editions, closing; the demo, the use cases, the list of the ten commands and the
//   contact form are not on them;
// * the commands pages end with the use cases, the three answers and the three notes of the
//   editions, and the contact form, in that order, after the reference;
// * what left each home section is gone from its component: the hero chip and long description,
//   the pipeline subtitle, step outputs and extra commands, the loop's link to its lists, the
//   edition descriptions, answers, notes and closing line;
// * an "@" inside a word of an install command is a break point unless a version follows it, and
//   the copy button keeps the exact command;
// * the Claude Code tabs open on the terminal one;
// * the type scale of the site sits on top of the design system tokens, in global.css.
//
// What only the built HTML can show lives in site/scripts/check-pipeline.mjs and check-home.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const component = (name) => read(`site/src/components/${name}.astro`);
const template = (src) =>
  src.replace(/^---[\s\S]*?\n---\n/, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
const frontmatter = (src) => /^---\n([\s\S]*?)\n---\n/.exec(src)?.[1] ?? '';
const styleOf = (src) => [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const LANGS = ['en', 'pt-br'];

const I18N_KEYS = new Set([...read('site/src/i18n/en.ts').matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
const usedKeys = (src) =>
  [...new Set([...src.replace(/<script[\s\S]*?<\/script>/g, '').matchAll(/\bt\.(\w+)/g)].map((m) => m[1]).filter((k) => I18N_KEYS.has(k)))].sort();

// The components a page puts in its <main>, in order, each with its lang attribute. Only a direct
// child counts: a component inside an expression (`{false && <UseCases lang="en" />}`) or inside
// another element is not one of the sections, and neither is anything else in <main>, which is
// returned as text so the test can say what it is.
function mainOf(page) {
  const main = /<main>([\s\S]*?)<\/main>/.exec(read(page))?.[1] ?? '';
  const children = main.replace(/<!--[\s\S]*?-->/g, '').trim().split(/(?<=\/>)\s*/).filter(Boolean);
  return children.map((child) => {
    const m = /^<([A-Z]\w*)\s+lang="([^"]+)"\s*\/>$/.exec(child);
    return m ? { name: m[1], lang: m[2] } : { name: `not a section: ${child.slice(0, 60)}`, lang: null };
  });
}

const HOME = ['Hero', 'HowItWorks', 'Loop', 'Editions', 'FinalCTA'];
const LEFT_HOME = ['LiveDemo', 'UseCases', 'Features', 'ContactForm'];
const ANSWERS_COMPONENT = 'EditionsAnswers';
const COMMANDS_PAGE = ['CommandsDocs', 'UseCases', ANSWERS_COMPONENT, 'ContactForm'];

test('the home pages run five sections: hero, pipeline, loop, editions, closing', () => {
  for (const lang of LANGS) {
    const page = `site/src/pages/${lang}/index.astro`;
    const sections = mainOf(page);
    assert.deepEqual(sections.map((s) => s.name), HOME, `${lang}: the sections of the home page`);
    for (const s of sections) assert.equal(s.lang, lang, `${lang}: ${s.name} in the page language`);
    const src = read(page);
    for (const name of LEFT_HOME) {
      assert.ok(!new RegExp(`components/${name}\\.astro`).test(src), `${lang}: the home page still imports ${name}`);
    }
  }
});

test('the commands pages end with the use cases, the answers and notes of the editions, and the contact form', () => {
  for (const lang of LANGS) {
    const sections = mainOf(`site/src/pages/${lang}/commands/index.astro`);
    assert.deepEqual(sections.map((s) => s.name), COMMANDS_PAGE, `${lang}: the sections of the commands page`);
    for (const s of sections) assert.equal(s.lang, lang, `${lang}: ${s.name} in the page language`);
  }
});

// The three answers (cost, code, first command) and the three notes of the editions.
const ANSWERS = ['editionsCost', 'editionsCode', 'editionsFirst'];
const NOTES = ['editionsLoopKit', 'editionsHermesScan', 'editionsGitDisclaimer'];

test('the answers and notes keep their keys, their markup and their order, with no new sentence', () => {
  const path = `site/src/components/${ANSWERS_COMPONENT}.astro`;
  assert.ok(existsSync(join(root, path)), `${path} exists`);
  const src = read(path);
  const markup = template(src);
  const dl = /<dl class="ed-answers">([\s\S]*?)<\/dl>/.exec(markup);
  assert.ok(dl, 'the answers are a definition list');
  assert.equal(markup.split('<dl').length, 2, 'one definition list');
  const pairs = [...dl[1].matchAll(/<dt>\{t\.(\w+)Title\}<\/dt>\s*<dd><InlineCode text=\{t\.(\w+)Body\} \/><\/dd>/g)];
  assert.deepEqual(pairs.map((m) => m[1]), ANSWERS, 'each title in a dt, cost, code, first command');
  assert.deepEqual(pairs.map((m) => m[2]), ANSWERS, 'each body in the dd after its title, through InlineCode');
  const notes = [...markup.matchAll(/<p class="ed-note"><InlineCode text=\{t\.(\w+)\} \/><\/p>/g)].map((m) => m[1]);
  assert.deepEqual(notes, NOTES, 'the three notes, through InlineCode, in today\'s order');
  assert.ok(markup.indexOf('<dl') < markup.indexOf('class="ed-note"'), 'the answers, then the notes');
  const expected = ['editionsLabel', ...ANSWERS.flatMap((b) => [`${b}Body`, `${b}Title`]), ...NOTES].sort();
  assert.deepEqual(usedKeys(src), expected, 'the label and the nine keys of today, nothing else');
  assert.match(markup, /<p class="gx-rotulo[^"]*">\{t\.editionsLabel\}<\/p>/, 'editionsLabel as the label of the block');
  assert.ok(!/<h[1-6]\b/.test(markup), 'no heading: the block adds no sentence');
});

test('the hero call is the subtitle alone, and the chip is gone', () => {
  const hero = component('Hero');
  assert.ok(!/\bt\.heroNotice\b/.test(hero), 'no heroNotice');
  assert.ok(!/\bt\.heroDescription\b/.test(hero), 'no heroDescription');
  assert.match(template(hero), /<p class="hero-lede"><b>\{t\.heroSubtitle\}<\/b><\/p>/, 'the call is the subtitle in bold');
});

test('the pipeline drops its subtitle, the step outputs and the extra commands, and keeps the link to the commands', () => {
  const how = component('HowItWorks');
  const markup = template(how);
  for (const key of ['howSubtitle', 'pipelineExtra', 'pipelineExtraList', 'heroQuickStart1Desc', 'heroQuickStart2Desc', 'heroQuickStart3Desc']) {
    assert.ok(!new RegExp(`\\bt\\.${key}\\b`).test(how), `HowItWorks no longer reads t.${key}`);
  }
  assert.ok(!/pipe-step__out|pipe-sub\b/.test(how), 'no step output, no subtitle, in the markup or the style');
  assert.match(how, /\bt\.heroQuickStart4Desc\.split\('\.'\)\[0\]/, 'the verdict still comes from the audit output');
  for (const n of [1, 2, 3, 4]) {
    assert.match(markup, /\{step\.title\}/);
    assert.match(how, new RegExp(`\\bt\\.pipelineStep${n}Desc\\b`), `step ${n} keeps its description`);
  }
  const links = [...markup.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
  assert.equal(links.length, 1, 'one link in the section');
  assert.match(links[0], /href=\{`\/\$\{lang\}\/commands`\}[^>]*>\{t\.featSeeAll\}<\/a>/, 'the link to the commands page, with featSeeAll');
});

test('the loop keeps one link, to the details, and no longer links to its lists', () => {
  const loop = component('Loop');
  const markup = template(loop);
  assert.ok(!/\bt\.loopSetupLink\b/.test(loop), 'no loopSetupLink');
  assert.ok(!/loop-setup|LOOP_SETUP_ID/.test(loop), 'no link to the lists');
  const links = [...markup.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
  assert.equal(links.length, 1, 'one link');
  assert.match(links[0], /href=\{t\.loopMoreHref\}[^>]*>\{t\.loopMore\}<\/a>/, 'the link to the details, with loopMore');
});

test('the editions keep the agents and their commands, under the tagline, and nothing else', () => {
  const ed = component('Editions');
  const markup = template(ed);
  assert.match(markup, /<p class="section-sub">\{t\.editionsTagline\}<\/p>/, 'the tagline as the subtitle');
  for (const key of ['editionsSubtitle2', ...ANSWERS.flatMap((b) => [`${b}Title`, `${b}Body`]), ...NOTES,
    'codexDesc', 'hermesDesc', 'claudeDesc', 'cursorDesc', 'copilotDesc', 'opencodeDesc']) {
    assert.ok(!new RegExp(`\\bt\\.${key}\\b`).test(ed), `Editions no longer reads t.${key}`);
  }
  assert.ok(!/ed-desc|ed-answers|ed-notes?\b|ed-tag|<dl\b/.test(ed), 'no description, answer, note or closing line, in the markup or the style');
  assert.equal(ed.split('t.editionsTagline').length, 2, 't.editionsTagline once');
});

// The display markup of each install command, from the cmdHtml function of Editions.astro run on
// the i18n values the component passes it. An "@" inside a word is a break point when what follows
// it is a name (vibeflow@vibeflow-marketplace): with no break there, the piece is wider than the
// command box on a phone and runs under the copy button. An "@" followed by a version (latest, next,
// or a number, as in setup-vibeflow@latest) is not: the package and its version read as one piece.
function editionCommands() {
  const ed = component('Editions');
  const fm = frontmatter(ed);
  const start = fm.indexOf('const escapeHtml');
  assert.ok(start >= 0, 'Editions.astro defines escapeHtml');
  const code = fm.slice(start).replace(/\((\w+): string\)/g, '($1)');
  const cmdHtml = new Function(`${code}\nreturn cmdHtml;`)();
  const keys = [...new Set([...template(ed).matchAll(/cmdHtml\(t\.(\w+)\)/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 6, 'the component renders the install commands through cmdHtml');
  const out = [];
  for (const lang of LANGS) {
    const src = read(`site/src/i18n/${lang}.ts`);
    for (const key of keys) {
      const value = new RegExp(`^\\s{2}${key}: '([^'\\n]*)',$`, 'm').exec(src)?.[1];
      assert.ok(value, `${lang}: ${key} is a plain string`);
      out.push({ lang, key, cmd: value, html: cmdHtml(value) });
    }
  }
  return out;
}

// What follows an "@" up to the next "/", "@" or the end of the word, and whether it is a version.
const afterAt = (word, i) => word.slice(i + 1).split(/[/@]/)[0];
const isVersion = (s) => s === 'latest' || s === 'next' || /^[0-9]/.test(s);

test('an "@" inside a word of an install command is a break point unless a version follows it, and the command reads the same', () => {
  const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  let named = 0;
  let versioned = 0;
  for (const { lang, key, cmd, html } of editionCommands()) {
    const where = `${lang}: ${key}`;
    // Nothing but parts, <wbr> and the spaces between words.
    assert.equal(html.replace(/<span class="ed-cmd-part">[^<]*<\/span>|<wbr>| /g, ''), '', `${where}: only parts, breaks and spaces`);
    assert.equal(unescape(html.replace(/<[^>]+>/g, '')), cmd, `${where}: the parts read the command`);
    const plainWords = cmd.split(' ');
    const words = html.split(/ (?=<span )/);
    assert.equal(words.length, plainWords.length, `${where}: one display word per word`);
    words.forEach((word, k) => {
      const text = plainWords[k];
      const pieces = word.split('<wbr>').map((p) => unescape(/^<span class="ed-cmd-part">([^<]*)<\/span>$/.exec(p)?.[1] ?? '\u0000'));
      assert.ok(!pieces.includes('\u0000'), `${where}: each break sits between two whole parts`);
      const breaks = new Set();
      let at = -1;
      for (const p of pieces.slice(0, -1)) breaks.add((at += p.length));
      [...text].forEach((ch, i) => {
        if (ch !== '@' || i === 0 || i === text.length - 1) return;
        const version = isVersion(afterAt(text, i));
        if (version) versioned += 1;
        else named += 1;
        assert.equal(breaks.has(i), !version, `${where}: the "@" at ${i} of "${text}" ${version ? 'is followed by a version and breaks' : 'has no break after it'}`);
      });
    });
  }
  assert.ok(named > 0, 'some command has an "@" inside a word followed by a name');
  assert.ok(versioned > 0, 'some command has an "@" inside a word followed by a version');
  // The copy button keeps the exact command: the same key as the text beside it.
  const markup = template(component('Editions'));
  const boxes = [...markup.matchAll(/<div class="ed-cmd">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  assert.ok(boxes.length >= 6, 'the command boxes');
  for (const box of boxes) {
    const shown = /cmdHtml\(t\.(\w+)\)/.exec(box)?.[1];
    assert.ok(shown, 'each box shows a command through cmdHtml');
    assert.match(box, new RegExp(`data-copy=\\{t\\.${shown}\\}`), `the copy button of ${shown} copies t.${shown}`);
  }
});

test('the Claude Code tabs open on the terminal one', () => {
  const markup = template(component('Editions'));
  const tabs = [...markup.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
  assert.equal(tabs.length, 2, 'two tabs');
  const selected = tabs.filter((t) => /aria-selected="true"/.test(t));
  assert.equal(selected.length, 1, 'one tab selected');
  assert.match(selected[0], /id="ed-tab-cli"/, 'the terminal tab is the selected one');
  assert.match(selected[0], /aria-controls="ed-panel-cli"/);
  const other = tabs.find((t) => t !== selected[0]);
  assert.match(other, /id="ed-tab-desktop"[^>]*aria-selected="false"/, 'the desktop tab is not');
  assert.ok(!/\shidden(\s|=|>)/.test(markup), 'without the script, both panels show');
});

// The scale of the site, over the design system tokens (spec, change 3).
const SCALE = {
  '--fs-label': '12.5px',
  '--fs-data': '13.5px',
  '--fs-meta': '15px',
  '--fs-ui': '16px',
  '--fs-body': '18px',
  '--fs-lede': 'clamp(20px, 1.7vw, 24px)',
};

// The declarations of the top-level rules with exactly this selector, comments out.
function declarations(css, selector) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = {};
  for (const m of text.matchAll(/(^|\})\s*([^{}@]+?)\s*\{([^{}]*)\}/g)) {
    if (m[2].trim() !== selector) continue;
    for (const d of m[3].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim().replace(/\s+/g, ' ');
    }
  }
  return out;
}

test('global.css lifts the type scale one step, on :root, over the design system tokens', () => {
  const css = read('site/src/styles/global.css');
  const rootDecl = declarations(css, ':root');
  for (const [token, value] of Object.entries(SCALE)) assert.equal(rootDecl[token], value, `${token} on :root`);
  // The design system sets these tokens on :root; global.css is imported after it, so the same
  // selector wins by order.
  const layout = read('site/src/layouts/Layout.astro');
  const tudo = layout.indexOf("import '../styles/genius/genius-tudo.css'");
  const noite = layout.indexOf("import '../styles/genius/genius-noite.css'");
  const global = layout.indexOf("import '../styles/global.css'");
  assert.ok(tudo >= 0 && noite > tudo && global > noite, 'global.css is imported after the design system');
  for (const file of ['genius-tudo.css', 'genius-noite.css']) {
    const ds = read(`site/src/styles/genius/${file}`).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of ds.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!Object.keys(SCALE).some((tok) => new RegExp(`${tok}\\s*:`).test(m[2]))) continue;
      assert.equal(m[1].trim(), ':root', `${file} sets a size token on ${m[1].trim()}, which global.css would not override`);
    }
  }
});

test('the hero call and the spec card list take the sizes of the approved mock-up', () => {
  const style = styleOf(component('Hero'));
  const lede = declarations(style, '.hero-lede');
  assert.equal(lede['font-size'], 'clamp(1.25rem, 2.1vw, 1.6rem)');
  assert.equal(lede['line-height'], '1.3');
  assert.equal(lede['max-width'], '22ch');
  assert.equal(declarations(style, '.flow-spec__list')['font-size'], 'clamp(.95rem, 1.3vw, 1.05rem)');
});

test('no page links to the sections that left the home page', () => {
  const files = ['Header', 'Footer', 'Hero', 'HowItWorks', 'Loop', 'Editions', 'FinalCTA', 'CommandsDocs', 'VibeflowAnatomy']
    .map((n) => `site/src/components/${n}.astro`);
  for (const f of files) {
    const src = read(f);
    assert.ok(!/\/#(demo|use-cases|contact|commands)\b|href="#(demo|use-cases|contact|commands)"/.test(src), `${f} links to a section that left the home page`);
  }
  assert.ok(!/LOOP_SETUP_ID/.test(frontmatter(component('Loop'))), 'Loop.astro no longer names the id of the lists');
});
