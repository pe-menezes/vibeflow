// Audit probes, vibeflow 1.16 part 4 (company mode: the PR with the evidence).
// The company-mode section of orchestrator.md is a prompt, so its behavior is the commands it
// tells the session to run and the permissions it gives. Each probe takes a command or a format
// from the kit's own text and runs it in a hermetic sandbox (git, a bare remote, a fake gh on
// PATH), or checks a predicate over the section that no rewording of a legitimate rule breaks.
// Cases that reproduce open findings of .vibeflow/audits/vibeflow-1-16-p4-audit.md are `todo`
// with the finding's id. Nothing here reads the git history of this repository or the real clock.
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

// ------------------------------------------------------------------ p4-1

test('p4-1: watch-pr.mjs with the arguments the section writes runs against gh, and every exit it can return has a route in step 6', () => {
  const six = step(6);
  const args = /run `watch-pr\.mjs` with `([^`]+)`/.exec(six);
  assert.ok(args, 'step 6 writes watch-pr.mjs with its arguments');
  const argv = fill(args[1]);

  // Every exit code the README declares for watch-pr.mjs is routed in step 6.
  const row = kit('README.md').split('\n').find((line) => line.startsWith('| `watch-pr.mjs'));
  assert.ok(row, 'README documents watch-pr.mjs');
  const codes = [...row.split('|').at(-2).matchAll(/(\d+) \w+/g)].map((m) => m[1]);
  assert.deepEqual(codes, ['0', '1', '2', '3']);
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

// ------------------------------------------------------------------ p4-2

test('p4-2: check-probes.mjs as step 1 runs it, over the project root with --base <default branch>, names a state probe on the feature branch and passes once it leaves', () => {
  const one = step(1);
  const base = /`check-probes\.mjs` over the project root with `([^`]+)`/.exec(one);
  assert.ok(base, 'step 1 writes check-probes.mjs with its base');
  withSandbox((box) => {
    const argv = [box.repo, ...fill(base[1])];
    box.git('checkout', '-q', '-b', 'feat/x');
    box.write('tests/audit/x-p1.test.ts', "test('state', () => { execFileSync('git diff main') })\n");
    box.write('tests/audit/x-p2.test.ts', "test('behavior', () => { expect(total([1, 2])).toBe(3) })\n");
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'probes');
    const dirty = runScript('check-probes.mjs', argv, box.env());
    assert.equal(dirty.status, 1, dirty.out);
    assert.match(dirty.stdout, /x-p1\.test\.ts:1 \[reads git\]/);
    assert.doesNotMatch(dirty.stdout, /x-p2\.test\.ts:\d/);

    box.git('rm', '-q', 'tests/audit/x-p1.test.ts');
    box.git('commit', '-q', '-m', 'state probe to the report');
    const clean = runScript('check-probes.mjs', argv, box.env());
    assert.equal(clean.status, 0, clean.out);
  });
});

// ------------------------------------------------------------------ p4-3

test('p4-3: the push and the PR as step 5 writes them land on the feature branch only, never overwrite a remote commit, and open the PR with the filled body', () => {
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

// ------------------------------------------------------------------ p4-4 (F2)

test('p4-4: the gh pr create command of step 5 passes gh\'s check for a non-interactive run (title and body given)', { todo: 'F2' }, () => {
  withSandbox((box) => {
    // gh 2.87.3, measured in the audit: without a TTY, `gh pr create` exits 1 with
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

// ------------------------------------------------------------------ p4-5

test('p4-5: no sentence of the company-mode section permits a merge, a deploy, a migration or a production read', () => {
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

// ------------------------------------------------------------------ p4-6 and p4-7

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

test('p4-6: every evidence section of pr-body.md is sourced from a section the audit report format, the ledger or the progress template prescribes', () => {
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

test('p4-7: every row of the Commands section has a file source written before step 4 fills the body', { todo: 'F1' }, () => {
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
