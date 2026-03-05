# Vibeflow — Copilot Edition

Arquivos de configuração do Vibeflow para **GitHub Copilot**.

## O que está incluído

```
copilot/
├── AGENTS.md                                     → raiz do repo (append se já existir)
├── copilot-instructions.md                       → snippet de append (opcional)
└── github/                                       → mapeia para .github/ no repo destino
    ├── instructions/vibeflow/
    │   └── vibeflow.instructions.md              → instruções completas
    ├── agents/
    │   └── vibeflow-architect.agent.md           → persona do Architect
    ├── prompts/
    │   ├── vibeflow-analyze.prompt.md
    │   ├── vibeflow-analyze-satellite.prompt.md
    │   ├── vibeflow-audit.prompt.md
    │   ├── vibeflow-discover.prompt.md
    │   ├── vibeflow-gen-spec.prompt.md
    │   ├── vibeflow-prompt-pack.prompt.md
    │   ├── vibeflow-quick.prompt.md
    │   ├── vibeflow-stats.prompt.md
    │   └── vibeflow-teach.prompt.md
    └── skills/
        └── vibeflow-spec-driven-dev/
            └── SKILL.md
```

Todos os arquivos usam o prefixo `vibeflow-` para evitar conflitos com arquivos do projeto.
Instructions ficam em subpasta `vibeflow/` (subdirectories suportados pelo Copilot).

**Git:** Por padrão, o instalador (`npx setup-vibeflow@latest --copilot`) adiciona ao `.gitignore` os arquivos instalados e a pasta `.vibeflow/` (gerada pelo analyze). Assim eles não entram no commit. Se quiser versionar no git, remova o bloco "Vibeflow" do `.gitignore`.

## Instalação

### Repo novo (sem nada configurado)

```bash
# Na raiz do repo destino
cp copilot/AGENTS.md .
cp -r copilot/github/ .github/
```

Remova a nota de instrução do topo do `AGENTS.md` (o bloco entre `>` e `---`).

#### Repo que JÁ tem AGENTS.md e/ou copilot-instructions.md

**Passo 1 — Copie os arquivos (seguro, não sobrescreve nada)**

```bash
cp -r copilot/github/instructions/ .github/instructions/
cp copilot/github/agents/vibeflow-architect.agent.md .github/agents/
cp copilot/github/prompts/vibeflow-*.prompt.md .github/prompts/
cp -r copilot/github/skills/vibeflow-spec-driven-dev/ .github/skills/
```

Os arquivos Vibeflow usam prefixo `vibeflow-` nos nomes, então não conflitam com arquivos existentes.

**Passo 2 — copilot-instructions.md (opcional)**

O Copilot carrega automaticamente os arquivos de `.github/instructions/`.
O `vibeflow.instructions.md` que você copiou já será lido.

Se quiser ser explícito, veja o snippet em `copilot-instructions.md` e adicione ao seu existente.

**Passo 3 — AGENTS.md**

Se já existe, faça append do conteúdo abaixo do `---` do `AGENTS.md` ao final do seu.
Se não existe, copie direto (removendo a nota do topo).

### O que conflita e o que não conflita

| Arquivo / Pasta | Pode conflitar? | O que fazer |
|-----------------|----------------|-------------|
| `.github/instructions/vibeflow/` | Não | Copia direto (subpasta dedicada) |
| `.github/agents/vibeflow-architect.agent.md` | Não | Copia direto (nome único) |
| `.github/prompts/vibeflow-*.prompt.md` | Não | Copia direto (prefixo único) |
| `.github/skills/vibeflow-spec-driven-dev/` | Não | Copia direto (diretório dedicado) |
| `.github/copilot-instructions.md` | Talvez | Append opcional |
| `AGENTS.md` | **Sim** | Append ao existente |

### Instalação automática (experimental)

Se preferir, use o instalador automático. Ele copia os arquivos, cria
diretórios, e faz append no AGENTS.md e copilot-instructions.md automaticamente:

```bash
npx setup-vibeflow@latest --copilot
```

## Após a instalação

1. Use o prompt `vibeflow-analyze` para gerar a pasta `.vibeflow/`.
2. Adicione `.vibeflow/` ao git.
3. Para features novas, comece pelo `vibeflow-discover`.

Veja o [MANUAL.md](../MANUAL.md) para a documentação completa.
