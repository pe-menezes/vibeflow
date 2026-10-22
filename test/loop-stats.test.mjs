import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCRIPTS_DIR, hermeticEnv, runScript } from './loop-helpers.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const HEADER = '| Part | Role | Round | Started | Ended | Verdict |\n|---|---|---|---|---|---|';

// Every time below is fixed in the fixture; nothing reads the real clock.
const ALPHA = `# Loop: alpha

State: running

## Rounds

${HEADER}
| 1 | executor | 0 | 2026-10-15 09:00 | 2026-10-15 10:10 | - |
| 1 | audit | 0 | 2026-10-15 10:15 | 2026-10-15 11:00 | PASS |
| 2 | executor | 0 | 2026-10-15 09:00 | 2026-10-15 10:30 | - |
| 2 | audit | 0 | 2026-10-15 10:40 | 2026-10-15 12:00 | PARTIAL |
| 2 | fix | 1 | 2026-10-15 12:10 | 2026-10-15 13:00 | - |
| 2 | reaudit | 1 | 2026-10-15 13:10 | 2026-10-15 14:00 | FAIL |
| 2 | fix | 2 | 2026-10-15 14:10 | 2026-10-15 16:00 | - |
| 2 | reaudit | 2 | 2026-10-15 16:10 | 2026-10-15 18:30 | PASS |
| 3 | executor | 0 | 2026-10-16 10:00 | 2026-10-16 11:00 | - |
| 3 | audit | 0 | 2026-10-16 11:05 | 2026-10-16 12:00 | FAIL |
| 3 | executor | 0 | 2026-10-16 25:00 | 2026-10-16 26:00 | - |
| 3 | audit | 0 | 2026-10-16 12:00 | PASS |

Decision: keep going — why: test — cost if wrong: none
`;

const BETA = `# Loop: beta

## Rounds

${HEADER}
| 1 | executor | 0 | 2026-10-15 23:30 | 2026-10-16 00:10 | - |
| 1 | audit | 0 | 2026-10-16 00:15 | 2026-10-16 00:45 | PASS |
| 2 | executor | 0 | 2026-10-31 22:00 | 2026-10-31 23:50 | - |
| 2 | audit | 0 | 2026-10-31 23:55 | 2026-11-01 01:15 | PASS |
| 3 | executor | 0 | 2026-02-28 23:50 | 2026-02-28 23:59 | - |
| 3 | audit | 0 | 2026-02-28 23:59 | 2026-03-01 00:10 | PASS |
| 3 | audit | 0 | 2026-02-30 10:00 | 2026-02-30 11:00 | PASS |
`;

const BROKEN = `# Loop: broken

## Rounds

| Part | Who | Round | Started | Ended |
|---|---|---|---|---|
| 1 | executor | 0 | 2026-10-15 09:00 | 2026-10-15 10:00 |
`;

function scratch(run) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-loop-stats-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeLedgers(dir, ledgers) {
  const loopDir = join(dir, '.vibeflow/loop');
  mkdirSync(loopDir, { recursive: true });
  for (const [name, text] of Object.entries(ledgers)) writeFileSync(join(loopDir, name), text);
}

function stats(dir, extra = []) {
  return runScript('loop-stats.mjs', [dir, ...extra], hermeticEnv(dir));
}

function statsJson(dir) {
  const result = stats(dir, ['--json']);
  assert.equal(result.status, 0, result.out);
  return JSON.parse(result.stdout);
}

function part(report, feature, name) {
  const found = report.parts.find((entry) => entry.feature === feature && entry.part === name);
  assert.ok(found, `no part ${feature} · ${name} in ${JSON.stringify(report.parts)}`);
  return found;
}

test('loop-stats imports only node: modules and answers --help', () => {
  const source = readFileSync(join(SCRIPTS_DIR, 'loop-stats.mjs'), 'utf8');
  const specifiers = [...source.matchAll(/^\s*import\s[^'"]*?from\s*['"]([^'"]+)['"]/gm)].map((match) => match[1]);
  assert.ok(specifiers.length > 0);
  for (const specifier of specifiers) assert.match(specifier, /^node:/);
  assert.doesNotMatch(source, /(^|[^'"\w.])require\(\s*['"]/m);
  const help = runScript('loop-stats.mjs', ['--help'], hermeticEnv(tmpdir()));
  assert.equal(help.status, 0, help.out);
  assert.match(help.stdout, /usage/i);
  assert.match(help.stdout, /64/);
});

test('a part that passes its first audit: one round, no fix, clock from executor start to the PASS end', () => {
  scratch((dir) => {
    writeLedgers(dir, { 'alpha.md': ALPHA });
    const p = part(statsJson(dir), 'alpha', '1');
    assert.equal(p.rounds, 1);
    assert.equal(p.fixRounds, 0);
    assert.equal(p.firstAudit, 'PASS');
    assert.equal(p.firstAuditPass, true);
    assert.equal(p.clockMinutes, 120);
  });
});

test('a part with two fix rounds counts three rounds and ends the clock at the first PASS re-audit', () => {
  scratch((dir) => {
    writeLedgers(dir, { 'alpha.md': ALPHA });
    const p = part(statsJson(dir), 'alpha', '2');
    assert.equal(p.rounds, 3);
    assert.equal(p.fixRounds, 2);
    assert.equal(p.firstAudit, 'PARTIAL');
    assert.equal(p.firstAuditPass, false);
    assert.equal(p.clockMinutes, 570);
  });
});

test('a part with no PASS says so instead of a clock', () => {
  scratch((dir) => {
    writeLedgers(dir, { 'alpha.md': ALPHA });
    const p = part(statsJson(dir), 'alpha', '3');
    assert.equal(p.firstAudit, 'FAIL');
    assert.equal(p.firstAuditPass, false);
    assert.equal(p.clockMinutes, null);
    assert.match(p.clockNote, /no PASS/);

    const text = stats(dir);
    assert.equal(text.status, 0, text.out);
    assert.match(text.stdout, /alpha · 3\b.*no PASS/);
  });
});

test('malformed rows and a malformed table are warnings, skipped and never guessed', () => {
  scratch((dir) => {
    writeLedgers(dir, { 'alpha.md': ALPHA, 'broken.md': BROKEN });
    const report = statsJson(dir);
    const alphaWarnings = report.warnings.filter((w) => w.file.endsWith('alpha.md'));
    assert.equal(alphaWarnings.length, 2, JSON.stringify(report.warnings));
    assert.deepEqual(alphaWarnings.map((w) => w.line), [19, 20]);
    const brokenWarnings = report.warnings.filter((w) => w.file.endsWith('broken.md'));
    assert.equal(brokenWarnings.length, 1, JSON.stringify(report.warnings));
    assert.match(brokenWarnings[0].reason, /header/i);
    assert.equal(report.parts.filter((p) => p.feature === 'broken').length, 0);
    // the skipped 25:00 executor row did not move part 3's numbers
    assert.equal(part(report, 'alpha', '3').firstAudit, 'FAIL');

    const text = stats(dir);
    assert.equal(text.status, 0);
    assert.match(text.out, /warning .*alpha\.md:19/);
    assert.match(text.out, /warning .*broken\.md/);
  });
});

test('clock crosses midnight, a month end and February 28 into March 1; an impossible date is a warning', () => {
  scratch((dir) => {
    writeLedgers(dir, { 'beta.md': BETA });
    const report = statsJson(dir);
    assert.equal(part(report, 'beta', '1').clockMinutes, 75);
    assert.equal(part(report, 'beta', '2').clockMinutes, 195);
    assert.equal(part(report, 'beta', '3').clockMinutes, 20);
    const warnings = report.warnings.filter((w) => w.file.endsWith('beta.md'));
    assert.equal(warnings.length, 1, JSON.stringify(report.warnings));
    assert.equal(warnings[0].line, 13);
    assert.match(warnings[0].reason, /2026-02-30/);
  });
});

test('totals: parts, first-audit PASS rate, mean fix rounds, median clock', () => {
  scratch((dir) => {
    writeLedgers(dir, { 'alpha.md': ALPHA, 'beta.md': BETA, 'broken.md': BROKEN });
    const { totals, ledgers } = statsJson(dir);
    assert.equal(ledgers, 3);
    assert.equal(totals.parts, 6);
    assert.equal(totals.auditedParts, 6);
    assert.equal(totals.firstAuditPass, 4);
    assert.equal(totals.firstAuditPassRate, 4 / 6);
    assert.equal(totals.meanFixRounds, 2 / 6);
    assert.equal(totals.partsWithClock, 5);
    assert.equal(totals.medianClockMinutes, 120);

    const text = stats(dir);
    assert.match(text.stdout, /first-audit PASS: 4 of 6/);
    assert.match(text.stdout, /median clock: 2h00m/);
  });
});

test('a PASS that ends before the executor started is a warning, not a negative clock', () => {
  scratch((dir) => {
    writeLedgers(dir, {
      'gamma.md': `## Rounds\n\n${HEADER}\n| 1 | executor | 0 | 2026-10-20 10:00 | 2026-10-20 11:00 | - |\n| 1 | audit | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | PASS |\n`,
    });
    const report = statsJson(dir);
    const p = part(report, 'gamma', '1');
    assert.equal(p.clockMinutes, null);
    assert.ok(report.warnings.some((w) => /before/.test(w.reason)), JSON.stringify(report.warnings));
  });
});

test('a part with no round-0 executor row has no clock and says why', () => {
  scratch((dir) => {
    writeLedgers(dir, {
      'delta.md': `## Rounds\n\n${HEADER}\n| a | audit | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | PASS |\n`,
    });
    const p = part(statsJson(dir), 'delta', 'a');
    assert.equal(p.firstAuditPass, true);
    assert.equal(p.clockMinutes, null);
    assert.match(p.clockNote, /executor/);
  });
});

test('no ledgers is a clean zero; a missing repository or no argument exits 64', () => {
  scratch((dir) => {
    const report = statsJson(dir);
    assert.equal(report.ledgers, 0);
    assert.deepEqual(report.parts, []);
    assert.equal(report.totals.medianClockMinutes, null);
    const text = stats(dir);
    assert.equal(text.status, 0);
    assert.match(text.stdout, /no loop ledgers/i);

    assert.equal(stats(join(dir, 'missing')).status, 64);
    assert.equal(runScript('loop-stats.mjs', [], hermeticEnv(dir)).status, 64);
    assert.equal(runScript('loop-stats.mjs', [dir, '--bogus'], hermeticEnv(dir)).status, 64);
  });
});

// Rows outside the table, rounds still running, and the time zone of the ledger times.

test('a row-shaped line after the table but inside the Rounds section is a warning; lines after the next heading are not read', () => {
  scratch((dir) => {
    writeLedgers(dir, {
      'eps.md': [
        '## Rounds', '', HEADER,
        '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
        '| 1 | audit | 0 | 2026-10-20 09:00 | 2026-10-20 10:00 | FAIL |',
        '',
        '| 1 | fix | 1 | 2026-10-20 10:00 | 2026-10-20 11:00 | - |',
        'some prose',
        '| 1 | reaudit | 1 | 2026-10-20 11:00 | 2026-10-20 12:00 | PASS |',
        '',
        '## Notes',
        '',
        '| a | table | that | is | not | rounds |',
        '',
      ].join('\n'),
    });
    const report = statsJson(dir);
    const warnings = report.warnings.filter((w) => w.file.endsWith('eps.md'));
    assert.deepEqual(warnings.map((w) => w.line), [8, 10], JSON.stringify(warnings));
    for (const w of warnings) assert.match(w.reason, /outside the table/);
    // skipped, never counted: the part keeps only the table's rows
    const p = part(report, 'eps', '1');
    assert.equal(p.rounds, 1);
    assert.equal(p.fixRounds, 0);
    assert.match(p.clockNote, /no PASS/);
  });
});

test('an empty Ended is a round in progress: it counts, the part reads "in progress" and no warning is raised', () => {
  scratch((dir) => {
    writeLedgers(dir, {
      'zeta.md': [
        '## Rounds', '', HEADER,
        '| 1 | executor | 0 | 2026-10-20 08:00 |  | - |',
        '| 2 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
        '| 2 | audit | 0 | 2026-10-20 09:00 |  |  |',
        '| 3 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
        '| 3 | audit | 0 | 2026-10-20 09:00 | 2026-10-20 10:00 | FAIL |',
        '| 3 | fix | 1 | 2026-10-20 10:00 |  | - |',
        '| 4 | executor | 0 | 2026-10-20 08:00 |  | - |',
        '| 4 | executor | 0 | 2026-10-20 08:30 | 2026-10-20 09:00 | - |',
        '| 4 | audit | 0 | 2026-10-20 09:00 | 2026-10-20 10:00 | PASS |',
        '| 5 | audit | 0 | 2026-10-20 09:00 |  | PASS |',
        '',
      ].join('\n'),
    });
    const report = statsJson(dir);
    const warnings = report.warnings.filter((w) => w.file.endsWith('zeta.md'));
    // only the open row that already claims a verdict is refused
    assert.deepEqual(warnings.map((w) => w.line), [14], JSON.stringify(warnings));
    assert.match(warnings[0].reason, /in progress/);

    const p1 = part(report, 'zeta', '1');
    assert.equal(p1.rounds, 1);
    assert.equal(p1.clockMinutes, null);
    assert.equal(p1.clockNote, 'in progress');
    const p2 = part(report, 'zeta', '2');
    assert.equal(p2.rounds, 1);
    assert.equal(p2.firstAudit, null);
    assert.equal(p2.clockNote, 'in progress');
    const p3 = part(report, 'zeta', '3');
    assert.equal(p3.rounds, 2);
    assert.equal(p3.fixRounds, 1);
    assert.equal(p3.firstAudit, 'FAIL');
    assert.equal(p3.clockNote, 'in progress');
    // a re-dispatched executor left open does not undo a PASS: the clock still stands
    const p4 = part(report, 'zeta', '4');
    assert.equal(p4.clockMinutes, 120);
    assert.equal(p4.clockNote, null);

    const text = stats(dir);
    assert.equal(text.status, 0, text.out);
    assert.match(text.stdout, /zeta · 3\b.*in progress/);
  });
});

test('--help says the ledger times are local time without a zone and a round across a daylight-saving change is off by the shift', () => {
  const help = runScript('loop-stats.mjs', ['--help'], hermeticEnv(tmpdir()));
  assert.equal(help.status, 0, help.out);
  assert.match(help.stdout, /local time/i);
  assert.match(help.stdout, /without a (time )?zone/i);
  assert.match(help.stdout, /daylight[- ]saving/i);
  assert.match(help.stdout, /empty Ended/i);
});

// The loop's settings file sits beside the ledgers and is not one.

test('config.md in .vibeflow/loop/ is not a ledger: alone it reads as no ledgers, beside a ledger it is not counted', () => {
  scratch((dir) => {
    writeLedgers(dir, { 'config.md': '---\nloop: true\ncommit-rounds: true\n---\n' });
    const report = statsJson(dir);
    assert.equal(report.ledgers, 0);
    assert.deepEqual(report.parts, []);
    assert.deepEqual(report.warnings, []);
    const text = stats(dir);
    assert.equal(text.status, 0, text.out);
    assert.match(text.stdout, /no loop ledgers/i);
    assert.doesNotMatch(text.stdout, /config\.md|warning/i);

    writeLedgers(dir, { 'alpha.md': ALPHA });
    const both = statsJson(dir);
    assert.equal(both.ledgers, 1);
    assert.ok(both.parts.every((entry) => entry.feature === 'alpha'), JSON.stringify(both.parts));
    assert.ok(both.warnings.every((w) => w.file !== '.vibeflow/loop/config.md'), JSON.stringify(both.warnings));
  });
});

test('the stats command in every edition says the ledgers are the .md files in .vibeflow/loop/ other than config.md', () => {
  const editions = [
    'plugins/vibeflow/skills/stats/SKILL.md',
    'cursor/skills/vibeflow-stats/SKILL.md',
    'copilot/github/prompts/vibeflow-stats.prompt.md',
  ];
  for (const path of editions) {
    const text = readFileSync(join(REPO_ROOT, path), 'utf8').replace(/\s+/g, ' ');
    assert.match(text, /the ledgers are the `\.md` files in `\.vibeflow\/loop\/` other than `config\.md`/i, path);
    assert.match(text, /`config\.md`[^.]*is not a ledger/i, path);
  }
});

const STATS_EDITIONS = [
  'plugins/vibeflow/skills/stats/SKILL.md',
  'cursor/skills/vibeflow-stats/SKILL.md',
  'copilot/github/prompts/vibeflow-stats.prompt.md',
];

function pendingRule(path) {
  const text = readFileSync(join(REPO_ROOT, path), 'utf8').replace(/\s+/g, ' ');
  const found = text.match(/A report with `\*\*Verdict: pending\*\*`[^"]*"[^"]*"[^.]*\./);
  assert.ok(found, `${path} has no rule for a report with **Verdict: pending**`);
  return found[0];
}

test('the stats command in every edition counts a pending report apart and keeps it out of the verdict, DoD and pattern counts', () => {
  for (const path of STATS_EDITIONS) {
    const rule = pendingRule(path);
    assert.match(rule, /an audit in progress or interrupted/, path);
    assert.match(rule, /"N audits in progress or interrupted"/, path);
    assert.match(rule, /out of the PASS, PARTIAL and FAIL counts and of the DoD and pattern counts/, path);
    const text = readFileSync(join(REPO_ROOT, path), 'utf8');
    const format = text.slice(text.indexOf('## Vibeflow Stats'));
    assert.match(format, /N audits in progress or interrupted/, `${path}: the report format has no line for them`);
  }
  const rules = STATS_EDITIONS.map(pendingRule);
  assert.equal(rules[1], rules[0], 'Cursor differs from the shared plugin');
  assert.equal(rules[2], rules[0], 'Copilot differs from the shared plugin');
});

test('the plugin stats command may run node and nothing else in Bash, and the loop-stats command it gives starts with node', () => {
  const text = readFileSync(join(REPO_ROOT, 'plugins/vibeflow/skills/stats/SKILL.md'), 'utf8');
  const frontmatter = text.split('\n---\n')[0];
  const allowed = frontmatter.match(/^allowed-tools: (.*)$/m);
  assert.ok(allowed, 'no allowed-tools line in the frontmatter');
  assert.equal(allowed[1].trim(), 'Read, Grep, Glob, Bash(node:*)');
  const commands = [...text.matchAll(/`([^`]*loop-stats\.mjs[^`]*)`/g)].map((m) => m[1]);
  assert.ok(commands.length > 0, 'the command never says how to run loop-stats.mjs');
  for (const command of commands) assert.match(command, /^node /, command);
});
