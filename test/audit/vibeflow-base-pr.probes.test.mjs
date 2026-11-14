// Audit probes for vibeflow-base, pull request review, fix round 2 (C1 to C4 of the second Codex pass).
// Behavior only, held by content, over the missing-base fixture. Each probe answers in the
// reaudit report (.vibeflow/audits/vibeflow-base-pr-reaudit-2.md) which contract it holds, which
// regression breaks it and why the executor's tests do not catch it. A case marked `todo` asserts
// what a known open gap asks for: it runs and prints without failing the suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { hermeticEnv, runScript } from '../loop-helpers.mjs';
import { BASE_FILES, GIT_IDENTITY, makeMissingBase } from '../fixtures/missing-base/make.mjs';

function withFixture(options, run) {
  const dest = mkdtempSync(join(tmpdir(), 'vibeflow-base-pr-probe-'));
  try {
    return run(makeMissingBase(join(dest, 'fx'), options), dest);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

const envFor = (fx) => hermeticEnv(fx.home, { HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', NO_PROXY: '' });

function git(fx, cwd, args) {
  const result = spawnSync('git', args, { cwd, env: { ...envFor(fx), ...GIT_IDENTITY }, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

const knowledgeLine = (out) => out.split('\n').find((line) => line.includes('knowledge base:'));

const EXECUTOR = (knowledge) => `# cart-total · 1 · executor

## Asked
The cart total.

## Done when
* DoD 1: cartTotal returns the formatted sum

## Read first
* project knowledge: \`.vibeflow/index.md\`
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

function briefing(fx, knowledge) {
  const path = join(fx.main, '.vibeflow/briefings/cart-total-1-executor.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, EXECUTOR(knowledge));
  return runScript('check-briefing.mjs', [path], envFor(fx));
}

const stopsOn = (result, path) => result.stdout.split('\n').includes(`[stop] knowledge file the briefing points at does not exist: ${path}`);

// --- C4: under .vibeflow/patterns/ only a name ending in ".md" is the base ---

// A file under patterns/ whose name has "md" in it without being a Markdown document.
const NOT_MARKDOWN = [
  '.vibeflow/patterns/run.cmd',
  '.vibeflow/patterns/notes.md.js',
  '.vibeflow/patterns/page.mdx',
  '.vibeflow/patterns/examples/format.ts',
];

test('probe C4: a file under patterns/ whose name only contains "md" is a change, in the package and in the perimeter; a deep .md stays out', () => {
  withFixture({ stage: 'change' }, (fx, dest) => {
    for (const path of BASE_FILES) cpSync(join(fx.main, path), join(fx.wt, path));
    for (const path of NOT_MARKDOWN) write(fx.wt, path, `export const marker = ${JSON.stringify(path)};\n`);
    write(fx.wt, '.vibeflow/patterns/deep/a/b.md', '# Deep pattern\n');

    const perimeter = runScript('perimeter.mjs', [fx.wt, fx.base, 'src/**', '.vibeflow/specs/**'], envFor(fx));
    assert.equal(perimeter.status, 1, perimeter.out);
    const lines = perimeter.stdout.trim().split('\n');
    for (const path of NOT_MARKDOWN) assert.ok(lines.includes(`outside ${path}`), `perimeter hides ${path}:\n${perimeter.out}`);
    assert.ok(!perimeter.stdout.includes('deep/a/b.md'), perimeter.out);
    assert.match(perimeter.stdout, /^Knowledge base left out: 6 untracked path\(s\)/m, perimeter.out);

    const out = join(dest, 'package.md');
    const pkg = runScript('review-package.mjs', [fx.wt, fx.base, out], envFor(fx));
    assert.equal(pkg.status, 0, pkg.out);
    const text = readFileSync(out, 'utf8');
    for (const path of NOT_MARKDOWN) {
      assert.ok(text.includes(`## New file: ${path}\n`), `package hides ${path}`);
      assert.ok(text.includes(`export const marker = ${JSON.stringify(path)};`), `package hides the content of ${path}`);
    }
    assert.ok(!text.includes('## New file: .vibeflow/patterns/deep/a/b.md'), 'the deep pattern doc is the base');
    assert.match(text, /^Knowledge base left out: 6 untracked path\(s\)/m);
  });
});

// --- C2: the main checkout of a submodule's worktree is the submodule checkout ---

function submoduleWorktree(fx, dest, { superBase, subBase }) {
  const parent = join(dest, 'parent');
  mkdirSync(parent);
  git(fx, parent, ['init', '-q', '-b', 'main']);
  write(parent, 'README.md', '# Parent\n');
  git(fx, parent, ['add', 'README.md']);
  git(fx, parent, ['commit', '-q', '-m', 'parent']);
  git(fx, parent, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', fx.plain, 'lib']);
  git(fx, parent, ['commit', '-q', '-m', 'add the submodule']);
  const lib = join(parent, 'lib');
  if (superBase) for (const path of BASE_FILES) cpSync(join(fx.main, path), join(parent, path));
  if (subBase) for (const path of BASE_FILES) cpSync(join(fx.main, path), join(lib, path));
  const wt = join(dest, 'lib wt');
  git(fx, lib, ['worktree', 'add', '-q', '-b', 'sub-feature', wt]);
  return { parent, lib, wt };
}

test('probe C2: in a submodule\'s worktree the main checkout is the submodule, never the superproject or the git folder', () => {
  withFixture({}, (fx, dest) => {
    // The superproject has a base and the submodule does not: none, not a copy from the superproject.
    const { wt } = submoduleWorktree(fx, dest, { superBase: true, subBase: false });
    const pre = runScript('preflight.mjs', ['--repo', wt, '--no-network'], envFor(fx));
    assert.match(knowledgeLine(pre.stdout) ?? '', /^\[attention\] knowledge base: none/, pre.out);
    assert.ok(!pre.stdout.includes('cp -RL'), pre.out);
  });
  withFixture({}, (fx, dest) => {
    // The submodule has a base: missing, with the copy from the submodule checkout, and the copy brings it.
    const { lib, wt } = submoduleWorktree(fx, dest, { superBase: true, subBase: true });
    const pre = runScript('preflight.mjs', ['--repo', wt, '--no-network'], envFor(fx));
    const line = knowledgeLine(pre.stdout) ?? '';
    assert.ok(line.startsWith('[stop] knowledge base: missing in this worktree; the main checkout has it in '), pre.out);
    assert.ok(!line.includes('/.git/modules/'), `the git folder is not a checkout: ${line}`);
    const command = line.slice(line.indexOf('Copy it before any round: ') + 'Copy it before any round: '.length);
    const copy = spawnSync('sh', ['-c', command], { cwd: wt, env: envFor(fx), encoding: 'utf8' });
    assert.equal(copy.status, 0, copy.stderr);
    for (const path of BASE_FILES) assert.equal(readFileSync(join(wt, path), 'utf8'), readFileSync(join(lib, path), 'utf8'), path);
    assert.match(knowledgeLine(runScript('preflight.mjs', ['--repo', wt, '--no-network'], envFor(fx)).stdout) ?? '', /^\[ok\] knowledge base/);
  });
});

// --- C1: the reader of knowledge paths, against the forms the base (aad2dba) already stopped on ---

// A missing pattern doc written the way a briefing cites evidence: with a line, an anchor, in bold,
// in a table cell. Each one stopped before the fix; after it, each exits 0.
const CITED_FORMS = [
  ['a line in a code span', '* pattern: `.vibeflow/patterns/missing.md:12`'],
  ['a line in prose', '* pattern: .vibeflow/patterns/missing.md:12'],
  ['an anchor', '* pattern: .vibeflow/patterns/missing.md#totals'],
  ['bold', '* pattern: **.vibeflow/patterns/missing.md**'],
  ['a table cell without spaces', '| pattern |.vibeflow/patterns/missing.md|'],
];

test('probe C1: a missing pattern doc cited with a line, an anchor, in bold or in a table cell still stops', () => {
  withFixture({}, (fx) => {
    for (const [label, knowledge] of CITED_FORMS) {
      const result = briefing(fx, knowledge);
      assert.equal(result.status, 2, `${label}: ${result.out}`);
      assert.ok(stopsOn(result, '.vibeflow/patterns/missing.md'), `${label}: ${result.out}`);
    }
  });
});

test('probe C1: a code span that lists two existing knowledge files does not stop', () => {
  withFixture({}, (fx) => {
    for (const knowledge of [
      '* patterns: `.vibeflow/patterns/money.md, .vibeflow/conventions.md`',
      '* patterns: `.vibeflow/patterns/money.md and .vibeflow/patterns/errors.md`',
    ]) {
      const result = briefing(fx, knowledge);
      assert.doesNotMatch(result.stdout, /^\[stop\] knowledge file/m, `${knowledge}: ${result.out}`);
    }
  });
});

// The forms the fix reads right and the executor's test does not exercise: a Markdown link, double
// quotes and angle brackets around a missing path stop on the path alone.
test('probe C1: a missing pattern doc in a Markdown link, in double quotes or in angle brackets stops on the path alone', () => {
  withFixture({}, (fx) => {
    for (const knowledge of [
      '* pattern: [money](.vibeflow/patterns/missing.md)',
      '* pattern: ".vibeflow/patterns/missing.md"',
      '* pattern: <.vibeflow/patterns/missing.md>',
    ]) {
      const result = briefing(fx, knowledge);
      assert.equal(result.status, 2, `${knowledge}: ${result.out}`);
      assert.ok(stopsOn(result, '.vibeflow/patterns/missing.md'), `${knowledge}: ${result.out}`);
    }
  });
});
