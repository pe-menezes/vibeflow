// Audit probes for vibeflow-base part 4: the documentation of the knowledge base in a worktree.
// Behavior only, held by content, over the missing-base fixture: each probe runs the scripts the
// new text describes and checks what the text promises. Each one answers in the audit report
// (.vibeflow/audits/vibeflow-base-4-audit.md) which contract it holds, which regression breaks it
// and why the executor's tests do not catch it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { hermeticEnv, runScript } from '../loop-helpers.mjs';
import { BASE_FILES, SPEC_PATH, makeMissingBase } from '../fixtures/missing-base/make.mjs';

function withFixture(options, run) {
  const dest = mkdtempSync(join(tmpdir(), 'vibeflow-base-4-probe-'));
  try {
    return run(makeMissingBase(join(dest, 'fx'), options), dest);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

const envFor = (fx) => hermeticEnv(fx.home, { HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', NO_PROXY: '' });

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function knowledgeLine(fx) {
  const pre = runScript('preflight.mjs', ['--repo', fx.wt, '--no-network'], envFor(fx));
  return { pre, line: pre.stdout.split('\n').find((l) => l.includes('knowledge base:')) ?? '' };
}

// MANUAL.md ("Numa worktree do git"), the CHANGELOG entry and plugins/vibeflow/README.md: the
// sign of the base is index.md, so a worktree with a stale conventions.md and decisions.md but
// no index.md is still "missing here", and the printed `cp -R` writes over both files with the
// main checkout's copy, after which the preflight reads the base as present.
test('docs: a worktree with a stale conventions.md and no index.md stops, and the printed copy command writes over it', () => {
  withFixture({}, (fx) => {
    write(fx.wt, '.vibeflow/conventions.md', '# Stale conventions, edited only in the worktree\n');
    write(fx.wt, '.vibeflow/decisions.md', '# Stale decisions, edited only in the worktree\n');
    const { pre, line } = knowledgeLine(fx);
    const match = /^\[stop\] knowledge base: missing in this worktree; the main checkout has it in (.+)\/\.vibeflow\/\. Copy it before any round: (.+)$/.exec(line);
    assert.ok(match, pre.out);
    assert.equal(pre.status, 2, pre.out);
    const run = spawnSync('sh', ['-c', match[2]], { cwd: fx.wt, env: envFor(fx), encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    for (const path of BASE_FILES) {
      assert.equal(readFileSync(join(fx.wt, path), 'utf8'), readFileSync(join(fx.main, path), 'utf8'), path);
    }
    const again = knowledgeLine(fx);
    assert.match(again.line, /^\[ok\] knowledge base: \.vibeflow\/index\.md present, with conventions\.md and 2 pattern doc\(s\)$/, again.pre.out);
  });
});

// The CHANGELOG entry (the copied base stays out of the diff, the new files, the short status and
// the perimeter) and the loop kit's README.md (review-package.mjs, `.vibeflow/` bullet): a base
// copied into a worktree, where .vibeflow/ is wholly untracked, leaves no line in the package's
// status section. git folds a wholly untracked folder into `?? .vibeflow/`, and
// the filter in review-package.mjs drops only lines that name a knowledge path.
test('docs: a copied base, the only untracked thing under .vibeflow/, leaves no line in the package\'s status section', { todo: 'open gap (audit vibeflow-base-4, A1): the short status folds the untracked folder into `?? .vibeflow/`, which the knowledge filter does not drop' }, () => {
  withFixture({ stage: 'change' }, (fx, dest) => {
    rmSync(join(fx.wt, dirname(SPEC_PATH)), { recursive: true, force: true });
    for (const path of BASE_FILES) cpSync(join(fx.main, path), join(fx.wt, path));
    const out = join(dest, 'package.md');
    const result = runScript('review-package.mjs', [fx.wt, fx.base, out], envFor(fx));
    assert.equal(result.status, 0, result.out);
    assert.ok(existsSync(out), result.out);
    const text = readFileSync(out, 'utf8');
    assert.match(text, /^Knowledge base left out: 5 untracked path\(s\) under \.vibeflow\//m);
    const status = /## git status --short\n\n([\s\S]*?)\n\n## /.exec(text)?.[1] ?? '';
    assert.match(status, /src\/cart\.js/);
    assert.doesNotMatch(status, /\.vibeflow/, `status section:\n${status}`);
  });
});
