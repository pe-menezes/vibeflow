// Behavior probes for the OpenCode edition as setup-vibeflow installs it: what lands in
// .opencode/ is what the host needs to load it, and the AGENTS.md block the host puts in its
// system instructions speaks this host's forms. Each case states, as comments, the contract it
// protects, the plausible regression that breaks it, and why test/cli-kit.test.mjs does not
// catch it.
// No network: the CLI talks to a local node:http server that serves this repository's files.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hermeticEnv } from '../loop-helpers.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SKILLS = join(ROOT, 'plugins/vibeflow/skills');

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
  const root = mkdtempSync(join(tmpdir(), 'vibeflow-probe-opencode-'));
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
    const child = spawn(process.execPath, [workspace.cliPath, ...args], { cwd: workspace.project, env: hermeticEnv(workspace.root, extraEnv) });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, out }); });
  });
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

// One OpenCode install into a scratch project, shared by the cases that only read it.
async function withInstall(run, prepare = () => {}) {
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    prepare(ws);
    const result = await runCli(ws, ['--opencode'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(result.status, 0, result.out);
    await run(ws, result);
  } finally {
    ws.cleanup();
    await server.close();
  }
}

// Contract: the installed .opencode/skills/ tree is the shared plugin's skills tree, file for file and byte for byte, so the edition runs the shared source unchanged.
// Breaks when: a workflow is added to plugins/vibeflow/skills/ and not to the CLI's OpenCode list, or a skill gains a file the CLI does not install.
// Not covered by: test/cli-kit.test.mjs pins its own list of ten workflows and the kit manifest, so a skill added to the source on both sides of that list passes unnoticed.
test('OpenCode install: .opencode/skills/ is the shared skills tree, file for file', async () => {
  await withInstall(async (ws) => {
    const source = walk(SKILLS).filter((path) => path !== 'implement/loop/manifest.json').sort();
    const installed = walk(join(ws.project, '.opencode/skills')).sort();
    assert.deepEqual(installed, source);
    for (const path of source) {
      assert.equal(readFileSync(join(ws.project, '.opencode/skills', path), 'utf8'), readFileSync(join(SKILLS, path), 'utf8'), path);
    }
  });
});

// Contract: every installed skill's frontmatter name equals the folder that holds it, which the host requires to load it (measured in OpenCode 2.2.5 by the part 1 auditor).
// Breaks when: the CLI installs a skill under a prefixed folder (vibeflow-audit/, as the Cursor edition does), so the host drops it.
// Not covered by: test/cli-kit.test.mjs compares bytes with the source, not the name against the destination folder.
test('OpenCode install: each installed skill is named after its folder', async () => {
  await withInstall(async (ws) => {
    const dir = join(ws.project, '.opencode/skills');
    const folders = readdirSync(dir);
    assert.ok(folders.length >= 10, folders.join(', '));
    for (const folder of folders) {
      const text = readFileSync(join(dir, folder, 'SKILL.md'), 'utf8');
      const name = /^---\n[\s\S]*?^name:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(text);
      assert.ok(name, `${folder}/SKILL.md has a name`);
      assert.equal(name[1], folder);
    }
  });
});

// Contract: the shared implement skill reads the kit as `loop/` in the directory of its SKILL.md in OpenCode, so the installed kit sits there with every script the orchestrator runs.
// Breaks when: the OpenCode kitDest moves (to .opencode/vibeflow/loop, in the Copilot mold), and the skill's sentence stops being true.
// Not covered by: test/audit/cli-kit.probes.test.mjs checks that the Cursor and Copilot editions name their kitDest; the shared sentence names a position, not a path.
test('OpenCode install: the kit is loop/ beside the installed implement SKILL.md, with every script the orchestrator names', async () => {
  await withInstall(async (ws) => {
    const implement = readFileSync(join(ws.project, '.opencode/skills/implement/SKILL.md'), 'utf8').replace(/\s+/g, ' ');
    assert.ok(implement.includes('OpenCode') && implement.includes('`loop/` in the directory of this SKILL.md'), 'the skill says where the kit is in OpenCode');
    const loop = join(ws.project, '.opencode/skills/implement/loop');
    const orchestrator = readFileSync(join(loop, 'orchestrator.md'), 'utf8');
    const scripts = new Set([...orchestrator.matchAll(/`scripts\/([a-z-]+\.mjs)/g)].map((match) => match[1]));
    assert.ok(scripts.size > 0);
    for (const script of scripts) assert.ok(existsSync(join(loop, 'scripts', script)), `scripts/${script} installed`);
    for (const role of ['roles/executor.md', 'roles/auditor.md']) assert.ok(existsSync(join(loop, role)), role);
  });
});

// Contract: the agents the orchestrator's OpenCode row calls by name are installed in .opencode/agents/, and every installed command loads a skill that is installed.
// Breaks when: an agent or a command is dropped from the CLI's list, so a `subagent` call falls back or a /vibeflow-<name> command loads nothing.
// Not covered by: test/cli-kit.test.mjs lists the files it expects itself instead of reading what the orchestrator and the commands call.
test('OpenCode install: the agents the loop calls and the skills the commands load are installed', async () => {
  await withInstall(async (ws) => {
    const row = readFileSync(join(SKILLS, 'implement/loop/orchestrator.md'), 'utf8').split('\n').find((line) => line.startsWith('| OpenCode |'));
    assert.ok(row, 'the orchestrator has an OpenCode row');
    const called = new Set([...row.matchAll(/`agent` (?:that is )?`([a-z-]+)`/g)].map((match) => match[1]));
    assert.ok(called.has('executor') && called.has('auditor'), [...called].join(', '));
    for (const agent of called) assert.ok(existsSync(join(ws.project, '.opencode/agents', `${agent}.md`)), `${agent} installed`);
    const commands = readdirSync(join(ws.project, '.opencode/commands'));
    assert.ok(commands.length >= 10);
    for (const command of commands) {
      const skill = /Load the `([a-z-]+)` skill/.exec(readFileSync(join(ws.project, '.opencode/commands', command), 'utf8'));
      assert.ok(skill, `${command} loads a skill`);
      assert.ok(existsSync(join(ws.project, '.opencode/skills', skill[1], 'SKILL.md')), `${command}: ${skill[1]} installed`);
    }
  });
});

// Contract: the AGENTS.md block the host loads into its system instructions names the host's gestures: each /vibeflow-<name> it writes is an installed command, and it names the agents by their OpenCode names.
// Breaks when: the block is copied from another edition (Cursor's names `.cursor/rules/vibeflow.mdc`, Claude's `/vibeflow:<name>`), so the host is told to use what is not there.
// Not covered by: test/cli-kit.test.mjs only checks the markers and one command name.
test('OpenCode install: the AGENTS.md block speaks OpenCode, and every command it names is installed', async () => {
  await withInstall(async (ws) => {
    const agents = readFileSync(join(ws.project, 'AGENTS.md'), 'utf8');
    const start = agents.indexOf('<!-- vibeflow:start -->');
    const end = agents.lastIndexOf('<!-- vibeflow:end -->');
    assert.ok(start !== -1 && end > start, agents);
    const block = agents.slice(start, end);
    assert.doesNotMatch(block, /\/vibeflow:/, 'no Claude command form');
    assert.doesNotMatch(block, /\.cursor\/|\.github\//, 'no other edition\'s path');
    const named = [...block.matchAll(/\/vibeflow-([a-z-]+)/g)].map((match) => match[1]);
    assert.ok(named.length > 0, 'the block names a command');
    for (const name of named) assert.ok(existsSync(join(ws.project, '.opencode/commands', `vibeflow-${name}.md`)), `/vibeflow-${name} installed`);
    for (const agent of ['architect', 'executor', 'auditor']) assert.match(block, new RegExp('`' + agent + '`'), `the block names ${agent}`);
    assert.match(block, /\.opencode\/skills\//);
  });
});

// Contract: an install into a project with its own AGENTS.md keeps the project's text and adds one Vibeflow block, and a --force rerun replaces that block in place.
// Breaks when: the OpenCode AGENTS.md source loses its `---` separator, so the note above it ("copy this file...") lands in the instructions the host loads.
// Not covered by: test/cli-kit.test.mjs installs into an empty project only.
test('OpenCode install: a project AGENTS.md keeps its text, gains one block, and a rerun leaves it as it is', async () => {
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    writeFileSync(join(ws.project, 'AGENTS.md'), '# My project\n\nRun make test.\n');
    const first = await runCli(ws, ['--opencode'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(first.status, 0, first.out);
    const after = readFileSync(join(ws.project, 'AGENTS.md'), 'utf8');
    assert.ok(after.startsWith('# My project\n\nRun make test.\n'), after);
    assert.doesNotMatch(after, /append the content below|copy this file/i, 'the source note stays out of the host instructions');
    const second = await runCli(ws, ['--opencode', '--force'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(second.status, 0, second.out);
    assert.equal(readFileSync(join(ws.project, 'AGENTS.md'), 'utf8'), after);
  } finally {
    ws.cleanup();
    await server.close();
  }
});

// Contract: the .gitignore block ignores what the install wrote and leaves the user's own .opencode/ files tracked, as git itself reads the file.
// Breaks when: the block is widened to `.opencode/` or `.opencode/skills/*/`, and the user's own agents, commands and skills vanish from git.
// Not covered by: test/cli-kit.test.mjs compares the block text, not what git ignores with it.
test('OpenCode install: git ignores every installed file and none of the user\'s own .opencode files', async () => {
  const mine = ['.opencode/agents/mine.md', '.opencode/commands/mine.md', '.opencode/skills/mine/SKILL.md', 'opencode.json', 'AGENTS.md'];
  await withInstall(async (ws) => {
    const env = hermeticEnv(ws.root);
    const init = spawnSync('git', ['init', '-q'], { cwd: ws.project, env, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const installed = walk(join(ws.project, '.opencode')).map((path) => `.opencode/${path}`).filter((path) => !mine.includes(path));
    const check = (paths) => spawnSync('git', ['check-ignore', '--no-index', ...paths], { cwd: ws.project, env, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
    assert.deepEqual(check(installed).sort(), installed.sort(), 'every installed file is ignored');
    assert.deepEqual(check(mine), [], 'none of the user\'s files is ignored');
  }, (ws) => {
    for (const path of mine.filter((p) => p !== 'AGENTS.md')) {
      mkdirSync(dirname(join(ws.project, path)), { recursive: true });
      writeFileSync(join(ws.project, path), 'mine\n');
    }
  });
});
