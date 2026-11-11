// The full-read fixture: the sample app of the external-import fixture in the
// state a 1.18.0 import leaves it, scaled to the size of a real project, with
// four canary rules placed where a partial read misses them. These tests hold
// the fixture's README to the prepared app and the preparer to its contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'test/fixtures/full-read');
const PREPARE = join(FIXTURE, 'prepare.mjs');
const README = join(FIXTURE, 'README.md');
const SPEC = join(FIXTURE, 'spec/profile-edit.md');

const KB = 1024;

function cleanEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  return env;
}

function scratch(run) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-full-read-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function prepare(dir, ...args) {
  return spawnSync(process.execPath, [PREPARE, dir, ...args], { encoding: 'utf8', env: cleanEnv() });
}

function prepared(dir, stage) {
  const result = prepare(dir, '--stage', stage);
  assert.equal(result.status, 0, `prepare.mjs failed: ${result.stderr}`);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 1, `prepare.mjs prints one line, got: ${result.stdout}`);
  return JSON.parse(lines[0]);
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}

function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

function linesOf(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Rows of the first Markdown table in `section` whose first cell matches `id`.
function tableRows(text, heading, columns) {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.ok(start >= 0, `README has a "## ${heading}" section`);
  const rest = text.slice(start + 1);
  const end = rest.indexOf('\n## ', 1);
  const section = end >= 0 ? rest.slice(0, end) : rest;
  const rows = [];
  for (const line of section.split('\n')) {
    if (!/^\| C\d \|/.test(line)) continue;
    const cells = line.slice(2, -2).split(' | ');
    assert.equal(cells.length, columns.length, `row has ${columns.length} cells: ${line}`);
    rows.push(Object.fromEntries(columns.map((name, i) => [name, cells[i]])));
  }
  return rows;
}

const unquote = (cell) => cell.replace(/^`|`$/g, '');

function readmeCanaries() {
  const rows = tableRows(readFileSync(README, 'utf8'), 'Canaries', ['id', 'file', 'line', 'marker', 'text']);
  return rows.map((row) => ({
    id: row.id,
    file: unquote(row.file),
    line: Number(row.line),
    marker: unquote(row.marker),
    text: row.text,
  }));
}

function readmeViolations() {
  const rows = tableRows(readFileSync(README, 'utf8'), 'Audit stage', ['id', 'file', 'line', 'code']);
  return rows.map((row) => ({ id: row.id, file: unquote(row.file), line: Number(row.line), code: unquote(row.code) }));
}

// The pattern docs the fixed spec lists under Applicable Patterns, relative to
// the app's .vibeflow/.
function specPatterns(specText) {
  const start = specText.indexOf('\n## Applicable Patterns\n');
  assert.ok(start >= 0, 'the spec has an Applicable Patterns section');
  const rest = specText.slice(start + 1);
  const end = rest.indexOf('\n## ', 1);
  const section = end >= 0 ? rest.slice(0, end) : rest;
  return [...new Set(section.match(/patterns\/[A-Za-z0-9_./-]+\.md/g))];
}

test('the README lists four canaries, C1 to C4, each with a marker', () => {
  const canaries = readmeCanaries();
  assert.deepEqual(canaries.map((c) => c.id), ['C1', 'C2', 'C3', 'C4']);
  for (const c of canaries) {
    assert.ok(c.marker.length >= 5, `${c.id} has a marker`);
    assert.ok(c.text.includes(c.marker), `${c.id}: the marker is part of the canary line`);
    assert.ok(c.text.trim().length >= 20, `${c.id}: the canary line is distinctive`);
  }
});

test('prepare refuses a directory that is not empty and an unknown stage', () => {
  scratch((dir) => {
    writeFileSync(join(dir, 'keep.txt'), 'x');
    const refused = prepare(dir, '--stage', 'genspec');
    assert.notEqual(refused.status, 0);
    assert.deepEqual(readdirSync(dir), ['keep.txt']);
  });
  scratch((dir) => {
    const target = join(dir, 'out');
    const refused = prepare(target, '--stage', 'deploy');
    assert.notEqual(refused.status, 0);
    assert.equal(existsSync(target), false);
  });
  scratch((dir) => {
    const refused = prepare(join(dir, 'out'));
    assert.notEqual(refused.status, 0, 'the stage is required');
  });
});

test('each stage has one commit, genspec and implement with a clean tree; the spec and the feature arrive by stage', () => {
  scratch((dir) => {
    const out = prepared(join(dir, 'genspec'), 'genspec');
    assert.equal(out.stage, 'genspec');
    assert.equal(out.app, join(dir, 'genspec', 'app'));
    assert.equal(git(out.app, 'status', '--porcelain'), '');
    assert.equal(git(out.app, 'rev-list', '--count', 'HEAD'), '1');
    assert.equal(existsSync(join(out.app, '.vibeflow/specs')), false);
    assert.ok(existsSync(join(out.app, '.vibeflow/index.md')));
    assert.equal(out.spec, null);
  });
  scratch((dir) => {
    const out = prepared(join(dir, 'implement'), 'implement');
    assert.equal(git(out.app, 'status', '--porcelain'), '');
    assert.equal(git(out.app, 'rev-list', '--count', 'HEAD'), '1');
    assert.equal(out.spec, join(out.app, '.vibeflow/specs/profile-edit.md'));
    assert.equal(readFileSync(out.spec, 'utf8'), readFileSync(SPEC, 'utf8'));
    assert.equal(existsSync(join(out.app, 'src/features/profile')), false);
  });
  scratch((dir) => {
    const out = prepared(join(dir, 'audit'), 'audit');
    assert.equal(git(out.app, 'rev-list', '--count', 'HEAD'), '1');
    assert.equal(readFileSync(out.spec, 'utf8'), readFileSync(SPEC, 'utf8'));
    // The implemented feature works: the app's own suite is green.
    const run = spawnSync(process.execPath, ['--test'], { cwd: out.app, encoding: 'utf8', env: cleanEnv() });
    assert.equal(run.status, 0, `the app's tests pass at the audit stage:\n${run.stdout}\n${run.stderr}`);
  });
});

// The audit stage is what an implement run leaves: the implement commit, and
// the feature on top of it as changes nobody committed (changed files
// modified, new files untracked), so an audit finds its work in the diff
// against HEAD.
test('the audit stage is the implement commit plus the feature, uncommitted', () => {
  scratch((dir) => {
    const implement = prepared(join(dir, 'implement'), 'implement');
    const audit = prepared(join(dir, 'audit'), 'audit');
    assert.equal(git(audit.app, 'rev-list', '--count', 'HEAD'), '1');
    assert.equal(git(audit.app, 'rev-parse', 'HEAD^{tree}'), git(implement.app, 'rev-parse', 'HEAD^{tree}'), 'HEAD is the implement commit');

    const porcelain = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: audit.app, encoding: 'utf8', env: cleanEnv() });
    assert.equal(porcelain.status, 0, porcelain.stderr);
    const status = porcelain.stdout.split('\n').filter(Boolean).sort();
    const feature = listFiles(join(FIXTURE, 'feature'));
    const expected = feature.map((f) => (existsSync(join(implement.app, f)) ? ` M ${f}` : `?? ${f}`)).sort();
    assert.deepEqual(status, expected, 'every feature file is a change: the changed ones modified, the new ones untracked');
    assert.ok(expected.some((line) => line.startsWith('??')), 'the feature adds files');
    assert.ok(expected.some((line) => line.startsWith(' M')), 'the feature changes files');
    for (const line of status) assert.ok(!line.slice(3).startsWith('.vibeflow/'), `the feature touches no document: ${line}`);
    assert.equal(git(audit.app, 'diff', '--cached', '--name-only'), '', 'nothing is staged');
    // Nothing in the feature's files points at the planted violations.
    for (const f of feature) {
      assert.doesNotMatch(readFileSync(join(audit.app, f), 'utf8'), /canar|violat|deliberat|on purpose|intentional|\bC[1-4]\b|planted/i, f);
    }
  });
});

test('the canaries sit at the positions of the README table', () => {
  scratch((dir) => {
    const { app } = prepared(join(dir, 'p'), 'genspec');
    for (const c of readmeCanaries()) {
      const lines = linesOf(join(app, c.file));
      assert.equal(lines[c.line - 1], c.text, `${c.id}: line ${c.line} of ${c.file}`);
      if (c.id === 'C4') {
        const ratio = c.line / lines.length;
        assert.ok(lines.length >= 480 && lines.length <= 540, `C4's document has 480 to 540 lines, got ${lines.length}`);
        assert.ok(ratio >= 0.45 && ratio <= 0.55, `C4 sits between 45% and 55% of its document, got ${ratio}`);
      } else {
        assert.equal(c.line, lines.length, `${c.id} is the last line of ${c.file}`);
      }
    }
    const files = readmeCanaries().map((c) => c.file);
    assert.equal(files[0], '.vibeflow/conventions.md');
    assert.equal(files[1], '.vibeflow/patterns/forms.md');
    assert.ok(files[2].startsWith('.vibeflow/patterns/external-team-conventions/'), 'C3 is in an imported document');
    assert.ok(files[3].startsWith('.vibeflow/patterns/external-team-conventions/'), 'C4 is in an imported document');
  });
});

test('each canary line and marker lives in one file only, in every stage and in the fixture', () => {
  const canaries = readmeCanaries();
  for (const stage of ['genspec', 'implement', 'audit']) {
    scratch((dir) => {
      const { app } = prepared(join(dir, 'p'), stage);
      for (const c of canaries) {
        const holders = listFiles(app).filter((f) => readFileSync(join(app, f), 'utf8').includes(c.marker));
        assert.deepEqual(holders, [c.file], `${stage}: ${c.id}'s marker is only in ${c.file}`);
      }
    });
  }
  // The fixture's own files: only the README (which documents them) and the
  // owner file may carry a canary.
  const own = listFiles(FIXTURE).filter((f) => f !== 'README.md');
  for (const c of canaries) {
    const stored = c.file.replace(/^\.vibeflow\//, 'app/vibeflow/');
    const holders = own.filter((f) => readFileSync(join(FIXTURE, f), 'utf8').includes(c.marker));
    assert.deepEqual(holders, [stored], `${c.id}'s marker is only in ${stored} among the fixture's files`);
  }
  const self = readFileSync(join(FIXTURE, 'measure.mjs'), 'utf8');
  for (const c of canaries) assert.ok(!self.includes(c.text), `measure.mjs does not repeat ${c.id}`);
});

test('the app code follows none of the canaries at the genspec stage', () => {
  scratch((dir) => {
    const { app } = prepared(join(dir, 'p'), 'genspec');
    const code = listFiles(app).filter((f) => f.endsWith('.js'));
    for (const f of code) {
      const text = readFileSync(join(app, f), 'utf8');
      assert.ok(!text.startsWith('// feature:'), `${f} does not open with a feature line`);
      assert.ok(!/\bLIMITS\b/.test(text), `${f} has no LIMITS object`);
      assert.ok(!/--[a-z]/.test(text.replace(/^\s*\/\/.*$/gm, '')), `${f} has no screen-prefixed field id`);
      assert.ok(!/saved:\s*true/.test(text), `${f} does not go back with saved`);
    }
  });
});

test('the volume matches the Scale section and the README size table', () => {
  scratch((dir) => {
    const { app } = prepared(join(dir, 'p'), 'genspec');
    const vf = join(app, '.vibeflow');
    const conventionLines = linesOf(join(vf, 'conventions.md')).length;
    assert.ok(conventionLines >= 130 && conventionLines <= 160, `conventions.md has 130 to 160 lines, got ${conventionLines}`);

    const local = readdirSync(join(vf, 'patterns')).filter((f) => f.endsWith('.md'));
    assert.equal(local.length, 13, 'thirteen local patterns');

    const listed = specPatterns(readFileSync(SPEC, 'utf8'));
    const listedLocal = listed.filter((p) => !p.includes('/external-'));
    const listedImported = listed.filter((p) => p.includes('/external-'));
    assert.ok(listedLocal.length >= 3, 'the spec lists local patterns');
    assert.ok(listedImported.length >= 3, 'the spec lists imported documents');
    for (const p of listed) assert.ok(existsSync(join(vf, p)), `${p} exists in the app`);

    const size = (p) => statSync(join(vf, p)).size;
    for (const p of listedLocal) {
      assert.ok(size(p) >= 2 * KB && size(p) <= 5000, `${p} is 2 to 5 KB, got ${size(p)}`);
    }
    const importedBytes = listedImported.reduce((sum, p) => sum + size(p), 0);
    assert.ok(importedBytes >= 30 * KB && importedBytes <= 40000, `listed imported documents sum 30 to 40 KB, got ${importedBytes}`);
    const long = listedImported.filter((p) => {
      const n = linesOf(join(vf, p)).length;
      return n >= 480 && n <= 540;
    });
    assert.equal(long.length, 1, 'one listed imported document has 480 to 540 lines');
    const all = size('conventions.md') + listed.reduce((sum, p) => sum + size(p), 0);
    assert.ok(all > 40 * KB, `conventions.md plus the listed documents pass 40 KB, got ${all}`);

    // The README's size table carries the measured numbers.
    const readme = readFileSync(README, 'utf8');
    const rows = new Map();
    for (const match of readme.matchAll(/^\| `([^`]+)` \| (\d+) \| (\d+) \|$/gm)) {
      rows.set(match[1], { lines: Number(match[2]), bytes: Number(match[3]) });
    }
    for (const p of ['conventions.md', ...listed]) {
      const row = rows.get(`.vibeflow/${p}`);
      assert.ok(row, `the README size table has .vibeflow/${p}`);
      assert.equal(row.lines, linesOf(join(vf, p)).length, `README lines of ${p}`);
      assert.equal(row.bytes, size(p), `README bytes of ${p}`);
    }
  });
});

test('the app is in the post-import state of 1.18.0', () => {
  scratch((dir) => {
    const { app } = prepared(join(dir, 'p'), 'genspec');
    const vf = join(app, '.vibeflow');
    const index = readFileSync(join(vf, 'index.md'), 'utf8');
    const block = index.match(/## Imported Sources\n\n<!-- vibeflow:sources:start -->\n([\s\S]*?)<!-- vibeflow:sources:end -->/);
    assert.ok(block, 'index.md has the Imported Sources block');
    const line = block[1].trim();
    const parsed = line.match(/^- external-team-conventions: `patterns\/external-team-conventions\/registry\.md` — (\d+) entries \((\d+) pattern, (\d+) convention, (\d+) workflow\), commit ([0-9a-f]{7}), imported \d{4}-\d{2}-\d{2}$/);
    assert.ok(parsed, `the source line has the 1.18.0 shape: ${line}`);
    assert.ok(index.indexOf('<!-- vibeflow:patterns:end -->') < index.indexOf('## Imported Sources'), 'Imported Sources follows the Pattern Registry');

    const registry = readFileSync(join(vf, 'patterns/external-team-conventions/registry.md'), 'utf8');
    const entries = [...registry.matchAll(/^ {2}- file: (\S+)$/gm)].map((m) => m[1]);
    assert.equal(entries.length, Number(parsed[1]), 'the entry count matches the registry');
    const kinds = [...registry.matchAll(/^ {4}kind: (\w+)$/gm)].map((m) => m[1]);
    assert.equal(kinds.filter((k) => k === 'pattern').length, Number(parsed[2]));
    assert.equal(kinds.filter((k) => k === 'convention').length, Number(parsed[3]));
    assert.equal(kinds.filter((k) => k === 'workflow').length, Number(parsed[4]));
    const onDisk = readdirSync(join(vf, 'patterns/external-team-conventions')).filter((f) => f !== 'registry.md');
    assert.deepEqual(entries.map((e) => e.split('/').pop()).sort(), onDisk.sort());
    for (const entry of entries) {
      const doc = readFileSync(join(vf, entry), 'utf8');
      const commit = doc.match(/^source_commit: ([0-9a-f]{40})$/m);
      assert.ok(commit, `${entry} carries source_commit`);
      assert.equal(commit[1].slice(0, 7), parsed[5], `${entry}: the commit matches the index line`);
      assert.match(doc, /^confidence: imported$/m);
      assert.match(doc, /^source_file: \S+$/m);
    }
  });
});

test('the fixed spec has the 1.18.0 shape and points at the four canary owners without copying them', () => {
  const spec = readFileSync(SPEC, 'utf8');
  for (const heading of ['Objective', 'Definition of Done', 'Scope', 'Anti-scope', 'Technical Decisions', 'Applicable Patterns']) {
    assert.match(spec, new RegExp(`^## ${heading}$`, 'm'), `the spec has ## ${heading}`);
  }
  assert.match(spec, /^Imported entries that apply: \d+ /m);
  const listed = specPatterns(spec).map((p) => `.vibeflow/${p}`);
  for (const c of readmeCanaries()) {
    if (c.file === '.vibeflow/conventions.md') continue;
    assert.ok(listed.includes(c.file), `the spec lists ${c.file}, owner of ${c.id}`);
    assert.ok(!spec.includes(c.marker), `the spec does not copy ${c.id}`);
  }
});

test('at the audit stage each canary is broken where the README says', () => {
  scratch((dir) => {
    const { app } = prepared(join(dir, 'p'), 'audit');
    const violations = readmeViolations();
    assert.deepEqual([...new Set(violations.map((v) => v.id))], ['C1', 'C2', 'C3', 'C4']);
    for (const v of violations) {
      const lines = linesOf(join(app, v.file));
      assert.ok(lines[v.line - 1]?.includes(v.code), `${v.id}: line ${v.line} of ${v.file} holds ${v.code}`);
    }
    const feature = listFiles(join(app, 'src/features/profile')).map((f) => `src/features/profile/${f}`);
    assert.ok(feature.length >= 2, 'the feature has its files');
    for (const f of feature) {
      const first = linesOf(join(app, f))[0];
      assert.ok(!first.startsWith('// feature:'), `C1 is broken in ${f}`);
      assert.ok(violations.some((v) => v.id === 'C1' && v.file === f && v.line === 1), `the README lists ${f} under C1`);
    }
    const code = feature.map((f) => readFileSync(join(app, f), 'utf8')).join('\n');
    assert.match(code, /id: '[a-z-]+'/, 'C2: field ids exist');
    assert.ok(!/id: 'profile-edit--/.test(code), 'C2 is broken: no field id carries the screen id');
    assert.match(code, /maxLength\('[^']+', \d+\)/, 'C3 is broken: a validation call takes a bare number');
    assert.ok(!existsSync(join(app, 'src/features/profile/constants.js')), 'C3 is broken: no constants.js');
    assert.match(code, /navigator\.back\(\)/, 'C4 is broken: back without saved');
    for (const c of readmeCanaries()) assert.ok(!code.includes(c.marker), `the feature code does not name ${c.id}`);
  });
});

// Outside the four canaries the feature is right: the code style the spec
// imports declares event names once and imports them, so no log call of the
// feature types its event name, even where the imported logging example does.
test('at the audit stage the feature declares its event names once and never retypes them in a log call', () => {
  scratch((dir) => {
    const { app } = prepared(join(dir, 'p'), 'audit');
    const feature = listFiles(join(app, 'src/features/profile')).map((f) => readFileSync(join(app, 'src/features/profile', f), 'utf8'));
    const code = feature.join('\n');
    const calls = [...code.matchAll(/logger\.(info|warn|error)\(([^,)]+)/g)];
    assert.ok(calls.length >= 3, 'the feature logs the save, the rejected save and the refused write');
    for (const [, , first] of calls) assert.doesNotMatch(first.trim(), /^['"`]/, `a log call names its event through a constant: ${first}`);
    const names = [...code.matchAll(/'profile\.[a-z-]+'/g)].map((m) => m[0]);
    assert.equal(new Set(names).size, names.length, `each event name is written once: ${names}`);
  });
});
