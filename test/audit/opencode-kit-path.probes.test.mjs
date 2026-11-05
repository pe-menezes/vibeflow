// Behavior probes for the OpenCode edition, part 1: `audit`, `implement` and `stats` tell an
// OpenCode session to reach the loop kit the way a Codex or Hermes session does — OpenCode, like
// them, hands the skill body over with `${CLAUDE_SKILL_DIR}` unsubstituted, together with the
// skill's absolute folder — instead of landing in the "kit not installed" case written for an old
// Claude Code or an unknown host; the orchestrator's host table opens each OpenCode round through
// its `subagent` tool; and the auditor role sends OpenCode to the shared audit workflow where the
// CLI installs it. The contract tests pin the key sentences; these probes pin the routing as a whole
// (every kit-path sentence of the three skills, against the hosts of the never-substituted rule) and the parts of the host table a rewrite would drift
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

// The hosts that do not substitute the variable are the ones the `audit` rule "In … the variable is never substituted" lists; OpenCode, Codex and Hermes stay the floor.
const neverSubstitutedHosts = () => {
  const ruleHosts = /\bIn ((?:[A-Z]\w*(?:, | and ))*[A-Z]\w*) the variable is never substituted/.exec(flat(read(SKILLS.audit)))?.[1];
  assert.ok(ruleHosts, 'audit: one sentence lists the hosts where "the variable is never substituted"');
  const hosts = ruleHosts.split(/, | and /);
  for (const floor of ['OpenCode', 'Codex', 'Hermes']) assert.ok(hosts.includes(floor), `audit: the never-substituted rule names ${floor}: ${ruleHosts}`);
  return hosts;
};
// A sentence that resolves the kit path: it shows the variable, says the path is the same relative to this SKILL.md, says whether a host substitutes the variable, or says where the kit is without being an install instruction (one that runs the installer or updates the plugin; a sentence that only uses the word "installed" still says where the kit is).
const installInstruction = /npx|setup-vibeflow|updating the Vibeflow plugin/;
const resolvesKitPath = (s) =>
  s.includes('${CLAUDE_SKILL_DIR}') || /the same path relative|directory of this SKILL\.md|substitut/.test(s) || (/\bkit\b/.test(s) && !installInstruction.test(s));

// Contract: in the three skills, every sentence that resolves the kit path and names a host of the `audit` never-substituted rule names every host of that rule, once each, and each skill has as many such sentences as the five places that resolve the kit path (the `implement` kit path, the `audit` kit paragraph and its never-substituted rule, the `stats` command line and its rule): those are where a reader of a host that does not substitute the variable meets its host's name. The host list is read from the rule, so a host added to the rule has to reach every other kit-path sentence. Install instructions are out of the contract: a sentence that tells one host how to install the kit (the `npx setup-vibeflow@latest --opencode --force` hint names its folder, but could name OpenCode alone) does not route any host to the kit path.
// Breaks when: one of the five keeps "(in Codex and Hermes, …)" without OpenCode — an OpenCode session reading it would take the Claude Code tail and count the kit as not installed —; a host gets a kit sentence of its own that drifts from the rule the next change to the kit path edits; or a fourth host enters the rule, the `audit` kit paragraph and the `implement` parenthetical, the audit-contracts literals are updated with it, and the `stats` sentences are forgotten (the gesture that added OpenCode); or a new sentence names part of the rule's hosts while saying something else about the variable or the kit ("In Hermes the variable is substituted automatically.", "In Codex and Hermes the kit is installed beside the skill."), contradicting the rule for the host it leaves out.
// Not covered by: audit-contracts and loop-stats pin the `audit` and `stats` sentences as literals, which the maintainer rewrites when adding a host, and the Hermes probe's case 3 the `implement` parenthetical against the same rule; only this case checks every kit-path sentence of the three skills against the rule's own list. It took over the Hermes probe's former case 1.
test('OpenCode kit path: every host sentence in audit, implement and stats that resolves the kit path names every host of the never-substituted rule', () => {
  const hosts = neverSubstitutedHosts();
  const expected = { audit: 2, implement: 1, stats: 2 };
  const hostPattern = new RegExp(`\\b(?:${hosts.join('|')})\\b`);
  for (const [name, path] of Object.entries(SKILLS)) {
    const kitSentences = sentences(read(path)).filter((s) => resolvesKitPath(s) && hostPattern.test(s));
    assert.ok(kitSentences.length >= expected[name], `${name}: ${kitSentences.length} kit-path sentences name a never-substituted host, ${expected[name]} expected`);
    for (const sentence of kitSentences) {
      for (const host of hosts) {
        assert.equal(count(sentence, host), 1, `${name}: ${host} is named once in each kit-path sentence: ${sentence}`);
      }
    }
  }
});

// Contract: the OpenCode row of the host table opens a round through the tool OpenCode 2.2.5 calls `subagent` (it renamed the earlier `task`, whose `subagent_type` became `agent`), in the foreground, and names no Claude Code agent and no install path: the Claude Code agent files do not load in OpenCode as they are, and every path the orchestrator writes is tied to a `kitDest` of the CLI.
// Breaks when: a rewrite follows older OpenCode docs and writes the `task` tool, offers `vibeflow:executor` on OpenCode, or names a `.opencode/` folder the CLI does not install, so the orchestrator calls a tool that is not there or an agent that never loaded.
// Not covered by: implement-loop-contracts asks for the `subagent` tool and refuses `vibeflow:` in the row, so the `task` tool and a Claude Code agent fail there too; only this case refuses `subagent_type` mixed into the row and an install path in the row or in its paragraph line; cli-kit probes check the kit paths of the by-file editions, not the host table.
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
});

// Contract: the auditor role and the Claude agent that carries it send an OpenCode auditor to `.opencode/skills/audit/SKILL.md`, the shared audit workflow the CLI installs (`.opencode/skills/<name>/SKILL.md` in `cli/index.js`), named as that same shared workflow and before the Cursor and Copilot paths, while `skills/audit/SKILL.md` in the Vibeflow plugin stays the path of Claude Code, Codex and Hermes, so an OpenCode auditor reads the shared workflow with its kit-path rule from where it is installed, instead of looking for a plugin this host does not have or for a Cursor or Copilot file.
// Breaks when: the host list is edited in the role file only (the agent body then differs from the role); OpenCode goes back among the plugin hosts, where the edition is installed and no plugin exists; the path drifts from the folder the CLI writes; or OpenCode lands after the Cursor or Copilot path.
// Not covered by: audit-contracts checks that the agent body equals the role and that the role names each edition's path, not which hosts read the plugin path nor where OpenCode reads it; the opencode-edition probes compare the OpenCode agent body with the role, not what the role says.
test('OpenCode auditor role: the role and the agent send OpenCode to the shared audit workflow the CLI installs, not to a plugin', () => {
  const cli = readFileSync(join(ROOT, 'cli/index.js'), 'utf8');
  assert.ok(cli.includes('dest: `.opencode/skills/${name}/SKILL.md`'), 'the CLI installs each shared skill to .opencode/skills/<name>/SKILL.md');
  for (const [name, path] of Object.entries(AUDITOR)) {
    const text = flat(read(path));
    const sentence = /The procedure is the audit workflow of your host, read from its file: [^]*?in Copilot\./.exec(text)?.[0];
    assert.ok(sentence, `${name}: the sentence that says where the audit workflow is read`);
    assert.ok(sentence.includes('`skills/audit/SKILL.md` in the Vibeflow plugin for Claude Code, Codex and Hermes ('),
      `${name}: the plugin path is the one of Claude Code, Codex and Hermes, without OpenCode: ${sentence}`);
    assert.ok(sentence.includes('the same shared workflow installed at `.opencode/skills/audit/SKILL.md` in OpenCode'),
      `${name}: OpenCode reads the shared workflow where the CLI installs it: ${sentence}`);
    assert.equal(count(sentence, 'OpenCode'), 1, `${name}: OpenCode is named once: ${sentence}`);
    assert.ok(sentence.indexOf('in OpenCode') < sentence.indexOf('in Cursor'), `${name}: OpenCode comes before the by-file editions: ${sentence}`);
  }
});
