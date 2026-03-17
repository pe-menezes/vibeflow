# Manual do Vibeflow

> 🌐 **Website:** [vibeflow.run](https://vibeflow.run) — documentação dos comandos, exemplos e sobre o plugin.

## O que é

Vibeflow é uma metodologia de **spec-driven development** — você define o que quer construir *antes* de codar. O agente de IA recebe um prompt pack auto-contido e implementa seguindo os padrões reais do seu projeto.

A ideia central: **separe quem pensa de quem implementa**.

- O **Architect** (você + IA) define specs, toma decisões, corta escopo
- O **Coding Agent** (IA) recebe um prompt pack fechado e implementa

## Quick start (3 comandos)

```
1. vibeflow-analyze              → escaneia seu codebase, gera .vibeflow/
2. vibeflow-gen-spec "feature"   → gera spec com DoD, escopo, padrões
3. vibeflow-implement <spec>     → implementa com guardrails (budget, DoD, testes)
```

É isso. Rode `analyze` uma vez, depois `gen-spec` → `implement` para cada feature.

## O pipeline completo

```
analyze → discover → gen-spec → (prompt-pack | implement) → audit
```

| Etapa | O que faz | Quando usar |
|-------|-----------|-------------|
| **analyze** | Analisa o codebase, gera `.vibeflow/` | Setup inicial ou quando o código mudou muito |
| **discover** | Transforma ideia vaga em PRD | A ideia ainda não está clara |
| **gen-spec** | Gera spec técnica com DoD | Ideia clara, pronto pra especificar |
| **implement** | Implementa a spec com guardrails (budget, DoD, padrões) | Spec aprovada, agente com acesso ao filesystem |
| **prompt-pack** | Gera prompt auto-contido para o coding agent | Spec aprovada, precisa delegar para outro agente/sessão |
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
- Com `--interactive` para validar padrões com feedback humano antes de salvar
- Com `--satellite <url>` para analisar um repo de dependência (ex.: design system)

**O que gera:**
```
.vibeflow/
├── index.md          # Overview: stack, estrutura, budget
├── conventions.md    # Convenções com exemplos reais
├── patterns/         # Um doc por padrão descoberto
└── decisions.md      # Log de decisões (vazio no início)
```

**Modo incremental:** Se `.vibeflow/` já existe, detecta mudanças via git e atualiza só o que mudou. Patterns importados (em `patterns/external-*/` via `teach --from`) são protegidos — o analyze nunca sobrescreve um pattern que tem versão importada.

**Modo scoped (`--scope`):** Deep-dive num módulo específico. Requer que o analyze geral já tenha rodado. Samplea densamente o módulo (80%+ dos arquivos) e enriquece os pattern docs globais com exemplos daquele módulo. Ideal para repos grandes onde o analyze geral é shallow em módulos individuais.

**Modo interactive (`--interactive`):** Adiciona um checkpoint de review entre a descoberta de padrões e o salvamento. Apresenta os padrões encontrados, pergunta sobre falsos positivos, padrões faltantes e rationale ("por quê?"). Feedback incorporado antes de salvar. Compõe com todos os modos.

**Modo satellite (`--satellite <url>`):** Analisa um repo de dependência (ex.: design system, lib compartilhada) sob a ótica do repo principal. Clona o repo, roda analyze no clone, detecta o que o repo principal realmente usa, e incorpora só esses patterns em `.vibeflow/patterns/satellite-<nome>/` com provenance.

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

**PRD Validation Gate:** Quando o input é um PRD (arquivo `.md` ou texto >3 linhas), o gen-spec roda 5 sanity checks antes de gerar a spec:
1. Problema concreto?
2. Audiência definida?
3. Scope fechável?
4. Conflito com `.vibeflow/` (convenções, patterns)?
5. Viabilidade técnica no stack atual?

Se todos passam, segue normalmente. Se algum falha, faz até 2 perguntas antes de continuar. Descrições curtas (≤3 linhas) pulam o gate.

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

### `vibeflow-implement`

Implementa uma feature a partir da spec, com guardrails automáticos. Lê a spec, carrega padrões e convenções de `.vibeflow/`, e implementa seguindo budget, anti-escopo e DoD. Disponível em todas as edições (Claude Code, Copilot e Cursor).

**Quando usar:**
- Spec aprovada, quer implementar com guardrails automáticos
- O agente tem acesso ao filesystem (todas as edições suportam)

**Quando NÃO usar:**
- Precisa delegar para outro agente/sessão → use `prompt-pack`

**Fluxo (7 fases):**
1. **Encontra e valida** a spec (resolve caminho ou nome, valida seções obrigatórias)
2. **Extrai guardrails** — DoD, escopo, anti-escopo, budget, decisões técnicas
3. **Carrega contexto** — `conventions.md`, pattern docs aplicáveis, `index.md`
4. **Planeja** — identifica arquivos, verifica budget e anti-escopo, mapeia DoD → código
5. **Implementa** — segue padrões, minimum change, budget hard limit, sem decisões arquiteturais
6. **Roda testes** — detecta test runner, fixa falhas próprias (máx 2 tentativas)
7. **Self-verifica DoD** — checa cada item com evidência, sugere `/vibeflow:audit`

**Papel:** Coding Agent. Segue a spec, NÃO faz decisões arquiteturais. Se a spec for ambígua, para e pergunta ao invés de assumir.

**Input:** caminho da spec (`vibeflow/specs/minha-feature.md`) ou nome da feature.

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

Ensina o knowledge base. Atualiza `.vibeflow/` com correções, novas convenções, decisões ou padrões. Também importa padrões de repos externos via `--from`.

**Quando usar:**
- Encontrou um erro num pattern doc
- Quer adicionar uma convenção do time
- Precisa registrar uma decisão arquitetural
- Descobriu um padrão novo
- Quer importar padrões de um repo externo de referência (ex: repo de plataforma com skills, docs de arquitetura, guidelines)

**Exemplos de input:**
- "Sempre use camelCase para variáveis de estado"
- "O padrão de API routes mudou, agora usamos zod para validação"
- "Decidimos usar Redis ao invés de in-memory cache"

As correções manuais são salvas **fora** dos marcadores auto-gerados, então sobrevivem ao próximo `analyze`.

**Flag `--from <url|path>`:** Importa padrões e convenções de um repositório externo de referência. Diferente do `--satellite` (que filtra pelo que o repo principal consome como dependência), o `--from` importa tudo que o dev selecionar — ideal para repos de convenções e padrões de time.

```
vibeflow-teach --from https://github.com/org/platform-patterns
vibeflow-teach --from ./meu-repo-de-padroes
vibeflow-teach --from https://github.com/org/repo --name plataforma
```

**Fluxo:**
1. Clona o repo (ou usa path local)
2. Detecta fontes de conhecimento (skills, CLAUDE.md, docs/, knowledge/, .cursorrules, etc.)
3. Apresenta review interativo — você escolhe o que importar
4. Salva em `.vibeflow/patterns/external-<nome>/` com provenance
5. Convenções selecionadas são incorporadas em `conventions.md`
6. Clone efêmero é removido ao final

**Detecção de conflito:** Se um pattern importado tem o mesmo nome de um pattern local (gerado pelo analyze), o teach pergunta qual manter. Se o externo prevalece, o local é removido. Se o local prevalece, o externo não é importado. Ao criar um pattern novo (sem `--from`), o teach também verifica se já existe um local ou importado com o mesmo nome.

**Re-import:** Rodar `--from` de novo no mesmo repo sobrescreve os padrões com aviso.

**`--name <alias>`:** Sobrescreve o nome auto-detectado do repo.

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
3. vibeflow-implement        # Implementa com guardrails
   ou vibeflow-prompt-pack   # Gera prompt para outro agente/sessão
4. vibeflow-audit            # Valida contra DoD + padrões
```

### Feature nova (ideia clara)

```
1. vibeflow-gen-spec         # Direto para spec
2. vibeflow-implement        # Implementa com guardrails
   ou vibeflow-prompt-pack   # Gera prompt para outro agente/sessão
3. vibeflow-audit
```

### Bug fix ou task pequena

```
1. vibeflow-quick            # Gera prompt pack direto
2. [implementar]
3. vibeflow-audit            # (opcional para tasks muito pequenas)
```

### Investigação de bug

O fluxo depende de quão bem definido o bug está:

**Bug claro (sabe o que tá errado, cabe em ≤4 arquivos):**

```
1. vibeflow-quick "fix: <descrição do bug>"
2. [implementar]
3. vibeflow-audit            # (opcional)
```

**Bug com causa desconhecida (tem evidência mas não sabe a raiz):**

```
1. vibeflow-gen-spec "bug: <sintoma + evidência (logs, stack trace, passos de repro)>"
2. vibeflow-implement        # Investiga e corrige
   ou vibeflow-prompt-pack   # Delega para outro agente
3. vibeflow-audit
```

O `gen-spec` aceita descrições de bug como input — não precisa de PRD. Mas **precisa de evidência**: logs, stack trace, ou passos de reprodução. Sem evidência, o gen-spec vai pedir antes de gerar a spec.

**Bug vago ("tá lento", "às vezes falha", sem repro claro):**

```
1. vibeflow-discover "o sistema faz X quando deveria fazer Y"
2. vibeflow-gen-spec         # PRD → Spec com DoD
3. vibeflow-implement
4. vibeflow-audit
```

Aqui sim usa discover — porque o problema ainda não tá claro. O discover vai forçar você a definir: o que exatamente falha, quando, pra quem, e qual é o critério de "resolvido".

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
