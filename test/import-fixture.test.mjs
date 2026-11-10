// The external-import fixture: a synthetic source of team conventions and a
// small app with a ready .vibeflow/, prepared into a scratch directory by
// test/fixtures/external-import/prepare.mjs. These tests hold the fixture's
// README to the files it describes and the preparer to its output contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'test/fixtures/external-import');
const PREPARE = join(FIXTURE, 'prepare.mjs');
const README = join(FIXTURE, 'README.md');

// The globs `teach --from` scans once the fix lands: the seven it scans today
// (teach/SKILL.md, "Detect knowledge sources") plus the two .claude/ folders.
const TEACH_GLOBS = [
  '.claude/skills/*/SKILL.md',
  'CLAUDE.md',
  'knowledge/**/*.md',
  'docs/**/*.md',
  '.cursorrules',
  '.cursor/rules/*.mdc',
  'AGENTS.md',
  '.claude/rules/**/*.md',
  '.claude/knowledge/**/*.md',
];

const KINDS = new Set(['pattern', 'convention', 'workflow']);

function cleanEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  return env;
}

function scratch(run) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-import-fixture-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function prepare(dir) {
  return spawnSync(process.execPath, [PREPARE, dir], { encoding: 'utf8', env: cleanEnv() });
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}

function prepared(dir) {
  const result = prepare(dir);
  assert.equal(result.status, 0, `prepare.mjs failed: ${result.stderr}`);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 1, `prepare.mjs prints one line, got: ${result.stdout}`);
  return JSON.parse(lines[0]);
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

function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*' && glob[i + 2] === '/') {
      source += '(?:.*/)?';
      i += 2;
    } else if (char === '*' && glob[i + 1] === '*') {
      source += '.*';
      i += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

function readmeSection(heading) {
  const text = readFileSync(README, 'utf8');
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `README has a "## ${heading}" section`);
  const rest = text.slice(start + heading.length + 5);
  const end = rest.search(/\n## /);
  return end === -1 ? rest : rest.slice(0, end);
}

function tableRows(section) {
  return section
    .split('\n')
    .filter((line) => line.startsWith('|') && !/^\|\s*-/.test(line))
    .slice(1)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

test('the glob table in the fixture README matches the prepared source', () => {
  scratch((dir) => {
    const { source } = prepared(dir);
    const files = listFiles(source);
    const rows = tableRows(readmeSection('Expected counts per glob'));

    const totalRow = rows.find((row) => /total/i.test(row[0]));
    assert.ok(totalRow, 'the table ends with a Total row');
    const globRows = rows.filter((row) => row !== totalRow);

    const globs = globRows.map((row) => row[0].replace(/`/g, ''));
    assert.deepEqual(globs, TEACH_GLOBS, 'one row per teach glob, in the teach order');

    const matchedFiles = new Set();
    let sum = 0;
    for (const [cell, expected] of globRows) {
      const glob = cell.replace(/`/g, '');
      const matched = files.filter((file) => globToRegExp(glob).test(file));
      matched.forEach((file) => matchedFiles.add(file));
      assert.equal(matched.length, Number(expected), `${glob} matches ${matched.join(', ') || 'nothing'}`);
      sum += matched.length;
    }

    const total = Number(totalRow[1].replace(/\*/g, ''));
    assert.equal(total, sum, 'the Total row is the sum of the rows');
    assert.equal(matchedFiles.size, sum, 'no source file matches two globs');
    assert.deepEqual([...matchedFiles].sort(), files, 'every source file is reached by a teach glob');
  });
});

test('the kind table in the fixture README covers every source document once', () => {
  scratch((dir) => {
    const { source } = prepared(dir);
    const files = listFiles(source);
    const rows = tableRows(readmeSection('Expected kind per document'));
    const paths = rows.map((row) => row[0].replace(/`/g, ''));

    assert.deepEqual([...paths].sort(), files, 'one row per source document');
    for (const [path, kind, reason] of rows) {
      assert.ok(KINDS.has(kind), `${path} has kind pattern, convention or workflow, got "${kind}"`);
      assert.ok(reason && reason.length > 10, `${path} has a reason`);
    }
    for (const kind of KINDS) {
      assert.ok(rows.some((row) => row[1] === kind), `at least one ${kind}`);
    }
    assert.ok(files.length >= 10 && files.length <= 14, `10 to 14 source documents, got ${files.length}`);
  });
});

test('prepare.mjs builds both repositories with one commit each and the dot folders', () => {
  scratch((dir) => {
    const out = prepared(dir);
    assert.deepEqual(Object.keys(out).sort(), ['app', 'source', 'sourceCommit']);
    assert.ok(isAbsolute(out.source) && isAbsolute(out.app), 'absolute paths');
    assert.equal(out.source, join(dir, 'source'));
    assert.equal(out.app, join(dir, 'app'));

    for (const repo of [out.source, out.app]) {
      assert.equal(git(repo, 'rev-list', '--count', 'HEAD'), '1', `${repo} has exactly one commit`);
      assert.equal(git(repo, 'status', '--porcelain', '--ignored'), '', `${repo} has nothing left out of the commit`);
      assert.ok(!existsSync(join(repo, 'claude')) && !existsSync(join(repo, 'vibeflow')) && !existsSync(join(repo, '_docs')));
    }
    assert.equal(git(out.source, 'rev-parse', 'HEAD'), out.sourceCommit);
    assert.match(out.sourceCommit, /^[0-9a-f]{40}$/);

    assert.ok(existsSync(join(out.source, '.claude/rules/navigation.md')));
    assert.ok(existsSync(join(out.source, 'docs/architecture.md')));
    assert.ok(existsSync(join(out.app, '.vibeflow/index.md')));
    assert.ok(existsSync(join(out.app, 'src/features/home/navigation/home-routes.js')));
    assert.ok(!existsSync(join(out.app, 'src/features/profile/navigation/profile-routes.js')),
      'the acceptance feature creates the profile routes file, so it must not exist yet');

    const tracked = git(out.source, 'ls-files').split('\n');
    assert.ok(tracked.includes('.claude/rules/navigation.md'), 'the .claude/ folder is committed in the source');
    assert.ok(git(out.app, 'ls-files').split('\n').includes('.vibeflow/index.md'), 'the .vibeflow/ folder is committed in the app');
  });
});

test('prepare.mjs gives the same source commit on every run', () => {
  const first = scratch((dir) => prepared(dir).sourceCommit);
  const second = scratch((dir) => prepared(dir).sourceCommit);
  assert.equal(first, second);
});

test('prepare.mjs refuses a directory that is not empty and leaves it alone', () => {
  scratch((dir) => {
    writeFileSync(join(dir, 'keep.txt'), 'mine');
    const result = prepare(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not empty/i);
    assert.deepEqual(readdirSync(dir), ['keep.txt']);
  });
});

test('prepare.mjs refuses a missing argument', () => {
  const result = spawnSync(process.execPath, [PREPARE], { encoding: 'utf8', env: cleanEnv() });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage/i);
});

test('the sample app passes its own tests as prepared', () => {
  scratch((dir) => {
    const { app } = prepared(dir);
    const result = spawnSync(process.execPath, ['--test'], { cwd: app, encoding: 'utf8', env: cleanEnv() });
    assert.equal(result.status, 0, `sample-app tests failed:\n${result.stdout}\n${result.stderr}`);
  });
});
