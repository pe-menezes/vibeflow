---
name: quick
description: >
  Fast-tracks small tasks into a ready-to-use prompt pack in one command. Skips
  discover, generates an ephemeral spec in memory, and outputs a prompt pack with
  embedded patterns. Use for well-defined tasks that fit in ≤4 files.
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch
---

## Description and examples

**What it does:** For small, well-defined tasks (e.g. tiny feature, small planned change), skips PRD and full spec: generates a minimal spec in memory and a prompt pack you can hand to the coding agent. Task should fit in ≤4 files.

**Examples:**
- `quick corrigir formatação de data no dashboard` — One command; you get a prompt pack and can paste it to the agent.
- `quick adicionar botão de exportar CSV na tela de relatórios` — Same; use when scope is clear and small.

---

## Language

Detect the language of the user's current request or conversation.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

## Web Search Policy

Use WebSearch and WebFetch only when local context (`.vibeflow/`, codebase,
git history) is insufficient — an unfamiliar framework or API. Local first.

Fast-track the prompt pack requested by the user.

## When to use

Small planned tasks and features with clear requirements, fitting in ≤4
files, when you want a prompt pack now rather than a paper trail. Not for:

- An observed defect with reproducible evidence → use `hotfix`.
- The idea is vague → use `discover` first.
- You need full documentation for the team → use the full pipeline.
- The task is large or architecturally significant → use `gen-spec`.

## Knowledge base

The knowledge base is what the analyze workflow writes: `.vibeflow/index.md`,
`.vibeflow/conventions.md`, `.vibeflow/decisions.md` and `.vibeflow/patterns/`.
Its signal is `.vibeflow/index.md`, which only analyze writes: a `.vibeflow/`
folder that holds only `specs/` or `prds/` is not a knowledge base. Check
`.vibeflow/index.md` by its path, because search tools respect `.gitignore`
and miss it. Before writing anything, settle which of three states
holds:

- `present`: `.vibeflow/index.md` exists at the root of this checkout.
- `missing here`: it does not, this checkout is a linked worktree, and the
  main checkout has `<main>/.vibeflow/index.md`. `<main>` is the path on the
  first `worktree <path>` line of `git worktree list --porcelain`; this
  checkout is a linked worktree when that path differs from
  `git rev-parse --show-toplevel` run here, both resolved with `realpath`
  (macOS puts `/private` in front of `/var` and `/tmp`). Where the host gives
  no shell, read `.git` at the root by its path: a file that says
  `gitdir: <path>/.git/worktrees/<name>` makes this checkout a linked worktree
  whose main checkout is `<path>`, resolved from this checkout's root when it
  is relative. The root is the folder that holds `.git`, found by going up
  from the current folder.
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
mkdir -p .vibeflow && cp -R '<main>/.vibeflow/index.md' '<main>/.vibeflow/conventions.md' '<main>/.vibeflow/decisions.md' '<main>/.vibeflow/patterns' .vibeflow/
```

The reply ends saying that this command goes on without the base only when
the person says so in the conversation; with that word, it runs as in the
`none` state.

## Phase 0: Check context

Knowledge base `present` → skip to Phase 2 and use it. `none` → Phase 1.

## Phase 1: Lightweight scan (only in the `none` state)

Enough to understand the project, and no more — this doesn't generate
`.vibeflow/` and writes nothing to disk:

1. The project's config files, for the stack.
2. The top 2 directory levels, for the structural units.
3. Three or four key files: the entry point, one route or handler, one
   model or type definition, one test (if present).
4. `.cursorrules`, `CLAUDE.md`, or `.cursor/rules/`, if present, for conventions.

Findings stay in memory. At the end, suggest: "For deeper analysis, run
`analyze`."

## Phase 2: Generate the ephemeral spec

From `.vibeflow/` or the Phase 1 context, build a spec **in memory only** —
never saved to a file — containing:

- **Objective** — 1 sentence. What changes for the user.
- **Definition of Done** — 3-5 binary checks (fewer than a standard spec).
- **Scope** — What's in. Keep it tight.
- **Anti-scope** — What's explicitly out. Be aggressive.
- **Budget** — ≤4 files, tighter than the standard ≤6. A task that clearly
  needs more gets a warning in the user's language: "This task may be too
  large for quick. Consider using `gen-spec`."
- **Applicable Patterns** — from `.vibeflow/patterns/`, when the base is `present`.

No Technical Decisions and no Risks sections — this is the fast track.

When the base is `present`, the documents the pack draws on are
`.vibeflow/conventions.md` and each pattern doc the ephemeral spec lists. Read
each of these documents whole, one file per read: open it with your
file-reading tool, without an offset or a limit, and never several files in one
shell command. When a read comes back cut (a preview, a notice that the output
was saved to a file, a line or size limit), keep reading from where it stopped
to the last line. A list of headings or a keyword search is not a read.

When the base is `present`, the reply ends with the read receipt, its labels in English
in any language; in the "After saving" report only the suggestion comes after
it:

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

## Phase 3: Generate the prompt pack

Same structure `prompt-pack` produces, from the ephemeral spec and
whatever knowledge you have. It opens with the line

> You are only seeing this prompt; there is no context outside it.

then, in order:

1. **Objective and Definition of Done** — from the ephemeral spec.
2. **Anti-scope** — what not to do.
3. **Budget** — the ≤4 files from Phase 2.
4. **Patterns to follow** — when the base is `present`, embed real code examples
   from the pattern docs and conventions.md; in the `none` state, what the Phase 1
   scan observed.
5. **Where to work** — real file paths, verified, with the relevant snippets.
6. **Directional guidance** — architectural direction, not step-by-step.
7. **How to run and test** — required. Detect the runner and include the
   command; none detected → "No test runner detected. Add manual tests to
   validate."

Save it to `.vibeflow/prompt-packs/<feature-slug>.md` (create the directory if
it doesn't exist).

## After saving, report to the user:

- Path of the generated prompt pack
- Objective and DoD in 2-3 lines
- The read receipt from Phase 2, when the base is `present`
- In the `none` state: remind them `analyze` makes the next
  run richer
- Suggest: "After implementing, run `audit` to verify."

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
