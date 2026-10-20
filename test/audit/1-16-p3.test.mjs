// Audit probes, vibeflow 1.16 part 3 (`implement --loop`, the orchestrator, the executor role).
// The orchestrator is a prompt, so its behavior is the commands it tells the session to run.
// Each probe takes a command, a marker or a table from the kit's own text, runs it with the kit's
// real scripts in a hermetic git sandbox, and checks the exit code and the effect. The executor's
// test pins the wording; these pin that the wording and the scripts agree.
// Cases that reproduced open findings of .vibeflow/audits/vibeflow-1-16-p3-audit.md were `todo`
// with the finding's id; p3-3 (F4) and p3-4 (F3) were rewritten by fix round 1 to prove the fix. Nothing here reads the git history of this repository
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
// The "Round commits" section names the commit by its git commands between backticks. Run them,
// in order, on a round whose files are new (the probe file is always new at round 0).
function roundCommitCommands() {
  const text = kit('orchestrator.md');
  const start = text.indexOf('\n## Round commits\n');
  assert.ok(start !== -1, 'orchestrator.md has the Round commits section');
  const section = text.slice(start, text.indexOf('\n## ', start + 1));
  const commands = [...flat(section).matchAll(/`(git [^`]+)`/g)].map((match) => match[1])
    .filter((command) => !/--no-verify/.test(command) && /<paths>/.test(command));
  assert.ok(commands.some((command) => command.startsWith('git commit')), 'Round commits names the commit command');
  return commands;
}

function commitRound(sandbox, paths, message) {
  for (const command of roundCommitCommands()) {
    const argv = command.split(/\s+/).slice(1).flatMap((token) => (token === '<paths>' ? paths : [token]));
    if (argv[0] === 'commit' && !argv.includes('-m')) argv.splice(1, 0, '-m', message);
    sandbox.git(...argv);
  }
}

test('p3-3: the round commit as orchestrator.md writes it commits the part\'s new files and the probe file, and nothing else', () => {
  withSandbox((sandbox) => {
    loopRound(sandbox);
    sandbox.write('tests/audit/login-1.test.ts', 'probe\n');
    sandbox.write('notes/owner-unknown.txt', 'someone else\n');
    const paths = ['src/login.ts', 'tests/login.test.ts', 'tests/audit/login-1.test.ts'];
    commitRound(sandbox, paths, 'login part 1, executor round 0');
    const committed = sandbox.git('show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort();
    assert.deepEqual(committed, [...paths].sort());
    assert.match(sandbox.git('status', '--short'), /\?\? notes\//, 'a stranger\'s file stays out');
  });
});

// p3-4 -------------------------------------------------------------------------------------
// Two parts run in order. orchestrator.md records each part's base as `git rev-parse HEAD`
// (Executor briefing, step 6) and commits every round once it passes (Round commits), so part 1
// passing at its first audit is committed before part 2 starts.
test('p3-4: after part 1 passes, part 2\'s perimeter and review package hold only part 2', () => {
  assert.match(flat(kit('orchestrator.md')), /Every round is committed on the feature branch once it passes/, 'orchestrator.md commits a round that passes');
  withSandbox((sandbox) => {
    const one = loopRound(sandbox, { part: '1' });
    commitRound(sandbox, ['src/login.ts', 'tests/login.test.ts'], 'login part 1, executor round 0');
    const audit = runIn(sandbox.repo, 'review-package.mjs', [sandbox.repo, one.base, '.vibeflow/reviews/login-1-round-0.md'], sandbox.env());
    assert.equal(audit.status, 0, audit.out);
    assert.match(readFileSync(join(sandbox.repo, '.vibeflow/reviews/login-1-round-0.md'), 'utf8'), /src\/login\.ts/, 'part 1\'s package holds part 1');
    // part 1: PASS, committed; part 2 records its base as `git rev-parse HEAD`
    const base2 = sandbox.git('rev-parse', 'HEAD').trim();
    sandbox.write('src/session.ts', 'export const session = 1\n');
    sandbox.write('.vibeflow/progress/login-2.md', 'State: final\n');
    const perimeter = runIn(sandbox.repo, 'perimeter.mjs', [sandbox.repo, base2, 'src/session.ts', ...ARTIFACTS], sandbox.env());
    assert.equal(perimeter.status, 0, `part 1's files read as outside part 2:\n${perimeter.out}`);
    const pkg = runIn(sandbox.repo, 'review-package.mjs', [sandbox.repo, base2, '.vibeflow/reviews/login-2-round-0.md'], sandbox.env());
    assert.equal(pkg.status, 0, pkg.out);
    const part2 = readFileSync(join(sandbox.repo, '.vibeflow/reviews/login-2-round-0.md'), 'utf8');
    assert.match(part2, /src\/session\.ts/, 'part 2\'s package holds part 2');
    assert.doesNotMatch(part2, /src\/login\.ts/, 'part 2\'s package carries part 1\'s diff');
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

// ===================================================================== re-audit 1 (fix round 1)
// Probes added by .vibeflow/audits/vibeflow-1-16-p3-reaudit-1.md. Same rules as above: commands,
// paths and tables come from the kit's own text and run against the kit's real scripts in a
// hermetic sandbox; nothing reads this repository's git history or the real clock.

// The text of one "## <heading>" section of orchestrator.md, flattened.
function orchestratorSection(heading) {
  const text = kit('orchestrator.md');
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.ok(start !== -1, `orchestrator.md has a "## ${heading}" section`);
  const end = text.indexOf('\n## ', start + 1);
  return flat(text.slice(start, end === -1 ? undefined : end));
}

// The briefing path orchestrator.md names for a role, filled for one feature, part and round.
function briefingPath(suffixPattern, values) {
  const match = new RegExp('`(\\.vibeflow/briefings/<feature>-<part>-' + suffixPattern + '\\.md)`').exec(flat(kit('orchestrator.md')));
  assert.ok(match, `orchestrator.md names the briefing path for ${suffixPattern}`);
  return match[1].replace(/<[^>]+>/g, (name) => {
    assert.ok(name in values, `placeholder ${name} has a value`);
    return values[name];
  });
}

// p3-r1-1 ----------------------------------------------------------------------------------
// L3: every briefing passes check-briefing before dispatch, the re-auditor's included; L4: the
// second fix round's briefing, named as the orchestrator names it, is checked as a fix briefing.
test('p3-r1-1: the re-auditor briefing and the second fix briefing, written from their templates at the paths orchestrator.md names, pass check-briefing', () => {
  withSandbox((sandbox) => {
    const values = { '<feature>': 'login', '<part>': '1', '<r>': '2' };
    for (const [role, suffix] of [['reauditor', 'reauditor-<r>'], ['fix', 'fix-<r>']]) {
      const path = sandbox.write(briefingPath(suffix, values), briefingFromTemplate(role));
      const result = runIn(sandbox.repo, 'check-briefing.mjs', [path], sandbox.env());
      assert.equal(result.status, 0, `${role} briefing at ${path}:\n${result.out}`);
      assert.match(result.out, new RegExp(`\\b${role}\\b`, 'i'), `check-briefing read ${path} as a ${role} briefing`);
    }
    // a re-auditor briefing that lost a template section is refused, so the pass above means something
    const broken = sandbox.write(briefingPath('reauditor-<r>', { ...values, '<r>': '3' }), briefingFromTemplate('reauditor').replace(/## Review package[\s\S]*?(?=\n## )/, ''));
    assert.notEqual(runIn(sandbox.repo, 'check-briefing.mjs', [broken], sandbox.env()).status, 0, 'a re-auditor briefing without its review package section fails');
  });
});

// p3-r1-2 ----------------------------------------------------------------------------------
// F3 with L7 and the fixer's caveat (b): round 0 committed after the outside check, the audit's
// probes committed before the fix, the fix's outside check run with the round commit in place of
// the part base, the fix committed before its re-audit. The re-audit package, built from the round
// commit, must still hold the fix diff: the fix is committed by then, so a package of the worktree
// alone would be empty.
test('p3-r1-2: a fix round committed before its re-audit leaves the outside check clean and the re-audit package holding the fix diff only', () => {
  withSandbox((sandbox) => {
    const round = loopRound(sandbox);
    commitRound(sandbox, ['src/login.ts', 'tests/login.test.ts'], 'login part 1, executor round 0');
    sandbox.write('tests/audit/login-1.test.ts', 'probe\n');
    commitRound(sandbox, ['tests/audit/login-1.test.ts'], 'login part 1, audit round 0');
    // the last commit before the fix round is its round commit (Round commits, step 5)
    const roundCommit = sandbox.git('rev-parse', 'HEAD').trim();
    sandbox.write('src/login.ts', 'export const login = () => false\n');
    sandbox.write('.vibeflow/progress/login-1.md', '# progress\nState: final\n\n## Fix 1\nState: final · fix 1\n');
    const perimeter = orchestratorCommands().find((entry) => entry.script === 'perimeter.mjs');
    assert.ok(perimeter, 'orchestrator.md writes the perimeter command');
    const fixCheck = runIn(sandbox.repo, 'perimeter.mjs', fill(perimeter.args, { '<project root>': sandbox.repo, '<part base>': roundCommit, '<briefing globs>': ['src/login.ts'] }), sandbox.env());
    assert.equal(fixCheck.status, 0, `the fix round's outside check:\n${fixCheck.out}`);
    // the same check from the part base names the committed probe file: why the round commit is used
    const fromBase = runIn(sandbox.repo, 'perimeter.mjs', fill(perimeter.args, { '<project root>': sandbox.repo, '<part base>': round.base, '<briefing globs>': ['src/login.ts'] }), sandbox.env());
    assert.equal(fromBase.status, 1, fromBase.out);
    assert.match(fromBase.out, /outside tests\/audit\/login-1\.test\.ts/);
    commitRound(sandbox, ['src/login.ts'], 'login part 1, fix round 1');
    const pkgCommand = orchestratorCommands().find((entry) => entry.script === 'review-package.mjs' && entry.args.includes('<round commit>'));
    assert.ok(pkgCommand, 'orchestrator.md writes the re-audit package command from the round commit');
    const argv = fill(pkgCommand.args, { '<project root>': sandbox.repo, '<round commit>': roundCommit, '<feature>': 'login', '<part>': '1', '<r>': '1' });
    const pkg = runIn(sandbox.repo, 'review-package.mjs', argv, sandbox.env());
    assert.equal(pkg.status, 0, `re-audit package:\n${pkg.out}`);
    const text = readFileSync(join(sandbox.repo, '.vibeflow/reviews/login-1-round-1.md'), 'utf8');
    assert.match(text, /\+export const login = \(\) => false/, 'the package holds the committed fix');
    assert.doesNotMatch(text, /tests\/audit\/login-1\.test\.ts|tests\/login\.test\.ts/, 'round 0 and the audit\'s probes stay out of the fix package');
  });
});

// p3-r1-3 ----------------------------------------------------------------------------------
// p3-3 as rewritten runs only the git commands that carry <paths>. This one runs every git command
// of the "Round commits" section, in order (a `git status` is harmless), so a command added there
// that stages someone else's file is caught by behavior, whatever its spelling.
test('p3-r1-3: every git command of the Round commits section, run in order, leaves a stranger\'s file untracked and unstaged', () => {
  const commands = [...orchestratorSection('Round commits').matchAll(/`(git [^`]+)`/g)].map((match) => match[1])
    .filter((command) => !/--no-verify/.test(command));
  assert.ok(commands.some((command) => command.startsWith('git commit')), 'Round commits names the commit command');
  withSandbox((sandbox) => {
    loopRound(sandbox);
    sandbox.write('notes/owner-unknown.txt', 'someone else\n');
    const paths = ['src/login.ts', 'tests/login.test.ts'];
    for (const command of commands) {
      const argv = command.split(/\s+/).slice(1).flatMap((token) => (token === '<paths>' ? paths : [token]));
      if (argv[0] === 'commit' && !argv.includes('-m')) argv.splice(1, 0, '-m', 'login part 1, executor round 0');
      sandbox.git(...argv);
    }
    assert.deepEqual(sandbox.git('show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort(), [...paths].sort());
    assert.equal(sandbox.git('diff', '--cached', '--name-only').trim(), '', 'nothing is left staged');
    assert.match(sandbox.git('status', '--short'), /^\?\? notes\//m, 'a stranger\'s file stays untracked');
  });
});

// p3-r1-4 ----------------------------------------------------------------------------------
// F1: a red outside check is "another `executor` row of round 0" (or another `fix` row of that fix
// round), not a fix round. The rows that rule produces must read in loop-stats as one round each,
// with the audit as the part's first audit.
test('p3-r1-4: the extra executor and fix rows a red outside check adds count as the same round in loop-stats', () => {
  const header = /```markdown\n## Rounds\n\n(\| Part[^\n]*\n\|[^\n]*)\n/.exec(kit('orchestrator.md'));
  assert.ok(header, 'orchestrator.md shows the rounds table header');
  const table = [
    '## Rounds', '', header[1],
    '| 1 | executor | 0 | 2026-10-20 09:00 | 2026-10-20 09:40 | - |',
    '| 1 | executor | 0 | 2026-10-20 09:45 | 2026-10-20 10:05 | - |',
    '| 1 | audit | 0 | 2026-10-20 10:10 | 2026-10-20 10:40 | PARTIAL |',
    '| 1 | fix | 1 | 2026-10-20 10:45 | 2026-10-20 11:00 | - |',
    '| 1 | fix | 1 | 2026-10-20 11:05 | 2026-10-20 11:15 | - |',
    '| 1 | reaudit | 1 | 2026-10-20 11:20 | 2026-10-20 11:40 | PASS |',
  ].join('\n');
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-reaudit-p3-'));
  try {
    mkdirSync(join(dir, '.vibeflow/loop'), { recursive: true });
    writeFileSync(join(dir, '.vibeflow/loop/login.md'), `# login\n\n${table}\n`);
    const result = runScript('loop-stats.mjs', [dir, '--json'], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.warnings, []);
    const part = report.parts.find((entry) => entry.part === '1');
    assert.equal(part.rounds, 2, 'round 0 and fix round 1, whatever the extra rows');
    assert.equal(part.fixRounds, 1, 'a red outside check is not a fix round');
    assert.equal(part.firstAudit, 'PARTIAL');
    assert.equal(part.clockMinutes, 160, 'the clock starts at the first executor row');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// p3-r1-5 ----------------------------------------------------------------------------------
// F3 across parts with the audit's probes: the base command orchestrator.md writes for a part, run
// after part 1's executor round and its audit's probes were committed, gives part 2 a perimeter and
// a package of part 2 alone (p3-4 takes `git rev-parse HEAD` as given; this one reads it).
test('p3-r1-5: the part base command orchestrator.md writes, run after part 1 and its probes are committed, gives part 2 only part 2', () => {
  const step = /Record the part's base \(`(git [^`]+)`\)/.exec(orchestratorSection('Executor briefing'));
  assert.ok(step, 'the executor briefing step names the base command');
  withSandbox((sandbox) => {
    loopRound(sandbox, { part: '1' });
    commitRound(sandbox, ['src/login.ts', 'tests/login.test.ts'], 'login part 1, executor round 0');
    sandbox.write('tests/audit/login-1.test.ts', 'probe\n');
    commitRound(sandbox, ['tests/audit/login-1.test.ts'], 'login part 1, audit round 0');
    const base2 = sandbox.git(...step[1].split(/\s+/).slice(1)).trim();
    sandbox.write('src/session.ts', 'export const session = 1\n');
    const perimeter = runIn(sandbox.repo, 'perimeter.mjs', [sandbox.repo, base2, 'src/session.ts', ...ARTIFACTS], sandbox.env());
    assert.equal(perimeter.status, 0, perimeter.out);
    const pkg = runIn(sandbox.repo, 'review-package.mjs', [sandbox.repo, base2, '.vibeflow/reviews/login-2-round-0.md'], sandbox.env());
    assert.equal(pkg.status, 0, pkg.out);
    const text = readFileSync(join(sandbox.repo, '.vibeflow/reviews/login-2-round-0.md'), 'utf8');
    assert.match(text, /src\/session\.ts/);
    assert.doesNotMatch(text, /src\/login\.ts|tests\/audit\/login-1\.test\.ts/, 'part 1 and its probes stay out of part 2');
  });
});
