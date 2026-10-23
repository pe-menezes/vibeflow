#!/usr/bin/env node
// Checks a briefing before dispatch: the sections of its template (read from briefings.md, the
// one source), facts without a time and a source, sentences copied from principles.md instead of
// pointed at, secrets in the text, and length. With --pair, every criterion the auditor will check
// must also be in the executor's "Done when": the criterion only the auditor knows is the one
// the executor misses.

import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The kit needs Node 18 or later (Node 16 has no global fetch): below it, say so and exit 64 first.
if (Number(process.versions.node.split('.')[0]) < 18) {
  process.stderr.write(`check-briefing.mjs: needs Node.js 18 or later; found ${process.versions.node}\n`);
  process.exit(64);
}

const OK = 0;
const ATTENTION = 1;
const STOP = 2;
const LABEL = { [OK]: '[ok]', [ATTENTION]: '[attention]', [STOP]: '[stop]' };
const KIT = dirname(dirname(fileURLToPath(import.meta.url)));
const ROLE_HEADINGS = { executor: 'Executor', fix: 'Fix', auditor: 'Auditor', reauditor: 'Re-auditor' };
const NEEDS_KNOWLEDGE = new Set(['executor', 'fix', 'auditor']);
const MAX_LINES = 200;
const MIN_COPIED_WORDS = 14;

// The same detector as review-package.mjs: a test keeps the two blocks identical.
// The patterns are split so secret scanners do not flag this file.
const SECRET = new RegExp([
  'sk-' + 'proj-', 'sk-' + 'ant-', 'gh' + '[pousr]_[A-Za-z0-9]{20,}', 'github' + '_pat_',
  'AK' + 'IA[0-9A-Z]{16}', 'xox' + '[baprs]-[A-Za-z0-9-]{10,}',
  '-----BEGIN [A-Z ]*PRIVATE ' + 'KEY-----',
  // A database URL with a password: at most 256 characters for the user and for the password, so a
  // long line costs time in proportion to its length.
  '(postgres(ql)?|mysql|mongodb(\\+srv)?|redis|amqp)://[^:\\s/]{1,256}:[^@\\s]{1,256}@',
  '[sr]k' + '_live_[A-Za-z0-9]{10,}', 'AI' + 'za[0-9A-Za-z_-]{35}',
  // A name that says it holds a secret (any case; it starts at a word boundary and has at most 64
  // characters on each side of the word), set with = or : to a literal value of 8 to 256
  // characters: quoted, with no space and no $; or bare, running to the end of the line (a ; or ,
  // and a comment may follow, and a \r may end the line). Not a literal value: one read from a call
  // or the environment, the word undefined, null, true, false, none or nil alone (any case; a quote
  // before the word must close right after it), or a path (it starts with / or .). Every repeat has
  // a ceiling, so a long line costs time in proportion to its length.
  '\\b[\\w.-]{0,64}(' + ['PASSWORD', 'PASSWD', 'SECRET', 'TOKEN', 'API[_-]?KEY', 'PRIVATE[_-]KEY', 'ACCESS[_-]KEY']
    .map((word) => word.replace(/[A-Z]/g, (c) => `[${c}${c.toLowerCase()}]`)).join('|') + ')[\\w.-]{0,64}["\']?[ \\t]{0,64}[=:][ \\t]{0,64}'
    + '(?!(?<quote>["\']?)([/.]|(' + ['UNDEFINED', 'NULL', 'TRUE', 'FALSE', 'NONE', 'NIL']
      .map((word) => word.replace(/[A-Z]/g, (c) => `[${c}${c.toLowerCase()}]`)).join('|') + ')\\k<quote>(?![A-Za-z0-9_+/=@:-])))'
    + '("[^\\s"$]{8,256}"|\'[^\\s\'$]{8,256}\'|[A-Za-z0-9_+/=@:-]{8,256}(?=[ \\t]{0,64}[;,]?[ \\t]{0,64}(#|//|\\r?\\n|\\r?$)))',
].join('|'));
const TIME = /\b([01]\d|2[0-3])[:h][0-5]\d\b/;
const SOURCE = /\b(measured|read|run|ran|checked|counted|source)\b/i;
const TO_CHECK = /\bto check\b/i;

const USAGE = `usage: check-briefing.mjs <briefing> [--role executor|fix|auditor|reauditor] [--pair <executor-briefing>]

Without --role, the role comes from the file name (<feature>-<part>-<role>[-<n>].md).
--pair, on an auditor briefing, checks that every bullet of its "Criteria" section is also in
the "Done when" section of <executor-briefing>, matching whole words.
With a secret in the briefing, no line quotes its text: the facts without time and source are
counted, and a missing criterion is named by its position in "Criteria".

exit 0 ok · 1 attention · 2 stop (a secret in the text) · 64 bad arguments or unreadable file`;

function fail(message) {
  console.error(`check-briefing: ${message}`);
  process.exit(64);
}

function readText(path, what) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    return fail(`cannot read ${what} ${path}: ${error.code ?? error.message}`);
  }
}

function parseArgs(argv) {
  const options = { file: null, role: null, pair: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--role' || arg === '--pair') {
      if (!argv[i + 1]) fail(`${arg} takes a value`);
      options[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else if (!options.file && !arg.startsWith('--')) {
      options.file = arg;
    } else {
      fail(`unexpected argument ${arg}\n\n${USAGE}`);
    }
  }
  if (!options.file) fail(`expected <briefing>\n\n${USAGE}`);
  if (options.role && !ROLE_HEADINGS[options.role]) fail(`unknown role ${options.role}`);
  return options;
}

const normal = (text) => text
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[*`_>#|]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const words = (text) => normal(text).split(/[^a-z0-9]+/).filter(Boolean);

// Required sections per role: the "## " headings inside each template's fence in briefings.md.
function templateSections() {
  const byHeading = Object.fromEntries(Object.entries(ROLE_HEADINGS).map(([role, heading]) => [heading, role]));
  const sections = {};
  let role = null;
  let inFence = false;
  for (const line of readText(join(KIT, 'briefings.md'), 'templates').split('\n')) {
    if (line.startsWith('```')) {
      if (inFence) role = null;
      inFence = !inFence;
    } else if (inFence) {
      if (role && line.startsWith('## ')) sections[role].push(normal(line.slice(3)));
    } else if (line.startsWith('## ')) {
      role = byHeading[line.slice(3).trim()] ?? null;
      if (role) sections[role] = [];
    }
  }
  for (const role of Object.keys(ROLE_HEADINGS)) {
    if (!sections[role]?.length) fail(`briefings.md has no template sections for ${role}`);
  }
  return sections;
}

function roleFromName(path) {
  return basename(path).toLowerCase().match(/-(executor|fix|auditor|reauditor)(-\d+)?\.md$/)?.[1] ?? null;
}

// Items of the section whose heading starts with `name`: bullets or numbered lines, with
// their continuation lines joined. The section runs to the next heading of its own level or
// above; a deeper heading inside it (### under ##) belongs to it.
function sectionItems(text, name) {
  const items = [];
  let level = 0; // level of the open section's heading; 0 when outside
  for (const line of text.split('\n')) {
    const heading = line.match(/^(#{1,6})\s/);
    const inside = level > 0;
    if (heading) {
      const depth = heading[1].length;
      if (inside && depth > level) continue;
      level = normal(line.replace(/^#+/, '')).startsWith(name) ? depth : 0;
    } else if (inside && /^\s*([*-]|\d+[.)])\s+\S/.test(line)) {
      items.push(line.trim().replace(/^([*-]|\d+[.)])\s+/, ''));
    } else if (inside && line.trim() && items.length) {
      items[items.length - 1] += ` ${line.trim()}`;
    }
  }
  return items;
}

function principleSentences() {
  const sentences = new Set();
  for (const piece of readText(join(KIT, 'principles.md'), 'principles').split(/(?<=[.;:])\s+|\n/)) {
    const sentence = normal(piece.replace(/^\s*(\d+\.|[*-])\s+/, ''));
    if (sentence.split(' ').length >= MIN_COPIED_WORDS) sentences.add(sentence);
  }
  return sentences;
}

function containsWords(haystack, needle) {
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    if (needle.every((word, j) => haystack[i + j] === word)) return true;
  }
  return false;
}

// With a secret in the auditor briefing, a missing criterion is named by its position in
// "Criteria", never by its text.
function pairFindings(auditorText, executorPath, quote) {
  const criteria = sectionItems(auditorText, 'criteria');
  if (criteria.length === 0) return [[ATTENTION, 'no criteria in the auditor briefing\'s "Criteria" section: --pair has nothing to compare']];
  const done = sectionItems(readText(executorPath, 'executor briefing'), 'done when').map(words);
  if (done.length === 0) return [[ATTENTION, `${executorPath} has no "Done when" items`]];
  const missing = criteria
    .map((criterion, index) => ({ criterion, index }))
    .filter(({ criterion }) => !done.some((item) => containsWords(item, words(criterion))));
  if (missing.length === 0) return [[OK, `all ${criteria.length} auditor criteria are in the executor's "Done when"`]];
  return missing.map(({ criterion, index }) => [ATTENTION, quote
    ? `criterion not in the executor's "Done when": ${criterion}`
    : `criterion ${index + 1} of ${criteria.length} not in the executor's "Done when" (not quoted: the briefing holds a secret)`]);
}

function check(options) {
  const text = readText(options.file, 'briefing');
  const lines = text.split('\n');
  const role = options.role ?? roleFromName(options.file);
  const findings = [];
  // With a secret in the briefing, no line quotes the briefing's text.
  const secret = SECRET.test(text);

  if (role) {
    const headings = lines.filter((line) => /^#{1,6}\s/.test(line)).map((line) => normal(line.replace(/^#+/, '')));
    const missing = templateSections()[role].filter((section) => !headings.some((heading) => heading.startsWith(section)));
    if (missing.length) findings.push([ATTENTION, `${role} template: missing sections: ${missing.join(', ')}`]);
  } else {
    findings.push([ATTENTION, 'role not found in the file name (<feature>-<part>-<role>.md): pass --role']);
  }

  const unsourced = sectionItems(text, 'facts').filter((fact) => !(TIME.test(fact) && SOURCE.test(fact)) && !TO_CHECK.test(fact));
  if (unsourced.length) {
    const quoted = secret
      ? 'not quoted: the briefing holds a secret'
      : unsourced.slice(0, 3).map((fact) => fact.slice(0, 90)).join(' | ');
    findings.push([ATTENTION, `${unsourced.length} fact(s) without time and source ("measured HH:MM by <command>" or "to check: <source>"): ${quoted}`]);
  }

  if (NEEDS_KNOWLEDGE.has(role) && !text.includes('.vibeflow/index.md')) {
    findings.push([ATTENTION, 'the briefing does not point at the project knowledge (.vibeflow/index.md)']);
  }

  const flat = normal(text);
  const copied = [...principleSentences()].filter((sentence) => flat.includes(sentence));
  if (copied.length) {
    findings.push([ATTENTION, `${copied.length} sentence(s) copied from principles.md: point at the principle by number instead ("${copied[0].slice(0, 70)}...")`]);
  }

  if (secret) findings.push([STOP, 'a secret or credential in the text: name the variable instead']);
  if (lines.length > MAX_LINES) findings.push([ATTENTION, `${lines.length} lines: point at rules and at the project knowledge instead of restating them`]);

  if (options.pair) {
    if (role !== 'auditor') findings.push([ATTENTION, `--pair checks an auditor briefing; this one is ${role ?? 'of unknown role'}`]);
    else findings.push(...pairFindings(text, options.pair, !secret));
  }

  if (!findings.some(([level]) => level > OK)) findings.unshift([OK, `${role} briefing matches its template`]);
  return findings;
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  const findings = check(parseArgs(argv));
  for (const [level, message] of findings) console.log(`${LABEL[level]} ${message}`);
  return Math.max(...findings.map(([level]) => level));
}

process.exit(main(process.argv.slice(2)));
