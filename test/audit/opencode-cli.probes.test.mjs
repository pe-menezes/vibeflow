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
// Breaks when: the orchestrator's OpenCode row starts calling an agent the edition does not ship (a new role, or a renamed one), or a command is written to load a skill that is not among the installed workflows, while the CLI's list and the test's list stay as they are.
// Not covered by: test/cli-kit.test.mjs lists the files it expects itself, so it holds the CLI to that list and never reads what the orchestrator and the commands call.
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

// Contract: the .gitignore block ignores what the install wrote and leaves the user's own .opencode/ files tracked, as git itself reads the file.
// Breaks when: a line of the block is written so git reads it differently from what its text suggests (`.opencode/commands/vibeflow-*.md/`, whose trailing slash matches folders only, so no installed command is ignored), and the test's expected block is changed to the same text.
// Not covered by: test/cli-kit.test.mjs compares the block text with its own constant, not what git ignores with it.
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

// Contract: a project that installed OpenCode with the first CLI that had it (0.18.0) and reruns a newer CLI with --force ends up ignoring every path a fresh install ignores, each once, with its own lines kept.
// Breaks when: a workflow enters OPENCODE_WORKFLOWS (so the block gains `.opencode/skills/<name>/`) and the line is not added to GITIGNORE_UPDATES.since.opencode, so existing installs never ignore the new skill.
// Not covered by: test/cli-kit.test.mjs builds its expected OpenCode block from the same workflow list the CLI uses, and the frozen older blocks of test/audit/cli-kit.probes.test.mjs are Cursor's and Copilot's only.
test('OpenCode .gitignore: the 0.18.0 block upgraded by --force ends up with every line a fresh install writes, once', async () => {
  const block018 = [
    '# Vibeflow — installed + generated (remove to track in git)',
    '.vibeflow/',
    '.opencode/agents/architect.md',
    '.opencode/agents/executor.md',
    '.opencode/agents/auditor.md',
    '.opencode/commands/vibeflow-*.md',
    ...['analyze', 'audit', 'discover', 'gen-spec', 'hotfix', 'implement', 'prompt-pack', 'quick', 'stats', 'teach'].map((name) => `.opencode/skills/${name}/`),
  ];
  let freshLines;
  await withInstall(async (ws) => {
    freshLines = readFileSync(join(ws.project, '.gitignore'), 'utf8').split('\n').filter(Boolean);
  });
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    writeFileSync(join(ws.project, '.gitignore'), ['node_modules/', '', ...block018, '', '.env', ''].join('\n'));
    const result = await runCli(ws, ['--opencode', '--force'], { VIBEFLOW_BASE_URL: server.url });
    assert.equal(result.status, 0, result.out);
    const lines = readFileSync(join(ws.project, '.gitignore'), 'utf8').split('\n');
    for (const line of new Set([...freshLines, ...block018, 'node_modules/', '.env'])) {
      assert.equal(lines.filter((l) => l === line).length, 1, `${line}\n${lines.join('\n')}`);
    }
  } finally {
    ws.cleanup();
    await server.close();
  }
});

// ---- the delimited block in the user's files, across the three editions (audit of part 3)

const START = '<!-- vibeflow:start -->';
const END = '<!-- vibeflow:end -->';
const countOf = (text, needle) => text.split(needle).length - 1;

// Runs `--<edition>` once and then `--<edition> --force` (runs - 1) times over a project whose
// `file` starts as `body`, and returns the file after each run and the output of the first.
async function installOver(edition, file, body, runs = 3) {
  const server = await startServer();
  const ws = makeWorkspace();
  try {
    mkdirSync(dirname(join(ws.project, file)), { recursive: true });
    writeFileSync(join(ws.project, file), body);
    const texts = [];
    let firstOut = '';
    for (let run = 0; run < runs; run += 1) {
      const result = await runCli(ws, [`--${edition}`, ...(run ? ['--force'] : [])], { VIBEFLOW_BASE_URL: server.url });
      assert.equal(result.status, 0, result.out);
      if (run === 0) firstOut = result.out;
      texts.push(readFileSync(join(ws.project, file), 'utf8'));
    }
    return { texts, firstOut };
  } finally {
    ws.cleanup();
    await server.close();
  }
}

// Contract: an AGENTS.md that an older CLI wrapped twice and then grew one orphan end per --force (the state of whoever installed 0.17 and reran it) converges to one pair of delimiters in every edition, with the user's text before and after the block kept once, and stays there on reruns.
// Breaks when: the trailing-end sweep in upsertDelimitedBlock goes, or an edition's AGENTS.md source changes its delimiters so its extraction no longer strips them.
// Not covered by: test/cli-kit.test.mjs runs the older-CLI file through Cursor only, so a Copilot or OpenCode source that extracts differently passes unnoticed.
for (const edition of ['cursor', 'copilot', 'opencode']) {
  test(`AGENTS.md block: --${edition} over the file a 0.17 CLI left after four runs converges to one pair and keeps the user's text`, async () => {
    const older = `# Mine\n\nbefore the block\n\n${START}\n${START}\n## Vibeflow Methodology\n\nold text\n${END}\n${END}\n${END}\n${END}\n${END}\n\n## After\n\nafter the block\n`;
    const { texts } = await installOver(edition, 'AGENTS.md', older);
    for (const [run, text] of texts.entries()) {
      assert.equal(countOf(text, START), 1, `run ${run + 1}\n${text}`);
      assert.equal(countOf(text, END), 1, `run ${run + 1}\n${text}`);
      assert.equal(countOf(text, 'before the block'), 1, text);
      assert.equal(countOf(text, 'after the block'), 1, text);
      assert.ok(!text.includes('old text'), text);
      assert.ok(text.startsWith(`# Mine\n\nbefore the block\n\n${START}\n## Vibeflow Methodology\n`), text);
      assert.ok(text.endsWith(`${END}\n\n## After\n\nafter the block\n`), text);
    }
    assert.equal(texts[2], texts[1], 'a rerun changed AGENTS.md');
  });
}

// Contract: an end delimiter above the block (a stray one the user left) does not pair with the block's start: the block between the real pair is replaced and the user's text between the stray end and the block is kept once.
// Breaks when: the end is looked up from the top of the file instead of after the start (the 0.17 code), so the slice goes backwards and the user's text is copied once per run.
// Not covered by: test/cli-kit.test.mjs has no file with an end delimiter above the start.
test('AGENTS.md block: a stray end delimiter above the block is left alone and the user text below it is not copied', async () => {
  const body = `# Mine\n\n${END}\n\nuser middle\n\n${START}\nold\n${END}\n\ntail\n`;
  const { texts } = await installOver('cursor', 'AGENTS.md', body);
  for (const text of texts) {
    assert.equal(countOf(text, 'user middle'), 1, text);
    assert.equal(countOf(text, 'tail'), 1, text);
    assert.equal(countOf(text, START), 1, text);
    assert.ok(!text.includes('\nold\n'), text);
  }
});

// Contract: the sweep that takes the orphan ends an older CLI left takes only ends that follow the block with nothing but blank space between; user text after the block, even with an end delimiter further down, stays.
// Breaks when: the sweep is widened to everything up to the last end delimiter in the file, which deletes the user's text in between.
// Not covered by: test/cli-kit.test.mjs puts the orphan ends right after the block and no end after the user's text, so a greedy sweep passes it (measured by sabotage in the part-3 audit).
test('AGENTS.md block: user text after the block survives a --force even when an end delimiter follows it', async () => {
  const body = `# Mine\n\n${START}\nold\n${END}\n${END}\n\nuser text after the block\n\n${END}\n\ntail\n`;
  const { texts } = await installOver('opencode', 'AGENTS.md', body);
  for (const text of texts) {
    assert.equal(countOf(text, 'user text after the block'), 1, text);
    assert.equal(countOf(text, 'tail'), 1, text);
    assert.equal(countOf(text, START), 1, text);
  }
  assert.equal(texts[2], texts[1]);
});

// Contract: the Copilot legacy block (`## Vibeflow Methodology` with no delimiters) is never overwritten: the user's text around it and the legacy text stay, one delimited block is appended with a warning, and reruns replace only that block.
// Breaks when: the legacy branch is changed to replace from the legacy heading to the end of the file, or the append lands inside the legacy text.
// Not covered by: test/cli-kit.test.mjs has no AGENTS.md with the legacy heading.
test('AGENTS.md block: --copilot over the legacy block keeps every line of the file, appends one pair with a warning, and reruns hold', async () => {
  const legacy = '# Mine\n\nbefore\n\n## Vibeflow Methodology\n\nlegacy text\n\n## After\n\nuser after\n';
  const { texts, firstOut } = await installOver('copilot', 'AGENTS.md', legacy);
  assert.match(firstOut, /remove the old vibeflow block manually/);
  for (const text of texts) {
    assert.ok(text.startsWith(legacy.trimEnd() + '\n\n' + START + '\n## Vibeflow Methodology\n'), text);
    assert.equal(countOf(text, START), 1, text);
    assert.equal(countOf(text, END), 1, text);
    assert.ok(text.endsWith(`${END}\n`), text);
  }
  assert.equal(texts[2], texts[1]);
});

// Contract: the Copilot snippet written into an existing .github/copilot-instructions.md has one pair of delimiters, like the AGENTS.md block, and keeps the user's text.
// Breaks when: the CLI stops taking the source's own pair out of the snippet (copilot/copilot-instructions.md has one inside the fenced block) and wraps it again: 2 start and 2 end from the first run, as before conserto 1 of part 3.
// Not covered by: test/cli-kit.test.mjs never installs over a copilot-instructions.md.
test('copilot-instructions.md: --copilot writes one pair of delimiters and reruns hold', async () => {
  const mine = '# Team rules\n\nuse tabs\n';
  const { texts } = await installOver('copilot', '.github/copilot-instructions.md', mine);
  for (const text of texts) {
    assert.ok(text.startsWith(`${mine}\n${START}\n## Vibeflow`), text);
    assert.equal(countOf(text, START), 1, text);
    assert.equal(countOf(text, END), 1, text);
  }
  assert.equal(texts[2], texts[1]);
});

// Contract: a start delimiter whose end the user deleted never makes the user's text after it disappear: whatever the CLI writes, every line the user had is still in AGENTS.md after any number of --force runs.
// Breaks when: the block is taken from the first start to the first end after it instead of the real pair, so the next --force pairs the orphan start with the end of the block the first run appended and replaces the user's text in between (the behavior in every edition before conserto 1 of part 3, and at base 2c802d7).
// Not covered by: test/cli-kit.test.mjs has no file with a start and no end.
for (const edition of ['cursor', 'copilot', 'opencode']) {
  test(`AGENTS.md block: --${edition} --force never drops the user's text below a start delimiter with no end`, async () => {
    const body = `# Mine\n\n${START}\nmy edited block, end deleted\n\n## My notes\n\nkeep me\n`;
    const { texts } = await installOver(edition, 'AGENTS.md', body);
    for (const [run, text] of texts.entries()) {
      assert.ok(text.includes('## My notes\n\nkeep me'), `run ${run + 1}\n${text}`);
      assert.ok(text.includes('my edited block, end deleted'), `run ${run + 1}\n${text}`);
    }
  });
}
