// Behavior probes for the OpenCode edition, part 1: `audit`, `implement` and `stats` tell an
// OpenCode session to reach the loop kit the way a Codex or Hermes session does — OpenCode, like
// them, hands the skill body over with `${CLAUDE_SKILL_DIR}` unsubstituted, together with the
// skill's absolute folder — instead of landing in the "kit not installed" case written for an old
// Claude Code or an unknown host; the orchestrator's host table opens each OpenCode round through
// its `subagent` tool; and the auditor role names OpenCode among the hosts that read the plugin's
// audit workflow. The contract tests pin the key sentences; these probes pin the routing as a whole
// (every host mention in the three skills) and the parts of the host table a rewrite would drift
// on. Each case states, as comments, the contract it protects, the plausible regression that breaks
// it and why the contract tests did not catch it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SKILLS = {
  audit: 'plugins/vibeflow/skills/audit/SKILL.md',
  implement: 'plugins/vibeflow/skills/implement/SKILL.md',
  stats: 'plugins/vibeflow/skills/stats/SKILL.md',
};
const ORCHESTRATOR = 'plugins/vibeflow/skills/implement/loop/orchestrator.md';
const AUDITOR = {
  role: 'plugins/vibeflow/skills/implement/loop/roles/auditor.md',
  agent: 'plugins/vibeflow/agents/auditor.md',
};
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
// Sentences of a skill body, split on a period followed by a space; a parenthetical that closes
// a sentence stays inside it, so "(in OpenCode, Codex and Hermes, …)" is judged with its sentence.
const sentences = (text) => flat(text).split(/(?<=\.)\s+/);
const count = (text, word) => (text.match(new RegExp(`\\b${word}\\b`, 'g')) ?? []).length;

// Contract: in the three skills, every sentence that names a host reaching the kit by itself (Codex, Hermes or OpenCode) names all three, once each, and each skill names OpenCode in as many sentences as it names Codex: the five places that resolve the kit path (the `implement` kit path, the `audit` kit paragraph and its unsubstituted-variable rule, the `stats` command line and its rule) are where an OpenCode reader meets its host's name.
// Breaks when: one of the five keeps "(in Codex and Hermes, …)" without OpenCode — an OpenCode session reading it would take the Claude Code tail and count the kit as not installed — or OpenCode gets a sentence of its own that drifts from the rule the next change to the kit path edits.
// Not covered by: audit-contracts pins the `audit` rule and kit paragraph only; loop-stats pins the `stats` rule and command line; nothing reads the `implement` sentence for OpenCode, and the Hermes probe asks only for "Codex and Hermes".
test('OpenCode kit path: every host sentence in audit, implement and stats names OpenCode, Codex and Hermes together', () => {
  const expected = { audit: 2, implement: 1, stats: 2 };
  for (const [name, path] of Object.entries(SKILLS)) {
    const hostSentences = sentences(read(path)).filter((s) => /\bCodex\b|\bHermes\b|\bOpenCode\b/.test(s));
    const opencode = hostSentences.filter((s) => /\bOpenCode\b/.test(s));
    assert.ok(opencode.length >= expected[name], `${name}: OpenCode is named in ${opencode.length} sentences, ${expected[name]} expected`);
    for (const sentence of hostSentences) {
      for (const host of ['Codex', 'Hermes', 'OpenCode']) {
        assert.equal(count(sentence, host), 1, `${name}: ${host} is named once in each host sentence: ${sentence}`);
      }
    }
  }
});

// Contract: the sentences that send an old Claude Code, or a host that does not know the variable, to the "kit not installed" (`audit`) or "update Claude Code" (`stats`) case never name OpenCode, and the missing-kit case of `stats` names no host, because an OpenCode session that read its name there would record `Review package: none (kit not installed)` or tell its user to update Claude Code, with the kit installed beside the skill.
// Breaks when: OpenCode is listed among the hosts of the Claude Code tail while the key sentence stays intact, so the key sentence's test stays green and the OpenCode reader meets two contradicting cases.
// Not covered by: audit-contracts pins the exact tail of `audit` but loop-stats checks only the order of the `stats` sentences; the Hermes probe looks for Hermes in the tails, not OpenCode.
test('OpenCode kit path: the Claude Code and unknown-host cases of audit and stats never name OpenCode', () => {
  const audit = flat(read(SKILLS.audit));
  const auditTail = /In Claude Code before 2\.1\.69, or a host that does not know the variable,[^]*?the next case says\./.exec(audit)?.[0];
  assert.ok(auditTail, 'audit: the old Claude Code case is one sentence group ending with "the next case says."');
  assert.doesNotMatch(auditTail, /OpenCode/, `audit: the old Claude Code case leaves OpenCode out: ${auditTail}`);
  const stats = flat(read(SKILLS.stats));
  const rule = /\* When the command still shows `\$\{CLAUDE_SKILL_DIR\}`[^*]*/.exec(stats)?.[0] ?? '';
  const claude = /In Claude Code the variable was not substituted[^]*?report the rest\./.exec(rule)?.[0];
  assert.ok(claude, 'stats: the old Claude Code case ends with "report the rest."');
  assert.doesNotMatch(claude, /OpenCode/, `stats: the old Claude Code case leaves OpenCode out: ${claude}`);
  const notInstalled = /\* Otherwise, when the script is missing[^*]*/.exec(stats)?.[0] ?? '';
  assert.doesNotMatch(notInstalled, /OpenCode|Hermes|Codex/, `stats: the missing-kit case names no host: ${notInstalled}`);
});

// Contract: the OpenCode row of the host table opens a round through the tool OpenCode 2.2.5 calls `subagent` (it renamed the earlier `task`, whose `subagent_type` became `agent`), in the foreground, and names no Claude Code agent and no install path: the Claude Code agent files do not load in OpenCode as they are, and every path the orchestrator writes is tied to a `kitDest` of the CLI.
// Breaks when: a rewrite follows older OpenCode docs and writes the `task` tool, offers `vibeflow:executor` on OpenCode, or names a `.opencode/` folder the CLI does not install, so the orchestrator calls a tool that is not there or an agent that never loaded.
// Not covered by: implement-loop-contracts pins what the row says, not what it must leave out; cli-kit probes check the kit paths of the by-file editions, not the host table.
test('OpenCode host table: the row opens the round with the `subagent` tool and names no Claude Code agent, no `task` tool and no install path', () => {
  const lines = read(ORCHESTRATOR).split('\n');
  const rows = lines.filter((line) => line.startsWith('| OpenCode |'));
  assert.equal(rows.length, 1, 'one OpenCode row in the host table');
  const [row] = rows;
  assert.match(row, /`subagent` tool/, 'the row names the `subagent` tool');
  assert.doesNotMatch(row, /`task`|subagent_type/, 'the row does not name the tool OpenCode renamed');
  assert.doesNotMatch(row, /vibeflow:/, 'the row offers no Claude Code agent');
  assert.doesNotMatch(row, /\.opencode\/|\.config\/opencode|\.claude\/|\.cursor\/|\.github\//, 'the row names no install path');
  const paragraph = lines.find((line) => !line.startsWith('|') && line.includes('OpenCode'));
  assert.ok(paragraph, 'a paragraph line names OpenCode');
  assert.doesNotMatch(paragraph, /\.opencode\/|\.config\/opencode/, 'the paragraph names no OpenCode install path');
  // Every OpenCode mention sits in the row or in that one paragraph, so the table stays the one
  // place a host is described.
  const mentions = lines.filter((line) => line.includes('OpenCode'));
  assert.deepEqual(mentions, [row, paragraph], 'OpenCode is named in the row and one paragraph only');
});

// Contract: the auditor role and the Claude agent that carries it name OpenCode among the hosts that read the audit workflow from the Vibeflow plugin's `skills/audit/SKILL.md`, next to Claude Code, Codex and Hermes, and not among the by-file editions, so an OpenCode auditor reads the shared workflow with its kit-path rule instead of looking for a Cursor or Copilot file.
// Breaks when: the host list is edited in the role file only (the agent body then differs from the role) or OpenCode lands after the Cursor or Copilot path.
// Not covered by: audit-contracts checks that the agent body equals the role and that the role names each edition's path, not which hosts read the plugin path.
test('OpenCode auditor role: the role and the agent name OpenCode among the hosts of the plugin audit workflow', () => {
  for (const [name, path] of Object.entries(AUDITOR)) {
    const text = flat(read(path));
    const sentence = /The procedure is the audit workflow of your host, read from its file: [^]*?in Copilot\./.exec(text)?.[0];
    assert.ok(sentence, `${name}: the sentence that says where the audit workflow is read`);
    assert.ok(sentence.includes('`skills/audit/SKILL.md` in the Vibeflow plugin for Claude Code, Codex, Hermes and OpenCode ('),
      `${name}: OpenCode reads the plugin workflow with Claude Code, Codex and Hermes: ${sentence}`);
    assert.equal(count(sentence, 'OpenCode'), 1, `${name}: OpenCode is named once: ${sentence}`);
  }
});
