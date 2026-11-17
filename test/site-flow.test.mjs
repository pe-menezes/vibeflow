// Property tests for the flow geometry of the site (site/src/lib/flow.js).
// Inputs come from a seeded generator written here, so every run sees the same cases and no case
// is picked by hand. The oracles are written in this file, not imported from the module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HERO_MAX_AMPLITUDE,
  PIPELINE_GATES,
  activeStep,
  createFlow,
  createLines,
  flowFront,
  heroGeometry,
  lineCount,
  lineY,
  pipelineGeometry,
  scrollProgress,
  seededRandom,
  shapeAt,
} from '../site/src/lib/flow.js';

const CASES = 300;

// mulberry32: the test's own generator, independent of the module's.
function generator(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cases(seed, count, build) {
  const r = generator(seed);
  const between = (lo, hi) => lo + (hi - lo) * r();
  const int = (lo, hi) => Math.floor(between(lo, hi + 1));
  return Array.from({ length: count }, () => build({ r, between, int }));
}

// A band of the given size: width, height, lines and a time.
function band(mode, g) {
  const width = g.between(320, 2400);
  const height = g.between(160, 600);
  const count = g.r() < 0.5 ? lineCount(mode, width) : g.int(3, 60);
  const lines = createLines(count, seededRandom(g.int(1, 1e6)));
  const time = g.between(0, 600);
  return { width, height, lines, time };
}

const pointerIn = (g, width, height) => ({ x: g.between(-width, 2 * width), y: g.between(-height, 2 * height) });

test('lines are evenly spaced in k, from 0 to 1', () => {
  for (const c of cases(11, CASES, (g) => g.int(2, 80))) {
    const lines = createLines(c, seededRandom(c));
    assert.equal(lines.length, c);
    assert.equal(lines[0].k, 0);
    assert.equal(lines[c - 1].k, 1);
    for (let i = 1; i < c; i++) {
      assert.ok(Math.abs(lines[i].k - lines[i - 1].k - 1 / (c - 1)) < 1e-12, `k step at ${i} of ${c}`);
    }
  }
});

test('hero: after the gate every line is still, parallel and evenly spaced', () => {
  for (const c of cases(101, CASES, (g) => ({ ...band('hero', g), g }))) {
    const { width, height, lines, time, g } = c;
    const { gate } = heroGeometry(width);
    assert.ok(gate > 0 && gate < width, 'gate inside the band');
    const atGate = lines.map((l) => shapeAt('hero', l, gate, width, height).target);
    for (let j = 0; j < 8; j++) {
      const x = j === 0 ? gate : g.between(gate, width);
      const pointer = g.r() < 0.5 ? null : pointerIn(g, width, height);
      const t = j % 2 ? time : g.between(0, 600);
      const ys = lines.map((l, i) => {
        const s = shapeAt('hero', l, x, width, height);
        assert.equal(s.amplitude, 0, `amplitude after the gate (x=${x})`);
        assert.equal(s.order, 1, `order after the gate (x=${x})`);
        assert.equal(s.target, atGate[i], 'target does not change with x after the gate');
        const y = lineY('hero', l, x, t, width, height, pointer);
        assert.equal(y, s.target, 'the line sits on its target, at any time and pointer');
        return y;
      });
      if (ys.length > 1) {
        const step = ys[1] - ys[0];
        assert.ok(step > 0, 'lines are distinct and ordered by k');
        for (let i = 2; i < ys.length; i++) {
          assert.ok(Math.abs(ys[i] - ys[i - 1] - step) <= 1e-9 * height, 'equal spacing');
        }
      }
    }
  }
});

test('hero: well before the gate the oscillation is the maximum, and never above it', () => {
  for (const c of cases(202, CASES, (g) => ({ ...band('hero', g), g }))) {
    const { width, height, lines, g } = c;
    const { rampStart } = heroGeometry(width);
    const max = HERO_MAX_AMPLITUDE * height;
    assert.ok(max > 0);
    assert.ok(rampStart > 0, 'there is a loose stretch before the ramp');
    for (let j = 0; j < 8; j++) {
      const before = g.between(0, rampStart);
      const anywhere = g.between(0, width);
      for (const l of lines) {
        const s = shapeAt('hero', l, before, width, height);
        assert.equal(s.amplitude, max, `maximum amplitude well before the gate (x=${before})`);
        assert.equal(s.order, 0);
        assert.ok(shapeAt('hero', l, anywhere, width, height).amplitude <= max);
      }
    }
  }
});

test('hero: between the loose stretch and the gate the passage is continuous and order only grows', () => {
  for (const c of cases(303, CASES, (g) => ({ ...band('hero', g), g }))) {
    const { width, height, lines, g } = c;
    const { gate, rampStart, rampEnd } = heroGeometry(width);
    assert.ok(rampStart < rampEnd && rampEnd <= gate, 'the ramp ends at or before the gate');
    const span = rampEnd - rampStart;
    // No jump: over a step d, nothing moves more than twice its full range per ramp width.
    const lip = (range) => (2 * range) / span;
    const xs = Array.from({ length: 40 }, () => g.between(0, width)).sort((a, b) => a - b);
    for (const l of lines) {
      let prev = null;
      for (const x of xs) {
        const s = shapeAt('hero', l, x, width, height);
        assert.ok(s.order >= 0 && s.order <= 1);
        if (prev) {
          assert.ok(s.order >= prev.order, 'order never decreases along x');
          assert.ok(s.amplitude <= prev.amplitude, 'oscillation never grows along x');
        }
        prev = s;
        const d = g.between(1e-6, 1e-3) * width;
        const n = shapeAt('hero', l, x + d, width, height);
        assert.ok(Math.abs(n.target - s.target) <= lip(height) * d + 1e-9 * height, 'target is continuous');
        assert.ok(Math.abs(n.amplitude - s.amplitude) <= lip(height) * d + 1e-9 * height, 'amplitude is continuous');
        assert.ok(Math.abs(n.order - s.order) <= lip(1) * d + 1e-12, 'order is continuous');
      }
    }
  }
});

test('the pointer moves no line where the order is total, wherever it is', () => {
  for (const mode of ['hero', 'pipeline']) {
    for (const c of cases(mode === 'hero' ? 404 : 405, CASES, (g) => ({ ...band(mode, g), g }))) {
      const { width, height, lines, time, g } = c;
      const ordered = mode === 'hero' ? heroGeometry(width).gate : pipelineGeometry(width).gates[1];
      for (let j = 0; j < 10; j++) {
        const pointer = pointerIn(g, width, height);
        const after = g.between(ordered, width);
        const anywhere = g.between(0, width);
        for (const l of lines) {
          assert.equal(shapeAt(mode, l, after, width, height).order, 1, `${mode}: order is total past the gate`);
          assert.equal(
            lineY(mode, l, after, time, width, height, pointer),
            lineY(mode, l, after, time, width, height, null),
            `${mode}: pointer at (${pointer.x}, ${pointer.y}) moved a line at x=${after}`,
          );
          if (shapeAt(mode, l, anywhere, width, height).order === 1) {
            assert.equal(
              lineY(mode, l, anywhere, time, width, height, pointer),
              lineY(mode, l, anywhere, time, width, height, null),
            );
          }
        }
      }
    }
  }
});

test('the pointer does move a loose line next to it', () => {
  for (const c of cases(505, CASES, (g) => ({ ...band('hero', g), g }))) {
    const { width, height, lines, time, g } = c;
    const { rampStart } = heroGeometry(width);
    const l = lines[g.int(0, lines.length - 1)];
    const x = g.between(0, rampStart);
    const y = lineY('hero', l, x, time, width, height, null);
    const moved = lineY('hero', l, x, time, width, height, { x, y: y + g.between(4, 30) });
    assert.notEqual(moved, y, 'a loose line under the pointer is displaced');
  }
});

test('pipeline: order only grows along x, and the oscillation is zero after the second gate', () => {
  for (const c of cases(606, CASES, (g) => ({ ...band('pipeline', g), g }))) {
    const { width, height, lines, g } = c;
    const { gates } = pipelineGeometry(width);
    assert.deepEqual(gates, PIPELINE_GATES.map((p) => p * width));
    const xs = Array.from({ length: 40 }, () => g.between(0, width)).sort((a, b) => a - b);
    for (const l of lines) {
      let prev = -Infinity;
      for (const x of xs) {
        const s = shapeAt('pipeline', l, x, width, height);
        assert.ok(s.order >= 0 && s.order <= 1);
        assert.ok(s.order >= prev, 'order never decreases along x');
        prev = s.order;
      }
      for (let j = 0; j < 8; j++) {
        const x = j === 0 ? gates[1] : g.between(gates[1], width);
        const s = shapeAt('pipeline', l, x, width, height);
        assert.equal(s.amplitude, 0, `amplitude after the second gate (x=${x})`);
        assert.equal(lineY('pipeline', l, x, g.between(0, 600), width, height, null), s.target);
      }
    }
  }
});

test('pipeline: after the third gate exactly three bands are left', () => {
  for (const c of cases(707, CASES, (g) => ({ ...band('pipeline', g), g }))) {
    const { width, height, lines, g } = c;
    const { gates } = pipelineGeometry(width);
    for (let j = 0; j < 6; j++) {
      const x = j === 0 ? gates[2] : g.between(gates[2], width);
      const ys = lines.map((l) => shapeAt('pipeline', l, x, width, height).target).sort((a, b) => a - b);
      const gaps = ys.slice(1).map((y, i) => y - ys[i]).sort((a, b) => b - a);
      // Three bands: two gaps that dwarf every other gap between neighbouring lines.
      assert.ok(gaps.length >= 2);
      const third = gaps[2] ?? 0;
      assert.ok(gaps[1] > 3 * third, `two clear gaps (${gaps[0]}, ${gaps[1]}) over the rest (${third}) at x=${x}`);
      assert.ok(gaps[1] > 0.02 * height, 'the bands are visibly apart');
    }
  }
});

test('scroll progress stays in [0, 1] and follows the track', () => {
  for (const c of cases(808, CASES * 4, (g) => ({
    top: g.between(-5000, 5000),
    track: g.between(0, 6000),
    stage: g.between(0, 2000),
  }))) {
    const p = scrollProgress(c.top, c.track, c.stage);
    const expected = Math.min(1, Math.max(0, -c.top / Math.max(1, c.track - c.stage)));
    assert.ok(p >= 0 && p <= 1);
    assert.ok(Math.abs(p - expected) < 1e-12, `progress for ${JSON.stringify(c)}`);
  }
});

test('the active step is the floor of four times the progress, capped at 3', () => {
  const ps = cases(909, CASES * 4, (g) => g.between(0, 1));
  ps.push(0, 0.25, 0.5, 0.75, 1);
  for (const p of ps) assert.equal(activeStep(p), Math.min(3, Math.floor(4 * p)), `p=${p}`);
});

test('the front of the flow never recedes as the progress grows, and passes every gate', () => {
  for (const c of cases(1010, CASES, (g) => Array.from({ length: 50 }, () => g.between(0, 1)).sort((a, b) => a - b))) {
    let prev = -Infinity;
    for (const p of c) {
      const f = flowFront(p);
      assert.ok(f >= prev, `front receded at p=${p}`);
      prev = f;
    }
  }
  for (let n = 0; n < 4; n++) assert.ok(flowFront(n / 4) > PIPELINE_GATES[n], `front at step ${n} has reached gate ${n}`);
  assert.ok(flowFront(1) >= 1, 'at the end the front covers the whole band');
});

// ---------------------------------------------------------------------------------------------
// createFlow() against a stand-in canvas, in a browser with or without each observer.

// A browser just big enough for createFlow(): a canvas whose 2d context records the strokes it is
// asked for, animation frames run when the test says so, and window events.
function browser({ resizeObserver, intersectionObserver }) {
  const frames = [];
  const windowListeners = new Map();
  const rect = { width: 800, height: 300 };
  let strokes = 0;
  const ctx = new Proxy(
    { fillStyle: '#000000' },
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'stroke' || key === 'fill') return () => { strokes += 1; };
        // Any other call; what it returns stands in for a gradient too.
        return () => ({ addColorStop() {} });
      },
      set(target, key, value) {
        // A canvas normalises a colour it can parse to hex; the stand-in keeps a plain hex.
        target[key] = key === 'fillStyle' ? '#336699' : value;
        return true;
      },
    },
  );
  const shell = { getAttribute: () => null };
  const canvas = {
    dataset: { flow: 'pipeline' },
    width: 0,
    height: 0,
    getContext: () => ctx,
    closest: () => shell,
    parentElement: null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: rect.width, height: rect.height }),
    addEventListener: () => {},
  };
  const media = () => ({ matches: false, addEventListener: () => {} });
  const globals = {
    window: {
      devicePixelRatio: 1,
      addEventListener: (type, fn) => windowListeners.set(type, [...(windowListeners.get(type) ?? []), fn]),
    },
    document: { documentElement: shell },
    matchMedia: media,
    getComputedStyle: () => ({ getPropertyValue: () => '#336699' }),
    requestAnimationFrame: (fn) => frames.push(fn),
    cancelAnimationFrame: () => {},
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: resizeObserver ? class { observe() {} disconnect() {} } : undefined,
    IntersectionObserver: intersectionObserver ? class { observe() {} disconnect() {} } : undefined,
  };
  const saved = Object.fromEntries(Object.keys(globals).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [k, v] of Object.entries(globals)) {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  return {
    canvas,
    rect,
    get strokes() { return strokes; },
    // One round of the frames already asked for (a running loop asks for the next one).
    frame(now = 1000) {
      frames.splice(0).forEach((fn) => fn(now));
    },
    pending: () => frames.length,
    fire: (type) => (windowListeners.get(type) ?? []).forEach((fn) => fn({ type })),
    restore() {
      for (const [k, d] of Object.entries(saved)) {
        if (d) Object.defineProperty(globalThis, k, d);
        else delete globalThis[k];
      }
    },
  };
}

for (const resizeObserver of [true, false]) {
  for (const intersectionObserver of [true, false]) {
    const name = `ResizeObserver ${resizeObserver ? 'present' : 'absent'}, IntersectionObserver ${intersectionObserver ? 'present' : 'absent'}`;
    test(`createFlow: ${name}: nothing throws, the flow draws, goTo() still works, a resize measures again`, () => {
      const b = browser({ resizeObserver, intersectionObserver });
      try {
        let flow;
        assert.doesNotThrow(() => { flow = createFlow(b.canvas); }, 'createFlow throws');
        assert.equal(typeof flow?.goTo, 'function', 'createFlow returns goTo()');
        assert.equal(b.canvas.width, 800, 'the canvas is measured at once');
        b.frame();
        const drawn = b.strokes;
        assert.ok(drawn > 0, 'the flow draws');
        // goTo() wakes the loop and the next frame draws again.
        b.frame(1100);
        flow.goTo(0.9);
        assert.ok(b.pending() > 0, 'goTo() asks for a frame');
        b.frame(1200);
        assert.ok(b.strokes > drawn, 'the frame after goTo() draws');
        // The canvas grows: the observer or the window resize measures it again.
        // The stand-in observer never delivers, so only the case without it is measured here.
        b.rect.width = 1000;
        b.fire('resize');
        if (!resizeObserver) assert.equal(b.canvas.width, 1000, 'without ResizeObserver the window resize measures again');
      } finally {
        b.restore();
      }
    });
  }
}
