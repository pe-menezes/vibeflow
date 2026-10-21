// Behavior probes from independent audits of loop-stats.mjs, the script that reads the loop's
// rounds tables. Each case states, as comments, the contract it protects, the plausible regression
// that breaks it, and why the implementer's tests did not catch it. A case marked `todo` asserts
// what a known open gap asks for: it runs and prints without failing the suite.
// Every time is fixed in a fixture; nothing reads the real clock.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LOOP_DIR, hermeticEnv, runScript } from '../loop-helpers.mjs';

const HEADER = '| Part | Role | Round | Started | Ended | Verdict |\n|---|---|---|---|---|---|';
const kit = (name) => readFileSync(join(LOOP_DIR, name), 'utf8');

function statsOf(ledgers) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-probe-loop-stats-'));
  try {
    const loopDir = join(dir, '.vibeflow/loop');
    mkdirSync(loopDir, { recursive: true });
    for (const [name, rows] of Object.entries(ledgers)) {
      writeFileSync(join(loopDir, name), `# Loop\n\n## Rounds\n\n${HEADER}\n${rows.join('\n')}\n`);
    }
    const result = runScript('loop-stats.mjs', [dir, '--json'], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    return JSON.parse(result.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function partOf(report, feature, part) {
  const found = report.parts.find((entry) => entry.feature === feature && entry.part === part);
  assert.ok(found, `no part ${feature} · ${part} in ${JSON.stringify(report.parts)}`);
  return found;
}

// ---- the clock and the first audit

// Contract: the clock starts at the earliest round-0 executor start, so a re-dispatched executor does not shorten it.
// Breaks when: the executor row taken is the last or the first one in the file instead of the earliest start.
// Not covered by: test/loop-stats.test.mjs, where every part has a single valid executor row.
test('clock: a re-dispatched round-0 executor starts the clock at the earliest executor start, whatever the row order', () => {
  const report = statsOf({
    'f.md': [
      '| 1 | executor | 0 | 2026-10-20 09:00 | 2026-10-20 09:30 | - |',
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 08:30 | - |',
      '| 1 | executor | 0 | 2026-10-20 10:00 | 2026-10-20 11:00 | - |',
      '| 1 | audit | 0 | 2026-10-20 11:10 | 2026-10-20 12:00 | PASS |',
    ],
  });
  const p = partOf(report, 'f', '1');
  assert.equal(p.clockMinutes, 240);
  assert.equal(p.rounds, 1);
  assert.equal(p.fixRounds, 0);
});

// Contract: the clock ends at the earliest PASS end.
// Breaks when: the PASS row is found by file order, or the latest PASS is taken.
// Not covered by: test/loop-stats.test.mjs, where every part has at most one valid PASS row.
test('clock: with two PASS rows the clock ends at the earliest PASS end, not the last row and not the latest PASS', () => {
  const report = statsOf({
    'f.md': [
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| 1 | fix | 1 | 2026-10-20 13:00 | 2026-10-20 14:00 | - |',
      '| 1 | reaudit | 1 | 2026-10-20 14:00 | 2026-10-20 15:00 | PASS |',
      '| 1 | audit | 0 | 2026-10-20 09:10 | 2026-10-20 10:00 | PASS |',
    ],
  });
  assert.equal(partOf(report, 'f', '1').clockMinutes, 120);
});

// Contract: "whether the round-0 audit passed" reads the audit that started first.
// Breaks when: the last audit row, or the first one in the file, is taken.
// Not covered by: test/loop-stats.test.mjs, where every part has one valid audit row.
test('first audit: a repeated round-0 audit counts the one that started first', () => {
  const report = statsOf({
    'f.md': [
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| 1 | audit | 0 | 2026-10-20 10:00 | 2026-10-20 10:50 | PASS |',
      '| 1 | audit | 0 | 2026-10-20 09:10 | 2026-10-20 09:50 | PARTIAL |',
      '| 1 | audit | 0 | 2026-10-20 11:00 | 2026-10-20 12:00 | FAIL |',
    ],
  });
  const p = partOf(report, 'f', '1');
  assert.equal(p.firstAudit, 'PARTIAL');
  assert.equal(p.firstAuditPass, false);
  assert.equal(p.clockMinutes, 170);
});

// ---- malformed rows

// Contract: a row whose Ended is before its Started, and a minute 60, are warnings and do not count.
// Breaks when: either check is dropped from the row parser (minute 60 then rolls into the next hour and is accepted).
// Not covered by: test/loop-stats.test.mjs, whose fixtures have neither case.
test('rows: an Ended before its Started, and a minute 60, are warnings and do not count', () => {
  const report = statsOf({
    'f.md': [
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| 1 | audit | 0 | 2026-10-20 10:00 | 2026-10-20 09:30 | PASS |',
      '| 2 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 08:60 | - |',
      '| 2 | audit | 0 | 2026-10-20 09:00 | 2026-10-20 10:00 | PASS |',
    ],
  });
  const one = partOf(report, 'f', '1');
  assert.equal(one.firstAudit, null);
  assert.equal(one.clockMinutes, null);
  const two = partOf(report, 'f', '2');
  assert.equal(two.clockMinutes, null);
  assert.match(two.clockNote, /executor/);
  assert.deepEqual(report.warnings.map((w) => w.line).sort((a, b) => a - b), [8, 9]);
});

// Contract: a row-shaped line left in the Rounds section after the table is a warning, never a silent drop.
// Breaks when: the table reader stops at the first line that does not start with "|" and looks no further.
// Not covered by: the implementer's first fixtures had no blank line inside a table; the contract test added later uses another fixture (a prose line between rows). A fix that counts the row without a warning also fails this case, since that would be a guess.
test('rows: a rounds row left after a blank line inside the Rounds section is a warning, never a silent drop', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-probe-loop-stats-'));
  try {
    const loopDir = join(dir, '.vibeflow/loop');
    mkdirSync(loopDir, { recursive: true });
    writeFileSync(join(loopDir, 'f.md'), [
      '## Rounds', '', HEADER,
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| 1 | audit | 0 | 2026-10-20 09:00 | 2026-10-20 10:00 | FAIL |',
      '| 1 | fix | 1 | 2026-10-20 10:00 | 2026-10-20 11:00 | - |',
      '',
      '| 1 | reaudit | 1 | 2026-10-20 11:00 | 2026-10-20 12:00 | PASS |',
      '',
      'Decision: x — why: y — cost if wrong: z',
      '',
    ].join('\n'));
    const result = runScript('loop-stats.mjs', [dir, '--json'], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    const report = JSON.parse(result.stdout);
    // line 9 is the re-audit row; whatever the script does with it, it may not vanish unreported
    assert.ok(report.warnings.some((w) => w.line === 9), `row on line 9 dropped silently: ${JSON.stringify(report)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Contract: in a CRLF ledger, a row after a blank line is a warning and a row under the next heading is not read.
// Breaks when: a trailing "\r" defeats the blank-line or the heading detection.
// Not covered by: test/loop-stats.test.mjs, whose fixtures are all LF.
test('rows: in a CRLF ledger, a row after a blank line is a warning and a row under the next heading is not read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-probe-loop-stats-'));
  try {
    const loopDir = join(dir, '.vibeflow/loop');
    mkdirSync(loopDir, { recursive: true });
    writeFileSync(join(loopDir, 'f.md'), [
      '## Rounds', '', ...HEADER.split('\n'),
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '',
      '| 1 | audit | 0 | 2026-10-20 09:00 | 2026-10-20 10:00 | PASS |',
      '## Handoff',
      '| 9 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '',
    ].join('\r\n'));
    const result = runScript('loop-stats.mjs', [dir, '--json'], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.warnings.map((w) => w.line), [7], JSON.stringify(report.warnings));
    assert.deepEqual(report.parts.map((p) => p.part), ['1']);
    assert.equal(partOf(report, 'f', '1').clockNote, 'no PASS yet');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- totals

// Contract: an even count of clocks has the mean of the two middle ones as median, and the first-audit PASS rate counts audited parts only.
// Breaks when: the median takes the upper middle value, or the rate divides by every part.
// Not covered by: test/loop-stats.test.mjs, whose totals fixture has an odd count of clocks and every part audited.
test('totals: an even count of clocks has the mean of the two middle ones as median; the PASS rate counts audited parts only', () => {
  const report = statsOf({
    'f.md': [
      '| a | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| a | audit | 0 | 2026-10-20 09:00 | 2026-10-20 09:30 | PASS |',
      '| b | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| b | audit | 0 | 2026-10-20 09:00 | 2026-10-20 10:00 | FAIL |',
      '| b | fix | 1 | 2026-10-20 10:00 | 2026-10-20 11:00 | - |',
      '| b | reaudit | 1 | 2026-10-20 11:00 | 2026-10-20 12:00 | PASS |',
      '| c | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
    ],
  });
  const t = report.totals;
  assert.equal(t.parts, 3);
  assert.equal(t.auditedParts, 2);
  assert.equal(t.firstAuditPass, 1);
  assert.equal(t.firstAuditPassRate, 0.5);
  assert.equal(t.partsWithClock, 2);
  assert.equal(t.medianClockMinutes, (90 + 240) / 2);
  assert.equal(t.meanFixRounds, 1 / 3);
  assert.equal(partOf(report, 'f', 'c').firstAudit, null);
});

// Contract: parts still in progress stay out of the PASS-rate denominator and out of the median.
// Breaks when: an open audit counts as audited, or an open part gets a clock.
// Not covered by: test/loop-stats.test.mjs checks a round in progress per part only, not in the totals.
test('totals: parts still in progress stay out of the totals that need a finished round', () => {
  const report = statsOf({
    'f.md': [
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| 1 | audit | 0 | 2026-10-20 09:00 | 2026-10-20 10:00 | PASS |',
      '| 2 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| 2 | audit | 0 | 2026-10-20 09:00 |  | - |',
      '| 3 | executor | 0 | 2026-10-20 08:00 |  |  |',
    ],
  });
  // the open executor with an empty Verdict is refused (executor and fix rows carry "-")
  assert.deepEqual(report.warnings.map((w) => w.line), [11], JSON.stringify(report.warnings));
  assert.equal(partOf(report, 'f', '2').clockNote, 'in progress');
  assert.equal(report.totals.auditedParts, 1);
  assert.equal(report.totals.firstAuditPassRate, 1);
  assert.equal(report.totals.partsWithClock, 1);
  assert.equal(report.totals.medianClockMinutes, 120);
});

// ---- the rounds table orchestrator.md tells the session to write

// Contract: the rounds table orchestrator.md shows is read by loop-stats without a warning, with the right rounds, fix rounds and clock.
// Breaks when: the example changes a column, a role, the time format or the verdict of an executor row.
// Not covered by: the implement contract tests pin only the table header, not that loop-stats reads the example.
test('orchestrator.md: the rounds table it tells the session to write is read by loop-stats without a warning', () => {
  const table = /```markdown\n(## Rounds\n[\s\S]*?)\n```/.exec(kit('orchestrator.md'));
  assert.ok(table, 'orchestrator.md shows the rounds table');
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-probe-loop-stats-'));
  try {
    const loopDir = join(dir, '.vibeflow/loop');
    mkdirSync(loopDir, { recursive: true });
    writeFileSync(join(loopDir, 'login.md'), `# login\n\n${table[1]}\n`);
    const result = runScript('loop-stats.mjs', [dir, '--json'], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.warnings, []);
    const part = report.parts.find((entry) => entry.part === '1');
    assert.ok(part, 'the first part is counted');
    const rows = table[1].split('\n').filter((line) => /^\| \d/.test(line));
    const rounds = new Set(rows.map((line) => line.split('|')[3].trim()));
    assert.equal(part.rounds, rounds.size);
    assert.equal(part.fixRounds, [...rounds].filter((round) => round !== '0').length);
    assert.notEqual(part.clockMinutes, null, 'a table that reaches PASS has a clock');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Contract: the extra rows a red outside check adds (another round-0 executor row, another fix row of the same fix round) read as the same round, with the right fix rounds, first audit and clock.
// Breaks when: loop-stats starts refusing or double-counting repeated rows, or the table header changes.
// Not covered by: the implement contract tests pin the outside-check wording; none builds this table and runs loop-stats on it.
test('orchestrator.md: the extra executor and fix rows a red outside check adds count as the same round in loop-stats', () => {
  const header = /```markdown\n## Rounds\n\n(\| Part[^\n]*\n\|[^\n]*)\n/.exec(kit('orchestrator.md'));
  assert.ok(header, 'orchestrator.md shows the rounds table header');
  const table = [
    '## Rounds', '', header[1],
    '| 1 | executor | 0 | 2026-10-20 09:00 | 2026-10-20 09:40 | - |',
    '| 1 | executor | 0 | 2026-10-20 09:45 | 2026-10-20 10:05 | - |',
    '| 1 | audit | 0 | 2026-10-20 10:10 | 2026-10-20 10:40 | PARTIAL |',
    '| 1 | fix | 1 | 2026-10-20 10:45 | 2026-10-20 11:00 | - |',
    '| 1 | fix | 1 | 2026-10-20 11:05 | 2026-10-20 11:15 | - |',
    '| 1 | reaudit | 1 | 2026-10-20 11:20 | 2026-10-20 11:40 | PASS |',
  ].join('\n');
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-probe-loop-stats-'));
  try {
    mkdirSync(join(dir, '.vibeflow/loop'), { recursive: true });
    writeFileSync(join(dir, '.vibeflow/loop/login.md'), `# login\n\n${table}\n`);
    const result = runScript('loop-stats.mjs', [dir, '--json'], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.warnings, []);
    const part = report.parts.find((entry) => entry.part === '1');
    assert.equal(part.rounds, 2, 'the round-0 round and the first fix round, whatever the extra rows');
    assert.equal(part.fixRounds, 1, 'a red outside check is not a fix round');
    assert.equal(part.firstAudit, 'PARTIAL');
    assert.equal(part.clockMinutes, 160, 'the clock starts at the first executor row');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- the loop config file

// Contract: a project that turned the loop on through .vibeflow/loop/config.md and has no ledger yet gets the report it had without the loop ("without ledgers, the report is unchanged").
// Breaks when: every .md file in .vibeflow/loop/ is read as a ledger, which is the current behavior.
// Not covered by: test/loop-stats.test.mjs has no fixture with the config file.
test('config: a project that turned the loop on in .vibeflow/loop/config.md and has no ledger yet reads as having no ledger', { todo: 'open gap: loop-stats counts config.md as a ledger and warns about it' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-probe-loop-stats-config-'));
  try {
    mkdirSync(join(dir, '.vibeflow/loop'), { recursive: true });
    writeFileSync(join(dir, '.vibeflow/loop/config.md'), '---\nloop: true\ncommit-rounds: true\n---\n');
    const result = runScript('loop-stats.mjs', [dir, '--json'], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ledgers, 0, 'config.md is not a ledger');
    assert.deepEqual(report.warnings, [], 'no warning about the config file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
