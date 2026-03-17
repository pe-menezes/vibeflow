# Vibeflow — Cursor Edition

Arquivos de configuração do Vibeflow para **Cursor**.

## O que está incluído

```
cursor/
├── AGENTS.md                                     → raiz do repo (append se já existir)
├── rules/
│   ├── vibeflow.mdc                              → .cursor/rules/ (always apply — guardrails)
│   └── vibeflow-architect.mdc                    → .cursor/rules/ (agent-decided — persona)
└── skills/
    ├── vibeflow-analyze/SKILL.md                 → .cursor/skills/ (deep-analyze codebase)
    ├── vibeflow-gen-spec/SKILL.md                → .cursor/skills/ (feature/PRD → spec)
    ├── vibeflow-prompt-pack/SKILL.md             → .cursor/skills/ (spec → prompt pack)
    ├── vibeflow-audit/SKILL.md                   → .cursor/skills/ (verify DoD + patterns)
    ├── vibeflow-discover/SKILL.md                → .cursor/skills/ (idea → PRD)
    ├── vibeflow-quick/SKILL.md                   → .cursor/skills/ (fast-track ≤4 files)
    ├── vibeflow-teach/SKILL.md                   → .cursor/skills/ (update .vibeflow/ + --from import)
    └── vibeflow-stats/SKILL.md                   → .cursor/skills/ (audit statistics)
```

Todos os arquivos usam o prefixo `vibeflow-` para evitar conflitos com arquivos do projeto.

**Git:** Por padrão, o instalador (`npx setup-vibeflow@latest --cursor`) adiciona ao `.gitignore` os arquivos instalados e a pasta `.vibeflow/` (gerada pelo analyze). Assim eles não entram no commit. Se quiser versionar no git, remova o bloco "Vibeflow" do `.gitignore`.

## Instalação

Na raiz do repo destino:

```bash
npx setup-vibeflow@latest --cursor
```

O instalador copia os arquivos, cria diretórios, e faz append no `AGENTS.md` automaticamente.

## Como usar

Após a instalação, os skills ficam disponíveis no Cursor de duas formas:

### Invocação automática
O Cursor detecta automaticamente qual skill é relevante baseado no contexto da conversa. Por exemplo, se você mencionar "quero criar uma nova feature", o skill `vibeflow-discover` pode ser ativado automaticamente.

### Invocação manual (slash commands)
Digite `/` no Agent chat e busque pelo nome do skill:

**Core:**
- `/vibeflow-analyze` — analisa o codebase, gera `.vibeflow/` (flags: `--fresh`, `--scope`, `--interactive`, `--satellite`)
- `/vibeflow-gen-spec` — gera spec com DoD, scope, anti-scope e patterns aplicáveis
- `/vibeflow-implement` — implementa a spec com guardrails (budget, DoD, padrões)
- `/vibeflow-prompt-pack` — gera prompt pack autocontido com patterns embarcados

**Secundários:**
- `/vibeflow-audit` — audita implementação contra DoD + patterns + testes (PASS / PARTIAL / FAIL)
- `/vibeflow-discover` — diálogo interativo (1–5 rounds) para transformar ideia vaga em PRD

**Utilitários:**
- `/vibeflow-quick` — fast-track para tarefas pequenas (≤4 arquivos)
- `/vibeflow-teach` — atualiza `.vibeflow/` com correções, convenções ou decisões. `--from <url|path>` importa padrões de repos externos
- `/vibeflow-stats` — estatísticas de auditorias: taxas, violações, tendências

### Rules

As rules são aplicadas automaticamente:
- **vibeflow.mdc** (`alwaysApply: true`) — guardrails e overview da metodologia, ativas em toda conversa
- **vibeflow-architect.mdc** (`alwaysApply: false`) — persona do Architect, ativada pelo Cursor quando a conversa envolve planejamento, specs ou auditorias

## Após a instalação

1. Use o skill `vibeflow-analyze` para gerar a pasta `.vibeflow/`.
2. Adicione `.vibeflow/` ao git.
3. Para features novas, comece pelo `vibeflow-discover`.

Veja o [MANUAL.md](../MANUAL.md) para a documentação completa, ou acesse [vibeflow.run](https://vibeflow.run) para documentação dos comandos e sobre o plugin.
