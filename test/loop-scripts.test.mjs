import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
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
    'watch-pr.mjs': ['0 green', '1 failed', '2 closed', '3 ceiling', '64 bad arguments', '69 gh missing or not executable', '77 gh not logged in'],
    'watch-round.mjs': ['0 final', '1 silent', '3 ceiling'],
  };
  for (const [name, expected] of Object.entries(codes)) {
    const row = readme.split('\n').find((line) => line.startsWith('|') && line.includes(`\`${name.replace('.mjs', '')}`));
    assert.ok(row, `README has no table row for ${name}`);
    for (const code of expected) assert.ok(row.includes(code), `${name} row lacks "${code}"`);
  }
});

test('the README scripts table keeps every cell under 300 characters, and the exit departures are a list', () => {
  const readme = readFileSync(join(LOOP_DIR, 'README.md'), 'utf8');
  const rows = readme.split('\n').filter((line) => line.startsWith('| `'));
  assert.ok(rows.length >= 8, `the scripts table (${rows.length} rows)`);
  for (const row of rows) {
    for (const cell of row.split(/(?<!\\)\|/).slice(1, -1)) {
      assert.ok(cell.trim().length <= 300, `a cell of ${cell.trim().length} characters: ${cell.trim().slice(0, 80)}...`);
    }
  }
  const block = readme.split(/\n\s*\n/).find((text) => text.startsWith('Every script also exits 64'));
  assert.ok(block, 'the exit-code block');
  assert.ok(block.split('\n').filter((line) => /^\* /.test(line)).length >= 3, `the departures are list items:\n${block}`);
});

test('review-package usage and README say what stays out: what looks like a secret, and .vibeflow/ alone', () => {
  const usage = runScript('review-package.mjs', ['--help'], hermeticEnv(tmpdir())).stdout;
  assert.match(usage, /WITHHELD/);
  assert.match(usage, /only under \.vibeflow\/ is empty/);
  assert.match(usage, /1 empty \(nothing changed outside \.vibeflow\/\)/);
  const readme = readFileSync(join(LOOP_DIR, 'README.md'), 'utf8').replace(/\s+/g, ' ');
  assert.match(readme, /`WITHHELD`/);
  assert.match(readme, /only under `\.vibeflow\/` is an empty package/);
});

test('review-package usage and README say that no line of the package looks like a secret, the header included', () => {
  const usage = runScript('review-package.mjs', ['--help'], hermeticEnv(tmpdir())).stdout.replace(/\s+/g, ' ');
  assert.match(usage, /A file whose path looks like a secret is withheld the same way/);
  assert.match(usage, /a commit keeps its short hash/);
  assert.match(usage, /HEADER LINES LEFT OUT/);
  assert.match(usage, /checked line by line before it is written: a line that still looks like a secret exits 2/);
  const readme = readFileSync(join(LOOP_DIR, 'README.md'), 'utf8').replace(/\s+/g, ' ');
  assert.match(readme, /`HEADER LINES LEFT OUT`/);
  assert.match(readme, /keeps only its short hash/);
  assert.match(readme, /a file diff whose path looks like a secret/i);
  assert.match(readme, /exits 2 without writing/);
});

test('review-package --help keeps every line within 100 characters', () => {
  const usage = runScript('review-package.mjs', ['--help'], hermeticEnv(tmpdir())).stdout;
  for (const line of usage.split('\n')) {
    assert.ok(line.length <= 100, `a usage line of ${line.length} characters: ${line}`);
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
    assert.match(readFileSync(out, 'utf8'), /check the base/, 'with nothing changed at all, the base may be the wrong one');
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

// --- review package: .vibeflow/ alone is not a change ---

test('a change only under .vibeflow/ is an empty package that counts the .vibeflow/ paths', () => {
  withSandbox((box) => {
    box.git('checkout', '-q', '-b', 'feat');
    box.write('.vibeflow/index.md', 'project knowledge\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'knowledge only');
    box.write('.vibeflow/specs/rules.md', 'a new spec, not yet tracked\n');
    box.write('.vibeflow/audits/rules-audit.md', '**Verdict: pending**\n');
    const out = join(box.repo, '.vibeflow/reviews/rules-round-0.md');
    const result = runScript('review-package.mjs', [box.repo, 'main', out], box.env());
    assert.equal(result.status, 1, result.out);
    const text = readFileSync(out, 'utf8');
    assert.match(text, /^EMPTY PACKAGE: .*\b3 path\(s\) under \.vibeflow\//m);
    assert.match(text, /^Loop artifacts left out: 1 path\(s\)/m);
    assert.match(result.stdout, /empty package.*\b3 path\(s\) under \.vibeflow\//);
    assert.doesNotMatch(text, /^## New file:/m);
    assert.doesNotMatch(text, /check the base/, 'the base is right: only .vibeflow/ changed since it');
  });
});

test('with a change outside .vibeflow/, the rest of .vibeflow/ is in the package as context and the artifact folders stay out', () => {
  withSandbox((box) => {
    box.git('checkout', '-q', '-b', 'feat');
    box.write('.vibeflow/index.md', 'project knowledge\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'knowledge');
    box.write('.vibeflow/specs/rules.md', 'a new spec, not yet tracked\n');
    box.write('.vibeflow/progress/rules.md', 'State: final\n');
    box.write('src/rules.ts', 'export const x = 9\n');
    const out = join(box.repo, '.vibeflow/reviews/rules-round-0.md');
    const result = runScript('review-package.mjs', [box.repo, 'main', out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.match(text, /^\+export const x = 9$/m);
    assert.match(text, /^\+project knowledge$/m);
    assert.match(text, /^## New file: \.vibeflow\/specs\/rules\.md$/m);
    assert.match(text, /^Loop artifacts left out: 1 path\(s\)/m);
    assert.doesNotMatch(text, /\.vibeflow\/progress\//);
  });
});

// --- review package: what looks like a secret stays out ---

// Every sample is assembled at run time, so no secret scanner flags this file and no real
// credential is written anywhere. One sample per kind the kit's detector names.
const SECRET_SAMPLES = {
  'OpenAI project key': `${'sk-'}${'proj-'}${'a1b2c3d4e5'}`,
  'Anthropic key': `${'sk-'}${'ant-'}${'a1b2c3d4e5'}`,
  'GitHub token': `${'gh'}${'p_'}${'A1b2C3d4'.repeat(3)}`,
  'GitHub fine-grained token': `${'github'}${'_pat_'}${'a1b2c3'}`,
  'AWS access key': `${'AK'}${'IA'}${'ABCDEFGHIJ234567'}`,
  'Slack token': `${'xox'}${'b-'}${'1234567890-abc'}`,
  'private key': `${'-----BEGIN RSA PRIVATE '}${'KEY-----'}`,
  'database URL with a password': `${'post'}${'gres'}://app:${'x'.repeat(6)}@127.0.0.1:5432/app_test`,
  'Stripe live key': `${'sk'}${'_live_'}${'A1b2C3d4E5f6G7h8'}`,
  'Stripe restricted key': `${'rk'}${'_live_'}${'A1b2C3d4E5f6G7h8'}`,
  'Google API key': `${'AI'}${'za'}${'A1b2C3d4E5'.repeat(3)}${'A1b2C'}`,
  'password set to a literal value': `${'DB_PASS'}${'WORD'}=${'not-a-real-'}${'secret-ABC123'}`,
};

// A name that looks like it holds a secret, set to a literal value, in the shapes a project
// keeps one: an env line on its own, a .env file nobody ignores, YAML, and a live payment key.
// Each value is assembled at run time and is not a real credential.
const ASSIGNED_SECRETS = [
  { path: 'notes.txt', text: `scratch notes\n${'DB_PASS'}${'WORD'}=${'not-a-real-'}${'secret-ABC123'}\n`, line: 2 },
  { path: '.env', text: `DEBUG=1\n${'SECRET'}${'_KEY'}=${'f4ke'}${'Va1ue9x7Q'}\n`, line: 2 },
  { path: 'config/app.yaml', text: `db:\n  host: db\n  ${'pass'}${'word'}: "${'not-a-real-'}${'secret-XYZ'}"\n`, line: 3 },
  { path: 'src/pay.ts', text: `const key = '${'sk'}${'_live_'}${'Z9y8X7w6V5u4T3s2'}'\n`, line: 1 },
];

// Ordinary code that names a secret but reads it from somewhere: never withheld, never a stop.
const READS_A_SECRET = [
  'token = request.headers.get("x")',
  'API_TOKEN = os.environ["API_TOKEN"]',
  'const apiToken = process.env.API_TOKEN;',
  'SECRET_KEY = get_secret()',
  '"password": "${PASSWORD}"',
];

// A name that looks like a secret set to a value that is not one: an empty or boolean value in
// JavaScript, Python, Ruby or YAML, or the path of the file that holds the secret.
const NOT_A_SECRET = [
  'refreshToken: undefined,',
  `${'POSTGRES_PASS'}${'WORD'}_FILE=/run/secrets/db_password`,
  'SECRET_KEY=UNDEFINED',
  'password: "undefined"',
  'api_token: None',
  'access_key = nil',
  'password: null',
  'API_KEY=false',
  'auth_token: True',
  'TOKEN_PATH="./secrets/token.txt"',
  "PRIVATE_KEY_FILE='/etc/app/private.pem'",
];

// A quoted value that begins with one of those words and goes on, with "!", ".", "&", "*" or "%"
// after the word, is a literal like any other: the word alone is no secret, the quoted value is.
// Each value is assembled at run time and is not a real credential.
const quotedLiteral = (path, assign, quote, value) => ({ path, value, line: `${assign}${quote}${value}${quote}` });
const QUOTED_FROM_A_WORD = [
  quotedLiteral('config/true.yml', `${'pass'}${'word'}: `, '"', `${'True'}${'!Love2024'}`),
  quotedLiteral('config/none.yml', `${'pass'}${'word'}: `, '"', `${'None'}${'.Of.Your.Business'}`),
  quotedLiteral('config/null.env', `${'SECRET'}${'_KEY'}=`, '"', `${'null'}${'&void#Secret9'}`),
  quotedLiteral('config/false.env', `${'DB_PASS'}${'WORD'}=`, '"', `${'false'}${'*Hope77'}`),
  quotedLiteral('config/nil.rb', `${'API'}${'_TOKEN'} = `, "'", `${'nil'}${'%4fXk9QzR2'}`),
  quotedLiteral('config/undefined.json', `"${'api'}${'_key'}": `, '"', `${'undefined'}${'.k9X2mQ7rT'}`),
];

const WITHHELD_HEADER = /^WITHHELD: (\d+) file diff\(s\) left out because a line looks like a secret or credential\. Read them with git before judging:$/m;

test('review package leaves out a new file and a tracked file diff whose line looks like a secret, and keeps a clean new file whole', () => {
  withSandbox((box) => {
    const url = SECRET_SAMPLES['database URL with a password'];
    const key = SECRET_SAMPLES['AWS access key'];
    box.write('src/rules.ts', `export const x = 1\nexport const y = 2\nconst url = '${url}'\n`);
    box.write('notes/local.txt', `local notes\nAWS_ACCESS_KEY_ID=${key}\n`);
    box.write('src/clean.ts', 'export const clean = 1\nexport const also = 2\n');
    const out = join(box.root, 'reviews', 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.ok(!text.includes(url), 'the database URL stays out of the package');
    assert.ok(!text.includes(key), 'the access key stays out of the package');
    assert.ok(!text.includes('const url ='), 'the whole tracked file diff stays out, not just the line');
    assert.ok(!text.includes('local notes'), 'the whole new file stays out, not just the line');
    assert.equal(text.match(WITHHELD_HEADER)?.[1], '2', text.slice(0, 800));
    assert.match(text, /^- src\/rules\.ts \(\d+ bytes, line 3\)$/m);
    assert.match(text, /^- notes\/local\.txt \(\d+ bytes, line 2\)$/m);
    assert.ok(text.indexOf('WITHHELD:') < text.indexOf('## Commits since the base'), 'the list is at the top');
    assert.match(text, /^## New file: src\/clean\.ts$/m);
    assert.match(text, /^\+export const clean = 1$/m);
    assert.match(text, /^\+export const also = 2$/m);
    assert.match(result.stdout, /withheld: 2 file diff\(s\) left out/);
  });
});

test('review package leaves out a diff that removes a secret, naming the line in the base', () => {
  withSandbox((box) => {
    const token = SECRET_SAMPLES['GitHub token'];
    box.write('config/app.env', `NAME=app\nPORT=80\nTOKEN=${token}\n`);
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'config');
    const base = box.git('rev-parse', 'HEAD').trim();
    box.write('config/app.env', 'NAME=app\nPORT=80\n');
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.ok(!text.includes(token), 'the removed token stays out of the package');
    assert.match(text, /^- config\/app\.env \(\d+ bytes, line 3\)$/m);
  });
});

test('a review package with nothing that looks like a secret has no WITHHELD list', () => {
  withSandbox((box) => {
    box.write('src/rules.ts', 'export const x = 3\n');
    box.write('src/new.ts', 'export const token = process.env.API_TOKEN\n');
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    assert.doesNotMatch(readFileSync(out, 'utf8'), /WITHHELD/);
    assert.doesNotMatch(result.stdout, /withheld/);
  });
});

test('a name that looks like a secret set to a literal value is withheld by review-package and stops check-briefing', () => {
  withSandbox((box) => {
    for (const { path, text } of ASSIGNED_SECRETS) box.write(path, text);
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const packaged = readFileSync(out, 'utf8');
    assert.equal(packaged.match(WITHHELD_HEADER)?.[1], String(ASSIGNED_SECRETS.length), packaged.slice(0, 800));
    for (const { path, text, line } of ASSIGNED_SECRETS) {
      const secretLine = text.split('\n')[line - 1];
      assert.ok(!packaged.includes(secretLine.trim()), `${path}: the line stays out of the package`);
      assert.match(packaged, new RegExp(`^- ${path.replace(/\./g, '\\.')} \\(\\d+ bytes, line ${line}\\)$`, 'm'), path);

      const briefed = runScript('check-briefing.mjs', [briefing(box.root, 'feature-rules-executor.md', `${EXECUTOR_OK}\n${text}`)], box.env());
      assert.equal(briefed.status, 2, `check-briefing, ${path}: ${briefed.out}`);
      assert.match(briefed.stdout, /^\[stop\] .*secret/m, path);
    }
  });
});

test('code that reads a secret from a header, the environment or a call is neither withheld nor a stop', () => {
  withSandbox((box) => {
    box.write('src/reads.txt', `${READS_A_SECRET.join('\n')}\n`);
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const packaged = readFileSync(out, 'utf8');
    assert.doesNotMatch(packaged, /WITHHELD/);
    for (const line of READS_A_SECRET) assert.ok(packaged.includes(`+${line}\n`), `in the package: ${line}`);

    for (const line of READS_A_SECRET) {
      const briefed = runScript('check-briefing.mjs', [briefing(box.root, 'feature-rules-executor.md', `${EXECUTOR_OK}\n${line}\n`)], box.env());
      assert.doesNotMatch(briefed.stdout, /secret or credential/, `check-briefing: ${line}`);
    }
  });
});

test('a name that looks like a secret set to undefined, null, true, false, none, nil or a path is neither withheld nor a stop', () => {
  withSandbox((box) => {
    box.write('src/settings.txt', `${NOT_A_SECRET.join('\n')}\n`);
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const packaged = readFileSync(out, 'utf8');
    assert.doesNotMatch(packaged, /WITHHELD/);
    for (const line of NOT_A_SECRET) assert.ok(packaged.includes(`+${line}\n`), `in the package: ${line}`);

    for (const line of NOT_A_SECRET) {
      const briefed = runScript('check-briefing.mjs', [briefing(box.root, 'feature-rules-executor.md', `${EXECUTOR_OK}\n${line}\n`)], box.env());
      assert.doesNotMatch(briefed.stdout, /secret or credential/, `check-briefing: ${line}`);
    }
  });
});

test('a quoted value that begins with undefined, null, true, false, none or nil and goes on is withheld and stops check-briefing, while the word alone is not', () => {
  withSandbox((box) => {
    for (const { path, line } of QUOTED_FROM_A_WORD) box.write(path, `${line}\n`);
    const plain = ['refreshToken: undefined,', 'enabled: true'];
    box.write('src/session.ts', `${plain.join('\n')}\n`);
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const packaged = readFileSync(out, 'utf8');
    assert.equal(packaged.match(WITHHELD_HEADER)?.[1], String(QUOTED_FROM_A_WORD.length), packaged.slice(0, 800));
    for (const { path, value } of QUOTED_FROM_A_WORD) {
      assert.ok(!packaged.includes(value), `${path}: the value stays out of the package`);
      assert.match(packaged, new RegExp(`^- ${path.replace(/\./g, '\\.')} \\(\\d+ bytes, line 1\\)$`, 'm'), path);
    }
    for (const line of plain) assert.ok(packaged.includes(`+${line}\n`), `in the package: ${line}`);

    for (const { path, line } of QUOTED_FROM_A_WORD) {
      const briefed = runScript('check-briefing.mjs', [briefing(box.root, 'feature-rules-executor.md', `${EXECUTOR_OK}\n${line}\n`)], box.env());
      assert.equal(briefed.status, 2, `check-briefing, ${path}: ${briefed.out}`);
      assert.match(briefed.stdout, /^\[stop\] .*secret/m, path);
    }
    for (const line of plain) {
      const briefed = runScript('check-briefing.mjs', [briefing(box.root, 'feature-rules-executor.md', `${EXECUTOR_OK}\n${line}\n`)], box.env());
      assert.doesNotMatch(briefed.stdout, /secret or credential/, `check-briefing: ${line}`);
    }
  });
});

test('a secret on the line git prints after a hunk header as its function context keeps the file diff out', () => {
  withSandbox((box) => {
    // Every line of an env file starts with a letter, so git names the line above the hunk.
    const url = SECRET_SAMPLES['database URL with a password'];
    const lines = ['NAME=app', `DATABASE_URL=${url}`, ...Array.from({ length: 18 }, (_, i) => `KEY_${i + 3}=${i + 3}`)];
    box.write('config/app.env', `${lines.join('\n')}\n`);
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'config');
    const base = box.git('rev-parse', 'HEAD').trim();
    lines[12] = 'KEY_13=changed';
    box.write('config/app.env', `${lines.join('\n')}\n`);
    const raw = box.git('diff', '-U10', base, '--', 'config/app.env');
    assert.match(raw, /^@@ -3,18 \+3,18 @@ DATABASE_URL=/m, 'git prints the secret line as the hunk context');
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.ok(!text.includes(url), 'the database URL stays out of the package');
    assert.ok(!text.includes('KEY_13=changed'), 'the whole file diff stays out');
    assert.match(text, /^- config\/app\.env \(\d+ bytes, line 3\)$/m, 'git gives no line for the context, so the hunk\'s first line is named');
  });
});

// --- review package: the header goes through the same detector ---

// Commit titles, status, stat, the new-file list and the title line are text the package writes
// too: a token pasted in a commit title or in a file name must not reach the package.
const HEADER_LEFT_OUT = /^HEADER LINES LEFT OUT: (\d+) line\(s\) /m;
const LINE_NOTE = '(line left out: it looks like a secret or credential; see HEADER LINES LEFT OUT at the top)';
// The entry of a file withheld for its path names the git command that lists it, committed or
// not: the files changed since the base for a tracked file, the untracked files for a new one.
const CHANGED_PATH_ENTRY = /^- a file whose path looks like a secret or credential \(\d+ bytes\): find it with git diff --name-only [0-9a-f]{7,}$/gm;
const NEW_PATH_ENTRY = /^- a file whose path looks like a secret or credential \(\d+ bytes\): find it with git ls-files --others --exclude-standard$/gm;

test('a commit title that looks like a secret leaves only the short hash and a note in the package', () => {
  withSandbox((box) => {
    const token = SECRET_SAMPLES['GitHub token'];
    box.write('src/rules.ts', 'export const x = 11\n');
    box.git('commit', '-q', '-am', `Configure ${token}`);
    const hash = box.git('rev-parse', '--short', 'HEAD').trim();
    box.write('src/rules.ts', 'export const x = 12\n');
    box.git('commit', '-q', '-am', 'second change');
    const baseShort = box.git('rev-parse', '--short', box.base).trim();
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.ok(!text.includes(token), 'the token in the commit title stays out of the package');
    assert.match(text, new RegExp(`^${hash} \\(title left out: it looks like a secret or credential; read it with git log -1 ${hash}\\)$`, 'm'));
    assert.match(text, /^[0-9a-f]+ second change$/m, 'a clean commit title stays');
    assert.equal(text.match(HEADER_LEFT_OUT)?.[1], '1', text.slice(0, 800));
    assert.ok(text.includes(`git log --oneline ${baseShort}..HEAD`), 'the top says how to read the lines with git');
    assert.ok(text.search(HEADER_LEFT_OUT) < text.indexOf('## Commits since the base'), 'the count is at the top');
    assert.doesNotMatch(text, /WITHHELD/, 'the diff itself is clean');
    assert.match(text, /^\+export const x = 12$/m, 'the diff stays in the package');
  });
});

test('a new file whose path looks like a secret is withheld whole, and its path stays out of every section', () => {
  withSandbox((box) => {
    const token = SECRET_SAMPLES['GitHub token'];
    box.write(`notes-${token}.txt`, 'harmless\n');
    box.write('src/rules.ts', 'export const x = 13\n');
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.ok(!text.includes(token), 'the token in the file name stays out of the package');
    assert.ok(!text.includes('harmless'), 'the whole new file stays out');
    assert.equal(text.match(WITHHELD_HEADER)?.[1], '1', text.slice(0, 800));
    assert.equal(text.match(NEW_PATH_ENTRY)?.length, 1, text.slice(0, 800));
    assert.equal(text.match(HEADER_LEFT_OUT)?.[1], '2', 'the status line and the new-file line');
    assert.equal(text.split('\n').filter((line) => line === LINE_NOTE).length, 2, text.slice(0, 1200));
    assert.match(text, /^\+export const x = 13$/m, 'the clean change stays in the package');
  });
});

test('a tracked file whose path looks like a secret is withheld whole, and its path stays out of the status and the stat', () => {
  withSandbox((box) => {
    const paths = [`notes-${SECRET_SAMPLES['GitHub token']}.txt`, `${'API'}${'_TOKEN'}=${'f4ke'}${'Va1ue9x7Q'}`];
    for (const path of paths) box.write(path, 'harmless\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'notes');
    for (const path of paths) box.write(path, 'harmless, edited\n');
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    for (const path of paths) assert.ok(!text.includes(path), `${path.slice(0, 9)}...: the path stays out of the package`);
    assert.ok(!text.includes('harmless'), 'the whole file diffs stay out');
    assert.equal(text.match(WITHHELD_HEADER)?.[1], '2', text.slice(0, 800));
    assert.equal(text.match(CHANGED_PATH_ENTRY)?.length, 2, text.slice(0, 800));
    assert.equal(text.match(HEADER_LEFT_OUT)?.[1], '4', 'two status lines and two stat lines');
    assert.match(text, /^[0-9a-f]+ notes$/m, 'the clean commit title stays');
  });
});

// Git writes a path holding a tab, a line break, a quote or a backslash between quotes, with that
// character escaped: the closing quote follows the value, so the detector alone no longer matches
// the status line or the diff lines that name the file.
const SECRET_LOOKING_NAME = `${'API'}${'_TOKEN'}=${'f4ke'}${'Va1ue9x7Q'}`;
const QUOTED_BY_GIT = { 'a tab': ['\t', '\\t'], 'a line break': ['\n', '\\n'], 'a quote': ['"', '\\"'], 'a backslash': ['\\', '\\\\'] };

test('a path git writes between quotes and that looks like a secret stays out of the package, tracked or new', () => {
  for (const [what, [raw, escaped]] of Object.entries(QUOTED_BY_GIT)) {
    for (const tracked of [true, false]) {
      withSandbox((box) => {
        const path = `notes${raw}${SECRET_LOOKING_NAME}`;
        let base = box.base;
        box.write(path, 'harmless\n');
        if (tracked) {
          box.git('add', '-A');
          box.git('commit', '-q', '-m', 'notes');
          base = box.git('rev-parse', 'HEAD').trim();
          box.write(path, 'harmless, edited\n');
        }
        box.write('src/rules.ts', 'export const x = 15\n');
        const label = `${what}, ${tracked ? 'tracked' : 'new'}`;
        const out = join(box.root, 'package.md');
        const result = runScript('review-package.mjs', [box.repo, base, out], box.env());
        assert.equal(result.status, 0, `${label}: ${result.out}`);
        const text = readFileSync(out, 'utf8');
        assert.ok(!text.includes(SECRET_LOOKING_NAME), `${label}: the path stays out of the package\n${text.slice(0, 1500)}`);
        assert.ok(!text.includes(`notes${escaped}`), `${label}: the quoted path stays out of the package`);
        assert.ok(!text.includes('harmless'), `${label}: the whole file diff stays out`);
        assert.equal(text.match(WITHHELD_HEADER)?.[1], '1', `${label}\n${text.slice(0, 800)}`);
        assert.equal(text.match(tracked ? CHANGED_PATH_ENTRY : NEW_PATH_ENTRY)?.length, 1, `${label}\n${text.slice(0, 800)}`);
        assert.match(text, HEADER_LEFT_OUT, `${label}: the status line is counted at the top`);
        assert.match(text, /^\+export const x = 15$/m, `${label}: the clean change stays in the package`);
      });
    }
  }
});

// The last check also looks for every path that looks like a secret, as git prints it and
// between quotes: the test runs a copy of the script whose checks of those paths find nothing.
test('review package exits 2 and writes nothing when a path that looks like a secret is still in the finished package between quotes', () => {
  const source = readFileSync(join(SCRIPTS_DIR, 'review-package.mjs'), 'utf8');
  const marker = 'const namesHiddenPath = (text) => hiddenForms.some((form) => text.includes(form));';
  assert.ok(source.includes(marker), 'review-package.mjs defines namesHiddenPath');
  withSandbox((box) => {
    const blind = join(box.root, 'review-package-blind.mjs');
    writeFileSync(blind, source.replace(marker, 'const namesHiddenPath = () => false;'));
    const path = `notes\t${SECRET_LOOKING_NAME}`;
    box.write(path, 'harmless\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'notes');
    const base = box.git('rev-parse', 'HEAD').trim();
    box.write(path, 'harmless, edited\n');
    const out = join(box.root, 'package.md');
    const result = spawnSync(process.execPath, [blind, box.repo, base, out], { env: box.env(), encoding: 'utf8' });
    assert.equal(result.status, 2, `${result.stdout}${result.stderr}`);
    assert.equal(existsSync(out), false, 'nothing is written');
    assert.match(result.stderr, /path that looks like a secret or credential/);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(SECRET_LOOKING_NAME), 'the error does not print the path');
  });
});

test('the files section prints every path whole, a long one and both sides of a rename inside a folder, with its line counts', () => {
  withSandbox((box) => {
    const deep = `${Array.from({ length: 8 }, (_, level) => `directory-level-${level}`).join('/')}/${'long-name-'.repeat(8)}notes.txt`;
    box.write(deep, 'one\n');
    box.write('conf/old-name.txt', 'kept\nkept\nkept\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'files');
    const base = box.git('rev-parse', 'HEAD').trim();
    box.write(deep, 'one\ntwo\n');
    box.git('mv', 'conf/old-name.txt', 'conf/new-name.txt');
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    const section = text.split('## Files and lines\n\n')[1].split('\n\n')[0];
    assert.ok(section.split('\n').includes(`${deep} | +1 -0`), section);
    assert.ok(section.split('\n').includes('conf/old-name.txt => conf/new-name.txt | +0 -0'), section);
    assert.doesNotMatch(section, /\.\.\.\/|\{/, section);
    assert.ok(section.split('\n').includes('2 file(s) changed, 1 line(s) added, 0 line(s) removed'), section);
  });
});

test('an empty package whose base is named like a secret names the base by its short hash and says so at the top', () => {
  withSandbox((box) => {
    const token = SECRET_SAMPLES['GitHub token'];
    box.git('branch', `base-${token}`);
    const baseShort = box.git('rev-parse', '--short', box.base).trim();
    const out = join(box.root, 'empty.md');
    const result = runScript('review-package.mjs', [box.repo, `base-${token}`, out], box.env());
    assert.equal(result.status, 1, result.out);
    const text = readFileSync(out, 'utf8');
    assert.ok(!text.includes(token), 'the token in the base name stays out of the package');
    assert.match(text, new RegExp(`^EMPTY PACKAGE: nothing changed outside \\.vibeflow/ between base ${baseShort} \\(its name left out`, 'm'));
    assert.equal(text.match(HEADER_LEFT_OUT)?.[1], '1', text);
  });
});

test('a package folder named like a secret keeps the title line, without the folder name', () => {
  withSandbox((box) => {
    const token = SECRET_SAMPLES['GitHub token'];
    const repo = join(box.root, `app-${token}`);
    box.git('clone', '-q', box.repo, repo);
    writeFileSync(join(repo, 'src/rules.ts'), 'export const x = 14\n');
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.ok(!text.includes(token), 'the token in the folder name stays out of the package');
    assert.match(text, /^# Review package · \(folder name left out: it looks like a secret or credential\) · base [0-9a-f]+ · HEAD [0-9a-f]+ · /m);
    assert.equal(text.match(HEADER_LEFT_OUT)?.[1], '1', text.slice(0, 800));
  });
});

// The last check reads the finished text line by line, whatever let a line through before it: the
// test runs a copy of the script whose file-diff detector finds nothing.
test('review package exits 2 and writes nothing when a line of the finished package still looks like a secret', () => {
  const source = readFileSync(join(SCRIPTS_DIR, 'review-package.mjs'), 'utf8');
  const marker = 'function secretLine(chunk) {\n';
  assert.ok(source.includes(marker), 'review-package.mjs defines secretLine');
  withSandbox((box) => {
    const blind = join(box.root, 'review-package-blind.mjs');
    writeFileSync(blind, source.replace(marker, `${marker}  return 0;\n`));
    const key = SECRET_SAMPLES['AWS access key'];
    box.write('notes/local.txt', `AWS_ACCESS_KEY_ID=${key}\n`);
    const out = join(box.root, 'package.md');
    const result = spawnSync(process.execPath, [blind, box.repo, box.base, out], { env: box.env(), encoding: 'utf8' });
    assert.equal(result.status, 2, `${result.stdout}${result.stderr}`);
    assert.equal(existsSync(out), false, 'nothing is written');
    assert.match(result.stderr, /still looks like a secret or credential/);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(key), 'the error does not print the line');
  });
});

// check-briefing.mjs and review-package.mjs each carry the detector, because a kit script
// imports only node: modules; this test keeps the two copies one detector.
test('check-briefing and review-package carry the same secret detector, and each catches every kind it names', () => {
  const block = (name) => readFileSync(join(SCRIPTS_DIR, name), 'utf8').match(/^const SECRET = new RegExp\(\[[\s\S]*?\]\.join\('\|'\)\);$/m)?.[0];
  const inBriefing = block('check-briefing.mjs');
  assert.ok(inBriefing, 'check-briefing.mjs defines SECRET');
  assert.equal(block('review-package.mjs'), inBriefing, 'review-package.mjs carries the same SECRET block');

  withSandbox((box) => {
    for (const [kind, sample] of Object.entries(SECRET_SAMPLES)) {
      const path = join(box.root, 'feature-rules-executor.md');
      writeFileSync(path, `${EXECUTOR_OK}\nvalue: ${sample}\n`);
      const briefed = runScript('check-briefing.mjs', [path], box.env());
      assert.equal(briefed.status, 2, `check-briefing, ${kind}: ${briefed.out}`);

      box.write('notes/sample.txt', `value: ${sample}\n`);
      const out = join(box.root, 'package.md');
      const packaged = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
      assert.equal(packaged.status, 0, `review-package, ${kind}: ${packaged.out}`);
      const text = readFileSync(out, 'utf8');
      assert.ok(!text.includes(sample), `review-package, ${kind}: the sample stays out`);
      assert.match(text, /^- notes\/sample\.txt \(\d+ bytes, line 1\)$/m, `review-package, ${kind}`);
    }
  });
});

// After each hunk header git prints a line of the file above the hunk, its function context, cut at
// 80 bytes. It is no part of the change, and a secret cut there no longer looks like one.
test('every hunk header in the package is its line numbers only, without the function context git prints after it', () => {
  withSandbox((box) => {
    const view = ['def handler(request):', ...Array.from({ length: 40 }, (_, i) => `    v${i + 2} = ${i + 2}`)];
    const model = ['class Account:', ...Array.from({ length: 20 }, (_, i) => `    f${i + 2} = ${i + 2}`)];
    box.write('app/view.py', `${view.join('\n')}\n`);
    box.write('app/model.py', `${model.join('\n')}\n`);
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'app');
    const base = box.git('rev-parse', 'HEAD').trim();
    view[15] = '    v16 = 1600';
    view[39] = '    v40 = 4000';
    model[17] = '    f18 = 1800';
    box.write('app/view.py', `${view.join('\n')}\n`);
    box.write('app/model.py', `${model.join('\n')}\n`);
    const raw = box.git('diff', '-U10', base).split('\n').filter((line) => line.startsWith('@@'));
    assert.equal(raw.filter((line) => line.endsWith(' @@ def handler(request):')).length, 2, `git names the function in both hunks: ${raw.join(' | ')}`);
    assert.equal(raw.filter((line) => line.endsWith(' @@ class Account:')).length, 1, raw.join(' | '));
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    const headers = text.split('\n').filter((line) => line.startsWith('@@'));
    assert.deepEqual(headers, raw.map((line) => line.match(/^@@ \S+ \S+ @@/)[0]), 'each header, in order, with its numbers only');
    assert.ok(!text.includes('def handler') && !text.includes('class Account'), 'no function context in the package');
    assert.match(text, /^\+ {4}v16 = 1600$/m, 'the change is in the package');
    assert.match(text, /^\+ {4}v40 = 4000$/m, 'the change is in the package');
    assert.match(text, /^\+ {4}f18 = 1800$/m, 'the change is in the package');
  });
});

// A carriage return, a line separator or a paragraph separator ends a "." or a "$" in a pattern,
// so the header is read from its start only, whatever the function context holds.
test('a hunk whose function context holds a carriage return or a Unicode line separator is still read for secrets', () => {
  const key = SECRET_SAMPLES['AWS access key'];
  for (const [name, mark] of [['carriage return', '\r'], ['line separator', '\u2028'], ['paragraph separator', '\u2029']]) {
    withSandbox((box) => {
      const lines = [`title = "a${mark}b"`, ...Array.from({ length: 14 }, (_, i) => `# filler ${i + 2}`), 'x = 1'];
      box.write('src/doc.py', `${lines.join('\n')}\n`);
      box.git('add', '-A');
      box.git('commit', '-q', '-m', 'doc');
      const base = box.git('rev-parse', 'HEAD').trim();
      lines[15] = `x = '${key}'`;
      box.write('src/doc.py', `${lines.join('\n')}\n`);
      assert.ok(box.git('diff', '-U10', base).includes(`@@ title = "a${mark}b"\n`), `${name}: git prints the line as the hunk's context`);
      const out = join(box.root, 'package.md');
      const result = runScript('review-package.mjs', [box.repo, base, out], box.env());
      assert.equal(result.status, 0, `${name}: ${result.out}`);
      const text = readFileSync(out, 'utf8');
      assert.ok(!text.includes(key), `${name}: the access key on the added line stays out`);
      assert.match(text, /^- src\/doc\.py \(\d+ bytes, line 16\)$/m, name);
    });
  }
});

// An editor on Windows writes CRLF, and git keeps the "\r" at the end of every line it prints.
test('a password line in a CRLF file is withheld, new or tracked, and stops check-briefing at the end of the text', () => {
  const password = SECRET_SAMPLES['password set to a literal value'];
  withSandbox((box) => {
    box.write('config/app.env', `NAME=app\r\n${password}\r\nPORT=80\r\n`);
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'config');
    const base = box.git('rev-parse', 'HEAD').trim();
    box.write('config/app.env', `NAME=app\r\n${password}\r\nPORT=81\r\n`);
    box.write('.env', `DEBUG=1\r\n${password}\r\n`);
    const out = join(box.root, 'package.md');
    const result = runScript('review-package.mjs', [box.repo, base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.ok(!text.includes(password), 'the password stays out of the package');
    assert.equal(text.match(WITHHELD_HEADER)?.[1], '2', text.slice(0, 800));
    assert.match(text, /^- config\/app\.env \(\d+ bytes, line 2\)$/m, 'the tracked file, where the password is a context line');
    assert.match(text, /^- \.env \(\d+ bytes, line 2\)$/m, 'the new file');

    const briefed = runScript('check-briefing.mjs', [briefing(box.root, 'feature-rules-executor.md', `${EXECUTOR_OK}\r\n${password}\r`)], box.env());
    assert.equal(briefed.status, 2, briefed.out);
    assert.match(briefed.stdout, /^\[stop\] .*secret/m);
  });
});

// Every repeat in the detector has a ceiling, so a long line costs time in proportion to its length.
// Before the ceilings (measured on Node 22): one detector test took 7.7 s on 100,000 letters and
// did not end within 120 s on this million-character line; check-briefing on this briefing was
// stopped after 60 s without ending; review-package took 4.4 s on the 100 KB hex file. Each run
// here gets 10 s, for work that takes milliseconds; a run killed at the limit fails the test.
test('a million-character line and a 100 KB hex file pass check-briefing and review-package within the time limit', () => {
  const line = 'a1B2_c3.D4-e5'.repeat(Math.ceil(1_000_000 / 13)).slice(0, 1_000_000);
  const hex = '6080604052348015600f57600080fd'.repeat(Math.ceil(100_000 / 30)).slice(0, 100_000);
  const run = (name, args, env) => spawnSync(process.execPath, [join(SCRIPTS_DIR, name), ...args], {
    env, encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL',
  });
  withSandbox((box) => {
    const briefed = run('check-briefing.mjs', [briefing(box.root, 'feature-rules-executor.md', `${EXECUTOR_OK}\n${line}\n"bytecode": "0x${hex}"\n`)], box.env());
    assert.equal(briefed.signal, null, 'check-briefing ends within the limit');
    assert.equal(briefed.status, 0, briefed.stdout);

    box.write('build/long.txt', `${line}\n`);
    box.write('artifacts/Pool.json', `{\n  "bytecode": "0x${hex}"\n}\n`);
    const out = join(box.root, 'package.md');
    const packaged = run('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(packaged.signal, null, 'review-package ends within the limit');
    assert.equal(packaged.status, 0, packaged.stderr);
    const text = readFileSync(out, 'utf8');
    assert.doesNotMatch(text, /WITHHELD/);
    assert.ok(text.includes(`+  "bytecode": "0x${hex}"\n`), 'the hex file is in the package');
    assert.match(text, /^- build\/long\.txt \(\d+ bytes\)$/m, 'the long file is over the size cap, listed as left out');
  });
});

// The database URL pattern has a ceiling on each side as well, so a line that repeats a URL up to
// its password, with no "@" anywhere to end one, costs time in proportion to its length. Before
// that ceiling (measured on Node 22): one detector test took 39.9 s on this million-character
// line; check-briefing took 39.5 s on this briefing and review-package 40.6 s on this file, both
// ending with the result asserted here. Each run here gets 10 s; a run killed at the limit fails.
test('a million-character line that repeats a database URL up to its password passes check-briefing and review-package within the time limit', () => {
  const line = `${'post'}${'gres'}://a:`.repeat(Math.ceil(1_000_000 / 13)).slice(0, 1_000_000);
  const run = (name, args, env) => spawnSync(process.execPath, [join(SCRIPTS_DIR, name), ...args], {
    env, encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL',
  });
  withSandbox((box) => {
    const briefed = run('check-briefing.mjs', [briefing(box.root, 'feature-rules-executor.md', `${EXECUTOR_OK}\n${line}\n`)], box.env());
    assert.equal(briefed.signal, null, 'check-briefing ends within the limit');
    assert.equal(briefed.status, 0, briefed.stdout);

    box.write('build/urls.txt', `${line}\n`);
    const out = join(box.root, 'package.md');
    const packaged = run('review-package.mjs', [box.repo, box.base, out, '--max-bytes', '2000000'], box.env());
    assert.equal(packaged.signal, null, 'review-package ends within the limit');
    assert.equal(packaged.status, 0, packaged.stderr);
    const text = readFileSync(out, 'utf8');
    assert.doesNotMatch(text, /WITHHELD/);
    assert.ok(text.includes(`+${line}\n`), 'the file is in the package');
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

test('check-probes reads the same probe files whether --dir is relative to the repository or absolute', () => {
  withSandbox((box) => {
    box.write('tests/probes/clock.test.ts', 'Date.now()\n');
    box.write('tests/other/clock.test.ts', 'Date.now()\n');
    for (const dir of ['tests/probes', './tests/probes/', join(box.repo, 'tests/probes'), `${join(box.repo, 'tests/probes')}/`]) {
      const result = runScript('check-probes.mjs', [box.repo, '--dir', dir], box.env());
      assert.equal(result.status, 1, `${dir}: ${result.out}`);
      assert.match(result.stdout, /^tests\/probes\/clock\.test\.ts:1 \[real clock\]/m, dir);
      assert.match(result.stdout, /^1 probe file\(s\) read; 1 suspect line\(s\)$/m, dir);
    }
  });
});

test('check-probes reads an absolute --dir given through a symbolic link to the repository', () => {
  withSandbox((box) => {
    box.write('tests/probes/clock.test.ts', 'Date.now()\n');
    const link = join(box.root, 'repo-link');
    symlinkSync(box.repo, link);
    const result = runScript('check-probes.mjs', [link, '--dir', join(link, 'tests/probes')], box.env());
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /^tests\/probes\/clock\.test\.ts:1 \[real clock\]/m);
    assert.match(result.stdout, /^1 probe file\(s\) read; 1 suspect line\(s\)$/m);
  });
});

test('check-probes exits 64 with the reason when --dir does not exist, is not a folder or is outside the repository', () => {
  withSandbox((box) => {
    box.write('tests/probes/clock.test.ts', 'Date.now()\n');
    const cases = [
      ['tests/nothing', /does not exist/],
      [join(box.repo, 'tests/nothing'), /does not exist/],
      ['tests/probes/clock.test.ts', /is not a folder/],
      [box.home, /is outside the repository/],
      ['../home', /is outside the repository/],
    ];
    for (const [dir, reason] of cases) {
      const result = runScript('check-probes.mjs', [box.repo, '--dir', dir], box.env());
      assert.equal(result.status, 64, `${dir}: ${result.out}`);
      assert.match(result.stderr, /^check-probes: --dir /m, dir);
      assert.match(result.stderr, reason, dir);
      assert.equal(result.stdout, '', dir);
    }
  });
});

test('check-probes reads a --dir written in another letter case as the folder on disk, or exits 64 where the case makes it another folder', () => {
  withSandbox((box) => {
    box.write('tests/probes/clock.test.ts', 'Date.now()\n');
    for (const dir of ['TESTS/Probes', join(box.repo, 'Tests/PROBES')]) {
      const result = runScript('check-probes.mjs', [box.repo, '--dir', dir], box.env());
      // A file system that ignores letter case (the macOS default) finds the folder; one that
      // does not has no such folder. Either way the probe folder is never read as empty.
      if (existsSync(join(box.repo, 'TESTS/Probes'))) {
        assert.equal(result.status, 1, `${dir}: ${result.out}`);
        assert.match(result.stdout, /^tests\/probes\/clock\.test\.ts:1 \[real clock\]/m, dir);
        assert.match(result.stdout, /^1 probe file\(s\) read; 1 suspect line\(s\)$/m, dir);
      } else {
        assert.equal(result.status, 64, `${dir}: ${result.out}`);
        assert.match(result.stderr, /does not exist/, dir);
      }
    }
  });
});

test('check-probes usage and README say --dir is relative to the repository or absolute, and exits 64 when it cannot be read', () => {
  const usage = runScript('check-probes.mjs', ['--help'], hermeticEnv(tmpdir())).stdout;
  assert.match(usage, /relative to the repository's top level, or absolute/);
  assert.match(usage, /64 bad arguments[^\n]*--dir that does not exist,\s+is not a folder or is outside the repository/);
  const readme = readFileSync(join(LOOP_DIR, 'README.md'), 'utf8');
  const row = readme.split('\n').find((line) => line.startsWith('| `check-probes.mjs'));
  assert.match(row, /64 a --dir that does not exist, is not a folder or is outside the repository/);
  assert.match(readme, /`check-probes\.mjs` in detail:[^\n]*relative to the repository's top level, or absolute/);
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

test('check-briefing, on a briefing that holds a secret, counts the facts without time and source and quotes none of them', () => {
  scratch((dir) => {
    // The value is built by concatenation so secret scanners do not flag this test file.
    const value = 'FAKE' + 'token' + '1234567890';
    const facts = '* the service reads API_TOKEN=' + value + '\n* the deploy failed every night since 23/09\n';
    const secret = runScript(
      'check-briefing.mjs',
      [briefing(dir, 'feature-rules-executor.md', EXECUTOR_OK.replace('## Facts\n', `## Facts\n${facts}`))],
      hermeticEnv(dir),
    );
    assert.equal(secret.status, 2, secret.out);
    assert.match(secret.stdout, /^\[stop\] .*secret/m);
    assert.match(secret.stdout, /^\[attention\] 2 fact\(s\) without time and source/m);
    assert.ok(!secret.out.includes(value), `the value reached the output: ${secret.out}`);
    assert.doesNotMatch(secret.out, /deploy failed/, 'no fact is quoted when the briefing holds a secret');

    // Without a secret, the same line still quotes the facts.
    const clean = runScript(
      'check-briefing.mjs',
      [briefing(dir, 'feature-rules-executor.md', EXECUTOR_OK.replace('## Facts\n', '## Facts\n* the deploy failed every night since 23/09\n'))],
      hermeticEnv(dir),
    );
    assert.equal(clean.status, 1, clean.out);
    assert.match(clean.stdout, /^\[attention\] 1 fact\(s\) without time and source.*the deploy failed every night since 23\/09/m);
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

test('check-briefing --pair, on an auditor briefing that holds a secret, names a missing criterion by its position and quotes none', () => {
  scratch((dir) => {
    const executor = briefing(dir, 'feature-rules-executor.md', EXECUTOR_OK);
    // The value is built by concatenation so secret scanners do not flag this test file.
    const value = 'FAKE' + 'token' + '1234567890';
    const secret = runScript('check-briefing.mjs', [
      briefing(dir, 'feature-rules-auditor.md', auditor(
        '* DoD 1: the rules load from the file\n* DoD 2: a malformed file is refused\n* DoD 3: the client sends API_TOKEN=' + value,
      )),
      '--pair', executor,
    ], hermeticEnv(dir));
    assert.equal(secret.status, 2, secret.out);
    assert.match(secret.stdout, /^\[stop\] .*secret/m);
    assert.match(secret.stdout, /^\[attention\] criterion 2 of 3 not in the executor's "Done when"/m);
    assert.match(secret.stdout, /^\[attention\] criterion 3 of 3 not in the executor's "Done when"/m);
    assert.ok(!secret.out.includes(value), `the value reached the output: ${secret.out}`);
    assert.doesNotMatch(secret.out, /malformed file|the client sends/, 'no criterion is quoted when the briefing holds a secret');

    // Without a secret, the same line still quotes the criterion.
    const clean = runScript('check-briefing.mjs', [
      briefing(dir, 'feature-rules-auditor.md', auditor('* DoD 1: the rules load from the file\n* DoD 2: a malformed file is refused')),
      '--pair', executor,
    ], hermeticEnv(dir));
    assert.equal(clean.status, 1, clean.out);
    assert.match(clean.stdout, /^\[attention\] criterion not in the executor's "Done when": DoD 2: a malformed file is refused$/m);
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

test('watch-pr counts NEUTRAL, SKIPPED and a green status context as green, and names them on the closing line', () => {
  withSandbox((box) => {
    box.setGh(PR('OPEN', [
      { name: 'unit', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { name: 'docs', status: 'COMPLETED', conclusion: 'NEUTRAL' },
      { name: 'deploy', status: 'COMPLETED', conclusion: 'SKIPPED' },
      { context: 'ci/legacy', state: 'SUCCESS' },
    ]));
    const result = runScript('watch-pr.mjs', ['--repo', 'owner/repo', '--pr', '7', '--timeout-min', '0'], box.env());
    assert.equal(result.status, 0, result.out);
    assert.match(result.stdout, /CI finished .*docs=NEUTRAL/);
    assert.match(result.stdout, /CI finished .*deploy=SKIPPED/);
    assert.match(result.stdout, /CI finished .*ci\/legacy=SUCCESS/);
  });
});

test('watch-pr exits 1 on a STALE or STARTUP_FAILURE check and names it on the failed line', () => {
  withSandbox((box) => {
    for (const conclusion of ['STALE', 'STARTUP_FAILURE']) {
      box.setGh(PR('OPEN', [
        { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'test', status: 'COMPLETED', conclusion },
      ]));
      const result = runScript('watch-pr.mjs', ['--repo', 'owner/repo', '--pr', '7', '--timeout-min', '0'], box.env());
      assert.equal(result.status, 1, `${conclusion}: ${result.out}`);
      assert.match(result.stdout, /^failed: test$/m, conclusion);
    }
  });
});

test('watch-pr never ends green on a check outside its lists: finished without a conclusion, an unknown state, or no state', () => {
  withSandbox((box) => {
    const cases = [
      [{ name: 'test', status: 'COMPLETED', conclusion: '' }, /test \(COMPLETED with no conclusion\)/],
      [{ name: 'test', status: 'COMPLETED', conclusion: 'SOMETHING_NEW' }, /test \(SOMETHING_NEW, not a known check state\)/],
      [{ name: 'test', status: 'SOMETHING_NEW' }, /test \(SOMETHING_NEW, not a known check state\)/],
      [{ context: 'ci/legacy', state: 'SOMETHING_NEW' }, /ci\/legacy \(SOMETHING_NEW, not a known check state\)/],
      [{ name: 'test' }, /test \(no state\)/],
    ];
    for (const [check, named] of cases) {
      box.setGh(PR('OPEN', [{ name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }, check]));
      const result = runScript('watch-pr.mjs', ['--repo', 'owner/repo', '--pr', '7', '--timeout-min', '0'], box.env());
      const what = JSON.stringify(check);
      assert.equal(result.status, 1, `${what}: ${result.out}`);
      const failedLine = result.stdout.split('\n').find((line) => line.startsWith('failed: '));
      assert.ok(failedLine, `${what}: no failed line\n${result.out}`);
      assert.match(failedLine, named, what);
      assert.doesNotMatch(failedLine, /lint/, what);
    }
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

// gh missing, not executable or not logged in is permanent: retrying it only burns the ceiling (480 min by default).
// Each has its own exit code (sysexits), so a caller routes by the code and never by the error text.
test('watch-pr exits 69 at the first read when gh is not installed, and says what to do', () => {
  withSandbox((box) => {
    const empty = join(box.root, 'empty-bin');
    mkdirSync(empty);
    const args = ['--repo', 'owner/repo', '--pr', '7', '--interval-sec', '60', '--timeout-min', '0.01'];
    const result = runScript('watch-pr.mjs', args, box.env({ PATH: empty }));
    assert.equal(result.status, 69, result.out);
    assert.match(result.stderr, /gh is not installed/);
    assert.doesNotMatch(result.out, /attempt|ceiling/);
  });
});

test('watch-pr exits 77 at the first read when gh is not logged in (gh exit 4), and says what to do', () => {
  withSandbox((box) => {
    box.setGh('');
    const args = ['--repo', 'owner/repo', '--pr', '7', '--interval-sec', '0.05', '--timeout-min', '0.01'];
    const result = runScript('watch-pr.mjs', args, box.env({ FAKE_GH_EXIT: '4' }));
    assert.equal(result.status, 77, result.out);
    assert.match(result.stderr, /gh auth login/);
    assert.equal(readFileSync(box.ghLog, 'utf8').trim().split('\n').length, 1, 'gh was read more than once');
  });
});

// A token GitHub refuses (invalid, revoked, expired) makes gh exit 1 with HTTP 401, not 4. The
// fake prints the two lines gh 2.87.3 prints for it; the token values are built by concatenation.
const ghRefusingCredential = (log) => [
  '#!/bin/sh',
  `printf '%s\\n' "$*" >> '${log}'`,
  "printf 'HTTP 401: Bad credentials (https://api.github.com/graphql)\\nTry authenticating with:  gh auth login\\n' >&2",
  'exit 1',
  '',
].join('\n');

test('watch-pr exits 77 at the first read when GitHub refuses the credential (gh exit 1 with HTTP 401), and says what to do', () => {
  withSandbox((box) => {
    box.writeExecutable('gh', ghRefusingCredential(box.ghLog));
    const args = ['--repo', 'owner/repo', '--pr', '7', '--interval-sec', '0.05', '--timeout-min', '0.01'];
    const result = runScript('watch-pr.mjs', args, box.env({ GH_TOKEN: undefined, GITHUB_TOKEN: undefined }));
    assert.equal(result.status, 77, result.out);
    assert.match(result.stderr, /^watch-pr: GitHub refused the credential gh uses; .*\(HTTP 401: Bad credentials/m);
    assert.match(result.stderr, /run `gh auth login`/);
    assert.doesNotMatch(result.stderr, /GH_TOKEN|GITHUB_TOKEN/);
    assert.doesNotMatch(result.out, /attempt|ceiling/);
    assert.equal(readFileSync(box.ghLog, 'utf8').trim().split('\n').length, 1, 'gh was read more than once');
  });
});

test('watch-pr, on a refused credential, says to replace the token in the variable set in the environment, naming only that one', () => {
  withSandbox((box) => {
    box.writeExecutable('gh', ghRefusingCredential(box.ghLog));
    const args = ['--repo', 'owner/repo', '--pr', '7', '--interval-sec', '0.05', '--timeout-min', '0.01'];
    const token = `${'not'}-${'a'}-${'real'}-${'token'}`;
    for (const [set, named, unnamed] of [
      [{ GH_TOKEN: token, GITHUB_TOKEN: undefined }, /GH_TOKEN/, /GITHUB_TOKEN/],
      [{ GH_TOKEN: undefined, GITHUB_TOKEN: token }, /GITHUB_TOKEN/, /\bGH_TOKEN/],
    ]) {
      const result = runScript('watch-pr.mjs', args, box.env(set));
      const what = Object.keys(set).find((key) => set[key]);
      assert.equal(result.status, 77, `${what}: ${result.out}`);
      assert.match(result.stderr, /GitHub refused the credential gh uses/, what);
      assert.match(result.stderr, /replace the token in/, what);
      assert.match(result.stderr, named, what);
      assert.doesNotMatch(result.stderr, unnamed, what);
      assert.ok(!result.out.includes(token), `${what}: the token value reached the output`);
    }
  });
});

test('watch-pr, on a refused credential, names the token variables gh reads for the host of --repo, in the right number', () => {
  withSandbox((box) => {
    box.writeExecutable('gh', ghRefusingCredential(box.ghLog));
    const token = `${'not'}-${'a'}-${'real'}-${'token'}`;
    const none = { GH_TOKEN: undefined, GITHUB_TOKEN: undefined, GH_ENTERPRISE_TOKEN: undefined, GITHUB_ENTERPRISE_TOKEN: undefined, GH_HOST: undefined };
    const cases = [
      ['both github.com variables', 'owner/repo', { GH_TOKEN: token, GITHUB_TOKEN: token }, /replace the token in GH_TOKEN and GITHUB_TOKEN, .* or unset them and run `gh auth login`/, /ENTERPRISE/],
      ['an Enterprise Server host', 'git.example.invalid/owner/repo', { GITHUB_ENTERPRISE_TOKEN: token }, /replace the token in GITHUB_ENTERPRISE_TOKEN, .* or unset it and run `gh auth login --hostname git\.example\.invalid`/, /\bGH_TOKEN|\bGITHUB_TOKEN/],
      ['an Enterprise Server host with only GH_TOKEN set', 'git.example.invalid/owner/repo', { GH_TOKEN: token }, /run `gh auth login --hostname git\.example\.invalid`/, /replace|GH_TOKEN/],
      ['GH_HOST naming an Enterprise Server host', 'owner/repo', { GH_HOST: 'git.example.invalid', GH_ENTERPRISE_TOKEN: token, GH_TOKEN: token }, /replace the token in GH_ENTERPRISE_TOKEN, /, /\bGH_TOKEN/],
      ['a subdomain of ghe.com', 'acme.ghe.com/owner/repo', { GH_TOKEN: token, GH_ENTERPRISE_TOKEN: token }, /replace the token in GH_TOKEN, /, /ENTERPRISE/],
    ];
    for (const [what, repo, set, named, unnamed] of cases) {
      const args = ['--repo', repo, '--pr', '7', '--interval-sec', '0.05', '--timeout-min', '0.01'];
      const result = runScript('watch-pr.mjs', args, box.env({ ...none, ...set }));
      assert.equal(result.status, 77, `${what}: ${result.out}`);
      assert.match(result.stderr, named, `${what}: ${result.stderr}`);
      assert.doesNotMatch(result.stderr, unnamed, `${what}: ${result.stderr}`);
      assert.ok(!result.out.includes(token), `${what}: the token value reached the output`);
    }
  });
});

test('watch-pr keeps reading after gh exit 1 without HTTP 401 (a 403, a 502, a network error) until the ceiling', () => {
  withSandbox((box) => {
    const args = ['--repo', 'owner/repo', '--pr', '7', '--interval-sec', '0.05', '--timeout-min', '0.01'];
    for (const text of ['HTTP 403: Resource not accessible by integration', 'HTTP 502: Bad Gateway (https://api.github.com/graphql)', 'error connecting to api.github.com']) {
      box.writeExecutable('gh', `#!/bin/sh\nprintf '%s\\n' '${text}' >&2\nexit 1\n`);
      const result = runScript('watch-pr.mjs', args, box.env());
      assert.equal(result.status, 3, `${text}: ${result.out}`);
      assert.match(result.stdout, /ceiling of 0\.01 min reached without reading the PR/, text);
    }
  });
});

test('watch-pr keeps reading after any other gh failure until the ceiling', () => {
  withSandbox((box) => {
    // The fake gh fails (exit 1) on the first read and answers green afterwards. Under a ceiling far
    // above the time of one read, an exit 0 can only come from a second read after the failure,
    // however slow the machine is.
    const green = join(box.root, 'gh-green.json');
    writeFileSync(green, JSON.stringify(PR('OPEN', [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }])));
    box.writeExecutable('gh', [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> '${box.ghLog}'`,
      `if [ -f '${box.root}/failed-once' ]; then cat '${green}'; exit 0; fi`,
      `touch '${box.root}/failed-once'`,
      "echo 'HTTP 502: Bad Gateway' >&2",
      'exit 1',
      '',
    ].join('\n'));
    const recovering = runScript('watch-pr.mjs', ['--repo', 'owner/repo', '--pr', '7', '--interval-sec', '0.05', '--timeout-min', '5'], box.env());
    assert.equal(recovering.status, 0, recovering.out);
    assert.match(recovering.stdout, /read failed \(gh exited 1: HTTP 502: Bad Gateway\); attempt 1/);
    assert.equal(readFileSync(box.ghLog, 'utf8').trim().split('\n').length, 2, recovering.out);

    // A failure that never clears ends at the ceiling with exit 3, not with 69 or 77.
    box.writeExecutable('gh', "#!/bin/sh\necho 'HTTP 502: Bad Gateway' >&2\nexit 1\n");
    const args = ['--repo', 'owner/repo', '--pr', '7', '--interval-sec', '0.05', '--timeout-min', '0.01'];
    const stuck = runScript('watch-pr.mjs', args, box.env());
    assert.equal(stuck.status, 3, stuck.out);
    assert.match(stuck.stdout, /ceiling of 0\.01 min reached without reading the PR/);
  });
});

test('watch-pr exits 69 at the first read when gh cannot be executed, and says what to do', () => {
  withSandbox((box) => {
    // Only this folder on PATH: a gh found without the execute bit, and no other gh behind it.
    const locked = join(box.root, 'locked-bin');
    mkdirSync(locked);
    writeFileSync(join(locked, 'gh'), '#!/bin/sh\nexit 0\n', { mode: 0o644 });
    const args = ['--repo', 'owner/repo', '--pr', '7', '--interval-sec', '0.05', '--timeout-min', '0.05'];
    const result = runScript('watch-pr.mjs', args, box.env({ PATH: locked }));
    assert.equal(result.status, 69, result.out);
    assert.match(result.stderr, /gh cannot be executed/);
    assert.doesNotMatch(result.out, /attempt|ceiling/);
  });
});

test('watch-pr exits 64 for bad arguments without calling gh', () => {
  withSandbox((box) => {
    for (const args of [['--repo', 'not-a-repo', '--pr', '7'], ['--repo', 'owner/repo', '--pr', 'seven'], ['--repo', 'owner/repo', '--pr', '7', '--bogus', '1']]) {
      const result = runScript('watch-pr.mjs', args, box.env());
      assert.equal(result.status, 64, `${args.join(' ')}: ${result.out}`);
    }
    assert.equal(existsSync(box.ghLog), false, 'gh was called');
  });
});

// gh --repo takes [HOST/]OWNER/REPO, so a GitHub Enterprise host rides in the same argument.
test('watch-pr takes --repo as <owner/repo> or <host>/<owner/repo> and hands it to gh as given', () => {
  withSandbox((box) => {
    box.setGh(PR('OPEN', [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }]));
    for (const repo of ['owner/repo', 'github.example.invalid/owner/repo', 'ghe/my-org/my.repo', 'GHE-1.Example.invalid/o_1/r-2']) {
      rmSync(box.ghLog, { force: true });
      const result = runScript('watch-pr.mjs', ['--repo', repo, '--pr', '7', '--timeout-min', '0'], box.env());
      assert.equal(result.status, 0, `${repo}: ${result.out}`);
      assert.equal(readFileSync(box.ghLog, 'utf8'), `pr view 7 --repo ${repo} --json state,statusCheckRollup,title,url\n`, repo);
    }
  });
});

test('watch-pr exits 64 for any other --repo form, naming the two forms it takes, without calling gh', () => {
  withSandbox((box) => {
    const forms = [
      'repo',
      'a/b/c/d',
      '/owner/repo',
      'owner/repo/',
      'github.example.invalid:8443/owner/repo',
      'https://github.example.invalid/owner/repo',
      'host..example/owner/repo',
      '-host.example/owner/repo',
      'host-.example/owner/repo',
      'host_name.example/owner/repo',
      '',
    ];
    for (const repo of forms) {
      const result = runScript('watch-pr.mjs', ['--repo', repo, '--pr', '7', '--timeout-min', '0'], box.env());
      assert.equal(result.status, 64, `${JSON.stringify(repo)}: ${result.out}`);
      assert.match(result.stderr, /--repo takes <owner\/repo> or <host>\/<owner\/repo>/, JSON.stringify(repo));
    }
    assert.equal(existsSync(box.ghLog), false, 'gh was called');
  });
});

test('watch-pr usage and README give both --repo forms, the origin host for GitHub Enterprise, and that the host form was checked against a fake gh only', () => {
  const usage = runScript('watch-pr.mjs', ['--help'], hermeticEnv(tmpdir())).stdout;
  assert.match(usage, /^usage: watch-pr\.mjs --repo \[<host>\/\]<owner\/repo> --pr <n>/);
  const readme = readFileSync(join(LOOP_DIR, 'README.md'), 'utf8');
  const row = readme.split('\n').find((line) => line.startsWith('| `watch-pr'));
  assert.match(row, /^\| `watch-pr\.mjs --repo \[<host>\/\]<owner\/repo> --pr <n>/);
  for (const text of [usage.replace(/\s+/g, ' '), readme.replace(/\s+/g, ' ')]) {
    assert.match(text, /`?<owner\/repo>`? or `?<host>\/<owner\/repo>`?/);
    assert.match(text, /GitHub Enterprise/);
    assert.match(text, /host of the `?origin`? remote/);
    assert.match(text, /passed to `?gh`? as given/);
    assert.match(text, /only against a fake `?gh`?, not against a real GitHub Enterprise/);
  }
});

test('watch-pr usage and README name 64 for bad arguments, 69 for gh missing or not executable, 77 for gh not logged in or its credential refused', () => {
  const usage = runScript('watch-pr.mjs', ['--help'], hermeticEnv(tmpdir())).stdout;
  assert.match(usage, /64 bad arguments · 69 gh missing or not executable · 77 gh not logged in or credential refused$/m);
  const flatUsage = usage.replace(/\s+/g, ' ');
  assert.match(flatUsage, /gh missing, not executable, not logged in or with a refused credential cannot fix itself/);
  assert.match(flatUsage, /77 when it is not logged in or GitHub refuses its credential \(gh exit 1 with HTTP 401\)/);
  assert.match(flatUsage, /Any other failed read \(gh exit 1 without HTTP 401, a 403, network, a 5xx\) is retried until the ceiling/);
  const readme = readFileSync(join(LOOP_DIR, 'README.md'), 'utf8');
  const row = readme.split('\n').find((line) => line.startsWith('| `watch-pr'));
  assert.match(row, /64 bad arguments · 69 gh missing or not executable · 77 gh not logged in or credential refused \|$/);
  const flat = readme.replace(/\s+/g, ' ');
  assert.match(flat, /`watch-pr\.mjs` exits 69 at its first read when `gh` is not installed or cannot be executed, and 77 when it is not logged in or GitHub refuses its credential \(`gh` exit 1 with `HTTP 401`\)/);
});

test('watch-pr usage and README say how each check state counts, NEUTRAL and SKIPPED as green', () => {
  const usage = runScript('watch-pr.mjs', ['--help'], hermeticEnv(tmpdir())).stdout.replace(/\s+/g, ' ');
  const readme = readFileSync(join(LOOP_DIR, 'README.md'), 'utf8');
  const flat = readme.replace(/\s+/g, ' ');
  for (const text of [usage, flat]) {
    assert.match(text, /green: SUCCESS, NEUTRAL, SKIPPED/);
    assert.match(text, /failed: FAILURE, ERROR, TIMED_OUT, CANCELLED, ACTION_REQUIRED, STARTUP_FAILURE, STALE/);
    assert.match(text, /pending: PENDING, IN_PROGRESS, QUEUED, EXPECTED, WAITING, REQUESTED/);
    assert.match(text, /never green/);
    assert.match(text, /NEUTRAL and SKIPPED count as green/);
  }
  const row = readme.split('\n').find((line) => line.startsWith('| `watch-pr'));
  assert.match(row, /outside its green, failed and pending lists/);
});

// The kit imports only node: modules, so each script carries its own copy of the check state lists.
test('watch-pr and preflight carry the same green, failed and pending check state lists', () => {
  const lists = (name) => {
    const source = readFileSync(join(LOOP_DIR, 'scripts', name), 'utf8');
    return Object.fromEntries([...source.matchAll(/^const (GREEN|FAILED|PENDING) = new Set\((\[.*\])\);$/gm)].map(([, list, items]) => [list, items]));
  };
  const watch = lists('watch-pr.mjs');
  assert.deepEqual(Object.keys(watch).sort(), ['FAILED', 'GREEN', 'PENDING']);
  assert.deepEqual(lists('preflight.mjs'), watch);
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

// No preflight test reaches the real network. The origin and every probe live on 127.0.0.1;
// any other host goes through a proxy on a closed local port, so a default that points at a
// public host fails fast instead of leaving the machine.
const offline = (env) => ({
  ...env,
  NODE_USE_ENV_PROXY: '1',
  NODE_NO_WARNINGS: '1',
  HTTP_PROXY: 'http://127.0.0.1:9',
  HTTPS_PROXY: 'http://127.0.0.1:9',
  http_proxy: 'http://127.0.0.1:9',
  https_proxy: 'http://127.0.0.1:9',
  NO_PROXY: '127.0.0.1',
  no_proxy: '127.0.0.1',
});

// A local HTTP server that answers every request and records it.
async function withServer(run) {
  const hits = [];
  const server = createServer((request, response) => {
    hits.push(`${request.method} ${request.url}`);
    response.end();
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`, hits);
  } finally {
    await new Promise((done) => server.close(done));
  }
}

// A local port nobody listens on.
async function closedPort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}

// A fake gh whose `auth status` exits with `authExit`; every other call answers the sandbox state.
function ghWithAuth(box, authExit) {
  box.writeExecutable('gh', [
    '#!/bin/sh',
    `printf '%s\\n' "$*" >> '${box.ghLog}'`,
    `if [ "$1" = auth ]; then echo 'auth answer'; exit ${authExit}; fi`,
    `cat '${box.root}/gh-state.json'`,
    '',
  ].join('\n'));
}

const preflight = (args, env) => watchWhile('preflight.mjs', args, offline(env), {}).then(({ code, out }) => ({ status: code, out }));

async function withSandboxAsync(run) {
  const box = makeSandbox();
  try {
    return await run(box);
  } finally {
    box.cleanup();
  }
}

test('preflight is a go on a clean feature branch whose origin answers and gh can open the PR', async () => {
  await withSandboxAsync((box) => withServer(async (origin, hits) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', `${origin}/owner/repo.git`);
    const result = await preflight(['--repo', box.repo], box.env());
    assert.equal(result.status, 0, result.out);
    assert.match(result.out, /branch feat\/x/);
    assert.match(result.out, /open PRs: none/);
    assert.match(result.out, /^verdict: go$/m);
    assert.ok(hits.length > 0, 'the origin host was not probed');
  }));
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
    const result = runScript('preflight.mjs', ['--repo', box.repo], offline(box.env({ CLAUDE_CODE_EFFORT_LEVEL: 'low' })));
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /1 dirty file/);
    assert.match(result.stdout, /PR #3: CI red/);
    assert.match(result.stdout, /CLAUDE_CODE_EFFORT_LEVEL=low/);
  });
});

test('preflight lists an open PR with a check outside the green list as not green', () => {
  withSandbox((box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    const pr = (number, checks) => ({ number, title: `pr ${number}`, isDraft: false, statusCheckRollup: checks });
    box.setGh([
      pr(4, [{ name: 't', status: 'COMPLETED', conclusion: 'STALE' }]),
      pr(5, [{ name: 't', status: 'COMPLETED', conclusion: '' }]),
      pr(6, [{ name: 't', status: 'COMPLETED', conclusion: 'SOMETHING_NEW' }]),
      pr(7, [{ name: 't' }]),
      pr(8, [{ name: 'a', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'b', status: 'COMPLETED', conclusion: 'NEUTRAL' }, { name: 'c', status: 'COMPLETED', conclusion: 'SKIPPED' }, { context: 'ci/legacy', state: 'SUCCESS' }]),
      pr(9, [{ name: 't', status: 'COMPLETED', conclusion: 'STARTUP_FAILURE' }]),
    ]);
    const result = runScript('preflight.mjs', ['--repo', box.repo], offline(box.env()));
    assert.match(result.stdout, /^\[attention\] PR #4: CI red/m);
    assert.match(result.stdout, /^\[attention\] PR #5: CI not green, a check state that is not known: t=COMPLETED/m);
    assert.match(result.stdout, /^\[attention\] PR #6: CI not green, a check state that is not known: t=SOMETHING_NEW/m);
    assert.match(result.stdout, /^\[attention\] PR #7: CI not green, a check state that is not known: t=\(no state\)/m);
    assert.match(result.stdout, /^\[ok\] PR #8: CI green or no checks/m);
    assert.match(result.stdout, /^\[attention\] PR #9: CI red/m);
    assert.equal((result.stdout.match(/CI green/g) ?? []).length, 1, result.out);
  });
});

test('preflight probes the origin host, not a fixed public host', async () => {
  await withSandboxAsync((box) => withServer(async (origin, hits) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', `${origin}/owner/repo.git`);
    const result = await preflight(['--repo', box.repo], box.env());
    assert.match(result.out, new RegExp(`^\\[ok\\] network: ${origin} answer`, 'm'));
    assert.doesNotMatch(result.out, /api\.github\.com/);
    assert.deepEqual(hits, ['HEAD /']);
  }));
});

test('preflight probes https://<host> for an scp-style or ssh:// origin', async () => {
  for (const remote of ['git@127.0.0.1:owner/repo.git', 'ssh://git@127.0.0.1:2222/owner/repo.git']) {
    await withSandboxAsync(async (box) => {
      box.git('switch', '-q', '-c', 'feat/x');
      box.git('remote', 'add', 'origin', remote);
      const result = await preflight(['--repo', box.repo], box.env());
      assert.match(result.out, /network: .*https:\/\/127\.0\.0\.1(?!:)/, remote);
      assert.match(readFileSync(box.ghLog, 'utf8'), /^auth status --hostname 127\.0\.0\.1$/m, remote);
    });
  }
});

test('preflight: the origin probe failing is attention, not a stop', async () => {
  const port = await closedPort();
  await withSandboxAsync(async (box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', `http://127.0.0.1:${port}/owner/repo.git`);
    const result = await preflight(['--repo', box.repo], box.env());
    assert.equal(result.status, 1, result.out);
    assert.match(result.out, new RegExp(`^\\[attention\\] network: no answer from http://127\\.0\\.0\\.1:${port}`, 'm'));
  });
});

test('preflight: a failing origin probe says the push needs that host only when the origin is http or https', async () => {
  const port = await closedPort();
  await withSandboxAsync(async (box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', `http://127.0.0.1:${port}/owner/repo.git`);
    const http = await preflight(['--repo', box.repo], box.env());
    const line = http.out.split('\n').find((text) => text.includes('network:'));
    assert.match(line, /^\[attention\] network: no answer from /, http.out);
    assert.doesNotMatch(line, /SSH/, http.out);
    assert.match(line, /the push to an http\(s\) origin goes through it/, http.out);
  });
  await withSandboxAsync(async (box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    // The https side of an ssh origin on "localhost" goes through the closed local proxy, so it fails here.
    box.git('remote', 'add', 'origin', 'git@localhost:owner/repo.git');
    const ssh = await preflight(['--repo', box.repo], box.env());
    const line = ssh.out.split('\n').find((text) => text.includes('network:'));
    assert.match(line, /^\[attention\] network: no answer from https:\/\/localhost /, ssh.out);
    assert.match(line, /a push over SSH does not need it/, ssh.out);
  });
});

test('preflight stops only when every --probe-url given fails', async () => {
  const port = await closedPort();
  await withSandboxAsync((box) => withServer(async (origin) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', `${origin}/owner/repo.git`);
    const dead = `http://127.0.0.1:${port}`;

    const allGivenDown = await preflight(['--repo', box.repo, '--probe-url', dead], box.env());
    assert.equal(allGivenDown.status, 2, allGivenDown.out);
    assert.match(allGivenDown.out, /^\[stop\] network: /m);

    const oneGivenUp = await preflight(['--repo', box.repo, '--probe-url', dead, '--probe-url', origin], box.env());
    assert.equal(oneGivenUp.status, 1, oneGivenUp.out);
    assert.match(oneGivenUp.out, /^\[attention\] network: no answer from /m);
  }));
});

test('preflight: a given probe answering keeps a dead origin at attention', async () => {
  const port = await closedPort();
  await withSandboxAsync((box) => withServer(async (probe) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', `http://127.0.0.1:${port}/owner/repo.git`);
    const result = await preflight(['--repo', box.repo, '--probe-url', probe], box.env());
    assert.equal(result.status, 1, result.out);
    assert.match(result.out, /^\[attention\] network: no answer from /m);
  }));
});

test('preflight: no origin and no --probe-url is attention, with nothing to probe', async () => {
  await withSandboxAsync(async (box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    const result = await preflight(['--repo', box.repo], box.env());
    assert.equal(result.status, 1, result.out);
    assert.match(result.out, /^\[attention\] network: nothing to probe/m);
  });
});

// Each password is assembled at run time and is not a real credential.
const ORIGIN_PASSWORDS = {
  'a space': `${'left-'}${'s3cret'} ${'right-'}${'s3cret'}`,
  'a tab': `${'left-'}${'s3cret'}\t${'right-'}${'s3cret'}`,
  'a "/"': `${'left-'}${'s3cret'}/${'right-'}${'s3cret'}`,
  'an "@"': `${'left-'}${'s3cret'}@${'right-'}${'s3cret'}`,
};

test('preflight prints an origin URL that does not parse without its password, whatever the password holds, and keeps its host', () => {
  for (const [holding, password] of Object.entries(ORIGIN_PASSWORDS)) {
    withSandbox((box) => {
      box.git('switch', '-q', '-c', 'feat/x');
      box.git('remote', 'add', 'origin', `https://user:${password}@127.0.0.1:99999/owner/repo.git`);
      const result = runScript('preflight.mjs', ['--repo', box.repo], offline(box.env()));
      assert.equal(result.status, 1, `${holding}: ${result.out}`);
      assert.ok(!result.out.includes('s3cret'), `${holding}: ${result.out}`);
      assert.ok(!result.out.includes('user:'), `${holding}: ${result.out}`);
      assert.match(result.stdout, /^\[attention\] pr ending: origin https:\/\/127\.0\.0\.1:99999\/owner\/repo\.git has no host for gh; /m, `${holding}: ${result.out}`);
    });
  }
});

test('preflight prints a failing --probe-url without the credentials written in it, and keeps its host', async () => {
  const port = await closedPort();
  const password = `${'probe-'}${'s3cret'} ${'tail'}`;
  await withSandboxAsync(async (box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    for (const credentials of [`user:${password}@`, `${'tok'}${'en-s3cret'}@`]) {
      const result = await preflight(['--repo', box.repo, '--probe-url', `http://${credentials}127.0.0.1:${port}/v1`], box.env());
      assert.equal(result.status, 2, result.out);
      assert.ok(!result.out.includes('s3cret'), result.out);
      assert.ok(!result.out.includes('user:'), result.out);
      assert.match(result.out, new RegExp(`^\\[stop\\] network: no answer from http://127\\.0\\.0\\.1:${port}/v1 \\(`, 'm'), result.out);
    }
  });
});

test('preflight never prints the user part of an scp-style origin, a password in it included', async () => {
  const password = `${'scp-'}${'s3cret'} ${'tail'}`;
  await withSandboxAsync(async (box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', `user:${password}@localhost:owner/repo.git`);
    const result = await preflight(['--repo', box.repo], box.env());
    assert.ok(!result.out.includes('s3cret'), result.out);
    assert.ok(!result.out.includes('user:'), result.out);
    assert.match(result.out, /^\[attention\] network: no answer from https:\/\/localhost /m, result.out);
    assert.match(readFileSync(box.ghLog, 'utf8'), /^auth status --hostname localhost$/m);
  });
});

test('preflight --no-network never calls gh', () => {
  withSandbox((box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', 'https://127.0.0.1/owner/repo.git');
    const result = runScript('preflight.mjs', ['--repo', box.repo, '--no-network'], offline(box.env()));
    assert.equal(result.status, 0, result.out);
    assert.equal(existsSync(box.ghLog) ? readFileSync(box.ghLog, 'utf8') : '', '');
  });
});

test('preflight pr ending: a go when gh is logged in to the origin host', async () => {
  await withSandboxAsync((box) => withServer(async (origin) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', `${origin}/owner/repo.git`);
    ghWithAuth(box, 0);
    const result = await preflight(['--repo', box.repo], box.env());
    assert.match(result.out, /^\[ok\] pr ending: gh can open the pull request on 127\.0\.0\.1$/m);
    assert.match(readFileSync(box.ghLog, 'utf8'), /^auth status --hostname 127\.0\.0\.1$/m);
  }));
});

test('preflight pr ending: attention, with the by-hand ending, when gh is not logged in, missing, or there is no origin', async () => {
  const byHand = /branch pushed and the pull request body written.*by hand/;
  await withSandboxAsync((box) => withServer(async (origin) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', `${origin}/owner/repo.git`);
    ghWithAuth(box, 1);
    const loggedOut = await preflight(['--repo', box.repo], box.env());
    assert.equal(loggedOut.status, 1, loggedOut.out);
    const line = loggedOut.out.split('\n').find((text) => text.includes('pr ending:'));
    assert.match(line, /^\[attention\] pr ending: .*127\.0\.0\.1/);
    assert.match(line, byHand);

    // A PATH with git and without gh.
    const gitOnly = join(box.root, 'git-only-bin');
    mkdirSync(gitOnly);
    symlinkSync(spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim(), join(gitOnly, 'git'));
    const missing = await preflight(['--repo', box.repo], box.env({ PATH: gitOnly }));
    const missingLine = missing.out.split('\n').find((text) => text.includes('pr ending:'));
    assert.match(missingLine, /^\[attention\] pr ending: gh not installed/);
    assert.match(missingLine, byHand);

    box.git('remote', 'remove', 'origin');
    const noOrigin = await preflight(['--repo', box.repo], box.env());
    assert.match(noOrigin.out, /^\[attention\] pr ending: no origin remote/m);
  }));
});

test('preflight skips the open PRs, without attention, when gh does not serve the origin host', async () => {
  await withSandboxAsync((box) => withServer(async (origin) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', `${origin}/owner/repo.git`);
    // gh knows no account on this host, and its pr list fails the way it does on a remote it does not serve.
    box.writeExecutable('gh', [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> '${box.ghLog}'`,
      "echo 'none of the git remotes configured for this repository point to a known GitHub host' >&2",
      'exit 1',
      '',
    ].join('\n'));
    const result = await preflight(['--repo', box.repo], box.env());
    const ci = result.out.split('\n').find((text) => text.includes('CI:'));
    assert.match(ci, /^\[ok\] CI: open PRs not checked, gh is not logged in to 127\.0\.0\.1 or does not serve it \(see pr ending\)$/, result.out);
    assert.doesNotMatch(readFileSync(box.ghLog, 'utf8'), /^pr list/m);
    assert.match(result.out, /^\[attention\] pr ending: /m);
  }));
});

test('preflight writes the effort line only when CLAUDE_CODE_EFFORT_LEVEL is set', () => {
  withSandbox((box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    const unset = runScript('preflight.mjs', ['--repo', box.repo, '--no-network'], box.env());
    assert.doesNotMatch(unset.out, /effort/i);
    const set = runScript('preflight.mjs', ['--repo', box.repo, '--no-network'], box.env({ CLAUDE_CODE_EFFORT_LEVEL: 'high' }));
    assert.match(set.out, /^\[attention\] effort: CLAUDE_CODE_EFFORT_LEVEL=high/m);
  });
});

test('preflight usage and README row describe the origin probe and the pr ending line', () => {
  const usage = runScript('preflight.mjs', ['--help'], hermeticEnv(tmpdir())).stdout;
  const readme = readFileSync(join(LOOP_DIR, 'README.md'), 'utf8');
  const row = readme.split('\n').find((line) => line.startsWith('| `preflight'));
  for (const text of [usage, row]) {
    assert.doesNotMatch(text, /api\.github\.com/);
    assert.match(text, /origin/);
    assert.match(text, /pr ending/);
  }
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
