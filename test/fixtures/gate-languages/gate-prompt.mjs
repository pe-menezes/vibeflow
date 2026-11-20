#!/usr/bin/env node
// Prints the request for one isolated run of the audit's Critical Gate step:
//
//   node test/fixtures/gate-languages/gate-prompt.mjs --skill <SKILL.md> --diff <file>
//
// From the given SKILL.md it takes, by structure and not by line number: the numbered step whose
// bold title contains "Critical Gate", from its line to the next numbered step at the start of a
// line (or the next heading, or the end of the file); and the lines of the `### Critical Gate`
// section of the output format, from that heading to the next heading or code fence. Then the diff,
// as it is. Whoever runs a model with this request does so elsewhere: this script calls none.
//
// Exit 0 printed; 64 a wrong argument or a file it cannot read; 65 the SKILL.md lacks the step or
// the output section.
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: node gate-prompt.mjs --skill <SKILL.md> --diff <file>';
const STEP = /^(\d+)\.\s+\*\*([^*]*)\*\*/;
const NEXT_STEP = /^\d+\.\s/;
const HEADING = /^#{1,3}\s/;

class ExitError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export function extractStep(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const match = line.match(STEP);
    return match && match[2].includes('Critical Gate');
  });
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (NEXT_STEP.test(lines[i]) || HEADING.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end);
}

export function extractOutputFormat(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^###\s+Critical Gate\s*$/.test(line));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (HEADING.test(lines[i]) || lines[i].startsWith('```')) {
      end = i;
      break;
    }
  }
  const out = lines.slice(start + 1, end);
  while (out.length > 0 && out.at(-1).trim() === '') out.pop();
  return out;
}

function fence(text) {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return '`'.repeat(longest + 1);
}

export function buildPrompt({ skillText, skillName, diffText }) {
  const step = extractStep(skillText);
  if (!step) throw new ExitError(`no numbered step whose title contains "Critical Gate" in ${skillName}`, 65);
  const output = extractOutputFormat(skillText);
  if (!output || output.length === 0) throw new ExitError(`no "### Critical Gate" section in the output format of ${skillName}`, 65);
  const number = step[0].match(STEP)[1];
  const diff = diffText.endsWith('\n') ? diffText : `${diffText}\n`;
  const marks = fence(diff);
  return [
    `You are running one step of the Vibeflow audit on its own: step ${number}, the Critical Gate.`,
    'The diff at the end is the whole change and stands in for the review package the step names;',
    'there is no spec and no pull request body, and the package left nothing out.',
    'Follow the step, then write only the `### Critical Gate` section of the report, in the format',
    'shown under "Output format". Write nothing else.',
    '',
    `## Step ${number}, from ${skillName}`,
    '',
    ...step,
    '',
    '## Output format',
    '',
    '### Critical Gate',
    ...output,
    '',
    '## Diff',
    '',
    `${marks}diff`,
    `${diff}${marks}`,
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { skill: null, diff: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg !== '--skill' && arg !== '--diff') throw new ExitError(`unexpected argument: ${arg}`, 64);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new ExitError(`${arg} needs a value`, 64);
    options[arg.slice(2)] = value;
    i += 1;
  }
  if (!options.skill || !options.diff) throw new ExitError('--skill and --diff are both required', 64);
  return options;
}

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new ExitError(`cannot read ${path}: ${error.code ?? error.message}`, 64);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const skillText = read(options.skill);
    const diffText = read(options.diff);
    process.stdout.write(buildPrompt({ skillText, skillName: basename(options.skill), diffText }));
  } catch (error) {
    if (!(error instanceof ExitError)) throw error;
    process.stderr.write(`gate-prompt.mjs: ${error.message}\n${error.code === 64 ? `${USAGE}\n` : ''}`);
    process.exit(error.code);
  }
}
