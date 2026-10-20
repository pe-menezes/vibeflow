// Audit probes, vibeflow 1.16 part 2 (independent audit in three editions, auditor role).
// Each probe runs a kit script with the exact command line an audit edition tells the auditor
// to run (the edition's kit path mapped to the kit folder of this repository, its placeholders
// filled in), in a hermetic git sandbox, and checks the exit code and the marker the edition
// tells the auditor to read. The executor's test pins the editions' wording; these pin that the
// wording and the scripts agree. Cases marked `todo` are evidence of a finding in the audit
// report (.vibeflow/audits/vibeflow-1-16-p2-audit.md), not contracts: they assert today's
// mechanics so anyone can re-run the scenario.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOOP_DIR, SCRIPTS_DIR, withSandbox } from '../loop-helpers.mjs';
import { assertAudit, parseVerdict } from '../assertions.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const EDITIONS = {
  shared: 'plugins/vibeflow/skills/audit/SKILL.md',
  cursor: 'cursor/skills/vibeflow-audit/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-audit.prompt.md',
};
const edition = (path) => readFileSync(join(ROOT, path), 'utf8');

// The command an edition names for a script, as written between backticks, e.g.
// `node .github/vibeflow/loop/scripts/review-package.mjs <project root> <base> <out>`.
function commandOf(text, script, argsShape) {
  const flat = text.replace(/\s+/g, ' ');
  const pattern = new RegExp('`node (\\S+?)scripts/' + script.replace('.', '\\.') + ' ' + argsShape.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`');
  const match = pattern.exec(flat);
  assert.ok(match, `the edition names \`node <kit>scripts/${script} ${argsShape}\``);
  return { kitPrefix: match[1], args: argsShape };
}

// Fill the placeholders and point the edition's kit path at this repository's kit.
function run(command, script, values, env) {
  const argv = command.args.replace('<project root>', '@ROOT').split(' ').map((token) => {
    if (token === '@ROOT') return values.root;
    if (/^<.*>$/.test(token)) {
      assert.ok(token in values, `placeholder ${token} has a value`);
      return values[token];
    }
    return token;
  });
  const result = spawnSync(process.execPath, [join(SCRIPTS_DIR, script), ...argv], { env, encoding: 'utf8', timeout: 20_000 });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const STEP1 = ['review-package.mjs', '<project root> <base> <out>'];
const REAUDIT = ['review-package.mjs', '<project root> <round-commit> <out>'];
const PROBES = ['check-probes.mjs', '<project root> --base <base>'];

// ------------------------------------------------------------- empty package

test('p2-1 the package each edition builds over a branch with no change exits 1 and says EMPTY PACKAGE, the marker the edition reads', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const text = edition(path);
    assert.match(text.replace(/\s+/g, ' '), /script exits 1 and the file says EMPTY PACKAGE/, `${name}: names exit 1 and the marker`);
    const command = commandOf(text, ...STEP1);
    withSandbox((box) => {
      box.git('checkout', '-q', '-b', 'feat');
      const base = box.git('merge-base', 'main', 'HEAD').trim();
      const out = join(box.root, 'pkg.md');
      const result = run(command, STEP1[0], { root: box.repo, '<base>': base, '<out>': out }, box.env());
      assert.equal(result.status, 1, `${name}: ${result.out}`);
      assert.match(readFileSync(out, 'utf8'), /EMPTY PACKAGE/, `${name}: the file carries the marker`);
    });
  }
});

test('p2-2 one uncommitted change makes the same command exit 0 with the diff and without the empty marker', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const command = commandOf(edition(path), ...STEP1);
    withSandbox((box) => {
      box.write('src/rules.ts', 'export const x = 2\n');
      const out = join(box.root, 'pkg.md');
      const result = run(command, STEP1[0], { root: box.repo, '<base>': 'HEAD', '<out>': out }, box.env());
      assert.equal(result.status, 0, `${name}: ${result.out}`);
      const pkg = readFileSync(out, 'utf8');
      assert.doesNotMatch(pkg, /EMPTY PACKAGE/, `${name}: no empty marker on a real change`);
      assert.match(pkg, /\+export const x = 2/, `${name}: the change is in the package`);
    });
  }
});

// ------------------------------------------------------------------ re-audit

test('p2-3 the re-audit command, started at the round commit, carries the fix (committed and not) and nothing of the audited round', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const command = commandOf(edition(path), ...REAUDIT);
    withSandbox((box) => {
      box.git('checkout', '-q', '-b', 'feat');
      box.write('src/rules.ts', 'export const ROUND_ZERO = 1\n');
      box.git('add', '-A');
      box.git('commit', '-q', '-m', 'round 0');
      const round = box.git('rev-parse', 'HEAD').trim();
      box.write('src/fix.ts', 'export const FIX_COMMITTED = 1\n');
      box.git('add', '-A');
      box.git('commit', '-q', '-m', 'fix 1');
      box.write('tests/rules.test.ts', 'FIX_UNCOMMITTED\n');
      const out = join(box.root, 'pkg.md');
      const result = run(command, REAUDIT[0], { root: box.repo, '<round-commit>': round, '<out>': out }, box.env());
      assert.equal(result.status, 0, `${name}: ${result.out}`);
      const pkg = readFileSync(out, 'utf8');
      assert.match(pkg, /FIX_COMMITTED/, `${name}: committed fix in the package`);
      assert.match(pkg, /FIX_UNCOMMITTED/, `${name}: uncommitted fix in the package`);
      assert.doesNotMatch(pkg, /ROUND_ZERO/, `${name}: the audited round stays out`);
    });
  }
});

// -------------------------------------------------------------------- probes

test('p2-4 check-probes, called as the editions call it, reads the probe file the audit just wrote (untracked) and flags a state line', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const command = commandOf(edition(path), ...PROBES);
    withSandbox((box) => {
      box.git('checkout', '-q', '-b', 'feat');
      box.write('tests/audit/feat-p1.test.ts', "it('total', () => expect(total([1, 2])).toBe(3))\n");
      const clean = run(command, PROBES[0], { root: box.repo, '<base>': 'main' }, box.env());
      assert.equal(clean.status, 0, `${name}: ${clean.out}`);
      assert.match(clean.out, /1 probe file\(s\) read/, `${name}: the untracked probe file is read`);
      // The fixture's state line and the expected report are assembled, so check-probes run on
      // this file does not read the fixture as a state probe of this repository.
      const stateLine = `const out = execSync('${['git', 'diff', 'main'].join(' ')}')\n`;
      box.write('tests/audit/feat-p1.test.ts', stateLine);
      const suspect = run(command, PROBES[0], { root: box.repo, '<base>': 'main' }, box.env());
      assert.equal(suspect.status, 1, `${name}: ${suspect.out}`);
      assert.ok(suspect.out.includes(['tests/audit/feat-p1.test.ts', '1 [reads git]'].join(':')), `${name}: the state line is named`);
    });
  }
});

// ------------------------------------------------------------- kit location

test('p2-5 the kit path each by-file edition names is a path the CLI installs the kit into', () => {
  const cli = readFileSync(join(ROOT, 'cli/index.js'), 'utf8');
  const installed = new Set([...cli.matchAll(/kitDest:\s*'([^']+)'/g)].map((m) => `${m[1]}/`));
  assert.ok(installed.size >= 2, 'the CLI declares a kit destination per by-file edition');
  for (const name of ['cursor', 'copilot']) {
    const prefixes = new Set([STEP1, REAUDIT, PROBES].map((shape) => commandOf(edition(EDITIONS[name]), ...shape).kitPrefix));
    assert.equal(prefixes.size, 1, `${name}: one kit path for every script`);
    const [prefix] = prefixes;
    assert.ok(installed.has(prefix), `${name}: ${prefix} is one of ${[...installed].join(', ')}`);
  }
  const shared = new Set([STEP1, REAUDIT, PROBES].map((shape) => commandOf(edition(EDITIONS.shared), ...shape).kitPrefix));
  assert.deepEqual([...shared], ['${CLAUDE_SKILL_DIR}/../implement/loop/'], 'shared: the kit beside the implement skill');
  assert.ok(existsSync(join(LOOP_DIR, '..', '..', 'audit', 'SKILL.md')), 'the shared audit sits two levels above the kit, as ../implement/loop/ assumes');
});

// ------------------------------------------------- partial and final report

function reportFrom(text, { stage, verdict }) {
  const template = /## Output format\s*```[^\n]*\n([\s\S]*?)\n```/.exec(text)[1];
  return template
    .replace(/^Stage: .*$/m, `Stage: ${stage}`)
    .replace(/^\*\*Verdict: PASS \| PARTIAL \| FAIL\*\*$/m, `**Verdict: ${verdict}**`);
}

function watch(file, { ceilingMin }) {
  const child = spawn(process.execPath, [join(SCRIPTS_DIR, 'watch-round.mjs'), '--file', file, '--interval-sec', '0.05', '--timeout-min', String(ceilingMin)], { encoding: 'utf8' });
  let out = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  return new Promise((done) => child.on('exit', (status) => done({ status, out })));
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

test('p2-6 a stage write of the template reads as unfinished to the smoke parser and to watch-round; the final write reads as finished', async () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const text = edition(path);
    const partial = reportFrom(text, { stage: '3/7 tests', verdict: 'pending' });
    const final = reportFrom(text, { stage: 'final', verdict: 'PARTIAL' });
    assert.equal(parseVerdict(partial), null, `${name}: a pending verdict is no verdict`);
    assert.equal(parseVerdict(final), 'PARTIAL', `${name}: the final verdict parses`);

    const dir = mkdtempSync(join(tmpdir(), 'vibeflow-audit-p2-'));
    try {
      const audits = join(dir, '.vibeflow', 'audits');
      mkdirSync(audits, { recursive: true });
      const file = join(audits, 'feat-audit.md');
      writeFileSync(file, reportFrom(text, { stage: '1/7 package', verdict: 'pending' }));

      const stillRunning = watch(file, { ceilingMin: 0.02 });
      await pause(200);
      writeFileSync(file, partial);
      assert.equal((await stillRunning).status, 3, `${name}: a stage write does not end the watch`);

      const ending = watch(file, { ceilingMin: 0.2 });
      await pause(200);
      writeFileSync(file, final);
      const ended = await ending;
      assert.equal(ended.status, 0, `${name}: the final write ends the watch: ${ended.out}`);

      for (const check of assertAudit(dir)) assert.equal(check.ok, true, `${name}: smoke check ${JSON.stringify(check)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

// ------------------------------------------------- risk code, every path

const section = (text, from, to) => {
  const start = text.indexOf(from);
  assert.ok(start !== -1, `section ${from}`);
  const end = to ? text.indexOf(to, start) : text.length;
  return text.slice(start, end === -1 ? text.length : end).replace(/\s+/g, ' ');
};

test('p2-7 the empty-package rule covers the three ways an audit reads the change: the script, a given package, the diff computed without the kit', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const rule = section(edition(path), '- An empty package', 'proven nothing.');
    assert.match(rule, /exits 1 and the file says EMPTY PACKAGE/, `${name}: the script's empty exit`);
    assert.match(rule, /the given package/, `${name}: a --package given empty`);
    assert.match(rule, /the computed diff shows no change/, `${name}: the kit-absent diff`);
    assert.match(rule, /`\*\*Verdict: FAIL\*\*`[^.]*never PASS/, `${name}: FAIL, never PASS`);
    const text = edition(path);
    const after = text.slice(text.indexOf('proven nothing.') + 'proven nothing.'.length, text.indexOf('2. **Spec**'));
    assert.equal(after.trim(), '', `${name}: nothing after the rule in step 1 can soften it`);
  }
});

test('p2-8 a re-audit over an empty fix diff falls under the same empty-package rule', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const reaudit = section(edition(path), '## Re-audit mode', '## Consolidation mode');
    assert.match(reaudit, /The empty-package rule of step 1 applies/, `${name}: re-audit applies the empty-package rule`);
  }
});

test('p2-9 in the verdict rules, risk-gap appears only in the sentence that keeps the verdict below PASS', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const rules = section(edition(path), '## Verdict rules', '## Re-audit mode');
    const sentences = rules.split(/(?<=\.)\s/).filter((sentence) => sentence.includes('`risk-gap`'));
    assert.deepEqual(sentences.map((sentence) => /keeps the verdict below PASS/.test(sentence)), [true], `${name}: ${sentences.join(' | ')}`);
    assert.doesNotMatch(rules.replace(/A `low` finding goes to `### Follow-ups` and does not block\./, ''), /does not block/, `${name}: only low is non-blocking`);
  }
});

// ------------------------------------------- evidence of findings (todo)

test('evidence F1: work committed on the default branch gives the base rule of step 1 an empty package', { todo: 'F1, cause spec: a hand audit after a commit on main now ends in "nothing to audit"; the human decides the base rule' }, () => {
  const command = commandOf(edition(EDITIONS.shared), ...STEP1);
  withSandbox((box) => {
    box.write('src/rules.ts', 'export const x = 2\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'the work, committed on main');
    const base = box.git('merge-base', 'main', 'HEAD').trim();
    const out = join(box.root, 'pkg.md');
    const result = run(command, STEP1[0], { root: box.repo, '<base>': base, '<out>': out }, box.env());
    assert.equal(result.status, 1, result.out);
  });
});

test('evidence F2: an earlier audit report left untracked turns the same empty package into a non-empty one', { todo: 'F2, cause spec: the empty-package rule does not discount the audit\'s own artifacts' }, () => {
  const command = commandOf(edition(EDITIONS.shared), ...STEP1);
  withSandbox((box) => {
    box.git('checkout', '-q', '-b', 'feat');
    const out = join(box.repo, '.vibeflow/reviews/feat-round-0.md');
    const first = run(command, STEP1[0], { root: box.repo, '<base>': 'main', '<out>': out }, box.env());
    assert.equal(first.status, 1, first.out);
    box.write('.vibeflow/audits/feat-audit.md', '## Audit Report: feat\n\n**Verdict: FAIL**\n\nnothing to audit\n');
    const second = run(command, STEP1[0], { root: box.repo, '<base>': 'main', '<out>': out }, box.env());
    assert.equal(second.status, 0, second.out);
    const pkg = readFileSync(out, 'utf8');
    assert.match(pkg, /## New files\n\n- \.vibeflow\/audits\/feat-audit\.md\n\n/, 'the only change is the earlier report');
  });
});

test('evidence L1: a kit command that fails before the script runs exits 1, the code the editions read as "empty" or "suspects"', { todo: 'L1, low: node exits 1 on a missing module or a syntax error of an older Node' }, () => {
  withSandbox((box) => {
    const unexpanded = spawnSync('sh', ['-c', 'node "${CLAUDE_SKILL_DIR}/../implement/loop/scripts/check-probes.mjs" . --base main'], {
      cwd: box.repo,
      env: box.env({ CLAUDE_SKILL_DIR: undefined }),
      encoding: 'utf8',
    });
    assert.equal(unexpanded.status, 1, 'the literal ${CLAUDE_SKILL_DIR} expands to nothing and node exits 1');
    const syntax = spawnSync(process.execPath, ['-e', 'const a = {}; a?.b; syntax error('], { encoding: 'utf8' });
    assert.equal(syntax.status, 1, 'a syntax error (what Node 12 sees in `?.`) exits 1');
  });
});
