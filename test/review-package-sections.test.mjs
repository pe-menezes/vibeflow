// The review package's `## Files and lines`, `## New files` and `## git status --short` sections,
// checked against git itself in the same repository: the cases are the forms git produces, and git
// is the oracle for what each line must be.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runScript, withSandbox } from './loop-helpers.mjs';

const LINE_NOTE = '(line left out: it looks like a secret or credential; see HEADER LINES LEFT OUT at the top)';
const NO_UNTRACKED = '(no untracked file; a file added since the base and already in git is marked new under Files and lines)';
// Split so secret scanners do not flag this file; the same name as in loop-scripts.test.mjs.
const SECRET_LOOKING_NAME = `${'API'}${'_TOKEN'}=${'f4ke'}${'Va1ue9x7Q'}`;

const NAMES = {
  plain: 'file',
  space: 'with space',
  quote: 'with "quote"',
  tab: 'with\ttab',
  accent: 'ação',
};
const CONFIGS = {
  'rename detection on': [],
  'diff.renames=false': [['diff.renames', 'false']],
};

function section(text, heading, next) {
  const start = text.indexOf(`${heading}\n\n`);
  assert.ok(start >= 0, `no ${heading} section`);
  const rest = text.slice(start + heading.length + 2);
  const end = rest.indexOf(`\n\n${next}`);
  assert.ok(end >= 0, `no ${next} after ${heading}`);
  return rest.slice(0, end);
}

// Every numstat entry of `git diff --numstat -z <base>`, as git prints it.
function numstat(box, base) {
  const fields = box.git('diff', '--numstat', '-z', base).split('\0');
  const entries = [];
  for (let i = 0; i < fields.length; i += 1) {
    const match = /^(-|\d+)\t(-|\d+)\t([\s\S]*)$/.exec(fields[i]);
    if (!match) continue;
    const paths = match[3] ? [match[3]] : [fields[i + 1], fields[i + 2]];
    if (!match[3]) i += 2;
    entries.push({ added: match[1], removed: match[2], paths });
  }
  return entries;
}

// The paths `git diff --name-status -z <base>` gives as A.
function addedByGit(box, base) {
  const fields = box.git('diff', '--name-status', '-z', base).split('\0');
  const added = new Set();
  for (let i = 0; i < fields.length;) {
    const status = fields[i];
    if (!status) { i += 1; continue; }
    if (/^[RC]/.test(status)) { i += 3; continue; }
    if (status === 'A') added.add(fields[i + 1]);
    i += 2;
  }
  return added;
}

// One repository holding every form of a path's state between the base and the worktree, each
// under its own folder, for one file name.
function buildShapes(box, name, config) {
  for (const [key, value] of config) box.git('config', key, value);
  const lines = (count, word) => Array.from({ length: count }, (_, i) => `${word} line ${i}`).join('\n') + '\n';
  box.write(`modified/${name}.txt`, lines(5, 'modified'));
  box.write(`deleted/${name}.txt`, lines(5, 'deleted'));
  box.write(`renamed/${name}.txt`, lines(10, 'renamed'));
  box.write(`renamed-modified/${name}.txt`, lines(20, 'renamed-modified'));
  box.write(`typechange/${name}.txt`, lines(3, 'typechange'));
  box.write('typechange-target.txt', 'target\n');
  box.git('add', '-A');
  box.git('commit', '-q', '-m', 'base of the shapes');
  const base = box.git('rev-parse', 'HEAD').trim();

  box.write(`added-committed/${name}.txt`, lines(4, 'added'));
  box.write(`added-modified/${name}.txt`, lines(4, 'added-modified'));
  writeFileSync(box.write(`binary/${name}.bin`, ''), Buffer.from([0, 1, 2, 0, 255, 0, 3]));
  box.write(`config/${SECRET_LOOKING_NAME}`, 'harmless\n');
  box.git('add', '-A');
  box.git('commit', '-q', '-m', 'added since the base');

  box.write(`added-modified/${name}.txt`, `${lines(4, 'added-modified')}one more\n`);
  box.write(`modified/${name}.txt`, `${lines(5, 'modified')}one more\n`);
  unlinkSync(join(box.repo, `deleted/${name}.txt`));
  mkdirSync(join(box.repo, 'renamed-to'));
  mkdirSync(join(box.repo, 'renamed-modified-to'));
  box.git('mv', `renamed/${name}.txt`, `renamed-to/${name}.txt`);
  box.git('mv', `renamed-modified/${name}.txt`, `renamed-modified-to/${name}.txt`);
  box.write(`renamed-modified-to/${name}.txt`, `${lines(20, 'renamed-modified')}one more\n`);
  unlinkSync(join(box.repo, `typechange/${name}.txt`));
  symlinkSync('../typechange-target.txt', join(box.repo, `typechange/${name}.txt`));
  box.write(`staged/${name}.txt`, lines(2, 'staged'));
  box.git('add', '--', `staged/${name}.txt`);
  box.write(`intent-to-add/${name}.txt`, lines(2, 'intent'));
  box.git('add', '-N', '--', `intent-to-add/${name}.txt`);
  box.write(`untracked/${name}.txt`, lines(2, 'untracked'));
  return base;
}

for (const [configName, config] of Object.entries(CONFIGS)) {
  for (const [nameKind, name] of Object.entries(NAMES)) {
    test(`Files and lines marks new exactly the paths git gives as A (${configName}, name ${nameKind})`, () => {
      withSandbox((box) => {
        const base = buildShapes(box, name, config);
        const out = join(box.root, 'package.md');
        const result = runScript('review-package.mjs', [box.repo, base, out], box.env());
        assert.equal(result.status, 0, result.out);
        const text = readFileSync(out, 'utf8');

        const added = addedByGit(box, base);
        // The oracle is not empty: git gives these forms as A in every configuration.
        for (const shape of ['added-committed', 'added-modified', 'staged', 'intent-to-add']) {
          assert.ok(added.has(`${shape}/${name}.txt`), `${shape} is A for git: ${[...added].join(', ')}`);
        }
        assert.ok(added.has(`binary/${name}.bin`));
        assert.ok(!added.has(`untracked/${name}.txt`));
        // A rename is two paths with detection on, and a deletion plus an addition without it.
        assert.equal(added.has(`renamed-to/${name}.txt`), config.length > 0);

        const expected = numstat(box, base).map(({ added: plus, removed, paths }) => {
          if (paths.some((path) => path.includes(SECRET_LOOKING_NAME))) return LINE_NOTE;
          const counts = plus === '-' ? 'binary' : `+${plus} -${removed}`;
          const mark = paths.length === 1 && added.has(paths[0]) ? ' | new' : '';
          return `${paths.join(' => ')} | ${counts}${mark}`;
        });
        const lines = section(text, '## Files and lines', '## New files').split('\n');
        assert.match(lines.pop(), /^\d+ file\(s\) changed, /);
        assert.deepEqual(lines, expected);
        assert.ok(lines.includes(`binary/${name}.bin | binary | new`), lines.join('\n'));
        assert.ok(lines.includes(LINE_NOTE), 'the secret-looking new file is a note');
        assert.ok(!text.includes(SECRET_LOOKING_NAME), 'no secret-looking path in the package');
        assert.ok(!lines.some((line) => line.includes(`untracked/${name}.txt`)), 'the untracked file is not under Files and lines');

        const untracked = box.git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
        assert.deepEqual(untracked, [`untracked/${name}.txt`]);
        assert.equal(section(text, '## New files', '## Diff'), untracked.map((path) => `- ${path}`).join('\n'));
      });
    });
  }
}

test('New files says that a file added and already in git is marked under Files and lines when no file is untracked', () => {
  withSandbox((box) => {
    const base = box.base;
    box.write('src/new.ts', 'export const y = 2\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'new');
    box.write('src/rules.ts', 'export const x = 3\n');
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.equal(section(text, '## New files', '## Diff'), NO_UNTRACKED);
    const lines = section(text, '## Files and lines', '## New files').split('\n');
    assert.ok(lines.includes('src/new.ts | +1 -0 | new'), lines.join('\n'));
    assert.ok(lines.includes('src/rules.ts | +1 -1'), lines.join('\n'));
  });
});

// The git status --short section, for each XY code with that path first in git's output.
const STATES = {
  ' M': (box) => box.write('a-state.txt', 'changed\n'),
  ' D': (box) => unlinkSync(join(box.repo, 'a-state.txt')),
  ' T': (box) => {
    unlinkSync(join(box.repo, 'a-state.txt'));
    symlinkSync('z-other.txt', join(box.repo, 'a-state.txt'));
  },
  ' A': (box) => {
    box.write('a-new.txt', 'new\n');
    box.git('add', '-N', 'a-new.txt');
  },
  'M ': (box) => {
    box.write('a-state.txt', 'changed\n');
    box.git('add', 'a-state.txt');
  },
  MM: (box) => {
    box.write('a-state.txt', 'changed\n');
    box.git('add', 'a-state.txt');
    box.write('a-state.txt', 'changed again\n');
  },
  'A ': (box) => {
    box.write('a-new.txt', 'new\n');
    box.git('add', 'a-new.txt');
  },
  AM: (box) => {
    box.write('a-new.txt', 'new\n');
    box.git('add', 'a-new.txt');
    box.write('a-new.txt', 'new and changed\n');
  },
  'D ': (box) => box.git('rm', '-q', 'a-state.txt'),
  'R ': (box) => box.git('mv', 'a-state.txt', 'a-moved.txt'),
  '??': (box) => box.write('a-new.txt', 'new\n'),
};

function statusCase(box, setUp, { knowledge = false } = {}) {
  box.write('a-state.txt', 'state\nof\nthe\nfile\n');
  box.write('z-other.txt', 'other\n');
  box.write('.vibeflow/specs/tracked.md', '# spec\n');
  box.git('add', '-A');
  box.git('commit', '-q', '-m', 'status base');
  const base = box.git('rev-parse', 'HEAD').trim();
  setUp(box);
  if (knowledge) box.write('.vibeflow/index.md', '# Project\n');
  const out = join(box.root, 'package.md');
  const result = runScript('review-package.mjs', [box.repo, base, out], box.env());
  assert.equal(result.status, 0, result.out);
  const gitStatus = box.git('status', '--short');
  const expected = gitStatus
    .split('\n')
    .filter((line) => line !== '?? .vibeflow/index.md')
    .join('\n')
    .replace(/\n+$/, '');
  return { gitStatus, expected, actual: section(readFileSync(out, 'utf8'), '## git status --short', '## Files and lines') };
}

for (const [code, setUp] of Object.entries(STATES)) {
  test(`git status --short is git's output byte for byte, with ${JSON.stringify(code)} first`, () => {
    withSandbox((box) => {
      const { gitStatus, expected, actual } = statusCase(box, (sandbox) => {
        setUp(sandbox);
        // A second line, so a leading space is checked past the first line too.
        if (code === '??') sandbox.write('z-untracked.txt', 'more\n');
        else sandbox.write('z-other.txt', 'other changed\n');
      });
      assert.ok(gitStatus.startsWith(`${code} `), gitStatus);
      assert.equal(actual, expected);
    });
  });
}

test('git status --short without the untracked knowledge base keeps the leading space of the lines around it', () => {
  withSandbox((box) => {
    const { gitStatus, expected, actual } = statusCase(box, (sandbox) => {
      sandbox.write('a-state.txt', 'changed\n');
      sandbox.write('z-untracked.txt', 'more\n');
    }, { knowledge: true });
    assert.ok(gitStatus.split('\n').includes('?? .vibeflow/index.md'), gitStatus);
    assert.ok(expected.startsWith(' M a-state.txt'), expected);
    assert.equal(actual, expected);
  });
});

test('git status --short without the untracked knowledge base when it is git\'s first line', () => {
  withSandbox((box) => {
    const { gitStatus, expected, actual } = statusCase(box, (sandbox) => sandbox.write('z-untracked.txt', 'more\n'), { knowledge: true });
    // git lists untracked paths after the tracked ones, so with no tracked change the knowledge
    // base is the first line; the package then has a change only under .vibeflow/, so another
    // untracked file comes after it.
    assert.ok(gitStatus.startsWith('?? .vibeflow/index.md\n'), gitStatus);
    assert.equal(actual, expected);
  });
});
