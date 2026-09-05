#!/usr/bin/env node
// Pipeline smoke test: runs analyze → gen-spec → prompt-pack → implement →
// audit against a generated fixture, once per arm, and asserts the artifact
// contract. Exits 1 if any assertion fails on the new arm.
//
//   node test/run-smoke.mjs                 both arms
//   node test/run-smoke.mjs --arm new       new prompts only
//   node test/run-smoke.mjs --model sonnet  pin a different model
//
// What it does not check: see README.md, and the block this prints at the end.

import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  existsSync, mkdirSync, cpSync, readFileSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { generateFixture, fixtureTestsPass, TASK } from './fixture.mjs';
import {
  assertAnalyze, assertGenSpec, assertPromptPack, assertImplement,
  assertAudit, findSpec, VERDICT_OF,
} from './assertions.mjs';

const execFileAsync = promisify(execFile);
const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OLD_PLUGIN = join(
  homedir(), '.claude/plugins/cache/vibeflow-marketplace/vibeflow/1.12.0',
);

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const MODEL = flag('model', process.env.SMOKE_MODEL ?? 'opus');
const WORKDIR = flag('workdir', process.env.SMOKE_WORKDIR ?? join(tmpdir(), 'vibeflow-smoke'));
const STAGE_TIMEOUT_MS = Number(flag('timeout', 20 * 60 * 1000));
const ONLY_ARM = flag('arm', null);

// Fail closed on a typo: an unrecognized --arm value used to filter every arm
// out, and the run ended with "All assertions passed on the new arm" over zero
// assertions. The documented contract is `--arm new`, or no flag for both arms.
if (ONLY_ARM !== null && ONLY_ARM !== 'new') {
  console.error(
    `unknown --arm value "${ONLY_ARM}" — pass "new" to run the treatment arm only, ` +
    'or omit the flag to run both arms',
  );
  process.exit(1);
}

const ARMS = [
  { id: 'new', label: 'new prompts (this repo)', skills: join(REPO, 'plugins', 'vibeflow', 'skills') },
  { id: 'old', label: 'old prompts (v1.12.0 cache)', skills: join(OLD_PLUGIN, 'skills') },
].filter((a) => !ONLY_ARM || a.id === ONLY_ARM);

// ------------------------------------------------------------ arm sanity

// The work order says to confirm the cached plugin is really the pre-series
// version, since the user may upgrade it at some point. Trusting the path
// alone would let a silent upgrade turn the control arm into a second copy of
// the treatment arm.
function verifyOldArm() {
  const problems = [];
  const manifest = join(OLD_PLUGIN, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifest)) return [`plugin manifest missing at ${manifest}`];

  const version = JSON.parse(readFileSync(manifest, 'utf8')).version;
  if (version !== '1.12.0') problems.push(`plugin.json says ${version}, expected 1.12.0`);

  const audit = join(OLD_PLUGIN, 'skills', 'audit', 'SKILL.md');
  if (!existsSync(audit)) return [`audit/SKILL.md missing at ${audit}`];
  const body = readFileSync(audit, 'utf8');
  if (!body.includes('MANDATORY')) problems.push('audit/SKILL.md lacks "MANDATORY" — not pre-series');
  if (body.includes('Report every finding')) problems.push('audit/SKILL.md has "Report every finding" — post-series');

  return problems;
}

// ------------------------------------------------------------ stage driver

// Every session runs with --setting-sources project. Without it the user's
// globally installed vibeflow plugin loads too, and both arms silently
// exercise whichever skill set wins the name — the failure mode this whole
// harness exists to avoid. Verified 2026-08-15: default run exposes the nine
// vibeflow:* plugin skills, --setting-sources project exposes none.
// Retried once on a session-level error. A dropped connection is not a finding
// about a prompt, and without a retry the first network blip reads as a
// regression in whichever arm happened to hit it.
const STAGE_ATTEMPTS = 2;

async function attemptStage(fixture, invocation) {
  const args = [
    '-p', invocation,
    '--output-format', 'json',
    '--setting-sources', 'project',
    '--model', MODEL,
    '--dangerously-skip-permissions',
  ];

  const started = Date.now();
  let stdout = '';
  let failure = null;
  try {
    const result = await execFileAsync('claude', args, {
      cwd: fixture,
      timeout: STAGE_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      input: '', // close stdin; inherited stdin makes the CLI wait for piped input
    });
    stdout = result.stdout;
  } catch (error) {
    stdout = error.stdout ?? '';
    failure = error.killed ? `timed out after ${STAGE_TIMEOUT_MS}ms` : (error.message ?? 'unknown');
  }

  let json = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    /* left null; the metrics row reports it */
  }

  const usage = json?.usage ?? {};
  return {
    ok: failure === null && json?.is_error !== true,
    failure,
    text: json?.result ?? stdout.slice(0, 2000),
    metrics: {
      wallMs: Date.now() - started,
      durationMs: json?.duration_ms ?? null,
      costUsd: json?.total_cost_usd ?? null,
      turns: json?.num_turns ?? null,
      inputTokens: usage.input_tokens ?? null,
      outputTokens: usage.output_tokens ?? null,
      cacheReadTokens: usage.cache_read_input_tokens ?? null,
    },
  };
}

async function runStage(fixture, invocation, log) {
  let last = null;
  for (let attempt = 1; attempt <= STAGE_ATTEMPTS; attempt += 1) {
    last = await attemptStage(fixture, invocation);
    if (last.ok) {
      if (attempt > 1) last.retried = attempt - 1;
      return last;
    }
    if (attempt < STAGE_ATTEMPTS) {
      log(`session error, retrying once: ${String(last.failure).split('\n')[0]}`);
    }
  }
  return last;
}

// ------------------------------------------------------------------- arm

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();

function budgetOf(fixture) {
  const index = join(fixture, '.vibeflow', 'index.md');
  if (!existsSync(index)) return 6;
  const m = /Suggested budget:\s*(≤|<=)\s*(\d+)/i.exec(readFileSync(index, 'utf8'));
  return m ? Number(m[2]) : 6;
}

async function runArm(arm) {
  const fixture = join(WORKDIR, `arm-${arm.id}`);
  const log = (msg) => console.log(`  [${arm.id}] ${msg}`);

  log('generating fixture');
  generateFixture(fixture);

  // A fixture whose own tests already fail would make every downstream verdict
  // meaningless, so this is checked before any prompt runs.
  if (!fixtureTestsPass(fixture)) {
    throw new Error(`fixture tests fail before any arm ran — fixture is broken, not the prompts`);
  }

  log(`installing skills from ${arm.skills}`);
  const target = join(fixture, '.claude', 'skills');
  mkdirSync(target, { recursive: true });
  cpSync(arm.skills, target, { recursive: true });

  const stages = {};
  const results = { arm, fixture, stages, assertions: {}, notes: [] };

  // Stage prompts are written in English on purpose: the prompts detect the
  // input language and write their output in it, so a Portuguese prompt would
  // translate the very section headings the assertions match on.
  log('stage 1/5 analyze');
  stages.analyze = await runStage(fixture, '/analyze', log);
  results.assertions.analyze = assertAnalyze(fixture);

  const budget = budgetOf(fixture);
  log(`stage 2/5 gen-spec (budget ≤ ${budget})`);
  stages['gen-spec'] = await runStage(fixture, `/gen-spec ${TASK}`, log);
  results.assertions['gen-spec'] = assertGenSpec(fixture);

  const specPath = findSpec(fixture);
  const specArg = specPath ? specPath.slice(fixture.length + 1) : TASK;
  if (!specPath) results.notes.push('no spec found — later stages ran against the raw task text');

  log('stage 3/5 prompt-pack');
  stages['prompt-pack'] = await runStage(fixture, `/prompt-pack ${specArg}`, log);
  results.assertions['prompt-pack'] = assertPromptPack(fixture);

  // Commit everything written so far, so what `implement` touches is exactly
  // what the next diff shows.
  git(fixture, 'add', '-A');
  try {
    git(fixture, 'commit', '-q', '-m', 'artifacts before implement');
  } catch {
    /* nothing to commit */
  }

  log('stage 4/5 implement');
  stages.implement = await runStage(fixture, `/implement ${specArg}`, log);

  const changed = git(fixture, 'status', '--porcelain')
    .split('\n')
    .map((l) => l.slice(3).trim())
    .filter(Boolean)
    .filter((f) => !f.startsWith('.vibeflow/') && !f.startsWith('.claude/'));

  const testsPass = fixtureTestsPass(fixture);
  results.assertions.implement = assertImplement(fixture, {
    changedFiles: changed,
    budget,
    testsPass,
  });

  // The implementation stays uncommitted on purpose. `/audit` has exactly two
  // ways to find the work: `git diff HEAD` for uncommitted changes, or
  // `git diff <base>...HEAD` for a branch. The fixture has no branch, so
  // committing here would leave both diffs empty and the Critical Gate would
  // scan nothing.
  log('stage 5/5 audit');
  stages.audit = await runStage(fixture, `/audit ${specArg}`, log);
  results.assertions.audit = assertAudit(fixture);
  results.verdict = VERDICT_OF(fixture);

  return results;
}

// ---------------------------------------------------------------- report

const SYMBOL = { true: 'pass', false: 'FAIL', null: 'skip' };

function totals(arm) {
  let pass = 0, fail = 0, skip = 0;
  for (const list of Object.values(arm.assertions)) {
    for (const a of list) {
      if (a.ok === true) pass += 1;
      else if (a.ok === false) fail += 1;
      else skip += 1;
    }
  }
  return { pass, fail, skip };
}

// A stage whose session died (dropped connection, timeout) was never
// exercised, so none of its assertions is conclusive: missing artifacts read
// as failures, and residual artifacts from earlier stages can read as passes.
// Every assertion of a dead stage becomes a skip, so the totals and the
// side-by-side never count a phantom pass.
function markInconclusiveStages(arm) {
  for (const [stage, session] of Object.entries(arm.stages)) {
    if (session.ok) continue;
    arm.inconclusive = arm.inconclusive ?? [];
    arm.inconclusive.push(stage);
    for (const a of arm.assertions[stage] ?? []) {
      a.ok = null;
      a.detail = `not exercised — session failed: ${String(session.failure ?? 'is_error').split('\n')[0]}`;
    }
  }
}

function metricRow(arm) {
  let cost = 0, wall = 0, turns = 0, input = 0, output = 0, cacheRead = 0;
  for (const s of Object.values(arm.stages)) {
    cost += s.metrics.costUsd ?? 0;
    wall += s.metrics.wallMs ?? 0;
    turns += s.metrics.turns ?? 0;
    input += s.metrics.inputTokens ?? 0;
    output += s.metrics.outputTokens ?? 0;
    cacheRead += s.metrics.cacheReadTokens ?? 0;
  }
  return { cost, wall, turns, input, output, cacheRead };
}

const NOT_CHECKED = `
What this harness does not check
--------------------------------
It verifies the artifact contract — files land, markers balance, sections are
present, counts fall in range, the fixture's tests pass. It does not judge
whether any artifact is good: not whether the spec captured the right scope,
whether the patterns mined are the ones that matter, whether the audit's
verdict is correct, or whether the implementation is well written.

A green run means the pipeline produces well-formed artifacts. It is not
evidence that one arm produces better ones. Two assertions ("craftsmanship
check", "executable test check") are keyword heuristics over the DoD text, so
they can miss a check phrased in words outside their list. Anti-scope items
phrased without a path are reported as unchecked, not as passing.

Comparing quality would take at least five runs per arm on the same fixture,
artifacts stripped of any arm marker, and a reader who did not write the
prompts scoring them against a rubric fixed in advance.`;

function report(arms) {
  console.log('\n' + '='.repeat(72));
  console.log(`Pipeline smoke test — model: ${MODEL}`);
  console.log('='.repeat(72));

  const stageNames = ['analyze', 'gen-spec', 'prompt-pack', 'implement', 'audit'];

  for (const stage of stageNames) {
    console.log(`\n### ${stage}`);
    const names = new Set();
    for (const arm of arms) for (const a of arm.assertions[stage] ?? []) names.add(a.name);

    for (const name of names) {
      const cells = arms.map((arm) => {
        const found = (arm.assertions[stage] ?? []).find((a) => a.name === name);
        return { arm: arm.arm.id, a: found };
      });

      const newCell = cells.find((c) => c.arm === 'new')?.a;
      const oldCell = cells.find((c) => c.arm === 'old')?.a;
      // Comparative tags only when both arms actually exercised the stage;
      // otherwise the label would describe the network, not the prompts.
      let tag = '';
      if (newCell?.ok === false && oldCell?.ok === false) tag = '  (pre-existing — fails on both arms)';
      else if (newCell?.ok === false && oldCell?.ok === true) tag = '  (regression — passes on old, fails on new)';
      else if (newCell?.ok === true && oldCell?.ok === false) tag = '  (improvement — fails on old, passes on new)';

      const status = cells
        .map((c) => `${c.arm}:${c.a ? SYMBOL[String(c.a.ok)] : 'n/a '}`)
        .join('  ');
      console.log(`  ${status}  ${name}${tag}`);
      for (const c of cells) {
        if (c.a?.detail) console.log(`        ${c.arm}: ${c.a.detail}`);
      }
    }
  }

  console.log('\n### stage execution');
  for (const arm of arms) {
    for (const [stage, s] of Object.entries(arm.stages)) {
      if (!s.ok) console.log(`  ${arm.arm.id}/${stage}: session error — ${s.failure ?? 'is_error'}`);
    }
  }

  console.log('\n### cost and latency');
  console.log('  arm  | assertions      | audit verdict | cost USD | wall    | turns | in/out tokens');
  for (const arm of arms) {
    const t = totals(arm);
    const m = metricRow(arm);
    console.log(
      `  ${arm.arm.id.padEnd(4)} | ${`${t.pass} pass ${t.fail} fail ${t.skip} skip`.padEnd(15)} | ` +
      `${String(arm.verdict ?? '—').padEnd(13)} | ${m.cost.toFixed(4).padStart(8)} | ` +
      `${(m.wall / 1000).toFixed(0).padStart(5)}s  | ${String(m.turns).padStart(5)} | ` +
      `${m.input}/${m.output}`,
    );
  }

  for (const arm of arms) {
    for (const note of arm.notes) console.log(`  note [${arm.arm.id}]: ${note}`);
    console.log(`  fixture [${arm.arm.id}]: ${arm.fixture}`);
  }

  console.log(NOT_CHECKED);
}

// ------------------------------------------------------------------ main

async function main() {
  if (ARMS.some((a) => a.id === 'old')) {
    const problems = verifyOldArm();
    if (problems.length) {
      console.error('Control arm rejected — the cached plugin is not the pre-series version:');
      for (const p of problems) console.error(`  - ${p}`);
      console.error('\nRun with --arm new to skip the control arm, knowing the assertions are then unproven.');
      process.exit(1);
    }
    console.log(`control arm verified: v1.12.0 at ${OLD_PLUGIN}`);
  }

  // Never delete the workdir root — `--workdir .` would wipe the caller's
  // checkout. The harness only owns the arm-<id> subdirectories, and
  // generateFixture() already clears each of those before writing.
  mkdirSync(WORKDIR, { recursive: true });
  console.log(`workdir: ${WORKDIR}\n`);

  const arms = [];
  for (const arm of ARMS) {
    console.log(`--- arm: ${arm.label}`);
    arms.push(await runArm(arm));
  }

  for (const arm of arms) markInconclusiveStages(arm);

  report(arms);
  writeFileSync(join(WORKDIR, 'results.json'), JSON.stringify(arms, null, 2));
  console.log(`\nraw results: ${join(WORKDIR, 'results.json')}`);

  const newArm = arms.find((a) => a.arm.id === 'new');
  const failed = newArm ? totals(newArm).fail : 0;
  const stalled = newArm?.inconclusive ?? [];

  if (failed > 0) {
    console.log(`\n${failed} assertion(s) failed on the new arm.`);
    process.exit(1);
  }
  if (stalled.length) {
    // Not a pass: a stage that never ran was never verified. Exiting non-zero
    // keeps an incomplete run from reading as a green one.
    console.log(
      `\nNo assertion failed on the new arm, but ${stalled.length} stage(s) did not ` +
      `complete after ${STAGE_ATTEMPTS} attempts: ${stalled.join(', ')}. Re-run before ` +
      `treating this as a pass.`,
    );
    process.exit(1);
  }
  console.log('\nAll assertions passed on the new arm.');
}

main().catch((error) => {
  console.error(`\nharness error: ${error.message}`);
  process.exit(1);
});
