#!/usr/bin/env node
// Builds the gate-languages fixture in a scratch directory:
//
//   node test/fixtures/gate-languages/make.mjs <dest>
//
// <dest>/repo           a git repository with two commits: the base, with the context of every
//                       case and the protections SEC101 takes out, and the change, which adds
//                       the planted lines and the decoys and removes those protections. The
//                       diff the Critical Gate reads is `git -C <dest>/repo diff HEAD~1 HEAD`.
// <dest>/manifest.json  the list of cases (matrix.mjs, buildFixture): where each one is and its
//                       labels.
//
// <dest> must be missing or an empty directory; anything else is refused and nothing is touched.
// Author, committer, date and git configuration are fixed, so two runs build the same commits.
// No dependency, no network, no model. Everything in the repository is invented, and the secret
// it plants is fake.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFixture } from './matrix.mjs';

const DATE = '2026-01-20T12:00:00+0000';

export const GIT_IDENTITY = Object.freeze({
  GIT_AUTHOR_NAME: 'Fixture Author',
  GIT_AUTHOR_EMAIL: 'author@fixture.invalid',
  GIT_COMMITTER_NAME: 'Fixture Author',
  GIT_COMMITTER_EMAIL: 'author@fixture.invalid',
  GIT_AUTHOR_DATE: DATE,
  GIT_COMMITTER_DATE: DATE,
});

const COMMIT_MESSAGES = Object.freeze({ base: 'Service code in several languages', change: 'Account, billing and maintenance changes' });

function gitEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  return { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull, ...GIT_IDENTITY };
}

function writeAll(root, files) {
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
}

// Builds <dest>/repo from a fixture ({ base, change, cases }: the files of the base commit, the
// files of the change commit and the cases) and writes <dest>/manifest.json. The gate-tech fixture
// builds its repository with it.
export function makeFixtureRepository(dest, fixture, messages = COMMIT_MESSAGES) {
  const root = resolve(dest);
  if (existsSync(root)) {
    if (!statSync(root).isDirectory()) throw new Error(`${root} exists and is not a directory`);
    if (readdirSync(root).length > 0) throw new Error(`${root} is not empty`);
  }
  const repo = join(root, 'repo');
  mkdirSync(repo, { recursive: true });
  const env = gitEnv();
  const git = (args) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=' + devNull, ...args], { cwd: repo, env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    return result.stdout;
  };

  const { base, change, cases } = fixture;
  git(['init', '-q', '-b', 'main']);
  git(['config', 'commit.gpgsign', 'false']);
  writeAll(repo, base);
  git(['add', '-A']);
  git(['commit', '-q', '-m', messages.base]);
  writeAll(repo, change);
  git(['add', '-A']);
  git(['commit', '-q', '-m', messages.change]);

  const manifest = join(root, 'manifest.json');
  writeFileSync(manifest, `${JSON.stringify(cases, null, 2)}\n`);
  return { root, repo, manifest, cases: cases.length };
}

export function makeGateLanguages(dest) {
  return makeFixtureRepository(dest, buildFixture());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('--')) {
    process.stderr.write('usage: make.mjs <dest>\n');
    process.exit(64);
  }
  try {
    const result = makeGateLanguages(args[0]);
    console.log(result.repo);
    console.log(result.manifest);
  } catch (error) {
    process.stderr.write(`make.mjs: ${error.message}\n`);
    process.exit(1);
  }
}
