import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LOOP_DIR, SCRIPTS_DIR, hermeticEnv, makeSandbox, runScript, withSandbox } from './loop-helpers.mjs';

const SCRIPTS = [
  'preflight.mjs',
  'who-reads.mjs',
  'check-briefing.mjs',
  'perimeter.mjs',
  'review-package.mjs',
  'check-probes.mjs',
  'watch-pr.mjs',
  'watch-round.mjs',
];

function scratch(run) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-loop-file-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function scratchAsync(run) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-loop-file-'));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Starts a script in the background and runs `steps` (delay in ms, action) while it waits.
// Resolves with the exit code, the output, and the text of `file` at the moment of the exit,
// so a test can say what the file held when the script stopped without reading any clock.
function watchWhile(script, args, env, { file, steps = [] }) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(SCRIPTS_DIR, script), ...args], { env });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    const timers = steps.map(([delay, action]) => setTimeout(action, delay));
    const guard = setTimeout(() => child.kill(), 20_000);
    child.on('exit', (code) => {
      const atExit = file && existsSync(file) ? readFileSync(file, 'utf8') : null;
      for (const timer of [...timers, guard]) clearTimeout(timer);
      done({ code, out, atExit });
    });
  });
}

// --- the kit's shape ---

test('the loop scripts exist and import only node: modules', () => {
  const present = readdirSync(SCRIPTS_DIR).filter((name) => name.endsWith('.mjs')).sort();
  assert.deepEqual(present, [...SCRIPTS].sort());
  for (const name of SCRIPTS) {
    const source = readFileSync(join(SCRIPTS_DIR, name), 'utf8');
    const specifiers = [
      ...source.matchAll(/^\s*import\s[^'"]*?from\s*['"]([^'"]+)['"]/gm),
      ...source.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
      ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1]);
    assert.ok(specifiers.length > 0, `${name}: no import found`);
    for (const specifier of specifiers) {
      assert.match(specifier, /^node:/, `${name} imports ${specifier}`);
    }
    assert.doesNotMatch(source, /(^|[^'"\w.])require\(\s*['"]/m, `${name} uses require()`);
  }
});

test('every script answers --help with exit 0 and a usage line', () => {
  for (const name of SCRIPTS) {
    const result = runScript(name, ['--help'], hermeticEnv(tmpdir()));
    assert.equal(result.status, 0, `${name}: ${result.out}`);
    assert.match(result.stdout, /usage/i, name);
  }
});

test('the README documents each script with its exit codes', () => {
  const readme = readFileSync(join(LOOP_DIR, 'README.md'), 'utf8');
  const codes = {
    'preflight.mjs': ['0 go', '1 attention', '2 stop'],
    'who-reads.mjs': ['0 nobody', '1 has readers'],
    'check-briefing.mjs': ['0 ok', '1 attention', '2 stop'],
    'perimeter.mjs': ['0 inside', '1 outside'],
    'review-package.mjs': ['0 written', '1 empty', '2 error'],
    'check-probes.mjs': ['0 clean', '1 suspects'],
    'watch-pr.mjs': ['0 green', '1 failed', '2 closed', '3 ceiling'],
    'watch-round.mjs': ['0 final', '1 silent', '3 ceiling'],
  };
  for (const [name, expected] of Object.entries(codes)) {
    const row = readme.split('\n').find((line) => line.startsWith('|') && line.includes(`\`${name.replace('.mjs', '')}`));
    assert.ok(row, `README has no table row for ${name}`);
    for (const code of expected) assert.ok(row.includes(code), `${name} row lacks "${code}"`);
  }
});

test('the README names every file the kit ships', () => {
  const readme = readFileSync(join(LOOP_DIR, 'README.md'), 'utf8');
  const { files } = JSON.parse(readFileSync(join(LOOP_DIR, 'manifest.json'), 'utf8'));
  for (const file of [...files, 'manifest.json']) {
    if (file === 'README.md') continue;
    const name = file.startsWith('scripts/') ? file.slice('scripts/'.length) : file;
    assert.ok(readme.includes(`\`${name}`), `README does not name ${file}`);
  }
});

// --- hermetic environment ---

test('inherited GIT_DIR and GIT_INDEX_FILE do not reach the repository under test', () => {
  const decoy = makeSandbox();
  const saved = { GIT_DIR: process.env.GIT_DIR, GIT_INDEX_FILE: process.env.GIT_INDEX_FILE };
  try {
    process.env.GIT_DIR = join(decoy.repo, '.git');
    process.env.GIT_INDEX_FILE = join(decoy.repo, '.git', 'index');
    withSandbox((box) => {
      box.write('README.md', 'outside\n');
      const viaHelper = runScript('perimeter.mjs', [box.repo, box.base, 'src/**'], box.env());
      assert.equal(viaHelper.status, 1, viaHelper.out);
      assert.match(viaHelper.stdout, /^outside README\.md$/m);

      // The script strips GIT_* itself too: an orchestrator inside a git hook passes them on.
      const raw = runScript('perimeter.mjs', [box.repo, box.base, 'src/**'], {
        ...box.env(),
        GIT_DIR: process.env.GIT_DIR,
        GIT_INDEX_FILE: process.env.GIT_INDEX_FILE,
      });
      assert.equal(raw.status, 1, raw.out);
      assert.match(raw.stdout, /^outside README\.md$/m);
    });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    decoy.cleanup();
  }
});

// --- perimeter ---

test('perimeter lists committed, modified and untracked files outside the globs', () => {
  withSandbox((box) => {
    box.write('docs/committed.md', 'x\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'first round');
    box.write('src/rules.ts', 'export const x = 2\n');
    box.write('tests/audit/new.test.ts', 'it()\n');
    box.write('README.md', 'new\n');
    box.write('notes/new folder/ação.txt', 'untracked with space and accent\n');
    const result = runScript('perimeter.mjs', [box.repo, box.base, 'src/**', 'tests/**'], box.env());
    assert.equal(result.status, 1, result.out);
    const outside = result.stdout.split('\n').filter((line) => line.startsWith('outside ')).sort();
    assert.deepEqual(outside, ['outside README.md', 'outside docs/committed.md', 'outside notes/new folder/ação.txt']);
    assert.match(result.stdout, /5 file\(s\) changed since/);
  });
});

test('perimeter passes when everything is inside, ignores ignored files, and matches ** at any depth', () => {
  withSandbox((box) => {
    box.write('.gitignore', 'build/\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'ignore build');
    box.write('build/out.js', 'ignored\n');
    box.write('src/deep/er/x.ts', 'x\n');
    box.write('README.md', 'x\n');
    box.write('docs/guide.md', 'x\n');
    const result = runScript('perimeter.mjs', [box.repo, box.base, '.gitignore', 'src/**', '**/*.md'], box.env());
    assert.equal(result.status, 0, result.out);
    assert.doesNotMatch(result.stdout, /build\/out\.js/);
  });
});

test('perimeter: a single star stays inside one folder', () => {
  withSandbox((box) => {
    box.write('src/rules.ts', 'export const x = 3\n');
    box.write('src/sub/y.ts', 'y\n');
    const result = runScript('perimeter.mjs', [box.repo, box.base, 'src/*.ts'], box.env());
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /^outside src\/sub\/y\.ts$/m);
    assert.doesNotMatch(result.stdout, /^outside src\/rules\.ts$/m);
  });
});

test('perimeter reports both sides of a rename and a deletion', () => {
  withSandbox((box) => {
    box.git('mv', 'tests/rules.test.ts', 'src/rules.test.ts');
    const result = runScript('perimeter.mjs', [box.repo, box.base, 'src/**'], box.env());
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /^outside tests\/rules\.test\.ts$/m);
  });
});

test('perimeter says so when nothing changed, and refuses an unknown base or no globs', () => {
  withSandbox((box) => {
    const empty = runScript('perimeter.mjs', [box.repo, box.base, 'src/**'], box.env());
    assert.equal(empty.status, 0, empty.out);
    assert.match(empty.stdout, /nothing changed since/i);
    const badBase = runScript('perimeter.mjs', [box.repo, 'no-such-ref', 'src/**'], box.env());
    assert.equal(badBase.status, 64, badBase.out);
    const noGlob = runScript('perimeter.mjs', [box.repo, box.base], box.env());
    assert.equal(noGlob.status, 64, noGlob.out);
  });
});

// --- review package ---

test('review package carries commits, uncommitted changes and untracked files', () => {
  withSandbox((box) => {
    box.write('src/rules.ts', 'export const x = 4\n');
    box.git('commit', '-q', '-am', 'first round (before PASS)');
    box.write('tests/rules.test.ts', 'changed but not committed\n');
    box.write('tests/audit/new.test.ts', 'it("new")\n');
    const out = join(box.root, 'reviews', 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.match(text, /first round \(before PASS\)/);
    assert.match(text, /^\+export const x = 4$/m);
    assert.match(text, /^\+changed but not committed$/m);
    assert.match(text, /^## New file: tests\/audit\/new\.test\.ts$/m);
    assert.match(text, /^\+it\("new"\)$/m);
    assert.doesNotMatch(text, /truncated/i);
  });
});

test('review package written inside the worktree does not swallow its previous copy', () => {
  withSandbox((box) => {
    box.write('src/rules.ts', 'export const x = 5\n');
    const out = join(box.repo, 'review.md');
    assert.equal(runScript('review-package.mjs', [box.repo, box.base, out], box.env()).status, 0);
    const second = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(second.status, 0, second.out);
    assert.doesNotMatch(readFileSync(out, 'utf8'), /New file: review\.md/);
  });
});

test('an empty review package exits 1 and says so in the file', () => {
  withSandbox((box) => {
    const out = join(box.root, 'empty.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 1, result.out);
    assert.match(result.out, /empty/i);
    assert.match(readFileSync(out, 'utf8'), /EMPTY PACKAGE/);
  });
});

// The loop's own artifacts: in a plugin project `.vibeflow/` is not
// ignored, so a report, a briefing or an earlier package would otherwise make the package non-empty.
test('review package leaves the loop artifact folders out and says how many paths it left out', () => {
  withSandbox((box) => {
    box.write('.vibeflow/loop/state.json', '{}\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'loop state');
    box.write('.vibeflow/briefings/rules.md', 'briefing\n');
    box.write('.vibeflow/progress/rules.md', 'progress\n');
    box.write('.vibeflow/audits/rules-audit.md', '**Verdict: pending**\n');
    box.write('.vibeflow/specs/rules.md', 'a spec is not a loop artifact\n');
    box.write('src/rules.ts', 'export const x = 8\n');
    const out = join(box.repo, '.vibeflow/reviews/rules-round-0.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.match(text, /^Loop artifacts left out: 4 path\(s\) under \.vibeflow\/ \(loop\/, briefings\/, progress\/, reviews\/, audits\/\)/m);
    assert.match(text, /^\+export const x = 8$/m);
    assert.match(text, /^## New file: \.vibeflow\/specs\/rules\.md$/m);
    for (const folder of ['loop', 'briefings', 'progress', 'reviews', 'audits']) {
      assert.doesNotMatch(text, new RegExp(`\\.vibeflow/${folder}/`), `${folder}/ stays out of the package`);
    }
  });
});

test('a review package that would hold only loop artifacts is empty', () => {
  withSandbox((box) => {
    box.git('checkout', '-q', '-b', 'feat');
    box.write('.vibeflow/progress/rules.md', 'progress\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'progress only');
    box.write('.vibeflow/audits/rules-audit.md', '**Verdict: FAIL**\n');
    const out = join(box.repo, '.vibeflow/reviews/rules-round-0.md');
    const result = runScript('review-package.mjs', [box.repo, 'main', out], box.env());
    assert.equal(result.status, 1, result.out);
    const text = readFileSync(out, 'utf8');
    assert.match(text, /EMPTY PACKAGE/);
    assert.match(text, /^Loop artifacts left out: 2 path\(s\)/m);
  });
});

test('a round whose commits cancel out is not an empty package', () => {
  withSandbox((box) => {
    box.write('src/rules.ts', 'export const x = 7\n');
    box.git('commit', '-q', '-am', 'change');
    box.git('revert', '--no-edit', 'HEAD');
    const out = join(box.root, 'reverted.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.doesNotMatch(text, /EMPTY PACKAGE/);
    assert.match(text, /Revert "change"/);
  });
});

test('a review package over the cap names what it left out', () => {
  withSandbox((box) => {
    box.write('src/rules.ts', 'export const x = 6\n');
    box.write('src/big.ts', `${'const filler = 1\n'.repeat(400)}`);
    const out = join(box.root, 'capped.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out, '--max-bytes', '2000'], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.match(text, /^TRUNCATED: /m);
    assert.match(text, /^- src\/big\.ts \(\d+ bytes\)$/m);
    assert.match(text, /^\+export const x = 6$/m);
    assert.match(result.stdout, /truncated/i);
  });
});

test('a review package names the file it left out under diff.noprefix or diff.mnemonicPrefix', () => {
  for (const setting of ['diff.noprefix', 'diff.mnemonicPrefix']) {
    withSandbox((box) => {
      box.git('config', setting, 'true');
      box.write('src/rules.ts', 'export const x = 6\n');
      box.write('src/big.ts', 'const filler = 1\n');
      box.git('add', '-A');
      box.git('commit', '-q', '-m', 'track big');
      box.write('src/big.ts', `${'const filler = 2\n'.repeat(400)}`);
      const out = join(box.root, 'capped.md');
      const result = runScript('review-package.mjs', [box.repo, box.base, out, '--max-bytes', '2000'], box.env());
      assert.equal(result.status, 0, `${setting}: ${result.out}`);
      const text = readFileSync(out, 'utf8');
      assert.match(text, /^- src\/big\.ts \(\d+ bytes\)$/m, `${setting}: ${text.slice(0, 600)}`);
      assert.doesNotMatch(text, /^- \? \(/m, setting);
    });
  }
});

test('review package refuses an unknown base with exit 2', () => {
  withSandbox((box) => {
    const result = runScript('review-package.mjs', [box.repo, 'no-such-ref', join(box.root, 'x.md')], box.env());
    assert.equal(result.status, 2, result.out);
    assert.equal(existsSync(join(box.root, 'x.md')), false);
  });
});

// --- check-probes ---

const STATE_PROBES = {
  'reads git': "it('perimeter', () => { execFileSync('git', ['diff', 'origin/main...HEAD']) })",
  'current version': "it('version', () => { expect(VERSION).toBe('4.4.1') })",
  'state that changes by itself': "it('sentence', () => { expect(doc).toContain('the swap is still pending') })",
  'line number': "it('line', () => { expect(report).toContain('src/rules.ts:42') })",
  'real clock': "it('clock', () => { expect(stamp).toBeLessThan(Date.now()) })",
  'doc text': "it('doc', () => { expect(readFileSync('docs/guide.md', 'utf8')).toContain('x') })",
};

for (const [family, line] of Object.entries(STATE_PROBES)) {
  test(`check-probes flags the "${family}" family`, () => {
    withSandbox((box) => {
      box.write('tests/audit/feature-rules.test.ts', `${line}\n`);
      const result = runScript('check-probes.mjs', [box.repo, '--base', box.base], box.env());
      assert.equal(result.status, 1, result.out);
      assert.match(result.stdout, new RegExp(`^tests/audit/feature-rules\\.test\\.ts:1 \\[${family}\\]`, 'm'));
    });
  });
}

test('check-probes passes a behavior probe and reads only audit folders', () => {
  withSandbox((box) => {
    box.write('tests/audit/feature-rules.test.ts', "it('ok', () => { expect(sum(1, 2)).toBe(3) })\n");
    box.write('tests/unit/clock.test.ts', 'Date.now()\n');
    const withBase = runScript('check-probes.mjs', [box.repo, '--base', box.base], box.env());
    assert.equal(withBase.status, 0, withBase.out);
    assert.match(withBase.stdout, /1 probe file\(s\) read/);
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'probes');
    const full = runScript('check-probes.mjs', [box.repo], box.env());
    assert.equal(full.status, 0, full.out);
    assert.match(full.stdout, /1 probe file\(s\) read/);
  });
});

// --- who-reads ---

test('who-reads finds the test that reads a file', () => {
  withSandbox((box) => {
    const result = runScript('who-reads.mjs', [box.repo, 'src/rules.ts'], box.env());
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /^ {2}reads tests\/rules\.test\.ts:/m);
  });
});

test('who-reads exits 0 when nobody reads the file', () => {
  withSandbox((box) => {
    box.write('src/alone.ts', 'export {}\n');
    box.git('add', '-A');
    const result = runScript('who-reads.mjs', [box.repo, 'src/alone.ts'], box.env());
    assert.equal(result.status, 0, result.out);
    assert.match(result.stdout, /src\/alone\.ts: 0 reference/);
  });
});

test('who-reads marks a generated file', () => {
  withSandbox((box) => {
    box.write('docs/api.md', '<!-- generated by tools/gen.mjs: do not edit -->\n');
    box.git('add', '-A');
    const result = runScript('who-reads.mjs', [box.repo, 'docs/api.md'], box.env());
    assert.match(result.stdout, /generated file/i);
  });
});

// --- check-briefing ---

function briefing(dir, name, text) {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
}

const EXECUTOR_OK = `# feature · rules · executor

## Asked
Port the rules.

## Done when
* DoD 1: the rules load from the file
* DoD 10: the cache expires at midnight

## Read first
* project knowledge: \`.vibeflow/index.md\`

## Facts
* the suite passes 13 of 13 (measured 08:13 by \`node --test\`)
* the CI uses Node 22 (to check: the workflow file)

## Perimeter
* may change: \`src/**\`

## Verification contract
* red before green

## Ceiling
* 400k tokens

## Progress and delivery
* progress file
`;

test('check-briefing flags missing sections, a fact without time and source, and a copied principle', () => {
  scratch((dir) => {
    const principles = readFileSync(join(LOOP_DIR, 'principles.md'), 'utf8');
    const sentence = principles
      .split(/(?<=[.;:])\s+|\n/)
      .map((piece) => piece.replace(/^[\s*\d.>-]+/, '').trim())
      .find((piece) => piece.split(/\s+/).length >= 16 && !/[`*]/.test(piece));
    assert.ok(sentence, 'principles.md has no plain sentence of 16 words to copy');
    const text = `# feature · rules · executor

## Read first
* project knowledge: \`.vibeflow/index.md\`

## Facts
* the deploy failed every night since 23/09

${sentence}
`;
    const result = runScript('check-briefing.mjs', [briefing(dir, 'feature-rules-executor.md', text)], hermeticEnv(dir));
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /missing sections: .*done when/i);
    assert.match(result.stdout, /without time and source/);
    assert.match(result.stdout, /copied from principles\.md/);
  });
});

test('check-briefing stops on a secret', () => {
  scratch((dir) => {
    // The credential is split so secret scanners do not flag this test file.
    const url = `${'post'}${'gres'}ql://app:${'x'.repeat(6)}@127.0.0.1:5432/app_test`;
    const result = runScript(
      'check-briefing.mjs',
      [briefing(dir, 'feature-rules-executor.md', `${EXECUTOR_OK}\nDATABASE_URL=${url}\n`)],
      hermeticEnv(dir),
    );
    assert.equal(result.status, 2, result.out);
    assert.match(result.stdout, /^\[stop\] .*secret/m);
  });
});

const auditor = (criteria) => `# feature · rules · auditor

## What to audit
The rules port.

## Criteria
${criteria}

## Read first
* \`.vibeflow/index.md\`

## Review package
* \`.vibeflow/reviews/feature-rules-round-1.md\`

## Facts
* base is 1a2b3c4 (measured 08:15 by \`git rev-parse\`)

## Risk and sabotage
* none

## Probes
* behavior only

## Ceiling
* partial report

## Delivery
* report
`;

test('check-briefing --pair finds an auditor criterion missing from the executor', () => {
  scratch((dir) => {
    const executor = briefing(dir, 'feature-rules-executor.md', EXECUTOR_OK);
    const paired = runScript('check-briefing.mjs', [
      briefing(dir, 'feature-rules-auditor.md', auditor('* DoD 1: the rules load from the file\n* dod 10 — the cache expires at midnight')),
      '--pair', executor,
    ], hermeticEnv(dir));
    assert.equal(paired.status, 0, paired.out);

    const missing = runScript('check-briefing.mjs', [
      briefing(dir, 'feature-rules-auditor.md', auditor('* DoD 1: the rules load from the file\n* DoD 2: a malformed file is refused')),
      '--pair', executor,
    ], hermeticEnv(dir));
    assert.equal(missing.status, 1, missing.out);
    assert.match(missing.stdout, /not in the executor's "Done when".*DoD 2: a malformed file is refused/);
    assert.doesNotMatch(missing.stdout, /DoD 1: the rules/);

    // "DoD 1" must not be satisfied by "DoD 10": criteria match on whole words.
    const prefix = runScript('check-briefing.mjs', [
      briefing(dir, 'feature-rules-auditor.md', auditor('* DoD 1')),
      '--pair', briefing(dir, 'other-rules-executor.md', EXECUTOR_OK.replace('* DoD 1: the rules load from the file\n', '')),
    ], hermeticEnv(dir));
    assert.equal(prefix.status, 1, prefix.out);

    const none = runScript('check-briefing.mjs', [
      briefing(dir, 'feature-rules-auditor.md', auditor('')),
      '--pair', executor,
    ], hermeticEnv(dir));
    assert.equal(none.status, 1, none.out);
    assert.match(none.stdout, /no criteria/i);
  });
});

test('check-briefing --pair reads a section down to the next heading of its level or above, sub-headings included', () => {
  scratch((dir) => {
    const executor = briefing(dir, 'feature-rules-executor.md', EXECUTOR_OK);
    const grouped = runScript('check-briefing.mjs', [
      briefing(dir, 'feature-rules-auditor.md', auditor('* DoD 1: the rules load from the file\n\n### From the risks\n* DoD 2: a malformed file is refused')),
      '--pair', executor,
    ], hermeticEnv(dir));
    assert.equal(grouped.status, 1, grouped.out);
    assert.match(grouped.stdout, /not in the executor's "Done when": DoD 2: a malformed file is refused/);

    // The same rule on the executor side: an item under a sub-heading of "Done when" counts.
    const subExecutor = briefing(dir, 'sub-rules-executor.md', EXECUTOR_OK.replace(
      '* DoD 10: the cache expires at midnight\n',
      '* DoD 10: the cache expires at midnight\n\n### Risks\n* DoD 2: a malformed file is refused\n',
    ));
    const both = runScript('check-briefing.mjs', [
      briefing(dir, 'feature-rules-auditor.md', auditor('* DoD 1: the rules load from the file\n\n### From the risks\n* DoD 2: a malformed file is refused')),
      '--pair', subExecutor,
    ], hermeticEnv(dir));
    assert.equal(both.status, 0, both.out);
    assert.match(both.stdout, /all 2 auditor criteria/);

    // A heading of the same level ends the section: "Read first" items are not criteria.
    const after = runScript('check-briefing.mjs', [
      briefing(dir, 'feature-rules-auditor.md', auditor('* DoD 1: the rules load from the file')),
      '--pair', executor,
    ], hermeticEnv(dir));
    assert.equal(after.status, 0, after.out);
    assert.match(after.stdout, /all 1 auditor criteria/);
  });
});

test('check-briefing takes the role from the file name or from --role', () => {
  scratch((dir) => {
    const unknown = runScript('check-briefing.mjs', [briefing(dir, 'notes.md', EXECUTOR_OK)], hermeticEnv(dir));
    assert.equal(unknown.status, 1, unknown.out);
    assert.match(unknown.stdout, /role/);
    const named = runScript('check-briefing.mjs', [briefing(dir, 'notes.md', EXECUTOR_OK), '--role', 'executor'], hermeticEnv(dir));
    assert.equal(named.status, 0, named.out);
    const bad = runScript('check-briefing.mjs', [join(dir, 'missing.md')], hermeticEnv(dir));
    assert.equal(bad.status, 64, bad.out);
  });
});

// --- watch-pr ---

const PR = (state, checks) => ({ state, title: 'feat', url: 'https://example.invalid/pr/7', statusCheckRollup: checks });

test('watch-pr exits 0 when every check is green', () => {
  withSandbox((box) => {
    box.setGh(PR('OPEN', [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }]));
    const result = runScript('watch-pr.mjs', ['--repo', 'owner/repo', '--pr', '7', '--timeout-min', '0'], box.env());
    assert.equal(result.status, 0, result.out);
    assert.match(readFileSync(box.ghLog, 'utf8'), /pr view 7 --repo owner\/repo/);
  });
});

test('watch-pr exits 1 when a check failed', () => {
  withSandbox((box) => {
    box.setGh(PR('OPEN', [
      { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' },
    ]));
    const result = runScript('watch-pr.mjs', ['--repo', 'owner/repo', '--pr', '7', '--timeout-min', '0'], box.env());
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /failed: test/);
  });
});

test('watch-pr exits 2 when the PR was closed or merged', () => {
  withSandbox((box) => {
    for (const state of ['CLOSED', 'MERGED']) {
      box.setGh(PR(state, []));
      const result = runScript('watch-pr.mjs', ['--repo', 'owner/repo', '--pr', '7', '--timeout-min', '0'], box.env());
      assert.equal(result.status, 2, `${state}: ${result.out}`);
    }
  });
});

test('watch-pr exits 3 at the ceiling with checks pending, with no checks, or with gh failing', () => {
  withSandbox((box) => {
    box.setGh(PR('OPEN', [{ name: 'test', status: 'IN_PROGRESS', conclusion: '' }]));
    const pending = runScript('watch-pr.mjs', ['--repo', 'owner/repo', '--pr', '7', '--timeout-min', '0'], box.env());
    assert.equal(pending.status, 3, pending.out);
    assert.match(pending.stdout, /pending: test/);

    box.setGh(PR('OPEN', []));
    const none = runScript('watch-pr.mjs', ['--repo', 'owner/repo', '--pr', '7', '--timeout-min', '0'], box.env());
    assert.equal(none.status, 3, none.out);
    assert.match(none.stdout, /no check/i);

    box.setGh('not json');
    const broken = runScript('watch-pr.mjs', ['--repo', 'owner/repo', '--pr', '7', '--timeout-min', '0'], box.env({ FAKE_GH_EXIT: '1' }));
    assert.equal(broken.status, 3, broken.out);
  });
});

test('watch-pr keeps polling until the checks finish', () => {
  withSandbox((box) => {
    // The fake gh answers "pending" on the first call and "green" afterwards.
    const done = join(box.root, 'gh-green.json');
    writeFileSync(done, JSON.stringify(PR('OPEN', [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }])));
    box.setGh(PR('OPEN', [{ name: 'test', status: 'QUEUED', conclusion: '' }]));
    box.writeExecutable('gh', [
      '#!/bin/sh',
      `if [ -f '${box.root}/seen' ]; then cat '${done}'; else touch '${box.root}/seen'; cat '${box.root}/gh-state.json'; fi`,
      '',
    ].join('\n'));
    const result = runScript('watch-pr.mjs', ['--repo', 'owner/repo', '--pr', '7', '--interval-sec', '0.05', '--timeout-min', '5'], box.env());
    assert.equal(result.status, 0, result.out);
  });
});

test('watch-pr stops at the ceiling, not an interval after it, with checks pending or gh failing', () => {
  withSandbox((box) => {
    // A 60-second interval under a 0.6-second ceiling: the runner kills it at 20 s if it sleeps the interval.
    const args = ['--repo', 'owner/repo', '--pr', '7', '--interval-sec', '60', '--timeout-min', '0.01'];
    box.setGh(PR('OPEN', [{ name: 'test', status: 'IN_PROGRESS', conclusion: '' }]));
    const pending = runScript('watch-pr.mjs', args, box.env());
    assert.equal(pending.status, 3, pending.out);
    assert.match(pending.stdout, /pending: test/);

    box.setGh('not json');
    const broken = runScript('watch-pr.mjs', args, box.env({ FAKE_GH_EXIT: '1' }));
    assert.equal(broken.status, 3, broken.out);
    assert.match(broken.stdout, /ceiling/);
  });
});

// --- watch-round ---

function aged(path, minutes) {
  const when = new Date(Date.now() - minutes * 60_000);
  utimesSync(path, when, when);
}

test('watch-round exits 0 on a final stage marker written during the watch, in a report or a progress file', async () => {
  await scratchAsync(async (dir) => {
    const markers = ['Stage: final', '* State: final', '**Stage:** final'];
    const results = await Promise.all(markers.map((marker, i) => {
      const file = briefing(dir, `report-${i}.md`, '# Audit\nStage: 2/5 reading\n');
      aged(file, 600);
      return watchWhile('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0.5', '--interval-sec', '0.05'], hermeticEnv(dir), {
        file,
        steps: [[400, () => appendFileSync(file, `${marker}\n`)]],
      });
    }));
    results.forEach((result, i) => {
      assert.equal(result.code, 0, `${markers[i]}: ${result.out}`);
      assert.match(result.out, /final stage marker found/);
      assert.ok(result.atExit.includes(markers[i]), `${markers[i]}: exited before the marker was written`);
    });
  });
});

test('watch-round watches a fix round: the marker the first round left does not end it, the fix section\'s own marker does', async () => {
  await scratchAsync(async (dir) => {
    const file = briefing(dir, 'feature-rules.md', '# feature · rules · progress\n## Milestone 1\n* done\n\nState: final\n');
    aged(file, 90);
    const first = runScript('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0'], hermeticEnv(dir));
    assert.equal(first.status, 3, `the marker of the first round ended the watch of the fix round: ${first.out}`);

    const fix = await watchWhile('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0.5', '--interval-sec', '0.05'], hermeticEnv(dir), {
      file,
      steps: [
        [300, () => appendFileSync(file, '\n## Fix 1\n* reading the audit report\n')],
        [900, () => appendFileSync(file, '* fixed the finding\n\nState: final · fix 1\n')],
      ],
    });
    assert.equal(fix.code, 0, fix.out);
    assert.ok(fix.atExit.includes('State: final · fix 1'), `exited before the fix wrote its marker: ${fix.out}`);
  });
});

test('watch-round exits 0 when a report that did not exist at the start reaches Stage: final', async () => {
  await scratchAsync(async (dir) => {
    const file = join(dir, 'feature-rules-audit.md');
    const result = await watchWhile('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0.5', '--interval-sec', '0.05'], hermeticEnv(dir), {
      file,
      steps: [
        [300, () => writeFileSync(file, '# Audit\nStage: 1/6 reading\nVerdict: pending\n')],
        [800, () => appendFileSync(file, 'Verdict: PASS\nStage: final\n')],
      ],
    });
    assert.equal(result.code, 0, result.out);
    assert.ok(result.atExit.includes('Stage: final'), result.out);
  });
});

test('watch-round: a report rewritten from scratch ends on its new marker, though the old copy had one', async () => {
  await scratchAsync(async (dir) => {
    const file = briefing(dir, 'feature-rules-audit.md', '# Audit\nVerdict: PARTIAL\nStage: final\n');
    const result = await watchWhile('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0.5', '--interval-sec', '0.05'], hermeticEnv(dir), {
      file,
      steps: [
        [300, () => writeFileSync(file, '# Audit\nStage: 1/6 reading\n')],
        [800, () => appendFileSync(file, 'Verdict: PASS\nStage: final\n')],
      ],
    });
    assert.equal(result.code, 0, result.out);
    assert.ok(result.atExit.includes('Verdict: PASS'), `exited on the old copy's marker: ${result.out}`);
  });
});

test('watch-round does not take a partial stage or a mention in prose for the end', () => {
  scratch((dir) => {
    const file = briefing(dir, 'report.md', '# Audit\nStage: 3/5 probes\nVerdict: PASS\nWrite `Stage: final` when done.\nStage: finalizing\n');
    const result = runScript('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0'], hermeticEnv(dir));
    assert.equal(result.status, 3, result.out);
  });
});

test('watch-round exits 1 with the silence checklist once the file stays unchanged for --stale-min during the watch', () => {
  scratch((dir) => {
    // Written long before the watch, then silent for the whole of a 0.6-second limit.
    const file = briefing(dir, 'progress.md', '# Progress\nStage: 2/4 implement\n');
    aged(file, 61);
    const result = runScript('watch-round.mjs', ['--file', file, '--stale-min', '0.01', '--timeout-min', '5', '--interval-sec', '0.05'], hermeticEnv(dir));
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /unchanged for/);
    assert.match(result.stdout, /waiting for an answer/i);
    assert.match(result.stdout, /CPU/);
    assert.match(result.stdout, /network/i);
    assert.match(result.stdout, /re-dispatch/i);
  });
});

test('watch-round restarts the silence clock at every change it sees', async () => {
  await scratchAsync(async (dir) => {
    const file = briefing(dir, 'progress.md', '# Progress\n');
    // Limit 1.8 s; a change every 0.6 s for 2.4 s, then the marker at 3 s.
    const steps = [600, 1200, 1800, 2400].map((delay, i) => [delay, () => appendFileSync(file, `* milestone ${i + 1}\n`)]);
    steps.push([3000, () => appendFileSync(file, 'State: final\n')]);
    const result = await watchWhile('watch-round.mjs', ['--file', file, '--stale-min', '0.03', '--timeout-min', '1', '--interval-sec', '0.05'], hermeticEnv(dir), { file, steps });
    assert.equal(result.code, 0, `silent while the file kept changing: ${result.out}`);
  });
});

test('watch-round stops at the ceiling, not an interval after it', () => {
  scratch((dir) => {
    const file = briefing(dir, 'progress.md', '# Progress\n');
    // A 60-second interval under a 0.6-second ceiling: the runner kills it at 20 s if it sleeps the interval.
    const result = runScript('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0.01', '--interval-sec', '60'], hermeticEnv(dir));
    assert.equal(result.status, 3, result.out);
    assert.match(result.stdout, /ceiling/);
  });
});

test('watch-round measures staleness in minutes: a 1.2-second silent watch is not stale under a 0.05-minute (3-second) limit', () => {
  scratch((dir) => {
    const file = briefing(dir, 'progress.md', '# Progress\n');
    // Read as seconds, the 0.05 limit would trip at the second read; read as minutes, the ceiling comes first.
    const result = runScript('watch-round.mjs', ['--file', file, '--stale-min', '0.05', '--timeout-min', '0.02', '--interval-sec', '0.05'], hermeticEnv(dir));
    assert.equal(result.status, 3, result.out);
    assert.match(result.stdout, /ceiling/i);
  });
});

test('watch-round counts a missing file as silence from the start', () => {
  scratch((dir) => {
    const result = runScript('watch-round.mjs', ['--file', join(dir, 'never.md'), '--stale-min', '0', '--timeout-min', '5'], hermeticEnv(dir));
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /does not exist/);
  });
});

test('watch-round refuses missing limits', () => {
  scratch((dir) => {
    const result = runScript('watch-round.mjs', ['--file', join(dir, 'x.md'), '--stale-min', 'soon'], hermeticEnv(dir));
    assert.equal(result.status, 64, result.out);
  });
});

// --- preflight ---

test('preflight is a go on a clean feature branch', () => {
  withSandbox((box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    const result = runScript('preflight.mjs', ['--repo', box.repo, '--no-network'], box.env());
    assert.equal(result.status, 0, result.out);
    assert.match(result.stdout, /branch feat\/x/);
    assert.match(result.stdout, /open PRs: none/);
    assert.match(result.stdout, /^verdict: go$/m);
  });
});

test('preflight stops on the default branch', () => {
  withSandbox((box) => {
    const result = runScript('preflight.mjs', ['--repo', box.repo, '--no-network'], box.env());
    assert.equal(result.status, 2, result.out);
    assert.match(result.stdout, /^\[stop\] .*default branch main/m);
  });
});

test('preflight calls attention to dirty files, stashes, red CI and the effort variable', () => {
  withSandbox((box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.write('src/rules.ts', 'dirty\n');
    box.setGh([{ number: 3, title: 'other', isDraft: false, statusCheckRollup: [{ name: 't', status: 'COMPLETED', conclusion: 'FAILURE' }] }]);
    const result = runScript('preflight.mjs', ['--repo', box.repo, '--no-network'], box.env({ CLAUDE_CODE_EFFORT_LEVEL: 'low' }));
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /1 dirty file/);
    assert.match(result.stdout, /PR #3: CI red/);
    assert.match(result.stdout, /CLAUDE_CODE_EFFORT_LEVEL=low/);
  });
});

test('preflight --power stops on a low battery', () => {
  withSandbox((box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.writeExecutable('pmset', [
      '#!/bin/sh',
      'case "$2" in',
      `  batt) printf "Now drawing from 'Battery Power'\\n -InternalBattery-0 (id=1)\\t9%%; discharging\\n" ;;`,
      '  *) printf "Assertion status system-wide:\\n   PreventUserIdleSystemSleep    0\\n" ;;',
      'esac',
      '',
    ].join('\n'));
    box.writeExecutable('ioreg', '#!/bin/sh\necho \'"AppleClamshellState" = No\'\n');
    const result = runScript('preflight.mjs', ['--repo', box.repo, '--no-network', '--power', '--hours', '2'], box.env());
    assert.equal(result.status, 2, result.out);
    assert.match(result.stdout, /^\[stop\] power: battery, 9%/m);
  });
});

test('preflight stops outside a git repository', () => {
  scratch((dir) => {
    const result = runScript('preflight.mjs', ['--repo', dir, '--no-network'], hermeticEnv(dir, { PATH: '/usr/bin:/bin' }));
    assert.equal(result.status, 2, result.out);
    assert.match(result.stdout, /not a git/);
  });
});

test('the hermetic helper strips GIT_* even when the parent has them', () => {
  const env = hermeticEnv(tmpdir(), {});
  const probe = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: tmpdir(), env: { ...env }, encoding: 'utf8' });
  assert.notEqual(probe.status, 0, 'tmpdir must not resolve to a repository');
  assert.equal(Object.keys(env).some((key) => key.startsWith('GIT_')), false);
});
