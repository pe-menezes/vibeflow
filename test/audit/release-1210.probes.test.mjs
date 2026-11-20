// Audit probes for the 1.21.0 release (vibeflow-release-1210, part 1): the
// shape of CHANGELOG.md that every cut relies on. Already held elsewhere, and
// not repeated here: the newest entry carries the manifests' version
// (vibeflow-leitura-4.probes) and names no CLI later than cli/package.json
// (release-1201.probes). Each probe runs its check on the file and on a copy
// of the file with the regression it guards against, so the probe shows it
// bites without touching the tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const changelog = () => readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');

// Every "### vX.Y.Z" heading, in file order, with its date when it has one.
function headings(text) {
  return [...text.matchAll(/^### v(\d+\.\d+\.\d+)\b(?: \((\d{4}-\d{2}-\d{2})\))?/gm)].map((m) => ({
    version: m[1],
    date: m[2] ?? null,
  }));
}

// Problems with the entry list: a version with two entries, or a dated entry
// older than a dated entry below it (entries go newest first).
function headingProblems(text) {
  const problems = [];
  const seen = new Set();
  const list = headings(text);
  for (const h of list) {
    if (seen.has(h.version)) problems.push(`v${h.version} has more than one entry`);
    seen.add(h.version);
  }
  const dated = list.filter((h) => h.date);
  for (let i = 0; i + 1 < dated.length; i++) {
    if (dated[i].date < dated[i + 1].date) {
      problems.push(`v${dated[i].version} (${dated[i].date}) sits above v${dated[i + 1].version} (${dated[i + 1].date})`);
    }
  }
  return problems;
}

// The text with its newest dated heading moved to one day before the next
// dated heading, so the order check must report it.
function datedBelowNext(text) {
  const dated = headings(text).filter((h) => h.date);
  const day = new Date(`${dated[1].date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  const before = day.toISOString().slice(0, 10);
  return text.replace(/^(### v\d+\.\d+\.\d+ \()\d{4}-\d{2}-\d{2}\)/m, (_, head) => `${head}${before})`);
}

// The text with a new entry on top, both read from the file: the minor version
// after the newest entry's (X.Y+1.0), dated one year after the newest dated
// entry, on the same day and month.
function releaseAYearLater(text) {
  const list = headings(text);
  const [major, minor] = list[0].version.split('.').map(Number);
  const [, year, monthDay] = /^(\d{4})-(\d{2}-\d{2})$/.exec(list.find((h) => h.date).date);
  const heading = `### v${major}.${minor + 1}.0 (${Number(year) + 1}-${monthDay})`;
  return text.replace(/^### v/m, `${heading}\n\n* next.\n\n### v`);
}

// Problems with the "[#N](url)" links: the URL must be this repository's
// pull request or issue N, the number the reader sees; a "#..." fragment or a
// "?..." query after the number is allowed.
function linkProblems(text) {
  const problems = [];
  for (const m of text.matchAll(/\[#(\d+)\]\(([^)\s]+)\)/g)) {
    const [, shown, url] = m;
    const target = /^https:\/\/github\.com\/pe-menezes\/vibeflow\/(?:pull|issues)\/(\d+)(?:[#?].*)?$/.exec(url);
    if (!target) problems.push(`[#${shown}] points outside pe-menezes/vibeflow pulls and issues: ${url}`);
    else if (target[1] !== shown) problems.push(`[#${shown}] points at #${target[1]}: ${url}`);
  }
  return problems;
}

// Contract: entries go newest first and each version has one entry, so "the
// first heading is the newest release", which the leitura-4 and release-1201
// probes read, is true, and the release page built from the heading is the one
// the cut wrote.
// Breaks when: a cut writes the date of the previous release or a wrong year
// in its heading (v1.21.0 (2025-11-20)), or assembles the file with the new
// entry twice (once on top, once pasted again lower down).
// Not covered by: vibeflow-leitura-4 reads only the first heading's version and
// release-1201 only the CLI numbers of the newest entry; no test reads the dates
// or a second heading of the same version.
test('CHANGELOG entries are newest first and each version has one entry', () => {
  const text = changelog();
  assert.ok(headings(text).length > 1, 'CHANGELOG.md has fewer than two "### vX.Y.Z" entries');
  assert.deepEqual(headingProblems(text), []);

  // The check bites: the newest dated heading dated one day before the dated
  // heading below it, and the newest entry pasted again under the second one.
  const [first] = headings(text);
  assert.ok(headingProblems(datedBelowNext(text)).length > 0, 'a newest entry dated before the entry below it went unnoticed');
  // The control holds when the next release comes exactly a year after the
  // previous one (a year back would equal the date below and stay valid). The
  // version and the date come from the file, so the control holds after the
  // next cut too.
  const nextYear = releaseAYearLater(text);
  assert.deepEqual(headingProblems(nextYear), [], 'a release one year after the previous one was reported');
  assert.ok(headingProblems(datedBelowNext(nextYear)).length > 0, 'the control went quiet on a release one year after the previous one');
  const lines = text.split('\n');
  const starts = lines.flatMap((l, i) => (/^### v\d+\.\d+\.\d+\b/.test(l) ? [i] : []));
  const entry = lines.slice(starts[0], starts[1]);
  const pastedTwice = [...lines.slice(0, starts[2] ?? lines.length), ...entry, ...lines.slice(starts[2] ?? lines.length)].join('\n');
  assert.ok(
    headingProblems(pastedTwice).some((p) => p.startsWith(`v${first.version} `)),
    'the newest entry pasted twice went unnoticed',
  );
});

// Contract: a "[#N](url)" link in the changelog leads to pull request or issue
// N of this repository (the owner's 2026-11-19 decision: each site item names
// its PR "with the PR as a full link").
// Breaks when: a new item is written from an older one and only the text of the
// link changes ("[#62](.../pull/59)"), so the release page sends the reader to
// another change.
// Not covered by: no test reads the links of CHANGELOG.md.
test('every [#N] link in CHANGELOG.md points at pull request or issue N of this repository', () => {
  const text = changelog();
  assert.ok([...text.matchAll(/\[#\d+\]\(/g)].length > 0, 'CHANGELOG.md has no [#N] link');
  assert.deepEqual(linkProblems(text), []);

  // The check bites: the first link's URL keeps another number, and a link to a fork.
  const swapped = text.replace(/\[#(\d+)\]\((https:\/\/github\.com\/pe-menezes\/vibeflow\/(?:pull|issues)\/)\d+\)/, (_, n, base) => `[#${n}](${base}${Number(n) + 1})`);
  assert.ok(linkProblems(swapped).length > 0, 'a link whose URL names another number went unnoticed');
  const forked = text.replace(/\[#(\d+)\]\(https:\/\/github\.com\/pe-menezes\/vibeflow\//, (_, n) => `[#${n}](https://github.com/someone/vibeflow/`);
  assert.ok(linkProblems(forked).length > 0, 'a link to another repository went unnoticed');
  // A right link may carry a fragment or a query; the number before it still counts.
  const base = 'https://github.com/pe-menezes/vibeflow';
  assert.deepEqual(linkProblems(`[#62](${base}/pull/62#discussion_r123)`), [], 'a right link with a fragment was reported');
  assert.deepEqual(linkProblems(`[#62](${base}/pull/62?tab=files)`), [], 'a right link with a query was reported');
  assert.ok(linkProblems(`[#62](${base}/pull/59#discussion_r123)`).length > 0, 'a fragment hid a link to another number');
});
