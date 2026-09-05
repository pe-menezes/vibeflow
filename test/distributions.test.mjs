import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKFLOWS = [
  'analyze',
  'audit',
  'discover',
  'gen-spec',
  'hotfix',
  'implement',
  'prompt-pack',
  'quick',
  'stats',
  'teach',
];

const CONTRACTS = {
  analyze: [
    /--fresh/i,
    /--scope/i,
    /--interactive/i,
    /--satellite/i,
    /vibeflow:auto:start/i,
    /don'ts/i,
    /decisions\.md/i,
  ],
  audit: [
    /report every finding/i,
    /consolidate-hotfixes/i,
    /critical gate/i,
    /honor overrides|vibeflow:allow/i,
    /definition of done|\bdod\b/i,
  ],
  discover: [/\.vibeflow\/prds\//i, /problem/i, /anti-scope/i, /open questions/i],
  'gen-spec': [/## references/i, /craftsmanship/i, /executable test/i, /definition of done|\bdod\b/i, /3[–-]7/i],
  hotfix: [/\.vibeflow\/hotfixes\//i, /red.*green|red → green/i, /cannot-reproduce/i, /critical gate/i, /status/i],
  implement: [/refine/i, /anti-scope/i, /budget/i, /definition of done|\bdod\b/i, /tests/i],
  'prompt-pack': [/self-contain/i, /references/i, /patterns/i, /validat/i],
  quick: [/[≤<]=?\s*4|≤4/i, /prompt pack/i, /hotfix/i, /ephemeral spec/i],
  stats: [/audits/i, /pass[\s\S]*partial[\s\S]*fail/i],
  teach: [/--from/i, /vibeflow:auto:start/i, /decisions/i, /manual corrections/i],
};

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function frontmatterValue(content, key) {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatter, 'file must start with YAML frontmatter');
  const match = frontmatter[1].match(new RegExp(`^${key}:\\s*(.*?)\\s*$`, 'm'));
  if (!match) return undefined;
  const value = match[1];
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.endsWith(quote)
    ? value.slice(1, -1)
    : value;
}

test('frontmatter lookup never falls through to the Markdown body', () => {
  const content = `---
description: valid header
---
name: body-only-value
`;

  assert.equal(frontmatterValue(content, 'name'), undefined);
});

function workflowFiles(workflow) {
  return {
    shared: `plugins/vibeflow/skills/${workflow}/SKILL.md`,
    cursor: `cursor/skills/vibeflow-${workflow}/SKILL.md`,
    copilot: `copilot/github/prompts/vibeflow-${workflow}.prompt.md`,
  };
}

test('all editions expose the same workflow inventory and valid names', () => {
  const shared = readdirSync(join(ROOT, 'plugins/vibeflow/skills')).sort();
  const cursor = readdirSync(join(ROOT, 'cursor/skills'))
    .map((name) => name.replace(/^vibeflow-/, ''))
    .sort();
  const copilot = readdirSync(join(ROOT, 'copilot/github/prompts'))
    .filter((name) => name.endsWith('.prompt.md'))
    .map((name) => name.replace(/^vibeflow-/, '').replace(/\.prompt\.md$/, ''))
    .sort();

  assert.deepEqual(shared, WORKFLOWS);
  assert.deepEqual(cursor, WORKFLOWS);
  assert.deepEqual(copilot, WORKFLOWS);

  for (const workflow of WORKFLOWS) {
    const files = workflowFiles(workflow);
    assert.equal(frontmatterValue(read(files.shared), 'name'), workflow, files.shared);
    assert.equal(frontmatterValue(read(files.cursor), 'name'), `vibeflow-${workflow}`, files.cursor);
    assert.equal(frontmatterValue(read(files.copilot), 'name'), `vibeflow-${workflow}`, files.copilot);
    assert.ok(frontmatterValue(read(files.shared), 'description'), `${files.shared} needs a description`);
    assert.ok(frontmatterValue(read(files.cursor), 'description'), `${files.cursor} needs a description`);
    assert.ok(frontmatterValue(read(files.copilot), 'description'), `${files.copilot} needs a description`);
  }
});

test('all workflow editions preserve their essential behavior contracts', () => {
  for (const workflow of WORKFLOWS) {
    for (const [edition, path] of Object.entries(workflowFiles(workflow))) {
      const content = read(path);
      for (const contract of CONTRACTS[workflow]) {
        assert.match(content, contract, `${edition}/${workflow} is missing ${contract}`);
      }
    }
  }
});

test('Cursor and Copilot host files use their documented frontmatter', () => {
  assert.equal(frontmatterValue(read('cursor/rules/vibeflow.mdc'), 'alwaysApply'), 'true');
  assert.equal(frontmatterValue(read('cursor/rules/vibeflow-architect.mdc'), 'alwaysApply'), 'false');

  const architect = read('copilot/github/agents/vibeflow-architect.agent.md');
  assert.equal(frontmatterValue(architect, 'name'), 'vibeflow-architect');
  assert.ok(frontmatterValue(architect, 'description'));

  const instructions = read('copilot/github/instructions/vibeflow/vibeflow.instructions.md');
  assert.equal(frontmatterValue(instructions, 'applyTo'), '**');

  for (const workflow of WORKFLOWS) {
    assert.ok(frontmatterValue(read(workflowFiles(workflow).copilot), 'agent'));
  }
});

test('Claude and Codex catalogs point at the same versioned plugin', () => {
  const claudeManifest = JSON.parse(read('plugins/vibeflow/.claude-plugin/plugin.json'));
  const codexManifest = JSON.parse(read('plugins/vibeflow/.codex-plugin/plugin.json'));
  const claudeCatalog = JSON.parse(read('.claude-plugin/marketplace.json'));
  const codexCatalog = JSON.parse(read('.agents/plugins/marketplace.json'));

  assert.equal(claudeManifest.name, 'vibeflow');
  assert.equal(codexManifest.name, 'vibeflow');
  assert.equal(claudeManifest.version, codexManifest.version);
  assert.equal(claudeCatalog.version, claudeManifest.version);
  assert.equal(claudeCatalog.metadata.version, claudeManifest.version);
  assert.equal(claudeCatalog.plugins[0].version, claudeManifest.version);
  assert.equal(claudeCatalog.plugins[0].source, './plugins/vibeflow');
  assert.equal(codexCatalog.plugins[0].source.path, './plugins/vibeflow');
  assert.equal(codexManifest.skills, './skills/');
});

test('Claude architect enables project memory without changing the Codex skill boundary', () => {
  const architect = read('plugins/vibeflow/agents/architect.md');
  const codexManifest = JSON.parse(read('plugins/vibeflow/.codex-plugin/plugin.json'));

  assert.equal(frontmatterValue(architect, 'memory'), 'project');
  assert.equal(codexManifest.skills, './skills/');
  assert.equal(codexManifest.agents, undefined);
});
