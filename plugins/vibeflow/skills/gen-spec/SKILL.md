---
name: gen-spec
description: >
  Generates a technical spec with objective, Definition of Done (3–7 binary checks),
  scope, anti-scope, technical decisions, and applicable patterns. Grounded in the
  project's real patterns from .vibeflow/. Auto-splits specs that exceed budget or
  DoD limits. Use when requirements are clear and you're ready to define the
  implementation contract.
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch
---

## Description and examples

**What it does:** Produces a technical spec in `.vibeflow/specs/<slug>.md` with objective, Definition of Done (3–7 binary checks), scope, anti-scope, technical decisions, and applicable patterns. Reads `.vibeflow/` to ground the spec in your project. Can take a PRD path (from discover) or a short feature description.

**Examples:**
- `gen-spec .vibeflow/prds/login-flow.md` — Generate spec from an existing PRD.
- `gen-spec adicionar endpoint POST /auth/login que retorna JWT` — Generate spec from a one-line description (uses .vibeflow/ patterns).

---

## Language

Detect the language of the user's current request or conversation.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.
A few literals are exempt and stay in English in any output language, because
other commands match them byte for byte: the `## References` and
`## Clarifications` headings, the `Scenarios:` and `Risk code:` labels, the
`[NEEDS CLARIFICATION: …]` marker, and the EARS keywords `WHEN` and
`THE SYSTEM SHALL`.

## Web Search Policy

Use WebSearch and WebFetch only when local context (`.vibeflow/`, codebase,
git history) is insufficient — an unfamiliar framework or API. Local first.

Generate a complete spec for the feature in the user's current request.

## Before writing the spec

1. Read the input. A path to a `.md` inside `.vibeflow/prds/` is a PRD:
   problem, audience, solution, scope, and anti-scope are already settled —
   your job is translating them into technical decisions, binary DoD checks,
   and applicable patterns. Anything else is a feature description. When the
   PRD has a `## Clarifications` section, carry its entries into the spec's own
   `## Clarifications`, so the answers travel with the contract.
2. Load context from `.vibeflow/`, if it exists:
   - `index.md` — project context. Its `Suggested budget: ≤ N` line is this
     spec's budget; without it, ≤6 files.
   - `conventions.md` — the project's standards.
   - Patterns: read the `## Pattern Registry` block in `index.md` (between
     `<!-- vibeflow:patterns:start/end -->` markers), cross-reference its tags
     and modules against the feature, and load the top 3–5 matches. With no
     registry, fall back to reading all pattern docs.

   No `.vibeflow/` → warn that results improve after `analyze`, then
   read the relevant code directly.
3. Identify what exists today for this feature and which patterns apply to it.
4. Collect what the input points at — test files, mockups, code to port, the
   URL of a reference implementation — and what each one is for. A reference in
   code pins the target behavior better than a paragraph describing it.

### PRD Validation Gate

Runs only when the input is a PRD — a `.md` path, or text longer than 3 lines.
A short description skips the gate.

Five checks before generating:

1. **Concrete problem** — a specific, real pain, not "improve the experience".
2. **Audience defined** — a named user or persona, not "everyone".
3. **Closable scope** — a v0 you can bound and finish.
4. **No conflict with `.vibeflow/`** — the proposed solution doesn't contradict
   the conventions or the loaded patterns, and doesn't duplicate what exists.
5. **Viable in the current stack** — feasible per `index.md` without a stack change.

All five pass → generate silently, no delay. Any fails → ask up to 2 targeted
questions about the failures, then generate with the answers. One round only.

## The spec

- **Objective** — 1 sentence. What changes for the user.
- **Context** — What exists today and why this matters now.
- **Definition of Done** — 3–7 binary checks (pass/fail, no ambiguity). At
  least one must be a craftsmanship gate — "no violations of the Don'ts in
  conventions.md", "no new `any` types". Functional checks alone are not enough.
  Where the project has a detectable test runner, at least one check names an
  executable test: one that already exists and has to pass, or one to write,
  named. With no runner, the checks stay as they are.

  Two optional fields sharpen a functional check. Both are indented under the
  check they belong to and are never extra checks, so the DoD stays 3–7 checks:
  - `Scenarios:` — 1 to 3 lines in the EARS form
    `WHEN <condition> THE SYSTEM SHALL <behavior>`. The implementer turns each
    line into the red test, so write the behavior a test can observe.
  - A property — "for any <input space>, <invariant>", naming the oracle that
    decides it (a reference implementation, an inverse, a sum that must hold).
    Offer it only when the project has a property-testing library (fast-check,
    Hypothesis and the like) in its dependencies; one property explores the
    input space that a handful of examples leaves open. Without the library,
    write the check as examples.

  ```
  1. Deleting a task removes it from the store — `test/deleteTask.test.js` passes.
     Scenarios:
     WHEN the task exists THE SYSTEM SHALL remove it and return ok
     WHEN the id is unknown THE SYSTEM SHALL return not-found and change nothing
  ```
- **Scope** — What's in.
- **Anti-scope** — What's explicitly out. Be aggressive.
- **Technical Decisions** — With trade-offs and justification.
- **Applicable Patterns** — Which patterns from `.vibeflow/patterns/` the
  implementation must follow. Note it when the feature introduces a new one.
- **Risks** — Premortem: what can go wrong, and the mitigation. End it with a
  `Risk code:` list inside `## Risks`: the concrete paths or functions this
  change touches in four categories — money and totals, credentials and
  permissions, deleting or overwriting data, date and time boundaries. The
  audit sabotages only there, so name the function, not the module. When the
  change touches none, write `Risk code: none`.
- **Clarifications** (optional) — `## Clarifications`: each question asked in
  this session and its answer, one pair per item, plus those carried from the
  PRD. Every question counts — the PRD gate's and the self-check's — at most 5
  questions per session. Leave the section out when nothing was asked or
  carried.
- **References** (optional) — What the input pointed at: a test suite, a
  mockup, code to port, a reference implementation. One line each — the path or
  URL, then the role it plays ("the suite that defines the behavior", "the
  mockup to replicate", "the implementation to port"). Leave the section out
  when the input carries no references.
- **Dependencies** (optional) — Specs that must land before this one, as
  `- .vibeflow/specs/<feature>-part-N.md`. Used in multi-part splits.

Be opinionated. Cut scope aggressively. Challenge vague requirements. Where
something is unclear and an assumption is safe to state, state it. Where it is
not, write `[NEEDS CLARIFICATION: <the question>]` at that point. Keep at most
3 open markers: more than 3 means the spec rests on guesses, so ask before
saving. Match the spec's length to what the feature needs — the substance,
without filler sections, redundant summaries, or boilerplate.

## Self-check

Before saving, check the draft against three rules:

1. Every DoD check is binary — a reader can say pass or fail without asking.
2. Where the project has a detectable test runner, every functional check names
   its test or carries a `Scenarios:` field.
3. The open `[NEEDS CLARIFICATION]` markers are counted against the cap above.

All three pass → save, without comment. A failure you can repair from the
input and `.vibeflow/`, repair. What is left needs the user: ask up to 2
targeted questions in one round, the PRD Validation Gate's rhythm, record them
in `## Clarifications`, apply the answers and save. One question can cover more
than one marker. The self-check never opens a second round: markers still open
after it stay in the spec and are named in your reply, and with more than 3
still open the reply also recommends running `discover` before `implement`.

## Spec splitting

After drafting, check the spec against its limits: more than 7 DoD checks, or
more files than the budget (`.vibeflow/index.md`, else ≤6).

Either one is true → don't save it. Tell the user it exceeds limits (N checks /
N files) and split it into self-contained parts instead, each with its own
objective, DoD of 3–7 checks, scope, anti-scope, and a `Dependencies` field
naming what must come first. Name them `<feature>-part-1.md`,
`<feature>-part-2.md`, and so on; each part has to be implementable and
auditable on its own. Save every part and present the execution order.

The split is the architect's call.

Save the spec to `.vibeflow/specs/<feature-slug>.md` (create the directory if
it doesn't exist).

After saving, suggest: "Spec saved to `.vibeflow/specs/<feature-slug>.md`.
Run `implement .vibeflow/specs/<feature-slug>.md` to implement with guardrails (budget, DoD, patterns).
Or `prompt-pack .vibeflow/specs/<feature-slug>.md` if you want a
self-contained prompt for a separate session/agent."

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
