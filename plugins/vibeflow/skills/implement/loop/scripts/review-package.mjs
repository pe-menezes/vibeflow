#!/usr/bin/env node
// Review package: the round's diff in one file, for the auditor and the re-auditor to read at once.
// Commits since the base, status, changed files, the diff with 10 lines of context (committed and not) and
// every new file. For a re-audit the base is the commit of the audited round, so the package is
// the fix diff only. A package over the cap names what it left out; an empty one says so. A file
// diff with a line that looks like a secret stays out whole, named with its size and that line,
// and every hunk header comes in as its line numbers only, without the function context. No line
// the package writes looks like a secret: a file diff whose path does stays out whole too, a commit
// title that does leaves its short hash, any other such line becomes a note, and the finished
// text is checked line by line before it is written.
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
  // A database URL with a password: at most 256 characters for the user and for the password, so a
  // long line costs time in proportion to its length.
  '(postgres(ql)?|mysql|mongodb(\\+srv)?|redis|amqp)://[^:\\s/]{1,256}:[^@\\s]{1,256}@',
  '[sr]k' + '_live_[A-Za-z0-9]{10,}', 'AI' + 'za[0-9A-Za-z_-]{35}',
  // A name that says it holds a secret (any case; it starts at a word boundary and has at most 64
  // characters on each side of the word), set with = or : to a literal value of 8 to 256
  // characters: quoted, with no space and no $; or bare, running to the end of the line (a ; or ,
  // and a comment may follow, and a \r may end the line). Not a literal value: one read from a call
  // or the environment, the word undefined, null, true, false, none or nil alone (any case; a quote
  // before the word must close right after it), or a path (it starts with / or .). Every repeat has
  // a ceiling, so a long line costs time in proportion to its length.
  '\\b[\\w.-]{0,64}(' + ['PASSWORD', 'PASSWD', 'SECRET', 'TOKEN', 'API[_-]?KEY', 'PRIVATE[_-]KEY', 'ACCESS[_-]KEY']
    .map((word) => word.replace(/[A-Z]/g, (c) => `[${c}${c.toLowerCase()}]`)).join('|') + ')[\\w.-]{0,64}["\']?[ \\t]{0,64}[=:][ \\t]{0,64}'
    + '(?!(?<quote>["\']?)([/.]|(' + ['UNDEFINED', 'NULL', 'TRUE', 'FALSE', 'NONE', 'NIL']
      .map((word) => word.replace(/[A-Z]/g, (c) => `[${c}${c.toLowerCase()}]`)).join('|') + ')\\k<quote>(?![A-Za-z0-9_+/=@:-])))'
    + '("[^\\s"$]{8,256}"|\'[^\\s\'$]{8,256}\'|[A-Za-z0-9_+/=@:-]{8,256}(?=[ \\t]{0,64}[;,]?[ \\t]{0,64}(#|//|\\r?\\n|\\r?$)))',
].join('|'));

const USAGE = `usage: review-package.mjs <dir> <base> <out> [--max-bytes <n>]

Writes to <out> the commits since <base>, git status, each changed file with its line counts
(every path whole, a rename as both paths), the diff from <base> to the worktree with 10 lines
of context, and every untracked, not ignored file. File diffs that do
not fit under --max-bytes (default ${DEFAULT_MAX_BYTES}) are left out and listed at the top.
A file diff with a line that looks like a secret or credential (the detector of
check-briefing.mjs: a known key or token format, a database URL with a password, or a name
such as PASSWORD, SECRET or TOKEN set to a literal value) is left out whole and listed under
WITHHELD at the top, with its size and the number of the first line that matched (in the base,
for a removed line): read it with git. A file whose path looks like a secret is withheld the
same way, listed without its path and with the git command that lists it, also where git writes
the path between quotes (a tab, a line break, a quote or a backslash in it). Every other line that
looks like a secret (a commit title, a line of the status, the changed files or the new-file
list, the base or folder name) is replaced by a
note in its place, and a commit keeps its short hash; HEADER LINES LEFT OUT at the top counts
them and says how to read them with git. The package is checked line by line before it is
written: a line that still looks like a secret exits 2, with nothing written, and so does a path
that looks like one still in it, as it is or between quotes. Each hunk header
comes in as its line numbers only, without the function context git prints after it.
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
// hunks are read here; the lines above the first hunk, which hold the paths, are read by
// secretInPath. An added or context line counts in the new
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

// A line of the package that looks like a secret, tested as secretLine tests a diff line: without
// a final "\r".
function looksSecret(printed) {
  return SECRET.test(printed.endsWith('\r') ? printed.slice(0, -1) : printed);
}

// Whether a file diff's path looks like a secret: the path, the `## New file:` heading, or a line
// above the first hunk (`diff --git`, `---`, `+++`, a rename, a copy or a binary notice) that
// looks like one or names a path that does. Such a diff stays out whole, like one with a secret
// line.
function secretInPath(chunk, namesHiddenPath) {
  if (SECRET.test(chunk.path) || (chunk.heading && SECRET.test(chunk.heading))) return true;
  if (namesHiddenPath(chunk.path) || (chunk.heading && namesHiddenPath(chunk.heading))) return true;
  for (const line of chunk.text.split('\n')) {
    if (HUNK_HEADER.test(line)) return false;
    if (looksSecret(line) || namesHiddenPath(line)) return true;
  }
  return false;
}

// Git writes a path holding a control character, a quote or a backslash between quotes, with that
// character escaped (core.quotepath=false leaves every other character as it is). The closing
// quote then follows the path, and the detector may no longer match a line that names it.
const QUOTED_ESCAPES = { '\x07': '\\a', '\b': '\\b', '\t': '\\t', '\n': '\\n', '\v': '\\v', '\f': '\\f', '\r': '\\r', '"': '\\"', '\\': '\\\\' };

// The forms in which a line git prints can hold a path: the path itself and, when git quotes it,
// the escaped text between the quotes.
function printedForms(path) {
  const quoted = path.replace(/[\x00-\x1f"\\\x7f]/g, (c) => QUOTED_ESCAPES[c] ?? `\\${c.charCodeAt(0).toString(8).padStart(3, '0')}`);
  return quoted === path ? [path] : [path, quoted];
}

// What replaces, in the header, a line that looks like a secret or holds a path that does.
const LINE_NOTE = '(line left out: it looks like a secret or credential; see HEADER LINES LEFT OUT at the top)';

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

// Each changed tracked file as `git diff --numstat -z` gives it: every path whole, never cut
// short, and a rename as its two paths, never the `dir/{old => new}` form of --stat.
function changedFiles(dir, base) {
  const fields = git(dir, ['diff', '--numstat', '-z', base, ...ARTIFACT_PATHSPEC]).split('\0');
  const files = [];
  for (let i = 0; i < fields.length; i += 1) {
    const counts = /^(-|\d+)\t(-|\d+)\t([\s\S]*)$/.exec(fields[i]);
    if (!counts) continue;
    // A rename leaves the path field empty, and its two paths follow as fields of their own.
    const paths = counts[3] ? [counts[3]] : [fields[i + 1], fields[i + 2]];
    if (!counts[3]) i += 2;
    files.push({ added: counts[1], removed: counts[2], paths });
  }
  return files;
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
  const baseHash = baseShort.stdout.trim();
  // Every header line that looks like a secret, counted at the top of the package.
  let leftOutOfHeader = 0;
  const named = (name, note) => {
    if (!looksSecret(name)) return name;
    leftOutOfHeader += 1;
    return note;
  };
  const folder = named(basename(dir), '(folder name left out: it looks like a secret or credential)');
  const title = `# Review package · ${folder} · base ${baseHash} · HEAD ${head} · ${new Date().toISOString()}`;

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
  // A commit that touches only loop artifacts is not part of the round either. Each line is the
  // short hash and the title, as --oneline prints them.
  const commits = git(dir, ['log', '--format=%h %s', `${base}..HEAD`, ...ARTIFACT_PATHSPEC]);
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
    const baseName = named(base, `${baseHash} (its name left out: it looks like a secret or credential)`);
    return {
      empty: true,
      vibeflowNote,
      text: `${title}\n\n${artifactLine}\n\n${headerNotice(leftOutOfHeader, baseHash)}EMPTY PACKAGE: nothing changed outside .vibeflow/ between base ${baseName} and the worktree (no commit, no diff, no new file); ${vibeflowNote}. ${advice}\n`,
    };
  }

  // Every path changed since the base or in the status, read whole and unquoted: each one that
  // looks like a secret on its own stays out of every line, in either form git prints it.
  const changedPaths = [
    ...git(dir, ['diff', '--name-only', '-z', '--no-renames', base, ...ARTIFACT_PATHSPEC]).split('\0'),
    ...git(dir, ['status', '--porcelain', '-z', '--no-renames', ...ARTIFACT_PATHSPEC]).split('\0').map((entry) => entry.slice(3)),
    ...untracked,
  ];
  const hiddenForms = [...new Set(changedPaths.filter((path) => path && looksSecret(path)))].flatMap(printedForms);
  const namesHiddenPath = (text) => hiddenForms.some((form) => text.includes(form));

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
    const bytes = Buffer.byteLength(chunk.text);
    if (secretInPath(chunk, namesHiddenPath)) {
      withheld.push({ path: chunk.path, bytes, line: 0, untracked: Boolean(chunk.heading) });
      continue;
    }
    const line = secretLine(chunk.text);
    if (line) withheld.push({ path: chunk.path, bytes, line });
    else candidates.push({ ...chunk, text: withoutFunctionContext(chunk.text) });
  }

  // A header line goes out when it looks like a secret, or when it names a path that does, where
  // the detector alone may not match the line (the path is followed by more text, or git writes
  // it between quotes). A diff whose path git quotes has no path to name here ("?").
  const secretPaths = withheld.filter((item) => !item.line && item.path !== '?').map((item) => item.path);
  const namesWithheld = (line) => namesHiddenPath(line) || secretPaths.some((path) => line.includes(path));
  const clean = (text) => text.split('\n').map((line) => {
    if (!looksSecret(line) && !namesWithheld(line)) return line;
    leftOutOfHeader += 1;
    return LINE_NOTE;
  }).join('\n');
  // A commit whose title goes out keeps its short hash, enough to read it with git.
  const commitLines = commits.split('\n').filter(Boolean).map((line) => {
    const hash = line.slice(0, line.indexOf(' '));
    if (!looksSecret(line) && !namesWithheld(line)) return line;
    leftOutOfHeader += 1;
    return `${hash} (title left out: it looks like a secret or credential; read it with git log -1 ${hash})`;
  });
  // One line per changed file, with every path whole: a line goes out when one of its paths
  // looks like a secret on its own, when the line does, or when it names a withheld path.
  const files = changedFiles(dir, base);
  const fileLines = files.map(({ added, removed, paths }) => {
    const line = `${paths.join(' => ')} | ${added === '-' ? 'binary' : `+${added} -${removed}`}`;
    if (!paths.some(looksSecret) && !looksSecret(line) && !namesWithheld(line)) return line;
    leftOutOfHeader += 1;
    return LINE_NOTE;
  });
  // A new file whose path looks like a secret is one note, even when its path holds a line break.
  const newFileLines = untracked.map((path) => {
    if (!namesHiddenPath(path)) return clean(`- ${path}`);
    leftOutOfHeader += 1;
    return LINE_NOTE;
  });
  const sum = (key) => files.reduce((total, file) => total + (Number(file[key]) || 0), 0);
  if (files.length) fileLines.push(`${files.length} file(s) changed, ${sum('added')} line(s) added, ${sum('removed')} line(s) removed`);
  const headSections = [
    '## Commits since the base', commitLines.join('\n') || '(none: the round is not committed)',
    '## git status --short', clean(git(dir, ['status', '--short', ...ARTIFACT_PATHSPEC]).trim()) || '(clean)',
    '## Files and lines', fileLines.join('\n') || '(no tracked change)',
    '## New files', newFileLines.join('\n') || '(none)',
  ].join('\n\n');

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
    ? `WITHHELD: ${withheld.length} file diff(s) left out because a line looks like a secret or credential. Read them with git before judging:\n${clean(withheld.map((item) => (item.line
      ? `- ${item.path} (${item.bytes} bytes, line ${item.line})`
      : `- a file whose path looks like a secret or credential (${item.bytes} bytes): find it with ${item.untracked ? 'git ls-files --others --exclude-standard' : `git diff --name-only ${baseHash}`}`)).join('\n'))}\n\n`
    : '';
  const truncatedNotice = leftOut.length
    ? `TRUNCATED: ${leftOut.length} of ${candidates.length} file diff(s) left out to stay under ${maxBytes} bytes. Read them with git before judging:\n${clean(leftOut.map((item) => `- ${item.path} (${item.bytes} bytes)`).join('\n'))}\n\n`
    : '';
  const notice = `${headerNotice(leftOutOfHeader, baseHash)}${withheldNotice}${truncatedNotice}`;
  const tracked = kept.filter((chunk) => !chunk.heading).map((chunk) => chunk.piece).join('');
  const added = kept.filter((chunk) => chunk.heading).map((chunk) => chunk.piece).join('');
  const text = `${title}\n\n${artifactLine}\n\n${notice}${headSections}\n\n## Diff (base to worktree, 10 lines of context)\n\n${tracked || '(no tracked change)\n'}${added}`;
  return { empty: false, text, leftOut, withheld, newFiles: untracked.length, hiddenForms };
}

// The count at the top of the package of the header lines it left out, with the git commands
// that print them.
function headerNotice(count, baseHash) {
  if (!count) return '';
  return `HEADER LINES LEFT OUT: ${count} line(s) of the header look like a secret or credential, each replaced by a note in its place (a commit keeps its short hash). Read them with git: git log --oneline ${baseHash}..HEAD, git status --short, git diff --numstat ${baseHash}, git ls-files --others --exclude-standard.\n\n`;
}

// The last check before writing: the line number of the first line of the finished package that
// looks like a secret, or 0 when none does.
function leakedLine(text) {
  const index = text.split('\n').findIndex(looksSecret);
  return index + 1;
}

// The same last check for the paths that look like a secret: whether the finished package still
// holds one, as it is or as git writes it between quotes.
function leaksPath(text, forms = []) {
  for (const form of forms) {
    if (text.includes(form)) return true;
  }
  return false;
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  try {
    const args = parseArgs(argv);
    const result = build(args);
    const leaked = leakedLine(result.text);
    if (leaked) {
      throw new PackageError(`line ${leaked} of the package still looks like a secret or credential; nothing was written`);
    }
    if (leaksPath(result.text, result.hiddenForms)) {
      throw new PackageError('the package still holds a path that looks like a secret or credential; nothing was written');
    }
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
