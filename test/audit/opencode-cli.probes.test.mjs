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
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

// ---- delimiter states the part-3 reaudit built (reaudit 1 of part 3)

// Contract: in any arrangement of delimiters, the CLI replaces only the first real pair (the first end with a start above it, and the start nearest above that end); every other start and end, and every line of the user's text, stays where it is, once, and the file settles by the second run.
// Breaks when: the start is looked up in the whole file instead of above the end (the user's text is copied once per run when a start follows the block), the first start of the file opens the pair (an orphan start above the block swallows the user's text), or the last pair wins over the first.
// Not covered by: test/cli-kit.test.mjs has only a clean AGENTS.md and the file an older CLI left; none of these states.
const STATES = [
  {
    name: 'two well-formed pairs: the first is replaced, the second is left as it is',
    edition: 'cursor',
    body: `# Mine\n\nU-top\n\n${START}\nold one\n${END}\n\nU-middle\n\n${START}\nold two\n${END}\n\nU-tail\n`,
    keep: ['U-top', 'U-middle', 'U-tail', 'old two'],
    gone: ['old one'],
    pairs: [2, 2],
    order: ['U-top', '## Vibeflow Methodology', 'U-middle', 'old two', 'U-tail'],
  },
  {
    name: 'an end above an orphan start, and no pair: both stay, and the appended block is the one replaced',
    edition: 'copilot',
    body: `# Mine\n\n${END}\n\nU-mid\n\n${START}\nU-edited block, end deleted\n\nU-keep\n`,
    keep: ['U-mid', 'U-edited block, end deleted', 'U-keep'],
    gone: [],
    pairs: [2, 2],
    order: ['U-mid', 'U-edited block, end deleted', 'U-keep', '## Vibeflow Methodology'],
  },
  {
    name: 'an orphan start after the block, with the user\'s text below it',
    edition: 'opencode',
    body: `# Mine\n\n${START}\nold\n${END}\n\nU-mid\n\n${START}\nU-orphan text\n\nU-keep\n`,
    keep: ['U-mid', 'U-orphan text', 'U-keep'],
    gone: ['\nold\n'],
    pairs: [2, 1],
    order: ['## Vibeflow Methodology', 'U-mid', 'U-orphan text', 'U-keep'],
  },
  {
    name: 'stray ends inside the user\'s text, above and below the block',
    edition: 'cursor',
    body: `# Mine\n\nU-one\n${END}\nU-two\n\n${START}\nold\n${END}\n\nU-three\n${END}\nU-four\n`,
    keep: ['U-one', 'U-two', 'U-three', 'U-four'],
    gone: ['\nold\n'],
    pairs: [1, 3],
    order: ['U-one', 'U-two', '## Vibeflow Methodology', 'U-three', 'U-four'],
  },
  {
    name: 'the block at the very end of the file, with no newline after its end',
    edition: 'opencode',
    body: `# Mine\n\nU-top\n\n${START}\nold\n${END}`,
    keep: ['U-top'],
    gone: ['\nold\n'],
    pairs: [1, 1],
    order: ['U-top', '## Vibeflow Methodology'],
  },
];
for (const state of STATES) {
  test(`AGENTS.md block: --${state.edition} over ${state.name}`, async () => {
    const { texts } = await installOver(state.edition, 'AGENTS.md', state.body);
    for (const [run, text] of texts.entries()) {
      const where = `run ${run + 1}\n${text}`;
      for (const line of state.keep) assert.equal(countOf(text, line), 1, `${line}: ${where}`);
      for (const line of state.gone) assert.ok(!text.includes(line), `${line}: ${where}`);
      assert.equal(countOf(text, START), state.pairs[0], where);
      assert.equal(countOf(text, END), state.pairs[1], where);
      assert.equal(countOf(text, '## Vibeflow Methodology'), 1, where);
      const at = state.order.map((line) => text.indexOf(line));
      assert.deepEqual([...at].sort((a, b) => a - b), at, `order ${state.order.join(' < ')}: ${where}`);
    }
    assert.equal(texts[2], texts[1], 'a rerun changed AGENTS.md');
  });
}

// Contract: a .github/copilot-instructions.md that a 0.17 CLI wrapped twice and grew one orphan end per --force converges to one pair, with the user's text before and after the snippet kept once, like AGENTS.md.
// Breaks when: the sweep of an older CLI's leftovers (the extra start above the pair, the ends below it) is kept for AGENTS.md only, for instance moved into its caller or given to the snippet a writer of its own, so this file stays at 1 start and 3 ends.
// Not covered by: test/cli-kit.test.mjs never installs over a copilot-instructions.md, and the D1 probe above starts from a file with no block.
test('copilot-instructions.md: --copilot over the file a 0.17 CLI left converges to one pair and keeps the user\'s text', async () => {
  const older = `# Team rules\n\nuse tabs\n\n${START}\n${START}\n## Vibeflow\n\nold snippet\n${END}\n${END}\n${END}\n${END}\n\n## Mine after\n\nkeep after\n`;
  const { texts } = await installOver('copilot', '.github/copilot-instructions.md', older);
  for (const [run, text] of texts.entries()) {
    const where = `run ${run + 1}\n${text}`;
    assert.equal(countOf(text, START), 1, where);
    assert.equal(countOf(text, END), 1, where);
    assert.ok(!text.includes('old snippet'), where);
    assert.ok(text.startsWith(`# Team rules\n\nuse tabs\n\n${START}\n## Vibeflow`), where);
    assert.ok(text.endsWith(`${END}\n\n## Mine after\n\nkeep after\n`), where);
  }
  assert.equal(texts[2], texts[1]);
});

// ---- markers the user quotes in prose or code (conserto 2 of part 3, from the Codex review)

// Contract: only a marker that is the whole line (spaces around it aside) is a delimiter; a marker quoted inside a line of the user's text (between backticks, at the head of a sentence) is the user's text, so no line of it is replaced, moved or swept, in any edition and in any position: with no real pair the block is appended below the whole file, and with a real pair only what is between that pair changes.
// Breaks when: findDelimitedPair, the sweep of an older CLI's leftover start above the pair and ends below it, or withoutOwnDelimiters look the marker up as a substring anywhere in the file again (the code at 12089a9): an AGENTS.md that explains the block format, "Opening token: `<!-- vibeflow:start -->`" over a rule over "Closing token: `<!-- vibeflow:end -->`", loses the rule and gets the block inside the quote, and a sentence that opens with the end marker right after the block loses its marker and the line break before it.
// Not covered by: every other block case writes the markers as whole lines; test/cli-kit.test.mjs has no quoted marker.
const QUOTED = [
  {
    name: 'a quoted start and end around a rule, and no real pair',
    body: `# My rules\n\nThe Vibeflow block uses markers:\n\nOpening token: \`${START}\`\nNEVER-DEPLOY-WITHOUT-HUMAN-APPROVAL.\nClosing token: \`${END}\`\n\nEnd.\n`,
    before: `# My rules\n\nThe Vibeflow block uses markers:\n\nOpening token: \`${START}\`\nNEVER-DEPLOY-WITHOUT-HUMAN-APPROVAL.\nClosing token: \`${END}\`\n\nEnd.\n\n`,
    after: '\n',
  },
  {
    name: 'a quoted marker in the user\'s text above the real block',
    body: `# My rules\n\nOpening token: \`${START}\`\nKEEP-ABOVE, and every block opens with ${START}\n\n${START}\nold\n${END}\n\nEnd.\n`,
    before: `# My rules\n\nOpening token: \`${START}\`\nKEEP-ABOVE, and every block opens with ${START}\n\n`,
    after: '\n\nEnd.\n',
  },
  {
    name: 'a quoted marker in the user\'s text right below the real block',
    body: `# My rules\n\n${START}\nold\n${END}\n${END} is a literal token, KEEP-BELOW.\nClosing token: \`${END}\`\n\nEnd.\n`,
    before: '# My rules\n\n',
    after: `\n${END} is a literal token, KEEP-BELOW.\nClosing token: \`${END}\`\n\nEnd.\n`,
  },
];
for (const edition of ['cursor', 'copilot', 'opencode']) {
  for (const state of QUOTED) {
    test(`AGENTS.md block: --${edition} over ${state.name} keeps every line the user wrote`, async () => {
      const { texts } = await installOver(edition, 'AGENTS.md', state.body);
      for (const [run, text] of texts.entries()) {
        const where = `run ${run + 1}\n${text}`;
        assert.ok(text.startsWith(state.before + `${START}\n## Vibeflow Methodology\n`), where);
        assert.ok(text.endsWith(`${END}${state.after}`), where);
        const block = text.slice(state.before.length, text.length - state.after.length);
        assert.ok(block.startsWith(`${START}\n`) && block.endsWith(`\n${END}`), where);
        assert.equal(countOf(block, START), 1, where);
        assert.equal(countOf(block, END), 1, where);
        assert.ok(!text.includes('\nold\n'), where);
      }
      assert.equal(texts[2], texts[1], 'a rerun changed AGENTS.md');
    });
  }
}

// ---- reaudit 2 of part 3: the marker and link forms the two fixes did not set up

// A server like startServer, with some paths answered by a given body instead of the file.
async function startServerWith(overrides) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/+/, '');
    if (overrides[path] !== undefined) {
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
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

// Contract: "the whole line" tolerates spaces and tabs around the marker and a CRLF line end, so a real pair the user indented, or a file saved with Windows line ends, is recognised as the block: one pair, its old content gone, the user's lines around it kept, and the same file on every rerun.
// Breaks when: the marker test is rewritten as a line comparison (`text.split('\n')` and `line === marker`, or `line.trim() === marker` over a split that leaves the `\r`), or the regex loses its `[ \t]*`: the real pair is no longer seen, a second block is appended under it with the old content left in place.
// Not covered by: every block case of the executor and of the earlier audits writes the markers at column 0 with LF line ends.
const LINE_FORMS = [
  { name: 'a real pair indented with spaces', body: `# My rules\r\n\n  ${START}\nold\n  ${END}\n\nKEEP-TAIL.\n` },
  { name: 'a real pair with a tab before and spaces after', body: `# My rules\n\n\t${START} \t\nold\n${END}\t\n\nKEEP-TAIL.\n` },
  { name: 'a real pair in a CRLF file, with the orphan end an older CLI left', body: `# My rules\r\n\r\n${START}\r\nold\r\n${END}\r\n${END}\r\n\r\nKEEP-TAIL.\r\n` },
];
for (const edition of ['cursor', 'copilot', 'opencode']) {
  for (const form of LINE_FORMS) {
    test(`AGENTS.md block: --${edition} over ${form.name} replaces that pair and keeps the rest`, async () => {
      const { texts } = await installOver(edition, 'AGENTS.md', form.body);
      for (const [run, text] of texts.entries()) {
        const where = `run ${run + 1}\n${JSON.stringify(text)}`;
        assert.equal(countOf(text, START), 1, where);
        assert.equal(countOf(text, END), 1, where);
        assert.ok(!/\bold\b/.test(text), where);
        assert.ok(text.startsWith('# My rules'), where);
        assert.equal(countOf(text, 'KEEP-TAIL.'), 1, where);
        assert.ok(text.indexOf('KEEP-TAIL.') > text.indexOf(END), where);
      }
      assert.equal(texts[2], texts[1], 'a rerun changed AGENTS.md');
    });
  }
}

// Contract: the edition's own source loses only its own pair, the first start that is a whole line and the last end that is a whole line; a marker the source quotes in prose, inside or outside that pair, is never taken as its delimiter, so the block in the user's file starts and ends where the source's pair does and has exactly one start and one end line.
// Breaks when: withoutOwnDelimiters goes back to indexOf and lastIndexOf (the code at 12089a9): a source line that quotes the start above its pair puts the source's prose and its real start inside the user's block, and the user's file ends up with two start lines.
// Not covered by: the real sources quote no marker, and no test of the executor swaps the source, so the reversal passes the whole suite (sabotage S6 of this reaudit).
for (const edition of ['cursor', 'copilot', 'opencode']) {
  test(`AGENTS.md block: --${edition} takes off only its source's whole-line pair when the source quotes the markers`, async () => {
    const source = readFileSync(join(ROOT, edition, 'AGENTS.md'), 'utf8');
    assert.equal(countOf(source, `\n${START}\n`), 1, 'the source has one whole-line start');
    const quoted = source
      .replace(`\n${START}\n`, `\nSOURCE-PROSE-ABOVE opens with \`${START}\`.\n\n${START}\nQUOTED-INSIDE-START \`${END}\`\n`)
      .replace(`\n${END}`, `\nQUOTED-INSIDE-END \`${START}\`\n${END}\nSOURCE-PROSE-BELOW closes with \`${END}\`.`);
    const server = await startServerWith({ [`${edition}/AGENTS.md`]: quoted });
    const ws = makeWorkspace();
    try {
      writeFileSync(join(ws.project, 'AGENTS.md'), '# Mine\n\nKEEP.\n');
      const texts = [];
      for (const args of [[`--${edition}`], [`--${edition}`, '--force']]) {
        const result = await runCli(ws, args, { VIBEFLOW_BASE_URL: server.url });
        assert.equal(result.status, 0, result.out);
        texts.push(readFileSync(join(ws.project, 'AGENTS.md'), 'utf8'));
      }
      for (const text of texts) {
        const lines = text.split('\n');
        assert.equal(lines.filter((line) => line === START).length, 1, text);
        assert.equal(lines.filter((line) => line === END).length, 1, text);
        const block = text.slice(text.indexOf(`${START}\n`), text.lastIndexOf(END));
        assert.ok(block.includes('QUOTED-INSIDE-START') && block.includes('QUOTED-INSIDE-END'), text);
        assert.ok(!text.includes('SOURCE-PROSE-ABOVE') && !text.includes('SOURCE-PROSE-BELOW'), text);
        assert.equal(countOf(text, 'KEEP.'), 1, text);
      }
      assert.equal(texts[1], texts[0], 'a rerun changed AGENTS.md');
    } finally {
      ws.cleanup();
      await server.close();
    }
  });
}

// Contract (the p3b briefing's): nothing the user wrote around a pair is lost. A Vibeflow pair the user writes inside a fenced code block, to document the format, is the user's example.
// Breaks when: markerLines stops skipping the code lines (the code from conserto 2 to e0283d5, where a marker alone on its line was a delimiter wherever it sat, fences included): with no real pair the example is replaced by the block inside the fence; with a real pair below the fence, the example is replaced and the real block keeps its old content on every rerun.
// Not covered by: before conserto 4 no test fenced a marker. Opened as todo by reaudit 2 of part 3 (defect D1) and closed by conserto 4, with test/cli-kit.test.mjs covering the other fence forms.
const FENCE = '```';
const FENCED = [
  { name: 'a fenced example pair and no real pair', body: `# My rules\n\n${FENCE}markdown\n${START}\nUSER-EXAMPLE\n${END}\n${FENCE}\n\nEnd.\n` },
  { name: 'a fenced example pair above the real block', body: `# My rules\n\n${FENCE}\n${START}\nUSER-EXAMPLE\n${END}\n${FENCE}\n\n${START}\nold\n${END}\n\nEnd.\n` },
];
for (const edition of ['cursor', 'copilot', 'opencode']) {
  for (const state of FENCED) {
    test(`AGENTS.md block: --${edition} over ${state.name} keeps the example`, async () => {
      const { texts } = await installOver(edition, 'AGENTS.md', state.body);
      for (const text of texts) {
        assert.equal(countOf(text, 'USER-EXAMPLE'), 1, text);
        assert.ok(!/\nold\n/.test(text), text);
      }
    });
  }
}

// Every entry under `dir`, links listed and never followed, with each file's content.
function treeOf(dir) {
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
const PROBE_KIT = { cursor: '.cursor/skills/vibeflow-implement/loop', copilot: '.github/vibeflow/loop', opencode: '.opencode/skills/implement/loop' };
const PROBE_DIR = { cursor: '.cursor', copilot: '.github', opencode: '.opencode' };
const PROBE_MARKER = { cursor: '.cursor/rules/vibeflow.mdc', copilot: '.github/prompts/vibeflow-analyze.prompt.md', opencode: '.opencode/commands/vibeflow-analyze.md' };
const linkAt = (target, at) => { mkdirSync(dirname(at), { recursive: true }); symlinkSync(target, at); };

// Contract: a link that leads out of the project refuses the whole install, with and without --force, whatever the installer would write through it: the files it edits (`.gitignore`, and `.github/copilot-instructions.md` in Copilot) as much as the ones it creates; a folder beside the project whose name starts with the project's own name is outside it; and a link whose first hop stays in the project but whose second leaves it is outside. Nothing is written anywhere, the refusal names the file and says it is outside the project.
// Breaks when: `.gitignore` or `copilot-instructions.md` leave the list checked before the first download (the writes of the edited files catch their own errors, log them and the install exits 0 with the edition written and the edited file refused late); the inside test compares string prefixes without the separator (`<project>-twin` passes as inside); or the landing follows one readlink hop instead of resolving the chain.
// Not covered by: the executor's outside folder is named `outside`, never a prefix twin; its forms put the link on the kit folder, the edition folder, a kit file and AGENTS.md, never on `.gitignore` or `copilot-instructions.md`; and every link of its cases points straight at the final target (sabotages S7, S9 and S10 of this reaudit survive its 18 cases; S14, one readlink hop, dies there only because macOS tmp sits under a /var link).
const OUT_FORMS = [
  { name: '.gitignore is a link to a file outside', editions: ['cursor', 'copilot', 'opencode'], set: (ws, edition, outside) => linkAt(join(outside, 'gitignore'), join(ws.project, '.gitignore')), names: () => '.gitignore' },
  { name: 'copilot-instructions.md is a link to a file outside', editions: ['copilot'], set: (ws, edition, outside) => linkAt(join(outside, 'copilot-instructions.md'), join(ws.project, '.github/copilot-instructions.md')), names: () => '.github/copilot-instructions.md' },
  { name: 'the edition folder links to a twin folder named after the project', editions: ['cursor', 'copilot', 'opencode'], set: (ws, edition) => { mkdirSync(`${ws.project}-twin`); linkAt(`${ws.project}-twin`, join(ws.project, PROBE_DIR[edition])); }, names: (edition) => PROBE_DIR[edition] },
  { name: 'the kit scripts folder links to a link in the project that leads outside', editions: ['cursor', 'copilot', 'opencode'], set: (ws, edition, outside) => { symlinkSync(outside, join(ws.project, 'bridge')); linkAt(relative(join(ws.project, PROBE_KIT[edition]), join(ws.project, 'bridge')), join(ws.project, PROBE_KIT[edition], 'scripts')); }, names: (edition) => `${PROBE_KIT[edition]}/scripts` },
];
for (const form of OUT_FORMS) {
  for (const edition of form.editions) {
    test(`--${edition} refuses the whole install when ${form.name}, with or without --force`, async () => {
      const server = await startServer();
      const ws = makeWorkspace();
      try {
        const outside = join(ws.root, 'outside');
        mkdirSync(outside);
        writeFileSync(join(outside, 'gitignore'), 'node_modules/\n');
        writeFileSync(join(outside, 'copilot-instructions.md'), '# Shared elsewhere\n');
        form.set(ws, edition, outside);
        const before = treeOf(ws.root);
        for (const args of [[`--${edition}`], [`--${edition}`, '--force']]) {
          const result = await runCli(ws, args, { VIBEFLOW_BASE_URL: server.url });
          assert.notEqual(result.status, 0, `${args.join(' ')} exited 0\n${result.out}`);
          assert.match(result.out, /outside the project/, result.out);
          assert.match(result.out, /Nothing was installed/, result.out);
          const named = form.names(edition);
          assert.ok(result.out.includes(named), `the refusal names ${named}\n${result.out}`);
          assert.deepEqual(treeOf(ws.root), before, `${args.join(' ')} wrote something`);
        }
      } finally {
        ws.cleanup();
        await server.close();
      }
    });
  }
}

// Contract: the boundary is where a write lands, links resolved, not whether a link exists: a link that leaves the project and comes back into it, a chain of links that ends in the project, a relative link, and the edited files linked to files of the project (`AGENTS.md` to `CLAUDE.md`, `.gitignore` to a file in a folder of the project) all install, with and without --force, the writes landing in the file or folder the chain ends at and nothing written outside.
// Breaks when: the landing resolves a single readlink hop instead of the chain, which refuses the out-and-back link; or the monorepo refusal is implemented on the edited files as "refuse when AGENTS.md or .gitignore is a link" instead of "when it lands outside", which refuses `AGENTS.md` -> `CLAUDE.md`. Either way the installer refuses a project it is meant to serve.
// Not covered by: the executor's one inside case is a single absolute link from the kit scripts folder to a folder of the project; it kills the single hop on macOS only because the tmp folder sits under the /var link, and on the CI's Linux it would pass.
const IN_FORMS = [
  { name: 'the edition folder leaves the project and links back into it', set: (ws, edition, outside) => { mkdirSync(join(ws.project, 'real')); symlinkSync(join(ws.project, 'real'), join(outside, 'back')); linkAt(join(outside, 'back'), join(ws.project, PROBE_DIR[edition])); }, lands: (ws) => [join(ws.project, 'real')] },
  { name: 'the kit scripts folder is a relative link to a link of the project that ends in a folder of it', set: (ws, edition) => { mkdirSync(join(ws.project, 'shared')); symlinkSync('shared', join(ws.project, 'bridge')); linkAt(relative(join(ws.project, PROBE_KIT[edition]), join(ws.project, 'bridge')), join(ws.project, PROBE_KIT[edition], 'scripts')); }, lands: (ws) => [join(ws.project, 'shared')] },
  { name: 'AGENTS.md links to CLAUDE.md and .gitignore to config/gitignore', set: (ws) => { writeFileSync(join(ws.project, 'CLAUDE.md'), '# Mine\n'); symlinkSync('CLAUDE.md', join(ws.project, 'AGENTS.md')); mkdirSync(join(ws.project, 'config')); writeFileSync(join(ws.project, 'config/gitignore'), 'node_modules/\n'); symlinkSync('config/gitignore', join(ws.project, '.gitignore')); }, lands: (ws) => [join(ws.project, 'CLAUDE.md'), join(ws.project, 'config/gitignore')] },
];
for (const form of IN_FORMS) {
  for (const edition of ['cursor', 'copilot', 'opencode']) {
    test(`--${edition} installs when ${form.name}, with or without --force`, async () => {
      const server = await startServer();
      const ws = makeWorkspace();
      try {
        const outside = join(ws.root, 'outside');
        mkdirSync(outside);
        form.set(ws, edition, outside);
        const outsideBefore = treeOf(outside);
        for (const args of [[`--${edition}`], [`--${edition}`, '--force']]) {
          const result = await runCli(ws, args, { VIBEFLOW_BASE_URL: server.url });
          assert.equal(result.status, 0, `${args.join(' ')}\n${result.out}`);
          assert.doesNotMatch(result.out, /outside the project/, result.out);
          assert.ok(existsSync(join(ws.project, PROBE_MARKER[edition])), `${args.join(' ')}: the edition is installed`);
          assert.deepEqual(treeOf(outside), outsideBefore, `${args.join(' ')} wrote outside the project`);
          for (const landing of form.lands(ws)) assert.ok(existsSync(landing), `${landing} exists`);
        }
        if (form.name.startsWith('AGENTS.md')) {
          assert.match(readFileSync(join(ws.project, 'CLAUDE.md'), 'utf8'), /^# Mine\n[^]*<!-- vibeflow:start -->/, 'the block lands in CLAUDE.md, after the user text');
          assert.match(readFileSync(join(ws.project, 'config/gitignore'), 'utf8'), /^node_modules\/\n[^]*vibeflow/i, 'the Vibeflow paths land in config/gitignore');
        } else {
          const [folder] = form.lands(ws);
          const wanted = folder.endsWith('shared') ? 'check-briefing.mjs' : PROBE_MARKER[edition].slice(PROBE_DIR[edition].length + 1);
          assert.ok(walk(folder).includes(wanted), `the writes land in ${folder}: ${wanted}`);
        }
      } finally {
        ws.cleanup();
        await server.close();
      }
    });
  }
}

