// Audit probes, vibeflow 1.16 part 3 (`implement --loop`, the orchestrator, the executor role).
// The orchestrator is a prompt, so its behavior is the commands it tells the session to run.
// Each probe takes a command, a marker or a table from the kit's own text, runs it with the kit's
// real scripts in a hermetic git sandbox, and checks the exit code and the effect. The executor's
// test pins the wording; these pin that the wording and the scripts agree.
// Cases reproducing open findings of .vibeflow/audits/vibeflow-1-16-p3-audit.md are `todo` with
// the finding's id, so the suite stays green. Nothing here reads the git history of this repository
// or the real clock. Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOOP_DIR, hermeticEnv, runScript, withSandbox } from '../loop-helpers.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const kit = (name) => readFileSync(join(LOOP_DIR, name), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const ARTIFACTS = ['.vibeflow/loop/', '.vibeflow/briefings/', '.vibeflow/progress/', '.vibeflow/reviews/', '.vibeflow/audits/'];

// Every `scripts/<name>.mjs ...` command written between backticks in orchestrator.md.
function orchestratorCommands() {
  return [...flat(kit('orchestrator.md')).matchAll(/`scripts\/([a-z-]+\.mjs)([^`]*)`/g)]
    .map((match) => ({ script: match[1], args: match[2].trim(), text: match[0] }));
}

// Split a command's arguments, keeping each <placeholder with spaces> as one token, and fill
// them from `values`. `<briefing globs>` and `<file>...` expand to lists.
function fill(args, values) {
  const tokens = args.match(/<[^>]+>(?:\.\.\.)?|\S+/g) ?? [];
  return tokens.flatMap((token) => {
    if (!token.includes('<')) return [token];
    const key = token.replace(/\.\.\.$/, '');
    const whole = /^<[^>]+>$/.test(key);
    if (whole) {
      assert.ok(key in values, `placeholder ${key} has a value`);
      return [].concat(values[key]);
    }
    // a path with placeholders inside, such as .vibeflow/reviews/<feature>-<part>-round-0.md
    return [key.replace(/<[^>]+>/g, (name) => {
      assert.ok(name in values, `placeholder ${name} has a value`);
      return values[name];
    })];
  });
}

// A briefing filled from its template in briefings.md, as the orchestrator writes it.
function briefingFromTemplate(role) {
  const heading = { executor: 'Executor', fix: 'Fix', auditor: 'Auditor', reauditor: 'Re-auditor' }[role];
  const text = kit('briefings.md');
  const start = text.indexOf(`## ${heading}\n`);
  assert.ok(start !== -1, `briefings.md has the ${heading} template`);
  const fence = /```markdown\n([\s\S]*?)\n```/.exec(text.slice(start));
  assert.ok(fence, `${heading} template is fenced`);
  return fence[1].replace(/HH:MM/g, '09:00').replace(/<[^>]+>/g, 'value');
}

// The sandbox of loop-helpers on a feature branch, with a part's work, the loop's artifacts as
// the orchestrator names them, and briefings written from the templates.
function loopRound(sandbox, { feature = 'login', part = '1' } = {}) {
  sandbox.git('checkout', '-q', '-b', `feat/${feature}`);
  const base = sandbox.git('rev-parse', 'HEAD').trim();
  sandbox.write('src/login.ts', 'export const login = () => true\n');
  sandbox.write('tests/login.test.ts', "import { login } from '../src/login'\n");
  sandbox.write(`.vibeflow/loop/${feature}.md`, '# loop\n');
  sandbox.write(`.vibeflow/progress/${feature}-${part}.md`, '# progress\nState: final\n');
  const briefings = {};
  for (const [role, suffix] of [['executor', 'executor'], ['auditor', 'auditor'], ['fix', 'fix-1']]) {
    briefings[role] = sandbox.write(`.vibeflow/briefings/${feature}-${part}-${suffix}.md`, briefingFromTemplate(role));
  }
  sandbox.write(`.vibeflow/audits/${feature}-${part}-audit.md`, 'Stage: 2/7 spec\n**Verdict: pending**\n');
  return { base, briefings, feature, part };
}

function watch(file, extra) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(LOOP_DIR, 'scripts/watch-round.mjs'), '--file', file, ...extra], { env: hermeticEnv(dirname(file)) });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('close', (status) => resolve({ status, out }));
  });
}

// The orchestrator runs every command from the project root, so its relative paths
// (.vibeflow/reviews/...) land in the project: the probe runs each script from the sandbox's root.
function runIn(cwd, script, args, env) {
  const result = spawnSync(process.execPath, [join(LOOP_DIR, 'scripts', script), ...args], { cwd, env, encoding: 'utf8', timeout: 20_000 });
  return { status: result.status, stdout: result.stdout ?? '', out: `${result.stdout}${result.stderr}` };
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// p3-1 -------------------------------------------------------------------------------------
test('p3-1: every script command orchestrator.md writes runs with the kit, none answers 64', () => {
  withSandbox((sandbox) => {
    const round = loopRound(sandbox);
    sandbox.git('add', 'src/login.ts', 'tests/login.test.ts');
    sandbox.git('commit', '-q', '-m', 'login part 1, round 0, before PASS', '--', 'src/login.ts', 'tests/login.test.ts');
    const roundCommit = sandbox.git('rev-parse', 'HEAD').trim();
    sandbox.write('src/login.ts', 'export const login = () => false\n');
    const values = {
      '<project root>': sandbox.repo,
      '<expected hours>': '2',
      '<file>': 'src/rules.ts',
      '<executor briefing>': round.briefings.executor,
      '<auditor briefing>': round.briefings.auditor,
      '<fix briefing>': round.briefings.fix,
      '<part base>': round.base,
      '<round commit>': roundCommit,
      '<briefing globs>': ['src/**', 'tests/**'],
      '<feature>': round.feature,
      '<part>': round.part,
      '<r>': '1',
    };
    const commands = orchestratorCommands().filter((command) => command.script !== 'watch-round.mjs');
    const names = new Set(commands.map((command) => command.script));
    for (const name of ['preflight.mjs', 'who-reads.mjs', 'check-briefing.mjs', 'perimeter.mjs', 'review-package.mjs']) {
      assert.ok(names.has(name), `orchestrator.md writes a ${name} command`);
    }
    const expected = {
      'preflight.mjs': [0, 1],
      'who-reads.mjs': [0, 1],
      'check-briefing.mjs': [0],
      'perimeter.mjs': [0],
      'review-package.mjs': [0],
    };
    for (const command of commands) {
      // preflight leaves the network out so the probe runs offline, as the CI does
      const argv = [...fill(command.args, values), ...(command.script === 'preflight.mjs' ? ['--no-network'] : [])];
      const result = runIn(sandbox.repo, command.script, argv, sandbox.env());
      assert.ok(expected[command.script].includes(result.status), `${command.text} exited ${result.status}, expected ${expected[command.script].join(' or ')}:\n${result.out}`);
    }
    // the two packages the orchestrator names were written where the audit will read them
    assert.ok(existsSync(join(sandbox.repo, '.vibeflow/reviews/login-1-round-0.md')), 'round-0 package written');
    const fixPackage = readFileSync(join(sandbox.repo, '.vibeflow/reviews/login-1-round-1.md'), 'utf8');
    assert.match(fixPackage, /src\/login\.ts/, 'the fix package holds the fix');
    assert.doesNotMatch(fixPackage, /New file: tests\/login\.test\.ts/, 'the fix package leaves the committed round out');
  });
});

// p3-2 -------------------------------------------------------------------------------------
test('p3-2: the perimeter command, with the artifact folders as orchestrator.md passes them, stays clean with .vibeflow/ tracked and names a stranger\'s file', () => {
  withSandbox((sandbox) => {
    sandbox.write('.vibeflow/specs/login.md', '# spec\n');
    sandbox.git('add', '.vibeflow/specs/login.md');
    sandbox.git('commit', '-q', '-m', 'track .vibeflow');
    const round = loopRound(sandbox);
    const command = orchestratorCommands().find((entry) => entry.script === 'perimeter.mjs');
    assert.ok(command, 'orchestrator.md writes the perimeter command');
    for (const folder of ARTIFACTS) assert.ok(command.args.includes(folder), `the perimeter command passes ${folder}`);
    const argv = fill(command.args, { '<project root>': sandbox.repo, '<part base>': round.base, '<briefing globs>': ['src/**', 'tests/**'] });
    const clean = runIn(sandbox.repo, 'perimeter.mjs', argv, sandbox.env());
    assert.equal(clean.status, 0, clean.out);
    sandbox.write('notes/owner-unknown.txt', 'someone else\n');
    const dirty = runIn(sandbox.repo, 'perimeter.mjs', argv, sandbox.env());
    assert.equal(dirty.status, 1, dirty.out);
    assert.match(dirty.out, /outside notes\/owner-unknown\.txt/);
    assert.doesNotMatch(dirty.out, /outside \.vibeflow\//, 'no loop artifact reads as outside');
  });
});

// p3-3 -------------------------------------------------------------------------------------
// The fix loop's step 2 names the commit by its git commands between backticks. Run them, in
// order, on a round whose files are new (the probe file is always new at round 0).
test('p3-3: the round commit as orchestrator.md writes it commits the part\'s new files and the probe file, and nothing else', { todo: 'F4: `git commit -- <paths>` refuses untracked files (pathspec did not match)' }, () => {
  withSandbox((sandbox) => {
    loopRound(sandbox);
    sandbox.write('tests/audit/login-1.test.ts', 'probe\n');
    sandbox.write('notes/owner-unknown.txt', 'someone else\n');
    const step = /\n2\. Commit the round[^\n]*/.exec(kit('orchestrator.md'));
    assert.ok(step, 'fix loop step 2');
    const gitCommands = [...step[0].matchAll(/`(git [^`]+)`/g)].map((match) => match[1]).filter((command) => !/--no-verify/.test(command));
    assert.ok(gitCommands.some((command) => command.startsWith('git commit')), 'step 2 names the commit command');
    const paths = ['src/login.ts', 'tests/login.test.ts', 'tests/audit/login-1.test.ts'];
    for (const command of gitCommands) {
      const argv = command.split(/\s+/).slice(1).flatMap((token) => (token === '<paths>' ? paths : [token]));
      if (argv[0] === 'commit' && !argv.includes('-m')) argv.splice(1, 0, '-m', 'login part 1, round 0, before PASS');
      sandbox.git(...argv);
    }
    const committed = sandbox.git('show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort();
    assert.deepEqual(committed, [...paths].sort());
    assert.match(sandbox.git('status', '--short'), /\?\? notes\//, 'a stranger\'s file stays out');
  });
});

// p3-4 -------------------------------------------------------------------------------------
// Two parts run in order. orchestrator.md records each part's base as `git rev-parse HEAD`
// (Executor briefing, step 6) and commits only below PASS (Fix loop, step 2), so part 1 passing
// at its first audit leaves its work uncommitted when part 2 starts.
test('p3-4: after part 1 passes, part 2\'s perimeter and review package hold only part 2', { todo: 'F3: part 1 passing uncommitted stays in part 2\'s base diff' }, () => {
  withSandbox((sandbox) => {
    const one = loopRound(sandbox, { part: '1' });
    const audit = runIn(sandbox.repo, 'review-package.mjs', [sandbox.repo, one.base, '.vibeflow/reviews/login-1-round-0.md'], sandbox.env());
    assert.equal(audit.status, 0, audit.out);
    // part 1: PASS. "PASS ends the part: record it, then the next part"
    const base2 = sandbox.git('rev-parse', 'HEAD').trim();
    sandbox.write('src/session.ts', 'export const session = 1\n');
    sandbox.write('.vibeflow/progress/login-2.md', 'State: final\n');
    const perimeter = runIn(sandbox.repo, 'perimeter.mjs', [sandbox.repo, base2, 'src/session.ts', ...ARTIFACTS], sandbox.env());
    assert.equal(perimeter.status, 0, `part 1's files read as outside part 2:\n${perimeter.out}`);
    const pkg = runIn(sandbox.repo, 'review-package.mjs', [sandbox.repo, base2, '.vibeflow/reviews/login-2-round-0.md'], sandbox.env());
    assert.equal(pkg.status, 0, pkg.out);
    assert.doesNotMatch(readFileSync(join(sandbox.repo, '.vibeflow/reviews/login-2-round-0.md'), 'utf8'), /src\/login\.ts/, 'part 2\'s package carries part 1\'s diff');
  });
});

// p3-5 -------------------------------------------------------------------------------------
test('p3-5: watch-round ends a fix round on the marker roles/executor.md prescribes, not on the earlier round\'s', async () => {
  const marker = /`(State: final · fix )<round>`/.exec(kit('roles/executor.md'));
  assert.ok(marker, 'roles/executor.md prescribes the fix-round marker');
  assert.ok(flat(kit('orchestrator.md')).includes('`scripts/watch-round.mjs --file <progress file or report>`'), 'orchestrator.md writes the watch command');
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-audit-p3-'));
  try {
    const progress = join(dir, 'login-1.md');
    writeFileSync(progress, '# progress\n\nState: final\n');
    let ended = false;
    const running = watch(progress, ['--interval-sec', '0.1', '--stale-min', '0.2', '--timeout-min', '0.5']).then((result) => { ended = true; return result; });
    await sleep(400);
    appendFileSync(progress, '\n## Fix 1\n* reading the report\n');
    await sleep(400);
    assert.equal(ended, false, 'the round-0 marker and a fix section without its marker do not end the watch');
    appendFileSync(progress, `* fixed F1, test red then green\n${marker[1]}1\n`);
    const result = await running;
    assert.equal(result.status, 0, result.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// p3-6 -------------------------------------------------------------------------------------
test('p3-6: the rounds table orchestrator.md tells the session to write is read by loop-stats without a warning', () => {
  const table = /```markdown\n(## Rounds\n[\s\S]*?)\n```/.exec(kit('orchestrator.md'));
  assert.ok(table, 'orchestrator.md shows the rounds table');
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-audit-p3-'));
  try {
    const loopDir = join(dir, '.vibeflow/loop');
    mkdirSync(loopDir, { recursive: true });
    writeFileSync(join(loopDir, 'login.md'), `# login\n\n${table[1]}\n`);
    const result = runScript('loop-stats.mjs', [dir, '--json'], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.warnings, []);
    const part = report.parts.find((entry) => entry.part === '1');
    assert.ok(part, 'part 1 is counted');
    const rows = table[1].split('\n').filter((line) => /^\| \d/.test(line));
    const rounds = new Set(rows.map((line) => line.split('|')[3].trim()));
    assert.equal(part.rounds, rounds.size);
    assert.equal(part.fixRounds, [...rounds].filter((round) => round !== '0').length);
    assert.notEqual(part.clockMinutes, null, 'a table that reaches PASS has a clock');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// p3-7 -------------------------------------------------------------------------------------
// Claude Code substitutes ${CLAUDE_SKILL_DIR} and ${CLAUDE_PLUGIN_ROOT} only in a SKILL.md and in
// its allowed-tools; a supporting file the session reads by path sees them literally.
test('p3-7: the kit files part 3 adds never lean on ${CLAUDE_*} substitution', () => {
  for (const path of ['plugins/vibeflow/skills/implement/loop/orchestrator.md', 'plugins/vibeflow/skills/implement/loop/roles/executor.md', 'plugins/vibeflow/agents/executor.md']) {
    assert.doesNotMatch(read(path), /\$\{CLAUDE_[A-Z_]+\}/, `${path} uses a variable only a SKILL.md gets substituted`);
  }
  // the implement SKILL.md, where substitution happens, names the kit for the orchestrator
  assert.ok(read('plugins/vibeflow/skills/implement/SKILL.md').includes('${CLAUDE_SKILL_DIR}/loop/'));
});

// p3-8 -------------------------------------------------------------------------------------
// Each edition's Loop mode names the folder it reads orchestrator.md from; the CLI installs the
// kit for Cursor and Copilot. The two must agree, and the kit must hold every file the section
// and orchestrator.md name.
test('p3-8: each edition\'s Loop mode kit path is where the kit is installed, and the kit holds what it names', () => {
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
