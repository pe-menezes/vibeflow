// vibeflow-probe: vibeflow-agnostico-p4
// Behavior probes from the audit of part 4 of vibeflow-agnostico: the audit's rule for a probe of an
// open finding (step 7) holds in any stack and tells the agent to act, in the three editions. They
// complete test/example-lists-any-language.test.mjs, which reads the rule as a bag of words with
// every parenthesis taken out. Like that test, no assertion names a language or a framework: what
// they look for is the shape of the instruction (an example group carries code, a clause's only
// negation is the absence it is conditioned on, the closing sentence holds without a condition).
// Each case states, as comments, the contract it protects, the plausible regression that breaks it,
// and why the implementer's tests did not catch it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const AUDIT = [
  'plugins/vibeflow/skills/audit/SKILL.md',
  'cursor/skills/vibeflow-audit/SKILL.md',
  'copilot/github/prompts/vibeflow-audit.prompt.md',
];
const START = 'A probe that reproduces an open finding';
const END = 'removes the marker.';

// The rule, normalized, from the words that open it to the words that close it.
function rule(path) {
  const text = readFileSync(join(ROOT, path), 'utf8').replace(/\s+/g, ' ');
  const at = text.indexOf(START);
  assert.notEqual(at, -1, `${path}: the rule for a probe of an open finding is gone`);
  const stop = text.indexOf(END, at);
  assert.notEqual(stop, -1, `${path}: the rule does not end with "${END}"`);
  return text.slice(at, stop + END.length);
}

// Takes out what is example: a parenthesis that carries code, then the code itself. A parenthesis
// of prose stays, because it is part of the instruction.
const skeleton = (text) => text
  .replace(/\([^()]*`[^()]*\)/g, '')
  .replace(/`[^`]*`/g, '')
  .replace(/\s+([,;.])/g, '$1');

// Contract: spec part 4, criterion 2: no clause of the rule is bound to a language or framework.
// Breaks when: a restriction is written in parentheses, "(JavaScript projects only)" beside the skip
// clause, in the three editions alike. In the audit's mutation run over a copy of HEAD it passed the
// implementer's test and audit-contracts.test.mjs (mutation M3 in the report).
// Missed because: the implementer's probeRule() removes every parenthesis as an example group before
// it looks for a capital word or "in <x> projects", so a restriction in parentheses is never read.
test('a parenthesis of prose inside the probe rule is read as instruction, and names no stack', () => {
  for (const path of AUDIT) {
    const left = skeleton(rule(path));
    for (const sentence of left.split(/(?<=\.)\s+/)) {
      const proper = sentence.split(/\s+/).slice(1).filter((word) => /^\(?[A-Z]/.test(word));
      assert.deepEqual(proper, [], `${path}: the rule names a stack outside its examples: "${sentence}"`);
    }
    assert.doesNotMatch(left, /\bin [^\s,;.()]+ (projects?|codebases?|repositories|repos?)\b/i,
      `${path}: the rule is conditioned on a kind of project`);
  }
});

// Contract: spec part 4, "What changes", item 2: with no expected-failure marker the probe carries the
// skip marker naming the finding, and with a marker that takes no reason a comment names it. The
// only negation a clause may carry is the absence it is conditioned on ("no such marker", "no
// reason"); the action itself is affirmative.
// Breaks when: the action is negated and the words stay ("the probe never uses a skip marker and
// stays in the report naming the finding"; "no comment beside it names the finding"). Both passed
// the implementer's test and audit-contracts.test.mjs in the mutation run (M4, M5).
// Missed because: the implementer's test asks only that "no ... marker", "skip" and "finding" (or
// "no reason", "comment" and "finding") appear in the same clause, in any order and sense.
test('each clause of the probe rule acts, and negates only the absence it is conditioned on', () => {
  for (const path of AUDIT) {
    const first = skeleton(rule(path)).split(/(?<=\.)\s+/)[0];
    const clauses = first.split(';').map((clause) => clause.trim());
    assert.ok(clauses.length >= 3, `${path}: the rule has fewer than three clauses: "${first}"`);
    for (const clause of clauses) {
      const rest = clause.replace(/\b(no|without)\s+(such\s+)?(an?\s+)?(\S+\s+)?(marker|reason)\b/gi, '');
      assert.doesNotMatch(rest, /\b(no|not|never|none|nor|without|cannot)\b|n't\b/i,
        `${path}: a clause negates its action: "${clause}"`);
    }
  }
});

// Contract: step 7 of audit: "So an audit never turns the project's suite red, and the fix that
// closes the finding removes the marker" holds for every project, and no clause of the rule holds
// "only" for some of them.
// Breaks when: the closing sentence or a clause gains a condition written in lower case ("... red
// when it runs on node,"; "a comment beside it names the finding, in scripting languages only."), the
// two mutations of the orchestrator that passed the implementer's test (M1, M2 in the report).
// Missed because: the implementer's language check looks for a capital word or "in <x> projects";
// a lower-case runtime name or a kind of language goes through.
test('the probe rule holds without a condition on where it runs', () => {
  for (const path of AUDIT) {
    const sentences = skeleton(rule(path)).split(/(?<=\.)\s+/);
    const closing = sentences.find((sentence) => /\bsuite red\b/.test(sentence));
    assert.ok(closing, `${path}: the rule no longer says the audit keeps the suite green`);
    assert.doesNotMatch(closing, /\b(when|whenever|if|unless|only|except)\b/i,
      `${path}: the closing sentence holds under a condition: "${closing}"`);
    assert.doesNotMatch(sentences.join(' '), /\b(only|unless|except)\b/i,
      `${path}: a clause of the rule holds only for some projects`);
  }
});
