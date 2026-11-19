// Audit probes for the review package's `## Files and lines` mark and `## git status --short`
// section (vibeflow-consertos-l2, part p3). Each case is a state git produces, built in a scratch
// repository whose environment drops every inherited GIT_* variable (loop-helpers' hermeticEnv),
// and git itself is the oracle: `git diff --name-status -z` and `git diff --numstat -z` read line
// by line for the mark, `git status --short` for the status section. User configuration goes in
// the scratch HOME's global config, where a user's own setting lives.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runScript, withSandbox } from '../loop-helpers.mjs';

const LINE_NOTE = '(line left out: it looks like a secret or credential; see HEADER LINES LEFT OUT at the top)';
const NO_UNTRACKED = '(no untracked file in the change; a file added since the base and already in git is marked new under Files and lines)';
// Split so secret scanners do not flag this file.
const SECRET_VALUE = `${'f4ke'}${'Va1ue9x7Q'}`;
const SECRET_NAME = `${'API'}${'_TOKEN'}=${SECRET_VALUE}`;

function section(text, heading, next) {
  const start = text.indexOf(`${heading}\n\n`);
  assert.ok(start >= 0, `no ${heading} section`);
  const rest = text.slice(start + heading.length + 2);
  const end = rest.indexOf(`\n\n${next}`);
  assert.ok(end >= 0, `no ${next} after ${heading}`);
  return rest.slice(0, end);
}

function runPackage(box, base) {
  const out = join(box.root, 'package.md');
  const result = runScript('review-package.mjs', [box.repo, base, out], box.env());
  assert.equal(result.status, 0, result.out);
  return readFileSync(out, 'utf8');
}

// A git call that may exit non-zero (a merge that stops on a conflict).
function gitMayFail(box, ...args) {
  return spawnSync('git', args, { cwd: box.repo, env: box.env(), encoding: 'utf8' });
}

// `git diff --name-status -z <base>` as entries: the status and its one or two paths.
function nameStatus(box, base) {
  const fields = box.git('diff', '--name-status', '-z', base).split('\0');
  const entries = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i];
    if (!status) { i += 1; continue; }
    const count = /^[RC]/.test(status) ? 2 : 1;
    entries.push({ status, paths: fields.slice(i + 1, i + 1 + count) });
    i += 1 + count;
  }
  return entries;
}

// `git diff --numstat -z <base>` as entries: the counts and the one or two paths.
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

// The expected `## Files and lines` lines, entry by entry: git lists the same entries in the same
// order for --name-status and --numstat, and an entry is marked new exactly when its status is A.
function expectedFileLines(box, base) {
  const statuses = nameStatus(box, base);
  const counts = numstat(box, base);
  assert.deepEqual(counts.map((entry) => entry.paths), statuses.map((entry) => entry.paths), 'name-status and numstat list the same entries');
  return counts.map(({ added, removed, paths }, index) => {
    if (paths.some((path) => path.includes(SECRET_VALUE))) return LINE_NOTE;
    const mark = statuses[index].status === 'A' ? ' | new' : '';
    return `${paths.join(' => ')} | ${added === '-' ? 'binary' : `+${added} -${removed}`}${mark}`;
  });
}

const NAMES = {
  plain: 'file',
  space: 'with space',
  quote: 'with "quote"',
  tab: 'with\ttab',
  newline: 'with\nnewline',
  backslash: 'with\\backslash',
  accent: 'ação',
  dash: '-dash',
};

// User configuration that changes how git prints a diff or a status, set as the user's own.
const USER_CONFIGS = {
  none: [],
  'diff.renames=false': [['diff.renames', 'false']],
  'diff.renames=copies': [['diff.renames', 'copies']],
  'status.relativePaths=false': [['status.relativePaths', 'false']],
  'color.status=always': [['color.status', 'always']],
  'color.ui=always': [['color.ui', 'always']],
  'core.quotepath=true': [['core.quotepath', 'true']],
  'diff.noprefix and diff.mnemonicPrefix': [['diff.noprefix', 'true'], ['diff.mnemonicPrefix', 'true']],
};

// Every shape of a path's state between the base and the worktree, for every name, in one
// repository; each file's text names its path, so rename and copy detection pair a file with its
// own source.
function buildShapes(box, config) {
  for (const [key, value] of config) box.git('config', '--global', key, value);
  const text = (path, count, extra = '') => `${Array.from({ length: count }, (_, i) => `${path} line ${i}`).join('\n')}\n${extra}`;
  const put = (path, count, extra) => box.write(path, text(path, count, extra));
  const names = Object.values(NAMES);
  for (const name of names) {
    for (const shape of ['modified', 'deleted', 'renamed', 'renamed-modified', 'ita-renamed', 'copy-source']) put(`${shape}/${name}.txt`, 12);
    put(`typechange/${name}.txt`, 3);
  }
  box.write('link-target.txt', 'target\n');
  put('secret-rename-source.txt', 12);
  box.git('add', '-A');
  box.git('commit', '-q', '-m', 'base of the shapes');
  const base = box.git('rev-parse', 'HEAD').trim();

  for (const name of names) {
    put(`added-committed/${name}.txt`, 4);
    put(`added-modified/${name}.txt`, 4);
    box.write(`empty/${name}.txt`, '');
    writeFileSync(box.write(`binary/${name}.bin`, ''), Buffer.from([0, 1, 2, 0, 255, 0, 3, name.length]));
    mkdirSync(join(box.repo, 'symlink-new'), { recursive: true });
    symlinkSync('../link-target.txt', join(box.repo, `symlink-new/${name}`));
  }
  box.write(`config/${SECRET_NAME}`, 'harmless\n');
  box.git('add', '-A');
  box.git('commit', '-q', '-m', 'added since the base');

  for (const name of names) {
    put(`added-modified/${name}.txt`, 4, 'one more\n');
    put(`modified/${name}.txt`, 12, 'one more\n');
    unlinkSync(join(box.repo, `deleted/${name}.txt`));
    for (const folder of ['renamed-to', 'renamed-modified-to']) mkdirSync(join(box.repo, folder), { recursive: true });
    box.git('mv', '--', `renamed/${name}.txt`, `renamed-to/${name}.txt`);
    box.git('mv', '--', `renamed-modified/${name}.txt`, `renamed-modified-to/${name}.txt`);
    box.write(`renamed-modified-to/${name}.txt`, `${text(`renamed-modified/${name}.txt`, 12)}one more\n`);
    const itaText = readFileSync(join(box.repo, `ita-renamed/${name}.txt`), 'utf8');
    unlinkSync(join(box.repo, `ita-renamed/${name}.txt`));
    box.write(`ita-renamed-to/${name}.txt`, itaText);
    box.git('add', '-N', '--', `ita-renamed-to/${name}.txt`);
    box.write(`copied/${name}.txt`, readFileSync(join(box.repo, `copy-source/${name}.txt`), 'utf8'));
    box.git('add', '--', `copied/${name}.txt`);
    put(`copy-source/${name}.txt`, 12, 'one more\n');
    unlinkSync(join(box.repo, `typechange/${name}.txt`));
    symlinkSync('../link-target.txt', join(box.repo, `typechange/${name}.txt`));
    put(`staged/${name}.txt`, 2);
    box.git('add', '--', `staged/${name}.txt`);
    put(`intent-to-add/${name}.txt`, 2);
    box.git('add', '-N', '--', `intent-to-add/${name}.txt`);
    put(`untracked/${name}.txt`, 2);
  }
  // A secret-looking path in each state that can be new: staged under a folder whose name git
  // quotes, a rename target, and untracked.
  box.write(`tab\tdir/${SECRET_NAME}`, 'harmless\n');
  box.git('add', '--', `tab\tdir/${SECRET_NAME}`);
  mkdirSync(join(box.repo, 'moved'));
  box.git('mv', 'secret-rename-source.txt', `moved/${SECRET_NAME}`);
  box.write(`loose/${SECRET_NAME}`, 'harmless\n');
  // A gitlink added since the base.
  const sub = join(box.repo, 'gitlink');
  mkdirSync(sub);
  for (const args of [['init', '-q'], ['config', 'user.name', 't'], ['config', 'user.email', 't@vibeflow.invalid'], ['config', 'commit.gpgsign', 'false']]) {
    spawnSync('git', args, { cwd: sub, env: box.env() });
  }
  writeFileSync(join(sub, 'inside.txt'), 'inside\n');
  spawnSync('git', ['add', '-A'], { cwd: sub, env: box.env() });
  spawnSync('git', ['commit', '-q', '-m', 'sub'], { cwd: sub, env: box.env() });
  gitMayFail(box, 'add', 'gitlink');
  return base;
}

for (const [configName, config] of Object.entries(USER_CONFIGS)) {
  // Contract: under `## Files and lines` the line of each entry git gives as A since the base ends
  // in ` | new`, and no other line has the mark, whatever the path holds and however the user's
  // git is configured; a secret-looking path stays a note, with no mark and no path.
  // Regression it catches: a mark keyed by path instead of by entry, a mark read from another
  // diff (status, --cached, a different rename setting), a parser that drops a field after a
  // rename or copy (diff.renames=copies), a mark on the note or a path in it.
  // Why the executor's test misses it: its oracle is the same path set the script builds, from
  // one repository per name with renames on or off in the repository's own config; it has no copy,
  // no newline or backslash in a path, no empty or symlink or gitlink addition, no rename of a
  // file to a secret-looking path, and no user-level configuration.
  test(`p3 probe: the new mark follows git's name-status entry by entry (user config ${configName})`, () => {
    withSandbox((box) => {
      const base = buildShapes(box, config);
      const text = runPackage(box, base);
      const expected = expectedFileLines(box, base);
      const statuses = nameStatus(box, base).map((entry) => entry.status[0]);
      // The oracle is not empty: additions, and renames or copies where the config detects them.
      assert.ok(statuses.filter((status) => status === 'A').length >= 40, statuses.join(''));
      if (configName === 'diff.renames=false') assert.ok(!statuses.some((status) => status === 'R' || status === 'C'));
      else assert.ok(statuses.includes('R'), statuses.join(''));
      if (configName === 'diff.renames=copies') assert.ok(statuses.includes('C'), statuses.join(''));
      assert.ok(statuses.includes('T') && statuses.includes('D') && statuses.includes('M'));

      const body = section(text, '## Files and lines', '## New files');
      const summary = body.slice(body.lastIndexOf('\n') + 1);
      assert.match(summary, /^\d+ file\(s\) changed, /);
      assert.equal(body.slice(0, body.lastIndexOf('\n')), expected.join('\n'));
      assert.equal(body.split('\n').filter((line) => line.endsWith(' | new')).length, expected.filter((line) => line.endsWith(' | new')).length);

      // New files: the untracked files only, as before; a secret-looking one is a note.
      const untracked = box.git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
      assert.equal(untracked.length, Object.keys(NAMES).length + 1);
      assert.equal(section(text, '## New files', '## Diff'), untracked.map((path) => (path.includes(SECRET_VALUE) ? LINE_NOTE : `- ${path}`)).join('\n'));
      // No form of a secret-looking path anywhere in the package, quoted or not.
      assert.ok(!text.includes(SECRET_VALUE), 'no secret-looking path in the package');
    });
  });
}

// Contract: an empty `## New files` says the new text, and a file added and committed is marked
// in Files and lines, also when the only other change is a staged file and the user colors status.
// Regression it catches: the old `(none)`, or the text only on one code path.
// Why the executor's test misses it: its empty case has no user config and one shape.
test('p3 probe: an empty New files says where a file added in git is, under color.ui=always', () => {
  withSandbox((box) => {
    box.git('config', '--global', 'color.ui', 'always');
    box.write('docs/new guide.md', '# guide\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'guide');
    box.write('src/staged.ts', 'export const s = 1\n');
    box.git('add', 'src/staged.ts');
    const text = runPackage(box, box.base);
    assert.equal(section(text, '## New files', '## Diff'), NO_UNTRACKED);
    const lines = section(text, '## Files and lines', '## New files').split('\n');
    assert.ok(lines.includes('docs/new guide.md | +1 -0 | new'), lines.join('\n'));
    assert.ok(lines.includes('src/staged.ts | +1 -0 | new'), lines.join('\n'));
  });
});

// The states git's short status prints, each built with its path first in git's list
// ("a-..." paths sort before "z-other.txt"; untracked paths come after tracked ones).
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
  ' R': (box) => {
    const kept = readFileSync(join(box.repo, 'a-state.txt'), 'utf8');
    unlinkSync(join(box.repo, 'a-state.txt'));
    box.write('a-moved.txt', kept);
    box.git('add', '-N', 'a-moved.txt');
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
  MD: (box) => {
    box.write('a-state.txt', 'changed\n');
    box.git('add', 'a-state.txt');
    unlinkSync(join(box.repo, 'a-state.txt'));
  },
  'T ': (box) => {
    unlinkSync(join(box.repo, 'a-state.txt'));
    symlinkSync('z-other.txt', join(box.repo, 'a-state.txt'));
    box.git('add', 'a-state.txt');
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
  AD: (box) => {
    box.write('a-new.txt', 'new\n');
    box.git('add', 'a-new.txt');
    unlinkSync(join(box.repo, 'a-new.txt'));
  },
  'D ': (box) => box.git('rm', '-q', 'a-state.txt'),
  'R ': (box) => box.git('mv', 'a-state.txt', 'a-moved.txt'),
  RM: (box) => {
    box.git('mv', 'a-state.txt', 'a-moved.txt');
    box.write('a-moved.txt', 'moved and changed\n');
  },
  RD: (box) => {
    box.git('mv', 'a-state.txt', 'a-moved.txt');
    unlinkSync(join(box.repo, 'a-moved.txt'));
  },
  'C ': (box) => {
    box.git('config', 'status.renames', 'copies');
    box.write('a-copy.txt', readFileSync(join(box.repo, 'a-state.txt'), 'utf8'));
    box.write('a-state.txt', `${readFileSync(join(box.repo, 'a-state.txt'), 'utf8')}more\n`);
    box.git('add', 'a-copy.txt', 'a-state.txt');
  },
  UU: (box) => conflict(box, (b) => b.write('a-state.txt', 'theirs\n'), (b) => b.write('a-state.txt', 'ours\n')),
  AA: (box) => conflict(box, (b) => b.write('a-new.txt', 'theirs\n'), (b) => b.write('a-new.txt', 'ours\n')),
  DU: (box) => conflict(box, (b) => b.write('a-state.txt', 'theirs\n'), (b) => b.git('rm', '-q', 'a-state.txt')),
  UD: (box) => conflict(box, (b) => b.git('rm', '-q', 'a-state.txt'), (b) => b.write('a-state.txt', 'ours\n')),
  DD: (box) => conflict(box, (b) => b.git('mv', 'a-state.txt', 'b-theirs.txt'), (b) => b.git('mv', 'a-state.txt', 'b-ours.txt')),
  AU: (box) => conflict(box, (b) => b.git('mv', 'a-state.txt', 'b-theirs.txt'), (b) => b.git('mv', 'a-state.txt', 'a-0-ours.txt')),
  UA: (box) => conflict(box, (b) => b.git('mv', 'a-state.txt', 'a-0-theirs.txt'), (b) => b.git('mv', 'a-state.txt', 'b-ours.txt')),
  ' m': (box) => {
    writeFileSync(join(box.repo, 'a-sub/inside.txt'), 'changed inside\n');
  },
  ' ?': (box) => {
    writeFileSync(join(box.repo, 'a-sub/loose.txt'), 'loose\n');
  },
  '??': (box) => box.write('a-new.txt', 'new\n'),
};

// A merge that stops on a conflict: `theirs` commits on a side branch, `ours` on main.
function conflict(box, theirs, ours) {
  box.git('checkout', '-q', '-b', 'side');
  theirs(box);
  box.git('add', '-A');
  box.git('commit', '-q', '-m', 'theirs');
  box.git('checkout', '-q', 'main');
  ours(box);
  box.git('add', '-A');
  box.git('commit', '-q', '-m', 'ours');
  assert.notEqual(gitMayFail(box, 'merge', '-q', 'side').status, 0, 'the merge stops on a conflict');
}

// The base of a status case: a 20-line file, a second file, a tracked spec under .vibeflow/ (so
// an untracked index.md is listed as its own line) and a gitlink for the submodule codes.
function statusBase(box, config) {
  for (const [key, value] of config) box.git('config', '--global', key, value);
  box.write('a-state.txt', `${Array.from({ length: 20 }, (_, i) => `state line ${i}`).join('\n')}\n`);
  box.write('z-other.txt', 'other\n');
  box.write('.vibeflow/specs/tracked.md', '# spec\n');
  const sub = join(box.repo, 'a-sub');
  mkdirSync(sub);
  for (const args of [['init', '-q'], ['config', 'user.name', 't'], ['config', 'user.email', 't@vibeflow.invalid'], ['config', 'commit.gpgsign', 'false']]) {
    spawnSync('git', args, { cwd: sub, env: box.env() });
  }
  writeFileSync(join(sub, 'inside.txt'), 'inside\n');
  spawnSync('git', ['add', '-A'], { cwd: sub, env: box.env() });
  spawnSync('git', ['commit', '-q', '-m', 'sub'], { cwd: sub, env: box.env() });
  box.git('add', '-A');
  box.git('commit', '-q', '-m', 'status base');
  return box.git('rev-parse', 'HEAD').trim();
}

// git's own short status, as the script asks for it (paths unquoted but for control characters,
// quotes and backslashes), without the untracked knowledge base and the line breaks at the end.
function expectedStatus(box) {
  return box.git('-c', 'core.quotepath=false', 'status', '--short')
    .split('\n')
    .filter((line) => line !== '?? .vibeflow/index.md')
    .join('\n')
    .replace(/\n+$/, '');
}

const STATUS_CONFIGS = {
  none: [],
  'core.quotepath=true, status.relativePaths=false, status.showUntrackedFiles=all': [
    ['core.quotepath', 'true'], ['status.relativePaths', 'false'], ['status.showUntrackedFiles', 'all'],
  ],
};

for (const [configName, config] of Object.entries(STATUS_CONFIGS)) {
  for (const [code, setUp] of Object.entries(STATES)) {
    // Contract: the `## git status --short` section is git's short status byte for byte, without
    // the untracked knowledge base line and the line breaks at the end, for every XY code git
    // prints on the first line, with a leading-space line after it and the knowledge base
    // between the tracked and the other untracked lines.
    // Regression it catches: a `.trim()` or `trimStart()` on the whole text (" M", " D", " T",
    // " A", " R", " m", " ?" first), a per-line trim, a filter that drops a line it should keep.
    // Why the executor's test misses it: it builds eleven codes; " R", MD, "T ", AD, RM, RD,
    // "C ", the seven unmerged codes and the submodule codes " m" and " ?" are not among them,
    // and it sets no user configuration.
    test(`p3 probe: git status --short is git's own output with ${JSON.stringify(code)} first (user config ${configName})`, () => {
      withSandbox((box) => {
        const base = statusBase(box, config);
        setUp(box);
        // A tracked change would come before an untracked first line, so "??" gets none.
        if (code !== '??') box.write('z-other.txt', 'other changed\n');
        box.write('.vibeflow/index.md', '# Project\n');
        box.write('z-untracked.txt', 'more\n');
        const expected = expectedStatus(box);
        assert.ok(expected.startsWith(`${code} `), `git's first line is ${JSON.stringify(code)}: ${expected}`);
        if (code !== '??') assert.ok(expected.includes('\n M z-other.txt'), expected);
        const text = runPackage(box, base);
        assert.equal(section(text, '## git status --short', '## Files and lines'), expected);
      });
    });
  }
}

// Contract: the status section is git's output byte for byte also when git quotes the first path
// (a tab in it) or prints an accent as it is, and when the user's status.branch adds the branch
// line on top.
// Regression it catches: a trim of the first line, or of the space before a quoted path; a filter
// that drops git's branch line or the quote.
// Why the executor's test misses it: its status paths are plain ASCII and it sets no user config.
test('p3 probe: git status --short is git\'s own output with a quoted first path and with status.branch', () => {
  withSandbox((box) => {
    box.git('config', '--global', 'core.quotepath', 'true');
    box.git('config', '--global', 'status.branch', 'true');
    box.write('a\tção.txt', 'one\n');
    box.write('ação b.txt', 'one\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'names');
    const base = box.git('rev-parse', 'HEAD').trim();
    box.write('a\tção.txt', 'changed\n');
    box.write('ação b.txt', 'changed\n');
    const expected = expectedStatus(box);
    // Short status quotes a path with a space too; the accent stays as it is.
    assert.ok(expected.startsWith('## main\n M "a\\tção.txt"\n M "ação b.txt"'), JSON.stringify(expected));
    const text = runPackage(box, base);
    assert.equal(section(text, '## git status --short', '## Files and lines'), expected);
  });
});

// Contract: a path that looks like a secret stays out of the status section and of the whole
// package when the user colors status output, and the leading space of the first line stays.
// Regression it catches: a status filter that matches the colored text by its first bytes and so
// lets a secret-looking path through, or a trim that eats the space before the color code.
// Why the executor's test misses it: no color, and no secret-looking path in a status case.
test('p3 probe: under color.status=always the status keeps its leading space and no secret-looking path', () => {
  withSandbox((box) => {
    box.git('config', '--global', 'color.status', 'always');
    box.write('a-first.txt', 'one\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'first');
    const base = box.git('rev-parse', 'HEAD').trim();
    box.write('a-first.txt', 'changed\n');
    box.write(`tab\tdir/${SECRET_NAME}`, 'harmless\n');
    box.git('add', '--', `tab\tdir/${SECRET_NAME}`);
    box.write(`loose/${SECRET_NAME}`, 'harmless\n');
    const raw = box.git('status', '--short');
    assert.ok(raw.startsWith(' \x1b['), JSON.stringify(raw));
    const text = runPackage(box, base);
    const status = section(text, '## git status --short', '## Files and lines');
    assert.ok(status.startsWith(' \x1b['), JSON.stringify(status));
    assert.ok(!text.includes(SECRET_VALUE), 'no secret-looking path in the package');
    assert.ok(status.split('\n').includes(LINE_NOTE), status);
  });
});

// Contract (I3 a): a file added since the base whose path does not look like a secret keeps its
// line, marked new. A rename into a secret-looking path withholds the diff by path, and the header
// then hides every line that holds the old path as a substring (namesWithheld); an old path that
// is part of " | new" ("new", "e", "w") now hides every marked line. The substring rule is the
// base's (an old path "src" hides "lib/src.ts" there too); the mark only adds letters it can
// match. It hides more and never shows a secret: recorded as a known gap.
test('p3 probe: a rename of a file named "new" into a secret-looking path keeps the other new lines', { todo: 'namesWithheld matches a withheld old path as a substring, and " | new" holds "new"; low, the substring rule is the base\'s' }, () => {
  withSandbox((box) => {
    box.write('new', `${Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')}\n`);
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'a file named new');
    const base = box.git('rev-parse', 'HEAD').trim();
    mkdirSync(join(box.repo, 'config'));
    box.git('mv', 'new', `config/${SECRET_NAME}`);
    box.write('lib/a.ts', 'export const a = 1\n');
    box.git('add', 'lib/a.ts');
    const text = runPackage(box, base);
    assert.ok(!text.includes(SECRET_VALUE));
    const lines = section(text, '## Files and lines', '## New files').split('\n');
    assert.ok(lines.includes('lib/a.ts | +1 -0 | new'), lines.join('\n'));
  });
});

// Contract (I3 b): the untracked knowledge base line leaves the status section whatever the
// user's color setting. Under color.status=always git writes the code as "\x1b[31m??\x1b[m", the
// filter reads "?? " at the start of the line, and the line stays; the script behaved the same
// before this part, so this is recorded as a known gap.
test('p3 probe: under color.status=always the untracked knowledge base still leaves the status', { todo: 'statusLines matches "?? " before the color code; low, kept from the base' }, () => {
  withSandbox((box) => {
    box.git('config', '--global', 'color.status', 'always');
    box.write('.vibeflow/specs/tracked.md', '# spec\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'spec');
    const base = box.git('rev-parse', 'HEAD').trim();
    box.write('a-first.txt', 'one\n');
    box.write('.vibeflow/index.md', '# Project\n');
    const text = runPackage(box, base);
    const status = section(text, '## git status --short', '## Files and lines');
    assert.ok(!status.includes('.vibeflow/index.md'), JSON.stringify(status));
  });
});
