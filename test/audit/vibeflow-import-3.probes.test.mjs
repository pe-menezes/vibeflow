// Audit probes for the consumers of `teach --from` (gen-spec, analyze, audit).
// The contract tests in test/import-consumers-contracts.test.mjs pin that each
// rule is present; these probes pin that no other sentence in the same file
// contradicts it, which is how a skill read by a model regresses in practice:
// the rule stays, and a sentence elsewhere tells the model the opposite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function editions(workflow) {
  return {
    shared: `plugins/vibeflow/skills/${workflow}/SKILL.md`,
    cursor: `cursor/skills/vibeflow-${workflow}/SKILL.md`,
    copilot: `copilot/github/prompts/vibeflow-${workflow}.prompt.md`,
  };
}

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');

// Sentences of the flattened text. A period inside a path or a file name
// (`index.md`, `.vibeflow/`) is not followed by a space, so it does not split.
function sentences(text) {
  return flat(text).split(/(?<=[.!?])\s+/);
}

// The paragraph that starts with a given literal, up to the next blank line.
function paragraph(content, start) {
  const at = content.indexOf(start);
  if (at === -1) return '';
  const end = content.indexOf('\n\n', at);
  return content.slice(at, end === -1 ? undefined : end);
}

function between(content, from, to) {
  const start = content.indexOf(from);
  if (start === -1) return '';
  const end = content.indexOf(to, start + from.length);
  return end === -1 ? content.slice(start) : content.slice(start, end);
}

// Verbs that write to, drop or replace a document.
const WRITES = /\b(delet|remov|wip|eras|clear|discard|overwrit|rewrit|replac|regenerat|rebuil|enrich|add|updat)\w*/i;
// Verbs that drop what is on disk.
const DROPS = /\b(delet|remov|wip|eras|clear|discard|ignor|overwrit)\w*/i;

test('analyze: no sentence tells a run to write into the imported folders', () => {
  for (const [edition, path] of Object.entries(editions('analyze'))) {
    for (const s of sentences(read(path))) {
      if (!s.includes('patterns/external-')) continue;
      assert.doesNotMatch(s, WRITES, `${edition}/analyze: a sentence writes into patterns/external-*/: "${s}"`);
    }
  }
});

test('analyze: no sentence about --fresh drops what is already in .vibeflow/', () => {
  for (const [edition, path] of Object.entries(editions('analyze'))) {
    for (const s of sentences(read(path))) {
      if (!/--fresh|fresh run/i.test(s)) continue;
      assert.doesNotMatch(s, DROPS, `${edition}/analyze: a --fresh sentence drops existing docs: "${s}"`);
    }
  }
});

test('gen-spec: no sentence puts imported entries inside the 3–5 cut', () => {
  for (const [edition, path] of Object.entries(editions('gen-spec'))) {
    for (const s of sentences(read(path))) {
      if (!/3[–-]5/.test(s) || !/import/i.test(s)) continue;
      assert.match(s, /outside the 3[–-]5 cut/i, `${edition}/gen-spec: imported entries inside the cut: "${s}"`);
    }
  }
});

// Satellite docs live in patterns/satellite-<name>/, and the satellite report
// tells the user to run gen-spec because they "are now available". gen-spec
// picks local patterns from the Pattern Registry, so either the registry
// covers patterns/satellite-*/ or the report stops promising gen-spec.
test('analyze: the satellite report promises gen-spec only if the registry carries satellite docs', () => {
  for (const [edition, path] of Object.entries(editions('analyze'))) {
    const raw = read(path);
    const satellite = flat(between(raw, '## Satellite analysis mode', '\n---'));
    assert.ok(satellite, `${edition}/analyze: satellite section`);
    const promises = /gen-spec[^"]*are now available/.test(satellite);
    const registry = flat(paragraph(raw, '**Pattern Registry generation.**'));
    assert.ok(registry, `${edition}/analyze: Pattern Registry generation paragraph`);
    const carries = /patterns\/satellite-/.test(registry);
    assert.ok(!promises || carries,
      `${edition}/analyze: the satellite report says its docs are available to gen-spec, `
      + 'but the Pattern Registry is built without patterns/satellite-*/');
  }
});
