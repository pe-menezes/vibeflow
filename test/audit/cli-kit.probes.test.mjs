// Behavior probes from independent audits of the CLI's loop kit install for Cursor and Copilot:
// the kit files, the install manifest, the .gitignore block, and the kit path each edition names.
// Each case states, as comments, the contract it protects, the plausible regression that breaks
// it, and why the implementer's tests did not catch it. A case marked `todo` asserts what a known
// open gap asks for: it runs and prints without failing the suite.
// No network: the CLI talks to a local node:http server that serves this repository's files.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOOP_DIR, hermeticEnv } from '../loop-helpers.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const KIT_URL_PATH = 'plugins/vibeflow/skills/implement/loop';
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const kit = (name) => readFileSync(join(LOOP_DIR, name), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');

// ---- a local server, a scratch copy of the CLI, and a run

async function startServer(overrides = {}) {
  const requests = [];
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/+/, '');
    requests.push(path);
    if (path in overrides) {
      res.writeHead(200);
      res.end(overrides[path]);
      return;
    }
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
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

// a server that answers `status` for the listed paths and serves the repository otherwise
async function startStatusServer(statusByPath) {
  const requests = [];
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/+/, '');
    requests.push(path);
    if (path in statusByPath) {
      res.writeHead(statusByPath[path]);
      res.end('nope');
      return;
    }
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
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'vibeflow-probe-cli-'));
  const cli = join(root, 'cli');
  const fakeColors = join(cli, 'node_modules/picocolors');
  mkdirSync(fakeColors, { recursive: true });
  copyFileSync(join(ROOT, 'cli/index.js'), join(cli, 'index.js'));
  writeFileSync(join(cli, 'package.json'), JSON.stringify({ type: 'module' }));
  writeFileSync(join(fakeColors, 'package.json'), JSON.stringify({ name: 'picocolors', main: 'index.js' }));
  writeFileSync(join(fakeColors, 'index.js'), 'module.exports = new Proxy({}, { get: () => (s) => String(s) });\n');
  const project = join(root, 'project');
  mkdirSync(project);
  return { root, project, cliPath: join(cli, 'index.js'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function runCli(workspace, args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [workspace.cliPath, ...args], { cwd: workspace.project, env: hermeticEnv(workspace.root, extraEnv) });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, out }); });
  });
}

const KIT_FILE = 'scripts/loop-stats.mjs';
const KIT_SOURCE = () => readFileSync(join(LOOP_DIR, KIT_FILE), 'utf8');

// ---- the kit files

// Contract: an existing install without --force writes nothing and fetches no kit file.
// Breaks when: the kit download moves above the installed check.
// Not covered by: test/cli-kit.test.mjs, where no install starts from an installed project.
test('install: an existing install without --force writes nothing and fetches no kit file', async () => {
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    mkdirSync(join(ws.project, '.cursor/rules'), { recursive: true });
    writeFileSync(join(ws.project, '.cursor/rules/vibeflow.mdc'), 'old install\n');
    const result = await runCli(ws, ['--cursor'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(result.status, 0, result.out);
    assert.match(result.out, /already installed/i);
    assert.deepEqual(readdirSync(ws.project), ['.cursor']);
    assert.ok(!existsSync(join(ws.project, '.cursor/skills')));
    assert.ok(server.requests.every((path) => !path.startsWith(KIT_URL_PATH)), server.requests.join('\n'));
  } finally {
    ws.cleanup();
    await server.close();
  }
});

for (const [edition, kitDest, marker] of [
  ['cursor', '.cursor/skills/vibeflow-implement/loop', '.cursor/rules/vibeflow.mdc'],
  ['copilot', '.github/vibeflow/loop', '.github/prompts/vibeflow-analyze.prompt.md'],
]) {
  // Contract: --force replaces a stale kit file and leaves the user's own files, also with a trailing slash on the base.
  // Breaks when: the --force path skips kit files.
  // Not covered by: test/cli-kit.test.mjs, where every install starts from an empty project.
  test(`kit: --${edition} --force over an older install replaces a stale kit file and keeps the user's own files`, async () => {
    const server = await startServer();
    const ws = makeWorkspace();
    try {
      mkdirSync(join(ws.project, dirname(marker)), { recursive: true });
      writeFileSync(join(ws.project, marker), 'old install\n');
      mkdirSync(join(ws.project, kitDest, 'scripts'), { recursive: true });
      writeFileSync(join(ws.project, kitDest, KIT_FILE), 'stale\n');
      writeFileSync(join(ws.project, kitDest, 'my-notes.md'), 'mine\n');
      writeFileSync(join(ws.project, 'keep.txt'), 'user file\n');
      // a trailing slash on the base is tolerated
      const result = await runCli(ws, [`--${edition}`, '--force'], { VIBEFLOW_BASE_URL: `${server.url}/` });
      assert.equal(result.status, 0, result.out);
      assert.equal(readFileSync(join(ws.project, kitDest, KIT_FILE), 'utf8'), KIT_SOURCE());
      assert.equal(readFileSync(join(ws.project, kitDest, 'my-notes.md'), 'utf8'), 'mine\n');
      assert.equal(readFileSync(join(ws.project, 'keep.txt'), 'utf8'), 'user file\n');
    } finally {
      ws.cleanup();
      await server.close();
    }
  });
}

// Contract: without --force and without the install marker, an existing kit file is kept and the rest of the kit is installed.
// Breaks when: a kit write ignores the skip-existing check.
// Not covered by: test/cli-kit.test.mjs, where every install starts from an empty project.
test('kit: without --force and without the install marker, an existing kit file is kept and the rest of the kit is installed', async () => {
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    const kitDest = '.github/vibeflow/loop';
    mkdirSync(join(ws.project, kitDest, 'scripts'), { recursive: true });
    writeFileSync(join(ws.project, kitDest, KIT_FILE), 'user edited\n');
    const result = await runCli(ws, ['--copilot'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(result.status, 0, result.out);
    assert.equal(readFileSync(join(ws.project, kitDest, KIT_FILE), 'utf8'), 'user edited\n');
    assert.equal(readFileSync(join(ws.project, kitDest, 'README.md'), 'utf8'), readFileSync(join(LOOP_DIR, 'README.md'), 'utf8'));
  } finally {
    ws.cleanup();
    await server.close();
  }
});

// ---- the install manifest

// Contract: hidden-segment, backslash, double-slash and non-string manifest entries are refused before any write.
// Breaks when: a looser path pattern admits "\" (a "..\..\x" entry escapes the kit folder on Windows).
// Not covered by: test/cli-kit.test.mjs, whose hostile list has "../", an absolute path, "scripts/../" and an empty entry only.
test('manifest: an entry that is a hidden segment or a backslash path is refused before anything is written', async () => {
  for (const bad of ['.git/hooks/pre-commit', 'scripts\\..\\..\\x.txt', 'scripts//x.mjs', 42]) {
    const server = await startServer({ [`${KIT_URL_PATH}/manifest.json`]: JSON.stringify({ files: ['README.md', bad] }) });
    const ws = makeWorkspace();
    try {
      const result = await runCli(ws, ['--copilot'], { VIBEFLOW_BASE_URL: server.url });
      assert.notEqual(result.status, 0, `${JSON.stringify(bad)} accepted\n${result.out}`);
      assert.deepEqual(readdirSync(ws.project), [], `${JSON.stringify(bad)}: the project was written to`);
    } finally {
      ws.cleanup();
      await server.close();
    }
  }
});

for (const status of [500, 403]) {
  // Contract: a manifest error other than 404 ("no kit here") aborts the install before anything is written.
  // Breaks when: any manifest error is read as "no kit" and the edition is installed without it.
  // Not covered by: test/cli-kit.test.mjs tests a 404 and a malformed manifest only.
  test(`manifest: a manifest that answers ${status} (not "no kit here") aborts before anything is written`, async () => {
    const server = await startStatusServer({ [`${KIT_URL_PATH}/manifest.json`]: status });
    const ws = makeWorkspace();
    try {
      for (const edition of ['copilot', 'cursor']) {
        const result = await runCli(ws, [`--${edition}`], { VIBEFLOW_BASE_URL: server.url });
        assert.notEqual(result.status, 0, result.out);
        assert.match(result.out, new RegExp(String(status)));
        assert.deepEqual(readdirSync(ws.project), [], `${edition}: the project was written to`);
      }
    } finally {
      ws.cleanup();
      await server.close();
    }
  });
}

// Contract: a base that serves nothing at all makes the install fail with nothing written.
// Breaks when: the install continues past the manifest and writes a partial install.
// Not covered by: test/cli-kit.test.mjs has no case with a wrong base.
test('manifest: a base that has nothing at all (wrong VIBEFLOW_BASE_URL) still fails and writes nothing', async () => {
  const server = await startStatusServer({});
  const ws = makeWorkspace();
  try {
    const result = await runCli(ws, ['--copilot'], { VIBEFLOW_BASE_URL: `${server.url}/no/such/base` });
    assert.notEqual(result.status, 0, result.out);
    assert.deepEqual(readdirSync(ws.project), []);
  } finally {
    ws.cleanup();
    await server.close();
  }
});

// Contract: --force with a 404 manifest leaves an installed kit as it is and still updates the edition.
// Breaks when: the kit is wiped or overwritten when the manifest is missing.
// Not covered by: test/cli-kit.test.mjs, whose 404 case starts from an empty project.
test('manifest: --force with a manifest 404 over an install that has the kit leaves the kit files as they are', async () => {
  const server = await startStatusServer({ [`${KIT_URL_PATH}/manifest.json`]: 404 });
  const ws = makeWorkspace();
  try {
    const kitDest = '.github/vibeflow/loop';
    mkdirSync(join(ws.project, kitDest, 'scripts'), { recursive: true });
    writeFileSync(join(ws.project, kitDest, KIT_FILE), 'installed kit\n');
    mkdirSync(join(ws.project, '.github/prompts'), { recursive: true });
    writeFileSync(join(ws.project, '.github/prompts/vibeflow-analyze.prompt.md'), 'old\n');
    const result = await runCli(ws, ['--copilot', '--force'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(result.status, 0, result.out);
    assert.match(result.out, /404/);
    assert.equal(readFileSync(join(ws.project, kitDest, KIT_FILE), 'utf8'), 'installed kit\n');
    assert.notEqual(readFileSync(join(ws.project, '.github/prompts/vibeflow-analyze.prompt.md'), 'utf8'), 'old\n');
  } finally {
    ws.cleanup();
    await server.close();
  }
});

// ---- the .gitignore block

const BLOCKS = {
  copilot: [
    '# Vibeflow — installed + generated (remove to track in git)',
    '.vibeflow/',
    '.github/prompts/vibeflow-*.prompt.md',
    '.github/agents/vibeflow-architect.agent.md',
    '.github/instructions/vibeflow/',
    '.github/vibeflow/',
  ],
  cursor: [
    '# Vibeflow — installed + generated (remove to track in git)',
    '.vibeflow/',
    '.cursor/rules/vibeflow.mdc',
    '.cursor/rules/vibeflow-architect.mdc',
    '.cursor/skills/vibeflow-*/',
  ],
};

// 0 = ignored, 1 = not ignored; the user's global excludes are kept out
function ignored(project, path) {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', HOME: project };
  const init = spawnSync('git', ['init', '-q'], { cwd: project, env });
  assert.equal(init.status, 0, String(init.stderr));
  const result = spawnSync('git', ['-c', 'core.excludesFile=', 'check-ignore', '-q', path], { cwd: project, env });
  assert.ok(result.status === 0 || result.status === 1, String(result.stderr));
  return result.status === 0;
}

const carve = (lines) => lines.flatMap((line) => (line === '.vibeflow/' ? ['.vibeflow/*', '!.vibeflow/hotfixes/'] : [line]));
const EDITION_PATHS = {
  copilot: ['.github/prompts/vibeflow-x.prompt.md', '.github/agents/vibeflow-architect.agent.md', '.github/instructions/vibeflow/a.md', '.github/vibeflow/loop/README.md'],
  cursor: ['.cursor/rules/vibeflow.mdc', '.cursor/rules/vibeflow-architect.mdc', '.cursor/skills/vibeflow-x/SKILL.md'],
};

// the blocks older installs have in .gitignore, frozen: the first block the CLI ever wrote, and 0.16
const OLD_BLOCKS = {
  'copilot first-release': ['# Vibeflow — installed + generated (remove to track in git)', '.vibeflow/', '.github/prompts/vibeflow-*.prompt.md', '.github/agents/vibeflow-architect.agent.md', '.github/skills/vibeflow-spec-driven-dev/', '.github/instructions/vibeflow/'],
  'copilot 0.16': BLOCKS.copilot.slice(0, 5),
  'cursor 0.16': BLOCKS.cursor,
};

// Contract: the Copilot block keeps the user's own lines and a reinstall does not duplicate it.
// Breaks when: the marker check is dropped, or the file is rebuilt from the block.
// Not covered by: test/cli-kit.test.mjs, whose .gitignore case starts with no file and runs once.
test('.gitignore: the Copilot block keeps the user lines and is not duplicated by a --force reinstall', async () => {
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    writeFileSync(join(ws.project, '.gitignore'), 'node_modules/\n.env\n');
    for (const args of [['--copilot'], ['--copilot', '--force']]) {
      const result = await runCli(ws, args, { VIBEFLOW_BASE_URL: server.url });
      assert.equal(result.status, 0, result.out);
    }
    const text = readFileSync(join(ws.project, '.gitignore'), 'utf8');
    const lines = text.split('\n');
    assert.deepEqual(lines.slice(0, 2), ['node_modules/', '.env']);
    assert.equal(lines.filter((line) => line === '.github/vibeflow/').length, 1, text);
    assert.equal(lines.filter((line) => line.startsWith('# Vibeflow')).length, 1, text);
  } finally {
    ws.cleanup();
    await server.close();
  }
});

for (const edition of ['copilot', 'cursor']) {
  // Contract: the hotfix carve-out the product documents as durable survives a reinstall.
  // Breaks when: a reinstall adds back any block line the file lacks, such as ".vibeflow/".
  // Not covered by: test/cli-kit.test.mjs, where every block is an older subset of the current one, never a block the user edited.
  test(`.gitignore: --${edition} --force keeps the hotfix carve-out the product documents inside the Vibeflow block`, async () => {
    // hotfix SKILL.md and MANUAL.md: "the durable carve-out in the Vibeflow block of .gitignore:
    // switch .vibeflow/ to .vibeflow/* and add !.vibeflow/hotfixes/"
    const server = await startServer();
    const ws = makeWorkspace();
    try {
      const block = BLOCKS[edition].flatMap((line) => (line === '.vibeflow/' ? ['.vibeflow/*', '!.vibeflow/hotfixes/'] : [line]));
      writeFileSync(join(ws.project, '.gitignore'), ['node_modules/', '', ...block, ''].join('\n'));
      assert.equal(ignored(ws.project, '.vibeflow/hotfixes/2026-10-20-bug.md'), false, 'fixture: carve-out not in effect');
      const result = await runCli(ws, [`--${edition}`, '--force'], { VIBEFLOW_BASE_URL: server.url });
      assert.equal(result.status, 0, result.out);
      const text = readFileSync(join(ws.project, '.gitignore'), 'utf8');
      assert.equal(ignored(ws.project, '.vibeflow/hotfixes/2026-10-20-bug.md'), false, `the carve-out was undone by --force:\n${text}`);
      assert.equal(ignored(ws.project, '.vibeflow/specs/x.md'), true, text);
    } finally {
      ws.cleanup();
      await server.close();
    }
  });
}

// Contract: the README's "remove the Vibeflow block to track in git" holds across a reinstall.
// Breaks when: with the marker gone, --force appends the whole block again, which is the current behavior.
// Not covered by: test/cli-kit.test.mjs never removes a block.
test('.gitignore: a --force reinstall respects a block the user removed, as the README says ("remove the Vibeflow block to track in git")', { todo: 'open gap: with the block removed, a --force reinstall appends the whole block again' }, async () => {
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    writeFileSync(join(ws.project, '.gitignore'), 'node_modules/\n');
    for (const args of [['--copilot'], ['--copilot', '--force']]) {
      if (args.length === 2) {
        // the user follows the README and removes the block
        writeFileSync(join(ws.project, '.gitignore'), 'node_modules/\n');
      }
      const result = await runCli(ws, args, { VIBEFLOW_BASE_URL: server.url });
      assert.equal(result.status, 0, result.out);
    }
    assert.equal(ignored(ws.project, '.vibeflow/specs/x.md'), false, readFileSync(join(ws.project, '.gitignore'), 'utf8'));
  } finally {
    ws.cleanup();
    await server.close();
  }
});

// Contract: a 0.16 Copilot block with CRLF lines at the end of a file without a final newline gains the kit path once, every path stays ignored, and a rerun changes nothing.
// Breaks when: a "\r" defeats the presence check or the insertion point.
// Not covered by: test/cli-kit.test.mjs tests LF files only.
test('.gitignore: a 0.16 Copilot block with CRLF lines, at the end of a file without a final newline, gains the kit path once and keeps its own', async () => {
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    const before = ['node_modules/', '', ...BLOCKS.copilot.slice(0, 5)].join('\r\n');
    writeFileSync(join(ws.project, '.gitignore'), before);
    const first = await runCli(ws, ['--copilot', '--force'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(first.status, 0, first.out);
    const after = readFileSync(join(ws.project, '.gitignore'), 'utf8');
    for (const path of ['.github/vibeflow/loop/README.md', '.github/instructions/vibeflow/x.md', 'node_modules/a.js']) {
      assert.equal(ignored(ws.project, path), true, `${path} not ignored: ${JSON.stringify(after)}`);
    }
    assert.equal(after.split(/\r?\n/).map((line) => line.replace(/\r$/, '')).filter((line) => line === '.github/vibeflow/').length, 1, JSON.stringify(after));
    const second = await runCli(ws, ['--copilot', '--force'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(second.status, 0, second.out);
    assert.equal(readFileSync(join(ws.project, '.gitignore'), 'utf8'), after, 'the rerun changed .gitignore');
  } finally {
    ws.cleanup();
    await server.close();
  }
});

// Contract: a CRLF .gitignore keeps one line ending throughout after the kit line goes in.
// Breaks when: the new line is joined with a bare LF and a stray CR is left at the end, which is the current behavior.
// Not covered by: test/cli-kit.test.mjs tests LF files only.
test('.gitignore: the same CRLF file keeps one line ending throughout', { todo: 'open gap: a bare LF goes in before the new line and a stray CR is left at the end of the file' }, async () => {
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    writeFileSync(join(ws.project, '.gitignore'), ['node_modules/', '', ...BLOCKS.copilot.slice(0, 5)].join('\r\n'));
    const result = await runCli(ws, ['--copilot', '--force'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(result.status, 0, result.out);
    const after = readFileSync(join(ws.project, '.gitignore'), 'utf8');
    assert.ok(!/[^\r]\n/.test(after) && !/\r(?!\n)/.test(after), JSON.stringify(after));
  } finally {
    ws.cleanup();
    await server.close();
  }
});

// Contract: with a Cursor block already there, a Copilot install adds its own paths once and keeps every Cursor line; a rerun changes nothing.
// Breaks when: lines are duplicated or dropped across the two editions, which share the marker.
// Not covered by: test/cli-kit.test.mjs puts one edition per file.
test('.gitignore: over a Cursor block, a Copilot install adds its own paths once, keeps every Cursor line, and a rerun changes nothing', async () => {
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    writeFileSync(join(ws.project, '.gitignore'), ['.env', '', ...BLOCKS.cursor, '', '# mine', 'dist/', ''].join('\n'));
    const first = await runCli(ws, ['--copilot', '--force'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(first.status, 0, first.out);
    const after = readFileSync(join(ws.project, '.gitignore'), 'utf8');
    const lines = after.split('\n');
    for (const line of [...BLOCKS.cursor, ...BLOCKS.copilot, '.env', '# mine', 'dist/']) {
      assert.equal(lines.filter((l) => l === line).length, 1, `${line}\n${after}`);
    }
    const second = await runCli(ws, ['--copilot', '--force'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(second.status, 0, second.out);
    assert.equal(readFileSync(join(ws.project, '.gitignore'), 'utf8'), after);
  } finally {
    ws.cleanup();
    await server.close();
  }
});

// Contract: a CRLF .gitignore with the 0.16 block in the middle gains the kit line with CRLF, between the block and the user's lines.
// Breaks when: the inserted line always ends in LF.
// Not covered by: test/cli-kit.test.mjs tests LF files only, though CRLF is meant to be preserved.
test('.gitignore: a CRLF file with the 0.16 block in the middle gains the kit line with CRLF, between the block and the user lines', async () => {
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    const before = ['node_modules/', '', ...BLOCKS.copilot.slice(0, 5), '', '.env', ''];
    writeFileSync(join(ws.project, '.gitignore'), before.join('\r\n'));
    const result = await runCli(ws, ['--copilot', '--force'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(result.status, 0, result.out);
    const expected = [...before.slice(0, 7), '.github/vibeflow/', ...before.slice(7)].join('\r\n');
    assert.equal(readFileSync(join(ws.project, '.gitignore'), 'utf8'), expected);
  } finally {
    ws.cleanup();
    await server.close();
  }
});

for (const [first, second] of [['copilot', 'cursor'], ['cursor', 'copilot']]) {
  // Contract: the documented carve-out survives reinstalls even when the two editions share the marker.
  // Breaks when: the lines a reinstall may add include the shared ".vibeflow/", or the other-edition case is dropped.
  // Not covered by: test/cli-kit.test.mjs covers Copilot over Cursor in a single step only, never Cursor over a Copilot carve-out or the two in turns.
  test(`.gitignore: a ${first} block with the hotfix carve-out, then --${second} and --${first} --force in turns: the carve-out holds, both editions end up ignored, reruns change nothing`, async () => {
    const server = await startServer();
    const ws = makeWorkspace();
    try {
      writeFileSync(join(ws.project, '.gitignore'), ['node_modules/', '', ...carve(BLOCKS[first]), '', '.env', ''].join('\n'));
      let text = '';
      let afterFirst = null;
      for (const edition of [second, first, second, first]) {
        const result = await runCli(ws, [`--${edition}`, '--force'], { VIBEFLOW_BASE_URL: server.url });
        assert.equal(result.status, 0, result.out);
        text = readFileSync(join(ws.project, '.gitignore'), 'utf8');
        if (afterFirst === null) afterFirst = text;
        else assert.equal(text, afterFirst, `the rerun of --${edition} changed .gitignore`);
        assert.equal(ignored(ws.project, '.vibeflow/hotfixes/2026-10-20-bug.md'), false, `after --${edition}, the carve-out was undone:\n${text}`);
        assert.equal(ignored(ws.project, '.vibeflow/specs/x.md'), true, text);
        assert.ok(!text.split('\n').includes('.vibeflow/'), `after --${edition}, .vibeflow/ came back:\n${text}`);
      }
      for (const path of [...EDITION_PATHS.copilot, ...EDITION_PATHS.cursor, 'node_modules/a.js', '.env']) {
        assert.equal(ignored(ws.project, path), true, `${path} not ignored:\n${text}`);
      }
      for (const line of new Set([...carve(BLOCKS.copilot), ...carve(BLOCKS.cursor)])) {
        assert.equal(text.split('\n').filter((l) => l === line).length, 1, `${line}\n${text}`);
      }
    } finally {
      ws.cleanup();
      await server.close();
    }
  });
}

for (const [label, old] of Object.entries(OLD_BLOCKS)) {
  // Contract: an upgrade ends up ignoring what a fresh install ignores.
  // Breaks when: a line is added to the CLI's block and not to the list of lines a reinstall adds to an older block.
  // Not covered by: test/cli-kit.test.mjs hard-codes today's single new line in its expected files, so a future block line would pass it unnoticed.
  test(`.gitignore: a ${label} block upgraded by --force ends up with every line a fresh install writes, once, and keeps its own`, async () => {
    const edition = label.split(' ')[0];
    const server = await startServer();
    const fresh = makeWorkspace();
    const ws = makeWorkspace();
    try {
      const install = await runCli(fresh, [`--${edition}`], { VIBEFLOW_BASE_URL: server.url });
      assert.equal(install.status, 0, install.out);
      const freshLines = readFileSync(join(fresh.project, '.gitignore'), 'utf8').split('\n').filter(Boolean);
      writeFileSync(join(ws.project, '.gitignore'), ['node_modules/', '', ...old, '', '.env', ''].join('\n'));
      const result = await runCli(ws, [`--${edition}`, '--force'], { VIBEFLOW_BASE_URL: server.url });
      assert.equal(result.status, 0, result.out);
      const lines = readFileSync(join(ws.project, '.gitignore'), 'utf8').split('\n');
      for (const line of [...freshLines, ...old, 'node_modules/', '.env']) {
        assert.equal(lines.filter((l) => l === line).length, 1, `${line}\n${lines.join('\n')}`);
      }
    } finally {
      fresh.cleanup();
      ws.cleanup();
      await server.close();
    }
  });
}

// ---- the kit path each edition names

const AUDIT_EDITIONS = {
  shared: 'plugins/vibeflow/skills/audit/SKILL.md',
  cursor: 'cursor/skills/vibeflow-audit/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-audit.prompt.md',
};

// The command an edition names for a script, as written between backticks, e.g.
// `node .github/vibeflow/loop/scripts/review-package.mjs <project root> <base> <out>`.
function commandOf(text, script, argsShape) {
  const flatText = text.replace(/\s+/g, ' ');
  const pattern = new RegExp('`node (\\S+?)scripts/' + script.replace('.', '\\.') + ' ' + argsShape.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`');
  const match = pattern.exec(flatText);
  assert.ok(match, `the edition names \`node <kit>scripts/${script} ${argsShape}\``);
  return { kitPrefix: match[1], args: argsShape };
}

const STEP1 = ['review-package.mjs', '<project root> <base> <out>'];
const REAUDIT = ['review-package.mjs', '<project root> <round-commit> <out>'];
const PROBES = ['check-probes.mjs', '<project root> --base <base> --dir <probe dir>'];

// Every `scripts/<name>.mjs ...` command written between backticks in orchestrator.md.
function orchestratorCommands() {
  return [...flat(kit('orchestrator.md')).matchAll(/`scripts\/([a-z-]+\.mjs)([^`]*)`/g)]
    .map((match) => ({ script: match[1], args: match[2].trim(), text: match[0] }));
}

// Contract: the kit path the Cursor and Copilot audit editions name is a kitDest of the CLI, and the shared edition points at the kit beside implement.
// Breaks when: the CLI moves the kit destination, or an edition names another path.
// Not covered by: the audit contract tests copy the kit path as a constant inside the test instead of reading it from the CLI.
test('kit path: the kit path each by-file audit edition names is a path the CLI installs the kit into', () => {
  const cli = read('cli/index.js');
  const installed = new Set([...cli.matchAll(/kitDest:\s*'([^']+)'/g)].map((m) => `${m[1]}/`));
  assert.ok(installed.size >= 2, 'the CLI declares a kit destination per by-file edition');
  for (const name of ['cursor', 'copilot']) {
    const prefixes = new Set([STEP1, REAUDIT, PROBES].map((shape) => commandOf(read(AUDIT_EDITIONS[name]), ...shape).kitPrefix));
    assert.equal(prefixes.size, 1, `${name}: one kit path for every script`);
    const [prefix] = prefixes;
    assert.ok(installed.has(prefix), `${name}: ${prefix} is one of ${[...installed].join(', ')}`);
  }
  const shared = new Set([STEP1, REAUDIT, PROBES].map((shape) => commandOf(read(AUDIT_EDITIONS.shared), ...shape).kitPrefix));
  assert.deepEqual([...shared], ['${CLAUDE_SKILL_DIR}/../implement/loop/'], 'shared: the kit beside the implement skill');
  assert.ok(existsSync(join(LOOP_DIR, '..', '..', 'audit', 'SKILL.md')), 'the shared audit sits two levels above the kit, as ../implement/loop/ assumes');
});

// Contract: each edition's implement Loop mode reads the kit where the CLI installs it (kitDest of cli/index.js), and the manifest installs every file and script the section and orchestrator.md name.
// Breaks when: the CLI moves the kit destination, an edition names another path, or the manifest loses a file.
// Not covered by: the implement contract tests pin the path literal in the edition, not against the CLI.
test('kit path: each edition\'s implement Loop mode reads the kit where it is installed, and the kit holds what it names', () => {
  const cli = read('cli/index.js');
  const dests = Object.fromEntries([...cli.matchAll(/name: '(\w+)',[\s\S]*?kitDest: '([^']+)'/g)].map((match) => [match[1], match[2]]));
  const editions = {
    Cursor: 'cursor/skills/vibeflow-implement/SKILL.md',
    Copilot: 'copilot/github/prompts/vibeflow-implement.prompt.md',
  };
  for (const [name, path] of Object.entries(editions)) {
    assert.ok(dests[name], `cli/index.js has a kitDest for ${name}`);
    const section = flat(read(path).split('## Phase 0')[0]);
    assert.ok(section.includes(`\`${dests[name]}/\``), `${name}'s Loop mode reads the kit at ${dests[name]}/, where the CLI installs it`);
  }
  const shared = read('plugins/vibeflow/skills/implement/SKILL.md');
  assert.ok(shared.includes('${CLAUDE_SKILL_DIR}/loop/'), 'shared edition names the kit next to its SKILL.md');
  const manifest = JSON.parse(kit('manifest.json')).files;
  for (const file of ['orchestrator.md', 'briefings.md', 'principles.md', 'roles/executor.md', 'roles/auditor.md']) {
    assert.ok(manifest.includes(file), `the manifest installs ${file}`);
    assert.ok(existsSync(join(LOOP_DIR, file)), `${file} is in the kit`);
  }
  for (const { script } of orchestratorCommands()) assert.ok(manifest.includes(`scripts/${script}`), `the manifest installs scripts/${script}`);
});

// ---- the version line of the install log

function withPackageJson(workspace, pkg) {
  writeFileSync(join(dirname(workspace.cliPath), 'package.json'), JSON.stringify(pkg));
}

const firstLine = (out) => out.split('\n').find((line) => line.trim() !== '') ?? '';

// Contract: whoever reruns an older cached CLI over a project that already has Vibeflow sees which CLI version ran, before the "already installed" stop.
// Breaks when: the version line moves below the installed check, so the run that stops early never names its version.
// Not covered by: test/cli-kit.test.mjs checks the version line only on fresh installs that go all the way.
test('version: the install log opens with setup-vibeflow and its version also when the run stops at an existing install', async () => {
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    const version = '1.2.3';
    withPackageJson(ws, { type: 'module', version });
    mkdirSync(join(ws.project, '.cursor/rules'), { recursive: true });
    writeFileSync(join(ws.project, '.cursor/rules/vibeflow.mdc'), 'installed\n');
    const result = await runCli(ws, ['--cursor'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(result.status, 0, result.out);
    assert.match(result.out, /already installed/i, result.out);
    assert.equal(firstLine(result.out).trim(), `setup-vibeflow ${version}`, result.out);
  } finally {
    ws.cleanup();
    await server.close();
  }
});

// Contract: reading its own version never stops the installer; a package.json without a version installs as usual and names the version "unknown".
// Breaks when: the fallback goes, and the log reads "setup-vibeflow undefined" or the CLI fails at start.
// Not covered by: test/cli-kit.test.mjs always copies the real cli/package.json, which has a version.
test('version: a CLI whose package.json has no version still installs, and the log names the version unknown', async () => {
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    withPackageJson(ws, { type: 'module' });
    const result = await runCli(ws, ['--copilot'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(result.status, 0, result.out);
    assert.equal(firstLine(result.out).trim(), 'setup-vibeflow unknown', result.out);
    assert.ok(existsSync(join(ws.project, '.github/vibeflow/loop', KIT_FILE)), result.out);
  } finally {
    ws.cleanup();
    await server.close();
  }
});
