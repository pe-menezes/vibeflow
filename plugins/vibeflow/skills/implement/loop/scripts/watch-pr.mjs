#!/usr/bin/env node
// PR watcher: waits for the PR's checks to finish and exits, waking the session that started it.
// Run it in the background; the host calls the session back when the process exits, so nobody
// polls by hand and nobody waits hours for a CI that took a minute.

import { spawnSync } from 'node:child_process';

// The kit needs Node 18 or later (Node 16 has no global fetch): below it, say so and exit 64 first.
if (Number(process.versions.node.split('.')[0]) < 18) {
  process.stderr.write(`watch-pr.mjs: needs Node.js 18 or later; found ${process.versions.node}\n`);
  process.exit(64);
}

const PENDING = new Set(['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED', 'WAITING', 'REQUESTED', '']);
const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);

const USAGE = `usage: watch-pr.mjs --repo <owner/repo> --pr <n> [--interval-sec <s>] [--timeout-min <m>]

Reads the PR through gh every --interval-sec seconds (default 60) until every check has
finished, then exits. A PR with no check reported yet keeps the watch going, so it never
reads as green before CI starts. Gives up at --timeout-min minutes (default 480), and never
sleeps past that ceiling: each wait is cut to the time left. Limits take fractions.

exit 0 green · 1 failed · 2 closed or merged · 3 ceiling · 64 bad arguments`;

function fail(message) {
  console.error(`watch-pr: ${message}`);
  process.exit(64);
}

function parseArgs(argv) {
  const options = { repo: null, pr: null, intervalSec: 60, timeoutMin: 480 };
  const names = { '--repo': 'repo', '--pr': 'pr', '--interval-sec': 'intervalSec', '--timeout-min': 'timeoutMin' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = names[argv[i]];
    if (!key || argv[i + 1] === undefined) fail(`unexpected argument ${argv[i]}\n\n${USAGE}`);
    options[key] = argv[i + 1];
  }
  if (!options.repo || !/^[\w.-]+\/[\w.-]+$/.test(options.repo)) fail('--repo takes <owner/repo>');
  if (!/^\d+$/.test(String(options.pr))) fail('--pr takes a PR number');
  for (const key of ['intervalSec', 'timeoutMin']) {
    options[key] = Number(options[key]);
    if (!Number.isFinite(options[key]) || options[key] < 0) fail(`--${key === 'intervalSec' ? 'interval-sec' : 'timeout-min'} takes a number >= 0`);
  }
  return options;
}

function readPr(repo, pr) {
  const result = spawnSync('gh', ['pr', 'view', pr, '--repo', repo, '--json', 'state,statusCheckRollup,title,url'], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.error) throw new Error(`gh could not run: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gh exited ${result.status}: ${result.stderr.trim().slice(0, 200)}`);
  return JSON.parse(result.stdout);
}

function checks(info) {
  return (info.statusCheckRollup ?? []).map((check) => {
    const status = (check.status ?? '').toUpperCase();
    const conclusion = (check.conclusion ?? '').toUpperCase();
    const finished = conclusion && (status === '' || status === 'COMPLETED');
    return { name: check.name ?? check.context ?? '?', state: finished ? conclusion : status || (check.state ?? '').toUpperCase() };
  });
}

const clock = () => new Date().toTimeString().slice(0, 5);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  const { repo, pr, intervalSec, timeoutMin } = parseArgs(argv);
  const start = Date.now();
  const ceiling = start + timeoutMin * 60_000;
  const ceilingReached = () => Date.now() >= ceiling;
  const wait = (ms) => sleep(Math.max(0, Math.min(ms, ceiling - Date.now())));
  let failures = 0;

  for (;;) {
    let info;
    try {
      info = readPr(repo, pr);
      failures = 0;
    } catch (error) {
      failures += 1;
      console.log(`${clock()} read failed (${error.message}); attempt ${failures}`);
      if (ceilingReached()) {
        console.log(`${clock()} ceiling of ${timeoutMin} min reached without reading the PR`);
        return 3;
      }
      await wait(Math.min(intervalSec * failures, 600) * 1000);
      continue;
    }

    if (info.state !== 'OPEN') {
      console.log(`${clock()} PR #${pr} is ${info.state}: nothing to wait for · ${info.url ?? ''}`);
      return 2;
    }
    const list = checks(info);
    const pending = list.filter((check) => PENDING.has(check.state)).map((check) => check.name);
    const failed = list.filter((check) => FAILED.has(check.state)).map((check) => check.name);
    if (list.length > 0 && pending.length === 0) {
      const minutes = Math.floor((Date.now() - start) / 60_000);
      console.log(`${clock()} CI finished in ${minutes} min: ${list.map((check) => `${check.name}=${check.state}`).join(', ')}`);
      if (failed.length) {
        console.log(`failed: ${failed.join(', ')}`);
        return 1;
      }
      return 0;
    }
    if (ceilingReached()) {
      const what = list.length ? `pending: ${pending.join(', ')}` : 'no check reported on the PR (is CI configured?)';
      console.log(`${clock()} ceiling of ${timeoutMin} min reached; ${what}`);
      return 3;
    }
    await wait(intervalSec * 1000);
  }
}

process.exit(await main(process.argv.slice(2)));
