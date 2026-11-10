// Audit probes for vibeflow-leitura part 1: the full-read meter
// (test/fixtures/full-read/measure.mjs) and the audit stage the fixture's
// prepare.mjs builds. Behavior only: each probe builds a transcript in the
// shape a Claude Code session writes, or prepares the app, and pins what the
// meter reports or what the prepared app holds, by content (no sha, line
// number of the fixture, count of lines or date). Each case states, as
// comments, the contract it protects, the plausible regression that breaks it
// and why the implementer's tests miss it. A case marked `todo` asserts what
// a known open finding of the audit asks for: it runs and prints without
// failing the suite, and the fix round removes the `todo`.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = join(ROOT, 'test/fixtures/full-read');
const PREPARE = join(FIXTURE, 'prepare.mjs');
const MEASURE = join(FIXTURE, 'measure.mjs');
const README = join(FIXTURE, 'README.md');

const CONVENTIONS = '.vibeflow/conventions.md';
const FORMS = '.vibeflow/patterns/forms.md';
const CODE_STYLE = '.vibeflow/patterns/external-team-conventions/claude-rules-code-style.md';
const SCREENS = '.vibeflow/patterns/external-team-conventions/docs-screens.md';

let dir;
let app; // implement stage, measured by the meter probes
let counter = 0;

function cleanEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  return env;
}

function prepare(target, stage) {
  const result = spawnSync(process.execPath, [PREPARE, target, '--stage', stage], { encoding: 'utf8', env: cleanEnv() });
  assert.equal(result.status, 0, `prepare.mjs failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'vibeflow-leitura-1-probes-'));
  app = prepare(join(dir, 'implement'), 'implement').app;
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

// The canary lines, read from the README table the meter itself reads.
function canaryText(id) {
  for (const line of readFileSync(README, 'utf8').split('\n')) {
    const match = line.match(/^\| (C\d+) \| `[^`]+` \| \d+ \| `[^`]*` \| (.*) \|$/);
    if (match && match[1] === id) return match[2].trim();
  }
  throw new Error(`no canary ${id} in the README`);
}

const docText = (rel, base = app) => readFileSync(join(base, rel), 'utf8');
const docLines = (rel, base = app) => docText(rel, base).replace(/\n$/, '').split('\n');
const lineNumberOf = (rel, text, base = app) => docLines(rel, base).findIndex((l) => l.trim() === text) + 1;

// --- transcript records, in the measured shape ------------------------------

function use(name, input) {
  counter += 1;
  const id = `toolu_probe_${counter}`;
  return { id, record: { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } } };
}

function result(id, content, toolUseResult) {
  const record = { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] } };
  if (toolUseResult !== undefined) record.toolUseResult = toolUseResult;
  return record;
}

function numbered(lines, from) {
  return lines.map((line, i) => `${from + i}\t${line}`).join('\n');
}

function readRecords(rel, { offset, limit, base = app, path } = {}) {
  const all = docLines(rel, base);
  const from = offset ?? 1;
  const shown = all.slice(from - 1, limit === undefined ? undefined : from - 1 + limit);
  const input = { file_path: path ?? join(base, rel) };
  if (offset !== undefined) input.offset = offset;
  if (limit !== undefined) input.limit = limit;
  const u = use('Read', input);
  return [u.record, result(u.id, numbered(shown, from), {
    type: 'text',
    file: { filePath: input.file_path, content: shown.join('\n'), numLines: shown.length, startLine: from, totalLines: all.length },
  })];
}

function bashRecords(command, content, stdout = content) {
  const u = use('Bash', { command, description: 'probe' });
  return [u.record, result(u.id, content, { stdout, stderr: '', interrupted: false, isImage: false })];
}

function transcript(records, raw = null) {
  counter += 1;
  const path = join(dir, `t${counter}.jsonl`);
  writeFileSync(path, raw ?? `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return path;
}

function measure(paths, appDir = app) {
  const args = [];
  for (const p of paths) args.push('--transcript', p);
  const run = spawnSync(process.execPath, [MEASURE, ...args, '--app', appDir, '--json'], { encoding: 'utf8', env: cleanEnv() });
  assert.equal(run.status, 0, `measure.mjs failed: ${run.stderr}`);
  return JSON.parse(run.stdout);
}

const doc = (report, rel) => report.documents.find((d) => d.path === rel);
const canarySeen = (report, id) => report.canaries.find((c) => c.id === id).seen;

// --- the meter: a partial read must not read as whole ------------------------

// Contract: a Bash output that comes back as <persisted-output> shows the model
// the 2 KB preview only; the stdout kept in toolUseResult (whole) never counts.
// Regression: reading toolUseResult.stdout, or the persistedOutputPath, as seen.
// Not caught: the implementer's persisted case puts three files in one cat, and
// its stdout case is a plain Bash result; none puts the long document alone,
// whose preview is its own first 2 KB, next to a stdout that holds C4.
test('meter: a cat of docs-screens.md alone that comes back persisted is not whole, and C4 is not seen', () => {
  const full = docText(SCREENS);
  const u = use('Bash', { command: `cat ${SCREENS}` });
  const content = `<persisted-output>\nOutput too large (21.1KB). Full output saved to: /scratch/tool-results/${u.id}.txt\n\nPreview (first 2KB):\n${full.slice(0, 2048)}\n...\n</persisted-output>`;
  const report = measure([transcript([u.record, result(u.id, content, {
    stdout: full, stderr: '', interrupted: false, persistedOutputPath: `/scratch/tool-results/${u.id}.txt`, persistedOutputSize: full.length,
  })])]);
  const d = doc(report, SCREENS);
  assert.equal(d.opened, true);
  assert.equal(d.truncated, true);
  assert.ok(d.seen > 0, 'the preview shows the start');
  assert.ok(d.coverage < 0.2, `only the preview counts, got ${d.coverage}`);
  assert.equal(canarySeen(report, 'C4'), false);
  assert.equal(report.summary.whole, 0);
});

// Contract: "whole" is 100% coverage, not "the canary was seen". A Read by
// range over the end of conventions.md shows C1 (its last line) and skips the
// body. Regression: deciding "whole" by the canary, or by the last line.
// Not caught: the implementer's range case reads the start of docs-screens.md,
// where canary and coverage both say "partial".
test('meter: a Read by range over the end of conventions.md sees C1 and still is not whole', () => {
  const total = docLines(CONVENTIONS).length;
  const report = measure([transcript(readRecords(CONVENTIONS, { offset: total - 15, limit: 16 }))]);
  const d = doc(report, CONVENTIONS);
  assert.equal(canarySeen(report, 'C1'), true);
  assert.equal(d.canarySeen, true);
  assert.ok(d.coverage < 1, `the body was not shown, got ${d.coverage}`);
  assert.deepEqual(d.methods, ['Read range']);
  assert.equal(report.summary.whole, 0);
});

// Contract: only the content counts; the Read's toolUseResult.file.content is
// not what the model saw. Regression: reading file.content (it is the shown
// text in Claude Code, but a version that keeps the whole file would count it).
// Not caught: the implementer's stdout case covers Bash only.
test('meter: a Read whose toolUseResult carries the whole file but whose content is cut counts the content only', () => {
  const [u, r] = readRecords(SCREENS, { offset: 1, limit: 50 });
  r.toolUseResult.file.content = docText(SCREENS);
  const report = measure([transcript([u, r])]);
  assert.ok(doc(report, SCREENS).coverage < 0.2);
  assert.equal(canarySeen(report, 'C4'), false);
});

// Contract: a target line seen inside another file's result counts as a line,
// but no amount of the other documents of the app (index, registry, an
// unlisted import, the code, the spec) makes a target whole or shows a canary.
// Regression: dropping the "unique among the targets" rule for the canary or
// widening "seen" to substrings of a line. Not caught: no implementer test
// reads a non-target file.
test('meter: reading every non-target file of the app makes no target whole and shows no canary', () => {
  const others = ['.vibeflow/index.md', '.vibeflow/patterns/external-team-conventions/registry.md',
    '.vibeflow/patterns/external-team-conventions/claude-rules-dependency-injection.md',
    '.vibeflow/patterns/dates.md', '.vibeflow/patterns/dependency-injection.md', '.vibeflow/specs/profile-edit.md',
    'src/app.js', 'src/navigation/navigator.js', 'src/features/home/navigation/home-routes.js', 'test/form.test.js'];
  const report = measure([transcript(others.flatMap((rel) => readRecords(rel)))]);
  assert.equal(report.summary.whole, 0);
  for (const id of ['C1', 'C2', 'C3', 'C4']) assert.equal(canarySeen(report, id), false, id);
  for (const d of report.documents) assert.ok(d.coverage < 0.5, `${d.path}: ${d.coverage}`);
});

// Contract: text the model wrote (a Write's content, an Edit's new_string, a
// Bash command) is not text it was shown. Regression: collecting lines from
// tool_use inputs, or from every block of a message. Not caught: no implementer
// transcript carries document text in a tool_use.
test('meter: document text inside tool_use inputs is not seen', () => {
  const screens = docText(SCREENS);
  const write = use('Write', { file_path: join(app, 'notes.md'), content: screens });
  const edit = use('Edit', { file_path: join(app, 'notes.md'), old_string: 'x', new_string: docText(CONVENTIONS) });
  const records = [
    write.record, result(write.id, `File created successfully at: ${join(app, 'notes.md')}`),
    edit.record, result(edit.id, `The file ${join(app, 'notes.md')} has been updated successfully.`),
    ...bashRecords(`grep -F '${canaryText('C2')}' ${FORMS}`, ''),
  ];
  const report = measure([transcript(records)]);
  for (const rel of [SCREENS, CONVENTIONS, FORMS]) assert.equal(doc(report, rel).seen, 0, rel);
  for (const id of ['C1', 'C2', 'C4']) assert.equal(canarySeen(report, id), false, id);
});

// Contract: a broken transcript line (invalid JSON, empty, a session cut in
// the middle of a record) is skipped and changes nothing else. Regression:
// a parse error that aborts, or that drops the rest of the file. Not caught:
// every implementer transcript is valid JSON.
test('meter: invalid, empty and cut lines are skipped and the rest is measured the same', () => {
  const records = [...readRecords(FORMS), ...readRecords(SCREENS, { offset: 1, limit: 100 })];
  const clean = measure([transcript(records)]);
  const lines = records.map((r) => JSON.stringify(r));
  const raw = ['{not json', '', lines[0], '   ', '{"type":"user","message":{"content":"a prompt as a string"}}', lines[1], 'null', lines[2], lines[3], lines[3].slice(0, 40)].join('\n');
  const noisy = measure([transcript(null, raw)]);
  assert.deepEqual(noisy.documents, clean.documents);
  assert.deepEqual(noisy.canaries, clean.canaries);
});

// Contract: a line counts only when shown whole. Output that cuts every line
// (`cut -c1-60`, a preview that ends mid-line) shows no line of a long
// document and no canary. Regression: matching a prefix or a substring of the
// line. Not caught: every implementer transcript shows lines whole or not at
// all (killed sabotages S8 and S12 of this audit, which no executor test saw).
test('meter: lines cut short by the command are not seen, and neither is a canary cut short', () => {
  const cut = (rel) => docLines(rel).map((l) => l.slice(0, 60)).join('\n');
  const records = [...bashRecords(`cut -c1-60 ${SCREENS}`, cut(SCREENS)), ...bashRecords(`cut -c1-60 ${FORMS}`, cut(FORMS))];
  const report = measure([transcript(records)]);
  for (const id of ['C2', 'C4']) assert.equal(canarySeen(report, id), false, id);
  for (const rel of [SCREENS, FORMS]) assert.equal(doc(report, rel).canarySeen, false, `${rel}: the row's canary column agrees`);
  const longer = docLines(SCREENS).filter((l) => l.trim().length > 60).length;
  const d = doc(report, SCREENS);
  assert.ok(d.distinctive - d.seen >= longer - 5, `lines over 60 characters stay unseen: ${d.seen}/${d.distinctive}`);
});

// Contract: a line under 20 characters (a short heading, a fence, `---`) is
// not distinctive, so showing only those lines sees nothing. Regression: a
// lower threshold that lets headings carry coverage. Not caught: the
// implementer asserts that every document has distinctive lines, not which
// lines are left out (killed sabotage S11).
test('meter: showing only the short lines of a document sees nothing', () => {
  const lines = docLines(SCREENS);
  const shortOnes = lines.map((l, i) => [l, i + 1]).filter(([l]) => l.trim().length > 0 && l.trim().length < 20);
  assert.ok(shortOnes.length >= 5, 'the document has short lines');
  const u = use('Read', { file_path: join(app, SCREENS) });
  const content = shortOnes.map(([l, n]) => `${n}\t${l}`).join('\n');
  const report = measure([transcript([u.record, result(u.id, content)])]);
  assert.equal(doc(report, SCREENS).seen, 0);
});

// --- the meter: a whole read must read as whole ------------------------------

// Contract: trailing spaces or tabs and CRLF line ends in the document, kept
// as they are in the Read output, do not hide a line. Regression: comparing
// untrimmed lines or splitting on \n only without trimming \r. Not caught: the
// fixture's documents have neither.
test('meter: a whole Read of a document with CRLF and trailing blanks is whole', () => {
  const base = prepare(join(dir, 'crlf'), 'implement').app;
  const lines = docLines(FORMS, base).map((l, i) => (l ? `${l}${i % 2 ? ' \t' : '  '}` : l));
  writeFileSync(join(base, FORMS), `${lines.join('\r\n')}\r\n`);
  const u = use('Read', { file_path: join(base, FORMS) });
  const content = lines.map((l, i) => `${i + 1}\t${l}\r`).join('\n');
  const report = measure([transcript([u.record, result(u.id, content, { type: 'text', file: { numLines: lines.length, startLine: 1, totalLines: lines.length } })])], base);
  assert.equal(doc(report, FORMS).coverage, 1);
  assert.equal(canarySeen(report, 'C2'), true);
});

// Contract: a long line is seen when shown whole. Regression: a length cap on
// result lines. Not caught: the longest fixture line is under 200 characters.
test('meter: a 1,500-character line shown whole is seen', () => {
  const base = prepare(join(dir, 'long'), 'implement').app;
  const long = `- ${'Long rule text that keeps going. '.repeat(45)}end.`;
  writeFileSync(join(base, CONVENTIONS), docText(CONVENTIONS, base).replace('\n', `\n${long}\n`));
  const report = measure([transcript(readRecords(CONVENTIONS, { base }))], base);
  assert.equal(doc(report, CONVENTIONS).coverage, 1);
});

// Contract: `cat -n` output (padded number, tab) is a whole read. Regression:
// stripping the Read prefix only on Read results. Not caught: the implementer
// strips the prefix in Read results and grep results, not in Bash cat -n.
test('meter: cat -n of docs-screens.md through Bash is whole and sees C4', () => {
  const lines = docLines(SCREENS);
  const out = lines.map((l, i) => `${String(i + 1).padStart(6)}\t${l}`).join('\n');
  const report = measure([transcript(bashRecords(`cat -n ${SCREENS}`, out))]);
  assert.equal(doc(report, SCREENS).coverage, 1);
  assert.equal(canarySeen(report, 'C4'), true);
  assert.deepEqual(doc(report, SCREENS).methods, ['Bash']);
});

// Contract: two Reads by range that together cover the file are a whole read.
// Regression: deciding "whole" by the method (Read whole) instead of coverage.
// Not caught: the implementer's whole cases all use one Read without range.
test('meter: two Reads by range that cover docs-screens.md together are whole', () => {
  const total = docLines(SCREENS).length;
  const report = measure([transcript([...readRecords(SCREENS, { offset: 1, limit: 260 }), ...readRecords(SCREENS, { offset: 261, limit: total })])]);
  const d = doc(report, SCREENS);
  assert.equal(d.coverage, 1);
  assert.deepEqual(d.methods, ['Read range']);
  assert.equal(canarySeen(report, 'C4'), true);
  assert.equal(report.summary.whole, 1);
});

// Contract: in a real `claude -p` session each tool_use and tool_result is
// written twice, the second copy without toolUseResult (measured in the base
// runs of 10/11). Duplicates change nothing. Regression: a method decided by the
// last record (the copy without toolUseResult reads a range as whole).
// Not caught: synthetic transcripts have no duplicates.
test('meter: the duplicated records of a real session change nothing', () => {
  const records = readRecords(SCREENS, { offset: 1, limit: 100 });
  const copy = records.map((r) => {
    const c = JSON.parse(JSON.stringify(r));
    delete c.toolUseResult;
    return c;
  });
  const once = measure([transcript(records)]);
  const twice = measure([transcript([...records, ...copy])]);
  assert.deepEqual(twice.documents, once.documents);
});

// Contract: when a Bash output is persisted and the model then Reads the
// saved file whole (what the base gen-spec and implement did on 10/11), the
// document was seen whole: "seen" is any tool_result content, whatever file
// the call opened. Regression: counting only the results of calls that name
// the document. Not caught: no implementer transcript reads a saved output.
test('meter: a persisted cat followed by a Read of the saved output is whole', () => {
  const full = [CONVENTIONS, FORMS, SCREENS].map((rel) => docText(rel)).join('');
  const u = use('Bash', { command: `cat ${CONVENTIONS} ${FORMS} ${SCREENS}` });
  const saved = `/scratch/tool-results/${u.id}.txt`;
  const preview = `<persisted-output>\nOutput too large (31.0KB). Full output saved to: ${saved}\n\nPreview (first 2KB):\n${full.slice(0, 2048)}\n...\n</persisted-output>`;
  const lines = full.replace(/\n$/, '').split('\n');
  const r = use('Read', { file_path: saved });
  const report = measure([transcript([
    u.record, result(u.id, preview, { stdout: full.slice(0, 30000), stderr: '' }),
    r.record, result(r.id, numbered(lines, 1), { type: 'text', file: { filePath: saved, numLines: lines.length, startLine: 1, totalLines: lines.length } }),
  ])]);
  for (const rel of [CONVENTIONS, FORMS, SCREENS]) {
    assert.equal(doc(report, rel).coverage, 1, rel);
    assert.equal(doc(report, rel).truncated, true, rel);
  }
  for (const id of ['C1', 'C2', 'C4']) assert.equal(canarySeen(report, id), true, id);
});

// Contract (finding A1): grep -n over ONE file prints `N:line` (and `N-line`
// for context), with no path: the Grep tool given a file path does this in
// every single-file content result of the real transcripts of this machine
// (135 of 135 on 10/11), and so does `grep -n pattern file` in Bash. The
// line was shown to the model. Regression: the meter strips `path:N:` only.
// Not caught: the implementer's grep cases all carry a path prefix.
// Rewritten in re-audit 1 (authorized by its briefing): the first version showed
// one context line, `press back.`, which has 11 characters and so is not
// distinctive under the 20-character rule that `showing only the short lines`
// pins; it asked `seen === 2` from two lines of which one cannot count. This
// version shows two context lines before C4, one distinctive and one short:
// the distinctive one (`N-`) and the canary (`N:`) count, the short one does not.
test('meter: a Grep tool call on one file, with -n, sees its matched and context lines', () => {
  const lines = docLines(SCREENS);
  const n = lineNumberOf(SCREENS, canaryText('C4'));
  assert.ok(lines[n - 3].trim().length >= 20, 'the first context line is long enough to be distinctive');
  assert.ok(lines[n - 2].trim().length < 20, 'the second context line is short');
  const u = use('Grep', { pattern: 'saves goes back', path: join(app, SCREENS), output_mode: 'content', '-n': true, '-B': 2 });
  const content = `${n - 2}-${lines[n - 3]}\n${n - 1}-${lines[n - 2]}\n${n}:${lines[n - 1]}`;
  const report = measure([transcript([u.record, result(u.id, content, { mode: 'content', numFiles: 1, filenames: [], content, numLines: 3 })])]);
  assert.equal(canarySeen(report, 'C4'), true);
  assert.equal(doc(report, SCREENS).seen, 2, 'the distinctive context line (N-) and the matched line (N:)');
  assert.deepEqual(doc(report, SCREENS).methods, ['Grep']);
});

test('meter: grep -n through Bash over one file sees the matched line', () => {
  const n = lineNumberOf(FORMS, canaryText('C2'));
  const report = measure([transcript(bashRecords(`grep -n 'field id' ${FORMS}`, `${n}:${docLines(FORMS)[n - 1]}`))]);
  assert.equal(canarySeen(report, 'C2'), true);
  assert.equal(doc(report, FORMS).seen, 1);
});

// Contract (finding A2): "opened" and "how" do not depend on which spelling of
// the app's directory the session used. On macOS the session's cwd is the
// real path (/tmp is /private/tmp), so a Read names the real path while the
// README's run passes `/tmp/...` to --app. Regression: comparing paths as
// strings without resolving links. Not caught: the implementer's tests pass
// to --app the same string the transcript uses.
test('meter: a Read through the real path of an app given by a symlink is opened as Read whole', () => {
  const realBase = join(dir, 'real');
  mkdirSync(realBase);
  const realApp = prepare(join(realBase, 'p'), 'implement').app;
  symlinkSync(realBase, join(dir, 'link'));
  const linked = join(dir, 'link', 'p', 'app');
  const report = measure([transcript(readRecords(CONVENTIONS, { base: realApp }))], linked);
  const d = doc(report, CONVENTIONS);
  assert.equal(d.coverage, 1);
  assert.equal(d.opened, true);
  assert.deepEqual(d.methods, ['Read whole']);
});

// --- the audit stage of prepare.mjs ------------------------------------------

// The files git reports as changed in the working tree of an app, new files
// listed one by one, with their status.
function changedFiles(appDir) {
  return git(appDir, 'status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean)
    .map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }));
}

// Contract: the audit stage is the implement stage with the feature laid over
// it as uncommitted work (decision of 10/11, 20:09: an audit reads it as the
// diff, the way an implement run leaves it), and that work touches no
// document under .vibeflow/ (else the docs an audit reads would differ from
// the ones the implement stage read). Regression: laying feature/ over the app
// before the commit, committing it, or a feature/ folder (or prepare) that
// writes under .vibeflow/. Not caught before re-audit 1: the implementer
// checked a commit count and that some feature file was added; its test of
// the uncommitted stage (fix 1) now pins the same, so this probe overlaps it.
// Rewritten in re-audit 1 (authorized by its briefing): the first version
// asked for HEAD~1, the second commit the 20:09 decision removed.
test('audit stage: HEAD is the implement tree and the uncommitted feature touches no .vibeflow/ file', () => {
  const implement = prepare(join(dir, 'tree-implement'), 'implement').app;
  const audit = prepare(join(dir, 'tree-audit'), 'audit').app;
  assert.equal(git(audit, 'rev-parse', 'HEAD^{tree}').trim(), git(implement, 'rev-parse', 'HEAD^{tree}').trim());
  const touched = changedFiles(audit);
  assert.ok(touched.some((f) => f.path.startsWith('src/features/profile/')), `the feature is in the working tree: ${touched.map((f) => f.path)}`);
  for (const f of touched) assert.ok(!f.path.startsWith('.vibeflow/'), `the uncommitted feature touches ${f.path}`);
});

// Contract: the violations are discreet; nothing the audit sees as the change
// (every modified or new file of the working tree, and the commit message)
// names a canary, a violation or a rule id. Regression: a comment like
// "// TODO: LIMITS" or "deliberately" left in feature/, or prepare leaving a
// note file next to the feature. Not caught before re-audit 1: the
// implementer checked the markers and the message only; its test of the
// uncommitted stage (fix 1) now reads every feature file and pins the status
// list, so this probe overlaps it (it reads what git shows as changed).
// Rewritten in re-audit 1 (authorized by its briefing): the first version read
// the patch of the second commit, which the 20:09 decision removed; the
// message read now is the implement commit's.
test('audit stage: the uncommitted change has no word that points at the planted violations', () => {
  const audit = prepare(join(dir, 'words-audit'), 'audit').app;
  const POINTERS = /canar|violat|deliberat|on purpose|intentional|\bC[1-4]\b|planted/i;
  const touched = changedFiles(audit);
  assert.ok(touched.length > 0);
  for (const f of touched) assert.doesNotMatch(readFileSync(join(audit, f.path), 'utf8'), POINTERS, f.path);
  assert.doesNotMatch(git(audit, 'diff', 'HEAD'), POINTERS);
  assert.doesNotMatch(git(audit, 'log', '-1', '--format=%B'), POINTERS);
});

// Contract (found in re-audit 1, on the base Sonnet audit run of 10/11): a
// relative path is read against where the command's own `cd`s lead, in order.
// The real command was `cd .vibeflow/patterns/external-team-conventions && cat
// docs-screens.md ...; cd ../..; cat patterns/forms.md ...`, run from the app
// (the record's cwd), and its output came back persisted: the second `cd` is
// relative to the first, so `patterns/forms.md` is `.vibeflow/patterns/forms.md`
// and that document was opened by Bash and cut. Regression: resolving every
// `cd` of a command against the record's cwd only (fix 1's commandCwds), which
// opens nothing after a chained `cd` and drops the cut mark that the meter of
// round 1 gave. Not caught: the implementer's cd test changes directory once
// per command, from the record's cwd.
test('meter: a relative path after a cd relative to an earlier cd of the same command is opened, and its cut is marked', { todo: 'defeito R1: commandCwds resolves each cd from the record cwd, not from the cd before it' }, () => {
  const realApp = realpathSync(app);
  const u = use('Bash', { command: `cd .vibeflow/patterns/external-team-conventions && cat docs-screens.md; cd ../..; cat patterns/forms.md` });
  u.record.cwd = realApp;
  const content = `<persisted-output>\nOutput too large (24.1KB). Full output saved to: /scratch/tool-results/${u.id}.txt\n\nPreview (first 2KB):\n${docText(SCREENS).slice(0, 2048)}\n...\n</persisted-output>`;
  const r = result(u.id, content, { stdout: '', stderr: '', interrupted: false });
  r.cwd = realApp;
  const report = measure([transcript([u.record, r])]);
  for (const rel of [SCREENS, FORMS]) {
    assert.equal(doc(report, rel).opened, true, `${rel} is opened`);
    assert.deepEqual(doc(report, rel).methods, ['Bash'], rel);
    assert.equal(doc(report, rel).truncated, true, `${rel} came back cut`);
  }
  assert.equal(doc(report, CONVENTIONS).opened, false, 'a document the command did not name stays closed');
});

// Contract (finding A3): the feature is right in everything the spec and its
// documents ask except the four canaries (executor briefing; README "Audit
// stage"). The imported screens handbook, section 6.3, asks that a save the
// storage adapter refuses be logged at error level and returned as
// `{ ok: false, errors: { form } }`, the draft kept. The feature lets the
// error escape, so an audit that reads the handbook whole finds a fifth
// violation the README does not list. Regression: none, it is open. Not
// caught: the app's suite never makes the adapter throw.
test('audit stage: a save the storage adapter refuses returns { ok: false, errors.form } instead of throwing', async () => {
  const audit = prepare(join(dir, 'refuse-audit'), 'audit').app;
  const { createApp } = await import(pathToFileURL(join(audit, 'src/app.js')).href);
  const { container, navigator, screens } = createApp();
  const storage = container.get('storage');
  storage.write('profile.u1', { id: 'u1', displayName: 'Ada', bio: '' });
  navigator.navigate('home');
  navigator.navigate('profile/edit', { id: 'u1' });
  storage.write = () => {
    const error = new Error('storage is full');
    error.code = 'storage-full';
    throw error;
  };
  screens.profile.edit.set('displayName', 'Grace');
  let outcome;
  assert.doesNotThrow(() => { outcome = screens.profile.edit.save(); });
  assert.equal(outcome.ok, false);
  assert.equal(typeof outcome.errors.form, 'string');
});
