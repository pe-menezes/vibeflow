#!/usr/bin/env node
// The loop's own numbers, read from the rounds tables of the loop ledgers in
// .vibeflow/loop/*.md (config.md, the loop's settings, is not one): per feature and part,
// the rounds, the fix rounds, whether the round-0 audit passed and the clock from the
// round-0 executor's start to the end of the first PASS; then the totals. A row or table
// that does not follow the contract is a warning and is skipped: a number built from a
// guessed row would read as a measurement.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The kit needs Node 18 or later (Node 16 has no global fetch): below it, say so and exit 64 first.
if (Number(process.versions.node.split('.')[0]) < 18) {
  process.stderr.write(`loop-stats.mjs: needs Node.js 18 or later; found ${process.versions.node}\n`);
  process.exit(64);
}

const USAGE = `usage: loop-stats.mjs <repo> [--json]

Reads every .vibeflow/loop/*.md ledger under <repo>; config.md there holds the loop's
settings and is not a ledger. The rounds table sits under the heading "## Rounds" with
the columns | Part | Role | Round | Started | Ended | Verdict |; Role is
executor, audit, fix or reaudit; Round is 0 for the first executor and its audit and 1, 2, ...
for fix rounds and their re-audits; times are YYYY-MM-DD HH:MM; Verdict is PASS, PARTIAL or
FAIL on audit rows and - on executor and fix rows. An empty Ended is a round in progress: it
counts in the part's rounds, has no verdict yet, and the part reads "in progress" until a PASS.
The table is read up to the next heading; a row-shaped line after the table is a warning.

Times are the orchestrator's local time without a zone, and the clock is their wall-clock
difference: a round that crosses a daylight-saving change is off by the size of the shift.

Reports per feature and part: rounds, fix rounds, the round-0 audit's verdict and the clock
from the round-0 executor's start to the end of the first PASS audit or re-audit. Totals:
parts, first-audit PASS rate, mean fix rounds, median clock. Malformed rows and tables are
listed as warnings and skipped. --json prints the same report as one JSON object.

exit 0 report written · 64 bad arguments or <repo> is not a readable directory`;

const COLUMNS = ['part', 'role', 'round', 'started', 'ended', 'verdict'];
const ROLES = new Set(['executor', 'audit', 'fix', 'reaudit']);
const VERDICTS = new Set(['PASS', 'PARTIAL', 'FAIL']);

function fail(message) {
  console.error(`loop-stats: ${message}`);
  process.exit(64);
}

function cells(line) {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|')) body = body.slice(0, -1);
  return body.split('|').map((cell) => cell.trim());
}

// Minutes since the epoch for a wall-clock time, or null. The arithmetic runs on UTC, so
// midnight, month ends and leap days come from the calendar and no time zone moves a row;
// the round trip rejects dates the calendar does not have (2026-02-30, 24:00).
function minutes(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (hour > 23 || minute > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime() / 60000;
}

function parseRow(fields) {
  if (fields.length !== COLUMNS.length) return { reason: `expected ${COLUMNS.length} cells, found ${fields.length}` };
  const [part, role, roundText, startedText, endedText, verdict] = fields;
  if (!part) return { reason: 'empty Part' };
  if (!ROLES.has(role)) return { reason: `Role "${role}" is not executor, audit, fix or reaudit` };
  if (!/^\d+$/.test(roundText)) return { reason: `Round "${roundText}" is not a whole number` };
  const round = Number(roundText);
  if ((role === 'executor' || role === 'audit') && round !== 0) return { reason: `${role} row in round ${round}: only round 0 has an ${role}` };
  if ((role === 'fix' || role === 'reaudit') && round === 0) return { reason: `${role} row in round 0: fix rounds start at 1` };
  const started = minutes(startedText);
  if (started === null) return { reason: `Started "${startedText}" is not a valid date and time (YYYY-MM-DD HH:MM)` };
  const isAudit = role === 'audit' || role === 'reaudit';
  // An empty Ended is a round still running (the rounds-table contract in orchestrator.md).
  if (endedText === '') {
    if (isAudit ? !['', '-'].includes(verdict) : verdict !== '-') {
      return { reason: `Verdict "${verdict}" on a ${role} row in progress (empty Ended) must be ${isAudit ? 'empty or -' : '-'}` };
    }
    return { row: { part, role, round, started, ended: null, verdict: null } };
  }
  const ended = minutes(endedText);
  if (ended === null) return { reason: `Ended "${endedText}" is not a valid date and time (YYYY-MM-DD HH:MM)` };
  if (ended < started) return { reason: `Ended ${endedText} is before Started ${startedText}` };
  if (isAudit && !VERDICTS.has(verdict)) return { reason: `Verdict "${verdict}" on an ${role} row is not PASS, PARTIAL or FAIL` };
  if (!isAudit && verdict !== '-') return { reason: `Verdict "${verdict}" on a ${role} row must be -` };
  return { row: { part, role, round, started, ended, verdict: isAudit ? verdict : null } };
}

const HEADING = /^#{1,6}\s/;

// The rows of the first "## Rounds" table of one ledger, with the warnings it raised. The
// section runs to the next heading; a row-shaped line in it after the table is a warning, so
// a row left behind a stray blank line never vanishes from the numbers unreported.
function readLedger(text, file, warnings) {
  const lines = text.split(/\r?\n/);
  const heading = lines.findIndex((line) => line.trim() === '## Rounds');
  if (heading === -1) {
    warnings.push({ file, line: null, reason: 'no "## Rounds" heading; ledger skipped' });
    return [];
  }
  let index = heading + 1;
  while (index < lines.length && lines[index].trim() === '') index += 1;
  if (index >= lines.length || !lines[index].trim().startsWith('|')) {
    warnings.push({ file, line: heading + 1, reason: 'no table under "## Rounds"; ledger skipped' });
    return [];
  }
  const header = cells(lines[index]).map((cell) => cell.toLowerCase());
  if (header.join('|') !== COLUMNS.join('|')) {
    warnings.push({ file, line: index + 1, reason: `table header is not | Part | Role | Round | Started | Ended | Verdict |; ledger skipped` });
    return [];
  }
  const separator = lines[index + 1] ?? '';
  if (!cells(separator).every((cell) => /^:?-+:?$/.test(cell))) {
    warnings.push({ file, line: index + 2, reason: 'table header has no separator row; ledger skipped' });
    return [];
  }
  const rows = [];
  for (index += 2; index < lines.length && lines[index].trim().startsWith('|'); index += 1) {
    const parsed = parseRow(cells(lines[index]));
    if (parsed.reason) warnings.push({ file, line: index + 1, reason: `${parsed.reason}; row skipped` });
    else rows.push({ ...parsed.row, line: index + 1 });
  }
  for (; index < lines.length && !HEADING.test(lines[index].trim()); index += 1) {
    if (lines[index].trim().startsWith('|')) {
      warnings.push({ file, line: index + 1, reason: 'row outside the table under "## Rounds" (after a blank or other line); row skipped' });
    }
  }
  return rows;
}

function earliest(rows, key) {
  return rows.reduce((best, row) => (best === null || row[key] < best[key] ? row : best), null);
}

function summarizePart(feature, part, file, rows, warnings) {
  const roundNumbers = new Set(rows.map((row) => row.round));
  const firstAuditRow = earliest(rows.filter((row) => row.role === 'audit'), 'started');
  const executor = earliest(rows.filter((row) => row.role === 'executor'), 'started');
  const firstPass = earliest(rows.filter((row) => row.verdict === 'PASS'), 'ended');
  const inProgress = rows.some((row) => row.ended === null);

  let clockMinutes = null;
  let clockNote = null;
  if (!firstPass) clockNote = inProgress ? 'in progress' : 'no PASS yet';
  else if (!executor) clockNote = 'no round-0 executor row to start the clock';
  else if (firstPass.ended < executor.started) {
    clockNote = 'the first PASS ends before the round-0 executor started';
    warnings.push({ file, line: firstPass.line, reason: `part ${part}: the first PASS ends before the round-0 executor started; no clock` });
  } else clockMinutes = firstPass.ended - executor.started;

  return {
    feature,
    part,
    file,
    rounds: roundNumbers.size,
    fixRounds: [...roundNumbers].filter((round) => round > 0).length,
    firstAudit: firstAuditRow ? firstAuditRow.verdict : null,
    firstAuditPass: firstAuditRow ? firstAuditRow.verdict === 'PASS' : null,
    clockMinutes,
    clockNote,
  };
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function totalsOf(parts) {
  const audited = parts.filter((part) => part.firstAudit !== null);
  const passed = audited.filter((part) => part.firstAuditPass).length;
  const clocks = parts.map((part) => part.clockMinutes).filter((value) => value !== null);
  return {
    parts: parts.length,
    auditedParts: audited.length,
    firstAuditPass: passed,
    firstAuditPassRate: audited.length > 0 ? passed / audited.length : null,
    meanFixRounds: parts.length > 0 ? parts.reduce((sum, part) => sum + part.fixRounds, 0) / parts.length : null,
    partsWithClock: clocks.length,
    medianClockMinutes: median(clocks),
  };
}

function clock(value) {
  const rounded = Math.round(value);
  return `${Math.floor(rounded / 60)}h${String(rounded % 60).padStart(2, '0')}m`;
}

function printText(report, loopDir) {
  if (report.ledgers === 0) {
    console.log(`no loop ledgers in ${loopDir}`);
    return;
  }
  console.log(`${report.ledgers} ledger(s) in ${loopDir}, ${report.totals.parts} part(s)`);
  for (const part of report.parts) {
    const audit = part.firstAudit ? `first audit ${part.firstAudit}` : 'not audited yet';
    const time = part.clockMinutes !== null ? `clock ${clock(part.clockMinutes)}` : part.clockNote;
    console.log(`${part.feature} · ${part.part}: ${part.rounds} round(s), ${part.fixRounds} fix round(s), ${audit}, ${time}`);
  }
  const t = report.totals;
  const rate = t.firstAuditPassRate !== null ? ` (${Math.round(t.firstAuditPassRate * 100)}%)` : '';
  const mean = t.meanFixRounds !== null ? t.meanFixRounds.toFixed(2) : '-';
  const med = t.medianClockMinutes !== null ? `${clock(t.medianClockMinutes)} over ${t.partsWithClock} part(s)` : 'none (no part reached PASS)';
  console.log(`totals: ${t.parts} part(s); first-audit PASS: ${t.firstAuditPass} of ${t.auditedParts}${rate}; mean fix rounds: ${mean}; median clock: ${med}`);
  for (const warning of report.warnings) {
    console.log(`warning ${warning.file}${warning.line ? `:${warning.line}` : ''} ${warning.reason}`);
  }
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  const json = argv.includes('--json');
  const rest = argv.filter((arg) => arg !== '--json');
  const unknown = rest.filter((arg) => arg.startsWith('-'));
  if (unknown.length > 0) fail(`unknown option ${unknown[0]}\n\n${USAGE}`);
  if (rest.length !== 1) fail(`expected one <repo>\n\n${USAGE}`);
  const repo = resolve(rest[0]);
  if (!existsSync(repo) || !statSync(repo).isDirectory()) fail(`${repo} is not a directory`);

  const loopDir = join(repo, '.vibeflow/loop');
  let names = [];
  if (existsSync(loopDir)) {
    try {
      names = readdirSync(loopDir).filter((name) => name.endsWith('.md') && name !== 'config.md').sort();
    } catch (error) {
      fail(`cannot read ${loopDir}: ${error.message}`);
    }
  }

  const warnings = [];
  const parts = [];
  for (const name of names) {
    const file = `.vibeflow/loop/${name}`;
    let text;
    try {
      text = readFileSync(join(loopDir, name), 'utf8');
    } catch (error) {
      warnings.push({ file, line: null, reason: `unreadable: ${error.message}; ledger skipped` });
      continue;
    }
    const feature = name.slice(0, -'.md'.length);
    const byPart = new Map();
    for (const row of readLedger(text, file, warnings)) {
      if (!byPart.has(row.part)) byPart.set(row.part, []);
      byPart.get(row.part).push(row);
    }
    for (const [part, rows] of byPart) parts.push(summarizePart(feature, part, file, rows, warnings));
  }

  const report = { ledgers: names.length, parts, totals: totalsOf(parts), warnings };
  if (json) console.log(JSON.stringify(report, null, 2));
  else printText(report, loopDir);
  return 0;
}

process.exit(main(process.argv.slice(2)));
