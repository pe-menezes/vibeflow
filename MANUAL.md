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
| **audit** | Verifica DoD + padrões + testes + gate de segurança | Implementação feita, hora de validar |

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
├── conventions.md    # Convenções com exemplos reais + seção Don'ts
├── patterns/         # Um doc por padrão descoberto
└── decisions.md      # Log de decisões (vazio no início)
```

O `conventions.md` inclui uma seção **Don'ts** com regras proibitivas explícitas — o que NÃO fazer. Don'ts são minerados dos anti-patterns nos pattern docs, regras de projeto (.cursorrules, CLAUDE.md), e pitfalls comuns da stack.

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
- Definition of Done (3-7 checks binários, pelo menos 1 de craftsmanship/qualidade)
- Escopo e anti-escopo
- Decisões técnicas com trade-offs
- Riscos + mitigação
- Referências (opcional) — só quando o input traz alguma

**Referências:** quando o input aponta para uma suíte de testes, um mockup, um
código a portar ou uma implementação de referência, a spec ganha uma seção
`## References` com o caminho (ou URL) e o papel de cada uma — "a suíte que
define o comportamento", "o mockup a replicar", "a implementação a portar". A
seção é opcional: sem referências no input, ela não aparece, e specs sem ela
continuam valendo para `implement`, `prompt-pack` e `audit` sem mudança nenhuma.
O `prompt-pack` propaga o que estiver ali — embeda o conteúdo quando cabe no
princípio de auto-contenção do pack, ou passa o caminho verificado quando não cabe.

**DoD ancorado em teste:** onde o projeto tem test runner detectável, pelo menos
um check do DoD nomeia um teste executável — um que já existe e precisa passar,
ou um a escrever, nomeado. Sem runner, os checks continuam como antes.

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

**Fluxo (8 fases):**
1. **Encontra e valida** a spec (resolve caminho ou nome, valida seções obrigatórias)
2. **Extrai guardrails** — DoD, escopo, anti-escopo, budget, decisões técnicas
3. **Carrega contexto** — `conventions.md`, pattern docs aplicáveis, `index.md`
4. **Planeja** — identifica arquivos, verifica budget e anti-escopo, mapeia DoD → código
5. **Implementa** — segue padrões, minimum change, budget hard limit, sem decisões arquiteturais
6. **Roda testes** — detecta test runner, fixa falhas próprias (máx 2 tentativas)
7. **Refina (simplify no escopo)** — limpa o diff que escreveu (reuso, nomes, dead code) sobre baseline verde e re-roda os testes; reverte se quebrar
8. **Self-verifica DoD** — checa cada item com evidência, sugere `/vibeflow:audit`

**Papel:** Coding Agent. Segue a spec, NÃO faz decisões arquiteturais. Se a spec for ambígua, para e pergunta ao invés de assumir.

**Input:** caminho da spec (`vibeflow/specs/minha-feature.md`) ou nome da feature.

---

### `vibeflow-hotfix`

Corrige um **defeito observado com evidência reproduzível** em 1 chamada: escreve um doc de rastro curto antes de tocar no código, implementa o fix, e prova com um teste de regressão que falha antes do fix e passa depois. Incidente de produção é o caso motivador, não um requisito. O discriminador contra os outros comandos é a evidência — um defeito que você consegue mostrar, onde quer que tenha aparecido.

**Quando usar:**
- Defeito observado com evidência em mãos — mensagem de erro, log falhando, dado real se comportando errado
- Bug investigado na conversa, sintoma+evidência no prompt (CI/headless incluso) ou evidência de terceiro (report de usuário, finding de review)
- Retomar um doc `halted(...)` — o input é o caminho do doc

**Quando NÃO usar:**
- Tarefa pequena planejada → use `quick`
- Feature com spec → use `implement`

**O contrato de 1 chamada:** exatamente duas saídas estruturadas — **done** (doc + fix + teste red→green) ou um **HALT nomeado** que salva o doc e entrega o próximo passo ao humano. Nenhuma pergunta obrigatória no meio: a pergunta que precisaria de resposta vira o HALT que a motiva. Degradação é declarada, não silenciosa — host que não consegue rodar testes escreve `verification: not-run` no doc e o status trava em `partial`.

**O doc de rastro** (`.vibeflow/hotfixes/<YYYY-MM-DD>-<slug>.md`, um por bug) é escrito em 2 tempos:

- **Tempo 1, antes de qualquer código:** `Symptom` (imutável depois de escrito — existe antes do fix, então o fix não pode racionalizá-lo), `Checkpoint` (hipótese + teste de falsificação + pontos cegos), `Preservation` (1–3 propriedades que o sistema continua atendendo), `origin: session | prompt | third-party | resumed`.
- **A prova vermelha:** com o Tempo 1 escrito, o teste de regressão entra na suíte do projeto e tem que **falhar no código atual**, pela razão que a hipótese nomeia. Falhar antes é o que torna o teste um oráculo — escrito depois do fix, ele só concorda com o fix.
- **Tempo 2, depois do fix:** `Root cause`, `Fix` (com `files_changed`), `DoD` (2–4 checks binários), `Regression` (cenário WHEN/THEN, `oracle_type`, `reproduction: real | synthetic | none`, path do teste), `Deviations` (append-only).

**Status final:** `verified` só com os 4 juntos — `reproduction: real`, teste red→green, suíte detectada verde, Critical Gate limpo. Qualquer coisa menos que isso é `partial`, com a razão visível no doc (`reproduction: synthetic | none`, suíte não verde, ou `verification: not-run`). Um HALT grava `halted(<condition>)`.

**HALT set (fechado — 6 condições):** `unclear-symptom` (sem sintoma observável com evidência), `cannot-reproduce` (nenhum teste construível falha no código atual), `cause-outside-repo` (causa raiz fora do repo), `exceeds-hotfix-budget` (fix pediria mais de 2 arquivos de código além de teste+doc), `critical-gate` (o fix exige operação que o Rules Catalog do audit bloqueia), `breaker-tripped` (3 tentativas de fix falharam). Todo HALT salva o doc com o próximo passo — o rastro sobrevive mesmo quando o fix não, e o doc halted é o estado retomável.

**Commit:** o comando não commita nada; o report instrui commitar **fix + teste + doc juntos**, uma unidade. Como o install padrão coloca `.vibeflow/` inteira no `.gitignore`, o report detecta doc ignorado (`git check-ignore`) e orienta: `git add -f <doc>`, ou o carve-out durável no bloco Vibeflow do `.gitignore` — trocar `.vibeflow/` por `.vibeflow/*` e adicionar `!.vibeflow/hotfixes/` (git não re-inclui dentro de diretório excluído). Orientação, não bloqueio.

---

### `vibeflow-quick`

Fast-track para tarefas pequenas. Pula discover, gera spec efêmera (em memória), e entrega o prompt pack direto.

**Quando usar:**
- Feature pequena ou mudança planejada com requisitos claros
- A tarefa cabe em **4 arquivos ou menos**
- Você quer um prompt pack *agora*, sem paper trail

**Quando NÃO usar:**
- Defeito observado com evidência reproduzível → use `vibeflow-hotfix`
- Ideia vaga → use `discover` primeiro
- Tarefa grande ou arquiteturalmente significativa → use `gen-spec`

---

### `vibeflow-audit`

Audita a implementação contra o DoD da spec e os padrões do projeto. Roda os testes automaticamente e passa o diff pelo Critical Gate (scan de operações destrutivas).

**Quando usar:**
- Implementação feita, hora de validar
- Quer saber se os padrões foram seguidos

**Veredictos:**
- **PASS** — Todos os checks do DoD passaram, padrões seguidos, testes verdes, gate limpo
- **PARTIAL** — Alguns checks passaram, gaps listados (ou warning do gate)
- **FAIL** — DoD não atendido, testes falhando, ou finding CRITICAL/HIGH do gate

**Critical Gate:** scan determinístico do `git diff` em busca de operações destrutivas/perigosas que o DoD não cobre — auth removida, `DROP TABLE`, secret hardcoded, `0.0.0.0/0`, mass delete, etc. ~40 regras em 6 domínios (DB, Security, IaC, K8s, Config, Data). Severidade: CRITICAL/HIGH bloqueiam (FAIL), WARNING vira PARTIAL, INFO é nota. Suprima um finding intencional com `vibeflow:allow <RULE_ID>: <justificativa>` (CRITICAL/HIGH exigem justificativa). Design: `proposals/critical-gate.md`.

**Reporta tudo:** todo finding entra no relatório, inclusive os incertos e os de
baixa severidade, cada um com nível de confiança e severidade estimada. A
filtragem acontece no veredicto — é lá que severidade e confiança decidem o que
bloqueia, o que limita a PARTIAL e o que fica só como nota. O audit não decide
por você o que era importante o bastante para mencionar.

**Se PARTIAL ou FAIL:** gera um prompt pack incremental cobrindo apenas os gaps.

**Regra crítica:** testes falhando = FAIL automático. Finding CRITICAL/HIGH não-justificado do gate = FAIL automático.

**Salva em:** `.vibeflow/audits/<slug>-audit.md`

**Flag `--consolidate-hotfixes`:** o alvo da rodada vira `.vibeflow/hotfixes/` em vez de uma spec. Para cada doc, re-executa só o que o próprio doc carrega — os checks binários do `DoD` e o teste de regressão do `Regression` — contra o código atual, e classifica: `still-holds` (tudo verde, o fix se sustenta), `promote` (tudo verde + sinais de comportamento permanente → gera um stub de entrada para o gen-spec; quem decide é o humano), `regressed` (check ou teste quebrou → vira gap no prompt pack incremental, o mesmo mecanismo da rodada normal). Docs com `reproduction` abaixo de `real`, `status: partial` ou `halted(...)` entram na lista de débito prioritário mesmo verdes. Classificação por doc, sem veredicto PASS/PARTIAL/FAIL; salva em `.vibeflow/audits/<YYYY-MM-DD>-hotfix-consolidation.md`.

**Nudge de consolidação:** quando `.vibeflow/hotfixes/` tem docs, todo audit normal fecha o report com uma linha — `N hotfix docs not yet consolidated` — apontando para `--consolidate-hotfixes`. Pasta ausente ou vazia → sem linha.

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

### Task pequena planejada

```
1. vibeflow-quick            # Gera prompt pack direto
2. [implementar]
3. vibeflow-audit            # (opcional para tasks muito pequenas)
```

### Investigação de bug

A primeira pergunta do fluxo: **há defeito observado com evidência reproduzível?**

**Sim → `vibeflow-hotfix` (1 chamada, rastro incluso):**

```
1. vibeflow-hotfix "<sintoma + evidência>"
   → doc de rastro + fix + teste de regressão red→green
2. [commitar fix + teste + doc juntos, como o report instrui]
```

A chamada parou num HALT? O doc fica salvo em `.vibeflow/hotfixes/` — retome com `vibeflow-hotfix <path do doc>`.

**Não — tem evidência do sintoma, mas não reproduzível (causa desconhecida):**

```
1. vibeflow-gen-spec "bug: <sintoma + evidência (logs, stack trace, passos de repro)>"
2. vibeflow-implement        # Investiga e corrige
   ou vibeflow-prompt-pack   # Delega para outro agente
3. vibeflow-audit
```

O `gen-spec` aceita descrições de bug como input — não precisa de PRD. Mas **precisa de evidência**: logs, stack trace, ou passos de reprodução. Sem evidência, o gen-spec vai pedir antes de gerar a spec.

**Não — bug vago ("tá lento", "às vezes falha", sem repro claro):**

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
├── hotfixes/         # Docs de rastro do hotfix (um por bug)
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

## Baseline dos prompts

Os prompts do vibeflow são escritos para a geração frontier de 2026: enunciam a
regra uma vez, sem CAPS de ênfase e sem repetir conhecimento que o modelo já
tem, e deixam julgamento onde um roteiro só chutaria. Eles funcionam melhor nos
modelos atuais. Se um comando se comportar mal num modelo antigo, isso é
regressão e merece uma issue — não um workaround local. Guia normativo de
estilo: `proposals/unhobbling-style.md`.
