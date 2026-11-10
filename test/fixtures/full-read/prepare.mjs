#!/usr/bin/env node
// Prepares the full-read fixture in a scratch directory:
//
//   node test/fixtures/full-read/prepare.mjs <empty or missing dir> --stage genspec|implement|audit
//
// Builds <dir>/app from the external-import fixture's app (read, never
// changed), then lays this fixture's app/ over it: the .vibeflow/ in the state
// a 1.18.0 import leaves it, at the scale of a real project. The folder this
// repository's .gitignore would hide is stored as vibeflow/ and renamed in the
// copy. By stage:
//
//   genspec    one commit, no .vibeflow/specs/
//   implement  one commit, with the fixed spec at .vibeflow/specs/profile-edit.md
//   audit      the implement commit plus a second one with the feature
//
// Author, committer, dates and config are fixed. No model is called. Prints
// one line of JSON: {"stage": "...", "app": "<abs>", "spec": "<abs>" | null}
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_APP = join(HERE, '..', 'external-import', 'app');
const RENAMES = { vibeflow: '.vibeflow' };
const SKIP = new Set(['.DS_Store']);
const STAGES = ['genspec', 'implement', 'audit'];
const SPEC_PATH = '.vibeflow/specs/profile-edit.md';
const FIRST_DATE = '2026-01-20T12:00:00+0000';
const SECOND_DATE = '2026-01-21T12:00:00+0000';

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

function gitEnv(date) {
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
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: 'Fixture Author',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_DATE: date,
  };
}

function git(cwd, date, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv(date) });
  if (result.status !== 0) fail(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function commit(cwd, date, message) {
  git(cwd, date, 'add', '--all', '--force');
  git(cwd, date, '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--no-verify', '-m', message);
}

function parseArgs(argv) {
  let target = null;
  let stage = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--stage') stage = argv[++i] ?? null;
    else if (argv[i].startsWith('--stage=')) stage = argv[i].slice('--stage='.length);
    else if (target === null) target = argv[i];
    else fail(`unexpected argument: ${argv[i]}`);
  }
  return { target, stage };
}

const usage = 'usage: node prepare.mjs <empty directory> --stage genspec|implement|audit';
const { target, stage } = parseArgs(process.argv.slice(2));
if (!target) fail(usage);
if (!STAGES.includes(stage)) fail(`unknown or missing stage: ${stage ?? '(none)'}\n${usage}`);

const dir = resolve(target);
if (existsSync(dir)) {
  if (readdirSync(dir).length > 0) fail(`refusing ${dir}: directory is not empty`);
} else {
  mkdirSync(dir, { recursive: true });
}

const app = join(dir, 'app');
copyTree(BASE_APP, app, true);
copyTree(join(HERE, 'app'), app, true);

let spec = null;
if (stage !== 'genspec') {
  spec = join(app, SPEC_PATH);
  mkdirSync(dirname(spec), { recursive: true });
  writeFileSync(spec, readFileSync(join(HERE, 'spec', 'profile-edit.md')));
  chmodSync(spec, 0o644);
}

git(app, FIRST_DATE, 'init', '--quiet', '--initial-branch=main');
commit(app, FIRST_DATE, 'sample-app: initial commit');

if (stage === 'audit') {
  copyTree(join(HERE, 'feature'), app, false);
  commit(app, SECOND_DATE, 'Add the profile edit screen');
}

process.stdout.write(`${JSON.stringify({ stage, app, spec })}\n`);
