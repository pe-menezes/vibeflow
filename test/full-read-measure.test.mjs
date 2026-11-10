// The full-read meter: reads the transcript of a Claude Code session and says,
// for each document a consumer was told to read, whether it was opened and how
// much of it the model saw. The transcripts here are synthetic, built in the
// shape a `claude -p` session writes: tool_use blocks in the assistant message,
// tool_result blocks in the next one, and toolUseResult on the record.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'test/fixtures/full-read');
const PREPARE = join(FIXTURE, 'prepare.mjs');
const MEASURE = join(FIXTURE, 'measure.mjs');
const SPEC = join(FIXTURE, 'spec/profile-edit.md');

const CONVENTIONS = '.vibeflow/conventions.md';
const FORMS = '.vibeflow/patterns/forms.md';
const VALIDATION = '.vibeflow/patterns/validation.md';
const CODE_STYLE = '.vibeflow/patterns/external-team-conventions/claude-rules-code-style.md';
const SCREENS = '.vibeflow/patterns/external-team-conventions/docs-screens.md';
const TESTING_IMPORTED = '.vibeflow/patterns/external-team-conventions/claude-rules-testing.md';

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
  dir = mkdtempSync(join(tmpdir(), 'vibeflow-full-read-measure-'));
  const result = spawnSync(process.execPath, [PREPARE, join(dir, 'p'), '--stage', 'implement'], {
    encoding: 'utf8',
    env: cleanEnv(),
  });
  assert.equal(result.status, 0, `prepare.mjs failed: ${result.stderr}`);
  app = JSON.parse(result.stdout).app;
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

const abs = (rel) => join(app, rel);
const text = (rel) => readFileSync(abs(rel), 'utf8');
const lines = (rel) => text(rel).replace(/\n$/, '').split('\n');

// --- transcript builders, in the measured shape -------------------------------

function toolUse(name, input) {
  counter += 1;
  const id = `toolu_${String(counter).padStart(4, '0')}`;
  return {
    id,
    record: {
      type: 'assistant',
      sessionId: 'synthetic',
      message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
    },
  };
}

function toolResult(id, content, toolUseResult, isError = false) {
  const block = { type: 'tool_result', tool_use_id: id, content };
  if (isError) block.is_error = true;
  return {
    type: 'user',
    sessionId: 'synthetic',
    message: { role: 'user', content: [block] },
    toolUseResult,
  };
}

function numbered(rel, from = 1, count = Infinity, pad = true) {
  return lines(rel)
    .slice(from - 1, from - 1 + count)
    .map((line, i) => `${pad ? String(from + i).padStart(6) : from + i}\t${line}`)
    .join('\n');
}

function readCall(rel, { offset, limit, pad } = {}) {
  const input = { file_path: abs(rel) };
  if (offset !== undefined) input.offset = offset;
  if (limit !== undefined) input.limit = limit;
  const all = lines(rel);
  const from = offset ?? 1;
  const count = limit ?? all.length;
  const shown = all.slice(from - 1, from - 1 + count);
  const use = toolUse('Read', input);
  const result = toolResult(use.id, numbered(rel, from, count, pad), {
    type: 'text',
    file: { filePath: abs(rel), content: shown.join('\n'), numLines: shown.length, startLine: from, totalLines: all.length },
  });
  return [use.record, result];
}

function readTooLarge(rel) {
  const use = toolUse('Read', { file_path: abs(rel) });
  const message = `Error: result (63,192 characters across 633 lines) exceeds maximum allowed tokens. Output has been saved to /scratch/tool-results/${use.id}.txt`;
  return [use.record, toolResult(use.id, message, `Error: ${message}`, true)];
}

function catPersisted(rels) {
  const command = `cat ${rels.join(' ')}`;
  const full = rels.map((rel) => text(rel)).join('');
  const use = toolUse('Bash', { command, description: 'Print documents' });
  const preview = full.slice(0, 2048);
  const content = `<persisted-output>\nOutput too large (${(full.length / 1024).toFixed(1)}KB). Full output saved to: /scratch/tool-results/${use.id}.txt\n\nPreview (first 2KB):\n${preview}\n...\n</persisted-output>`;
  return [use.record, toolResult(use.id, content, { stdout: full, stderr: '', interrupted: false })];
}

function bash(command, stdout) {
  const use = toolUse('Bash', { command });
  return [use.record, toolResult(use.id, stdout, { stdout, stderr: '', interrupted: false })];
}

function grepCall(rel, lineNumbers) {
  const use = toolUse('Grep', { pattern: 'back', path: abs('.vibeflow'), output_mode: 'content', '-n': true });
  const all = lines(rel);
  const content = lineNumbers.map((n) => `${abs(rel)}:${n}:${all[n - 1]}`).join('\n');
  return [use.record, toolResult(use.id, content, { mode: 'content', numFiles: 1, filenames: [abs(rel)], content })];
}

function blocksResult(rel) {
  // A tool_result whose content is a list of text blocks.
  const use = toolUse('Bash', { command: `cat ${rel}` });
  const content = [{ type: 'text', text: text(rel) }];
  return [use.record, toolResult(use.id, content, { stdout: text(rel), stderr: '' })];
}

function writeTranscript(records) {
  counter += 1;
  const path = join(dir, `t${counter}.jsonl`);
  writeFileSync(path, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return path;
}

function measure(...args) {
  return spawnSync(process.execPath, [MEASURE, ...args], { encoding: 'utf8', env: cleanEnv() });
}

function measureJson(transcripts, extra = []) {
  const args = [];
  for (const t of transcripts) args.push('--transcript', t);
  const result = measure(...args, '--app', app, ...extra, '--json');
  assert.equal(result.status, 0, `measure.mjs failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

const doc = (report, rel) => {
  const found = report.documents.find((d) => d.path === rel);
  assert.ok(found, `the report has ${rel}`);
  return found;
};
const canary = (report, id) => report.canaries.find((c) => c.id === id);

// --- tests --------------------------------------------------------------------

test('the targets are conventions.md plus every pattern the fixed spec lists', () => {
  const report = measureJson([writeTranscript([])]);
  const paths = report.documents.map((d) => d.path);
  assert.equal(paths[0], CONVENTIONS);
  assert.equal(paths.length, 11);
  for (const rel of [FORMS, VALIDATION, CODE_STYLE, SCREENS, TESTING_IMPORTED]) assert.ok(paths.includes(rel), rel);
  assert.ok(!paths.includes('.vibeflow/patterns/dates.md'), 'a pattern the spec does not list is not a target');
  for (const d of report.documents) {
    assert.equal(d.opened, false);
    assert.equal(d.seen, 0);
    assert.ok(d.distinctive > 0, `${d.path} has distinctive lines`);
    assert.equal(d.coverage, 0);
  }
  assert.deepEqual(report.canaries.map((c) => [c.id, c.seen]), [['C1', false], ['C2', false], ['C3', false], ['C4', false]]);
  assert.equal(report.summary.text, '0 of 11 documents read whole; canaries seen: C1 no, C2 no, C3 no, C4 no');
});

test('a whole Read sees the whole document and its canary', () => {
  const report = measureJson([writeTranscript(readCall(CONVENTIONS))]);
  const d = doc(report, CONVENTIONS);
  assert.equal(d.opened, true);
  assert.equal(d.coverage, 1);
  assert.equal(d.seen, d.distinctive);
  assert.deepEqual(d.methods, ['Read whole']);
  assert.equal(d.truncated, false);
  assert.equal(d.canary, 'C1');
  assert.equal(d.canarySeen, true);
  assert.equal(canary(report, 'C1').seen, true);
  assert.equal(report.summary.whole, 1);
  assert.equal(report.summary.text, '1 of 11 documents read whole; canaries seen: C1 yes, C2 no, C3 no, C4 no');
});

test('the Read prefix without padding is taken off too', () => {
  const report = measureJson([writeTranscript(readCall(FORMS, { pad: false }))]);
  const d = doc(report, FORMS);
  assert.equal(d.coverage, 1);
  assert.equal(canary(report, 'C2').seen, true);
});

test('a Read by range sees only its lines and misses a canary outside them', () => {
  const report = measureJson([writeTranscript(readCall(SCREENS, { offset: 1, limit: 200 }))]);
  const d = doc(report, SCREENS);
  assert.equal(d.opened, true);
  assert.deepEqual(d.methods, ['Read range']);
  assert.ok(d.coverage > 0 && d.coverage < 1, `partial coverage, got ${d.coverage}`);
  assert.equal(d.canarySeen, false);
  assert.equal(canary(report, 'C4').seen, false);
});

test('a Read with no range that returns fewer lines than the file counts as a range', () => {
  const [use, result] = readCall(SCREENS, { offset: 1, limit: 300 });
  delete use.message.content[0].input.offset;
  delete use.message.content[0].input.limit;
  const report = measureJson([writeTranscript([use, result])]);
  assert.deepEqual(doc(report, SCREENS).methods, ['Read range']);
  assert.equal(canary(report, 'C4').seen, true, 'line 251 is inside the first 300');
});

test('a cat of three files that comes back persisted counts only the 2 KB preview', () => {
  const report = measureJson([writeTranscript(catPersisted([CONVENTIONS, FORMS, CODE_STYLE]))]);
  for (const rel of [CONVENTIONS, FORMS, CODE_STYLE]) {
    const d = doc(report, rel);
    assert.equal(d.opened, true, `${rel} was opened by the cat`);
    assert.deepEqual(d.methods, ['Bash']);
    assert.equal(d.truncated, true);
  }
  const conventions = doc(report, CONVENTIONS);
  assert.ok(conventions.seen > 0 && conventions.coverage < 1, `the preview shows the start only: ${conventions.coverage}`);
  assert.equal(doc(report, FORMS).seen, 0, 'forms.md starts past the preview');
  assert.equal(doc(report, CODE_STYLE).seen, 0);
  assert.equal(canary(report, 'C1').seen, false);
  assert.equal(canary(report, 'C2').seen, false);
  assert.equal(canary(report, 'C3').seen, false);
  assert.equal(doc(report, SCREENS).opened, false);
});

test('a grep -n result counts the matched lines, with the path:line: prefix taken off', () => {
  const report = measureJson([writeTranscript(grepCall(SCREENS, [251, 300]))]);
  const d = doc(report, SCREENS);
  assert.equal(d.opened, true);
  assert.deepEqual(d.methods, ['Grep']);
  assert.equal(d.seen, 2);
  assert.equal(canary(report, 'C4').seen, true);
});

test('a grep -n run through Bash is a Bash read and its prefix is taken off', () => {
  const all = lines(SCREENS);
  const out = `${SCREENS}:251:${all[250]}\n`;
  const report = measureJson([writeTranscript(bash(`grep -n 'back' ${SCREENS} ${FORMS}`, out))]);
  assert.deepEqual(doc(report, SCREENS).methods, ['Bash']);
  assert.equal(doc(report, SCREENS).seen, 1);
  assert.equal(canary(report, 'C4').seen, true);
  assert.equal(doc(report, FORMS).opened, true, 'the command names forms.md');
  assert.equal(doc(report, FORMS).seen, 0);
});

test('a result over the token limit opens the document but shows none of it', () => {
  const report = measureJson([writeTranscript(readTooLarge(SCREENS))]);
  const d = doc(report, SCREENS);
  assert.equal(d.opened, true);
  assert.equal(d.truncated, true);
  assert.equal(d.seen, 0);
  assert.equal(canary(report, 'C4').seen, false);
});

test('a glob in a Bash command opens the files it matches, one folder deep', () => {
  const report = measureJson([writeTranscript(bash('head -n 3 .vibeflow/patterns/*.md', 'nothing useful\n'))]);
  assert.equal(doc(report, FORMS).opened, true);
  assert.equal(doc(report, VALIDATION).opened, true);
  assert.equal(doc(report, CODE_STYLE).opened, false, '* does not cross a folder');
  assert.equal(doc(report, CONVENTIONS).opened, false);
});

test('content given as a list of text blocks is seen', () => {
  const report = measureJson([writeTranscript(blocksResult(CODE_STYLE))]);
  assert.equal(doc(report, CODE_STYLE).coverage, 1);
  assert.equal(canary(report, 'C3').seen, true);
});

test('lines shared by several documents, such as the import frontmatter, are not distinctive', () => {
  const shared = lines(TESTING_IMPORTED).filter((l) => l.startsWith('source_ref:') || l.startsWith('source_commit:'));
  assert.equal(shared.length, 2);
  const report = measureJson([writeTranscript(bash(`head -n 12 ${TESTING_IMPORTED}`, `${shared.join('\n')}\n`))]);
  const d = doc(report, TESTING_IMPORTED);
  assert.equal(d.opened, true);
  assert.equal(d.seen, 0);
});

test('only the content the model saw counts, never toolUseResult.stdout', () => {
  const [use, result] = bash(`cat ${CONVENTIONS}`, 'cut\n');
  result.toolUseResult.stdout = text(CONVENTIONS);
  const report = measureJson([writeTranscript([use, result])]);
  assert.equal(doc(report, CONVENTIONS).opened, true);
  assert.equal(doc(report, CONVENTIONS).seen, 0);
  assert.equal(canary(report, 'C1').seen, false);
});

test('several transcripts add up, and every document read whole sees every canary', () => {
  const report0 = measureJson([writeTranscript([])]);
  const records = report0.documents.flatMap((d) => readCall(d.path));
  const half = Math.floor(records.length / 2) & ~1;
  const report = measureJson([writeTranscript(records.slice(0, half)), writeTranscript(records.slice(half))]);
  assert.equal(report.summary.whole, 11);
  assert.equal(report.summary.text, '11 of 11 documents read whole; canaries seen: C1 yes, C2 yes, C3 yes, C4 yes');
  for (const d of report.documents) assert.deepEqual(d.methods, ['Read whole']);
});

test('--spec picks the targets from another spec', () => {
  const other = join(dir, 'other-spec.md');
  writeFileSync(other, '# Spec: other\n\n## Applicable Patterns\n- `patterns/dates.md`: dates.\n\nImported entries that apply: 0\n\n## Risks\n- `patterns/forms.md` is not under Applicable Patterns.\n');
  const report = measureJson([writeTranscript([])], ['--spec', other]);
  assert.deepEqual(report.documents.map((d) => d.path), [CONVENTIONS, '.vibeflow/patterns/dates.md']);
  assert.deepEqual(report.canaries.map((c) => c.id), ['C1', 'C2', 'C3', 'C4'], 'canaries are reported even when their document is not a target');
});

test('the human output prints a row per document and the summary', () => {
  const transcript = writeTranscript([...readCall(CONVENTIONS), ...catPersisted([FORMS, CODE_STYLE, SCREENS])]);
  const result = measure('--transcript', transcript, '--app', app);
  assert.equal(result.status, 0, result.stderr);
  const out = result.stdout;
  for (const rel of [CONVENTIONS, FORMS, SCREENS]) assert.ok(out.includes(rel), `the table names ${rel}`);
  assert.match(out, /Read whole/);
  assert.match(out, /Bash \(truncated\)/);
  assert.match(out, /100%/);
  assert.ok(out.trimEnd().endsWith('1 of 11 documents read whole; canaries seen: C1 yes, C2 no, C3 no, C4 no'), out);
});

test('the default spec is the fixed spec of the fixture', () => {
  const a = measureJson([writeTranscript([])]);
  const b = measureJson([writeTranscript([])], ['--spec', SPEC]);
  assert.deepEqual(a.documents.map((d) => d.path), b.documents.map((d) => d.path));
});

test('missing arguments and unreadable inputs are refused', () => {
  assert.notEqual(measure('--app', app).status, 0, 'a transcript is required');
  assert.notEqual(measure('--transcript', writeTranscript([])).status, 0, 'the app is required');
  assert.notEqual(measure('--transcript', join(dir, 'missing.jsonl'), '--app', app).status, 0);
});
