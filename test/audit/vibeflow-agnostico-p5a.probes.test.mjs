// vibeflow-probe: vibeflow-agnostico-p5a
// Behavior probes from the audit of part 5a of vibeflow-agnostico. Two groups:
// - the principle test (test/language-agnostic-kit.test.mjs) is run on a copy of the kit with one
//   sentence planted, and must fail when the sentence breaks the principle. The cases under `todo`
//   reproduce open findings of the audit report (.vibeflow/audits/vibeflow-agnostico-p5a-audit.md):
//   the fix that closes the finding removes the marker;
// - the step 7 and re-audit sentences of B3a and B3b tell the agent to act, in the three editions,
//   which the word-bag cases of test/audit-contracts.test.mjs do not check.
// Like the principle test, no assertion here holds a vocabulary of languages: the planted sentences
// are the only place a stack is named, and they are the input, not the rule.
// Each case states, as comments, the contract it protects, the plausible regression that breaks it,
// and why the implementer's tests did not catch it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hermeticEnv } from '../loop-helpers.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const KIT_DIRS = ['plugins', 'cursor', 'copilot', 'opencode'];
const SHARED_AUDIT = 'plugins/vibeflow/skills/audit/SKILL.md';
const AUDIT = [SHARED_AUDIT, 'cursor/skills/vibeflow-audit/SKILL.md', 'copilot/github/prompts/vibeflow-audit.prompt.md'];
const GEN_SPEC = 'plugins/vibeflow/skills/gen-spec/SKILL.md';

// A copy of the kit's prose and of the principle test, in a fresh git repository with nothing
// committed (the test lists untracked files too), with `edit` applied to one file. Returns the
// exit status of the principle test on that copy and its output.
function principleTestOn(file, edit) {
  const root = mkdtempSync(join(tmpdir(), 'vibeflow-p5a-probe-'));
  try {
    for (const dir of KIT_DIRS) cpSync(join(ROOT, dir), join(root, dir), { recursive: true });
    mkdirSync(join(root, 'test/fixtures/gate-languages'), { recursive: true });
    cpSync(join(ROOT, 'test/language-agnostic-kit.test.mjs'), join(root, 'test/language-agnostic-kit.test.mjs'));
    cpSync(join(ROOT, 'test/fixtures/gate-languages/matrix.mjs'), join(root, 'test/fixtures/gate-languages/matrix.mjs'));
    // NODE_TEST_CONTEXT, inherited from this test run, would make the child report to a parent
    // that is not listening and exit 0 whatever its tests do.
    const env = hermeticEnv(join(root, 'home'), { NODE_TEST_CONTEXT: undefined });
    mkdirSync(join(root, 'home'));
    const init = spawnSync('git', ['init', '-q'], { cwd: root, env, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const path = join(root, file);
    const before = readFileSync(path, 'utf8');
    const after = edit(before);
    assert.notEqual(after, before, `the planted edit did not change ${file}`);
    writeFileSync(path, after);
    const run = spawnSync(process.execPath, ['--test', 'test/language-agnostic-kit.test.mjs'], { cwd: root, env, encoding: 'utf8' });
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Appends `sentence` after the first sentence of the shared audit's step 7 that ends with `anchor`.
const after = (anchor, sentence) => (text) => {
  assert.equal(text.split(anchor).length - 1, 1, `anchor "${anchor}" is not unique`);
  return text.replace(anchor, `${anchor} ${sentence}`);
};
const STEP7 = 'and quote that failure in the report.';
const DOD = 'Functional checks alone are not enough.';

// Contract: the copy itself is sound (the control the todo cases below depend on): the principle
// test passes on the kit as it is, and fails on the spec's mutation (a).
// Regression: a change to the copy helper or to how the principle test lists files (untracked files
// stop being read) would make every case below pass or fail for the wrong reason.
// Why the implementer's tests miss it: they run on the checkout only, never on a planted copy.
test('the principle test passes on a copy of the kit and fails on a planted bare tool name', () => {
  const clean = principleTestOn(GEN_SPEC, (text) => `${text}\n`);
  assert.equal(clean.status, 0, clean.output);
  const planted = principleTestOn(SHARED_AUDIT, after(STEP7, 'Run pytest before the final stage.'));
  assert.notEqual(planted.status, 0, 'a bare "Run pytest" in step 7 passed');
});

// Contract: decision 1 of the feature, a name appears only as an example, labeled as one. A mark
// labels the names it introduces, not every name of its sentence.
// Regression: a sentence that binds a tool ("Write every probe with Jest") gains an example list
// in the same sentence, or sits right before a bold opener that does not end the sentence for the
// reader, and the binding name rides on the list's mark.
// Why the implementer's tests miss it: P1 asks whether the sentence holds a mark anywhere
// (MARK.test(text)), and P2 counts the ecosystems of the whole sentence, so a binding name in one
// ecosystem plus an example list of another passes both.
test('a binding tool name does not ride on an example mark later in its sentence (finding A1)', () => {
  const bound = principleTestOn(SHARED_AUDIT, after(STEP7, 'Write every probe with Jest, and run a mutation tool such as Stryker or mutmut first.'));
  assert.notEqual(bound.status, 0, 'the binding "with Jest" passed on the mark of a later list');
  const joined = principleTestOn(SHARED_AUDIT, after(STEP7, 'Use Jest for every probe. **A mutation tool** (for example Stryker or mutmut) runs first.'));
  assert.notEqual(joined.status, 0, 'the sentence after a bold opener lent its mark to "Use Jest"');
});

// Contract: decision 1, an example spans more than one ecosystem; the unit that is an example is
// the list the mark opens.
// Regression: the B3 clause's expected-failure list loses its Python and Swift entries and keeps
// two JavaScript ones; the skip and the comment clauses of the same sentence keep other stacks.
// Why the implementer's tests miss it: P2 counts the ecosystems of the whole sentence, and the B3
// sentence runs through three parenthesized lists (a semicolon followed by a lowercase word does
// not end it); the line 463 rewrite in audit-contracts counts two pairs, of any ecosystem.
test('an example list of one ecosystem fails even when its sentence names other stacks (finding A2)', () => {
  const run = principleTestOn(SHARED_AUDIT, (text) => text.replace(
    '(for example `todo` in node:test, `xfail` in pytest, `test.failing` in Jest, `withKnownIssue` in Swift Testing)',
    '(for example `todo` in node:test, `test.failing` in Jest)'));
  assert.notEqual(run.status, 0, 'an expected-failure list of one ecosystem passed');
});

// Contract: the runtime exception (exception D of the design) covers the kit's own runtime: the
// command that runs one of the kit's scripts, and the Node.js the scripts need.
// Regression: a skill tells the agent to run the project's tests through node ("Run the project's
// tests with `node --test test/app.test.mjs`") or limits a rule to "Node 18 projects".
// Why the implementer's tests miss it: the excerpt `node [^`]*\.mjs` takes any node command on any
// .mjs file, in any file of the kit, and "Node 18" is taken out wherever it is.
test('the runtime exception does not cover a project command or a rule for Node projects (finding A3)', () => {
  const command = principleTestOn(GEN_SPEC, after(DOD, "Run the project's tests with `node --test test/app.test.mjs`."));
  assert.notEqual(command.status, 0, 'a project test command on node passed as the kit runtime');
  const scope = principleTestOn(GEN_SPEC, after(DOD, 'This applies to Node 18 projects only.'));
  assert.notEqual(scope.status, 0, 'a rule for Node 18 projects passed as the kit runtime');
});

// ---------------------------------------------------------------- B3a and B3b, the action

function flat(path) {
  return readFileSync(join(ROOT, path), 'utf8').replace(/\s+/g, ' ');
}
const NEGATION = /\b(not|never|no|don't|nor|without being)\b/i;

// Contract: B3a (spec part 5a, "What changes" item 2): a probe under a skip marker is run once
// without the marker, and the failure is quoted. Both are actions the agent takes.
// Regression: a rewrite keeps the words and turns an action down ("do not run it without the
// marker before you mark it", "and never quote that failure in the report").
// Why the implementer's tests miss it: the B3a case of audit-contracts looks for "run ... without
// the marker", "before ... mark" and "failure ... report" in the sentence, and a negation between
// them passes (measured on a copy: both rewrites pass it).
test('B3a: the run without the marker and the quoted failure are affirmative, in the three editions', () => {
  for (const path of AUDIT) {
    const text = flat(path);
    const at = text.indexOf('A probe under a skip marker');
    assert.ok(at >= 0, `${path}: no sentence on a probe under a skip marker`);
    const sentence = text.slice(at, text.indexOf('.', at) + 1);
    const action = sentence.slice(sentence.indexOf(':') + 1);
    const clauses = action.split(/,\s*(?:and\s+)?/);
    const run = clauses.find((c) => /\bwithout (the|its) marker\b/i.test(c));
    const quote = clauses.find((c) => /\bfailure\b/i.test(c) && /\breport\b/i.test(c));
    assert.ok(run && quote, `${path}: the run and the quote are not two clauses of the action`);
    assert.doesNotMatch(run.replace(/\bwithout (the|its) marker\b/i, ''), NEGATION, `${path}: the run is turned down: ${run}`);
    assert.doesNotMatch(quote, NEGATION, `${path}: the quote is turned down: ${quote}`);
  }
});

// Contract: B3b: in the re-audit, the finding closes only when its probe passes without the marker.
// The closing condition is the pass, and nothing that a marked probe also does.
// Regression: the closing clause gains a condition a marked probe meets ("when it passes or is
// skipped", "when it passes under the marker").
// Why the implementer's tests miss it: the B3b case asks for "closes only when ... pass" and for
// "without the marker" anywhere in the sentence, so both rewrites pass it (measured on a copy).
test('B3b: the finding closes on the probe passing, not on a marked or skipped run, in the three editions', () => {
  for (const path of AUDIT) {
    const text = flat(path);
    const start = text.indexOf('## Re-audit mode');
    const section = text.slice(start, text.indexOf('## Consolidation mode', start));
    const at = section.search(/\bcloses only (when|if)\b/i);
    assert.ok(at >= 0, `${path}: the re-audit has no closing condition`);
    const closing = section.slice(at, section.indexOf('.', at) + 1);
    assert.match(closing, /\bpass/i, `${path}: the closing condition is not a pass: ${closing}`);
    assert.doesNotMatch(closing, /\b(marker|marked|skip|skipped|todo|xfail)\b/i, `${path}: a marked run closes the finding: ${closing}`);
  }
});

// ---------------------------------------------------------------- re-audit 1 of part 5a
// Cases added by the re-audit of fix 1 (.vibeflow/audits/vibeflow-agnostico-p5a-reaudit-1.md).

// Contract: B3a: the action of the step 7 sentence is two instructions, the run without the marker
// and the quote of its failure; nothing drops the quote and nothing adds a way out of the run.
// Regression: a rewrite keeps "failure" and "report" and drops the quote with a verb that is no
// negation word ("and skip quoting that failure in the report", "and leave that failure out of the
// report", "and omit that failure from the report"), or adds a clause ("unless it is slow").
// Why the implementer's tests miss it: the B3a case of audit-contracts asks the run clause to begin
// with "run", but checks the quote clause only against a list of negation and permission words
// (NOT_BINDING), and lets a third clause through; the B3a probe above reads a list of negations too
// (measured on a copy of 592ec14: the six rewrites pass both).
test('B3a: the action is the run and the quote, both instructions, and nothing else, in the three editions (re-audit 1, N1)', () => {
  for (const path of AUDIT) {
    const text = flat(path);
    const at = text.indexOf('A probe under a skip marker');
    assert.ok(at >= 0, `${path}: no sentence on a probe under a skip marker`);
    const sentence = text.slice(at, text.indexOf('.', at) + 1);
    const clauses = sentence.slice(sentence.indexOf(':') + 1).split(/,\s*(?:and\s+)?/).map((c) => c.trim()).filter(Boolean);
    assert.equal(clauses.length, 2, `${path}: the action is not the run and the quote alone: ${sentence}`);
    assert.match(clauses[0], /^run\b[^,]*\bwithout (the|its) marker\b/i, `${path}: the first instruction is not the run: ${clauses[0]}`);
    assert.match(clauses[1], /^quote\b[^,]*\bfailure\b[^,]*\breport\b/i, `${path}: the second instruction is not the quote: ${clauses[1]}`);
  }
});

// Contract: B3b: in the re-audit, the finding closes on the probe passing, and on nothing more.
// Regression: the closing clause gains a way out that a marked probe meets, in a form the word list
// does not hold ("closes only when it passes; skipping it also closes it").
// Why the implementer's tests miss it: the B3b case of audit-contracts and the B3b probe above look
// for a list of words in the condition ("skip", "skipped", "or", "under", ...), and "skipping" is
// none of them (measured on a copy of 592ec14: both pass).
test('B3b: the closing condition is the probe passing and nothing more, in the three editions (re-audit 1, N1)', () => {
  for (const path of AUDIT) {
    const text = flat(path);
    const start = text.indexOf('## Re-audit mode');
    const section = text.slice(start, text.indexOf('## Consolidation mode', start));
    const at = section.search(/\bcloses only (when|if)\b/i);
    assert.ok(at >= 0, `${path}: the re-audit has no closing condition`);
    const closing = section.slice(at, section.indexOf('.', at) + 1);
    assert.match(closing, /^closes only (when|if) (it|the probe) passes\.$/i, `${path}: the closing condition is more than the pass: ${closing}`);
  }
});

// Contract: P1 of part 5a: a sentence that names a term of the vocabulary outside an example fails.
// Fix 1 (C5) reads a term that is also an ordinary English word only where it names a stack; the
// carve-out is for words with an English sense ("Go to", "each node", "Express each", "Swift
// answers"), not for every language name.
// Regression: the list of such words takes in names that mean nothing else in that place, and a
// sentence that binds one of them outside the few contexts the reader knows passes ("Port the probes
// to Rust.", "Assume the project is Java.").
// Why the implementer's tests miss it: the reading case of language-agnostic-kit plants only Go,
// node, Express and Swift; the other twenty words of COMMON have no case (measured on a copy of
// 592ec14: with COMMON reduced to the four words of the spec, the kit and every case still pass,
// and both sentences fail).
test('a language name with no English sense in its place counts outside a stack context (re-audit 1, N2)', () => {
  const port = principleTestOn(SHARED_AUDIT, after(STEP7, 'Port the probes to Rust.'));
  assert.notEqual(port.status, 0, '"Port the probes to Rust." passed the principle test');
  const assume = principleTestOn(SHARED_AUDIT, after(STEP7, 'Assume the project is Java.'));
  assert.notEqual(assume.status, 0, '"Assume the project is Java." passed the principle test');
});

// ---------------------------------------------------------------- re-audit 2 of part 5a
// Case added by the re-audit of fix 2 (.vibeflow/audits/vibeflow-agnostico-p5a-reaudit-2.md).

// Contract: P1 of part 5a with the C5 carve-out of fix 1, both ways at once: a language name with
// no English sense counts wherever it stands, a word with one ("Go to", "each node", "Express each",
// "Swift answers") passes where it is the English word, and a Go that names the language still counts.
// Regression: the common-word list grows again past the words with an English sense (Angular, Ruby,
// Rust back in it), or the stack-context reading widens so that one of the four English sentences
// fails the kit.
// Why the implementer's tests miss it: the reading case of language-agnostic-kit plants no
// "Swift answers" and no name outside the four, and case 9 above plants only Rust and Java; the
// other three sentences of N2 and the four control sentences of the spec had no case (measured on a
// copy of 7dd0bd1 with COMMON back at the twenty-four words of 592ec14: case 9 and this case fail).
test('the N2 sentences fail and the English-word controls pass, on a planted copy of the kit (re-audit 2, N2)', () => {
  for (const sentence of ['Prefer Rust.', 'Probe Angular components only.', 'The probes target Ruby gems.', 'Write the probes in Go.']) {
    const run = principleTestOn(SHARED_AUDIT, after(STEP7, sentence));
    assert.notEqual(run.status, 0, `"${sentence}" passed the principle test`);
  }
  const controls = principleTestOn(SHARED_AUDIT, after(STEP7, ['Go to the next phase.', 'Each node of the dependency graph is a module.',
    'Express each check as a behavior.', 'Swift answers beat slow ones.'].join(' ')));
  assert.equal(controls.status, 0, controls.output);
});
