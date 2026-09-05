# Vibeflow Monorepo

## Structure

This monorepo contains one shared plugin, two file-based editions, a marketing
site, and an installer:

- `plugins/vibeflow/` — universal Claude + Codex plugin and source of truth for skill logic
- `.claude-plugin/marketplace.json` — Claude marketplace catalog
- `.agents/plugins/marketplace.json` — Codex marketplace catalog
- `copilot/` — GitHub Copilot prompts, agents, and instructions
- `cursor/` — Cursor skills and rules
- `site/` — Astro marketing site, bilingual in English and Portuguese
- `cli/` — npm installer for the Copilot and Cursor editions

`pe-menezes/vibeflow-claude` is a generated compatibility mirror. Never edit
it as a source repository.

## Cross-edition sync

The shared plugin skills are the reference. When a workflow's logic or
description changes in `plugins/vibeflow/skills/`, apply the equivalent change
to Copilot and Cursor in the same pull request.

| Shared plugin | Copilot | Cursor |
|---|---|---|
| `skills/analyze/SKILL.md` | `github/prompts/vibeflow-analyze.prompt.md` | `skills/vibeflow-analyze/SKILL.md` |
| `skills/discover/SKILL.md` | `github/prompts/vibeflow-discover.prompt.md` | `skills/vibeflow-discover/SKILL.md` |
| `skills/gen-spec/SKILL.md` | `github/prompts/vibeflow-gen-spec.prompt.md` | `skills/vibeflow-gen-spec/SKILL.md` |
| `skills/implement/SKILL.md` | `github/prompts/vibeflow-implement.prompt.md` | `skills/vibeflow-implement/SKILL.md` |
| `skills/audit/SKILL.md` | `github/prompts/vibeflow-audit.prompt.md` | `skills/vibeflow-audit/SKILL.md` |
| `skills/hotfix/SKILL.md` | `github/prompts/vibeflow-hotfix.prompt.md` | `skills/vibeflow-hotfix/SKILL.md` |
| `skills/prompt-pack/SKILL.md` | `github/prompts/vibeflow-prompt-pack.prompt.md` | `skills/vibeflow-prompt-pack/SKILL.md` |
| `skills/quick/SKILL.md` | `github/prompts/vibeflow-quick.prompt.md` | `skills/vibeflow-quick/SKILL.md` |
| `skills/teach/SKILL.md` | `github/prompts/vibeflow-teach.prompt.md` | `skills/vibeflow-teach/SKILL.md` |
| `skills/stats/SKILL.md` | `github/prompts/vibeflow-stats.prompt.md` | `skills/vibeflow-stats/SKILL.md` |
| `agents/architect.md` | `github/agents/vibeflow-architect.agent.md` | `rules/vibeflow-architect.mdc` |

- Command logic changes affect the shared plugin, Copilot, and Cursor.
- Claude and Codex packaging changes affect only their manifests or catalogs.
- New or removed workflows affect every edition plus the READMEs and manual.

## Documentation checklist

- Update `CHANGELOG.md` for every feature, fix, or refactor.
- Update `README.md` when commands, the pipeline, installation, or editions change.
- Update `plugins/vibeflow/README.md` when the universal plugin changes.
- Update the relevant Copilot and Cursor READMEs when those editions change.
- Update `MANUAL.md` when command behavior, flags, or the workflow changes.
- Update `CONTRIBUTING.md` when project structure or maintenance changes.

## Versioning

For a shared plugin release, keep these values aligned:

- `CHANGELOG.md`
- `plugins/vibeflow/.claude-plugin/plugin.json`
- `plugins/vibeflow/.codex-plugin/plugin.json`
- `.claude-plugin/marketplace.json` top-level, metadata, and plugin versions

Change `cli/package.json` only when the CLI changes.

## Platform notes

- Shared skills must validate as Codex skills. Keep frontmatter portable: use
  `name`, `description`, and supported shared fields; do not add Claude-only
  `argument-hint` to the shared source.
- Claude discovers the `agents/` directory and uses namespaced slash commands.
- Codex discovers focused skills from their descriptions and uses its native
  task and agent model. Do not emulate the Claude architect agent in a Codex
  manifest.
- Copilot uses `.prompt.md` files with `description` and `agent` frontmatter.
- Cursor descriptions need precise “Use when...” triggers for auto-invocation.
- `implement` is available in every edition. `prompt-pack` remains an option
  for delegation to another task or agent.

## Prompt style

Write for current frontier models. State a rule once, without caps emphasis or
ceremonial repetition. Keep literal guardrails such as budget values, DoD
limits, Critical Gate rules, marker contracts, artifact paths, and output
formats. Use `proposals/unhobbling-style.md` as the normative style guide.

## Site

The marketing site is independent of the methodology. Site-only design and
copy changes do not require cross-edition sync or a plugin version bump.
