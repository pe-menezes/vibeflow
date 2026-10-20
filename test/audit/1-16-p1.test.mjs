// Re-audit 1 probes for vibeflow 1.16, part 1 (the loop kit): the fix round 3e117be.
// Behavior only, pinned by content. Each case's three pruning answers (contract, regression that
// breaks it, why the executor's tests miss it) are in
// .vibeflow/audits/vibeflow-1-16-p1-reaudit-1.md under "Probes".
// Cases marked `todo` assert the behavior a low finding asks for: they run and print, and they
// do not fail the run while the finding is open.
// Run: node --test test/audit/1-16-p1.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SCRIPTS_DIR, hermeticEnv, runScript, withSandbox } from '../loop-helpers.mjs';

function scratch(run) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-reaudit-p1-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function scratchAsync(run) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-reaudit-p1-'));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Runs a script in the background, plays `steps` (delay in ms, action) while it waits, and
// resolves with the exit code, the output and the file's text at the exit. No clock is compared.
function watchWhile(script, args, env, { file, steps = [] }) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(SCRIPTS_DIR, script), ...args], { env });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    const timers = steps.map(([delay, action]) => setTimeout(action, delay));
    const guard = setTimeout(() => child.kill(), 20_000);
    child.on('exit', (code) => {
      const atExit = file && existsSync(file) ? readFileSync(file, 'utf8') : null;
      for (const timer of [...timers, guard]) clearTimeout(timer);
      done({ code, out, atExit });
    });
  });
}

const write = (dir, name, text) => {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
};

// --- watch-round (F1) ---

test('reaudit R1: a progress file with two earlier markers (round 0 and fix 1) ends the fix 2 watch only on the fix 2 marker', async () => {
  await scratchAsync(async (dir) => {
    const file = write(dir, 'feature-p1.md', [
      '# feature · part 1 · progress', '## Milestone 1', '* done', '', 'State: final', '',
      '## Fix 1', '* fixed F1', '', 'State: final · fix 1', '',
    ].join('\n'));
    const first = runScript('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0'], hermeticEnv(dir));
    assert.equal(first.status, 3, `an earlier round's marker ended the watch: ${first.out}`);

    const fix = await watchWhile('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0.5', '--interval-sec', '0.05'], hermeticEnv(dir), {
      file,
      steps: [
        [300, () => appendFileSync(file, '\n## Fix 2\n* reading the re-audit report\n')],
        [900, () => appendFileSync(file, '* fixed F2\n\nState: final · fix 2\n')],
      ],
    });
    assert.equal(fix.code, 0, fix.out);
    assert.ok(fix.atExit.includes('State: final · fix 2'), `exited before the fix 2 marker: ${fix.out}`);
  });
});

test('reaudit R2 (todo, low N2): a file emptied and written back with the same text during the watch does not read as a new marker', { todo: 'N2: the baseline drops on a read of a half-written file' }, async () => {
  await scratchAsync(async (dir) => {
    const original = '# feature · part 1 · progress\n## Milestone 1\n* done\n\nState: final\n';
    const file = write(dir, 'feature-p1.md', original);
    // A non-atomic rewrite seen mid-way (truncated), then the same text back: no round wrote a marker.
    const result = await watchWhile('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0.03', '--interval-sec', '0.05'], hermeticEnv(dir), {
      file,
      steps: [
        [300, () => writeFileSync(file, '')],
        [700, () => writeFileSync(file, original)],
      ],
    });
    assert.equal(result.code, 3, `exited 0 on the marker round 0 left: ${result.out}`);
  });
});

// --- check-briefing --pair (F3) ---

const EXECUTOR = `# feature · part 1 · executor

## Asked
Port the rules.

## Done when
* DoD 1: the rules load from the file
* DoD 2: a malformed file is refused

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

const auditorWith = (body) => `# feature · part 1 · auditor

${body}

## Review package
* \`.vibeflow/reviews/feature-p1-round-1.md\`

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

test('reaudit R3: a "Criteria" section opened at ### runs through its #### sub-headings and ends at the next ###', () => {
  scratch((dir) => {
    const executor = write(dir, 'feature-p1-executor.md', EXECUTOR);
    const auditor = write(dir, 'feature-p1-auditor.md', auditorWith([
      '## What to audit', 'The rules port.', '',
      '### Criteria', '* DoD 1: the rules load from the file', '',
      '#### From the risks', '* DoD 3: the cache expires at midnight', '',
      '### Read first', '* `.vibeflow/index.md`', '* the spec of the cache',
    ].join('\n')));
    const result = runScript('check-briefing.mjs', [auditor, '--pair', executor], hermeticEnv(dir));
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /not in the executor's "Done when": DoD 3: the cache expires at midnight/);
    assert.doesNotMatch(result.stdout, /not in the executor's "Done when": .*spec of the cache/);
    assert.doesNotMatch(result.stdout, /not in the executor's "Done when": DoD 1/);
  });
});

test('reaudit R4 (todo, low N1): prose under a sub-heading of "Criteria" is not glued to the criterion above it', { todo: 'N1: a heading does not end the open item' }, () => {
  scratch((dir) => {
    const executor = write(dir, 'feature-p1-executor.md', EXECUTOR);
    const auditor = write(dir, 'feature-p1-auditor.md', auditorWith([
      '## What to audit', 'The rules port.', '',
      '## Criteria', '* DoD 1: the rules load from the file', '',
      '### From the risks', 'These two come from the spec\'s risk list.', '* DoD 2: a malformed file is refused', '',
      '## Read first', '* `.vibeflow/index.md`',
    ].join('\n')));
    const result = runScript('check-briefing.mjs', [auditor, '--pair', executor], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    assert.match(result.stdout, /all 2 auditor criteria/);
  });
});

// --- review-package (L5) ---

test('reaudit R5: a review package names the file it left out under diff.srcPrefix and diff.dstPrefix', () => {
  withSandbox((box) => {
    box.git('config', 'diff.srcPrefix', 'old/');
    box.git('config', 'diff.dstPrefix', 'new/');
    box.write('src/rules.ts', 'export const x = 6\n');
    box.write('src/big.ts', 'const filler = 1\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'track big');
    box.write('src/big.ts', `${'const filler = 2\n'.repeat(400)}`);
    const out = join(box.root, 'capped.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out, '--max-bytes', '2000'], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.match(text, /^- src\/big\.ts \(\d+ bytes\)$/m, text.slice(0, 600));
    assert.doesNotMatch(text, /^- \? \(/m);
  });
});
