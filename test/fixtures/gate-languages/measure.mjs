#!/usr/bin/env node
// Measures what the audit's Critical Gate flagged in the gate-languages fixture:
//
//   node test/fixtures/gate-languages/measure.mjs --manifest <manifest.json> --report <file>
//        [--report <another>] [--json]
//
// Each report is read for its `### Critical Gate` section, from that heading to the next heading
// of level 1 to 3 or the end of the file. A finding is an item line (`-`, `*` or `+`) with an
// optional emoji, a severity (CRITICAL, HIGH, WARNING, INFO or ALLOWED), a rule id in brackets
// and a path, with or without backticks, optionally followed by `:<line>`, then an em dash, a
// hyphen or a colon and the description. `Left out of the package: ...`, the "Clean ..." line and
// the "No diff scanned ..." line are read as what they are; any other text line of the section is
// kept as a note (what it said about coverage), and an item line that is not a finding is kept as
// unparsed.
//
// Matching rule. A finding matches a planted case when the path is the same, the rule id is the
// same and the line is at most 2 away (the nearest such case wins), or when the finding has no
// line and the file holds exactly one planted case of that rule. A removed-line case (SEC101) is
// matched by its line in the base commit. A finding within 2 lines of a planted case of another
// rule counts as "other rule". A finding within 2 lines of a decoy, of any rule, counts as a decoy
// flagged. Anything else is "outside the manifest". A planted case counts as detected once, however
// many findings point at it; an ALLOWED finding counts too.
//
// It is a measure, not a gate: exit 0 when it could read everything, 64 on a wrong argument or a
// file it cannot read. Reads only the files it is given; no network, no model.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: node measure.mjs --manifest <manifest.json> --report <file> [--report <another>] [--json]';
const DISTANCE = 2;
export const QUADRANTS = [
  'extension listed, term listed',
  'extension listed, term not listed',
  'extension not listed, term listed',
  'extension not listed, term not listed',
];
const DECOY_KINDS = ['comment', 'string', 'name'];

class UsageError extends Error {}

// --- reading a report ----------------------------------------------------------------------------

export function criticalGateSection(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^###\s+Critical Gate\s*$/.test(line));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,3}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

const FINDING = new RegExp([
  '^\\s*[-*+]\\s+',
  '(?:\\S+\\s+)?',
  '(CRITICAL|HIGH|WARNING|INFO|ALLOWED)\\s+',
  '\\[([A-Z]+[0-9]+)\\]\\s+',
  '`?(?:\\./)?([^\\s`:]+)`?',
  '(?::(\\d+)(?:-\\d+)?)?`?',
  '(\\s+[—–-]\\s+.*|:\\s+.*|\\s*)$',
].join(''));

export function parseFindingLine(line) {
  const match = line.match(FINDING);
  if (!match) return null;
  return {
    severity: match[1],
    rule: match[2],
    path: match[3],
    line: match[4] === undefined ? null : Number(match[4]),
    raw: line.trim(),
  };
}

export function parseReport(text) {
  const section = criticalGateSection(text);
  const report = { present: section !== null, leftOut: null, clean: false, noDiff: false, findings: [], notes: [], unparsed: [] };
  if (!section) return report;
  for (const raw of section) {
    const line = raw.trim();
    if (!line) continue;
    const left = line.match(/^Left out of the package:\s*(.*)$/);
    if (left) report.leftOut = left[1].trim();
    else if (/^\(?"?Clean\b/.test(line)) report.clean = true;
    else if (/^\(?"?No diff scanned\b/.test(line)) report.noDiff = true;
    else if (/^[-*+]\s/.test(line)) {
      const finding = parseFindingLine(line);
      if (finding) report.findings.push(finding);
      else report.unparsed.push(line);
    } else report.notes.push(line);
  }
  return report;
}

// --- matching ------------------------------------------------------------------------------------

function nearest(cases, line) {
  let best = null;
  for (const c of cases) {
    const distance = Math.abs(c.line - line);
    if (distance <= DISTANCE && (!best || distance < best.distance)) best = { c, distance };
  }
  return best ? best.c : null;
}

export function matchFinding(finding, manifest) {
  const inFile = manifest.filter((c) => c.path === finding.path);
  const planted = inFile.filter((c) => c.kind === 'planted');
  if (finding.line === null) {
    const same = planted.filter((c) => c.rule === finding.rule);
    return same.length === 1 ? { outcome: 'detected', caseId: same[0].id } : { outcome: 'outside', caseId: null };
  }
  const same = nearest(planted.filter((c) => c.rule === finding.rule), finding.line);
  if (same) return { outcome: 'detected', caseId: same.id };
  const other = nearest(planted, finding.line);
  if (other) return { outcome: 'otherRule', caseId: other.id };
  const bait = nearest(inFile.filter((c) => c.kind === 'decoy'), finding.line);
  if (bait) return { outcome: 'decoy', caseId: bait.id };
  return { outcome: 'outside', caseId: null };
}

// --- measuring -----------------------------------------------------------------------------------

const quadrantOf = (c) => QUADRANTS[(c.extensionListed ? 0 : 2) + (c.tokenListed ? 0 : 1)];
const ratio = () => ({ detected: 0, total: 0 });

function tally(manifest, detected) {
  const planted = manifest.filter((c) => c.kind === 'planted');
  const byQuadrant = Object.fromEntries(QUADRANTS.map((q) => [q, ratio()]));
  const byLanguage = {};
  const byRule = {};
  for (const c of planted) {
    const hit = detected.has(c.id) ? 1 : 0;
    for (const bucket of [byQuadrant[quadrantOf(c)], (byLanguage[c.language] ??= ratio()), (byRule[c.rule] ??= ratio())]) {
      bucket.total += 1;
      bucket.detected += hit;
    }
  }
  return { planted: { detected: planted.filter((c) => detected.has(c.id)).length, total: planted.length }, byQuadrant, byLanguage, byRule };
}

function measureOne(manifest, { path, text }) {
  const section = parseReport(text);
  const detected = new Set();
  const flagged = new Set();
  const findings = [];
  const otherRule = [];
  const outside = [];
  for (const finding of section.findings) {
    const { outcome, caseId } = matchFinding(finding, manifest);
    findings.push({ ...finding, outcome, caseId });
    if (outcome === 'detected') detected.add(caseId);
    else if (outcome === 'decoy') flagged.add(caseId);
    else if (outcome === 'otherRule') otherRule.push({ ...finding, caseId });
    else outside.push(finding);
  }
  const decoys = Object.fromEntries(DECOY_KINDS.map((kind) => {
    const ofKind = manifest.filter((c) => c.kind === 'decoy' && c.decoyKind === kind);
    return [kind, { flagged: ofKind.filter((c) => flagged.has(c.id)).length, total: ofKind.length }];
  }));
  return {
    report: path,
    section: { present: section.present, leftOut: section.leftOut, clean: section.clean, noDiff: section.noDiff, notes: section.notes, unparsed: section.unparsed },
    ...tally(manifest, detected),
    detectedIds: manifest.filter((c) => detected.has(c.id)).map((c) => c.id),
    decoys,
    otherRule,
    outside,
    findings,
  };
}

function add(into, from) {
  for (const [key, value] of Object.entries(from)) {
    if (typeof value === 'number') into[key] = (into[key] ?? 0) + value;
    else add((into[key] ??= {}), value);
  }
  return into;
}

export function measure(manifest, reports) {
  const measured = reports.map((report) => measureOne(manifest, report));
  const sum = {};
  for (const m of measured) {
    add(sum, { planted: m.planted, byQuadrant: m.byQuadrant, byLanguage: m.byLanguage, byRule: m.byRule, decoys: m.decoys });
    sum.otherRule = (sum.otherRule ?? 0) + m.otherRule.length;
    sum.outside = (sum.outside ?? 0) + m.outside.length;
  }
  return { reports: measured, sum };
}

// --- the command line ----------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { manifest: null, reports: [], json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--manifest' || arg === '--report') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
      i += 1;
      if (arg === '--manifest') options.manifest = value;
      else options.reports.push(value);
    } else throw new UsageError(`unexpected argument: ${arg}`);
  }
  if (!options.manifest) throw new UsageError('--manifest is required');
  if (options.reports.length === 0) throw new UsageError('at least one --report is required');
  return options;
}

function read(path, what) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new UsageError(`cannot read the ${what} ${path}: ${error.code ?? error.message}`);
  }
}

function readManifest(path) {
  let cases;
  try {
    cases = JSON.parse(read(path, 'manifest'));
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`the manifest ${path} is not JSON: ${error.message}`);
  }
  if (!Array.isArray(cases)) throw new UsageError(`the manifest ${path} is not a list of cases`);
  return cases;
}

const pct = ({ detected, total }) => `${detected}/${total}`;

function table(title, rows) {
  const width = Math.max(title.length, ...rows.map(([name]) => name.length));
  return [`${title.padEnd(width)}  detected`, ...rows.map(([name, value]) => `${name.padEnd(width)}  ${value}`)].join('\n');
}

function human(block, label) {
  const out = [`== ${label}`];
  if (block.section) {
    const s = block.section;
    out.push(s.present ? '### Critical Gate: present' : '### Critical Gate: missing');
    if (s.leftOut !== null) out.push(`Left out of the package: ${s.leftOut}`);
    if (s.clean) out.push('Said: Clean');
    if (s.noDiff) out.push('Said: No diff scanned');
    for (const note of s.notes) out.push(`Note: ${note}`);
    for (const line of s.unparsed) out.push(`Unparsed: ${line}`);
  }
  out.push(`Planted cases detected: ${pct(block.planted)}`, '');
  out.push(table('Quadrant', Object.entries(block.byQuadrant).map(([k, v]) => [k, pct(v)])), '');
  out.push(table('Language', Object.entries(block.byLanguage).map(([k, v]) => [k, pct(v)])), '');
  out.push(table('Rule', Object.entries(block.byRule).map(([k, v]) => [k, pct(v)])), '');
  out.push(`Decoys flagged: ${Object.entries(block.decoys).map(([k, v]) => `${k} ${v.flagged}/${v.total}`).join(', ')}`);
  if (Array.isArray(block.otherRule)) {
    out.push(`Other rule on a planted line: ${block.otherRule.length}`);
    for (const f of block.otherRule) out.push(`  ${f.raw} (case ${f.caseId})`);
    out.push(`Outside the manifest: ${block.outside.length}`);
    for (const f of block.outside) out.push(`  ${f.raw}`);
  } else {
    out.push(`Other rule on a planted line: ${block.otherRule}`, `Outside the manifest: ${block.outside}`);
  }
  return `${out.join('\n')}\n`;
}

function main(argv) {
  const options = parseArgs(argv);
  const manifest = readManifest(options.manifest);
  const reports = options.reports.map((path) => ({ path, text: read(path, 'report') }));
  const result = measure(manifest, reports);
  if (options.json) return `${JSON.stringify(result, null, 2)}\n`;
  const parts = result.reports.map((r) => human(r, r.report));
  if (result.reports.length > 1) parts.push(human(result.sum, `sum of ${result.reports.length} reports`));
  return parts.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(main(process.argv.slice(2)));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`measure.mjs: ${error.message}\n${USAGE}\n`);
    process.exit(64);
  }
}
