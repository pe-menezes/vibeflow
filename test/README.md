# Pipeline smoke test

Runs `analyze → gen-spec → prompt-pack → implement → audit` end to end against
a generated fixture, once with the prompts in this repo and once with the
pre-series v1.12.0 prompts, and asserts that the artifacts match the contract
the prompts specify.

```
node test/run-smoke.mjs                    both arms, model opus
node test/run-smoke.mjs --arm new          treatment arm only
node test/run-smoke.mjs --model sonnet     pin a different model
node test/run-smoke.mjs --workdir /tmp/x   somewhere other than $TMPDIR
```

Exit code 0 when every assertion passes on the new arm, 1 otherwise, with each
failed assertion named.

`--arm` accepts only `new`; any other value aborts with an error rather than
silently filtering every arm out and passing over zero assertions. The harness
never deletes the `--workdir` root — it only clears and rewrites the
`arm-<id>` subdirectories it creates, plus `results.json`.

## What it checks

The artifact contract, per stage. Formats come from the prompts in
`plugins/vibeflow/skills/*/SKILL.md`, which are the specification — where a prompt
and this table disagree, the prompt wins.

| Stage | Assertions |
|---|---|
| `analyze` | `index.md` exists · `vibeflow:patterns` markers balanced in `index.md` · `vibeflow:auto` markers balanced per generated file · a `Suggested budget: ≤ N` line · ≥1 pattern doc · every `patterns/*.md` has YAML frontmatter ahead of the auto markers |
| `gen-spec` | spec in `.vibeflow/specs/` · eight named sections present · DoD holds 3–7 checks · ≥1 craftsmanship check · ≥1 check naming an executable test |
| `prompt-pack` | pack in `.vibeflow/prompt-packs/` · opening self-containment line · eight sections present and in order · fixture source found inside a code fence · spec `## References` propagated into the pack when the spec has the section (explicit skip when it does not) |
| `implement` | files touched ≤ budget · something was touched · no path-naming anti-scope item violated · `npm test` passes |
| `audit` | report at `.vibeflow/audits/<slug>-audit.md` · verdict parseable as PASS/PARTIAL/FAIL · DoD Checklist, Pattern Compliance and Critical Gate present |

Alongside the assertions it records cost, wall time, turns and tokens per
stage, so the two arms are comparable on spend as well as on contract.

## What it does not check

It verifies contract, not judgment. Nothing here establishes whether the spec
captured the right scope, whether the mined patterns are the ones that matter,
whether the audit's verdict is correct, or whether the implementation is well
written. A green run means the pipeline produces well-formed artifacts; it is
not evidence that one arm produces better ones.

Three limits are worth naming precisely:

- The craftsmanship and executable-test assertions are keyword heuristics over
  the DoD text. A check phrased outside their keyword lists reads as a miss.
- Anti-scope items that do not directly prohibit a concrete path are counted as
  unchecked, not as passing. A contextual directory mention such as "no barrel
  file in `src/services/`" does not prohibit every file below that directory.
  Explicit prohibited path lists are associated with their negative clause, so
  a contextual path later in the same bullet is not swept into the prohibition.
  Paths are normalized without a leading `./`, and Git renames check both the
  original and destination names. The runner prints how many unchecked items
  there were.
- One run per arm. Same prompt, same model, same input does not produce the
  same output, so a difference between two single runs does not separate a real
  effect from ordinary variation.

Comparing quality would take at least five runs per arm on the same fixture,
artifacts stripped of any arm marker, and a reader who did not write the
prompts scoring them against a rubric fixed in advance. That is a different
task, and it yields weak evidence even done well.

## How it is wired

`fixture.mjs` generates a small Node project — a task store with two patterns
repeated across three services each, seven passing tests under `node --test`,
and one fixed implementation task. It is generated per arm and never committed,
so `analyze` always runs its cold path rather than incremental mode.

`run-smoke.mjs` copies one arm's `skills/` into the fixture's `.claude/skills/`
and drives five headless sessions with `claude -p --output-format json`. It
commits the artifacts written before `implement`, and leaves the
implementation uncommitted so `/audit`'s `git diff HEAD` path sees exactly
what `implement` changed. A stage whose session fails has all of its
assertions reported as skips — residual artifacts from earlier stages never
count as passes for a stage that did not run.

Two details the harness depends on:

- Every session runs with `--setting-sources project`. Without it the globally
  installed vibeflow plugin loads as well, and both arms end up exercising
  whichever skill set wins the name. Measured on 2026-08-15: a default run
  exposes the nine `vibeflow:*` plugin skills, `--setting-sources project`
  exposes none.
- Stage prompts are in English. The prompts detect the input language and write
  their output in it, so a Portuguese prompt would translate the section
  headings the assertions match on.

Sessions run with `--dangerously-skip-permissions`, since `implement` writes
files and `audit` shells out to `git` and the test runner. They are pointed at
a generated fixture under `$TMPDIR`, but nothing technically confines a
permission-free session to it — run this on a machine where that risk is
acceptable.

The control arm is the plugin cache at
`~/.claude/plugins/cache/vibeflow-marketplace/vibeflow/1.12.0/`. The runner
verifies it before trusting it — version `1.12.0`, `audit/SKILL.md` carrying
`MANDATORY` and lacking `Report every finding` — and refuses to run rather than
let a silent plugin upgrade turn the control arm into a second copy of the
treatment arm. This ties the control arm to the maintainer's local plugin
cache — a fresh clone cannot run it — which is a declared limitation, accepted
for now over pinning a tag or archive.

Raw per-stage output lands in `<workdir>/results.json`.

## Distribution parity checks

The dependency-free Node test suite also guards the static distribution
contract for every host:

```
node --test test/*.test.mjs
```

It requires the same ten workflows in the shared Claude/Codex plugin, Cursor
skills, and Copilot prompt files; validates host-specific names and frontmatter;
checks essential behavior anchors for each workflow; and verifies that the
Claude and Codex catalogs resolve to the same versioned plugin. GitHub Actions
runs these checks for every pull request and push to `main`.
