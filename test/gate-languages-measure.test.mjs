// The gate-languages meter: reads the `### Critical Gate` section of audit reports and says which
// planted cases of the manifest were flagged, which decoys were, and what fell outside it. The
// finding lines are generated from the product of every form the meter accepts, never picked by
// hand. No model and no network.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expandCases } from './fixtures/gate-languages/matrix.mjs';
import * as meter from './fixtures/gate-languages/measure.mjs';

const { criticalGateSection, matchFinding, measure, parseFindingLine, parseReport, restrictManifest } = meter;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'test/fixtures/gate-languages');
const MEASURE = join(FIXTURE, 'measure.mjs');
const MAKE = join(FIXTURE, 'make.mjs');

const scratch = [];
function tempDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `vibeflow-gate-measure-${label}-`));
  scratch.push(dir);
  return dir;
}
after(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function cleanEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}
const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: cleanEnv() });

// --- criterion 5: every form of a finding line ---------------------------------------------------

const EMOJI = { CRITICAL: '🔴', HIGH: '🟠', WARNING: '🟡', INFO: '🔵', ALLOWED: '✅' };
const SEVERITIES = Object.keys(EMOJI);
const TICKS = ['none', 'whole', 'path'];
const SEPARATORS = [' — ', ' - ', ': '];

function findingLine({ emoji, severity, tick, separator, line }) {
  const path = 'python/jobs.py';
  let location;
  if (tick === 'none') location = line ? `${path}:${line}` : path;
  else if (tick === 'whole') location = line ? `\`${path}:${line}\`` : `\`${path}\``;
  else location = line ? `\`${path}\`:${line}` : `\`${path}\``;
  const tail = severity === 'ALLOWED' ? 'shell command built at run time — override: "documented in spec"' : 'shell command built at run time';
  return `- ${emoji ? `${EMOJI[severity]} ` : ''}${severity} [SEC108] ${location}${separator}${tail}`;
}

test('the meter reads every form of a finding line the output format and part 2 allow', () => {
  let count = 0;
  for (const emoji of [true, false]) {
    for (const severity of SEVERITIES) {
      for (const tick of TICKS) {
        for (const separator of SEPARATORS) {
          for (const line of [12, null]) {
            const text = findingLine({ emoji, severity, tick, separator, line });
            const parsed = parseFindingLine(text);
            assert.ok(parsed, `not read: ${text}`);
            assert.equal(parsed.severity, severity, text);
            assert.equal(parsed.rule, 'SEC108', text);
            assert.equal(parsed.path, 'python/jobs.py', text);
            assert.equal(parsed.line, line, text);
            count += 1;
          }
        }
      }
    }
  }
  assert.equal(count, 2 * 5 * 3 * 3 * 2);
});

test('the four example lines of the audit output format are findings', () => {
  const lines = [
    '- 🔴 CRITICAL [DS102] db/migrate/003.sql:12 — DROP TABLE in migration (blocks)',
    '- 🟠 HIGH [SEC101] api/auth.ts:1 — auth middleware removed (blocks)',
    '- 🟡 WARNING [CFG102] config/app.yml:4 — debug mode enabled',
    '- ✅ ALLOWED [DS104] db/migrate/004.sql:7 — DROP COLUMN — override: "documented in spec"',
  ];
  const expected = [['CRITICAL', 'DS102', 'db/migrate/003.sql', 12], ['HIGH', 'SEC101', 'api/auth.ts', 1], ['WARNING', 'CFG102', 'config/app.yml', 4], ['ALLOWED', 'DS104', 'db/migrate/004.sql', 7]];
  lines.forEach((text, i) => {
    const parsed = parseFindingLine(text);
    assert.deepEqual([parsed.severity, parsed.rule, parsed.path, parsed.line], expected[i]);
  });
  assert.deepEqual(parseFindingLine('* HIGH [SEC106] ./go/http_client.go:2 — verification off').path, 'go/http_client.go');
});

test('the lines that are not findings are recognized, and the rest of the section is kept', () => {
  const report = parseReport([
    '## Audit Report',
    '### Critical Gate',
    'Left out of the package: none',
    'Clean — no destructive operations detected.',
    'Scanned 26 files; 0 skipped.',
    '- something the meter cannot read',
    '### Findings',
    '- 🔴 CRITICAL [SEC104] python/settings.py:2 — not in the section',
  ].join('\n'));
  assert.equal(report.present, true);
  assert.equal(report.leftOut, 'none');
  assert.equal(report.clean, true);
  assert.equal(report.noDiff, false);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.notes, ['Scanned 26 files; 0 skipped.']);
  assert.deepEqual(report.unparsed, ['- something the meter cannot read']);

  const noDiff = parseReport('### Critical Gate\nNo diff scanned — step 1 ran over the code.\n');
  assert.equal(noDiff.noDiff, true);
  assert.equal(noDiff.clean, false);
  assert.equal(noDiff.leftOut, null);
});

test('a missing section and a section at the end of the file', () => {
  const missing = parseReport('## Audit Report\n### Findings\nNo findings.\n');
  assert.equal(missing.present, false);
  assert.deepEqual(missing.findings, []);
  assert.equal(criticalGateSection('### Findings\n'), null);

  const last = parseReport('### Findings\nNo findings.\n### Critical Gate\nLeft out of the package: 2 file(s), read with git\n- 🟠 HIGH [SEC106] go/http_client.go:2 — verification off');
  assert.equal(last.present, true);
  assert.equal(last.leftOut, '2 file(s), read with git');
  assert.equal(last.findings.length, 1);
  assert.equal(last.findings[0].line, 2);
});

// --- criterion 6: the matching rule, case by case -----------------------------------------------

const MANIFEST = [
  { id: 'p1', kind: 'planted', rule: 'SEC108', language: 'python', extension: '.py', path: 'python/jobs.py', line: 10, side: 'added', extensionListed: true, tokenListed: true },
  { id: 'p2', kind: 'planted', rule: 'SEC108', language: 'python', extension: '.py', path: 'python/jobs.py', line: 20, side: 'added', extensionListed: true, tokenListed: false },
  { id: 'p3', kind: 'planted', rule: 'DAT101', language: 'python', extension: '.py', path: 'python/maintenance.py', line: 5, side: 'added', extensionListed: true, tokenListed: false },
  { id: 'p4', kind: 'planted', rule: 'SEC108', language: 'rust', extension: '.rs', path: 'rust/jobs.rs', line: 2, side: 'added', extensionListed: false, tokenListed: false },
  { id: 'd1', kind: 'decoy', rule: 'SEC108', decoyKind: 'comment', language: 'python', extension: '.py', path: 'python/helpers.py', line: 7, side: 'added', extensionListed: true, tokenListed: true },
];

const finding = (rule, path, line) => ({ severity: 'WARNING', rule, path, line, raw: `- WARNING [${rule}] ${path}${line ? `:${line}` : ''}` });

test('same rule on the exact line, and 2 lines away, is a detection', () => {
  assert.deepEqual(matchFinding(finding('SEC108', 'python/jobs.py', 10), MANIFEST), { outcome: 'detected', caseId: 'p1' });
  assert.deepEqual(matchFinding(finding('SEC108', 'python/jobs.py', 12), MANIFEST), { outcome: 'detected', caseId: 'p1' });
  assert.deepEqual(matchFinding(finding('SEC108', 'python/jobs.py', 8), MANIFEST), { outcome: 'detected', caseId: 'p1' });
});

test('3 lines away does not match', () => {
  assert.deepEqual(matchFinding(finding('SEC108', 'python/jobs.py', 13), MANIFEST), { outcome: 'outside', caseId: null });
  assert.deepEqual(matchFinding(finding('SEC108', 'python/jobs.py', 7), MANIFEST), { outcome: 'outside', caseId: null });
});

test('another rule on a planted line counts as another rule', () => {
  assert.deepEqual(matchFinding(finding('SEC104', 'python/jobs.py', 20), MANIFEST), { outcome: 'otherRule', caseId: 'p2' });
});

test('a finding on a decoy line, of any rule, is a decoy flagged', () => {
  assert.deepEqual(matchFinding(finding('SEC108', 'python/helpers.py', 7), MANIFEST), { outcome: 'decoy', caseId: 'd1' });
  assert.deepEqual(matchFinding(finding('DAT102', 'python/helpers.py', 9), MANIFEST), { outcome: 'decoy', caseId: 'd1' });
});

test('a finding that matches nothing is outside the manifest', () => {
  assert.deepEqual(matchFinding(finding('SEC108', 'python/other.py', 3), MANIFEST), { outcome: 'outside', caseId: null });
  assert.deepEqual(matchFinding(finding('SEC108', 'python/Jobs.py', 10), MANIFEST), { outcome: 'outside', caseId: null });
});

test('a finding without a line matches only when the file has one case of that rule', () => {
  assert.deepEqual(matchFinding(finding('DAT101', 'python/maintenance.py', null), MANIFEST), { outcome: 'detected', caseId: 'p3' });
  assert.deepEqual(matchFinding(finding('SEC108', 'python/jobs.py', null), MANIFEST), { outcome: 'outside', caseId: null });
  assert.deepEqual(matchFinding(finding('SEC104', 'python/maintenance.py', null), MANIFEST), { outcome: 'outside', caseId: null });
});

test('measure counts each planted case once, by quadrant, language and rule, and the decoys by kind', () => {
  const text = [
    '### Critical Gate',
    'Left out of the package: none',
    '- 🟡 WARNING [SEC108] python/jobs.py:10 — dynamic exec',
    '- 🟡 WARNING [SEC108] python/jobs.py:11 — dynamic exec again',
    '- 🔴 CRITICAL [SEC104] python/jobs.py:20 — not this rule',
    '- 🟡 WARNING [SEC108] python/helpers.py:7 — eval in a comment',
    '- 🟡 WARNING [SEC108] python/other.py:1 — elsewhere',
  ].join('\n');
  const result = measure(MANIFEST, [{ path: 'r1.md', text }]);
  const r = result.reports[0];
  assert.equal(r.planted.detected, 1);
  assert.equal(r.planted.total, 4);
  assert.deepEqual(r.byQuadrant['extension listed, term listed'], { detected: 1, total: 1 });
  assert.deepEqual(r.byQuadrant['extension listed, term not listed'], { detected: 0, total: 2 });
  assert.deepEqual(r.byQuadrant['extension not listed, term not listed'], { detected: 0, total: 1 });
  assert.deepEqual(r.byQuadrant['extension not listed, term listed'], { detected: 0, total: 0 });
  assert.deepEqual(r.byLanguage.python, { detected: 1, total: 3 });
  assert.deepEqual(r.byRule.SEC108, { detected: 1, total: 3 });
  assert.deepEqual(r.decoys.comment, { flagged: 1, total: 1 });
  assert.equal(r.otherRule.length, 1);
  assert.equal(r.outside.length, 1);
  assert.deepEqual(r.detectedIds, ['p1']);
  assert.equal(r.section.present, true);
  assert.equal(r.section.leftOut, 'none');
});

test('with several reports the meter keeps one table per report and their sum', () => {
  const one = '### Critical Gate\n- WARNING [SEC108] python/jobs.py:10 — exec\n';
  const two = '### Critical Gate\n- WARNING [SEC108] rust/jobs.rs:2 — exec\n- WARNING [SEC108] python/jobs.py:20 — exec\n';
  const result = measure(MANIFEST, [{ path: 'a.md', text: one }, { path: 'b.md', text: two }]);
  assert.equal(result.reports.length, 2);
  assert.deepEqual(result.sum.planted, { detected: 3, total: 8 });
  assert.deepEqual(result.sum.byRule.SEC108, { detected: 3, total: 6 });
  assert.deepEqual(result.sum.byLanguage.rust, { detected: 1, total: 2 });
});

// --- first fix round: ranges, sections, fences, ALLOWED, mentions --------------------------------

test('a finding with a line range is read by the whole range, and matches a case up to 2 lines from it', () => {
  const parsed = parseFindingLine('- 🟠 HIGH [SEC108] `python/jobs.py:4-8` — the whole function');
  assert.equal(parsed.line, 4);
  assert.equal(parsed.lineEnd, 8);
  assert.equal(parseFindingLine('- HIGH [SEC108] python/jobs.py:4 — one line').lineEnd, null);
  const ranged = (start, end) => ({ ...finding('SEC108', 'python/jobs.py', start), lineEnd: end });
  assert.deepEqual(matchFinding(ranged(4, 8), MANIFEST), { outcome: 'detected', caseId: 'p1' });
  assert.deepEqual(matchFinding(ranged(1, 15), MANIFEST), { outcome: 'detected', caseId: 'p1' });
  assert.deepEqual(matchFinding(ranged(1, 7), MANIFEST), { outcome: 'outside', caseId: null });
  // Two candidates: the nearer one wins (p1 at 10 is 2 from 12, p2 at 20 is 1 from 19).
  assert.deepEqual(matchFinding(ranged(12, 19), MANIFEST), { outcome: 'detected', caseId: 'p2' });
  assert.deepEqual(matchFinding({ ...finding('DAT102', 'python/helpers.py', 1), lineEnd: 5 }, MANIFEST), { outcome: 'decoy', caseId: 'd1' });
});

test('every `### Critical Gate` section is read, their findings summed, and more than one is said', () => {
  const text = [
    '### Critical Gate',
    'Clean — no destructive operations detected.',
    '### Findings',
    'No findings.',
    '### Critical Gate',
    '- 🟡 WARNING [SEC108] python/jobs.py:10 — dynamic exec',
  ].join('\n');
  const report = parseReport(text);
  assert.equal(report.sections, 2);
  assert.equal(report.findings.length, 1);
  assert.equal(report.clean, true);
  assert.equal(parseReport('### Critical Gate\nClean.\n').sections, 1);
  assert.equal(parseReport('### Findings\n').sections, 0);
  const r = measure(MANIFEST, [{ path: 'r.md', text }]).reports[0];
  assert.deepEqual(r.detectedIds, ['p1']);
  assert.equal(r.section.sections, 2);
});

test('a line inside a code fence is neither a heading nor a finding, and the section goes on after it', () => {
  const text = [
    '### Critical Gate',
    '- 🟡 WARNING [SEC108] python/helpers.py:7 — eval in a comment:',
    '```python',
    '# never pass the text to eval, parse it',
    '- 🔴 CRITICAL [SEC104] python/jobs.py:20 — quoted, not a finding',
    '```',
    '~~~~',
    '## a quoted heading',
    '```',
    '~~~~',
    '- 🟡 WARNING [SEC108] python/jobs.py:10 — dynamic exec',
    '### Findings',
    '- 🟡 WARNING [SEC108] python/jobs.py:20 — not in the section',
  ].join('\n');
  const report = parseReport(text);
  assert.equal(report.sections, 1);
  assert.deepEqual(report.findings.map((f) => `${f.path}:${f.line}`), ['python/helpers.py:7', 'python/jobs.py:10']);
  assert.deepEqual(report.unparsed, []);
  assert.deepEqual(report.notes, []);
});

test('a planted case flagged only as ALLOWED is not detected: it is counted apart, in the result and the text', () => {
  const text = [
    '### Critical Gate',
    '- ✅ ALLOWED [SEC108] python/jobs.py:10 — dynamic exec — override: "made up"',
    '- 🟡 WARNING [SEC108] python/jobs.py:20 — dynamic exec',
    '- ✅ ALLOWED [SEC108] python/jobs.py:21 — dynamic exec — override: "made up"',
  ].join('\n');
  const r = measure(MANIFEST, [{ path: 'r.md', text }]).reports[0];
  assert.deepEqual(r.detectedIds, ['p2']);
  assert.equal(r.planted.detected, 1);
  assert.deepEqual(r.allowed, { total: 1, byLanguage: { python: 1 }, ids: ['p1'] });
  assert.deepEqual(r.byRule.SEC108, { detected: 1, total: 3 });
  const dir = tempDir('allowed');
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(MANIFEST));
  const report = join(dir, 'r.md');
  writeFileSync(report, text);
  const human = run(MEASURE, ['--manifest', manifestPath, '--report', report]);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /^Allowed only, not counted as detected: 1 \(python 1\)$/m);
  assert.match(human.stdout, /^ {2}p1$/m);
  const json = JSON.parse(run(MEASURE, ['--manifest', manifestPath, '--report', report, '--json']).stdout);
  assert.deepEqual(json.reports[0].allowed.ids, ['p1']);
  assert.deepEqual(json.sum.allowed, { total: 1, byLanguage: { python: 1 } });
});

test('a case cited by path and line outside a finding, and not detected, is counted as mentioned', () => {
  const text = [
    '### Critical Gate',
    'Clean — nothing the catalog names.',
    'Worth a look: python/jobs.py:11 and `python/maintenance.py`:5, and ./python/helpers.py:8.',
    '- `exec` in python/jobs.py:20 runs a command',
    '- 🟡 WARNING [SEC108] python/jobs.py:20 — dynamic exec',
    'Also rust/jobs.rs:9 and python/other.py:1.',
  ].join('\n');
  const r = measure(MANIFEST, [{ path: 'r.md', text }]).reports[0];
  assert.deepEqual(r.detectedIds, ['p2']);
  assert.deepEqual(r.mentioned, { total: 3, byLanguage: { python: 3 }, ids: ['p1', 'p3', 'd1'] });
  assert.deepEqual(r.section.unparsed, ['- `exec` in python/jobs.py:20 runs a command']);
  assert.equal(r.section.notes.length, 2);
});

// --- real reports: one run each of the 1.20.0 pilot, kept in samples/ -----------------------------

const SAMPLES = join(FIXTURE, 'samples');
const sample = (name) => ({ path: name, text: readFileSync(join(SAMPLES, name), 'utf8') });
const cases = expandCases();

test('the Python report of the pilot: 12 findings, 12 of the 13 Python cases detected', () => {
  const r = measure(restrictManifest(cases, ['python']), [sample('python-sonnet.md')]).reports[0];
  assert.equal(r.findings.length, 12);
  assert.deepEqual(r.planted, { detected: 12, total: 13 });
  assert.deepEqual(Object.keys(r.byLanguage), ['python']);
  assert.deepEqual(cases.filter((c) => c.language === 'python' && c.kind === 'planted' && !r.detectedIds.includes(c.id)).map((c) => c.id), ['python-DAT102-other']);
  assert.equal(r.outside.length, 0);
  const whole = measure(cases, [sample('python-sonnet.md')]).reports[0];
  assert.deepEqual(whole.planted, { detected: 12, total: 125 });
  assert.equal(Object.keys(whole.byLanguage).length, 13);
});

test('the C# report of the pilot: 7 of the 7 C# cases detected', () => {
  const r = measure(restrictManifest(cases, ['csharp']), [sample('csharp-sonnet.md')]).reports[0];
  assert.equal(r.findings.length, 7);
  assert.deepEqual(r.planted, { detected: 7, total: 7 });
  assert.equal(r.outside.length + r.otherRule.length, 0);
});

test('the shell report of the pilot: Clean, two notes, 6 cases cited and none detected', () => {
  const r = measure(restrictManifest(cases, ['shell']), [sample('shell-opus.md')]).reports[0];
  assert.equal(r.section.clean, true);
  assert.equal(r.section.notes.length, 2);
  assert.equal(r.section.unparsed.length, 6);
  assert.deepEqual(r.planted, { detected: 0, total: 6 });
  assert.equal(r.mentioned.total, 6);
  assert.deepEqual(r.mentioned.byLanguage, { shell: 6 });
  assert.deepEqual([...r.mentioned.ids].sort(), cases.filter((c) => c.language === 'shell' && c.kind === 'planted').map((c) => c.id).sort());
});

test('the two note lines that open the all-languages report of the pilot are notes', () => {
  // The first two lines after `Left out of the package:` in that report, copied as they are.
  const scanned = 'Scanned: `.go`, `.java`, `.js`, `.py`, `.rb` and `.ts`, the file types the catalog names for source rules. The `csharp/`, `kotlin/`, `php/`, `rust/`, `shell/`, `swift/` and `tsx/` files fall outside those types and were not matched. Lines are the line number in the new file for added lines and in the old file for removed lines. No `vibeflow:allow` override appears anywhere.';
  const verdict = '**Verdict: FAIL** (CRITICAL and HIGH findings unresolved)';
  const report = parseReport(['### Critical Gate', 'Left out of the package: none', scanned, '', verdict, ''].join('\n'));
  assert.deepEqual(report.notes, [scanned, verdict]);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.unparsed, []);
});

test('restrictManifest keeps the given languages, and a finding in another language is outside', () => {
  const python = restrictManifest(MANIFEST, ['python']);
  assert.deepEqual(python.map((c) => c.id), ['p1', 'p2', 'p3', 'd1']);
  assert.deepEqual(restrictManifest(MANIFEST, ['python', 'rust']).length, 5);
  assert.deepEqual(matchFinding(finding('SEC108', 'rust/jobs.rs', 2), python), { outcome: 'outside', caseId: null });
  assert.throws(() => restrictManifest(MANIFEST, ['cobol']), /cobol/);
});

test('measure.mjs --language restricts the manifest, can repeat, and exits 64 on a language it does not have', () => {
  const dir = tempDir('language');
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(cases));
  const py = join(SAMPLES, 'python-sonnet.md');
  const cs = join(SAMPLES, 'csharp-sonnet.md');
  const one = JSON.parse(run(MEASURE, ['--manifest', manifestPath, '--language', 'python', '--report', py, '--json']).stdout);
  assert.deepEqual(one.reports[0].planted, { detected: 12, total: 13 });
  assert.deepEqual(Object.keys(one.reports[0].byLanguage), ['python']);
  const two = run(MEASURE, ['--manifest', manifestPath, '--language', 'python', '--language', 'csharp', '--report', py, '--report', cs]);
  assert.equal(two.status, 0, two.stderr);
  // Each report is measured against the restricted manifest, so the sum is over 2 x 20 cases.
  assert.match(two.stdout, /^Planted cases detected: 12\/20$/m);
  assert.match(two.stdout, /^Planted cases detected: 7\/20$/m);
  assert.match(two.stdout, /^Planted cases detected: 19\/40$/m);
  assert.match(two.stdout, /^Languages: python, csharp$/m);
  assert.equal(run(MEASURE, ['--manifest', manifestPath, '--language', 'cobol', '--report', py]).status, 64);
  assert.equal(run(MEASURE, ['--manifest', manifestPath, '--language', '--report', py]).status, 64);
  const shell = run(MEASURE, ['--manifest', manifestPath, '--language', 'shell', '--report', join(SAMPLES, 'shell-opus.md')]);
  assert.match(shell.stdout, /^Said: Clean$/m);
  assert.match(shell.stdout, /^Mentioned without a finding: 6 \(shell 6\)$/m);
  assert.match(shell.stdout, /^Planted cases detected: 0\/6$/m);
});

test('more than one `### Critical Gate` section is said in the text', () => {
  const dir = tempDir('sections');
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(MANIFEST));
  const report = join(dir, 'r.md');
  writeFileSync(report, '### Critical Gate\nClean.\n### Critical Gate\n- WARNING [SEC108] python/jobs.py:10 — exec\n');
  const out = run(MEASURE, ['--manifest', manifestPath, '--report', report]).stdout;
  assert.match(out, /^### Critical Gate: present, 2 sections \(warning: the findings of all of them are counted\)$/m);
  assert.match(out, /^Planted cases detected: 1\/4$/m);
});

// --- second fix round: what the 84 reports of the 1.20.0 measure showed ---------------------------
// Three of those reports, copied byte for byte into samples/ (one run each, Opus, on the diff of one
// folder): JavaScript run 2, Swift run 1 and Go run 2.

test('a finding line with a parenthesis between the path with its line and the separator is read, the parenthesis kept in raw', () => {
  const removed = '- 🔴 CRITICAL [SEC101] javascript/adminRoutes.js:2 (removed line) — `router.use(requireAuth)` removed (blocks)';
  const parsed = parseFindingLine(removed);
  assert.ok(parsed, `not read: ${removed}`);
  assert.deepEqual([parsed.severity, parsed.rule, parsed.path, parsed.line, parsed.lineEnd], ['CRITICAL', 'SEC101', 'javascript/adminRoutes.js', 2, null]);
  assert.equal(parsed.raw, removed);
  for (const text of [
    '- 🔴 CRITICAL [SEC101] typescript/adminRoutes.ts:2 (removed) — guard removed',
    '- HIGH [SEC101] `typescript/adminRoutes.ts:2` (removed): guard removed',
    '- HIGH [SEC101] `typescript/adminRoutes.ts`:2-3 (base) - guard removed',
  ]) {
    const p = parseFindingLine(text);
    assert.ok(p, `not read: ${text}`);
    assert.deepEqual([p.path, p.line], ['typescript/adminRoutes.ts', 2], text);
    assert.match(p.raw, /\((removed|base)\)/);
  }
});

test('the JavaScript report of the 1.20.0 measure: 13 findings, 13 of the 13 JavaScript cases detected', () => {
  const r = measure(restrictManifest(cases, ['javascript']), [sample('javascript-opus.md')]).reports[0];
  assert.equal(r.findings.length, 13);
  assert.deepEqual(r.section.unparsed, []);
  assert.deepEqual(r.planted, { detected: 13, total: 13 });
  assert.equal(r.outside.length + r.otherRule.length, 0);
  assert.deepEqual(r.mentionedPlanted, { total: 0, byLanguage: {}, ids: [] });
  assert.deepEqual(r.mentionedDecoys.total, 3);
});

test('the Swift report of the 1.20.0 measure: no Clean, 0 of 7 detected, the 7 planted cases and 3 decoys cited apart', () => {
  const r = measure(restrictManifest(cases, ['swift']), [sample('swift-opus.md')]).reports[0];
  assert.equal(r.section.clean, false);
  assert.deepEqual(r.findings, []);
  assert.equal(r.section.unparsed.length, 7, 'the OUT OF COVERAGE lines are not findings');
  assert.deepEqual(r.planted, { detected: 0, total: 7 });
  const swift = (kind) => cases.filter((c) => c.language === 'swift' && c.kind === kind).map((c) => c.id);
  assert.deepEqual(r.mentionedPlanted, { total: 7, byLanguage: { swift: 7 }, ids: swift('planted') });
  assert.deepEqual(r.mentionedDecoys, { total: 3, byLanguage: { swift: 3 }, ids: swift('decoy') });
  assert.deepEqual(r.mentioned, { total: 10, byLanguage: { swift: 10 }, ids: [...swift('planted'), ...swift('decoy')].sort((a, b) => cases.findIndex((c) => c.id === a) - cases.findIndex((c) => c.id === b)) });
});

test('the Go report of the 1.20.0 measure: 11 of 12 detected, the one missed is cited as planted, the 3 decoys as decoys', () => {
  const r = measure(restrictManifest(cases, ['go']), [sample('go-opus.md')]).reports[0];
  assert.equal(r.findings.length, 11);
  assert.deepEqual(r.planted, { detected: 11, total: 12 });
  assert.deepEqual(r.mentionedPlanted, { total: 1, byLanguage: { go: 1 }, ids: ['go-DAT102-other'] });
  assert.equal(cases.find((c) => c.id === 'go-DAT102-other').path, 'go/customers.go');
  assert.deepEqual(r.mentionedDecoys, { total: 3, byLanguage: { go: 3 }, ids: cases.filter((c) => c.language === 'go' && c.kind === 'decoy').map((c) => c.id) });
  assert.equal(r.mentioned.total, 4);
});

test('mentioned planted cases and decoys are said apart, by language, in the text and the JSON, per report and summed', () => {
  const dir = tempDir('mentioned');
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(cases));
  const go = join(SAMPLES, 'go-opus.md');
  const swift = join(SAMPLES, 'swift-opus.md');
  const human = run(MEASURE, ['--manifest', manifestPath, '--language', 'go', '--language', 'swift', '--report', go, '--report', swift]);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /^Mentioned without a finding: 4 \(go 4\)\n {2}planted: 1 \(go 1\)\n {4}go-DAT102-other\n {2}decoys: 3 \(go 3\)\n {4}go-SEC104-decoy-comment$/m);
  assert.match(human.stdout, /^Mentioned without a finding: 10 \(swift 10\)\n {2}planted: 7 \(swift 7\)\n/m);
  assert.match(human.stdout, /^Mentioned without a finding: 14 \(go 4, swift 10\)\n {2}planted: 8 \(go 1, swift 7\)\n {2}decoys: 6 \(go 3, swift 3\)$/m);
  const json = JSON.parse(run(MEASURE, ['--manifest', manifestPath, '--language', 'go', '--language', 'swift', '--report', go, '--report', swift, '--json']).stdout);
  assert.deepEqual(json.reports[0].mentionedPlanted.ids, ['go-DAT102-other']);
  assert.deepEqual(json.sum.mentioned, { total: 14, byLanguage: { go: 4, swift: 10 } });
  assert.deepEqual(json.sum.mentionedPlanted, { total: 8, byLanguage: { go: 1, swift: 7 } });
  assert.deepEqual(json.sum.mentionedDecoys, { total: 6, byLanguage: { go: 3, swift: 3 } });
});

test('a case with a finding of another rule on its line is in one count only: other rule, not mentioned', () => {
  const text = [
    '### Critical Gate',
    '- 🔴 CRITICAL [SEC104] python/jobs.py:20 — not this rule',
    'Worth a look: python/jobs.py:20 and python/jobs.py:10.',
  ].join('\n');
  const r = measure(MANIFEST, [{ path: 'r.md', text }]).reports[0];
  assert.deepEqual(r.otherRule.map((f) => f.caseId), ['p2']);
  assert.deepEqual(r.mentioned, { total: 1, byLanguage: { python: 1 }, ids: ['p1'] });
  assert.deepEqual(r.mentionedPlanted.ids, ['p1']);
});

test('a code fence that never closes is said, with the line it opens on, and the lines after it are read', () => {
  const text = [
    '# Audit',
    '### Critical Gate',
    'An example:',
    '```python',
    'subprocess.call(cmd, shell=True)',
    '- 🟡 WARNING [SEC108] python/jobs.py:10 — dynamic exec',
    '### Findings',
    '### Critical Gate',
    '- 🟡 WARNING [SEC108] python/jobs.py:20 — dynamic exec',
  ].join('\n');
  const report = parseReport(text);
  assert.deepEqual(report.unclosedFences, [4]);
  assert.equal(report.sections, 2);
  assert.deepEqual(report.findings.map((f) => f.line), [10, 20]);
  const closed = parseReport('### Critical Gate\n```\n- WARNING [SEC108] python/jobs.py:10 — quoted\n```\n');
  assert.deepEqual(closed.unclosedFences, []);
  assert.deepEqual(closed.findings, []);
  // Two fences after the one that never closes still pair up.
  const later = parseReport('### Critical Gate\n~~~\n```\n- WARNING [SEC108] python/jobs.py:10 — quoted\n```\n');
  assert.deepEqual(later.unclosedFences, [2]);
  assert.deepEqual(later.findings, []);

  const r = measure(MANIFEST, [{ path: 'r.md', text }]).reports[0];
  assert.deepEqual(r.section.unclosedFences, [4]);
  assert.deepEqual(r.detectedIds, ['p1', 'p2']);
  const dir = tempDir('fence');
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(MANIFEST));
  const path = join(dir, 'r.md');
  writeFileSync(path, text);
  const human = run(MEASURE, ['--manifest', manifestPath, '--report', path]);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /^Unclosed code fence at line 4 of the report \(warning: the lines after it are read as if it were not there\)$/m);
  assert.deepEqual(JSON.parse(run(MEASURE, ['--manifest', manifestPath, '--report', path, '--json']).stdout).reports[0].section.unclosedFences, [4]);
  // A report whose fences all close says nothing about them.
  writeFileSync(path, '### Critical Gate\nClean.\n');
  assert.doesNotMatch(run(MEASURE, ['--manifest', manifestPath, '--report', path]).stdout, /Unclosed/);
});

// --- the command line ----------------------------------------------------------------------------

test('measure.mjs reads a report of the real fixture and prints the measure, in text and in JSON', () => {
  const dir = tempDir('cli');
  const dest = join(dir, 'fixture');
  assert.equal(run(MAKE, [dest]).status, 0);
  const manifestPath = join(dest, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const target = manifest.find((c) => c.id === 'python-SEC108-catalog');
  const bait = manifest.find((c) => c.kind === 'decoy' && c.language === 'python' && c.decoyKind === 'comment');
  const report = join(dir, 'report.md');
  writeFileSync(report, [
    '# Audit',
    '### Critical Gate',
    'Left out of the package: none',
    `- 🟡 WARNING [SEC108] \`${target.path}:${target.line}\` — dynamic exec`,
    `- 🟡 WARNING [${bait.rule}] ${bait.path}:${bait.line} — word in a comment`,
    '### Findings',
    'No findings.',
  ].join('\n'));
  const json = run(MEASURE, ['--manifest', manifestPath, '--report', report, '--json']);
  assert.equal(json.status, 0, json.stderr);
  const result = JSON.parse(json.stdout);
  assert.deepEqual(result.reports[0].detectedIds, ['python-SEC108-catalog']);
  assert.equal(result.reports[0].planted.total, manifest.filter((c) => c.kind === 'planted').length);
  assert.equal(result.reports[0].decoys.comment.flagged, 1);

  const human = run(MEASURE, ['--manifest', manifestPath, '--report', report]);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /extension listed, term listed/);
  assert.match(human.stdout, /python/);
  assert.match(human.stdout, /Left out of the package: none/);
});

test('measure.mjs exits 64 on a wrong argument or a file it cannot read', () => {
  const dir = tempDir('args');
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(MANIFEST));
  const report = join(dir, 'r.md');
  writeFileSync(report, '### Critical Gate\nClean — no destructive operations detected.\n');
  assert.equal(run(MEASURE, ['--manifest', manifestPath, '--report', report]).status, 0);
  assert.equal(run(MEASURE, ['--report', report]).status, 64);
  assert.equal(run(MEASURE, ['--manifest', manifestPath]).status, 64);
  assert.equal(run(MEASURE, ['--manifest', manifestPath, '--report', report, '--bogus']).status, 64);
  assert.equal(run(MEASURE, ['--manifest', manifestPath, '--report', join(dir, 'missing.md')]).status, 64);
  assert.equal(run(MEASURE, ['--manifest', join(dir, 'missing.json'), '--report', report]).status, 64);
  writeFileSync(join(dir, 'bad.json'), '{ not json');
  assert.equal(run(MEASURE, ['--manifest', join(dir, 'bad.json'), '--report', report]).status, 64);
  assert.equal(run(MEASURE, ['--manifest', manifestPath, '--report']).status, 64);
});

// --- criterion 7: gate-prompt.mjs takes step 4 and the output lines by structure ---------------

const GATE_PROMPT = join(FIXTURE, 'gate-prompt.mjs');

const SYNTHETIC_SKILL = [
  '---',
  'name: audit',
  '---',
  '# Audit',
  '',
  '## Steps',
  '',
  '1. **Load** (`1/3 load`). Read the package.',
  '   It mentions the `### Critical Gate` section in passing.',
  '2. **Critical Gate — safety net** (`2/3 gate`).',
  '   STEP-BODY-FIRST',
  '   1. an indented numbered list does not end the step',
  '   a. **Match** each line.',
  '',
  '   STEP-BODY-LAST',
  '3. **Review** (`3/3 review`). Read the code.',
  '',
  '## Output',
  '',
  '```markdown',
  '### Findings Before',
  'not this',
  '### Critical Gate',
  'Left out of the package: <n> file(s), read with git | none',
  '- 🔴 CRITICAL [DS102] db/x.sql:12 — OUTPUT-LAST',
  '',
  '### Findings',
  '- not this either',
  '```',
].join('\n');

test('gate-prompt takes the numbered step whose title names the Critical Gate, to the next step', async () => {
  const { extractStep, extractOutputFormat } = await import('./fixtures/gate-languages/gate-prompt.mjs');
  const step = extractStep(SYNTHETIC_SKILL);
  assert.match(step[0], /^2\. \*\*Critical Gate/);
  assert.equal(step.at(-1), '   STEP-BODY-LAST');
  assert.ok(step.includes('   1. an indented numbered list does not end the step'));
  assert.ok(!step.some((line) => line.startsWith('3. ') || line.startsWith('1. ')));
  const output = extractOutputFormat(SYNTHETIC_SKILL);
  assert.equal(output[0], 'Left out of the package: <n> file(s), read with git | none');
  assert.equal(output.at(-1), '- 🔴 CRITICAL [DS102] db/x.sql:12 — OUTPUT-LAST');
  assert.ok(!output.some((line) => /not this/.test(line)));
});

test('gate-prompt prints the step, the output lines and the diff, and calls no model', () => {
  const dir = tempDir('prompt');
  const skill = join(dir, 'SKILL.md');
  const diff = join(dir, 'change.diff');
  writeFileSync(skill, SYNTHETIC_SKILL);
  writeFileSync(diff, 'diff --git a/x.py b/x.py\n+DIFF-MARKER\n');
  const result = run(GATE_PROMPT, ['--skill', skill, '--diff', diff]);
  assert.equal(result.status, 0, result.stderr);
  const out = result.stdout;
  for (const marker of ['STEP-BODY-FIRST', 'STEP-BODY-LAST', 'OUTPUT-LAST', '+DIFF-MARKER', '### Critical Gate']) assert.ok(out.includes(marker), marker);
  for (const absent of ['Read the code.', 'Read the package.', 'not this']) assert.ok(!out.includes(absent), absent);
  assert.ok(out.indexOf('STEP-BODY-LAST') < out.indexOf('OUTPUT-LAST'));
  assert.ok(out.indexOf('OUTPUT-LAST') < out.indexOf('+DIFF-MARKER'));
});

test('gate-prompt exits 64 on a wrong argument or an unreadable file, and 65 when the structure is missing', () => {
  const dir = tempDir('prompt-args');
  const skill = join(dir, 'SKILL.md');
  const diff = join(dir, 'change.diff');
  writeFileSync(skill, SYNTHETIC_SKILL);
  writeFileSync(diff, '+x\n');
  assert.equal(run(GATE_PROMPT, ['--skill', skill]).status, 64);
  assert.equal(run(GATE_PROMPT, ['--diff', diff]).status, 64);
  assert.equal(run(GATE_PROMPT, ['--skill', skill, '--diff', diff, '--model']).status, 64);
  assert.equal(run(GATE_PROMPT, ['--skill', join(dir, 'none.md'), '--diff', diff]).status, 64);
  const noStep = join(dir, 'no-step.md');
  writeFileSync(noStep, SYNTHETIC_SKILL.replace('2. **Critical Gate — safety net**', '2. **Gate**'));
  assert.equal(run(GATE_PROMPT, ['--skill', noStep, '--diff', diff]).status, 65);
  const noOutput = join(dir, 'no-output.md');
  writeFileSync(noOutput, SYNTHETIC_SKILL.replace('### Critical Gate\n', '### Gate\n'));
  assert.equal(run(GATE_PROMPT, ['--skill', noOutput, '--diff', diff]).status, 65);
});

test('gate-prompt finds the same structure in the audit SKILL.md of this repository', async () => {
  const { extractStep, extractOutputFormat } = await import('./fixtures/gate-languages/gate-prompt.mjs');
  const text = readFileSync(join(ROOT, 'plugins/vibeflow/skills/audit/SKILL.md'), 'utf8');
  const lines = text.split('\n');
  const step = extractStep(text);
  assert.match(step[0], /^\d+\. \*\*[^*]*Critical Gate/);
  const start = lines.indexOf(step[0]);
  const next = lines[start + step.length];
  assert.match(next, /^\d+\. /, 'the step ends where the next numbered step starts');
  assert.ok(step.length > 5);
  const output = extractOutputFormat(text);
  assert.ok(output.length > 0);
  assert.ok(output.some((line) => parseFindingLine(line)), 'the output lines hold a finding line the meter reads');
  assert.ok(!output.some((line) => /^#{1,3}\s/.test(line)));
});
