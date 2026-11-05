// The CLI installs the loop kit for Cursor, Copilot and OpenCode, driven by loop/manifest.json.
// No network: a local node:http server serves this repository's own files, and the CLI
// reaches it through its base-URL override. The CLI runs from a scratch copy beside a
// stand-in `picocolors` (the CI installs no package), so the code under test is the real
// cli/index.js, byte for byte.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  opencode: '.opencode/skills/implement/loop',
};

const MARKER = {
  cursor: '.cursor/rules/vibeflow.mdc',
  copilot: '.github/prompts/vibeflow-analyze.prompt.md',
  opencode: '.opencode/commands/vibeflow-analyze.md',
};

const WORKFLOWS = ['analyze', 'audit', 'discover', 'gen-spec', 'hotfix', 'implement', 'prompt-pack', 'quick', 'stats', 'teach'];
const OPENCODE_AGENTS = ['architect', 'executor', 'auditor'];

// What a fresh OpenCode install writes in .gitignore: the edition's own files, one line each,
// so the user's own agents, commands and skills in .opencode/ stay tracked.
const BLOCK_OPENCODE = [
  '# Vibeflow — installed + generated (remove to track in git)',
  '.vibeflow/',
  ...OPENCODE_AGENTS.map((name) => `.opencode/agents/${name}.md`),
  '.opencode/commands/vibeflow-*.md',
  ...WORKFLOWS.map((name) => `.opencode/skills/${name}/`),
];

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

test('manifest.json lists exactly the files in the kit folder', () => {
  const listed = manifestFiles();
  assert.equal(new Set(listed).size, listed.length, 'no duplicates');
  const present = walk(LOOP_DIR).filter((path) => path !== 'manifest.json').sort();
  assert.deepEqual([...listed].sort(), present);
});

for (const edition of ['cursor', 'copilot', 'opencode']) {
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

test('--opencode installs the three agents, the ten commands and the ten shared skills, each from its source', async () => {
  const server = await startServer();
  const workspace = makeWorkspace();
  try {
    const result = await runCli(workspace, ['--opencode'], { [BASE_ENV]: server.url });
    assert.equal(result.status, 0, result.out);
    const expected = [
      ...OPENCODE_AGENTS.map((name) => [`.opencode/agents/${name}.md`, `opencode/agents/${name}.md`]),
      ...WORKFLOWS.map((name) => [`.opencode/commands/vibeflow-${name}.md`, `opencode/commands/vibeflow-${name}.md`]),
      ...WORKFLOWS.map((name) => [`.opencode/skills/${name}/SKILL.md`, `plugins/vibeflow/skills/${name}/SKILL.md`]),
    ];
    for (const [dest, src] of expected) {
      const installed = join(workspace.project, dest);
      assert.ok(existsSync(installed), `${dest} missing\n${result.out}`);
      assert.equal(readFileSync(installed, 'utf8'), readFileSync(join(ROOT, src), 'utf8'), `${dest} differs from ${src}`);
      assert.ok(server.requests.includes(src), `${dest} not fetched from ${src}`);
    }
    // nothing else of the edition: .opencode/ holds those files and the kit, and the project root
    // holds AGENTS.md and .gitignore beside it
    const kit = manifestFiles().map((file) => `${KIT_DEST.opencode}/${file}`);
    assert.deepEqual(walk(join(workspace.project, '.opencode')).map((path) => `.opencode/${path}`).sort(), [...expected.map(([dest]) => dest), ...kit].sort());
    assert.deepEqual(readdirSync(workspace.project).sort(), ['.gitignore', '.opencode', 'AGENTS.md']);
    assert.ok(server.requests.includes('opencode/AGENTS.md'), result.out);
    const agents = readFileSync(join(workspace.project, 'AGENTS.md'), 'utf8');
    assert.ok(agents.includes('<!-- vibeflow:start -->') && agents.includes('<!-- vibeflow:end -->'), agents);
    assert.match(agents, /\/vibeflow-analyze/);
    assert.match(result.out, /\/vibeflow-analyze/, 'the done message names the first command');
  } finally {
    workspace.cleanup();
    await server.close();
  }
});

test('--opencode over an existing install without --force writes nothing, and with --force keeps the user\'s own .opencode files', async () => {
  const server = await startServer();
  const workspace = makeWorkspace();
  try {
    const first = await runCli(workspace, ['--opencode'], { [BASE_ENV]: server.url });
    assert.equal(first.status, 0, first.out);
    const mine = {
      '.opencode/agents/mine.md': 'my agent\n',
      '.opencode/commands/mine.md': 'my command\n',
      '.opencode/skills/mine/SKILL.md': 'my skill\n',
      'opencode.json': '{}\n',
    };
    for (const [path, body] of Object.entries(mine)) {
      mkdirSync(dirname(join(workspace.project, path)), { recursive: true });
      writeFileSync(join(workspace.project, path), body);
    }
    writeFileSync(join(workspace.project, '.opencode/skills/audit/SKILL.md'), 'stale\n');
    const requestsBefore = server.requests.length;
    const again = await runCli(workspace, ['--opencode'], { [BASE_ENV]: server.url });
    assert.equal(again.status, 0, again.out);
    assert.match(again.out, /already installed/);
    assert.equal(server.requests.length, requestsBefore, 'a stopped rerun fetches nothing');
    assert.equal(readFileSync(join(workspace.project, '.opencode/skills/audit/SKILL.md'), 'utf8'), 'stale\n');

    const forced = await runCli(workspace, ['--opencode', '--force'], { [BASE_ENV]: server.url });
    assert.equal(forced.status, 0, forced.out);
    assert.equal(readFileSync(join(workspace.project, '.opencode/skills/audit/SKILL.md'), 'utf8'), readFileSync(join(ROOT, 'plugins/vibeflow/skills/audit/SKILL.md'), 'utf8'));
    for (const [path, body] of Object.entries(mine)) assert.equal(readFileSync(join(workspace.project, path), 'utf8'), body, path);
  } finally {
    workspace.cleanup();
    await server.close();
  }
});

test('the OpenCode .gitignore block names each installed file or folder and none of the user\'s', async () => {
  const server = await startServer();
  const workspace = makeWorkspace();
  try {
    const result = await runCli(workspace, ['--opencode'], { [BASE_ENV]: server.url });
    assert.equal(result.status, 0, result.out);
    assert.equal(readFileSync(join(workspace.project, '.gitignore'), 'utf8'), BLOCK_OPENCODE.join('\n') + '\n');
  } finally {
    workspace.cleanup();
    await server.close();
  }
});

test('the gitignore blocks cover the installed kit: Copilot gains .github/vibeflow/, Cursor keeps .cursor/skills/vibeflow-*/, OpenCode has .opencode/skills/implement/', async () => {
  const server = await startServer();
  try {
    for (const [edition, line] of [['copilot', '.github/vibeflow/'], ['cursor', '.cursor/skills/vibeflow-*/'], ['opencode', '.opencode/skills/implement/']]) {
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

test('cli/package.json is 0.18.0 with no new dependency, and the lockfile agrees', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'cli/package.json'), 'utf8'));
  assert.equal(pkg.version, '0.18.0');
  assert.deepEqual(pkg.dependencies, { picocolors: '^1.1.0' });
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.optionalDependencies, undefined);
  assert.equal(pkg.peerDependencies, undefined);
  const lock = JSON.parse(readFileSync(join(ROOT, 'cli/package-lock.json'), 'utf8'));
  assert.equal(lock.version, '0.18.0');
  assert.equal(lock.packages[''].version, '0.18.0');
  assert.deepEqual(lock.packages[''].dependencies, { picocolors: '^1.1.0' });
});

// The version on screen: who runs an old CLI sees it, and the prompts name the one they need.

function firstLine(out) {
  return out.split('\n').find((line) => line.trim() !== '') ?? '';
}

test('the install log opens with setup-vibeflow and the version from the package.json beside the CLI', async () => {
  const server = await startServer();
  try {
    const { version } = JSON.parse(readFileSync(join(ROOT, 'cli/package.json'), 'utf8'));
    for (const edition of ['cursor', 'copilot', 'opencode']) {
      const workspace = makeWorkspace();
      try {
        const result = await runCli(workspace, [`--${edition}`], { [BASE_ENV]: server.url });
        assert.equal(result.status, 0, result.out);
        assert.match(firstLine(result.out), new RegExp(`setup-vibeflow ${version.replace(/\./g, '\\.')}(\\s|\\)|$)`), result.out);
      } finally {
        workspace.cleanup();
      }
    }
    // read from the file, not written into the code: another version there shows on screen
    const workspace = makeWorkspace();
    try {
      const pkgPath = join(dirname(workspace.cliPath), 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      writeFileSync(pkgPath, JSON.stringify({ ...pkg, version: '9.8.7' }));
      const result = await runCli(workspace, ['--cursor'], { [BASE_ENV]: server.url });
      assert.equal(result.status, 0, result.out);
      assert.match(firstLine(result.out), /setup-vibeflow 9\.8\.7\b/, result.out);
    } finally {
      workspace.cleanup();
    }
  } finally {
    await server.close();
  }
});

test('the stats command of Cursor and Copilot names setup-vibeflow 0.17.0 or newer wherever it says to install the kit', () => {
  const prompts = {
    cursor: 'cursor/skills/vibeflow-stats/SKILL.md',
    copilot: 'copilot/github/prompts/vibeflow-stats.prompt.md',
  };
  for (const [edition, path] of Object.entries(prompts)) {
    const text = readFileSync(join(ROOT, path), 'utf8').replace(/\s+/g, ' ');
    const command = `\`npx setup-vibeflow@latest --${edition} --force\``;
    const total = text.split(command).length - 1;
    const named = text.split(`${command} (setup-vibeflow 0.17.0 or newer)`).length - 1;
    assert.ok(total >= 1, `${path}: no install sentence`);
    assert.equal(named, total, `${path}: ${total - named} install sentence(s) without the version`);
  }
});

// Upgrading an older .gitignore block, and a base without the kit manifest.

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

test('the kit line the user already has elsewhere in .gitignore is not added twice', async () => {
  const server = await startServer();
  const workspace = makeWorkspace();
  try {
    const before = [
      '.github/vibeflow/',
      '# Vibeflow — installed + generated (remove to track in git)',
      '.vibeflow/',
      '.github/prompts/vibeflow-*.prompt.md',
      '.github/agents/vibeflow-architect.agent.md',
      '.github/instructions/vibeflow/',
      '',
    ].join('\n');
    writeFileSync(join(workspace.project, '.gitignore'), before);
    const result = await runCli(workspace, ['--copilot', '--force'], { [BASE_ENV]: server.url });
    assert.equal(result.status, 0, result.out);
    assert.equal(readFileSync(join(workspace.project, '.gitignore'), 'utf8'), before);
  } finally {
    workspace.cleanup();
    await server.close();
  }
});

for (const edition of ['cursor', 'copilot', 'opencode']) {
  test(`--${edition}: a base without the kit manifest (404) installs the edition without the kit and says why`, async () => {
    const server = await startServer({}, [`${KIT_URL_PATH}/manifest.json`]);
    const workspace = makeWorkspace();
    try {
      const result = await runCli(workspace, [`--${edition}`], { [BASE_ENV]: server.url });
      assert.equal(result.status, 0, result.out);
      assert.match(result.out, /loop kit/i);
      assert.match(result.out, /404/);
      assert.ok(existsSync(join(workspace.project, 'AGENTS.md')), result.out);
      assert.ok(existsSync(join(workspace.project, MARKER[edition])), result.out);
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

// A reinstall adds only the lines that entered the
// block after the version the user has, never a line an older block already had.

const BLOCK_016 = {
  copilot: [
    '# Vibeflow — installed + generated (remove to track in git)',
    '.vibeflow/',
    '.github/prompts/vibeflow-*.prompt.md',
    '.github/agents/vibeflow-architect.agent.md',
    '.github/instructions/vibeflow/',
  ],
  cursor: [
    '# Vibeflow — installed + generated (remove to track in git)',
    '.vibeflow/',
    '.cursor/rules/vibeflow.mdc',
    '.cursor/rules/vibeflow-architect.mdc',
    '.cursor/skills/vibeflow-*/',
  ],
};

const carveOut = (lines) => lines.flatMap((line) => (line === '.vibeflow/' ? ['.vibeflow/*', '!.vibeflow/hotfixes/'] : [line]));

for (const edition of ['copilot', 'cursor', 'opencode']) {
  test(`--${edition} --force over a current block with the hotfix carve-out leaves .gitignore byte for byte`, async () => {
    const server = await startServer();
    const workspace = makeWorkspace();
    try {
      const current = { copilot: [...BLOCK_016.copilot, '.github/vibeflow/'], cursor: BLOCK_016.cursor, opencode: BLOCK_OPENCODE }[edition];
      const before = ['node_modules/', '', ...carveOut(current), '', '.env', ''].join('\n');
      writeFileSync(join(workspace.project, '.gitignore'), before);
      const result = await runCli(workspace, [`--${edition}`, '--force'], { [BASE_ENV]: server.url });
      assert.equal(result.status, 0, result.out);
      assert.equal(readFileSync(join(workspace.project, '.gitignore'), 'utf8'), before);
      assert.match(result.out, /\.gitignore.*already/);
    } finally {
      workspace.cleanup();
      await server.close();
    }
  });
}

test('a 0.16 Copilot block with the carve-out and a line the user deleted gains only .github/vibeflow/', async () => {
  const server = await startServer();
  const workspace = makeWorkspace();
  try {
    const block = carveOut(BLOCK_016.copilot).filter((line) => line !== '.github/agents/vibeflow-architect.agent.md');
    const before = [...block, '', '# mine', 'dist/', ''];
    writeFileSync(join(workspace.project, '.gitignore'), before.join('\n'));
    const result = await runCli(workspace, ['--copilot', '--force'], { [BASE_ENV]: server.url });
    assert.equal(result.status, 0, result.out);
    const expected = [...block, '.github/vibeflow/', ...before.slice(block.length)].join('\n');
    assert.equal(readFileSync(join(workspace.project, '.gitignore'), 'utf8'), expected);
  } finally {
    workspace.cleanup();
    await server.close();
  }
});

test('a Copilot install over a Cursor block with the carve-out adds the Copilot paths and keeps the carve-out', async () => {
  const server = await startServer();
  const workspace = makeWorkspace();
  try {
    const block = carveOut(BLOCK_016.cursor);
    writeFileSync(join(workspace.project, '.gitignore'), [...block, ''].join('\n'));
    const result = await runCli(workspace, ['--copilot', '--force'], { [BASE_ENV]: server.url });
    assert.equal(result.status, 0, result.out);
    const expected = [
      ...block,
      '.github/prompts/vibeflow-*.prompt.md',
      '.github/agents/vibeflow-architect.agent.md',
      '.github/instructions/vibeflow/',
      '.github/vibeflow/',
      '',
    ].join('\n');
    assert.equal(readFileSync(join(workspace.project, '.gitignore'), 'utf8'), expected);
  } finally {
    workspace.cleanup();
    await server.close();
  }
});

// OpenCode over a .gitignore that already has Vibeflow in it: a rerun, a block the user
// trimmed, and the block another edition wrote.

test('an OpenCode install run twice with --force writes its .gitignore block once', async () => {
  const server = await startServer();
  const workspace = makeWorkspace();
  try {
    writeFileSync(join(workspace.project, '.gitignore'), 'node_modules/\n');
    const first = await runCli(workspace, ['--opencode'], { [BASE_ENV]: server.url });
    assert.equal(first.status, 0, first.out);
    const expected = ['node_modules/', ...BLOCK_OPENCODE, ''].join('\n');
    assert.equal(readFileSync(join(workspace.project, '.gitignore'), 'utf8'), expected);
    const second = await runCli(workspace, ['--opencode', '--force'], { [BASE_ENV]: server.url });
    assert.equal(second.status, 0, second.out);
    assert.equal(readFileSync(join(workspace.project, '.gitignore'), 'utf8'), expected, 'the rerun changed .gitignore');
    assert.match(second.out, /\.gitignore.*already/);
  } finally {
    workspace.cleanup();
    await server.close();
  }
});

test('an OpenCode block with the carve-out and a line the user deleted is left as it is by --force', async () => {
  const server = await startServer();
  const workspace = makeWorkspace();
  try {
    const block = carveOut(BLOCK_OPENCODE).filter((line) => line !== '.opencode/skills/teach/');
    const before = [...block, '', '# mine', 'dist/', ''].join('\n');
    writeFileSync(join(workspace.project, '.gitignore'), before);
    const result = await runCli(workspace, ['--opencode', '--force'], { [BASE_ENV]: server.url });
    assert.equal(result.status, 0, result.out);
    assert.equal(readFileSync(join(workspace.project, '.gitignore'), 'utf8'), before);
  } finally {
    workspace.cleanup();
    await server.close();
  }
});

for (const other of ['cursor', 'copilot']) {
  test(`an OpenCode install over a 0.16 ${other} block with the carve-out adds the OpenCode paths after it and keeps the carve-out`, async () => {
    const server = await startServer();
    const workspace = makeWorkspace();
    try {
      const block = carveOut(BLOCK_016[other]);
      writeFileSync(join(workspace.project, '.gitignore'), [...block, '', '.env', ''].join('\n'));
      const result = await runCli(workspace, ['--opencode', '--force'], { [BASE_ENV]: server.url });
      assert.equal(result.status, 0, result.out);
      const expected = [...block, ...BLOCK_OPENCODE.slice(2), '', '.env', ''].join('\n');
      assert.equal(readFileSync(join(workspace.project, '.gitignore'), 'utf8'), expected);
      const again = await runCli(workspace, [`--${other}`, '--force'], { [BASE_ENV]: server.url });
      assert.equal(again.status, 0, again.out);
      const lines = readFileSync(join(workspace.project, '.gitignore'), 'utf8').split('\n');
      for (const line of new Set(lines.filter(Boolean))) assert.equal(lines.filter((l) => l === line).length, 1, `${line}\n${lines.join('\n')}`);
      assert.ok(!lines.includes('.vibeflow/'), 'the carve-out holds');
    } finally {
      workspace.cleanup();
      await server.close();
    }
  });
}

// The AGENTS.md block: each edition's source carries its own delimiters, for whoever copies
// the file by hand, and the CLI writes one block with one pair of them, however often it runs.

for (const edition of ['cursor', 'copilot', 'opencode']) {
  test(`--${edition}: AGENTS.md gets one Vibeflow block with one pair of delimiters, and --force reruns leave it as it is`, async () => {
    const server = await startServer();
    const workspace = makeWorkspace();
    try {
      writeFileSync(join(workspace.project, 'AGENTS.md'), '# My project\n\nRun make test.\n');
      const first = await runCli(workspace, [`--${edition}`], { [BASE_ENV]: server.url });
      assert.equal(first.status, 0, first.out);
      const after = readFileSync(join(workspace.project, 'AGENTS.md'), 'utf8');
      const count = (text, needle) => text.split(needle).length - 1;
      assert.equal(count(after, '<!-- vibeflow:start -->'), 1, after);
      assert.equal(count(after, '<!-- vibeflow:end -->'), 1, after);
      assert.ok(after.startsWith('# My project\n\nRun make test.\n\n<!-- vibeflow:start -->\n## Vibeflow Methodology\n'), after);
      assert.ok(after.endsWith('<!-- vibeflow:end -->\n'), after);
      for (let run = 0; run < 2; run += 1) {
        const again = await runCli(workspace, [`--${edition}`, '--force'], { [BASE_ENV]: server.url });
        assert.equal(again.status, 0, again.out);
        assert.equal(readFileSync(join(workspace.project, 'AGENTS.md'), 'utf8'), after, `rerun ${run + 1} changed AGENTS.md`);
      }
    } finally {
      workspace.cleanup();
      await server.close();
    }
  });
}

test('an AGENTS.md written by an older CLI, with the block wrapped twice, is rewritten to one pair of delimiters', async () => {
  const server = await startServer();
  const workspace = makeWorkspace();
  try {
    const older = '# Mine\n\n<!-- vibeflow:start -->\n<!-- vibeflow:start -->\n## Vibeflow Methodology\n\nold text\n<!-- vibeflow:end -->\n<!-- vibeflow:end -->\n<!-- vibeflow:end -->\n\n## After\n\nkept\n';
    writeFileSync(join(workspace.project, 'AGENTS.md'), older);
    const result = await runCli(workspace, ['--cursor', '--force'], { [BASE_ENV]: server.url });
    assert.equal(result.status, 0, result.out);
    const after = readFileSync(join(workspace.project, 'AGENTS.md'), 'utf8');
    assert.equal(after.split('<!-- vibeflow:start -->').length - 1, 1, after);
    assert.equal(after.split('<!-- vibeflow:end -->').length - 1, 1, after);
    assert.ok(!after.includes('old text'), after);
    assert.ok(after.startsWith('# Mine\n\n<!-- vibeflow:start -->\n## Vibeflow Methodology\n'), after);
    assert.ok(after.endsWith('<!-- vibeflow:end -->\n\n## After\n\nkept\n'), after);
  } finally {
    workspace.cleanup();
    await server.close();
  }
});

// A marker inside a code block is the user's text, never a delimiter: a fence of three or more
// backticks or tildes (indented up to three spaces), closed by the first fence of the same
// character at least as long, or open to the end of the file; and a line indented by four
// spaces or more. The pair search, the two sweeps of extra delimiters and the source's own pair
// all skip such markers, so a user who documents the block's format keeps the example, and the
// real block outside the code still updates on every rerun.

const START = '<!-- vibeflow:start -->';
const END = '<!-- vibeflow:end -->';
const TICKS = '```';
const occurrences = (text, needle) => text.split(needle).length - 1;
const EXAMPLE = (open, close = open) => `${open}\n${START}\nUSER-EXAMPLE\n${END}\n${close}\n`;
const FENCE_STATES = [
  { name: 'a tilde fence', body: `# Mine\n\n${EXAMPLE('~~~')}\nEnd.\n`, kept: [EXAMPLE('~~~')] },
  { name: 'a backtick fence indented by three spaces', body: `# Mine\n\n${EXAMPLE(`   ${TICKS}md`, `   ${TICKS}`)}\nEnd.\n`, kept: [EXAMPLE(`   ${TICKS}md`, `   ${TICKS}`)] },
  { name: 'a block indented by four spaces', body: `# Mine\n\n    ${START}\n    USER-EXAMPLE\n    ${END}\n\nEnd.\n`, kept: [`    ${START}\n    USER-EXAMPLE\n    ${END}\n`] },
  { name: 'a fence never closed', body: `# Mine\n\n${TICKS}\n${START}\nUSER-EXAMPLE\n${END}\n`, kept: [`${TICKS}\n${START}\nUSER-EXAMPLE\n${END}\n`] },
  { name: 'a four-backtick fence that a three-backtick line does not close', body: `# Mine\n\n${TICKS}\`\n${START}\n${TICKS}\nUSER-EXAMPLE\n${END}\n${TICKS}\`\n\nEnd.\n`, kept: [`${TICKS}\`\n${START}\n${TICKS}\nUSER-EXAMPLE\n${END}\n${TICKS}\`\n`] },
  { name: 'a tilde fence that a backtick line does not close', body: `# Mine\n\n~~~\n${TICKS}\n${START}\nUSER-EXAMPLE\n${END}\n${TICKS}\n~~~\n\nEnd.\n`, kept: [`~~~\n${TICKS}\n${START}\nUSER-EXAMPLE\n${END}\n${TICKS}\n~~~\n`] },
  { name: 'a fenced example above the real block', body: `# Mine\n\n${EXAMPLE(TICKS)}\n${START}\nold\n${END}\n\nEnd.\n`, kept: [`# Mine\n\n${EXAMPLE(TICKS)}\n`, `${END}\n\nEnd.\n`], real: true },
  { name: 'a fenced example below the real block', body: `# Mine\n\n${START}\nold\n${END}\n\n${EXAMPLE('~~~')}\nEnd.\n`, kept: [`${END}\n\n${EXAMPLE('~~~')}\nEnd.\n`], real: true },
  { name: 'an indented start right above the real block', body: `# Mine\n\n    ${START}\n\n${START}\nold\n${END}\n\nEnd.\n`, kept: [`# Mine\n\n    ${START}\n\n${START}\n`], real: true },
  { name: 'an indented end right below the real block', body: `# Mine\n\n${START}\nold\n${END}\n\n    ${END}\n\nEnd.\n`, kept: [`${END}\n\n    ${END}\n\nEnd.\n`], real: true },
  { name: 'a block indented by a tab', body: `# Mine\n\n\t${START}\n\tUSER-EXAMPLE\n\t${END}\n\nEnd.\n`, kept: [`\t${START}\n\tUSER-EXAMPLE\n\t${END}\n`] },
  { name: 'a block indented by a space and a tab, above the real block', body: `# Mine\n\n \t${START}\n \tUSER-EXAMPLE\n \t${END}\n\n${START}\nold\n${END}\n\nEnd.\n`, kept: [`# Mine\n\n \t${START}\n \tUSER-EXAMPLE\n \t${END}\n\n`, `${END}\n\nEnd.\n`], real: true },
];

for (const edition of ['cursor', 'copilot', 'opencode']) {
  for (const state of FENCE_STATES) {
    test(`--${edition} over ${state.name}: the markers in the code are the user's, and three runs give one block`, async () => {
      const server = await startServer();
      const workspace = makeWorkspace();
      try {
        writeFileSync(join(workspace.project, 'AGENTS.md'), state.body);
        const texts = [];
        for (const args of [[`--${edition}`], [`--${edition}`, '--force'], [`--${edition}`, '--force']]) {
          const result = await runCli(workspace, args, { [BASE_ENV]: server.url });
          assert.equal(result.status, 0, result.out);
          texts.push(readFileSync(join(workspace.project, 'AGENTS.md'), 'utf8'));
        }
        for (const [run, text] of texts.entries()) {
          const where = `run ${run + 1}\n${text}`;
          const methodology = text.indexOf('## Vibeflow Methodology');
          assert.equal(occurrences(text, '## Vibeflow Methodology'), 1, where);
          assert.equal(text.slice(methodology - START.length - 2, methodology), `\n${START}\n`, where);
          assert.equal(occurrences(text, 'USER-EXAMPLE'), occurrences(state.body, 'USER-EXAMPLE'), where);
          assert.equal(occurrences(text, START), occurrences(state.body, START) + (state.real ? 0 : 1), where);
          assert.ok(!/\nold\n/.test(text), where);
          assert.ok(text.startsWith('# Mine\n\n'), where);
          for (const piece of state.kept) assert.ok(text.includes(piece), `kept ${JSON.stringify(piece)}\n${where}`);
          if (!state.real) assert.ok(text.indexOf('USER-EXAMPLE') < methodology, where);
        }
        assert.equal(texts[2], texts[1], 'a rerun changed AGENTS.md');
      } finally {
        workspace.cleanup();
        await server.close();
      }
    });
  }
}

// The edition's source loses only its own pair: an example pair the source fences below its
// block is not taken as the block's end.
for (const edition of ['cursor', 'copilot', 'opencode']) {
  test(`--${edition}: a source that fences an example pair below its own block gives the block up to its own end`, async () => {
    const source = readFileSync(join(ROOT, edition, 'AGENTS.md'), 'utf8');
    assert.equal(occurrences(source, `\n${END}`), 1, 'the source has one end');
    const fenced = source.replace(`\n${END}`, () => `\n${END}\n\nSOURCE-BELOW\n\n${EXAMPLE('~~~')}`);
    const server = await startServer({ [`${edition}/AGENTS.md`]: fenced });
    const workspace = makeWorkspace();
    try {
      writeFileSync(join(workspace.project, 'AGENTS.md'), '# Mine\n\nKEEP.\n');
      const result = await runCli(workspace, [`--${edition}`], { [BASE_ENV]: server.url });
      assert.equal(result.status, 0, result.out);
      const text = readFileSync(join(workspace.project, 'AGENTS.md'), 'utf8');
      assert.ok(!text.includes('SOURCE-BELOW') && !text.includes('USER-EXAMPLE'), text);
      assert.equal(occurrences(text, START), 1, text);
      assert.equal(occurrences(text, END), 1, text);
      assert.ok(text.startsWith('# Mine\n\nKEEP.\n\n'), text);
      assert.ok(text.endsWith(`${END}\n`), text);
    } finally {
      workspace.cleanup();
      await server.close();
    }
  });
}

// A link in the project where the installer expects a folder or a file. Every write lands, links
// resolved, inside the project's real root; when one would not, the install is refused before
// anything is written, with or without --force, and says which file and why. A link that stays
// inside the project installs as before.

const EDITION_ROOT = { cursor: '.cursor', copilot: '.github', opencode: '.opencode' };

// Each form puts one link in a fresh project, pointing into `outside` (a folder beside the project).
const OUTSIDE_LINKS = [
  { form: 'the kit scripts folder', link: (edition) => `${KIT_DEST[edition]}/scripts`, target: (outside) => outside },
  { form: 'a folder in the middle of the path', link: (edition) => EDITION_ROOT[edition], target: (outside) => outside },
  { form: 'the destination file itself', link: (edition) => `${KIT_DEST[edition]}/scripts/check-briefing.mjs`, target: (outside) => join(outside, 'check-briefing.mjs') },
  { form: 'a destination file that links to nothing yet', link: (edition) => `${KIT_DEST[edition]}/scripts/check-briefing.mjs`, target: (outside) => join(outside, 'nowhere.mjs') },
  { form: 'AGENTS.md', link: () => 'AGENTS.md', target: (outside) => join(outside, 'AGENTS.md') },
];

// Every entry under `dir`, links listed as entries and never followed, with each file's content.
function snapshot(dir) {
  const out = {};
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      const key = relative(dir, full).split(sep).join('/');
      if (entry.isSymbolicLink()) out[key] = 'link';
      else if (entry.isDirectory()) { out[key] = 'dir'; visit(full); }
      else out[key] = readFileSync(full, 'utf8');
    }
  };
  visit(dir);
  return out;
}

for (const edition of ['cursor', 'copilot', 'opencode']) {
  for (const shape of OUTSIDE_LINKS) {
    test(`--${edition} refuses to install when ${shape.form} is a link out of the project, with or without --force`, async () => {
      const server = await startServer();
      const workspace = makeWorkspace();
      try {
        const outside = join(workspace.root, 'outside');
        mkdirSync(outside);
        writeFileSync(join(outside, 'check-briefing.mjs'), 'OUTSIDE THE PROJECT\n');
        writeFileSync(join(outside, 'AGENTS.md'), '# Shared elsewhere\n');
        const link = shape.link(edition);
        mkdirSync(join(workspace.project, link, '..'), { recursive: true });
        symlinkSync(shape.target(outside), join(workspace.project, link));
        const outsideBefore = snapshot(outside);
        const projectBefore = snapshot(workspace.project);
        for (const args of [[`--${edition}`], [`--${edition}`, '--force']]) {
          const result = await runCli(workspace, args, { [BASE_ENV]: server.url });
          assert.notEqual(result.status, 0, `${args.join(' ')} exited 0\n${result.out}`);
          assert.match(result.out, /outside the project/, result.out);
          assert.ok(result.out.includes(link), `${args.join(' ')}: the refusal names ${link}\n${result.out}`);
          assert.match(result.out, /Nothing was installed/, result.out);
          assert.deepEqual(snapshot(outside), outsideBefore, `${args.join(' ')} wrote outside the project`);
          assert.deepEqual(snapshot(workspace.project), projectBefore, `${args.join(' ')} wrote in the project`);
        }
      } finally {
        workspace.cleanup();
        await server.close();
      }
    });
  }

  test(`--${edition} installs through a link that stays inside the project, and --force reruns too`, async () => {
    const server = await startServer();
    const workspace = makeWorkspace();
    try {
      const shared = join(workspace.project, 'shared-scripts');
      mkdirSync(shared);
      mkdirSync(join(workspace.project, KIT_DEST[edition]), { recursive: true });
      symlinkSync(shared, join(workspace.project, KIT_DEST[edition], 'scripts'));
      for (const args of [[`--${edition}`], [`--${edition}`, '--force']]) {
        const result = await runCli(workspace, args, { [BASE_ENV]: server.url });
        assert.equal(result.status, 0, `${args.join(' ')}\n${result.out}`);
        for (const file of manifestFiles()) {
          const installed = join(workspace.project, KIT_DEST[edition], file);
          assert.equal(readFileSync(installed, 'utf8'), readFileSync(join(LOOP_DIR, file), 'utf8'), `${args.join(' ')}: ${file}`);
        }
        const scripts = manifestFiles().filter((file) => file.startsWith('scripts/')).map((file) => file.slice('scripts/'.length)).sort();
        assert.ok(scripts.length > 0);
        assert.deepEqual(readdirSync(shared).sort(), scripts, 'the scripts sit in the folder the link points to');
        assert.ok(existsSync(join(workspace.project, MARKER[edition])));
      }
    } finally {
      workspace.cleanup();
      await server.close();
    }
  });

  test(`--${edition} refuses a loop of links in the tone of the other refusals, naming the file and why`, async () => {
    const server = await startServer();
    const workspace = makeWorkspace();
    try {
      symlinkSync(join(workspace.project, 'loop-b'), join(workspace.project, EDITION_ROOT[edition]));
      symlinkSync(join(workspace.project, EDITION_ROOT[edition]), join(workspace.project, 'loop-b'));
      const projectBefore = snapshot(workspace.project);
      for (const args of [[`--${edition}`], [`--${edition}`, '--force']]) {
        const result = await runCli(workspace, args, { [BASE_ENV]: server.url });
        assert.equal(result.status, 1, `${args.join(' ')}\n${result.out}`);
        assert.ok(!result.out.includes('Error:'), `${args.join(' ')}: a raw error\n${result.out}`);
        assert.ok(result.out.includes(`${MARKER[edition]} — ${EDITION_ROOT[edition]} is a loop of links`), `${args.join(' ')}: names the file and the loop\n${result.out}`);
        assert.match(result.out, /Nothing was installed/, result.out);
        assert.deepEqual(snapshot(workspace.project), projectBefore, `${args.join(' ')} wrote in the project`);
      }
    } finally {
      workspace.cleanup();
      await server.close();
    }
  });

  test(`--${edition} refusing a shared AGENTS.md says to install from the folder where the real file is, and only then`, async () => {
    const server = await startServer();
    const workspace = makeWorkspace();
    try {
      const outside = join(workspace.root, 'outside');
      mkdirSync(outside);
      writeFileSync(join(outside, 'AGENTS.md'), '# Shared elsewhere\n');
      symlinkSync(join(outside, 'AGENTS.md'), join(workspace.project, 'AGENTS.md'));
      const shared = await runCli(workspace, [`--${edition}`], { [BASE_ENV]: server.url });
      assert.equal(shared.status, 1, shared.out);
      assert.ok(shared.out.includes(`run the installer from ${realpathSync(outside)}`), shared.out);
      rmSync(join(workspace.project, 'AGENTS.md'));
      mkdirSync(join(workspace.project, KIT_DEST[edition]), { recursive: true });
      symlinkSync(outside, join(workspace.project, KIT_DEST[edition], 'scripts'));
      const kit = await runCli(workspace, [`--${edition}`], { [BASE_ENV]: server.url });
      assert.equal(kit.status, 1, kit.out);
      assert.match(kit.out, /Nothing was installed/, kit.out);
      assert.ok(!kit.out.includes('run the installer from'), kit.out);
    } finally {
      workspace.cleanup();
      await server.close();
    }
  });
}

// A `..` that comes after a link is applied where the link really lands, as the file system does:
// `bridge/../victim.md` with `bridge -> ../outside/deep` writes `outside/victim.md`, never
// `project/victim.md`. Each state is two links in a fresh project; `outside` sits beside it.
const DOTDOT_LINKS = [
  {
    form: 'AGENTS.md through a link and then ..',
    named: 'AGENTS.md',
    make: (project, outside) => {
      mkdirSync(join(outside, 'deep'));
      writeFileSync(join(outside, 'victim.md'), 'VICTIM OUTSIDE\n');
      symlinkSync('../outside/deep', join(project, 'bridge'));
      symlinkSync('bridge/../victim.md', join(project, 'AGENTS.md'));
    },
  },
  {
    form: 'AGENTS.md through a link and then .., to a file not there yet',
    named: 'AGENTS.md',
    make: (project, outside) => {
      mkdirSync(join(outside, 'deep'));
      symlinkSync('../outside/deep', join(project, 'bridge'));
      symlinkSync('bridge/../victim.md', join(project, 'AGENTS.md'));
    },
  },
  {
    form: 'AGENTS.md through a name not there yet, then .. and a link out',
    named: 'AGENTS.md',
    make: (project, outside) => {
      mkdirSync(join(outside, 'deep'));
      writeFileSync(join(outside, 'victim.md'), 'VICTIM OUTSIDE\n');
      symlinkSync('../outside/deep', join(project, 'bridge'));
      symlinkSync('not-yet/../bridge/../victim.md', join(project, 'AGENTS.md'));
    },
  },
  {
    form: 'the kit scripts folder through a link and then ..',
    named: 'scripts',
    make: (project, outside, edition) => {
      mkdirSync(join(outside, 'deep'));
      mkdirSync(join(outside, 'scripts'));
      mkdirSync(join(project, KIT_DEST[edition]), { recursive: true });
      symlinkSync(join(outside, 'deep'), join(project, 'bridge'));
      symlinkSync(`${project}/bridge/../scripts`, join(project, KIT_DEST[edition], 'scripts'));
    },
  },
];

for (const edition of ['cursor', 'copilot', 'opencode']) {
  for (const shape of DOTDOT_LINKS) {
    test(`--${edition} refuses ${shape.form} when the link leads out, with or without --force`, async () => {
      const server = await startServer();
      const workspace = makeWorkspace();
      try {
        const outside = join(workspace.root, 'outside');
        mkdirSync(outside);
        shape.make(workspace.project, outside, edition);
        const outsideBefore = snapshot(outside);
        const projectBefore = snapshot(workspace.project);
        for (const args of [[`--${edition}`], [`--${edition}`, '--force']]) {
          const result = await runCli(workspace, args, { [BASE_ENV]: server.url });
          assert.equal(result.status, 1, `${args.join(' ')}\n${result.out}`);
          assert.match(result.out, /outside the project/, result.out);
          assert.ok(result.out.includes(shape.named), `${args.join(' ')}: the refusal names ${shape.named}\n${result.out}`);
          assert.match(result.out, /Nothing was installed/, result.out);
          assert.deepEqual(snapshot(outside), outsideBefore, `${args.join(' ')} wrote outside the project`);
          assert.deepEqual(snapshot(workspace.project), projectBefore, `${args.join(' ')} wrote in the project`);
        }
      } finally {
        workspace.cleanup();
        await server.close();
      }
    });
  }

  test(`--${edition} installs through a link and then .. that stays inside, where the file system puts it`, async () => {
    const server = await startServer();
    const workspace = makeWorkspace();
    try {
      mkdirSync(join(workspace.project, 'sub/deep'), { recursive: true });
      symlinkSync('sub/deep', join(workspace.project, 'bridge'));
      symlinkSync('bridge/../rules.md', join(workspace.project, 'AGENTS.md'));
      for (const args of [[`--${edition}`], [`--${edition}`, '--force']]) {
        const result = await runCli(workspace, args, { [BASE_ENV]: server.url });
        assert.equal(result.status, 0, `${args.join(' ')}\n${result.out}`);
        const text = readFileSync(join(workspace.project, 'sub/rules.md'), 'utf8');
        assert.equal(occurrences(text, START), 1, text);
        assert.ok(!existsSync(join(workspace.project, 'rules.md')), 'the block went where the .. was collapsed by hand');
      }
    } finally {
      workspace.cleanup();
      await server.close();
    }
  });
}

// A destination that is a regular file with more than one name (a hard link) is refused: writing
// it would change the file under its other names, and those may be anywhere, outside the
// project included. That holds when a link inside the project leads to it.
const HARD_LINKS = [
  {
    form: 'AGENTS.md is a hard link to a file outside',
    dest: 'AGENTS.md',
    make: (project, outside) => {
      writeFileSync(join(outside, 'shared.md'), '# Shared elsewhere\n');
      linkSync(join(outside, 'shared.md'), join(project, 'AGENTS.md'));
    },
  },
  {
    form: 'a kit file is a hard link to a file outside',
    dest: (edition) => `${KIT_DEST[edition]}/scripts/check-briefing.mjs`,
    make: (project, outside, edition) => {
      writeFileSync(join(outside, 'check-briefing.mjs'), 'OUTSIDE THE PROJECT\n');
      mkdirSync(join(project, KIT_DEST[edition], 'scripts'), { recursive: true });
      linkSync(join(outside, 'check-briefing.mjs'), join(project, KIT_DEST[edition], 'scripts/check-briefing.mjs'));
    },
  },
  {
    form: 'AGENTS.md links inside to CLAUDE.md, a hard link to a file outside',
    dest: 'AGENTS.md',
    make: (project, outside) => {
      writeFileSync(join(outside, 'shared.md'), '# Shared elsewhere\n');
      linkSync(join(outside, 'shared.md'), join(project, 'CLAUDE.md'));
      symlinkSync('CLAUDE.md', join(project, 'AGENTS.md'));
    },
  },
  {
    form: 'AGENTS.md is a hard link to CLAUDE.md inside the project',
    dest: 'AGENTS.md',
    make: (project) => {
      writeFileSync(join(project, 'CLAUDE.md'), '# Mine\n');
      linkSync(join(project, 'CLAUDE.md'), join(project, 'AGENTS.md'));
    },
  },
];

for (const edition of ['cursor', 'copilot', 'opencode']) {
  for (const shape of HARD_LINKS) {
    test(`--${edition} refuses to install when ${shape.form}, with or without --force`, async () => {
      const server = await startServer();
      const workspace = makeWorkspace();
      try {
        const outside = join(workspace.root, 'outside');
        mkdirSync(outside);
        shape.make(workspace.project, outside, edition);
        const dest = typeof shape.dest === 'function' ? shape.dest(edition) : shape.dest;
        const outsideBefore = snapshot(outside);
        const projectBefore = snapshot(workspace.project);
        for (const args of [[`--${edition}`], [`--${edition}`, '--force']]) {
          const result = await runCli(workspace, args, { [BASE_ENV]: server.url });
          assert.equal(result.status, 1, `${args.join(' ')}\n${result.out}`);
          assert.ok(!result.out.includes('Error:'), `${args.join(' ')}: a raw error\n${result.out}`);
          assert.ok(result.out.split('\n').some((line) => line.includes(`x ${dest} — `) && line.includes('hard link')), `${args.join(' ')}: names ${dest} and the hard link\n${result.out}`);
          assert.match(result.out, /Nothing was installed/, result.out);
          assert.ok(!result.out.includes('run the installer from'), `${args.join(' ')}: a hard link gets no monorepo hint\n${result.out}`);
          assert.deepEqual(snapshot(outside), outsideBefore, `${args.join(' ')} wrote outside the project`);
          assert.deepEqual(snapshot(workspace.project), projectBefore, `${args.join(' ')} wrote in the project`);
        }
      } finally {
        workspace.cleanup();
        await server.close();
      }
    });
  }
}

// A fence the user left open at the end of the file is closed before the block is appended, and
// everything the user wrote stays byte for byte, trailing spaces and blank lines in the code too.
const OPEN_FENCE_TAILS = [
  { name: 'code that ends in trailing spaces and a blank line', body: `# Mine\n\n${TICKS}\ncode  \n\n` },
  { name: 'code that ends in trailing spaces and no line end', body: `# Mine\n\n~~~~ txt\ncode  ` },
  { name: 'code that ends in blank lines in a CRLF file', body: `# Mine\r\n\r\n${TICKS}\r\ncode \t\r\n\r\n\r\n` },
];

for (const edition of ['cursor', 'copilot', 'opencode']) {
  for (const state of OPEN_FENCE_TAILS) {
    test(`--${edition} over a fence left open with ${state.name} keeps every byte of it and gives one block`, async () => {
      const server = await startServer();
      const workspace = makeWorkspace();
      try {
        writeFileSync(join(workspace.project, 'AGENTS.md'), state.body);
        const texts = [];
        for (const args of [[`--${edition}`], [`--${edition}`, '--force'], [`--${edition}`, '--force']]) {
          const result = await runCli(workspace, args, { [BASE_ENV]: server.url });
          assert.equal(result.status, 0, result.out);
          texts.push(readFileSync(join(workspace.project, 'AGENTS.md'), 'utf8'));
        }
        for (const [run, text] of texts.entries()) {
          const where = `run ${run + 1}\n${JSON.stringify(text)}`;
          assert.ok(text.startsWith(state.body), `the user's bytes changed\n${where}`);
          assert.equal(occurrences(text, '## Vibeflow Methodology'), 1, where);
          assert.equal(occurrences(text, START), 1, where);
          assert.ok(text.endsWith(`${END}\n`), where);
        }
        assert.equal(texts[2], texts[1], 'a rerun changed AGENTS.md');
      } finally {
        workspace.cleanup();
        await server.close();
      }
    });
  }
}
