// Contracts of the 1.16 spec hardening (part 5): gen-spec, discover and
// analyze carry the same new rules in every edition. Each assertion pins a
// literal the loop or the audit reads (a heading, a marker, a limit), so a
// weaker wording in one edition fails here instead of drifting silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function editions(workflow) {
  return {
    shared: `plugins/vibeflow/skills/${workflow}/SKILL.md`,
    cursor: `cursor/skills/vibeflow-${workflow}/SKILL.md`,
    copilot: `copilot/github/prompts/vibeflow-${workflow}.prompt.md`,
  };
}

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

// The text under a Markdown heading, up to the next heading of the same or a
// higher level. Empty when the heading is absent.
function section(content, heading) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return '';
  const level = /^#+/.exec(heading)[0].length;
  const end = lines.findIndex(
    (line, i) => i > start && new RegExp(`^#{1,${level}}\\s`).test(line),
  );
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

// The first fenced block after a heading.
function fenceAfter(content, heading) {
  const at = content.indexOf(heading);
  if (at === -1) return '';
  const match = /```[^\n]*\n([\s\S]*?)\n```/.exec(content.slice(at));
  return match ? match[1] : '';
}

// Prompts wrap prose at ~80 columns, so phrase contracts run on a copy with
// every run of whitespace collapsed to one space; structure checks (sections,
// fences, order) use the raw text.
const flat = (text) => text.replace(/\s+/g, ' ');

function forEachEdition(workflow, run) {
  for (const [edition, path] of Object.entries(editions(workflow))) {
    const raw = read(path);
    run(flat(raw), `${edition}/${workflow}`, raw);
  }
}

test('gen-spec records clarifications and caps open markers', () => {
  forEachEdition('gen-spec', (content, label) => {
    assert.match(content, /## Clarifications/, `${label}: Clarifications section`);
    assert.match(content, /at most 5 questions per session/i, `${label}: 5-question cap`);
    assert.match(content, /carr(y|ies|ied)[^.]*`## Clarifications`[^.]*PRD|PRD[^.]*`## Clarifications`[^.]*carr(y|ies|ied)/i,
      `${label}: carries PRD clarifications`);
    assert.match(content, /\[NEEDS CLARIFICATION: /, `${label}: marker literal`);
    assert.match(content, /at most 3 open/i, `${label}: 3-marker cap`);
    assert.match(content, /more than 3[^.]*ask[^.]*before saving/i, `${label}: more than 3 asks before saving`);
    assert.doesNotMatch(content, /flag it with a TODO/i, `${label}: TODO flag replaced by the marker`);
  });
});

test('gen-spec offers EARS scenarios and property checks as fields of a check', () => {
  forEachEdition('gen-spec', (content, label) => {
    assert.match(content, /`Scenarios:`/, `${label}: Scenarios field`);
    assert.match(content, /1 to 3/, `${label}: 1 to 3 scenario lines`);
    assert.match(content, /WHEN <condition> THE SYSTEM SHALL <behavior>/, `${label}: EARS form`);
    assert.match(content, /red test/i, `${label}: scenarios become the red test`);
    assert.match(content, /for any <input space>, <invariant>/, `${label}: property form`);
    assert.match(content, /oracle/i, `${label}: property names its oracle`);
    assert.match(content, /property-testing library/i, `${label}: properties only with a library`);
    assert.match(content, /never extra checks/i, `${label}: fields never count as checks`);
    assert.match(content, /3[–-]7 checks/i, `${label}: DoD stays 3–7`);
  });
});

test('gen-spec lists risk code inside Risks, in the four PRD categories', () => {
  forEachEdition('gen-spec', (content, label) => {
    assert.match(content, /`Risk code:`/, `${label}: Risk code field`);
    assert.match(content, /inside `## Risks`/, `${label}: Risk code lives inside Risks`);
    for (const category of [
      /money and totals/i,
      /credentials and permissions/i,
      /deleting or overwriting data/i,
      /date and time boundaries/i,
    ]) {
      assert.match(content, category, `${label}: risk category ${category}`);
    }
    assert.match(content, /sabotag/i, `${label}: the audit sabotages risk code`);
  });
});

test('gen-spec self-checks the draft before saving, one round of at most 2 questions', () => {
  forEachEdition('gen-spec', (content, label, raw) => {
    const selfCheck = flat(section(raw, '## Self-check'));
    assert.ok(selfCheck, `${label}: ## Self-check section`);
    assert.match(selfCheck, /binary/i, `${label}: every check binary`);
    assert.match(selfCheck, /functional check[^.]*names its test[^.]*`Scenarios:`/i,
      `${label}: functional check names its test or carries a scenario`);
    assert.match(selfCheck, /\[NEEDS CLARIFICATION\][^.]*count/i, `${label}: markers counted`);
    assert.match(selfCheck, /up to 2 targeted questions in one round/i, `${label}: 2 questions, one round`);
    assert.match(selfCheck, /PRD Validation Gate/, `${label}: same rhythm as the PRD gate`);

    const order = ['## Self-check', '## Spec splitting', 'Save the spec to'].map((s) => content.indexOf(s));
    assert.ok(order.every((i, k) => i !== -1 && (k === 0 || i > order[k - 1])),
      `${label}: self-check runs before splitting and saving`);

    const gate = flat(section(raw, '### PRD Validation Gate'));
    assert.match(gate, /Five checks before generating/, `${label}: PRD gate keeps its five checks`);
    assert.match(gate, /ask up to 2\s+targeted\s+questions about the failures/i, `${label}: PRD gate unchanged`);
  });
});

test('discover records the decisive questions under Clarifications in the PRD', () => {
  forEachEdition('discover', (content, label, raw) => {
    const template = fenceAfter(raw, '## PRD generation');
    assert.match(template, /^## Clarifications$/m, `${label}: PRD template has Clarifications`);
    assert.ok(template.indexOf('## Clarifications') < template.indexOf('## Open Questions'),
      `${label}: Clarifications before Open Questions`);
    assert.match(content, /decisive questions/i, `${label}: only the decisive questions`);
    assert.match(content, /gen-spec[^.]*carries them into the spec/i, `${label}: gen-spec carries them`);
  });
});

test('analyze writes tests and pitfalls into index.md inside the auto markers', () => {
  forEachEdition('analyze', (content, label, raw) => {
    const template = fenceAfter(raw, '### index.md format');
    const marks = ['<!-- vibeflow:auto:start -->', '## Tests', '## Pitfalls', '<!-- vibeflow:auto:end -->']
      .map((s) => template.indexOf(s));
    assert.ok(marks.every((i, k) => i !== -1 && (k === 0 || i > marks[k - 1])),
      `${label}: Tests and Pitfalls inside the auto markers of the index.md template`);
    assert.match(template, /Full suite:/, `${label}: full-suite command`);
    assert.match(template, /Affected only:/, `${label}: affected-tests command`);
    assert.match(template, /unmeasured/, `${label}: unmeasured when not run`);
    assert.match(template, /source:/, `${label}: each pitfall carries its source`);

    assert.match(content, /by file, package or tag/i, `${label}: affected tests by file, package or tag`);
    assert.match(content, /measured time/i, `${label}: measured time when run`);
    assert.match(content, /decisions\.md[^.]*CI configuration[^.]*(revert|fix)/i,
      `${label}: pitfall sources`);
    assert.match(raw, /\*\*index\.md\*\*[^\n]*Tests and Pitfalls[^\n]*(refresh|regenerat)/i,
      `${label}: incremental runs refresh the block`);
  });
});
