// Audit probes, vibeflow 1.16 part 6a (loop-stats.mjs and the CLI's kit install).
// Behavior only: every time is fixed in a fixture, nothing reads the real clock, the CLI
// talks to a local node:http server. Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOOP_DIR, hermeticEnv, runScript } from '../loop-helpers.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const HEADER = '| Part | Role | Round | Started | Ended | Verdict |\n|---|---|---|---|---|---|';
const KIT_URL_PATH = 'plugins/vibeflow/skills/implement/loop';

// --- loop-stats.mjs ---

function statsOf(ledgers) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-audit-p6a-'));
  try {
    const loopDir = join(dir, '.vibeflow/loop');
    mkdirSync(loopDir, { recursive: true });
    for (const [name, rows] of Object.entries(ledgers)) {
      writeFileSync(join(loopDir, name), `# Loop\n\n## Rounds\n\n${HEADER}\n${rows.join('\n')}\n`);
    }
    const result = runScript('loop-stats.mjs', [dir, '--json'], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    return JSON.parse(result.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function partOf(report, feature, part) {
  const found = report.parts.find((entry) => entry.feature === feature && entry.part === part);
  assert.ok(found, `no part ${feature} · ${part} in ${JSON.stringify(report.parts)}`);
  return found;
}

test('p6a-1 a re-dispatched round-0 executor: the clock starts at the earliest executor start, whatever the row order', () => {
  const report = statsOf({
    'f.md': [
      '| 1 | executor | 0 | 2026-10-20 09:00 | 2026-10-20 09:30 | - |',
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 08:30 | - |',
      '| 1 | executor | 0 | 2026-10-20 10:00 | 2026-10-20 11:00 | - |',
      '| 1 | audit | 0 | 2026-10-20 11:10 | 2026-10-20 12:00 | PASS |',
    ],
  });
  const p = partOf(report, 'f', '1');
  assert.equal(p.clockMinutes, 240);
  assert.equal(p.rounds, 1);
  assert.equal(p.fixRounds, 0);
});

test('p6a-2 two PASS rows: the clock ends at the earliest PASS end, not the last row and not the latest PASS', () => {
  const report = statsOf({
    'f.md': [
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| 1 | fix | 1 | 2026-10-20 13:00 | 2026-10-20 14:00 | - |',
      '| 1 | reaudit | 1 | 2026-10-20 14:00 | 2026-10-20 15:00 | PASS |',
      '| 1 | audit | 0 | 2026-10-20 09:10 | 2026-10-20 10:00 | PASS |',
    ],
  });
  assert.equal(partOf(report, 'f', '1').clockMinutes, 120);
});

test('p6a-3 a repeated round-0 audit: the first audit is the one that started first', () => {
  const report = statsOf({
    'f.md': [
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| 1 | audit | 0 | 2026-10-20 10:00 | 2026-10-20 10:50 | PASS |',
      '| 1 | audit | 0 | 2026-10-20 09:10 | 2026-10-20 09:50 | PARTIAL |',
      '| 1 | audit | 0 | 2026-10-20 11:00 | 2026-10-20 12:00 | FAIL |',
    ],
  });
  const p = partOf(report, 'f', '1');
  assert.equal(p.firstAudit, 'PARTIAL');
  assert.equal(p.firstAuditPass, false);
  assert.equal(p.clockMinutes, 170);
});

test('p6a-4 a row whose Ended is before its Started, and a minute 60, are warnings and do not count', () => {
  const report = statsOf({
    'f.md': [
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| 1 | audit | 0 | 2026-10-20 10:00 | 2026-10-20 09:30 | PASS |',
      '| 2 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 08:60 | - |',
      '| 2 | audit | 0 | 2026-10-20 09:00 | 2026-10-20 10:00 | PASS |',
    ],
  });
  const one = partOf(report, 'f', '1');
  assert.equal(one.firstAudit, null);
  assert.equal(one.clockMinutes, null);
  const two = partOf(report, 'f', '2');
  assert.equal(two.clockMinutes, null);
  assert.match(two.clockNote, /executor/);
  assert.deepEqual(report.warnings.map((w) => w.line).sort((a, b) => a - b), [8, 9]);
});

test('p6a-5 totals: an even count of clocks has the mean of the two middle ones as median; the PASS rate counts audited parts only', () => {
  const report = statsOf({
    'f.md': [
      '| a | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| a | audit | 0 | 2026-10-20 09:00 | 2026-10-20 09:30 | PASS |',
      '| b | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| b | audit | 0 | 2026-10-20 09:00 | 2026-10-20 10:00 | FAIL |',
      '| b | fix | 1 | 2026-10-20 10:00 | 2026-10-20 11:00 | - |',
      '| b | reaudit | 1 | 2026-10-20 11:00 | 2026-10-20 12:00 | PASS |',
      '| c | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
    ],
  });
  const t = report.totals;
  assert.equal(t.parts, 3);
  assert.equal(t.auditedParts, 2);
  assert.equal(t.firstAuditPass, 1);
  assert.equal(t.firstAuditPassRate, 0.5);
  assert.equal(t.partsWithClock, 2);
  assert.equal(t.medianClockMinutes, (90 + 240) / 2);
  assert.equal(t.meanFixRounds, 1 / 3);
  assert.equal(partOf(report, 'f', 'c').firstAudit, null);
});

test('p6a-11 a rounds row left after a blank line inside the Rounds section is a warning, never a silent drop', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-audit-p6a-'));
  try {
    const loopDir = join(dir, '.vibeflow/loop');
    mkdirSync(loopDir, { recursive: true });
    writeFileSync(join(loopDir, 'f.md'), [
      '## Rounds', '', HEADER,
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| 1 | audit | 0 | 2026-10-20 09:00 | 2026-10-20 10:00 | FAIL |',
      '| 1 | fix | 1 | 2026-10-20 10:00 | 2026-10-20 11:00 | - |',
      '',
      '| 1 | reaudit | 1 | 2026-10-20 11:00 | 2026-10-20 12:00 | PASS |',
      '',
      'Decision: x — why: y — cost if wrong: z',
      '',
    ].join('\n'));
    const result = runScript('loop-stats.mjs', [dir, '--json'], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    const report = JSON.parse(result.stdout);
    // line 9 is the re-audit row; whatever the script does with it, it may not vanish unreported
    assert.ok(report.warnings.some((w) => w.line === 9), `row on line 9 dropped silently: ${JSON.stringify(report)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- the CLI's write paths ---

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

function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'vibeflow-audit-cli-'));
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

test('p6a-6 an existing install without --force writes nothing and fetches no kit file', async () => {
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
  test(`p6a-7 --${edition} --force over an older install replaces a stale kit file and keeps the user's own files`, async () => {
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

test('p6a-8 without --force and without the marker, an existing kit file is kept and the rest of the kit is installed', async () => {
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

test('p6a-9 the Copilot .gitignore block keeps the user lines and is not duplicated by a --force reinstall', async () => {
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

test('p6a-10 a manifest entry that is a hidden segment or a backslash path is refused before anything is written', async () => {
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
