---
name: 'vibeflow-prompt-pack'
description: 'Generates a self-contained prompt pack from a spec with embedded patterns for any coding agent.'
agent: 'vibeflow-architect'
---

# Vibeflow: Prompt Pack

> format-agnostic, repo-local prompt asset

Build a self-contained prompt pack from a spec, for a coding agent that has no
context beyond the prompt itself. Real patterns from `.vibeflow/` go in it.

**Usage:** Provide the spec file path or feature name as input.

---

## Language

Write the whole pack — opening line, objective, DoD, anti-scope, guidance — in
the user's detected language. Code, paths, and technical names stay in English.

## Knowledge base

The knowledge base is what the analyze workflow writes: `.vibeflow/index.md`,
`.vibeflow/conventions.md`, `.vibeflow/decisions.md` and `.vibeflow/patterns/`.
Its signal is `.vibeflow/index.md`, which only analyze writes: a `.vibeflow/`
folder that holds only `specs/` or `prds/` is not a knowledge base. Check
`.vibeflow/index.md` by its path, because search tools respect `.gitignore`
and miss it. Before step 0, and before any file is written, settle which
of three states holds:

- `present`: `.vibeflow/index.md` exists at the root of this checkout.
- `missing here`: it does not, this checkout is a linked worktree, and the
  main checkout has `<main>/.vibeflow/index.md`. `<main>` is the path on the
  first `worktree <path>` line of `git worktree list --porcelain`; this
  checkout is a linked worktree when that path differs from
  `git rev-parse --show-toplevel` run here, both resolved with `realpath`
  (macOS puts `/private` in front of `/var` and `/tmp`).
  When that first path is a git folder and not a checkout, as in a worktree of
  a submodule (`<super>/.git/modules/<x>`), `<main>` is its
  `core.worktree`, from `git --git-dir=<that path> config core.worktree`,
  resolved from that path. Where the host gives no shell,
  read `.git` at the root by its path: a file that says
  `gitdir: <path>/.git/worktrees/<name>` makes this checkout a linked worktree
  whose main checkout is `<path>`, resolved from this checkout's root when it
  is relative. The root is the folder that holds `.git`, found by going up
  from the current folder.
  A file that says `gitdir: <super>/.git/modules/<x>/worktrees/<name>` makes
  this checkout a linked worktree of a submodule, whose main checkout is the
  `core.worktree` set in `<super>/.git/modules/<x>/config`, resolved from
  `<super>/.git/modules/<x>`.
- `none`: neither here nor in the main checkout, including the main checkout
  itself without `index.md` and a folder outside git.

In the `missing here` state, stop. The reply's first line is
`Knowledge base missing in this worktree: <main>/.vibeflow/index.md exists in the main checkout.`,
with nothing before it. That line stays in English in any output language.
Then comes, in a code block, the command that brings the base into this
worktree, run from its root. It lists only the items the main checkout
has, in the order `index.md`, `conventions.md`, `decisions.md`, `patterns`.
Before writing it, check each of the four by its path in the main checkout
and leave out only the ones that do not exist. Each path goes in single
quotes (a single quote inside a path becomes `'\''`), as in:

```
mkdir -p .vibeflow && cp -RL '<main>/.vibeflow/index.md' '<main>/.vibeflow/conventions.md' '<main>/.vibeflow/decisions.md' '<main>/.vibeflow/patterns' .vibeflow/
```

The reply ends saying that this command goes on without the base only when
the person says so in the conversation; with that word, it runs as in the
`none` state.

## Steps

0. **Validate spec size.** Read the spec: more than 7 DoD checks, or over the
   budget (the spec's Budget field, else the `Suggested budget` line in
   `.vibeflow/index.md`, else ≤6 files), and you stop without generating the
   pack — tell the user it exceeds limits (N checks / N files) and to run
   the vibeflow-gen-spec prompt again to split it first.
1. Locate the spec: a file path is read directly; a feature description is
   matched against `.vibeflow/specs/`. No spec exists → generate one in the
   gen-spec format, save it, then continue.
2. Read `.vibeflow/conventions.md`, plus the pattern docs the spec lists under
   Applicable Patterns. If it lists none, resolve them: read the
   `## Pattern Registry` block in `index.md` (between
   `<!-- vibeflow:patterns:start/end -->` markers) and cross-reference its tags
   and modules against the spec's scope — top 3–5 matches; with no registry,
   infer which are relevant.
   The spec's `Documents to read:` line counts these documents; in a spec
   without that line, the list is found as before, and only the list: its
   documents are read whole all the same. Read each of these documents whole, one file
   per read: open it with your file-reading tool, without an offset or a limit,
   and never several files in one shell command. When a read comes back cut (a
   preview, a notice that the output was saved to a file, a line or size
   limit), keep reading from where it stopped to the last line. A list of
   headings or a keyword search is not a read.
   In the `none` state, skip this step: warn that the pack improves after the
   vibeflow-analyze prompt, and section 4 carries the conventions the codebase
   files of step 3 show.
3. Read the codebase files this task touches, plus anything the spec lists
   under References.
4. Generate the pack.

## The pack opens with

> You are only seeing this prompt; there is no context outside it.

## Then, in this order

### 1. Objective and Definition of Done
From the spec. Non-negotiable.

### 2. Anti-scope
What not to do, from the spec.

### 3. Budget
Max files to change — the budget resolved in step 0.

### 4. Project patterns to follow
What decides whether the pack works. Copy the relevant sections of
`.vibeflow/patterns/*.md` and `.vibeflow/conventions.md` in full, with their
real code examples — the receiving agent cannot open files you reference.
Format:

```markdown
## Patterns to Follow

### <Pattern Name>
<description>
<real code example from this project showing the pattern>

### Coding Conventions
<relevant conventions for this task>
```

### 5. References from the spec
Only when the spec lists References. Same self-containment rule as the
patterns: embed the mockup, the test file, or the snippet the implementation
has to match, in full. Too large to embed → give the verified path and say what
the agent should take from it. A reference that is neither embedded nor
reachable by the receiving agent doesn't belong in the pack.

### 6. Where to work
Real file paths from the codebase, with the code snippets that give them
context.

### 7. Directional guidance
Architectural direction and constraints to respect, not step-by-step
instructions. The pack carries this contract, adapted to the task:

> Deliver what the spec asks, at the scope it defines. Make routine judgment
> calls yourself; check in only when different readings would lead to
> materially different work. If the spec seems mistaken, say so in a sentence
> and continue as specified. Finish the whole task, and stop short of changes
> clearly beyond it. Match what you write — code, docs, comments — to what the
> task needs, without filler or boilerplate.

### 8. How to run and test
Required. Detect the runner from `.vibeflow/index.md` or the project's config
files and include the command, plus any the spec lists. None detected → "No
test runner detected. Add manual tests to validate." Format:

```
## How to validate
1. Run tests: <detected command>
2. Verify manually: [description]
```

### 9. Docs to update
Which docs need changes after implementation.

Flag any path you could not verify with `<!-- TODO: verify this path -->`.

Save the prompt pack to `.vibeflow/prompt-packs/<feature-slug>.md` (create the
directory if it doesn't exist).

The reply ends with the read receipt, its labels in English in any language;
only the next-step suggestion below comes after it:

```
Read in full: <n> of <m>
- <path> (<lines> lines)
Not read whole: none
```

One `- <path> (<lines> lines)` line per document read whole, its path relative
to the project root. When a document was not read whole, `Not read whole:`
stands alone and each such document follows on its own line, `- <path>: <why>`,
and the reply says so. The receipt is what this session actually read: a
document not read to its last line goes under `Not read whole`, and a document
read to its last line over more than one read, each read starting from where the previous read stopped, counts as read whole.

After saving, suggest: "Prompt pack saved. Hand it off to the coding agent.
After implementation, use the vibeflow-audit prompt with the spec to verify."
