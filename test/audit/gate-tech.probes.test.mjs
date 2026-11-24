// Behavior probes from the independent audit of the gate-tech fixture (part 2b-1 of the
// language-agnostic work): make.mjs writing into its destination, and what a planted case and a
// control of the matrix are. Behavior only, pinned by content. Each case states, as comments, the
// contract it protects, the plausible regression that breaks it, and why the implementer's tests
// did not catch it. A case marked `todo` asserts what an open finding of the audit asks for: it
// runs and prints without failing the suite.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOG_TECH_1_20, buildFixture, expandCases } from '../fixtures/gate-tech/matrix.mjs';
import { matchFinding, measure } from '../fixtures/gate-languages/measure.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const MAKE = join(ROOT, 'test/fixtures/gate-tech/make.mjs');

const scratch = [];
function tempDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `vibeflow-gate-tech-probe-${label}-`));
  scratch.push(dir);
  return dir;
}
after(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

// Every node call of these probes runs without the GIT_* variables the caller may carry (a hook or
// a pre-commit would point git at the wrong repository).
function cleanEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}
const runMake = (dest) => spawnSync(process.execPath, [MAKE, dest], { encoding: 'utf8', env: cleanEnv() });

const cases = expandCases();
const snippetOf = (c) => c.snippet.join('\n');

// --- make.mjs: the destination (the risk code of the part) ---------------------------------------

// Contract: the gate-tech make.mjs refuses a destination that is a symbolic link to a directory
// with content, and writes nothing into the target (spec part 2b-1, criterion 1: a destination
// that exists and is not empty is refused, nothing deleted; the header of make.mjs).
// Breaks when: gate-tech/make.mjs stops delegating to the gate-languages builder and gets its own
// guard that reads the link with `lstatSync`, so the link passes and `repo/` and `manifest.json`
// land in the target. The part 1 probe on this path calls gate-languages/make.mjs, not this entry.
// Not covered by: test/gate-tech-fixture.test.mjs tries a non-empty directory and a file, never a
// link.
test('gate-tech make.mjs: a symbolic link to a non-empty directory is refused, and the target is untouched', () => {
  const parent = tempDir('link');
  const target = join(parent, 'target');
  mkdirSync(target);
  writeFileSync(join(target, 'keep.txt'), 'keep me\n');
  const link = join(parent, 'link');
  symlinkSync(target, link, 'dir');
  const result = runMake(link);
  assert.notEqual(result.status, 0, 'make.mjs wrote through a link to a non-empty directory');
  assert.deepEqual(readdirSync(target), ['keep.txt']);
  assert.equal(readFileSync(join(target, 'keep.txt'), 'utf8'), 'keep me\n');
});

// Contract: a directory with a single entry is not empty. A destination holding only a
// `manifest.json` from an earlier measurement is refused and the file keeps its content.
// Breaks when: the emptiness test drifts to "more than one entry" (`length > 1`), or to "has a
// `repo/`", and the earlier manifest is overwritten by the new one.
// Not covered by: the implementer's non-empty destination holds two entries (`keep.txt` and
// `repo/`), so a `> 1` guard still refuses it (sabotage S2 of this audit survived that file).
test('gate-tech make.mjs: a destination holding only a manifest.json is refused, and the file keeps its content', () => {
  const dest = tempDir('one');
  writeFileSync(join(dest, 'manifest.json'), '{"measured": "earlier"}\n');
  const result = runMake(dest);
  assert.notEqual(result.status, 0, 'make.mjs accepted a directory with one entry');
  assert.deepEqual(readdirSync(dest), ['manifest.json']);
  assert.equal(readFileSync(join(dest, 'manifest.json'), 'utf8'), '{"measured": "earlier"}\n');
});

// --- the meter reads a finding of every rule the fixture plants -----------------------------------

// Contract: the meter reads a finding line of every rule of CATALOG_TECH_1_20, in the output form
// of the audit (spec part 2b-1: the meter learns what the new fixture needs; part 1, criterion 5:
// it reads every form of a finding line). One finding per rule, on a planted case of that rule,
// detects it.
// Breaks when: the rule id pattern of measure.mjs takes letters then digits only
// (`[A-Z]+[0-9]+`), so `[K8S101]` falls in `unparsed` and the six Kubernetes rules read 0 of 26.
// Not covered by: the implementer's gate-tech meter test takes the first control and a terraform
// case, never a Kubernetes id.
test('the meter detects a planted case of every rule of the four domains from its finding line', () => {
  const lines = ['### Critical Gate'];
  const wanted = [];
  for (const rule of Object.keys(CATALOG_TECH_1_20.rules)) {
    const c = cases.find((x) => x.kind === 'planted' && x.rule === rule && x.language !== 'regression');
    wanted.push(c.id);
    lines.push(`- 🟠 HIGH [${rule}] ${c.path}:${c.line} — the behaviour`);
  }
  const report = measure(cases, [{ path: 'r.md', text: `${lines.join('\n')}\n` }]).reports[0];
  assert.deepEqual(report.section.unparsed, []);
  assert.deepEqual([...report.detectedIds].sort(), wanted.sort());
});

// --- the cases: a planted case is the behaviour of its rule, a control is no rule's behaviour ----

// Contract: a planted DS103 case empties a table the way TRUNCATE does (spec part 2b-1: the
// planted case is the behaviour of the rule; DS103 is `TRUNCATE`, DS106 is `DELETE FROM` with no
// `WHERE`). A row delete through SQL, an ORM or a changelog is DS106 (and DAT101): a model that
// names DS106 there is right and the meter counts it as "other rule", a miss of DS103.
// Breaks when: a row delete is filed under DS103 to fill its quadrant without the trigger word.
// Not covered by: the implementer's tests check the labels by function and the kinds of the
// regression table, never what the line of a planted case does.
test('a planted DS103 case does not delete rows one statement at a time', () => {
  const rowDelete = /\.delete\(\)|\bDELETE\s+FROM\b|<delete\b|\bdelete_all\b|\bdestroy_all\b|\bdeleteMany\b/i;
  const wrong = cases.filter((c) => c.kind === 'planted' && c.rule === 'DS103' && rowDelete.test(snippetOf(c))).map((c) => c.id);
  assert.deepEqual(wrong, []);
});

// Contract: a control is a legitimate line that no rule fires on (spec part 2b-1, "Controles": a
// finding there is a false positive). A SQL `DELETE` with a range condition removes every row
// older than a date, which the regression table of the same spec expects flagged as DAT101
// (`DELETE FROM messages WHERE created_at < $1`, planted). A SQL delete in a control names one row
// by its key, like the spec's own example (`DELETE FROM ... WHERE id = $1`).
// Breaks when: a mass delete with a filter is written as the control of another rule, and a right
// DAT101 finding on it is counted by the meter as a control flagged.
// Not covered by: the implementer's tests check that each rule has a control, never what the
// control line does under the other rules.
test('a control that deletes rows in SQL names one row by its key', () => {
  const byKey = /\bWHERE\s+\w+\s*=\s*(\$\d+|%s|\?|:\w+)/i;
  const wrong = cases.filter((c) => c.kind === 'control' && /\bDELETE\s+FROM\b/i.test(c.text) && !byKey.test(c.text)).map((c) => c.id);
  assert.deepEqual(wrong, []);
  // The meter side of the same contract: a DAT101 finding on such a line would be a control flagged.
  for (const id of wrong) {
    const c = cases.find((x) => x.id === id);
    const outcome = matchFinding({ rule: 'DAT101', path: c.path, line: c.line, lineEnd: null, severity: 'CRITICAL' }, cases).outcome;
    assert.notEqual(outcome, 'control', `${id}: a DAT101 finding there counts as a control flagged`);
  }
});

// Contract: a planted CFG105 case takes a timeout away (spec part 2b-1 reads CFG105 as removing a
// timeout; the 1.20.0 trigger says why: hung connections). Removing a setting whose value is the
// documented default of its tool changes nothing at run time. Oracle, from each tool's
// documentation: HikariCP `connectionTimeout` defaults to 30000 ms; PHP `max_execution_time`
// defaults to 30 s; nginx `proxy_read_timeout` defaults to 60 s.
// Breaks when: a removal of a value equal to the default is planted as the behaviour, and a model
// that reads it as a no-op is counted as a miss.
// Not covered by: the implementer's tests check the removed side and the labels, never the value.
test('a planted CFG105 case does not remove a timeout set to the default of its tool', () => {
  const defaults = [/\bconnection-timeout:\s*30000\b/i, /\bconnectionTimeout\s*[:=]\s*30000\b/, /\bmax_execution_time\s*=\s*30\b/, /\bproxy_read_timeout\s+60s?\s*;/];
  const wrong = cases.filter((c) => c.kind === 'planted' && c.rule === 'CFG105' && defaults.some((re) => re.test(snippetOf(c)))).map((c) => c.id);
  assert.deepEqual(wrong, []);
});

// Contract: a planted DS105 case drops a part of a table that is not a column (spec part 2b-1:
// DS104 drops a column, DS105 a part of a table). A line that also drops a column is DS104 as much
// as DS105, and a right `[DS104]` on it is counted by the meter as "other rule", a miss of DS105.
// Breaks when: a column drop (Rails `remove_reference`, which takes `customer_id` with it) is filed
// under DS105 to fill its quadrant without the trigger word.
// Not covered by: the implementer's tests check the labels and the quadrants, never what the line
// drops.
test('a planted DS105 case does not drop a column', () => {
  const dropsColumn = /\bremove_reference\b|\bremove_column\b|\bremove_belongs_to\b|\bDROP\s+COLUMN\b|\bRemoveField\b|<dropColumn\b/i;
  const wrong = cases.filter((c) => c.kind === 'planted' && c.rule === 'DS105' && dropsColumn.test(snippetOf(c))).map((c) => c.id);
  assert.deepEqual(wrong, []);
});

// Contract: a line of the section that cites `<path>:<line>` of a case and is not a finding makes
// that case mentioned (the header of measure.mjs), for every file the fixture has. The gate-tech
// fixture has cases in files with no extension (`Dockerfile`).
// Breaks when: the citation pattern requires an extension (`\.\w+` before `:<line>`), so a
// Dockerfile cited in a note is never mentioned while the same note on a `.yml` is.
// Not covered by: the implementer's tests cite only paths with an extension.
test('a note citing a Dockerfile line of a case makes that case mentioned', () => {
  const control = cases.find((c) => c.kind === 'control' && c.extension === '');
  const text = `### Critical Gate\nClean.\nLooked at ${control.path}:${control.line}: not a finding.\n`;
  const report = measure(cases, [{ path: 'r.md', text }]).reports[0];
  assert.deepEqual(report.mentioned.ids, [control.id]);
});

// --- reaudit 1 of part 2b-1 ----------------------------------------------------------------------

// Contract: a planted IAC104 case takes away a protection, and its removal opens access (spec part
// 2b-1: IAC104 takes a firewall or network rule out; conserto 1: the cases are "the removal of a
// protection", and a change that does not open access leaves the matrix). A deny rule protects only
// where something else lets the traffic in: a custom AWS network ACL with no allow entry denies
// everything by its final `*` rule, and a GCP network with no allow rule denies all ingress by its
// implied rule. Removing the only deny of such a file changes nothing at run time, and a model that
// reads it so is counted as a miss, as with the CFG105 defaults of A3.
// Breaks when: a deny rule is planted in a file with no allow rule (the CloudFormation and Pulumi
// cases of conserto 1, and the GCP firewall case of the part), and the `why` says the traffic is no
// longer blocked.
// Not covered by: the implementer's tests check the removed side, the labels and the quadrants of
// IAC104, never what the rest of the file allows; the A3 probe looks only at CFG105.
test('a planted IAC104 case that removes a deny rule sits in a file that otherwise allows the traffic', { todo: 'reaudit 1 p2b1 N1: the deny rules removed in cloudformation, pulumi and the GCP firewall have no allow rule beside them' }, () => {
  const { base } = buildFixture();
  const denies = cases.filter((c) => c.kind === 'planted' && c.rule === 'IAC104' && /\bdeny\b/i.test(snippetOf(c)));
  assert.ok(denies.length >= 1, 'the matrix plants at least one removed deny rule');
  const wrong = denies.filter((c) => {
    const rest = base[c.path].split('\n').filter((line) => !c.snippet.includes(line)).join('\n');
    return !/\ballow\b/i.test(rest);
  }).map((c) => c.id);
  assert.deepEqual(wrong, []);
});
