# Vibeflow

**Spec-driven development** — defina o que construir antes de codar.

Vibeflow separa quem pensa de quem implementa. O Architect (você + IA) define specs, toma decisões e corta escopo. O Coding Agent recebe um prompt pack auto-contido e implementa seguindo os padrões reais do projeto.

## O pipeline

```
discover → analyze → gen-spec → prompt-pack → implement → audit
```

## Edições disponíveis

| Edição | Pasta | Status |
|--------|-------|--------|
| **GitHub Copilot** | [`copilot/`](copilot/) | Disponível |
| **Cursor** | [`cursor/`](cursor/) | Disponível |
| **Claude Code** | [`claude-code/`](claude-code/) | Disponível |

Cada edição adapta os mesmos prompts e metodologia ao formato do agente.
O conteúdo da metodologia é o mesmo — o que muda é a estrutura de arquivos.

O instalador (Copilot e Cursor) adiciona por padrão os arquivos instalados e a pasta `.vibeflow/` ao `.gitignore`; remova esse bloco se quiser versioná-los no git.

### Claude Code

O Claude Code usa um sistema de plugins baseado em git. O repo de distribuição
(marketplace) é mantido separado:

**Repo de distribuição (marketplace):** [pe-menezes/vibeflow-claude](https://github.com/pe-menezes/vibeflow-claude) — sincronizado automaticamente a partir de `claude-code/` neste repo.

Instale via Claude Code (Add marketplace / CLI):
```
pe-menezes/vibeflow-claude
```
Ou: `/install-plugin pe-menezes/vibeflow-claude`

O source of truth dos arquivos Claude Code está em `claude-code/` neste repo.

### Cursor

Veja [`cursor/README.md`](cursor/README.md) para instruções de instalação.

Ou, se preferir, use o instalador automático (experimental):
```bash
npx setup-vibeflow@latest --cursor
```

Usa **Rules** (`.cursor/rules/*.mdc`) para guardrails always-on e persona do Architect,
e **Skills** (`.cursor/skills/*/SKILL.md`) para cada comando do pipeline — invocáveis
via `/skill-name` no Agent chat ou automaticamente por contexto.

### GitHub Copilot

Veja [`copilot/README.md`](copilot/README.md) para instruções de instalação.

Ou, se preferir, use o instalador automático (experimental):
```bash
npx setup-vibeflow@latest --copilot
```

## Manual

Veja o [MANUAL.md](MANUAL.md) para a documentação completa de todos os comandos, fluxos e a metodologia.
