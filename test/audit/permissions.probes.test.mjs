// Behavior probes from independent audits of the permission lock (test/permissions.test.mjs).
// Each probe copies the lock and the shared plugin's skills and agents into a throwaway folder,
// changes one front matter there, runs the lock as its own test process and checks what it
// reports, so the lock is exercised against the real plugin files rather than a sample. Each case
// states, as comments, the contract it protects, the plausible regression that breaks it, and
// why the implementer's tests did not catch it. A case marked `todo` asserts what a known open
// gap asks for: it runs and prints without failing the suite.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const LOCK = 'test/permissions.test.mjs';
const PLUGIN = 'plugins/vibeflow';

// Copies the lock and the plugin's skills and agents into a throwaway root, lets `edit` change
// one file there (it gets the root), runs the lock alone and returns its exit status and output.
function runLockOnCopy(edit) {
  const root = mkdtempSync(join(tmpdir(), 'vibeflow-permission-probe-'));
  try {
    mkdirSync(join(root, 'test'), { recursive: true });
    cpSync(join(ROOT, LOCK), join(root, LOCK));
    cpSync(join(ROOT, PLUGIN, 'skills'), join(root, PLUGIN, 'skills'), { recursive: true });
    cpSync(join(ROOT, PLUGIN, 'agents'), join(root, PLUGIN, 'agents'), { recursive: true });
    edit(root);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', join(root, LOCK)], { encoding: 'utf8', env });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function rewrite(root, path, change) {
  const file = join(root, path);
  const before = readFileSync(file, 'utf8');
  const after = change(before);
  assert.notEqual(after, before, `the probe's edit did not apply to ${path}`);
  writeFileSync(file, after);
}

// Contract: a real skill of the plugin that gains a tool fails the lock, and the failure names the skill, the tool and the fix (update the list, add a "Changed" line to CHANGELOG.md).
// Breaks when: the repository-level case stops pointing at the plugin (a moved ROOT or PLUGIN reads an empty folder the wrong way) or its assertion drops the fix instructions.
// Not covered by: the lock's own cases run its function against a sample plugin and a sample list; the case over the real plugin only ever runs green, so its failure message is never asserted.
test('permission lock: a skill of the plugin that gains a tool fails with the fix instructions', () => {
  const { status, output } = runLockOnCopy((root) =>
    rewrite(root, `${PLUGIN}/skills/stats/SKILL.md`, (text) =>
      text.replace(/^allowed-tools: (.*)$/m, 'allowed-tools: $1, Write'),
    ),
  );
  assert.notEqual(status, 0, output);
  assert.match(output, /skill stats: allowed-tools gains Write/);
  assert.match(output, /update EXPECTED in test\/permissions\.test\.mjs/);
  assert.match(output, /"Changed" in CHANGELOG\.md/);
});

// Contract: an agent of the plugin whose `tools` line disappears fails the lock, because in Claude Code an agent without `tools` gets every tool.
// Breaks when: a missing field is read as an empty list or skipped, so the widest possible agent passes.
// Not covered by: the lock's own missing-field case uses a skill only; no case removes the field from an agent.
test('permission lock: an agent of the plugin that loses its tools line fails', () => {
  const { status, output } = runLockOnCopy((root) =>
    rewrite(root, `${PLUGIN}/agents/auditor.md`, (text) => text.replace(/^tools: .*\n/m, '')),
  );
  assert.notEqual(status, 0, output);
  assert.match(output, /agent auditor: declares no tools/);
});

// Contract: a front matter that declares `allowed-tools` twice, the second line wider, fails the lock, since a reader that keeps the last key would grant the wider list.
// Breaks when: a merge leaves two `allowed-tools` lines and the lock reads only the first one.
// Not covered by: the lock's own cases write exactly one field per front matter.
test(
  'permission lock: a second, wider allowed-tools line in the same front matter fails',
  { todo: 'open gap: the lock reads only the first allowed-tools line of a front matter' },
  () => {
    const { status, output } = runLockOnCopy((root) =>
      rewrite(root, `${PLUGIN}/skills/stats/SKILL.md`, (text) =>
        text.replace(/^(allowed-tools: .*)$/m, '$1\nallowed-tools: Read, Grep, Glob, Bash, Edit, Write'),
      ),
    );
    assert.notEqual(status, 0, output);
    assert.match(output, /skill stats/);
  },
);
