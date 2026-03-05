# Manual do Vibeflow

## O que é

Vibeflow é uma metodologia de **spec-driven development** — você define o que quer construir *antes* de codar. O agente de IA recebe um prompt pack auto-contido e implementa seguindo os padrões reais do seu projeto.

A ideia central: **separe quem pensa de quem implementa**.

- O **Architect** (você + IA) define specs, toma decisões, corta escopo
- O **Coding Agent** (IA) recebe um prompt pack fechado e implementa

## O pipeline

```
analyze → discover → gen-spec → prompt-pack → implement → audit
```

| Etapa | O que faz | Quando usar |
|-------|-----------|-------------|
| **analyze** | Analisa o codebase, gera `.vibeflow/` | Setup inicial ou quando o código mudou muito |
| **discover** | Transforma ideia vaga em PRD | A ideia ainda não está clara |
| **gen-spec** | Gera spec técnica com DoD | Ideia clara, pronto pra especificar |
| **prompt-pack** | Gera prompt auto-contido para o coding agent | Spec aprovada, hora de implementar |
| **implement** | Coding agent executa o prompt pack | Prompt pack pronto |
| **audit** | Verifica DoD + padrões + testes | Implementação feita, hora de validar |

Nem sempre você precisa do pipeline completo. Veja os atalhos abaixo.

## Instalação

Vibeflow está disponível para 3 agentes. Escolha o seu:

| Edição | Comando de instalação |
|--------|----------------------|
| **GitHub Copilot** | `npx setup-vibeflow@latest --copilot` |
| **Cursor** | `npx setup-vibeflow@latest --cursor` |
| **Claude Code** | Add marketplace `pe-menezes/vibeflow-claude` (ou `/install-plugin pe-menezes/vibeflow-claude`) |

Ou copie os arquivos manualmente — veja o README de cada edição:
[`copilot/`](copilot/), [`cursor/`](cursor/), [`claude-code/`](claude-code/).

A flag `--copilot` ou `--cursor` é **obrigatória** — o instalador não tem default para evitar instalar na edição errada.

**Git:** Por padrão, o instalador adiciona ao `.gitignore` os arquivos que instala e a pasta `.vibeflow/` (gerada pelo analyze). Eles não entram no commit. Se quiser versionar no git, remova o bloco "Vibeflow" do `.gitignore`.

## Comandos

### `vibeflow-analyze`

Faz um deep scan do codebase e gera a pasta `.vibeflow/` com a documentação do projeto: stack, estrutura, convenções, padrões de código (com exemplos reais).

**Quando usar:**
- Primeira vez no projeto (setup obrigatório)
- Depois de mudanças grandes no código
- Com `--fresh` para reconstruir do zero
- Com `--scope <path>` para deep-dive num módulo/diretório específico

**O que gera:**
```
.vibeflow/
├── index.md          # Overview: stack, estrutura, budget
├── conventions.md    # Convenções com exemplos reais
├── patterns/         # Um doc por padrão descoberto
└── decisions.md      # Log de decisões (vazio no início)
```

**Modo incremental:** Se `.vibeflow/` já existe, detecta mudanças via git e atualiza só o que mudou.

**Modo scoped (`--scope`):** Deep-dive num módulo específico. Requer que o analyze geral já tenha rodado. Samplea densamente o módulo (80%+ dos arquivos) e enriquece os pattern docs globais com exemplos daquele módulo. Ideal para repos grandes onde o analyze geral é shallow em módulos individuais.

---

### `vibeflow-analyze-satellite`

Analisa um **repositório satélite** (ex.: design system, lib compartilhada) sob a ótica do repo principal. Clona o repo em um diretório temporário, roda o mesmo pipeline de analyze no clone, detecta o que o repo principal **realmente usa** (imports e dependências declaradas), incorpora só esses patterns em `.vibeflow/` e remove o clone ao final.

**Uso:** Um argumento obrigatório: URL do repo satélite (SSH ou HTTPS). Ex.: `vibeflow-analyze-satellite https://github.com/org/design-system`

**Requisito:** O repo principal já deve ter `.vibeflow/` (rode `vibeflow-analyze` antes).

**Provenance:** Todo conteúdo incorporado vai para `.vibeflow/patterns/satellite-<nome-repo>/`. Cada arquivo de pattern tem no topo uma nota em blockquote com o nome do satélite e a data de ingestão, para não confundir com patterns nativos do projeto.

---

### `vibeflow-discover`

Diálogo interativo que transforma uma ideia vaga em um PRD (Product Requirements Document). O agente age como CPO/CTO — desafia, corta escopo, força decisões.

**Quando usar:**
- Ideia não está clara o suficiente para especificar
- Precisa definir escopo, anti-escopo e critérios de sucesso
- Quer um documento que alinhe o time antes de codar

**Fluxo:**
1. Você descreve a ideia
2. O agente faz perguntas estratégicas (1-5 rodadas)
3. Gera o PRD em `.vibeflow/prds/<slug>.md`

**Se a ideia já estiver clara:** o agente detecta e faz fast-track (1-2 rodadas).

---

### `vibeflow-gen-spec`

Gera uma spec técnica a partir de um PRD ou descrição de feature.

**Quando usar:**
- Depois do discover (input = PRD)
- Quando a feature já está clara e você quer uma spec formal
- Precisa de um Definition of Done binário (pass/fail)

**Input:** caminho do PRD (`vibeflow/prds/meu-prd.md`) ou descrição da feature.

**O que gera:** spec em `.vibeflow/specs/<slug>.md` com:
- Objetivo (1 frase)
- Contexto
- Definition of Done (3-7 checks binários)
- Escopo e anti-escopo
- Decisões técnicas com trade-offs
- Riscos + mitigação

---

### `vibeflow-prompt-pack`

Gera um prompt pack auto-contido a partir de uma spec. O prompt pack é o que o coding agent vai receber — ele não tem nenhum outro contexto.

**Quando usar:**
- Spec aprovada, hora de implementar
- Quer delegar a implementação para um agente de IA

**O que inclui:**
- Objetivo + DoD completo
- Anti-escopo
- Budget (max de arquivos)
- Padrões reais do projeto (código copiado de `.vibeflow/patterns/`)
- Paths reais dos arquivos
- Como rodar testes

**Salva em:** `.vibeflow/prompt-packs/<slug>.md`

O prompt pack é **agent-agnostic** — funciona no Copilot, Cursor, Claude Code, ou qualquer outro.

---

### `vibeflow-quick`

Fast-track para tarefas pequenas. Pula discover, gera spec efêmera (em memória), e entrega o prompt pack direto.

**Quando usar:**
- Bug fix ou feature pequena com requisitos claros
- A tarefa cabe em **4 arquivos ou menos**
- Você quer um prompt pack *agora*, sem paper trail

**Quando NÃO usar:**
- Ideia vaga → use `discover` primeiro
- Tarefa grande ou arquiteturalmente significativa → use `gen-spec`

---

### `vibeflow-audit`

Audita a implementação contra o DoD da spec e os padrões do projeto. Roda os testes automaticamente.

**Quando usar:**
- Implementação feita, hora de validar
- Quer saber se os padrões foram seguidos

**Veredictos:**
- **PASS** — Todos os checks do DoD passaram, padrões seguidos, testes verdes
- **PARTIAL** — Alguns checks passaram, gaps listados
- **FAIL** — DoD não atendido ou testes falhando

**Se PARTIAL ou FAIL:** gera um prompt pack incremental cobrindo apenas os gaps.

**Regra crítica:** testes falhando = FAIL automático, independente do resto.

**Salva em:** `.vibeflow/audits/<slug>-audit.md`

---

### `vibeflow-teach`

Ensina o knowledge base. Atualiza `.vibeflow/` com correções, novas convenções, decisões ou padrões.

**Quando usar:**
- Encontrou um erro num pattern doc
- Quer adicionar uma convenção do time
- Precisa registrar uma decisão arquitetural
- Descobriu um padrão novo

**Exemplos de input:**
- "Sempre use camelCase para variáveis de estado"
- "O padrão de API routes mudou, agora usamos zod para validação"
- "Decidimos usar Redis ao invés de in-memory cache"

As correções manuais são salvas **fora** dos marcadores auto-gerados, então sobrevivem ao próximo `analyze`.

---

### `vibeflow-stats`

Mostra estatísticas dos audits: taxa de pass/fail, padrões mais violados, gaps mais comuns.

**Quando usar:**
- Quer um overview de qualidade ao longo do tempo
- Quer identificar padrões que o time erra mais

**Requisito:** precisa de audits em `.vibeflow/audits/`.

---

## Fluxos comuns

### Setup inicial

```
1. vibeflow-analyze          # Gera .vibeflow/ com o conhecimento do projeto
2. git add .vibeflow/ && git commit
```

### Feature nova (ideia vaga)

```
1. vibeflow-discover         # Ideia → PRD
2. vibeflow-gen-spec         # PRD → Spec com DoD
3. vibeflow-prompt-pack      # Spec → Prompt pack
4. [implementar]             # Coding agent executa o prompt pack
5. vibeflow-audit            # Valida contra DoD + padrões
```

### Feature nova (ideia clara)

```
1. vibeflow-gen-spec         # Direto para spec
2. vibeflow-prompt-pack      # Spec → Prompt pack
3. [implementar]
4. vibeflow-audit
```

### Bug fix ou task pequena

```
1. vibeflow-quick            # Gera prompt pack direto
2. [implementar]
3. vibeflow-audit            # (opcional para tasks muito pequenas)
```

### Audit falhou

```
1. Leia o audit report em .vibeflow/audits/
2. Use o prompt pack incremental que o audit gerou
3. [implementar os gaps]
4. vibeflow-audit            # Rode de novo
```

## A pasta `.vibeflow/`

Essa é a base de conhecimento do projeto. Tudo aqui é gerado e atualizado pelos comandos Vibeflow.

```
.vibeflow/
├── index.md          # Overview: stack, estrutura, budget, lista de patterns
├── conventions.md    # Convenções de código com exemplos reais
├── decisions.md      # Log de decisões arquiteturais (newest first)
├── patterns/         # Um doc por padrão descoberto (com código real)
├── prds/             # PRDs do discover
├── specs/            # Specs do gen-spec
├── prompt-packs/     # Prompt packs prontos para uso
└── audits/           # Relatórios de auditoria
```

**Commite no git.** Esses docs são feitos para serem versionados e evoluírem com o projeto.

## Guardrails

Regras que estão sempre ativas, independente do comando:

| Regra | Detalhe |
|-------|---------|
| No DoD, no work | Toda task precisa de 3-7 checks binários |
| Minimum change | Fecha o DoD. Nada além. |
| Sem refactoring fora do escopo | Sem cleanup "porque sim" |
| Budget | ≤ 6 arquivos por task (default). ≤ 4 para quick. |
| Nova dependência | Justifique em 1 linha |
| Abstração | Só com 2+ usos reais |
| Anti-escopo | Explícito. O que você *não* faz importa. |
| Testes obrigatórios | Se os testes falham, a task não está feita |

## Dicas

- **Rode `analyze` antes de tudo.** Sem `.vibeflow/`, os outros comandos funcionam mas produzem resultados piores.
- **`discover` não é obrigatório.** Se a ideia já está clara, pule direto para `gen-spec`.
- **`quick` é o atalho do dia a dia.** Para tasks que cabem em 4 arquivos, não precisa do pipeline completo.
- **O prompt pack é agent-agnostic.** Copie e cole em qualquer agente de IA — Copilot, Cursor, Claude Code, ChatGPT, etc.
- **`teach` mantém o conhecimento vivo.** Depois de aprender algo novo sobre o projeto, ensine o `.vibeflow/`.
- **`audit` é o quality gate.** Rode sempre depois de implementar. Se falhar, use o prompt pack incremental que ele gera.
- **Tudo responde no idioma do input.** Escreva em português, receba em português. Termos técnicos em inglês são ok.
