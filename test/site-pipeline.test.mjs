// Checks on the pipeline scene, the loop and the editions of the site (site/src/components/
// HowItWorks.astro, Loop.astro and Editions.astro, and site/src/lib/pipeline-scene.js). The loop's
// four operation lists live in CommandsDocs.astro since they left the home page.
// None of this needs the build; what only the built HTML can show lives in
// site/scripts/check-pipeline.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const component = (name) => read(`site/src/components/${name}.astro`);

// The i18n keys each section used before the redesign of these three sections, extracted from
// the components of that time with usedKeys() below. This list is the oracle: it is written here
// and nothing recomputes it.
const BASE_KEYS = {
  HowItWorks: [
    'featSeeAll', 'howSubtitle', 'howTitle', 'pipelineExtra', 'pipelineExtraList', 'pipelineLabel',
    'pipelineStep1Desc', 'pipelineStep2Desc', 'pipelineStep3Desc', 'pipelineStep4Desc',
    'step1Title', 'step2Title', 'step3Title', 'step4Title',
  ],
  Loop: [
    'loopCompanyItems', 'loopCompanyTitle', 'loopHostsItems', 'loopHostsTitle', 'loopLabel', 'loopMore',
    'loopMoreHref', 'loopOnItems', 'loopOnTitle', 'loopReqItems', 'loopReqTitle',
    'loopStep1Desc', 'loopStep1Title', 'loopStep2Desc', 'loopStep2Title', 'loopStep3Desc', 'loopStep3Title',
    'loopStep4Desc', 'loopStep4Title', 'loopStep5Desc', 'loopStep5Title', 'loopSubtitle', 'loopTitle',
  ],
  Editions: [
    'claudeCliLabel', 'claudeDesc', 'claudeDesktopLabel', 'claudeInstall', 'claudeInstall2',
    'claudeStep1', 'claudeStep2', 'claudeStep4', 'claudeStep5', 'claudeTitle',
    'codexDesc', 'codexInstall', 'codexInstall2', 'codexTitle',
    'copilotDesc', 'copilotInstall', 'copilotTitle', 'copyLabel',
    'cursorDesc', 'cursorInstall', 'cursorTitle',
    'editionsGitDisclaimer', 'editionsHermesScan', 'editionsLabel', 'editionsLoopKit',
    'editionsSubtitle2', 'editionsTagline', 'editionsTitle2',
    'hermesDesc', 'hermesInstall', 'hermesInstall2', 'hermesTitle',
    'opencodeDesc', 'opencodeInstall', 'opencodeTitle',
  ],
};

// Keys that only the new design reads, on top of the ones of BASE.
const NEW_KEYS = {
  HowItWorks: ['heroQuickStart1Desc', 'heroQuickStart2Desc', 'heroQuickStart3Desc', 'heroQuickStart4Desc'],
  Loop: ['loopSetupLink'],
  Editions: [
    'copied',
    'editionsCodeBody', 'editionsCodeTitle', 'editionsCostBody', 'editionsCostTitle',
    'editionsFirstBody', 'editionsFirstTitle',
  ],
};

// Keys that left a section for another component: the loop's four operation lists moved to the
// implement entry of the commands page, and the three answers and three notes of the editions to
// their own block at the end of the commands page. They are read there and no longer in the section.
const MOVED_KEYS = {
  Loop: {
    to: 'CommandsDocs',
    keys: [
      'loopCompanyItems', 'loopHostsItems', 'loopOnItems', 'loopReqItems',
      'loopCompanyTitle', 'loopHostsTitle', 'loopOnTitle', 'loopReqTitle',
    ],
    shared: [],
  },
  Editions: {
    to: 'EditionsAnswers',
    keys: [
      'editionsCodeBody', 'editionsCodeTitle', 'editionsCostBody', 'editionsCostTitle',
      'editionsFirstBody', 'editionsFirstTitle',
      'editionsGitDisclaimer', 'editionsHermesScan', 'editionsLoopKit',
    ],
    // The label of the editions titles both blocks.
    shared: ['editionsLabel'],
  },
};

// Keys the contained home page no longer shows anywhere (spec, change 1): the pipeline subtitle,
// the step outputs and the extra commands line; the loop's link to its lists; the editions'
// subtitle and the description of each agent. They stay in i18n; no component of the home page or
// of the commands page reads them.
const REMOVED_KEYS = {
  HowItWorks: ['howSubtitle', 'pipelineExtra', 'pipelineExtraList', 'heroQuickStart1Desc', 'heroQuickStart2Desc', 'heroQuickStart3Desc'],
  Loop: ['loopSetupLink'],
  Editions: ['editionsSubtitle2', 'codexDesc', 'hermesDesc', 'claudeDesc', 'cursorDesc', 'copilotDesc', 'opencodeDesc'],
};
const PAGE_COMPONENTS = ['Hero', 'HowItWorks', 'Loop', 'Editions', 'FinalCTA', 'CommandsDocs', 'UseCases', 'EditionsAnswers', 'ContactForm'];

const I18N_KEYS = new Set([...read('site/src/i18n/en.ts').matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));

// The i18n keys a component reads as `t.<key>`, outside its <script> blocks.
function usedKeys(source) {
  const markup = source.replace(/<script[\s\S]*?<\/script>/g, '');
  return [...new Set([...markup.matchAll(/\bt\.(\w+)/g)].map((m) => m[1]).filter((k) => I18N_KEYS.has(k)))].sort();
}

// The template of a component: no frontmatter, no <script>, no <style>.
function template(source) {
  return source
    .replace(/^---[\s\S]*?\n---\n/, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');
}

test('every key a section used before the redesign is still used, moved or removed by name, plus the ones the design adds', () => {
  for (const name of Object.keys(BASE_KEYS)) {
    const now = new Set(usedKeys(component(name)));
    const moved = MOVED_KEYS[name] ?? { keys: [], shared: [] };
    const removed = REMOVED_KEYS[name] ?? [];
    const there = moved.to ? new Set(usedKeys(component(moved.to))) : new Set();
    for (const key of [...BASE_KEYS[name], ...NEW_KEYS[name]]) {
      if (moved.keys.includes(key) || moved.shared.includes(key)) {
        assert.ok(there.has(key), `${moved.to} does not use t.${key}, moved from ${name}`);
      }
      if (moved.keys.includes(key) || removed.includes(key)) assert.ok(!now.has(key), `${name} still uses t.${key}`);
      else assert.ok(now.has(key), `${name} no longer uses t.${key}`);
    }
  }
  // A removed key is read by no component of the two pages it could show on.
  for (const key of Object.values(REMOVED_KEYS).flat()) {
    const readers = PAGE_COMPONENTS.filter((n) => n !== 'Hero' || !/^heroQuickStart/.test(key)).filter((n) => usedKeys(component(n)).includes(key));
    assert.deepEqual(readers, [], `t.${key} is still read`);
  }
  // Each removed or moved key is one the section used before, and a key is either moved or removed.
  for (const [name, keys] of Object.entries(REMOVED_KEYS)) {
    for (const key of keys) {
      assert.ok([...BASE_KEYS[name], ...NEW_KEYS[name]].includes(key), `${key} was not used by ${name}`);
      assert.ok(!(MOVED_KEYS[name]?.keys ?? []).includes(key), `${key} both moved and removed`);
    }
  }
});

test('the two languages carry the same keys', () => {
  const keys = (file) => [...read(file).matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(keys('site/src/i18n/pt-br.ts'), keys('site/src/i18n/en.ts'));
});

// mulberry32: the test's own generator, so cases are generated and not picked by hand.
function generator(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const CASES = 400;

test('unpinned, the scene shows everything: all gates and steps lit, the flow drawn to the end', async () => {
  const { sceneState } = await import('../site/src/lib/pipeline-scene.js');
  const r = generator(11);
  for (let i = 0; i < CASES; i++) {
    const p = -0.5 + 2 * r();
    const s = sceneState(p, false);
    assert.deepEqual(s.gates, [true, true, true, true], `gates at ${p}`);
    assert.deepEqual(s.steps, [true, true, true, true], `steps at ${p}`);
    assert.equal(s.arrived, true, `arrived at ${p}`);
    assert.ok(s.front >= 1, `front ${s.front} reaches past the last gate at ${p}`);
  }
});

test('pinned, one step is lit per quarter of the scroll, gates light up to it, and the front never goes back', async () => {
  const { sceneState } = await import('../site/src/lib/pipeline-scene.js');
  const r = generator(23);
  const progresses = Array.from({ length: CASES }, () => -0.2 + 1.4 * r()).sort((a, b) => a - b);
  let previous = -Infinity;
  for (const p of progresses) {
    const s = sceneState(p, true);
    const clamped = Math.min(1, Math.max(0, p));
    const step = Math.min(3, Math.floor(4 * clamped));
    assert.equal(s.step, step, `step at ${p}`);
    assert.deepEqual(s.steps, [0, 1, 2, 3].map((i) => i === step), `steps at ${p}`);
    assert.deepEqual(s.gates, [0, 1, 2, 3].map((i) => i <= step), `gates at ${p}`);
    assert.equal(s.arrived, clamped > 0.93, `arrived at ${p}`);
    assert.ok(s.front >= previous - 1e-12, `front went back from ${previous} to ${s.front} at ${p}`);
    assert.ok(s.front > 0 && s.front <= 1.1, `front ${s.front} in the band at ${p}`);
    previous = s.front;
  }
});

test('the scene pins only where its CSS pins it: the same media query, under the motion class', async () => {
  const { SCENE_QUERY } = await import('../site/src/lib/pipeline-scene.js');
  const how = component('HowItWorks');
  const style = /<style>([\s\S]*?)<\/style>/.exec(how)?.[1] ?? '';
  const blocks = [...style.matchAll(/@media\s*([^{]+)\{([\s\S]*?)\n  \}/g)];
  const pinning = blocks.filter((m) => /position:\s*sticky/.test(m[2]));
  assert.equal(pinning.length, 1, 'one media block pins the stage');
  assert.equal(pinning[0][1].trim(), SCENE_QUERY.replace(/^\s*/, ''));
  for (const rule of pinning[0][2].matchAll(/([^{}]+)\{[^}]*\}/g)) {
    assert.match(rule[1], /html\.motion-ok/, `pinned rule without the motion class: ${rule[1].trim()}`);
  }
  assert.ok(!/position:\s*sticky/.test(style.replace(pinning[0][0], '')), 'sticky only inside the gated block');
});

test('the pipeline scene: canvas, four gates, four steps with their name and description, and the link to the commands', () => {
  const how = component('HowItWorks');
  const markup = template(how);
  assert.match(markup, /<canvas[^>]*data-flow="pipeline"[^>]*aria-hidden="true"/);
  assert.match(how, /from '\.\.\/lib\/pipeline-scene\.js'/);
  assert.match(markup, /<ol\b/, 'the steps are an ordered list');
  for (const n of [1, 2, 3, 4]) {
    for (const key of [`step${n}Title`, `pipelineStep${n}Desc`]) {
      assert.match(how, new RegExp(`\\bt\\.${key}\\b`), `uses t.${key}`);
    }
  }
  // Each step: its name and its description, and no output line.
  const step = /<li class="pipe-step"[^>]*>([\s\S]*?)<\/li>/.exec(markup)?.[1] ?? '';
  assert.deepEqual([...step.matchAll(/<(h3|p)\b[^>]*>/g)].map((m) => m[1]), ['h3', 'p'], 'a step is its name and its description');
  assert.match(how, /\bt\.heroQuickStart4Desc\.split\('\.'\)\[0\]/, 'the verdict, from the first sentence of the audit output');
  assert.match(markup, /\{t\.featSeeAll\}/);
});

test('nothing in the three sections starts hidden: no hidden attribute and every step lit at rest', () => {
  for (const name of ['HowItWorks', 'Loop', 'Editions']) {
    const markup = template(component(name));
    assert.ok(!/\shidden(\s|=|>)/.test(markup), `${name} renders a hidden attribute`);
    assert.ok(!/data-active="false"/.test(markup), `${name} renders something unlit`);
    const style = /<style>([\s\S]*?)<\/style>/.exec(component(name))?.[1] ?? '';
    assert.ok(!/display:\s*none/.test(style), `${name} hides something with display: none`);
  }
  const how = template(component('HowItWorks'));
  assert.match(how, /data-active="true"/, 'steps and gates are lit at rest');
});

test('the loop is a dark stage: the thesis struck on its second line, steps in sequence, a link to the details', () => {
  const loop = component('Loop');
  const markup = template(loop);
  assert.match(markup, /<section[^>]*class="[^"]*\bgx-escuro\b[^"]*"[^>]*id="loop"|<section[^>]*id="loop"[^>]*class="[^"]*\bgx-escuro\b/);
  assert.match(loop, /t\.loopTitle\.split\(/, 'the title is split at its line break');
  assert.match(markup, /class="[^"]*\bloop-strike\b/, 'the second line carries the strike');
  assert.match(markup, /<ol\b/, 'the five steps are an ordered list');
  // The operation lists moved to the commands page (site-reading.test.mjs checks where they went).
  assert.ok(!/<ul\b/.test(markup), 'no operation list left on the stage');
  // The home loop no longer links to the lists (spec, change 1): one link, to the details.
  assert.ok(!/commands#|LOOP_SETUP_ID/.test(loop), 'no link to the lists on the commands page');
  assert.equal([...markup.matchAll(/<a\b/g)].length, 1, 'one link on the stage');
  assert.match(markup, /href=\{t\.loopMoreHref\}/, 'the link to the details');
  assert.ok(!/gx-cartao|loop-block\b/.test(markup), 'no card inside the stage');
  assert.ok(!/fixed header/i.test(loop), 'no note about a fixed header that is gone');
});

test('the editions are a list with one row per agent, in today\'s order, and the Claude Code tabs', () => {
  const ed = component('Editions');
  const markup = template(ed);
  assert.match(markup, /class="[^"]*\bgx-lista\b/);
  const titles = [...markup.matchAll(/<h3>\{t\.(\w+Title)\}<\/h3>/g)].map((m) => m[1]);
  assert.deepEqual(titles, ['codexTitle', 'hermesTitle', 'claudeTitle', 'cursorTitle', 'copilotTitle', 'opencodeTitle']);
  assert.match(markup, /data-gx-abas/);
  const tabs = [...markup.matchAll(/<button[^>]*class="[^"]*\bgx-aba\b[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.equal(tabs.length, 2, 'two tabs');
  for (const tab of tabs) {
    assert.match(tab, /role="tab"/);
    const target = /aria-controls="([^"]+)"/.exec(tab)?.[1];
    assert.ok(target, 'each tab names its panel');
    assert.match(markup, new RegExp(`id="${target}"[^>]*data-gx-painel|data-gx-painel[^>]*id="${target}"`), `panel ${target}`);
  }
  // Every copy button copies an i18n value written straight into the attribute.
  const copies = [...markup.matchAll(/data-copy=\{([^}]+)\}/g)].map((m) => m[1]);
  assert.ok(copies.length >= 9, 'one copy button per command');
  for (const c of copies) assert.match(c, /^t\.\w+$/, `data-copy={${c}}`);
  assert.deepEqual(
    [...new Set(copies.map((c) => c.slice(2)))].sort(),
    ['claudeInstall', 'claudeInstall2', 'codexInstall', 'codexInstall2', 'copilotInstall', 'cursorInstall', 'hermesInstall', 'hermesInstall2', 'opencodeInstall'],
  );
});

// The three answers of the editions: cost, code, first command, in that order. They left the home
// page for a block of their own at the end of the commands page, before the three notes.
const ANSWERS = ['editionsCost', 'editionsCode', 'editionsFirst'];

test('the answers of the editions open their block between its label and the notes: a definition list, no h3', () => {
  const ed = component('EditionsAnswers');
  const markup = template(ed);
  const sub = markup.indexOf('{t.editionsLabel}');
  const rows = markup.indexOf('<div class="ed-notes">');
  assert.ok(sub >= 0 && rows > sub, 'the label, then the notes');
  const between = markup.slice(sub, rows);
  const dl = /<dl class="ed-answers">([\s\S]*?)<\/dl>/.exec(between);
  assert.ok(dl, 'a definition list between the label and the notes');
  assert.ok(!/<dl\b/.test(component('Editions')), 'none left in the editions of the home page');
  assert.equal(markup.split('<dl').length, 2, 'one definition list in the section');
  const pairs = [...dl[1].matchAll(/<dt>\{t\.(\w+)Title\}<\/dt>\s*<dd><InlineCode text=\{t\.(\w+)Body\} \/><\/dd>/g)];
  assert.deepEqual(pairs.map((m) => m[1]), ANSWERS, 'each title in a dt, in the order cost, code, first command');
  assert.deepEqual(pairs.map((m) => m[2]), ANSWERS, 'each body in the dd that follows its title, through InlineCode');
  for (const base of ANSWERS) {
    for (const key of [`${base}Title`, `${base}Body`]) assert.equal(ed.split(`t.${key}`).length, 2, `t.${key} once`);
  }
  assert.ok(!/<h[1-6]\b/.test(markup), 'no heading in the block: it adds no title of its own');
  assert.ok(!/aria-label/.test(dl[0]), 'no aria-label on the answers');
});

test('the copy buttons speak the page language from i18n, not from literals', () => {
  const ed = component('Editions');
  assert.ok(!/Copied!|Copiado!/.test(ed), 'no literal copy feedback');
  assert.match(template(ed), /data-copied=\{t\.copied\}/);
});

// The element opened by the first tag matching `opening` in `markup`, up to its matching </div>.
function divAt(markup, opening) {
  const start = markup.search(opening);
  if (start < 0) return '';
  const tags = /<div\b|<\/div>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m; (m = tags.exec(markup)); ) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return markup.slice(start, tags.lastIndex);
  }
  return markup.slice(start);
}

test('the link to the commands sits in the section, below the pinned stage and outside it', () => {
  const markup = template(component('HowItWorks'));
  const stage = divAt(markup, /<div[^>]*\sdata-scene-stage\b/);
  assert.ok(stage.length > 0, 'the stage is there');
  assert.ok(!/featSeeAll|<a\b/.test(stage), 'the link is inside the pinned stage');
  const track = divAt(markup, /<div[^>]*\sdata-scene-track\b/);
  const after = markup.slice(markup.indexOf(track) + track.length);
  assert.match(after, /<a href=\{`\/\$\{lang\}\/commands`\}[^>]*>\{t\.featSeeAll\}<\/a>[\s\S]*<\/section>/, 'the link follows the track, inside the section');
});

test('pinned, the stage is the screen, the band sits between BAND_MIN and BAND_MAX, and the content is centred', async () => {
  const { BAND_MIN, BAND_MAX } = await import('../site/src/lib/pipeline-scene.js');
  assert.ok(Number.isInteger(BAND_MIN) && BAND_MIN > 0);
  assert.ok(Number.isInteger(BAND_MAX) && BAND_MAX > BAND_MIN);
  const style = /<style>([\s\S]*?)<\/style>/.exec(component('HowItWorks'))?.[1] ?? '';
  const pinning = [...style.matchAll(/@media\s*([^{]+)\{([\s\S]*?)\n  \}/g)].find((m) => /position:\s*sticky/.test(m[2]));
  assert.ok(pinning, 'a media block pins the stage');
  const stageRule = /\.pipe-stage\s*\{([^}]*position:\s*sticky[^}]*)\}/.exec(pinning[2])?.[1] ?? '';
  assert.ok(stageRule, 'the pinned stage rule');
  assert.match(stageRule, new RegExp(`grid-template-rows:\\s*auto\\s+minmax\\(${BAND_MIN}px,\\s*${BAND_MAX}px\\)\\s+auto\\s*;`), 'the band row is minmax(BAND_MIN, BAND_MAX)');
  assert.match(stageRule, /(^|[\s;])height:\s*100vh/, 'the pinned stage has the height of the screen');
  assert.ok(!/min-height/.test(stageRule), 'not only a least height: the stage stops growing');
  assert.match(stageRule, /align-content:\s*(safe\s+)?center/, 'what the band leaves is shared above and below the content');
  assert.ok(!/\b\d+vh\b/.test(/\.pipe-band\s*\{([^}]*)\}/.exec(pinning[2])?.[1] ?? ''), 'no height of its own in vh for the pinned band');
});

test('where the scene pins, the stage and the track take the visible height (svh), after a vh fallback', async () => {
  const { SCENE_QUERY } = await import('../site/src/lib/pipeline-scene.js');
  const style = /<style>([\s\S]*?)<\/style>/.exec(component('HowItWorks'))?.[1] ?? '';
  const pinning = [...style.matchAll(/@media\s*([^{]+)\{([\s\S]*?)\n  \}/g)].find((m) => /position:\s*sticky/.test(m[2]));
  assert.ok(pinning, 'a media block pins the stage');
  assert.equal(pinning[1].trim(), SCENE_QUERY);
  for (const [selector, size] of [['pipe-track', 330], ['pipe-stage', 100]]) {
    const rule = new RegExp(`\\.pipe:not\\(\\[data-scene-loose\\]\\)\\s+\\.${selector}\\s*\\{([^}]*)\\}`).exec(pinning[2])?.[1] ?? '';
    assert.ok(rule, `the pinned ${selector} rule`);
    const heights = [...rule.matchAll(/(?:^|[\s;])height:\s*([^;]+);/g)].map((m) => m[1].trim());
    assert.deepEqual(heights, [`${size}vh`, `${size}svh`], `${selector}: height in vh, then in svh`);
  }
  // Outside the block nothing takes svh: the unit changes only where the scene pins.
  assert.ok(!/svh/.test(style.replace(pinning[0], '')), 'svh only inside the pinning block');
});

// A stand-in for the scene's DOM, laid out the way the component's CSS lays it out. The stage holds
// three children (head, band, steps) with a gap between them and a padding above and below;
// `rest` is all of that but the band. Pinned (query, motion class, and the root not marked loose)
// the stage is the screen, the band takes what is left between bandMin and bandMax, and the
// children sit in the middle; when they do not fit they start at the padding and run past the
// foot (the stage does not grow). Loose, the band has its own height and the stage its content's.
// The query's block also lays out the head in two columns, so `rest` is the content under the
// block (query and motion class) and `restOff` the content without it. `setMatches` changes the
// query with the page open; the caller then fires the media change.
// `ruler` is the declared height of the pinned stage, read from the ruler ([data-scene-ruler]):
// undefined leaves the ruler out of the scene (the stand-ins written before it, which answer null),
// and a number gives it that height under the query's block and none outside it, as the CSS does.
// With a ruler of some height the pinned stage takes it; without one, it takes the screen.
// `setScreen` moves innerHeight with the page open (the browser bars collapse or come back) while
// the ruler stays; the caller then fires the resize.
function fitHarness({ rest, restOff = rest, screen, matches, motion, looseAtStart, bandMin, bandMax, ruler }) {
  const attrs = new Set(looseAtStart ? ['data-scene-loose'] : []);
  const node = () => ({ dataset: {}, hidden: false });
  const gates = [node(), node(), node(), node()];
  const steps = [node(), node(), node(), node()];
  const end = node();
  const cssPinned = () => matches && motion && !attrs.has('data-scene-loose');
  const PAD = 32;
  const GAP = 24;
  const rulerHeight = () => (matches && motion ? ruler ?? 0 : 0);
  const pinnedHeight = () => (rulerHeight() > 0 ? rulerHeight() : screen);
  const laidOut = () => (matches && motion ? rest : restOff);
  const headHeight = () => Math.round(0.4 * (laidOut() - 2 * PAD - 2 * GAP));
  const stepsHeight = () => laidOut() - 2 * PAD - 2 * GAP - headHeight();
  const bandHeight = () => (cssPinned()
    ? Math.min(bandMax, Math.max(bandMin, pinnedHeight() - laidOut()))
    : Math.min(320, Math.max(180, Math.round(0.3 * screen))));
  const contentHeight = () => headHeight() + GAP + bandHeight() + GAP + stepsHeight();
  const stageHeight = () => (cssPinned() ? pinnedHeight() : 2 * PAD + contentHeight());
  let progress = 0;
  const trackHeight = () => (cssPinned() ? Math.round(3.3 * pinnedHeight()) : stageHeight());
  const trackTop = () => -progress * (trackHeight() - stageHeight());
  // Pinned, the stage sits at the top of the screen; loose, it scrolls with the track.
  const stageTop = () => (cssPinned() ? 0 : trackTop());
  const contentTop = () => stageTop() + (cssPinned() ? Math.max(PAD, (pinnedHeight() - contentHeight()) / 2) : PAD);
  const child = (offset, height) => ({
    getBoundingClientRect: () => {
      const top = contentTop() + offset();
      return { top, bottom: top + height(), height: height() };
    },
  });
  const band = Object.defineProperty(child(() => headHeight() + GAP, bandHeight), 'offsetHeight', { get: bandHeight });
  const stage = {
    get offsetHeight() { return stageHeight(); },
    children: [
      child(() => 0, headHeight),
      band,
      child(() => headHeight() + GAP + bandHeight() + GAP, stepsHeight),
    ],
    padding: { paddingTop: `${PAD}px`, paddingBottom: `${PAD}px` },
  };
  const track = { getBoundingClientRect: () => ({ top: trackTop(), height: trackHeight() }) };
  const one = { '[data-scene-track]': track, '[data-scene-stage]': stage, '[data-scene-band]': band, '[data-scene-end]': end };
  if (ruler !== undefined) {
    one['[data-scene-ruler]'] = { getBoundingClientRect: () => ({ top: 0, bottom: rulerHeight(), height: rulerHeight() }) };
  }
  const root = {
    querySelector: (selector) => one[selector] ?? null,
    querySelectorAll: (selector) => (selector === '[data-gate]' ? gates : selector === '[data-step]' ? steps : []),
    hasAttribute: (name) => attrs.has(name),
    toggleAttribute: (name, force = !attrs.has(name)) => { if (force) attrs.add(name); else attrs.delete(name); return force; },
  };
  const listeners = {};
  const media = [];
  const names = ['matchMedia', 'document', 'addEventListener', 'innerHeight', 'getComputedStyle'];
  const saved = Object.fromEntries(names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define('getComputedStyle', (el) => el.padding ?? { paddingTop: '0px', paddingBottom: '0px' });
  define('matchMedia', () => ({ get matches() { return matches; }, addEventListener: (_type, f) => media.push(f) }));
  define('document', { documentElement: { classList: { contains: (name) => name === 'motion-ok' && motion } } });
  define('addEventListener', (type, f) => { (listeners[type] ??= []).push(f); });
  define('innerHeight', screen);
  const restore = () => {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
  const fire = (type, p = progress) => {
    progress = p;
    for (const f of listeners[type] ?? []) f();
  };
  const changeMedia = () => { for (const f of media) f(); };
  const setMatches = (value) => { matches = value; };
  const setScreen = (value) => {
    screen = value;
    define('innerHeight', value);
  };
  return { root, steps, end, attrs, fire, changeMedia, setMatches, setScreen, restore, cssPinned, flow: { goTo() {} } };
}

test('pinned only where the stage fits the screen: the measure gives the same answer pinned and loose, and never flips', async () => {
  const { bindPipelineScene, BAND_MIN, BAND_MAX } = await import('../site/src/lib/pipeline-scene.js');
  for (const screen of [660, 700, 768, 900, 1080, 1300]) {
    // The content, with the band at its minimum, smaller than, equal to and taller than the screen,
    // and a short content that leaves the band at its ceiling on a tall screen.
    for (const slack of [-120, -1, 0, 1, 120, 400 - screen + BAND_MIN]) {
      const rest = screen - BAND_MIN + slack;
      const fits = slack <= 0;
      for (const [matches, motion] of [[true, true], [true, false], [false, true], [false, false]]) {
        for (const looseAtStart of [false, true]) {
          const where = `screen ${screen}, stage ${slack >= 0 ? '+' : ''}${slack} px, query ${matches}, motion ${motion}, loose at start ${looseAtStart}`;
          const h = fitHarness({ rest, screen, matches, motion, looseAtStart, bandMin: BAND_MIN, bandMax: BAND_MAX });
          try {
            bindPipelineScene(h.root, h.flow);
            const pinned = matches && motion && fits;
            for (const [type, p] of [['scroll', 0.4], ['resize', 0.4], ['scroll', 0.6], ['resize', 0.6], ['scroll', 0.1], ['change', 0.1], ['scroll', 0.4]]) {
              if (type === 'change') h.changeMedia();
              else h.fire(type, p);
              assert.equal(h.attrs.has('data-scene-loose'), !fits, `loose mark after ${type} (${where})`);
              assert.equal(h.cssPinned(), pinned, `pinned by the CSS after ${type} (${where})`);
              const lit = h.steps.map((s) => s.dataset.active);
              const step = Math.min(3, Math.floor(4 * p));
              const expected = pinned ? [0, 1, 2, 3].map((i) => String(i === step)) : ['true', 'true', 'true', 'true'];
              assert.deepEqual(lit, expected, `steps after ${type} at ${p} (${where})`);
              if (!pinned) assert.equal(h.end.hidden, false, `verdict shown loose (${where})`);
            }
          } finally {
            h.restore();
          }
        }
      }
    }
  }
});

// The query changes with the page open (the reduced motion preference turned on or off, or the
// screen crossing the query): the scene measures again, and the loose mark, the lit steps and the
// verdict are the ones of a page opened already in the new state. The content is laid out
// differently under the query and without it, so the measure before the change says nothing about
// the one after.
test('a media change with the page open measures again: the scene is what a page opened in that state shows', async () => {
  const { bindPipelineScene, BAND_MIN, BAND_MAX } = await import('../site/src/lib/pipeline-scene.js');
  const restFor = (screen, fits) => screen - BAND_MIN + (fits ? -120 : 120);
  const view = (h) => ({ loose: h.attrs.has('data-scene-loose'), lit: h.steps.map((s) => s.dataset.active), verdict: !h.end.hidden });
  let cases = 0;
  for (const screen of [700, 900, 1080]) {
    for (const fitsBefore of [true, false]) {
      for (const turnsOn of [true, false]) {
        for (const fitsAfter of [true, false]) {
          for (const p of [0.1, 0.6]) {
            const before = turnsOn ? 'restOff' : 'rest';
            const after = turnsOn ? 'rest' : 'restOff';
            const layout = { [before]: restFor(screen, fitsBefore), [after]: restFor(screen, fitsAfter) };
            const where = `screen ${screen}, ${fitsBefore ? 'fits' : 'loose'} before, query ${turnsOn ? 'starts' : 'stops'} matching, content ${fitsAfter ? 'fits' : 'does not fit'} after, at ${p}`;
            const common = { ...layout, screen, motion: true, bandMin: BAND_MIN, bandMax: BAND_MAX };
            const h = fitHarness({ ...common, matches: !turnsOn, looseAtStart: false });
            let changed;
            try {
              bindPipelineScene(h.root, h.flow);
              h.fire('scroll', p);
              assert.equal(h.attrs.has('data-scene-loose'), !fitsBefore, `loose mark before the change (${where})`);
              h.setMatches(turnsOn);
              h.changeMedia();
              changed = view(h);
            } finally {
              h.restore();
            }
            const fresh = fitHarness({ ...common, matches: turnsOn, looseAtStart: false });
            let opened;
            try {
              bindPipelineScene(fresh.root, fresh.flow);
              fresh.fire('scroll', p);
              opened = view(fresh);
            } finally {
              fresh.restore();
            }
            assert.equal(changed.loose, !fitsAfter, `loose mark after the change (${where})`);
            assert.deepEqual(changed, opened, `after the change, as a page opened in that state (${where})`);
            const pinned = turnsOn && fitsAfter;
            const step = Math.min(3, Math.floor(4 * p));
            assert.deepEqual(changed.lit, pinned ? [0, 1, 2, 3].map((i) => String(i === step)) : ['true', 'true', 'true', 'true'], `steps (${where})`);
            cases++;
          }
        }
      }
    }
  }
  assert.equal(cases, 48);
});

// Where the scene pins, the stage has the visible height (100svh), which a browser with collapsing
// bars keeps apart from innerHeight. The ruler ([data-scene-ruler]) carries the same declared
// height, so the measure compares the content with the smaller of the ruler and innerHeight; with
// no ruler, or a ruler of no height, it compares with innerHeight. Oracle: the scene pins if and
// only if the content, with the band at its least height, fits the smaller of the two.
test('the measure compares the content with the smaller of the ruler and innerHeight, from either start', async () => {
  const { bindPipelineScene, BAND_MIN, BAND_MAX } = await import('../site/src/lib/pipeline-scene.js');
  let cases = 0;
  for (const screen of [700, 900, 1248]) {
    for (const [name, ruler] of [['lower', screen - 71], ['equal', screen], ['higher', screen + 71], ['absent', undefined], ['zero', 0]]) {
      const small = ruler > 0 ? Math.min(screen, ruler) : screen;
      const large = ruler > 0 ? Math.max(screen, ruler) : screen;
      const contents = [['fits the smaller', -40], ['fits the smaller', 0]];
      if (large > small) contents.push(['fits only the larger', 1], ['fits only the larger', large - small]);
      contents.push(['fits neither', large - small + 1], ['fits neither', large - small + 120]);
      for (const [content, slack] of contents) {
        const fits = slack <= 0;
        for (const looseAtStart of [false, true]) {
          const where = `innerHeight ${screen}, ruler ${name} (${ruler}), content ${content} (${slack >= 0 ? '+' : ''}${slack} px), loose at start ${looseAtStart}`;
          const h = fitHarness({ rest: small - BAND_MIN + slack, screen, ruler, matches: true, motion: true, looseAtStart, bandMin: BAND_MIN, bandMax: BAND_MAX });
          try {
            bindPipelineScene(h.root, h.flow);
            for (const [type, p] of [['scroll', 0.4], ['resize', 0.4], ['scroll', 0.6], ['change', 0.6], ['scroll', 0.1]]) {
              if (type === 'change') h.changeMedia();
              else h.fire(type, p);
              assert.equal(h.attrs.has('data-scene-loose'), !fits, `loose mark after ${type} (${where})`);
              const step = Math.min(3, Math.floor(4 * p));
              const expected = fits ? [0, 1, 2, 3].map((i) => String(i === step)) : ['true', 'true', 'true', 'true'];
              assert.deepEqual(h.steps.map((s) => s.dataset.active), expected, `steps after ${type} at ${p} (${where})`);
              if (!fits) assert.equal(h.end.hidden, false, `verdict shown loose (${where})`);
            }
          } finally {
            h.restore();
          }
          cases++;
        }
      }
    }
  }
  // Per screen: 3 ruler heights with two heights apart (lower, higher) or equal give 6, 4 and 6
  // contents; absent and zero give 4 each. Times two starts and three screens.
  assert.equal(cases, 3 * 2 * (6 + 4 + 6 + 4 + 4));
});

// The browser bars collapse and come back: innerHeight goes up and down and the resize fires, while
// the ruler (the visible height) stays. As long as the ruler is the smaller of the two, the answer
// of the measure does not move, so the loose mark and the lit steps stay as they were.
test('with the ruler still, innerHeight going up and down does not flip the scene', async () => {
  const { bindPipelineScene, BAND_MIN, BAND_MAX } = await import('../site/src/lib/pipeline-scene.js');
  const view = (h) => ({ loose: h.attrs.has('data-scene-loose'), lit: h.steps.map((s) => s.dataset.active), verdict: !h.end.hidden });
  let cases = 0;
  for (const ruler of [660, 900, 1248]) {
    const walks = [
      [ruler, ruler + 71, ruler + 20, ruler + 71, ruler, ruler + 45],
      [ruler + 71, ruler, ruler + 71, ruler + 35, ruler, ruler + 71],
    ];
    for (const walk of walks) {
      for (const slack of [-60, 0, 1, 30, 71, 72, 200]) {
        const fits = slack <= 0;
        for (const looseAtStart of [false, true]) {
          for (const p of [0.1, 0.6]) {
            const where = `ruler ${ruler}, innerHeight ${walk.join(' > ')}, content ${slack >= 0 ? '+' : ''}${slack} px over the ruler, loose at start ${looseAtStart}, at ${p}`;
            const h = fitHarness({ rest: ruler - BAND_MIN + slack, screen: walk[0], ruler, matches: true, motion: true, looseAtStart, bandMin: BAND_MIN, bandMax: BAND_MAX });
            try {
              bindPipelineScene(h.root, h.flow);
              h.fire('scroll', p);
              const first = view(h);
              assert.equal(first.loose, !fits, `loose mark at load (${where})`);
              for (const height of walk.slice(1)) {
                h.setScreen(height);
                h.fire('resize', p);
                assert.deepEqual(view(h), first, `after innerHeight went to ${height} (${where})`);
                h.fire('scroll', p);
                assert.deepEqual(view(h), first, `scroll after innerHeight went to ${height} (${where})`);
              }
            } finally {
              h.restore();
            }
            cases++;
          }
        }
      }
    }
  }
  assert.equal(cases, 3 * 2 * 7 * 2 * 2);
});

test('the ruler: an empty hidden node at the scene root, as tall as the pinned stage where the scene pins, with no box elsewhere', async () => {
  const { SCENE_QUERY } = await import('../site/src/lib/pipeline-scene.js');
  const how = component('HowItWorks');
  const markup = template(how);
  const tag = /<div\b[^>]*\sdata-scene-ruler\b[^>]*>\s*<\/div>/.exec(markup)?.[0];
  assert.ok(tag, 'an empty ruler node');
  assert.match(tag, /\saria-hidden="true"/, 'the ruler is hidden from assistive technology');
  assert.match(markup, /<section[^>]*\sdata-pipeline-scene\b[^>]*>[\s\S]*\sdata-scene-ruler\b[\s\S]*<\/section>/, 'the ruler sits in the scene');
  const track = divAt(markup, /<div[^>]*\sdata-scene-track\b/);
  assert.ok(track.length > 0 && !/data-scene-ruler/.test(track), 'the ruler sits at the scene root, outside the track and the stage');
  const cls = /\sclass="([\w-]+)"/.exec(tag)?.[1];
  assert.ok(cls, 'the ruler has one class for its style');
  const ofRuler = new RegExp(`\\.${cls}(?![\\w-])`);
  const rules = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => ofRuler.test(m[1]));
  const heights = (body) => [...body.matchAll(/(?:^|[\s;])height:\s*([^;]+);/g)].map((m) => m[1].trim());

  const style = /<style>([\s\S]*?)<\/style>/.exec(how)?.[1] ?? '';
  const pinning = [...style.matchAll(/@media\s*([^{]+)\{([\s\S]*?)\n  \}/g)].find((m) => /position:\s*sticky/.test(m[2]));
  assert.ok(pinning, 'a media block pins the stage');
  assert.equal(pinning[1].trim(), SCENE_QUERY);
  const inside = rules(pinning[2]);
  assert.equal(inside.length, 1, 'one ruler rule where the scene pins');
  const [, selector, body] = inside[0];
  assert.ok(!/data-scene-loose/.test(selector), `the ruler does not depend on the loose mark: ${selector.trim()}`);
  assert.deepEqual(heights(body), ['100vh', '100svh'], 'the ruler has the declared height of the pinned stage: vh, then svh');
  assert.match(body, /position:\s*fixed\s*;/, 'out of the flow: it moves no other node and adds nothing to the scroll');
  assert.match(body, /(^|[\s;])width:\s*0\s*;/, 'no width');
  assert.match(body, /visibility:\s*hidden\s*;/, 'it draws nothing');
  assert.match(body, /pointer-events:\s*none\s*;/, 'it takes no pointer');

  const outside = rules(style.replace(pinning[0], ''));
  assert.ok(outside.length >= 1, 'a ruler rule outside the block');
  for (const [, sel, decls] of outside) {
    assert.deepEqual(heights(decls), [], `no height outside the block: ${sel.trim()}`);
    assert.match(decls, /display:\s*contents\s*;/, `no box outside the block: ${sel.trim()}`);
  }
});

// The strike's script in Loop.astro, run against a stand-in section and an IntersectionObserver
// that works out the visible share of each target from its geometry, as the browser does: one
// notification when observing starts, then one each time the share crosses a threshold.
function runLoopScript({ io, screen, sectionTop, sectionHeight, strikeTop, strikeHeight }) {
  const source = /<script>([\s\S]*?)<\/script>/.exec(component('Loop'))?.[1];
  assert.ok(source, 'Loop.astro has its script');
  const code = stripTypeScriptTypes(source);
  let scrollY = 0;
  const rect = (top, height) => ({ top: top - scrollY, bottom: top + height - scrollY, height });
  const classes = new Set();
  const strike = { rect: () => rect(sectionTop + strikeTop, strikeHeight) };
  const section = {
    rect: () => rect(sectionTop, sectionHeight),
    classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) },
    querySelector: (selector) => (selector === '.loop-strike' ? strike : null),
  };
  const observers = [];
  class FakeObserver {
    constructor(callback, options = {}) {
      this.callback = callback;
      this.thresholds = [].concat(options.threshold ?? 0).sort((a, b) => a - b);
      this.targets = new Map();
      observers.push(this);
    }
    observe(target) { this.targets.set(target, -1); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
    check() {
      const entries = [];
      for (const [target, previous] of this.targets) {
        const r = target.rect();
        const isIntersecting = r.top <= screen && r.bottom >= 0;
        const visible = Math.max(0, Math.min(r.bottom, screen) - Math.max(r.top, 0));
        const intersectionRatio = r.height > 0 ? visible / r.height : Number(isIntersecting);
        const index = isIntersecting ? this.thresholds.filter((x) => intersectionRatio >= x).length : 0;
        if (index === previous) continue;
        this.targets.set(target, index);
        entries.push({ target, isIntersecting, intersectionRatio });
      }
      if (entries.length) this.callback(entries, this);
    }
  }
  const document = { querySelectorAll: (selector) => (selector === '[data-loop]' ? [section] : []) };
  const window = io ? { IntersectionObserver: FakeObserver } : {};
  new Function('document', 'window', 'IntersectionObserver', code)(document, window, io ? FakeObserver : undefined);
  const scrollTo = (y) => {
    scrollY = y;
    for (const o of observers) o.check();
  };
  return { scrollTo, seen: () => classes.has('is-seen'), strike, section };
}

test('the strike runs when the struck line comes on screen, for any section height and any screen', () => {
  const r = generator(31);
  let cases = 0;
  for (const sectionHeight of [600, 900, 1500, 2657, 2803, 4000, 6000]) {
    for (const screen of [568, 640, 667, 740, 768, 844, 896, 900, 1024, 1080]) {
      const strikeTop = Math.round(90 + 200 * r());
      const strikeHeight = Math.round(40 + 130 * r());
      const sectionTop = screen + Math.round(800 + 2000 * r());
      const where = `section ${sectionHeight} px, screen ${screen} px, strike at ${strikeTop} (${strikeHeight} px)`;
      const page = runLoopScript({ io: true, screen, sectionTop, sectionHeight, strikeTop, strikeHeight });
      let seenAt = null;
      for (let y = 0; y <= sectionTop + sectionHeight + screen; y += Math.round(screen / 8)) {
        page.scrollTo(y);
        if (!page.seen()) continue;
        if (seenAt === null) {
          seenAt = y;
          const s = page.strike.rect();
          assert.ok(s.top < screen && s.bottom > 0, `the strike ran with the struck line off screen (${where})`);
        }
        assert.ok(y + screen > sectionTop, `the strike ran before the section came into view (${where})`);
      }
      assert.notEqual(seenAt, null, `the strike never ran (${where})`);
      cases++;
    }
  }
  assert.equal(cases, 70);
  const bare = runLoopScript({ io: false, screen: 844, sectionTop: 3000, sectionHeight: 2800, strikeTop: 150, strikeHeight: 90 });
  assert.equal(bare.seen(), true, 'without IntersectionObserver the strike is drawn at once');
});

test('a tab panel with nothing focusable inside takes the keyboard focus, with the design system ring', () => {
  const ed = component('Editions');
  const markup = template(ed);
  const panels = [...markup.matchAll(/<div[^>]*\sdata-gx-painel\b[^>]*>/g)].map((m) => ({ tag: m[0], body: divAt(markup.slice(m.index), /<div/) }));
  assert.equal(panels.length, 2);
  const focusable = /<(a|button|input|select|textarea)\b|tabindex="0"/;
  let bare = 0;
  for (const { tag, body } of panels) {
    const inner = body.slice(tag.length);
    if (focusable.test(inner)) continue;
    bare++;
    assert.match(tag, /\stabindex="0"/, `panel without anything focusable: ${tag}`);
  }
  assert.ok(bare >= 1, 'the Desktop panel has nothing focusable inside');
  const ring = /\.gx-aba:focus-visible[^{]*\{([^}]*)\}/.exec(read('site/src/styles/genius/genius-tudo.css'))?.[1];
  assert.ok(ring, 'the design system ring');
  const style = /<style>([\s\S]*?)<\/style>/.exec(ed)?.[1] ?? '';
  const own = /\.ed-panel:focus-visible\s*\{([^}]*)\}/.exec(style)?.[1];
  assert.ok(own, 'the panel draws a focus ring');
  const decls = (s) => s.split(';').map((d) => d.trim()).filter(Boolean).sort();
  assert.deepEqual(decls(own), decls(ring), 'the panel ring is the design system one');
});

test('the new files exist and carry no machine path', () => {
  const needle = ['', 'Users', ''].join('/');
  for (const f of [
    'site/src/components/HowItWorks.astro',
    'site/src/components/Loop.astro',
    'site/src/components/Editions.astro',
    'site/src/components/EditionsAnswers.astro',
    'site/src/lib/pipeline-scene.js',
    'site/scripts/check-pipeline.mjs',
  ]) {
    assert.ok(existsSync(join(root, f)), `${f} exists`);
    assert.ok(!read(f).includes(needle), `${f} carries a machine path`);
  }
});
