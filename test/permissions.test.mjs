import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PLUGIN = 'plugins/vibeflow';

// The tools each skill and agent of the shared plugin is allowed to use. In
// Claude Code, a skill's `allowed-tools` pre-approves those tools while it runs,
// and an agent's `tools` is all it gets, so a change here reaches every user of
// that command, loop or no loop. Changing a line is a release note: update this
// list and add the change under "Changed" in CHANGELOG.md.
const EXPECTED = {
  skills: {
    analyze: ['Read', 'Grep', 'Glob', 'Bash', 'WebSearch', 'WebFetch'],
    audit: ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'],
    discover: ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],
    'gen-spec': ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],
    hotfix: ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'],
    implement: ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'],
    'prompt-pack': ['Read', 'Grep', 'Glob'],
    quick: ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],
    stats: ['Read', 'Grep', 'Glob', 'Bash'],
    teach: ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'],
  },
  agents: {
    architect: ['Read', 'Grep', 'Glob', 'Bash', 'WebSearch', 'WebFetch'],
    auditor: ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'],
    executor: ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'],
  },
};

const HOW_TO_FIX =
  'A permission change reaches users who never use the new feature: update EXPECTED in ' +
  'test/permissions.test.mjs and add the change under "Changed" in CHANGELOG.md.';

// The tools a front matter field declares, or null when the file has no front
// matter or no such field.
function declaredTools(content, field) {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!block) return null;
  const line = new RegExp(`^${field}:\\s*(.*)$`, 'm').exec(block[1]);
  if (!line) return null;
  return line[1].split(',').map((tool) => tool.trim()).filter(Boolean);
}

// One line per skill or agent whose declared tools differ from `expected`, or
// that has no entry in it, or that `expected` lists but the plugin lacks.
function permissionProblems(root, expected) {
  const kinds = [
    {
      kind: 'skill',
      field: 'allowed-tools',
      list: expected.skills,
      dir: join(root, PLUGIN, 'skills'),
      found: (dir) =>
        readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'SKILL.md')))
          .map((entry) => entry.name),
      file: (dir, name) => join(dir, name, 'SKILL.md'),
    },
    {
      kind: 'agent',
      field: 'tools',
      list: expected.agents,
      dir: join(root, PLUGIN, 'agents'),
      found: (dir) => readdirSync(dir).filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -3)),
      file: (dir, name) => join(dir, `${name}.md`),
    },
  ];
  const problems = [];
  for (const { kind, field, list, dir, found, file } of kinds) {
    const present = existsSync(dir) ? found(dir).sort() : [];
    for (const name of present) {
      if (!Object.hasOwn(list, name)) {
        problems.push(`${kind} ${name}: no entry in the expected list`);
        continue;
      }
      const tools = declaredTools(readFileSync(file(dir, name), 'utf8'), field);
      if (!tools) {
        problems.push(`${kind} ${name}: declares no ${field}`);
        continue;
      }
      const gains = tools.filter((tool) => !list[name].includes(tool));
      const loses = list[name].filter((tool) => !tools.includes(tool));
      if (gains.length || loses.length) {
        const change = [gains.length && `gains ${gains.join(', ')}`, loses.length && `loses ${loses.join(', ')}`];
        problems.push(`${kind} ${name}: ${field} ${change.filter(Boolean).join('; ')}`);
      }
    }
    for (const name of Object.keys(list).filter((name) => !present.includes(name))) {
      problems.push(`${kind} ${name}: listed but not found`);
    }
  }
  return problems;
}

// A throwaway plugin folder with the given skills and agents, each mapped to the
// front matter line it declares (null for none).
function samplePlugin({ skills = {}, agents = {} }) {
  const root = mkdtempSync(join(tmpdir(), 'vibeflow-permissions-'));
  for (const [name, line] of Object.entries(skills)) {
    const dir = join(root, PLUGIN, 'skills', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\n${line ? `${line}\n` : ''}---\n\n# ${name}\n`);
  }
  mkdirSync(join(root, PLUGIN, 'agents'), { recursive: true });
  for (const [name, line] of Object.entries(agents)) {
    writeFileSync(join(root, PLUGIN, 'agents', `${name}.md`), `---\nname: ${name}\n${line ? `${line}\n` : ''}---\n\n# ${name}\n`);
  }
  return root;
}

function withSample(layout, run) {
  const root = samplePlugin(layout);
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const SAMPLE_EXPECTED = {
  skills: { stats: ['Read', 'Grep', 'Glob'] },
  agents: { auditor: ['Read', 'Grep'] },
};

test('the permission lock passes a plugin equal to its list', () => {
  withSample(
    { skills: { stats: 'allowed-tools: Read, Grep, Glob' }, agents: { auditor: 'tools: Read, Grep' } },
    (root) => assert.deepEqual(permissionProblems(root, SAMPLE_EXPECTED), []),
  );
});

test('the permission lock catches a skill that gains a tool', () => {
  withSample(
    { skills: { stats: 'allowed-tools: Read, Grep, Glob, Bash' }, agents: { auditor: 'tools: Read, Grep' } },
    (root) => {
      const problems = permissionProblems(root, SAMPLE_EXPECTED);
      assert.equal(problems.length, 1, problems.join('\n'));
      assert.match(problems[0], /skill stats/);
      assert.match(problems[0], /gains Bash/);
    },
  );
});

test('the permission lock catches an agent that gains or loses a tool', () => {
  withSample(
    { skills: { stats: 'allowed-tools: Read, Grep, Glob' }, agents: { auditor: 'tools: Read, Write' } },
    (root) => {
      const problems = permissionProblems(root, SAMPLE_EXPECTED);
      assert.equal(problems.length, 1, problems.join('\n'));
      assert.match(problems[0], /agent auditor/);
      assert.match(problems[0], /gains Write/);
      assert.match(problems[0], /loses Grep/);
    },
  );
});

test('the permission lock catches a skill or agent with no entry in its list', () => {
  withSample(
    {
      skills: { stats: 'allowed-tools: Read, Grep, Glob', deploy: 'allowed-tools: Read' },
      agents: { auditor: 'tools: Read, Grep', reviewer: 'tools: Read' },
    },
    (root) => {
      const problems = permissionProblems(root, SAMPLE_EXPECTED);
      assert.equal(problems.length, 2, problems.join('\n'));
      assert.ok(problems.some((line) => /skill deploy/.test(line) && /no entry/.test(line)), problems.join('\n'));
      assert.ok(problems.some((line) => /agent reviewer/.test(line) && /no entry/.test(line)), problems.join('\n'));
    },
  );
});

test('the permission lock catches a missing field and a listed file that is gone', () => {
  withSample({ skills: { stats: null }, agents: {} }, (root) => {
    const problems = permissionProblems(root, SAMPLE_EXPECTED);
    assert.equal(problems.length, 2, problems.join('\n'));
    assert.ok(problems.some((line) => /skill stats/.test(line) && /declares no allowed-tools/.test(line)), problems.join('\n'));
    assert.ok(problems.some((line) => /agent auditor/.test(line) && /not found/.test(line)), problems.join('\n'));
  });
});

test('every skill and agent of the shared plugin declares the tools its list expects', () => {
  const problems = permissionProblems(ROOT, EXPECTED);
  assert.deepEqual(problems, [], `${problems.join('\n')}\n${HOW_TO_FIX}`);
});
