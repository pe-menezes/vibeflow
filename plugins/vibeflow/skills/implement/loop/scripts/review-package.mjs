#!/usr/bin/env node
// Review package: the round's diff in one file, for the auditor and the re-auditor to read at once.
// Commits since the base, status, stat, the diff with 10 lines of context (committed and not) and
// every new file. For a re-audit the base is the commit of the audited round, so the package is
// the fix diff only. A package over the cap names what it left out; an empty one says so. The
// loop's own artifact folders under .vibeflow/ never count as a change: they stay out, counted.

import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const DEFAULT_MAX_BYTES = 400_000;

// Written by the loop itself (state, briefings, progress, packages, reports): never the change under
// review. In a plugin project `.vibeflow/` is not ignored, and an earlier report would otherwise
// turn an empty package into a non-empty one.
const ARTIFACT_FOLDERS = ['loop', 'briefings', 'progress', 'reviews', 'audits'];
const isArtifact = (path) => ARTIFACT_FOLDERS.some((folder) => path.startsWith(`.vibeflow/${folder}/`));
const ARTIFACT_PATHSPEC = ['--', '.', ...ARTIFACT_FOLDERS.map((folder) => `:(exclude).vibeflow/${folder}/`)];

const USAGE = `usage: review-package.mjs <dir> <base> <out> [--max-bytes <n>]

Writes to <out> the commits since <base>, git status, the stat, the diff from <base> to the
worktree with 10 lines of context, and every untracked, not ignored file. File diffs that do
not fit under --max-bytes (default ${DEFAULT_MAX_BYTES}) are left out and listed at the top.
The loop's artifact folders under .vibeflow/ (${ARTIFACT_FOLDERS.map((folder) => `${folder}/`).join(', ')}) are left
out and counted at the top; a package that would hold only them is empty.

exit 0 written · 1 empty (nothing changed; the file says so) · 2 error`;

class PackageError extends Error {}

function cleanEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

function git(dir, args, { okStatuses = [0] } = {}) {
  const result = spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: dir,
    env: cleanEnv(),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.error) throw new PackageError(`git could not run: ${result.error.message}`);
  if (!okStatuses.includes(result.status)) {
    throw new PackageError(`git ${args.join(' ')} failed: ${result.stderr.trim().slice(0, 200)}`);
  }
  return result.stdout;
}

function parseArgs(argv) {
  const positional = [];
  let maxBytes = DEFAULT_MAX_BYTES;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--max-bytes') {
      maxBytes = Number(argv[i + 1]);
      i += 1;
      if (!Number.isInteger(maxBytes) || maxBytes <= 0) throw new PackageError('--max-bytes takes a positive integer');
    } else {
      positional.push(argv[i]);
    }
  }
  if (positional.length !== 3) throw new PackageError(`expected <dir> <base> <out>\n\n${USAGE}`);
  return { dir: positional[0], base: positional[1], out: resolve(positional[2]), maxBytes };
}

function realDir(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

// One chunk per file, so the cap can leave out whole files and name them.
function splitDiff(diff) {
  return diff
    .split(/^(?=diff --git )/m)
    .filter((chunk) => chunk.startsWith('diff --git '))
    .map((chunk) => ({ path: chunk.match(/^diff --git a\/(.*?) b\//)?.[1] ?? '?', text: chunk }));
}

function build({ dir: dirArg, base, out, maxBytes }) {
  const dir = git(resolve(dirArg), ['rev-parse', '--show-toplevel']).trim();
  const baseShort = spawnSync('git', ['rev-parse', '--verify', '--quiet', '--short', `${base}^{commit}`], {
    cwd: dir,
    env: cleanEnv(),
    encoding: 'utf8',
  });
  if (baseShort.status !== 0) throw new PackageError(`base ${base} is not a commit in ${dir}`);
  const head = git(dir, ['rev-parse', '--short', 'HEAD']).trim();
  const title = `# Review package · ${basename(dir)} · base ${baseShort.stdout.trim()} · HEAD ${head} · ${new Date().toISOString()}`;

  // A package written inside the worktree must not carry its previous copy.
  const outReal = resolve(realDir(dirname(out)), basename(out));
  const allUntracked = git(dir, ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter((path) => path && resolve(dir, path) !== outReal);
  const untracked = allUntracked.filter((path) => !isArtifact(path));
  const trackedArtifacts = git(dir, ['diff', '--name-only', '-z', base, '--'])
    .split('\0')
    .filter((path) => path && isArtifact(path));
  const artifactCount = trackedArtifacts.length + allUntracked.length - untracked.length;
  const artifactLine = `Loop artifacts left out: ${artifactCount} path(s) under .vibeflow/ (${ARTIFACT_FOLDERS.map((folder) => `${folder}/`).join(', ')}); they never count as a change.`;
  // A commit that touches only loop artifacts is not part of the round either.
  const commits = git(dir, ['log', '--oneline', `${base}..HEAD`, ...ARTIFACT_PATHSPEC]);
  // Explicit prefixes: splitDiff reads `a/<path>`, and diff.noprefix or diff.mnemonicPrefix in
  // the user's config would otherwise change them and leave the cap naming files as "?".
  const diff = git(dir, ['diff', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', '-U10', base, ...ARTIFACT_PATHSPEC]);

  if (!commits.trim() && !diff.trim() && untracked.length === 0) {
    return {
      empty: true,
      text: `${title}\n\n${artifactLine}\n\nEMPTY PACKAGE: nothing changed between base ${base} and the worktree (no commit, no diff, no new file). An audit over this file has nothing to read; check the base.\n`,
    };
  }

  const headSections = [
    '## Commits since the base', commits.trim() || '(none: the round is not committed)',
    '## git status --short', git(dir, ['status', '--short', ...ARTIFACT_PATHSPEC]).trim() || '(clean)',
    '## Files and lines', git(dir, ['diff', '--stat', base, ...ARTIFACT_PATHSPEC]).trim() || '(no tracked change)',
    '## New files', untracked.length ? untracked.map((path) => `- ${path}`).join('\n') : '(none)',
  ].join('\n\n');

  const chunks = [
    ...splitDiff(diff).map((chunk) => ({ ...chunk, heading: null })),
    ...untracked.map((path) => {
      const text = git(dir, ['diff', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', '--no-index', '--', '/dev/null', path], { okStatuses: [0, 1] });
      return { path, text: text || '(empty file)\n', heading: `## New file: ${path}` };
    }),
  ];

  let size = Buffer.byteLength(`${title}\n\n${artifactLine}\n\n${headSections}\n\n## Diff (base to worktree, 10 lines of context)\n\n`);
  const kept = [];
  const leftOut = [];
  for (const chunk of chunks) {
    const piece = chunk.heading ? `\n${chunk.heading}\n\n${chunk.text}` : chunk.text;
    const bytes = Buffer.byteLength(piece);
    if (size + bytes <= maxBytes) {
      kept.push({ ...chunk, piece });
      size += bytes;
    } else {
      leftOut.push({ path: chunk.path, bytes });
    }
  }

  const notice = leftOut.length
    ? `TRUNCATED: ${leftOut.length} of ${chunks.length} file diff(s) left out to stay under ${maxBytes} bytes. Read them with git before judging:\n${leftOut.map((item) => `- ${item.path} (${item.bytes} bytes)`).join('\n')}\n\n`
    : '';
  const tracked = kept.filter((chunk) => !chunk.heading).map((chunk) => chunk.piece).join('');
  const added = kept.filter((chunk) => chunk.heading).map((chunk) => chunk.piece).join('');
  const text = `${title}\n\n${artifactLine}\n\n${notice}${headSections}\n\n## Diff (base to worktree, 10 lines of context)\n\n${tracked || '(no tracked change)\n'}${added}`;
  return { empty: false, text, leftOut, newFiles: untracked.length };
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  try {
    const args = parseArgs(argv);
    const result = build(args);
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, result.text);
    if (result.empty) {
      console.log(`${args.out}: empty package, nothing changed since ${args.base}`);
      return 1;
    }
    const lines = result.text.split('\n').length;
    console.log(`${args.out}: ${Buffer.byteLength(result.text)} bytes, ${lines} lines, ${result.newFiles} new file(s)`);
    if (result.leftOut.length) {
      console.log(`truncated: ${result.leftOut.length} file diff(s) left out, listed at the top of the package`);
    }
    return 0;
  } catch (error) {
    // Any failure exits 2, never 1: a crash must not read as an empty package.
    console.error(`review-package: ${error instanceof PackageError ? error.message : error.stack}`);
    return 2;
  }
}

process.exit(main(process.argv.slice(2)));
