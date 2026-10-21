// Audit probes, vibeflow 1.16 part 6b (the 1.16.0 release: the analyze date fix,
// the probes folder the CI runs). Behavior only, pinned by content: every date is
// fixed in a fixture and git's "now" is pinned with GIT_TEST_DATE_NOW, so nothing
// depends on the real clock. Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hermeticEnv, runScript } from '../loop-helpers.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const ANALYZE = {
  shared: 'plugins/vibeflow/skills/analyze/SKILL.md',
  cursor: 'cursor/skills/vibeflow-analyze/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-analyze.prompt.md',
};
const flat = (text) => text.replace(/\s+/g, ' ');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

function incrementalParagraph(raw) {
  const at = raw.indexOf('**Incremental mode.**');
  assert.ok(at !== -1, 'an "Incremental mode." paragraph');
  const end = raw.indexOf('\n\n', at);
  return raw.slice(at, end === -1 ? undefined : end);
}

// --- DoD 4: the incremental check's git log, over a grid of zones and "now" ---

const ANALYZED = '2020-01-15';
// Wall-clock commit times, read in the zone under test. The oracle: a commit
// counts exactly when its wall time is at or after midnight of the Analyzed date,
// whatever git's "now" is.
const COMMITS = [
  '2020-01-14 23:59:59',
  '2020-01-15 00:00:00',
  '2020-01-15 00:00:01',
  '2020-01-15 12:00:00',
  '2020-01-16 08:00:00',
  '2020-02-01 00:00:00',
];
const fileOf = (when) => `c-${when.replace(/[ :]/g, '_')}.txt`;
const EXPECTED = COMMITS.filter((when) => when >= `${ANALYZED} 00:00:00`).map(fileOf).sort();

function withHistory(zone, run) {
  const repo = mkdtempSync(join(tmpdir(), 'vibeflow-audit-p6b-'));
  const env = { ...hermeticEnv(repo), TZ: zone, GIT_CONFIG_NOSYSTEM: '1' };
  const git = (args, extra = {}) => {
    const result = spawnSync('git', args, { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout;
  };
  try {
    git(['init', '-q']);
    for (const when of COMMITS) {
      writeFileSync(join(repo, fileOf(when)), `${when}\n`);
      git(['add', fileOf(when)]);
      git(['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', when],
        { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when });
    }
    const epochs = Object.fromEntries(git(['log', '--format=%ct %s']).trim().split('\n')
      .map((line) => { const [ct, ...subject] = line.split(' '); return [subject.join(' '), Number(ct)]; }));
    const midnight = epochs[`${ANALYZED} 00:00:00`];
    // git's "now": just after midnight, noon, the last second of the day, a month later.
    const nows = [midnight + 30, midnight + 12 * 3600, midnight + 86399, midnight + 31 * 86400 + 9 * 3600];
    const pinned = git(['rev-parse', '--since=1.day.ago'], { GIT_TEST_DATE_NOW: '864000' }).trim() === '--max-age=777600';
    run({ repo, env, nows, pinned });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

function filesSince(command, { repo, env }, now) {
  const result = spawnSync('sh', ['-c', command], { cwd: repo, env: { ...env, GIT_TEST_DATE_NOW: String(now) }, encoding: 'utf8' });
  assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  return result.stdout.split('\n').filter(Boolean).sort();
}

test('p6b-1 analyze incremental: in every zone and at any time of day, the git log of each edition returns every commit from midnight of the Analyzed date on, and nothing before', () => {
  for (const zone of ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo']) {
    withHistory(zone, (box) => {
      for (const [edition, path] of Object.entries(ANALYZE)) {
        const match = /`(git log --since=[^`]*)`/.exec(incrementalParagraph(read(path)));
        assert.ok(match, `${edition}: the incremental check names its git log command`);
        const command = match[1].replaceAll('<date>', ANALYZED);
        for (const now of box.nows) {
          assert.deepEqual(filesSince(command, box, now), EXPECTED,
            `${edition}, TZ=${zone}, now=${now}: \`${command}\` returns the commits from ${ANALYZED} 00:00 on`);
        }
      }
      // Control: the harness tells the old text apart. With "now" pinned at noon, a
      // bare date counts from noon and loses the morning commits (finding G2).
      if (box.pinned) {
        const old = filesSince(`git log --since="${ANALYZED}" --name-only --pretty=format:""`, box, box.nows[1]);
        assert.notDeepEqual(old, EXPECTED, `TZ=${zone}: a bare date at noon misses the morning commits`);
      }
    });
  }
});

// --- DoD 4, finding G1: the block-only run moves Analyzed to today ---

test('p6b-2 analyze block-only run: each edition tells the agent, with no hedge, to move Analyzed to today\'s date, and Phase 4 says the same', () => {
  const clauses = {};
  for (const [edition, path] of Object.entries(ANALYZE)) {
    const raw = read(path);
    const phase0 = flat(incrementalParagraph(raw));
    const clause = /block is due but nothing else changed → (.*?) report "/i.exec(phase0);
    assert.ok(clause, `${edition}: a block-only path in Phase 0`);
    assert.match(clause[1], /\b(move|set|update)s? `Analyzed:` to today's date\b/, `${edition}: an instruction to move Analyzed to today's date`);
    assert.doesNotMatch(clause[1], /\b(not|rather than|instead of|keep|keeps|leave|leaves|unless|except|only (on|when|if|in))\b/i,
      `${edition}: no negation or condition in the block-only clause: "${clause[1]}"`);
    assert.match(clause[1], /\(Phase 4\)/, `${edition}: the clause points at Phase 4`);
    assert.match(flat(raw), /\*\*index\.md\*\* — update `Analyzed: <date>` to today/, `${edition}: Phase 4 moves Analyzed to today`);
    clauses[edition] = clause[1];
  }
  assert.equal(clauses.cursor, clauses.shared, 'cursor carries the shared clause');
  assert.equal(clauses.copilot, clauses.shared, 'copilot carries the shared clause');
});

// --- DoD 5: the CI runs every test file, and check-probes reads the probes ---

function ciTestCommand() {
  const workflow = read('.github/workflows/validate-distributions.yml');
  const line = workflow.split('\n').map((l) => l.trim()).find((l) => /^run:\s*node --test\b/.test(l));
  assert.ok(line, 'the CI workflow has a `run: node --test ...` step');
  return line.replace(/^run:\s*/, '');
}

function ciSelectedFiles() {
  const globs = ciTestCommand().replace(/^node --test\s+/, '');
  // The same expansion the CI's shell does, from the repository root.
  const result = spawnSync('sh', ['-c', `for f in ${globs}; do [ -f "$f" ] && printf '%s\\n' "$f"; done`], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return new Set(result.stdout.split('\n').filter(Boolean));
}

function testFilesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...testFilesUnder(path));
    else if (/\.test\.mjs$/.test(entry.name)) out.push(path);
  }
  return out;
}

const callsItselfProbes = (path) => /\bprobes\b/i.test(read(path).split('\n')[0]);

test('p6b-3 the CI\'s test command runs every test file under test/, the audit probes included', () => {
  const selected = ciSelectedFiles();
  const all = testFilesUnder('test');
  const missed = all.filter((path) => !selected.has(path));
  assert.deepEqual(missed, [], `test files the CI command (${ciTestCommand()}) never runs`);
  assert.ok(all.some((path) => path.startsWith('test/audit/') && callsItselfProbes(path)), 'at least one audit probe file under test/audit/ is run');
});

test('p6b-4 check-probes reads, by default, exactly the test files that call themselves audit probes (more than zero)', () => {
  const box = mkdtempSync(join(tmpdir(), 'vibeflow-audit-p6b-probes-'));
  const repo = join(box, 'repo');
  mkdirSync(repo, { recursive: true });
  const env = hermeticEnv(box);
  const git = (args) => {
    const result = spawnSync('git', args, { cwd: repo, env, encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  };
  try {
    git(['init', '-q']);
    writeFileSync(join(repo, 'README.md'), 'base\n');
    git(['add', 'README.md']);
    git(['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'base']);
    // The repository's test tree, as it is, copied into the sandbox's working tree.
    const all = testFilesUnder('test');
    for (const path of all) {
      mkdirSync(join(repo, dirname(path)), { recursive: true });
      copyFileSync(join(ROOT, path), join(repo, path));
    }
    const probes = all.filter(callsItselfProbes);
    assert.ok(probes.length > 0, 'the repository has audit probe files');
    const run = runScript('check-probes.mjs', [repo, '--base', 'HEAD'], env);
    assert.ok(run.status === 0 || run.status === 1, `check-probes ran: ${run.out}`);
    const count = /(\d+) probe file\(s\) read/.exec(run.stdout);
    assert.ok(count, run.out);
    assert.equal(Number(count[1]), probes.length, `check-probes reads every probe file: ${probes.join(', ')}`);
    const read = new Set(run.stdout.split('\n').map((line) => /^([^:\s]+\.test\.mjs):\d+ \[/.exec(line)?.[1]).filter(Boolean));
    for (const path of read) assert.ok(probes.includes(path), `${path} is read as a probe but does not call itself one`);
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
});

// --- F3 (low, outside the part): the loop's config is not a ledger ---

test('p6b-5 a project that turned the loop on in .vibeflow/loop/config.md and has no ledger yet reads as having no ledger', { todo: 'low F3 of the 6b audit: loop-stats counts config.md as a ledger and warns about it' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-audit-p6b-config-'));
  try {
    mkdirSync(join(dir, '.vibeflow/loop'), { recursive: true });
    writeFileSync(join(dir, '.vibeflow/loop/config.md'), '---\nloop: true\ncommit-rounds: true\n---\n');
    const result = runScript('loop-stats.mjs', [dir, '--json'], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ledgers, 0, 'config.md is not a ledger');
    assert.deepEqual(report.warnings, [], 'no warning about the config file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
