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
    │   ├── vibeflow-analyze.prompt.md        (core: deep-analyze codebase)
    │   ├── vibeflow-gen-spec.prompt.md       (core: feature/PRD → spec)
    │   ├── vibeflow-implement.prompt.md      (core: spec → code with guardrails)
    │   ├── vibeflow-audit.prompt.md          (secondary: verify DoD + patterns)
    │   ├── vibeflow-discover.prompt.md       (secondary: idea → PRD)
    │   ├── vibeflow-prompt-pack.prompt.md    (secondary: spec → prompt pack)
    │   ├── vibeflow-quick.prompt.md          (utility: fast-track ≤4 files)
    │   ├── vibeflow-teach.prompt.md          (utility: update .vibeflow/ + --from import)
    │   └── vibeflow-stats.prompt.md          (utility: audit statistics)
    └── skills/                                       → (reserved for future use)
```

Todos os arquivos usam o prefixo `vibeflow-` para evitar conflitos com arquivos do projeto.
Instructions ficam em subpasta `vibeflow/` (subdirectories suportados pelo Copilot).

**Git:** Por padrão, o instalador (`npx setup-vibeflow@latest --copilot`) adiciona ao `.gitignore` os arquivos instalados e a pasta `.vibeflow/` (gerada pelo analyze). Assim eles não entram no commit. Se quiser versionar no git, remova o bloco "Vibeflow" do `.gitignore`.

## Instalação

Na raiz do repo destino:

```bash
npx setup-vibeflow@latest --copilot
```

O instalador copia os arquivos, cria diretórios, e faz append no `AGENTS.md` e `copilot-instructions.md` automaticamente.

## Após a instalação

1. Use o prompt `vibeflow-analyze` para gerar a pasta `.vibeflow/`.
2. Adicione `.vibeflow/` ao git.
3. Para features novas, comece pelo `vibeflow-discover`.

Veja o [MANUAL.md](../MANUAL.md) para a documentação completa, ou acesse [vibeflow.run](https://vibeflow.run) para documentação dos comandos e sobre o plugin.
