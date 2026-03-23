# Vibeflow Monorepo

## Structure

This monorepo contains 3 editions of the same methodology, a marketing site, and a CLI installer:

- `claude-code/` — Claude Code plugin (source of truth for command logic)
- `copilot/` — GitHub Copilot edition (prompts, agents, instructions)
- `cursor/` — Cursor edition (skills, rules)
- `site/` — Marketing website (Astro, bilingual: en + pt-br)
- `cli/` — npm installer (`setup-vibeflow`)

## Cross-Edition Sync Rules

**Claude Code is the source of truth.** When a command's logic or description
changes in `claude-code/skills/`, the same change MUST be applied to the
corresponding files in `copilot/` and `cursor/`.

### File mapping

| Claude Code | Copilot | Cursor |
|---|---|---|
| `skills/analyze/SKILL.md` | `github/prompts/vibeflow-analyze.prompt.md` | `skills/vibeflow-analyze/SKILL.md` |
| `skills/discover/SKILL.md` | `github/prompts/vibeflow-discover.prompt.md` | `skills/vibeflow-discover/SKILL.md` |
| `skills/gen-spec/SKILL.md` | `github/prompts/vibeflow-gen-spec.prompt.md` | `skills/vibeflow-gen-spec/SKILL.md` |
| `skills/implement/SKILL.md` | `github/prompts/vibeflow-implement.prompt.md` | `skills/vibeflow-implement/SKILL.md` |
| `skills/audit/SKILL.md` | `github/prompts/vibeflow-audit.prompt.md` | `skills/vibeflow-audit/SKILL.md` |
| `skills/prompt-pack/SKILL.md` | `github/prompts/vibeflow-prompt-pack.prompt.md` | `skills/vibeflow-prompt-pack/SKILL.md` |
| `skills/quick/SKILL.md` | `github/prompts/vibeflow-quick.prompt.md` | `skills/vibeflow-quick/SKILL.md` |
| `skills/teach/SKILL.md` | `github/prompts/vibeflow-teach.prompt.md` | `skills/vibeflow-teach/SKILL.md` |
| `skills/stats/SKILL.md` | `github/prompts/vibeflow-stats.prompt.md` | `skills/vibeflow-stats/SKILL.md` |
| `agents/architect.md` | `github/agents/vibeflow-architect.agent.md` | `rules/vibeflow-architect.mdc` |

### What to sync

- **Command logic changes** → all 3 editions
- **Description changes** → all 3 editions + README command tables
- **New command added** → all 3 editions + all READMEs + MANUAL.md
- **Command removed** → all 3 editions + all READMEs + MANUAL.md

## Documentation Checklist

When making changes, check if these docs need updating:

- [ ] `CHANGELOG.md` — Always. Add entry for any feature/fix/refactor.
- [ ] `README.md` (root) — If commands, pipeline, or editions changed
- [ ] `claude-code/README.md` — If Claude Code edition changed
- [ ] `copilot/README.md` — If Copilot edition changed
- [ ] `cursor/README.md` — If Cursor edition changed
- [ ] `MANUAL.md` — If command behavior, flags, or workflow changed
- [ ] `CONTRIBUTING.md` — If project structure changed

## Version Bump

After significant changes, bump version in:
- `CHANGELOG.md` (new entry at top)
- `claude-code/.claude-plugin/plugin.json` (`"version"` field)

## Site

The marketing site (`site/`) is independent of the methodology.
Site-only changes (design, copy, new pages) do NOT require edition
sync or CHANGELOG entries.

## Platform-Specific Notes

- **Copilot** — Uses `.prompt.md` files with `description` + `agent` in YAML frontmatter. Descriptions are short (1 line).
- **Cursor** — Uses `SKILL.md` files with `description` in YAML frontmatter. Descriptions include "Use when..." trigger hints for auto-invocation.
- **Claude Code** — Uses `SKILL.md` files with `name`, `description`, `argument-hint`, `allowed-tools` in YAML frontmatter. Descriptions in 3rd person with "Use when..." context.
- **`implement`** is available in all 3 editions. Agents in Copilot and Cursor have filesystem access and can execute specs directly. `prompt-pack` remains available as an alternative for delegating to a separate session/agent.

## Obsidian Vault — Integração

Este projeto tem um board Kanban e notas no vault Obsidian do Pedro.

**Caminho do vault:** `~/Documents/Obsidian Vault/`
**Board do projeto:** `~/Documents/Obsidian Vault/Projetos/VibeFlow/VibeFlow - Kanban.md`

### Regras de operação

1. **Ao começar a trabalhar numa tarefa:**
   - Ler o board Kanban pra saber o que tá no backlog/sprint
   - Mover a tarefa pro "Fazendo" no board

2. **Ao concluir uma tarefa:**
   - Mover a tarefa pra "Feito" no board Kanban
   - Se surgiram novas tarefas durante o trabalho, adicionar no "Backlog"

3. **Ao descobrir algo relevante sobre o Pedro ou o projeto:**
   - Atualizar `~/Documents/Obsidian Vault/MEMORY.md` com o fato novo
   - Atualizar o log diário em `~/Documents/Obsidian Vault/memory/YYYY-MM-DD.md`

### Formato do board Kanban

O arquivo usa o plugin Kanban do Obsidian. Estrutura:

```markdown
---
kanban-plugin: basic
---

## Backlog
- [ ] tarefa aqui

## A Fazer (Sprint)
- [ ] tarefa aqui

## Fazendo
- [ ] tarefa aqui

## Em Review
- [ ] tarefa aqui

## Feito
- [x] tarefa aqui
```

Para mover uma tarefa entre colunas: cortar a linha de uma seção e colar na outra.

### Formato de tarefas (compatível com Tasks plugin)
- `- [ ] Tarefa 📅 2026-03-20` (com data)
- `- [ ] Tarefa ⏫ 📅 2026-03-20` (prioridade alta)
- `- [x] Tarefa ✅ 2026-03-20` (concluída)

### Página descritiva do projeto

**Arquivo:** `~/Documents/Obsidian Vault/Projetos/VibeFlow/VibeFlow - O Projeto.md`

Este documento é a **fonte da verdade** sobre o que é o VibeFlow — metodologia, edições, pipeline, features. O Claude Code DEVE atualizar este documento sempre que:
- Adicionar/remover/mudar comandos
- Lançar nova versão
- Adicionar nova edição ou plataforma
- Mudar o pipeline ou metodologia
- Algo relevante acontecer (adoção na Stone, etc.)
