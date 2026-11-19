// Measures the built site in a headless Chrome, with the page's JavaScript off, and fails when any
// text is out of sight at rest. This is the proof behind check-build.mjs, which only reads the CSS
// as text: here Chrome lays the pages out and says where every piece of text ended up.
//
//   npm run measure                                   (in site/, after npm run build)
//   node site/scripts/measure-rendered.mjs [dist-dir]
//
// It serves the build output on 127.0.0.1, at a free port, and opens the seven pages at 390 and
// 1280 pixels wide, in the light and the dark theme. It measures each page at rest: once the fonts
// are in, every animation and transition with an end is taken to its end, and one with no end is
// paused at the start of its first cycle. Every run of text in the body and every pseudo-element
// that draws text must have a box (a text or a pseudo-element with boxes of its own has one, even
// when its element has display: contents), no display: none, visibility visible, an effective
// opacity above zero (its own times its ancestors'), a font size above zero, a fill that is not
// transparent (the computed -webkit-text-fill-color, unless background-clip: text paints the text
// with the background) and some part left on screen.
//
// What is left on screen comes from one pass up the chain, from the text to the root, with a
// rectangle that starts as the text's boxes. A box that holds the text (its containing block, read
// from position and paint containment) and cuts it, by overflow or paint containment, leaves the
// part inside it; a box that scrolls on an axis leaves nothing of what lies wholly before its
// origin, brings what lies wholly after its end into its own span, and leaves the part inside it of
// what crosses it. clip: rect() on an absolute or fixed box and a basic clip-path shape (inset(),
// rect(), xywh(), and polygon() by the rectangle around it) cut all the box paints, held or not; a
// text that only touches the edge of such a clip keeps it. A shape of no area cuts everything.
// Nothing left is "clipped away" or "out of reach". What is left must not
// lie wholly to the left, to the right or above, nor, for a text the screen holds through a fixed
// box, wholly below. A page with no text at all is a finding too. EXCEPTIONS lists what may be
// hidden, each with its reason.
//
// What it does not see, and so passes: filter: opacity(0), a transparent mask, an opaque box drawn
// over the text, transform: scale(0), a font too small to read, a colour equal to the background,
// a transparent background behind background-clip: text, and a clip-path given by path() or
// url(), whose area it does not work out. Its limits:
// * the containing block of a fixed or absolute box is read from position and paint containment
//   only; contain: layout, transform, filter and will-change on an ancestor do not count, so the
//   overflow of such an ancestor does not cut the box, and a text it cuts away passes;
// * the fill rule of a polygon() is not read, so a polygon whose area evenodd cancels out passes;
// * a box that scrolls is taken to run left to right and top to bottom: in a box that scrolls from
//   its end (direction: rtl, row-reverse or column-reverse) what lies before its origin is reported
//   out of reach although it can be scrolled to, which errs on the side of failing;
// * a circle() or ellipse() cuts only when a radius it gives in px or percent is zero: where it
//   lies is not worked out, so one that misses the text passes, and a radius given by a keyword
//   (closest-side, farthest-side) is not measured, so one of no radius passes too.
//
// Exit 0 when nothing is hidden; 1 when something is, with one line per finding naming the page,
// the width, the theme, the element and the reason; 2 when it cannot measure (no Chrome, no build,
// a file of the build it cannot read, a port its server cannot open), with one line, and no folder
// left behind. A Chrome that does not end when asked is killed. It needs Chrome, so it runs by hand
// and stays out of `npm run build`.
//
// hiddenReasons and findHidden decide "hidden, and why" from what Chrome measured, with no browser,
// so the suite tests them (test/site-measure.test.mjs). Everything that talks to Chrome sits below
// them, apart.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './make-assets.mjs';

export const PAGES = ['/', '/en/', '/pt-br/', '/en/commands/', '/en/anatomy/', '/pt-br/commands/', '/pt-br/anatomy/'];
export const WIDTHS = [390, 1280];
export const THEMES = ['light', 'dark'];
const HEIGHTS = { 390: 844, 1280: 900 };

// What may be hidden at rest: an element by id (#x) or class (.x), and everything inside it, or,
// when `element` names one (#x, .x or a tag name), only that element inside it and what it holds;
// optionally only at one width or in one theme, with the reason.
export const EXCEPTIONS = [
  { match: '#form-success', reason: 'the contact form success message, which a script shows after the form is sent' },
  // The header has one navigation per screen size, with the same links: each is hidden only at the
  // width where the other one shows.
  { match: '.desktop-only', width: 390, reason: 'the wide header navigation and its GitHub button; on a narrow screen the phone menu shows the same links' },
  { match: '#mobile-menu', width: 1280, reason: 'the phone menu; on a wide screen the header navigation shows the same links' },
  { match: '.flow-verdict', element: 'small', width: 390, reason: 'the note beside the verdict in the hero flow band, a decorative image hidden from screen readers, left out on a narrow screen for room' },
];

// ---------- Deciding, from what was measured ----------

// A target is one run of text or one pseudo-element that draws text:
//   { kind: 'text' | 'pseudo', element, text, boxes: [{ x, y, width, height }], chain }
// `boxes` are its text boxes in page coordinates (none when it has no box), and `chain` the computed
// style of the box that owns it (the text's element, or the pseudo-element itself) followed by each
// ancestor up to html: { element, id, classes, display, visibility, opacity, fontSize, color,
// textFillColor, backgroundClip, clip, clipPath, overflowX, overflowY, position, contain, box }.

const ROOTS = new Set(['html', 'body']);
const isRoot = (s) => ROOTS.has(s.element);
const zeroAlpha = (colour) => {
  const c = String(colour ?? '').trim();
  if (c === 'transparent') return true;
  const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(c);
  if (slash) return Number(slash[1]) === 0;
  const rgba = /^rgba\(\s*[^,]+,[^,]+,[^,]+,\s*([\d.]+)(%?)\s*\)$/.exec(c);
  return rgba ? Number(rgba[1]) === 0 : false;
};
const px = (v, of) => {
  const m = /^(-?[\d.]+)(px|%)?$/.exec(String(v).trim());
  if (!m) return null;
  return m[2] === '%' ? (Number(m[1]) / 100) * of : Number(m[1]);
};

// Whether a basic shape of clip-path, measured against the box (px, or percent of the box), has no
// area. A shape it cannot measure (path(), url(), a length it cannot read) counts as having area.
function shapeHasNoArea(path, w, h) {
  const shape = /^(inset|circle|ellipse|polygon|rect|xywh)\((.*)\)$/.exec(path.replace(/^[a-z-]+-box\s+|\s+[a-z-]+-box$/g, '').trim());
  if (!shape) return false;
  const [, name, args] = shape;
  const body = args.split(/\s+round\s/)[0].trim();
  const len = (v, of) => (v === undefined ? null : px(v === '0' ? '0px' : v, of));
  if (name === 'inset') {
    const [t, r = t, b = t, l = r] = body.split(/\s+/);
    const sum = (a, c, of) => (len(a, of) ?? 0) + (len(c, of) ?? 0);
    return sum(t, b, h) >= h || sum(l, r, w) >= w;
  }
  if (name === 'circle' || name === 'ellipse') {
    const radii = body.split(/\s+at\s/)[0].trim().split(/\s+/).filter(Boolean);
    if (name === 'circle') return len(radii[0], Math.hypot(w, h) / Math.SQRT2) === 0;
    return len(radii[0], w) === 0 || len(radii[1], h) === 0;
  }
  if (name === 'polygon') {
    // No area when every vertex lies on one line; a crossed polygon whose signed area cancels out
    // still covers ground, so the test is collinearity, not the shoelace sum.
    const points = body.split(/\s*,\s*/).filter((p) => !/^(nonzero|evenodd)$/.test(p)).map((p) => {
      const [x, y] = p.split(/\s+/);
      return [len(x, w), len(y, h)];
    });
    if (points.some(([x, y]) => x === null || y === null)) return false;
    const [a] = points;
    const b = points.find(([x, y]) => x !== a[0] || y !== a[1]);
    if (!b) return true;
    return points.every(([x, y]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) === 0);
  }
  if (name === 'rect') {
    const [t, r, b, l] = body.split(/\s+/);
    const edge = (v, auto, of) => (v === 'auto' ? auto : len(v, of));
    const [top, right, bottom, left] = [edge(t, 0, h), edge(r, w, w), edge(b, h, h), edge(l, 0, w)];
    if ([top, right, bottom, left].some((v) => v === null)) return false;
    return bottom <= top || right <= left;
  }
  const [, , cw, ch] = body.split(/\s+/);
  return len(cw, w) === 0 || len(ch, h) === 0;
}

// A rectangle { x0, x1, y0, y1 } in page coordinates; it is empty when it has no area. A clip
// region is taken as closed: a text that only touches its edge is not counted as cut away.
const rectOf = (b) => ({ x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height });
const meet = (a, b) => ({ x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1) });
const isEmpty = (r) => r.x1 <= r.x0 || r.y1 <= r.y0;
const isApart = (r) => r.x1 < r.x0 || r.y1 < r.y0;

// The region a basic clip-path shape lets through, in page coordinates, measured against the box
// (px, or percent of the box): a rectangle, 'none' when the shape has no area, or null when it
// cannot say (path(), url(), a length it cannot read), which cuts nothing. A polygon stands for
// the rectangle around it. A circle or an ellipse cuts only when it has no area: where it lies is
// not worked out.
function shapeRegion(path, box) {
  const { x: bx = 0, y: by = 0, width: w = 0, height: h = 0 } = box ?? {};
  if (shapeHasNoArea(path, w, h)) return 'none';
  const shape = /^(inset|circle|ellipse|polygon|rect|xywh)\((.*)\)$/.exec(path.replace(/^[a-z-]+-box\s+|\s+[a-z-]+-box$/g, '').trim());
  if (!shape) return null;
  const [, name, args] = shape;
  const body = args.split(/\s+round\s/)[0].trim();
  const len = (v, of) => (v === undefined ? null : px(v === '0' ? '0px' : v, of));
  const region = (x0, x1, y0, y1) => ([x0, x1, y0, y1].some((v) => v === null || Number.isNaN(v)) ? null : { x0: bx + x0, x1: bx + x1, y0: by + y0, y1: by + y1 });
  if (name === 'inset') {
    const [t, r = t, b = t, l = r] = body.split(/\s+/);
    const [top, right, bottom, left] = [len(t, h), len(r, w), len(b, h), len(l, w)];
    if ([top, right, bottom, left].includes(null)) return null;
    return region(left, w - right, top, h - bottom);
  }
  if (name === 'rect') {
    const [t, r, b, l] = body.split(/\s+/);
    const edge = (v, auto, of) => (v === 'auto' ? auto : len(v, of));
    return region(edge(l, 0, w), edge(r, w, w), edge(t, 0, h), edge(b, h, h));
  }
  if (name === 'xywh') {
    const [x, y, cw, ch] = body.split(/\s+/).map((v, i) => len(v, i % 2 ? h : w));
    if ([x, y, cw, ch].includes(null)) return null;
    return region(x, x + cw, y, y + ch);
  }
  if (name === 'polygon') {
    const points = body.split(/\s*,\s*/).filter((p) => !/^(nonzero|evenodd)$/.test(p)).map((p) => {
      const [x, y] = p.split(/\s+/);
      return [len(x, w), len(y, h)];
    });
    if (points.some(([x, y]) => x === null || y === null)) return null;
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return region(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys));
  }
  return null;
}

// The region a clip: rect() lets through on an absolute or fixed box (its offsets are from the top
// left corner of the box, auto standing for the edge): a rectangle, 'none' when it has no area, or
// null when the box has no such clip.
function clipRectRegion(s) {
  if (!/^(absolute|fixed)$/.test(s.position)) return null;
  const found = /^rect\(([^)]*)\)$/.exec(String(s.clip ?? 'auto').trim());
  if (!found) return null;
  const { x = 0, y = 0, width = 0, height = 0 } = s.box ?? {};
  const [top, right, bottom, left] = found[1].split(/\s*,\s*|\s+/).map((v, i) => (v === 'auto' ? [0, width, height, 0][i] : parseFloat(v)));
  if ([top, right, bottom, left].some((v) => Number.isNaN(v))) return null;
  if (bottom <= top || right <= left) return 'none';
  return { x0: x + left, x1: x + right, y0: y + top, y1: y + bottom };
}

// What clip: rect() and clip-path leave of a box and all it paints: a rectangle, 'none' or null.
function clipRegion(s) {
  const regions = [clipRectRegion(s), shapeRegion(String(s.clipPath ?? 'none').trim(), s.box)];
  if (regions.includes('none')) return 'none';
  const cut = regions.filter(Boolean);
  if (!cut.length) return null;
  const region = cut.reduce(meet);
  return isEmpty(region) ? 'none' : region;
}

// Paint containment (contain: paint, strict or content) cuts what leaves the box on both axes, as
// overflow: clip does, and holds absolute and fixed descendants.
const paintContained = (s) => /\b(paint|strict|content)\b/.test(String(s.contain ?? 'none'));
const scrolls = (v) => v === 'auto' || v === 'scroll';
const cuts = (v) => v === 'hidden' || v === 'clip';

// The fill that paints a text is transparent when its computed -webkit-text-fill-color (which is
// the colour unless it is set) has no alpha, and background-clip: text does not paint the text with
// the background instead.
const transparentFill = (s) => zeroAlpha(s.textFillColor || s.color) && !/\btext\b/.test(String(s.backgroundClip ?? ''));

// What one pass up the chain leaves of a text: the reason it is lost on the way, or the rectangle
// left and whether the screen holds it through a fixed box.
//
// The rectangle starts as the text's boxes. Each box that holds the text, its containing block in
// turn (an in-flow box is held by its parent, an absolute box by the nearest positioned or
// paint-contained ancestor, a fixed box by the nearest paint-contained ancestor or else by the
// screen), acts on it axis by axis: when it scrolls on the axis, what lies wholly before its origin
// is out of reach, what lies wholly after its end is brought into its span, and what crosses it is
// cut to the part inside; when it cuts on the axis (overflow hidden or clip, paint containment) the
// rectangle is cut to the part inside it. clip: rect() and clip-path cut every box of the chain,
// held or not, with what they paint. html and body hand their overflow to the viewport, which the
// off-screen test stands for. A text whose boxes have no area (font size 0) is not cut, so a cut
// says nothing of it.
function onePass(chain, boxes) {
  const sized = boxes.filter((b) => b.width > 0 && b.height > 0);
  let r = (sized.length ? sized : boxes).map(rectOf).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) }));
  let mode = 'in';
  for (const s of chain) {
    const contained = paintContained(s);
    const holds = mode === 'in' || (mode === 'abs' && s.position !== 'static') || contained;
    if (holds && !isRoot(s) && s.box) {
      const b = rectOf(s.box);
      for (const [lo, hi, overflow, side] of [['x0', 'x1', s.overflowX, 'left of'], ['y0', 'y1', s.overflowY, 'above']]) {
        if (scrolls(overflow)) {
          if (r[hi] <= b[lo]) return { lost: `out of reach, ${side} the scroll origin of ${s.element}` };
          r = r[lo] >= b[hi] ? { ...r, [lo]: b[lo], [hi]: b[hi] } : { ...r, [lo]: Math.max(r[lo], b[lo]), [hi]: Math.min(r[hi], b[hi]) };
        } else if (sized.length && (cuts(overflow) || contained)) {
          r = { ...r, [lo]: Math.max(r[lo], b[lo]), [hi]: Math.min(r[hi], b[hi]) };
          if (r[hi] <= r[lo]) return { lost: `clipped away by ${s.element}` };
        }
      }
    }
    const region = clipRegion(s);
    if (region === 'none') return { lost: `clipped away by ${s.element}` };
    if (region && sized.length) {
      r = meet(r, region);
      if (isApart(r)) return { lost: `clipped away by ${s.element}` };
    }
    // Who holds the next box: a box held is the one whose containing block comes next. Paint
    // containment holds what is inside the box, not the box itself.
    if (mode === 'abs' && s.position !== 'static') mode = 'in';
    if (contained) mode = 'in';
    if (s.position === 'absolute' && mode !== 'fixed') mode = 'abs';
    if (s.position === 'fixed') mode = 'fixed';
  }
  return { left: r, fixed: mode === 'fixed' };
}

// The reasons a target is out of sight, in a viewport { width, height }; none when it is in view.
export function hiddenReasons(target, viewport) {
  const { chain, boxes } = target;
  const owner = chain[0];
  const none = chain.find((s) => s.display === 'none');
  if (none) return [`display: none${none === owner ? '' : ` on ${none.element}`}`];
  if (!boxes.length) return ['no box'];
  const reasons = [];
  if (owner.visibility !== 'visible') reasons.push(`visibility: ${owner.visibility}`);
  if (Number(owner.opacity) === 0) reasons.push('opacity 0');
  else {
    const faded = chain.slice(1).find((s) => Number(s.opacity) === 0);
    if (faded) reasons.push(`opacity 0 on an ancestor (${faded.element})`);
  }
  if (parseFloat(owner.fontSize) === 0) reasons.push('font size 0');
  if (transparentFill(owner)) reasons.push('transparent colour');

  const { lost, left: r, fixed } = onePass(chain, boxes);
  if (lost) return [...reasons, lost];
  // Off screen: what is left wholly left of the page, right of the viewport or above the page, or,
  // when the screen holds it through a fixed box, wholly below the viewport.
  if (r.x1 <= 0) reasons.push('off screen to the left');
  else if (r.x0 >= viewport.width) reasons.push('off screen to the right');
  if (r.y1 <= 0) reasons.push('off screen above');
  else if (fixed && r.y0 >= viewport.height) reasons.push('off screen below');
  return reasons;
}

// Whether a box of the chain is the one a name points at: #id, .class or a tag name.
const named = (s, name) => {
  if (name[0] === '#') return s.id === name.slice(1);
  if (name[0] === '.') return (s.classes ?? []).includes(name.slice(1));
  return /^[\w-]+/.exec(s.element)?.[0] === name && !s.element.includes('::');
};

// Whether an exception covers a target seen at a width and in a theme: the block it matches and all
// it holds or, when it names an element, only that element inside the block and all it holds.
function excepted(target, width, theme, exceptions) {
  return exceptions.some((e) => {
    if (e.width !== undefined && e.width !== width) return false;
    if (e.theme !== undefined && e.theme !== theme) return false;
    const block = target.chain.findIndex((s) => named(s, e.match));
    if (block < 0) return false;
    return e.element === undefined || target.chain.slice(0, block).some((s) => named(s, e.element));
  });
}

// Every target out of sight in a list of measurements { page, width, theme, viewport, targets },
// leaving out what the exceptions cover. A page measured with no text at all is a finding too:
// nothing measured is nothing proved.
export function findHidden(measurements, exceptions = EXCEPTIONS) {
  const found = [];
  for (const { page, width, theme, viewport, targets } of measurements) {
    if (!targets.length) found.push({ page, width, theme, element: null, text: '', reasons: ['no text measured on the page'], chain: [] });
    for (const target of targets) {
      const reasons = hiddenReasons(target, viewport);
      if (reasons.length && !excepted(target, width, theme, exceptions)) {
        found.push({ page, width, theme, element: target.element, text: target.text, reasons, chain: target.chain });
      }
    }
  }
  return found;
}

const short = (text) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 48 ? `${t.slice(0, 47)}…` : t;
};
export const describeFinding = (f) => (f.element === null
  ? `${f.page} · ${f.width}px · ${f.theme} · ${f.reasons.join('; ')}`
  : `${f.page} · ${f.width}px · ${f.theme} · ${f.element} "${short(f.text)}": ${f.reasons.join('; ')}`);

// ---------- Talking to Chrome ----------

const STYLE_PROPS = [
  ['display', 'display'], ['visibility', 'visibility'], ['opacity', 'opacity'], ['font-size', 'fontSize'],
  ['color', 'color'], ['-webkit-text-fill-color', 'textFillColor'], ['clip', 'clip'], ['clip-path', 'clipPath'],
  ['overflow-x', 'overflowX'], ['overflow-y', 'overflowY'], ['position', 'position'], ['contain', 'contain'],
  ['background-clip', 'backgroundClip'],
];

// What the page script makes of one run of text or one pseudo-element with text, from what the page
// says of it: 'boxes' when it is measured with the boxes it has, which the snapshot leaves out
// because its element has no box of its own (display: contents); 'snapshot' when the snapshot
// measures it; 'no box' when nothing of it is drawn. The facts: `kind` ('text' or 'pseudo'),
// `rects` (the number of boxes of a text), `pseudoDisplay` (the display of a pseudo-element),
// `contents` (its element has display: contents), `drawn` (its element and every ancestor are
// drawn) and `boxedDrawn` (the nearest ancestor with a box is drawn, with what it holds). Like a
// text, a pseudo-element of an element with display: contents has a box of its own when that
// ancestor is drawn. It runs in the page, and is exported so the suite tests it.
export function unlaidVerdict({ kind, rects = 0, pseudoDisplay = 'inline', contents = false, drawn = false, boxedDrawn = false }) {
  if (kind === 'pseudo') {
    if (pseudoDisplay === 'none') return 'no box';
    return drawn || (contents && boxedDrawn) ? 'snapshot' : 'no box';
  }
  if (rects > 0 && contents && boxedDrawn) return 'boxes';
  if (rects > 0 && drawn) return 'snapshot';
  return 'no box';
}
// Elements whose text is never drawn by design: scripts, styles, templates, and the SVG title and
// description, which are read by assistive technology.
const UNDRAWN = ['script', 'style', 'template', 'title', 'desc'];

// The targets Chrome laid out, from a DOMSnapshot: text runs and the generated text of
// pseudo-elements in the body, with their text boxes and the computed style of their chain.
function snapshotTargets({ documents, strings }) {
  const doc = documents[0];
  const { nodes, layout, textBoxes } = doc;
  const str = (i) => (i >= 0 ? strings[i] : null);
  const name = (n) => str(nodes.nodeName[n]);
  const pseudo = new Set(nodes.pseudoType?.index ?? []);
  const uaShadow = new Set(nodes.shadowRootType?.index ?? []);
  const attrs = (n) => {
    const a = nodes.attributes[n] ?? [];
    const out = {};
    for (let i = 0; i < a.length; i += 2) out[str(a[i])] = str(a[i + 1]);
    return out;
  };
  const describe = (n) => {
    if (pseudo.has(n)) return `${describe(nodes.parentIndex[n])}${name(n)}`;
    const a = attrs(n);
    return `${name(n).toLowerCase()}${a.id ? `#${a.id}` : ''}${(a.class ?? '').split(/\s+/).filter(Boolean).map((c) => `.${c}`).join('')}`;
  };
  const boxOf = new Map();
  layout.nodeIndex.forEach((n, i) => { if (!boxOf.has(n)) boxOf.set(n, i); });
  const rect = ([x, y, width, height]) => ({ x, y, width, height });
  const styleOf = (n) => {
    const i = boxOf.get(n);
    const values = layout.styles[i].map(str);
    const a = pseudo.has(n) ? {} : attrs(n);
    const s = { element: describe(n), id: a.id ?? '', classes: (a.class ?? '').split(/\s+/).filter(Boolean) };
    STYLE_PROPS.forEach(([, key], k) => { s[key] = values[k]; });
    s.box = rect(layout.bounds[i]);
    return s;
  };
  const textBoxesOf = new Map();
  textBoxes.layoutIndex.forEach((li, k) => {
    if (!textBoxesOf.has(li)) textBoxesOf.set(li, []);
    textBoxesOf.get(li).push(rect(textBoxes.bounds[k]));
  });
  const targets = [];
  layout.nodeIndex.forEach((n, i) => {
    const text = str(layout.text[i]);
    if (!text || !text.trim()) return;
    const isPseudo = pseudo.has(n);
    if (!isPseudo && name(n) !== '#text') return;
    const owner = isPseudo ? n : nodes.parentIndex[n];
    const lineage = [];
    let inBody = false;
    for (let p = owner; p >= 0; p = nodes.parentIndex[p]) {
      if (uaShadow.has(p) || UNDRAWN.includes(name(p)?.toLowerCase())) return;
      if (name(p) === 'BODY') inBody = true;
      if (boxOf.has(p) && nodes.nodeType[p] === 1) lineage.push(p);
    }
    if (!inBody || !lineage.length || lineage[0] !== owner) return;
    targets.push({
      kind: isPseudo ? 'pseudo' : 'text',
      element: describe(owner),
      text,
      boxes: textBoxesOf.get(i) ?? [rect(layout.bounds[i])],
      chain: lineage.map(styleOf),
    });
  });
  return targets;
}

// Runs in the page (through the DevTools protocol, which works with the page's scripts off): the
// targets Chrome does not render, which a DOMSnapshot leaves out or keeps with the geometry of an
// earlier layout. Text runs with no box or whose element is skipped (display: none, or
// content-visibility: hidden on it or around it, as in a closed details), and pseudo-elements with
// text whose own display is none or whose element is skipped. A skipped text the snapshot also
// keeps comes out twice, once in view and once with no box, which reports it once.
const UNLAID = `(() => {
  const unlaidVerdict = ${unlaidVerdict.toString()};
  const UNDRAWN = new Set(${JSON.stringify(UNDRAWN)});
  const KEYS = ${JSON.stringify(STYLE_PROPS)};
  const describe = (el) => el.localName + (el.id ? '#' + el.id : '') + [...el.classList].map((c) => '.' + c).join('');
  const styleOf = (cs, el, element) => {
    const s = { element, id: element.includes('::') ? '' : el.id, classes: element.includes('::') ? [] : [...el.classList] };
    for (const [prop, key] of KEYS) s[key] = cs.getPropertyValue(prop);
    const r = el.getBoundingClientRect();
    s.box = { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
    return s;
  };
  const chainFrom = (el) => {
    const out = [];
    for (let e = el; e; e = e.parentElement) out.push(styleOf(getComputedStyle(e), e, describe(e)));
    return out;
  };
  const undrawn = (el) => { for (let e = el; e; e = e.parentElement) if (UNDRAWN.has(e.localName)) return true; return false; };
  // An element is drawn with what it holds when neither it nor an ancestor has display: none or
  // content-visibility: hidden (checkVisibility() covers the ancestors, not the element's own
  // content-visibility, which skips its children).
  const holdsDrawn = (el) => el.checkVisibility() && getComputedStyle(el).contentVisibility !== 'hidden';
  // An element with display: contents has no box of its own, so checkVisibility() says no; its
  // text is laid out in the box of the nearest ancestor that has one.
  const contents = (el) => getComputedStyle(el).display === 'contents';
  const boxedAncestor = (el) => { let e = el; while (e && contents(e)) e = e.parentElement; return e; };
  // The styles of a box-less element that do not reach its text are left out of its chain: opacity,
  // clipping, overflow and containment act on a box.
  const boxless = (s) => Object.assign(s, { opacity: '1', clip: 'auto', clipPath: 'none', overflowX: 'visible', overflowY: 'visible', contain: 'none' });
  const targets = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const boxedDrawn = (el) => { const boxed = boxedAncestor(el); return Boolean(boxed) && holdsDrawn(boxed); };
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!node.data.trim() || undrawn(el)) continue;
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()];
    const verdict = unlaidVerdict({ kind: 'text', rects: rects.length, contents: contents(el), drawn: holdsDrawn(el), boxedDrawn: boxedDrawn(el) });
    if (verdict === 'snapshot') continue;
    if (verdict === 'boxes') {
      // A text with boxes of its own is measured with them, whatever box its element lacks; the
      // snapshot leaves it out, because its element has no layout.
      const chain = chainFrom(el).map((s) => (s.display === 'contents' ? boxless(s) : s));
      const boxes = rects.map((r) => ({ x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }));
      targets.push({ kind: 'text', element: describe(el), text: node.data, boxes, chain });
      continue;
    }
    targets.push({ kind: 'text', element: describe(el), text: node.data, boxes: [], chain: chainFrom(el) });
  }
  for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
    if (undrawn(el)) continue;
    for (const which of ['::before', '::after']) {
      const cs = getComputedStyle(el, which);
      const content = cs.content;
      if (!content || /^(none|normal|""|'')$/.test(content.trim())) continue;
      // A pseudo-element with a box is in the snapshot, even when its element has display: contents.
      if (unlaidVerdict({ kind: 'pseudo', pseudoDisplay: cs.display, contents: contents(el), drawn: holdsDrawn(el), boxedDrawn: boxedDrawn(el) }) === 'snapshot') continue;
      const own = styleOf(cs, el, describe(el) + which);
      targets.push({ kind: 'pseudo', element: own.element, text: content.replace(/^["']|["']$/g, ''), boxes: [], chain: [own, ...chainFrom(el)] });
    }
  }
  return targets;
})()`;

// Runs in the page before it is measured, so it is measured at rest: every animation and
// transition with an end is taken to its end, and one with no end is paused at the start of its
// first cycle. Finishing one can start another (a later animation of the same element), so it
// goes round until none is left running, a few times at most.
const SETTLE = `(() => {
  for (let round = 0; round < 10; round += 1) {
    const running = document.getAnimations().filter((a) => a.playState !== 'finished' && !(a.playState === 'paused' && a.__settled));
    if (!running.length) return round;
    for (const a of running) {
      const timing = a.effect ? a.effect.getComputedTiming() : null;
      if (timing && Number.isFinite(timing.endTime)) a.finish();
      else { a.pause(); a.currentTime = timing ? timing.delay : 0; a.__settled = true; }
    }
  }
  return 10;
})()`;

// A DevTools protocol connection over the pipe Chrome opens with --remote-debugging-pipe. A call
// with no answer within `answerWithin` milliseconds fails.
function connect(proc, answerWithin = 60000) {
  const out = proc.stdio[3];
  const inp = proc.stdio[4];
  let next = 0;
  let buffer = '';
  const pending = new Map();
  const listeners = new Set();
  inp.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    for (let end = buffer.indexOf('\0'); end >= 0; end = buffer.indexOf('\0')) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (message.id !== undefined && pending.has(message.id)) {
        const { resolve: done, reject, method } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else done(message.result);
      } else if (message.method) {
        for (const listener of listeners) listener(message);
      }
    }
  });
  // A Chrome that exits, or a program that is not Chrome, fails every call still waiting.
  let closed = null;
  out.on('error', () => {});
  inp.on('error', () => {});
  proc.once('exit', (code, signal) => {
    closed = new Error(`Chrome exited (${code ?? signal}) without answering the DevTools protocol`);
    for (const { reject } of pending.values()) reject(closed);
    pending.clear();
  });
  const send = (method, params = {}, sessionId) => new Promise((done, reject) => {
    if (closed) { reject(closed); return; }
    next += 1;
    const id = next;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method}: no answer from Chrome in ${answerWithin / 1000} s`)); }, answerWithin);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); done(v); }, reject: (e) => { clearTimeout(timer); reject(e); }, method });
    out.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
  const until = (test, ms, what) => new Promise((done, reject) => {
    const timer = setTimeout(() => { listeners.delete(listener); reject(new Error(`timed out waiting for ${what}`)); }, ms);
    const listener = (message) => {
      if (test(message)) { clearTimeout(timer); listeners.delete(listener); done(message); }
    };
    listeners.add(listener);
  });
  return { send, until, on: (listener) => listeners.add(listener), off: (listener) => listeners.delete(listener) };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};

// Serves a build output on 127.0.0.1 at a free port (or at `port`); a folder answers with its
// index.html. A file it cannot read answers 500 and is kept in `server.failures`, which the measure
// turns into an error of one line; the server itself never throws. A port it cannot listen on is
// an error of one line.
function serve(dist, port = 0) {
  const failures = [];
  const server = createServer((req, res) => {
    let path;
    try {
      path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    try {
      let file = normalize(join(dist, path));
      if (file !== dist && !file.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) { res.writeHead(404).end(); return; }
      const body = readFileSync(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch (e) {
      failures.push(`the server could not read ${path} (${e.code ?? e.message})`);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  server.failures = failures;
  return new Promise((done, fail) => {
    server.once('error', (e) => fail(new Error(`the server could not listen on 127.0.0.1:${port} (${e.code ?? e.message})`)));
    server.listen(port, '127.0.0.1', () => done(server));
  });
}

// Stops a child process and returns once it is gone, or once it cannot be waited for any longer: it
// gets `grace` milliseconds to end on its own, then the signal to terminate and as long again, then
// SIGKILL and as long again. A child that never started returns at once.
export async function stopChild(proc, { grace = 5000 } = {}) {
  if (proc.pid === undefined) return;
  const ended = () => proc.exitCode !== null || proc.signalCode !== null;
  const exited = new Promise((done) => proc.once('exit', done));
  for (const signal of [null, 'SIGTERM', 'SIGKILL']) {
    if (ended()) return;
    if (signal) proc.kill(signal);
    let timer;
    await Promise.race([exited, new Promise((done) => { timer = setTimeout(done, grace); })]);
    clearTimeout(timer);
  }
}

// Opens one page at one width and theme, with scripts off and any later navigation of the page
// (the root page's refresh to /en/) refused, and returns what it measured.
async function measurePage(cdp, sessionId, origin, page, width, theme, failures = []) {
  const viewport = { width, height: HEIGHTS[width] };
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false }, sessionId);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] }, sessionId);
  let allowed = 1;
  const gate = (message) => {
    if (message.method !== 'Fetch.requestPaused' || message.sessionId !== sessionId) return;
    const { requestId, resourceType } = message.params;
    if (resourceType === 'Document' && allowed-- <= 0) cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }, sessionId).catch(() => {});
    else cdp.send('Fetch.continueRequest', { requestId }, sessionId).catch(() => {});
  };
  cdp.on(gate);
  try {
    const loaded = cdp.until((m) => m.method === 'Page.loadEventFired' && m.sessionId === sessionId, 30000, `${page} to load`);
    await cdp.send('Page.navigate', { url: `${origin}${page}` }, sessionId);
    await loaded;
    if (failures.length) throw new Error(`${page}: ${failures[0]}`);
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true }, sessionId);
    const settled = await cdp.send('Runtime.evaluate', { expression: SETTLE, returnByValue: true }, sessionId);
    if (settled.exceptionDetails) throw new Error(`${page}: ${settled.exceptionDetails.text}`);
    const snapshot = await cdp.send('DOMSnapshot.captureSnapshot', { computedStyles: STYLE_PROPS.map(([prop]) => prop) }, sessionId);
    const unlaid = await cdp.send('Runtime.evaluate', { expression: UNLAID, returnByValue: true }, sessionId);
    if (unlaid.exceptionDetails) throw new Error(`${page}: ${unlaid.exceptionDetails.text}`);
    const url = (await cdp.send('Runtime.evaluate', { expression: 'location.pathname', returnByValue: true }, sessionId)).result.value;
    if (url !== page) throw new Error(`${page}: the page moved to ${url} before it was measured`);
    return { page, width, theme, viewport, targets: [...snapshotTargets(snapshot), ...unlaid.result.value] };
  } finally {
    cdp.off(gate);
  }
}

// Every page at every width and theme, in one Chrome, with a throwaway profile in a folder under
// `tmp`. The server starts first, so a port it cannot listen on leaves nothing behind. Whatever
// happens, Chrome is stopped (killed when it does not end, see stopChild, with `grace`), the server
// is closed and the folder removed. `port` and `answerWithin` (the time a protocol call may take)
// are there for the tests.
export async function measureSite(chrome, dist, { port = 0, tmp = tmpdir(), grace = 5000, answerWithin = 60000 } = {}) {
  const server = await serve(dist, port);
  let work = null;
  let proc = null;
  try {
    work = mkdtempSync(join(tmp, 'vibeflow-measure-'));
    proc = spawn(chrome, [
      '--headless=new', '--remote-debugging-pipe', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${join(work, 'profile')}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    const failed = new Promise((_, reject) => proc.once('error', (e) => reject(new Error(`Chrome did not start: ${e.message}`))));
    const cdp = connect(proc, answerWithin);
    const { targetId } = await Promise.race([cdp.send('Target.createTarget', { url: 'about:blank' }), failed]);
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, undefined);
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: true }, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sessionId);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const measurements = [];
    for (const page of PAGES) {
      for (const width of WIDTHS) {
        for (const theme of THEMES) {
          measurements.push(await measurePage(cdp, sessionId, origin, page, width, theme, server.failures));
          if (server.failures.length) throw new Error(`${page}: ${server.failures[0]}`);
        }
      }
    }
    await cdp.send('Browser.close').catch(() => {});
    return measurements;
  } finally {
    if (proc) await stopChild(proc, { grace });
    server.closeAllConnections?.();
    await new Promise((done) => server.close(() => done()));
    if (work) rmSync(work, { recursive: true, force: true });
  }
}

// The program: measures the build in `args[0]` (site/dist by default) and returns the exit code,
// after writing its lines through `say` and `fail`. `env`, `port` and `tmp` are there for the tests.
export async function main(args = process.argv.slice(2), { env = process.env, port = 0, tmp = tmpdir(), say = console.log, fail = console.error } = {}) {
  const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dist = resolve(args[0] ?? join(siteDir, 'dist'));
  const missing = PAGES.filter((p) => !existsSync(join(dist, p, 'index.html')));
  if (missing.length) {
    fail(`measure: no built pages ${missing.join(', ')} in ${dist}; run npm run build first.`);
    return 2;
  }
  let chrome;
  try {
    chrome = findChrome(env);
  } catch (e) {
    fail(`measure: ${e.message}`);
    return 2;
  }
  if (!chrome) {
    fail('measure: Chrome or Chromium not found; set CHROME_PATH to its executable.');
    return 2;
  }
  let measurements;
  try {
    measurements = await measureSite(chrome, dist, { port, tmp });
  } catch (e) {
    fail(`measure: ${e.message}`);
    return 2;
  }
  const found = findHidden(measurements);
  const count = measurements.reduce((n, m) => n + m.targets.length, 0);
  if (found.length) {
    fail(`measure: ${found.length} hidden text(s)`);
    for (const f of found) fail(`  - ${describeFinding(f)}`);
    return 1;
  }
  say(`measure: ok (${PAGES.length} pages, ${WIDTHS.length} widths, ${THEMES.length} themes, ${count} texts)`);
  return 0;
}

// Run as a program, by its real path or through a symbolic link.
function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isMain()) main().then((code) => { process.exitCode = code; });
