// Re-audit probes for fix 2 of the vibeflow-leitura PR (M1 complete): which
// files step 5B of `audit` checks the rules against, in each of step 1's
// cases. They pin the sense of the skill text, not its exact wording, and they
// read 5B against step 1 of the same edition, which the implementer's
// contract test (`audit: 5B goes through every document, one by one`, in
// test/full-read-contracts.test.mjs) does not: it pins 5B's own phrases, one
// regex per case, and never looks at step 1. Each case states, as comments,
// the contract it protects, the plausible regression that breaks it and why
// the implementer's test misses it. A case marked `todo` asserts what an open
// low finding of the re-audit asks for: it runs and prints without failing.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const EDITIONS = {
  shared: 'plugins/vibeflow/skills/audit/SKILL.md',
  cursor: 'cursor/skills/vibeflow-audit/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-audit.prompt.md',
};

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');

function between(content, from, to, label) {
  const start = content.indexOf(from);
  assert.notEqual(start, -1, `${label}: anchor "${from}"`);
  const end = content.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `${label}: anchor "${to}" after "${from}"`);
  return content.slice(start, end);
}

// Step 1 (the review package) and the review paragraph of 5B, flattened.
function sections(path) {
  const raw = read(path);
  const step1 = flat(between(raw, '**Review package**', '**Spec**', path));
  const review = flat(between(raw, '**B. Pattern compliance**', '**C. Scenarios**', path));
  return { step1, review };
}

// The 5B sentence that says which files are under review: from "touch" up to
// the sentence that ties them to the report line.
function fileSet(review, label) {
  const start = review.indexOf('files under review touch');
  assert.notEqual(start, -1, `${label}: 5B names the files under review`);
  const end = review.indexOf('For each rule', start);
  assert.notEqual(end, -1, `${label}: 5B goes on to the rules`);
  return review.slice(start, end);
}

// Clauses of the file-set sentence, split on commas and "and"/"or" joins.
const clauses = (text) => text.split(/,|;|\. /).map((c) => c.trim()).filter(Boolean);

// Probe 1. Contract: 5B narrows the review to the files the spec names only
// in the case where step 1 has no diff at all (work already committed), which
// is the one case step 1 itself says "reviews the files the spec names". A
// missing kit or Node is not that case: there step 1 computes a diff by hand.
// Regression that breaks it: a rewording that ties the spec's files to "no
// package", "no kit" or "no Node" again (the M1 defect), in any wording, or
// that drops the committed-work condition. Why the implementer's test misses
// it: its negative assertion refuses one literal ("when step 1 found no
// package, the files the spec names"); "when there is no package, the spec's
// named files" or "without the kit, the files the spec names" pass it.
test('5B: the spec-named files are reviewed only when step 1 has no diff at all', () => {
  for (const [edition, path] of Object.entries(EDITIONS)) {
    const label = `audit ${edition}`;
    const { step1, review } = sections(path);
    assert.match(step1, /already committed on the default branch/, `${label}: step 1 has the committed-work case`);
    assert.match(step1, /reviews the files the spec names/, `${label}: step 1's committed-work case reviews the spec's files`);
    const set = fileSet(review, label);
    const specClauses = clauses(set).filter((c) => /spec names|spec's (named )?files|named by the spec/.test(c));
    assert.ok(specClauses.length > 0, `${label}: 5B says when the spec's files are the ones under review: "${set}"`);
    // The condition sits in the clause itself or in the clauses just before it
    // ("and only for work already committed, with no diff at all, the files
    // the spec names" splits on its commas): join the spec clause with the
    // two before it and the one after it, and check the condition there, so a
    // trailing "and also when there is no package" is seen too.
    const parts = clauses(set);
    for (const spec of specClauses) {
      const i = parts.indexOf(spec);
      const window = parts.slice(Math.max(0, i - 2), i + 2).join(', ');
      assert.match(window, /committed|no diff/, `${label}: the spec's files are tied to committed work with no diff: "${window}"`);
      assert.doesNotMatch(window, /no package|kit|Node/, `${label}: the spec's files are not tied to a missing package, kit or Node: "${window}"`);
    }
  }
});

// Probe 2. Contract: when step 1 computes the diff by hand (kit not installed,
// or no Node 18+), 5B reviews the files of that diff, and the condition 5B
// gives for that case names both of step 1's triggers. Regression that breaks
// it: step 1's hand-diff case goes away or changes its trigger while 5B still
// points at it, or 5B drops the hand-diff case and leaves a missing kit with
// no file set. Why the implementer's test misses it: it pins 5B's sentence by
// one regex and never reads step 1, so a step 1 that stops computing a diff
// for a missing kit leaves 5B pointing at nothing, with every test green.
test('5B: with no kit or no Node, the files under review are the diff step 1 computed by hand', () => {
  for (const [edition, path] of Object.entries(EDITIONS)) {
    const label = `audit ${edition}`;
    const { step1, review } = sections(path);
    const handCase = step1.match(/Kit not installed, or `node --version` shows no Node 18 or newer: compute the diff[^]*?(?= - )/);
    assert.ok(handCase, `${label}: step 1 computes the diff by hand when the kit or Node 18 is missing`);
    assert.match(handCase[0], /git diff/, `${label}: the hand-computed case runs git diff`);
    const set = fileSet(review, label);
    const diffClause = clauses(set).find((c) => /diff/.test(c) && /by hand|computed/.test(c));
    assert.ok(diffClause, `${label}: 5B has a clause for the hand-computed diff: "${set}"`);
    const near = clauses(set).slice(clauses(set).indexOf(diffClause), clauses(set).indexOf(diffClause) + 2).join(', ');
    assert.match(near, /kit/, `${label}: the hand-diff clause names the missing kit: "${near}"`);
    assert.match(near, /Node(\.js)? 18/, `${label}: the hand-diff clause names the missing Node 18: "${near}"`);
  }
});

// Probe 3. Contract: the review paragraph of 5B reads the same in the three
// editions (whitespace aside). Regression that breaks it: a later edit lands
// in one edition only, outside the phrases the contract test pins (the report
// line, the imported-document finding, a reworded case). Why the
// implementer's test misses it: it asserts phrases one by one per edition, so
// any text between them can drift unseen.
test('5B: the review paragraph reads the same in the three editions', () => {
  const texts = Object.fromEntries(Object.entries(EDITIONS).map(([edition, path]) => [edition, sections(path).review]));
  assert.equal(texts.cursor, texts.shared, 'cursor 5B drifted from the shared edition');
  assert.equal(texts.copilot, texts.shared, 'copilot 5B drifted from the shared edition');
});

// Probe 4, todo (finding R4, low). Contract: the package case of 5B covers a
// package step 1 read (`--package <path>` given, the re-audit's usual way) as
// well as one it built. Today the clause says "the package's files when step 1
// wrote one", and step 1 writes the package only when it builds it; with
// `--package` it reads it, so by the letter none of the three cases covers a
// re-audit with a given package. The case turns green when the package clause
// has no condition or names the given package too.
test('5B: the package case covers a package step 1 was given, not only one it wrote', { todo: 'R4: "when step 1 wrote one" leaves out --package' }, () => {
  for (const [edition, path] of Object.entries(EDITIONS)) {
    const label = `audit ${edition}`;
    const set = fileSet(sections(path).review, label);
    const pkg = clauses(set).find((c) => /package's files/.test(c));
    assert.ok(pkg, `${label}: 5B has a package clause`);
    assert.ok(!/when step 1 wrote/.test(pkg) || /given|read|--package/.test(pkg), `${label}: the package clause leaves out a given package: "${pkg}"`);
  }
});
