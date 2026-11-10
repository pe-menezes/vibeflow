// The external-import fixture: a synthetic source of team conventions and a
// small app with a ready .vibeflow/, prepared into a scratch directory by
// test/fixtures/external-import/prepare.mjs. These tests hold the fixture's
// README to the files it describes and the preparer to its output contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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

function sectionOf(text, heading, where) {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `${where} has a "## ${heading}" section`);
  const rest = text.slice(start + heading.length + 5);
  const end = rest.search(/\n## /);
  return end === -1 ? rest : rest.slice(0, end);
}

function readmeSection(heading) {
  return sectionOf(readFileSync(README, 'utf8'), heading, 'README');
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

    const byKind = /By kind: (\d+) pattern, (\d+) convention, (\d+) workflow\./.exec(readmeSection('Expected kind per document'));
    assert.ok(byKind, 'the kind section states "By kind: <p> pattern, <c> convention, <w> workflow."');
    const count = (kind) => rows.filter((row) => row[1] === kind).length;
    assert.deepEqual(byKind.slice(1).map(Number), [count('pattern'), count('convention'), count('workflow')],
      'the "By kind" line matches the table');

    const declared = /`source\/`\*\*, logical name `team-conventions`: (\d+) documents/.exec(readmeSection('The two sides').replace(/\s+/g, ' '));
    assert.ok(declared, 'The two sides declares the number of source documents as "<n> documents"');
    assert.equal(files.length, Number(declared[1]), 'the declared number of source documents');
  });
});

// The base run scans only the first seven globs (the last two rows are the
// .claude/ folders the fix adds); the README states both numbers.
test('the README states how many documents the base run finds, from the glob table', () => {
  const section = readmeSection('Expected counts per glob');
  const rows = tableRows(section);
  const totalRow = rows.find((row) => /total/i.test(row[0]));
  const globRows = rows.filter((row) => row !== totalRow);
  const base = globRows.slice(0, 7).reduce((sum, row) => sum + Number(row[1]), 0);
  const total = Number(totalRow[1].replace(/\*/g, ''));
  const stated = /the base run finds (\d+) documents instead of (\d+)/.exec(section.replace(/\s+/g, ' '));
  assert.ok(stated, 'the glob section states "the base run finds <n> documents instead of <total>"');
  assert.deepEqual([Number(stated[1]), Number(stated[2])], [base, total]);
});

function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  return match ? match[1] : null;
}

// The three cases the acceptance's step 4 depends on: a skill picked by its
// subject (no paths), a rule picked by a glob that reaches every .js file, and
// a Cursor rule that is always on.
test('the source carries a subject-only skill, a broad-glob rule and an always-on Cursor rule', () => {
  scratch((dir) => {
    const { source } = prepared(dir);
    const read = (path) => (existsSync(join(source, path)) ? frontmatter(readFileSync(join(source, path), 'utf8')) : null);

    const skill = read('.claude/skills/screen-flows/SKILL.md');
    assert.ok(skill, '.claude/skills/screen-flows/SKILL.md exists with a frontmatter');
    assert.match(skill, /^name: screen-flows$/m);
    assert.match(skill, /^description: \S/m);
    assert.doesNotMatch(skill, /^paths:/m, 'screen-flows has no paths, so only its subject can pick it');

    const style = read('.claude/rules/code-style.md');
    assert.ok(style, '.claude/rules/code-style.md exists with a frontmatter');
    assert.match(style, /^paths: \["\*\*\/\*\.js"\]$/m, 'code-style is scoped by the broad glob **/*.js');

    const logging = read('.cursor/rules/logging.mdc');
    assert.ok(logging, '.cursor/rules/logging.mdc exists with a frontmatter');
    assert.match(logging, /^alwaysApply: true$/m);
    assert.doesNotMatch(logging, /^paths:/m);
  });
});

function registryEntries(index) {
  const block = /<!-- vibeflow:patterns:start -->\n([\s\S]*?)<!-- vibeflow:patterns:end -->/.exec(index);
  assert.ok(block, 'index.md has the Pattern Registry block');
  const entries = [];
  for (const line of block[1].split('\n')) {
    const file = /^  - file: (\S+)$/.exec(line);
    const field = /^    (tags|modules): \[(.*)\]$/.exec(line);
    if (file) entries.push({ file: file[1] });
    else if (field && entries.length) {
      entries[entries.length - 1][field[1]] = field[2].split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return entries;
}

// The app's .vibeflow/ has the size of a real one. In the base run of the
// acceptance a small index let the spec reach the imported folder through
// "Pattern Docs Available"; with a dozen local patterns the spec picks by the
// registry alone, which is the defect the fix addresses.
test('the app has 12 to 15 local patterns, each in the registry with code behind it, and an index of 105 to 120 lines', () => {
  scratch((dir) => {
    const { app } = prepared(dir);
    const index = readFileSync(join(app, '.vibeflow/index.md'), 'utf8');
    const lines = index.split('\n').length - (index.endsWith('\n') ? 1 : 0);
    assert.ok(lines >= 105 && lines <= 120, `index.md has 105 to 120 lines, got ${lines}`);

    const docs = readdirSync(join(app, '.vibeflow/patterns')).filter((name) => name.endsWith('.md')).sort();
    assert.ok(docs.length >= 12 && docs.length <= 15, `12 to 15 local patterns, got ${docs.length}`);

    const entries = registryEntries(index);
    assert.deepEqual(entries.map((entry) => entry.file).sort(), docs.map((name) => `patterns/${name}`),
      'one registry entry per local pattern file');

    const available = sectionOf(index, 'Pattern Docs Available', 'index.md');
    for (const entry of entries) {
      assert.ok(entry.tags && entry.tags.length > 0, `${entry.file} has tags`);
      assert.ok(entry.modules && entry.modules.length > 0, `${entry.file} has modules`);
      for (const module of entry.modules) {
        assert.ok(module.endsWith('/'), `${entry.file}: module ${module} ends with /`);
        const code = existsSync(join(app, module)) ? listFiles(join(app, module)) : [];
        assert.ok(code.some((file) => file.endsWith('.js')), `${entry.file}: ${module} holds JavaScript code`);
      }
      const doc = frontmatter(readFileSync(join(app, '.vibeflow', entry.file), 'utf8'));
      assert.ok(doc, `${entry.file} has a frontmatter`);
      assert.ok(doc.split('\n').includes(`modules: [${entry.modules.join(', ')}]`),
        `${entry.file}: frontmatter modules match the registry`);
      assert.ok(available.includes(`\`${entry.file}\``), `${entry.file} is in Pattern Docs Available`);
    }

    const declared = /logical name `sample-app`:[\s\S]*?with (\d+) local patterns/.exec(readmeSection('The two sides').replace(/\s+/g, ' '));
    assert.ok(declared, 'The two sides declares the number of local patterns as "with <n> local patterns"');
    assert.equal(entries.length, Number(declared[1]), 'the declared number of local patterns');
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
      for (const name of ['claude', 'vibeflow', '_docs', 'cursor']) {
        assert.ok(!existsSync(join(repo, name)), `${repo} has no ${name}/ left after the rename`);
      }
    }
    assert.equal(git(out.source, 'rev-parse', 'HEAD'), out.sourceCommit);
    assert.match(out.sourceCommit, /^[0-9a-f]{40}$/);

    assert.ok(existsSync(join(out.source, '.claude/rules/navigation.md')));
    assert.ok(existsSync(join(out.source, 'docs/architecture.md')));
    assert.ok(existsSync(join(out.source, '.cursor/rules/logging.mdc')));
    assert.ok(existsSync(join(out.app, '.vibeflow/index.md')));
    assert.ok(existsSync(join(out.app, 'src/features/home/navigation/home-routes.js')));
    assert.ok(!existsSync(join(out.app, 'src/features/profile/navigation/profile-routes.js')),
      'the acceptance feature creates the profile routes file, so it must not exist yet');

    const tracked = git(out.source, 'ls-files').split('\n');
    assert.ok(tracked.includes('.claude/rules/navigation.md'), 'the .claude/ folder is committed in the source');
    assert.ok(tracked.includes('.cursor/rules/logging.mdc'), 'the .cursor/ folder is committed in the source');
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

test('prepare.mjs refuses a directory whose only entry is a hidden .git and leaves it alone', () => {
  scratch((dir) => {
    mkdirSync(join(dir, '.git'));
    const result = prepare(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not empty/i);
    assert.deepEqual(readdirSync(dir), ['.git'], 'nothing was added next to .git');
    assert.deepEqual(readdirSync(join(dir, '.git')), [], 'the .git folder is still empty');
  });
});

test('prepare.mjs drops GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE inherited from the caller', () => {
  scratch((root) => {
    const decoy = join(root, 'decoy');
    mkdirSync(decoy);
    writeFileSync(join(decoy, 'mine.txt'), 'caller data\n');
    const decoyGit = (...args) => {
      const result = spawnSync('git', args, {
        cwd: decoy,
        encoding: 'utf8',
        env: {
          ...cleanEnv(),
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_AUTHOR_NAME: 'Decoy',
          GIT_AUTHOR_EMAIL: 'decoy@example.com',
          GIT_COMMITTER_NAME: 'Decoy',
          GIT_COMMITTER_EMAIL: 'decoy@example.com',
        },
      });
      assert.equal(result.status, 0, `git ${args.join(' ')} failed in the decoy: ${result.stderr}`);
      return result.stdout.trim();
    };
    decoyGit('init', '--quiet');
    decoyGit('add', 'mine.txt');
    decoyGit('-c', 'commit.gpgsign=false', 'commit', '--quiet', '--no-verify', '-m', 'decoy');
    const decoyHead = decoyGit('rev-parse', 'HEAD');
    const reference = scratch((dir) => prepared(dir).sourceCommit);

    const target = join(root, 'out');
    const result = spawnSync(process.execPath, [PREPARE, target], {
      encoding: 'utf8',
      env: {
        ...cleanEnv(),
        GIT_DIR: join(decoy, '.git'),
        GIT_WORK_TREE: decoy,
        GIT_INDEX_FILE: join(decoy, '.git', 'index'),
      },
    });
    assert.equal(result.status, 0, `prepare.mjs failed: ${result.stderr}`);
    const out = JSON.parse(result.stdout);

    assert.equal(decoyGit('rev-parse', 'HEAD'), decoyHead, 'the caller repository HEAD did not move');
    assert.equal(decoyGit('rev-list', '--count', 'HEAD'), '1', 'no commit was added to the caller repository');
    assert.equal(decoyGit('status', '--porcelain'), '', 'nothing was staged in the caller repository');
    assert.deepEqual(readdirSync(decoy).sort(), ['.git', 'mine.txt'], 'no file was copied into the caller repository');

    for (const repo of [out.source, out.app]) {
      assert.equal(git(repo, 'rev-parse', '--show-toplevel'), realpathSync(repo), `${repo} is the top of its own repository`);
      assert.equal(git(repo, 'rev-list', '--count', 'HEAD'), '1', `${repo} has its own single commit`);
    }
    assert.equal(git(out.source, 'rev-parse', 'HEAD'), out.sourceCommit, 'the printed sha is the source repository HEAD');
    assert.equal(out.sourceCommit, reference, 'inherited GIT_* do not change the source commit');
  });
});

// The README declares the fixed commit date; both prepared repositories carry
// it as author and committer date. A constant, not the clock: without the
// fixed date each commit takes the time of the run. The instant is compared
// (%at and %ct, seconds since the epoch), not the text, because older git
// versions print UTC as +00:00 where newer ones print Z.
test('both prepared repositories carry the fixed commit date the README declares', () => {
  const declared = /fixed commit date is `([^`]+)`/i.exec(readmeSection('Prepare'));
  assert.ok(declared, 'the Prepare section declares "the fixed commit date is `<ISO 8601>`"');
  const instant = Date.parse(declared[1]);
  assert.ok(Number.isFinite(instant), `the declared date parses: ${declared[1]}`);
  const seconds = String(instant / 1000);
  scratch((dir) => {
    const out = prepared(dir);
    for (const repo of [out.source, out.app]) {
      assert.equal(git(repo, 'log', '-1', '--format=%at'), seconds, `${repo} author date`);
      assert.equal(git(repo, 'log', '-1', '--format=%ct'), seconds, `${repo} committer date`);
    }
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
