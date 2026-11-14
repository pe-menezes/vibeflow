// Audit probes for vibeflow-base, pull request review, re-audit of fix round 3 (N1, the reader of
// knowledge paths in check-briefing.mjs). Behavior only, held by content, over the missing-base
// fixture. Each probe answers in the re-audit report (.vibeflow/audits/vibeflow-base-pr-reaudit-3.md)
// which contract it holds, which regression breaks it and why the executor's tests do not catch it.
// A case marked `todo` asserts what a known low gap asks for: it runs and prints without failing
// the suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { hermeticEnv, runScript } from '../loop-helpers.mjs';
import { makeMissingBase } from '../fixtures/missing-base/make.mjs';

function withFixture(run) {
  const dest = mkdtempSync(join(tmpdir(), 'vibeflow-base-pr3-probe-'));
  try {
    return run(makeMissingBase(join(dest, 'fx'), {}));
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

const envFor = (fx) => hermeticEnv(fx.home, { HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', NO_PROXY: '' });

const EXECUTOR = (knowledge) => `# cart-total · 1 · executor

## Asked
The cart total.

## Done when
* DoD 1: cartTotal returns the formatted sum

## Read first
* project knowledge: \`.vibeflow/index.md\`
* pattern: ${knowledge}

## Facts
* the suite passes 2 of 2 (measured 08:13 by \`npm test\`)

## Perimeter
* may change: \`src/cart.js\`

## Verification contract
* red before green

## Ceiling
* 400k tokens

## Progress and delivery
* progress file
`;

const DOC = '.vibeflow/patterns/doc.md';

function briefing(fx, knowledge) {
  const path = join(fx.main, '.vibeflow/briefings/cart-total-1-executor.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, EXECUTOR(knowledge));
  const result = runScript('check-briefing.mjs', [path], envFor(fx));
  const stops = result.stdout.split('\n').filter((line) => line.startsWith('[stop] knowledge file'))
    .map((line) => line.replace('[stop] knowledge file the briefing points at does not exist: ', ''));
  return { ...result, stops };
}

// Missing, the citation stops on DOC alone with exit 2; created, the same citation has no stop.
function stopsMissingPassesPresent(fx, label, cited) {
  const failures = [];
  const missing = briefing(fx, cited);
  if (missing.status !== 2 || missing.stops.length !== 1 || missing.stops[0] !== DOC) {
    failures.push(`missing, ${label}: exit ${missing.status}, ${JSON.stringify(missing.stops)}`);
  }
  writeFileSync(join(fx.main, DOC), '# Now it exists\n');
  const present = briefing(fx, cited);
  rmSync(join(fx.main, DOC));
  if (present.stops.length) failures.push(`present, ${label}: ${JSON.stringify(present.stops)}`);
  return failures;
}

const each = (forms) => withFixture((fx) => {
  const failures = forms.flatMap(([label, cited]) => stopsMissingPassesPresent(fx, label, cited));
  assert.deepEqual(failures, [], failures.join('\n'));
});

// --- N1: forms the executor's table does not generate, read right by fix 3 ---

test('probe N1: a code span holding a command around one knowledge path checks that path', () => {
  each([
    ['cat in a code span', `\`cat ${DOC}\``],
    ['cp to another folder in a code span', `\`cp ${DOC} docs/\``],
    ['open with a line in a code span', `\`open ${DOC}:12\``],
  ]);
});

test('probe N1: a line or an anchor followed by closing punctuation, emphasis or a link\'s end still ends at the .md', () => {
  each([
    ['a line, then a closing parenthesis', `(see ${DOC}:12)`],
    ['a range in bold', `**${DOC}:12-30**`],
    ['an anchor in a link target, glued to the next word', `[doc](${DOC}#totals)then`],
    ['a line in italics with _, then a comma', `_${DOC}:4_, then`],
    ['a line in a quoted code span', `"\`${DOC}:12\`"`],
    ['a line and a colon at the end of the sentence', `see ${DOC}:12:`],
    ['a GitHub line anchor', `${DOC}#L12`],
    ['an anchor with spaces in a code span', `\`${DOC}#Totals and rounding\``],
  ]);
});

test('probe N1: a path that is both a link\'s text and its target, an HTML href, a tab or the end of the line', () => {
  each([
    ['link text and target', `[${DOC}](${DOC}) here`],
    ['an HTML href', `<a href="${DOC}">doc</a> here`],
    ['a tab after the path', `${DOC}\there`],
    ['the end of the line', `${DOC}`],
    ['a line in parentheses after a space', `${DOC} (12)`],
  ]);
});

// --- low gaps, regressions against the base aad2dba since fix 2 (c0bbcd5); not in fix 3's diff ---

test('probe L1: a missing pattern doc in curly quotes, guillemets, with a glued en dash or a :L12 line still stops', { todo: 'low gap L1 (re-audit 3): the base stopped on each, fix 2 and fix 3 pass them with exit 0' }, () => {
  each([
    ['curly double quotes', `“${DOC}” here`],
    ['curly single quotes', `‘${DOC}’ here`],
    ['a possessive with ’', `${DOC}’s rule`],
    ['guillemets', `«${DOC}» here`],
    ['an en dash glued to the next word', `${DOC}–then`],
    ['an en dash at the end', `${DOC}– then`],
    ['a :L12 line', `${DOC}:L12`],
    ['a :L12 line in a code span', `\`${DOC}:L12\``],
    ['two lines glued with a comma', `${DOC}:12,30`],
  ]);
});

test('probe L2: a code span with one knowledge path next to another Markdown file stops only when the knowledge file is missing', { todo: 'low gap L2 (re-audit 3): rule 1 reads the whole span as one path, so an existing doc stops' }, () => {
  each([
    ['and a file outside .vibeflow/', `\`${DOC} and src/notes.md\``],
    ['comma and a file outside .vibeflow/', `\`${DOC}, docs/a.md\``],
  ]);
});
