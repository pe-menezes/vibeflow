// The CLI installs the loop kit for Cursor and Copilot, driven by loop/manifest.json.
// No network: a local node:http server serves this repository's own files, and the CLI
// reaches it through its base-URL override. The CLI runs from a scratch copy beside a
// stand-in `picocolors` (the CI installs no package), so the code under test is the real
// cli/index.js, byte for byte.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOOP_DIR, hermeticEnv } from './loop-helpers.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const KIT_URL_PATH = 'plugins/vibeflow/skills/implement/loop';
const BASE_ENV = 'VIBEFLOW_BASE_URL';

const KIT_DEST = {
  cursor: '.cursor/skills/vibeflow-implement/loop',
  copilot: '.github/vibeflow/loop',
};

function manifestFiles() {
  const manifest = JSON.parse(readFileSync(join(LOOP_DIR, 'manifest.json'), 'utf8'));
  assert.ok(Array.isArray(manifest.files), 'manifest.json has a "files" array');
  return manifest.files;
}

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.name !== '.DS_Store') out.push(relative(base, full).split(sep).join('/'));
  }
  return out;
}

// Serves the repository; `overrides` maps a URL path to a body served instead, and a path
// in `missing` answers 404 as if the base did not have it.
async function startServer(overrides = {}, missing = []) {
  const requests = [];
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/+/, '');
    requests.push(path);
    if (missing.includes(path)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    if (path in overrides) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(overrides[path]);
      return;
    }
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
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'vibeflow-cli-'));
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

test('manifest.json lists exactly the files in the kit folder', () => {
  const listed = manifestFiles();
  assert.equal(new Set(listed).size, listed.length, 'no duplicates');
  const present = walk(LOOP_DIR).filter((path) => path !== 'manifest.json').sort();
  assert.deepEqual([...listed].sort(), present);
});

for (const edition of ['cursor', 'copilot']) {
  test(`--${edition} installs every manifest file into ${KIT_DEST[edition]} from the plugin path`, async () => {
    const server = await startServer();
    const workspace = makeWorkspace();
    try {
      const result = await runCli(workspace, [`--${edition}`], { [BASE_ENV]: server.url });
      assert.equal(result.status, 0, result.out);
      for (const file of manifestFiles()) {
        const installed = join(workspace.project, KIT_DEST[edition], file);
        assert.ok(existsSync(installed), `${edition}: ${file} missing\n${result.out}`);
        assert.equal(readFileSync(installed, 'utf8'), readFileSync(join(LOOP_DIR, file), 'utf8'), `${edition}: ${file} differs`);
        assert.ok(server.requests.includes(`${KIT_URL_PATH}/${file}`), `${edition}: ${file} not fetched from the plugin path`);
      }
      assert.ok(server.requests.includes(`${KIT_URL_PATH}/manifest.json`));
      assert.ok(server.requests.includes(`${edition}/AGENTS.md`), 'the edition files come from the same base');
      // the kit lands only under its folder: nothing else of the kit elsewhere in the project
      const kitFiles = walk(workspace.project).filter((path) => path.includes('/loop/'));
      assert.ok(kitFiles.every((path) => path.startsWith(`${KIT_DEST[edition]}/`)), kitFiles.join('\n'));
    } finally {
      workspace.cleanup();
      await server.close();
    }
  });
}

test('the gitignore blocks cover the installed kit: Copilot gains .github/vibeflow/, Cursor keeps .cursor/skills/vibeflow-*/', async () => {
  const server = await startServer();
  try {
    for (const [edition, line] of [['copilot', '.github/vibeflow/'], ['cursor', '.cursor/skills/vibeflow-*/']]) {
      const workspace = makeWorkspace();
      try {
        const result = await runCli(workspace, [`--${edition}`], { [BASE_ENV]: server.url });
        assert.equal(result.status, 0, result.out);
        const lines = readFileSync(join(workspace.project, '.gitignore'), 'utf8').split('\n');
        assert.ok(lines.includes(line), `${edition}: .gitignore lacks ${line}\n${lines.join('\n')}`);
      } finally {
        workspace.cleanup();
      }
    }
  } finally {
    await server.close();
  }
});

test('a manifest entry that leaves the kit folder is refused before anything is written', async () => {
  for (const bad of ['../../../../../escape.txt', '/tmp/vibeflow-escape.txt', 'scripts/../../../x.txt', '']) {
    const server = await startServer({ [`${KIT_URL_PATH}/manifest.json`]: JSON.stringify({ files: ['README.md', bad] }) });
    const workspace = makeWorkspace();
    try {
      const result = await runCli(workspace, ['--cursor'], { [BASE_ENV]: server.url });
      assert.notEqual(result.status, 0, `${JSON.stringify(bad)} accepted\n${result.out}`);
      assert.match(result.out, /manifest/i);
      assert.deepEqual(readdirSync(workspace.project), [], `${JSON.stringify(bad)}: the project was written to`);
      assert.ok(!existsSync(join(workspace.root, 'escape.txt')));
    } finally {
      workspace.cleanup();
      await server.close();
    }
  }
});

test('Claude and Codex still print plugin instructions and download nothing', async () => {
  const server = await startServer();
  try {
    for (const edition of ['claude', 'codex']) {
      const workspace = makeWorkspace();
      try {
        const result = await runCli(workspace, [`--${edition}`], { [BASE_ENV]: server.url });
        assert.equal(result.status, 0, result.out);
        assert.match(result.out, /plugin marketplace add pe-menezes\/vibeflow/);
        assert.deepEqual(readdirSync(workspace.project), []);
      } finally {
        workspace.cleanup();
      }
    }
    assert.deepEqual(server.requests, []);
  } finally {
    await server.close();
  }
});

test('--help documents the base-URL override', async () => {
  const workspace = makeWorkspace();
  try {
    const result = await runCli(workspace, ['--help']);
    assert.equal(result.status, 0, result.out);
    assert.match(result.out, new RegExp(BASE_ENV));
  } finally {
    workspace.cleanup();
  }
});

test('cli/package.json is 0.17.0 with no new dependency, and the lockfile agrees', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'cli/package.json'), 'utf8'));
  assert.equal(pkg.version, '0.17.0');
  assert.deepEqual(pkg.dependencies, { picocolors: '^1.1.0' });
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.optionalDependencies, undefined);
  assert.equal(pkg.peerDependencies, undefined);
  const lock = JSON.parse(readFileSync(join(ROOT, 'cli/package-lock.json'), 'utf8'));
  assert.equal(lock.version, '0.17.0');
  assert.equal(lock.packages[''].version, '0.17.0');
  assert.deepEqual(lock.packages[''].dependencies, { picocolors: '^1.1.0' });
});

// Fix round 1 of the part 6a audit (F2, F6).

test('a 0.16 Copilot .gitignore block gains only the missing kit line, right after the block, and a rerun changes nothing', async () => {
  const server = await startServer();
  const workspace = makeWorkspace();
  try {
    const before = [
      'node_modules/',
      '',
      '# Vibeflow — installed + generated (remove to track in git)',
      '.vibeflow/',
      '.github/prompts/vibeflow-*.prompt.md',
      '.github/agents/vibeflow-architect.agent.md',
      '.github/instructions/vibeflow/',
      '',
      '# mine',
      '.env',
      '',
    ];
    writeFileSync(join(workspace.project, '.gitignore'), before.join('\n'));
    const first = await runCli(workspace, ['--copilot', '--force'], { [BASE_ENV]: server.url });
    assert.equal(first.status, 0, first.out);
    const after = readFileSync(join(workspace.project, '.gitignore'), 'utf8');
    const expected = [...before.slice(0, 7), '.github/vibeflow/', ...before.slice(7)].join('\n');
    assert.equal(after, expected);

    const second = await runCli(workspace, ['--copilot', '--force'], { [BASE_ENV]: server.url });
    assert.equal(second.status, 0, second.out);
    assert.equal(readFileSync(join(workspace.project, '.gitignore'), 'utf8'), expected, 'the rerun changed .gitignore');
    assert.match(second.out, /\.gitignore.*already/);
  } finally {
    workspace.cleanup();
    await server.close();
  }
});

test('a block line the user already has elsewhere in .gitignore is not added twice', async () => {
  const server = await startServer();
  const workspace = makeWorkspace();
  try {
    const before = [
      '.github/vibeflow/',
      '# Vibeflow — installed + generated (remove to track in git)',
      '.vibeflow/',
      '.github/prompts/vibeflow-*.prompt.md',
      '',
    ].join('\n');
    writeFileSync(join(workspace.project, '.gitignore'), before);
    const result = await runCli(workspace, ['--copilot', '--force'], { [BASE_ENV]: server.url });
    assert.equal(result.status, 0, result.out);
    assert.equal(
      readFileSync(join(workspace.project, '.gitignore'), 'utf8'),
      [
        '.github/vibeflow/',
        '# Vibeflow — installed + generated (remove to track in git)',
        '.vibeflow/',
        '.github/prompts/vibeflow-*.prompt.md',
        '.github/agents/vibeflow-architect.agent.md',
        '.github/instructions/vibeflow/',
        '',
      ].join('\n'),
    );
  } finally {
    workspace.cleanup();
    await server.close();
  }
});

for (const edition of ['cursor', 'copilot']) {
  test(`--${edition}: a base without the kit manifest (404) installs the edition without the kit and says why`, async () => {
    const server = await startServer({}, [`${KIT_URL_PATH}/manifest.json`]);
    const workspace = makeWorkspace();
    try {
      const result = await runCli(workspace, [`--${edition}`], { [BASE_ENV]: server.url });
      assert.equal(result.status, 0, result.out);
      assert.match(result.out, /loop kit/i);
      assert.match(result.out, /404/);
      assert.ok(existsSync(join(workspace.project, 'AGENTS.md')), result.out);
      const marker = edition === 'cursor' ? '.cursor/rules/vibeflow.mdc' : '.github/prompts/vibeflow-analyze.prompt.md';
      assert.ok(existsSync(join(workspace.project, marker)), result.out);
      assert.ok(!existsSync(join(workspace.project, KIT_DEST[edition])), 'no kit folder without a manifest');
      assert.deepEqual(server.requests.filter((path) => path.startsWith(`${KIT_URL_PATH}/`)), [`${KIT_URL_PATH}/manifest.json`]);
    } finally {
      workspace.cleanup();
      await server.close();
    }
  });
}

test('a manifest that is present but malformed still aborts before anything is written', async () => {
  for (const body of ['{ not json', JSON.stringify({ files: [] }), JSON.stringify({ nothing: true })]) {
    const server = await startServer({ [`${KIT_URL_PATH}/manifest.json`]: body });
    const workspace = makeWorkspace();
    try {
      const result = await runCli(workspace, ['--copilot'], { [BASE_ENV]: server.url });
      assert.notEqual(result.status, 0, `${body} accepted\n${result.out}`);
      assert.match(result.out, /manifest/i);
      assert.deepEqual(readdirSync(workspace.project), [], `${body}: the project was written to`);
    } finally {
      workspace.cleanup();
      await server.close();
    }
  }
});
