# Proposal: Critical Gate (destructive-op safety scan)

> Status: **Implemented (v1)** in vibeflow v1.12.0 — prompt-embedded catalog in
> `audit`, across all three editions. The v2 Node engine (see "Engine" below)
> remains future work.
> Origin: adapted from the `chama` plugin's Critical Gate. Sized down to fit
> vibeflow's identity (local-first, editor-agnostic, no GitHub coupling).

## Summary

Add a deterministic, rules-based scan that inspects the implementation **diff**
for destructive or dangerous operations the LLM's own DoD self-verification
tends to miss — dropped auth middleware, `DROP TABLE` in migrations, hardcoded
secrets, `0.0.0.0/0` CIDRs, disabled TLS verification, mass deletes, etc.

It is a **safety net**, not a style check. Its highest value is catching
**security regressions** (scope `removed`): things the spec/DoD never mentions
because they are side effects, not features.

## Decision: it lives in `audit`

The gate belongs in **`audit`**, as a check that can force the verdict to
**FAIL** — mirroring the existing rule "Test FAIL = Audit FAIL".

Rationale:

| Reason | Detail |
|---|---|
| It is the ship gate | `audit` PASS = "Ready to ship". A destructive op is exactly a reason **not** to ship. |
| Independent verification | `implement` wrote the code; running the gate there is "marking its own homework". `audit` is a separate, mechanical checker. |
| Conceptual fit | vibeflow already separates **execution** (`implement`) from **verification** (`audit`). A safety gate is verification. |
| Reuses existing machinery | `audit` already has the FAIL mechanism and produces an **incremental prompt pack** for gaps — a gate finding feeds straight into it. |

**Not** in `implement`: avoids the self-assessment problem and keeps a single
source of truth for the gate verdict. (See "Optional shift-left" below.)

## Where, exactly, inside `audit`

Current `audit` flow:

```
find spec → extract DoD → read .vibeflow docs → read changed code
  → MANDATORY: run tests (FAIL → auto FAIL)
  → audit DoD + pattern compliance
  → verdict (PASS / PARTIAL / FAIL) + incremental prompt pack
```

Insert the gate as a **new step immediately after running tests**, before the
DoD/pattern audit. Severity → verdict mapping (mirrors chama's exit codes):

| Finding (not justified/overridden) | Effect on verdict |
|---|---|
| CRITICAL / HIGH | **FAIL** — listed at the top of the incremental prompt pack |
| WARNING | **PARTIAL** / flagged, does not block |
| INFO | informational note only |
| none | proceed normally |

Add a companion rule alongside "Test FAIL = Audit FAIL":
**"Unresolved CRITICAL/HIGH gate finding = Audit FAIL."**

## Key technical constraint: it needs a real diff

The most valuable rules use scope `added` vs `removed` (e.g. "removed auth
middleware"). That requires a **before/after diff**, not "scan the final files".

In vibeflow's local model, `implement` leaves changes in the working tree
(uncommitted). So at `audit` time, `git diff` (working tree vs `HEAD`) still
shows added/removed lines correctly. The gate step must **explicitly compute the
diff** — do not just re-read the final file contents.

- Primary: `git diff` (working tree) and/or `git diff <base>...HEAD` if committed.
- Each finding needs: severity, rule id, file, line, message, and the offending
  line content.

## Engine: start prompt-embedded, migrate to Node later

Two viable engines:

1. **Prompt-embedded catalog (v1 — recommended start).** Embed the rules catalog
   in the `audit` skill; the agent reads the diff and matches against it. Zero
   new dependencies, cross-platform, fits the skill model. Less deterministic
   than regex, but adequate for v1.
2. **Node port in `cli/` (v2).** vibeflow already ships an npm package (`cli/`).
   A `vibeflow-gate` engine there would be deterministic and cross-platform, and
   callable from all three editions. More work; do this only if v1's
   non-determinism proves insufficient.

Do **not** port the chama bash engine (`run-critical-gate.sh`): it is bash + `yq`
+ grep/sed/awk and assumes a `.chama.yml`. That breaks vibeflow's Windows/
PowerShell-primary, no-config, editor-agnostic posture.

## Rules catalog

The real IP is the rules, not the engine. Port the ~40-rule catalog from chama's
`templates/critical-gates.yml.default` (6 domains): Database, Security,
Infrastructure (IaC), Kubernetes, Config, Data. Representative examples:

- **DB:** `DROP DATABASE`/`DROP TABLE`/`TRUNCATE` (CRITICAL); `DELETE FROM`
  without `WHERE` (HIGH).
- **Security (removed):** auth/CSRF/rate-limit removed (CRITICAL/HIGH);
  sanitization/encoding removed (WARNING).
- **Security (added):** hardcoded secret, `verify=false`/TLS off, `eval`/`exec`.
- **IaC:** `force_destroy = true`, `prevent_destroy = false`, `0.0.0.0/0`.
- **K8s:** `privileged: true`, `runAsUser: 0`, `hostPath`.
- **Data:** mass delete (`delete_all`/`purge`), PII exposure, encryption removed.

When v2 (Node) lands, store the catalog as data (YAML/JSON) so it is editable
without touching code. For v1, embed it directly in the skill prose.

## Override mechanism (optional, bring only with the gate)

chama allows suppressing a finding with a justification:
`<!-- vibeflow:allow RULE_ID: justification -->`. CRITICAL/HIGH require a
non-empty justification; WARNING/INFO do not. Useful for intentional destructive
migrations. Only worth adding once the gate itself exists.

## Optional shift-left (later, not first)

A **non-blocking** advisory scan in `implement` Phase 7 (self-verify) would let
the agent catch an obvious `DROP TABLE` before declaring "ready for audit".

Do **not** do this first: putting the catalog in two places creates drift (the
exact problem we flagged in chama). Keep enforcement in `audit` as the single
source. If shift-left is wanted later, first extract the catalog to one shared
file (the v2 Node path) and invoke from both sides without duplicating rules.

## Implementation checklist (for when we build it)

Per `CLAUDE.md` cross-edition sync rules, a logic change to `audit` must hit all
three editions plus docs:

- [ ] `claude-code/skills/audit/SKILL.md` — source of truth: new gate step +
      verdict rule + embedded catalog
- [ ] `copilot/github/prompts/vibeflow-audit.prompt.md` — mirror
- [ ] `cursor/skills/vibeflow-audit/SKILL.md` — mirror
- [ ] `MANUAL.md` — document the gate step under `vibeflow-audit`
- [ ] `CHANGELOG.md` — new entry
- [ ] `claude-code/.claude-plugin/plugin.json` — version bump
- [ ] README command tables — only if the `audit` description changes
- [ ] (v2 only) `cli/` — Node gate engine + catalog data file

## Out of scope

The rest of chama's SDLC layer — `review-loop`, the headless `chama-pipeline`,
GitHub Projects/PR orchestration — stays out. It is good, but it is a different
product; vibeflow stops at `audit` and hands back to the human by design.
