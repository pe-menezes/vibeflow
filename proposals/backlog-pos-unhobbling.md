# Backlog: findings from the unhobbling series

> Status: **open** — items 1–3 and 5 remain; item 4 closed 2026-08-15.
> Origin: audits of `unhobbling-geracao-5`, parts 1 and 7
> (`.vibeflow/audits/`, gitignored — this file is the durable copy).
> Related: `proposals/unhobbling-style.md` (the series' normative guide).

The series `unhobbling-geracao-5` rewrites vibeflow's 35 prompt surfaces in the
Claude 5 dialect. Its hard constraint is **style only, zero functional change**,
so anything that turned out to need a behavior change was recorded instead of
fixed. Four items came out of it — three below in descending order of who they
hurt, plus one gap in the series' own validation. Closing that gap added a
fifth: item 5 was found by the smoke test the gap called for.

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

## 4. The pipeline smoke test never ran — done, contract half

**Closed 2026-08-15.** Harness in `test/`, work order in
`proposals/pipeline-smoke-test.md`.

The PRD set five Success Criteria. Criterion 3 — the pipeline
`analyze → gen-spec → implement → audit` running end to end on a sample repo,
with artifacts at the right paths and formats intact — never entered any spec's
DoD, so it never ran. It has now run.

`node test/run-smoke.mjs` generates a Node fixture, installs one arm's skills
into it, drives five headless sessions, and asserts the artifact contract.
Result on opus, one run per arm, 2026-08-15:

| | new prompts | old prompts (v1.12.0) |
|---|---|---|
| assertions | 23 pass, 1 unchecked | 23 pass, 1 unchecked |
| audit verdict | PASS | PASS |
| files touched by `implement` | 2, budget ≤ 4 | 2, budget ≤ 4 |
| fixture tests after `implement` | pass | pass |
| cost / wall | $4.16 / 672s | $4.40 / 694s |

Both arms produce well-formed artifacts at the right paths. The one difference
the contract detects: the new pack carries a `References from the spec`
section, which part 8 introduced and the old prompts have no notion of.

What remains open is the half the work order deliberately excluded: whether the
rewritten prompts produce *better* artifacts. One run per arm measures noise,
and a comparison judged by whoever made the change is not evidence. The shape
that would answer it — ≥5 runs per arm, artifacts stripped of any arm marker, a
reader who did not write the prompts scoring against a rubric fixed in advance —
is written up in `test/README.md`. It produces weak evidence even done well,
which is worth knowing before anyone pays for it.

One consequence of the original gap still stands: the nine audits of the series
were themselves run with the **old** `audit` prompt, since the installed plugin
was v1.12.0.

## 5. `prompt-pack` names two of its own sections inconsistently

**Real defect, pre-existing, cosmetic in effect.** Found by the smoke test on
2026-08-15; present identically in v1.12.0 and in the rewritten prompt, so the
unhobbling series neither introduced nor fixed it.

`claude-code/skills/prompt-pack/SKILL.md` names two sections twice, and not
identically. Its outline of the pack's structure says one thing; the format
block it tells the agent to emit says another:

| Outline says | Format block says | What packs emit |
|---|---|---|
| `### 4. Project patterns to follow` | `## Patterns to Follow` | `## Patterns to Follow` |
| `### 8. How to run and test` | `## How to validate` | `## How to validate` |

Agents follow the format block, which is the more specific instruction, so the
packs are consistent with each other and nothing downstream breaks. Measured on
both arms: the section is present and correctly populated in every run.

The cost is to anyone reading or checking the prompt — the section has no single
name, so a reader matching the outline against a real pack finds a mismatch that
is not a defect. That is exactly what happened while building the smoke test:
two assertions were written against the outline names and had to be corrected
against the format blocks.

**What a fix has to handle.** Picking one spelling per section is a one-line
edit in three editions (`claude-code`, `copilot`, `cursor` — see the file
mapping in `CLAUDE.md`). The question a spec has to settle first is which name
wins, since the outline names read better in prose and the format-block names
are what every existing pack in the wild already uses. Changing the emitted
names would make old and new packs differ for no user-visible gain, so the
outline is probably what should move.
