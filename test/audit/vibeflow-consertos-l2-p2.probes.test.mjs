// Behavior probes from the independent audit of the .gitignore reinstall contract (an edition
// that was installed when the install began never gives back to the Vibeflow block a line of its
// first release that the file does not have; an edition not installed yet, over a block with none
// of its first-release lines, adds all of its own lines; the signal is the current marker file).
// Each case states, as comments, the contract it protects, the plausible regression that breaks
// it, and why the implementer's tests did not catch it.
// No network: the CLI talks to a local node:http server that serves this repository's files.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hermeticEnv } from '../loop-helpers.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const CLI_SRC = readFileSync(join(ROOT, 'cli/index.js'), 'utf8');
const CARVE_OUT = ['.vibeflow/*', '!.vibeflow/hotfixes/'];

// ---- the CLI's own data and function, read from its source, so no line of today's blocks is
// written here: the properties hold for whatever lines the blocks carry

function sliceOf(start, close) {
  const begin = CLI_SRC.indexOf(start);
  assert.ok(begin >= 0, `cli/index.js has ${start.trim()}`);
  const end = CLI_SRC.indexOf(close, begin + 1);
  return CLI_SRC.slice(begin, end + close.length);
}

const CLI = new Function(`${[
  sliceOf('\nconst OPENCODE_WORKFLOWS = ', ';\n'),
  sliceOf('\nconst GITIGNORE_MARKER = ', ';\n'),
  sliceOf('\nconst GITIGNORE_BLOCKS = ', '\n};\n'),
  sliceOf('\nconst GITIGNORE_UPDATES = ', '\n};\n'),
].join('\n')}\nreturn { GITIGNORE_MARKER, GITIGNORE_BLOCKS, GITIGNORE_UPDATES };`)();
const upsert = new Function(`'use strict';${sliceOf('\nfunction upsertGitignoreBlock(', '\n}\n')}\nreturn upsertGitignoreBlock;`)();

const MARKER = CLI.GITIGNORE_MARKER;
const SHARED = CLI.GITIGNORE_UPDATES.shared;
const EDITIONS = Object.keys(CLI.GITIGNORE_BLOCKS);
const bare = (line) => line.replace(/\r$/, '').trim();
const OWN = Object.fromEntries(EDITIONS.map((edition) => [
  edition,
  CLI.GITIGNORE_BLOCKS[edition].trim().split('\n').filter((line) => line !== MARKER && !SHARED.includes(line)),
]));
const SINCE = Object.fromEntries(EDITIONS.map((edition) => [edition, CLI.GITIGNORE_UPDATES.since[edition] || []]));
const FIRST = Object.fromEntries(EDITIONS.map((edition) => [edition, OWN[edition].filter((line) => !SINCE[edition].includes(line))]));

const call = (input, edition, installed) => upsert(input, CLI.GITIGNORE_BLOCKS[edition], {
  marker: MARKER,
  shared: SHARED,
  since: SINCE[edition],
  installed,
});

// ---- generated cases: the shapes of the implementer's matrix plus where the block sits in the
// file, how it ends, padded lines, and a whole other edition's block (its `since` lines too)

const LAYOUTS = {
  middle: (block) => ['node_modules/', '', ...block, '', '# mine', '.env', ''],
  'at the start': (block) => [...block, '', '.env', ''],
  'at the end, final newline': (block) => ['node_modules/', '', ...block, ''],
  'at the end, no final newline': (block) => ['node_modules/', '', ...block],
  'closed by a whitespace-only line': (block) => ['node_modules/', '', ...block, '   ', '.env', ''],
  'with padded lines': (block) => ['node_modules/', '', block[0], ...block.slice(1).map((line) => `${line}  `), '', '.env', ''],
};
const SHARED_FORMS = { shared: SHARED, 'carve-out': CARVE_OUT, 'no shared line': [] };

function masks(n) {
  // every subset when it is small; otherwise every subset with none, one, all but one, or all lines
  const out = [];
  for (let mask = 0; mask < 2 ** n; mask += 1) {
    let bits = 0;
    for (let i = 0; i < n; i += 1) bits += (mask >> i) & 1;
    if (n <= 6 || bits <= 1 || bits >= n - 1) out.push(mask);
  }
  return out;
}

function* cases() {
  for (const edition of EDITIONS) {
    const own = OWN[edition];
    for (const installed of [true, false]) {
      for (const mask of masks(own.length)) {
        const present = own.filter((_, i) => (mask >> i) & 1);
        for (const [sharedName, shared] of Object.entries(SHARED_FORMS)) {
          for (const other of [null, ...EDITIONS.filter((e) => e !== edition)]) {
            for (const [layoutName, layout] of Object.entries(LAYOUTS)) {
              for (const eol of ['', '\r']) {
                const block = [MARKER, ...shared, ...present, ...(other ? OWN[other] : [])];
                const input = layout(block).join(`${eol}\n`);
                yield {
                  edition, installed, input, eol, layoutName,
                  name: `${edition} installed=${installed} own=[${present}] ${sharedName} other=${other} ${layoutName} ${eol ? 'CRLF' : 'LF'}`,
                };
              }
            }
          }
        }
      }
    }
  }
}

function brokenBy({ edition, installed, input, eol, layoutName }) {
  const broken = [];
  const { content: output, action, added } = call(input, edition, installed);
  const inLines = input.split('\n');
  const outLines = output.split('\n');
  const count = (lines, line) => lines.filter((l) => bare(l) === line).length;

  // where the block ends in the input: the marker line and the non-blank lines after it
  const markerIdx = inLines.findIndex((line) => bare(line) === MARKER);
  let blockEnd = markerIdx + 1;
  while (blockEnd < inLines.length && bare(inLines[blockEnd]) !== '') blockEnd += 1;
  const k = outLines.length - inLines.length;
  // a file that ends inside the block has a known line-end gap (the `todo` in
  // test/audit/cli-kit.probes.test.mjs): there the lines are compared without their ends
  const loose = layoutName === 'at the end, no final newline';
  const same = (a, b) => (loose ? a.map(bare).join('\n') === b.map(bare).join('\n') : a.join('\n') === b.join('\n'));
  if (k < 0 || !same(outLines.slice(0, blockEnd), inLines.slice(0, blockEnd)) || !same(outLines.slice(blockEnd + k), inLines.slice(blockEnd))) {
    broken.push('an input line changed or moved, or a line entered elsewhere than right after the block');
    return broken;
  }
  const inserted = outLines.slice(blockEnd, blockEnd + k);
  if (!loose && inserted.some((line) => line.endsWith('\r') !== (eol === '\r'))) broken.push('an added line has another line end than the file');
  const addedBare = inserted.map(bare);

  if (addedBare.some((line) => SHARED.includes(line) || CARVE_OUT.includes(line))) broken.push('a shared line entered a block that exists');
  if (addedBare.some((line) => !OWN[edition].includes(line))) broken.push(`a line that is not ${edition}'s own entered`);
  if (addedBare.some((line) => count(inLines, line) > 0) || new Set(addedBare).size !== addedBare.length) broken.push('a line the file had, or the same line twice, entered');

  if (installed) {
    const given = FIRST[edition].filter((line) => count(inLines, line) === 0 && count(outLines, line) > 0);
    if (given.length) broken.push(`installed, yet gave back ${given.join(', ')}`);
    const want = SINCE[edition].filter((line) => count(inLines, line) === 0);
    if ([...addedBare].sort().join('\n') !== [...want].sort().join('\n')) broken.push(`installed: added [${addedBare}], the missing since lines are [${want}]`);
  } else if (FIRST[edition].every((line) => count(inLines, line) === 0)) {
    for (const line of OWN[edition]) {
      if (count(outLines, line) !== Math.max(1, count(inLines, line))) broken.push(`not installed over a block without its first-release lines: ${line} is there ${count(outLines, line)} times`);
    }
  }

  if ((action === 'present') !== (output === input)) broken.push(`action ${action} for ${output === input ? 'an unchanged' : 'a changed'} file`);
  if (output !== input && (added || []).join('\n') !== addedBare.join('\n')) broken.push(`added says [${added}], the file got [${addedBare}]`);

  const again = call(output, edition, true);
  if (again.content !== output || again.action !== 'present') broken.push('a rerun as the installed edition changed the file');
  return broken;
}

// Contract: I2 over the whole space of blocks: installed never gives back a first-release line
// and adds exactly the missing `since` lines; not installed over a block without its first-release
// lines ends with each own line once; a shared line never enters; the user's lines stay, in order,
// with their line ends; what enters sits right after the block; a rerun as installed is a no-op.
// Regression: the insertion point or the block end read differently (a block at the start of the
// file, at its end, closed by a whitespace-only line, or with padded lines), or the presence test
// done on raw lines instead of trimmed ones, or a whole other edition's block (with its `since`
// lines) read as this edition's.
// Why the implementer's test misses it: its matrix puts the block always in the middle, closed by
// an empty line, with unpadded lines, and the other edition only with its first-release lines.
test('probe G1: the reinstall contract holds over generated blocks in every position, ending and padding', () => {
  let total = 0;
  const failures = [];
  for (const c of cases()) {
    total += 1;
    const broken = brokenBy(c);
    if (broken.length) failures.push(`${c.name}: ${broken.join('; ')}`);
  }
  assert.ok(total > 10_000, `generated ${total} cases`);
  assert.equal(failures.length, 0, `${failures.length} of ${total} cases broke the contract, first ones:\n${failures.slice(0, 5).join('\n')}`);
});

// ---- end to end: install, the user edits the block, reinstall with --force

async function startServer() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/+/, '');
    const full = normalize(join(ROOT, path));
    if (!full.startsWith(ROOT + sep) || !existsSync(full)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200);
    res.end(readFileSync(full));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'vibeflow-l2p2-'));
  const cli = join(root, 'cli');
  const fakeColors = join(cli, 'node_modules/picocolors');
  mkdirSync(fakeColors, { recursive: true });
  copyFileSync(join(ROOT, 'cli/index.js'), join(cli, 'index.js'));
  copyFileSync(join(ROOT, 'cli/package.json'), join(cli, 'package.json'));
  writeFileSync(join(fakeColors, 'package.json'), JSON.stringify({ name: 'picocolors', main: 'index.js' }));
  writeFileSync(join(fakeColors, 'index.js'), 'module.exports = new Proxy({}, { get: () => (s) => String(s) });\n');
  const project = join(root, 'project');
  mkdirSync(project);
  return { root, project, cliPath: join(cli, 'index.js'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function runCli(workspace, args, url) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [workspace.cliPath, ...args], {
      cwd: workspace.project,
      env: hermeticEnv(workspace.root, { VIBEFLOW_BASE_URL: url }),
    });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, out });
    });
  });
}

// Installs `edition` fresh, lets `edit` rewrite the .gitignore it wrote, then reinstalls with
// --force; returns the edited file and the file after the reinstall.
async function installEditReinstall(edition, edit) {
  const server = await startServer();
  const workspace = makeWorkspace();
  try {
    const gitignore = join(workspace.project, '.gitignore');
    writeFileSync(gitignore, 'node_modules/\n');
    const first = await runCli(workspace, [`--${edition}`], server.url);
    assert.equal(first.status, 0, first.out);
    const edited = edit(readFileSync(gitignore, 'utf8'));
    writeFileSync(gitignore, edited);
    const again = await runCli(workspace, [`--${edition}`, '--force'], server.url);
    assert.equal(again.status, 0, again.out);
    return { edited, after: readFileSync(gitignore, 'utf8') };
  } finally {
    workspace.cleanup();
    await server.close();
  }
}

// keeps the marker, the carve-out in place of the shared line, and only `keep` of the own lines
const userBlock = (edition, keep, eol = '') => (text) => {
  const lines = text.split('\n').map(bare);
  const at = lines.indexOf(MARKER);
  assert.ok(at >= 0, 'the fresh install wrote the marker line');
  let end = at + 1;
  while (end < lines.length && lines[end] !== '') end += 1;
  const block = [MARKER, ...CARVE_OUT, ...lines.slice(at + 1, end).filter((line) => keep.includes(line))];
  return [...lines.slice(0, at), ...block, '', '# mine', '.env', ''].join(`${eol}\n`);
};

for (const edition of EDITIONS) {
  // Contract: [144] for each edition: installed (its current marker written by a real install),
  // the user takes every first-release line out of the block, and --force leaves the file byte
  // for byte.
  // Regression: main reading the signal from one edition's marker, or from a path that is not
  // the one the install writes for this edition (the Cursor and OpenCode markers differ from
  // Copilot's), so the reinstall gives the lines back.
  // Why the implementer's test misses it: its end-to-end cases are Copilot only, with the marker
  // planted by hand rather than written by an install.
  test(`probe E1: ${edition} installed by the CLI, first-release lines taken out by the user: --${edition} --force leaves .gitignore byte for byte`, async () => {
    const { edited, after } = await installEditReinstall(edition, userBlock(edition, SINCE[edition]));
    for (const line of FIRST[edition]) assert.ok(!edited.split('\n').map(bare).includes(line), `the edit took ${line} out`);
    assert.equal(after, edited);
  });
}

// Contract: an installed edition in a CRLF file gains only its missing `since` lines, with CRLF,
// right after the block, and gives back no first-release line.
// Regression: the line end of the inserted lines taken from somewhere other than the block (the
// signal path is new, and the CRLF end-to-end probes of test/audit/cli-kit.probes.test.mjs all
// run without the marker, as a not-installed edition).
// Why the implementer's test misses it: its end-to-end cases are LF only.
test('probe E2: Copilot installed, CRLF file, block left with no own line: --copilot --force adds only the since lines, with CRLF, after the block', async () => {
  const edition = 'copilot';
  assert.ok(SINCE[edition].length > 0, 'Copilot has a since line');
  const { edited, after } = await installEditReinstall(edition, userBlock(edition, [], '\r'));
  const lines = edited.split('\n');
  const end = lines.indexOf('\r', lines.findIndex((line) => bare(line) === MARKER));
  const expected = [...lines.slice(0, end), ...SINCE[edition].map((line) => `${line}\r`), ...lines.slice(end)].join('\n');
  assert.equal(after, expected);
});
