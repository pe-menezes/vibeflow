// The Critical Gate override travels from the audit report to the PR body and
// back to an audit: a finding the report allows has to carry the override in
// the form step 4c reads, or an audit of the PR, run without the author's spec,
// reads the finding as unresolved and fails it. These tests pin the structure
// of that path (the marker, the rule ID, a reason, the copy word for word),
// never a whole sentence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EDITIONS = {
  shared: 'plugins/vibeflow/skills/audit/SKILL.md',
  cursor: 'cursor/skills/vibeflow-audit/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-audit.prompt.md',
};
const PR_BODY = 'plugins/vibeflow/skills/implement/loop/pr-body.md';

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Step 4c of the Critical Gate, from its heading to step d.
function step4c(raw) {
  const from = raw.indexOf('c. **Honor overrides.**');
  const to = raw.indexOf('d. **Map findings to the verdict:**', from);
  assert.ok(from !== -1 && to !== -1, 'step 4c is there');
  return flat(raw.slice(from, to));
}

// The override form step 4c declares, as written there between backticks.
function declaredForm(raw) {
  const form = /`(vibeflow:allow <RULE_ID>: <reason>)`/.exec(step4c(raw))?.[1];
  assert.ok(form, 'step 4c declares the override form');
  return form;
}

// A rule ID of the catalog: a letter first, a digit last, digits allowed in
// between (DS104, SEC101, K8S101).
const RULE_ID = '[A-Z][A-Z0-9]*[0-9]';

// A matcher built from the declared form: the rule ID and the reason become
// groups, so the line is held to the form 4c reads and not to a copy of it.
function formMatcher(form) {
  const source = escape(form)
    .replace(escape('<RULE_ID>'), `(${RULE_ID})`)
    .replace(escape('<reason>'), '(.*)');
  return new RegExp(source);
}

// The rule an ALLOWED line names in brackets.
function bracketRule(line) {
  return new RegExp(`ALLOWED \\[(${RULE_ID})\\]`).exec(line)?.[1];
}

// The Critical Gate section of the report template under "## Output format".
function reportGate(raw) {
  const at = raw.indexOf('## Output format');
  assert.ok(at !== -1, 'the output format');
  const fence = /```[^\n]*\n([\s\S]*?)\n```/.exec(raw.slice(at))?.[1] ?? '';
  const gate = /### Critical Gate\n([\s\S]*?)\n### Findings/.exec(fence)?.[1];
  assert.ok(gate, 'the report template has its Critical Gate section');
  return gate;
}

function allowedLines(raw) {
  return reportGate(raw).split('\n').filter((line) => /\bALLOWED\b/.test(line));
}

// The text after the Critical Gate verdict rule, up to the next rule. Step 4
// stays as it is; the sentence on the override form lives in "## Verdict rules".
function afterVerdictRule(raw) {
  const start = raw.indexOf('- Any unresolved CRITICAL or HIGH Critical Gate finding');
  const anchor = 'written justification.';
  const from = raw.indexOf(anchor, start);
  const to = raw.indexOf('- A DoD check or pattern', from);
  assert.ok(start !== -1 && from !== -1 && to !== -1, 'the Critical Gate verdict rule, before the next rule');
  return flat(raw.slice(from + anchor.length, to));
}

for (const [edition, path] of Object.entries(EDITIONS)) {
  test(`${edition}: every ALLOWED line of the report template writes the override in the form step 4c reads`, () => {
    const raw = read(path);
    const matcher = formMatcher(declaredForm(raw));
    const lines = allowedLines(raw);
    assert.ok(lines.length > 0, `${edition}: the report template has at least one ALLOWED line`);
    for (const line of lines) {
      const bracket = bracketRule(line);
      assert.ok(bracket, `${edition}: the ALLOWED line names its rule in brackets: ${line}`);
      const marker = matcher.exec(line);
      assert.ok(marker, `${edition}: the ALLOWED line carries the step 4c form: ${line}`);
      assert.equal(marker[1], bracket, `${edition}: the marker's rule ID is the bracket's: ${line}`);
      assert.ok(marker[2].trim().length > 0, `${edition}: the marker carries a reason: ${line}`);
    }
  });

  test(`${edition}: a sentence says the ALLOWED line writes the marker and where its reason comes from`, () => {
    const raw = read(path);
    const form = declaredForm(raw);
    const text = afterVerdictRule(raw);
    assert.ok(text.includes('`ALLOWED`'), `${edition}: the sentence names the ALLOWED line`);
    assert.ok(text.includes(`\`${form}\``), `${edition}: the sentence gives the step 4c form`);
    assert.match(text, /step 4c/, `${edition}: the sentence ties the form to step 4c`);
    assert.match(text, /marker/, `${edition}: the reason can come from the marker`);
    assert.match(text, /spec documents/, `${edition}: or from the spec that documents the finding`);
    assert.match(text, /why/, `${edition}: and then the reason says why`);
    assert.ok(!text.includes('—'), `${edition}: the new text has no em dash`);
  });
}

test('the rule ID matcher takes a catalog rule with a digit in the middle (K8S101)', () => {
  const form = declaredForm(read(EDITIONS.shared));
  const line = '- ✅ ALLOWED [K8S101] deploy/app.yaml:3, privileged container, override: vibeflow:allow K8S101: the spec documents it';
  assert.equal(bracketRule(line), 'K8S101', 'the bracket matcher reads K8S101');
  assert.equal(formMatcher(form).exec(line)?.[1], 'K8S101', 'the marker matcher reads K8S101');
});

test('the ALLOWED lines and the sentence after the Critical Gate verdict rule read the same in the three editions', () => {
  const shared = read(EDITIONS.shared);
  for (const [edition, path] of Object.entries(EDITIONS)) {
    const raw = read(path);
    assert.deepEqual(allowedLines(raw), allowedLines(shared), `${edition}: the ALLOWED lines`);
    assert.equal(afterVerdictRule(raw), afterVerdictRule(shared), `${edition}: the sentence after the Critical Gate verdict rule`);
  }
});

test('pr-body.md: the Critical Gate lines of the report go word for word, and the marker is what an audit of the PR reads', () => {
  const raw = read(PR_BODY);
  const fence = /```markdown\n([\s\S]*?)\n```/.exec(raw)?.[1] ?? '';
  const section = /## Critical Gate\n([\s\S]*?)\n## /.exec(fence)?.[1];
  assert.ok(section, 'pr-body.md: the Critical Gate section of the template');
  const intro = flat(raw.slice(0, raw.indexOf('```markdown')));
  const text = flat(`${intro} ${section}`);
  const sentence = /[^.]*Critical Gate lines[^.]*word for word[^.]*\./.exec(text)?.[0];
  assert.ok(sentence, 'pr-body.md: the Critical Gate lines are copied word for word');
  assert.ok(text.includes('vibeflow:allow'), 'pr-body.md: names the marker');
  assert.match(text, /vibeflow:allow[^.]*audit[^.]*(PR|pull request)/, 'pr-body.md: the marker is what an audit of the PR reads');
  assert.ok(!sentence.includes('—'), 'pr-body.md: no em dash in the new sentence');
});
