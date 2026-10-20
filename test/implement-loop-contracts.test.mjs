// Contracts of the 1.16 `implement --loop` (part 3): the "Loop mode" section of
// the three implement editions, the orchestrator's flow in the kit, and the
// executor role with its Claude Code agent. Each assertion pins a literal a
// script or another workflow reads, or a rule the spec's Definition of Done
// names, so a weaker wording fails here instead of drifting silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const KIT = 'plugins/vibeflow/skills/implement/loop';
const ORCHESTRATOR = `${KIT}/orchestrator.md`;
const ROLE = `${KIT}/roles/executor.md`;
const AGENT = 'plugins/vibeflow/agents/executor.md';

const EDITIONS = {
  shared: 'plugins/vibeflow/skills/implement/SKILL.md',
  cursor: 'cursor/skills/vibeflow-implement/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-implement.prompt.md',
};

// sha256 of each edition at base 4228175, taken with
// `git show 4228175:<path> | shasum -a 256` on 2026-10-20. The CI checks out
// with depth 1, so the base is pinned by content here, never read from git.
const BASE_SHA256 = {
  shared: '23740c2dac8dc4e9c15ce43a58441d88989c9612ac10696be95c3229a0f4126d',
  cursor: '2f47bcfbbc53401e34825e095685b1684a127672d0c59eef9dbb1842da7f6a15',
  copilot: 'cae0ebd7387d87ed5d4801332a3c0d79174a7c234db6773f8c2734dc12a78e4d',
};

// Where each edition reaches the kit, and what installs it there (PRD, "The loop kit").
const KIT_PATH = {
  shared: '${CLAUDE_SKILL_DIR}/loop/',
  cursor: '.cursor/skills/vibeflow-implement/loop/',
  copilot: '.github/vibeflow/loop/',
};
const INSTALL_HINT = {
  shared: /updating the Vibeflow plugin installs it/,
  cursor: /`npx setup-vibeflow@latest --cursor --force`/,
  copilot: /`npx setup-vibeflow@latest --copilot --force`/,
};

const SECTION = '## Loop mode\n';
const PHASE_0 = '## Phase 0: Find and validate the spec';
const ARTIFACT_FOLDERS = ['loop/', 'briefings/', 'progress/', 'reviews/', 'audits/'];

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

// Prompts wrap prose at ~80 columns, so phrase contracts run on a copy with
// every run of whitespace collapsed to one space.
const flat = (text) => text.replace(/\s+/g, ' ');
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function count(haystack, needle) {
  let n = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) n += 1;
  return n;
}

// The Loop mode section sits right before Phase 0; it runs from its heading to
// the line before that heading.
function splitSection(content) {
  const start = content.indexOf(SECTION);
  if (start === -1) return null;
  const end = content.indexOf(`\n${PHASE_0}`, start);
  if (end === -1) return null;
  return { section: content.slice(start, end + 1), rest: content.slice(0, start) + content.slice(end + 1) };
}

// ------------------------------------------------------------------ DoD 1

for (const [edition, path] of Object.entries(EDITIONS)) {
  test(`${edition}: one Loop mode section before Phase 0, every other byte as at base 4228175`, () => {
    const content = read(path);
    assert.equal(count(content, SECTION), 1, `${edition}: exactly one "## Loop mode" heading`);
    const parts = splitSection(content);
    assert.ok(parts, `${edition}: the Loop mode section is followed by "${PHASE_0}"`);
    assert.equal(sha256(parts.rest), BASE_SHA256[edition], `${edition}: outside the Loop mode section the file differs from base 4228175`);
    assert.ok(parts.section.split('\n').length <= 30, `${edition}: the section stays short (at most 30 lines)`);
  });

  test(`${edition}: the Loop mode section turns the loop on and stops it without the kit or Node 18`, () => {
    const parts = splitSection(read(path));
    assert.ok(parts, `${edition}: Loop mode section`);
    const section = flat(parts.section);
    assert.match(section, /`--loop`/, `${edition}: the flag`);
    assert.match(section, /`loop: true`/, `${edition}: the project default`);
    assert.ok(section.includes('`.vibeflow/loop/config.md`'), `${edition}: the config file`);
    assert.match(section, /phases 0 to 3 run as/i, `${edition}: phases 0 to 3 run as today`);
    assert.match(section, /instead of phases 4 to 8/i, `${edition}: the kit replaces phases 4 to 8`);
    assert.ok(section.includes('`orchestrator.md`'), `${edition}: names orchestrator.md`);
    assert.ok(section.includes(KIT_PATH[edition]), `${edition}: kit path ${KIT_PATH[edition]}`);
    assert.match(section, INSTALL_HINT[edition], `${edition}: what installs the kit on this host`);
    assert.match(section, /`node --version`/, `${edition}: checks Node`);
    assert.match(section, /Node\.js 18 or newer/, `${edition}: names Node.js 18`);
    assert.match(section, /stop the loop/i, `${edition}: stops the loop`);
    assert.match(section, /`implement` without `--loop` still runs/, `${edition}: says the plain pipeline still runs`);
  });

  // The stop is a chain: each missing piece names what installs it, and both end the loop before
  // phase 0. Pinned as one predicate, so a clause that lets the loop run anyway breaks it.
  test(`${edition}: the kit-absent and Node stops both end the loop before phase 0`, () => {
    const section = flat(splitSection(read(path)).section);
    assert.match(
      section,
      /When the folder is missing, the kit is not installed: [^.]*installs it\. When Node\.js is missing or older, install Node\.js 18 or newer \([^)]*\)\. Either way, stop the loop before phase 0, say what to install, and say that `implement` without `--loop` still runs/,
      `${edition}: no kit or no Node 18 stops the loop before phase 0`,
    );
    assert.doesNotMatch(section, /anyway|improvise|run the loop without/i, `${edition}: no path that runs the loop without the kit or Node 18`);
  });

  test(`${edition}: --no-loop turns the loop off for one run when the config turns it on`, () => {
    const section = flat(splitSection(read(path)).section);
    assert.match(section, /`--no-loop`[^.]*turns (it|the loop) off for that run/, `${edition}: --no-loop`);
    assert.match(section, /still runs the pipeline below, with `--no-loop` when the config turns the loop on/, `${edition}: the stop points at --no-loop when the config turns the loop on`);
  });
}

// ------------------------------------------------------- DoD 2 to 4, 6 and 7

const orchestrator = () => read(ORCHESTRATOR);
const flatOrchestrator = () => flat(orchestrator());

test('orchestrator.md exists, stays under 250 lines and points at principles by number', () => {
  const content = orchestrator();
  assert.ok(content.split('\n').length < 250, 'under 250 lines');
  assert.match(content, /loop principle \d/, 'points at a principle by number');
  // No sentence of principles.md is restated (spec DoD 7).
  const sentences = flat(read(`${KIT}/principles.md`))
    .split(/(?<=[.:;])\s+/)
    .map((sentence) => sentence.replace(/^[*\d.\s]+/, '').replace(/\*\*/g, '').trim())
    .filter((sentence) => sentence.length >= 50);
  const text = flat(content).replace(/\*\*/g, '');
  for (const sentence of sentences) assert.ok(!text.includes(sentence), `restates principles.md: "${sentence}"`);
});

test('orchestrator.md: a fresh session per round on every host, and the user-opened chat fallback', () => {
  const text = flatOrchestrator();
  assert.match(text, /every round[^.]*fresh session/i, 'fresh session per round');
  assert.ok(text.includes('`vibeflow:executor`') && text.includes('`vibeflow:auditor`'), 'Claude Code subagents');
  assert.ok(text.includes('`<feature> · <part> · <role> · round <n>`'), 'PRD subagent description');
  assert.match(text, /\| Codex \|[^|]*native subagent[^|]*new task/i, 'Codex row');
  assert.match(text, /\| Cursor, Copilot \|[^|]*new chat the user opens[^|]*one-line instruction/i, 'Cursor and Copilot row');
  assert.match(text, /cannot open a fresh session[^.]*falls back to the chat the user opens[^.]*says so/i, 'fallback to the user-opened chat');
  assert.match(text, /nothing else in the command breaks/i, 'the fallback breaks nothing else');
});

test('orchestrator.md: the opening', () => {
  const text = flatOrchestrator();
  assert.match(text, /`git status`/, 'reads git status');
  assert.match(text, /`git stash list`/, 'reads the stash list');
  assert.match(text, /every dirty file[^.]*owner[^.]*ledger/i, 'every dirty file gets an owner in the ledger');
  assert.ok(text.includes('`.vibeflow/loop/<feature>.md`'), 'the ledger path');
  assert.match(text, /never the default branch/i, 'never the default branch');
  assert.match(text, /on the default branch[^.]*stop and ask for a branch name/i, 'the default branch stops and asks');
  assert.match(text, /once per feature/i, 'the OK to commit rounds is asked once per feature');
  assert.ok(text.includes('`commit-rounds: true`'), 'the config key that grants it');
  assert.match(text, /preflight\.mjs/, 'preflight');
  assert.match(text, /exit 2[^.]*stop/i, 'preflight exit 2 stops');
});

test('orchestrator.md: the executor briefing, the outside check and the audit', () => {
  const text = flatOrchestrator();
  assert.match(text, /"Done when"[^.]*every DoD check[^.]*every criterion the auditor will check/i, 'Done when carries everything the audit checks');
  assert.match(text, /who-reads\.mjs/, 'anti-scope decided with who-reads');
  assert.match(text, /check-briefing\.mjs/, 'check-briefing');
  assert.match(text, /--pair/, 'check-briefing --pair');
  assert.match(text, /before (the )?dispatch/i, 'checks run before dispatch');
  assert.match(text, /perimeter\.mjs/, 'perimeter');
  for (const folder of ARTIFACT_FOLDERS) assert.ok(text.includes(`.vibeflow/${folder}`), `perimeter gets .vibeflow/${folder}`);
  assert.match(text, /suite and the type check(er)? yourself/i, 'the orchestrator runs suite and types');
  assert.match(text, /HTTP boundary[^.]*running build/i, 'running-build check for an HTTP boundary');
  assert.match(text, /review-package\.mjs/, 'review package');
  assert.match(text, /Auditor template/, 'auditor template');
});

// The text of one "## <heading>" section of orchestrator.md, flattened.
function orchestratorSection(heading) {
  const content = orchestrator();
  const start = content.indexOf(`\n## ${heading}\n`);
  assert.ok(start !== -1, `orchestrator.md has a "## ${heading}" section`);
  const end = content.indexOf('\n## ', start + 1);
  return flat(content.slice(start, end === -1 ? undefined : end));
}

test('orchestrator.md: every round is committed once it passes, by explicit path, on the confirmed feature branch, only with the OK', () => {
  const text = flatOrchestrator();
  const commits = orchestratorSection('Round commits');
  // F3: every round, not only the ones below PASS, so a passing part is the next part's base.
  assert.match(commits, /Every round is committed on the feature branch once it passes/, 'every round is committed once it passes');
  assert.match(commits, /the executor's or a fix round's files after the outside check, the audit's probe file before any fix, the re-audit's new probes at the end of its round/, 'what each round commits, and when');
  assert.match(commits, /last commit of a part that passes is the next part's base/, 'a passing part is the next part\'s base');
  // S1: the branch is checked inside the commit step itself.
  assert.match(commits, /Confirm the current branch is the feature branch recorded in the ledger, never the default branch; on any other branch, stop and ask/, 'the branch is confirmed before every commit');
  assert.match(commits, /Read the full `git status`/, 'the full status before the commit');
  // F4 and S8: add then commit, both by explicit path.
  assert.ok(commits.includes('`git add -- <paths>`, then `git commit -- <paths>`'), 'git add -- <paths> before git commit -- <paths>');
  assert.match(commits, /a new file is unknown to git until it is added/, 'why the add is needed');
  assert.match(text, /a file owned by someone else stays out/, 'a stranger\'s file stays out');
  assert.doesNotMatch(text, /git add (-A|--all|\.)|git commit -a\b|git commit --all/, 'no command that takes every file');
  // S6: a refused hook stops the part.
  assert.match(commits, /A hook that refuses the commit stops the part: report it, never commit with `--no-verify`/, 'a refused hook stops the part');
  assert.doesNotMatch(text, /(retry|retried|again) with `--no-verify`/i, 'no retry that bypasses the hook');
  // F2 and S5: without the OK nothing is committed, said once, here.
  assert.match(commits, /Without the OK to commit, nothing is committed: the loop runs one part and stops at its first verdict, leaving the work uncommitted for the human/, 'without the OK, one part and stop at the first verdict');
  assert.equal(count(text, 'Without the OK'), 1, 'the no-OK rule is said once');
  assert.doesNotMatch(text, /commits the rounds anyway|commit[^.]*without the OK/i, 'no path that commits without the OK');
  // The audit step does not end a part without its commit.
  assert.match(orchestratorSection('Audit'), /Commit the audit's probes as above\. PASS ends the part/, 'the audit\'s probes are committed before PASS ends the part');
});

test('orchestrator.md: a red outside check goes back to a fresh executor session, never to a fix round or a re-audit', () => {
  const check = orchestratorSection('Outside check');
  assert.match(check, /After every executor or fix round, and before its audit or re-audit/, 'the outside check runs after every executor and fix round');
  assert.match(check, /A red suite or type check sends the round back to a fresh executor session with the failure/, 'red goes back to the executor');
  assert.match(check, /another `executor` row of round 0[^.]*at most once; a second red check stops the part and asks the human/, 'once, then the human');
  assert.match(check, /not a fix round and calls no `--reaudit`: the audit always reads a round that passed the outside check, and every fix round follows an audit or re-audit report/, 'not a fix round, no re-audit');
  assert.doesNotMatch(flatOrchestrator(), /becomes a fix round with the failure/, 'the old route is gone');
});

test('orchestrator.md: every executor answer has a route', () => {
  const watching = orchestratorSection('Watching a round');
  assert.match(watching, /`DONE` or `DONE WITH CAVEATS`: the outside check/, 'DONE goes to the outside check');
  assert.match(watching, /`NEEDS CONTEXT`: answer from the repository's files, or ask the human when the files do not say, and reopen the round in a fresh session with the answer/, 'NEEDS CONTEXT is answered and the round reopened');
  assert.match(watching, /`BLOCKED`: stop the part and take it to the human with the progress file/, 'BLOCKED stops the part');
});

test('orchestrator.md: the fix loop, the round commit and the ceiling', () => {
  const text = flatOrchestrator();
  const fix = orchestratorSection('Fix loop');
  assert.match(fix, /Write the fix briefing from the Fix template into `[^`]+`, from the report that opened the round: the audit report for fix 1, the re-audit report of the previous round \(`\.vibeflow\/audits\/<feature>-<part>-reaudit-<r - 1>\.md`\), where the open findings are, for fix 2/, 'the second fix reads the previous re-audit');
  assert.match(fix, /The outside check runs on the fix round[^.]*before the re-audit/, 'the outside check runs before the re-audit');
  assert.match(fix, /re-auditor briefing from the Re-auditor template into `[^`]+`; it passes `check-briefing\.mjs`[^.]*before the dispatch/, 'the re-auditor briefing is checked before dispatch');
  assert.match(text, /`git commit -- <paths>`/, 'commit by explicit path');
  assert.match(text, /`--no-verify`/, 'never bypasses a hook');
  assert.match(text, /`spec`[^.]*human[^.]*spec amendment/i, 'spec-cause findings go to the human or a recorded amendment');
  assert.match(text, /`low`[^.]*follow-up/i, 'low becomes a follow-up');
  assert.ok(text.includes('`audit --reaudit <round commit>`'), 're-audit by round commit');
  assert.match(text, /re-audit[^.]*fresh session/i, 're-audit in a fresh session');
  assert.match(text, /two fix rounds per part/i, 'two fix rounds');
  assert.match(text, /third[^.]*OK[^.]*one line[^.]*declared default/i, 'a third round asks in one line with a default');
  // S3, S4, S7: the predicate of each stop, not only its words.
  assert.match(text, /A third needs the human's OK, asked in one line/, 'a third round waits for the OK');
  assert.doesNotMatch(text, /without (waiting for )?the human's OK/i, 'no third round without the OK');
  assert.match(text, /same finding returning for the same cause stops the part before the ceiling/i, 'same cause stops before the ceiling');
  assert.doesNotMatch(text, /only after the ceiling/i, 'same cause does not wait for the ceiling');
  assert.match(text, /above 400k tokens of context[^.]*stops the part before the next fix/, 'a round above 400k stops the part before the next fix');
  assert.doesNotMatch(text, /400k[^.]*(next fix proceeds|is noted)/, 'a round above 400k never lets the next fix go');
  assert.ok(text.includes('## Rounds'), 'the rounds table heading');
  assert.ok(orchestrator().includes('| Part | Role | Round | Started | Ended | Verdict |'), 'the rounds table columns (loop-stats contract)');
});

test('orchestrator.md: the end of a round is the final marker, read with watch-round.mjs', () => {
  const text = flatOrchestrator();
  assert.match(text, /watch-round\.mjs/, 'watch-round');
  assert.ok(text.includes('`State: final`') && text.includes('`State: final · fix <round>`') && text.includes('`Stage: final`'), 'the final markers');
  assert.match(text, /literal in English/i, 'markers stay literal in English');
  assert.match(text, /never from a verdict alone/i, 'never from a verdict alone');
});

test('orchestrator.md: the orchestrator discipline and the company-mode section', () => {
  const text = flatOrchestrator();
  assert.match(text, /scope (freezes|is frozen) at dispatch/i, 'scope frozen');
  assert.match(text, /new part with its own audit/i, 'an addition becomes a new part or a follow-up');
  assert.ok(text.includes('`Decision: <what> — why: <reason> — cost if wrong: <cost>`'), 'the PRD Decision line');
  assert.match(text, /declared default[^.]*`Decision:`[^.]*away/i, 'a declared default is followed as a Decision when the human is away');
  assert.match(text, /leaves the scope or cannot be undone/i, 'only what leaves the scope or cannot be undone waits');
  assert.match(text, /above 50%[^.]*handoff[^.]*ledger/i, 'the 50% handoff to the ledger');
  assert.match(text, /resumes from the ledger and git/i, 'the next session resumes from the ledger and git');
  assert.match(orchestrator(), /^## Ending: company mode$/m, 'the company-mode section');
  assert.match(orchestratorSection('Ending: company mode'), /Fill `pr-body\.md` from the ledger/, 'part 4 filled the placeholder: the section ends the loop with the PR body');
});

test('every kit file and script orchestrator.md names exists', () => {
  const content = orchestrator();
  const scripts = new Set([...content.matchAll(/(?<![\w.-])([a-z][a-z0-9-]*\.mjs)\b/g)].map((match) => match[1]));
  for (const name of ['preflight.mjs', 'who-reads.mjs', 'check-briefing.mjs', 'perimeter.mjs', 'review-package.mjs', 'watch-round.mjs']) {
    assert.ok(scripts.has(name), `names ${name}`);
  }
  for (const script of scripts) assert.ok(existsSync(join(ROOT, KIT, 'scripts', script)), `${script} exists in loop/scripts/`);
  const files = new Set([...content.matchAll(/`((?:roles\/)?[A-Za-z][\w-]*\.md)`/g)].map((match) => match[1]));
  for (const name of ['principles.md', 'briefings.md', 'roles/executor.md', 'roles/auditor.md']) {
    assert.ok(files.has(name), `names ${name}`);
  }
  for (const file of files) assert.ok(existsSync(join(ROOT, KIT, file)), `${file} exists in the kit`);
});

// ------------------------------------------------------------------ DoD 5

function frontmatter(content) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  assert.ok(match, 'file must start with YAML frontmatter');
  return { block: match[1], body: content.slice(match[0].length) };
}

test('the executor role exists once, and the Claude agent body is byte-identical to it', () => {
  const role = read(ROLE);
  const text = flat(role);
  assert.doesNotMatch(role, /^---\n/, 'the role file has no front matter');
  assert.match(text, /read the briefing first/i, 'briefing first');
  assert.ok(text.includes('`.vibeflow/index.md`'), 'the .vibeflow guide');
  assert.match(text, /the spec/i, 'the spec');
  assert.match(text, /only inside the repository/i, 'works only inside the repository');
  assert.match(text, /no git write commands/i, 'no git writes');
  assert.match(text, /red before green/i, 'red before green');
  assert.match(text, /only the affected tests[^.]*full suite and the type checker once, at the end/i, 'affected tests during, full suite and types once at the end');
  assert.match(text, /progress file at every milestone/i, 'progress at every milestone');
  assert.ok(text.includes('`State: final`') && text.includes('`State: final · fix <round>`'), 'the final markers');
  assert.match(text, /denied[^.]*never (claim|report) a score (you have )?not seen/i, 'a denied runner is declared, never a score not seen');
  assert.match(text, /outside the part/i, 'out of scope as a note');
  assert.match(text, /400k tokens[^.]*BLOCKED/, 'context ceiling answers BLOCKED');
  assert.match(text, /no sub-agents and no reviewer of your own/i, 'no sub-agents, no own reviewer');
  assert.match(text, /## Final answer/, 'final answer');
  assert.match(text, /DONE, DONE WITH CAVEATS, NEEDS CONTEXT or BLOCKED/, 'the four states');
  assert.match(text, /files changed/i, 'files line');
  assert.match(text, /test score[^.]*seen/i, 'score line');
  assert.match(text, /caveats/i, 'caveats line');
  assert.match(text, /progress file('s)? path/i, 'progress path line');

  const { block, body } = frontmatter(read(AGENT));
  assert.equal(body, role, 'agent body after the front matter is byte-identical to roles/executor.md');
  assert.match(block, /^name: executor$/m, 'agent name');
  assert.match(block, /^description: /m, 'agent description');
  const tools = /^tools:\s*(.+)$/m.exec(block);
  assert.ok(tools, 'agent declares its tools (an agent without the field inherits every tool, Agent included)');
  const names = tools[1].split(',').map((tool) => tool.trim().replace(/\(.*$/, ''));
  for (const spawner of ['Agent', 'Task', 'Skill']) {
    assert.ok(!names.some((name) => name.toLowerCase() === spawner.toLowerCase()), `agent tools exclude ${spawner}`);
  }
});

// One vocabulary for the executor's answer (spec 3, DoD 5), wherever a template or a role says it.
test('one answer vocabulary across the templates, the orchestrator and the roles', () => {
  const files = [`${KIT}/briefings.md`, ORCHESTRATOR, ROLE, AGENT, `${KIT}/roles/auditor.md`, 'plugins/vibeflow/agents/auditor.md'];
  for (const file of files) {
    const text = read(file);
    assert.doesNotMatch(text, /\bSTUCK\b/, `${file}: STUCK is not in the vocabulary`);
    assert.doesNotMatch(text, /DONE WITH CAVEAT\b/, `${file}: DONE WITH CAVEATS, plural`);
  }
  const found = templates();
  for (const template of ['executor', 'fix']) assert.match(flat(found[template]), /400k tokens[^.]*BLOCKED/, `${template} template: the context ceiling answers BLOCKED`);
  assert.match(flat(found.executor), /DONE, DONE WITH CAVEATS, NEEDS CONTEXT or BLOCKED/, 'executor template: the four states');
  assert.match(flat(found.fix), /Read first[^#]*reaudit-<(r|round) - 1>\.md/, 'fix template: the second fix reads the previous re-audit report');
});

// The fenced template under each "## <Role>" heading of briefings.md.
function templates() {
  const roles = { Executor: 'executor', Fix: 'fix', Auditor: 'auditor', 'Re-auditor': 'reauditor' };
  const found = {};
  let role = null;
  let fence = null;
  for (const line of read(`${KIT}/briefings.md`).split('\n')) {
    if (fence !== null) {
      if (line.startsWith('```')) {
        found[role] = fence.join('\n');
        fence = null;
        role = null;
      } else {
        fence.push(line);
      }
    } else if (line.startsWith('## ')) {
      role = roles[line.slice(3).trim()] ?? null;
    } else if (role && line.startsWith('```')) {
      fence = [];
    }
  }
  return found;
}

test('briefings.md points every template at its role file, and the kit lists the new files', () => {
  const found = templates();
  const roleOf = { executor: 'roles/executor.md', fix: 'roles/executor.md', auditor: 'roles/auditor.md', reauditor: 'roles/auditor.md' };
  for (const [template, role] of Object.entries(roleOf)) {
    assert.ok(found[template], `${template} template`);
    assert.ok(found[template].includes(`\`${role}\``), `${template} template points at ${role}`);
  }
  const readme = read(`${KIT}/README.md`);
  for (const file of ['roles/executor.md', 'roles/auditor.md', 'orchestrator.md']) {
    assert.ok(readme.includes(`\`${file}\``), `kit README lists ${file}`);
  }
  const manifest = JSON.parse(read(`${KIT}/manifest.json`)).files;
  for (const file of ['orchestrator.md', 'roles/executor.md']) assert.ok(manifest.includes(file), `manifest lists ${file}`);
});
