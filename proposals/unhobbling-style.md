# Proposal: Unhobbling Style Guide (Claude 5 generation)

> Status: normative for the unhobbling series — specs `part-2` through `part-9`
> in `.vibeflow/specs/unhobbling-geracao-5-part-*.md` reference this document
> instead of restating its rules.
> PRD: `.vibeflow/prds/unhobbling-geracao-5.md`
> Sources: "The new rules of context engineering for Claude 5 generation models"
> (Anthropic blog, 2026-07-24) · "Prompting Claude Opus 5" (platform.claude.com)
> · local reference spec `spec-context-engineering-claude-5.md`.

## Why

Vibeflow's prompt surfaces were written in the pre-Claude-5 dialect: caps
emphasis, absolute rules, repeated instructions, restated knowledge. On the
2026 frontier generation every instruction costs twice — input tokens plus
thinking tokens to reconcile it with the other layers — and emphasis written
to overcome old-model reluctance now causes over-triggering. This guide
defines, once, what the rewrite deletes, what it keeps, and how the series
measures itself.

## Delete-list

A line matching any category below is removed or rewritten. Grep signals are
given so the check is mechanical.

- **D1 — Redundant verification.** Instructions to re-check work the model
  already verifies by default ("double-check", "verify again", "re-verify
  before", mentally re-confirm steps). Verification that produces a required
  artifact (the self-verification report, the audit verdict) is a contract,
  not redundancy — it stays. Signals: `double-check`, `re-verify`,
  `verify again`, `mentally verify`.
- **D2 — Emphasis and absolute framing.** Caps used as volume
  (`MANDATORY`, `NEVER`, `ALWAYS`, `CRITICAL`, `IMPORTANT`), warning emoji,
  bold entire sentences, "no exceptions" framing. The rule survives; the
  shouting goes. Caps stay only in acronyms and literals (DoD, PASS/FAIL,
  YAML, file names). Signals: `grep -E "MANDATORY|NEVER|ALWAYS|CRITICAL|DO NOT|Do NOT"`,
  `⚠️`, `**Never`.
- **D3 — Restated knowledge and persona theater.** Facts any frontier model
  knows (per-stack test-runner tables, what git does, what a PRD is) and
  persona beyond one role-setting line. Signals: enumerations of common
  tools, "You are a/an …" followed by elaboration.
- **D4 — Repetition across layers of the same request.** The same rule stated
  in a phase, again in a summary table, again in an error table of the same
  file — or in two files the same host loads together. Each instruction lives
  once, in the place it applies. Cross-host copies are isolation, not
  repetition. Signal: grep the rule's keyword and count hits per file.
- **D5 — Prescriptive scripts where judgment belongs.** Numbered steps and
  verbatim wording for decisions the model makes well (what to ask, how to
  phrase a summary). State the goal and constraints; keep exact scripts only
  where exactly one sequence is safe (see keep-list). Signal: scripted
  dialogue lines, step lists with no ordering requirement.

## Keep-list

These survive every rewrite, traceable line by line. The operating rule:
keep the rule, drop the shout — and carry the reason where one exists.

- Budget values and the stop-and-ask contract on exceeding them.
- DoD limits (3–7 binary checks, ≥1 craftsmanship check).
- Anti-scope as hard stop.
- The Critical Gate catalog: rule tables (ID/Sev/Scope/Trigger), overrides
  (`vibeflow:allow`), verdict mapping — byte-preserved.
- Marker contracts: `<!-- vibeflow:auto -->`, `<!-- vibeflow:patterns -->`,
  `<!-- vibeflow:start/end -->` placement rules.
- The `.vibeflow/` direct-path access rule (gotcha: search tools respect
  `.gitignore` — regression fixed in v0.12.1).
- Artifact paths and output templates (spec/PRD/pack/report formats,
  frontmatter fields, `$ARGUMENTS` in the claude-code edition).
- The Language section and the Maintenance footer.
- Numeric limits: 5 discovery rounds, 2 test-fix attempts, ≤4 files in
  quick, sampling scales, phase counts.
- Per-edition dialect differences (invocation style, frontmatter shape).
- One-line role statements ("You are a coding agent.") — role-setting is
  fine; elaboration is D3.

## Retention test

A line the lists above don't settle survives only if it is at least one of:

1. A hard constraint (business, security, methodology contract).
2. A surprising project fact — a gotcha the model cannot infer.
3. A decision with a declared threshold, not a vibe.
4. A named integration (file, path, command, env var).
5. A deliberate opinion of this project the model would not infer.

Everything else is deleted or converted into a shorter, reasoned form.

## Before / after — real pairs from this repo

**Pair 1 — audit, test detection (D2 + D3).**
Before (`claude-code/skills/audit/SKILL.md`):

> **MANDATORY: Detect and run tests.**
> — Based on stack, detect test runners:
> — Node.js / npm: `npm test` · Python / pip: `pytest` or `python -m pytest`
> · Rust / cargo: `cargo test` · Go: `go test ./...` · Ruby / bundler:
> `rake test` or `bundle exec rspec` · Java / Maven: `mvn test` …

After:

> Run the project's test suite — prefer commands listed in the spec,
> otherwise detect the runner from the stack. If tests fail, the verdict is
> FAIL and auditing stops.

The business rule (fail = FAIL) is intact; the runner enumeration is
knowledge the model already has.

**Pair 2 — analyze, `.vibeflow/` access (keep-list rewrite).**
Before (`claude-code/skills/analyze/SKILL.md`):

> **⚠️ .vibeflow/ access rule:** … To check if `.vibeflow/` exists, **read
> `.vibeflow/index.md` directly by its file path**. Do NOT use file search,
> grep, or glob to check for its existence — these will return empty results
> and cause a false "does not exist" conclusion.

After:

> Read `.vibeflow/index.md` directly by path. Search, grep, and glob respect
> `.gitignore`, so they miss the directory and report it as absent.

The rule and its reason stay; the warning apparatus goes.

**Pair 3 — implement, budget (D4).**
Before: the budget contract appears seven times in
`claude-code/skills/implement/SKILL.md` — definition (§1.4), planning check
(§3.1), implementation rule 5 ("**Budget is a hard limit.** … STOP"),
mid-phase reminder, refine boundary, self-verification field, and a
"Guardrails Summary" table row ("Do NOT exceed the file budget").
After: the contract is stated once at extraction —

> The budget (from the spec, else `index.md`, else ≤6 files) caps every file
> you create or modify. Reaching it means stopping and asking.

— later sections reference it, and the summary/error tables that only
restated phase rules are removed.

**Pair 4 — discover, scripted rounds (D5).**
Before (`claude-code/skills/discover/SKILL.md`):

> Start with: **"Describe what you want to do — the more context the better
> (problem, audience, scope). If you already have clarity, I can generate
> the PRD faster."**

After:

> Round 1 goal: understand the problem — the pain, who has it, why now.
> Open by asking for the idea with as much context as the user has; offer
> the fast track when clarity is already high.

The round's goal and limits are the contract; the verbatim line becomes the
model's judgment.

## Standard snippets (paste-ready)

Add these where the destination column says, adapted only for surrounding
prose. They come from Anthropic's Opus 5 prompting guidance.

**S1 — Generated-document length.**

> Match the length of generated documents to what the task needs: cover the
> substance, but do not pad with filler sections, redundant summaries, or
> boilerplate.

**S2 — Scope discipline.**

> Deliver what the spec asks, at the scope it defines. Make routine judgment
> calls yourself; check in only when different readings would lead to
> materially different work. If the spec seems mistaken, say so in a sentence
> and continue as specified. Finish the whole task, and stop short of changes
> clearly beyond it.

**S3 — Delegation cap.**

> Delegate to parallel agents only for large, genuinely independent tracks of
> work. Do not delegate what a handful of tool calls finishes, and do not use
> agents to verify or double-check your own work. If one agent suffices, use
> one.

| Snippet | Destination |
|---|---|
| S1 | Commands that write artifacts: discover (PRD), gen-spec (spec), prompt-pack (pack), audit (report), analyze (docs) |
| S2 | implement; embedded by prompt-pack into generated packs |
| S3 | implement (host-neutral phrasing — applies where the host supports parallel agents) |

## Measurement

Method: `wc -c` per file; tokens ≈ chars/4. Rewrites in parts 2–8 fill the
"after" column and record the delta in their audit. Baseline command:

```sh
wc -c claude-code/skills/*/SKILL.md copilot/github/prompts/*.prompt.md \
  cursor/skills/*/SKILL.md claude-code/agents/architect.md \
  copilot/github/agents/vibeflow-architect.agent.md \
  cursor/rules/vibeflow-architect.mdc cursor/rules/vibeflow.mdc \
  copilot/github/instructions/vibeflow/vibeflow.instructions.md \
  copilot/copilot-instructions.md copilot/AGENTS.md cursor/AGENTS.md
```

Baseline (2026-08-08):

| Part | File | Chars | ~Tokens | After |
|---|---|---:|---:|---|
| 2 | claude-code/skills/implement/SKILL.md | 15737 | 3934 | 8919 |
| 2 | claude-code/skills/audit/SKILL.md | 10768 | 2692 | 10039 |
| 2 | copilot/github/prompts/vibeflow-implement.prompt.md | 14957 | 3739 | 8122 |
| 2 | copilot/github/prompts/vibeflow-audit.prompt.md | 10196 | 2549 | 9479 |
| 2 | cursor/skills/vibeflow-implement/SKILL.md | 15077 | 3769 | 8242 |
| 2 | cursor/skills/vibeflow-audit/SKILL.md | 10270 | 2568 | 9552 |
| 3 | claude-code/skills/gen-spec/SKILL.md | 7454 | 1864 | 5666 |
| 3 | claude-code/skills/prompt-pack/SKILL.md | 5173 | 1293 | 4482 |
| 3 | copilot/github/prompts/vibeflow-gen-spec.prompt.md | 6296 | 1574 | 4665 |
| 3 | copilot/github/prompts/vibeflow-prompt-pack.prompt.md | 4688 | 1172 | 3890 |
| 3 | cursor/skills/vibeflow-gen-spec/SKILL.md | 6387 | 1597 | 4756 |
| 3 | cursor/skills/vibeflow-prompt-pack/SKILL.md | 4744 | 1186 | 3935 |
| 4 | claude-code/skills/analyze/SKILL.md | 33955 | 8489 | 26275 |
| 4 | claude-code/skills/teach/SKILL.md | 10297 | 2574 | 8607 |
| 4 | copilot/github/prompts/vibeflow-analyze.prompt.md | 31599 | 7900 | 25534 |
| 4 | copilot/github/prompts/vibeflow-teach.prompt.md | 9249 | 2312 | 7575 |
| 4 | cursor/skills/vibeflow-analyze/SKILL.md | 31643 | 7911 | 25571 |
| 4 | cursor/skills/vibeflow-teach/SKILL.md | 9289 | 2322 | 7615 |
| 5 | claude-code/skills/discover/SKILL.md | 7080 | 1770 | |
| 5 | claude-code/skills/quick/SKILL.md | 5227 | 1307 | |
| 5 | copilot/github/prompts/vibeflow-discover.prompt.md | 6114 | 1529 | |
| 5 | copilot/github/prompts/vibeflow-quick.prompt.md | 4059 | 1015 | |
| 5 | cursor/skills/vibeflow-discover/SKILL.md | 6155 | 1539 | |
| 5 | cursor/skills/vibeflow-quick/SKILL.md | 4044 | 1011 | |
| 6 | claude-code/skills/stats/SKILL.md | 2989 | 747 | |
| 6 | copilot/github/prompts/vibeflow-stats.prompt.md | 2568 | 642 | |
| 6 | cursor/skills/vibeflow-stats/SKILL.md | 2597 | 649 | |
| 6 | claude-code/agents/architect.md | 4290 | 1073 | |
| 6 | copilot/github/agents/vibeflow-architect.agent.md | 3996 | 999 | |
| 6 | cursor/rules/vibeflow-architect.mdc | 3281 | 820 | |
| 7 | cursor/rules/vibeflow.mdc | 2884 | 721 | |
| 7 | copilot/github/instructions/vibeflow/vibeflow.instructions.md | 2931 | 733 | |
| 7 | copilot/copilot-instructions.md | 863 | 216 | |
| 7 | copilot/AGENTS.md | 2794 | 699 | |
| 7 | cursor/AGENTS.md | 2758 | 690 | |
| | **Total** | **302409** | **~75602** | |

Per-part subtotals: part 2 — 77,005 · part 3 — 34,742 · part 4 — 126,032 ·
part 5 — 32,679 · part 6 — 19,721 · part 7 — 12,230.

## Series target

Aggregate reduction target: **≥20%** of baseline chars (≈60,500 chars,
~15,100 tokens), with 25% reported as stretch.

Adjustment from the PRD's opening figure (≥25%), as its open question
anticipated: 67% of the mass (203,037 chars — parts 2 and 4) sits in files
dominated by mechanical contract that the keep-list preserves — the Critical
Gate catalog in audit, the output templates and mode trees in analyze —
which is why those parts carry a 15% floor. The floors alone guarantee only
~16.6% aggregate; 20% is reachable by outperforming floors where prose
dominates (implement's repeated tables, discover's scripts), while 25% would
pressure the rewrite to cut contract, which the keep-list forbids. Per-part
floors in the specs (15% for parts 2 and 4, 20% for parts 3, 5, 6, 7) remain
the operative gates; part 9 confirms the aggregate against this table.
