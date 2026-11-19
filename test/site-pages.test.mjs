// Checks on the two inner pages, commands (CommandsDocs.astro) and anatomy (VibeflowAnatomy.astro),
// read from their sources, with no build:
//
// * today's content stays whole: every i18n key and every string literal each component used at the
//   start commit is still used, and every key it uses exists in both languages;
// * the anchors other pages and other sites point at stay: one id per command, in today's order;
// * the reading layout: a page head (mono label, title, lede), an index with one link per entry,
//   the entry name in the display face, details as definition rows, flags as chips, code and folder
//   trees on the dark stage, and none of the old card grid or the fixed-header leftovers;
// * nothing is hidden at rest, and the index script only marks the current link;
// * the index script, run against generated page layouts, marks the entry being read: in order
//   while scrolling both ways, the last one at the page end, and the entry jumped to after a jump.
//
// What only the built HTML can show (every index link lands on an id, every text is on the page)
// lives in site/scripts/check-pages.mjs, run after `npm run build` in site/. Characters per line
// can only be counted in a browser; this file checks that the reading blocks share one measure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const COMMANDS = 'site/src/components/CommandsDocs.astro';
const ANATOMY = 'site/src/components/VibeflowAnatomy.astro';

// What each component used at the commit this redesign started from (52704a8), transcribed once
// and kept here as the oracle: a shallow clone (the CI checkout) does not hold that commit.
const START_USE = {
  [COMMANDS]: {
    keys: [
      'cmdAnalyzeDesc', 'cmdAnalyzeFlagDefault', 'cmdAnalyzeFlagFresh', 'cmdAnalyzeFlagInteractive',
      'cmdAnalyzeFlagMeasure', 'cmdAnalyzeFlagSatellite', 'cmdAnalyzeFlagScope',
      'cmdAnalyzeImportProtection', 'cmdAnalyzeOutput', 'cmdAnalyzeTests', 'cmdAnalyzeUsage',
      'cmdAuditConsolidate', 'cmdAuditDesc', 'cmdAuditIncremental', 'cmdAuditOutput',
      'cmdAuditPackage', 'cmdAuditProbes', 'cmdAuditReaudit', 'cmdAuditSeverity', 'cmdAuditUsage',
      'cmdAuditVerdictFail', 'cmdAuditVerdictPartial', 'cmdAuditVerdictPass', 'cmdBackToHome',
      'cmdDiscoverClarifications', 'cmdDiscoverDesc', 'cmdDiscoverModeComplete',
      'cmdDiscoverModeQuick', 'cmdDiscoverOutput', 'cmdDiscoverUsage', 'cmdFlags',
      'cmdGenSpecAutoSplit', 'cmdGenSpecClarifications', 'cmdGenSpecDesc', 'cmdGenSpecHeadless',
      'cmdGenSpecInputDirect', 'cmdGenSpecInputPrd', 'cmdGenSpecLiterals', 'cmdGenSpecMarkers',
      'cmdGenSpecOutput', 'cmdGenSpecRiskCode', 'cmdGenSpecScenarios', 'cmdGenSpecUsage',
      'cmdGenSpecValidation', 'cmdHotfixConsolidate', 'cmdHotfixDesc', 'cmdHotfixHalts',
      'cmdHotfixOutput', 'cmdHotfixRedProof', 'cmdHotfixTrace', 'cmdHotfixUsage', 'cmdHotfixVerified',
      'cmdHotfixWhen', 'cmdImplementDesc', 'cmdImplementLoop', 'cmdImplementLoopConfig',
      'cmdImplementLoopLink', 'cmdImplementLoopStop', 'cmdImplementLoopStopLabel',
      'cmdImplementNoLoop', 'cmdImplementNote', 'cmdImplementOutput', 'cmdImplementPhase0',
      'cmdImplementPhase1', 'cmdImplementPhase2', 'cmdImplementPhase3', 'cmdImplementPhase4',
      'cmdImplementPhase5', 'cmdImplementPhase6', 'cmdImplementPhase7', 'cmdImplementPhase8',
      'cmdImplementUsage', 'cmdLoopMode', 'cmdOutput', 'cmdPageSubtitle', 'cmdPageTitle',
      'cmdPipeline', 'cmdPromptPackAgnostic', 'cmdPromptPackDesc', 'cmdPromptPackEmbedded',
      'cmdPromptPackOutput', 'cmdPromptPackUsage', 'cmdPromptPackValidation', 'cmdQuickBudget',
      'cmdQuickDesc', 'cmdQuickEphemeral', 'cmdQuickOutput', 'cmdQuickUsage', 'cmdQuickWhen',
      'cmdStatsDesc', 'cmdStatsInProgress', 'cmdStatsLoop', 'cmdStatsMetrics', 'cmdStatsOutput',
      'cmdStatsTrend', 'cmdStatsUsage', 'cmdTeachCat1', 'cmdTeachCat2', 'cmdTeachCat3',
      'cmdTeachCat4', 'cmdTeachCat5', 'cmdTeachConflict', 'cmdTeachDesc', 'cmdTeachOutput',
      'cmdTeachUsage', 'cmdUsage', 'feat10For', 'feat1For', 'feat2For', 'feat3For', 'feat4For',
      'feat5For', 'feat6For', 'feat7For',
    ],
    literals: [
      '## Clarifications', '### Loop', '(no flags)', '(sem flags)', '--consolidate-hotfixes',
      '--fresh', '--from', '--interactive', '--loop', '--measure', '--no-loop', '--probes',
      '--reaudit <round-commit>', '--satellite <url>', '--scope <path>', 'A partir de PRD',
      'A partir de descrição', 'Acompanhe qualidade', 'Agent-agnostic', 'Architecture decision',
      'Auto-split', 'Budget ≤4 arquivos', 'Budget ≤4 files', 'Complete flow', 'Conflict detection',
      'Consolidation', 'Consolidação', 'Correção de padrão', 'Decisão arquitetural',
      'Detecção de conflito', 'Doc de rastro', 'Em andamento', 'Embedded patterns',
      'Ensine seu projeto', 'Ephemeral spec', 'FAIL', 'Fase 0', 'Fase 1', 'Fase 2', 'Fase 3',
      'Fase 4', 'Fase 5', 'Fase 6', 'Fase 7', 'Fase 8', 'Fix incremental', 'Fluxo completo',
      'From PRD', 'From description', 'Import protection', 'In progress', 'Incremental fix',
      'Literais', 'Literals', 'Metrics', 'Métricas', 'New convention', 'New pattern',
      'No one to answer', 'Nova convenção', 'PARTIAL', 'PASS', 'PRD validation', 'Pacote de revisão',
      'Padrão novo', 'Padrões embutidos', 'Pattern correction', 'Phase 0', 'Phase 1', 'Phase 2',
      'Phase 3', 'Phase 4', 'Phase 5', 'Phase 6', 'Phase 7', 'Phase 8', 'Proteção de importados',
      'Prova vermelha', 'Quando usar', 'Quick round', 'Red proof', 'Review package', 'Risk code:',
      'Round rápido', 'Scenarios:', 'Sem ninguém para responder', 'Severidade e causa',
      'Severity and cause', 'Spec efêmera', 'Status verified', 'Teach your project', 'Tendência',
      'Testes e pitfalls', 'Tests and pitfalls', 'Trace doc', 'Track quality', 'Trend', 'Validation',
      'Validação', 'Validação de PRD', 'When to use', '[NEEDS CLARIFICATION: …]', 'analyze', 'audit',
      'discover', 'done or HALT', 'done ou HALT', 'gen-spec', 'hotfix', 'implement', 'loop: true',
      'prompt-pack', 'quick', 'stats', 'teach', 'verified status',
    ],
  },
  [ANATOMY]: {
    keys: [
      'anatomyAgentLabel', 'anatomyConventionsAgent', 'anatomyConventionsEdit',
      'anatomyConventionsName', 'anatomyConventionsTagline', 'anatomyConventionsWhat',
      'anatomyConventionsWhy', 'anatomyCtaBtn', 'anatomyCtaHref', 'anatomyCtaText', 'anatomyCtaTitle',
      'anatomyDecisionsAgent', 'anatomyDecisionsEdit', 'anatomyDecisionsName',
      'anatomyDecisionsTagline', 'anatomyDecisionsWhat', 'anatomyDecisionsWhy', 'anatomyEditLabel',
      'anatomyEyebrow', 'anatomyIndexAgent', 'anatomyIndexEdit', 'anatomyIndexName',
      'anatomyIndexTagline', 'anatomyIndexWhat', 'anatomyIndexWhy', 'anatomyIntro',
      'anatomyLoopBriefings', 'anatomyLoopGit', 'anatomyLoopIntro', 'anatomyLoopLedger',
      'anatomyLoopProgress', 'anatomyLoopReviews', 'anatomyLoopTitle', 'anatomyPatternsAgent',
      'anatomyPatternsEdit', 'anatomyPatternsName', 'anatomyPatternsTagline', 'anatomyPatternsWhat',
      'anatomyPatternsWhy', 'anatomySubtitle', 'anatomyTitle', 'anatomyVsClosing',
      'anatomyVsConventionsBullet1', 'anatomyVsConventionsBullet2', 'anatomyVsConventionsBullet3',
      'anatomyVsConventionsBullet4', 'anatomyVsConventionsTitle', 'anatomyVsIntro',
      'anatomyVsPatternsBullet1', 'anatomyVsPatternsBullet2', 'anatomyVsPatternsBullet3',
      'anatomyVsPatternsBullet4', 'anatomyVsPatternsTitle', 'anatomyVsTitle', 'anatomyWhatLabel',
      'anatomyWhyLabel',
    ],
    literals: ['briefings/', 'loop/', 'progress/', 'reviews/'],
  },
};

// The command anchors the home page and outside links use, in today's order.
const COMMAND_IDS = ['analyze', 'discover', 'gen-spec', 'implement', 'prompt-pack', 'audit', 'quick', 'hotfix', 'teach', 'stats'];

const keysOf = (src) => new Set([...src.matchAll(/\bt\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));
const frontmatter = (src) => src.split(/^---$/m)[1] ?? '';
const markup = (src) => src.split(/^---$/m).slice(2).join('---').replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script>[\s\S]*?<\/script>/g, '');
const styleOf = (src) => [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const scriptOf = (src) => [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
// Single-quoted string literals of the frontmatter, minus import paths and the language code.
const literalsOf = (src) =>
  new Set(
    [...frontmatter(src).matchAll(/'((?:[^'\\]|\\.)*)'/g)]
      .map((m) => m[1])
      .filter((s) => !s.startsWith('.') && s !== 'en'),
  );

// The rules of a stylesheet as [selector list, body] pairs (no nesting; media blocks are flattened).
const rulesOf = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((chunk) => chunk.split('{'))
    .filter((parts) => parts.length >= 2)
    .map((parts) => [parts.at(-2).trim(), parts.at(-1)]);
// Specificity of one selector as a comparable number: ids, then classes, attributes and
// pseudo-classes, then types.
// Astro adds the same scope attribute to every compound, so it never changes which rule wins.
const specificity = (sel) => {
  const s = sel.replace(/::[\w-]+/g, ' ');
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) ?? []).length;
  const types = (s.replace(/[.#:][\w-]+|\[[^\]]*\]/g, ' ').match(/\b[a-z][\w-]*\b/g) ?? []).length;
  return ids * 10000 + classes * 100 + types;
};

test('every i18n key and every literal of the start commit is still used', () => {
  for (const [file, use] of Object.entries(START_USE)) {
    const src = read(file);
    const keys = keysOf(src);
    const literals = literalsOf(src);
    const lostKeys = use.keys.filter((k) => !keys.has(k));
    const lostLiterals = use.literals.filter((l) => !literals.has(l));
    assert.deepEqual(lostKeys, [], `${file} no longer uses these keys`);
    assert.deepEqual(lostLiterals, [], `${file} no longer carries these labels`);
  }
});

test('every key the two components use exists in both languages', () => {
  const en = read('site/src/i18n/en.ts');
  const pt = read('site/src/i18n/pt-br.ts');
  // A string key, or a list of strings (the loop's operation lists in the implement entry).
  const has = (text, key) => new RegExp(`\\n\\s*${key}:\\s*(?:'|\\[\\s*')`).test(text);
  for (const file of [COMMANDS, ANATOMY]) {
    for (const key of keysOf(read(file))) {
      assert.ok(has(en, key), `${key} (used by ${file}) is missing in en.ts`);
      assert.ok(has(pt, key), `${key} (used by ${file}) is missing in pt-br.ts`);
    }
  }
});

test('the commands keep one anchor per command, in order', () => {
  const src = read(COMMANDS);
  const ids = [...frontmatter(src).matchAll(/^\s{4}id: '([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual(ids, COMMAND_IDS);
  assert.match(markup(src), /\sid=\{cmd\.id\}/, 'each command entry carries its id');
});

test('the anatomy gives every section an anchor, and the index links to each one', () => {
  const src = read(ANATOMY);
  const ids = [...frontmatter(src).matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.ok(ids.length >= 7, `four artifacts, the loop folders, the comparison and the manual: ${ids}`);
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]*$/, `${id} is a plain anchor`);
});

for (const file of [COMMANDS, ANATOMY]) {
  test(`${file.split('/').pop()}: page head, index and reading column`, () => {
    const src = read(file);
    const html = markup(src);
    const css = styleOf(src);
    // Head: mono label, title, lede, before the body.
    const head = /<header class="doc-head[^"]*">([\s\S]*?)<\/header>/.exec(html)?.[1] ?? '';
    assert.match(head, /class="gx-rotulo[^"]*"/, 'the head has a mono label');
    assert.match(head, /<h1\b/, 'the head has the title');
    assert.match(head, /class="doc-lede[^"]*"/, 'the head has the lede');
    assert.match(css, /\.doc-title\s*{[^}]*font-family:\s*var\(--font-display\)/, 'the title is in the display face');
    // Index: a nav with a label and one link per entry, built from the same list as the ids.
    const nav = /<nav class="doc-toc[^"]*"([^>]*)>([\s\S]*?)<\/nav>/.exec(html);
    assert.ok(nav, 'the index is a nav');
    assert.match(nav[1], /\saria-label=\{t\.\w+\}/, 'the index is named');
    assert.match(nav[1], /\sdata-doc-toc\b/, 'the index carries the hook for the current-entry mark');
    assert.match(nav[2], /href=\{`#\$\{\w+\.id\}`\}/, 'one in-page link per entry');
    // Two columns on wide screens, the index sticky.
    assert.match(css, /grid-template-columns:/, 'the body is a grid on wide screens');
    assert.match(css, /\.doc-toc\s*{[^}]*position:\s*sticky/, 'the index follows the scroll');
    // Running text shares one measure, in em, so it follows each block's own font size. The number
    // of characters it holds per line is counted in a browser, not here: a `ch` is the width of
    // "0", and 68ch held 91 to 99 characters of this face.
    assert.match(css, /--doc-measure:\s*[\d.]+em\s*;/, 'one reading measure, in em');
    const rules = rulesOf(css);
    for (const block of ['.doc-lede', '.entry-text', '.entry-def dd', '.entry-note']) {
      const own = rules.filter(([sel]) => sel.split(',').map((s) => s.trim()).includes(block));
      if (block === '.entry-note' && !html.includes('entry-note')) continue;
      assert.ok(
        own.some(([, body]) => /max-width:\s*var\(--doc-measure\)/.test(body)),
        `${block} takes the reading measure`,
      );
    }
    const chMeasures = rules.filter(([, body]) => /max-width:\s*[\d.]+ch/.test(body)).map(([sel]) => sel);
    assert.deepEqual(chMeasures, ['.doc-title'], 'no running text measured in ch');
    // Entry name in the display face, italic.
    assert.match(css, /\.entry-name\s*{[^}]*font-family:\s*var\(--font-display\)[^}]*font-style:\s*italic/, 'entry names in display italic');
    // Details as definition rows with a rule between them.
    assert.match(html, /<dl class="entry-defs/, 'details are a definition list');
    assert.match(css, /\.entry-def\b[^{]*{[^}]*border-top:\s*1px solid var\(--rule-soft\)/, 'a rule between the rows');
  });

  test(`${file.split('/').pop()}: nothing hidden at rest, no card grid, no leftovers`, () => {
    const src = read(file);
    const html = markup(src);
    const css = styleOf(src);
    assert.doesNotMatch(src, /\bdelay-\d/, 'no delay-N classes');
    assert.doesNotMatch(css, /padding-top:\s*100px/, 'no room for the old fixed header');
    assert.doesNotMatch(src, /class="[^"]*-card\b/, 'no cards');
    assert.doesNotMatch(css, /grid-template-columns:\s*1fr 1fr/, 'no grid of equal cards');
    assert.doesNotMatch(html, /\shidden\b/, 'no hidden attribute');
    const ungated = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').filter((rule) => !rule.includes('motion-ok'));
    for (const rule of ungated) {
      assert.doesNotMatch(rule, /opacity:\s*0(\.0+)?\s*(;|$)/, `opacity 0 at rest: ${rule.trim()}`);
      assert.doesNotMatch(rule, /visibility:\s*hidden/, `visibility hidden at rest: ${rule.trim()}`);
      assert.doesNotMatch(rule, /display:\s*none/, `display none at rest: ${rule.trim()}`);
    }
    // The index script only marks the current link; it never hides or moves content.
    const js = scriptOf(src);
    assert.match(js, /aria-current/, 'the script marks the current link');
    assert.doesNotMatch(js, /hidden|\.style\.|opacity|display/, 'the script touches no visibility');
    assert.ok(!src.includes(['', 'Users', ''].join('/')), 'no machine path');
  });
}

test('commands: usage on the dark stage, flags as chips, links as gx-link', () => {
  const html = markup(read(COMMANDS));
  assert.match(html, /<pre class="gx-escuro[^"]*"[^>]*><code>\{cmd\.usage\}<\/code><\/pre>/, 'usage on the dark stage');
  assert.match(html, /<dt><code class="gx-chip[^"]*">\{flag\.label\}<\/code><\/dt>/, 'flag labels as chips');
  assert.match(html, /<dd>\{flag\.desc\}<\/dd>/, 'flag descriptions as definitions');
  assert.match(html, /class="gx-link[^"]*"[^>]*>\{t\.cmdBackToHome\}/, 'back link');
  assert.match(html, /href=\{`\/\$\{lang\}\/#loop`\}/, 'the loop link still points at the home loop section');
  assert.match(html, /class="gx-link[^"]*"[^>]*>\{cmd\.loop\.link\}/, 'loop link');
});

test('anatomy: the loop folders as a tree on the dark stage, the comparison as two lists', () => {
  const html = markup(read(ANATOMY));
  assert.match(html, /<ul class="gx-escuro[^"]*entry-tree/, 'the folder tree is on the dark stage');
  assert.match(html, /<Fragment set:html=\{t\.anatomyTitle\} \/>/, 'the title keeps its line break');
  assert.match(html, /class="gx-cit[^"]*"[^>]*>\{t\.anatomyVsClosing\}/, 'the closing line as a quote');
  assert.match(html, /class="gx-btn[^"]*"[^>]*>\{t\.anatomyCtaBtn\}/, 'the manual button');
});

test('anatomy: folder names in the tree take the accent, like the .vibeflow/ root', () => {
  const rules = rulesOf(styleOf(read(ANATOMY)));
  const winner = (target) => {
    let best = null;
    for (const [list, body] of rules) {
      const color = /(?:^|;|\s)color:\s*([^;]+);/.exec(body)?.[1]?.trim();
      if (!color) continue;
      for (const sel of list.split(',').map((s) => s.trim())) {
        if (!target(sel)) continue;
        const s = specificity(sel);
        if (!best || s >= best.s) best = { s, sel, color };
      }
    }
    return best;
  };
  // Every rule that can color the <code class="entry-tree-name"> of a branch, and the root's code.
  const name = winner((sel) => /\.entry-tree-name$/.test(sel) || /\.entry-tree code$/.test(sel) || sel === 'code.entry-tree-name');
  const root = winner((sel) => /\.entry-tree-root code$/.test(sel) || /\.entry-tree code$/.test(sel));
  assert.equal(name?.color, 'var(--accent-on-deep)', `the folder name is colored by ${name?.sel}`);
  assert.equal(root?.color, 'var(--accent-on-deep)', `the root is colored by ${root?.sel}`);
});

test('the two components ship the same index script', () => {
  // The script is copied in both components; a fix that lands in one copy only is a regression.
  const commands = scriptOf(read(COMMANDS)).trim();
  assert.ok(commands.includes('aria-current'), 'the commands component ships the index script');
  assert.equal(scriptOf(read(ANATOMY)).trim(), commands);
});

// ---------------------------------------------------------------------------------------------
// The index script, run against generated page layouts.
//
// A stand-in for the browser, just big enough for the script: entries stacked one after another
// below a page head, a page foot after them, a viewport that scrolls, scroll and hash events, and
// animation frames and timers. Time passes only when the test says so (`idle`), so a jump's smooth
// scroll is a run of scroll events with no pause between them, as in a browser.

function indexScriptOf(file) {
  assert.equal(typeof nodeModule.stripTypeScriptTypes, 'function', 'node:module stripTypeScriptTypes (Node 22.13 or later)');
  return nodeModule.stripTypeScriptTypes(scriptOf(read(file)), { mode: 'strip' });
}

function pageModel(code, { heights, viewport, head = 420, foot = 160, margin = 24, names, hash = '' }) {
  let y = 0;
  const ids = names ?? heights.map((_, i) => `entry-${i}`);
  let top = head;
  const entries = heights.map((h, i) => {
    const e = { id: ids[i], pageTop: top, height: h };
    top += h;
    return e;
  });
  const pageHeight = top + foot;
  const end = Math.max(0, pageHeight - viewport);
  const listeners = new Map();
  const on = (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]);
  const fire = (type, ev) => (listeners.get(type) ?? []).forEach((fn) => fn(ev));
  const frames = [];
  const timers = new Map();
  let nextTimer = 1;
  let now = 0;

  const withAttrs = (o) => {
    const map = new Map();
    return Object.assign(o, {
      setAttribute: (k, v) => map.set(k, String(v)),
      removeAttribute: (k) => map.delete(k),
      getAttribute: (k) => (map.has(k) ? map.get(k) : null),
      hasAttribute: (k) => map.has(k),
    });
  };
  const elements = new Map(
    entries.map((e) => [
      e.id,
      withAttrs({ id: e.id, getBoundingClientRect: () => ({ top: e.pageTop - y, bottom: e.pageTop + e.height - y, height: e.height }) }),
    ]),
  );
  const links = ids.map((id) => {
    // A browser serialises a link's hash percent-encoded.
    const a = withAttrs({ hash: `#${encodeURIComponent(id)}` });
    a.closest = (sel) => (/\ba\b/.test(sel) ? a : null);
    return a;
  });
  const toc = withAttrs({ querySelectorAll: (sel) => (/\ba\b/.test(sel) ? links : []) });
  const location = { hash };
  // An IntersectionObserver that honours the rootMargin it is given, for a script that uses one.
  const observers = [];
  class IntersectionObserver {
    constructor(callback, options = {}) {
      const [t, r = t, b = t] = String(options.rootMargin ?? '0px').trim().split(/\s+/);
      const px = (v) => (v.endsWith('%') ? (parseFloat(v) / 100) * viewport : parseFloat(v));
      Object.assign(this, { callback, top: px(t), bottom: px(b), targets: new Map() });
      observers.push(this);
    }
    observe(el) { this.targets.set(el, undefined); }
    unobserve(el) { this.targets.delete(el); }
    disconnect() { this.targets.clear(); }
    deliver() {
      const changed = [];
      for (const [el, was] of this.targets) {
        const rect = el.getBoundingClientRect();
        const now = rect.top < viewport + this.bottom && rect.bottom > -this.top;
        if (now !== was) {
          this.targets.set(el, now);
          changed.push({ target: el, isIntersecting: now });
        }
      }
      if (changed.length) this.callback(changed, this);
    }
  }
  const deliver = () => observers.forEach((o) => o.deliver());
  const win = {
    IntersectionObserver,
    get scrollY() { return y; },
    innerHeight: viewport,
    location,
    addEventListener: on,
    requestAnimationFrame: (fn) => frames.push(fn),
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms = 0) => { timers.set(nextTimer, { fn, at: now + ms }); return nextTimer++; },
    clearTimeout: (n) => timers.delete(n),
    getComputedStyle: () => ({ scrollMarginTop: `${margin}px` }),
  };
  const doc = {
    querySelectorAll: (sel) => (sel.includes('data-doc-toc') ? [toc] : []),
    getElementById: (id) => elements.get(id) ?? null,
    documentElement: { get scrollHeight() { return pageHeight; }, get clientHeight() { return viewport; } },
    addEventListener: on,
  };
  new Function('window', 'document', 'location', 'getComputedStyle', 'requestAnimationFrame', 'setTimeout', 'clearTimeout', 'innerHeight', 'IntersectionObserver', code)(
    win, doc, location, win.getComputedStyle, win.requestAnimationFrame, win.setTimeout, win.clearTimeout, viewport, IntersectionObserver,
  );

  const runFrames = () => {
    for (let i = 0; i < 5 && frames.length; i++) frames.splice(0).forEach((fn) => fn(0));
  };
  // One scroll event, with the frames it schedules; no time passes.
  const scroll = (to) => {
    const next = Math.max(0, Math.min(Math.round(to), end));
    if (next === y) return;
    y = next;
    fire('scroll', { type: 'scroll' });
    runFrames();
    deliver();
  };
  // Time passes: every timer due within `ms` runs, in order.
  const wait = (ms) => {
    deliver();
    const until = now + ms;
    for (;;) {
      let next = null;
      for (const [n, t] of timers) if (t.at <= until && (next === null || t.at < timers.get(next).at)) next = n;
      if (next === null) break;
      const { fn, at } = timers.get(next);
      timers.delete(next);
      now = Math.max(now, at);
      fn();
      runFrames();
    }
    now = until;
  };
  // The page rests: every pending timer runs.
  const idle = () => wait(10_000);
  idle();
  // The reader's own scroll gestures, each one before the scroll it causes.
  const gestures = {
    wheel: (dir) => fire('wheel', { type: 'wheel', deltaY: dir * 100 }),
    touch: (dir, first) => fire(first ? 'touchstart' : 'touchmove', { type: first ? 'touchstart' : 'touchmove' }),
    key: (dir) => fire('keydown', { type: 'keydown', key: dir > 0 ? 'ArrowDown' : 'ArrowUp' }),
  };

  return {
    ids,
    end,
    get y() { return y; },
    scrollTo(to) { scroll(to); idle(); },
    wait,
    idle,
    // A scroll by hand: a gesture, then its 100 px of scroll, every 30 ms, and the page rests.
    hand(kind, dir, steps = 12) {
      for (let i = 0; i < steps; i++) {
        gestures[kind](dir, i === 0);
        scroll(y + dir * 100);
        wait(30);
      }
      idle();
    },
    // Following an index link: the click, the hash, a smooth scroll in steps, then the page rests
    // (unless `rest` is false: then no time has passed since the last step of the jump).
    jump(id, { rest = true } = {}) {
      const link = links[ids.indexOf(id)];
      fire('click', { target: link, button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false });
      const changed = location.hash !== `#${id}`;
      location.hash = `#${id}`;
      const from = y;
      const to = Math.max(0, Math.min(entries[ids.indexOf(id)].pageTop - margin, end));
      for (let step = 1; step <= 8; step++) {
        scroll(from + ((to - from) * step) / 8);
        if (step === 1 && changed) fire('hashchange', { type: 'hashchange' });
      }
      if (changed && from === to) fire('hashchange', { type: 'hashchange' });
      if (rest) idle();
    },
    // The address bar changes to `to` (taken as typed, malformed or not) and the page hears it.
    setHash(to) {
      location.hash = to;
      fire('hashchange', { type: 'hashchange' });
      runFrames();
      idle();
    },
    current() {
      const marked = links.filter((a) => a.getAttribute('aria-current') !== null);
      assert.ok(marked.length <= 1, `more than one current link: ${marked.map((a) => a.hash)}`);
      if (marked.length) assert.equal(marked[0].getAttribute('aria-current'), 'location');
      return marked.length ? ids[links.indexOf(marked[0])] : null;
    },
  };
}

// The marks seen while scrolling from one position to another, in steps.
function marksWhileScrolling(p, from, to, step) {
  const seen = [];
  const dir = Math.sign(to - from) || 1;
  for (let at = from; dir > 0 ? at < to + step : at > to - step; at += dir * step) {
    p.scrollTo(dir > 0 ? Math.min(at, to) : Math.max(at, to));
    const c = p.current();
    if (c && seen.at(-1) !== c) seen.push(c);
  }
  return seen;
}

// The product the briefing asks for: entries from short (150 px) to long (1,500 px), the last one
// short included, by screens from 600 to 1,200 px tall, with and without a page foot.
const HEIGHTS = [150, 600, 1500];
const sequences = (n) => (n === 0 ? [[]] : sequences(n - 1).flatMap((s) => HEIGHTS.map((h) => [...s, h])));
const LAYOUTS = [];
for (const heights of [...sequences(5), [700, 900, 1200, 400, 150, 150, 150, 150], [150, 150, 150, 150, 150, 150, 150, 150, 150, 150]]) {
  for (const viewport of [600, 900, 1200]) {
    for (const foot of [0, 300]) {
      const pageHeight = 420 + heights.reduce((a, b) => a + b, 0) + foot;
      if (pageHeight > viewport) LAYOUTS.push({ heights, viewport, foot });
    }
  }
}
const label = (l) => `heights ${l.heights.join('/')}, screen ${l.viewport}, foot ${l.foot}`;

for (const file of [COMMANDS, ANATOMY]) {
  const name = file.split('/').pop();

  test(`${name}: scrolling marks every entry in order, both ways, and the last one at the page end`, () => {
    const code = indexScriptOf(file);
    const failures = [];
    for (const layout of LAYOUTS) {
      const p = pageModel(code, layout);
      const down = marksWhileScrolling(p, 0, p.end, 20);
      const atEnd = p.current();
      const up = marksWhileScrolling(p, p.end, 0, 20);
      if (down.join() !== p.ids.join()) failures.push(`${label(layout)}: going down marks ${down.join(' > ')}`);
      if (atEnd !== p.ids.at(-1)) failures.push(`${label(layout)}: at the page end ${atEnd} is current`);
      if (up.join() !== [...p.ids].reverse().join()) failures.push(`${label(layout)}: going up marks ${up.join(' > ')}`);
    }
    assert.deepEqual(failures.slice(0, 10), [], `${failures.length} failures over ${LAYOUTS.length} layouts`);
  });

  test(`${name}: any address hash, malformed included, never throws; one that does not decode is a hash without a target`, () => {
    const code = indexScriptOf(file);
    const names = ['intro', 'ação', 'entry-2'];
    const layout = { heights: [600, 600, 600], viewport: 900, names };
    // What the page marks with no hash at all: the entry at the top.
    const plain = pageModel(code, layout).current();
    const HASHES = [
      { hash: '', want: plain },
      { hash: '#', want: plain },
      { hash: '#entry-2', want: 'entry-2' },
      { hash: '#missing', want: plain },
      { hash: '#%', want: plain },
      { hash: '#%E0%A4%A', want: plain },
      { hash: `#${encodeURIComponent('ação')}`, want: 'ação' },
    ];
    const failures = [];
    for (const { hash, want } of HASHES) {
      let p;
      try {
        p = pageModel(code, { ...layout, hash });
      } catch (e) {
        failures.push(`landing on ${JSON.stringify(hash)} throws ${e.name}`);
        continue;
      }
      if (p.current() !== want) failures.push(`landing on ${JSON.stringify(hash)} marks ${p.current()}, not ${want}`);
      // The same hash arriving later, after a jump elsewhere: the mark follows reading when it has no target.
      p.jump('entry-2');
      p.hand('wheel', -1, 20);
      try {
        p.setHash(hash);
      } catch (e) {
        failures.push(`hashchange to ${JSON.stringify(hash)} throws ${e.name}`);
        continue;
      }
      const after = names.includes(want) && want !== plain ? want : plain;
      if (p.current() !== after) failures.push(`hashchange to ${JSON.stringify(hash)} marks ${p.current()}, not ${after}`);
    }
    assert.deepEqual(failures, []);
  });

  test(`${name}: a jump from the index marks the entry jumped to, from the top and from the end`, () => {
    const code = indexScriptOf(file);
    const failures = [];
    for (const layout of LAYOUTS) {
      const p = pageModel(code, layout);
      for (const origin of ['top', 'end']) {
        for (const id of p.ids) {
          p.scrollTo(origin === 'top' ? 0 : p.end);
          p.jump(id);
          const c = p.current();
          if (c !== id) failures.push(`${label(layout)}: from the ${origin}, #${id} marks ${c ?? 'nothing'}`);
        }
      }
      // After a jump, scrolling on takes the mark along again (when the jump left room to scroll).
      p.jump(p.ids[0]);
      if (p.y < p.end) {
        const down = marksWhileScrolling(p, p.y, p.end, 20);
        if (down.at(-1) !== p.ids.at(-1)) failures.push(`${label(layout)}: after a jump, scrolling to the end marks ${down.join(' > ')}`);
      }
    }
    assert.deepEqual(failures.slice(0, 10), [], `${failures.length} failures over ${LAYOUTS.length} layouts`);
  });

  test(`${name}: a scroll by hand right after a jump takes the mark along, the jump's own scroll does not`, () => {
    // Every entry jumped to, by hand up and down, by wheel, touch and key, with the hand starting
    // from 0 to 600 ms after the last step of the jump (on both sides of the script's pause).
    const code = indexScriptOf(file);
    const failures = [];
    let cases = 0;
    for (const layout of LAYOUTS) {
      const p = pageModel(code, layout);
      // The same layout, only ever scrolled: the mark the reading rule gives at a position.
      const rule = pageModel(code, layout);
      const markAt = (at) => {
        rule.scrollTo(at);
        return rule.current();
      };
      for (const id of p.ids) {
        for (const dir of [1, -1]) {
          for (const pause of [0, 50, 100, 149, 151, 200, 400, 600]) {
            for (const kind of ['wheel', 'touch', 'key']) {
              cases++;
              const at = `${label(layout)}: #${id}, ${kind} ${dir > 0 ? 'down' : 'up'} after ${pause} ms`;
              p.scrollTo(0);
              p.jump(id, { rest: false });
              const landed = p.y;
              p.wait(pause);
              if (p.current() !== id) failures.push(`${at}: before the hand, marks ${p.current() ?? 'nothing'}`);
              p.hand(kind, dir);
              const c = p.current();
              const want = p.y === landed ? id : markAt(p.y);
              if (c !== want) failures.push(`${at}: the hand stops at ${p.y} and ${c ?? 'nothing'} is marked, not ${want}`);
            }
          }
          // No hand: the jump's own scroll, however long the page takes to rest, keeps the mark.
          p.scrollTo(0);
          p.jump(id, { rest: false });
          p.idle();
          if (p.current() !== id) failures.push(`${label(layout)}: #${id} with no hand marks ${p.current() ?? 'nothing'}`);
        }
      }
    }
    assert.deepEqual(failures.slice(0, 10), [], `${failures.length} failures over ${cases} cases`);
  });
}
