# Vibeflow Monorepo

## Structure

This monorepo contains one shared plugin, three file-based editions, a
marketing site, and an installer:

- `plugins/vibeflow/` — universal Claude + Codex + Hermes plugin and source of truth for skill logic
- `.claude-plugin/marketplace.json` — Claude marketplace catalog
- `.agents/plugins/marketplace.json` — Codex marketplace catalog
- `copilot/` — GitHub Copilot prompts, agents, and instructions
- `cursor/` — Cursor skills and rules
- `opencode/` — OpenCode agents and commands; its workflows are the shared skills
- `site/` — Astro marketing site, bilingual in English and Portuguese
- `cli/` — npm installer for the Copilot, Cursor and OpenCode editions

`pe-menezes/vibeflow-claude` is a generated compatibility mirror. Never edit
it as a source repository.

## Cross-edition sync

The shared plugin skills are the reference. When a workflow's logic or
description changes in `plugins/vibeflow/skills/`, apply the equivalent change
to Copilot and Cursor in the same pull request.

OpenCode has no copy of a workflow: the CLI installs the shared `SKILL.md`
itself into `.opencode/skills/<name>/`, so a change to a workflow's logic
changes nothing in `opencode/`. Its command file per workflow holds only a
`description`, which restates the skill's, and the line that loads the skill:
it changes only when the skill's description does.

| Shared plugin | Copilot | Cursor | OpenCode |
|---|---|---|---|
| `skills/analyze/SKILL.md` | `github/prompts/vibeflow-analyze.prompt.md` | `skills/vibeflow-analyze/SKILL.md` | logic: nothing · description: `commands/vibeflow-analyze.md` |
| `skills/discover/SKILL.md` | `github/prompts/vibeflow-discover.prompt.md` | `skills/vibeflow-discover/SKILL.md` | logic: nothing · description: `commands/vibeflow-discover.md` |
| `skills/gen-spec/SKILL.md` | `github/prompts/vibeflow-gen-spec.prompt.md` | `skills/vibeflow-gen-spec/SKILL.md` | logic: nothing · description: `commands/vibeflow-gen-spec.md` |
| `skills/implement/SKILL.md` | `github/prompts/vibeflow-implement.prompt.md` | `skills/vibeflow-implement/SKILL.md` | logic: nothing · description: `commands/vibeflow-implement.md` |
| `skills/audit/SKILL.md` | `github/prompts/vibeflow-audit.prompt.md` | `skills/vibeflow-audit/SKILL.md` | logic: nothing · description: `commands/vibeflow-audit.md` |
| `skills/hotfix/SKILL.md` | `github/prompts/vibeflow-hotfix.prompt.md` | `skills/vibeflow-hotfix/SKILL.md` | logic: nothing · description: `commands/vibeflow-hotfix.md` |
| `skills/prompt-pack/SKILL.md` | `github/prompts/vibeflow-prompt-pack.prompt.md` | `skills/vibeflow-prompt-pack/SKILL.md` | logic: nothing · description: `commands/vibeflow-prompt-pack.md` |
| `skills/quick/SKILL.md` | `github/prompts/vibeflow-quick.prompt.md` | `skills/vibeflow-quick/SKILL.md` | logic: nothing · description: `commands/vibeflow-quick.md` |
| `skills/teach/SKILL.md` | `github/prompts/vibeflow-teach.prompt.md` | `skills/vibeflow-teach/SKILL.md` | logic: nothing · description: `commands/vibeflow-teach.md` |
| `skills/stats/SKILL.md` | `github/prompts/vibeflow-stats.prompt.md` | `skills/vibeflow-stats/SKILL.md` | logic: nothing · description: `commands/vibeflow-stats.md` |
| `agents/architect.md` | `github/agents/vibeflow-architect.agent.md` | `rules/vibeflow-architect.mdc` | `agents/architect.md`, the same body with the host's index and command forms |
| `skills/implement/loop/` (the loop kit) | installed by the CLI into `.github/vibeflow/loop/` | installed by the CLI into `.cursor/skills/vibeflow-implement/loop/` | installed by the CLI into `.opencode/skills/implement/loop/` |
| `agents/executor.md`, `agents/auditor.md` | the roles in the installed kit (`roles/executor.md`, `roles/auditor.md`), read by a chat the user opens | the same, from the installed kit | `agents/executor.md`, `agents/auditor.md`, the role's body after OpenCode's own front matter |

The loop kit has one source, `plugins/vibeflow/skills/implement/loop/`; the
Copilot, Cursor and OpenCode editions never hold a copy, because `cli/index.js`
downloads the files that `loop/manifest.json` lists. The shared skills reach
OpenCode the same way: `cli/index.js` downloads each workflow's `SKILL.md`, so
a file added to a shared skill folder outside `loop/` needs its own entry in
`OPENCODE_FILES`. The executor and auditor roles live in `loop/roles/`; the
Claude agents and the OpenCode agents carry the same body after their front
matter. Codex reaches the roles through its native subagent or a new task given
the briefing's path; Hermes through a `delegate_task` task whose `goal` points
at the briefing and whose `context` names the role file; OpenCode through a
`subagent` call to its `executor` or `auditor` agent; Cursor and Copilot
through a new chat the user opens with the orchestrator's one-line instruction,
whose briefing points at the role file. A change to a role changes the role
file, its Claude agent and its OpenCode agent.

- Command logic changes affect the shared plugin, Copilot, and Cursor; OpenCode
  runs the shared skill as it is.
- Claude, Codex, and Hermes packaging changes affect only their manifests or
  catalogs; OpenCode packaging changes affect `opencode/` and its entries in
  `cli/index.js`.
- New or removed workflows affect every edition plus the READMEs and manual.

## Documentation checklist

- Update `CHANGELOG.md` for every feature, fix, or refactor.
- Update `README.md` when commands, the pipeline, installation, or editions change.
- Update `plugins/vibeflow/README.md` when the universal plugin changes.
- Update the relevant Copilot, Cursor and OpenCode READMEs when those editions change.
- Update `MANUAL.md` when command behavior, flags, or the workflow changes.
- Update `CONTRIBUTING.md` when project structure or maintenance changes.

## Versioning

For a shared plugin release, keep these values aligned:

- `CHANGELOG.md`
- `plugins/vibeflow/.claude-plugin/plugin.json`
- `plugins/vibeflow/.codex-plugin/plugin.json`
- `plugins/vibeflow/plugin.json`
- `.claude-plugin/marketplace.json` top-level, metadata, and plugin versions

Change `cli/package.json` only when the CLI changes.

When a release changes the CLI, publish the CLI to npm when the release
reaches `main`: the published CLI downloads the prompts and the shared skills
from `main`, the Cursor and Copilot prompts name the CLI version they need, and
the shared skills name the one OpenCode needs.

## Platform notes

- Shared skills must validate as Codex skills. Keep frontmatter portable: use
  `name`, `description`, and supported shared fields; do not add Claude-only
  `argument-hint` to the shared source.
- Claude discovers the `agents/` directory and uses namespaced slash commands.
- Codex discovers focused skills from their descriptions and uses its native
  task and agent model. Do not emulate the Claude architect agent in a Codex
  manifest.
- Hermes Agent reads the Agent Plugins v1 manifest at
  `plugins/vibeflow/plugin.json`, discovers `skills/*/SKILL.md` by position,
  and ignores `agents/`. It accepts `allowed-tools` in the frontmatter without
  applying it.
- OpenCode loads `.opencode/skills/<name>/SKILL.md` only when the skill's
  `name` matches its folder, and names an agent and a command after its file.
  It drops an agent file whose `tools:` is a comma-separated list, so its
  agents declare a `permission` map that opens with `"*": deny`, because the
  last matching rule wins over a host default that allows everything.
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
