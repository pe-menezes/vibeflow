// Behavior probes from independent audits of the loop's company mode: the ending that opens a
// pull request with the evidence. Each case states, as comments, the contract it protects, the
// plausible regression that breaks it, and why the implementer's tests did not catch it. A case
// marked `todo` asserts what a known open gap asks for: it runs and prints without failing the suite.
// The company-mode section of orchestrator.md is a prompt, so its behavior is the commands it
// tells the session to run and the permissions it gives. Each probe takes a command or a format
// from the kit's own text and runs it in a hermetic sandbox (git, a bare remote, a fake gh on
// PATH), or checks a predicate over the section that no rewording of a legitimate rule breaks.
// Nothing here reads the git history of this repository or the real clock.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { LOOP_DIR, runScript, withSandbox } from '../loop-helpers.mjs';

const kit = (name) => readFileSync(join(LOOP_DIR, name), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const HEADING = '## Ending: company mode';

// The company-mode section, whitespace collapsed.
function section() {
  const text = kit('orchestrator.md');
  const start = text.indexOf(`\n${HEADING}\n`);
  assert.ok(start !== -1, `orchestrator.md has "${HEADING}"`);
  const end = text.indexOf('\n## ', start + 1);
  return flat(text.slice(start + 1, end === -1 ? undefined : end));
}

// The numbered step of the section that starts with `label` (for example "6. The checks.").
function step(n) {
  const text = section();
  const match = new RegExp(`(?:^| )${n}\\. (.*?)(?= ${n + 1}\\. |$)`).exec(text);
  assert.ok(match, `the section has step ${n}`);
  return match[1];
}

// Fill <placeholders> of a command written in the section.
const VALUES = {
  '<owner/repo>': 'owner/repo',
  '<number>': '7',
  '<default branch>': 'main',
  '<feature branch>': 'feat/x',
  '<feature>': 'x',
};
function fill(command) {
  const tokens = command.match(/<[^>]+>|\S+/g) ?? [];
  // A placeholder this table does not know (a PR title, for example) gets a plain word; a
  // wrong one in a script's arguments still fails, because the script refuses the value.
  return tokens.map((token) => token.replace(/<[^>]+>/g, (name) => VALUES[name] ?? 'value'));
}

// The single backticked command of the section that starts with `prefix`.
function command(prefix) {
  const found = [...section().matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((c) => c.startsWith(prefix));
  assert.equal(found.length, 1, `the section writes one \`${prefix} ...\` command (found ${found.length})`);
  return found[0];
}

const PR = (state, checks) => ({ state, title: 'feat', url: 'https://example.invalid/pr/7', statusCheckRollup: checks });

// ------------------------------------------------------------------ watching the PR's checks

// Contract: the watch-pr.mjs command step 6 writes runs against gh, every exit the README declares for it has a route in step 6, and the reason given for skipping it without CI holds for the script.
// Breaks when: a flag is renamed in the script or in the section (`--pr-number`), a new exit gets no route, or the script starts reading a PR with no check as green.
// Not covered by: company-mode-contracts pins the step's sentences and never runs the script or crosses it with the README.
test('watch-pr.mjs with the arguments the section writes runs against gh, and every exit it can return has a route in step 6', () => {
  const six = step(6);
  const args = /run `watch-pr\.mjs` with `([^`]+)`/.exec(six);
  assert.ok(args, 'step 6 writes watch-pr.mjs with its arguments');
  const argv = fill(args[1]);

  // Every exit code the README declares for watch-pr.mjs is routed in step 6.
  const row = kit('README.md').split('\n').find((line) => line.startsWith('| `watch-pr.mjs'));
  assert.ok(row, 'README documents watch-pr.mjs');
  const codes = [...row.split('|').at(-2).matchAll(/(\d+) \w+/g)].map((m) => m[1]);
  assert.deepEqual(codes, ['0', '1', '2', '3', '64']);
  for (const code of codes) assert.match(six, new RegExp(`Exit ${code}:`), `step 6 routes exit ${code}`);

  withSandbox((box) => {
    const cases = [
      [PR('OPEN', [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }]), 0],
      [PR('OPEN', [{ name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' }]), 1],
      [PR('MERGED', []), 2],
      [PR('CLOSED', []), 2],
    ];
    for (const [state, expected] of cases) {
      box.setGh(state);
      const result = runScript('watch-pr.mjs', argv, box.env());
      assert.equal(result.status, expected, `${state.state}: ${result.out}`);
    }
    assert.match(readFileSync(box.ghLog, 'utf8'), /pr view 7 --repo owner\/repo/);

    // The skip's reason holds for the script: a PR with no check never reads as done before the ceiling.
    box.setGh(PR('OPEN', []));
    const none = runScript('watch-pr.mjs', [...argv, '--interval-sec', '0.05', '--timeout-min', '0.005'], box.env());
    assert.equal(none.status, 3, none.out);
  });
});

// ------------------------------------------------------------------ state probes before the PR

// Contract: check-probes.mjs as step 1 runs it, over the project root with `--base <default branch>`, names a state probe on the feature branch and is clean once the probe leaves.
// Breaks when: an argument changes in the section (a wrong `--dir`, the base left out) or the script's default probe folder changes.
// Not covered by: company-mode-contracts only checks that the script the section names exists in the kit.
test('check-probes.mjs as step 1 runs it, over the project root with --base <default branch>, names a state probe on the feature branch and passes once it leaves', () => {
  const one = step(1);
  const base = /`check-probes\.mjs` over the project root with `([^`]+)`/.exec(one);
  assert.ok(base, 'step 1 writes check-probes.mjs with its base');
  withSandbox((box) => {
    const argv = [box.repo, ...fill(base[1])];
    box.git('checkout', '-q', '-b', 'feat/x');
    box.write('tests/audit/x-state.test.ts', "test('state', () => { execFileSync('git diff main') })\n");
    box.write('tests/audit/x-behavior.test.ts', "test('behavior', () => { expect(total([1, 2])).toBe(3) })\n");
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'probes');
    const dirty = runScript('check-probes.mjs', argv, box.env());
    assert.equal(dirty.status, 1, dirty.out);
    assert.match(dirty.stdout, /x-state\.test\.ts:1 \[reads git\]/);
    assert.doesNotMatch(dirty.stdout, /x-behavior\.test\.ts:\d/);

    box.git('rm', '-q', 'tests/audit/x-state.test.ts');
    box.git('commit', '-q', '-m', 'state probe to the report');
    const clean = runScript('check-probes.mjs', argv, box.env());
    assert.equal(clean.status, 0, clean.out);
  });
});

// ------------------------------------------------------------------ the push and the PR

// Contract: the push of step 5 lands on the feature branch only, never erases a remote commit and never touches the default branch; gh pr create carries base, head and the filled body outside `.vibeflow/loop/`, with `--draft` only by convention.
// Breaks when: the push gains `--force` or `HEAD:main`, the body moves into `loop/` (stats would read it as a ledger), or `--draft` is always added.
// Not covered by: company-mode-contracts checks the position of the push in the section and a pattern of the gh pr create command, without running either.
test('the push and the PR as step 5 writes them land on the feature branch only, never overwrite a remote commit, and open the PR with the filled body', () => {
  withSandbox((box) => {
    const run = (cmd, cwd = box.repo) => spawnSync(cmd[0], cmd.slice(1), { cwd, env: box.env(), encoding: 'utf8' });
    const remote = join(box.root, 'remote.git');
    assert.equal(run(['git', 'init', '-q', '--bare', '-b', 'main', remote], box.root).status, 0);
    box.git('remote', 'add', 'origin', remote);
    box.git('push', '-q', 'origin', 'main');
    const remoteSha = (ref) => run(['git', '--git-dir', remote, 'rev-parse', ref], box.root).stdout.trim();
    const mainBefore = remoteSha('main');

    box.git('checkout', '-q', '-b', 'feat/x');
    box.write('src/feature.ts', 'export const y = 2\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'feature');
    const push = fill(command('git push'));
    const first = run(push);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(remoteSha('feat/x'), box.git('rev-parse', 'HEAD').trim(), 'the feature branch reached the remote');
    assert.equal(remoteSha('main'), mainBefore, 'the default branch on the remote is untouched');

    // A teammate pushed to the same branch; the section's push must not erase that commit.
    const other = join(box.root, 'other');
    assert.equal(run(['git', 'clone', '-q', '-b', 'feat/x', remote, other], box.root).status, 0);
    writeFileSync(join(other, 'theirs.txt'), 'theirs\n');
    for (const args of [['add', '-A'], ['-c', 'user.name=T', '-c', 'user.email=t@x.invalid', 'commit', '-q', '-m', 'theirs'], ['push', '-q', 'origin', 'feat/x']]) {
      assert.equal(run(['git', ...args], other).status, 0);
    }
    const theirs = remoteSha('feat/x');
    box.write('src/feature.ts', 'export const y = 3\n');
    box.git('commit', '-q', '-am', 'mine');
    const second = run(push);
    assert.notEqual(second.status, 0, 'a push over a remote commit it does not have is refused');
    assert.equal(remoteSha('feat/x'), theirs, 'the teammate\'s commit is still on the remote');
    assert.equal(remoteSha('main'), mainBefore);

    // The PR: base, head and the filled body file, outside .vibeflow/loop/ (stats reads those as ledgers).
    const create = fill(command('gh pr create'));
    const bodyFile = create[create.indexOf('--body-file') + 1];
    assert.ok(bodyFile, 'gh pr create takes --body-file');
    assert.doesNotMatch(bodyFile, /^\.vibeflow\/loop\//);
    mkdirSync(join(box.repo, '.vibeflow/reviews'), { recursive: true });
    writeFileSync(join(box.repo, bodyFile), '## Summary\n');
    assert.match(section(), /adding `--draft` when the convention says draft/);
    for (const draft of [false, true]) {
      const argv = draft ? [...create, '--draft'] : create;
      const result = run(argv);
      assert.equal(result.status, 0, result.stderr);
    }
    const calls = readFileSync(box.ghLog, 'utf8').trim().split('\n');
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.match(call, /^pr create /);
      assert.match(call, /--base main/);
      assert.match(call, /--head feat\/x/);
      assert.match(call, /--body-file \.vibeflow\/reviews\/x-pr-body\.md/);
    }
    assert.doesNotMatch(calls[0], /--draft/);
    assert.match(calls[1], /--draft/);
  });
});

// Contract: the gh pr create command of step 5 passes gh's check for a run without a terminal: a title and a body are given.
// Breaks when: the title (or the body file) is dropped from the command.
// Not covered by: company-mode-contracts matches the flags' spelling by pattern and never runs the command against gh's non-interactive rule.
test('the gh pr create command of step 5 passes gh\'s check for a non-interactive run (title and body given)', () => {
  withSandbox((box) => {
    // Measured with gh 2.87.3: without a TTY, `gh pr create` exits 1 with
    // "must provide `--title` and `--body` (or `--fill` ...) when not running interactively"
    // unless a title and a body (or --fill, --fill-first, --fill-verbose) are given.
    box.writeExecutable('gh', [
      '#!/bin/sh',
      'title=no; body=no',
      'for a in "$@"; do case "$a" in --title|-t|--title=*) title=yes;; --body|-b|--body-file|-F|--body=*|--body-file=*) body=yes;; --fill|-f|--fill-first|--fill-verbose) title=yes; body=yes;; esac; done',
      'if [ -t 0 ] || { [ $title = yes ] && [ $body = yes ]; }; then exit 0; fi',
      'echo "must provide \\`--title\\` and \\`--body\\` (or \\`--fill\\` or \\`fill-first\\` or \\`--fillverbose\\`) when not running interactively" >&2',
      'exit 1',
      '',
    ].join('\n'));
    mkdirSync(join(box.repo, '.vibeflow/reviews'), { recursive: true });
    const create = fill(command('gh pr create'));
    writeFileSync(join(box.repo, create[create.indexOf('--body-file') + 1]), '## Summary\n');
    const result = spawnSync(create[0], create.slice(1), { cwd: box.repo, env: box.env(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(result.status, 0, result.stderr);
  });
});

// ------------------------------------------------------------------ the limits

// Contract: no sentence of the company-mode section permits a merge, a deploy, a migration or a production read, and the prohibition names all four, whatever its wording.
// Breaks when: a sentence that opens an exception is added ("the orchestrator may merge when the human asks", for example).
// Not covered by: company-mode-contracts counts one exact sentence and uses a short list of exception words, so a reworded permission passes it.
test('no sentence of the company-mode section permits a merge, a deploy, a migration or a production read', () => {
  const sentences = section().split(/(?<=[.;:])\s+(?=[A-Z0-9`])/);
  const risky = /\bmerg(e|es|ed|ing)\b|\bdeploy|\bmigrat|\bproduction\b|\bprod\b/i;
  const prohibition = /\bnever\b|\bno\b|\bnot\b|\bwithout\b/i;
  const closedRoute = /\bclosed or merged the PR; report it\b/;
  const offending = sentences.filter((s) => risky.test(s) && !prohibition.test(s) && !closedRoute.test(s));
  assert.deepEqual(offending, [], 'every sentence that names merge, deploy, migration or production forbids it');
  // The prohibition itself names all four, whatever its wording.
  const limits = sentences.filter((s) => /\bnever\b/.test(s) && /merg/.test(s));
  assert.ok(limits.length >= 1, 'a sentence forbids merging');
  const all = limits.join(' ');
  for (const word of [/merg/, /deploy/, /migration[^.]*shared environment/, /production/]) assert.match(all, word);
});

// ------------------------------------------------------------------ the PR body's sources

// The audit report as the audit workflow prescribes it (its "Output format" fence).
function auditReportFormat() {
  const text = readFileSync(join(LOOP_DIR, '../../audit/SKILL.md'), 'utf8');
  const start = text.indexOf('## Output format');
  assert.ok(start !== -1, 'audit/SKILL.md has its output format');
  const fence = /```\n([\s\S]*?)\n```/.exec(text.slice(start));
  assert.ok(fence, 'the output format is fenced');
  return fence[1];
}

// The PR body template's sections, each with its source comment.
function prBody() {
  const fence = /```markdown\n([\s\S]*?)\n```/.exec(kit('pr-body.md'));
  assert.ok(fence, 'pr-body.md has its template fenced');
  const sections = new Map();
  for (const part of fence[1].split(/\n(?=## )/)) {
    const match = /^## (.+)\n([\s\S]*)$/.exec(part);
    if (!match) continue;
    const from = /<!-- from: ([\s\S]*?) -->/.exec(match[2]);
    sections.set(match[1].trim(), { from: from ? flat(from[1]) : null, body: match[2] });
  }
  return sections;
}

// Contract: every evidence section of pr-body.md names a source, and that source is a section the audit report format, the ledger or the progress template prescribes.
// Breaks when: audit/SKILL.md renames `### Sabotage` or drops `### Follow-ups`, or a source comment points at a section that does not exist.
// Not covered by: company-mode-contracts reads only pr-body.md, without crossing it with the formats that produce its sources.
test('every evidence section of pr-body.md is sourced from a section the audit report format, the ledger or the progress template prescribes', () => {
  const report = auditReportFormat();
  const orchestrator = flat(kit('orchestrator.md'));
  const executorTemplate = flat(kit('briefings.md'));
  const body = prBody();
  const has = (heading) => assert.ok(report.includes(`### ${heading}`), `the audit report format has "### ${heading}"`);

  // Each section: the words its source comment must carry, and the format that holds the data.
  const resolvers = {
    'Verdict per part': () => { assert.ok(orchestrator.includes('| Part | Role | Round | Started | Ended | Verdict |')); assert.ok(report.includes('**Verdict:')); },
    'Definition of Done': () => has('DoD Checklist'),
    Findings: () => { has('Findings'); assert.match(report, /\[F1\] \w+ · \w+ · confidence/); assert.match(orchestrator, /`Decision:` lines, follow-ups|follow-ups? in the ledger/); },
    Probes: () => { has('Probes'); assert.match(report, /contract: [^\n]*regression: [^\n]*missed by/); },
    Sabotage: () => { has('Sabotage'); assert.match(report, /survived/); },
    'Critical Gate': () => has('Critical Gate'),
    Decisions: () => assert.ok(orchestrator.includes('`Decision: <what> — why: <reason> — cost if wrong: <cost>`')),
    'Follow-ups': () => { has('Follow-ups'); assert.match(orchestrator, /`Decision:` lines, follow-ups|follow-ups? in the ledger/); },
  };
  const words = {
    'Verdict per part': [/rounds table/, /report/],
    'Definition of Done': [/DoD Checklist/],
    Findings: [/Findings sections/, /follow-ups/],
    Probes: [/Probes sections/],
    Sabotage: [/Sabotage sections/],
    'Critical Gate': [/Critical Gate section/],
    Decisions: [/Decision: lines/],
    'Follow-ups': [/follow-ups/i],
  };
  for (const [name, resolve] of Object.entries(resolvers)) {
    const entry = body.get(name);
    assert.ok(entry, `pr-body.md has "## ${name}"`);
    assert.ok(entry.from, `"## ${name}" names its source`);
    for (const word of words[name]) assert.match(entry.from, word, `"## ${name}" source names ${word}`);
    resolve();
  }
  // Suite and types come from the progress files, which carry each proof command with its result.
  assert.match(executorTemplate, /each proof command with its result/);
});

// Contract: every row of the body's Commands section has a file source recorded before step 4 fills the body, or the body is rewritten after the watch.
// Breaks when: the ledger record of the outside check or of the CI-environment run goes away, or the `gh pr edit` after the watch is dropped.
// Not covered by: company-mode-contracts pins each recording sentence word for word; this case holds the same rule as a predicate that survives a rewording, which the contract test does not.
test('every row of the Commands section has a file source written before step 4 fills the body', () => {
  const orchestrator = kit('orchestrator.md');
  const sentences = flat(orchestrator).split(/(?<=[.;])\s+/);
  const recorded = (what) => sentences.some((s) => what.test(s) && /\bledger\b/.test(s) && /\b(record|write|add)/i.test(s));
  const rows = prBody().get('Commands').body;
  // Perimeter and the outside check: the source comment says "recorded in the ledger".
  if (/\| Perimeter \|/.test(rows)) assert.ok(recorded(/perimeter|outside check/i), 'the outside check result is recorded in the ledger');
  // The CI-environment suite of step 2.
  if (/\| CI-environment suite \|/.test(rows)) assert.ok(recorded(/CI's environment|CI-environment/), 'the CI-environment run is recorded in the ledger');
  // PR checks: watch-pr.mjs runs at step 6, after the body is written at step 4.
  if (/\| PR checks \|/.test(rows)) assert.match(step(6) + step(7), /gh pr edit/, 'the body is rewritten after watch-pr.mjs, or the row is not in the template');
});

// ------------------------------------------------------------------ the whole orchestrator.md

// Every sentence of the whole orchestrator.md, list items included, whitespace collapsed.
function fileSentences() {
  return flat(kit('orchestrator.md')).split(/(?<=[.;:])\s+(?=[A-Z0-9`*])/);
}

// Contract: the limits hold in the whole file, as the pointer in "Orchestrator discipline" says; no sentence of orchestrator.md permits a merge, a deploy, a migration or a production read ("the production build" of the outside check is the local build and stays out).
// Breaks when: a permission is added in another section ("the orchestrator may merge the pull request" in the discipline, "deploy the branch to the shared staging environment" in the audit).
// Not covered by: company-mode-contracts runs its predicates over the company-mode section only, and its whole-file count looks for the literal `merges`, which "may merge" does not contain.
test('no sentence anywhere in orchestrator.md permits a merge, a deploy, a migration or a production read', () => {
  // "Orchestrator discipline" holds a pointer to the limits ("they hold in every part"), so the
  // predicate of the section case above runs over the whole file, not only the section.
  // "the production build" is the local build the outside check starts, not production.
  const risky = /\bmerg(e|es|ed|ing)\b|\bdeploy|\bmigrat|\bproduction\b(?! build)|\bprod\b/i;
  const prohibition = /\bnever\b|\bno\b|\bnot\b|\bcannot\b|\bwithout\b/i;
  const closedRoute = /\bclosed or merged the PR; report it\b/;
  const named = fileSentences().filter((s) => risky.test(s));
  assert.ok(named.some((s) => /\bnever merges\b/.test(s)), 'the limits sentence is among the sentences checked');
  const offending = named.filter((s) => !prohibition.test(s) && !closedRoute.test(s));
  assert.deepEqual(offending, [], 'every sentence of orchestrator.md that names merge, deploy, migration or production forbids it');
});

// Contract: for a CI that tests the pull request's merge commit, the git commands step 2 writes give the merged tree (feature and default branch) in a clone as shallow as the CI's checkout.
// Breaks when: the merge is done where the clone's depth does not allow it, or the clone is deepened to make the merge possible.
// Not covered by: the shallow-clone contract test uses a repository with one branch and never merges.
test('for a CI that tests the merge commit, the git commands step 2 writes give the merged tree at the CI\'s depth', { todo: 'open gap: step 2 merges inside a clone as shallow as the CI\'s checkout, where git refuses the merge' }, () => {
  const text = step(2);
  assert.match(text, /merge commit/, 'step 2 handles a CI that tests the pull request\'s merge commit');
  const commands = [...text.matchAll(/`(git [^`]+)`/g)].map((m) => m[1]);
  assert.ok(commands.length >= 1, 'step 2 writes the git commands that build the clone');
  withSandbox((box) => {
    // The feature branch leaves main, then main moves on: the case where the merge commit
    // the CI tests differs from the branch alone.
    box.git('checkout', '-q', '-b', 'feat/x');
    box.write('src/feature.ts', 'export const f = 1\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'feature');
    box.git('checkout', '-q', 'main');
    box.write('src/main-only.ts', 'export const m = 1\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'main moves on');
    box.git('checkout', '-q', 'feat/x');
    const env = box.env({ GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t.invalid' });
    const run = (argv, cwd = box.repo) => spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: 'utf8' });
    const known = { '<n>': '1', '<project root>': box.repo, '<default branch>': 'main', '<feature branch>': 'feat/x' };
    const dirs = new Map();
    const dir = (name) => {
      if (!dirs.has(name)) dirs.set(name, join(box.root, `dir-${dirs.size}`));
      return dirs.get(name);
    };
    // Run in order; the suite runs in the last clone they make.
    let clone = null;
    for (const c of commands) {
      const argv = c.replace(/<[^>]+>/g, (name) => known[name] ?? dir(name)).split(' ');
      const r = run(argv);
      assert.equal(r.status, 0, `${argv.join(' ')}: ${r.stderr}`);
      if (argv[1] === 'clone') clone = argv[argv.length - 1];
    }
    assert.ok(clone, 'step 2 writes the git clone the suite runs in');
    // Where the section puts the merge: inside the clone. Done the only way a clone at the
    // CI's depth allows, fetching the default branch at the same depth.
    if (/merged with the default branch inside the clone/.test(text)) {
      assert.equal(run(['git', 'fetch', '-q', '--depth', '1', 'origin', 'main'], clone).status, 0);
      const merged = run(['git', 'merge', '--no-edit', 'FETCH_HEAD'], clone);
      assert.equal(merged.status, 0, `the merge inside the clone at the CI's depth: ${merged.stderr.trim()}`);
    }
    const has = (path) => run(['git', 'cat-file', '-e', `HEAD:${path}`], clone).status === 0;
    assert.ok(has('src/feature.ts') && has('src/main-only.ts'), 'the tree the suite runs on holds both the feature and the default branch, as the merge commit does');
    assert.equal(run(['git', 'rev-parse', '--is-shallow-repository'], clone).stdout.trim(), 'true', 'and the clone is still as shallow as the CI\'s checkout');
  });
});

// ------------------------------------------------------------------ when gh cannot open the pull request

// A sentence that ends or halts the loop.
const STOPS = /\bstop(s|ped|ping)?\b|\babort|\bhalt|\bdo not (start|dispatch|run)\b/i;

// Contract: a machine where gh cannot open the pull request still runs the loop to its ending: preflight reports it as attention, the opening's route for that exit code does not stop, and no sentence of orchestrator.md about the `pr ending:` line or a missing gh stops the loop.
// Breaks when: the opening turns the `pr ending:` attention into a stop ("when gh cannot, stop and say what it found"), so a repository off GitHub, or a machine without gh logged in, never reaches the ending that pushes the branch and hands the pull request to the user.
// Not covered by: company-mode-contracts pins the sentences of the ending's route, not what the opening does with the `pr ending:` line; the preflight tests check the script's line and exit code, never the orchestrator's route for them.
test('a machine where gh cannot open the pull request passes the opening: preflight gives attention, and no sentence of orchestrator.md stops the loop for it', () => {
  let status;
  withSandbox((box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    // An origin with no host for gh: no network call, and gh cannot open the pull request.
    box.git('remote', 'add', 'origin', `file://${join(box.root, 'remote.git')}`);
    const result = runScript('preflight.mjs', ['--repo', box.repo], box.env({ FAKE_GH_EXIT: '1' }));
    const line = result.out.split('\n').find((text) => text.includes('pr ending:'));
    assert.match(line ?? '', /^\[attention\] pr ending: .*by hand/, result.out);
    assert.notEqual(result.status, 2, `gh unable to open the pull request is not a stop of preflight:\n${result.out}`);
    status = result.status;
  });

  // The opening's route for the exit code preflight gave.
  const whole = kit('orchestrator.md');
  const start = whole.indexOf('\n## Opening\n');
  assert.ok(start !== -1, 'orchestrator.md has "## Opening"');
  const opening = flat(whole.slice(start + 1, whole.indexOf('\n## ', start + 1)));
  const route = opening.split(/(?<=[.;])\s+(?=[A-Z0-9`*])/).filter((s) => s.startsWith(`Exit ${status}:`));
  assert.equal(route.length, 1, `the opening routes preflight's exit ${status} once`);
  assert.doesNotMatch(route[0], STOPS, `the opening's route for exit ${status} lets the loop run: "${route[0]}"`);

  // Every sentence about the pr ending line or a gh that cannot open the pull request.
  const named = fileSentences().filter((s) => /`pr ending:`|\bgh cannot\b|\bgh is missing\b|\bnot logged in\b/.test(s));
  assert.ok(named.some((s) => s.includes('`pr ending:`')), 'orchestrator.md says what the `pr ending:` line means for the loop');
  for (const s of named) assert.doesNotMatch(s, STOPS, `a sentence about gh unable to open the pull request stops the loop: "${s}"`);
});

// Contract: watch-pr.mjs's exit 64 is final (gh not logged in exits 64 at the first read, with no retry), so step 6 routes it to the user and no sentence of orchestrator.md sends exit 64 back to another watch.
// Breaks when: a sentence is added that restarts the watch on 64 ("When it exits 64, start the watch again until it reads the PR"), turning an error that cannot fix itself into a loop the orchestrator never leaves.
// Not covered by: company-mode-contracts pins the one sentence of the 64 route in step 6 and has no predicate over the other sentences that name 64; the watch-pr tests run the script, never the orchestrator's route.
test('watch-pr.mjs exit 64 is final at the first read, and no sentence of orchestrator.md sends it back to another watch', () => {
  const args = /run `watch-pr\.mjs` with `([^`]+)`/.exec(step(6));
  assert.ok(args, 'step 6 writes watch-pr.mjs with its arguments');
  withSandbox((box) => {
    box.setGh('To get started with GitHub CLI, please run:  gh auth login\n');
    const result = runScript('watch-pr.mjs', [...fill(args[1]), '--interval-sec', '0.05', '--timeout-min', '0.02'], box.env({ FAKE_GH_EXIT: '4' }));
    assert.equal(result.status, 64, result.out);
    assert.equal(readFileSync(box.ghLog, 'utf8').trim().split('\n').length, 1, 'one read of the PR, no retry');
  });
  const named = fileSentences().filter((s) => /\b64\b/.test(s));
  assert.ok(named.some((s) => s.startsWith('Exit 64:')), 'step 6 routes exit 64');
  for (const s of named) {
    assert.doesNotMatch(s, /\bagain\b|\bre-?(run|start|try)|\bretr(y|ies)\b|\buntil\b|\bwait/i, `a sentence sends exit 64 back to another watch: "${s}"`);
  }
});
