// Behavior probes from independent audits of the audit workflow in its three editions. Each
// probe runs a kit script with the exact command line an audit edition tells the auditor to run
// (the edition's kit path mapped to the kit folder of this repository, its placeholders filled
// in), in a hermetic git sandbox, and checks the exit code and the marker the edition tells the
// auditor to read; the contract tests pin the editions' wording, these pin that the wording and
// the scripts agree. Each case states, as comments, the contract it protects, the plausible
// regression that breaks it, and why the implementer's tests did not catch it. A case marked
// `todo` asserts what a known open gap asks for: it runs and prints without failing the suite.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCRIPTS_DIR, withSandbox } from '../loop-helpers.mjs';
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

// Fill the placeholders and point the edition's kit path at this repository's kit. The two
// placeholders with a space (`<project root>`, `<probe dir>`) are one argument each.
function run(command, script, values, env) {
  const argv = command.args.replace('<project root>', '@ROOT').replace('<probe dir>', '@PROBE_DIR').split(' ').map((token) => {
    if (token === '@ROOT') return values.root;
    if (token === '@PROBE_DIR') {
      assert.ok('<probe dir>' in values, 'placeholder <probe dir> has a value');
      return values['<probe dir>'];
    }
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
const PROBES = ['check-probes.mjs', '<project root> --base <base> --dir <probe dir>'];

// ------------------------------------------------------------- empty package

// Contract: over a branch with no change, the package command each edition names exits 1 and writes the EMPTY PACKAGE marker the edition reads.
// Breaks when: the script changes the marker or the exit code, or an edition reorders the arguments or quotes another marker.
// Not covered by: the contract tests pin the edition's sentence and never run the script with it.
test('empty package: the package each edition builds over a branch with no change exits 1 and says EMPTY PACKAGE, the marker the edition reads', () => {
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

// Contract: a real change makes the same command exit 0, with the diff in the package and no empty marker.
// Breaks when: the marker is printed on every package, or an uncommitted change drops out of the package.
// Not covered by: the contract tests pin the edition's sentence and never run the script with it.
test('empty package: one uncommitted change makes the same command exit 0 with the diff and without the empty marker', () => {
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

// Contract: the re-audit command, started at the round commit, carries the fix, committed and not, and nothing of the audited round.
// Breaks when: `<round-commit>` moves to another argument, or the re-audit base becomes a merge-base.
// Not covered by: the contract test only checks the text `review-package.mjs <project root> <round-commit>`.
test('re-audit: the command, started at the round commit, carries the fix (committed and not) and nothing of the audited round', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const command = commandOf(edition(path), ...REAUDIT);
    withSandbox((box) => {
      box.git('checkout', '-q', '-b', 'feat');
      box.write('src/rules.ts', 'export const ROUND_ZERO = 1\n');
      box.git('add', '-A');
      box.git('commit', '-q', '-m', 'the audited round');
      const round = box.git('rev-parse', 'HEAD').trim();
      box.write('src/fix.ts', 'export const FIX_COMMITTED = 1\n');
      box.git('add', '-A');
      box.git('commit', '-q', '-m', 'the fix');
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

// Contract: check-probes, called as the editions call it, reads the probe file the audit just wrote (untracked) and flags a state line in it.
// Breaks when: an edition drops `--base` or `--dir` from the call, or the script stops reading untracked files under `--base`.
// Not covered by: no implementer test runs the script in the form the editions write.
test('probes: check-probes, called as the editions call it, reads the probe file the audit just wrote (untracked) and flags a state line', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const command = commandOf(edition(path), ...PROBES);
    withSandbox((box) => {
      box.git('checkout', '-q', '-b', 'feat');
      box.write('tests/audit/feat-api.test.ts', "it('total', () => expect(total([1, 2])).toBe(3))\n");
      const clean = run(command, PROBES[0], { root: box.repo, '<base>': 'main', '<probe dir>': 'tests/audit' }, box.env());
      assert.equal(clean.status, 0, `${name}: ${clean.out}`);
      assert.match(clean.out, /1 probe file\(s\) read/, `${name}: the untracked probe file is read`);
      // The fixture's state line and the expected report are assembled, so check-probes run on
      // this file does not read the fixture as a state probe of this repository.
      const stateLine = `const out = execSync('${['git', 'diff', 'main'].join(' ')}')\n`;
      box.write('tests/audit/feat-api.test.ts', stateLine);
      const suspect = run(command, PROBES[0], { root: box.repo, '<base>': 'main', '<probe dir>': 'tests/audit' }, box.env());
      assert.equal(suspect.status, 1, `${name}: ${suspect.out}`);
      assert.ok(suspect.out.includes(['tests/audit/feat-api.test.ts', '1 [reads git]'].join(':')), `${name}: the state line is named`);
    });
  }
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

// Contract: a stage write of each edition's report template has no verdict for the smoke parser and does not end watch-round; the final write ends it and passes the smoke checks.
// Breaks when: the partial marker becomes something the parser reads as a verdict, or the header changes so watch-round no longer recognizes it.
// Not covered by: the contract test checks the template's lines, but never runs the template through the scripts that read it.
test('report: a stage write of the template reads as unfinished to the smoke parser and to watch-round; the final write reads as finished', async () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const text = edition(path);
    const partial = reportFrom(text, { stage: '3/7 tests', verdict: 'pending' });
    const final = reportFrom(text, { stage: 'final', verdict: 'PARTIAL' });
    assert.equal(parseVerdict(partial), null, `${name}: a pending verdict is no verdict`);
    assert.equal(parseVerdict(final), 'PARTIAL', `${name}: the final verdict parses`);

    const dir = mkdtempSync(join(tmpdir(), 'vibeflow-audit-editions-'));
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

// Contract: the empty-package rule covers the script, a given package and the diff computed without the kit, ends in FAIL, and nothing after it in step 1 softens it.
// Breaks when: an edition loses the clause "or the given package or the computed diff shows no change", or gains a sentence after the rule such as "audit it anyway".
// Not covered by: the contract test's regex still matches with that clause removed and with a softening sentence added.
test('empty package: the rule covers the three ways an audit reads the change: the script, a given package, the diff computed without the kit', () => {
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

// Contract: a re-audit over an empty fix diff falls under the same empty-package rule.
// Breaks when: the sentence "The empty-package rule of step 1 applies." leaves the re-audit mode, so an empty fix can pass a re-audit.
// Not covered by: the contract test of the re-audit does not look at that sentence.
test('re-audit: an empty fix diff falls under the same empty-package rule', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const reaudit = section(edition(path), '## Re-audit mode', '## Consolidation mode');
    assert.match(reaudit, /The empty-package rule of step 1 applies/, `${name}: re-audit applies the empty-package rule`);
  }
});

// Contract: in the verdict rules, `risk-gap` appears only in the sentence that keeps the verdict below PASS, and only `low` "does not block".
// Breaks when: a sentence is added to the verdict rules that demotes `risk-gap` to a follow-up.
// Not covered by: the contract test checks that the sentences are present, not that they are the only ones.
test('verdict: in the verdict rules, risk-gap appears only in the sentence that keeps the verdict below PASS', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const rules = section(edition(path), '## Verdict rules', '## Re-audit mode');
    const sentences = rules.split(/(?<=\.)\s/).filter((sentence) => sentence.includes('`risk-gap`'));
    assert.deepEqual(sentences.map((sentence) => /keeps the verdict below PASS/.test(sentence)), [true], `${name}: ${sentences.join(' | ')}`);
    assert.doesNotMatch(rules.replace(/A `low` finding goes to `### Follow-ups` and does not block\./, ''), /does not block/, `${name}: only low is non-blocking`);
  }
});

// ------------------------------------------- committed work, artifacts, Node

// Contract: work committed on the default branch gives the default base an empty package, the edition handles that case before the empty-package rule by running over the code (no FAIL), and `--base <ref>` puts the committed work in the package.
// Breaks when: the standalone case moves after the empty-package rule or ends in FAIL, or `--base` stops reaching the package command.
// Not covered by: the contract test checks the editions' sentences; it never runs the package command on committed work, nor checks that the case comes before the rule.
test('committed work: the default base gives an empty package and the edition runs over the code instead of failing; --base <ref> audits the committed work', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const text = edition(path);
    const flatText = text.replace(/\s+/g, ' ');
    const step1 = section(text, '1. **Review package**', '2. **Spec**');
    const standalone = step1.indexOf('already committed on the default branch');
    const emptyRule = step1.indexOf('- An empty package');
    assert.ok(standalone !== -1 && standalone < emptyRule, `${name}: the committed-work case is handled before the empty-package rule`);
    assert.match(step1.slice(standalone, emptyRule), /runs over the code as before/, `${name}: it runs over the code`);
    assert.match(step1.slice(standalone, emptyRule), /`Review package: none \(no uncommitted or branch change; --base <ref> audits committed work\)`/, `${name}: and records why`);
    assert.doesNotMatch(step1.slice(standalone, emptyRule), /Verdict: FAIL/, `${name}: no FAIL in that case`);
    assert.match(flatText, /base `--base <ref>` when given/, `${name}: --base names the package base`);
    const command = commandOf(text, ...STEP1);
    withSandbox((box) => {
      box.write('src/rules.ts', 'export const x = 2\n');
      box.git('add', '-A');
      box.git('commit', '-q', '-m', 'the work, committed on main');
      const out = join(box.root, 'pkg.md');
      const byDefault = run(command, STEP1[0], { root: box.repo, '<base>': box.git('merge-base', 'main', 'HEAD').trim(), '<out>': out }, box.env());
      assert.equal(byDefault.status, 1, `${name}: ${byDefault.out}`);
      assert.match(readFileSync(out, 'utf8'), /EMPTY PACKAGE/, `${name}: the default base sees nothing`);
      const withBase = run(command, STEP1[0], { root: box.repo, '<base>': box.base, '<out>': out }, box.env());
      assert.equal(withBase.status, 0, `${name}: ${withBase.out}`);
      assert.match(readFileSync(out, 'utf8'), /^\+export const x = 2$/m, `${name}: --base <ref> puts the committed work in the package`);
    });
  }
});

// Contract: an earlier audit report left untracked in `.vibeflow/audits/` does not turn an empty package into a non-empty one, and the package says it left that path out.
// Breaks when: the package script counts untracked loop artifacts as a change again, so an audit over nothing goes on without FAIL.
// Not covered by: the kit tests call the script with their own argument list; this case runs the shared edition's command in the order an audit follows (package, then report, then package again on a retry).
test('artifacts: an earlier audit report left untracked does not turn an empty package into a non-empty one', () => {
  const command = commandOf(edition(EDITIONS.shared), ...STEP1);
  withSandbox((box) => {
    box.git('checkout', '-q', '-b', 'feat');
    const out = join(box.repo, '.vibeflow/reviews/feat-round-0.md');
    const first = run(command, STEP1[0], { root: box.repo, '<base>': 'main', '<out>': out }, box.env());
    assert.equal(first.status, 1, first.out);
    box.write('.vibeflow/audits/feat-audit.md', '## Audit Report: feat\n\n**Verdict: FAIL**\n\nnothing to audit\n');
    const second = run(command, STEP1[0], { root: box.repo, '<base>': 'main', '<out>': out }, box.env());
    assert.equal(second.status, 1, second.out);
    const pkg = readFileSync(out, 'utf8');
    assert.match(pkg, /EMPTY PACKAGE/, 'the earlier report is not a change');
    assert.match(pkg, /^Loop artifacts left out: 1 path\(s\)/m, 'and the package says it left it out');
  });
});

// Contract: a kit command that fails before the script runs exits 1 without the EMPTY PACKAGE marker, and the editions read exit 1 as empty only with the marker, after checking for Node.js 18.
// Breaks when: an edition reads exit 1 alone as an empty package, so a missing kit, an unexpanded `${CLAUDE_SKILL_DIR}` or an old Node reads as "nothing to audit".
// Not covered by: the contract test checks the sentences, not that a failed launch really exits 1 with no file written.
test('node: a kit command that fails before the script runs exits 1 without the EMPTY PACKAGE marker, which the editions read as an error', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const flatText = edition(path).replace(/\s+/g, ' ');
    assert.match(flatText, /Exit 1 reads as empty only when the file it wrote carries the EMPTY PACKAGE marker/, `${name}: exit 1 alone is not empty`);
    assert.match(flatText, /`node --version`[^.]*Node\.js 18/, `${name}: Node 18 checked before the kit`);
  }
  withSandbox((box) => {
    const out = join(box.root, 'pkg.md');
    const unexpanded = spawnSync('sh', ['-c', `node "\${CLAUDE_SKILL_DIR}/../implement/loop/scripts/review-package.mjs" . main '${out}'`], {
      cwd: box.repo,
      env: box.env({ CLAUDE_SKILL_DIR: undefined }),
      encoding: 'utf8',
    });
    assert.equal(unexpanded.status, 1, 'the literal ${CLAUDE_SKILL_DIR} expands to nothing and node exits 1');
    assert.equal(existsSync(out), false, 'no file, so no EMPTY PACKAGE marker: an error, not an empty package');
    const syntax = spawnSync(process.execPath, ['-e', 'const a = {}; a?.b; syntax error('], { encoding: 'utf8' });
    assert.equal(syntax.status, 1, 'a syntax error (what Node 12 sees in `?.`) exits 1, with no marker either');
  });
});

// ------------------------------------------------ what counts as a change

// Contract: a re-audit over an empty fix stays empty (exit 1, EMPTY PACKAGE, two artifacts counted) when the first package and the audit report sit untracked in the project, in each edition's command.
// Breaks when: one artifact folder, such as `reviews/`, leaves the package script's filter while the text stays the same.
// Not covered by: the only path under `reviews/` the implementer's test uses is the package's own `<out>`, which is left out by name before the filter.
test('re-audit: an empty fix stays empty when the first package and the audit report sit untracked in the project', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const command = commandOf(edition(path), ...REAUDIT);
    withSandbox((box) => {
      box.git('checkout', '-q', '-b', 'feat');
      box.write('src/rules.ts', 'export const x = 2\n');
      box.git('add', '-A');
      box.git('commit', '-q', '-m', 'the audited round');
      const round = box.git('rev-parse', 'HEAD').trim();
      box.write('.vibeflow/reviews/feat-api-round-0.md', '# package of the audited round\n');
      box.write('.vibeflow/audits/feat-api-audit.md', '**Verdict: PARTIAL**\n');
      const out = join(box.repo, '.vibeflow/reviews/feat-api-round-1.md');
      const result = run(command, REAUDIT[0], { root: box.repo, '<round-commit>': round, '<out>': out }, box.env());
      assert.equal(result.status, 1, `${name}: ${result.out}`);
      const pkg = readFileSync(out, 'utf8');
      assert.match(pkg, /EMPTY PACKAGE/, `${name}: an earlier package and report are not a fix`);
      assert.match(pkg, /^Loop artifacts left out: 2 path\(s\)/m, `${name}: both counted as left out`);
    });
  }
});

// Contract: the line between artifact and change: a rewritten tracked report and an empty commit do not count; a source moved into an artifact folder, a mixed commit and a sibling folder such as `audits-old/` do.
// Breaks when: the folder pathspec matches by prefix without the slash and swallows a real path, or the log and the diff filter artifacts differently.
// Not covered by: the implementer's tests cover untracked artifacts and an artifact-only commit, not a moved source, a sibling folder or a rewritten tracked report.
test('artifacts: what counts as a change: a modified tracked report and an empty commit do not; a source moved into an artifact folder, a mixed commit and a sibling folder do', () => {
  const command = commandOf(edition(EDITIONS.shared), ...STEP1);
  const pack = (box, base) => {
    const out = join(box.root, 'pkg.md');
    const result = run(command, STEP1[0], { root: box.repo, '<base>': base, '<out>': out }, box.env());
    return { status: result.status, out: result.out, text: readFileSync(out, 'utf8') };
  };
  withSandbox((box) => {
    box.write('.vibeflow/audits/old-audit.md', 'v1\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'an earlier report, tracked');
    box.write('.vibeflow/audits/old-audit.md', 'v2\n');
    const tracked = pack(box, 'HEAD');
    assert.equal(tracked.status, 1, tracked.out);
    assert.match(tracked.text, /EMPTY PACKAGE/, 'a rewritten tracked report is not a change');
  });
  withSandbox((box) => {
    box.git('checkout', '-q', '-b', 'feat');
    box.git('commit', '-q', '--allow-empty', '-m', 'empty');
    const empty = pack(box, 'main');
    assert.equal(empty.status, 1, empty.out);
    assert.match(empty.text, /EMPTY PACKAGE/, 'an empty commit is not a change');
  });
  withSandbox((box) => {
    box.git('checkout', '-q', '-b', 'feat');
    box.write('.vibeflow/audits/keep.md', 'k\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'keep');
    box.git('mv', 'src/rules.ts', '.vibeflow/audits/rules.ts');
    box.git('commit', '-q', '-m', 'move the source into an artifact folder');
    const moved = pack(box, 'main');
    assert.equal(moved.status, 0, moved.out);
    assert.match(moved.text, /^-export const x = 1$/m, 'the source that left is still a change');
  });
  withSandbox((box) => {
    box.git('checkout', '-q', '-b', 'feat');
    box.write('src/rules.ts', 'export const x = 3\n');
    box.write('.vibeflow/progress/feat-api.md', 'progress\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'mixed');
    const mixed = pack(box, 'main');
    assert.equal(mixed.status, 0, mixed.out);
    assert.match(mixed.text, /^\w+ mixed$/m, 'a commit with a real change stays in the commits');
    assert.match(mixed.text, /^\+export const x = 3$/m);
  });
  withSandbox((box) => {
    box.write('.vibeflow/audits-old/x.md', 'x\n');
    const sibling = pack(box, 'HEAD');
    assert.equal(sibling.status, 0, sibling.out);
    assert.match(sibling.text, /^- \.vibeflow\/audits-old\/x\.md$/m, 'only the named folders are artifacts, not a folder that starts with the same name');
  });
});

// Contract: the standalone exit from the empty-package rule names the three cases it excludes (no loop part, no `--package`, no `--base`), and the re-audit has no such exit.
// Breaks when: the exclusions leave the standalone bullet, which opens "runs over the code" to a loop part, a given package or base and a re-audit: an audit over nothing without FAIL.
// Not covered by: the contract test checks the exit's sentence and the empty-package rule's list, not the exit's exclusions.
test('empty package: the standalone exit names the three cases it excludes, so a loop part, a given package or base, and a re-audit never take it', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const step1 = section(edition(path), '1. **Review package**', '2. **Spec**');
    const start = step1.indexOf('- A standalone audit');
    assert.ok(start !== -1, `${name}: the standalone bullet`);
    const bullet = step1.slice(start, step1.indexOf('- An empty package'));
    assert.match(bullet, /^- A standalone audit \(no loop part, no `--package`, no `--base`\) whose default diff is empty because the work is already committed on the default branch runs over the code as before/,
      `${name}: the exit is for a standalone audit only`);
    const reaudit = section(edition(path), '## Re-audit mode', '## Consolidation mode');
    assert.doesNotMatch(reaudit, /runs over the code|Review package: none \(no uncommitted/, `${name}: the re-audit has no such exit`);
  }
});

// Contract: when the project root is a folder inside the git repository, that subproject's own `.vibeflow/` artifacts stay out of the package.
// Breaks when: the artifact folders are matched from the git top level instead of `<project root>`, so an old report in `app/.vibeflow/audits/` makes an empty package non-empty.
// Not covered by: every implementer test runs with the project root at the git top level.
test('artifacts: a subproject\'s own .vibeflow/ artifacts stay out when the project root is a folder inside the git repository', { todo: 'open gap: the artifact folders are matched from the git top level, not from the project root' }, () => {
  const command = commandOf(edition(EDITIONS.shared), ...STEP1);
  withSandbox((box) => {
    box.write('app/src/index.ts', 'export {}\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'app');
    box.git('checkout', '-q', '-b', 'feat');
    box.write('app/.vibeflow/audits/feat-audit.md', '**Verdict: FAIL**\n');
    const out = join(box.root, 'pkg.md');
    const result = run(command, STEP1[0], { root: join(box.repo, 'app'), '<base>': 'main', '<out>': out }, box.env());
    assert.equal(result.status, 1, result.out);
  });
});

// Contract: check-probes reads the probe folder whether `--dir` is relative to the project or absolute.
// Breaks when: the script compares `--dir` with paths relative to the root, so an absolute folder reads zero files and exits 0.
// Not covered by: the implementer's tests and the editions only pass a relative `--dir`.
test('probes: check-probes reads the probe folder whether --dir is given relative to the project or absolute', { todo: 'open gap: an absolute --dir reads no probe file and exits 0' }, () => {
  const command = commandOf(edition(EDITIONS.shared), ...PROBES);
  withSandbox((box) => {
    box.git('checkout', '-q', '-b', 'feat');
    box.write('tests/audit/feat-api.test.ts', "it('total', () => expect(total([1, 2])).toBe(3))\n");
    for (const dir of ['tests/audit', join(box.repo, 'tests/audit')]) {
      const result = run(command, PROBES[0], { root: box.repo, '<base>': 'main', '<probe dir>': dir }, box.env());
      assert.match(result.out, /1 probe file\(s\) read/, `--dir ${dir}: ${result.out}`);
    }
  });
});

// Contract: only the five loop artifact folders the editions list stay out of the package, so a new spec left untracked in `.vibeflow/specs/` counts as a change: with the work committed on the default branch, the package holds the spec alone.
// Breaks when: the package script starts leaving more of `.vibeflow/` out than the editions list, or stops counting an untracked spec, without the editions saying so.
// Not covered by: the kit test shows a spec in the package next to a source change, never a spec as the only change, the case where the standalone exit for committed work stops applying.
test('artifacts: a new spec left untracked counts as a change, so work committed on the default branch plus that spec gives a package of the spec alone', () => {
  const command = commandOf(edition(EDITIONS.shared), ...STEP1);
  withSandbox((box) => {
    box.write('src/rules.ts', 'export const x = 2\n');
    box.git('add', 'src');
    box.git('commit', '-q', '-m', 'the work, committed on main');
    box.write('.vibeflow/specs/feat.md', '# spec\n');
    const out = join(box.root, 'pkg.md');
    const result = run(command, STEP1[0], { root: box.repo, '<base>': 'HEAD', '<out>': out }, box.env());
    assert.equal(result.status, 0, result.out);
    const pkg = readFileSync(out, 'utf8');
    assert.match(pkg, /## New files\n\n- \.vibeflow\/specs\/feat\.md\n\n/, 'the spec is the only change');
    assert.doesNotMatch(pkg, /export const x = 2/, 'and the committed work is not in the package');
  });
});

// ------------------------------------------------------------ --probes gate

// Contract: every clause that makes probes or sabotage wait for `--probes` names a standalone audit, and the one loop-part clause runs both as written.
// Breaks when: the loop-part clause becomes "runs both only with `--probes` too", which takes sabotage and probes out of every loop audit.
// Not covered by: the contract test's regex `loop part \(briefing present\) runs both` accepts any continuation of that sentence.
test('--probes: the gate binds only a standalone audit: every clause that makes probes or sabotage wait for --probes names a standalone audit, and the loop-part clause runs both as written', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const text = edition(path);
    const steps = text.slice(text.indexOf('## Steps'), text.indexOf('## Consolidation mode'))
      .replace(/`Sabotage: skipped \(standalone audit; --probes runs it\)`/g, '`SKIPPED-LINE`')
      .replace(/^Sabotage: skipped \(standalone audit; --probes runs it\)$/m, 'SKIPPED-LINE')
      .replace(/\s+/g, ' ');
    const clauses = steps.split(/(?<=[.;])\s/);
    const gated = clauses.filter((clause) => clause.includes('`--probes`'));
    assert.ok(gated.length >= 4, `${name}: the gate is written (${gated.length} clauses)`);
    for (const clause of gated) {
      assert.match(clause, /standalone/i, `${name}: a clause gates on --probes without naming a standalone audit: ${clause}`);
    }
    const loopPart = clauses.filter((clause) => /loop part \(briefing present\)/.test(clause));
    assert.equal(loopPart.length, 1, `${name}: one clause says what a loop part does`);
    assert.match(loopPart[0], /runs both as written/, `${name}: ${loopPart[0]}`);
    assert.doesNotMatch(loopPart[0], /--probes|only|skip/, `${name}: a loop part never waits for --probes: ${loopPart[0]}`);
  }
});
