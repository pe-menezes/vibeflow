// Audit probes for vibeflow-base part 1: the knowledge base in the loop kit's scripts.
// Behavior only, held by content, over the missing-base fixture. Each probe answers in the audit
// report (.vibeflow/audits/vibeflow-base-1-audit.md) which contract it holds, which regression
// breaks it and why the executor's tests do not catch it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { hermeticEnv, runScript } from '../loop-helpers.mjs';
import { BASE_FILES, GIT_IDENTITY, MODES, makeMissingBase } from '../fixtures/missing-base/make.mjs';

const LEFT_OUT = (n) => `Knowledge base left out: ${n} untracked path(s) under .vibeflow/ (index.md, conventions.md, decisions.md, patterns/); they are the project's knowledge, not a change.`;

function withFixture(options, run, name = 'fx') {
  const dest = mkdtempSync(join(tmpdir(), 'vibeflow-base-probe-'));
  try {
    return run(makeMissingBase(join(dest, name), options), dest);
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

function copyBaseByHand(fx) {
  for (const path of BASE_FILES) cpSync(join(fx.main, path), join(fx.wt, path));
}

function packageText(fx, dest, base = fx.base, name = 'package.md') {
  const out = join(dest, name);
  const result = runScript('review-package.mjs', [fx.wt, base, out], envFor(fx));
  return { ...result, text: existsSync(out) ? readFileSync(out, 'utf8') : '' };
}

// Paths that sit next to the knowledge base without being it: each one is work the auditor must see.
const NEIGHBORS = [
  '.vibeflow/patterns-x/near.md',
  '.vibeflow/patterns.md',
  '.vibeflow/index.md.bak',
  '.vibeflow/indexes.md',
  '.vibeflow/conventions.md.orig',
  '.vibeflow/tools/check.js',
  'docs/.vibeflow/index.md',
  'docs/.vibeflow/patterns/inner.md',
];

test('probe: only the four knowledge paths leave the package and the perimeter; a neighbor by prefix stays', () => {
  withFixture({ stage: 'change' }, (fx, dest) => {
    copyBaseByHand(fx);
    for (const path of NEIGHBORS) write(fx.wt, path, `# neighbor ${path}\n`);

    const perimeter = runScript('perimeter.mjs', [fx.wt, fx.base, 'src/**', '.vibeflow/specs/**'], envFor(fx));
    assert.equal(perimeter.status, 1, perimeter.out);
    const lines = perimeter.stdout.trim().split('\n');
    assert.equal(lines[0], LEFT_OUT(BASE_FILES.length), perimeter.out);
    for (const path of NEIGHBORS) assert.ok(lines.includes(`outside ${path}`), `perimeter hides ${path}:\n${perimeter.out}`);
    for (const path of BASE_FILES) assert.ok(!lines.includes(`outside ${path}`), `perimeter keeps ${path}:\n${perimeter.out}`);

    const pkg = packageText(fx, dest);
    assert.equal(pkg.status, 0, pkg.out);
    assert.ok(pkg.text.split('\n').includes(LEFT_OUT(BASE_FILES.length)), pkg.text.slice(0, 800));
    for (const path of NEIGHBORS) assert.ok(pkg.text.includes(`## New file: ${path}\n`), `package hides ${path}`);
    for (const path of BASE_FILES) assert.ok(!pkg.text.includes(`## New file: ${path}\n`), `package keeps ${path}`);
  });
});

test('probe: a tracked knowledge file that changed, was deleted or was untracked stays a change in both scripts', () => {
  withFixture({ stage: 'change' }, (fx, dest) => {
    copyBaseByHand(fx);
    git(fx, fx.wt, ['add', ...BASE_FILES]);
    git(fx, fx.wt, ['commit', '-q', '-m', 'track the knowledge base']);
    const base = git(fx, fx.wt, ['rev-parse', 'HEAD']).trim();
    writeFileSync(join(fx.wt, '.vibeflow/patterns/money.md'), '# Pattern: Money\n\nRewritten.\n');
    rmSync(join(fx.wt, '.vibeflow/patterns/errors.md'));
    git(fx, fx.wt, ['rm', '-q', '--cached', '.vibeflow/decisions.md']);

    const perimeter = runScript('perimeter.mjs', [fx.wt, base, 'src/**'], envFor(fx));
    assert.equal(perimeter.status, 1, perimeter.out);
    for (const path of ['.vibeflow/patterns/money.md', '.vibeflow/patterns/errors.md', '.vibeflow/decisions.md']) {
      assert.match(perimeter.stdout, new RegExp(`^outside ${path.replaceAll('.', '\\.')}$`, 'm'), perimeter.out);
    }

    const pkg = packageText(fx, dest, base);
    assert.equal(pkg.status, 0, pkg.out);
    assert.match(pkg.text, /^diff --git a\/\.vibeflow\/patterns\/money\.md b\/\.vibeflow\/patterns\/money\.md$/m);
    assert.match(pkg.text, /^\+Rewritten\.$/m);
    assert.match(pkg.text, /^diff --git a\/\.vibeflow\/patterns\/errors\.md b\/\.vibeflow\/patterns\/errors\.md$/m);
    assert.match(pkg.text, /^diff --git a\/\.vibeflow\/decisions\.md b\/\.vibeflow\/decisions\.md$/m);
  });
});

test('probe: with .vibeflow/ ignored, copying the base changes nothing in the package or the perimeter', () => {
  withFixture({ mode: 'ignored', stage: 'change' }, (fx, dest) => {
    const body = (text) => text.split('\n').slice(1).join('\n');
    const before = packageText(fx, dest, fx.base, 'before.md');
    const perimeterBefore = runScript('perimeter.mjs', [fx.wt, fx.base, 'src/**'], envFor(fx));
    copyBaseByHand(fx);
    const after = packageText(fx, dest, fx.base, 'after.md');
    const perimeterAfter = runScript('perimeter.mjs', [fx.wt, fx.base, 'src/**'], envFor(fx));
    assert.equal(after.status, before.status, after.out);
    assert.equal(body(after.text), body(before.text));
    assert.equal(perimeterAfter.status, 0, perimeterAfter.out);
    assert.equal(perimeterAfter.stdout, perimeterBefore.stdout);
  });
});

test('probe: the copy command survives a main checkout path with a double quote, $, a backtick and a backslash', () => {
  const dest = mkdtempSync(join(tmpdir(), 'vibeflow-base-probe-'));
  try {
    const marker = join(dest, 'ran');
    // A backtick or $(...) that a shell expands would create the marker file.
    const odd = `a "b" $HOME \`touch ${marker}\` $(touch ${marker}) c\\d café`;
    const fx = makeMissingBase(join(dest, odd), {});
    const pre = runScript('preflight.mjs', ['--repo', fx.wt, '--no-network'], envFor(fx));
    const line = pre.stdout.split('\n').find((l) => l.includes('knowledge base:'));
    const match = /^\[stop\] knowledge base: missing in this worktree; the main checkout has it in (.+)\/\.vibeflow\/\. Copy it before any round: (.+)$/.exec(line ?? '');
    assert.ok(match, pre.out);
    const run = spawnSync('sh', ['-c', match[2]], { cwd: fx.wt, env: envFor(fx), encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(existsSync(marker), false, 'the copy command ran a command substitution');
    for (const path of BASE_FILES) {
      assert.equal(readFileSync(join(fx.wt, path), 'utf8'), readFileSync(join(fx.main, path), 'utf8'), path);
    }
    const again = runScript('preflight.mjs', ['--repo', fx.wt, '--no-network'], envFor(fx));
    assert.match(again.stdout, /^\[ok\] knowledge base: \.vibeflow\/index\.md present, with conventions\.md and 2 pattern doc\(s\)$/m, again.out);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

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

function writeBriefing(dir, text) {
  const path = join(dir, '.vibeflow/briefings', 'cart-total-1-executor.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
}

test('probe: check-briefing does not quote a knowledge path that looks like a secret', () => {
  withFixture({}, (fx) => {
    const token = `gh${'p'}_${'A1b2C3d4E5f6G7h8I9j0K1l2'}`;
    const path = writeBriefing(fx.main, EXECUTOR(`* project knowledge: \`.vibeflow/index.md\`, \`.vibeflow/patterns/${token}.md\``));
    const result = runScript('check-briefing.mjs', [path], envFor(fx));
    assert.equal(result.status, 2, result.out);
    assert.match(result.stdout, /^\[stop\] knowledge file the briefing points at does not exist: \(not quoted: the path looks like a secret\)$/m, result.out);
    assert.ok(!result.out.includes(token.slice(4)), 'the token is in the output');
  });
});

test('probe: placeholders and globs under patterns/ are not knowledge paths, so a none-state template passes', () => {
  withFixture({}, (fx) => {
    const text = EXECUTOR('* project knowledge: none in this project (analyze has not run); later rounds read `.vibeflow/patterns/<name>.md` and `.vibeflow/patterns/*.md`; `.vibeflow/index.mdx` is not the index');
    const result = runScript('check-briefing.mjs', [writeBriefing(fx.plain, text)], envFor(fx));
    assert.doesNotMatch(result.stdout, /^\[stop\]/m, result.out);
    assert.match(result.stdout, /^\[attention\] knowledge base: none in this project; the briefing runs the round without it$/m, result.out);
  });
});

test('probe: preflight run from a subfolder gives the line of the checkout top, in the worktree and in the main checkout', () => {
  for (const mode of MODES) {
    withFixture({ mode }, (fx) => {
      const wt = runScript('preflight.mjs', ['--repo', fx.wt, '--no-network'], envFor(fx));
      assert.equal(wt.status, 2, `${mode}: ${wt.out}`);
      // Run from a subfolder of the worktree: the top decides, not the folder given.
      const sub = runScript('preflight.mjs', ['--repo', join(fx.wt, 'src'), '--no-network'], envFor(fx));
      const line = (out) => out.split('\n').find((l) => l.includes('knowledge base:'));
      assert.equal(line(sub.stdout), line(wt.stdout), `${mode}: ${sub.out}`);
      const main = runScript('preflight.mjs', ['--repo', join(fx.main, 'src'), '--no-network'], envFor(fx));
      assert.match(main.stdout, /^\[ok\] knowledge base: \.vibeflow\/index\.md present/m, `${mode}: ${main.out}`);
    });
  }
});
