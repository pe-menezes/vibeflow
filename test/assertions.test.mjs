import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertImplement } from './assertions.mjs';

function withSpec(body, run) {
  const fixture = mkdtempSync(join(tmpdir(), 'vibeflow-assertions-'));
  try {
    const specs = join(fixture, '.vibeflow', 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(join(specs, 'feature.md'), body);
    run(fixture);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test('anti-scope directory context does not prohibit every file below it', () => {
  withSpec(`
## Anti-scope
- No change to \`src/store.js\`, \`src/result.js\`, or \`src/validate.js\`.
- No barrel/index file in \`src/services/\`.
`, (fixture) => {
    const checks = assertImplement(fixture, {
      changedFiles: ['src/services/deleteTask.js', 'test/deleteTask.test.js'],
      budget: 4,
      testsPass: true,
    });

    const antiScope = checks.find((check) => check.name === 'no path-naming anti-scope item violated');
    assert.equal(antiScope.ok, true);
    assert.equal(antiScope.detail, '3 paths checked');
  });
});

test('anti-scope still catches a directly prohibited path', () => {
  withSpec(`
## Anti-scope
- Do not modify \`src/store.js\`.
`, (fixture) => {
    const checks = assertImplement(fixture, {
      changedFiles: ['src/store.js'],
      budget: 4,
      testsPass: true,
    });

    const antiScope = checks.find((check) => check.name === 'no path-naming anti-scope item violated');
    assert.equal(antiScope.ok, false);
    assert.equal(antiScope.detail, 'touched: src/store.js');
  });
});

test('anti-scope catches never and must-not path prohibitions', () => {
  withSpec(`
## Anti-scope
- Never modify \`src/store.js\`.
- The implementation must not delete \`src/result.js\`.
`, (fixture) => {
    const checks = assertImplement(fixture, {
      changedFiles: ['src/store.js', 'src/result.js'],
      budget: 4,
      testsPass: true,
    });

    const antiScope = checks.find((check) => check.name === 'no path-naming anti-scope item violated');
    assert.equal(antiScope.ok, false);
    assert.equal(antiScope.detail, 'touched: src/store.js, src/result.js');
  });
});

test('anti-scope catches direct action variants without treating directory context as direct', () => {
  withSpec(`
## Anti-scope
- Do not add \`src/index.js\`.
- Do not remove \`src/store.js\`.
- Never rename \`config.json\`.
- No edits to \`settings.json\`.
- Leave \`src/result.js\` unchanged.
- \`docs/api.md\` must not be changed.
- No barrel/index file in \`src/services/\`.
`, (fixture) => {
    const changedFiles = [
      'src/index.js',
      'src/store.js',
      'config.json',
      'settings.json',
      'src/result.js',
      'docs/api.md',
      'src/services/deleteTask.js',
    ];
    const checks = assertImplement(fixture, {
      changedFiles,
      budget: 10,
      testsPass: true,
    });

    const antiScope = checks.find((check) => check.name === 'no path-naming anti-scope item violated');
    assert.equal(antiScope.ok, false);
    assert.equal(
      antiScope.detail,
      'touched: src/index.js, src/store.js, config.json, settings.json, src/result.js, docs/api.md',
    );
  });
});
