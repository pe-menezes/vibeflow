---
name: gen-spec
description: >
  Generates a technical spec with objective, Definition of Done (3–7 binary checks),
  scope, anti-scope, technical decisions, and applicable patterns. Grounded in the
  project's real patterns from .vibeflow/. Auto-splits specs that exceed budget or
  DoD limits. Use when requirements are clear and you're ready to define the
  implementation contract.
argument-hint: "<feature description or PRD path>"
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch
---

## Description and examples

**What it does:** Produces a technical spec in `.vibeflow/specs/<slug>.md` with objective, Definition of Done (3–7 binary checks), scope, anti-scope, technical decisions, and applicable patterns. Reads `.vibeflow/` to ground the spec in your project. Can take a PRD path (from discover) or a short feature description.

**Examples:**
- `/vibeflow:gen-spec .vibeflow/prds/login-flow.md` — Generate spec from an existing PRD.
- `/vibeflow:gen-spec adicionar endpoint POST /auth/login que retorna JWT` — Generate spec from a one-line description (uses .vibeflow/ patterns).

---

## Language

Detect the language of the user's input ($ARGUMENTS or conversation).
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.
One heading is exempt: `## References` stays literally in English in any
output language — prompt-pack's propagation matches that exact heading.

## Web Search Policy

Use WebSearch and WebFetch only when local context (`.vibeflow/`, codebase,
git history) is insufficient — an unfamiliar framework or API. Local first.

Generate a complete spec for: $ARGUMENTS

## Before writing the spec

1. Read the input. A path to a `.md` inside `.vibeflow/prds/` is a PRD:
   problem, audience, solution, scope, and anti-scope are already settled —
   your job is translating them into technical decisions, binary DoD checks,
   and applicable patterns. Anything else is a feature description.
2. Load context from `.vibeflow/`, if it exists:
   - `index.md` — project context. Its `Suggested budget: ≤ N` line is this
     spec's budget; without it, ≤6 files.
   - `conventions.md` — the project's standards.
   - Patterns: read the `## Pattern Registry` block in `index.md` (between
     `<!-- vibeflow:patterns:start/end -->` markers), cross-reference its tags
     and modules against the feature, and load the top 3–5 matches. With no
     registry, fall back to reading all pattern docs.

   No `.vibeflow/` → warn that results improve after `/vibeflow:analyze`, then
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
- **Scope** — What's in.
- **Anti-scope** — What's explicitly out. Be aggressive.
- **Technical Decisions** — With trade-offs and justification.
- **Applicable Patterns** — Which patterns from `.vibeflow/patterns/` the
  implementation must follow. Note it when the feature introduces a new one.
- **Risks** — Premortem: what can go wrong, and the mitigation.
- **References** (optional) — What the input pointed at: a test suite, a
  mockup, code to port, a reference implementation. One line each — the path or
  URL, then the role it plays ("the suite that defines the behavior", "the
  mockup to replicate", "the implementation to port"). Leave the section out
  when the input carries no references.
- **Dependencies** (optional) — Specs that must land before this one, as
  `- .vibeflow/specs/<feature>-part-N.md`. Used in multi-part splits.

Be opinionated. Cut scope aggressively. Challenge vague requirements. Where
something is unclear, state your assumption and flag it with a TODO. Match the
spec's length to what the feature needs — the substance, without filler
sections, redundant summaries, or boilerplate.

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
Run `/vibeflow:implement .vibeflow/specs/<feature-slug>.md` to implement with guardrails (budget, DoD, patterns).
Or `/vibeflow:prompt-pack .vibeflow/specs/<feature-slug>.md` if you want a
self-contained prompt for a separate session/agent."

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
