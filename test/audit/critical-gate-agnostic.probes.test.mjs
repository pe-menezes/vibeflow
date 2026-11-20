// Behavior probes from the independent audit of part 2a of the language-agnostic work: step 4 of
// the audit (the Critical Gate) chooses nothing by a file's language or extension, reads a mention
// apart from the behaviour, and reads the same in the three editions. Behavior only, pinned by
// content, never by line number. Each case states, as comments, the contract it protects, the
// plausible regression that breaks it, and why the implementer's tests did not catch it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractOutputFormat, extractStep } from '../fixtures/gate-languages/gate-prompt.mjs';
import { LANGUAGES } from '../fixtures/gate-languages/matrix.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const EDITIONS = {
  shared: 'plugins/vibeflow/skills/audit/SKILL.md',
  cursor: 'cursor/skills/vibeflow-audit/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-audit.prompt.md',
};
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const editions = () => Object.entries(EDITIONS).map(([edition, path]) => [edition, read(path)]);

// --- the extension of a language never chooses what Security and Data look at ------------------

// An extension written as any glob (`*.py`, `**/*.py`, `*.py/*.js`, `*.{js,ts}`) or as the dotted
// suffix of one of the fixture's languages standing alone (`.py`, `(.ts`); a runtime name such as
// "Node.js" is not an extension.
const EXTENSIONS = LANGUAGES.map((language) => language.extension.slice(1));
function listsExtension(text) {
  if (/\*\.[A-Za-z0-9{]/.test(text)) return true;
  return EXTENSIONS.some((ext) => new RegExp(`(^|[^A-Za-z0-9])\\.${ext}(?![A-Za-z0-9])`, 'i').test(text));
}

function domainLine(step, name) {
  return step.find((line) => new RegExp(`^\\s+_${name}_\\s+—`).test(line)) ?? null;
}

test('probe: the extension check sees every glob form and leaves a runtime name alone', () => {
  for (const sample of ['where: source (`**/*.py`, `**/*.js`)', 'where: source files *.py/*.js/*.ts', 'where: `*.{js,ts}`', 'where: code (.py, .rs)', 'files: source (`*.py,*.js`)']) {
    assert.equal(listsExtension(sample), true, sample);
  }
  for (const sample of ['where: application code, scripts and configuration, in any language', 'where: a Node.js or ASP.NET service']) {
    assert.equal(listsExtension(sample), false, sample);
  }
});

// Contract: the Security and Data domain lines list no language extension in any form (spec,
// part 2a, criterion 5; technical decision 2: an extension never chooses what to look at), in each
// of the three editions.
// Breaks when: an edition puts the source globs back on the Security or Data line written as
// `**/*.py` or `*.py/*.js` (the forms the old Database line used, `**/migrations/*`).
// Missed by the implementer's tests because: their EXTENSION pattern needs the extension preceded by
// a space, a backtick, a parenthesis, a comma or a semicolon and followed by the same set, so
// `**/*.py` (preceded by `/`) and `*.py/*.js` (followed by `/`) pass it; both forms survived a
// mutation of the three editions.
test('probe: the Security and Data domain lines list no extension, in any glob form, in the three editions', () => {
  for (const [edition, raw] of editions()) {
    const step = extractStep(raw);
    assert.ok(step, `${edition}: the Critical Gate step`);
    for (const name of ['Security', 'Data']) {
      const line = domainLine(step, name);
      assert.ok(line, `${edition}: the ${name} domain line`);
      assert.equal(listsExtension(line), false, `${edition}: the ${name} domain line lists an extension: ${line.trim()}`);
    }
  }
});

// --- a file's type, its language or a domain's "where" never filters the scan -------------------

// Item b of step 4, from its "b." line to the "c." line, and the catalog's opening paragraph, as
// sentences with the bold marks taken out.
function gateSentences(step) {
  const from = step.findIndex((line) => /^\s+b\.\s+\*\*Match each changed line/.test(line));
  const to = step.findIndex((line, i) => i > from && /^\s+c\.\s/.test(line));
  const header = step.findIndex((line) => /^\s+\*\*Rules Catalog/.test(line));
  const headerEnd = step.findIndex((line, i) => i > header && line.trim() === '');
  assert.ok(from >= 0 && to > from && header > to && headerEnd > header, 'item b and the catalog header are found');
  const text = [...step.slice(from, to), ...step.slice(header, headerEnd)].join(' ').replace(/\*\*/g, '').replace(/\s+/g, ' ');
  return text.split(/(?<=\.)\s+/);
}

// A sentence that ties firing to a file's type, extension or domain.
const firingOnType = (sentence) => /^A rule fires\b/.test(sentence) && /\btypes?\b|\bextensions?\b|\bdomain'?s?\b|\bwhere\b/i.test(sentence);
// A sentence that lets a file's type, language, extension or a domain's "where" take a file out
// or filter, without saying "never".
const filtersOnType = (sentence) =>
  /\btypes?\b|\blanguages?\b|\bextensions?\b|"where"/i.test(sentence) &&
  /\bout of the scan\b|\bleft out\b|\bleave out\b|\bfilter\b|\bskip/i.test(sentence) &&
  !/\bnever\b/i.test(sentence);

test('probe: the type check catches a rule tied to the file type, and leaves the measured text alone', () => {
  assert.equal(firingOnType("A rule fires when the line does what the rule describes, in a file of one of the domain's types."), true);
  assert.equal(filtersOnType("A file's type tells which behaviours it can hold; a file whose language is not named here is left out of the scan."), true);
  assert.equal(filtersOnType('A domain\'s "where" says where that behaviour usually lives, as a filter.'), true);
  assert.equal(firingOnType('A rule fires when the line does what the rule describes, in whatever language or format the file is written.'), false);
  assert.equal(filtersOnType("A file's type tells which behaviours it can hold; it never takes the file out of the scan because its language is not named here."), false);
});

// Contract: in the three editions, item b fires a rule on what the line does and never on the file
// (spec, part 2a, change 1: "the type of the file never takes a file out of the scan"), and the
// catalog's "where" is a guide, never a filter (change 2).
// Breaks when: a rewrite of item b ties the rule to the file in new words ("in a file of one of the
// domain's types"), lets a language not named take a file out of the scan, or turns the catalog's
// "where" into a filter. Each of these three survived a mutation of the three editions.
// Missed by the implementer's tests because: they pin the old words ("target types", "the file
// matches") and the bold titles of the three rules, not what the rule bodies and the catalog
// header say about a file's type.
test('probe: no sentence of item b or the catalog header lets a file type, a language or a "where" choose what is scanned', () => {
  for (const [edition, raw] of editions()) {
    const sentences = gateSentences(extractStep(raw));
    for (const sentence of sentences) {
      assert.equal(firingOnType(sentence), false, `${edition}: a rule fires on the file type: ${sentence}`);
      assert.equal(filtersOnType(sentence), false, `${edition}: a type, language or "where" filters the scan: ${sentence}`);
    }
    assert.ok(sentences.some((sentence) => /^A rule fires when\b/.test(sentence)), `${edition}: item b says when a rule fires`);
  }
});

// --- a mention does not fire, and doubt fires --------------------------------------------------

// Contract: in the three editions, a comment, a string shown to a person, a test name and
// documentation prose do not fire a rule, and a line the auditor cannot place is treated as doing
// the behaviour (spec, part 2a, change 1: "na dúvida, dispara"; technical decision 4).
// Breaks when: the bullet is rewritten so that the mentions fire ("documentation prose fire too")
// or the doubt goes the other way ("When you cannot tell, do not fire"); both survived a mutation of
// the three editions.
// Missed by the implementer's tests because: they check that the words "comment" and "test name"
// appear in item b, not which way the rule goes.
test('probe: item b says the mentions do not fire and that doubt fires, in the three editions', () => {
  for (const [edition, raw] of editions()) {
    const sentences = gateSentences(extractStep(raw));
    const mention = sentences.find((sentence) => /\bcomment\b/i.test(sentence) && /\btest name\b/i.test(sentence));
    assert.ok(mention, `${edition}: one sentence lists the comment and the test name`);
    assert.match(mention, /\bdo not fire\b/, `${edition}: the mentions do not fire: ${mention}`);
    const doubt = sentences.find((sentence) => /^When you cannot tell\b/.test(sentence));
    assert.ok(doubt, `${edition}: item b says what to do in doubt`);
    assert.doesNotMatch(doubt, /\bnot\b|\bskip|\bleave\b|\bignore/i, `${edition}: doubt does not fire: ${doubt}`);
    assert.match(doubt, /\bdoing it\b|\bfires?\b/i, `${edition}: doubt fires: ${doubt}`);
  }
});

// --- the three editions ask for the same Critical Gate section -----------------------------------

// Contract: the lines of the `### Critical Gate` section of the output format, the ones gate-prompt
// sends with the step, read the same in the three editions (spec, part 2a, criterion 2: the output
// block stays byte for byte the same in the three).
// Breaks when: one edition's `Scanned:` line keeps its shape but drifts in wording (drops the second
// `<path> (<why>)`, or "of <m>"), its one-finding-per-line note is shortened, or its "Clean" line
// is dropped; each survived a mutation of the Copilot edition alone.
// Missed by the implementer's tests because: they check the shape of the two new lines by pattern in
// each edition on its own, and test/audit-contracts.test.mjs compares byte for byte only the block
// from item b to the end of the catalog, not the output format.
test('probe: the Critical Gate section of the output format reads the same in the three editions', () => {
  const blocks = Object.fromEntries(editions().map(([edition, raw]) => [edition, extractOutputFormat(raw)]));
  assert.ok(blocks.shared && blocks.shared.length > 0, 'shared: the output section is found');
  assert.deepEqual(blocks.cursor, blocks.shared, 'cursor: the Critical Gate output section differs from the shared edition');
  assert.deepEqual(blocks.copilot, blocks.shared, 'copilot: the Critical Gate output section differs from the shared edition');
});
