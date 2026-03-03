# Vibeflow — Copilot Edition

Arquivos de configuração do **Vibeflow** (spec-driven development) para GitHub Copilot.

Inclui prompts reutilizáveis, agent persona (Architect), skill reference e instruções da metodologia.

## O que está incluído

```
AGENTS.md                                        → raiz do repo (append se já existir)
github/
├── copilot-instructions.md                       → snippet de append (NÃO é o arquivo final)
├── instructions/
│   └── vibeflow/
│       └── vibeflow.instructions.md              → .github/instructions/vibeflow/
├── agents/
│   └── vibeflow/
│       └── architect.agent.md                    → .github/agents/vibeflow/
├── prompts/
│   └── vibeflow/
│       ├── vibeflow-analyze.prompt.md            → .github/prompts/vibeflow/
│       ├── vibeflow-audit.prompt.md
│       ├── vibeflow-discover.prompt.md
│       ├── vibeflow-gen-spec.prompt.md
│       ├── vibeflow-prompt-pack.prompt.md
│       ├── vibeflow-quick.prompt.md
│       ├── vibeflow-stats.prompt.md
│       └── vibeflow-teach.prompt.md
└── skills/
    └── vibeflow/
        └── spec-driven-dev/
            └── SKILL.md                          → .github/skills/vibeflow/
```

Tudo fica namespaced dentro de `vibeflow/` — não bagunça pastas existentes do projeto.

## Instalação

### Repo novo (sem nada configurado)

```bash
# Na raiz do repo destino
cp AGENTS.md /caminho/do/seu/repo/
cp -r github/ /caminho/do/seu/repo/.github/
```

Remova a nota de instrução do topo do `AGENTS.md` (o bloco entre `>` e `---`).

Pronto.

### Repo que JÁ tem AGENTS.md e/ou copilot-instructions.md

A estratégia: **copiar as pastas novas + append mínimo nos arquivos existentes**.

#### Passo 1 — Copie as pastas (seguro, não sobrescreve nada)

```bash
cp -r github/instructions/ .github/instructions/
cp -r github/agents/       .github/agents/
cp -r github/prompts/      .github/prompts/
cp -r github/skills/       .github/skills/
```

Como tudo está dentro de subpastas `vibeflow/`, isso não sobrescreve nenhum arquivo existente do projeto.

#### Passo 2 — copilot-instructions.md

O Copilot carrega automaticamente os arquivos de `.github/instructions/`.
O `vibeflow.instructions.md` que você acabou de copiar já será lido.

Se quiser ser explícito, adicione este bloco ao seu `.github/copilot-instructions.md` existente:

```markdown
## Vibeflow (Spec-Driven Development)

This repo uses Vibeflow. See `.github/instructions/vibeflow/vibeflow.instructions.md`
for the full methodology, guardrails, and available prompts.

Before any non-trivial task, follow:
`discover → analyze → gen-spec → prompt-pack → implement → audit`.

Before any task, read `.vibeflow/index.md` and `.vibeflow/conventions.md` (if they exist).
```

> **Se o repo NÃO tem `copilot-instructions.md`:** não precisa criar um.
> O arquivo em `.github/instructions/vibeflow/` já cobre tudo.

#### Passo 3 — AGENTS.md

Se já existe um `AGENTS.md`, faça append do conteúdo abaixo do `---` do arquivo `AGENTS.md` deste repo ao final do seu.

Se não existe, copie o arquivo (removendo a nota de instrução do topo).

### Resumo: o que conflita e o que não conflita

| Arquivo / Pasta | Pode conflitar? | O que fazer |
|-----------------|----------------|-------------|
| `.github/instructions/vibeflow/` | Não | Copia direto |
| `.github/agents/vibeflow/` | Não | Copia direto |
| `.github/prompts/vibeflow/` | Não | Copia direto |
| `.github/skills/vibeflow/` | Não | Copia direto |
| `.github/copilot-instructions.md` | Talvez | Append opcional (instructions/ já cobre) |
| `AGENTS.md` | **Sim** | Append ao existente |

## Após a instalação

1. **Rode o analyze** — Use o prompt `vibeflow-analyze` para gerar a pasta `.vibeflow/` com o conhecimento do projeto.
2. **Adicione `.vibeflow/` ao git** — Os docs gerados são feitos para serem commitados.
3. **Comece pelo discover** — Para features novas, use `vibeflow-discover` antes de codar.

## Estrutura gerada pelo Vibeflow

Após o primeiro `analyze`, o repo terá:

```
.vibeflow/
├── index.md          # Overview do projeto
├── conventions.md    # Convenções de código
├── decisions.md      # Log de decisões arquiteturais
├── patterns/         # Um doc por padrão descoberto
├── prds/             # PRDs do discover
├── specs/            # Specs do gen-spec
├── prompt-packs/     # Prompt packs prontos
└── audits/           # Relatórios de auditoria
```
