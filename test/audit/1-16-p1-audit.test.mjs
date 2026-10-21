// Audit probes for vibeflow 1.16, part 1 (the loop kit). Behavior only, pinned by content.
// Each probe's three pruning answers (contract, regression that breaks it, why the executor's
// tests miss it) are in .vibeflow/audits/vibeflow-1-16-p1-audit.md under "Probes".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SCRIPTS_DIR, hermeticEnv, runScript, withSandbox } from '../loop-helpers.mjs';

function scratch(run) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-audit-p1-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function scratchAsync(run) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-audit-p1-'));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const outsideLines = (stdout) => stdout.split('\n').filter((line) => line.startsWith('outside ')).sort();

// --- perimeter.mjs (risk code: glob matching) ---

test('probe A1: perimeter "**/" matches zero folders and several folders', () => {
  withSandbox((box) => {
    box.write('src/x.ts', 'zero folders\n');
    box.write('src/a/b/x.ts', 'two folders\n');
    box.write('src/a/b/y.ts', 'not x.ts\n');
    box.write('docs/deep/er/guide.md', 'three folders\n');
    box.write('README.md', 'top level\n');
    const result = runScript('perimeter.mjs', [box.repo, box.base, 'src/**/x.ts', '**/*.md'], box.env());
    assert.equal(result.status, 1, result.out);
    assert.deepEqual(outsideLines(result.stdout), ['outside src/a/b/y.ts']);
  });
});

test('probe A2: perimeter globs are anchored at both ends, "?" stays in one folder, a trailing "/" covers below', () => {
  withSandbox((box) => {
    box.write('src/rules.tsx', 'not a .ts file\n');
    box.write('README.md.bak', 'not README.md\n');
    box.write('a/b', '"?" must not cross a folder\n');
    box.write('axb', 'one character\n');
    box.write('notes/new/x.txt', 'below notes/\n');
    const result = runScript('perimeter.mjs', [box.repo, box.base, 'src/*.ts', 'README.md', 'a?b', 'notes/'], box.env());
    assert.equal(result.status, 1, result.out);
    assert.deepEqual(outsideLines(result.stdout), ['outside README.md.bak', 'outside a/b', 'outside src/rules.tsx']);
  });
});

test('probe A3: perimeter given a subfolder reads paths from the repository top level', () => {
  withSandbox((box) => {
    box.write('src/new.ts', 'inside\n');
    box.write('tests/new.test.ts', 'outside\n');
    const result = runScript('perimeter.mjs', [join(box.repo, 'src'), box.base, 'src/**'], box.env());
    assert.equal(result.status, 1, result.out);
    assert.deepEqual(outsideLines(result.stdout), ['outside tests/new.test.ts']);
  });
});

// --- review-package.mjs (risk code: what enters the package, the empty case) ---

test('probe B1: a round with only new, uncommitted files is a package, not an empty one', () => {
  withSandbox((box) => {
    box.write('src/new.ts', 'export const fresh = 1\n');
    const out = join(box.root, 'reviews', 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.doesNotMatch(text, /EMPTY PACKAGE/);
    assert.match(text, /^## New file: src\/new\.ts$/m);
    assert.match(text, /^\+export const fresh = 1$/m);
  });
});

test('probe B2: a new file that shares the package\'s name stays in the package', () => {
  withSandbox((box) => {
    box.write('notes/package.md', 'a note of the round\n');
    const out = join(box.root, 'reviews', 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    assert.match(readFileSync(out, 'utf8'), /^## New file: notes\/package\.md$/m);
  });
});

test('probe B3: the previous copy of a package written inside the worktree does not make an empty round look full', () => {
  withSandbox((box) => {
    const out = join(box.repo, 'review.md');
    assert.equal(runScript('review-package.mjs', [box.repo, box.base, out], box.env()).status, 1);
    const second = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(second.status, 1, second.out);
    assert.match(readFileSync(out, 'utf8'), /EMPTY PACKAGE/);
  });
});

// --- check-briefing.mjs --pair (risk code: criterion matching) ---

const executorBriefing = ({ asked = 'Port the rules.', done = '* DoD 1: the rules load from the file' } = {}) => `# feature · part 1 · executor

## Asked
${asked}

## Done when
${done}

## Read first
* project knowledge: \`.vibeflow/index.md\`

## Facts
* the suite passes 13 of 13 (measured 08:13 by \`node --test\`)

## Perimeter
* may change: \`src/**\`

## Verification contract
* red before green

## Ceiling
* 400k tokens

## Progress and delivery
* progress file
`;

const auditorBriefing = (criteria) => `# feature · part 1 · auditor

## What to audit
The rules port.

## Criteria
${criteria}

## Read first
* \`.vibeflow/index.md\`

## Review package
* \`.vibeflow/reviews/feature-p1-round-0.md\`

## Facts
* base is 4228175 (measured 08:15 by \`git rev-parse\`)

## Risk and sabotage
* none

## Probes
* behavior only

## Ceiling
* partial report

## Delivery
* report
`;

function pair(dir, executorText, auditorText) {
  const executor = join(dir, 'feature-p1-executor.md');
  const auditor = join(dir, 'feature-p1-auditor.md');
  writeFileSync(executor, executorText);
  writeFileSync(auditor, auditorText);
  return runScript('check-briefing.mjs', [auditor, '--pair', executor], hermeticEnv(dir));
}

test('probe C1: --pair counts a criterion only when it is in "Done when", not elsewhere in the executor briefing', () => {
  scratch((dir) => {
    const both = pair(dir, executorBriefing({ done: '* DoD 1: the rules load from the file\n* DoD 2: a malformed file is refused' }),
      auditorBriefing('* DoD 1: the rules load from the file\n* DoD 2: a malformed file is refused'));
    assert.equal(both.status, 0, both.out);

    const elsewhere = pair(dir, executorBriefing({ asked: 'Port the rules. DoD 2: a malformed file is refused' }),
      auditorBriefing('* DoD 1: the rules load from the file\n* DoD 2: a malformed file is refused'));
    assert.equal(elsewhere.status, 1, elsewhere.out);
    assert.match(elsewhere.stdout, /not in the executor's "Done when": DoD 2: a malformed file is refused/);
  });
});

test('probe C2: --pair against an executor briefing with an empty "Done when" is not ok', () => {
  scratch((dir) => {
    const result = pair(dir, executorBriefing({ done: '' }), auditorBriefing('* DoD 1: the rules load from the file'));
    assert.equal(result.status, 1, result.out);
    assert.doesNotMatch(result.stdout, /^\[ok\]/m);
  });
});

test('probe C3: --pair compares the criteria grouped under a sub-heading of "Criteria"', () => {
  scratch((dir) => {
    const result = pair(dir, executorBriefing(),
      auditorBriefing('* DoD 1: the rules load from the file\n\n### From the risks\n* DoD 2: a malformed file is refused'));
    assert.equal(result.status, 1, result.out);
    assert.doesNotMatch(result.stdout, /^\[ok\] all \d+ auditor criteria/m);
    assert.match(result.stdout, /not in the executor's "Done when": DoD 2: a malformed file is refused/);
  });
});

// --- watch-round.mjs (risk code: time limits and the final marker) ---

function aged(path, minutes) {
  const when = new Date(Date.now() - minutes * 60_000);
  utimesSync(path, when, when);
}

test('probe D1: a progress file that does not exist yet is not silent before --stale-min', () => {
  scratch((dir) => {
    const result = runScript('watch-round.mjs', ['--file', join(dir, 'not-yet.md'), '--stale-min', '60', '--timeout-min', '0'], hermeticEnv(dir));
    assert.equal(result.status, 3, result.out);
  });
});

test('probe D2: --timeout-min is minutes: a round that ends after a second is seen ending under a half-minute ceiling', async () => {
  await scratchAsync(async (dir) => {
    const file = join(dir, 'report.md');
    writeFileSync(file, '# Audit\nStage: 1/3 reading\n');
    const child = spawn(process.execPath, [join(SCRIPTS_DIR, 'watch-round.mjs'), '--file', file, '--stale-min', '60', '--timeout-min', '0.5', '--interval-sec', '0.1'], {
      env: hermeticEnv(dir),
    });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    const exit = new Promise((done) => child.on('exit', (code) => done(code)));
    const timer = setTimeout(() => appendFileSync(file, 'Stage: final\n'), 1500);
    const code = await exit;
    clearTimeout(timer);
    assert.equal(code, 0, out);
  });
});

test('probe D3: a watch started on a file last written before the round counts silence from the start of the watch', () => {
  scratch((dir) => {
    // A retried audit: the dead attempt left its partial report two hours ago.
    const file = join(dir, 'feature-p1-audit.md');
    writeFileSync(file, '# Audit\nStage: 3/6 sabotage\nVerdict: pending\n');
    aged(file, 120);
    const result = runScript('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0'], hermeticEnv(dir));
    assert.equal(result.status, 3, `silent at the first read of a round that just started: ${result.out}`);
  });
});
