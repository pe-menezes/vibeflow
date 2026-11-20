#!/usr/bin/env node
// State probes before the PR: audit tests that pin the repository's state instead of a behavior.
// A probe that reads git against a base, today's version, a doc sentence, a line number or the
// real clock goes red on the next unrelated change. This lists the suspect lines; the
// orchestrator decides, and a state probe moves to the audit report before the PR.

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

// The kit needs Node 18 or later (Node 16 has no global fetch): below it, say so and exit 64 first.
if (Number(process.versions.node.split('.')[0]) < 18) {
  process.stderr.write(`check-probes.mjs: needs Node.js 18 or later; found ${process.versions.node}\n`);
  process.exit(64);
}

const USAGE = `usage: check-probes.mjs <repo> [--base <ref>] [--dir <probe folder>]

Without --dir, the probes are the files that carry the marker "vibeflow-probe: <name>" (in
any folder but .vibeflow/, with any extension), and the files under an "audit/" folder inside
a test folder (test/, tests/, __tests__/ or spec/, at any depth), where probes went before the
marker.
With --base, only the probe files changed since <ref> (committed, modified or untracked) are
read; without it, every probe file is (periodic pruning).
A --dir folder is relative to the repository's top level, or absolute; either way it must be a
folder inside the repository, and every file in it is read.

exit 0 clean · 1 suspects · 64 bad arguments, git failure, or a --dir that does not exist,
is not a folder or is outside the repository`;

// Each family is the form this script read before it learned other languages, kept whole, plus
// narrow forms for the others: what it flagged in JavaScript and Python it still flags, and the
// new forms only add. A line that is only a comment is not read, because a comment runs nothing.
// * git: the form before; or the program as a string literal right after `(` or `[` (the first
//   argument of a call or the first item of a list); or a string literal that starts with `git `
//   and then a lowercase letter, `-` or `$` (a whole command line in one string).
// * version: the form before (with `package.json` and `__version__`), or the manifest of another
//   ecosystem.
// * line number: the form before (its twelve extensions, any name before them), or
//   `.<extension>:<number>` with the extension of a source or configuration file of another
//   ecosystem; the list keeps a port or a slice such as `obj.attr:4` out.
// * clock: the form before; or `now`, `today` or `utcnow` (any letter case) through `.` or `::` on
//   a receiver whose name ends in a clock word, with nothing inside the parentheses and a receiver
//   whose name does not say it is a test clock; or `Date()`.
// * doc text: the form before, or a string literal ending in a document file with a reading call on
//   the same line outside the literals; and in either case not when the line opens the file to
//   write it.
// The forms before are the families at e04b531.
const BEFORE = {
  git: /\b(execFileSync|execFile|spawnSync|spawn|execSync|exec)\(\s*['"`]git\b|subprocess\.\w+\(\s*\[\s*['"]git|\bgit (diff|log|show|rev-parse|status|ls-files)\b|origin\/(main|master)|HEAD~\d/,
  version: /\bVERSION\b|['"]version['"]|\.version\b|package\.json|CHANGELOG|__version__|['"]v?\d+\.\d+\.\d+['"]/,
  line: /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|md|sh):\d+\b/,
  clock: /\bDate\.now\(\)|new Date\(\s*\)|datetime\.(now|today|utcnow)\(|date\.today\(|time\.time\(\)/,
  doc: /\b(readFileSync|readFile|read_text|open)\([^)]*\.(md|html|txt)\b/,
};
const COMMENT = /^\s*(\/\/|#(?![\w[])|--|;|\/\*|\*|<!--)/;
const STRING_LITERAL = /(['"`])(?:\\.|(?!\1).)*\1/g;
// The line with each string literal emptied, except the ones `keep` matches whole.
const outsideStrings = (line, keep = null) => line.replace(STRING_LITERAL, (literal) => (keep?.test(literal) ? literal : '""'));
const GIT_LITERAL = /[([]\s*['"`]git['"`]|['"`]git\s+[-a-z$]/;
const MANIFEST = /Cargo\.toml|pyproject\.toml|\.csproj\b|\.gemspec\b|build\.gradle/;
const SOURCE_LINE = /\.(cs|fs|vb|kt|kts|java|scala|groovy|swift|m|mm|c|h|cc|cpp|hpp|cxx|php|pl|pm|r|jl|lua|dart|ex|exs|erl|hrl|hs|ml|mli|clj|cljs|zig|nim|vue|svelte|tf|yml|yaml|toml|json|sql):\d+\b/;
const CLOCK_CALL = /(time|date|instant|clock|calendar|performance)\s*(\.|::)\s*(now|today|utcnow)\b(?!\s*\(\s*[^)\s])/i;
const TEST_CLOCK = /(?:\b(?:fake|mock|stub|frozen|fixed|test)\w*|\bclock)\s*(\.|::)\s*(now|today|utcnow)\b/i;
const DOC_LITERAL = /['"`][^'"`\n]*\.(md|html|txt|rst|adoc)['"`]/;
const READ_CALL = /(?:\b(?:[Rr]ead\w*|[Ll]oad\w*|[Oo]pen)|\w+Read\w*|contentsOf\w*)\s*[(:]/;
// Tested outside the string literals but the mode itself, so an opening call quoted in a literal
// does not count.
const WRITE_MODE = /open\w*\([^)]*,\s*['"][wax]\+?b?['"]/i;
const MODE_LITERAL = /^['"][wax]\+?b?['"]$/i;
const FAMILIES = [
  ['reads git', { test: (line) => BEFORE.git.test(line) || GIT_LITERAL.test(line) }],
  ['current version', { test: (line) => BEFORE.version.test(line) || MANIFEST.test(line) }],
  ['state that changes by itself', /\b(still|remains|is)\s+(pending|open|unfixed|todo)\b|\bnot yet (done|fixed|implemented|shipped)\b/i],
  ['line number', { test: (line) => BEFORE.line.test(line) || SOURCE_LINE.test(line) }],
  ['real clock', { test: (line) => BEFORE.clock.test(line) || (CLOCK_CALL.test(line) && !TEST_CLOCK.test(line)) || /\bDate\(\s*\)/.test(line) }],
  ['doc text', { test: (line) => (BEFORE.doc.test(line) || (DOC_LITERAL.test(line) && READ_CALL.test(outsideStrings(line)))) && !WRITE_MODE.test(outsideStrings(line, MODE_LITERAL)) }],
];

const DEFAULT_PROBE_PATH = /(^|\/)(test|tests|__tests__|spec)\/(.*\/)?audit\//;
// The knowledge base and briefings of the loop: a filled briefing quotes a probe's marker.
const KIT_FOLDER = /(^|\/)\.vibeflow\//;
// The marker the audit writes in a probe's comment, followed by its name. Assembled, so this
// script is not a probe where the kit is installed; a text that quotes the marker's template
// (`<feature>-<part>` in angle brackets, or `{feature}` in braces) is not one either.
const MARKER = ['vibeflow', 'probe:'].join('-');
const MARKED = `${MARKER}[[:space:]]*[^[:space:]<{]`;
const NOT_READ = 'not read: state that reaches a probe through another file (a helper, a fixture loader) or through the environment; the auditor reads that';

function fail(message) {
  console.error(`check-probes: ${message}`);
  process.exit(64);
}

function cleanEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

function git(dir, args, okStatuses = [0]) {
  const result = spawnSync('git', args, { cwd: dir, env: cleanEnv(), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error) fail(`git could not run: ${result.error.message}`);
  if (!okStatuses.includes(result.status)) fail(`git ${args.join(' ')} failed: ${result.stderr.trim().slice(0, 200)}`);
  return result.stdout.split('\0').filter(Boolean);
}

function parseArgs(argv) {
  const options = { repo: null, base: null, dir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base' || arg === '--dir') {
      if (!argv[i + 1]) fail(`${arg} takes a value`);
      options[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else if (!options.repo && !arg.startsWith('--')) {
      options.repo = arg;
    } else {
      fail(`unexpected argument ${arg}\n\n${USAGE}`);
    }
  }
  if (!options.repo) fail(`expected <repo>\n\n${USAGE}`);
  return options;
}

// The --dir folder as a path from the repository's top level: relative to the top level, or
// absolute as given; both through the system's realpath, so a folder reached by a symbolic link,
// or written in another letter case on a file system that ignores case, matches git's paths.
function probeFolder(top, dir) {
  let real;
  try {
    real = realpathSync.native(isAbsolute(dir) ? dir : join(top, dir));
  } catch {
    fail(`--dir ${dir} does not exist`);
  }
  if (!statSync(real).isDirectory()) fail(`--dir ${dir} is not a folder`);
  const inside = relative(realpathSync.native(top), real);
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) fail(`--dir ${dir} is outside the repository ${top}`);
  return inside.split(sep).join('/');
}

// The tracked and untracked files whose text carries the marker with a name after it.
function markedFiles(top) {
  return new Set(git(top, ['grep', '-l', '-z', '-I', '--untracked', '-E', '-e', MARKED], [0, 1]));
}

function probeFiles(top, { base, dir }) {
  const folder = dir === null ? null : probeFolder(top, dir);
  let inScope;
  if (folder === null) {
    const marked = markedFiles(top);
    inScope = (path) => !KIT_FOLDER.test(path) && (marked.has(path) || DEFAULT_PROBE_PATH.test(path));
  } else {
    inScope = (path) => folder === '' || path.startsWith(`${folder}/`);
  }
  const listed = base
    ? [
        ...git(top, ['diff', '--name-only', '--no-renames', '--diff-filter=d', '-z', base, '--']),
        ...git(top, ['ls-files', '--others', '--exclude-standard', '-z']),
      ]
    : git(top, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  return [...new Set(listed)].filter(inScope).sort();
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  const options = parseArgs(argv);
  const top = git(resolve(options.repo), ['rev-parse', '--show-toplevel'])[0].trim();
  const files = probeFiles(top, options);
  let suspects = 0;
  for (const path of files) {
    let lines;
    try {
      lines = readFileSync(join(top, path), 'utf8').split('\n');
    } catch {
      continue;
    }
    lines.forEach((line, index) => {
      if (COMMENT.test(line)) return;
      const family = FAMILIES.find(([, pattern]) => pattern.test(line));
      if (!family) return;
      console.log(`${path}:${index + 1} [${family[0]}] ${line.trim().slice(0, 160)}`);
      suspects += 1;
    });
  }
  console.log(`${files.length} probe file(s) read; ${suspects} suspect line(s)`);
  if (files.length === 0) console.log('no probe file found: check the marker, --dir or --base if the audit wrote probes');
  if (suspects) {
    console.log('For each: a behavior probe stays; a state probe (git, version, sentence, line, clock, doc text) moves to the report before the PR.');
  }
  console.log(NOT_READ);
  return suspects ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
