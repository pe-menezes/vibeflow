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

// Each check state sits in one of these lists; a state in none of them (a check finished
// without a conclusion, a state this script does not know, a check with no state) is never
// green. preflight.mjs carries the same three lines, and a test keeps them equal.
const GREEN = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE']);
const PENDING = new Set(['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED', 'WAITING', 'REQUESTED']);

const USAGE = `usage: watch-pr.mjs --repo [<host>/]<owner/repo> --pr <n> [--interval-sec <s>] [--timeout-min <m>]

--repo takes <owner/repo> or <host>/<owner/repo>, the forms gh --repo takes, and is passed to
gh as given. On GitHub Enterprise, give the host of the origin remote, as the loop does; the
host form was checked only against a fake gh, not against a real GitHub Enterprise. A host is a
machine name without a port; any other form exits 64.

Reads the PR through gh every --interval-sec seconds (default 60) until every check has
finished, then exits. A PR with no check reported yet keeps the watch going, so it never
reads as green before CI starts. Gives up at --timeout-min minutes (default 480), and never
sleeps past that ceiling: each wait is cut to the time left. Limits take fractions.

Each check counts by its state. green: SUCCESS, NEUTRAL, SKIPPED. failed: FAILURE, ERROR,
TIMED_OUT, CANCELLED, ACTION_REQUIRED, STARTUP_FAILURE, STALE. pending: PENDING, IN_PROGRESS,
QUEUED, EXPECTED, WAITING, REQUESTED. A state in none of these lists (a check finished with no
conclusion, a state this script does not know, a check with no state) is never green: once
nothing is pending it exits 1, with the check's name and state on the failed: line. NEUTRAL
and SKIPPED count as green, as GitHub Actions treats them for dependent checks and as
gh pr checks does not fail on them, and the closing line names them with their state.

gh missing, not executable, not logged in or with a refused credential cannot fix itself, so
it exits at the first read with a line that says what to do: 69 when gh is missing or cannot
be executed, 77 when it is not logged in or GitHub refuses its credential (gh exit 1 with
HTTP 401). Any other failed read (gh exit 1 without HTTP 401, a 403, network, a 5xx) is
retried until the ceiling. 64 is only for bad arguments (and a Node.js older than 18), so a
caller can tell its own mistake from a gh it cannot use by the code alone.

exit 0 green · 1 failed · 2 closed or merged · 3 ceiling · 64 bad arguments · 69 gh missing or not executable · 77 gh not logged in or credential refused`;

// gh exits 4 when it needs authentication.
const GH_AUTH_EXIT = 4;
// gh exits 1 with this in its error when GitHub refuses the token (invalid, revoked or expired).
const REFUSED = /\bHTTP 401\b/;

// The host gh talks to: the one in --repo, or else GH_HOST, or else github.com.
function hostOf(repo) {
  const parts = repo.split('/');
  return (parts.length === 3 ? parts[0] : process.env.GH_HOST || 'github.com').toLowerCase();
}

// gh reads a token from the environment before its stored login, so a token set there is the
// one to replace; gh auth login would not change what gh sends. Which variables it reads depends
// on the host (gh help environment): GH_TOKEN, then GITHUB_TOKEN, for github.com and a subdomain
// of ghe.com; GH_ENTERPRISE_TOKEN, then GITHUB_ENTERPRISE_TOKEN, for a GitHub Enterprise Server host.
function credentialFix(repo) {
  const host = hostOf(repo);
  const enterprise = host !== 'github.com' && !host.endsWith('.ghe.com');
  const login = host === 'github.com' ? '`gh auth login`' : `\`gh auth login --hostname ${host}\``;
  const set = (enterprise ? ['GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN'] : ['GH_TOKEN', 'GITHUB_TOKEN'])
    .filter((name) => process.env[name]);
  if (set.length === 0) return `run ${login}`;
  return `replace the token in ${set.join(' and ')}, which gh uses before its stored login, or unset ${set.length === 1 ? 'it' : 'them'} and run ${login}`;
}
// sysexits: the service is unavailable, and the permission is missing.
const EX_UNAVAILABLE = 69;
const EX_NOPERM = 77;

// A failure that waiting cannot fix, with the exit code that names it.
class Permanent extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// --repo is <owner/repo>, or <host>/<owner/repo> for a GitHub Enterprise host: the two forms the
// --repo flag of gh documents. The host is a machine name (dot-separated labels of letters,
// digits and hyphens); gh documents no port there, so a host with a port is a bad argument.
const HOST = /[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*/;
const REPO = new RegExp(`^(?:${HOST.source}\\/)?[\\w.-]+\\/[\\w.-]+$`);

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
  if (!options.repo || !REPO.test(options.repo)) fail('--repo takes <owner/repo> or <host>/<owner/repo>, the two forms gh --repo takes');
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
  if (result.error?.code === 'ENOENT') {
    throw new Permanent('gh is not installed; install the GitHub CLI, or watch the checks on the pull request page', EX_UNAVAILABLE);
  }
  if (result.error?.code === 'EACCES') {
    throw new Permanent('gh cannot be executed (permission denied); fix the permissions of the gh on PATH, or watch the checks on the pull request page', EX_UNAVAILABLE);
  }
  if (result.error) throw new Error(`gh could not run: ${result.error.message}`);
  if (result.status === GH_AUTH_EXIT) {
    throw new Permanent(`gh is not logged in; run \`gh auth login\`, then start the watch again (${result.stderr.trim().slice(0, 200)})`, EX_NOPERM);
  }
  if (result.status === 1 && REFUSED.test(result.stderr)) {
    throw new Permanent(`GitHub refused the credential gh uses; ${credentialFix(repo)}, then start the watch again (${result.stderr.split('\n').find((line) => REFUSED.test(line)).trim().slice(0, 200)})`, EX_NOPERM);
  }
  if (result.status !== 0) throw new Error(`gh exited ${result.status}: ${result.stderr.trim().slice(0, 200)}`);
  return JSON.parse(result.stdout);
}

// `unknown` says why a state outside the three lists is not green, for the failed: line.
function checks(info) {
  return (info.statusCheckRollup ?? []).map((check) => {
    const status = (check.status ?? '').toUpperCase();
    const conclusion = (check.conclusion ?? '').toUpperCase();
    const finished = conclusion && (status === '' || status === 'COMPLETED');
    const state = finished ? conclusion : status || (check.state ?? '').toUpperCase();
    const known = GREEN.has(state) || FAILED.has(state) || PENDING.has(state);
    let unknown = null;
    if (!known) {
      if (state === 'COMPLETED') unknown = 'COMPLETED with no conclusion';
      else if (state === '') unknown = 'no state';
      else unknown = `${state}, not a known check state`;
    }
    return { name: check.name ?? check.context ?? '?', state, unknown };
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
      if (error instanceof Permanent) {
        console.error(`watch-pr: ${error.message}`);
        return error.code;
      }
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
    const failed = list
      .filter((check) => FAILED.has(check.state) || check.unknown)
      .map((check) => (check.unknown ? `${check.name} (${check.unknown})` : check.name));
    if (list.length > 0 && pending.length === 0) {
      const minutes = Math.floor((Date.now() - start) / 60_000);
      console.log(`${clock()} CI finished in ${minutes} min: ${list.map((check) => `${check.name}=${check.state || '(no state)'}`).join(', ')}`);
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
