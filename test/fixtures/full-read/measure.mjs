#!/usr/bin/env node
// Measures how much of each document a session was told to read the model
// actually saw, from the session's Claude Code transcript:
//
//   node test/fixtures/full-read/measure.mjs --transcript <session.jsonl> [--transcript <more.jsonl>]
//        --app <prepared app> [--spec <spec>] [--json]
//
// Targets: the app's .vibeflow/conventions.md plus every .vibeflow/patterns/**.md
// the spec lists under Applicable Patterns (the fixture's fixed spec by
// default). "Seen" is what the tool_result blocks of the transcript put in
// front of the model: their `content`, never `toolUseResult.stdout`, which
// keeps output the model did not see. The canary lines come from the table in
// this folder's README. Reads only the files it is given, the README and the
// default spec; no network, no model.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const README = join(HERE, 'README.md');
const DEFAULT_SPEC = join(HERE, 'spec', 'profile-edit.md');
const MIN_DISTINCTIVE = 20;
const TRUNCATION_MARKS = ['<persisted-output>', 'exceeds maximum allowed tokens'];
const USAGE = 'usage: node measure.mjs --transcript <session.jsonl> [--transcript <more.jsonl>] --app <prepared app> [--spec <spec>] [--json]';

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const options = { transcripts: [], app: null, spec: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined) fail(`${arg} needs a value\n${USAGE}`, 2);
      i += 1;
      return next;
    };
    if (arg === '--transcript') options.transcripts.push(value());
    else if (arg === '--app') options.app = value();
    else if (arg === '--spec') options.spec = value();
    else if (arg === '--json') options.json = true;
    else fail(`unexpected argument: ${arg}\n${USAGE}`, 2);
  }
  if (options.transcripts.length === 0) fail(`at least one --transcript is required\n${USAGE}`, 2);
  if (!options.app) fail(`--app is required\n${USAGE}`, 2);
  return options;
}

function readText(path, what) {
  if (!existsSync(path)) fail(`${what} not found: ${path}`);
  return readFileSync(path, 'utf8');
}

function section(text, heading) {
  const start = text.search(new RegExp(`^## ${heading}\\s*$`, 'm'));
  if (start < 0) return '';
  const rest = text.slice(start);
  const end = rest.slice(1).search(/^## /m);
  return end >= 0 ? rest.slice(0, end + 1) : rest;
}

// The canary table of the README: | Id | File | Line | Marker | Text |
function readCanaries() {
  const rows = [];
  for (const line of section(readText(README, 'README'), 'Canaries').split('\n')) {
    const match = line.match(/^\| (C\d+) \| `([^`]+)` \| (\d+) \| `[^`]*` \| (.*) \|$/);
    if (match) rows.push({ id: match[1], path: match[2], line: Number(match[3]), text: match[4].trim() });
  }
  if (rows.length === 0) fail('no canary table in the README');
  return rows;
}

function targetPaths(specText) {
  const listed = section(specText, 'Applicable Patterns').match(/patterns\/[A-Za-z0-9_./-]+\.md/g) ?? [];
  return ['.vibeflow/conventions.md', ...new Set(listed.map((p) => `.vibeflow/${p}`))];
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
  }
  return '';
}

// Every way a document line can show up in a result line: as it is, behind the
// Read line-number prefix, or behind grep's path:line: (or path-line- for
// context lines) prefix.
function variants(line) {
  return [
    line,
    line.replace(/^\s*\d+\t/, ''),
    line.replace(/^\s*\d+→/, ''),
    line.replace(/^.*?:\d+:/, ''),
    line.replace(/^.*?-\d+-/, ''),
  ].map((v) => v.trim());
}

function readTranscripts(paths) {
  const uses = new Map();
  const results = [];
  for (const path of paths) {
    for (const raw of readText(path, 'transcript').split('\n')) {
      if (!raw.trim()) continue;
      let record;
      try {
        record = JSON.parse(raw);
      } catch {
        continue;
      }
      const content = record?.message?.content;
      if (!Array.isArray(content)) continue;
      const resultBlocks = content.filter((block) => block?.type === 'tool_result');
      for (const block of content) {
        if (block?.type === 'tool_use') uses.set(block.id, { name: block.name, input: block.input ?? {} });
      }
      for (const block of resultBlocks) {
        results.push({
          id: block.tool_use_id,
          text: contentText(block.content),
          toolUseResult: resultBlocks.length === 1 ? record.toolUseResult : undefined,
        });
      }
    }
  }
  return { uses, results };
}

function globRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      out += '.*';
      i += 1;
    } else if (ch === '*') out += '[^/]*';
    else if (ch === '?') out += '[^/]';
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^(?:.*/)?${out.replace(/^\\?\.\//, '')}$`);
}

function citesPath(token, rel, full) {
  const t = token.replace(/^\.\//, '');
  if (!t) return false;
  if (/[*?]/.test(t)) {
    const re = globRegExp(t);
    return re.test(rel) || re.test(full);
  }
  return t === rel || t === full || full.endsWith(`/${t}`);
}

function commandTokens(command) {
  return String(command)
    .split(/[\s;|&<>()]+/)
    .map((token) => token.replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

// Which call opened a document, and how.
function methodFor(use, result, rel, full) {
  const input = use.input;
  if (use.name === 'Read') {
    const path = String(input.file_path ?? '');
    if (!citesPath(path, rel, full)) return null;
    const file = result.toolUseResult?.file;
    const ranged = input.offset !== undefined || input.limit !== undefined
      || (file && Number.isFinite(file.numLines) && Number.isFinite(file.totalLines) && file.numLines < file.totalLines);
    return ranged ? 'Read range' : 'Read whole';
  }
  if (use.name === 'Bash') {
    const named = commandTokens(input.command ?? '').some((token) => citesPath(token, rel, full));
    return named || result.text.includes(`${rel}:`) ? 'Bash' : null;
  }
  if (use.name === 'Grep') {
    const path = String(input.path ?? '');
    const named = path && citesPath(path, rel, full);
    const filenames = result.toolUseResult?.filenames ?? [];
    const listed = filenames.some((f) => citesPath(String(f), rel, full));
    return named || listed || result.text.includes(rel) ? 'Grep' : null;
  }
  return null;
}

function measure({ transcripts, app, spec }) {
  const appDir = resolve(app);
  const specPath = resolve(spec ?? DEFAULT_SPEC);
  const canaries = readCanaries();
  const { uses, results } = readTranscripts(transcripts.map((t) => resolve(t)));

  const seen = new Set();
  for (const result of results) {
    for (const line of result.text.split('\n')) for (const v of variants(line)) if (v) seen.add(v);
  }

  const documents = targetPaths(readText(specPath, 'spec')).map((rel) => {
    const full = join(appDir, rel);
    const text = existsSync(full) ? readFileSync(full, 'utf8') : null;
    return { path: rel, full, missing: text === null, lines: text === null ? [] : text.split('\n').map((l) => l.trim()) };
  });

  const counts = new Map();
  for (const doc of documents) for (const line of doc.lines) counts.set(line, (counts.get(line) ?? 0) + 1);

  const report = documents.map((doc) => {
    const distinctive = doc.lines.filter((line) => line.length >= MIN_DISTINCTIVE && counts.get(line) === 1);
    const seenLines = distinctive.filter((line) => seen.has(line)).length;
    const methods = [];
    let truncated = false;
    for (const result of results) {
      const use = uses.get(result.id);
      if (!use) continue;
      const method = methodFor(use, result, doc.path, doc.full);
      if (!method) continue;
      if (!methods.includes(method)) methods.push(method);
      if (TRUNCATION_MARKS.some((mark) => result.text.includes(mark))) truncated = true;
    }
    const owned = canaries.find((c) => c.path === doc.path);
    return {
      path: doc.path,
      missing: doc.missing,
      opened: methods.length > 0,
      seen: seenLines,
      distinctive: distinctive.length,
      coverage: distinctive.length === 0 ? 0 : seenLines / distinctive.length,
      canary: owned ? owned.id : null,
      canarySeen: owned ? seen.has(owned.text) : null,
      methods,
      truncated,
    };
  });

  const canaryReport = canaries.map((c) => ({ id: c.id, path: c.path, line: c.line, seen: seen.has(c.text) }));
  const whole = report.filter((d) => d.distinctive > 0 && d.seen === d.distinctive).length;
  const text = `${whole} of ${report.length} documents read whole; canaries seen: ${canaryReport
    .map((c) => `${c.id} ${c.seen ? 'yes' : 'no'}`)
    .join(', ')}`;

  return {
    app: appDir,
    spec: specPath,
    transcripts: transcripts.map((t) => resolve(t)),
    documents: report,
    canaries: canaryReport,
    summary: { whole, total: report.length, text },
  };
}

function percent(ratio) {
  return `${Math.floor(ratio * 1000) / 10}%`.replace('.0%', '%');
}

function human(result) {
  const header = ['Document', 'Opened', 'Seen', 'Coverage', 'Canary', 'How'];
  const rows = result.documents.map((d) => [
    d.path + (d.missing ? ' (missing)' : ''),
    d.opened ? 'yes' : 'no',
    `${d.seen}/${d.distinctive}`,
    percent(d.coverage),
    d.canary ? `${d.canary} ${d.canarySeen ? 'yes' : 'no'}` : '-',
    d.methods.length === 0 ? '-' : d.methods.join(', ') + (d.truncated ? ' (truncated)' : ''),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const format = (cells) => cells.map((cell, i) => (i === cells.length - 1 ? cell : cell.padEnd(widths[i]))).join('  ');
  return [format(header), format(widths.map((w) => '-'.repeat(w))), ...rows.map(format), '', result.summary.text, ''].join('\n');
}

const options = parseArgs(process.argv.slice(2));
const result = measure(options);
process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : human(result));
