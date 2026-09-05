# Work order: pipeline smoke test (`analyze → gen-spec → prompt-pack → implement → audit`)

> Status: **done** 2026-08-15 — harness in `test/`, results and residual scope
> in `proposals/backlog-pos-unhobbling.md` items 4 and 5.
> Origin: Success Criterion 3 of `.vibeflow/prds/unhobbling-geracao-5.md`, the
> only one of the PRD's five that never entered any spec's DoD, so it never ran.
> Related: `proposals/backlog-pos-unhobbling.md` item 4,
> `proposals/unhobbling-style.md` (the series this validates).

You are only seeing this prompt; there is no context outside it.

## 1. Objective and Definition of Done

The `unhobbling-geracao-5` series rewrote all 35 of vibeflow's prompt surfaces
for the 2026 frontier generation, cutting 302,409 → 237,024 chars (−21.6%)
while checking that nothing on the keep-list was lost. What it never did was
**run the rewritten prompts**. Build the harness that does.

Definition of Done:

1. A generated fixture repo — created by the harness, not committed — with a
   detectable stack, at least 2 real patterns, a working test runner, and a
   fixed implementation task that fits the budget.
2. A harness that runs the five commands — `analyze`, `gen-spec`,
   `prompt-pack`, `implement`, `audit` — end to end against the fixture and
   asserts the artifact contract in section 8's table. Exit code 0 or 1, with
   each failed assertion named.
3. The harness runs both arms from a clean fixture: **new** prompts (this repo)
   and **old** prompts (the v1.12.0 plugin cache, see section 6), and reports
   the two results side by side.
4. Assertions pass on the new arm. Any that fail on the old arm too are
   reported as pre-existing, not as regressions — the old arm is what proves
   the assertions aren't tautological.
5. Craftsmanship: the harness names what it does not check. It verifies
   contract, not judgment quality — that limit is stated in its output and in
   whatever you write up, not left for a reader to assume.

## 2. Anti-scope

- **Do not attempt to measure whether the new prompts produce *better* output.**
  See section 7 for why, and what it would actually take. Anything of the form
  "I ran both and the new one looked better" is worse than not testing.
- Do not change any prompt file. If the harness finds a real defect, report it;
  the fix is a separate task with its own spec.
- Do not commit the fixture. It is generated, so runs stay hermetic and the
  repo does not gain a dozen scaffold files.
- Do not touch `cli/index.js`, the site, or the CHANGELOG.

## 3. Budget

≤ 4 files, all new, under a directory of your choosing (`test/` or `tools/`):
the fixture generator, the assertions, a runner that wires the two arms, and a
short README. The fixture itself does not count — it is generated output.

The budget is small on purpose. If it does not fit, the harness is doing more
than the DoD asks.

## 4. Project patterns to follow

Two patterns from this repo apply directly, both documented in `.vibeflow/`
(**gitignored — read by direct path; search, grep and glob miss it**):

**`delimited-marker-blocks`** — `analyze` writes generated content between
`<!-- vibeflow:auto:start -->` / `<!-- vibeflow:auto:end -->`, and the pattern
registry between `<!-- vibeflow:patterns:start -->` / `<!-- ...:end -->`.
Frontmatter and `## Anti-patterns` sections live *outside* the markers so
manual edits survive regeneration. Your assertions check both that the markers
exist and that they are balanced.

**`cli-installer`** — the harness that verified part 7 is the model to copy for
driving real code without touching it: it copied `cli/index.js` to a scratch
dir, replaced only the body of `downloadFile` with a `readFileSync` of the
working tree, and shimmed `picocolors` (not installed). The installer logic ran
unmodified. Same trick applies if you need to install an edition into the
fixture rather than copying skill files by hand.

Style, if you write any prose the user will read: `proposals/unhobbling-style.md`
is normative. No caps as emphasis, no `⚠️`, one instruction in one place.

## 5. References

- `.vibeflow/prds/unhobbling-geracao-5.md` — Success Criteria, where criterion 3
  is stated in full. **This is the contract you are satisfying.**
- `.vibeflow/audits/unhobbling-geracao-5-part-7-audit.md` — the only smoke test
  the series did run (CLI install). Its structure is a good model for reporting.
- `proposals/unhobbling-style.md` §Measurement — the per-file ledger, if you
  want to correlate a failure with how much a given file changed.
- `plugins/vibeflow/skills/*/SKILL.md` — the rewritten prompts under test. The
  artifact formats you assert against are specified in them; read the format
  from the prompt rather than from this document, which paraphrases.

All four are in this repo except the first two, which are under gitignored
`.vibeflow/` — present on the maintainer's machine, absent in a fresh clone. If
they are missing, the PRD's criterion 3 is quoted in full in section 1 and the
part-7 audit's method is summarized in section 4; that is enough to proceed.

## 6. Where to work

Two facts that determine the setup, both verified on 2026-08-15:

**The old prompts are already installed** at
`~/.claude/plugins/cache/vibeflow-marketplace/vibeflow/1.12.0/`. That is the
pre-series version — its `audit/SKILL.md` still contains `MANDATORY: Detect and
run tests` and lacks `Report every finding`. It is the control arm; you do not
need to check anything out to get it. Confirm the version before trusting it,
since the user may upgrade the plugin at some point.

**The new prompts are not installed anywhere.** They live in `plugins/vibeflow/`,
`copilot/` and `cursor/` on branch `unhobbling/part-9` (and on `main` once the
series merges). The cleanest way to give the fixture an arm is to copy
`plugins/vibeflow/skills/` into the fixture's `.claude/skills/`, per arm, so each
run is explicit about which version it exercises.

**This repo cannot be the fixture.** It has no test runner —`cli/package.json`
has `scripts: {}` and `site/package.json` only has Astro's. The behavior part 8
introduced (where a runner is detectable, ≥1 DoD check names an executable
test) would never fire, so you would be testing the unchanged branch. The
fixture must bring a real runner; a small Node project with vitest is enough.

## 7. Directional guidance

Deliver what this order asks, at the scope it defines. Make routine judgment
calls yourself; check in only when different readings would lead to materially
different work. If something here is mistaken, say so in a sentence and
continue as specified. Finish the whole task, and stop short of changes clearly
beyond it.

**The methodological trap, stated plainly, because it is the reason this task
is scoped the way it is.** The PRD's criterion says the audit verdict should be
"equivalent or better". That phrasing invites an experiment that cannot deliver
what it promises:

- One run per arm measures noise. The same prompt, same model, same input does
  not produce the same output. A difference between a single old run and a
  single new run does not separate "the rewrite changed something" from
  "it was Tuesday".
- The person judging "better" is usually the person who made the change, which
  biases the read. A real quality comparison needs several runs per arm and a
  reader blind to which arm produced which artifact.

So this task deliberately targets the falsifiable half: **the artifact contract**.
Templates intact, paths right, guardrails honored, formats parseable — that is
the regression class an editorial rewrite actually introduces, and it is
objectively checkable. Quality comparison is out of scope, and your write-up
should say so rather than implying coverage you did not achieve.

If someone later wants the quality half, the shape is: ≥5 runs per arm, same
fixture and task, artifacts stripped of any arm marker, and a reader who did
not write the prompts scoring them against a rubric fixed in advance. That is a
separate task, and it produces weak evidence even when done well — worth
knowing before anyone pays for it.

## 8. How to run and test

There is no test runner in the vibeflow repo, so your harness is the test.
Make it runnable as one command and let it exit non-zero on any failed
assertion.

Assertions per stage, all against the fixture's `.vibeflow/` after the run:

| Stage | Assertion |
|---|---|
| `analyze` | `index.md` exists · `vibeflow:auto` and `vibeflow:patterns` markers present and balanced · a `Suggested budget: ≤ N` line · every `patterns/*.md` has YAML frontmatter *outside* the auto markers |
| `gen-spec` | spec at `.vibeflow/specs/<slug>.md` · its named sections present · DoD has 3–7 binary checks · ≥1 craftsmanship check · ≥1 check naming an executable test (the fixture has a runner, so this must fire) |
| `prompt-pack` | pack at `.vibeflow/prompt-packs/<slug>.md` · opening line present · sections in order · pattern code actually embedded, not referenced by path |
| `implement` | files touched ≤ budget · no anti-scope item violated · the fixture's tests pass |
| `audit` | report at `.vibeflow/audits/<slug>-audit.md` · Verdict, DoD Checklist, Pattern Compliance and Critical Gate sections present · verdict parseable as PASS/PARTIAL/FAIL |

Read each format from the prompt that produces it, not from this table — the
table is a checklist, the prompt is the specification, and if they disagree the
prompt wins and the table is what needs fixing.

Run each arm from a freshly generated fixture: `analyze` writes `.vibeflow/`,
so a second run over the same directory exercises incremental mode instead of
the cold path.

## 9. Docs to update

- `proposals/backlog-pos-unhobbling.md` — item 4 points here. Close it or
  narrow it to whatever remains.
- If the harness finds a real defect in a prompt: a new entry in that same
  backlog file, with the measurement and what a fix has to handle. Do not fix
  it inline.
- `CHANGELOG.md` only if you ship something a user can observe. A test harness
  usually is not that.
