#!/usr/bin/env node
// Prepares the external-import fixture in a scratch directory:
//
//   node test/fixtures/external-import/prepare.mjs <empty or missing dir>
//
// Copies source/ and app/ into <dir>, renames the folders this repository's
// .gitignore would hide (claude/ -> .claude/, vibeflow/ -> .vibeflow/,
// _docs/ -> docs/), and turns each copy into a git repository with one commit.
// Author, committer, dates and config are fixed, so the source commit sha is
// the same on every run. Prints one line of JSON:
//   {"source": "<abs>", "app": "<abs>", "sourceCommit": "<sha>"}
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RENAMES = { claude: '.claude', vibeflow: '.vibeflow', _docs: 'docs' };
const SKIP = new Set(['.DS_Store']);
const FIXED_DATE = '2026-01-15T12:00:00+0000';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function copyTree(from, to, top) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const name = top && RENAMES[entry.name] ? RENAMES[entry.name] : entry.name;
    const src = join(from, entry.name);
    const dest = join(to, name);
    if (entry.isDirectory()) copyTree(src, dest, false);
    else if (entry.isFile()) {
      writeFileSync(dest, readFileSync(src));
      chmodSync(dest, 0o644);
    }
  }
}

function gitEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_AUTHOR_DATE: FIXED_DATE,
    GIT_COMMITTER_NAME: 'Fixture Author',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_DATE: FIXED_DATE,
  };
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv() });
  if (result.status !== 0) fail(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function makeRepo(from, to, message) {
  copyTree(from, to, true);
  git(to, 'init', '--quiet', '--initial-branch=main');
  git(to, 'add', '--all', '--force');
  git(to, '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--no-verify', '-m', message);
  return git(to, 'rev-parse', 'HEAD');
}

const target = process.argv[2];
if (!target) fail('usage: node prepare.mjs <empty directory>');

const dir = resolve(target);
if (existsSync(dir)) {
  if (readdirSync(dir).length > 0) fail(`refusing ${dir}: directory is not empty`);
} else {
  mkdirSync(dir, { recursive: true });
}

const source = join(dir, 'source');
const app = join(dir, 'app');
const sourceCommit = makeRepo(join(HERE, 'source'), source, 'team-conventions: initial import');
makeRepo(join(HERE, 'app'), app, 'sample-app: initial commit');

process.stdout.write(`${JSON.stringify({ source, app, sourceCommit })}\n`);
