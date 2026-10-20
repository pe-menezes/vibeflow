// Audit probes, vibeflow 1.16 part 5 (spec hardening). Behavior only: the
// smoke harness's DoD counter in test/assertions.mjs, the one piece of risk
// code this part touched. The three pruning answers for each probe are in
// .vibeflow/audits/vibeflow-1-16-p5-audit.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertGenSpec } from './assertions.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function dodCount(body) {
  const fixture = mkdtempSync(join(tmpdir(), 'vibeflow-audit-p5-'));
  try {
    const specs = join(fixture, '.vibeflow', 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(join(specs, 'feature.md'), body);
    return assertGenSpec(fixture).find((c) => c.name === 'DoD has 3–7 binary checks');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

// P1. The top level is measured from the block, not assumed at column 0: a
// DoD whose checks are themselves indented still counts its checks, and the
// fields nested under them still do not.
test('audit p5 · DoD counter: indented checks still count, their nested fields do not', () => {
  const dod = dodCount(`
## Definition of Done
  1. Deleting a task removes it — \`node --test test/deleteTask.test.js\` passes.
     - Scenarios:
       - WHEN the task exists THE SYSTEM SHALL remove it and return ok
  2. Unknown ids change nothing in the store at all.
  3. No violations of the Don'ts in conventions.md.

## Scope
- src/services/deleteTask.js
`);
  assert.equal(dod.detail, '3 checks');
  assert.equal(dod.ok, true);
});

// P2. Tab-indented fields are fields too.
test('audit p5 · DoD counter: tab-indented scenario lines are fields, not checks', () => {
  const dod = dodCount([
    '## Definition of Done',
    '1. Deleting a task removes it — `node --test test/deleteTask.test.js` passes.',
    '\t- Scenarios:',
    '\t\t- WHEN the task exists THE SYSTEM SHALL remove it and return ok',
    '\t\t- WHEN the id is unknown THE SYSTEM SHALL return not-found',
    '\t- For any list of tasks, deleting one leaves the others unchanged.',
    '2. No violations of the Don\'ts in conventions.md.',
    '',
    '## Scope',
    '- src/services/deleteTask.js',
    '',
  ].join('\n'));
  assert.equal(dod.detail, '2 checks');
  assert.equal(dod.ok, false);
});

// P3. The DoD example gen-spec teaches, in each edition, is counted by the
// smoke counter as exactly the checks it numbers: the prompt and the counter
// agree on what a field of a check looks like.
test('audit p5 · DoD counter agrees with the DoD example gen-spec teaches, in every edition', () => {
  for (const path of [
    'plugins/vibeflow/skills/gen-spec/SKILL.md',
    'cursor/skills/vibeflow-gen-spec/SKILL.md',
    'copilot/github/prompts/vibeflow-gen-spec.prompt.md',
  ]) {
    const raw = readFileSync(join(ROOT, path), 'utf8');
    const fences = [...raw.matchAll(/^[ \t]*```[^\n]*\n([\s\S]*?)\n[ \t]*```/gm)].map((m) => m[1]);
    const example = fences.find((f) => /THE SYSTEM SHALL/.test(f));
    assert.ok(example, `${path}: a DoD example with a scenario`);
    const lines = example.split('\n');
    const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)[0].length));
    const dedented = lines.map((l) => l.slice(pad)).join('\n');
    const numbered = (dedented.match(/^\d+\.\s/gm) ?? []).length;
    assert.ok(numbered >= 1, `${path}: the example numbers its checks`);
    const dod = dodCount(`
## Definition of Done
${dedented}
${numbered + 1}. No violations of the Don'ts in conventions.md.
${numbered + 2}. Every new module follows the naming pattern of its neighbours.

## Scope
- src/services/deleteTask.js
`);
    assert.equal(dod.detail, `${numbered + 2} checks`, path);
  }
});
