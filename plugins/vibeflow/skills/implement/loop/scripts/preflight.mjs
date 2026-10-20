#!/usr/bin/env node
// Preflight before a long dispatch: measures now instead of assuming. The repository's git
// state, the network, the CI of open PRs, the effort variable that overrides agent definitions,
// and, as an option on macOS, power, lid and sleep. One line per check, then the verdict.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const GO = 0;
const ATTENTION = 1;
const STOP = 2;
const LABEL = { [GO]: '[ok]', [ATTENTION]: '[attention]', [STOP]: '[stop]' };
const MIN_BATTERY = 25;
const DEFAULT_PROBES = ['https://api.github.com'];

const USAGE = `usage: preflight.mjs --repo <dir> [--hours <n>] [--default-branch <name>] [--probe-url <url>]... [--power] [--no-network]

Checks the repository (not the default branch, dirty files, stashes), the network (HEAD
requests to api.github.com and to every --probe-url, such as the model provider's API), the CI
of open PRs through gh when it is installed, and CLAUDE_CODE_EFFORT_LEVEL when it is set.
--power adds battery, lid and sleep through pmset and ioreg (macOS). --hours is the expected
length of the work (default 1); work of an hour or more asks for mains power.

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
  const options = { repo: null, hours: 1, defaultBranch: null, probes: [...DEFAULT_PROBES], power: false, network: true };
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

function pullRequests(repo) {
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
    const states = (pr.statusCheckRollup ?? []).map((check) => (check.conclusion || check.status || check.state || '').toUpperCase());
    const pending = states.some((state) => ['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED', 'WAITING'].includes(state));
    const failed = states.some((state) => ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED'].includes(state));
    const label = pending ? 'CI running: arm watch-pr.mjs' : failed ? 'CI red' : 'CI green or no checks';
    return [pending || failed ? ATTENTION : GO, `PR #${pr.number}${pr.isDraft ? ' (draft)' : ''}: ${label} · ${(pr.title ?? '').slice(0, 60)}`];
  });
}

async function network(probes) {
  const failures = [];
  for (const url of probes) {
    try {
      await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
    } catch (error) {
      failures.push(`${url} (${error.cause?.code ?? error.name})`);
    }
  }
  if (failures.length === 0) return [[GO, `network: ${probes.join(', ')} answer`]];
  return [[failures.length === probes.length ? STOP : ATTENTION, `network: no answer from ${failures.join(', ')}`]];
}

function effort() {
  const value = process.env.CLAUDE_CODE_EFFORT_LEVEL;
  if (!value) return [[GO, 'effort: CLAUDE_CODE_EFFORT_LEVEL unset; each agent definition keeps its own effort']];
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
  if (isRepo) results.push(...pullRequests(repo));
  results.push(...(options.network ? await network(options.probes) : [[GO, 'network: not probed (--no-network)']]));
  results.push(...effort());
  if (options.power) results.push(...power(options.hours));

  for (const [level, text] of results) console.log(`${LABEL[level]} ${text}`);
  const worst = Math.max(...results.map(([level]) => level));
  console.log(`verdict: ${worst === GO ? 'go' : worst === ATTENTION ? 'go once each attention line is resolved or declared' : 'stop: do not dispatch long work'}`);
  return worst;
}

process.exit(await main(process.argv.slice(2)));
