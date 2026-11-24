#!/usr/bin/env node
// Builds the gate-tech fixture in a scratch directory:
//
//   node test/fixtures/gate-tech/make.mjs <dest>
//
// <dest>/repo           a git repository with two commits: the base, with the context of every
//                       case and the lines the change removes, and the change, which adds the
//                       planted lines, the controls and the decoys and removes what the removed-line
//                       rules (IAC104, CFG105, one IAC103 case) take out. Every file sits under a
//                       top folder named after its format; the diff of one format is
//                       `git -C <dest>/repo diff HEAD~1 HEAD -- <format>/`.
// <dest>/manifest.json  the list of cases (matrix.mjs, buildFixture): where each one is, its kind
//                       and its labels.
//
// The same contract as gate-languages/make.mjs, whose builder it reuses: <dest> must be missing or
// an empty directory, anything else is refused and nothing is touched; author, committer, date and
// git configuration are fixed, so two runs build the same commits. No dependency, no network, no
// model. Everything in the repository is invented.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeFixtureRepository } from '../gate-languages/make.mjs';
import { buildFixture } from './matrix.mjs';

const MESSAGES = Object.freeze({ base: 'Database, infrastructure, deployment and service configuration', change: 'Schema, infrastructure, deployment and configuration changes' });

export function makeGateTech(dest) {
  return makeFixtureRepository(dest, buildFixture(), MESSAGES);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('--')) {
    process.stderr.write('usage: make.mjs <dest>\n');
    process.exit(64);
  }
  try {
    const result = makeGateTech(args[0]);
    console.log(result.repo);
    console.log(result.manifest);
  } catch (error) {
    process.stderr.write(`make.mjs: ${error.message}\n`);
    process.exit(1);
  }
}
