// Behavior probes from the independent audit of the Hermes Agent edition, part 2: `audit`,
// `implement` and `stats` tell a Hermes session to reach the loop kit the way a Codex session
// does — resolve `${CLAUDE_SKILL_DIR}` as the directory of the SKILL.md being read and run the
// command again — instead of landing in the "kit not installed" case written for an old Claude
// Code or an unknown host. The implementer's contract tests pin the two key sentences and the
// kit paragraph of `audit`; these probes pin the routing as a whole (every host mention in the
// three skills) and that the path the sentence tells both hosts to resolve really reaches the
// scripts each skill names. Each case states, as comments, the contract it protects, the
// plausible regression that breaks it and why the implementer's tests did not catch it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SKILLS = {
  audit: 'plugins/vibeflow/skills/audit/SKILL.md',
  implement: 'plugins/vibeflow/skills/implement/SKILL.md',
  stats: 'plugins/vibeflow/skills/stats/SKILL.md',
};
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
// Sentences of a skill body, split on a period followed by a space; a parenthetical that closes
// a sentence stays inside it, so "(in Codex and Hermes, …)" is judged with the sentence it ends.
const sentences = (text) => flat(text).split(/(?<=\.)\s+/);

// Contract: in the three skills, a sentence that names Codex as a host that reaches the kit also names Hermes, and a sentence that names Hermes names Codex, so a Hermes reader meets its host's name exactly where the Codex reader does and falls into the "resolve the path and run again" case rather than into the one for a host that does not know the variable.
// Breaks when: a rewrite narrows one parenthetical back to "(in Codex, …)" — the `stats` command line and the `implement` kit path carry one each — or adds Hermes to a sentence of its own, drifting from the Codex rule that the next change to the kit path will edit.
// Not covered by: audit-contracts pins the key sentence and the kit paragraph of `audit` only; loop-stats pins the key sentence of `stats`, not its command-line parenthetical; no test reads the `implement` parenthetical, whose only pin is the literal `${CLAUDE_SKILL_DIR}/loop/`.
test('Hermes kit path: every host sentence in audit, implement and stats names Codex and Hermes together', () => {
  for (const [name, path] of Object.entries(SKILLS)) {
    const hostSentences = sentences(read(path)).filter((s) => /\bCodex\b|\bHermes\b/.test(s));
    assert.ok(hostSentences.length >= 1, `${name}: at least one sentence names the hosts that resolve the kit path themselves`);
    for (const sentence of hostSentences) {
      assert.ok(/\bCodex and Hermes\b/.test(sentence), `${name}: a host sentence names the two hosts as one case: ${sentence}`);
      assert.equal((sentence.match(/\bHermes\b/g) ?? []).length, 1, `${name}: Hermes is named once per sentence, next to Codex: ${sentence}`);
    }
  }
});

// Contract: the sentences that send an old Claude Code, or a host that does not know the variable, to the "kit not installed" (`audit`) or "update Claude Code" (`stats`) case never name Hermes, because a Hermes session that read its name there would record `Review package: none (kit not installed)` or tell its user to update Claude Code, with the kit installed beside the skill.
// Breaks when: a maintainer lists Hermes among the hosts of the Claude Code tail ("In Claude Code and Hermes the variable was not substituted…") while leaving the key sentence intact, so the key sentence's test stays green and the Hermes reader meets two contradicting cases.
// Not covered by: audit-contracts pins the exact tail between the key sentence and "the kit counts as not installed" in `audit`; loop-stats checks only the order of the `stats` sentences, not the words of the Claude Code tail, so Hermes added there passes.
test('Hermes kit path: the Claude Code and unknown-host cases of audit and stats never name Hermes', () => {
  const audit = flat(read(SKILLS.audit));
  const auditTail = /In Claude Code before 2\.1\.69, or a host that does not know the variable,[^]*?the next case says\./.exec(audit)?.[0];
  assert.ok(auditTail, 'audit: the old Claude Code case is one sentence group ending with "the next case says."');
  assert.doesNotMatch(auditTail, /Hermes/, `audit: the old Claude Code case leaves Hermes out: ${auditTail}`);
  const stats = flat(read(SKILLS.stats));
  const rule = /\* When the command still shows `\$\{CLAUDE_SKILL_DIR\}`[^*]*/.exec(stats)?.[0] ?? '';
  const claude = /In Claude Code the variable was not substituted[^]*?report the rest\./.exec(rule)?.[0];
  assert.ok(claude, 'stats: the old Claude Code case ends with "report the rest."');
  assert.doesNotMatch(claude, /Hermes/, `stats: the old Claude Code case leaves Hermes out: ${claude}`);
  const notInstalled = /\* Otherwise, when the script is missing[^*]*/.exec(stats)?.[0] ?? '';
  assert.doesNotMatch(notInstalled, /Hermes|Codex/, `stats: the missing-kit case names no host: ${notInstalled}`);
});

// Contract: the path the sentence tells Codex and Hermes to resolve — the kit relative to the directory of the SKILL.md being read — reaches the scripts and files each skill names, so a Hermes session following the sentence runs the kit instead of `node` answering "Cannot find module" and being read as a missing kit.
// Breaks when: a skill moves to another depth (`skills/<group>/audit/`), the kit folder is renamed, or the `implement` parenthetical says `loop/` while the kit sits elsewhere; the sentence stays true for Codex only if the layout matches, and nothing else checks the layout from the skill's side.
// Not covered by: cli-kit probes check the kit sits two levels above the `audit` skill; no test resolves `../implement/loop/` from the `stats` skill or `loop/` from the `implement` skill, and none launches a script through the resolved path.
test('Hermes kit path: resolving ${CLAUDE_SKILL_DIR} as the directory of each SKILL.md reaches the kit scripts the skill names', () => {
  const dirOf = (path) => dirname(join(ROOT, path));
  const resolved = {
    audit: [join(dirOf(SKILLS.audit), '..', 'implement', 'loop', 'scripts', 'review-package.mjs'), join(dirOf(SKILLS.audit), '..', 'implement', 'loop', 'scripts', 'check-probes.mjs')],
    stats: [join(dirOf(SKILLS.stats), '..', 'implement', 'loop', 'scripts', 'loop-stats.mjs')],
  };
  for (const [name, scripts] of Object.entries(resolved)) {
    const body = flat(read(SKILLS[name]));
    for (const script of scripts) {
      const file = script.split('/').pop();
      assert.ok(body.includes(`\${CLAUDE_SKILL_DIR}/../implement/loop/scripts/${file}`), `${name}: names the script through the variable`);
      assert.ok(existsSync(script), `${name}: ${file} exists at the resolved path`);
      // No arguments: the script reaches its own usage check (exit 2 or 64), never node's module loader.
      const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
      assert.ok([2, 64].includes(result.status), `${name}: ${file} launched through the resolved path and refused the empty argument list: exit ${result.status}`);
      assert.doesNotMatch(result.stderr, /Cannot find module/, `${name}: ${file} was found at the resolved path`);
    }
  }
  const implement = flat(read(SKILLS.implement));
  assert.ok(implement.includes('`${CLAUDE_SKILL_DIR}/loop/` (in Codex and Hermes, `loop/` in the directory of this SKILL.md)'), 'implement: names `loop/` beside the SKILL.md for Codex and Hermes');
  assert.ok(existsSync(join(dirOf(SKILLS.implement), 'loop', 'orchestrator.md')), 'implement: orchestrator.md sits in loop/ beside the SKILL.md');
});
