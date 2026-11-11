// Re-audit probes for the PR fix of vibeflow-leitura (M2, M3 and B1): the
// full-read meter (test/fixtures/full-read/measure.mjs) and the receipt
// criterion of the skill text. Behavior only: each meter probe builds a
// transcript in the shape a Claude Code session writes, or a spec, and pins
// what the meter reports, by content (no sha, line number of the fixture,
// count of lines or date). Each case states, as comments, the contract it
// protects, the plausible regression that breaks it and why the implementer's
// tests miss it. A case marked `todo` asserts what an open low finding of the
// re-audit asks for: it runs and prints without failing the suite.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = join(ROOT, 'test/fixtures/full-read');
const PREPARE = join(FIXTURE, 'prepare.mjs');
const MEASURE = join(FIXTURE, 'measure.mjs');

const CONVENTIONS = '.vibeflow/conventions.md';
const FORMS = '.vibeflow/patterns/forms.md';
const VALIDATION = '.vibeflow/patterns/validation.md';
const STORAGE = '.vibeflow/patterns/storage.md';
const SCREENS = '.vibeflow/patterns/external-team-conventions/docs-screens.md';

let dir;
let app;
let counter = 0;

function cleanEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  return env;
}

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'vibeflow-leitura-pr-probes-'));
  const result = spawnSync(process.execPath, [PREPARE, join(dir, 'p'), '--stage', 'implement'], { encoding: 'utf8', env: cleanEnv() });
  assert.equal(result.status, 0, `prepare.mjs failed: ${result.stderr}`);
  app = JSON.parse(result.stdout).app;
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

const docLines = (rel) => readFileSync(join(app, rel), 'utf8').replace(/\n$/, '').split('\n');

function use(name, input) {
  counter += 1;
  const id = `toolu_pr_${counter}`;
  return { id, record: { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } } };
}

function result(id, content, toolUseResult) {
  return { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] }, toolUseResult };
}

function transcript(records) {
  counter += 1;
  const path = join(dir, `t${counter}.jsonl`);
  writeFileSync(path, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return path;
}

function measure(transcripts, extra = []) {
  const args = [MEASURE];
  for (const t of transcripts) args.push('--transcript', t);
  args.push('--app', app, ...extra, '--json');
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', env: cleanEnv() });
  assert.equal(r.status, 0, `measure.mjs failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const docOf = (report, rel) => {
  const found = report.documents.find((d) => d.path === rel);
  assert.ok(found, `the report has ${rel}`);
  return found;
};

// A Read of a saved file whose lines are already built; `readPrefix` gives
// Read's line-number prefix for line i.
function readSaved(savedLines, readPrefix) {
  const u = use('Read', { file_path: '/scratch/saved.txt' });
  const content = savedLines.map((line, i) => `${readPrefix(i + 1)}${line}`).join('\n');
  return [u.record, result(u.id, content, { type: 'text', file: { filePath: '/scratch/saved.txt', numLines: savedLines.length, startLine: 1, totalLines: savedLines.length } })];
}

// --- M2: saved grep output read back with Read --------------------------------

// Contract: a document line shown behind Read's prefix and grep's prefix is
// seen, whichever of Read's two prefix forms (`N\t` or `N→`) came in front.
// Regression: the second pass of prefixes applied only to the `\t` form.
// The executor's tests build only the `\t` form.
test('saved grep -n output behind the arrow form of the Read prefix: every line seen', () => {
  const all = docLines(SCREENS);
  const saved = all.map((line, i) => `${i + 1}:${line}`);
  const report = measure([transcript(readSaved(saved, (n) => `${String(n).padStart(6)}→`))]);
  const d = docOf(report, SCREENS);
  assert.ok(d.distinctive > 0);
  assert.equal(d.seen, d.distinctive, `${d.seen}/${d.distinctive}`);
  assert.equal(report.canaries.find((c) => c.id === 'C4').seen, true);
});

// Contract: a context line of `grep -n -C` (prefix `N-`) read back with Read
// is seen like a match line. Regression: the second pass handles `N:` only.
// The executor's tests save only match lines.
test('saved grep -n context lines (N-) read with Read are seen', () => {
  const all = docLines(FORMS);
  const last = all.length;
  const saved = [`${last - 1}-${all[last - 2]}`, `${last}:${all[last - 1]}`];
  const report = measure([transcript(readSaved(saved, (n) => `${String(n).padStart(6)}\t`))]);
  assert.equal(report.canaries.find((c) => c.id === 'C2').seen, true);
});

// Contract: taking two prefixes off never makes a line seen whose text was not
// shown whole: a line with text added after it, or a line cut at its end,
// behind both prefixes, stays unseen. Regression: a looser strip or a
// "contains" match. The executor's guard covers a line cut to 40 characters
// behind the `\t` form only.
test('two prefixes off: a line with a suffix or cut by one character stays unseen', () => {
  const all = docLines(FORMS);
  const last = all.length;
  const c2 = all[last - 1];
  const saved = [`${last}:${c2} (edited)`, `${last}:${c2.slice(0, -1)}`];
  const report = measure([
    transcript(readSaved(saved, (n) => `${String(n).padStart(6)}\t`)),
    transcript(readSaved(saved, (n) => `${String(n).padStart(6)}→`)),
  ]);
  assert.equal(report.canaries.find((c) => c.id === 'C2').seen, false);
  assert.equal(docOf(report, FORMS).seen, 0);
});

// --- M3: the list of the spec -------------------------------------------------

function spec(body) {
  counter += 1;
  const path = join(dir, `spec-${counter}.md`);
  writeFileSync(path, `# Spec: profile\n\n## Objective\nEdit the profile.\n\n${body}\n## Risks\nRisk code: none\n`);
  return path;
}

const targetsOf = (specPath) => measure([transcript([])], ['--spec', specPath]).documents.map((d) => d.path);

// Contract: the list is only the section that ends at `Documents to read:`; a
// pattern doc named in an earlier section (Technical Decisions explaining a
// divergence) is not a target. Regression: the list read from the top of the
// spec to `Documents to read:`. The executor's specs have no list line in an
// earlier section, so they pass either way.
test('a pattern doc named in an earlier section is not a target', () => {
  const s = spec([
    '## Decisões técnicas',
    '- `patterns/validation.md`: diverges here, the limits live in `LIMITS`.',
    '',
    '## Padrões aplicáveis',
    '- `patterns/forms.md`: the draft lives in `createForm`.',
    '',
    'Documents to read: 2 (300 lines): .vibeflow/conventions.md and the pattern docs listed above',
    '',
  ].join('\n'));
  assert.deepEqual(targetsOf(s), [CONVENTIONS, FORMS]);
});

// Contract: a `###` subheading inside the translated section does not cut the
// list; the items above and below it are targets. Regression: the walk back
// stops at any heading (`#`), not at `## `. The executor's specs have no
// subheading.
test('a ### subheading inside the translated list keeps every item', () => {
  const s = spec([
    '## Padrões aplicáveis',
    '- `patterns/storage.md` — key `profile.<id>`.',
    '### Locais',
    '- `forms.md` — `createForm`.',
    '- `.vibeflow/patterns/validation.md`: rules at module level.',
    '',
    'Documents to read: 4 (400 lines): .vibeflow/conventions.md and the pattern docs listed above',
    '',
  ].join('\n'));
  assert.deepEqual(targetsOf(s), [CONVENTIONS, STORAGE, FORMS, VALIDATION]);
});

// Contract: a 1.18.0 spec (no `Documents to read:` line) is still read under
// `## Applicable Patterns`, and an imported entry's provenance there is not a
// target. Regression: the fallback dropped, or it keeps the old "any path"
// match. The executor's provenance test has the `Documents to read:` line.
test('a spec without Documents to read: list under Applicable Patterns, provenance out', () => {
  const s = spec([
    '## Applicable Patterns',
    '- `patterns/forms.md`: the draft lives in `createForm`.',
    `- ${SCREENS.replace('.vibeflow/', '')} — imported from team-conventions (patterns/validation.md @ 3f6a9c2): subject`,
    '',
  ].join('\n'));
  assert.deepEqual(targetsOf(s), [CONVENTIONS, FORMS, SCREENS]);
});

// Open low finding R1 (re-audit of the PR fix). Contract: every pattern doc a
// list line of the section opens with is measured, unless the line says it
// does not apply, so that "N of N read whole" never leaves out a document the
// spec told the consumer to read. Today a line that opens with the document
// and goes on with a parenthesis (`- patterns/x.md (why)`), with nothing, or a
// numbered item (`1. patterns/x.md: why`) is not a target, while the meter of
// f0a0d42 counted them. None of the specs of the 10/11 runs uses these forms
// (measured by the re-audit), so the acceptance numbers stand.
test('a list line that opens with a pattern doc in another form is a target', { todo: 'R1 (low): the meter only takes a document followed by `:` or a dash' }, () => {
  const s = spec([
    '## Applicable Patterns',
    '- `patterns/forms.md` (the draft lives in `createForm`)',
    '- patterns/storage.md',
    '1. `patterns/validation.md`: rules at module level.',
    '',
    'Documents to read: 4 (400 lines): .vibeflow/conventions.md and the pattern docs listed above',
    '',
  ].join('\n'));
  assert.deepEqual(targetsOf(s), [CONVENTIONS, FORMS, STORAGE, VALIDATION]);
});

// --- B1: the receipt criterion -------------------------------------------------

// Contract: no file the product ships keeps the criterion that admits a gap
// (the sentence without the clause that each read starts where the previous
// one stopped), in English or in the Portuguese manual. Regression: one
// edition or one role left with the old sentence. Probe 15 of
// vibeflow-leitura-3 checks a phrase list over the consumers and the roles;
// this one checks the whole tree outside `.vibeflow/`, CHANGELOG and MANUAL
// included, and pins the meaning, not the exact wording.
function shippedMarkdown() {
  const r = spawnSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: ROOT, encoding: 'utf8', env: cleanEnv() });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\0').filter((p) => p && !p.startsWith('.vibeflow/') && !p.startsWith('test/'));
}

test('receipt criterion: every multi-read sentence carries the no-gap clause', () => {
  let found = 0;
  for (const path of shippedMarkdown()) {
    const flat = readFileSync(join(ROOT, path), 'utf8').replace(/\s+/g, ' ');
    for (const m of flat.matchAll(/over more than one read([^.]*)counts as read whole/g)) {
      found += 1;
      assert.match(m[1], /\b(?:start|starts|starting|begin|begins|beginning)\b (?:from )?(?:where|at the line after where) (?:the previous|the last|the one before|it)(?: read| one)? (?:stopped|ended)|\bno gap\b|without a gap/, `${path}: "${m[0]}"`);
    }
    for (const m of flat.matchAll(/em mais de uma leitura([^.]*)conta como lido inteiro/g)) {
      found += 1;
      assert.match(m[1], /come[çc]\w* (?:de )?onde a (?:anterior|última) (?:leitura )?parou|sem buraco|sem lacuna/, `${path}: "${m[0]}"`);
    }
  }
  assert.ok(found >= 20, `the criterion was found ${found} times`);
});
