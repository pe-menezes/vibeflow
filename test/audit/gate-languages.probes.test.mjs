// Behavior probes from the independent audit of the gate-languages fixture (part 1 of the
// language-agnostic work): make.mjs writing into its destination, the change it builds, and the
// meter reading reports. Behavior only, pinned by content. Each case states, as comments, the
// contract it protects, the plausible regression that breaks it, and why the implementer's tests
// did not catch it. A case marked `todo` asserts what a known open gap asks for: it runs and prints
// without failing the suite.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expandCases, tokenListed } from '../fixtures/gate-languages/matrix.mjs';
import { measure } from '../fixtures/gate-languages/measure.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const MAKE = join(ROOT, 'test/fixtures/gate-languages/make.mjs');

const scratch = [];
function tempDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `vibeflow-gate-probe-${label}-`));
  scratch.push(dir);
  return dir;
}
after(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

// Every git and node call of these probes runs without the GIT_* variables the caller may carry
// (a hook or a pre-commit would point them at the wrong repository).
function cleanEnv(extra = {}) {
  return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))), ...extra };
}
const runMake = (dest, env = cleanEnv()) => spawnSync(process.execPath, [MAKE, dest], { encoding: 'utf8', env });
function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

// --- make.mjs: the destination (the risk code of the part) ---------------------------------------

// Contract: make.mjs refuses a destination that exists and is not a directory, and leaves the file
// as it was (the header of make.mjs: anything but a missing or empty directory is refused and
// nothing is touched).
// Breaks when: the guard is rewritten to "create the directory if missing, else clear it" or to an
// `rmSync(dest)` before `mkdirSync`, which turns a mistyped path to a file into a lost file.
// Not covered by: the implementer's tests try a non-empty directory and an empty one, never a file.
test('make.mjs: a destination that is a file is refused, and the file keeps its content', () => {
  const parent = tempDir('file');
  const dest = join(parent, 'notes.txt');
  writeFileSync(dest, 'keep me\n');
  const result = runMake(dest);
  assert.notEqual(result.status, 0, 'make.mjs accepted a file as its destination');
  assert.equal(readFileSync(dest, 'utf8'), 'keep me\n');
  assert.deepEqual(readdirSync(parent), ['notes.txt']);
});

// Contract: a destination that is a symbolic link to a directory with content is that directory with
// content: refused, and nothing is written into the target.
// Breaks when: the check moves to `lstatSync` to "not follow links" and only empties a real
// directory, so the link passes the guard and `repo/` and `manifest.json` land in the target.
// Not covered by: no test of the implementer uses a symbolic link.
test('make.mjs: a symbolic link to a non-empty directory is refused, and the target is untouched', () => {
  const parent = tempDir('link');
  const target = join(parent, 'target');
  mkdirSync(target);
  writeFileSync(join(target, 'keep.txt'), 'keep me\n');
  const link = join(parent, 'link');
  symlinkSync(target, link, 'dir');
  const result = runMake(link);
  assert.notEqual(result.status, 0, 'make.mjs wrote through a link to a non-empty directory');
  assert.deepEqual(readdirSync(target), ['keep.txt']);
  assert.equal(readFileSync(join(target, 'keep.txt'), 'utf8'), 'keep me\n');

  // A link to nowhere is not a way in either: refused, and its target is not created.
  const dangling = join(parent, 'dangling');
  symlinkSync(join(parent, 'nowhere'), dangling, 'dir');
  assert.notEqual(runMake(dangling).status, 0);
  assert.equal(existsSync(join(parent, 'nowhere')), false);
});

// Contract: when git fails in the middle (here, the second commit), make.mjs exits with an error
// and writes no manifest.json: a manifest exists only next to a repository with both commits, so
// the meter is never pointed at a half-built fixture. Nothing is written outside the destination.
// Breaks when: the manifest is written before the commits (it does not depend on them), or the
// git helper stops checking the exit status, and a failed build looks like a finished one.
// Not covered by: the implementer's tests only run make.mjs with a working git.
test('make.mjs: git failing at the second commit leaves no manifest and exits with an error', () => {
  const parent = tempDir('gitfail');
  const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  assert.ok(realGit, 'git is on the PATH');
  const bin = join(parent, 'bin');
  mkdirSync(bin);
  const wrapper = join(bin, 'git');
  writeFileSync(wrapper, [
    '#!/bin/sh',
    'for a in "$@"; do',
    '  if [ "$a" = commit ]; then',
    '    if [ -e "$PROBE_GIT_MARK" ]; then echo "probe: simulated git failure" >&2; exit 1; fi',
    '    : > "$PROBE_GIT_MARK"',
    '  fi',
    'done',
    `exec "${realGit}" "$@"`,
    '',
  ].join('\n'));
  chmodSync(wrapper, 0o755);
  const dest = join(parent, 'out');
  const env = cleanEnv({ PATH: `${bin}:${process.env.PATH}`, PROBE_GIT_MARK: join(parent, 'mark') });
  const result = runMake(dest, env);
  assert.ok(existsSync(join(parent, 'mark')), 'the first commit ran through the wrapper');
  assert.notEqual(result.status, 0, 'make.mjs exited 0 after git failed');
  assert.match(result.stderr, /simulated git failure|failed/);
  assert.equal(existsSync(join(dest, 'manifest.json')), false, 'a manifest was written for a fixture that failed');
  assert.deepEqual(readdirSync(parent).sort(), ['bin', 'mark', 'out']);
});

// Contract: make.mjs builds its own repository even when the caller carries GIT_DIR (a git hook, a
// pre-commit, a script run from inside another repository): the fixture's two commits land in
// <dest>/repo, and the other repository keeps its HEAD and its history.
// Breaks when: the GIT_* filter of gitEnv() goes, and `git add -A` and `git commit` run against
// the repository GIT_DIR names, committing the fixture on top of someone else's branch.
// Not covered by: the implementer's tests launch make.mjs with every GIT_* variable removed, so the
// filter is never exercised.
test('make.mjs: an inherited GIT_DIR does not receive the fixture commits', () => {
  const parent = tempDir('gitdir');
  const other = join(parent, 'other');
  mkdirSync(other);
  git(other, ['init', '-q', '-b', 'main']);
  git(other, ['config', 'user.name', 'Other']);
  git(other, ['config', 'user.email', 'other@example.invalid']);
  git(other, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(other, 'mine.txt'), 'mine\n');
  git(other, ['add', '-A']);
  git(other, ['commit', '-q', '-m', 'mine']);
  const head = git(other, ['rev-parse', 'HEAD']).trim();
  const dest = join(parent, 'out');
  const result = runMake(dest, cleanEnv({ GIT_DIR: join(other, '.git') }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(other, ['rev-parse', 'HEAD']).trim(), head, 'the other repository got new commits');
  assert.equal(git(other, ['rev-list', '--count', 'HEAD']).trim(), '1');
  assert.equal(git(join(dest, 'repo'), ['rev-list', '--count', 'HEAD']).trim(), '2');
  assert.ok(existsSync(join(dest, 'manifest.json')));
});

// --- the change make.mjs builds --------------------------------------------------------------------

// Contract: the change adds the planted lines and the decoys and takes out the SEC101 protections,
// and nothing else (the header of make.mjs: the change adds the planted lines and the decoys and
// removes those protections): every + and - line of the diff the model reads is a line of some case, so a finding
// "outside the manifest" is the model's, never the fixture's.
// Breaks when: the layout puts context lines only in the change commit (or a new file appears only
// there), and lines no case owns enter the diff.
// Not covered by: the implementer's test checks that each snippet line is in the diff, not that the
// diff holds nothing more.
test('make.mjs: the + and - lines of the change are exactly the lines of the cases', () => {
  const dest = join(tempDir('diff'), 'out');
  assert.equal(runMake(dest).status, 0);
  const manifest = JSON.parse(readFileSync(join(dest, 'manifest.json'), 'utf8'));
  const diff = git(join(dest, 'repo'), ['diff', 'HEAD~1', 'HEAD']).split('\n');
  const got = [];
  let file = null;
  for (const line of diff) {
    if (line.startsWith('+++ ')) file = line.slice(6);
    else if (line.startsWith('--- ')) continue;
    else if (line.startsWith('+') || line.startsWith('-')) got.push(`${file}|${line}`);
  }
  const want = manifest.flatMap((c) => c.snippet.map((s) => `${c.path}|${c.side === 'removed' ? '-' : '+'}${s}`));
  assert.deepEqual(got.sort(), want.sort());
});

// --- the decoys ----------------------------------------------------------------------------------

// Contract: a decoy carries a word of the catalog without being the behaviour (the fixture README:
// "decoys that carry a catalog word without being the behaviour"); by the instrument's own
// function, the decoy's line holds a term of the rule it is filed under.
// Breaks when: a decoy names only part of a term (`InsecureSkipVerify` without `=true`, `verify`
// without `=false`) or is filed under a rule whose term it lacks (a comment about logging a password
// filed under DAT104, which asks for the logging call): the decoy then baits a reader of the
// catalog's words less than its kind says, and the false-positive rate per kind mixes two things.
// Not covered by: the implementer's tests check decoy kinds per language, never the decoy's label.
test('decoys: every decoy holds a term of its rule, by tokenListed', () => {
  const weak = expandCases().filter((c) => c.kind === 'decoy' && !tokenListed(c.rule, c.snippet.join('\n'))).map((c) => c.id);
  assert.deepEqual(weak, []);
});

// --- the meter -----------------------------------------------------------------------------------

const manifest = expandCases();
const byId = (id) => manifest.find((c) => c.id === id);
const keptSomewhere = (result, raw) => JSON.stringify(result).includes(JSON.stringify(raw).slice(1, -1));

// Contract: findings on the same planted case count it once, whatever their severity (ALLOWED
// included) and whether the path carries `./`, on the real manifest.
// Breaks when: the count moves from a set of case ids to a counter of findings, or the `./` strip
// moves out of the line pattern, and a model that repeats itself reads as a better detector.
// Not covered by: the implementer's tests prove each piece apart on a hand-made manifest of four
// cases (two findings on one case; `./` and ALLOWED only at the parser), never together on the
// manifest make.mjs writes.
test('meter: two findings on one case, one ALLOWED and one with ./, count the case once', () => {
  const c = byId('python-SEC108-catalog');
  const text = [
    '### Critical Gate',
    'Left out of the package: none',
    `- 🟡 WARNING [SEC108] ./${c.path}:${c.line} — dynamic exec`,
    `- ✅ ALLOWED [SEC108] \`${c.path}:${c.line + 1}\` — dynamic exec — override: "documented"`,
  ].join('\n');
  const r = measure(manifest, [{ path: 'r.md', text }]).reports[0];
  assert.deepEqual(r.detectedIds, [c.id]);
  assert.equal(r.planted.detected, 1);
  assert.equal(r.byRule.SEC108.detected, 1);
  assert.equal(r.outside.length, 0);
});

// Contract: a finding that cites a range of lines holding the planted line is a detection of that
// case (the matching rule speaks of the finding's line; a range that holds the case points at it).
// Breaks when: the end of the range is dropped (from the line pattern or from the distance), so the
// range's first line is taken as the finding's line, and a model that cites the whole method
// (`csharp/Customers.cs:1-6` for the response on line 5) reads as "outside the manifest".
// Not covered by: the implementer's tests never write a range.
test('meter: a finding whose line range holds the planted line detects it', () => {
  const c = byId('csharp-DAT102-idiomatic');
  const text = `### Critical Gate\n- 🟠 HIGH [DAT102] ${c.path}:1-${c.line + 1} — card number in the response\n`;
  const r = measure(manifest, [{ path: 'r.md', text }]).reports[0];
  assert.deepEqual(r.detectedIds, [c.id]);
});

// Contract: a finding line of a report is never dropped without a trace: what the meter does not
// count, it lists (unparsed, outside, a note).
// Breaks when: the reader goes back to stopping at the first `### Critical Gate` section, and the
// findings of a second one (a reaudit appended to the report, a model that writes the section twice) vanish
// from every count and every list.
// Not covered by: the implementer's tests have one section per report.
test('meter: a second `### Critical Gate` section is read or reported, never dropped', () => {
  const c = byId('python-SEC108-catalog');
  const raw = `- 🟡 WARNING [SEC108] ${c.path}:${c.line} — dynamic exec`;
  const text = ['### Critical Gate', 'Clean — no destructive operations detected.', '### Findings', 'No findings.', '### Critical Gate', raw].join('\n');
  const result = measure(manifest, [{ path: 'r.md', text }]);
  assert.ok(keptSomewhere(result, raw), 'the finding of the second section is neither counted nor listed');
});

// Contract: the section runs to the next heading; a `#` line inside a fenced code block (a quoted
// Python, Ruby or shell comment, which three of the decoys are) is not a heading.
// Breaks when: the heading test runs before the fence is read (or the fence reading goes), so any
// line that starts with `# ` ends the section, and every finding after a quoted comment is lost
// without a trace.
// Not covered by: the implementer's tests have no code block inside the section.
test('meter: a `#` line inside a code block does not end the section', () => {
  const c = byId('python-SEC108-catalog');
  const raw = `- 🟡 WARNING [SEC108] ${c.path}:${c.line} — dynamic exec`;
  const text = [
    '### Critical Gate',
    'Left out of the package: none',
    '- 🟡 WARNING [SEC108] python/helpers.py:2 — eval in a comment:',
    '```python',
    '# never pass the text to eval, parse it',
    '```',
    raw,
  ].join('\n');
  const result = measure(manifest, [{ path: 'r.md', text }]);
  assert.ok(keptSomewhere(result, raw), 'the finding after the code block is neither counted nor listed');
});

// --- reaudit of the first fix round: the counts apart, --language, fences ------------------------

const MEASURE = join(ROOT, 'test/fixtures/gate-languages/measure.mjs');

// Contract: detected, allowed and mentioned are disjoint, and a line the model flagged is never
// "mentioned without a finding": a planted case that only ALLOWED points at stays in `allowed`, a
// flagged decoy stays flagged and a detected case stays detected, even when a note cites each one.
// Breaks when: the set of cases a citation may not mention is built from the detected cases only (or
// from detected and decoys), and a case the model excused as ALLOWED, or a decoy it flagged, is
// counted twice, once as seen and once as cited without a finding.
// Not covered by: the implementer's test of mentions has no ALLOWED finding and no flagged decoy;
// its ALLOWED test cites nothing outside a finding line.
test('meter: a case flagged as ALLOWED, a flagged decoy and a detected case are never mentioned', () => {
  const allowed = byId('python-SEC108-catalog');
  const detected = byId('python-SEC106-catalog');
  const decoy = byId('python-SEC108-decoy-comment');
  const text = [
    '### Critical Gate',
    `- ✅ ALLOWED [SEC108] ${allowed.path}:${allowed.line} — dynamic exec — override: "made up"`,
    `- 🟠 HIGH [SEC106] ${detected.path}:${detected.line} — verification off`,
    `- 🟡 WARNING [SEC108] ${decoy.path}:${decoy.line} — eval`,
    `Worth a second look: ${allowed.path}:${allowed.line}, ${detected.path}:${detected.line} and ${decoy.path}:${decoy.line}.`,
  ].join('\n');
  const r = measure(manifest, [{ path: 'r.md', text }]).reports[0];
  assert.deepEqual(r.detectedIds, [detected.id]);
  assert.deepEqual(r.allowed.ids, [allowed.id]);
  assert.equal(r.decoys.comment.flagged, 1);
  assert.deepEqual(r.mentioned, { total: 0, byLanguage: {}, ids: [] });
});

// Contract: an ALLOWED finding on a decoy line is a decoy flagged (the decision of the first fix
// round: the fixture carries no `vibeflow:allow`, so the model saw a rule fire where none should).
// Breaks when: the ALLOWED split of planted cases spreads to decoys, and a model that excuses every
// false positive as ALLOWED reads as one with no false positive.
// Not covered by: the implementer's tests put ALLOWED on planted cases only.
test('meter: an ALLOWED finding on a decoy counts as a decoy flagged', () => {
  const decoy = byId('ruby-SEC108-decoy-string');
  const text = `### Critical Gate\n- ✅ ALLOWED [SEC108] ${decoy.path}:${decoy.line} — eval — override: "made up"\n`;
  const r = measure(manifest, [{ path: 'r.md', text }]).reports[0];
  assert.equal(r.decoys.string.flagged, 1);
  assert.equal(r.allowed.total, 0);
  assert.equal(r.planted.detected, 0);
});

// Contract: with `--language`, the manifest is cut to that language end to end, and a finding in a
// file of another language is listed as outside the manifest, never dropped.
// Breaks when: the command line filters the report's findings by language before matching (or
// measures against the whole manifest and cuts the tables after), so a finding on another
// language's file vanishes from every list, or the total is again every planted case.
// Not covered by: the implementer's command-line test reads the three samples, which have no
// finding outside their language; the outside outcome is proved only on matchFinding.
test('measure.mjs --language: a finding in a file of another language is outside, and the tables hold that language only', () => {
  const dir = tempDir('language');
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const py = byId('python-SEC108-catalog');
  const rust = byId('rust-SEC108-idiomatic');
  const foreign = `- 🟡 WARNING [SEC108] ${rust.path}:${rust.line} — command built at run time`;
  const report = join(dir, 'r.md');
  writeFileSync(report, ['### Critical Gate', `- 🟡 WARNING [SEC108] ${py.path}:${py.line} — command built at run time`, foreign, ''].join('\n'));
  const run = spawnSync(process.execPath, [MEASURE, '--manifest', manifestPath, '--language', 'python', '--report', report, '--json'], { encoding: 'utf8', env: cleanEnv() });
  assert.equal(run.status, 0, run.stderr);
  const r = JSON.parse(run.stdout).reports[0];
  const pythonPlanted = manifest.filter((c) => c.language === 'python' && c.kind === 'planted').length;
  assert.deepEqual(r.planted, { detected: 1, total: pythonPlanted });
  assert.deepEqual(Object.keys(r.byLanguage), ['python']);
  assert.deepEqual(r.outside.map((f) => f.raw), [foreign.trim()]);
});

// Contract: a fence closes only on a line of the same character at least as long, and a heading
// inside a fence opens no section (the header of measure.mjs).
// Breaks when: any line of three backticks closes the fence, so a quoted fence inside a longer one
// turns the quoted lines into findings, or the gate heading is matched before the fence is read.
// Not covered by: the implementer's fence test nests fences of two different characters, never a
// shorter fence of the same character, and quotes no gate heading.
test('meter: a fence closes only on a fence of the same character at least as long, and a quoted gate heading opens no section', () => {
  const quoted = byId('python-SEC108-catalog');
  const real = byId('python-SEC108-other');
  const text = [
    '### Critical Gate',
    '````markdown',
    '### Critical Gate',
    '```',
    `- 🟡 WARNING [SEC108] ${quoted.path}:${quoted.line} — quoted, not a finding`,
    '````',
    `- 🟡 WARNING [SEC108] ${real.path}:${real.line} — command built at run time`,
  ].join('\n');
  const r = measure(manifest, [{ path: 'r.md', text }]).reports[0];
  assert.equal(r.section.sections, 1);
  assert.deepEqual(r.detectedIds, [real.id]);
});

// Contract: a finding line of a report is never dropped without a trace (the contract of the
// second-section probe above), also when a code fence is opened and never closed.
// Breaks when: a fence that never closes goes back to running to the end of the report, every later
// line fenced, so the findings after it, and a later `### Critical Gate` section, leave no trace in
// any count or list.
// Not covered by: the implementer's fence test always closes its fences.
test('meter: a finding after a fence that never closes is counted or listed', () => {
  const c = byId('python-SEC108-catalog');
  const raw = `- 🟡 WARNING [SEC108] ${c.path}:${c.line} — dynamic exec`;
  const text = ['### Critical Gate', 'An example:', '```python', 'subprocess.call(cmd, shell=True)', raw].join('\n');
  const result = measure(manifest, [{ path: 'r.md', text }]);
  assert.ok(keptSomewhere(result, raw), 'the finding after the unclosed fence is neither counted nor listed');
});

// --- reaudit of the second fix round: mentioned planted cases and decoys apart ------------------

// Contract: the split of the mentioned cases into planted cases and decoys keeps one count per case:
// a case detected, one only ALLOWED, one matched by a finding of another rule and a flagged decoy are
// in neither part, even when a note cites each of them; a planted case and a decoy cited and not
// flagged are each in their own part, and the parts add up to `mentioned`, by language, per report
// and summed.
// Breaks when: the two parts are built by kind from the citations of the section instead of from the
// mentioned set, so a case the model flagged, excused or put under another rule is counted again,
// in a part, as seen and not flagged.
// Not covered by: the implementer's tests of the split read samples whose notes cite no flagged
// case, its other-rule test has no decoy and no ALLOWED, and the counts-apart probe above asserts
// `mentioned` only.
test('meter: a case flagged, allowed or under another rule is in neither part of mentioned, and the parts add up', () => {
  const detected = byId('python-SEC106-catalog');
  const allowed = byId('python-SEC108-catalog');
  const other = byId('python-SEC104-catalog');
  const decoy = byId('python-SEC108-decoy-comment');
  const seenPlanted = byId('python-DAT104-catalog');
  const seenDecoy = byId('python-DAT102-decoy-string');
  const text = [
    '### Critical Gate',
    `- 🟠 HIGH [SEC106] ${detected.path}:${detected.line} — verification off`,
    `- ✅ ALLOWED [SEC108] ${allowed.path}:${allowed.line} — dynamic exec — override: "made up"`,
    `- 🔴 CRITICAL [DAT101] ${other.path}:${other.line} — not this rule`,
    `- 🟡 WARNING [SEC108] ${decoy.path}:${decoy.line} — eval`,
    `Seen: ${[detected, allowed, other, decoy, seenPlanted, seenDecoy].map((c) => `${c.path}:${c.line}`).join(', ')}.`,
  ].join('\n');
  const result = measure(manifest, [{ path: 'r.md', text }]);
  const r = result.reports[0];
  assert.deepEqual(r.otherRule.map((f) => f.caseId), [other.id]);
  assert.deepEqual(r.mentionedPlanted, { total: 1, byLanguage: { python: 1 }, ids: [seenPlanted.id] });
  assert.deepEqual(r.mentionedDecoys, { total: 1, byLanguage: { python: 1 }, ids: [seenDecoy.id] });
  assert.deepEqual(r.mentioned, { total: 2, byLanguage: { python: 2 }, ids: [seenPlanted.id, seenDecoy.id] });
  assert.deepEqual(result.sum.mentionedPlanted, { total: 1, byLanguage: { python: 1 } });
  assert.deepEqual(result.sum.mentionedDecoys, { total: 1, byLanguage: { python: 1 } });
});
