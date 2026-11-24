// vibeflow-probe: vibeflow-agnostico-release1220
// Audit probes for the 1.22.0 release (vibeflow-agnostico, the cut): a rule of
// CHANGELOG.md's content that the release probes before this one do not hold.
// Already held elsewhere, and not repeated here: entry order and one entry per
// version and the [#N] links (release-1210.probes), the CLI version the newest
// entry names (release-1201.probes), the newest entry's version against every
// manifest (vibeflow-leitura-4.probes). Each probe runs its check on the file
// and on a copy with the regression it guards against, so it shows it bites
// without touching the tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const changelog = () => readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');

// A path on the machine that wrote the text: a home folder with a real name in
// it (macOS, Linux, Windows), or this repository's measurement workspace,
// `.vibeflow/aceite/`, which git ignores. A placeholder home (`/Users/<you>/`,
// `/home/{user}/`, `$HOME`, `~/`) and the product's own `.vibeflow/` folders
// (`.vibeflow/audits/`, `.vibeflow/index.md`) are not.
const HOME = /(?:^|[^\w.~$-])((?:\/Users|\/home)\/(?![<{$])[^\s/`'")\]]+\/|[A-Za-z]:[\\/]Users[\\/](?![<{$])[^\s\\/`'")\]]+[\\/])/g;
const WORKSPACE = /\.vibeflow\/aceite\b/g;

function machinePaths(text) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(HOME)) found.push(`line ${i + 1}: ${m[1]}`);
    for (const m of line.matchAll(WORKSPACE)) found.push(`line ${i + 1}: ${m[0]}`);
  });
  return found;
}

// The text with one line added to the newest entry, right under its heading.
function withLineInNewestEntry(text, line) {
  return text.replace(/^(### v\d+\.\d+\.\d+[^\n]*\n)/m, (_, heading) => `${heading}\n${line}\n`);
}

// Contract: CHANGELOG.md is published as it is (the sync workflow copies it to
// the public vibeflow-claude mirror, and each release's notes come from its
// entry), so it names no path of the machine that wrote it: no home folder with
// a user name and no `.vibeflow/aceite/` measurement folder, which git ignores
// and no reader has (the part 2b fix round 3 of this front took that folder out
// of every versioned file).
// Breaks when: a cut writes the entry's measurement paragraph from the meter's
// summary, whose header line reads "texto sob teste: /Users/<name>/.../SKILL-1.20.0.md",
// or names the measured case's folder as the source of a number
// (".vibeflow/aceite/medicao/tech/corte-r6/").
// Not covered by: release-1201, release-1210 and vibeflow-leitura-4 read only
// versions, dates and [#N] links; the "absolute machine path" check of
// test/loop-principles.test.mjs reads the kit's text, never CHANGELOG.md; and
// the cut's own criteria compare the entry with the ready file byte for byte,
// so a path in the ready file goes through.
test('CHANGELOG.md names no path of the machine that wrote it', () => {
  const text = changelog();
  assert.ok(/^### v\d+\.\d+\.\d+/m.test(text), 'CHANGELOG.md has no "### vX.Y.Z" entry');
  assert.deepEqual(machinePaths(text), []);

  // The check bites, on each form, in the newest entry.
  const regressions = [
    '* texto sob teste: `/Users/someone/Projects/vibeflow/SKILL-1.20.0.md`',
    'Measured from /home/runner/work/vibeflow/measure.json.',
    'Read `C:\\Users\\dev\\vibeflow\\report.md`.',
    'Lots in `C:/Users/dev/vibeflow/lots/`.',
    'Source: `.vibeflow/aceite/medicao/tech/corte-r6/resumo.md`.',
  ];
  for (const line of regressions) {
    assert.ok(machinePaths(withLineInNewestEntry(text, line)).length > 0, `a machine path went unnoticed: ${line}`);
  }

  // Controls: the product's paths and placeholder homes are not machine paths.
  const controls = [
    'Saves to `.vibeflow/audits/<slug>-audit.md` and reads `.vibeflow/index.md`.',
    'Installs to `~/.claude/plugins/` or `$HOME/.config/vibeflow/`.',
    'For example `/Users/<you>/project` or `/home/{user}/project`.',
    'A probe at `tests/audit/cart-p1.test.ts` and `src/Users/list.ts`.',
  ];
  for (const line of controls) {
    assert.deepEqual(machinePaths(line), [], `a product path was reported: ${line}`);
  }
});

// ------------------------------------------------------------------------------------------
// check-probes.mjs and the marker quoted in prose. The 1.22.0 entry writes the marker as
// "a `vibeflow-probe:` marker"; the script's MARKED pattern takes any character after the
// colon but space, `<` and `{`, so the closing backtick reads as a probe name and
// CHANGELOG.md is read as a probe (`check-probes.mjs <repo> --base afc2aed` on the cut:
// "2 probe file(s) read", CHANGELOG.md among them, 11 of its lines flagged).

const MARK = ['vibeflow', 'probe:'].join('-');
const CHECK_PROBES = join(ROOT, 'plugins/vibeflow/skills/implement/loop/scripts/check-probes.mjs');
const CANARY = "canary('src/rules.ts:42')";

function cleanEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

// Runs check-probes without --dir on a new repository holding the given files, untracked.
function probesRead(files) {
  const repo = mkdtempSync(join(tmpdir(), 'release-1220-probe-'));
  try {
    const init = spawnSync('git', ['init', '-q'], { cwd: repo, env: cleanEnv(), encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(repo, dirname(path)), { recursive: true });
      writeFileSync(join(repo, path), text);
    }
    const run = spawnSync(process.execPath, [CHECK_PROBES, repo], { cwd: repo, env: cleanEnv(), encoding: 'utf8' });
    const read = (path) => new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\d+ \\[`, 'm').test(run.stdout);
    return { read, out: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

// Contract: the loop README ("check-probes.mjs in detail") and the script's own header: the
// probes are the files that carry the marker "with a name after it (not a template in angle
// brackets or braces)"; a document that quotes the marker is not a probe.
// Breaks when: a document, a changelog or a README names the marker in inline code, so the
// closing backtick (or a quote) right after the colon counts as a name, and check-probes reads
// that document as a probe and flags its lines as state; the 1.22.0 entry does this to
// CHANGELOG.md, so every cut of this repository that touches the entry gets it flagged.
// Not covered by: test/loop-probes-any-language.test.mjs quotes the marker only with its
// template (`<feature>-<part>`), which the pattern already leaves out.
// Open finding A5 of the 1.22.0 cut audit (marker quoted in backticks read as a probe): the
// assertion on CHANGELOG-like prose fails today, hence `todo`; run once unmarked on 24/11/2026,
// it failed with "a document quoting the marker in backticks was read as a probe".
test('check-probes does not read a document that quotes the marker in inline code as a probe', { todo: 'A5: marker quoted in backticks is read as a probe (check-probes.mjs MARKED)' }, () => {
  const { read, out } = probesRead({
    'tests/test_billing_p1_probes.py': `# ${MARK} billing-p1\n${CANARY}\n`,
    'docs/CHANGELOG.md': `A probe carries a \`${MARK}\` marker on its first lines.\n${CANARY}\n`,
    'docs/quoted.md': `The marker is "${MARK}" followed by the part.\n${CANARY}\n`,
  });
  // Control: a real probe is still read.
  assert.ok(read('tests/test_billing_p1_probes.py'), `a marked probe went unread:\n${out}`);
  assert.ok(!read('docs/CHANGELOG.md'), `a document quoting the marker in backticks was read as a probe:\n${out}`);
  assert.ok(!read('docs/quoted.md'), `a document quoting the marker in quotes was read as a probe:\n${out}`);
});
