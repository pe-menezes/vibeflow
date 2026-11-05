// Behavior probes for the OpenCode edition, part 2: the `opencode/` folder holds the three agents
// in OpenCode's own format and one slash command per workflow. OpenCode 2.2.5 names an agent and a
// command after its file, drops an agent file whose `tools:` is a comma-separated list, and resolves
// `permission` as an ordered list where the last matching rule wins, on top of a host default of
// `* * -> allow`: an allow-list restricts nothing, so each role opens with `"*": deny` and lists what
// it may do after it. These probes read that list the way the host does and pin what each role ends
// up allowed. Each case states, as comments, the contract it protects, the plausible regression that
// breaks it and why the contract tests did not catch it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const WORKFLOWS = readdirSync(join(ROOT, 'plugins/vibeflow/skills')).sort();
const AGENTS = {
  architect: { source: 'plugins/vibeflow/agents/architect.md', sourceHasFrontMatter: true },
  executor: { source: 'plugins/vibeflow/skills/implement/loop/roles/executor.md', sourceHasFrontMatter: false },
  auditor: { source: 'plugins/vibeflow/skills/implement/loop/roles/auditor.md', sourceHasFrontMatter: false },
};
const ORCHESTRATOR = 'plugins/vibeflow/skills/implement/loop/orchestrator.md';

function split(content, path) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  assert.ok(match, `${path} starts with YAML front matter`);
  return { block: match[1], body: content.slice(match[0].length) };
}

const unquote = (value) => {
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.endsWith(quote) ? value.slice(1, -1) : value;
};

// The `permission` map of a front matter as the ordered rule list OpenCode resolves it into:
// `key: effect` is `[key, '*', effect]`, a nested `resource: effect` under `key:` is
// `[key, resource, effect]`, in file order.
function permissionRules(block, path) {
  const lines = block.split('\n');
  const start = lines.indexOf('permission:');
  assert.ok(start >= 0, `${path} has a \`permission:\` map`);
  const rules = [];
  let action = null;
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('  ')) break;
    const nested = /^ {4}(\S.*?):\s*(\S+)\s*$/.exec(line);
    const top = /^ {2}(\S.*?):\s*(\S*)\s*$/.exec(line);
    if (nested && action) {
      rules.push([action, unquote(nested[1]), nested[2]]);
    } else if (top) {
      action = unquote(top[1]);
      if (top[2]) rules.push([action, '*', top[2]]);
    } else {
      assert.fail(`${path}: unexpected permission line: ${line}`);
    }
  }
  return rules;
}

// The aliases OpenCode 2.2.5 translates (measured on 05/11/2026 with `opencode debug agents`).
const ALIASES = { bash: 'shell', write: 'edit', patch: 'edit', task: 'subagent' };
const wildcard = (pattern, value) =>
  new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(value);

// The effect of one call, the last matching rule winning, over the host's default list: `* * allow`
// before the agent's rules, `browser` and the `browser` skill denied after them.
function effect(rules, action, resource = 'any') {
  const list = [['*', '*', 'allow'], ...rules.map(([a, r, e]) => [ALIASES[a] ?? a, r, e]), ['browser', '*', 'deny'], ['skill', 'browser', 'deny']];
  let found = null;
  for (const [a, r, e] of list) {
    if (wildcard(a, action) && wildcard(r, resource)) found = e;
  }
  return found;
}

const agent = (name) => {
  const path = `opencode/agents/${name}.md`;
  const { block, body } = split(read(path), path);
  return { path, block, body, rules: permissionRules(block, path) };
};

// Contract: the body after the front matter of each OpenCode agent is byte-identical to its source:
// `executor` and `auditor` to the loop roles (`roles/executor.md`, `roles/auditor.md`), as the
// Claude Code agents already are, and `architect` to the body of the Claude Code architect agent.
// Breaks when: a role changes in the kit and the OpenCode agent keeps the old text, or the agent
// body gets an OpenCode-only line, so an OpenCode round runs a discipline the kit no longer has.
// Not covered by: implement-loop-contracts and audit-contracts compare only the Claude Code agents
// with the roles.
test('OpenCode agents: each body is byte-identical to its source', () => {
  for (const [name, { source, sourceHasFrontMatter }] of Object.entries(AGENTS)) {
    const expected = sourceHasFrontMatter ? split(read(source), source).body : read(source);
    assert.equal(agent(name).body, expected, `opencode/agents/${name}.md body equals ${source}`);
  }
});

// Contract: the agent files are exactly `architect`, `executor` and `auditor`, the names the host
// gives them from the file name and the names the OpenCode row of the host table calls; their
// front matter has no `name:` (the host ignores it) and no `tools:` (a comma-separated list makes
// the host drop the file in silence, and a boolean map is deprecated in favour of `permission`).
// Breaks when: an agent is renamed `vibeflow-executor` to match the commands' prefix, so the
// `subagent` call with `agent: executor` the orchestrator writes finds nothing; or the Claude Code
// front matter is copied over with its `tools: Read, Grep, …` line, so the agent never loads.
// Not covered by: distributions checks the `tools` field of the three files it names, not the file
// set nor the names the orchestrator calls.
test('OpenCode agents: the file names are the agent names the host table calls, with no `name:` or `tools:`', () => {
  const files = readdirSync(join(ROOT, 'opencode/agents')).sort();
  assert.deepEqual(files, ['architect.md', 'auditor.md', 'executor.md']);
  const row = read(ORCHESTRATOR).split('\n').find((line) => line.startsWith('| OpenCode |'));
  assert.ok(row, 'the host table has an OpenCode row');
  const called = [...row.matchAll(/`agent`[^`|]*`([^`]+)`/g)].map((match) => match[1]).filter((name) => name !== 'general');
  assert.deepEqual([...new Set(called)].sort(), ['auditor', 'executor'], `the row calls the role agents: ${row}`);
  for (const name of called) assert.ok(files.includes(`${name}.md`), `opencode/agents/${name}.md exists`);
  for (const name of Object.keys(AGENTS)) {
    const { path, block } = agent(name);
    assert.doesNotMatch(block, /^name:/m, `${path}: the host names the agent after the file`);
    assert.doesNotMatch(block, /^tools:/m, `${path}: no tools field`);
    assert.deepEqual(block.split('\n').filter((line) => /^\S/.test(line)).map((line) => line.split(':')[0]).sort(),
      ['description', 'mode', 'permission'], `${path}: front matter keys`);
  }
});

// Contract: each agent's first permission rule is the total denial `"*": deny`, so what its role
// does not list is denied; and `subagent` (the `task` alias included) is denied in all three, since
// no round and no architect opens another session (loop principle 5).
// Breaks when: a rewrite writes the role as an allow-list without the denial (the host default
// `* * allow` then lets the agent open subagents, load skills and browse), or puts `"*": deny` last,
// where it denies the role's own tools.
// Not covered by: no contract test reads the OpenCode permission map.
test('OpenCode agents: the first permission rule denies everything, and subagent is denied in all three', () => {
  for (const name of Object.keys(AGENTS)) {
    const { path, rules } = agent(name);
    assert.deepEqual(rules[0], ['*', '*', 'deny'], `${path}: the first rule is "*": deny`);
    assert.ok(!rules.slice(1).some(([action, , e]) => action === '*' && e !== 'deny'), `${path}: no later rule reopens "*"`);
    assert.equal(effect(rules, 'subagent', 'general'), 'deny', `${path}: subagent denied`);
    assert.equal(effect(rules, 'subagent', 'executor'), 'deny', `${path}: subagent denied`);
  }
});

// Contract: the executor and the auditor end up with the tools of their Claude Code agents (read,
// grep, glob, shell, edit) and nothing else: no skill, no question (nobody answers a round), no web;
// `.env` reads still ask, as in the host's own agents, and a path outside the project asks.
// Breaks when: `read: allow` alone reopens `.env` files the host default asks for; a role gains
// `skill` or `webfetch`; or `edit` is left out, so the executor cannot write the part.
// Not covered by: implement-loop-contracts checks the Claude Code `tools:` list only.
test('OpenCode agents: the executor and auditor resolve to read, grep, glob, shell and edit only', () => {
  for (const name of ['executor', 'auditor']) {
    const { path, rules } = agent(name);
    for (const action of ['read', 'grep', 'glob', 'shell', 'edit']) assert.equal(effect(rules, action), 'allow', `${path}: ${action}`);
    for (const action of ['skill', 'question', 'webfetch', 'websearch', 'browser', 'todowrite', 'lsp']) assert.equal(effect(rules, action), 'deny', `${path}: ${action}`);
    for (const workflow of WORKFLOWS) assert.equal(effect(rules, 'skill', workflow), 'deny', `${path}: skill ${workflow}`);
    assert.equal(effect(rules, 'read', 'app/.env'), 'ask', `${path}: .env asks`);
    assert.equal(effect(rules, 'read', '.env.local'), 'ask', `${path}: .env.* asks`);
    assert.equal(effect(rules, 'read', '.env.example'), 'allow', `${path}: .env.example reads`);
    assert.equal(effect(rules, 'external_directory'), 'ask', `${path}: outside the project asks`);
  }
});

// Contract: the architect, the mode the user switches to with Tab, can read, search, run commands,
// edit, browse the web and ask the user questions (the discover dialogue needs `question`), and can
// load exactly the workflows its own "Available Commands" table names; `implement` and `hotfix`,
// which write the code, stay denied, as does the host's `browser` skill.
// Breaks when: `question` is left out, so discover cannot hold its rounds; `skill: allow` opens every
// skill (the host's `browser` one included); or a workflow is added to the table and not to the map.
// Not covered by: nothing else reads the architect's OpenCode permissions.
test('OpenCode agents: the architect asks questions and loads the workflows its table names, not implement or hotfix', () => {
  const { path, rules, body } = agent('architect');
  for (const action of ['read', 'grep', 'glob', 'shell', 'edit', 'webfetch', 'websearch', 'question']) {
    assert.equal(effect(rules, action), 'allow', `${path}: ${action}`);
  }
  const table = [...body.matchAll(/^\| `\/vibeflow:([a-z-]+)` \|/gm)].map((match) => match[1]);
  assert.ok(table.length >= 8, `${path}: the Available Commands table`);
  for (const workflow of WORKFLOWS) {
    assert.equal(effect(rules, 'skill', workflow), table.includes(workflow) ? 'allow' : 'deny', `${path}: skill ${workflow}`);
  }
  assert.equal(effect(rules, 'skill', 'browser'), 'deny', `${path}: the browser skill`);
  assert.equal(effect(rules, 'skill', 'some-other-skill'), 'deny', `${path}: a skill outside Vibeflow`);
  assert.equal(effect(rules, 'read', '.env'), 'ask', `${path}: .env asks`);
  assert.equal(effect(rules, 'external_directory'), 'ask', `${path}: outside the project asks`);
});

// Contract: there is one command per workflow of the inventory, `opencode/commands/vibeflow-<name>.md`,
// whose body loads the skill of the same name and passes `$ARGUMENTS`, and no command fixes an
// `agent`: it runs in the agent the user is in, so `implement` and `hotfix` keep the edit tools of
// Build instead of landing in an agent without them.
// Breaks when: a command copied from another loads the wrong skill; a command forgets `$ARGUMENTS`,
// so `/vibeflow-audit --reaudit <commit>` drops its flags; or `agent: architect` is added to every
// command, as in the Copilot prompts, and `/vibeflow-implement` runs where its skill is denied.
// Not covered by: distributions checks the file set, the description and that `$ARGUMENTS` appears.
test('OpenCode commands: one per workflow, each loading the skill of its name with $ARGUMENTS and no agent', () => {
  const files = readdirSync(join(ROOT, 'opencode/commands')).sort();
  assert.deepEqual(files, WORKFLOWS.map((workflow) => `vibeflow-${workflow}.md`));
  for (const workflow of WORKFLOWS) {
    const path = `opencode/commands/vibeflow-${workflow}.md`;
    const { block, body } = split(read(path), path);
    assert.doesNotMatch(block, /^agent:/m, `${path}: no agent`);
    assert.ok(unquote(/^description:\s*(.+)$/m.exec(block)?.[1] ?? ''), `${path}: description`);
    const skills = [...body.matchAll(/`([a-z-]+)` skill/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(skills)], [workflow], `${path}: loads the \`${workflow}\` skill and no other`);
    assert.ok(body.includes('$ARGUMENTS'), `${path}: passes $ARGUMENTS`);
  }
});
