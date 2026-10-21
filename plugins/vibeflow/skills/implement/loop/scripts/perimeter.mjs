#!/usr/bin/env node
// Perimeter of a round: what changed since the base outside the globs the briefing allowed.
// Counts what was committed since the base, what is modified in the worktree (staged or not,
// deletions and both sides of a rename included) and what is new and not ignored.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// The kit needs Node 18 or later (Node 16 has no global fetch): below it, say so and exit 64 first.
if (Number(process.versions.node.split('.')[0]) < 18) {
  process.stderr.write(`perimeter.mjs: needs Node.js 18 or later; found ${process.versions.node}\n`);
  process.exit(64);
}

const USAGE = `usage: perimeter.mjs <dir> <base> <glob>...

Lists every file changed since <base> (committed, modified, deleted, untracked and not
ignored) that no <glob> matches. "**" matches any depth, "*" and "?" stay inside one folder,
a trailing "/" means everything below that folder.

exit 0 inside · 1 outside · 64 bad arguments, unknown base or not a git repository`;

function cleanEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

function fail(message) {
  console.error(`perimeter: ${message}`);
  process.exit(64);
}

function git(dir, args) {
  const result = spawnSync('git', args, { cwd: dir, env: cleanEnv(), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error) fail(`git could not run: ${result.error.message}`);
  if (result.status !== 0) fail(`git ${args.join(' ')} failed: ${result.stderr.trim().slice(0, 200)}`);
  return result.stdout;
}

function paths(output) {
  return output.split('\0').filter(Boolean);
}

function globToRegex(glob) {
  let pattern = glob.replace(/^\.\//, '');
  if (pattern.endsWith('/')) pattern += '**';
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern.startsWith('**/', i)) {
      out += '(?:.*/)?';
      i += 2;
    } else if (pattern.startsWith('**', i)) {
      out += '.*';
      i += 1;
    } else if (pattern[i] === '*') {
      out += '[^/]*';
    } else if (pattern[i] === '?') {
      out += '[^/]';
    } else {
      out += pattern[i].replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  if (argv.length < 3) fail(`expected <dir> <base> <glob>...\n\n${USAGE}`);
  const [dirArg, base, ...globs] = argv;
  const dir = git(resolve(dirArg), ['rev-parse', '--show-toplevel']).trim();
  const known = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { cwd: dir, env: cleanEnv() });
  if (known.status !== 0) fail(`base ${base} is not a commit in ${dir}`);

  const rules = globs.map(globToRegex);
  const changed = new Set([
    ...paths(git(dir, ['diff', '--name-only', '--no-renames', '-z', base, '--'])),
    ...paths(git(dir, ['ls-files', '--others', '--exclude-standard', '-z'])),
  ]);
  const outside = [...changed].filter((path) => !rules.some((rule) => rule.test(path))).sort();

  if (changed.size === 0) {
    console.log(`nothing changed since ${base}: no file was checked (is the base right?)`);
    return 0;
  }
  console.log(`${changed.size} file(s) changed since ${base}; ${outside.length} outside the perimeter`);
  for (const path of outside) console.log(`outside ${path}`);
  return outside.length > 0 ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
