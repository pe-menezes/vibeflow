// Behavior probes from the independent audit of part p1 of vibeflow-consertos-l2: the Critical
// Gate override travels from an audit report to the PR body the loop writes, and from there to an
// audit of the PR run without the author's spec. Step 4c of that audit resolves a CRITICAL or HIGH
// finding only when the PR body (or the spec, or a comment near the line) contains
// `vibeflow:allow <RULE_ID>: <reason>`. Each case states, as comments, the contract it protects,
// the plausible regression that breaks it and why the implementer's tests miss it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const EDITIONS = {
  shared: 'plugins/vibeflow/skills/audit/SKILL.md',
  cursor: 'cursor/skills/vibeflow-audit/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-audit.prompt.md',
};
const PR_BODY = 'plugins/vibeflow/skills/implement/loop/pr-body.md';
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The override form as step 4c declares it, turned into a reader: what an audit of the PR does
// with the PR body. Rule IDs follow the catalog's shape, letters and digits (K8S101 included).
function overrideReader(raw) {
  const from = raw.indexOf('c. **Honor overrides.**');
  const to = raw.indexOf('d. **Map findings', from);
  assert.ok(from !== -1 && to !== -1, 'step 4c is there');
  const form = /`(vibeflow:allow <RULE_ID>: <reason>)`/.exec(flat(raw.slice(from, to)))?.[1];
  assert.ok(form, 'step 4c declares the override form');
  const source = escape(form)
    .replace(escape('<RULE_ID>'), '([A-Z][A-Z0-9]*[0-9])')
    .replace(escape('<reason>'), '([^\\n]*)');
  return (text) => {
    const allowed = new Map();
    for (const match of text.matchAll(new RegExp(source, 'g'))) {
      if (match[2].trim()) allowed.set(match[1], match[2].trim());
    }
    return allowed;
  };
}

// The lines of the report template's Critical Gate section.
function reportGateLines(raw) {
  const at = raw.indexOf('## Output format');
  const fence = /```[^\n]*\n([\s\S]*?)\n```/.exec(raw.slice(at))?.[1] ?? '';
  const gate = /### Critical Gate\n([\s\S]*?)\n### Findings/.exec(fence)?.[1];
  assert.ok(gate, 'the report template has its Critical Gate section');
  return gate.split('\n');
}

// The PR body template's Critical Gate section, without its source comment.
function prBodyGate() {
  const fence = /```markdown\n([\s\S]*?)\n```/.exec(read(PR_BODY))?.[1] ?? '';
  const section = /## Critical Gate\n([\s\S]*?)\n## /.exec(fence)?.[1];
  assert.ok(section, 'pr-body.md has a Critical Gate section');
  const comment = /<!--([\s\S]*?)-->/.exec(section)?.[1] ?? '';
  return { comment: flat(comment), body: flat(section.replace(/<!--[\s\S]*?-->/, '')) };
}

// Contract: the line a model fills in the PR body's Critical Gate section asks for the report's
// Critical Gate lines word for word, so the `ALLOWED` line reaches the PR with its marker.
// Breaks when: the placeholder goes back to a summary ("each finding with its ID, severity and how
// it was resolved", the text before this part) while the opening paragraph keeps its sentence; a
// model filling the section follows the placeholder in front of it and writes "DS104 HIGH, allowed
// by the spec", which no step 4c reads as an override.
// Not covered by: critical-gate-override.test.mjs joins the opening paragraph and the section
// before looking for "word for word", so the opening sentence alone satisfies it; the sabotage that
// put the summary back in the placeholder survived that file and the company-mode tests.
test('pr-body.md: the Critical Gate placeholder itself asks for the report lines word for word', () => {
  const { body } = prBodyGate();
  assert.match(body, /word for word/, `the placeholder line asks for a copy, not a summary: ${body}`);
  assert.match(body, /Critical Gate/, `the placeholder line says what it copies, the report's Critical Gate lines: ${body}`);
});

// Contract: copying every line of the report's Critical Gate section into the PR body resolves, for
// an audit of the PR without the author's spec, exactly the findings the report allowed: the
// ALLOWED line yields its own rule ID with a reason, and no line that blocks (CRITICAL, HIGH,
// WARNING) carries a marker that step 4c would read as an override.
// Breaks when: a blocking line of the template gains a hint such as "needs vibeflow:allow SEC101:
// <reason>" or the WARNING line shows how to silence it; the PR body copies it word for word and the
// audit of the PR skips the very finding the report blocked. Also breaks when the ALLOWED line's
// marker drifts from the step 4c form in one edition.
// Not covered by: critical-gate-override.test.mjs reads only the lines with ALLOWED; nothing checks
// that the other lines of the section, now copied into the PR body, stay free of the marker.
for (const [edition, path] of Object.entries(EDITIONS)) {
  test(`${edition}: the report's Critical Gate lines, copied into a PR body, resolve only the ALLOWED findings`, () => {
    const raw = read(path);
    const reader = overrideReader(raw);
    const lines = reportGateLines(raw);
    const ruleOf = (line) => /\[([A-Z][A-Z0-9]*[0-9])\]/.exec(line)?.[1];
    const allowed = lines.filter((line) => /\bALLOWED\b/.test(line)).map(ruleOf);
    const blocking = lines.filter((line) => /\b(CRITICAL|HIGH|WARNING)\b/.test(line) && !/\bALLOWED\b/.test(line)).map(ruleOf);
    assert.ok(allowed.length > 0 && allowed.every(Boolean), `${edition}: the template shows an ALLOWED line with its rule`);
    assert.ok(blocking.length > 0 && blocking.every(Boolean), `${edition}: the template shows blocking lines with their rules`);
    // The loop fills <reason> the way the verdict rule says, for a finding the spec documents.
    const filled = lines.map((line) => line.replace('<reason>', 'the spec documents this drop as intentional, because the column moved to accounts.email'));
    const prBody = `## Critical Gate\n\n${filled.map((line) => `- p1: ${line}`).join('\n')}\n`;
    const resolved = reader(prBody);
    for (const rule of allowed) assert.ok(resolved.get(rule), `${edition}: the PR body resolves the allowed ${rule}`);
    for (const rule of blocking) assert.equal(resolved.has(rule), false, `${edition}: the PR body does not resolve the blocked ${rule}`);
    assert.deepEqual([...resolved.keys()].sort(), [...new Set(allowed)].sort(), `${edition}: only the allowed rules resolve`);
  });
}

// Contract (I1 of the spec): the PR body carries the marker of every finding a part's audit
// allowed, so an audit of the PR without the author's spec resolves it. A part that went through a
// fix round ends on a re-audit report, and the re-audit runs the Critical Gate on the fix diff only
// ("The Critical Gate runs on the fix diff."), so its Critical Gate section never holds the ALLOWED
// line of a finding that sits in the part's first diff. The path holds only if the PR body takes the
// Critical Gate lines from the part's audit report too (not from its last report alone), or if the
// re-audit carries the ALLOWED lines of the report it answers into its own Critical Gate section.
// Breaks when: as of 40bae2e, pr-body.md takes the section from "each part's last report" and the
// re-audit says nothing about ALLOWED lines; a part with an allowed HIGH and one fix round reaches
// the PR as "Critical Gate clean", and the audit of the PR fails the HIGH (case [68] again).
// Not covered by: critical-gate-override.test.mjs checks the template line and the copy rule, never
// which report the copy comes from; no test walks a part with a fix round to the PR body.
test('a part with a fix round: the ALLOWED line of its audit still reaches the PR body', () => {
  const pr = read(PR_BODY);
  const { comment } = prBodyGate();
  const intro = flat(pr.slice(0, pr.indexOf('```markdown')));
  const gateSentence = /[^.]*Critical Gate lines[^.]*\./.exec(intro)?.[0] ?? '';
  const sources = `${comment} ${gateSentence}`;
  // The copy reaches the first audit when its source names every report of the part, or the
  // part's audit report itself (an "audit report" that is not a "re-audit report").
  const namesFirstAudit = /\b(every|all)\b[^.]*\breports?\b/.test(sources) || /(?<!re-)\baudit report/.test(sources);
  for (const [edition, path] of Object.entries(EDITIONS)) {
    const raw = read(path);
    const reaudit = raw.slice(raw.indexOf('## Re-audit mode'), raw.indexOf('## Consolidation mode'));
    assert.ok(reaudit.length > 0, `${edition}: the re-audit mode section is there`);
    assert.match(reaudit, /Critical Gate runs on the fix diff/, `${edition}: premise of this probe, the re-audit's Critical Gate reads the fix diff`);
    const reauditCarries = /\bALLOWED\b/.test(reaudit);
    assert.ok(namesFirstAudit || reauditCarries,
      `${edition}: the PR body takes the Critical Gate from the last report only (${sources.trim()}) and the re-audit does not carry the ALLOWED lines, so a part with a fix round loses its marker`);
  }
});

// Re-audit 1 probe.
// Contract (A1 fix): the placeholder line a model fills in the PR body's Critical Gate section, the
// line left once the source comment is deleted, asks itself for the ALLOWED lines of the part's
// earlier reports, and offers "Critical Gate clean" only when there is nothing to copy. A part with
// a fix round has a clean last report and its ALLOWED line in the audit report; a placeholder that
// asks for the last report alone, or that offers "clean" first with no condition, lets the model
// write "p1: Critical Gate clean" and the marker never reaches the PR.
// Breaks when: the placeholder goes back to "Critical Gate clean, or each line of the report's
// Critical Gate section, word for word" while the opening and the comment keep the fix (sabotage
// S10 of the re-audit), or keeps both sources but puts an unconditioned "Critical Gate clean" first
// (S11).
// Not covered by: the A1 probe reads the comment and the opening sentence, either of which names
// the earlier reports; the placeholder probe asks only for "word for word"; the implementer's
// pr-body test joins the opening and the section. S10 and S11 survived all of them.
test('pr-body.md: the Critical Gate placeholder itself asks for the earlier ALLOWED lines, and clean only when nothing is left to copy', () => {
  const { body } = prBodyGate();
  assert.match(body, /\bALLOWED\b/, `the placeholder asks for the ALLOWED lines: ${body}`);
  assert.match(body, /\b(earlier|previous|every)\b[^.]*\breports?\b|(?<!re-)\baudit report/,
    `the placeholder names the part's earlier reports, not the last one alone: ${body}`);
  if (/\bclean\b/i.test(body)) {
    assert.match(body, /\bclean\b[^,.]*\b(when|if)\b|\bonly (when|if)\b[^.]*\bclean\b/i,
      `the placeholder offers "clean" only when there is nothing to copy: ${body}`);
  }
});
