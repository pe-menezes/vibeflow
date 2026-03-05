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
    ├── vibeflow-analyze-satellite/SKILL.md       → .cursor/skills/ (analyze dependency repo, merge patterns with provenance)
    ├── vibeflow-discover/SKILL.md                → .cursor/skills/ (idea → PRD)
    ├── vibeflow-gen-spec/SKILL.md                → .cursor/skills/ (PRD/feature → spec)
    ├── vibeflow-prompt-pack/SKILL.md             → .cursor/skills/ (spec → prompt pack)
    ├── vibeflow-audit/SKILL.md                   → .cursor/skills/ (verify DoD + patterns)
    ├── vibeflow-quick/SKILL.md                   → .cursor/skills/ (fast-track ≤4 files)
    ├── vibeflow-teach/SKILL.md                   → .cursor/skills/ (update .vibeflow/ knowledge)
    ├── vibeflow-stats/SKILL.md                   → .cursor/skills/ (audit statistics)
    └── vibeflow-spec-driven-dev/SKILL.md         → .cursor/skills/ (methodology reference)
```

Todos os arquivos usam o prefixo `vibeflow-` para evitar conflitos com arquivos do projeto.

**Git:** Por padrão, o instalador (`npx setup-vibeflow@latest --cursor`) adiciona ao `.gitignore` os arquivos instalados e a pasta `.vibeflow/` (gerada pelo analyze). Assim eles não entram no commit. Se quiser versionar no git, remova o bloco "Vibeflow" do `.gitignore`.

## Instalação

### Repo novo (sem nada configurado)

```bash
# Na raiz do repo destino
cp cursor/AGENTS.md .
cp -r cursor/rules/ .cursor/rules/
cp -r cursor/skills/ .cursor/skills/
```

Remova a nota de instrução do topo do `AGENTS.md` (o bloco entre `>` e `---`).

### Repo que JÁ tem AGENTS.md e/ou .cursor/rules/

**Passo 1 — Copie os arquivos (seguro, não sobrescreve nada)**

```bash
cp cursor/rules/vibeflow.mdc .cursor/rules/
cp cursor/rules/vibeflow-architect.mdc .cursor/rules/
cp -r cursor/skills/vibeflow-*/ .cursor/skills/
```

Os arquivos Vibeflow usam prefixo `vibeflow-` nos nomes, então não conflitam com arquivos existentes.

**Passo 2 — AGENTS.md**

Se já existe, faça append do conteúdo abaixo do `---` do `AGENTS.md` ao final do seu.
Se não existe, copie direto (removendo a nota do topo).

### O que conflita e o que não conflita

| Arquivo / Pasta | Pode conflitar? | O que fazer |
|-----------------|----------------|-------------|
| `.cursor/rules/vibeflow.mdc` | Não | Copia direto (nome único) |
| `.cursor/rules/vibeflow-architect.mdc` | Não | Copia direto (nome único) |
| `.cursor/skills/vibeflow-*/` | Não | Copia direto (prefixo único) |
| `AGENTS.md` | **Sim** | Append ao existente |

## Como usar

Após a instalação, os skills ficam disponíveis no Cursor de duas formas:

### Invocação automática
O Cursor detecta automaticamente qual skill é relevante baseado no contexto da conversa. Por exemplo, se você mencionar "quero criar uma nova feature", o skill `vibeflow-discover` pode ser ativado automaticamente.

### Invocação manual (slash commands)
Digite `/` no Agent chat e busque pelo nome do skill:

- `/vibeflow-analyze` — analisa o codebase e gera `.vibeflow/`
- `/vibeflow-analyze-satellite` — analisa repo satélite (ex.: design system), filtra por uso e merge em `.vibeflow/patterns/satellite-<nome>/`
- `/vibeflow-discover` — transforma ideia em PRD
- `/vibeflow-gen-spec` — gera spec com DoD
- `/vibeflow-prompt-pack` — gera prompt pack para coding agent
- `/vibeflow-audit` — audita implementação contra DoD
- `/vibeflow-quick` — fast-track para tarefas pequenas
- `/vibeflow-teach` — atualiza `.vibeflow/` com feedback
- `/vibeflow-stats` — estatísticas de auditorias

### Rules

As rules são aplicadas automaticamente:
- **vibeflow.mdc** (`alwaysApply: true`) — guardrails e overview da metodologia, ativas em toda conversa
- **vibeflow-architect.mdc** (`alwaysApply: false`) — persona do Architect, ativada pelo Cursor quando a conversa envolve planejamento, specs ou auditorias

### Instalação automática (experimental)

Se preferir, use o instalador automático:

```bash
npx setup-vibeflow@latest --cursor
```

## Após a instalação

1. Use o skill `vibeflow-analyze` para gerar a pasta `.vibeflow/`.
2. Adicione `.vibeflow/` ao git.
3. Para features novas, comece pelo `vibeflow-discover`.

Veja o [MANUAL.md](../MANUAL.md) para a documentação completa.
