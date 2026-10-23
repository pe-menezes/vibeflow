// Behavior probes from independent audits of `implement --loop`: the orchestrator, the round
// commits and the executor role. Each case states, as comments, the contract it protects, the
// plausible regression that breaks it, and why the implementer's tests did not catch it. A case
// marked `todo` asserts what a known open gap asks for: it runs and prints without failing the suite.
// The orchestrator is a prompt, so its behavior is the commands it tells the session to run. Each
// probe takes a command, a marker or a path from the kit's own text, runs it with the kit's real
// scripts in a hermetic git sandbox, and checks the exit code and the effect: the contract tests
// pin the wording, these pin that the wording and the scripts agree. Nothing here reads the git
// history of this repository or the real clock.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOOP_DIR, hermeticEnv, withSandbox } from '../loop-helpers.mjs';

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

// ------------------------------------------------------------------ the orchestrator's script commands

// Contract: every `scripts/<name>.mjs` command orchestrator.md writes runs, with its own arguments, against the kit's real scripts, never exits 64, and has the expected effect.
// Breaks when: a script renames a flag or changes its argument shape, the orchestrator names a briefing path check-briefing does not read as a role, or the fix package starts carrying the committed round.
// Not covered by: implement-loop-contracts checks only that each script orchestrator.md names exists in the kit; it never runs one.
test('every script command orchestrator.md writes runs with the kit, none answers 64', () => {
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

// ------------------------------------------------------------------ the outside check

// Contract: the perimeter command, with the five artifact folders as orchestrator.md passes them, stays clean with `.vibeflow/` tracked and names a stranger's file, never a loop artifact.
// Breaks when: the orchestrator's folder list loses a folder, or perimeter.mjs stops reading a trailing slash as "everything below".
// Not covered by: implement-loop-contracts checks that the folders appear in the text, not what the script does with them.
test('the perimeter command, with the artifact folders as orchestrator.md passes them, stays clean with .vibeflow/ tracked and names a stranger\'s file', () => {
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

// ------------------------------------------------------------------ round commits

// Contract: the round commit, run with the git commands of "Round commits", takes the part's new files and the probe file and leaves a stranger's file out.
// Breaks when: the prescribed commands stop committing a new file (`git commit -- <paths>` alone refuses a path git does not know yet).
// Not covered by: implement-loop-contracts checks that `git add -- <paths>` and `git commit -- <paths>` are written, without running them.
test('the round commit as orchestrator.md writes it commits the part\'s new files and the probe file, and nothing else', () => {
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

// Two parts run in order. orchestrator.md records each part's base as `git rev-parse HEAD`
// (Executor briefing, step 6) and commits every round once it passes (Round commits), so the
// first part, passing at its first audit, is committed before the second starts.
// Contract: after the first part passes and is committed, the second part's perimeter and review package hold only the second part's work.
// Breaks when: a round that passes is left uncommitted, so the next part's base still sees the previous part's files.
// Not covered by: implement-loop-contracts never exercises a feature with two parts.
test('after the first part passes, the second part\'s perimeter and review package hold only its own work', () => {
  assert.match(flat(kit('orchestrator.md')), /Every round is committed on the feature branch once it passes/, 'orchestrator.md commits a round that passes');
  withSandbox((sandbox) => {
    const one = loopRound(sandbox, { part: '1' });
    commitRound(sandbox, ['src/login.ts', 'tests/login.test.ts'], 'login part 1, executor round 0');
    const audit = runIn(sandbox.repo, 'review-package.mjs', [sandbox.repo, one.base, '.vibeflow/reviews/login-1-round-0.md'], sandbox.env());
    assert.equal(audit.status, 0, audit.out);
    assert.match(readFileSync(join(sandbox.repo, '.vibeflow/reviews/login-1-round-0.md'), 'utf8'), /src\/login\.ts/, 'the first part\'s package holds the first part');
    // the first part: PASS, committed; the second records its base as `git rev-parse HEAD`
    const base2 = sandbox.git('rev-parse', 'HEAD').trim();
    sandbox.write('src/session.ts', 'export const session = 1\n');
    sandbox.write('.vibeflow/progress/login-2.md', 'State: final\n');
    const perimeter = runIn(sandbox.repo, 'perimeter.mjs', [sandbox.repo, base2, 'src/session.ts', ...ARTIFACTS], sandbox.env());
    assert.equal(perimeter.status, 0, `the first part's files read as outside the second:\n${perimeter.out}`);
    const pkg = runIn(sandbox.repo, 'review-package.mjs', [sandbox.repo, base2, '.vibeflow/reviews/login-2-round-0.md'], sandbox.env());
    assert.equal(pkg.status, 0, pkg.out);
    const second = readFileSync(join(sandbox.repo, '.vibeflow/reviews/login-2-round-0.md'), 'utf8');
    assert.match(second, /src\/session\.ts/, 'the second part\'s package holds the second part');
    assert.doesNotMatch(second, /src\/login\.ts/, 'the second part\'s package carries the first part\'s diff');
  });
});

// ------------------------------------------------------------------ watching a round

// Contract: watch-round.mjs ends a fix round on the `State: final · fix <round>` marker taken from roles/executor.md, not on the earlier round's marker nor on a fix section still without its own.
// Breaks when: the role changes the marker to a form the script does not read, or the script ends on the earlier marker again.
// Not covered by: implement-loop-contracts pins the marker's text only; it never runs watch-round.mjs.
test('watch-round ends a fix round on the marker roles/executor.md prescribes, not on the earlier round\'s', async () => {
  const marker = /`(State: final · fix )<round>`/.exec(kit('roles/executor.md'));
  assert.ok(marker, 'roles/executor.md prescribes the fix-round marker');
  assert.ok(flat(kit('orchestrator.md')).includes('`scripts/watch-round.mjs --file <progress file or report>`'), 'orchestrator.md writes the watch command');
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-probe-implement-loop-'));
  try {
    const progress = join(dir, 'login-1.md');
    writeFileSync(progress, '# progress\n\nState: final\n');
    let ended = false;
    const running = watch(progress, ['--interval-sec', '0.1', '--stale-min', '0.2', '--timeout-min', '0.5']).then((result) => { ended = true; return result; });
    await sleep(400);
    appendFileSync(progress, '\n## Fix 1\n* reading the report\n');
    await sleep(400);
    assert.equal(ended, false, 'the round-0 marker and a fix section without its marker do not end the watch');
    appendFileSync(progress, `* fixed the finding, test red then green\n${marker[1]}1\n`);
    const result = await running;
    assert.equal(result.status, 0, result.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ the kit's supporting files

// Claude Code substitutes ${CLAUDE_SKILL_DIR} and ${CLAUDE_PLUGIN_ROOT} only in a SKILL.md and in
// its allowed-tools; a supporting file the session reads by path sees them literally.
// Contract: orchestrator.md, the executor role and the executor agent never depend on a `${CLAUDE_*}` variable, which only a SKILL.md gets substituted.
// Breaks when: someone writes `${CLAUDE_SKILL_DIR}/loop/scripts/...` in a supporting file, and the model receives the literal.
// Not covered by: implement-loop-contracts looks for the kit path only inside the SKILL.md editions, never for the variables elsewhere.
test('the loop kit\'s supporting files never lean on ${CLAUDE_*} substitution', () => {
  for (const path of ['plugins/vibeflow/skills/implement/loop/orchestrator.md', 'plugins/vibeflow/skills/implement/loop/roles/executor.md', 'plugins/vibeflow/agents/executor.md']) {
    assert.doesNotMatch(read(path), /\$\{CLAUDE_[A-Z_]+\}/, `${path} uses a variable only a SKILL.md gets substituted`);
  }
  // the implement SKILL.md, where substitution happens, names the kit for the orchestrator
  assert.ok(read('plugins/vibeflow/skills/implement/SKILL.md').includes('${CLAUDE_SKILL_DIR}/loop/'));
});

// ------------------------------------------------------------------ briefings and the fix loop

// Contract: every briefing passes check-briefing.mjs before dispatch, the re-auditor's included, and the second fix round's briefing reads as a fix briefing, at the paths orchestrator.md names.
// Breaks when: the orchestrator renames the briefing files to a form the script does not map to a role (it would stop checking the sections), or the re-auditor template loses a section the script requires.
// Not covered by: implement-loop-contracts pins the sentence that the briefing passes `check-briefing.mjs`, without running the script on a briefing.
test('the re-auditor briefing and the second fix briefing, written from their templates at the paths orchestrator.md names, pass check-briefing', () => {
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

// Round 0 committed after the outside check, the audit's probes committed before the fix, the
// fix's outside check run with the round commit in place of the part base, the fix committed
// before its re-audit. The re-audit package, built from the round commit, must still hold the fix
// diff: the fix is committed by then, so a package of the worktree alone would be empty.
// Contract: with the fix committed before its re-audit, the fix round's outside check from the round commit is clean, and the re-audit package holds the fix diff without round 0 or the audit's probes.
// Breaks when: review-package.mjs compares only the worktree (an empty package once the fix is committed), or perimeter.mjs stops reading the commits since its base.
// Not covered by: implement-loop-contracts runs no script, and the script-command case above exercises only a fix that is not committed yet.
test('a fix round committed before its re-audit leaves the outside check clean and the re-audit package holding the fix diff only', () => {
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

// The round-commit case above runs only the git commands that carry <paths>. This one runs every
// git command of the "Round commits" section, in order (a `git status` is harmless), so a command
// added there that stages someone else's file is caught by behavior, whatever its spelling.
// Contract: every git command of "Round commits", run in order, commits only the round's paths and leaves a stranger's file untracked and unstaged.
// Breaks when: a command that stages everything under another spelling (`git add :/`, for example) is added to the section.
// Not covered by: implement-loop-contracts forbids a list of spellings (`-A`, `--all`, `.`), and the round-commit case above runs only the commands that carry <paths>.
test('every git command of the Round commits section, run in order, leaves a stranger\'s file untracked and unstaged', () => {
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

// Contract: the base command orchestrator.md writes for a part, run after the first part and its audit's probes are committed, gives the second part a perimeter and a review package of its own work only.
// Breaks when: the executor briefing's step changes the base command (to `git rev-parse HEAD~2`, for example).
// Not covered by: the two-part case above fixes `git rev-parse HEAD` in its own code, and implement-loop-contracts runs no git.
test('the part base command orchestrator.md writes, run after the first part and its probes are committed, gives the second part only its own work', () => {
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
    assert.doesNotMatch(text, /src\/login\.ts|tests\/audit\/login-1\.test\.ts/, 'the first part and its probes stay out of the second');
  });
});
