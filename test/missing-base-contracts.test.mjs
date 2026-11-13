// Contracts of the knowledge base guard. The knowledge base is what `analyze`
// writes (`.vibeflow/index.md`, `conventions.md`, `decisions.md`,
// `patterns/`), and its signal is `.vibeflow/index.md`, never the `.vibeflow/`
// folder, which `gen-spec` creates with only `specs/` in it. In a new worktree
// of a repository that does not track `.vibeflow/`, the base stays in the main
// checkout: gen-spec, implement, quick, prompt-pack and audit settle one of
// three states before writing anything, stop with the copy command when the
// base is missing here, and say in the audit report and in the PR body when
// there was no base. The loop kit carries the same contract: the preflight's
// `[stop] knowledge base:` line stops the loop, and a briefing without a base
// says so with a fixed line. Each assertion pins a literal of that contract in
// the three editions (shared, Cursor, Copilot) and in the kit, so a wording
// that drifts in one of them fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const KIT = 'plugins/vibeflow/skills/implement/loop';

const WORKFLOWS = ['gen-spec', 'implement', 'quick', 'prompt-pack', 'audit'];

const FIRST_LINE = 'Knowledge base missing in this worktree: <main>/.vibeflow/index.md exists in the main checkout.';
const COPY = "mkdir -p .vibeflow && cp -RL '<main>/.vibeflow/index.md' '<main>/.vibeflow/conventions.md' '<main>/.vibeflow/decisions.md' '<main>/.vibeflow/patterns' .vibeflow/";
const PRESENT = '- `present`: `.vibeflow/index.md` exists at the root of this checkout.';
const NONE = '- `none`: neither here nor in the main checkout, including the main checkout itself without `index.md` and a folder outside git.';
const MAIN_CHECKOUT = 'git worktree list --porcelain';
const TOPLEVEL = 'git rev-parse --show-toplevel';
// The guard's rule for a worktree of a submodule, with a shell and without one (fix round 2 of
// the pull request review).
const SUBMODULE_GIT = 'When that first path is a git folder and not a checkout, as in a worktree of a submodule (`<super>/.git/modules/<x>`), `<main>` is its `core.worktree`, from `git --git-dir=<that path> config core.worktree`, resolved from that path.';
const SUBMODULE_FILE = 'A file that says `gitdir: <super>/.git/modules/<x>/worktrees/<name>` makes this checkout a linked worktree of a submodule, whose main checkout is the `core.worktree` set in `<super>/.git/modules/<x>/config`, resolved from `<super>/.git/modules/<x>`.';
const CONSENT = 'goes on without the base only when the person says so in the conversation';
const SIGNAL = 'Its signal is `.vibeflow/index.md`';

const BASE_PRESENT = 'Knowledge base: .vibeflow/index.md';
const BASE_NONE = 'Knowledge base: none (no .vibeflow/index.md); patterns and conventions were not checked';
const BASE_TEMPLATE = 'Knowledge base: .vibeflow/index.md | none (no .vibeflow/index.md); patterns and conventions were not checked';
const RECEIPT = ['Read in full: <n> of <m>', '- <path> (<lines> lines)', 'Not read whole: none'];

const BRIEFING_NONE = '* project knowledge: none in this project (analyze has not run)';

const EM_DASH = '—';

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

function flat(text) {
  return text.replace(/\s+/g, ' ');
}

function between(content, from, to, label) {
  const start = content.indexOf(from);
  assert.notEqual(start, -1, `${label}: anchor "${from}"`);
  const end = content.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `${label}: anchor "${to}" after "${from}"`);
  return content.slice(start, end);
}

function rest(content, from, label) {
  const start = content.indexOf(from);
  assert.notEqual(start, -1, `${label}: anchor "${from}"`);
  return content.slice(start);
}

function fences(content) {
  return [...content.matchAll(/^[ \t]*```[^\n]*\n([\s\S]*?)^[ \t]*```/gm)]
    .map((match) => match[1].split('\n').map((line) => line.trim()).filter(Boolean));
}

function forEachEdition(workflow, fn) {
  for (const [edition, path] of Object.entries(editions(workflow))) fn(read(path), `${workflow} ${edition}`);
}

// The guard is one `## Knowledge base` section, from its heading to the next
// heading of the same level.
function guardOf(raw, label) {
  return between(raw, '\n## Knowledge base\n', '\n## ', `${label} guard`);
}

// ------------------------------------------------------------------ the guard

test('the guard: three states, decided by .vibeflow/index.md with the two git commands', () => {
  for (const workflow of WORKFLOWS) {
    forEachEdition(workflow, (raw, label) => {
      const guard = guardOf(raw, label);
      const text = flat(guard);
      assert.ok(text.includes(SIGNAL), `${label}: the signal is index.md`);
      assert.match(text, /a `\.vibeflow\/` folder that holds only `specs\/` or `prds\/` is not a knowledge base/, `${label}: the folder is not the signal`);
      for (const state of ['`present`', '`missing here`', '`none`']) {
        assert.ok(text.includes(`- ${state}:`), `${label}: the state ${state}`);
      }
      assert.ok(text.includes(PRESENT), `${label}: present is decided by .vibeflow/index.md, not by the folder`);
      assert.ok(text.includes(NONE), `${label}: none is neither here nor in the main checkout`);
      assert.ok(guard.includes(`\`${MAIN_CHECKOUT}\``), `${label}: the main checkout from ${MAIN_CHECKOUT}`);
      assert.ok(guard.includes(`\`${TOPLEVEL}\``), `${label}: this checkout from ${TOPLEVEL}`);
      assert.match(text, /both resolved with `realpath`/, `${label}: both paths resolved before comparing`);
      assert.match(text, /first `worktree <path>` line/, `${label}: the main checkout is the first worktree line`);
      assert.ok(text.includes(SUBMODULE_GIT), `${label}: the main checkout of a submodule's worktree, with a shell`);
      assert.ok(text.includes(SUBMODULE_FILE), `${label}: the main checkout of a submodule's worktree, without a shell`);
      assert.match(text, /a file that says `gitdir: <path>\/\.git\/worktrees\/<name>` makes this checkout a linked worktree whose main checkout is `<path>`, resolved from this checkout's root when it is relative\. The root is the folder that holds `\.git`, found by going up from the current folder\./, `${label}: the no-shell path resolves a relative gitdir from the root, and says what the root is`);
    });
  }
});

test('the guard: missing here stops with the literal first line, the copy command and the consent sentence', () => {
  for (const workflow of WORKFLOWS) {
    forEachEdition(workflow, (raw, label) => {
      const guard = guardOf(raw, label);
      const text = flat(guard);
      assert.ok(text.includes(`The reply's first line is \`${FIRST_LINE}\`, with nothing before it.`), `${label}: the first line, literal, with nothing before it`);
      assert.match(text, /That line stays in English in any output language\./, `${label}: the first line is not translated`);
      assert.ok(fences(guard).some((lines) => lines.length === 1 && lines[0] === COPY), `${label}: the copy command in a code block, with the four items`);
      assert.match(text, /lists only the items the main checkout has, in the order `index\.md`, `conventions\.md`, `decisions\.md`, `patterns`/, `${label}: only what exists, in order`);
      assert.match(text, /Before writing it, check each of the four by its path in the main checkout and leave out only the ones that do not exist\./, `${label}: each of the four checked by its path`);
      assert.ok(text.includes(CONSENT), `${label}: going on without the base needs the person's word`);
      assert.match(text, /with that word, it runs as in the `none` state/, `${label}: then as none`);
    });
  }
});

test('the guard: no em dash in its lines', () => {
  for (const workflow of WORKFLOWS) {
    forEachEdition(workflow, (raw, label) => {
      assert.ok(!guardOf(raw, label).includes(EM_DASH), `${label}: the guard has no em dash`);
    });
  }
});

// The guard comes before the first file the workflow writes or the first
// round it dispatches.
const BEFORE = {
  'gen-spec': ['## Before writing the spec', 'Save the spec to `.vibeflow/specs/'],
  implement: ['## Phase 0: Find and validate the spec'],
  quick: ['## Phase 0: Check context', 'Save it to `.vibeflow/prompt-packs/'],
  'prompt-pack': ['## Steps', 'Save the prompt pack to'],
  audit: ['## Steps', '1. **Review package**'],
};

test('the guard comes before any write or dispatch', () => {
  for (const workflow of WORKFLOWS) {
    forEachEdition(workflow, (raw, label) => {
      const at = raw.indexOf('\n## Knowledge base\n');
      assert.notEqual(at, -1, `${label}: the guard section`);
      for (const anchor of BEFORE[workflow]) {
        const later = raw.indexOf(anchor);
        assert.notEqual(later, -1, `${label}: anchor "${anchor}"`);
        assert.ok(at < later, `${label}: the guard before "${anchor}"`);
      }
    });
  }
});

test('implement: the guard holds with and without --loop, and the loop stops at the preflight line', () => {
  forEachEdition('implement', (raw, label) => {
    const text = flat(guardOf(raw, label));
    assert.match(text, /with or without `--loop`/, `${label}: both modes`);
    assert.match(text, /`\[stop\] knowledge base:` line stops it before any dispatch/, `${label}: the loop stops at the preflight`);
    assert.match(text, /With `--loop`, or with `loop: true` in `\.vibeflow\/loop\/config\.md`, that word does not open the loop/, `${label}: both ways the loop opens`);
  });
});

// ------------------------------------------------- none decided by index.md

const FOLDER_DECISIONS = [
  'No `.vibeflow/` →',
  "If `.vibeflow/` doesn't exist",
  '`.vibeflow/` exists → skip',
  "If `.vibeflow/` didn't exist",
  'Load context from `.vibeflow/`, if it exists',
  'only without `.vibeflow/`',
  'With `.vibeflow/`,',
  'from `.vibeflow/patterns/`, when it exists',
  'with `.vibeflow/`, embed',
  'Phase 2, with `.vibeflow/`',
];

test('no workflow decides by the .vibeflow/ folder any more', () => {
  for (const workflow of WORKFLOWS) {
    forEachEdition(workflow, (raw, label) => {
      const text = flat(raw);
      for (const phrase of FOLDER_DECISIONS) {
        assert.ok(!text.includes(phrase), `${label}: still decides by the folder: "${phrase}"`);
      }
    });
  }
});

test('the none state keeps today\'s warn-and-go-on, in the place each workflow loads its context', () => {
  forEachEdition('gen-spec', (raw, label) => {
    const step2 = flat(between(raw, '2. Load context from `.vibeflow/`', '3. Identify what exists today', label));
    assert.match(step2, /^2\. Load context from `\.vibeflow\/` when the knowledge base is `present`:/, `${label}: step 2 loads only a present base`);
    assert.match(step2, /In the `none` state, warn that results improve after [^,]*analyze[^,]*, then read the relevant code directly\./, `${label}: none warns and goes on`);
  });
  forEachEdition('implement', (raw, label) => {
    const phase2 = flat(between(raw, '## Phase 2: Load context from .vibeflow/', '## Phase 3', label));
    assert.match(phase2, /In the `none` state of the knowledge base, warn that implementation proceeds without pattern guidance \(suggest [^)]*analyze[^)]*\) and skip to Phase 3\./, `${label}: none warns and skips`);
  });
  forEachEdition('quick', (raw, label) => {
    const phase0 = flat(between(raw, '## Phase 0: Check context', '## Phase 1', label));
    assert.match(phase0, /Knowledge base `present` → skip to Phase 2 and use it\. `none` → Phase 1\./, `${label}: Phase 0 routes by the state`);
    assert.match(raw, /## Phase 1: Lightweight scan \(only in the `none` state\)/, `${label}: Phase 1 runs in none`);
    const report = flat(rest(raw, '## After saving', label));
    assert.match(report, /- In the `none` state: remind them [^\n]*analyze[^\n]* makes the next run richer/, `${label}: the reminder in none`);
  });
  forEachEdition('prompt-pack', (raw, label) => {
    const step2 = flat(between(raw, '2. Read `.vibeflow/conventions.md`', '3. Read the codebase files', label));
    assert.match(step2, /In the `none` state, skip this step: warn that the pack improves after [^,]*analyze[^,]*, and section 4 carries the conventions the codebase files of step 3 show\./, `${label}: none warns and goes on`);
  });
  forEachEdition('audit', (raw, label) => {
    const step2 = flat(between(raw, '2. **Spec** (`2/7 spec`)', '3. **Tests** (`3/7 tests`)', label));
    assert.match(step2, /In the `none` state there is no `\.vibeflow\/conventions\.md` and no pattern doc to read:/, `${label}: none reads no base`);
  });
});

// ------------------------------------------------------------ I5, the report

test('audit: the report template carries the Knowledge base line between Base and the receipt', () => {
  forEachEdition('audit', (raw, label) => {
    const template = between(raw, '## Output format', '## Verdict rules', label);
    const lines = template.split('\n').map((line) => line.trim());
    const base = lines.indexOf('Base: <sha>');
    assert.notEqual(base, -1, `${label}: the Base line`);
    assert.equal(lines[base + 1], BASE_TEMPLATE, `${label}: the Knowledge base line right after Base`);
    assert.deepEqual(lines.slice(base + 2, base + 5), RECEIPT, `${label}: the receipt follows it`);
  });
});

test('audit: the text says when each form of the line comes out, and that no verdict goes out without it', () => {
  forEachEdition('audit', (raw, label) => {
    const text = flat(raw);
    assert.ok(text.includes(`\`${BASE_PRESENT}\` in the \`present\` state`), `${label}: the present form`);
    assert.ok(text.includes(`\`${BASE_NONE}\` in the \`none\` state, and in the \`missing here\` state when the person said to go on without it`), `${label}: the none form`);
    assert.match(text, /A PASS can carry the `none` line; no verdict goes out without the `Knowledge base:` line\./, `${label}: PASS with none, never without the line`);
    assert.match(text, /the header labels and their fixed values \([^)]*`Base`, `Knowledge base`/, `${label}: the label stays in English`);
    const step2 = flat(between(raw, '2. **Spec** (`2/7 spec`)', '3. **Tests** (`3/7 tests`)', label));
    assert.match(step2, /read receipt, its labels in English in any language, right after its `Knowledge base:` line/, `${label}: the receipt follows the new line`);
  });
});

// Since the scripts leave a new, untracked knowledge base out of the review
// package, the audit's step 1 says so: a tracked base that changed comes in, an
// untracked one stays out, counted, and the audit reads it on disk.
const PACKAGE_BASE = 'Neither does the rest of `.vibeflow/` (specs, PRDs, the knowledge base): specs, PRDs and a tracked knowledge base that changed come in as context when something changed outside it, and a new, untracked knowledge base (the main checkout\'s, brought into a worktree) stays out, counted by the package\'s `Knowledge base left out:` line; step 2 reads it on disk, as the Knowledge base section says.';

test('audit: the review package step says an untracked knowledge base stays out, counted, and is read on disk', () => {
  forEachEdition('audit', (raw, label) => {
    const step1 = flat(between(raw, '1. **Review package**', '2. **Spec** (`2/7 spec`)', label));
    assert.ok(step1.includes(PACKAGE_BASE), `${label}: the package sentence on the knowledge base`);
    assert.ok(!step1.includes('the knowledge base), which the package shows as context'), `${label}: no longer says the package shows the base as context`);
  });
});

// ------------------------------------------------------------- I6, the PR body

test('pr-body.md: the Knowledge base line in the evidence, required in the none state', () => {
  const raw = read(`${KIT}/pr-body.md`);
  const block = fences(raw).find((lines) => lines.includes('## Verdict per part'));
  assert.ok(block, 'pr-body.md: the body template');
  const verdict = block.indexOf('## Verdict per part');
  const line = block.indexOf(BASE_TEMPLATE);
  assert.notEqual(line, -1, 'pr-body.md: the Knowledge base line, as in the audit report');
  assert.ok(line > verdict && line < block.indexOf('## Definition of Done'), 'pr-body.md: in the Verdict per part section');
  const text = flat(raw);
  assert.match(text, /In the `none` state the `Knowledge base:` line is required/, 'pr-body.md: required in none');
  for (const l of raw.split('\n').filter((l) => l.includes('Knowledge base'))) {
    assert.ok(!l.includes(EM_DASH), `pr-body.md: no em dash in "${l}"`);
  }
});

// -------------------------------------------------------- I7, the loop kit

test('briefings.md: the project knowledge line of a project with no base', () => {
  const raw = read(`${KIT}/briefings.md`);
  assert.ok(raw.split('\n').some((l) => l.trim() === `\`${BRIEFING_NONE}\``) || flat(raw).includes(`\`${BRIEFING_NONE}\``), 'briefings.md: the line, literal');
  const text = flat(raw);
  assert.match(text, /In a project with no knowledge base \(the preflight's `\[attention\] knowledge base: none` line\)/, 'briefings.md: when the line applies');
  assert.match(text, /no path of the knowledge base under `\.vibeflow\/`/, 'briefings.md: no knowledge path, so check-briefing does not stop');
  assert.match(text, /the auditor's first `Read first` item drops `\.vibeflow\/index\.md`/, 'briefings.md: the auditor template too');
  for (const l of raw.split('\n').filter((l) => /knowledge base|project knowledge: none/i.test(l))) {
    assert.ok(!l.includes(EM_DASH), `briefings.md: no em dash in "${l.slice(0, 60)}"`);
  }
});

test('orchestrator.md: the preflight line stops the loop, and the perimeter leaves an untracked base out by itself', () => {
  const raw = read(`${KIT}/orchestrator.md`);
  const text = flat(raw);
  assert.match(text, /A `\[stop\] knowledge base:` line stops the loop before any dispatch/, 'orchestrator.md: the stop line');
  assert.match(text, /with the copy command it carries/, 'orchestrator.md: the copy command goes to the user');
  assert.ok(text.includes(BRIEFING_NONE), 'orchestrator.md: the none line of the briefings');
  assert.match(text, /`perimeter\.mjs` and `review-package\.mjs` leave a new, untracked knowledge base under `\.vibeflow\/` out by themselves, with their `Knowledge base left out:` line/, 'orchestrator.md: I3 needs no glob');
  for (const l of raw.split('\n').filter((l) => /knowledge base/i.test(l))) {
    assert.ok(!l.includes(EM_DASH), `orchestrator.md: no em dash in "${l.slice(0, 60)}"`);
  }
});

// The same literals in every edition of each workflow: the guard is the same
// text, so the Cursor and Copilot copies cannot drift from the shared one.
test('the guard is the same text in the three editions of each workflow', () => {
  for (const workflow of WORKFLOWS) {
    const texts = Object.entries(editions(workflow)).map(([edition, path]) => [edition, flat(guardOf(read(path), `${workflow} ${edition}`))]);
    for (const [edition, text] of texts.slice(1)) {
      assert.equal(text, texts[0][1], `${workflow} ${edition}: the guard as in the shared edition`);
    }
  }
});
