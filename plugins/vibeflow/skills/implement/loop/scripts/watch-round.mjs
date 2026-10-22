#!/usr/bin/env node
// Round watchdog, by effect: watches the progress file or the report a round writes.
// The end signal is a final stage marker the file gained during the watch, never a verdict line
// alone (a partial report already carries a verdict), never the marker an earlier round left. A file silent past the limit exits with the checklist of
// what to look at before assuming the session hung.

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// The kit needs Node 18 or later (Node 16 has no global fetch): below it, say so and exit 64 first.
if (Number(process.versions.node.split('.')[0]) < 18) {
  process.stderr.write(`watch-round.mjs: needs Node.js 18 or later; found ${process.versions.node}\n`);
  process.exit(64);
}

const USAGE = `usage: watch-round.mjs --file <progress-or-report> [--stale-min <m>] [--timeout-min <m>] [--interval-sec <s>]

Exits as soon as the file gains a line "Stage: final" (reports) or "State: final" (progress
files), bold or bulleted forms included, that was not there when the watch began: a progress
file keeps the marker of every earlier round, so each round appends its own (for example
"State: final · fix 1") and never edits an earlier one. A file rewritten from scratch counts
again from what it holds after the rewrite.

Exits as silent when the watch has seen no change in the file for --stale-min minutes
(default 30). The clock starts when the watch starts and restarts at every change it sees; the
file's age before the watch does not count, and a file that does not exist yet is silent from
the start. Gives up at --timeout-min minutes (default 240), and never sleeps past that ceiling.
Reads every --interval-sec seconds (default 30). Limits take fractions (0.5 is half a minute).

exit 0 final · 1 silent · 3 ceiling · 64 bad arguments`;

const FINAL = /^(stage|state):\s*final\b/i;

const SILENCE_CHECKLIST = [
  'Before assuming the session hung, check in this order:',
  '1. Is the session waiting for an answer from the user (a permission prompt, a question)?',
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

function finalMarkers(text) {
  return text.split('\n').filter((line) => FINAL.test(line.replace(/[*_`]/g, '').replace(/^[\s>-]+/, ''))).length;
}

function look(file) {
  try {
    const text = readFileSync(file, 'utf8');
    return { mtimeMs: statSync(file).mtimeMs, text, markers: finalMarkers(text) };
  } catch {
    return null;
  }
}

const changed = (before, after) => (before === null) !== (after === null)
  || (before !== null && (before.mtimeMs !== after.mtimeMs || before.text !== after.text));

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  const { file, staleMin, timeoutMin, intervalSec } = parseArgs(argv);
  const start = Date.now();
  const ceiling = start + timeoutMin * 60_000;
  let previous = look(file);
  // Markers already in the file belong to earlier rounds; only a new one ends this watch.
  let baseline = previous ? previous.markers : 0;
  let lastChange = start;

  for (;;) {
    const now = Date.now();
    const seen = look(file);
    if (changed(previous, seen)) lastChange = now;
    previous = seen;
    const markers = seen ? seen.markers : 0;
    if (markers > baseline) {
      console.log(`${file}: final stage marker found`);
      return 0;
    }
    // A rewrite that dropped markers lowers the count a new marker has to beat.
    baseline = Math.min(baseline, markers);
    const silentMin = (now - lastChange) / 60_000;
    if (silentMin >= staleMin) {
      const state = seen ? `unchanged for ${Math.floor(silentMin)} min of the watch` : `does not exist after ${Math.floor(silentMin)} min`;
      console.log(`${file}: ${state} (limit ${staleMin} min)`);
      console.log(SILENCE_CHECKLIST.join('\n'));
      return 1;
    }
    if (now >= ceiling) {
      console.log(`${file}: ceiling of ${timeoutMin} min reached without a new final stage marker`);
      return 3;
    }
    await sleep(Math.max(0, Math.min(intervalSec * 1000, ceiling - now)));
  }
}

process.exit(await main(process.argv.slice(2)));
