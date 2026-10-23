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

// Contract: in every edition, an unresolved CRITICAL or HIGH Critical Gate finding fails the audit, an unresolved WARNING caps it at PARTIAL, INFO only informs, and overriding CRITICAL or HIGH needs a written justification.
// Breaks when: one edit made in the three editions at once, as cross-edition sync asks, demotes HIGH or WARNING in the mapping table or in the verdict rule; the editions still match each other.
// Not covered by: the contract tests hold the protected blocks identical across editions and well formed, which an identical edit in all three keeps, and the existing audit contracts only match the words "critical gate".
test('critical gate: an unresolved CRITICAL or HIGH finding fails the audit and a WARNING caps it at PARTIAL, in every edition', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const text = edition(path);
    const mapping = section(text, 'c. **Honor overrides.**', '**Rules Catalog');
    const effect = (severity) => new RegExp(`\\| ${severity.replace('/', '\\/')} \\| ([^|]+) \\|`).exec(mapping)?.[1].trim() ?? '';
    assert.match(effect('CRITICAL / HIGH'), /^\*\*FAIL\*\*/, `${name}: CRITICAL and HIGH map to FAIL`);
    assert.match(effect('WARNING'), /^caps the verdict at \*\*PARTIAL\*\*/, `${name}: WARNING caps the verdict at PARTIAL`);
    assert.ok(effect('INFO') !== '' && !/FAIL|PARTIAL/.test(effect('INFO')), `${name}: INFO is a note, not a verdict`);
    assert.match(mapping, /CRITICAL\/HIGH require a non-empty justification/, `${name}: a CRITICAL or HIGH override needs a reason`);
    const rules = section(text, '## Verdict rules', '## Re-audit mode');
    assert.match(rules, /Any unresolved CRITICAL or HIGH Critical Gate finding → FAIL, exactly like a failing test; an unresolved WARNING caps the verdict at PARTIAL\./,
      `${name}: the verdict rule fails CRITICAL and HIGH and caps WARNING`);
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

// Contract: a kit command that fails before the script runs exits 1 without the EMPTY PACKAGE marker, and the editions read exit 1 as empty only with the marker, after checking for Node.js 18; when the failure is a `${CLAUDE_SKILL_DIR}` the host did not substitute, the command's path starts at `/../`, the sign the plugin edition reads as the kit not installed with the Claude Code hint; "Cannot find module", which `node` also prints for a resolved path to a missing kit, is read as a missing kit with the plugin's install hint.
// Breaks when: an edition reads exit 1 alone as an empty package, so an old Node reads as "nothing to audit"; or the plugin edition reads the unsubstituted variable as an error to fix again, names a sign the shell does not show, or takes "Cannot find module" alone as the unsubstituted variable, so a missing kit gets the Claude Code hint.
// Not covered by: the contract tests check the sentences, not what a failed launch really prints and writes.
test('node: a kit command that fails before the script runs exits 1 without the EMPTY PACKAGE marker; an unsubstituted ${CLAUDE_SKILL_DIR} shows the signs the plugin edition reads as the kit not installed', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const flatText = edition(path).replace(/\s+/g, ' ');
    assert.match(flatText, /Exit 1 reads as empty only when the file it wrote carries the EMPTY PACKAGE marker/, `${name}: exit 1 alone is not empty`);
    assert.match(flatText, /`node --version`[^.]*Node\.js 18/, `${name}: Node 18 checked before the kit`);
  }
  const shared = edition(EDITIONS.shared);
  const bullet = section(shared, '- A command that still shows `${CLAUDE_SKILL_DIR}` literally', '- Kit not installed');
  const unsubstituted = /^[\s\S]*?the next case says\./.exec(bullet)?.[0] ?? '';
  assert.match(unsubstituted, /the kit counts as not installed, not as an error to fix/, 'plugin: the unsubstituted variable is the kit not installed');
  assert.match(unsubstituted, /update Claude Code to 2\.1\.69 or newer/, 'plugin: with the Claude Code hint');
  assert.match(bullet, /`Review package: none \(kit not installed\)`/, 'plugin: and records the kit-not-installed header');
  assert.match(bullet, /Any other exit 1 without the marker stays an error/, 'plugin: every other exit 1 without the marker is an error');
  const { kitPrefix } = commandOf(shared, ...STEP1);
  withSandbox((box) => {
    const out = join(box.root, 'pkg.md');
    const script = `${kitPrefix}scripts/review-package.mjs`;
    const shell = (line) => spawnSync('sh', ['-c', line], { cwd: box.repo, env: box.env({ CLAUDE_SKILL_DIR: undefined }), encoding: 'utf8' });
    const unexpanded = shell(`node "${script}" . main '${out}'`);
    assert.equal(unexpanded.status, 1, 'the literal ${CLAUDE_SKILL_DIR} expands to nothing and node exits 1');
    assert.equal(existsSync(out), false, 'no file, so no EMPTY PACKAGE marker');
    const path = shell(`printf '%s' "${script}"`).stdout;
    assert.ok(path.startsWith('/../') && unsubstituted.includes('`/../`'), `the path the shell runs starts at /../, as the plugin edition says: ${path}`);
    // A resolved path to a kit that is not there fails the same way in node, so only the path tells the two apart.
    const missingKit = join(box.root, 'skills', 'audit', '..', 'implement', 'loop', 'scripts', 'review-package.mjs');
    const missing = shell(`node "${missingKit}" . main '${out}'`);
    assert.equal(missing.status, 1, 'a missing kit exits 1 too');
    assert.ok(unexpanded.stderr.includes('Cannot find module') && missing.stderr.includes('Cannot find module'),
      `node says "Cannot find module" in both cases: ${missing.stderr.split('\n')[0]}`);
    assert.ok(!missingKit.startsWith('/../') && !missingKit.includes('${CLAUDE_SKILL_DIR}'), 'the resolved path shows neither sign of the unsubstituted variable');
    assert.doesNotMatch(unsubstituted, /Cannot find module/, 'plugin: "Cannot find module" is not a sign of the unsubstituted variable');
    assert.match(bullet.slice(unsubstituted.length), /With the path resolved, `node` answering "Cannot find module" for the kit's script means the kit folder is missing[^]*with the install hint above/,
      'plugin: with a resolved path it is a missing kit, with the plugin install hint');
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

// Contract: the line between artifact and change: a rewritten tracked report and an empty commit do not count; a source moved into an artifact folder and a mixed commit do; a sibling folder such as `.vibeflow/audits-old/` is not a change on its own, and next to a real change it is in the package as context, not left out as an artifact.
// Breaks when: the folder pathspec matches by prefix without the slash and swallows a path that is not an artifact, or the log and the diff filter artifacts differently.
// Not covered by: the implementer's tests cover untracked artifacts and an artifact-only commit, not a moved source, a sibling folder or a rewritten tracked report.
test('artifacts: what counts as a change: a modified tracked report and an empty commit do not; a source moved into an artifact folder and a mixed commit do; a sibling folder under .vibeflow/ is context, not a change', () => {
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
    const alone = pack(box, 'HEAD');
    assert.equal(alone.status, 1, alone.out);
    assert.match(alone.text, /EMPTY PACKAGE/, 'a sibling folder under .vibeflow/ is not a change on its own');
    box.write('src/other.ts', 'export const y = 1\n');
    const sibling = pack(box, 'HEAD');
    assert.equal(sibling.status, 0, sibling.out);
    assert.match(sibling.text, /^- \.vibeflow\/audits-old\/x\.md$/m, 'only the named folders are artifacts, not a folder that starts with the same name');
    assert.match(sibling.text, /^Loop artifacts left out: 0 path\(s\)/m, 'and the sibling is not counted as an artifact');
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
test('probes: check-probes reads the probe folder whether --dir is given relative to the project or absolute', () => {
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

// Contract: nothing under `.vibeflow/` counts as a change, so a new spec left untracked over work committed on the default branch gives an empty package (exit 1, EMPTY PACKAGE, the `.vibeflow/` path counted), and each edition sends that case to the committed-work rule, which audits the code; next to a real change the spec is in the package as context.
// Breaks when: the package script counts a spec as a change again, so the audit reads a package of the spec alone and reviews nothing, or an edition stops saying where a lone spec goes, or the spec leaves the package when there is a real change.
// Not covered by: the kit test runs the script without the editions, and the contract tests check the editions' sentence without running the script on this case.
test('artifacts: a new spec left untracked is not a change, so work committed on the default branch plus that spec is an empty package that the editions send to the committed-work rule', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const text = edition(path);
    const step1 = section(text, '1. **Review package**', '2. **Spec**');
    assert.match(step1, /A change only under `\.vibeflow\/` is an EMPTY PACKAGE, so work committed on the default branch plus a new spec left untracked takes the committed-work case below\./,
      `${name}: a lone spec over committed work takes the committed-work case`);
    assert.ok(step1.indexOf('takes the committed-work case below') < step1.indexOf('already committed on the default branch runs over the code as before'),
      `${name}: the committed-work case comes after the sentence that points at it`);
    const command = commandOf(text, ...STEP1);
    withSandbox((box) => {
      box.write('src/rules.ts', 'export const x = 2\n');
      box.git('add', 'src');
      box.git('commit', '-q', '-m', 'the work, committed on main');
      box.write('.vibeflow/specs/feat.md', '# spec\n');
      const out = join(box.root, 'pkg.md');
      const result = run(command, STEP1[0], { root: box.repo, '<base>': 'HEAD', '<out>': out }, box.env());
      assert.equal(result.status, 1, `${name}: ${result.out}`);
      const pkg = readFileSync(out, 'utf8');
      assert.match(pkg, /EMPTY PACKAGE/, `${name}: the spec alone is not a change`);
      assert.match(pkg, /1 path\(s\) under \.vibeflow\/ changed/, `${name}: and the package counts it`);
      box.write('src/other.ts', 'export const y = 1\n');
      const withChange = run(command, STEP1[0], { root: box.repo, '<base>': 'HEAD', '<out>': out }, box.env());
      assert.equal(withChange.status, 0, `${name}: ${withChange.out}`);
      assert.match(readFileSync(out, 'utf8'), /^## New file: \.vibeflow\/specs\/feat\.md$/m, `${name}: next to a real change, the spec is context in the package`);
    });
  }
});

// Contract: the lists the package script writes at its top when it leaves file diffs out (over the size cap, or with a line that looks like a secret) are the ones step 4a of each edition tells the Critical Gate to read, and the git command the step names for a tracked file, with the file itself for an untracked one, brings back what the package left out.
// Breaks when: the script renames `TRUNCATED` or `WITHHELD` or changes the list lines, or an edition names another marker or another command, so the gate scans less than the change and the report says "Clean".
// Not covered by: the kit tests check the lists without the editions, and the contract tests check the editions' words without running the script.
test('left out: the lists the package writes when it leaves file diffs out are the ones each edition tells the gate to read, and the commands it names bring them back', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const text = edition(path);
    const step = section(text, 'a. **Read the diff from the review package**', 'b. **Match each changed line');
    const markers = [...new Set([...step.matchAll(/`(TRUNCATED|WITHHELD)`/g)].map((match) => match[1]))].sort();
    assert.deepEqual(markers, ['TRUNCATED', 'WITHHELD'], `${name}: step 4a names both lists`);
    const gitCommand = /`(git diff <base> -- <path>)` \(`<base>` is the package's base\) for a tracked file/.exec(step)?.[1];
    assert.ok(gitCommand, `${name}: step 4a names the git command for a tracked file`);
    assert.match(step, /the file itself for an untracked one/, `${name}: and the file itself for an untracked one`);
    const command = commandOf(text, ...STEP1);
    withSandbox((box) => {
      box.write('db/migrate/003.sql', 'SELECT 1;\n');
      box.git('add', '-A');
      box.git('commit', '-q', '-m', 'a migration');
      const base = box.git('rev-parse', 'HEAD').trim();
      box.write('db/migrate/003.sql', `${'-- a long generated migration\n'.repeat(200)}DROP TABLE accounts;\n`);
      box.write('src/rules.ts', 'export const x = 2\n');
      // Assembled, with the scheme split, so no secret scanner reads this line as a credential.
      const credential = ['post' + 'gres://', 'app:', 'not-a-real-password', '@db.local/app'].join('');
      box.write('config/app.env', `DATABASE_URL=${credential}\n`);
      const out = join(box.root, 'pkg.md');
      const result = run({ ...command, args: `${command.args} --max-bytes 3000` }, STEP1[0], { root: box.repo, '<base>': base, '<out>': out }, box.env());
      assert.equal(result.status, 0, `${name}: ${result.out}`);
      const pkg = readFileSync(out, 'utf8');
      for (const marker of markers) assert.match(pkg, new RegExp(`^${marker}: 1 `, 'm'), `${name}: the package writes ${marker} as the edition names it`);
      assert.match(pkg, /^- db\/migrate\/003\.sql \(\d+ bytes\)$/m, `${name}: the migration is listed as left out`);
      assert.match(pkg, /^- config\/app\.env \(\d+ bytes, line 1\)$/m, `${name}: the credential file is listed as withheld`);
      assert.doesNotMatch(pkg, /DROP TABLE|not-a-real-password/, `${name}: neither is in the package`);
      assert.match(pkg, /^\+export const x = 2$/m, `${name}: what fits stays in the package`);
      const newFiles = /## New files\n\n([\s\S]*?)\n\n/.exec(pkg)?.[1] ?? '';
      assert.match(newFiles, /^- config\/app\.env$/m, `${name}: the package says which listed file is untracked`);
      assert.doesNotMatch(newFiles, /003\.sql/, `${name}: and that the migration is tracked`);
      const argv = gitCommand.split(' ').slice(1).map((token) => ({ '<base>': base, '<path>': 'db/migrate/003.sql' })[token] ?? token);
      const tracked = spawnSync('git', argv, { cwd: box.repo, env: box.env(), encoding: 'utf8' });
      assert.match(tracked.stdout, /^\+DROP TABLE accounts;$/m, `${name}: the edition's git command brings back the line the gate must see`);
      assert.ok(readFileSync(join(box.repo, 'config/app.env'), 'utf8').includes(credential), `${name}: the untracked file read as it is`);
    });
  }
});

// Contract: every file the package lists under TRUNCATED or WITHHELD comes back by the step 4a rule for its kind: a tracked one through the git command the edition names (an added line and a removed line alike), an untracked one from disk, and the package's `## New files` is what tells the two kinds apart.
// Breaks when: `## New files` stops naming an untracked file whose diff the package left out, so the auditor takes it for tracked, runs the git command, gets nothing back and the gate scans less than the change; or a WITHHELD entry for a removed or added secret stops pointing at a diff the git command shows.
// Not covered by: the implementer's probe leaves out one tracked file over the cap and one untracked file with a secret, never an untracked file over the cap, nor a tracked file whose secret line was added or removed.
test('left out: each file under TRUNCATED or WITHHELD, tracked or untracked, comes back by the rule step 4a gives for its kind, and the list of new files in the package tells the kinds apart', () => {
  // Assembled, with the scheme split, so no secret scanner reads this file as holding a credential.
  const credential = ['post', 'gres', '://app:', 'not-a-real-', 'password@db.local/app'].join('');
  for (const [name, path] of Object.entries(EDITIONS)) {
    const text = edition(path);
    const step = section(text, 'a. **Read the diff from the review package**', 'b. **Match each changed line');
    const gitCommand = /`(git diff <base> -- <path>)`/.exec(step)?.[1];
    assert.ok(gitCommand, `${name}: step 4a names the git command for a tracked file`);
    assert.match(step, /the file itself for an untracked one \(the package's `## New files` names those\)/, `${name}: and how to tell an untracked file`);
    const command = commandOf(text, ...STEP1);
    withSandbox((box) => {
      box.write('db/migrate/003.sql', 'SELECT 1;\n');
      box.write('config/old.env', `DATABASE_URL=${credential}\n`);
      box.git('add', '-A');
      box.git('commit', '-q', '-m', 'before the change');
      const base = box.git('rev-parse', 'HEAD').trim();
      box.write('db/migrate/003.sql', `${'-- generated\n'.repeat(400)}DROP TABLE accounts;\n`);
      box.write('config/old.env', 'DATABASE_URL=\n');
      box.write('src/rules.ts', `export const x = 1\nexport const url = '${credential}'\n`);
      box.write('config/app.env', `DATABASE_URL=${credential}\n`);
      box.write('db/seed.sql', `${'INSERT INTO t VALUES (1);\n'.repeat(300)}DROP TABLE seed;\n`);
      box.write('src/small.ts', 'export const y = 2\n');
      // What the gate must see in each left-out file, as a diff line.
      const mustSee = {
        'db/migrate/003.sql': '+DROP TABLE accounts;',
        'config/old.env': `-DATABASE_URL=${credential}`,
        'src/rules.ts': `+export const url = '${credential}'`,
        'config/app.env': `+DATABASE_URL=${credential}`,
        'db/seed.sql': '+DROP TABLE seed;',
      };
      const out = join(box.root, 'pkg.md');
      const result = run({ ...command, args: `${command.args} --max-bytes 3000` }, STEP1[0], { root: box.repo, '<base>': base, '<out>': out }, box.env());
      assert.equal(result.status, 0, `${name}: ${result.out}`);
      const pkg = readFileSync(out, 'utf8');
      const listed = (marker) => (new RegExp(`^${marker}: [^\\n]*\\n((?:- [^\\n]*\\n)*)`, 'm').exec(pkg)?.[1] ?? '')
        .split('\n').filter(Boolean).map((line) => line.slice(2).replace(/ \(\d+ bytes(, line \d+)?\)$/, ''));
      assert.deepEqual([...listed('TRUNCATED'), ...listed('WITHHELD')].sort(), Object.keys(mustSee).sort(), `${name}: the five files are left out and listed`);
      assert.ok(!pkg.includes(credential) && !/DROP TABLE/.test(pkg), `${name}: none of their lines is in the package`);
      const newFiles = (/## New files\n\n([\s\S]*?)\n\n/.exec(pkg)?.[1] ?? '').split('\n').map((line) => line.replace(/^- /, ''));
      assert.deepEqual(Object.keys(mustSee).filter((file) => newFiles.includes(file)).sort(), ['config/app.env', 'db/seed.sql'], `${name}: ## New files names the two untracked ones, and only them`);
      for (const [file, line] of Object.entries(mustSee)) {
        const argv = gitCommand.split(' ').slice(1).map((token) => ({ '<base>': base, '<path>': file })[token] ?? token);
        const viaGit = spawnSync('git', argv, { cwd: box.repo, env: box.env(), encoding: 'utf8' }).stdout;
        if (newFiles.includes(file)) {
          assert.equal(viaGit, '', `${name}: ${file} is untracked, so the git command alone brings nothing back`);
          assert.ok(readFileSync(join(box.repo, file), 'utf8').split('\n').includes(line.slice(1)), `${name}: ${file} read from disk has the line`);
        } else {
          assert.ok(viaGit.split('\n').includes(line), `${name}: the git command brings back ${file}'s line`);
        }
      }
    });
  }
});

// Contract: a line of a WITHHELD file is cited by path and line number alone, so the line number the package each edition builds gives for a tracked file is the file line of the secret, also when the secret sits in a later hunk, after a removed line of the same hunk.
// Breaks when: the package counts a removed line into the new file's numbering, or keeps counting from the first hunk instead of the hunk header, so the report cites a line that is not the secret and the auditor cannot find what the gate matched.
// Not covered by: the kit test names line 3 of a single hunk with no removed line, the left-out probes drop the number, and the contract test checks only the citation sentence.
test('left out: the line number a WITHHELD entry gives for a tracked file is the file line of the secret, in a later hunk and after a removed line, so the citation by path and line points at it', () => {
  // Assembled, so no secret scanner reads this file as holding a token.
  const token = ['gh', 'p_', 'A1b2C3d4'.repeat(3)].join('');
  for (const [name, path] of Object.entries(EDITIONS)) {
    const command = commandOf(edition(path), ...STEP1);
    withSandbox((box) => {
      const before = Array.from({ length: 80 }, (_, i) => `KEY_${i + 1}=value_${i + 1}`);
      box.write('config/app.env', `${before.join('\n')}\n`);
      box.git('add', '-A');
      box.git('commit', '-q', '-m', 'config');
      const base = box.git('rev-parse', 'HEAD').trim();
      const after = [...before];
      after[1] = 'KEY_2=changed';
      after.splice(after.indexOf('KEY_40=value_40'), 1);
      after.splice(after.indexOf('KEY_44=value_44') + 1, 0, `API_TOKEN=${token}`);
      box.write('config/app.env', `${after.join('\n')}\n`);
      const fileLine = readFileSync(join(box.repo, 'config/app.env'), 'utf8').split('\n').indexOf(`API_TOKEN=${token}`) + 1;
      const diff = spawnSync('git', ['diff', base, '--', 'config/app.env'], { cwd: box.repo, env: box.env(), encoding: 'utf8' }).stdout;
      const hunks = diff.split(/^(?=@@ )/m).slice(1);
      const secretHunk = hunks.findIndex((hunk) => hunk.includes(`+API_TOKEN=${token}`));
      assert.ok(secretHunk > 0, `${name}: the secret sits in a later hunk`);
      const hunk = hunks[secretHunk];
      assert.ok(hunk.indexOf('\n-KEY_40=value_40') < hunk.indexOf(`\n+API_TOKEN=${token}`), `${name}: after a removed line of the same hunk`);
      const out = join(box.root, 'pkg.md');
      const result = run(command, STEP1[0], { root: box.repo, '<base>': base, '<out>': out }, box.env());
      assert.equal(result.status, 0, `${name}: ${result.out}`);
      const pkg = readFileSync(out, 'utf8');
      assert.ok(!pkg.includes(token) && !pkg.includes('API_TOKEN'), `${name}: the line is not in the package`);
      const listed = /^- config\/app\.env \(\d+ bytes, line (\d+)\)$/m.exec(pkg)?.[1];
      assert.equal(Number(listed), fileLine, `${name}: the WITHHELD entry names the file line of the secret`);
    });
  }
});

// ------------------------------------------------------------ sabotage copy

const SABOTAGE_STEP = /6\. \*\*Sabotage, only in risk code\*\*.*?7\. \*\*Probes\*\*/;
const RETRY_RULE = /When a report that a dead attempt left is already at that path.*?1\. \*\*Review package\*\*/;

// Contract: the sabotage step and the retry rule name a folder under `.vibeflow/` only to forbid it, whatever word a sentence uses for the copy.
// Breaks when: a sentence such as "keep a backup of each sabotaged file in `.vibeflow/audits/`" enters step 6, which brings a withheld file back into a folder the project may commit.
// Not covered by: the contract test looks for `.vibeflow/` only in sentences that say "copy" or "copies", so the same instruction worded "backup" passes it.
test('sabotage copy: the sabotage step and the retry rule name .vibeflow/ only to forbid it, whatever the word for the copy', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const text = edition(path).replace(/\s+/g, ' ');
    const step = SABOTAGE_STEP.exec(text)?.[0] ?? '';
    const retry = RETRY_RULE.exec(text)?.[0] ?? '';
    assert.ok(step && retry, `${name}: step 6 and the retry rule are found`);
    assert.deepEqual(step.match(/`\.vibeflow\/[^`]*`/g), ['`.vibeflow/`'], `${name}: step 6 names .vibeflow/ once`);
    assert.match(step, /never to `\.vibeflow\/` or any other folder of the project/, `${name}: and only to forbid it`);
    assert.equal(retry.match(/`\.vibeflow\/[^`]*`/g), null, `${name}: the retry rule names no folder under .vibeflow/`);
  }
});

// Contract: the report template carries the line that says the copies and their temporary folder were deleted, as step 6 asks.
// Breaks when: the line leaves the `### Sabotage` template, so a report that follows the template never says the copies are gone.
// Not covered by: the contract test checks the step 6 sentence and the template's copy line, not the line that records the deletion.
test('sabotage copy: the report template records that the copies and their temporary folder were deleted', () => {
  for (const [name, path] of Object.entries(EDITIONS)) {
    const text = edition(path);
    const template = /## Output format\s*```[^\n]*\n([\s\S]*?)\n```/.exec(text)?.[1] ?? '';
    const sabotage = /### Sabotage\n([\s\S]*?)\n### Probes/.exec(template)?.[1] ?? '';
    assert.ok(sabotage, `${name}: the template has a Sabotage section`);
    assert.match(sabotage, /^Copies: deleted, with their temporary folder$/m, `${name}: the template says the copies and the folder were deleted`);
    assert.match(text.replace(/\s+/g, ' '), /the report says both were deleted/, `${name}: step 6 asks for that line`);
  }
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
