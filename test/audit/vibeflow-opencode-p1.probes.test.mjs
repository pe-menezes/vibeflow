// Behavior probes from the independent audit of the OpenCode edition, part 1: the OpenCode row
// of the orchestrator's host table is the whole instruction an OpenCode orchestrator gets for
// opening a round, so it must describe a call the host's `subagent` tool accepts and that lands
// in a session able to do the round's work. Each case states, as comments, the contract it
// protects, the plausible regression that breaks it and why the implementer's tests miss it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const ORCHESTRATOR = 'plugins/vibeflow/skills/implement/loop/orchestrator.md';
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// Contract: the OpenCode row describes a `subagent` call with every field the tool requires — in
// OpenCode 2.2.5 those are `agent`, `description` and `prompt`, while `model`, `sessionID` and
// `background` are optional — and the `agent` it names is not the built-in `explore`, whose
// permissions deny every tool but shell, grep, glob, read and the web ones, so an executor or an
// auditor dispatched there cannot edit or write its progress file, report or probe file.
// Breaks when: the row stays as it is, naming `description` and `prompt` and leaving the required
// `agent` to the orchestrator's guess, or a rewrite names `explore` for the audit rounds because an
// auditor "reads"; either way the row a model follows to the letter opens a round that fails or
// cannot write.
// Not covered by: implement-loop-contracts pins the `subagent` tool, the foreground, the
// `description` and the `prompt` of the row; the opencode-kit-path probes pin what the row leaves
// out (`task`, `subagent_type`, the Claude Code agents, install paths); nothing asks for `agent`.
test('OpenCode host table: the row names the `agent` the `subagent` call requires, and not the read-only `explore`', { todo: 'F1: the OpenCode row names no `agent`, a required field of the `subagent` tool' }, () => {
  const row = read(ORCHESTRATOR).split('\n').find((line) => line.startsWith('| OpenCode |'));
  assert.ok(row, 'the host table has an OpenCode row');
  const [, , executor, auditor] = row.split('|').map((cell) => cell.trim());
  assert.match(executor, /`subagent` tool/, 'the row opens the round with the `subagent` tool');
  const agents = [...row.matchAll(/`agent`[^`|]*`([^`]+)`/g)].map((match) => match[1]);
  assert.ok(/`agent`[^`|]*`[^`]+`/.test(executor), `the executor cell names the \`agent\` of the call, with its value in backticks: ${executor}`);
  assert.ok(/^the same\b/.test(auditor) || /`agent`[^`|]*`[^`]+`/.test(auditor), `the audit cell either repeats the executor call or names its own \`agent\`: ${auditor}`);
  for (const agent of agents) assert.notEqual(agent, 'explore', `the round runs in an agent that can write, not \`explore\`: ${row}`);
});
