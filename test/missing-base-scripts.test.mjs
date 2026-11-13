// The loop kit's scripts and the knowledge base the analyze workflow writes (.vibeflow/index.md,
// conventions.md, decisions.md, patterns/), over the missing-base fixture: a linked worktree
// without the base while the main checkout has it, the main checkout itself, and a repository
// that never had one. Each case runs with .vibeflow/ ignored and not ignored.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCRIPTS_DIR, hermeticEnv, runScript } from './loop-helpers.mjs';
import { BASE_FILES, CHANGED_FILE, MODES, SPEC_PATH, makeMissingBase } from './fixtures/missing-base/make.mjs';

const MAKE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/missing-base/make.mjs');

const LEFT_OUT = 'Knowledge base left out: 5 untracked path(s) under .vibeflow/ (index.md, conventions.md, decisions.md, patterns/); they are the project\'s knowledge, not a change.';
const NONE_LINE = '[attention] knowledge base: none (no .vibeflow/index.md here or in the main checkout); rounds run without patterns and conventions, and the audit report and the PR body say so';
const NONE_BRIEFING = '[attention] knowledge base: none in this project; the briefing runs the round without it';
const PRESENT_LINE = '[ok] knowledge base: .vibeflow/index.md present, with conventions.md and 2 pattern doc(s)';

function withFixture(options, run) {
  const dest = mkdtempSync(join(tmpdir(), 'vibeflow-missing-base-'));
  try {
    return run(makeMissingBase(join(dest, 'fx'), options), dest);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

// A hermetic environment whose PATH starts with a fake gh that knows no account, so a run with
// the network on never reaches a real gh.
function envFor(fx) {
  const bin = join(fx.home, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho "not logged in" >&2\nexit 1\n');
  chmodSync(join(bin, 'gh'), 0o755);
  return hermeticEnv(fx.home, { PATH: `${bin}:${process.env.PATH}`, HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', NO_PROXY: '' });
}

const knowledgeLine = (out) => out.split('\n').find((line) => line.includes('knowledge base:'));

function preflight(fx, repo, extra = ['--no-network']) {
  return runScript('preflight.mjs', ['--repo', repo, ...extra], envFor(fx));
}

// The main checkout's path as the stop line names it, and the copy command the line ends with.
function parseMissing(line) {
  const match = /^\[stop\] knowledge base: missing in this worktree; the main checkout has it in (.+)\/\.vibeflow\/\. Copy it before any round: (.+)$/.exec(line ?? '');
  return match ? { main: match[1], command: match[2] } : null;
}

function copyBase(fx, command) {
  const result = spawnSync('sh', ['-c', command], { cwd: fx.wt, env: envFor(fx), encoding: 'utf8' });
  assert.equal(result.status, 0, `the copy command runs: ${result.stderr}`);
}

// The base copied by hand, as a person does it, independent of any script's line.
function copyBaseByHand(fx) {
  for (const path of BASE_FILES) cpSync(join(fx.main, path), join(fx.wt, path));
}

function git(fx, cwd, args) {
  const result = spawnSync('git', args, { cwd, env: envFor(fx), encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

// --- the fixture ---

test('the fixture builds main with the base outside git, a linked worktree without it, and a repository without one', () => {
  for (const mode of MODES) {
    withFixture({ mode }, (fx) => {
      for (const path of BASE_FILES) assert.ok(existsSync(join(fx.main, path)), `${mode}: main has ${path}`);
      assert.equal(git(fx, fx.main, ['ls-files', '.vibeflow']).trim(), '', `${mode}: the base is outside git`);
      const status = git(fx, fx.main, ['status', '--porcelain']);
      if (mode === 'untracked') assert.match(status, /^\?\? \.vibeflow\/$/m, status);
      else assert.equal(status.trim(), '', status);
      assert.equal(readFileSync(join(fx.main, '.vibeflow/index.md'), 'utf8').includes('Suggested budget: ≤ 4'), true);

      assert.notEqual(realpathSync(git(fx, fx.wt, ['rev-parse', '--git-dir']).trim()), realpathSync(git(fx, fx.wt, ['rev-parse', '--git-common-dir']).trim()), `${mode}: wt is a linked worktree`);
      assert.equal(git(fx, fx.wt, ['branch', '--show-current']).trim(), 'feature');
      assert.equal(existsSync(join(fx.wt, '.vibeflow/index.md')), false, `${mode}: wt has no base`);
      assert.match(readFileSync(join(fx.wt, SPEC_PATH), 'utf8'), /## Applicable Patterns[\s\S]*patterns\/errors\.md[\s\S]*patterns\/money\.md/);
      assert.equal(git(fx, fx.wt, ['status', '--porcelain', '--', 'src']).trim(), '', `${mode}: stage spec leaves src/ untouched`);

      assert.equal(existsSync(join(fx.plain, '.vibeflow/index.md')), false);
      assert.ok(existsSync(join(fx.plain, SPEC_PATH)));
    });
  }
  withFixture({ stage: 'change' }, (fx) => {
    assert.match(git(fx, fx.wt, ['status', '--porcelain', '--', 'src']), new RegExp(`^ M ${CHANGED_FILE}$`, 'm'));
  });
});

test('the fixture runs from the command line and prints the paths it created', () => {
  const dest = mkdtempSync(join(tmpdir(), 'vibeflow-missing-base-cli-'));
  try {
    const result = spawnSync(process.execPath, [MAKE, join(dest, 'fx'), '--mode', 'ignored', '--stage', 'change'], { env: hermeticEnv(dest), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const printed = result.stdout.trim().split('\n');
    for (const path of [join(dest, 'fx/main'), join(dest, 'fx/wt'), join(dest, 'fx/plain'), join(dest, 'fx/main/.vibeflow/index.md'), join(dest, 'fx/wt', CHANGED_FILE)]) {
      assert.ok(printed.includes(path), `printed ${path}:\n${result.stdout}`);
    }
    assert.match(readFileSync(join(dest, 'fx/main/.gitignore'), 'utf8'), /^\.vibeflow\/$/m);
    const bad = spawnSync(process.execPath, [MAKE, join(dest, 'other'), '--mode', 'sideways'], { env: hermeticEnv(dest), encoding: 'utf8' });
    assert.equal(bad.status, 1, bad.stdout);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

// --- I1: the preflight's knowledge base line ---

test('preflight stops in a linked worktree without the base, naming the main checkout and the copy command', () => {
  for (const mode of MODES) {
    withFixture({ mode }, (fx) => {
      const result = preflight(fx, fx.wt);
      assert.equal(result.status, 2, `${mode}: ${result.out}`);
      const line = knowledgeLine(result.stdout);
      const parsed = parseMissing(line);
      assert.ok(parsed, `${mode}: the stop line: ${result.out}`);
      assert.equal(realpathSync(parsed.main), realpathSync(fx.main), `${mode}: the main checkout`);
      const item = (name) => `'${parsed.main}/.vibeflow/${name}'`;
      assert.equal(parsed.command, `mkdir -p .vibeflow && cp -R ${item('index.md')} ${item('conventions.md')} ${item('decisions.md')} ${item('patterns')} .vibeflow/`);
      assert.match(result.stdout, /^verdict: stop/m);

      // The line comes right after the repository lines.
      const lines = result.stdout.split('\n');
      const at = lines.indexOf(line);
      assert.match(lines[at - 1], /^\[\w+\] repository: /, result.stdout);
      assert.doesNotMatch(lines.slice(at + 1).join('\n'), /repository: /);

      // With the network on, the line is the same.
      const online = preflight(fx, fx.wt, []);
      assert.equal(knowledgeLine(online.stdout), line, `${mode}: ${online.out}`);

      // Copied with the command it printed, the base is present.
      copyBase(fx, parsed.command);
      for (const path of BASE_FILES) assert.ok(existsSync(join(fx.wt, path)), `${mode}: copied ${path}`);
      assert.equal(knowledgeLine(preflight(fx, fx.wt).stdout), PRESENT_LINE, mode);
    });
  }
});

test('the copy command names only the items the main checkout has, and quotes a path holding a quote', () => {
  const dest = mkdtempSync(join(tmpdir(), 'vibeflow-missing-base-'));
  try {
    const fx = makeMissingBase(join(dest, "it's here"), {});
    rmSync(join(fx.main, '.vibeflow/decisions.md'));
    rmSync(join(fx.main, '.vibeflow/conventions.md'));
    const parsed = parseMissing(knowledgeLine(preflight(fx, fx.wt).stdout));
    assert.ok(parsed);
    const quoted = `'${parsed.main.replaceAll("'", "'\\''")}`;
    assert.ok(parsed.command.includes(`${quoted}/.vibeflow/index.md'`), parsed.command);
    assert.equal(parsed.command, `mkdir -p .vibeflow && cp -R ${quoted}/.vibeflow/index.md' ${quoted}/.vibeflow/patterns' .vibeflow/`);
    copyBase(fx, parsed.command);
    assert.equal(knowledgeLine(preflight(fx, fx.wt).stdout), '[ok] knowledge base: .vibeflow/index.md present, without conventions.md and 2 pattern doc(s)');
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('preflight says present in the main checkout, counting pattern docs at any depth, and none where no checkout has the base', () => {
  for (const mode of MODES) {
    withFixture({ mode }, (fx) => {
      assert.equal(knowledgeLine(preflight(fx, fx.main).stdout), PRESENT_LINE, mode);
      mkdirSync(join(fx.main, '.vibeflow/patterns/imported'));
      writeFileSync(join(fx.main, '.vibeflow/patterns/imported/style.md'), '# Style\n');
      writeFileSync(join(fx.main, '.vibeflow/patterns/imported/notes.txt'), 'not a doc\n');
      assert.equal(knowledgeLine(preflight(fx, fx.main).stdout), PRESENT_LINE.replace('2 pattern', '3 pattern'), mode);

      const none = preflight(fx, fx.plain);
      assert.equal(knowledgeLine(none.stdout), NONE_LINE, `${mode}: ${none.out}`);
      assert.equal(knowledgeLine(preflight(fx, fx.plain, []).stdout), NONE_LINE, `${mode}: with the network on`);

      // The main checkout without index.md is none, and so is its worktree: a .vibeflow/ with
      // only conventions.md or specs/ is not a base.
      rmSync(join(fx.main, '.vibeflow/index.md'));
      assert.equal(knowledgeLine(preflight(fx, fx.main).stdout), NONE_LINE, mode);
      assert.equal(knowledgeLine(preflight(fx, fx.wt).stdout), NONE_LINE, mode);
    });
  }
});

test('preflight prints no knowledge base line outside a git repository', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-missing-base-nogit-'));
  try {
    mkdirSync(join(dir, '.vibeflow'));
    writeFileSync(join(dir, '.vibeflow/index.md'), '# Project\n');
    const result = runScript('preflight.mjs', ['--repo', dir, '--no-network'], hermeticEnv(dir));
    assert.equal(result.status, 2, result.out);
    assert.match(result.stdout, /^\[stop\] repository: /m);
    assert.equal(knowledgeLine(result.stdout), undefined, result.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- I2: check-briefing and the knowledge files a briefing points at ---

const EXECUTOR = (knowledge) => `# cart-total · 1 · executor

## Asked
The cart total.

## Done when
* DoD 1: cartTotal returns the formatted sum

## Read first
${knowledge}

## Facts
* the suite passes 2 of 2 (measured 08:13 by \`npm test\`)

## Perimeter
* may change: \`src/cart.js\`

## Verification contract
* red before green

## Ceiling
* 400k tokens

## Progress and delivery
* progress file
`;

const SAYS_MISSING = '* project knowledge: `.vibeflow/index.md` does not exist in this worktree; `.vibeflow/patterns/errors.md` and `.vibeflow/patterns/money.md` are the spec\'s patterns';

function writeBriefing(dir, text, name = 'cart-total-1-executor.md') {
  const path = join(dir, '.vibeflow/briefings', name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
}

test('check-briefing stops on a briefing that says .vibeflow/index.md does not exist in a worktree without the base, and passes it once the base is copied', () => {
  for (const mode of MODES) {
    withFixture({ mode }, (fx) => {
      const path = writeBriefing(fx.wt, EXECUTOR(SAYS_MISSING));
      const result = runScript('check-briefing.mjs', [path], envFor(fx));
      assert.equal(result.status, 2, `${mode}: ${result.out}`);
      for (const file of ['.vibeflow/index.md', '.vibeflow/patterns/errors.md', '.vibeflow/patterns/money.md']) {
        assert.match(result.stdout, new RegExp(`^\\[stop\\] knowledge file the briefing points at does not exist: ${file.replaceAll('.', '\\.')}$`, 'm'), `${mode}: ${result.out}`);
      }
      assert.equal((result.stdout.match(/does not exist: \.vibeflow\/index\.md$/gm) ?? []).length, 1, 'one line per path');
      // The same stop line the preflight prints, with the copy command.
      const line = knowledgeLine(result.stdout);
      assert.equal(line, knowledgeLine(preflight(fx, fx.wt).stdout), `${mode}: ${result.out}`);
      const parsed = parseMissing(line);
      assert.ok(parsed, line);

      copyBase(fx, parsed.command);
      const copied = runScript('check-briefing.mjs', [path], envFor(fx));
      assert.doesNotMatch(copied.stdout, /^\[stop\]/m, `${mode}: ${copied.out}`);
      assert.ok(copied.status < 2, copied.out);

      // A pattern doc the base does not hold is still a stop.
      const wrong = runScript('check-briefing.mjs', [writeBriefing(fx.wt, EXECUTOR('* project knowledge: `.vibeflow/index.md`, `.vibeflow/patterns/nope.md`'))], envFor(fx));
      assert.equal(wrong.status, 2, wrong.out);
      assert.match(wrong.stdout, /^\[stop\] knowledge file the briefing points at does not exist: \.vibeflow\/patterns\/nope\.md$/m);
      assert.doesNotMatch(wrong.stdout, /does not exist: \.vibeflow\/index\.md/);
    });
  }
});

test('check-briefing in the none state: a briefing without knowledge paths gets the none line, one with them stops', () => {
  withFixture({}, (fx) => {
    const without = runScript('check-briefing.mjs', [writeBriefing(fx.plain, EXECUTOR('* project knowledge: none in this project (analyze has not run)'))], envFor(fx));
    assert.equal(without.status, 1, without.out);
    assert.match(without.stdout, new RegExp(`^${NONE_BRIEFING.replace(/[[\]().]/g, '\\$&')}$`, 'm'), without.out);
    assert.doesNotMatch(without.stdout, /does not point at the project knowledge/);
    assert.doesNotMatch(without.stdout, /^\[stop\]/m);

    const pointing = runScript('check-briefing.mjs', [writeBriefing(fx.plain, EXECUTOR('* project knowledge: `.vibeflow/index.md`'))], envFor(fx));
    assert.equal(pointing.status, 2, pointing.out);
    assert.match(pointing.stdout, /^\[stop\] knowledge file the briefing points at does not exist: \.vibeflow\/index\.md$/m);
    assert.doesNotMatch(pointing.stdout, /missing in this worktree/);
  });
});

test('check-briefing in the present state keeps today\'s warning for a briefing that does not point at index.md', () => {
  withFixture({}, (fx) => {
    const result = runScript('check-briefing.mjs', [writeBriefing(fx.main, EXECUTOR('* the spec'))], envFor(fx));
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /^\[attention\] the briefing does not point at the project knowledge \(\.vibeflow\/index\.md\)$/m);
    assert.doesNotMatch(result.stdout, /knowledge base: none/);
  });
});

test('check-briefing checks knowledge files only for the executor, fix and auditor roles', () => {
  withFixture({}, (fx) => {
    const path = writeBriefing(fx.wt, EXECUTOR(SAYS_MISSING));
    for (const role of ['executor', 'fix', 'auditor']) {
      const result = runScript('check-briefing.mjs', [path, '--role', role], envFor(fx));
      assert.match(result.stdout, /^\[stop\] knowledge file the briefing points at does not exist: \.vibeflow\/index\.md$/m, `${role}: ${result.out}`);
    }
    const reauditor = runScript('check-briefing.mjs', [path, '--role', 'reauditor'], envFor(fx));
    assert.doesNotMatch(reauditor.stdout, /knowledge (file|base)/, reauditor.out);
  });
});

test('check-briefing takes the root from --root, from the git top of the briefing, or from the folder holding its .vibeflow/', () => {
  withFixture({}, (fx, dest) => {
    // A briefing outside any repository: --root decides.
    const loose = join(dest, 'loose');
    mkdirSync(loose);
    const path = join(loose, 'cart-total-1-executor.md');
    writeFileSync(path, EXECUTOR('* project knowledge: `.vibeflow/index.md`, `.vibeflow/patterns/money.md`'));
    const atWorktree = runScript('check-briefing.mjs', [path, '--root', fx.wt], envFor(fx));
    assert.equal(atWorktree.status, 2, atWorktree.out);
    assert.ok(parseMissing(knowledgeLine(atWorktree.stdout)), atWorktree.out);
    const atMain = runScript('check-briefing.mjs', [path, '--root', fx.main], envFor(fx));
    assert.doesNotMatch(atMain.stdout, /^\[stop\]/m, atMain.out);

    // A briefing in a subfolder of the worktree: the git top is the root.
    const deep = writeBriefing(join(fx.wt, 'src'), EXECUTOR('* project knowledge: `.vibeflow/index.md`'));
    assert.ok(parseMissing(knowledgeLine(runScript('check-briefing.mjs', [deep], envFor(fx)).stdout)));

    // Outside git, the folder that holds the .vibeflow/ the briefing is part of.
    const project = join(dest, 'project');
    mkdirSync(join(project, '.vibeflow/patterns'), { recursive: true });
    writeFileSync(join(project, '.vibeflow/index.md'), '# Project\n');
    writeFileSync(join(project, '.vibeflow/patterns/money.md'), '# Money\n');
    const inside = writeBriefing(project, EXECUTOR('* project knowledge: `.vibeflow/index.md`, `.vibeflow/patterns/money.md`'));
    const result = runScript('check-briefing.mjs', [inside], envFor(fx));
    assert.doesNotMatch(result.stdout, /^\[stop\]/m, result.out);
    const missing = writeBriefing(project, EXECUTOR('* project knowledge: `.vibeflow/index.md`, `.vibeflow/conventions.md`'));
    assert.match(runScript('check-briefing.mjs', [missing], envFor(fx)).stdout, /does not exist: \.vibeflow\/conventions\.md$/m);
  });
});

test('check-briefing --root takes a value', () => {
  const result = runScript('check-briefing.mjs', ['x.md', '--root'], hermeticEnv(tmpdir()));
  assert.equal(result.status, 64, result.out);
});

// --- I3: review-package and perimeter leave the base outside git out ---

function packageOf(fx, dest) {
  const out = join(dest, 'package.md');
  const result = runScript('review-package.mjs', [fx.wt, fx.base, out], envFor(fx));
  return { ...result, text: existsSync(out) ? readFileSync(out, 'utf8') : '' };
}

test('with the base copied and not ignored, the package of a one-file change carries that file and no path of the base', () => {
  for (const mode of MODES) {
    withFixture({ mode, stage: 'change' }, (fx, dest) => {
      copyBaseByHand(fx);
      const result = packageOf(fx, dest);
      assert.equal(result.status, 0, `${mode}: ${result.out}`);
      assert.match(result.text, /^diff --git a\/src\/cart\.js b\/src\/cart\.js$/m, mode);
      assert.match(result.text, /^\+export function cartTotal\(items\) \{$/m, mode);
      // The spec names the pattern docs in Applicable Patterns, so the paths are matched where
      // the package lists a file: the status, the file lists, a diff header, a new-file heading.
      const base = String.raw`\.vibeflow/(index\.md|conventions\.md|decisions\.md|patterns/)`;
      for (const listed of [`^\\?\\? ${base}`, `^- ${base}`, `^${base}.* \\| `, `^diff --git a/${base}`, `^## New file: ${base}`, `^\\+\\+\\+ b/${base}`]) {
        assert.doesNotMatch(result.text, new RegExp(listed, 'm'), `${mode}: ${listed}\n${result.text.slice(0, 1500)}`);
      }
      // Nor the text of any document of the base.
      for (const text of ['Suggested budget', '# Conventions', '# Decisions', '# Pattern: Errors', '# Pattern: Money']) {
        assert.ok(!result.text.includes(text), `${mode}: ${text} is in the package`);
      }
      const lines = result.text.split('\n');
      if (mode === 'untracked') {
        assert.ok(lines.includes(LEFT_OUT), `${mode}: the count line\n${result.text.slice(0, 800)}`);
        // At the top, next to the artifact line.
        assert.match(lines[lines.indexOf(LEFT_OUT) - 2], /^Loop artifacts left out: /, result.text.slice(0, 800));
        // The spec is still context.
        assert.match(result.text, /^## New file: \.vibeflow\/specs\/cart-total\.md$/m);
        assert.match(result.stdout, /\b1 new file\(s\)/, result.stdout);
      } else {
        assert.doesNotMatch(result.text, /Knowledge base left out/, mode);
      }
    });
  }
});

test('with only the base copied and the spec new, the package is empty and counts no path of the base', () => {
  withFixture({}, (fx, dest) => {
    copyBaseByHand(fx);
    const result = packageOf(fx, dest);
    assert.equal(result.status, 1, result.out);
    assert.match(result.text, /^EMPTY PACKAGE: .*\b1 path\(s\) under \.vibeflow\//m, result.text);
    assert.ok(result.text.split('\n').includes(LEFT_OUT), result.text);
  });
});

test('perimeter leaves the copied base out of the changed set and counts it before the count line', () => {
  for (const mode of MODES) {
    withFixture({ mode, stage: 'change' }, (fx) => {
      copyBaseByHand(fx);
      const result = runScript('perimeter.mjs', [fx.wt, fx.base, 'src/**', '.vibeflow/specs/**'], envFor(fx));
      assert.equal(result.status, 0, `${mode}: ${result.out}`);
      const lines = result.stdout.trim().split('\n');
      if (mode === 'untracked') {
        assert.deepEqual(lines, [LEFT_OUT, `2 file(s) changed since ${fx.base}; 0 outside the perimeter`], result.out);
      } else {
        assert.deepEqual(lines, [`1 file(s) changed since ${fx.base}; 0 outside the perimeter`], result.out);
      }
      const code = runScript('perimeter.mjs', [fx.wt, fx.base, 'src/**'], envFor(fx));
      assert.doesNotMatch(code.stdout, /^outside \.vibeflow\/(index|conventions|decisions|patterns)/m, code.out);
    });
  }
});

test('a tracked base that changed is still a change, in the package and in the perimeter', () => {
  withFixture({ stage: 'change' }, (fx, dest) => {
    copyBaseByHand(fx);
    git(fx, fx.wt, ['add', '.vibeflow/index.md', '.vibeflow/conventions.md', '.vibeflow/decisions.md', '.vibeflow/patterns']);
    git(fx, fx.wt, ['commit', '-q', '-m', 'track the knowledge base']);
    const base = git(fx, fx.wt, ['rev-parse', 'HEAD']).trim();
    writeFileSync(join(fx.wt, '.vibeflow/conventions.md'), `${readFileSync(join(fx.wt, '.vibeflow/conventions.md'), 'utf8')}- A new convention.\n`);
    writeFileSync(join(fx.wt, '.vibeflow/patterns/new.md'), '# Pattern: New\n');

    const out = join(dest, 'tracked.md');
    const result = runScript('review-package.mjs', [fx.wt, base, out], envFor(fx));
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.match(text, /^diff --git a\/\.vibeflow\/conventions\.md b\/\.vibeflow\/conventions\.md$/m, text.slice(0, 1500));
    assert.match(text, /^\+- A new convention\.$/m);
    // The new, untracked pattern doc is still the base outside git.
    assert.ok(!text.includes('.vibeflow/patterns/new.md'), text.slice(0, 1500));
    assert.ok(text.includes('Knowledge base left out: 1 untracked path(s) under .vibeflow/'), text.slice(0, 800));

    const perimeter = runScript('perimeter.mjs', [fx.wt, base, 'src/**', '.vibeflow/specs/**'], envFor(fx));
    assert.equal(perimeter.status, 1, perimeter.out);
    assert.match(perimeter.stdout, /^outside \.vibeflow\/conventions\.md$/m);
    assert.doesNotMatch(perimeter.stdout, /patterns\/new\.md/);
  });
});

// --- usage and the copies of the shared blocks ---

test('the usage of each changed script describes the knowledge base, within 100 characters a line', () => {
  const expected = {
    'preflight.mjs': /knowledge base/,
    'check-briefing.mjs': /--root/,
    'review-package.mjs': /knowledge base/i,
    'perimeter.mjs': /knowledge base/i,
  };
  for (const [name, pattern] of Object.entries(expected)) {
    const usage = runScript(name, ['--help'], hermeticEnv(tmpdir())).stdout;
    assert.match(usage.replace(/\s+/g, ' '), pattern, name);
    assert.match(usage.replace(/\s+/g, ' '), /index\.md/, name);
    for (const line of usage.split('\n')) assert.ok(line.length <= 100, `${name}: a usage line of ${line.length} characters: ${line}`);
  }
});

test('preflight and check-briefing carry the same knowledge base block; review-package and perimeter the same path test', () => {
  const block = (name, marker) => {
    const source = readFileSync(join(SCRIPTS_DIR, name), 'utf8');
    return source.match(new RegExp(`^// ${marker}: start[\\s\\S]*?^// ${marker}: end$`, 'm'))?.[0];
  };
  const state = block('preflight.mjs', 'knowledge base state');
  assert.ok(state, 'preflight.mjs has the knowledge base state block');
  assert.equal(block('check-briefing.mjs', 'knowledge base state'), state);
  const paths = block('review-package.mjs', 'knowledge base paths');
  assert.ok(paths, 'review-package.mjs has the knowledge base paths block');
  assert.equal(block('perimeter.mjs', 'knowledge base paths'), paths);
});
