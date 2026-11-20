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

// The text a host shows for the `description` of a front matter, in the forms these files use or
// can come to use: a one-line value, plain, single-quoted (with `''` read as `'`) or double-quoted
// (with the JSON escapes), or a folded (`>`) or literal (`|`) block, with or without the `-` or `+`
// chomping indicator. The chomping indicator only decides the line breaks after the text, which a
// description does not show, so every block reads as its text without them. For the same reason the
// spaces at the end of a block line are dropped: YAML keeps them, but a reader cannot see them, and
// two descriptions that differ only there must not fail the comparison over an invisible difference.
// A value that is only a comment (`description: # ...`) is null in YAML and reads as empty text.
// Any other form (a plain or quoted value that continues on the next line, a block with an
// indentation indicator, a flow, anchor or tag value) fails naming the file instead of returning
// part of the text. Returns undefined when the front matter has no `description`.
function descriptionText(content, file) {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatter, `${file} must start with YAML frontmatter`);
  const lines = frontmatter[1].split('\n');
  const at = lines.findIndex((line) => /^description:(?:\s|$)/.test(line));
  if (at === -1) return undefined;
  const unread = (why) => assert.fail(`${file}: the description is in a form this test does not read (${why})`);
  const value = lines[at].slice('description:'.length).trim();
  const after = lines.slice(at + 1);
  const indented = after.findIndex((line) => line.trim() && !/^\s/.test(line));
  const body = indented === -1 ? after : after.slice(0, indented);
  const block = /^([>|])[+-]?(?:\s+#.*)?$/.exec(value);
  if (block) {
    while (body.length && !body.at(-1).trim()) body.pop();
    const first = body.find((line) => line.trim());
    if (!first) return '';
    const indent = first.match(/^\s*/)[0];
    const text = body.map((line) => {
      if (!line.trim()) return '';
      if (!line.startsWith(indent)) unread('a block line indented less than its first line');
      return line.slice(indent.length).trimEnd();
    });
    if (block[1] === '|') return text.join('\n');
    // Folding: a single line break between two text lines becomes a space, each empty line in
    // between stays a line break, and lines that start more indented keep their breaks.
    let out = '';
    let empty = 0;
    let previous;
    for (const line of text) {
      if (!line) {
        empty += 1;
        continue;
      }
      if (previous === undefined) out += '\n'.repeat(empty);
      else if (/^\s/.test(line) || /^\s/.test(previous)) out += '\n'.repeat(empty + 1);
      else out += empty ? '\n'.repeat(empty) : ' ';
      out += line;
      previous = line;
      empty = 0;
    }
    return out;
  }
  if (/^[>|]/.test(value)) unread(`block header \`${value}\``);
  if (body.some((line) => line.trim())) unread('the value continues on the next line');
  if (value.startsWith("'")) {
    const single = /^'((?:[^']|'')*)'$/.exec(value);
    if (!single) unread('a single-quoted value that does not close on its line');
    return single[1].replace(/''/g, "'");
  }
  if (value.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(value)) unread('a double-quoted value that does not close on its line');
    try {
      return JSON.parse(value);
    } catch {
      return unread('a double-quoted value with an escape outside JSON');
    }
  }
  // A value that is only a comment is null in YAML, so it reads as no text at all.
  if (value.startsWith('#')) return '';
  if (/^[[{&*!%@`]/.test(value)) unread(`a value starting with \`${value[0]}\``);
  return value.replace(/\s+#.*$/, '');
}

test('the description reader returns the text a host shows, whatever YAML form the file uses', () => {
  const parse = (yaml) => descriptionText(`---\nname: x\n${yaml}\nagent: 'agent'\n---\n`, 'synthetic');
  const text = 'Fast-tracks small tasks into a prompt pack.';
  for (const yaml of [
    `description: ${text}`,
    `description: '${text}'`,
    `description: "${text}"`,
    'description: >\n  Fast-tracks small tasks\n  into a prompt pack.',
    'description: >-\n  Fast-tracks small tasks\n  into a prompt pack.\n',
    'description: >+\n    Fast-tracks small tasks into\n    a prompt pack.\n\n',
    `description: |\n  ${text}`,
    `description: |-\n  ${text}`,
  ]) {
    assert.equal(parse(yaml), text, yaml);
  }
  assert.notEqual(
    parse('description: >\n  Fast-tracks small tasks.'),
    parse('description: >\n  Fast-tracks tiny tasks.'),
    'two blocks with different text are told apart',
  );
  assert.equal(parse("description: 'It''s one'"), parse('description: "It\'s one"'), 'quotes alone do not make two texts differ');
  assert.equal(parse('description: |\n  One line\n  two lines'), 'One line\ntwo lines', 'a literal block keeps its line breaks');
  assert.equal(parse('description: >\n  One\n\n  two\n    indented\n  three'), 'One\ntwo\n  indented\nthree', 'a folded block keeps empty and more-indented line breaks');
  assert.equal(parse('description: >'), '', 'an empty block reads as empty text');
  assert.equal(parse('description: # to be written'), '', 'a value that is only a comment reads as empty text');
  assert.equal(parse('other: value'), undefined);
  for (const yaml of [
    'description: Fast-tracks small tasks\n  into a prompt pack.',
    "description: 'Fast-tracks small tasks\n  into a prompt pack.'",
    'description: "Fast-tracks small tasks\n  into a prompt pack."',
    'description: >2\n  Fast-tracks small tasks.',
    'description: [Fast-tracks]',
  ]) {
    assert.throws(() => parse(yaml), { name: 'AssertionError', message: /^synthetic: the description is in a form this test does not read/ }, yaml);
  }
});

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
  const opencode = readdirSync(join(ROOT, 'opencode/commands'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.replace(/^vibeflow-/, '').replace(/\.md$/, ''))
    .sort();

  assert.deepEqual(shared, WORKFLOWS);
  assert.deepEqual(cursor, WORKFLOWS);
  assert.deepEqual(copilot, WORKFLOWS);
  assert.deepEqual(opencode, WORKFLOWS);

  for (const workflow of WORKFLOWS) {
    const files = workflowFiles(workflow);
    assert.equal(frontmatterValue(read(files.shared), 'name'), workflow, files.shared);
    assert.equal(frontmatterValue(read(files.cursor), 'name'), `vibeflow-${workflow}`, files.cursor);
    assert.equal(frontmatterValue(read(files.copilot), 'name'), `vibeflow-${workflow}`, files.copilot);
    assert.ok(descriptionText(read(files.shared), files.shared), `${files.shared} needs a description`);
    assert.ok(descriptionText(read(files.cursor), files.cursor), `${files.cursor} needs a description`);
    assert.ok(descriptionText(read(files.copilot), files.copilot), `${files.copilot} needs a description`);
    // OpenCode names a command after its file, so the file name is the command's name.
    const command = `opencode/commands/vibeflow-${workflow}.md`;
    assert.ok(descriptionText(read(command), command), `${command} needs a description`);
  }
});

// The OpenCode command restates the workflow's description in the Copilot prompt's words, so the two change together.
// They are compared by the text a host shows, so two blocks with different text differ and the same
// text written in two YAML forms does not.
test('each OpenCode command carries the description of the Copilot prompt of its workflow', () => {
  for (const workflow of WORKFLOWS) {
    const command = `opencode/commands/vibeflow-${workflow}.md`;
    const prompt = workflowFiles(workflow).copilot;
    assert.equal(
      descriptionText(read(command), command),
      descriptionText(read(prompt), prompt),
      `${command} and ${prompt} carry different descriptions`,
    );
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

test('Cursor, Copilot and OpenCode host files use their documented frontmatter', () => {
  assert.equal(frontmatterValue(read('cursor/rules/vibeflow.mdc'), 'alwaysApply'), 'true');
  assert.equal(frontmatterValue(read('cursor/rules/vibeflow-architect.mdc'), 'alwaysApply'), 'false');

  const architectPath = 'copilot/github/agents/vibeflow-architect.agent.md';
  const architect = read(architectPath);
  assert.equal(frontmatterValue(architect, 'name'), 'vibeflow-architect');
  assert.ok(descriptionText(architect, architectPath), `${architectPath} needs a description`);

  const instructions = read('copilot/github/instructions/vibeflow/vibeflow.instructions.md');
  assert.equal(frontmatterValue(instructions, 'applyTo'), '**');

  for (const workflow of WORKFLOWS) {
    assert.ok(frontmatterValue(read(workflowFiles(workflow).copilot), 'agent'));
  }

  // OpenCode: an agent is named after its file, takes `mode` and `permission`, and drops the
  // whole file when `tools:` is a comma-separated list, as in the Claude Code front matter.
  const modes = { architect: 'primary', executor: 'subagent', auditor: 'subagent' };
  for (const [agent, mode] of Object.entries(modes)) {
    const path = `opencode/agents/${agent}.md`;
    const content = read(path);
    assert.ok(descriptionText(content, path), `${path} needs a description`);
    assert.equal(frontmatterValue(content, 'mode'), mode, `${path} mode`);
    assert.match(content.match(/^---\n([\s\S]*?)\n---\n/)[1], /^permission:\n {2}\S/m, `${path} declares a permission map`);
    assert.equal(frontmatterValue(content, 'tools'), undefined, `${path} has no tools field`);
  }
  for (const workflow of WORKFLOWS) {
    const content = read(`opencode/commands/vibeflow-${workflow}.md`);
    assert.ok(content.includes('$ARGUMENTS'), `vibeflow-${workflow} passes $ARGUMENTS`);
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

test('Hermes root manifest is the Agent Plugins v1 edition of the same versioned plugin', () => {
  const claudeManifest = JSON.parse(read('plugins/vibeflow/.claude-plugin/plugin.json'));
  const codexManifest = JSON.parse(read('plugins/vibeflow/.codex-plugin/plugin.json'));
  const hermesManifest = JSON.parse(read('plugins/vibeflow/plugin.json'));

  assert.equal(hermesManifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(hermesManifest.name, 'vibeflow');
  assert.equal(hermesManifest.name, claudeManifest.name);
  assert.equal(hermesManifest.name, codexManifest.name);
  assert.equal(hermesManifest.version, claudeManifest.version);
  assert.equal(hermesManifest.version, codexManifest.version);
  assert.deepEqual(Object.keys(hermesManifest).sort(), [
    '$schema',
    'author',
    'description',
    'homepage',
    'keywords',
    'license',
    'name',
    'repository',
    'version',
  ]);
});

test('Claude architect enables project memory without changing the Codex skill boundary', () => {
  const architect = read('plugins/vibeflow/agents/architect.md');
  const codexManifest = JSON.parse(read('plugins/vibeflow/.codex-plugin/plugin.json'));

  assert.equal(frontmatterValue(architect, 'memory'), 'project');
  assert.equal(codexManifest.skills, './skills/');
  assert.equal(codexManifest.agents, undefined);
});
