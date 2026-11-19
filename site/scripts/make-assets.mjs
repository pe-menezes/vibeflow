// Generates the site's share image and PNG icons from HTML, with a headless Chrome screenshot.
//
//   node site/scripts/make-assets.mjs
//
// Writes og-image.png (1600 x 900), favicon-32.png, favicon-64.png, apple-touch-icon.png and
// favicon.ico into site/public/, and site/scripts/assets/manifest.json with the sha256 of each
// output, the inputs it was made from and, as information, the Chrome that took the screenshots.
// Everything is made in a temporary folder first and copied over only when all of it is made, all
// or nothing, so a failure on the way, in the making or in the copying, leaves site/public/ and the
// manifest as they were.
// test/site-assets.test.mjs checks the files against the manifest and the manifest against today's
// sources, so a change to the hero copy, the mark or a colour token fails the suite until the
// assets are generated again.
//
// Nothing is invented here: the copy comes from src/i18n/en.ts (the keys Hero.astro uses), the
// colours from the design system tokens (violet accent), the fonts from public/fonts/, the mark
// from public/favicon.svg and the lines from the pure functions of src/lib/flow.js, in the still
// frame the hero draws with reduced motion (seed 7, time zero).
//
// Chrome is needed only to take the screenshots. It is found through CHROME_PATH, which must exist
// when set, or the usual macOS and Linux locations; a Chrome missing, failing, not finishing in
// time or writing no screenshot ends the run with one line. This script is not part of the build or CI: the PNGs are
// committed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLines, heroGeometry, lineCount, lineY, seededRandom, shapeAt } from '../src/lib/flow.js';

const SITE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- Reading the sources ----------

// Custom properties of the :root blocks and of the violet accent scope, with var() resolved.
export function readTokens(css) {
  const raw = {};
  const blocks = /(:root|\[data-gx-acento="violet"\])\s*\{([^}]*)\}/g;
  const scoped = {};
  for (const [, selector, body] of css.matchAll(blocks)) {
    const target = selector === ':root' ? raw : scoped;
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) target[name] = value.trim();
  }
  Object.assign(raw, scoped);
  const resolveValue = (value, depth = 0) => {
    if (depth > 20) throw new Error(`token cycle in ${value}`);
    return value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
      if (!(name in raw)) throw new Error(`unknown token ${name}`);
      return resolveValue(raw[name], depth + 1);
    });
  };
  return Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, resolveValue(value)]));
}

// The single-quoted string values of a locale file such as src/i18n/en.ts.
export function readStrings(source) {
  const strings = {};
  for (const [, key, body] of source.matchAll(/^\s*(\w+):\s*'((?:[^'\\]|\\.)*)'/gm)) {
    strings[key] = body.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c));
  }
  return strings;
}

// The stroke of the mark: the d attribute of the path in favicon.svg.
export function readMark(svg) {
  const found = /<path d="([^"]+)"/.exec(svg);
  if (!found) throw new Error('favicon.svg has no path');
  return found[1];
}

// The hero copy as Hero.astro shows it: the title with the term "spec-driven", the two notes, the
// spec card and the verdict.
export function heroContent(t) {
  const titleLines = t.heroTitle.split('\n').map((line) => {
    const found = /spec-driven/i.exec(line);
    return found
      ? { before: line.slice(0, found.index), term: found[0], after: line.slice(found.index + found[0].length) }
      : { before: line, term: '', after: '' };
  });
  const stepItems = (desc) => desc.replace(/^✓\s*/, '').split(' · ');
  const specName = /"([^"]+)"/.exec(t.heroQuickStart2Cmd)?.[1];
  return {
    titleLines,
    notes: { before: t.heroFlowBefore, after: t.heroFlowAfter },
    card: { label: specName ? `spec · ${specName}` : 'spec', items: stepItems(t.heroQuickStart2Desc) },
    verdict: t.heroQuickStart4Desc.split('.')[0],
  };
}

// A token colour with an alpha, the same way createFlow() in flow.js derives its line colours.
function withAlpha(hex, alpha) {
  const h = /^#([0-9a-fA-F]{6})$/.exec(hex)?.[1];
  if (!h) throw new Error(`expected a #rrggbb token, got ${hex}`);
  return `rgb(${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)} / ${alpha})`;
}

// The light theme with the violet accent, by role.
export function palette(tokens) {
  const pick = (name) => {
    if (!tokens[name]) throw new Error(`missing token ${name}`);
    return tokens[name];
  };
  return {
    bg: pick('--bg'),
    ink: pick('--ink'),
    ink3: pick('--ink-3'),
    accent: pick('--accent'),
    accentHalo: pick('--accent-halo'),
    accentInk: pick('--accent-ink'),
    sheet: pick('--bg-sheet'),
    ruleSoft: pick('--rule-soft'),
    shadow: pick('--e-3'),
    loose: withAlpha(pick('--ink-4'), 0.46),
    held: withAlpha(pick('--accent'), 0.92),
    looseDot: withAlpha(pick('--ink-3'), 0.9),
  };
}

const FONT_FILES = {
  geist: 'geist-latin.woff2',
  mono: 'jetbrains-mono-latin.woff2',
  serif: 'newsreader-latin.woff2',
  serifItalic: 'newsreader-italic-latin.woff2',
};

// Everything the assets are made from, read from the site directory.
export function collectSources(siteDir = SITE_DIR) {
  const read = (path) => readFileSync(join(siteDir, path));
  const tokens = readTokens(read('src/styles/genius/genius-tudo.css').toString('utf8'));
  const fonts = Object.fromEntries(Object.entries(FONT_FILES).map(([role, file]) => (
    [role, `data:font/woff2;base64,${read(`public/fonts/${file}`).toString('base64')}`]
  )));
  const strings = readStrings(read('src/i18n/en.ts').toString('utf8'));
  return {
    strings,
    content: heroContent(strings),
    mark: readMark(read('public/favicon.svg').toString('utf8')),
    palette: palette(tokens),
    fonts,
  };
}

// What the manifest records as the inputs of the images.
export function manifestInputs(sources) {
  const { strings, content, mark, palette: colors } = sources;
  return {
    title: strings.heroTitle,
    notes: content.notes,
    card: content.card,
    verdict: content.verdict,
    mark,
    colors,
  };
}

// ---------- The flow band ----------

const HERO_SEED = 7;
const STEP = 6;

// The hero lines in the still frame (time zero), from the left edge to the right edge, as [x, y]
// points. Past the gate heroGeometry() has ordered them, so they run flat and evenly spaced.
export function flowLines(width, height) {
  const lines = createLines(lineCount('hero', width), seededRandom(HERO_SEED));
  return lines.map((line) => {
    const points = [];
    for (let x = 0; x < width; x += STEP) points.push([x, lineY('hero', line, x, 0, width, height)]);
    points.push([width, lineY('hero', line, width, 0, width, height)]);
    return points;
  });
}

// ---------- The HTML ----------

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fontFaces(fonts) {
  return `
  @font-face { font-family: Geist; font-weight: 300 700; src: url('${fonts.geist}') format('woff2'); }
  @font-face { font-family: 'JetBrains Mono'; font-weight: 400 500; src: url('${fonts.mono}') format('woff2'); }
  @font-face { font-family: Newsreader; font-style: normal; font-weight: 300 600; src: url('${fonts.serif}') format('woff2'); }
  @font-face { font-family: Newsreader; font-style: italic; font-weight: 300 600; src: url('${fonts.serifItalic}') format('woff2'); }`;
}

// Share image layout, in pixels of the 1600 x 900 image.
const OG = { width: 1600, height: 900, margin: 96, bandTop: 478, bandHeight: 350, cardWidth: 330, verdictZone: 240 };

function flowSvg(width, height, c) {
  const lines = createLines(lineCount('hero', width), seededRandom(HERO_SEED));
  const cut = heroGeometry(width).gate / width;
  const paths = flowLines(width, height).map((points) => (
    `<path d="${points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y.toFixed(1)}`).join(' ')}"/>`
  )).join('');
  // Grains: the work on each line at time zero, none behind the spec card or the verdict.
  const gate = heroGeometry(width).gate;
  const cardHalf = OG.cardWidth / 2 + 25;
  const grains = lines.map((line) => {
    const x = line.u * width;
    if ((x > gate - cardHalf && x < gate + cardHalf) || x > width - OG.verdictZone) return '';
    const held = shapeAt('hero', line, x, width, height).order > 0.5;
    return `<circle cx="${x.toFixed(1)}" cy="${lineY('hero', line, x, 0, width, height).toFixed(1)}" r="${held ? 4 : 3.2}" fill="${held ? c.accent : c.looseDot}"/>`;
  }).join('');
  return `<svg class="lines" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" x2="${width}" y1="0" y2="0">
      <stop offset="0" stop-color="${c.loose}"/><stop offset="${Math.max(0, cut - 0.12).toFixed(3)}" stop-color="${c.loose}"/>
      <stop offset="${Math.min(1, cut + 0.01).toFixed(3)}" stop-color="${c.held}"/><stop offset="1" stop-color="${c.held}"/>
    </linearGradient></defs>
    <g fill="none" stroke="url(#g)" stroke-width="2" stroke-linejoin="round">${paths}</g>${grains}</svg>`;
}

export function buildOgHtml({ content, palette: c, mark, fonts }) {
  const { width: W, height: H, margin, bandTop, bandHeight, cardWidth } = OG;
  const gatePercent = (heroGeometry(W).gate / W) * 100;
  const title = content.titleLines.map(({ before, term, after }) => (
    `${escapeHtml(before)}${term ? `<em><mark>${escapeHtml(term)}</mark></em>` : ''}${escapeHtml(after)}`
  )).join('<br>');
  const fade = `linear-gradient(to bottom, transparent 0, ${c.ink} 15%, ${c.ink} 85%, transparent 100%)`;
  return `<!doctype html><meta charset="utf-8"><style>${fontFaces(fonts)}
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${c.bg}; color: ${c.ink}; font-family: Geist, sans-serif; -webkit-font-smoothing: antialiased; }
  .top { position: absolute; top: 76px; left: ${margin}px; right: ${margin}px; display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 18px; font-size: 40px; font-weight: 600; letter-spacing: -0.02em; }
  .brand svg { width: 60px; height: 60px; }
  .brand path { fill: none; stroke: ${c.accent}; stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round; }
  .domain { font-family: 'JetBrains Mono', monospace; font-size: 24px; letter-spacing: 0.06em; color: ${c.ink3}; }
  h1 { position: absolute; top: 196px; left: ${margin}px; font-family: Newsreader, serif; font-weight: 400; font-size: 132px; line-height: 0.98; letter-spacing: -0.032em; }
  h1 em { font-style: italic; }
  h1 mark { color: inherit; background: linear-gradient(${c.accentHalo}, ${c.accentHalo}) no-repeat 0 84% / 100% 0.42em; }
  .band { position: absolute; left: 0; right: 0; top: ${bandTop}px; height: ${bandHeight}px; }
  .lines { position: absolute; inset: 0; -webkit-mask-image: ${fade}; mask-image: ${fade}; }
  .note { position: absolute; top: calc(100% - 6px); font-family: 'JetBrains Mono', monospace; font-size: 22px; letter-spacing: 0.05em; color: ${c.ink3}; }
  .note.before { left: ${margin}px; } .note.after { right: ${margin}px; }
  .spec { position: absolute; left: ${gatePercent}%; top: 50%; transform: translate(-50%, -50%); width: ${cardWidth}px; padding: 24px 26px 26px; border: 1px solid ${c.ruleSoft}; border-radius: 18px; background: ${c.sheet}; box-shadow: ${c.shadow}; }
  .spec p { font-family: 'JetBrains Mono', monospace; font-size: 18px; letter-spacing: 0.14em; text-transform: uppercase; color: ${c.ink3}; }
  .spec ul { display: grid; gap: 10px; margin-top: 16px; padding: 0; list-style: none; font-size: 24px; line-height: 1.2; }
  .spec li { display: flex; align-items: baseline; gap: 12px; }
  .spec i { flex: none; width: 14px; height: 8px; border: solid ${c.accent}; border-width: 0 0 3px 3px; transform: translateY(-4px) rotate(-45deg); }
  .verdict { position: absolute; right: ${margin}px; top: 50%; transform: translateY(-50%); padding: 8px 20px; border-radius: 999px; background: ${c.accent}; color: ${c.accentInk}; font-family: 'JetBrains Mono', monospace; font-size: 26px; font-weight: 500; letter-spacing: 0.1em; }
  </style>
  <div class="top"><div class="brand"><svg viewBox="0 0 32 32"><path d="${mark}"/></svg>Vibeflow</div><div class="domain">vibeflow.run</div></div>
  <h1>${title}</h1>
  <div class="band">${flowSvg(W, bandHeight, c)}
    <span class="note before">${escapeHtml(content.notes.before)}</span><span class="note after">${escapeHtml(content.notes.after)}</span>
    <div class="spec"><p>${escapeHtml(content.card.label)}</p><ul>${content.card.items.map((item) => `<li><i></i>${escapeHtml(item)}</li>`).join('')}</ul></div>
    <div class="verdict">${escapeHtml(content.verdict)}</div>
  </div>`;
}

// The icon tile: the accent square with the mark in the accent ink. Rounded at 32 and 64; full
// square at 180, which the system rounds itself.
export function buildIconHtml(size, { palette: c, mark }) {
  const radius = size >= 180 ? 0 : Math.round(size * 0.22);
  return `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${size}px; height: ${size}px; overflow: hidden; background: transparent; }
  div { width: 100%; height: 100%; border-radius: ${radius}px; background: ${c.accent}; display: grid; place-items: center; }
  svg { width: 74%; height: 74%; }
  path { fill: none; stroke: ${c.accentInk}; stroke-width: 3.6; stroke-linecap: round; stroke-linejoin: round; }
  </style><div><svg viewBox="0 0 32 32"><path d="${mark}"/></svg></div>`;
}

// The PNGs, each from its HTML. favicon.ico is made from favicon-32.png.
export const ASSETS = [
  { file: 'og-image.png', width: OG.width, height: OG.height, transparent: false, html: buildOgHtml },
  ...[['favicon-32.png', 32], ['favicon-64.png', 64], ['apple-touch-icon.png', 180]].map(([file, size]) => (
    { file, width: size, height: size, transparent: true, html: (sources) => buildIconHtml(size, sources) }
  )),
];

// ---------- PNG and ICO ----------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function pngSize(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE) || buffer.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error('not a PNG');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// An ICO container holding PNG images (supported by every current browser and by Windows Vista on).
export function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map((png) => {
    const { width, height } = pngSize(png);
    const entry = Buffer.alloc(16);
    entry[0] = width >= 256 ? 0 : width;
    entry[1] = height >= 256 ? 0 : height;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs]);
}

export function readIco(buffer) {
  if (buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) throw new Error('not an ICO');
  const count = buffer.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => {
    const at = 6 + 16 * i;
    const size = buffer.readUInt32LE(at + 8);
    const offset = buffer.readUInt32LE(at + 12);
    return { width: buffer[at] || 256, height: buffer[at + 1] || 256, data: buffer.subarray(offset, offset + size) };
  });
}

// ---------- Chrome ----------

const CHROME_LOCATIONS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

// The Chrome to use: CHROME_PATH when it is set, which must exist (a misspelt path is an error, not
// a quiet fall back to another browser that may draw other bytes), or else the first usual
// location that exists, or null.
export function findChrome(env = process.env, exists = existsSync) {
  if (env.CHROME_PATH) {
    if (!exists(env.CHROME_PATH)) throw new Error(`CHROME_PATH is set to ${env.CHROME_PATH}, which does not exist.`);
    return env.CHROME_PATH;
  }
  return CHROME_LOCATIONS.find((path) => exists(path)) ?? null;
}

// The name and version Chrome reports, recorded in the manifest as information; null when it says
// nothing.
function chromeVersion(chrome) {
  try {
    return execFileSync(chrome, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 }).trim() || null;
  } catch {
    return null;
  }
}

// One screenshot, taken in the work folder. A Chrome that fails, does not finish within `timeout`
// milliseconds (it is then killed) or writes no PNG of the right size is an error of one line.
export function screenshot(chrome, work, html, name, { width, height, transparent }, { timeout = 120000 } = {}) {
  const page = join(work, `${name}.html`);
  const out = join(work, `${name}.png`);
  writeFileSync(page, html);
  try {
    execFileSync(chrome, [
      '--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${join(work, 'profile')}`, '--force-device-scale-factor=1',
      `--window-size=${width},${height}`, ...(transparent ? ['--default-background-color=00000000'] : []),
      '--virtual-time-budget=4000', `--screenshot=${out}`, pathToFileURL(page).href,
    ], { stdio: 'ignore', timeout, killSignal: 'SIGKILL' });
  } catch (e) {
    if (e.code === 'ETIMEDOUT') throw new Error(`${name}: Chrome did not finish within ${timeout / 1000} s and was stopped.`);
    throw new Error(`${name}: Chrome failed (${e.status ?? e.signal ?? e.code}) before writing the screenshot.`);
  }
  if (!existsSync(out)) throw new Error(`${name}: Chrome ran but wrote no screenshot.`);
  const png = readFileSync(out);
  let size;
  try {
    size = pngSize(png);
  } catch {
    throw new Error(`${name}: the screenshot Chrome wrote is not a PNG.`);
  }
  if (size.width !== width || size.height !== height) {
    throw new Error(`${name}: Chrome returned ${size.width}x${size.height}, expected ${width}x${height}`);
  }
  return png;
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// What the generator writes into public/, in order.
export const OUTPUT_FILES = [...ASSETS.map((asset) => asset.file), 'favicon.ico'];

// Copies each [from, to] pair, all or nothing: when one copy fails, every destination already
// written, the failed one included, gets back the bytes it had (or is removed when it did not
// exist), and the failure is thrown. The old bytes are kept in memory, so nothing is left beside
// the destinations.
function copyAll(pairs, copy) {
  const old = pairs.map(([, to]) => (existsSync(to) ? readFileSync(to) : null));
  let i = 0;
  try {
    for (; i < pairs.length; i += 1) copy(...pairs[i]);
  } catch (e) {
    const stuck = [];
    for (let k = 0; k <= i && k < pairs.length; k += 1) {
      const to = pairs[k][1];
      try {
        if (old[k] === null) rmSync(to, { force: true });
        else if (!existsSync(to) || !readFileSync(to).equals(old[k])) writeFileSync(to, old[k]);
      } catch {
        stuck.push(to);
      }
    }
    if (stuck.length) e.message += `; could not put back ${stuck.join(', ')}`;
    throw e;
  }
}

// Makes every output and the manifest in a folder of its own under `tmp`, and only when all of them
// are made copies them to `publicDir` and `manifestPath`, all or nothing: a failure on the way, in
// the making or in the copying, leaves both as they were. The folder is removed either way.
// `shoot(html, asset, work)` returns the PNG of an asset; `staged(file)` is told of each output
// once it is made; `copy(from, to)` copies one file.
export function generateAssets({ sources, shoot, chromeVersion: chrome = null, publicDir, manifestPath, tmp = tmpdir(), staged = () => {}, copy = copyFileSync }) {
  const stage = mkdtempSync(join(tmp, 'vibeflow-assets-'));
  try {
    const work = join(stage, 'work');
    const out = join(stage, 'out');
    mkdirSync(work);
    mkdirSync(out);
    const manifest = { inputs: manifestInputs(sources), html: {}, outputs: {}, chrome };
    for (const asset of ASSETS) {
      const html = asset.html(sources);
      const png = shoot(html, asset, work);
      writeFileSync(join(out, asset.file), png);
      manifest.html[asset.file] = sha256(html);
      manifest.outputs[asset.file] = sha256(png);
      staged(asset.file);
    }
    const ico = buildIco([readFileSync(join(out, 'favicon-32.png'))]);
    writeFileSync(join(out, 'favicon.ico'), ico);
    manifest.outputs['favicon.ico'] = sha256(ico);
    staged('favicon.ico');
    writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    mkdirSync(dirname(manifestPath), { recursive: true });
    copyAll([...OUTPUT_FILES.map((file) => [join(out, file), join(publicDir, file)]), [join(out, 'manifest.json'), manifestPath]], copy);
    return manifest;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

function main() {
  try {
    const chrome = findChrome();
    if (!chrome) throw new Error('Chrome or Chromium not found; set CHROME_PATH to its executable.');
    generateAssets({
      sources: collectSources(SITE_DIR),
      shoot: (html, asset, work) => screenshot(chrome, work, html, asset.file.replace(/\.png$/, ''), asset),
      chromeVersion: chromeVersion(chrome),
      publicDir: join(SITE_DIR, 'public'),
      manifestPath: join(SITE_DIR, 'scripts', 'assets', 'manifest.json'),
    });
  } catch (e) {
    console.error(`make-assets: ${e.message}`);
    process.exit(1);
  }
  for (const file of OUTPUT_FILES) console.log(`site/public/${file}`);
  console.log('site/scripts/assets/manifest.json');
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
