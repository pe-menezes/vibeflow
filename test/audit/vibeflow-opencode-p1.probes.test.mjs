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
test('OpenCode host table: the row names the `agent` the `subagent` call requires, and not the read-only `explore`', () => {
  const row = read(ORCHESTRATOR).split('\n').find((line) => line.startsWith('| OpenCode |'));
  assert.ok(row, 'the host table has an OpenCode row');
  const [, , executor, auditor] = row.split('|').map((cell) => cell.trim());
  assert.match(executor, /`subagent` tool/, 'the row opens the round with the `subagent` tool');
  const agents = [...row.matchAll(/`agent`[^`|]*`([^`]+)`/g)].map((match) => match[1]);
  assert.ok(/`agent`[^`|]*`[^`]+`/.test(executor), `the executor cell names the \`agent\` of the call, with its value in backticks: ${executor}`);
  assert.ok(/^the same\b/.test(auditor) || /`agent`[^`|]*`[^`]+`/.test(auditor), `the audit cell either repeats the executor call or names its own \`agent\`: ${auditor}`);
  for (const agent of agents) assert.notEqual(agent, 'explore', `the round runs in an agent that can write, not \`explore\`: ${row}`);
});

// Re-audit 1 of part 1. The `agent` values each cell of the OpenCode row names, read from the
// pattern "`agent` … `<value>`" the row uses for every value it gives the field.
const opencodeCells = () => {
  const row = read(ORCHESTRATOR).split('\n').find((line) => line.startsWith('| OpenCode |'));
  assert.ok(row, 'the host table has an OpenCode row');
  const [, , executor, auditor] = row.split('|').map((cell) => cell.trim());
  const agentsOf = (cell) => [...cell.matchAll(/`agent`[^`|]*`([^`]+)`/g)].map((match) => match[1]);
  return { row, executor, auditor, executorAgents: agentsOf(executor), auditorAgents: agentsOf(auditor) };
};

// Contract: on OpenCode each round runs in the agent of its role, as the Claude Code row does with
// `vibeflow:executor` and `vibeflow:auditor`: the executor and fix rounds call the `subagent` tool
// with the `agent` `executor`, and the audit and re-audit rounds with the `agent` `auditor`, the
// names the edition's agents load under in OpenCode 2.2.5 (`.opencode/agents/`, listed next to
// `explore` and `general`).
// Breaks when: the audit cell goes back to "the same, running the audit workflow" (its text before
// the fix), so an audit round inherits the `executor` agent and runs with the executor's
// instructions; or the cells swap the two names; or the executor cell keeps only the host's
// `general`, so the edition's executor agent is never used.
// Not covered by: the case above accepts any backticked `agent` other than `explore` in the
// executor cell and an audit cell that starts with "the same", so all three regressions pass it;
// implement-loop-contracts does not read the `agent` of the row.
test('OpenCode host table: the executor rounds name the `executor` agent and the audit rounds the `auditor` agent', () => {
  const { row, executorAgents, auditorAgents } = opencodeCells();
  assert.equal(executorAgents[0], 'executor', `the executor cell's call names the \`agent\` \`executor\` first: ${row}`);
  assert.ok(!executorAgents.includes('auditor'), `the executor cell does not send its rounds to the \`auditor\` agent: ${row}`);
  assert.deepEqual(auditorAgents.filter((agent) => agent !== 'general'), ['auditor'], `the audit cell names its own \`agent\`, \`auditor\`, instead of inheriting \`executor\` from "the same": ${row}`);
});

// Contract: where the edition's agents are not installed (in OpenCode 2.2.5 a project without them
// lists only `explore` and `general` as subagents), the row still names an `agent` that exists in
// every OpenCode install and can write: the host's `general`. The `agent` field is required and the
// tool lists the agents the host has, so naming one it lacks leaves the orchestrator without a
// valid call.
// Breaks when: a rewrite, once a later part installs the agents, shortens the row to `executor`
// and `auditor` alone, so an orchestrator in a project without them calls an agent that does not
// exist; or the fallback names `explore`, which the case above already rejects.
// Not covered by: the case above asks only that some backticked `agent` is named and none is
// `explore`, so a row naming only `executor` and `auditor` passes it; the new case above pins the
// role agents, not the fallback.
test('OpenCode host table: the row names the host\'s `general` as the `agent` where the edition\'s agents are not installed', () => {
  const { row, executorAgents } = opencodeCells();
  assert.ok(executorAgents.includes('general'), `the executor cell names the host's \`general\` as an \`agent\` value, which the audit cell's "the same" carries: ${row}`);
});
