#!/usr/bin/env node
// Review package: the round's diff in one file, for the auditor and the re-auditor to read at once.
// Commits since the base, status, stat, the diff with 10 lines of context (committed and not) and
// every new file. For a re-audit the base is the commit of the audited round, so the package is
// the fix diff only. A package over the cap names what it left out; an empty one says so. A file
// diff with a line that looks like a secret stays out whole, named with its size and that line,
// and every hunk header comes in as its line numbers only, without the function context.
// Nothing under .vibeflow/ counts as a change on its own; the loop's artifact folders there stay
// out, counted, and the rest (specs, the knowledge base) comes in as context.

import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

// The kit needs Node 18 or later (Node 16 has no global fetch): below it, say so and exit 64 first.
if (Number(process.versions.node.split('.')[0]) < 18) {
  process.stderr.write(`review-package.mjs: needs Node.js 18 or later; found ${process.versions.node}\n`);
  process.exit(64);
}

const DEFAULT_MAX_BYTES = 400_000;

// Written by the loop itself (state, briefings, progress, packages, reports): never the change under
// review. In a plugin project `.vibeflow/` is not ignored, and an earlier report would otherwise
// turn an empty package into a non-empty one.
const ARTIFACT_FOLDERS = ['loop', 'briefings', 'progress', 'reviews', 'audits'];
const isArtifact = (path) => ARTIFACT_FOLDERS.some((folder) => path.startsWith(`.vibeflow/${folder}/`));
const ARTIFACT_PATHSPEC = ['--', '.', ...ARTIFACT_FOLDERS.map((folder) => `:(exclude).vibeflow/${folder}/`)];
// Specs, PRDs and the knowledge base are context for a change, never a change by themselves.
const isVibeflow = (path) => path.startsWith('.vibeflow/');
const OUTSIDE_VIBEFLOW = ['--', '.', ':(exclude).vibeflow/'];

// The same detector as check-briefing.mjs: a test keeps the two blocks identical.
// The patterns are split so secret scanners do not flag this file.
const SECRET = new RegExp([
  'sk-' + 'proj-', 'sk-' + 'ant-', 'gh' + '[pousr]_[A-Za-z0-9]{20,}', 'github' + '_pat_',
  'AK' + 'IA[0-9A-Z]{16}', 'xox' + '[baprs]-[A-Za-z0-9-]{10,}',
  '-----BEGIN [A-Z ]*PRIVATE ' + 'KEY-----',
  '(postgres(ql)?|mysql|mongodb(\\+srv)?|redis|amqp)://[^:\\s/]+:[^@\\s]+@',
  '[sr]k' + '_live_[A-Za-z0-9]{10,}', 'AI' + 'za[0-9A-Za-z_-]{35}',
  // A name that says it holds a secret (any case; it starts at a word boundary and has at most 64
  // characters on each side of the word), set with = or : to a literal value of 8 to 256
  // characters: quoted, with no space and no $; or bare, running to the end of the line (a ; or ,
  // and a comment may follow, and a \r may end the line). Not a literal value: one read from a call
  // or the environment, undefined, null, true, false, none or nil (any case), or a path (it starts
  // with / or .). Every repeat has a ceiling, so a long line costs time in proportion to its length.
  '\\b[\\w.-]{0,64}(' + ['PASSWORD', 'PASSWD', 'SECRET', 'TOKEN', 'API[_-]?KEY', 'PRIVATE[_-]KEY', 'ACCESS[_-]KEY']
    .map((word) => word.replace(/[A-Z]/g, (c) => `[${c}${c.toLowerCase()}]`)).join('|') + ')[\\w.-]{0,64}["\']?[ \\t]{0,64}[=:][ \\t]{0,64}'
    + '(?!["\']?([/.]|(' + ['UNDEFINED', 'NULL', 'TRUE', 'FALSE', 'NONE', 'NIL']
      .map((word) => word.replace(/[A-Z]/g, (c) => `[${c}${c.toLowerCase()}]`)).join('|') + ')["\']?(?![A-Za-z0-9_+/=@:-])))'
    + '("[^\\s"$]{8,256}"|\'[^\\s\'$]{8,256}\'|[A-Za-z0-9_+/=@:-]{8,256}(?=[ \\t]{0,64}[;,]?[ \\t]{0,64}(#|//|\\r?\\n|\\r?$)))',
].join('|'));

const USAGE = `usage: review-package.mjs <dir> <base> <out> [--max-bytes <n>]

Writes to <out> the commits since <base>, git status, the stat, the diff from <base> to the
worktree with 10 lines of context, and every untracked, not ignored file. File diffs that do
not fit under --max-bytes (default ${DEFAULT_MAX_BYTES}) are left out and listed at the top.
A file diff with a line that looks like a secret or credential (the detector of
check-briefing.mjs: a known key or token format, a database URL with a password, or a name
such as PASSWORD, SECRET or TOKEN set to a literal value) is left out whole and listed under
WITHHELD at the top, with its size and the number of the first line that matched (in the base,
for a removed line): read it with git. Each hunk header comes in as its line numbers only,
without the function context git prints after it.
Nothing under .vibeflow/ counts as a change: a change only under .vibeflow/ is empty, and the
message counts its paths. The loop's artifact folders there
(${ARTIFACT_FOLDERS.map((folder) => `${folder}/`).join(', ')}) are always left out and counted
at the top; the rest of .vibeflow/ (specs, PRDs, index.md, patterns) is in the package as
context when something changed outside it.

exit 0 written · 1 empty (nothing changed outside .vibeflow/) · 2 error`;

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

// A hunk header, `@@ -a,b +c,d @@`, read from the start of the line only. After it git prints a
// line of the file above the hunk (its function context), cut at 80 bytes; whatever that text
// holds, a carriage return or a line separator included, it never hides the header.
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// The file line of the first diff line that looks like a secret, or 0 when none does. Only the
// hunks are read: a path is in the package anyway. An added or context line counts in the new
// file, a removed line in the base; a line of a CRLF file is tested without its "\r". The function
// context after a hunk header is a line of the file: git gives no number for it, so the hunk's
// first line is named.
function secretLine(chunk) {
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const printed of chunk.split('\n')) {
    const line = printed.endsWith('\r') ? printed.slice(0, -1) : printed;
    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      [oldLine, newLine] = [Number(hunk[1]), Number(hunk[2])];
      if (SECRET.test(line.slice(hunk[0].length))) return newLine || oldLine || 1;
      inHunk = true;
    } else if (inHunk && line.startsWith('-')) {
      if (SECRET.test(line)) return oldLine;
      oldLine += 1;
    } else if (inHunk && (line.startsWith('+') || line.startsWith(' '))) {
      if (SECRET.test(line)) return newLine;
      newLine += 1;
      if (line.startsWith(' ')) oldLine += 1;
    }
  }
  return 0;
}

// The package carries each hunk header as its line numbers only: the function context is no part
// of the change, and a secret git cut short there no longer looks like one.
function withoutFunctionContext(chunk) {
  return chunk.split('\n').map((line) => HUNK_HEADER.exec(line)?.[0] ?? line).join('\n');
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
  const vibeflowCount = git(dir, ['diff', '--name-only', '-z', base, '--'])
    .split('\0')
    .filter((path) => path && isVibeflow(path)).length + allUntracked.filter(isVibeflow).length;
  // A commit that touches only loop artifacts is not part of the round either.
  const commits = git(dir, ['log', '--oneline', `${base}..HEAD`, ...ARTIFACT_PATHSPEC]);
  // Explicit prefixes: splitDiff reads `a/<path>`, and diff.noprefix or diff.mnemonicPrefix in
  // the user's config would otherwise change them and leave the cap naming files as "?".
  const diff = git(dir, ['diff', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', '-U10', base, ...ARTIFACT_PATHSPEC]);

  // Empty means nothing changed outside .vibeflow/: a new spec alone is not work to audit.
  const changedOutside = git(dir, ['log', '--oneline', `${base}..HEAD`, ...OUTSIDE_VIBEFLOW]).trim()
    || git(dir, ['diff', '--name-only', base, ...OUTSIDE_VIBEFLOW]).trim()
    || untracked.some((path) => !isVibeflow(path));
  if (!changedOutside) {
    const vibeflowNote = `${vibeflowCount} path(s) under .vibeflow/ changed, and .vibeflow/ alone never counts as a change`;
    // With nothing changed at all the base may be the wrong one; with .vibeflow/ changed it is right.
    const advice = vibeflowCount
      ? 'An audit over this file has nothing to read: the work since the base is only under .vibeflow/.'
      : 'An audit over this file has nothing to read; check the base.';
    return {
      empty: true,
      vibeflowNote,
      text: `${title}\n\n${artifactLine}\n\nEMPTY PACKAGE: nothing changed outside .vibeflow/ between base ${base} and the worktree (no commit, no diff, no new file); ${vibeflowNote}. ${advice}\n`,
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

  // What looks like a secret leaves first and whole, so the cap never weighs it.
  const withheld = [];
  const candidates = [];
  for (const chunk of chunks) {
    const line = secretLine(chunk.text);
    if (line) withheld.push({ path: chunk.path, bytes: Buffer.byteLength(chunk.text), line });
    else candidates.push({ ...chunk, text: withoutFunctionContext(chunk.text) });
  }

  let size = Buffer.byteLength(`${title}\n\n${artifactLine}\n\n${headSections}\n\n## Diff (base to worktree, 10 lines of context)\n\n`);
  const kept = [];
  const leftOut = [];
  for (const chunk of candidates) {
    const piece = chunk.heading ? `\n${chunk.heading}\n\n${chunk.text}` : chunk.text;
    const bytes = Buffer.byteLength(piece);
    if (size + bytes <= maxBytes) {
      kept.push({ ...chunk, piece });
      size += bytes;
    } else {
      leftOut.push({ path: chunk.path, bytes });
    }
  }

  const withheldNotice = withheld.length
    ? `WITHHELD: ${withheld.length} file diff(s) left out because a line looks like a secret or credential. Read them with git before judging:\n${withheld.map((item) => `- ${item.path} (${item.bytes} bytes, line ${item.line})`).join('\n')}\n\n`
    : '';
  const truncatedNotice = leftOut.length
    ? `TRUNCATED: ${leftOut.length} of ${candidates.length} file diff(s) left out to stay under ${maxBytes} bytes. Read them with git before judging:\n${leftOut.map((item) => `- ${item.path} (${item.bytes} bytes)`).join('\n')}\n\n`
    : '';
  const notice = `${withheldNotice}${truncatedNotice}`;
  const tracked = kept.filter((chunk) => !chunk.heading).map((chunk) => chunk.piece).join('');
  const added = kept.filter((chunk) => chunk.heading).map((chunk) => chunk.piece).join('');
  const text = `${title}\n\n${artifactLine}\n\n${notice}${headSections}\n\n## Diff (base to worktree, 10 lines of context)\n\n${tracked || '(no tracked change)\n'}${added}`;
  return { empty: false, text, leftOut, withheld, newFiles: untracked.length };
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
      console.log(`${args.out}: empty package, nothing changed outside .vibeflow/ since ${args.base}; ${result.vibeflowNote}`);
      return 1;
    }
    const lines = result.text.split('\n').length;
    console.log(`${args.out}: ${Buffer.byteLength(result.text)} bytes, ${lines} lines, ${result.newFiles} new file(s)`);
    if (result.withheld.length) {
      console.log(`withheld: ${result.withheld.length} file diff(s) left out because a line looks like a secret, listed at the top of the package`);
    }
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
