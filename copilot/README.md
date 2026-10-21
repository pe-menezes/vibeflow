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
    │   ├── vibeflow-audit.prompt.md          (secondary: verify DoD + patterns + gate)
    │   ├── vibeflow-discover.prompt.md       (secondary: idea → PRD)
    │   ├── vibeflow-prompt-pack.prompt.md    (secondary: spec → prompt pack)
    │   ├── vibeflow-hotfix.prompt.md         (secondary: evidence → trace doc + fix + test)
    │   ├── vibeflow-quick.prompt.md          (utility: fast-track ≤4 files)
    │   ├── vibeflow-teach.prompt.md          (utility: update .vibeflow/ + --from import)
    │   └── vibeflow-stats.prompt.md          (utility: audit statistics)
    └── skills/                                       → (reserved for future use)
```

O instalador também copia o kit do loop de execução para `.github/vibeflow/loop/`, baixando do plugin (`plugins/vibeflow/skills/implement/loop/`, a fonte única) os arquivos que o `manifest.json` do kit lista, e o bloco do `.gitignore` ganha `.github/vibeflow/`. Instalação feita antes do CLI 0.17.0 não tem o kit: `npx setup-vibeflow@latest --copilot --force` instala.

Todos os arquivos usam o prefixo `vibeflow-` para evitar conflitos com arquivos do projeto.
Instructions ficam em subpasta `vibeflow/` (subdirectories suportados pelo Copilot).

**Git:** Por padrão, o instalador (`npx setup-vibeflow@latest --copilot`) adiciona ao `.gitignore` os arquivos instalados e a pasta `.vibeflow/` (gerada pelo analyze). Assim eles não entram no commit. Se quiser versionar no git, remova o bloco "Vibeflow" do `.gitignore`.

## Instalação

Na raiz do repo destino:

```bash
npx setup-vibeflow@latest --copilot
```

O instalador copia os arquivos, cria diretórios, e faz append no `AGENTS.md` e `copilot-instructions.md` automaticamente.

## Loop de execução (opcional)

Desligado por padrão. Com o prompt `vibeflow-implement` e `--loop` (ou `loop: true` em `.vibeflow/loop/config.md`; `--no-loop` desliga numa rodada), o chat vira o orquestrador: o executor implementa cada parte numa sessão nova, a auditoria independente roda em outra, e há no máximo duas rodadas de conserto, cada uma reauditada no próprio diff (`vibeflow-audit --reaudit <commit>`). No Copilot, cada sessão nova é um chat que você abre com a linha de uma frase que o orquestrador escreve ("Read `<briefing>` and follow it."). O loop termina num pull request com a evidência e nunca faz merge, deploy, migração em ambiente compartilhado nem leitura de produção. Os scripts do kit precisam de Node.js 18 ou mais novo (abaixo disso saem com código 64). Rodado à mão, o `vibeflow-audit` só escreve as sondas e sabota código de risco com `--probes`. Detalhes no [MANUAL.md](../MANUAL.md).

## Após a instalação

1. Use o prompt `vibeflow-analyze` para gerar a pasta `.vibeflow/`.
2. Adicione `.vibeflow/` ao git.
3. Para features novas, comece pelo `vibeflow-discover`.

Veja o [MANUAL.md](../MANUAL.md) para a documentação completa, ou acesse [vibeflow.run](https://vibeflow.run) para documentação dos comandos e sobre o plugin.
