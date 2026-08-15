# Backlog: findings from the unhobbling series

> Status: **open** — none of these were done inside the series.
> Origin: audits of `unhobbling-geracao-5`, parts 1 and 7
> (`.vibeflow/audits/`, gitignored — this file is the durable copy).
> Related: `proposals/unhobbling-style.md` (the series' normative guide).

The series `unhobbling-geracao-5` rewrites vibeflow's 35 prompt surfaces in the
Claude 5 dialect. Its hard constraint is **style only, zero functional change**,
so anything that turned out to need a behavior change was recorded instead of
fixed. Three items came out of it, in descending order of who they hurt.

## 1. `--force` reinstall accumulates a stray `<!-- vibeflow:end -->`

**Real installer bug, pre-existing, affects installed users.** Found while
verifying part 7; identical before and after that part, in both editions.

The shipped `AGENTS.md` and `copilot-instructions.md` carry the
`<!-- vibeflow:start/end -->` markers *inside* the region the CLI extracts, and
`upsertDelimitedBlock` wraps the extracted text in markers again. The installed
file is born with nested pairs:

```
<!-- vibeflow:start -->
<!-- vibeflow:start -->
## Vibeflow Methodology
...
<!-- vibeflow:end -->
<!-- vibeflow:end -->
```

On reinstall, `existing.indexOf(VIBEFLOW_END)` matches the **inner** marker, so
everything after it — including the outer `<!-- vibeflow:end -->` — is
re-appended after the new block. Measured with the real CLI, `--cursor --force`
over an existing install: START 2 → 2, END 2 → **3**. Every further `--force`
adds one more.

First install is unaffected (the common path), and the block stays delimited,
so nothing is currently broken for users who install once.

**What a fix has to handle.** Two candidate approaches, and the hard part is
the same for both:

- Stop double-wrapping in `cli/index.js` — but then the shipped files' markers
  become decorative, and the doc that describes them has to say so.
- Drop the markers from the shipped source region — but the files are also
  meant to be copy-pasted by hand, where the markers are what makes the block
  identifiable.

Either way, the migration matters more than the fix: installs already carrying
the nested shape must converge to the correct one rather than gaining a third
marker. That is why this deserves its own spec instead of a one-line patch.

**Collateral.** Two records claim this already works:

- `.vibeflow/patterns/delimited-marker-blocks.md` states "never duplicate" and
  "Anti-patterns: None observed". Both are wrong today.
- The v0.12.0 CHANGELOG entry says "Running `npx setup-vibeflow --force` no
  longer duplicates the vibeflow block in `AGENTS.md` or
  `copilot-instructions.md`". That fix was partial: it stopped the whole block
  from being duplicated, but left the nested markers accumulating one
  `<!-- vibeflow:end -->` per `--force`.

Both should be corrected alongside the fix — the CHANGELOG by a note in the
entry that closes this, not by rewriting v0.12.0's.

## 2. `vibeflow-implement` is missing from all four command lists

**Documentation gap, low effort.** `implement` has existed in all 3 editions
since v1.12.0 and is in `COPILOT_FILES` / `CURSOR_FILES`, so it installs — but
the persistent layer's command lists omit it:

- `copilot/github/instructions/vibeflow/vibeflow.instructions.md`
- `cursor/rules/vibeflow.mdc`
- `copilot/AGENTS.md`
- `cursor/AGENTS.md`

Each lists 8 commands. The pipeline line right above the list already reads
`discover → analyze → gen-spec → prompt-pack → implement → audit`, so the file
names the command and then leaves it out of its own index.

Part 7 preserved the omission: adding a command to the list a user reads is a
content change, not a style one. Four lines in four files — but check the
README command tables and `MANUAL.md` in the same pass.

## 3. A spec that changes a convention should carry the `teach` in its DoD

**Methodology improvement — belongs to vibeflow the product, not to this repo.**

Part 1 made `proposals/unhobbling-style.md` normative and, in doing so,
outdated `.vibeflow/conventions.md` and `patterns/command-doc-structure.md` —
but neither the spec nor its audit anticipated the propagation. Part 2 then ran
against a `.vibeflow/` that contradicted its own spec.

**Proposal:** when a spec changes a convention, a pattern, or the project's
dialect, its DoD should include propagating that to `.vibeflow/`. Today it
depends on someone remembering to run `/vibeflow:teach` afterwards. Candidate
as a rule in `gen-spec` (detect a convention change → require a propagation
check) or as a checklist item in `audit`.
