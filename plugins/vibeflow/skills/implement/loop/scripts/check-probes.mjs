#!/usr/bin/env node
// State probes before the PR: audit tests that pin the repository's state instead of a behavior.
// A probe that reads git against a base, today's version, a doc sentence, a line number or the
// real clock goes red on the next unrelated change. This lists the suspect lines; the
// orchestrator decides, and a state probe moves to the audit report before the PR.

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

// The kit needs Node 18 or later (Node 16 has no global fetch): below it, say so and exit 64 first.
if (Number(process.versions.node.split('.')[0]) < 18) {
  process.stderr.write(`check-probes.mjs: needs Node.js 18 or later; found ${process.versions.node}\n`);
  process.exit(64);
}

const USAGE = `usage: check-probes.mjs <repo> [--base <ref>] [--dir <probe folder>]

Without --dir, the probes are the files under an "audit/" folder inside a test folder
(test/, tests/, __tests__/ or spec/, at any depth). With --base, only the probe files changed
since <ref> (committed, modified or untracked) are read; without it, every probe file is
(periodic pruning). A --dir folder is relative to the repository's top level, or absolute;
either way it must be a folder inside the repository.

exit 0 clean · 1 suspects · 64 bad arguments, git failure, or a --dir that does not exist,
is not a folder or is outside the repository`;

const FAMILIES = [
  ['reads git', /\b(execFileSync|execFile|spawnSync|spawn|execSync|exec)\(\s*['"`]git\b|subprocess\.\w+\(\s*\[\s*['"]git|\bgit (diff|log|show|rev-parse|status|ls-files)\b|origin\/(main|master)|HEAD~\d/],
  ['current version', /\bVERSION\b|['"]version['"]|\.version\b|package\.json|CHANGELOG|__version__|['"]v?\d+\.\d+\.\d+['"]/],
  ['state that changes by itself', /\b(still|remains|is)\s+(pending|open|unfixed|todo)\b|\bnot yet (done|fixed|implemented|shipped)\b/i],
  ['line number', /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|md|sh):\d+\b/],
  ['real clock', /\bDate\.now\(\)|new Date\(\s*\)|datetime\.(now|today|utcnow)\(|date\.today\(|time\.time\(\)/],
  ['doc text', /\b(readFileSync|readFile|read_text|open)\([^)]*\.(md|html|txt)\b/],
];

const DEFAULT_PROBE_PATH = /(^|\/)(test|tests|__tests__|spec)\/(.*\/)?audit\//;

function fail(message) {
  console.error(`check-probes: ${message}`);
  process.exit(64);
}

function cleanEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

function git(dir, args) {
  const result = spawnSync('git', args, { cwd: dir, env: cleanEnv(), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error) fail(`git could not run: ${result.error.message}`);
  if (result.status !== 0) fail(`git ${args.join(' ')} failed: ${result.stderr.trim().slice(0, 200)}`);
  return result.stdout.split('\0').filter(Boolean);
}

function parseArgs(argv) {
  const options = { repo: null, base: null, dir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base' || arg === '--dir') {
      if (!argv[i + 1]) fail(`${arg} takes a value`);
      options[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else if (!options.repo && !arg.startsWith('--')) {
      options.repo = arg;
    } else {
      fail(`unexpected argument ${arg}\n\n${USAGE}`);
    }
  }
  if (!options.repo) fail(`expected <repo>\n\n${USAGE}`);
  return options;
}

// The --dir folder as a path from the repository's top level: relative to the top level, or
// absolute as given; both through the system's realpath, so a folder reached by a symbolic link,
// or written in another letter case on a file system that ignores case, matches git's paths.
function probeFolder(top, dir) {
  let real;
  try {
    real = realpathSync.native(isAbsolute(dir) ? dir : join(top, dir));
  } catch {
    fail(`--dir ${dir} does not exist`);
  }
  if (!statSync(real).isDirectory()) fail(`--dir ${dir} is not a folder`);
  const inside = relative(realpathSync.native(top), real);
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) fail(`--dir ${dir} is outside the repository ${top}`);
  return inside.split(sep).join('/');
}

function probeFiles(top, { base, dir }) {
  const folder = dir === null ? null : probeFolder(top, dir);
  const inScope = folder === null
    ? (path) => DEFAULT_PROBE_PATH.test(path)
    : (path) => folder === '' || path.startsWith(`${folder}/`);
  const listed = base
    ? [
        ...git(top, ['diff', '--name-only', '--no-renames', '--diff-filter=d', '-z', base, '--']),
        ...git(top, ['ls-files', '--others', '--exclude-standard', '-z']),
      ]
    : git(top, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  return [...new Set(listed)].filter(inScope).sort();
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  const options = parseArgs(argv);
  const top = git(resolve(options.repo), ['rev-parse', '--show-toplevel'])[0].trim();
  const files = probeFiles(top, options);
  let suspects = 0;
  for (const path of files) {
    let lines;
    try {
      lines = readFileSync(join(top, path), 'utf8').split('\n');
    } catch {
      continue;
    }
    lines.forEach((line, index) => {
      const family = FAMILIES.find(([, pattern]) => pattern.test(line));
      if (!family) return;
      console.log(`${path}:${index + 1} [${family[0]}] ${line.trim().slice(0, 160)}`);
      suspects += 1;
    });
  }
  console.log(`${files.length} probe file(s) read; ${suspects} suspect line(s)`);
  if (files.length === 0) console.log('no probe file found: check --dir or --base if the audit wrote probes');
  if (suspects) {
    console.log('For each: a behavior probe stays; a state probe (git, version, sentence, line, clock, doc text) moves to the report before the PR.');
  }
  return suspects ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
