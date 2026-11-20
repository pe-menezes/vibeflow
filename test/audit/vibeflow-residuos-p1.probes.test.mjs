// Behavior probes from the independent audit of vibeflow-residuos, part 1: the OpenCode command
// descriptions held equal to the Copilot prompt descriptions (B5), and the shared reader of the
// hosts that never substitute `${CLAUDE_SKILL_DIR}` (B7). Each case states, as comments, the
// contract it protects, the plausible regression that breaks it and why the implementer's tests
// did not catch it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neverSubstitutedHosts } from '../kit-path-hosts.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// The text a host shows for `description`: a single-line value without its quotes, or the
// content of a folded (`>`) or literal (`|`) block scalar, so two files that both use a block
// are compared by their text and not by the block indicator.
const descriptionText = (content, file) => {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
  assert.ok(frontmatter, `${file}: starts with YAML frontmatter`);
  const lines = frontmatter.split('\n');
  const at = lines.findIndex((line) => /^description:/.test(line));
  assert.notEqual(at, -1, `${file}: has a description`);
  const value = lines[at].replace(/^description:/, '').trim();
  if (/^[>|][+-]?$/.test(value)) {
    const body = [];
    for (const line of lines.slice(at + 1)) {
      if (line.trim() && !/^\s/.test(line)) break;
      body.push(line.trim());
    }
    const parts = body.filter(Boolean);
    return value.startsWith('>') ? parts.join(' ') : parts.join('\n');
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1).replace(/\\"/g, '"');
  return value;
};

// Contract: for every workflow that has an OpenCode command, the description an OpenCode user sees is the text of the Copilot prompt's description, whichever YAML form either file uses.
// Breaks when: a maintainer rewrites both descriptions as folded blocks (`description: >`, the form the shared skills already use) and updates the text in one of them only; the reader also rejects a block whose text differs while the indicators are equal (checked below on two synthetic files).
// Not covered by: the implementer's test in distributions.test.mjs compares `frontmatterValue`, which returns the block indicator `>` for both files, so two different texts compare equal (measured by the audit: both quick files as folded blocks with different text, distributions.test.mjs 8 of 8).
test('OpenCode commands: the description text equals the Copilot prompt description text, also when written as a block scalar', () => {
  const blockA = '---\ndescription: >\n  Fast-tracks small tasks.\n---\n';
  const blockB = '---\ndescription: >\n  Fast-tracks tiny tasks.\n---\n';
  assert.notEqual(descriptionText(blockA, 'blockA'), descriptionText(blockB, 'blockB'), 'two blocks with different text are told apart');
  assert.equal(descriptionText("---\ndescription: 'It''s one'\n---\n", 'single'), descriptionText('---\ndescription: "It\'s one"\n---\n', 'double'), 'quotes alone do not make two texts differ');
  const workflows = readdirSync(join(ROOT, 'opencode/commands'))
    .filter((name) => /^vibeflow-.+\.md$/.test(name))
    .map((name) => name.replace(/^vibeflow-/, '').replace(/\.md$/, ''));
  assert.ok(workflows.length > 0, 'opencode/commands holds workflow commands');
  for (const workflow of workflows) {
    const command = `opencode/commands/vibeflow-${workflow}.md`;
    const prompt = `copilot/github/prompts/vibeflow-${workflow}.prompt.md`;
    assert.equal(descriptionText(read(command), command), descriptionText(read(prompt), prompt), `${command} and ${prompt} carry different description text`);
  }
});

// Contract: the shared reader enforces the floor each caller passes, every host of it and not only the first, and returns the rule's own host list when the floor is satisfied.
// Breaks when: a refactor of `test/kit-path-hosts.mjs` drops or shortcuts the floor loop (a default `floor = []`, a loop over a constant, a check of `floor[0]` only); both kit-path probes stay green, because today's rule names every host of both floors, and stop guarding the floor.
// Not covered by: the Hermes and OpenCode kit-path probes call the reader with floors the current rule satisfies, so they never reach its rejection; the implementer proved the rejection by mutating the `audit` skill by hand, which is not in the suite.
test('kit-path hosts: the shared reader refuses a floor host that the never-substituted rule does not name', () => {
  const hosts = neverSubstitutedHosts([]);
  assert.ok(hosts.length > 0, 'the rule names at least one host');
  assert.deepEqual(neverSubstitutedHosts(hosts), hosts, 'a floor the rule satisfies returns the rule hosts');
  const absent = 'Nohostnamed';
  assert.ok(!hosts.includes(absent));
  const refusal = { name: 'AssertionError', message: new RegExp(`^audit: the never-substituted rule names ${absent}: `) };
  assert.throws(() => neverSubstitutedHosts([absent]), refusal, 'a floor of one absent host is refused');
  assert.throws(() => neverSubstitutedHosts([...hosts, absent]), refusal, 'an absent host after the named ones is refused');
});
