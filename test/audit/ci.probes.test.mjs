// Behavior probes from independent audits of the CI workflow: the test command
// in .github/workflows/validate-distributions.yml, expanded by the shell from the
// repository root. Each case states, as comments, the contract it protects, the
// plausible regression that breaks it, and why the implementer's tests did not
// catch it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

function ciTestCommand() {
  const workflow = read('.github/workflows/validate-distributions.yml');
  const line = workflow.split('\n').map((l) => l.trim()).find((l) => /^run:\s*node --test\b/.test(l));
  assert.ok(line, 'the CI workflow has a `run: node --test ...` step');
  return line.replace(/^run:\s*/, '');
}

function ciSelectedFiles() {
  const globs = ciTestCommand().replace(/^node --test\s+/, '');
  // The same expansion the CI's shell does, from the repository root.
  const result = spawnSync('sh', ['-c', `for f in ${globs}; do [ -f "$f" ] && printf '%s\\n' "$f"; done`], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return new Set(result.stdout.split('\n').filter(Boolean));
}

function testFilesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...testFilesUnder(path));
    else if (/\.test\.mjs$/.test(entry.name)) out.push(path);
  }
  return out;
}

const callsItselfProbes = (path) => /\bprobes\b/i.test(read(path).split('\n')[0]);

// Contract: a test file the repository carries under test/ is a test file the CI runs, the audit probes included.
// Breaks when: the CI goes back to `node --test test/*.test.mjs`, which selects no file under test/audit/, or a probe lands in a subfolder the globs do not reach.
// Not covered by: no other test reads the CI workflow.
test('CI: the test command runs every test file under test/, the audit probes included', () => {
  const selected = ciSelectedFiles();
  const all = testFilesUnder('test');
  const missed = all.filter((path) => !selected.has(path));
  assert.deepEqual(missed, [], `test files the CI command (${ciTestCommand()}) never runs`);
  assert.ok(all.some((path) => path.startsWith('test/audit/') && callsItselfProbes(path)), 'at least one audit probe file under test/audit/ is run');
});
