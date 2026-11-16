// Checks on the pipeline scene, the loop and the editions of the site (site/src/components/
// HowItWorks.astro, Loop.astro and Editions.astro, and site/src/lib/pipeline-scene.js).
// None of this needs the build; what only the built HTML can show lives in
// site/scripts/check-pipeline.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const component = (name) => read(`site/src/components/${name}.astro`);

// The commit the redesign of these three sections started from.
const BASE = '52704a8';

// The i18n keys each section used at BASE, taken from `git show BASE:<file>` with the
// extraction below (usedKeys). They are written here because a shallow clone, as in CI, does not
// carry BASE; the next test checks them against BASE wherever the history is there.
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
  Loop: [],
  Editions: ['copied'],
};

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

function baseAvailable() {
  try {
    execFileSync('git', ['cat-file', '-e', `${BASE}^{commit}`], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('the recorded key sets are the ones the sections used at the base commit', (t) => {
  if (!baseAvailable()) {
    t.diagnostic(`${BASE} is not in this clone; the recorded key sets stand as written`);
    return;
  }
  for (const name of Object.keys(BASE_KEYS)) {
    const old = execFileSync('git', ['show', `${BASE}:site/src/components/${name}.astro`], { cwd: root, encoding: 'utf8' });
    assert.deepEqual(usedKeys(old), [...BASE_KEYS[name]].sort(), `${name} at ${BASE}`);
  }
});

test('every key a section used at the base commit is still used, plus the ones the design adds', () => {
  for (const name of Object.keys(BASE_KEYS)) {
    const now = new Set(usedKeys(component(name)));
    for (const key of [...BASE_KEYS[name], ...NEW_KEYS[name]]) {
      assert.ok(now.has(key), `${name} no longer uses t.${key}`);
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

test('the pipeline scene: canvas, four gates, four steps with their output, and the extra commands', () => {
  const how = component('HowItWorks');
  const markup = template(how);
  assert.match(markup, /<canvas[^>]*data-flow="pipeline"[^>]*aria-hidden="true"/);
  assert.match(how, /from '\.\.\/lib\/pipeline-scene\.js'/);
  assert.match(markup, /<ol\b/, 'the steps are an ordered list');
  for (const n of [1, 2, 3, 4]) {
    for (const key of [`step${n}Title`, `pipelineStep${n}Desc`, `heroQuickStart${n}Desc`]) {
      assert.match(how, new RegExp(`\\bt\\.${key}\\b`), `uses t.${key}`);
    }
  }
  assert.match(markup, /pipelineExtra/);
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

test('the loop is a dark stage: the thesis struck on its second line, steps in sequence, blocks as lists', () => {
  const loop = component('Loop');
  const markup = template(loop);
  assert.match(markup, /<section[^>]*class="[^"]*\bgx-escuro\b[^"]*"[^>]*id="loop"|<section[^>]*id="loop"[^>]*class="[^"]*\bgx-escuro\b/);
  assert.match(loop, /t\.loopTitle\.split\(/, 'the title is split at its line break');
  assert.match(markup, /class="[^"]*\bloop-strike\b/, 'the second line carries the strike');
  assert.match(markup, /<ol\b/, 'the five steps are an ordered list');
  assert.match(markup, /<ul\b/, 'the blocks are lists');
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

test('the copy buttons speak the page language from i18n, not from literals', () => {
  const ed = component('Editions');
  assert.ok(!/Copied!|Copiado!/.test(ed), 'no literal copy feedback');
  assert.match(template(ed), /data-copied=\{t\.copied\}/);
});

test('the new files exist and carry no machine path', () => {
  const needle = ['', 'Users', ''].join('/');
  for (const f of [
    'site/src/components/HowItWorks.astro',
    'site/src/components/Loop.astro',
    'site/src/components/Editions.astro',
    'site/src/lib/pipeline-scene.js',
    'site/scripts/check-pipeline.mjs',
  ]) {
    assert.ok(existsSync(join(root, f)), `${f} exists`);
    assert.ok(!read(f).includes(needle), `${f} carries a machine path`);
  }
});
