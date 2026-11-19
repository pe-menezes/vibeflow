// A reinstall over a Vibeflow .gitignore block. An edition that was already installed when the
// install began (its current marker file was there) never gives back to the block a line of its
// first release that the file does not have: the user took it out to track those files. It only
// adds the lines that entered its block later (GITIGNORE_UPDATES.since) and are missing. An
// edition not installed yet, over a block that has none of its first-release lines, adds all of
// its own lines, as before.
//
// Two layers. The matrix takes `upsertGitignoreBlock` out of cli/index.js, as `confinementOf` does
// in test/cli-kit.test.mjs, and runs it over every combination of the shapes a block can have; the
// properties come from the contract above, not from the function's code. The end-to-end cases run
// the real CLI against a local server, and prove that `main` hands the function the marker signal.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hermeticEnv } from './loop-helpers.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE_ENV = 'VIBEFLOW_BASE_URL';
const CLI_SRC = readFileSync(join(ROOT, 'cli/index.js'), 'utf8');

// --- The contract's data, written here and checked against the CLI below ---

const MARKER = '# Vibeflow — installed + generated (remove to track in git)';
const SHARED = '.vibeflow/';
const CARVE_OUT = ['.vibeflow/*', '!.vibeflow/hotfixes/'];
const WORKFLOWS = ['analyze', 'audit', 'discover', 'gen-spec', 'hotfix', 'implement', 'prompt-pack', 'quick', 'stats', 'teach'];

// Each edition's own lines in its block, in block order: first-release lines, then `since` lines.
const FIRST = {
  copilot: ['.github/prompts/vibeflow-*.prompt.md', '.github/agents/vibeflow-architect.agent.md', '.github/instructions/vibeflow/'],
  cursor: ['.cursor/rules/vibeflow.mdc', '.cursor/rules/vibeflow-architect.mdc', '.cursor/skills/vibeflow-*/'],
  opencode: [
    '.opencode/agents/architect.md',
    '.opencode/agents/executor.md',
    '.opencode/agents/auditor.md',
    '.opencode/commands/vibeflow-*.md',
    ...WORKFLOWS.map((name) => `.opencode/skills/${name}/`),
  ],
};
const SINCE = { copilot: ['.github/vibeflow/'], cursor: [], opencode: [] };
const OWN = Object.fromEntries(Object.keys(FIRST).map((edition) => [edition, [...FIRST[edition], ...SINCE[edition]]]));
const BLOCK = Object.fromEntries(Object.keys(OWN).map((edition) => [edition, `\n${[MARKER, SHARED, ...OWN[edition]].join('\n')}\n`]));
const MARKER_FILE = {
  copilot: '.github/prompts/vibeflow-analyze.prompt.md',
  cursor: '.cursor/rules/vibeflow.mdc',
  opencode: '.opencode/commands/vibeflow-analyze.md',
};
const LEGACY_MARKER_FILE = { copilot: '.github/prompts/vibeflow/vibeflow-analyze.prompt.md' };

// --- Taken from cli/index.js as it is ---

// The function alone, run with nothing of the file around it: whatever it uses comes in as an
// argument, so it stays pure and can run here in isolation.
function upsertOf() {
  const begin = CLI_SRC.indexOf('\nfunction upsertGitignoreBlock(');
  assert.ok(begin >= 0, 'cli/index.js has function upsertGitignoreBlock');
  const end = CLI_SRC.indexOf('\n}\n', begin + 1);
  // eslint-disable-next-line no-new-func
  return new Function(`'use strict';${CLI_SRC.slice(begin, end + 3)}\nreturn upsertGitignoreBlock;`)();
}

function constOf(name, close) {
  const begin = CLI_SRC.indexOf(`\nconst ${name} = `);
  assert.ok(begin >= 0, `cli/index.js has const ${name}`);
  const end = CLI_SRC.indexOf(close, begin + 1);
  return CLI_SRC.slice(begin, end + close.length);
}

test('the CLI\'s gitignore marker, blocks and updates are the ones this contract is written against', () => {
  const source = [
    constOf('OPENCODE_WORKFLOWS', ';\n'),
    constOf('GITIGNORE_MARKER', ';\n'),
    constOf('GITIGNORE_BLOCKS', '\n};\n'),
    constOf('GITIGNORE_UPDATES', '\n};\n'),
  ].join('\n');
  // eslint-disable-next-line no-new-func
  const cli = new Function(`${source}\nreturn { OPENCODE_WORKFLOWS, GITIGNORE_MARKER, GITIGNORE_BLOCKS, GITIGNORE_UPDATES };`)();
  assert.equal(cli.GITIGNORE_MARKER, MARKER);
  assert.deepEqual(cli.GITIGNORE_BLOCKS, BLOCK);
  assert.deepEqual(cli.GITIGNORE_UPDATES, { shared: [SHARED], since: SINCE });
});

// --- The matrix ---

const upsert = upsertOf();
const run = (existing, edition, installed) => upsert(existing, BLOCK[edition], {
  marker: MARKER,
  shared: [SHARED],
  since: SINCE[edition],
  installed,
});

const SHARED_FORMS = { '.vibeflow/': [SHARED], 'carve-out': CARVE_OUT, absent: [] };
const OTHER = { copilot: 'cursor', cursor: 'opencode', opencode: 'copilot' };
const EOLS = { LF: '', CRLF: '\r' };
const bare = (line) => line.replace(/\r$/, '').trim();

// Checks one case; returns the broken properties, empty when all hold.
function check({ edition, installed, input, eol }) {
  const broken = [];
  let result;
  try {
    result = run(input, edition, installed);
  } catch (err) {
    return [`threw ${err.message}`];
  }
  const output = result.content;
  const inLines = input.split('\n');
  const outLines = output.split('\n');
  const inSet = new Set(inLines.map(bare));
  const outBare = outLines.map(bare);

  // every input line, in order and with its line end; what enters, right after the block
  // (the marker line and the lines after it up to the first blank line)
  const markerIdx = inLines.findIndex((line) => bare(line) === MARKER);
  let blockEnd = markerIdx + 1;
  while (blockEnd < inLines.length && bare(inLines[blockEnd]) !== '') blockEnd += 1;
  const k = outLines.length - inLines.length;
  const inserted = k >= 0 ? outLines.slice(blockEnd, blockEnd + k) : [];
  if (k < 0
    || outLines.slice(0, blockEnd).join('\n') !== inLines.slice(0, blockEnd).join('\n')
    || outLines.slice(blockEnd + k).join('\n') !== inLines.slice(blockEnd).join('\n')) {
    broken.push('the input lines are not all kept in order, or something entered elsewhere than right after the block');
  }
  if (inserted.some((line) => line.endsWith('\r') !== (eol === '\r'))) broken.push('an added line has another line end than the file');
  const added = inserted.map(bare);

  // a shared line never enters a block that exists; nothing foreign, nothing twice
  if (added.some((line) => line === SHARED || CARVE_OUT.includes(line))) broken.push('a shared line entered the block');
  if (added.some((line) => !OWN[edition].includes(line))) broken.push(`a line that is not ${edition}'s entered: ${added}`);
  if (added.some((line) => inSet.has(line)) || new Set(added).size !== added.length) broken.push('a line the file had entered again');

  const firstPresent = FIRST[edition].filter((line) => inSet.has(line));
  if (installed) {
    // never a first-release line the file does not have; every missing `since` line
    const back = FIRST[edition].filter((line) => !inSet.has(line) && outBare.includes(line));
    if (back.length) broken.push(`installed, yet gave back ${back.join(', ')}`);
    const sinceMissing = SINCE[edition].filter((line) => !inSet.has(line));
    if (added.join('\n') !== sinceMissing.join('\n')) broken.push(`installed: added [${added}] instead of the missing since lines [${sinceMissing}]`);
  } else if (firstPresent.length === 0) {
    for (const line of OWN[edition]) {
      const n = outBare.filter((l) => l === line).length;
      if (n !== 1) broken.push(`not installed over a foreign block: ${line} is there ${n} times`);
    }
  }

  // what the CLI reads back
  if ((result.action === 'present') !== (output === input)) broken.push(`action ${result.action} for ${output === input ? 'an unchanged' : 'a changed'} file`);
  if (result.action !== 'present' && (result.added || []).join('\n') !== added.join('\n')) broken.push(`added says [${result.added}], the file got [${added}]`);

  // a second run, as the installed edition, changes nothing
  const again = run(output, edition, true);
  if (again.content !== output || again.action !== 'present') broken.push('a rerun as the installed edition changed the file');
  return broken;
}

function* cases(edition) {
  const own = OWN[edition];
  for (const installed of [true, false]) {
    for (let mask = 0; mask < 2 ** own.length; mask += 1) {
      const present = own.filter((_, i) => (mask >> i) & 1);
      for (const [sharedName, shared] of Object.entries(SHARED_FORMS)) {
        for (const other of [false, true]) {
          for (const [eolName, eol] of Object.entries(EOLS)) {
            const block = [MARKER, ...shared, ...present, ...(other ? FIRST[OTHER[edition]] : [])];
            const lines = ['node_modules/', '', ...block, '', '# mine', '.env', ''];
            const input = lines.join(`${eol}\n`);
            yield {
              edition, installed, input, eol,
              name: `${edition} installed=${installed} own=[${present}] shared=${sharedName} other=${other} ${eolName}`,
            };
          }
        }
      }
    }
  }
}

for (const edition of Object.keys(OWN)) {
  test(`${edition}: the generated matrix of blocks keeps every contract property`, () => {
    let total = 0;
    const failures = [];
    for (const c of cases(edition)) {
      total += 1;
      const broken = check(c);
      if (broken.length) failures.push(`${c.name}: ${broken.join('; ')}`);
    }
    assert.equal(total, 2 * 2 ** OWN[edition].length * 3 * 2 * 2);
    assert.equal(failures.length, 0, `${failures.length} of ${total} cases broke the contract, first ones:\n${failures.slice(0, 5).join('\n')}`);
  });

  for (const installed of [true, false]) {
    test(`${edition} installed=${installed}: a .gitignore without the marker line gets the whole block at the end, once`, () => {
      const input = 'node_modules/\n.env\n';
      const result = run(input, edition, installed);
      assert.equal(result.content, `node_modules/\n.env\n${BLOCK[edition].trim()}\n`);
      assert.equal(result.action, 'appended');
      assert.deepEqual(result.added, [SHARED, ...OWN[edition]]);
      const again = run(result.content, edition, true);
      assert.equal(again.content, result.content);
      assert.equal(again.action, 'present');
    });
  }
}

// --- End to end, through the CLI ---

async function startServer() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/+/, '');
    const full = normalize(join(ROOT, path));
    if (!full.startsWith(ROOT + sep) || !existsSync(full)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(readFileSync(full));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'vibeflow-cli-'));
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

function runCli(workspace, args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [workspace.cliPath, ...args], {
      cwd: workspace.project,
      env: hermeticEnv(workspace.root, extraEnv),
    });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, out });
    });
  });
}

function writeIn(project, path, body) {
  mkdirSync(dirname(join(project, path)), { recursive: true });
  writeFileSync(join(project, path), body);
}

// Runs `--copilot --force` over `before`, with the files in `present` already in the project.
async function reinstallCopilot(before, present) {
  const server = await startServer();
  const workspace = makeWorkspace();
  try {
    for (const path of present) writeIn(workspace.project, path, 'installed earlier\n');
    writeFileSync(join(workspace.project, '.gitignore'), before);
    const result = await runCli(workspace, ['--copilot', '--force'], { [BASE_ENV]: server.url });
    assert.equal(result.status, 0, result.out);
    return { after: readFileSync(join(workspace.project, '.gitignore'), 'utf8'), out: result.out };
  } finally {
    workspace.cleanup();
    await server.close();
  }
}

test('[144] Copilot installed, its three first-release lines taken out of the block: --copilot --force leaves .gitignore byte for byte', async () => {
  const before = ['node_modules/', '', MARKER, SHARED, '.github/vibeflow/', '', '# mine', '.env', ''].join('\n');
  const { after, out } = await reinstallCopilot(before, [MARKER_FILE.copilot]);
  assert.equal(after, before);
  assert.match(out, /\.gitignore.*already/);
});

test('Copilot installed over a block with only Cursor lines: --copilot --force gives none of its first-release lines back, only the missing since line', async () => {
  const block = [MARKER, ...CARVE_OUT, ...FIRST.cursor];
  const before = [...block, '', '.env', ''].join('\n');
  const { after } = await reinstallCopilot(before, [MARKER_FILE.copilot]);
  assert.equal(after, [...block, ...SINCE.copilot, '', '.env', ''].join('\n'));
});

test('Copilot with only its legacy marker, over a block without its lines: --copilot --force adds all of them', async () => {
  const block = [MARKER, SHARED, ...FIRST.cursor];
  const before = [...block, '', '.env', ''].join('\n');
  const { after } = await reinstallCopilot(before, [LEGACY_MARKER_FILE.copilot]);
  assert.equal(after, [...block, ...OWN.copilot, '', '.env', ''].join('\n'));
});
