// Audit probes for vibeflow-import part 1: the external-import fixture's
// prepare.mjs, which writes into and runs git in a directory it is given.
// Behavior only: each probe pins what prepare.mjs does with the caller's
// environment and directory, not a sha, a line number or a date. Each case
// states, as comments, the contract it protects, the plausible regression
// that breaks it and why the implementer's tests missed it at the audit.
// Probes 1 (inherited GIT_*) and 2 (hidden-only directory) were pruned in
// part 4a: the implementer's tests in test/import-fixture.test.mjs adopted
// them, so they no longer answer why the implementer's tests miss a regression.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREPARE = join(ROOT, 'test/fixtures/external-import/prepare.mjs');

function cleanEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  return env;
}

function scratch(run) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-import-audit-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Contract: prepare.mjs never writes into the fixture it copies from.
// Breaks when (open today, low finding A5): a target inside source/ or app/ of
//   the fixture makes copyTree recurse into its own output until ENAMETOOLONG,
//   leaving a deep tree inside the fixture.
// Not covered by: the implementer's tests always prepare into os.tmpdir().
// Marked todo so the file stays green while the gap is open; drop `todo` once
// prepare.mjs refuses such a target.
test('prepare.mjs never writes into the fixture it copies from', { todo: 'audit finding A5 (low): a target inside the fixture recurses into its own output' }, () => {
  scratch((dir) => {
    const copy = join(dir, 'fixture');
    cpSync(dirname(PREPARE), copy, { recursive: true });
    const before = readdirSync(join(copy, 'source')).sort();
    const result = spawnSync(process.execPath, [join(copy, 'prepare.mjs'), join(copy, 'source', 'out')], {
      encoding: 'utf8',
      env: cleanEnv(),
    });
    assert.notEqual(result.status, 0, 'a target inside the fixture is refused');
    assert.deepEqual(readdirSync(join(copy, 'source')).sort(), before, 'the fixture source is left as it was');
  });
});
