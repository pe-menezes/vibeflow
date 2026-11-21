// The example lists in the skills and the loop kit state a behavior for any
// stack. Two contracts:
// - the audit's rule for a probe of an open finding (step 7) works in a test
//   framework with no expected-failure marker, and in one whose marker takes
//   no reason, and none of its clauses is bound to one language;
// - the editions of a workflow say the same thing in each example list, found
//   by the words around the list, never by the list itself.
// No assertion names a language: the list's content is the editions' to agree
// on, and a test that spelled it would pin today's sentence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const normal = (text) => text.replace(/\s+/g, ' ').trim();

const EDITIONS = {
  audit: [
    'plugins/vibeflow/skills/audit/SKILL.md',
    'cursor/skills/vibeflow-audit/SKILL.md',
    'copilot/github/prompts/vibeflow-audit.prompt.md',
  ],
  implement: [
    'plugins/vibeflow/skills/implement/SKILL.md',
    'cursor/skills/vibeflow-implement/SKILL.md',
    'copilot/github/prompts/vibeflow-implement.prompt.md',
  ],
  genSpec: [
    'plugins/vibeflow/skills/gen-spec/SKILL.md',
    'cursor/skills/vibeflow-gen-spec/SKILL.md',
    'copilot/github/prompts/vibeflow-gen-spec.prompt.md',
  ],
  analyze: [
    'plugins/vibeflow/skills/analyze/SKILL.md',
    'cursor/skills/vibeflow-analyze/SKILL.md',
    'copilot/github/prompts/vibeflow-analyze.prompt.md',
  ],
};
const PRINCIPLES = 'plugins/vibeflow/skills/implement/loop/principles.md';

// Returns the normalized text that follows `start` exactly once in `content`:
// the balanced parenthesis right after it, or everything up to `end`.
function listAfter(content, start, end, where) {
  const text = normal(content);
  const at = text.indexOf(start);
  assert.notEqual(at, -1, `${where}: anchor "${start}" not found`);
  assert.equal(text.indexOf(start, at + 1), -1, `${where}: anchor "${start}" found more than once`);
  const rest = text.slice(at + start.length).trimStart();
  if (end !== undefined) {
    const stop = rest.indexOf(end);
    assert.notEqual(stop, -1, `${where}: end anchor "${end}" not found after "${start}"`);
    return rest.slice(0, stop).trim();
  }
  assert.equal(rest[0], '(', `${where}: no parenthesized list right after "${start}"`);
  let depth = 0;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '(') depth += 1;
    if (rest[i] === ')') depth -= 1;
    if (depth === 0) return rest.slice(0, i + 1);
  }
  assert.fail(`${where}: unbalanced parenthesis after "${start}"`);
}

// ------------------------------------------------- the probe of an open finding

// The rule, from the words that open it to the words that close it, with code
// spans and parenthesized example groups removed: what is left is the
// instruction, which has to hold in any stack.
function probeRule(content, where) {
  const rule = listAfter(content, 'A probe that reproduces an open finding', 'removes the marker.', where);
  return rule.replace(/`[^`]*`/g, '').replace(/\([^()]*\)/g, '').replace(/\s+([,;.])/g, '$1');
}

test('a probe of an open finding has a form in every test framework, bound to no language', () => {
  for (const path of EDITIONS.audit) {
    const rule = probeRule(read(path), path);
    const clauses = rule.split(';').map((clause) => clause.trim());

    assert.ok(clauses.some((c) => /expected-failure marker\b[^;]*\bnaming the finding/.test(c) && !/\bno\b/.test(c)),
      `${path}: the framework's expected-failure marker names the finding`);
    assert.ok(clauses.some((c) => /\bno\b[^;]*\bmarker\b/.test(c) && /\bskip\b/i.test(c) && /\bfinding\b/.test(c)),
      `${path}: where the framework has no expected-failure marker, its skip marker names the finding`);
    assert.ok(clauses.some((c) => /\bno reason\b/.test(c) && /\bcomment\b/.test(c) && /\bfinding\b/.test(c)),
      `${path}: where the marker takes no reason, a comment beside it names the finding`);

    // A clause bound to a stack names it outside the examples: a capitalized
    // word inside a sentence, or a condition on the kind of project.
    for (const sentence of rule.split(/(?<=\.)\s+/)) {
      const proper = sentence.split(/\s+/).slice(1).filter((word) => /^[A-Z]/.test(word));
      assert.deepEqual(proper, [], `${path}: a clause of the rule names a stack outside the examples: "${sentence}"`);
    }
    assert.doesNotMatch(rule, /\bin [^\s,;.]+ (projects?|codebases?|repositories|repos?)\b/i,
      `${path}: a clause of the rule is conditioned on a kind of project`);
  }
});

// ------------------------------------------------ the editions agree on each list

// Each list: where it lives, the words before it, and, when it is not a
// parenthesis, the words after it. Lists the loop kit holds once
// (`principles.md`) join the workflow lists they repeat.
const LISTS = [
  { id: 'B1 test runner manifest', files: [...EDITIONS.audit, ...EDITIONS.implement],
    start: "detect the project's runner from the stack" },
  { id: 'B2 mutation tool', files: [...EDITIONS.audit, PRINCIPLES], start: 'a mutation tool' },
  { id: 'B3 expected-failure marker', files: EDITIONS.audit,
    start: "carries the test framework's expected-failure marker naming the finding", end: 'removes the marker.' },
  { id: 'B4 property-testing library', files: [...EDITIONS.genSpec, PRINCIPLES], start: 'a property-testing library' },
  { id: 'B5a craftsmanship gate', files: EDITIONS.genSpec,
    start: 'must be a craftsmanship gate', end: 'Functional checks alone are not enough.' },
  { id: 'B5b typing', files: EDITIONS.analyze, start: 'state management, typing' },
  { id: 'B5c stack pitfalls', files: EDITIONS.analyze, start: 'the known pitfalls of the detected stack' },
  { id: "B5d Don'ts format", files: EDITIONS.analyze,
    start: 'Format is a bullet list of concrete prohibitions with a brief rationale', end: "## Don'ts" },
  { id: 'B6 file prefix', files: EDITIONS.analyze, start: 'by file prefix' },
  { id: 'B7 measuring command', files: [PRINCIPLES], start: 'the time and the command that measured it' },
  { id: 'B8 domain classification', files: EDITIONS.analyze, start: 'Classify the project as', end: '**library**' },
  { id: 'B9 incremental filter', files: EDITIONS.analyze,
    start: "Filter out tests, docs, and config that doesn't affect source structure" },
  { id: 'F7a state probe', files: EDITIONS.audit,
    start: 'a doc sentence, a line number, the real clock', end: 'A standalone audit without' },
  { id: 'F7b suspects', files: EDITIONS.audit, start: 'Each suspect leaves', end: 'Without the kit' },
];

test('the editions say the same thing in each example list', () => {
  for (const { id, files, start, end } of LISTS) {
    const [first, ...others] = files;
    const reference = listAfter(read(first), start, end, `${id} in ${first}`);
    assert.ok(reference.length > 0, `${id}: empty list in ${first}`);
    for (const path of others) {
      assert.equal(listAfter(read(path), start, end, `${id} in ${path}`), reference,
        `${id}: ${path} differs from ${first}`);
    }
  }
});
