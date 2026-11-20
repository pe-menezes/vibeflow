// Behavior probes from the independent audit of vibeflow-residuos, part 1: the shared reader of the
// hosts that never substitute `${CLAUDE_SKILL_DIR}` (B7), and, from the third re-audit, the
// `descriptionText` reader of `test/distributions.test.mjs` on forms its own self-test leaves out.
// Each case states, as comments, the contract it protects, the plausible regression that breaks it
// and why the implementer's tests did not catch it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neverSubstitutedHosts } from '../kit-path-hosts.mjs';

// Contract: the shared reader enforces the floor each caller passes, every host of it and not only the first, and returns the rule's own host list when the floor is satisfied.
// Breaks when: a refactor of `test/kit-path-hosts.mjs` drops or shortcuts the floor loop (a default `floor = []`, a loop over a constant, a check of `floor[0]` only); both kit-path probes stay green, because today's rule names every host of both floors, and stop guarding the floor.
// Not covered by: the Hermes and OpenCode kit-path probes call the reader with floors the current rule satisfies, so they never reach its rejection; the implementer proved the rejection by mutating the `audit` skill by hand, which is not in the suite.
test('kit-path hosts: the shared reader refuses a floor host that the never-substituted rule does not name', () => {
  const hosts = neverSubstitutedHosts([]);
  assert.ok(hosts.length > 0, 'the rule names at least one host');
  assert.deepEqual(neverSubstitutedHosts(hosts), hosts, 'a floor the rule satisfies returns the rule hosts');
  const absent = 'Nohostnamed';
  assert.ok(!hosts.includes(absent));
  const refusal = { name: 'AssertionError', message: new RegExp(`^audit: the never-substituted rule names ${absent}: `) };
  assert.throws(() => neverSubstitutedHosts([absent]), refusal, 'a floor of one absent host is refused');
  assert.throws(() => neverSubstitutedHosts([...hosts, absent]), refusal, 'an absent host after the named ones is refused');
});

// `descriptionText` is not exported: the probes take the function out of the test file's own source
// and run it, so they exercise the reader as it is in the file, not a copy of it.
const DISTRIBUTIONS = join(dirname(dirname(fileURLToPath(import.meta.url))), 'distributions.test.mjs');
const descriptionText = (() => {
  const source = readFileSync(DISTRIBUTIONS, 'utf8');
  const start = source.indexOf('function descriptionText(');
  assert.ok(start !== -1, 'test/distributions.test.mjs defines descriptionText');
  const end = source.indexOf('\n}\n', start) + 3;
  return new Function('assert', `${source.slice(start, end)}; return descriptionText;`)(assert);
})();
const parse = (yaml) => descriptionText(`---\nname: x\n${yaml}\nagent: 'agent'\n---\n`, 'synthetic');
const unread = { name: 'AssertionError', message: /^synthetic: the description is in a form this test does not read/ };

// Contract: a block whose text YAML does not indent with spaces fails naming the file: a block line indented with a tab (YAML refuses the document) and a blank block line that holds a tab (YAML reads the tab as text) are refused, not read as `One` and as an empty line.
// Breaks when: the block indentation goes back to `/^\s*/` or `/^[ \t]*/`, or the blank-line test goes back to `trim()`, as in `8c6e552`, which read `>\n\tOne` as `One` (js-yaml and Psych both refuse it) and `>\n  One\n  \t\n  two` as `One\ntwo` (both read `One\n\t\ntwo`).
// Not covered by: the self-test of the reader in `test/distributions.test.mjs` has no block with a tab; with the indentation measured by `/^[ \t]*/` and no tab check, it stays green (re-audit 3, mutation on a copy).
test('description reader: a block indented with a tab, or with a tab on a blank line, fails naming the file', () => {
  assert.throws(() => parse('description: >\n\tOne'), unread, 'tab-indented block');
  assert.throws(() => parse('description: |\n\tOne\n\ttwo'), unread, 'tab-indented literal block');
  assert.throws(() => parse('description: >\n  One\n  \t\n  two'), unread, 'blank block line with a tab');
  // A tab after the indentation is text, and makes the line more indented, as in YAML.
  assert.equal(parse('description: >\n  One\n  \ttwo\n  three'), 'One\n\ttwo\nthree');
});

// Contract: a comment after a closing quote is dropped only after the quoted text is read whole: `''` inside single quotes and `\"` inside double quotes are part of the text even when a ` # ` follows them inside the quotes.
// Breaks when: the comment is cut from the line before the quotes are matched (the plain-value `replace(/[ \t]+#.*$/, '')` moved up to the one-line value), so `'a'' # x'` fails as text after the closing quote and `"a\" # b" # c` fails as an unclosed quote.
// Not covered by: the self-test's comment cases (`'One' # unchanged text`, `"One" # unchanged text`, `'It''s one'\t# note`) have no ` # ` inside the quotes, so with the cut moved up it stays green (re-audit 3, mutation on a copy); a lazy single-quote match, by contrast, the self-test already catches.
test('description reader: a hash inside quotes is text, and only the comment after the closing quote is dropped', () => {
  assert.equal(parse("description: 'a'' # x'"), "a' # x");
  assert.equal(parse("description: 'It''s' # c'"), "It's");
  assert.equal(parse("description: 'a''' # x"), "a'");
  assert.equal(parse('description: "a\\" # b" # c'), 'a" # b');
  assert.equal(parse('description: "a" \t # c'), 'a');
  assert.throws(() => parse("description: 'a' 'b'"), unread, 'a second quoted value after the first');
});

// Contract: a plain value that a YAML 1.2 or 1.1 reader takes as a number or a timestamp in its less common forms fails naming the file (base 60, `_` digit groups, a leading or trailing dot, an exponent without a dot, `+.INF`, `0b`, a timestamp with a time, `On`, `~` before a comment), while a value that only looks like one stays text.
// Breaks when: the number form is narrowed to digits with an optional fraction, the YAML 1.1 forms are dropped, or the date form loses its time part; each of those values then reads as text, while js-yaml or Psych give a number, a boolean, a date or null.
// Not covered by: the self-test refuses `42`, `-1.5e3`, `.inf`, `.NaN`, `0x1F`, `0o17` and a bare date, which a narrower number form and a date form without time still refuse.
test('description reader: plain values YAML reads as numbers, timestamps, booleans or null in their rarer forms fail naming the file', () => {
  for (const plain of ['On', '~ # to be written', '0755', '1_000', '1:30', '1:30.5', '.5', '5.', '1e3', '+.INF', '0b101', '2026-11-20T10:00:00Z', '2026-11-20 10:00:00']) {
    assert.throws(() => parse(`description: ${plain}`), unread, plain);
  }
  for (const plain of ['2026-11-20 extra', '.', '+', '-foo', '?foo', 'see https://x.y/z', 'a#b', 'true # c']) {
    assert.equal(parse(`description: ${plain}`), plain, plain);
  }
});

// Gap (low, re-audit 3; open, same class as C3-a to C3-c, present since before the third fix): a block line of spaces only, more indented than the block, is text in YAML, and the reader reads it as an empty line. In a folded block that changes the line breaks a host shows: js-yaml and Psych read `>\n  One\n    \n  two` as `One\n  \ntwo`, the reader returns `One\ntwo`; and a leading line of that kind (`>\n    \n  One`) makes both refuse the document while the reader returns `\nOne`. The case passes when the reader refuses those forms or returns YAML's text.
test('description reader: a block line of spaces only, more indented than the block, is refused or read as YAML reads it', { todo: 're-audit 3, low: whitespace-only block lines are read as empty lines' }, () => {
  const folded = 'description: >\n  One\n    \n  two';
  let text;
  try {
    text = parse(folded);
  } catch (error) {
    assert.match(error.message, unread.message);
  }
  if (text !== undefined) assert.equal(text, 'One\n  \ntwo', folded);
  assert.throws(() => parse('description: >\n    \n  One'), unread, 'a leading spaces-only line longer than the indentation');
});
