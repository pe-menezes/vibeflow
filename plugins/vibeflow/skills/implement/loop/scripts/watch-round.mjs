#!/usr/bin/env node
// Round watchdog, by effect: watches the progress file or the report a round writes.
// The end signal is the final stage marker in the file, never a verdict line alone (a partial
// report already carries a verdict). A file silent past the limit exits with the checklist of
// what to look at before assuming the session hung.

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const USAGE = `usage: watch-round.mjs --file <progress-or-report> [--stale-min <m>] [--timeout-min <m>] [--interval-sec <s>]

Exits as soon as the file has a line "Stage: final" (reports) or "State: final" (progress
files), bold or bulleted forms included. Exits as silent when the file has not changed for
--stale-min minutes (default 30; a file that does not exist yet counts from the start of the
watch). Gives up at --timeout-min minutes (default 240). Reads every --interval-sec seconds
(default 30).

exit 0 final · 1 silent · 3 ceiling · 64 bad arguments`;

const FINAL = /^(stage|state):\s*final\b/i;

const SILENCE_CHECKLIST = [
  'Before assuming the session hung, check in this order:',
  '1. Is the session waiting for an answer from its owner (a permission prompt, a question)?',
  '2. Is its process alive and using CPU (ps or pgrep, reading the line that matched)?',
  '3. Is the network up, and did the machine sleep?',
  '4. Then re-dispatch from the file in a fresh session, after reading what the dead attempt left in the worktree.',
];

function fail(message) {
  console.error(`watch-round: ${message}`);
  process.exit(64);
}

function parseArgs(argv) {
  const options = { file: null, staleMin: 30, timeoutMin: 240, intervalSec: 30 };
  const names = { '--file': 'file', '--stale-min': 'staleMin', '--timeout-min': 'timeoutMin', '--interval-sec': 'intervalSec' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = names[argv[i]];
    if (!key || argv[i + 1] === undefined) fail(`unexpected argument ${argv[i]}\n\n${USAGE}`);
    options[key] = argv[i + 1];
  }
  if (!options.file) fail('--file is required');
  for (const [key, flag] of [['staleMin', '--stale-min'], ['timeoutMin', '--timeout-min'], ['intervalSec', '--interval-sec']]) {
    options[key] = Number(options[key]);
    if (!Number.isFinite(options[key]) || options[key] < 0) fail(`${flag} takes a number >= 0`);
  }
  options.file = resolve(options.file);
  return options;
}

function hasFinalMarker(text) {
  return text.split('\n').some((line) => FINAL.test(line.replace(/[*_`]/g, '').replace(/^[\s>-]+/, '')));
}

function look(file) {
  try {
    return { mtimeMs: statSync(file).mtimeMs, text: readFileSync(file, 'utf8') };
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  const { file, staleMin, timeoutMin, intervalSec } = parseArgs(argv);
  const start = Date.now();

  for (;;) {
    const now = Date.now();
    const seen = look(file);
    if (seen && hasFinalMarker(seen.text)) {
      console.log(`${file}: final stage marker found`);
      return 0;
    }
    const lastChange = seen ? seen.mtimeMs : start;
    const silentMin = (now - lastChange) / 60_000;
    if (silentMin >= staleMin) {
      const state = seen ? `unchanged for ${Math.floor(silentMin)} min` : `does not exist after ${Math.floor(silentMin)} min`;
      console.log(`${file}: ${state} (limit ${staleMin} min)`);
      console.log(SILENCE_CHECKLIST.join('\n'));
      return 1;
    }
    if (now - start >= timeoutMin * 60_000) {
      console.log(`${file}: ceiling of ${timeoutMin} min reached without the final stage marker`);
      return 3;
    }
    await sleep(intervalSec * 1000);
  }
}

process.exit(await main(process.argv.slice(2)));
