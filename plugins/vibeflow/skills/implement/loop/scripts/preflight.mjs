#!/usr/bin/env node
// Preflight before a long dispatch: measures now instead of assuming. The repository's git
// state, the network, the CI of open PRs, whether gh can open the pull request at the end, the
// effort variable that overrides agent definitions, and, as an option on macOS, power, lid and
// sleep. One line per check, then the verdict.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// The kit needs Node 18 or later (Node 16 has no global fetch): below it, say so and exit 64 first.
if (Number(process.versions.node.split('.')[0]) < 18) {
  process.stderr.write(`preflight.mjs: needs Node.js 18 or later; found ${process.versions.node}\n`);
  process.exit(64);
}

const GO = 0;
const ATTENTION = 1;
const STOP = 2;
const LABEL = { [GO]: '[ok]', [ATTENTION]: '[attention]', [STOP]: '[stop]' };
const MIN_BATTERY = 25;

// Each check state sits in one of these lists; a state in none of them (a check finished
// without a conclusion, a state this script does not know, a check with no state) is never
// green. watch-pr.mjs carries the same three lines, and a test keeps them equal.
const GREEN = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE']);
const PENDING = new Set(['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED', 'WAITING', 'REQUESTED']);

const USAGE = `usage: preflight.mjs --repo <dir> [--hours <n>] [--default-branch <name>] [--probe-url <url>]... [--power] [--no-network]

Checks the repository (not the default branch, dirty files, stashes), the network, the CI of
open PRs through gh when it is installed, how the pull request can be opened at the end, and
CLAUDE_CODE_EFFORT_LEVEL when it is set. --power adds battery, lid and sleep through pmset and
ioreg (macOS). --hours is the expected length of the work (default 1); work of an hour or more
asks for mains power.

network: a HEAD request to the host of the origin remote (<scheme>://<host[:port]> for an http
or https remote, https://<host> for git@host:... and ssh://) and to every --probe-url, such as
the model provider's API. Every --probe-url failing is a stop; the origin host failing is
attention (an http or https push goes through it; an ssh push does not need it); no origin and
no --probe-url is attention. Credentials written in the origin URL or in a --probe-url are
never printed.
pr ending: gh auth status --hostname <origin host>. Without gh logged in to that host, the loop
ends with the branch pushed and the pull request body written, for you to open the pull request
or merge request by hand, and the open PRs are not listed.
--no-network skips the probes and every gh call (open PRs and pr ending).

exit 0 go · 1 attention · 2 stop · 64 bad arguments`;

function fail(message) {
  console.error(`preflight: ${message}`);
  process.exit(64);
}

function cleanEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env: cleanEnv(), encoding: 'utf8', timeout: 20_000 });
  if (result.error) return { status: 127, out: result.error.code === 'ENOENT' ? 'not installed' : result.error.message };
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

function parseArgs(argv) {
  const options = { repo: null, hours: 1, defaultBranch: null, probes: [], power: false, network: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      if (argv[i + 1] === undefined) fail(`${arg} takes a value`);
      i += 1;
      return argv[i];
    };
    if (arg === '--repo') options.repo = value();
    else if (arg === '--hours') options.hours = Number(value());
    else if (arg === '--default-branch') options.defaultBranch = value();
    else if (arg === '--probe-url') options.probes.push(value());
    else if (arg === '--power') options.power = true;
    else if (arg === '--no-network') options.network = false;
    else fail(`unexpected argument ${arg}\n\n${USAGE}`);
  }
  if (!options.repo) fail('--repo is required');
  if (!Number.isFinite(options.hours) || options.hours < 0) fail('--hours takes a number >= 0');
  return options;
}

function defaultBranches(repo, explicit) {
  if (explicit) return [explicit];
  const remote = run('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], repo);
  if (remote.status === 0 && remote.out.trim()) return [remote.out.trim().replace(/^origin\//, '')];
  return ['main', 'master'];
}

function repository(repo, explicitDefault) {
  const inside = run('git', ['rev-parse', '--is-inside-work-tree'], repo);
  if (!existsSync(repo) || inside.status !== 0 || inside.out.trim() !== 'true') {
    return { isRepo: false, lines: [[STOP, `repository: ${repo} is not a git checkout`]] };
  }
  const branch = run('git', ['branch', '--show-current'], repo).out.trim();
  const dirty = run('git', ['status', '--porcelain'], repo).out.split('\n').filter((line) => line.trim());
  const stashes = run('git', ['stash', 'list'], repo).out.split('\n').filter((line) => line.trim());
  const lines = [];
  if (!branch) {
    lines.push([ATTENTION, 'repository: detached HEAD; the loop commits each round on a feature branch']);
  } else if (defaultBranches(repo, explicitDefault).includes(branch)) {
    lines.push([STOP, `repository: on the default branch ${branch}; the loop commits rounds on a feature branch`]);
  }
  const summary = `repository: branch ${branch || '(detached)'}, ${dirty.length} dirty file(s), ${stashes.length} stash(es)`;
  const unclean = dirty.length > 0 || stashes.length > 0;
  lines.push([unclean ? ATTENTION : GO, unclean ? `${summary}; the briefing says whose each one is` : summary]);
  return { isRepo: true, lines };
}

// A URL as printed, the origin in any form and every --probe-url: without the credentials it
// may carry (user:password@ or token@), worked on the text before any attempt to parse it.
// With a scheme, everything between "<scheme>://" and the last @ goes, so a password holding a
// space, a / or an @ cannot leak; a path holding an @ loses more than the credentials, which is
// the safe side. Without a scheme (user@host:path, or user:password@host/path), everything up to
// the last @ goes, the same way.
function shown(url) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[\s\S]*@/i, '$1');
  return url.replace(/^[\s\S]*@/, '');
}

// The origin remote: the URL the network probe uses and the host gh is asked about.
// An http(s) remote probes itself; an ssh remote probes https on the same host.
function origin(repo) {
  const result = run('git', ['remote', 'get-url', 'origin'], repo);
  const url = result.status === 0 ? result.out.trim() : '';
  if (!url) return null;
  const remote = (fields) => ({ url: shown(url), probe: null, host: null, http: false, parses: true, ...fields });
  const parse = (text) => {
    try {
      return new URL(text);
    } catch {
      return null;
    }
  };
  if (/^https?:\/\//i.test(url)) {
    const parsed = parse(url);
    if (parsed) return remote({ probe: `${parsed.protocol}//${parsed.host}`, host: parsed.hostname, http: true });
    return remote({ parses: false });
  } else if (/^ssh:\/\//i.test(url)) {
    const parsed = parse(url);
    if (parsed) return remote({ probe: `https://${parsed.hostname}`, host: parsed.hostname });
    return remote({ parses: false });
  } else {
    const scp = url.match(/^(?:[^@/]+@)?([^:/]+):(?!\/\/)/);
    if (scp && !/^[a-z]:[\\/]/i.test(url)) return remote({ probe: `https://${scp[1]}`, host: scp[1] });
  }
  return remote({});
}

const BY_HAND = 'without it the loop ends with the branch pushed and the pull request body written, for you to open the pull request or merge request by hand';

// Returns the pr ending line, and `unserved`: gh answered that it is not logged in to the origin
// host or does not serve it.
function prEnding(repo, remote) {
  const ending = (level, text, unserved = false) => ({ lines: [[level, `pr ending: ${text}`]], unserved });
  if (!remote) return ending(ATTENTION, 'no origin remote; the loop has nowhere to push the branch or open a pull request');
  if (!remote.host) return ending(ATTENTION, `origin ${remote.url} has no host for gh; ${BY_HAND}`);
  const result = run('gh', ['auth', 'status', '--hostname', remote.host], repo);
  if (result.status === 127 && result.out === 'not installed') return ending(ATTENTION, `gh not installed; ${BY_HAND}`);
  if (result.status !== 0) {
    return ending(ATTENTION, `gh is not logged in to ${remote.host} or does not serve it (gh auth login --hostname ${remote.host}); ${BY_HAND}`, true);
  }
  return ending(GO, `gh can open the pull request on ${remote.host}`);
}

// Open PRs are read only from a host gh is logged in to: anywhere else gh pr list can only
// fail, and the pr ending line already says so.
function pullRequests(repo, remote, ending) {
  if (ending.unserved) return [[GO, `CI: open PRs not checked, gh is not logged in to ${remote.host} or does not serve it (see pr ending)`]];
  const result = run('gh', ['pr', 'list', '--state', 'open', '--json', 'number,title,statusCheckRollup,isDraft'], repo);
  if (result.status === 127 && result.out === 'not installed') return [[GO, 'CI: gh not installed, open PRs not checked']];
  if (result.status !== 0) return [[ATTENTION, `CI: gh did not answer (${result.out.trim().slice(0, 80)})`]];
  let open;
  try {
    open = JSON.parse(result.out || '[]');
  } catch {
    return [[ATTENTION, 'CI: gh answered something that is not JSON']];
  }
  if (open.length === 0) return [[GO, 'open PRs: none']];
  return open.map((pr) => {
    const checks = (pr.statusCheckRollup ?? []).map((check) => ({
      name: check.name ?? check.context ?? '?',
      state: (check.conclusion || check.status || check.state || '').toUpperCase(),
    }));
    const pending = checks.some(({ state }) => PENDING.has(state));
    const failed = checks.some(({ state }) => FAILED.has(state));
    const unknown = checks.filter(({ state }) => !GREEN.has(state) && !FAILED.has(state) && !PENDING.has(state));
    const named = unknown.map(({ name, state }) => `${name}=${state || '(no state)'}`).join(', ');
    let label = 'CI green or no checks';
    if (pending) label = 'CI running: arm watch-pr.mjs';
    else if (failed) label = 'CI red';
    else if (unknown.length) label = `CI not green, a check state that is not known: ${named}`;
    const green = !pending && !failed && unknown.length === 0;
    return [green ? GO : ATTENTION, `PR #${pr.number}${pr.isDraft ? ' (draft)' : ''}: ${label} · ${(pr.title ?? '').slice(0, 60)}`];
  });
}

async function answers(url) {
  const printed = shown(url);
  try {
    await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
    return null;
  } catch (error) {
    return `${printed} (${error.cause?.code ?? error.name})`;
  }
}

// Only the probes the person named can stop the dispatch: the origin host is a guess at
// what the push needs, and an ssh push does not need its https side.
async function network(remote, given) {
  const fallback = remote?.probe ?? null;
  if (!fallback && given.length === 0) {
    const kind = remote?.parses === false ? 'does not parse as a URL' : 'is not an http or ssh remote';
    const why = remote ? `origin ${remote.url} ${kind}` : 'no origin remote';
    return [[ATTENTION, `network: nothing to probe (${why}, no --probe-url)`]];
  }
  const probes = fallback ? [fallback, ...given] : given;
  const failures = [];
  for (const url of probes) {
    const failure = await answers(url);
    if (failure) failures.push(failure);
  }
  if (failures.length === 0) return [[GO, `network: ${probes.map(shown).join(', ')} answer`]];
  const givenFailures = failures.length - (fallback && failures[0].startsWith(`${fallback} `) ? 1 : 0);
  const level = given.length > 0 && givenFailures === given.length ? STOP : ATTENTION;
  const push = remote?.http ? 'the push to an http(s) origin goes through it' : 'a push over SSH does not need it';
  const why = givenFailures < failures.length ? `; ${fallback} is the origin host, and ${push}` : '';
  return [[level, `network: no answer from ${failures.join(', ')}${why}`]];
}

function effort() {
  const value = process.env.CLAUDE_CODE_EFFORT_LEVEL;
  if (!value) return [];
  return [[ATTENTION, `effort: CLAUDE_CODE_EFFORT_LEVEL=${value} is set; it overrides the effort of the executor and auditor definitions`]];
}

function power(hours) {
  const battery = run('pmset', ['-g', 'batt']);
  if (battery.status !== 0) return [[ATTENTION, `power: pmset did not answer (${battery.out.trim().slice(0, 80)})`]];
  const mains = battery.out.includes("'AC Power'");
  const level = Number(battery.out.match(/(\d+)%/)?.[1] ?? NaN);
  const text = `${mains ? 'mains' : 'battery'}, ${Number.isNaN(level) ? '?' : level}%`;
  const lines = [];
  if (mains) lines.push([GO, `power: ${text}`]);
  else if (level < MIN_BATTERY) lines.push([STOP, `power: ${text}, below ${MIN_BATTERY}%: the machine sleeps mid-round`]);
  else if (hours >= 1) lines.push([ATTENTION, `power: ${text}; ${hours} h of work asks for mains power`]);
  else lines.push([GO, `power: ${text}`]);

  const closed = /"AppleClamshellState" = Yes/.test(run('ioreg', ['-r', '-k', 'AppleClamshellState', '-d', '4']).out);
  if (closed && !mains) lines.push([STOP, 'lid: closed on battery; lid sleep wins over any keep-awake']);
  else if (closed) lines.push([ATTENTION, 'lid: closed; stays awake only on mains with an external display']);
  else lines.push([GO, 'lid: open']);

  const assertions = run('pmset', ['-g', 'assertions']).out;
  const held = /PreventUserIdleSystemSleep\s+1|PreventSystemSleep\s+1/.test(assertions);
  if (held) lines.push([GO, 'sleep: prevented by an active assertion']);
  else if (hours >= 1) lines.push([ATTENTION, 'sleep: nothing prevents idle sleep; keep the machine awake for the length of the work']);
  else lines.push([GO, 'sleep: no assertion, short work']);
  return lines;
}

async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  const options = parseArgs(argv);
  const repo = resolve(options.repo);
  const { isRepo, lines: results } = repository(repo, options.defaultBranch);
  if (options.network) {
    const remote = isRepo ? origin(repo) : null;
    const ending = isRepo ? prEnding(repo, remote) : null;
    if (isRepo) results.push(...pullRequests(repo, remote, ending));
    results.push(...(await network(remote, options.probes)));
    if (isRepo) results.push(...ending.lines);
  } else {
    results.push([GO, 'network: not probed, gh not called (--no-network)']);
  }
  results.push(...effort());
  if (options.power) results.push(...power(options.hours));

  for (const [level, text] of results) console.log(`${LABEL[level]} ${text}`);
  const worst = Math.max(...results.map(([level]) => level));
  console.log(`verdict: ${worst === GO ? 'go' : worst === ATTENTION ? 'go once each attention line is resolved or declared' : 'stop: do not dispatch long work'}`);
  return worst;
}

process.exit(await main(process.argv.slice(2)));
