// Behavior probes from the independent audit of the new site, part 2 (the pipeline scene pinned to
// the scroll and the editions list). They run the real browser-side code against a small stand-in
// DOM, so they need neither the build nor a browser. Each case states, as comments, the contract it
// protects, the plausible regression that breaks it and why the implementer's tests miss it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// mulberry32, so the scroll positions are generated and not picked by hand.
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

// A stand-in for the scene's DOM and for the window globals bindPipelineScene() reads.
function sceneHarness({ matches, motion, trackHeight = 3300, stageHeight = 1000 }) {
  const node = () => ({ dataset: {}, hidden: false });
  const gates = [node(), node(), node(), node()];
  const steps = [node(), node(), node(), node()];
  const end = node();
  let top = 0;
  const track = { getBoundingClientRect: () => ({ top, height: trackHeight }) };
  const stage = { offsetHeight: stageHeight };
  const one = { '[data-scene-track]': track, '[data-scene-stage]': stage, '[data-scene-end]': end };
  const root = {
    querySelector: (selector) => one[selector] ?? null,
    querySelectorAll: (selector) => (selector === '[data-gate]' ? gates : selector === '[data-step]' ? steps : []),
  };
  const fronts = [];
  const flow = { goTo: (front) => fronts.push(front) };
  const listeners = {};
  const media = { matches, listeners: [] };
  const saved = {
    matchMedia: Object.getOwnPropertyDescriptor(globalThis, 'matchMedia'),
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    addEventListener: Object.getOwnPropertyDescriptor(globalThis, 'addEventListener'),
  };
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define('matchMedia', () => ({ get matches() { return media.matches; }, addEventListener: (_type, f) => media.listeners.push(f) }));
  define('document', { documentElement: { classList: { contains: (name) => name === 'motion-ok' && motion } } });
  define('addEventListener', (type, f) => { (listeners[type] ??= []).push(f); });
  const restore = () => {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
  const scrollTo = (progress) => {
    top = -progress * (trackHeight - stageHeight);
    for (const f of listeners.scroll ?? []) f();
  };
  const changeMedia = (value) => {
    media.matches = value;
    for (const f of media.listeners) f();
  };
  const lit = (list) => list.map((n) => n.dataset.active);
  return { root, flow, fronts, gates, steps, end, scrollTo, changeMedia, restore, lit };
}

// Contract: on a wide, tall screen with motion allowed, the scroll drives the scene in the page:
// at progress p (the share of the track scrolled past the pinned stage) the step lit is the
// floor of 4p (capped at 3) and only it, the gates are lit up to it, the verdict shows only past
// 0.93, the flow front handed to the canvas is flowFront(p) of src/lib/flow.js, and all of it
// follows the scroll back when the reader scrolls up.
// Breaks when: the scroll listener is dropped, the steps get the gates' state (all lit up to the
// current one), the verdict's `hidden` is inverted, the canvas is not told the front, the progress
// is measured without the stage height, or the pin ignores the media query or the motion class.
// Not covered by: test/site-pipeline.test.mjs exercises only the pure sceneState(); nothing runs
// bindPipelineScene(), the one part that writes to the page, and every mutant of it listed above
// survives the implementer's tests (measured by the audit on a scratch copy).
test('pipeline scene: the scroll lights one step per quarter, gates up to it and the verdict at the end, and follows the scroll back', async () => {
  const { bindPipelineScene, ARRIVAL } = await import('../../site/src/lib/pipeline-scene.js');
  const { flowFront } = await import('../../site/src/lib/flow.js');
  const h = sceneHarness({ matches: true, motion: true });
  try {
    bindPipelineScene(h.root, h.flow);
    const r = generator(5);
    const up = Array.from({ length: 120 }, () => -0.1 + 1.2 * r()).sort((a, b) => a - b);
    for (const p of [...up, ...[...up].reverse()]) {
      h.scrollTo(p);
      const q = Math.min(1, Math.max(0, p));
      const step = Math.min(3, Math.floor(4 * q));
      assert.deepEqual(h.lit(h.steps), [0, 1, 2, 3].map((i) => String(i === step)), `steps at ${p}`);
      assert.deepEqual(h.lit(h.gates), [0, 1, 2, 3].map((i) => String(i <= step)), `gates at ${p}`);
      assert.equal(h.end.hidden, !(q > ARRIVAL), `verdict hidden at ${p}`);
      assert.ok(Math.abs(h.fronts.at(-1) - flowFront(q)) < 1e-9, `front ${h.fronts.at(-1)} at ${p}, expected ${flowFront(q)}`);
    }
  } finally {
    h.restore();
  }
});

// Contract: wherever the scene does not pin (the media query fails: narrow or short screen, or
// reduced motion; or the script that sets html.motion-ok did not run) the section reads as a
// normal one at any scroll: four steps and four gates lit, the verdict shown, the flow drawn past
// the last gate; and a media change while the page is open (rotating a tablet, turning on reduced
// motion) puts the scene back to that state.
// Breaks when: the pin check keeps only one of its two conditions, or the media listener is lost,
// leaving a narrow or reduced-motion reader with three dimmed steps and no verdict.
// Not covered by: the implementer's tests check sceneState(p, false) but never what decides
// `pinned`, nor the media listener.
test('pipeline scene: unpinned, at any scroll everything is lit and the verdict shows; a media change unpins a pinned scene', async () => {
  const { bindPipelineScene } = await import('../../site/src/lib/pipeline-scene.js');
  const { FRONT_STOPS } = await import('../../site/src/lib/flow.js');
  for (const [matches, motion] of [[false, true], [true, false], [false, false]]) {
    const h = sceneHarness({ matches, motion });
    try {
      bindPipelineScene(h.root, h.flow);
      for (const p of [0, 0.2, 0.45, 0.7, 0.9, 1]) {
        h.scrollTo(p);
        assert.deepEqual(h.lit(h.steps), ['true', 'true', 'true', 'true'], `steps at ${p} (query ${matches}, motion ${motion})`);
        assert.deepEqual(h.lit(h.gates), ['true', 'true', 'true', 'true'], `gates at ${p} (query ${matches}, motion ${motion})`);
        assert.equal(h.end.hidden, false, `verdict at ${p} (query ${matches}, motion ${motion})`);
        assert.ok(h.fronts.at(-1) > FRONT_STOPS[3], `front past the last gate at ${p}`);
      }
    } finally {
      h.restore();
    }
  }
  const h = sceneHarness({ matches: true, motion: true });
  try {
    bindPipelineScene(h.root, h.flow);
    h.scrollTo(0.4);
    assert.deepEqual(h.lit(h.steps), ['false', 'true', 'false', 'false'], 'pinned before the media change');
    h.changeMedia(false);
    assert.deepEqual(h.lit(h.steps), ['true', 'true', 'true', 'true'], 'unpinned after the media change');
    assert.equal(h.end.hidden, false, 'verdict shown after the media change');
  } finally {
    h.restore();
  }
});

// The copy buttons' script in Editions.astro, run as the browser runs it, against stand-in buttons.
async function runCopyScript({ fail = false } = {}) {
  const source = /<script>([\s\S]*?)<\/script>/.exec(read('site/src/components/Editions.astro'))?.[1];
  assert.ok(source, 'Editions.astro has its script');
  const code = stripTypeScriptTypes(source);
  const buttons = [
    { dataset: { copy: 'codex plugin marketplace add pe-menezes/vibeflow', copied: 'Copiado!' }, textContent: 'Copiar' },
    { dataset: { copy: 'npx setup-vibeflow@latest --cursor', copied: 'Copied!' }, textContent: 'Copy' },
  ].map((b) => ({ ...b, addEventListener(type, f) { if (type === 'click') this.onClick = f; } }));
  const clipboard = [];
  const timers = [];
  const document = { querySelectorAll: (selector) => (selector === 'button[data-copy]' ? buttons : []) };
  const navigator = { clipboard: { writeText: async (text) => { if (fail) throw new Error('denied'); clipboard.push(text); } } };
  const window = { setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; } };
  const clearTimeout = () => {};
  new Function('document', 'navigator', 'window', 'clearTimeout', code)(document, navigator, window, clearTimeout);
  return { buttons, clipboard, timers };
}

// Contract: a copy button writes its exact command (its data-copy, the i18n value) to the
// clipboard, says so with its data-copied (the i18n `copied` of the page language) and goes back
// to its label afterwards; when the clipboard refuses, it does not claim the copy.
// Breaks when: the script copies the button's text or a trimmed or rebuilt command instead of
// data-copy, puts back the old hard-coded "Copied!"/"Copiado!" or a single language, never restores
// the label, or writes the feedback before (or regardless of) the clipboard's answer, as the
// script at the base commit did.
// Not covered by: test/site-pipeline.test.mjs reads the template (data-copy={t.*},
// data-copied={t.copied}, no literal feedback) but never runs the click handler; copying
// btn.textContent instead of data-copy survives it (measured by the audit on a scratch copy).
test('editions: a copy button copies its exact data-copy, shows its data-copied and restores its label; a refused clipboard claims nothing', async () => {
  const ok = await runCopyScript();
  for (const button of ok.buttons) {
    assert.equal(typeof button.onClick, 'function', 'the script binds every copy button');
    const label = button.textContent;
    await button.onClick();
    assert.equal(ok.clipboard.at(-1), button.dataset.copy, 'the clipboard holds the exact command');
    assert.equal(button.textContent, button.dataset.copied, 'the button speaks the feedback of its page');
    const timer = ok.timers.at(-1);
    assert.ok(timer && timer.ms > 0, 'the feedback is timed');
    timer.f();
    assert.equal(button.textContent, label, 'the label comes back');
  }
  const refused = await runCopyScript({ fail: true });
  for (const button of refused.buttons) {
    const label = button.textContent;
    await button.onClick();
    assert.equal(button.textContent, label, 'no "copied" when the clipboard refused');
  }
});
