// Behavior probes from independent audits of spec hardening: the smoke
// harness's DoD counter in test/assertions.mjs and the analyze incremental
// check (its git log date boundary and the block-only run). Each case states,
// as comments, the contract it protects, the plausible regression that breaks
// it, and why the implementer's tests did not catch it. Dates are fixed in
// fixtures and git's "now" is pinned with GIT_TEST_DATE_NOW, so nothing
// depends on the real clock. A case marked `todo` asserts what a known open
// gap asks for: it runs and prints without failing the suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertGenSpec } from '../assertions.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const ANALYZE = {
  shared: 'plugins/vibeflow/skills/analyze/SKILL.md',
  cursor: 'cursor/skills/vibeflow-analyze/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-analyze.prompt.md',
};
const flat = (text) => text.replace(/\s+/g, ' ');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// Every inherited GIT_* variable is dropped: a hook or a pre-commit that exports
// GIT_DIR or GIT_INDEX_FILE would otherwise point the child at the real repository.
// HOME and XDG_CONFIG_HOME move to a scratch directory so global git config stays out.
function hermeticEnv(home) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  env.HOME = home;
  env.XDG_CONFIG_HOME = join(home, '.config');
  return env;
}

// ---- DoD counter of the smoke harness ----

function dodCount(body) {
  const fixture = mkdtempSync(join(tmpdir(), 'vibeflow-probe-dod-'));
  try {
    const specs = join(fixture, '.vibeflow', 'specs');
    mkdirSync(specs, { recursive: true });
    writeFileSync(join(specs, 'feature.md'), body);
    return assertGenSpec(fixture).find((c) => c.name === 'DoD has 3–7 binary checks');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

// Contract: the counter measures the top level from the DoD block, not at column 0, so indented checks count and the fields nested under them do not.
// Breaks when: the counter is "simplified" to column-0 items, or assumes the top level is column 0; either makes an indented DoD count 0 checks.
// Not covered by: the DoD counter case in test/assertions.test.mjs puts its checks at column 0, where both regressions give the same answer.
test('DoD counter: indented checks still count, their nested fields do not', () => {
  const dod = dodCount(`
## Definition of Done
  1. Deleting a task removes it — \`node --test test/deleteTask.test.js\` passes.
     - Scenarios:
       - WHEN the task exists THE SYSTEM SHALL remove it and return ok
  2. Unknown ids change nothing in the store at all.
  3. No violations of the Don'ts in conventions.md.

## Scope
- src/services/deleteTask.js
`);
  assert.equal(dod.detail, '3 checks');
  assert.equal(dod.ok, true);
});

// Contract: indentation by tab is indentation; fields nested by tab under a check stay fields.
// Breaks when: indentation is measured by spaces only, so tab-nested `WHEN` lines count as checks again.
// Not covered by: the DoD counter case in test/assertions.test.mjs indents with spaces only.
test('DoD counter: tab-indented scenario lines are fields, not checks', () => {
  const dod = dodCount([
    '## Definition of Done',
    '1. Deleting a task removes it — `node --test test/deleteTask.test.js` passes.',
    '\t- Scenarios:',
    '\t\t- WHEN the task exists THE SYSTEM SHALL remove it and return ok',
    '\t\t- WHEN the id is unknown THE SYSTEM SHALL return not-found',
    '\t- For any list of tasks, deleting one leaves the others unchanged.',
    '2. No violations of the Don\'ts in conventions.md.',
    '',
    '## Scope',
    '- src/services/deleteTask.js',
    '',
  ].join('\n'));
  assert.equal(dod.detail, '2 checks');
  assert.equal(dod.ok, false);
});

// Contract: the DoD example gen-spec teaches (a check with its `Scenarios:` field) is counted by the smoke counter as exactly the checks it numbers, in each edition.
// Breaks when: the example is rewritten in one edition with its fields at check level, or the counter starts reading the plain `WHEN` lines as items; the smoke then reports more checks than the spec has.
// Not covered by: test/spec-contracts.test.mjs checks the phrases and test/assertions.test.mjs uses its own fixture; nothing joins the taught format to the counter.
test('DoD counter: agrees with the DoD example gen-spec teaches, in every edition', () => {
  for (const path of [
    'plugins/vibeflow/skills/gen-spec/SKILL.md',
    'cursor/skills/vibeflow-gen-spec/SKILL.md',
    'copilot/github/prompts/vibeflow-gen-spec.prompt.md',
  ]) {
    const raw = readFileSync(join(ROOT, path), 'utf8');
    const fences = [...raw.matchAll(/^[ \t]*```[^\n]*\n([\s\S]*?)\n[ \t]*```/gm)].map((m) => m[1]);
    const example = fences.find((f) => /THE SYSTEM SHALL/.test(f));
    assert.ok(example, `${path}: a DoD example with a scenario`);
    const lines = example.split('\n');
    const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)[0].length));
    const dedented = lines.map((l) => l.slice(pad)).join('\n');
    const numbered = (dedented.match(/^\d+\.\s/gm) ?? []).length;
    assert.ok(numbered >= 1, `${path}: the example numbers its checks`);
    const dod = dodCount(`
## Definition of Done
${dedented}
${numbered + 1}. No violations of the Don'ts in conventions.md.
${numbered + 2}. Every new module follows the naming pattern of its neighbours.

## Scope
- src/services/deleteTask.js
`);
    assert.equal(dod.detail, `${numbered + 2} checks`, path);
  }
});

// Contract: the counter's verdict holds the DoD limit at both ends of 3–7: seven checks, each with its fields, pass, and an eighth check fails.
// Breaks when: the upper bound drifts (`<= 8`, `< 7`), or fields nested under the checks start counting and push a seven-check DoD over the limit.
// Not covered by: test/assertions.test.mjs and the other DoD counter cases stop at three checks or fewer, so nothing reaches the upper bound.
test('DoD counter: seven checks with nested fields pass, an eighth check fails', () => {
  const checks = (n) => Array.from({ length: n }, (_, i) => [
    `${i + 1}. Check number ${i + 1} holds — \`node --test test/check${i + 1}.test.js\` passes.`,
    '   - Scenarios:',
    `     - WHEN input ${i + 1} arrives THE SYSTEM SHALL record it`,
  ].join('\n')).join('\n');
  const spec = (n) => `
## Definition of Done
${checks(n)}

## Scope
- src/services/deleteTask.js
`;
  const seven = dodCount(spec(7));
  assert.equal(seven.detail, '7 checks');
  assert.equal(seven.ok, true);
  const eight = dodCount(spec(8));
  assert.equal(eight.detail, '8 checks');
  assert.equal(eight.ok, false);
});

// ---- analyze: the incremental check ----

function incrementalParagraph(raw) {
  const at = raw.indexOf('**Incremental mode.**');
  assert.ok(at !== -1, 'an "Incremental mode." paragraph');
  const end = raw.indexOf('\n\n', at);
  return raw.slice(at, end === -1 ? undefined : end);
}

// Contract: the block-only incremental run writes `Analyzed:`, and the date it writes is today, in the clause itself or through the Phase 4 index.md rule it follows, in the three editions.
// Breaks when: the clause is "simplified" to "regenerate only the block", or Phase 4 drops "update `Analyzed: <date>` to today"; the same test or CI change then keeps the block due and the block is regenerated (and, with `--measure`, the suite measured) again on every run.
// Not covered by: the tests-only refresh test in test/spec-contracts.test.mjs stops at "regenerate only the block", and the own-clause test there reads the clause alone, never the Phase 4 rule it points at.
test('analyze block-only run: advances Analyzed, so the same change is not due again', () => {
  for (const path of Object.values(ANALYZE)) {
    const raw = read(path);
    const at = raw.indexOf('**Incremental mode.**');
    assert.ok(at !== -1, `${path}: incremental mode paragraph`);
    const end = raw.indexOf('\n\n', at);
    const phase0 = flat(raw.slice(at, end === -1 ? undefined : end));
    const blockOnly = /block is due but nothing else changed → (.*?) report "/i.exec(phase0);
    assert.ok(blockOnly, `${path}: a block-only path in Phase 0`);
    assert.match(blockOnly[1], /`Analyzed:/, `${path}: the block-only run writes Analyzed`);
    // "today" either in the clause itself or in the Phase 4 index.md rule it follows.
    const p4 = raw.indexOf('## Phase 4');
    const phase4 = p4 === -1 ? '' : flat(raw.slice(p4, raw.indexOf('\n## ', p4 + 1)));
    assert.ok(/today/i.test(blockOnly[1]) || /`Analyzed: <date>` to today/.test(phase4),
      `${path}: the Analyzed the block-only run writes is today's date`);
  }
});

const ANALYZED = '2020-01-15';
// Wall-clock commit times, read in the zone under test. The oracle: a commit
// counts exactly when its wall time is at or after midnight of the Analyzed date,
// whatever git's "now" is.
const COMMITS = [
  '2020-01-14 23:59:59',
  '2020-01-15 00:00:00',
  '2020-01-15 00:00:01',
  '2020-01-15 12:00:00',
  '2020-01-16 08:00:00',
  '2020-02-01 00:00:00',
];
const fileOf = (when) => `c-${when.replace(/[ :]/g, '_')}.txt`;
const EXPECTED = COMMITS.filter((when) => when >= `${ANALYZED} 00:00:00`).map(fileOf).sort();

function withHistory(zone, run) {
  const repo = mkdtempSync(join(tmpdir(), 'vibeflow-probe-since-'));
  const env = { ...hermeticEnv(repo), TZ: zone, GIT_CONFIG_NOSYSTEM: '1' };
  const git = (args, extra = {}) => {
    const result = spawnSync('git', args, { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout;
  };
  try {
    git(['init', '-q']);
    for (const when of COMMITS) {
      writeFileSync(join(repo, fileOf(when)), `${when}\n`);
      git(['add', fileOf(when)]);
      git(['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', when],
        { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when });
    }
    const epochs = Object.fromEntries(git(['log', '--format=%ct %s']).trim().split('\n')
      .map((line) => { const [ct, ...subject] = line.split(' '); return [subject.join(' '), Number(ct)]; }));
    const midnight = epochs[`${ANALYZED} 00:00:00`];
    // git's "now": just after midnight, noon, the last second of the day, a month later.
    const nows = [midnight + 30, midnight + 12 * 3600, midnight + 86399, midnight + 31 * 86400 + 9 * 3600];
    const pinned = git(['rev-parse', '--since=1.day.ago'], { GIT_TEST_DATE_NOW: '864000' }).trim() === '--max-age=777600';
    run({ repo, env, nows, pinned });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

function filesSince(command, { repo, env }, now) {
  const result = spawnSync('sh', ['-c', command], { cwd: repo, env: { ...env, GIT_TEST_DATE_NOW: String(now) }, encoding: 'utf8' });
  assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  return result.stdout.split('\n').filter(Boolean).sort();
}

// Contract: the incremental check sees every change from midnight of the `Analyzed:` date on, in any time zone and at any time of day.
// Breaks when: the time is dropped from `--since` or changed, or the result is limited to that one day (`--until`) or to the last commit (`-1`).
// Not covered by: the midnight test in test/spec-contracts.test.mjs has one commit on each side of the boundary, in one zone and with the real clock as git's "now", so a command limited to the day or to the last commit passes it.
test('analyze incremental: in every zone and at any time of day, the git log of each edition returns every commit from midnight of the Analyzed date on, and nothing before', () => {
  for (const zone of ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo']) {
    withHistory(zone, (box) => {
      for (const [edition, path] of Object.entries(ANALYZE)) {
        const match = /`(git log --since=[^`]*)`/.exec(incrementalParagraph(read(path)));
        assert.ok(match, `${edition}: the incremental check names its git log command`);
        const command = match[1].replaceAll('<date>', ANALYZED);
        for (const now of box.nows) {
          assert.deepEqual(filesSince(command, box, now), EXPECTED,
            `${edition}, TZ=${zone}, now=${now}: \`${command}\` returns the commits from ${ANALYZED} 00:00 on`);
        }
      }
      // Control: the harness tells a bare date apart. With "now" pinned at noon, a
      // bare date counts from noon and loses the morning commits.
      if (box.pinned) {
        const old = filesSince(`git log --since="${ANALYZED}" --name-only --pretty=format:""`, box, box.nows[1]);
        assert.notDeepEqual(old, EXPECTED, `TZ=${zone}: a bare date at noon misses the morning commits`);
      }
    });
  }
});

// Contract: after a block-only refresh, the next incremental run counts from today, and the three editions say it in the same words.
// Breaks when: the clause inverts its sense while keeping its words, as in "leave `Analyzed:` untouched rather than today's date" or "keep `Analyzed:` as it is (Phase 4 moves it to today's date only on a full run)".
// Not covered by: the own-clause test in test/spec-contracts.test.mjs matches /`Analyzed:`[^,;]*today's date/, which accepts both inversions.
test('analyze block-only run: each edition tells the agent, with no hedge, to move Analyzed to today\'s date, and Phase 4 says the same', () => {
  const clauses = {};
  for (const [edition, path] of Object.entries(ANALYZE)) {
    const raw = read(path);
    const phase0 = flat(incrementalParagraph(raw));
    const clause = /block is due but nothing else changed → (.*?) report "/i.exec(phase0);
    assert.ok(clause, `${edition}: a block-only path in Phase 0`);
    assert.match(clause[1], /\b(move|set|update)s? `Analyzed:` to today's date\b/, `${edition}: an instruction to move Analyzed to today's date`);
    assert.doesNotMatch(clause[1], /\b(not|rather than|instead of|keep|keeps|leave|leaves|unless|except|only (on|when|if|in))\b/i,
      `${edition}: no negation or condition in the block-only clause: "${clause[1]}"`);
    assert.match(clause[1], /\(Phase 4\)/, `${edition}: the clause points at Phase 4`);
    assert.match(flat(raw), /\*\*index\.md\*\* — update `Analyzed: <date>` to today/, `${edition}: Phase 4 moves Analyzed to today`);
    clauses[edition] = clause[1];
  }
  assert.equal(clauses.cursor, clauses.shared, 'cursor carries the shared clause');
  assert.equal(clauses.copilot, clauses.shared, 'copilot carries the shared clause');
});

// ---- analyze: running the project's test commands ----

// An instruction to run or time the test commands: "run each one", "run them",
// "run the two test commands", "measure the suite". A description such as "the
// command that runs the full suite" is not an instruction and does not match.
const RUN_ORDER = /\b(run|execute|time|measure)\s+(it|them|each( one| command| test command)?|both( commands)?|the (two )?(test )?commands?|the (full )?suite)\b/i;
const sentences = (raw) => flat(raw).split(/(?<=[.;])\s+/);

// Contract: every instruction in analyze to run or time the project's test commands carries `--measure` in the same sentence, in the three editions, so no mode runs the suite unasked.
// Breaks when: the measurement comes back in new words, such as a block-only path that says "regenerate only the block, run each test command once to time it", or one edition's Tests bullet drifts back to measuring when the block is new.
// Not covered by: the --measure test in test/spec-contracts.test.mjs reads the positive rule only inside the Tests bullet and forbids only the two old phrases ("local and safe", "run it once") anywhere else.
test('analyze: no instruction runs the test commands without --measure', () => {
  for (const [edition, path] of Object.entries(ANALYZE)) {
    const orders = sentences(read(path)).filter((s) => RUN_ORDER.test(s));
    assert.ok(orders.length > 0, `${edition}: the --measure instruction itself is found`);
    for (const order of orders) {
      assert.match(order, /`--measure`/, `${edition}: runs the test commands without --measure: "${order}"`);
    }
  }
});

// Contract: Phase 0 says what `analyze --measure` does on a project where nothing changed and the Tests and Pitfalls block is not due (measure, or tell the user nothing was measured), in the three editions.
// Breaks when: `--measure` stays tied to "when the block is due", so on an up-to-date project the run stops at "No changes detected" and the commands the user asked to measure are silently not run.
// Not covered by: the --measure test in test/spec-contracts.test.mjs pins "changes nothing else about which phases run or when the block is due" and never reads the no-change stop path.
test('analyze --measure on an up-to-date project: Phase 0 says whether the commands are measured', () => {
    for (const [edition, path] of Object.entries(ANALYZE)) {
      const raw = read(path);
      const from = raw.indexOf('## Phase 0');
      const to = raw.indexOf('## Phase 1', from);
      assert.ok(from !== -1 && to > from, `${edition}: a Phase 0 section`);
      const segments = raw.slice(from, to).split(/\n\s*\n|\n(?=- )/).map(flat);
      const answered = segments.some((s) => s.includes('`--measure`')
        && /No changes detected|is not due|nothing (else )?changed|up to date/i.test(s));
      assert.ok(answered, `${edition}: the no-change path says what --measure does`);
    }
  });
