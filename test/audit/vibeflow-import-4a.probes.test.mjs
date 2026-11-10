// Audit probes for vibeflow-import part 4a: the external-import fixture at the
// scale of a real app (13 local patterns) and the three source documents that
// only the source carries (a subject-only skill, a broad-glob rule and an
// always-on Cursor rule). Behavior only: each probe reads the fixture's files
// and pins what they contain, not a sha, a line number, a count of lines or a
// date. Each case states, as comments, the contract it protects, the plausible
// regression that breaks it and why the implementer's tests miss it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(ROOT, 'test/fixtures/external-import/app');
const SOURCE = join(ROOT, 'test/fixtures/external-import/source');

function filesUnder(dir, suffix) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path, suffix));
    else if (entry.name.endsWith(suffix)) out.push(path);
  }
  return out.sort();
}

function read(path) {
  return readFileSync(path, 'utf8');
}

// What the app's .vibeflow/ tells a model: every local pattern plus the
// conventions file.
function localDocs() {
  const patterns = filesUnder(join(APP, 'vibeflow/patterns'), '.md');
  return [...patterns, join(APP, 'vibeflow/conventions.md')].map((path) => ({ path, text: read(path) }));
}

function appCode() {
  return [...filesUnder(join(APP, 'src'), '.js'), ...filesUnder(join(APP, 'test'), '.js')]
    .map((path) => ({ path, text: read(path) }));
}

// Contract: the rules the README lists as existing "only in the source" are in
//   no local pattern and in no conventions.md of the app, so a spec or an
//   audit that names them can only have taken them from the imported document
//   (acceptance steps 4 and 6). The source documents do carry them.
// Breaks when: a later enlargement of the fixture (this part added ten local
//   patterns) writes one of these rules into a local doc, for example a
//   logging.md that adopts `<feature>.<event>` names (storage.md already uses
//   that shape for keys), a forms.md with a confirm-before-leaving step, or a
//   navigation.md that freezes ROUTES; the acceptance then passes without the
//   import doing anything.
// Not covered by: test/import-fixture.test.mjs checks counts, frontmatter and
//   the registry of the local patterns, never what their text says.
test('the source-only rules are in the source documents and in no local doc of the app', () => {
  const rules = [
    { name: 'navigation rule 1 (frozen ROUTES)', doc: 'claude/rules/navigation.md', mark: /Object\.freeze/ },
    { name: 'navigation rule 3 (screen title)', doc: 'claude/rules/navigation.md', mark: /\btitle\b/ },
    { name: 'navigation rule 5 (navigator.back)', doc: 'claude/rules/navigation.md', mark: /navigator\.back\(\)/ },
    { name: 'screen-flows rule 1 (save returns ok: false)', doc: 'claude/skills/screen-flows/SKILL.md', mark: /ok: false/ },
    { name: 'screen-flows rule 2 (confirmDiscard)', doc: 'claude/skills/screen-flows/SKILL.md', mark: /confirmDiscard/ },
    { name: 'code-style (JSDoc block)', doc: 'claude/rules/code-style.md', mark: /\/\*\*/ },
    { name: 'logging (event name shape)', doc: 'cursor/rules/logging.mdc', mark: /<feature>\.<event>/ },
  ];
  const docs = localDocs();
  for (const rule of rules) {
    assert.match(read(join(SOURCE, rule.doc)), rule.mark, `${rule.doc} carries ${rule.name}`);
    for (const { path, text } of docs) {
      assert.doesNotMatch(text, rule.mark, `${path} must not carry ${rule.name}`);
    }
  }
  const logging = read(join(APP, 'vibeflow/patterns/logging.md'));
  assert.doesNotMatch(logging, /\.(info|warn|error)\('[a-z]+\.[a-z_]+'/,
    'the local logging pattern shows no <feature>.<event> name');
});

// Contract: the app's code breaks the source-only rules that can be checked on
//   the code it has today (README, "Navigation rules that exist only in the
//   source" and "Other rules that exist only in the source"), so following
//   the local pattern and following the imported rule lead to different code.
// Breaks when: a fixture edit "tidies" the app toward the source (a JSDoc
//   block on an export, a frozen ROUTES, dotted log event names in the logger
//   test), and the divergence the spec must write down disappears.
// Not covered by: the implementer's tests run the app's own tests and check
//   that each pattern's module holds .js code, never what that code does.
test('the app code breaks the source-only rules it can break today', () => {
  const code = appCode();
  const routes = read(join(APP, 'src/features/home/navigation/home-routes.js'));
  assert.doesNotMatch(routes, /Object\.freeze/, 'ROUTES is a plain object');
  const routeNames = [...routes.matchAll(/^\s+[A-Z_]+: '([^']+)',?$/gm)].map((match) => match[1]);
  assert.ok(routeNames.length > 0, 'home-routes.js declares route names');
  for (const name of routeNames) assert.ok(!name.includes('/'), `route ${name} has no module prefix`);

  const screens = filesUnder(join(APP, 'src/features'), '-screen.js').map(read);
  assert.ok(screens.length > 0, 'the app has screens');
  for (const screen of screens) assert.doesNotMatch(screen, /\btitle\s*:/, 'screens declare no title');
  assert.ok(screens.some((screen) => /navigate\('[^']+'\)/.test(screen)), 'a screen navigates with a string literal');

  for (const { path, text } of code) {
    assert.doesNotMatch(text, /\/\*\*/, `${path} has no JSDoc block`);
    assert.doesNotMatch(text, /\.(info|warn|error)\('[a-z]+\.[a-z_]+'/, `${path} logs no <feature>.<event> name`);
  }
  assert.ok(code.some(({ text }) => /export function/.test(text)), 'the app exports functions');
  assert.ok(code.some(({ text }) => /\.(info|warn|error)\('[^'.]+'/.test(text)), 'the app logs at least one event without a dotted name');
});

// Contract: the app's .vibeflow/ is in the format `analyze` writes (README,
//   "The two sides": "a .vibeflow/ in the analyze format"): each pattern doc
//   wraps its generated sections in vibeflow:auto markers and carries a
//   confidence `analyze` uses (analyze/SKILL.md, pattern doc structure and
//   YAML frontmatter rules), so step 7's `analyze --scope` meets analyzer
//   output and not legacy docs it would rewrite.
// Breaks when (open today, low finding B1): the 13 local patterns have no
//   vibeflow:auto markers and say `confidence: high`.
// Not covered by: the implementer's test checks tags and modules only.
// Marked todo so the file stays green while the gap is open; drop `todo` once
// the local patterns carry the markers and an analyze confidence.
test('every local pattern carries the analyze markers and an analyze confidence', { todo: 'audit finding B1 (low): local patterns have no vibeflow:auto markers and say confidence: high' }, () => {
  const patterns = filesUnder(join(APP, 'vibeflow/patterns'), '.md');
  for (const path of patterns) {
    const text = read(path);
    assert.match(text, /<!-- vibeflow:auto:start -->[\s\S]*<!-- vibeflow:auto:end -->/, `${path} has the auto markers`);
    assert.match(text, /^confidence: (inferred|validated|deprecated)$/m, `${path} has an analyze confidence`);
  }
});
