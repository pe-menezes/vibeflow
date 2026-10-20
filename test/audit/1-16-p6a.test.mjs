// Audit probes, vibeflow 1.16 part 6a (loop-stats.mjs and the CLI's kit install).
// Behavior only: every time is fixed in a fixture, nothing reads the real clock, the CLI
// talks to a local node:http server. Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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

// --- re-audit 1 (fix round 1: F1, F2, F4, F6) ---

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

for (const edition of ['copilot', 'cursor']) {
  test(`r1-1 --${edition} --force keeps the hotfix carve-out the product documents inside the Vibeflow block`, async () => {
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

test('r1-2 the README says "remove the Vibeflow block to track in git": a --force reinstall respects a removed block', { todo: 'pre-existing (marker absent → block appended, as before 6a); low finding R2 of the re-audit' }, async () => {
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

test('r1-3 a 0.16 Copilot block with CRLF lines, at the end of a file without a final newline, gains the kit path once and keeps its own', async () => {
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

test('r1-3b the same CRLF file keeps one line ending throughout', { todo: 'low finding R3 of the re-audit: a bare LF before the new line and a stray CR at the end' }, async () => {
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

test('r1-4 a Cursor block already there: a Copilot install adds its own paths once, keeps every Cursor line, and a rerun changes nothing', async () => {
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

for (const status of [500, 403]) {
  test(`r1-5 a manifest that answers ${status} (not "no kit here") aborts before anything is written`, async () => {
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

test('r1-6 a base that has nothing at all (wrong VIBEFLOW_BASE_URL) still fails and writes nothing', async () => {
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

test('r1-7 --force with a manifest 404 over an install that has the kit leaves the kit files as they are', async () => {
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

test('r1-8 in-progress parts stay out of the totals that need a finished round', () => {
  const report = statsOf({
    'f.md': [
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| 1 | audit | 0 | 2026-10-20 09:00 | 2026-10-20 10:00 | PASS |',
      '| 2 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '| 2 | audit | 0 | 2026-10-20 09:00 |  | - |',
      '| 3 | executor | 0 | 2026-10-20 08:00 |  |  |',
    ],
  });
  // the open executor with an empty Verdict is refused (executor and fix rows carry "-")
  assert.deepEqual(report.warnings.map((w) => w.line), [11], JSON.stringify(report.warnings));
  assert.equal(partOf(report, 'f', '2').clockNote, 'in progress');
  assert.equal(report.totals.auditedParts, 1);
  assert.equal(report.totals.firstAuditPassRate, 1);
  assert.equal(report.totals.partsWithClock, 1);
  assert.equal(report.totals.medianClockMinutes, 120);
});

test('r1-9 a CRLF ledger: a row after a blank line is a warning, and a row under the next heading is not read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-audit-p6a-'));
  try {
    const loopDir = join(dir, '.vibeflow/loop');
    mkdirSync(loopDir, { recursive: true });
    writeFileSync(join(loopDir, 'f.md'), [
      '## Rounds', '', ...HEADER.split('\n'),
      '| 1 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '',
      '| 1 | audit | 0 | 2026-10-20 09:00 | 2026-10-20 10:00 | PASS |',
      '## Handoff',
      '| 9 | executor | 0 | 2026-10-20 08:00 | 2026-10-20 09:00 | - |',
      '',
    ].join('\r\n'));
    const result = runScript('loop-stats.mjs', [dir, '--json'], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.warnings.map((w) => w.line), [7], JSON.stringify(report.warnings));
    assert.deepEqual(report.parts.map((p) => p.part), ['1']);
    assert.equal(partOf(report, 'f', '1').clockNote, 'no PASS yet');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('r1-10 a CRLF .gitignore with the 0.16 block in the middle gains the kit line with CRLF, between the block and the user lines', async () => {
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

// --- re-audit 2 (fix round 2: R1) ---

const carve = (lines) => lines.flatMap((line) => (line === '.vibeflow/' ? ['.vibeflow/*', '!.vibeflow/hotfixes/'] : [line]));
const EDITION_PATHS = {
  copilot: ['.github/prompts/vibeflow-x.prompt.md', '.github/agents/vibeflow-architect.agent.md', '.github/instructions/vibeflow/a.md', '.github/vibeflow/loop/README.md'],
  cursor: ['.cursor/rules/vibeflow.mdc', '.cursor/rules/vibeflow-architect.mdc', '.cursor/skills/vibeflow-x/SKILL.md'],
};

for (const [first, second] of [['copilot', 'cursor'], ['cursor', 'copilot']]) {
  test(`r2-1 a ${first} block with the hotfix carve-out, then --${second} and --${first} --force in turns: the carve-out holds, both editions end up ignored, reruns change nothing`, async () => {
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

// the blocks older installs have in .gitignore, frozen: 0445778 (first CLI with the block) and 0.16
const OLD_BLOCKS = {
  'copilot 0445778': ['# Vibeflow — installed + generated (remove to track in git)', '.vibeflow/', '.github/prompts/vibeflow-*.prompt.md', '.github/agents/vibeflow-architect.agent.md', '.github/skills/vibeflow-spec-driven-dev/', '.github/instructions/vibeflow/'],
  'copilot 0.16': BLOCKS.copilot.slice(0, 5),
  'cursor 0.16': BLOCKS.cursor,
};

for (const [label, old] of Object.entries(OLD_BLOCKS)) {
  test(`r2-2 a ${label} block upgraded by --force ends up with every line a fresh install writes, once, and keeps its own`, async () => {
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
