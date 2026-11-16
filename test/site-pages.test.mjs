// Checks on the two inner pages, commands (CommandsDocs.astro) and anatomy (VibeflowAnatomy.astro),
// read from their sources, with no build:
//
// * today's content stays whole: every i18n key and every string literal each component used at the
//   start commit is still used, and every key it uses exists in both languages;
// * the anchors other pages and other sites point at stay: one id per command, in today's order;
// * the reading layout: a page head (mono label, title, lede), an index with one link per entry,
//   the entry name in the display face, details as definition rows, flags as chips, code and folder
//   trees on the dark stage, and none of the old card grid or the fixed-header leftovers;
// * nothing is hidden at rest, and the index script only marks the current link.
//
// What only the built HTML can show (every index link lands on an id, every text is on the page)
// lives in site/scripts/check-pages.mjs, run after `npm run build` in site/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const COMMANDS = 'site/src/components/CommandsDocs.astro';
const ANATOMY = 'site/src/components/VibeflowAnatomy.astro';

// The commit this redesign started from, and what each component used there. The lists are frozen
// here because a shallow clone (the CI checkout) does not hold that commit; the next test proves
// them against it wherever the commit is reachable.
const START = '52704a8';
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

// git with no inherited GIT_* variable, so a hook's environment never points it at another repo.
function git(args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  return execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}
function startCommitReachable() {
  try {
    git(['cat-file', '-e', `${START}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

test('the frozen lists are what each component used at the start commit', (t) => {
  if (!startCommitReachable()) {
    t.diagnostic(`commit ${START} is not in this clone (shallow checkout); the frozen lists stand as written`);
    return;
  }
  for (const [file, use] of Object.entries(START_USE)) {
    const src = git(['show', `${START}:${file}`]);
    assert.deepEqual([...keysOf(src)].sort(), [...use.keys].sort(), `${file}: keys at ${START}`);
    assert.deepEqual([...literalsOf(src)].sort(), [...use.literals].sort(), `${file}: literals at ${START}`);
  }
});

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
  const has = (text, key) => new RegExp(`\\n\\s*${key}:\\s*'`).test(text);
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
    // Two columns on wide screens, the index sticky; a reading measure of at most 72 characters.
    assert.match(css, /grid-template-columns:/, 'the body is a grid on wide screens');
    assert.match(css, /\.doc-toc\s*{[^}]*position:\s*sticky/, 'the index follows the scroll');
    const measures = [...css.matchAll(/max-width:\s*(\d+)ch/g)].map((m) => Number(m[1]));
    assert.ok(measures.length > 0 && measures.every((n) => n <= 72), `reading measures: ${measures}`);
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
