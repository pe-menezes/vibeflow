// Measures the built site in a headless Chrome, with the page's JavaScript off, and fails when any
// text is out of sight at rest. This is the proof behind check-build.mjs, which only reads the CSS
// as text: here Chrome lays the pages out and says where every piece of text ended up.
//
//   npm run measure                                   (in site/, after npm run build)
//   node site/scripts/measure-rendered.mjs [dist-dir]
//
// It serves the build output on 127.0.0.1, at a free port, and opens the seven pages at 390 and
// 1280 pixels wide, in the light and the dark theme. Every run of text in the body and every
// pseudo-element that draws text must have a box, no display: none, visibility visible, an
// effective opacity above zero (its own times its ancestors'), a font size above zero, a colour
// that is not transparent, no clip that cuts it away, and some part on screen (not wholly to the
// left, to the right or above). EXCEPTIONS lists what may be hidden, each with its reason.
//
// Exit 0 when nothing is hidden; 1 when something is, with one line per finding naming the page,
// the width, the theme, the element and the reason; 2 when it cannot measure (no Chrome, no build).
// It needs Chrome, so it runs by hand and stays out of `npm run build`.
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

// What may be hidden at rest: an element by id (#x) or class (.x), and everything inside it,
// optionally only at one width or in one theme, with the reason.
export const EXCEPTIONS = [
  { match: '#form-success', reason: 'the contact form success message, which a script shows after the form is sent' },
  // The header has one navigation per screen size, with the same links: each is hidden only at the
  // width where the other one shows.
  { match: '.desktop-only', width: 390, reason: 'the wide header navigation and its GitHub button; on a narrow screen the phone menu shows the same links' },
  { match: '#mobile-menu', width: 1280, reason: 'the phone menu; on a wide screen the header navigation shows the same links' },
  { match: '.flow-verdict', width: 390, reason: 'the note beside the verdict in the hero flow band, a decorative image hidden from screen readers, left out on a narrow screen for room' },
];

// ---------- Deciding, from what was measured ----------

// A target is one run of text or one pseudo-element that draws text:
//   { kind: 'text' | 'pseudo', element, text, boxes: [{ x, y, width, height }], chain }
// `boxes` are its text boxes in page coordinates (none when it has no box), and `chain` the computed
// style of the box that owns it (the text's element, or the pseudo-element itself) followed by each
// ancestor up to html: { element, id, classes, display, visibility, opacity, fontSize, color,
// textFillColor, clip, clipPath, overflowX, overflowY, position, box }.

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

// A clip: rect() of no area on a positioned box, or a clip-path that closes to nothing.
function clipsAway(s) {
  if (/^(absolute|fixed)$/.test(s.position)) {
    const r = /^rect\(([^)]*)\)$/.exec(String(s.clip).trim());
    if (r) {
      const [top, right, bottom, left] = r[1].split(/\s*,\s*|\s+/).map((v) => (v === 'auto' ? null : parseFloat(v)));
      if ((top !== null && bottom !== null && bottom <= top) || (left !== null && right !== null && right <= left)) return true;
    }
  }
  const path = String(s.clipPath ?? 'none').trim();
  const inset = /^inset\(([^)]*?)(?:\s+round\s[^)]*)?\)/.exec(path);
  if (inset) {
    const v = inset[1].trim().split(/\s+/);
    const [t, r = t, b = t, l = r] = v;
    const w = s.box?.width ?? 0;
    const h = s.box?.height ?? 0;
    const sum = (a, c, of) => (px(a, of) ?? 0) + (px(c, of) ?? 0);
    if (sum(t, b, h) >= h || sum(l, r, w) >= w) return true;
  }
  if (/^(circle|ellipse)\(\s*0(px|%)?(\s+0(px|%)?)?(\s|\))/.test(path)) return true;
  return false;
}

// Whether every text box lies wholly outside a box on one axis.
const outside = (boxes, box, axis) => {
  const [p, size] = axis === 'x' ? ['x', 'width'] : ['y', 'height'];
  return boxes.every((b) => b[p] + b[size] <= box[p] || b[p] >= box[p] + box[size]);
};
const scrolls = (v) => v === 'auto' || v === 'scroll';
const cuts = (v) => v === 'hidden' || v === 'clip';

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
  if (zeroAlpha(owner.color) || zeroAlpha(owner.textFillColor)) reasons.push('transparent colour');

  // Clipping: clip and clip-path cut a box and all it holds; overflow cuts what its box holds,
  // except what escapes it by absolute or fixed position. html and body hand their overflow to the
  // viewport, which the off-screen test below stands for.
  const sized = boxes.filter((b) => b.width > 0 && b.height > 0);
  let mode = 'in';
  let clipped = null;
  for (const s of chain) {
    if (!clipped && clipsAway(s)) clipped = s;
    const holds = mode === 'in' || (mode === 'abs' && s.position !== 'static');
    if (!clipped && holds && !isRoot(s) && sized.length && s.box) {
      if ((cuts(s.overflowX) && outside(sized, s.box, 'x')) || (cuts(s.overflowY) && outside(sized, s.box, 'y'))) clipped = s;
    }
    if (mode === 'abs' && s.position !== 'static') mode = 'in';
    if (s.position === 'absolute' && mode !== 'fixed') mode = 'abs';
    if (s.position === 'fixed') mode = 'fixed';
  }
  if (clipped) reasons.push(`clipped away by ${clipped.element}`);

  // Off screen: wholly left of the page, right of the viewport or above the page, unless a box
  // between them scrolls on that axis, which brings the text into reach.
  const scrollX = chain.some((s) => !isRoot(s) && scrolls(s.overflowX));
  const scrollY = chain.some((s) => !isRoot(s) && scrolls(s.overflowY));
  if (!scrollX && boxes.every((b) => b.x + b.width <= 0)) reasons.push('off screen to the left');
  if (!scrollX && boxes.every((b) => b.x >= viewport.width)) reasons.push('off screen to the right');
  if (!scrollY && boxes.every((b) => b.y + b.height <= 0)) reasons.push('off screen above');
  return reasons;
}

// Whether an exception covers a target seen at a width and in a theme.
function excepted(target, width, theme, exceptions) {
  return exceptions.some((e) => {
    if (e.width !== undefined && e.width !== width) return false;
    if (e.theme !== undefined && e.theme !== theme) return false;
    const name = e.match.slice(1);
    return target.chain.some((s) => (e.match[0] === '#' ? s.id === name : (s.classes ?? []).includes(name)));
  });
}

// Every target out of sight in a list of measurements { page, width, theme, viewport, targets },
// leaving out what the exceptions cover.
export function findHidden(measurements, exceptions = EXCEPTIONS) {
  const found = [];
  for (const { page, width, theme, viewport, targets } of measurements) {
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
export const describeFinding = (f) => `${f.page} · ${f.width}px · ${f.theme} · ${f.element} "${short(f.text)}": ${f.reasons.join('; ')}`;

// ---------- Talking to Chrome ----------

const STYLE_PROPS = [
  ['display', 'display'], ['visibility', 'visibility'], ['opacity', 'opacity'], ['font-size', 'fontSize'],
  ['color', 'color'], ['-webkit-text-fill-color', 'textFillColor'], ['clip', 'clip'], ['clip-path', 'clipPath'],
  ['overflow-x', 'overflowX'], ['overflow-y', 'overflowY'], ['position', 'position'],
];
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
  const targets = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.data.trim() || undrawn(node.parentElement)) continue;
    range.selectNodeContents(node);
    if (range.getClientRects().length && holdsDrawn(node.parentElement)) continue;
    targets.push({ kind: 'text', element: describe(node.parentElement), text: node.data, boxes: [], chain: chainFrom(node.parentElement) });
  }
  for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
    if (undrawn(el)) continue;
    for (const which of ['::before', '::after']) {
      const cs = getComputedStyle(el, which);
      const content = cs.content;
      if (!content || /^(none|normal|""|'')$/.test(content.trim())) continue;
      if (cs.display !== 'none' && holdsDrawn(el)) continue;
      const own = styleOf(cs, el, describe(el) + which);
      targets.push({ kind: 'pseudo', element: own.element, text: content.replace(/^["']|["']$/g, ''), boxes: [], chain: [own, ...chainFrom(el)] });
    }
  }
  return targets;
})()`;

// A DevTools protocol connection over the pipe Chrome opens with --remote-debugging-pipe.
function connect(proc) {
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method}: no answer from Chrome in 60 s`)); }, 60000);
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

// Serves a build output on 127.0.0.1 at a free port; a folder answers with its index.html.
function serve(dist) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(dist, path));
    if (file !== dist && !file.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

// Opens one page at one width and theme, with scripts off and any later navigation of the page
// (the root page's refresh to /en/) refused, and returns what it measured.
async function measurePage(cdp, sessionId, origin, page, width, theme) {
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
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true }, sessionId);
    await new Promise((done) => setTimeout(done, 300));
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

// Every page at every width and theme, in one Chrome, with a throwaway profile.
export async function measureSite(chrome, dist) {
  const work = mkdtempSync(join(tmpdir(), 'vibeflow-measure-'));
  const server = await serve(dist);
  const proc = spawn(chrome, [
    '--headless=new', '--remote-debugging-pipe', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${join(work, 'profile')}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const exited = new Promise((done) => proc.once('exit', done));
  try {
    const failed = new Promise((_, reject) => proc.once('error', (e) => reject(new Error(`Chrome did not start: ${e.message}`))));
    const cdp = connect(proc);
    const { targetId } = await Promise.race([cdp.send('Target.createTarget', { url: 'about:blank' }), failed]);
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, undefined);
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: true }, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sessionId);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const measurements = [];
    for (const page of PAGES) {
      for (const width of WIDTHS) {
        for (const theme of THEMES) measurements.push(await measurePage(cdp, sessionId, origin, page, width, theme));
      }
    }
    await cdp.send('Browser.close').catch(() => {});
    return measurements;
  } finally {
    const timer = setTimeout(() => proc.kill(), 5000);
    if (proc.exitCode === null && proc.signalCode === null) await exited;
    clearTimeout(timer);
    await new Promise((done) => server.close(done));
    rmSync(work, { recursive: true, force: true });
  }
}

async function main() {
  const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dist = resolve(process.argv[2] ?? join(siteDir, 'dist'));
  const missing = PAGES.filter((p) => !existsSync(join(dist, p, 'index.html')));
  if (missing.length) {
    console.error(`measure: no built pages ${missing.join(', ')} in ${dist}; run npm run build first.`);
    process.exit(2);
  }
  let chrome;
  try {
    chrome = findChrome();
  } catch (e) {
    console.error(`measure: ${e.message}`);
    process.exit(2);
  }
  if (!chrome) {
    console.error('measure: Chrome or Chromium not found; set CHROME_PATH to its executable.');
    process.exit(2);
  }
  let measurements;
  try {
    measurements = await measureSite(chrome, dist);
  } catch (e) {
    console.error(`measure: ${e.message}`);
    process.exit(2);
  }
  const found = findHidden(measurements);
  const count = measurements.reduce((n, m) => n + m.targets.length, 0);
  if (found.length) {
    console.error(`measure: ${found.length} hidden text(s)`);
    for (const f of found) console.error(`  - ${describeFinding(f)}`);
    process.exit(1);
  }
  console.log(`measure: ok (${PAGES.length} pages, ${WIDTHS.length} widths, ${THEMES.length} themes, ${count} texts)`);
}

// Run as a program, by its real path or through a symbolic link.
function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isMain()) main();
