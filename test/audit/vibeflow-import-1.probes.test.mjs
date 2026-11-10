// Audit probes for vibeflow-import part 1: the external-import fixture's
// prepare.mjs, which writes into and runs git in a directory it is given.
// Behavior only: each probe pins what prepare.mjs does with the caller's
// environment and directory, not a sha, a line number or a date. Each case
// states, as comments, the contract it protects, the plausible regression
// that breaks it and why the implementer's tests missed it at the audit.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREPARE = join(ROOT, 'test/fixtures/external-import/prepare.mjs');

function cleanEnv(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  return { ...env, ...extra };
}

function scratch(run) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-import-audit-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: cleanEnv({
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Decoy',
      GIT_AUTHOR_EMAIL: 'decoy@example.com',
      GIT_COMMITTER_NAME: 'Decoy',
      GIT_COMMITTER_EMAIL: 'decoy@example.com',
    }),
  });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}

function prepare(dir, env) {
  return spawnSync(process.execPath, [PREPARE, dir], { encoding: 'utf8', env });
}

function decoyRepo(dir) {
  mkdirSync(dir);
  writeFileSync(join(dir, 'mine.txt'), 'caller data\n');
  git(dir, 'init', '--quiet');
  git(dir, 'add', 'mine.txt');
  git(dir, '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--no-verify', '-m', 'decoy');
  return git(dir, 'rev-parse', 'HEAD');
}

// Contract: prepare.mjs drops every inherited GIT_* before running git, so git
//   only ever writes inside <dir>/source and <dir>/app, never in the caller's
//   repository, and the printed sha is the new source repository's HEAD.
// Breaks when: the GIT_* filter in gitEnv() goes away or narrows (for example
//   to a fixed list that misses GIT_DIR); run from a git hook, init/add/commit
//   then act on the hook's repository.
// Not covered by: at the audit, test/import-fixture.test.mjs stripped GIT_*
//   itself before spawning prepare.mjs, so its tests passed with the filter
//   removed (audit sabotage S2: 7 of 7 green).
test('prepare.mjs ignores GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE inherited from a hook', () => {
  scratch((root) => {
    const decoy = join(root, 'decoy');
    const decoyHead = decoyRepo(decoy);
    const reference = scratch((dir) => JSON.parse(prepare(dir, cleanEnv()).stdout).sourceCommit);

    const target = join(root, 'out');
    const result = prepare(target, cleanEnv({
      GIT_DIR: join(decoy, '.git'),
      GIT_WORK_TREE: decoy,
      GIT_INDEX_FILE: join(decoy, '.git', 'index'),
    }));
    assert.equal(result.status, 0, `prepare.mjs failed: ${result.stderr}`);
    const out = JSON.parse(result.stdout);

    assert.equal(git(decoy, 'rev-parse', 'HEAD'), decoyHead, 'the caller repository HEAD did not move');
    assert.equal(git(decoy, 'rev-list', '--count', 'HEAD'), '1', 'no commit was added to the caller repository');
    assert.equal(git(decoy, 'status', '--porcelain'), '', 'nothing was staged in the caller repository');
    assert.deepEqual(readdirSync(decoy).sort(), ['.git', 'mine.txt'], 'no file was copied into the caller repository');

    for (const repo of [out.source, out.app]) {
      assert.equal(git(repo, 'rev-parse', '--show-toplevel'), realpathSync(repo), `${repo} is the top of its own repository`);
      assert.equal(git(repo, 'rev-list', '--count', 'HEAD'), '1', `${repo} is its own repository with one commit`);
    }
    assert.equal(git(out.source, 'rev-parse', 'HEAD'), out.sourceCommit, 'the printed sha is the source repository HEAD');
    assert.equal(out.sourceCommit, reference, 'inherited GIT_* do not change the source commit');
  });
});

// Contract: a directory with any entry, hidden ones included, is refused and
//   left untouched (a hidden .git means the caller's repository).
// Breaks when: the emptiness check starts ignoring dot entries, for example by
//   reusing the copy's SKIP set or filtering names that start with '.', and
//   prepare.mjs then runs git init/add/commit inside the caller's repository.
// Not covered by: at the audit, the implementer's refusal test planted a
//   visible keep.txt only (audit sabotage S4: 7 of 7 green).
test('prepare.mjs refuses a directory whose only entry is hidden and leaves it alone', () => {
  scratch((dir) => {
    writeFileSync(join(dir, '.keep'), 'mine');
    const result = prepare(dir, cleanEnv());
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not empty/i);
    assert.deepEqual(readdirSync(dir), ['.keep']);
  });
});

// Contract: prepare.mjs never writes into the fixture it copies from.
// Breaks when (open today, low finding A5): a target inside source/ or app/ of
//   the fixture makes copyTree recurse into its own output until ENAMETOOLONG,
//   leaving a deep tree inside the fixture.
// Not covered by: the implementer's tests always prepare into os.tmpdir().
// Marked todo so the file stays green while the gap is open; drop `todo` once
// prepare.mjs refuses such a target.
test('prepare.mjs never writes into the fixture it copies from', { todo: 'audit finding A5 (low): a target inside the fixture recurses into its own output' }, () => {
  scratch((dir) => {
    const copy = join(dir, 'fixture');
    cpSync(dirname(PREPARE), copy, { recursive: true });
    const before = readdirSync(join(copy, 'source')).sort();
    const result = spawnSync(process.execPath, [join(copy, 'prepare.mjs'), join(copy, 'source', 'out')], {
      encoding: 'utf8',
      env: cleanEnv(),
    });
    assert.notEqual(result.status, 0, 'a target inside the fixture is refused');
    assert.deepEqual(readdirSync(join(copy, 'source')).sort(), before, 'the fixture source is left as it was');
  });
});
