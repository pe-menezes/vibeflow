// Audit probes for vibeflow-base part 2: the knowledge base guard that
// gen-spec, implement, quick, prompt-pack and audit carry in their three
// editions, and the loop kit's rule for a project with no base. Behavior only:
// each probe takes the rule or the command the text writes and runs it against
// real git, a real shell or the kit's own templates, so a wording that still
// matches the literals but no longer works fails here. Each case states, as
// comments, the contract it protects, the plausible regression that breaks it
// and why the implementer's tests (test/missing-base-contracts.test.mjs) miss
// it: those tests pin strings and never run git, the copy command or the
// templates. A case marked `todo` asserts what a known open finding asks for:
// it runs and prints without failing the suite.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT = join(ROOT, 'plugins/vibeflow/skills/implement/loop');
const WORKFLOWS = ['gen-spec', 'implement', 'quick', 'prompt-pack', 'audit'];
const EDITIONS = (w) => [
  `plugins/vibeflow/skills/${w}/SKILL.md`,
  `cursor/skills/vibeflow-${w}/SKILL.md`,
  `copilot/github/prompts/vibeflow-${w}.prompt.md`,
];
const KNOWLEDGE_PATH = /\.vibeflow\/(index\.md|conventions\.md|decisions\.md|patterns\/)/;
const BRIEFING_NONE = '* project knowledge: none in this project (analyze has not run)';

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function flat(text) {
  return text.replace(/\s+/g, ' ');
}

function guardOf(raw) {
  const start = raw.indexOf('\n## Knowledge base\n');
  assert.notEqual(start, -1, 'the guard section');
  const end = raw.indexOf('\n## ', start + 5);
  return raw.slice(start, end === -1 ? undefined : end);
}

function cleanEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  return {
    ...env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t.invalid',
    GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t.invalid',
  };
}

function git(cwd, ...args) {
  const run = spawnSync('git', args, { cwd, env: cleanEnv(), encoding: 'utf8' });
  assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout;
}

function scratch(run) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'vibeflow-base-2-audit-')));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A main checkout whose path has a space and a single quote, one commit, and a
// linked worktree next to it.
function repoWithWorktree(dir, worktreeArgs = []) {
  const main = join(dir, "ma'in dir");
  mkdirSync(main);
  git(main, 'init', '-q');
  git(main, 'commit', '-q', '--allow-empty', '-m', 'first');
  const linked = join(dir, 'wt');
  git(main, ...worktreeArgs, 'worktree', 'add', '-q', linked);
  return { main, linked };
}

// The rule the guard writes, run as written: `<main>` is the path on the first
// `worktree <path>` line of `git worktree list --porcelain`; this checkout is
// linked when that path differs from `git rev-parse --show-toplevel`, both
// resolved with realpath.
function settleByGit(cwd) {
  const first = git(cwd, 'worktree', 'list', '--porcelain').split('\n').find((l) => l.startsWith('worktree '));
  const main = realpathSync(first.slice('worktree '.length));
  const here = realpathSync(git(cwd, 'rev-parse', '--show-toplevel').trim());
  return { main, here, linked: main !== here };
}

// The rule the guard writes for a host with no shell: read `.git` at the root;
// `gitdir: <path>/.git/worktrees/<name>` makes this checkout a linked worktree
// whose main checkout is `<path>` (resolved from this checkout's root when git
// wrote it relative).
const GITDIR = /^gitdir: (.+)\/\.git\/worktrees\/[^/\n]+\n?$/;
function settleByFile(root) {
  const text = readFileSync(join(root, '.git'), 'utf8');
  const match = GITDIR.exec(text);
  return match ? realpathSync(resolve(root, match[1])) : null;
}

// Contract: the detection the five workflows write (the two git commands, the
// first worktree line, realpath on both) tells a linked worktree from the main
// checkout, from the root and from a subfolder, and names the right main
// checkout even when its path has a space and a single quote.
// Breaks when: the rule in the text drifts from what git prints (the last
//   worktree line, a comparison without realpath that macOS's /private prefix
//   defeats, `--show-toplevel` swapped for the current folder).
// Not covered by: missing-base-contracts pins the command names as strings and
//   never runs git.
test('the guard\'s git rule: a linked worktree is linked, the main checkout is not, from the root and a subfolder', () => {
  for (const w of WORKFLOWS) {
    for (const path of EDITIONS(w)) {
      const g = flat(guardOf(read(path)));
      assert.ok(g.includes('first `worktree <path>` line of `git worktree list --porcelain`'), `${path}: the main checkout rule`);
      assert.ok(g.includes('`git rev-parse --show-toplevel` run here, both resolved with `realpath`'), `${path}: the linked rule`);
    }
  }
  scratch((dir) => {
    const { main, linked } = repoWithWorktree(dir);
    const sub = join(linked, 'deep', 'er');
    mkdirSync(sub, { recursive: true });
    for (const cwd of [linked, sub]) {
      const s = settleByGit(cwd);
      assert.equal(s.linked, true, `${cwd}: linked`);
      assert.equal(s.main, realpathSync(main), `${cwd}: the main checkout`);
      assert.equal(s.here, realpathSync(linked), `${cwd}: this checkout's root`);
    }
    const m = settleByGit(main);
    assert.equal(m.linked, false, 'the main checkout is not a linked worktree');
  });
});

// Contract: the no-shell path of the guard (read `.git` by its path) reaches
// the same main checkout as the git rule, and the main checkout itself (where
// `.git` is a folder) never reads as linked.
// Breaks when: the `gitdir:` shape in the text drifts from git's (for example
//   `<path>/worktrees/<name>` without `.git`, which would make `<path>` the
//   `.git` folder), or git writes the file relative (worktree.useRelativePaths,
//   git 2.48+) and the reader takes `<path>` as it stands.
// Not covered by: missing-base-contracts does not pin this sentence at all,
//   and nothing reads a real `.git` file.
test('the guard\'s no-shell rule: the .git file of a linked worktree names the main checkout, absolute or relative', () => {
  for (const w of WORKFLOWS) {
    for (const path of EDITIONS(w)) {
      assert.ok(flat(guardOf(read(path))).includes('a file that says `gitdir: <path>/.git/worktrees/<name>` makes this checkout a linked worktree whose main checkout is `<path>`'), `${path}: the .git file rule`);
    }
  }
  scratch((dir) => {
    const { main, linked } = repoWithWorktree(dir);
    assert.equal(settleByFile(linked), realpathSync(main), 'absolute gitdir: the main checkout');
    assert.equal(settleByGit(linked).main, settleByFile(linked), 'the two rules agree');
    const relative = join(dir, 'wt-rel');
    git(main, '-c', 'worktree.useRelativePaths=true', 'worktree', 'add', '-q', relative);
    assert.equal(settleByFile(relative), realpathSync(main), 'relative gitdir, resolved from this checkout: the main checkout');
    assert.throws(() => readFileSync(join(main, '.git'), 'utf8'), 'the main checkout has a .git folder, not a file');
  });
});

function quote(path) {
  return `'${path.replace(/'/g, "'\\''")}'`;
}

// The command the guard asks for: only the items the main checkout has, in the
// order index.md, conventions.md, decisions.md, patterns.
function copyCommand(main) {
  const items = ['index.md', 'conventions.md', 'decisions.md', 'patterns']
    .filter((item) => existsSync(join(main, '.vibeflow', item)));
  return `mkdir -p .vibeflow && cp -R ${items.map((item) => quote(join(main, '.vibeflow', item))).join(' ')} .vibeflow/`;
}

// Contract: the copy command the guard prints, built by its own rule (only what
// the main checkout has, in order, single quotes, `'\''` for a quote in the
// path) and run from the worktree root, brings the base in with patterns/ kept
// as a folder, and leaves the worktree's own specs alone. The guard's example
// is that same command for a main checkout without decisions.md.
// Breaks when: the example gains a trailing slash on patterns (BSD cp then
//   copies its contents flat into .vibeflow/), double quotes, a missing
//   `mkdir -p`, or an escape rule that does not survive a quote in the path.
// Not covered by: missing-base-contracts compares the example to a string and
//   never runs it.
test('the copy command, built by the guard\'s rule and run from the worktree root, brings the base in', () => {
  scratch((dir) => {
    const { main, linked } = repoWithWorktree(dir);
    mkdirSync(join(main, '.vibeflow', 'patterns', 'api'), { recursive: true });
    writeFileSync(join(main, '.vibeflow', 'index.md'), '# index\n');
    writeFileSync(join(main, '.vibeflow', 'conventions.md'), '# conventions\n');
    writeFileSync(join(main, '.vibeflow', 'patterns', 'api', 'routes.md'), '# routes\n');
    mkdirSync(join(linked, '.vibeflow', 'specs'), { recursive: true });
    writeFileSync(join(linked, '.vibeflow', 'specs', 'feature.md'), '# spec\n');

    const built = copyCommand(main);
    for (const w of WORKFLOWS) {
      for (const path of EDITIONS(w)) {
        const example = guardOf(read(path)).split('\n').find((l) => l.startsWith('mkdir -p .vibeflow && cp -R '));
        assert.ok(example, `${path}: the example command`);
        const filled = example.replaceAll("'<main>/", `'${main.replace(/'/g, "'\\''")}/`);
        assert.equal(filled, built, `${path}: the example is the rule's command for this main checkout`);
      }
    }
    const run = spawnSync('sh', ['-c', built], { cwd: linked, env: cleanEnv(), encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    for (const rel of ['index.md', 'conventions.md', 'patterns/api/routes.md', 'specs/feature.md']) {
      assert.ok(existsSync(join(linked, '.vibeflow', rel)), `.vibeflow/${rel} in the worktree`);
    }
    assert.ok(!existsSync(join(linked, '.vibeflow', 'decisions.md')), 'decisions.md is not invented');
    assert.ok(!existsSync(join(linked, '.vibeflow', 'api')), 'patterns stays a folder, not flattened');
    assert.equal(settleByGit(linked).linked, true);
  });
});

// Contract: a briefing written by briefings.md's rule for a project with no
// base (the "project knowledge" item becomes the fixed line, the auditor's
// first Read-first item drops `.vibeflow/index.md`) names no knowledge file,
// so `check-briefing.mjs` (I2) has nothing missing to stop on.
// Breaks when: a template gains another knowledge path outside its "project
//   knowledge" item (say `.vibeflow/decisions.md` in a fix template's first
//   item) that the none rule does not tell the orchestrator to drop.
// Not covered by: missing-base-contracts pins the paragraph's wording, not the
//   templates it is applied to.
test('briefings.md: every template, with the none rule applied, names no knowledge file', () => {
  const raw = readFileSync(join(KIT, 'briefings.md'), 'utf8');
  const blocks = [...raw.matchAll(/^## ([^\n]+)\n+```markdown\n([\s\S]*?)^```/gm)];
  assert.ok(blocks.length >= 4, 'the four role templates');
  for (const [, role, body] of blocks) {
    const none = body.split('\n').map((line) => {
      if (/^\* project knowledge:/.test(line)) return BRIEFING_NONE;
      if (role.trim() === 'Auditor' && line.startsWith('* `.vibeflow/index.md`, ')) return `* ${line.slice('* `.vibeflow/index.md`, '.length)}`;
      return line;
    }).join('\n');
    assert.ok(none.includes(BRIEFING_NONE), `${role}: the none line`);
    const left = none.split('\n').filter((line) => KNOWLEDGE_PATH.test(line));
    assert.deepEqual(left, [], `${role}: a knowledge path left after the none rule`);
  }
});

// Contract (I5 in the loop): the auditor role that a loop round runs under and
// the audit workflow agree on the header: the read receipt follows the
// `Knowledge base:` line, which follows `Base:`.
// Breaks when (open today, finding F1): the workflow moved the receipt below
//   the new `Knowledge base:` line and the three role files still say "right
//   after its `Base:` line", so a loop auditor gets two orders for one header.
// Not covered by: missing-base-contracts reads only the workflows, and
//   test/full-read-contracts.test.mjs pins the roles to the old sentence.
// Marked todo so the file stays green while F1 is open; drop `todo` once the
// three roles name the `Knowledge base:` line.
test('the auditor roles and the audit workflow name the same line before the read receipt', { todo: 'open finding F1: the roles still say "right after its `Base:` line"' }, () => {
  const workflow = flat(read('plugins/vibeflow/skills/audit/SKILL.md'));
  const said = /read receipt, its labels in English in any language, right after its `([^`]+)` line/.exec(workflow);
  assert.ok(said, 'the workflow names the line before the receipt');
  for (const path of ['plugins/vibeflow/skills/implement/loop/roles/auditor.md', 'plugins/vibeflow/agents/auditor.md', 'opencode/agents/auditor.md']) {
    const role = /carries the read receipt right after its `([^`]+)` line/.exec(flat(read(path)));
    assert.ok(role, `${path}: the role names the line before the receipt`);
    assert.equal(role[1], said[1], `${path}: the same line as the workflow`);
  }
});
