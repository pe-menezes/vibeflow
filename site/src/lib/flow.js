// The flow: lines that run from left to right. Work comes in loose, passes through the spec and
// comes out in order. Each line has a target (where it runs once in order) and an oscillation
// that the geometry removes gate after gate.
//
// The geometry lives in pure, exported functions (tested by property in test/site-flow.test.mjs).
// createFlow() draws it on a canvas and is the only part that touches the DOM; nothing runs when
// the module loads.

export const smoothstep = (a, b, x) => {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};
export const mix = (a, b, t) => a + (b - a) * t;
export const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Seeded random: the drawing is the same on every load.
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// Oscillation before any order, as a fraction of the band height.
export const HERO_MAX_AMPLITUDE = 0.3;
// The four pipeline gates (analyze, gen-spec, implement, audit), as fractions of the width.
export const PIPELINE_GATES = [0.14, 0.38, 0.62, 0.86];
// Where the front of the pipeline flow stops at each step, and past the last gate.
export const FRONT_STOPS = [0.14, 0.38, 0.62, 0.86, 1.04];

export function lineCount(mode, width) {
  if (width < 560) return 18;
  return mode === 'hero' ? 34 : 30;
}

// k is the line's place in the band, evenly spaced from 0 to 1; the rest shapes its oscillation.
export function createLines(count, random) {
  return Array.from({ length: count }, (_, i) => ({
    k: count > 1 ? i / (count - 1) : 0.5,
    f1: 6.283 / mix(300, 560, random()),
    f2: 6.283 / mix(130, 240, random()),
    f3: 6.283 / mix(56, 110, random()),
    p1: random() * 6.283,
    p2: random() * 6.283,
    p3: random() * 6.283,
    s1: mix(0.22, 0.5, random()),
    s2: mix(0.35, 0.8, random()),
    s3: mix(0.8, 1.4, random()),
    speed: mix(46, 96, random()),
    u: random(),
  }));
}

// The hero gate is the centre of the spec card; the lines settle on the ramp just before it.
export function heroGeometry(width) {
  const gate = (width < 560 ? 0.5 : 0.54) * width;
  return { gate, rampStart: gate - 0.34 * width, rampEnd: gate - 0.05 * width };
}

// Each pipeline gate orders the lines on a ramp that ends at the gate itself.
export function pipelineGeometry(width) {
  return { gates: PIPELINE_GATES.map((p) => p * width), margin: 0.045 * width };
}

function heroShape(line, x, width, height) {
  const { rampStart, rampEnd } = heroGeometry(width);
  const s = smoothstep(rampStart, rampEnd, x);
  return {
    target: mix(height * (0.04 + 0.92 * line.k), height * (0.22 + 0.56 * line.k), s),
    amplitude: height * HERO_MAX_AMPLITUDE * (1 - s),
    order: s,
  };
}

function pipelineShape(line, x, width, height) {
  const { gates, margin } = pipelineGeometry(width);
  const ramp = (g) => smoothstep(g - 2 * margin, g, x);
  const s1 = ramp(gates[0]);
  const s2 = ramp(gates[1]);
  const s3 = ramp(gates[2]);
  const bundle = Math.min(3, Math.floor(line.k * 4));
  const trio = Math.min(2, Math.floor(line.k * 3));
  const loose = height * (0.17 + 0.76 * line.k);
  const grouped = height * (0.27 + 0.18 * bundle) + (line.k * 4 - bundle - 0.5) * height * 0.07;
  const inLane = height * (0.41 + 0.26 * line.k);
  const inThree = height * (0.42 + 0.12 * trio) + (line.k * 3 - trio - 0.5) * 3.6;
  let target = mix(loose, grouped, s1);
  target = mix(target, inLane, s2);
  target = mix(target, inThree, s3);
  return {
    target,
    amplitude: height * HERO_MAX_AMPLITUDE * (1 - s1) + height * 0.045 * s1 * (1 - s2),
    order: s2,
  };
}

// Where the line runs (target), how much it still oscillates (amplitude) and how ordered it is
// (order, 0 to 1) at x.
export function shapeAt(mode, line, x, width, height) {
  return mode === 'hero' ? heroShape(line, x, width, height) : pipelineShape(line, x, width, height);
}

// The height of a line at x and time t (seconds). The pointer pushes away what is still loose,
// like a lens; what went through the spec does not move.
export function lineY(mode, line, x, t, width, height, pointer) {
  const { target, amplitude, order } = shapeAt(mode, line, x, width, height);
  let y = target;
  if (amplitude > 0) {
    y += amplitude * (
      0.55 * Math.sin(x * line.f1 + line.p1 + t * line.s1)
      + 0.3 * Math.sin(x * line.f2 + line.p2 - t * line.s2)
      + 0.15 * Math.sin(x * line.f3 + line.p3 + t * line.s3)
    );
  }
  if (pointer && order < 1) {
    const dx = x - pointer.x;
    const dy = y - pointer.y;
    y += 38 * (dy / Math.sqrt(dy * dy + 1200)) * Math.exp(-(dx * dx + dy * dy) / 30000) * (1 - order);
  }
  return y;
}

// How far the pinned pipeline scene has scrolled, 0 to 1.
export function scrollProgress(trackTop, trackHeight, stageHeight) {
  return clamp01(-trackTop / Math.max(1, trackHeight - stageHeight));
}

export function activeStep(progress) {
  return Math.min(3, Math.floor(4 * progress));
}

// Where the front of the pipeline flow is, as a fraction of the width: from one gate to the next
// on each quarter of the scroll, slightly past the gate.
export function flowFront(progress) {
  const p = clamp01(progress);
  const n = activeStep(p);
  return mix(FRONT_STOPS[n], FRONT_STOPS[n + 1], smoothstep(0, 1, p * 4 - n)) + 0.03;
}

// Draws the flow on a canvas with data-flow="hero" or "pipeline". Colours come from the design
// system tokens of the nearest [data-gx-acento]. Returns { goTo(front) } for the pipeline scene.
export function createFlow(canvas) {
  const mode = canvas.dataset.flow === 'pipeline' ? 'pipeline' : 'hero';
  const ctx = canvas.getContext('2d');
  if (!ctx) return { goTo() {} };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const shell = canvas.closest('[data-gx-acento]') ?? document.documentElement;
  const random = seededRandom(mode === 'hero' ? 7 : 19);
  const start = performance.now();
  let width = 1;
  let height = 1;
  let dpr = 1;
  let lines = [];
  let colors = {};
  let visible = true;
  let pointer = null;
  let frame = 0;
  let front = mode === 'hero' ? 0 : FRONT_STOPS[0] + 0.03;
  let frontTarget = mode === 'hero' ? 1 : FRONT_STOPS[0] + 0.03;

  function withAlpha(value, alpha) {
    ctx.fillStyle = value;
    const h = ctx.fillStyle;
    if (h.startsWith('#')) {
      return `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${alpha})`;
    }
    return h;
  }
  function readColors() {
    const cs = getComputedStyle(shell);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = {
      loose: withAlpha(v('--ink-4'), 0.46),
      held: withAlpha(v('--accent'), 0.92),
      looseDot: withAlpha(v('--ink-3'), 0.9),
      heldDot: withAlpha(v('--accent'), 1),
      wire: withAlpha(v('--ink-5'), 0.55),
      ink: withAlpha(v('--accent-ink'), 1),
    };
  }
  function measure() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = Math.max(1, r.width);
    height = Math.max(1, r.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const n = lineCount(mode, width);
    if (lines.length !== n) lines = createLines(n, random);
  }

  function draw(now) {
    const still = reduced.matches;
    const t = still ? 0 : (now - start) / 1000;
    if (still) front = frontTarget;
    else if (mode === 'hero') front = 1 - (1 - Math.min(1, (now - start) / 1700)) ** 3;
    else front += (frontTarget - front) * 0.14;
    const end = Math.min(width, front * width);
    const W = width;
    const H = height;
    const lens = still ? null : pointer;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';

    const { gates } = pipelineGeometry(W);
    if (mode === 'pipeline') {
      ctx.strokeStyle = colors.wire;
      ctx.lineWidth = 1;
      for (const gx of gates) {
        ctx.beginPath();
        ctx.moveTo(Math.round(gx) + 0.5, 26);
        ctx.lineTo(Math.round(gx) + 0.5, H);
        ctx.stroke();
      }
      if (end > gates[1]) {
        // The two scope rails, between gen-spec and implement.
        ctx.setLineDash([3, 5]);
        for (const y of [H * 0.35, H * 0.73]) {
          ctx.beginPath();
          ctx.moveTo(gates[1], y);
          ctx.lineTo(Math.min(end, gates[2]), y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }

    const cut = (mode === 'hero' ? heroGeometry(W).gate : gates[1]) / W;
    const gradient = ctx.createLinearGradient(0, 0, W, 0);
    gradient.addColorStop(0, colors.loose);
    gradient.addColorStop(Math.max(0, cut - 0.12), colors.loose);
    gradient.addColorStop(Math.min(1, cut + 0.01), colors.held);
    gradient.addColorStop(1, colors.held);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.15;
    for (const l of lines) {
      ctx.beginPath();
      ctx.moveTo(0, lineY(mode, l, 0, t, W, H, lens));
      for (let x = 6; x <= end; x += 6) ctx.lineTo(x, lineY(mode, l, x, t, W, H, lens));
      ctx.stroke();
    }
    // The grains: work moving along the lines, always left to right.
    for (const l of lines) {
      const x = (l.u * W + t * l.speed) % W;
      if (x > end) continue;
      const held = shapeAt(mode, l, x, W, H).order > 0.5;
      ctx.fillStyle = held ? colors.heldDot : colors.looseDot;
      ctx.beginPath();
      ctx.arc(x, lineY(mode, l, x, t, W, H, lens), held ? 2.2 : 1.7, 0, 6.283);
      ctx.fill();
    }
    if (mode === 'pipeline' && end > gates[3] + 30) {
      // Past audit, a check on each of the three lines that are left.
      const grow = Math.min(1, (end - gates[3] - 30) / 40);
      for (const k of [0, 1, 2]) {
        const x = gates[3] + 34;
        const y = H * (0.42 + 0.12 * k);
        ctx.fillStyle = colors.heldDot;
        ctx.beginPath();
        ctx.arc(x, y, 9 * grow, 0, 6.283);
        ctx.fill();
        ctx.strokeStyle = colors.ink;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x - 4 * grow, y);
        ctx.lineTo(x - 1 * grow, y + 3 * grow);
        ctx.lineTo(x + 4 * grow, y - 3.5 * grow);
        ctx.stroke();
      }
    }
  }

  function loop(now) {
    frame = 0;
    draw(now);
    if (visible && !reduced.matches) frame = requestAnimationFrame(loop);
  }
  const wake = () => {
    if (!frame) frame = requestAnimationFrame(loop);
  };

  readColors();
  measure();
  // Each observer is an improvement where the browser has it, never a requirement: without
  // ResizeObserver the window resize measures again, and without IntersectionObserver the flow
  // counts as always visible.
  const remeasure = () => { measure(); wake(); };
  if (typeof ResizeObserver === 'function') new ResizeObserver(remeasure).observe(canvas);
  else window.addEventListener('resize', remeasure);
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }).observe(canvas);
  }
  const recolor = () => { readColors(); wake(); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor);
  new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  reduced.addEventListener('change', wake);
  const area = canvas.parentElement ?? canvas;
  area.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  area.addEventListener('pointerleave', () => { pointer = null; });
  wake();
  return { goTo(value) { frontTarget = value; wake(); } };
}
