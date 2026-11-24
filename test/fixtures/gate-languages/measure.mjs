#!/usr/bin/env node
// Measures what the audit's Critical Gate flagged in the gate-languages fixture:
//
//   node test/fixtures/gate-languages/measure.mjs --manifest <manifest.json> --report <file>
//        [--report <another>] [--language <id>] [--language <another>] [--json]
//
// Each report is read for every `### Critical Gate` section it has, each from that heading to the
// next heading of level 1 to 3 or the end of the file; the findings of all of them are summed, and
// the output says how many sections there were. A line inside a code fence (three or more backticks
// or tildes) is neither a heading nor a finding nor a note, and the section goes on after the fence.
// A fence that never closes is said, with the line of the report it opens on, and the lines after
// it are read as if it were not there.
// A finding is an item line (`-`, `*` or `+`) with an optional emoji, a severity (CRITICAL, HIGH,
// WARNING, INFO or ALLOWED), a rule id in brackets and a path, with or without backticks,
// optionally followed by `:<line>` or `:<first>-<last>` and by a parenthesis (`(removed line)`, kept
// in the raw line), then an em dash, a hyphen or a colon and the description. `Left out of the package: ...`, the "Clean ..." line and the "No diff scanned
// ..." line are read as what they are; any other text line of the section is kept as a note (what
// it said about coverage), and an item line that is not a finding is kept as unparsed.
//
// Matching rule. A finding matches a planted case when the path is the same, the rule id is the
// same and the line is at most 2 away (the nearest such case wins), or when the finding has no
// line and the file holds exactly one planted case of that rule. A finding with a range is as near
// to a case as the nearest line of the range (0 inside it). A removed-line case (SEC101) is matched
// by its line in the base commit. A finding within 2 lines of a planted case of another rule counts
// as "other rule". A finding within 2 lines of a decoy, of any rule, counts as a decoy flagged.
// A finding within 2 lines of a control (`kind: "control"`, a legitimate line next to a behaviour,
// which the gate-tech fixture carries), of any rule, counts as a control flagged, apart from the
// decoys. Anything else is "outside the manifest". A planted case counts as detected once, however
// many findings point at it, and only when one of them has a severity other than ALLOWED: the
// fixture carries no `vibeflow:allow`, so every ALLOWED on it is an exception the model made up. A
// planted case that only ALLOWED findings point at is counted apart, as allowed.
//
// Mentioned. A line of the section that is not a finding (a note, an unparsed item, the Clean line)
// and cites `<path>:<line>` within 2 lines of a case (planted, decoy or control) that no finding
// detected, allowed, flagged or matched as another rule, makes that case mentioned: the model saw
// it and did not flag it. Each case is in one count only. The mentioned cases are said apart as
// planted (a case the model saw and did not flag) and decoys (one it saw and set aside), by
// language, with their total; with controls in the manifest, the mentioned controls too. The line
// stays listed where it already is.
//
// A manifest without controls (the gate-languages one) gets no control count in the text or the
// JSON: the output on it is the same as before controls existed.
//
// --language <id>, repeatable, restricts the manifest to those languages, for a report on the diff
// of one folder; a finding in a file of another language is then outside the manifest.
//
// It is a measure, not a gate: exit 0 when it could read everything, 64 on a wrong argument, a
// language the manifest does not have or a file it cannot read. Reads only the files it is given;
// no network, no model.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: node measure.mjs --manifest <manifest.json> --report <file> [--report <another>] [--language <id>] [--json]';
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

const HEADING = /^#{1,3}\s/;
const GATE_HEADING = /^###\s+Critical Gate\s*$/;
const FENCE = /^\s*(`{3,}|~{3,})/;

// Every line of the text with whether it sits inside a code fence (the fence lines included), and
// the line numbers (from 1) of the fences that never close. A fence closes on a line of the same
// character, at least as long, with nothing after it. A fence that never closes is only its own
// line: the lines after it are read as if it were not there, so a fence the model forgot to close
// does not hide the rest of the report.
function fenced(lines) {
  const out = [];
  const unclosed = [];
  const closes = (line, open) => {
    const mark = line.match(FENCE);
    return Boolean(mark) && mark[1][0] === open[0] && mark[1].length >= open.length && line.trim() === mark[1];
  };
  let i = 0;
  while (i < lines.length) {
    const mark = lines[i].match(FENCE);
    if (!mark) {
      out.push({ line: lines[i], fenced: false });
      i += 1;
      continue;
    }
    let end = i + 1;
    while (end < lines.length && !closes(lines[end], mark[1])) end += 1;
    if (end === lines.length) {
      unclosed.push(i + 1);
      out.push({ line: lines[i], fenced: true });
      i += 1;
      continue;
    }
    for (let k = i; k <= end; k += 1) out.push({ line: lines[k], fenced: true });
    i = end + 1;
  }
  return { lines: out, unclosed };
}

// The sections, each as a list of { line, fenced }, and the fences that never close.
function readSections(text) {
  const { lines, unclosed } = fenced(text.split(/\r?\n/));
  const sections = [];
  let current = null;
  for (const entry of lines) {
    if (!entry.fenced && GATE_HEADING.test(entry.line)) {
      current = [];
      sections.push(current);
    } else if (!entry.fenced && HEADING.test(entry.line)) current = null;
    else if (current) current.push(entry);
  }
  return { sections, unclosed };
}

// The sections, each as a list of { line, fenced }.
export function criticalGateSections(text) {
  return readSections(text).sections;
}

// The lines of every section, one after the other; null when the report has none.
export function criticalGateSection(text) {
  const sections = criticalGateSections(text);
  return sections.length === 0 ? null : sections.flat().map((entry) => entry.line);
}

const FINDING = new RegExp([
  '^\\s*[-*+]\\s+',
  '(?:\\S+\\s+)?',
  '(CRITICAL|HIGH|WARNING|INFO|ALLOWED)\\s+',
  '\\[([A-Z]+[0-9]+)\\]\\s+',
  '`?(?:\\./)?([^\\s`:]+)`?',
  '(?::(\\d+)(?:-(\\d+))?)?`?',
  '(?:\\s+\\([^)]*\\))?',
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
    lineEnd: match[5] === undefined ? null : Number(match[5]),
    raw: line.trim(),
  };
}

// `<path>:<line>` or `<path>:<first>-<last>` anywhere in a line, the path with or without
// backticks and `./`.
const CITATION = /`?((?:\.\/)?[\w.-]+(?:\/[\w.-]+)*\.\w+)`?:(\d+)(?:-(\d+))?/g;

export function citations(line) {
  return [...line.matchAll(CITATION)].map((m) => ({
    path: m[1].replace(/^\.\//, ''),
    line: Number(m[2]),
    lineEnd: m[3] === undefined ? null : Number(m[3]),
  }));
}

export function parseReport(text) {
  const { sections, unclosed } = readSections(text);
  const report = { present: sections.length > 0, sections: sections.length, unclosedFences: unclosed, leftOut: null, clean: false, noDiff: false, findings: [], notes: [], unparsed: [], cited: [] };
  for (const { line: raw, fenced: inFence } of sections.flat()) {
    const line = raw.trim();
    if (!line || inFence) continue;
    const left = line.match(/^Left out of the package:\s*(.*)$/);
    if (left) {
      report.leftOut = left[1].trim();
      continue;
    }
    const finding = /^[-*+]\s/.test(line) ? parseFindingLine(line) : null;
    if (finding) {
      report.findings.push(finding);
      continue;
    }
    if (/^\(?"?Clean\b/.test(line)) report.clean = true;
    else if (/^\(?"?No diff scanned\b/.test(line)) report.noDiff = true;
    else if (/^[-*+]\s/.test(line)) report.unparsed.push(line);
    else report.notes.push(line);
    report.cited.push(...citations(line));
  }
  return report;
}

// --- matching ------------------------------------------------------------------------------------

// How far a case is from a finding or a citation: 0 inside a range, else the nearest end.
function distanceTo(c, { line, lineEnd }) {
  const last = lineEnd ?? line;
  if (c.line >= line && c.line <= last) return 0;
  return Math.min(Math.abs(c.line - line), Math.abs(c.line - last));
}

function nearest(cases, at) {
  let best = null;
  for (const c of cases) {
    const distance = distanceTo(c, at);
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
  const at = { line: finding.line, lineEnd: finding.lineEnd ?? null };
  const same = nearest(planted.filter((c) => c.rule === finding.rule), at);
  if (same) return { outcome: 'detected', caseId: same.id };
  const other = nearest(planted, at);
  if (other) return { outcome: 'otherRule', caseId: other.id };
  const bait = nearest(inFile.filter((c) => c.kind === 'decoy'), at);
  if (bait) return { outcome: 'decoy', caseId: bait.id };
  const control = nearest(inFile.filter((c) => c.kind === 'control'), at);
  if (control) return { outcome: 'control', caseId: control.id };
  return { outcome: 'outside', caseId: null };
}

// The manifest cut to the given languages; a language the manifest does not have is an error.
export function restrictManifest(manifest, languages) {
  const known = new Set(manifest.map((c) => c.language));
  const unknown = languages.filter((language) => !known.has(language));
  if (unknown.length > 0) throw new UsageError(`the manifest has no language ${unknown.join(', ')} (it has ${[...known].join(', ')})`);
  return manifest.filter((c) => languages.includes(c.language));
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

// A set of cases as { total, byLanguage, ids }, in the order of the manifest.
function countApart(manifest, ids) {
  const cases = manifest.filter((c) => ids.has(c.id));
  const byLanguage = {};
  for (const c of cases) byLanguage[c.language] = (byLanguage[c.language] ?? 0) + 1;
  return { total: cases.length, byLanguage, ids: cases.map((c) => c.id) };
}

function measureOne(manifest, { path, text }) {
  const section = parseReport(text);
  const detected = new Set();
  const allowedOnly = new Set();
  const flagged = new Set();
  const controlsFlagged = new Set();
  const findings = [];
  const otherRule = [];
  const outside = [];
  for (const finding of section.findings) {
    const { outcome, caseId } = matchFinding(finding, manifest);
    findings.push({ ...finding, outcome, caseId });
    if (outcome === 'detected') (finding.severity === 'ALLOWED' ? allowedOnly : detected).add(caseId);
    else if (outcome === 'decoy') flagged.add(caseId);
    else if (outcome === 'control') controlsFlagged.add(caseId);
    else if (outcome === 'otherRule') otherRule.push({ ...finding, caseId });
    else outside.push(finding);
  }
  for (const id of detected) allowedOnly.delete(id);
  const seen = new Set([...detected, ...allowedOnly, ...flagged, ...controlsFlagged, ...otherRule.map((f) => f.caseId)]);
  const mentioned = new Set();
  for (const cite of section.cited) {
    const c = nearest(manifest.filter((m) => m.path === cite.path), cite);
    if (c && !seen.has(c.id)) mentioned.add(c.id);
  }
  const ofKind = (kind) => new Set(manifest.filter((c) => c.kind === kind && mentioned.has(c.id)).map((c) => c.id));
  const decoys = Object.fromEntries(DECOY_KINDS.map((kind) => {
    const ofKind = manifest.filter((c) => c.kind === 'decoy' && c.decoyKind === kind);
    return [kind, { flagged: ofKind.filter((c) => flagged.has(c.id)).length, total: ofKind.length }];
  }));
  const controlCases = manifest.filter((c) => c.kind === 'control');
  const controls = controlCases.length === 0 ? {} : {
    controls: { flagged: controlCases.filter((c) => controlsFlagged.has(c.id)).length, total: controlCases.length, ids: controlCases.filter((c) => controlsFlagged.has(c.id)).map((c) => c.id) },
    mentionedControls: countApart(manifest, ofKind('control')),
  };
  return {
    report: path,
    section: { present: section.present, sections: section.sections, unclosedFences: section.unclosedFences, leftOut: section.leftOut, clean: section.clean, noDiff: section.noDiff, notes: section.notes, unparsed: section.unparsed },
    ...tally(manifest, detected),
    detectedIds: manifest.filter((c) => detected.has(c.id)).map((c) => c.id),
    allowed: countApart(manifest, allowedOnly),
    mentioned: countApart(manifest, mentioned),
    mentionedPlanted: countApart(manifest, ofKind('planted')),
    mentionedDecoys: countApart(manifest, ofKind('decoy')),
    decoys,
    ...controls,
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

const withoutIds = ({ total, byLanguage }) => ({ total, byLanguage });

export function measure(manifest, reports) {
  const measured = reports.map((report) => measureOne(manifest, report));
  const sum = {};
  for (const m of measured) {
    add(sum, { planted: m.planted, byQuadrant: m.byQuadrant, byLanguage: m.byLanguage, byRule: m.byRule, allowed: withoutIds(m.allowed), mentioned: withoutIds(m.mentioned), mentionedPlanted: withoutIds(m.mentionedPlanted), mentionedDecoys: withoutIds(m.mentionedDecoys), decoys: m.decoys });
    if (m.controls) add(sum, { controls: { flagged: m.controls.flagged, total: m.controls.total }, mentionedControls: withoutIds(m.mentionedControls) });
    sum.otherRule = (sum.otherRule ?? 0) + m.otherRule.length;
    sum.outside = (sum.outside ?? 0) + m.outside.length;
  }
  return { reports: measured, sum };
}

// --- the command line ----------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { manifest: null, reports: [], languages: [], json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--manifest' || arg === '--report' || arg === '--language') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
      i += 1;
      if (arg === '--manifest') options.manifest = value;
      else if (arg === '--report') options.reports.push(value);
      else options.languages.push(value);
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

const perLanguage = ({ total, byLanguage }) => (total === 0 ? '0' : `${total} (${Object.entries(byLanguage).map(([k, v]) => `${k} ${v}`).join(', ')})`);

function human(block, label) {
  const out = [`== ${label}`];
  if (block.section) {
    const s = block.section;
    if (!s.present) out.push('### Critical Gate: missing');
    else if (s.sections === 1) out.push('### Critical Gate: present');
    else out.push(`### Critical Gate: present, ${s.sections} sections (warning: the findings of all of them are counted)`);
    for (const line of s.unclosedFences) out.push(`Unclosed code fence at line ${line} of the report (warning: the lines after it are read as if it were not there)`);
    if (s.leftOut !== null) out.push(`Left out of the package: ${s.leftOut}`);
    if (s.clean) out.push('Said: Clean');
    if (s.noDiff) out.push('Said: No diff scanned');
    for (const note of s.notes) out.push(`Note: ${note}`);
    for (const line of s.unparsed) out.push(`Unparsed: ${line}`);
  }
  out.push(`Planted cases detected: ${pct(block.planted)}`);
  out.push(`Allowed only, not counted as detected: ${perLanguage(block.allowed)}`);
  for (const id of block.allowed.ids ?? []) out.push(`  ${id}`);
  out.push(`Mentioned without a finding: ${perLanguage(block.mentioned)}`);
  const parts = [['planted', block.mentionedPlanted], ['decoys', block.mentionedDecoys]];
  if (block.mentionedControls) parts.push(['controls', block.mentionedControls]);
  for (const [label, part] of parts) {
    out.push(`  ${label}: ${perLanguage(part)}`);
    for (const id of part.ids ?? []) out.push(`    ${id}`);
  }
  out.push('');
  out.push(table('Quadrant', Object.entries(block.byQuadrant).map(([k, v]) => [k, pct(v)])), '');
  out.push(table('Language', Object.entries(block.byLanguage).map(([k, v]) => [k, pct(v)])), '');
  out.push(table('Rule', Object.entries(block.byRule).map(([k, v]) => [k, pct(v)])), '');
  out.push(`Decoys flagged: ${Object.entries(block.decoys).map(([k, v]) => `${k} ${v.flagged}/${v.total}`).join(', ')}`);
  if (block.controls) {
    out.push(`Controls flagged: ${block.controls.flagged}/${block.controls.total}`);
    for (const id of block.controls.ids ?? []) out.push(`  ${id}`);
  }
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
  let manifest = readManifest(options.manifest);
  if (options.languages.length > 0) manifest = restrictManifest(manifest, options.languages);
  const reports = options.reports.map((path) => ({ path, text: read(path, 'report') }));
  const result = measure(manifest, reports);
  if (options.json) return `${JSON.stringify(options.languages.length > 0 ? { languages: options.languages, ...result } : result, null, 2)}\n`;
  const parts = options.languages.length > 0 ? [`Languages: ${options.languages.join(', ')}\n`] : [];
  parts.push(...result.reports.map((r) => human(r, r.report)));
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
