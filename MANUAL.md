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

Vibeflow está disponível para 4 agentes. Escolha o seu:

| Edição | Comando de instalação |
|--------|----------------------|
| **Codex** | `codex plugin marketplace add pe-menezes/vibeflow`, depois `codex plugin add vibeflow@vibeflow-marketplace` |
| **GitHub Copilot** | `npx setup-vibeflow@latest --copilot` |
| **Cursor** | `npx setup-vibeflow@latest --cursor` |
| **Claude Code** | `/plugin marketplace add pe-menezes/vibeflow`, depois `/plugin install vibeflow@vibeflow-marketplace` |

Codex e Claude usam o mesmo pacote em [`plugins/vibeflow/`](plugins/vibeflow/),
com uma única fonte para as skills e manifests específicos para cada host. O
repositório `pe-menezes/vibeflow-claude` continua como espelho de compatibilidade
para instalações existentes. Para as outras edições, veja
[`copilot/`](copilot/) e [`cursor/`](cursor/).

No Claude Code, o subagente `architect` usa memória persistente de escopo de
projeto e mantém seu índice no diretório de memória fornecido pelo próprio
host. No Codex, o pacote expõe somente as skills; o contexto durável continua
em `.vibeflow/`, sem criar um `MEMORY.md` específico do Claude.

Uma flag de edição é **obrigatória** — o instalador não tem default para evitar
instalar na edição errada. `--copilot` e `--cursor` instalam arquivos;
`--codex` e `--claude` mostram os comandos do marketplace nativo.

**Kit do loop:** desde o CLI 0.17.0, `--cursor` e `--copilot` também instalam o kit do loop de execução, em `.cursor/skills/vibeflow-implement/loop/` e em `.github/vibeflow/loop/`, baixando do plugin os arquivos que o `manifest.json` do kit lista (uma fonte só, `plugins/vibeflow/skills/implement/loop/`). Instalação anterior ganha o kit rodando o instalador de novo com `--force`. No Codex e no Claude Code o kit vem dentro do plugin. Veja [O loop de execução](#o-loop-de-execução).

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
├── index.md          # Overview: stack, estrutura, budget, testes e pitfalls
├── conventions.md    # Convenções com exemplos reais + seção Don'ts
├── patterns/         # Um doc por padrão descoberto
└── decisions.md      # Log de decisões (vazio no início)
```

O `conventions.md` inclui uma seção **Don'ts** com regras proibitivas explícitas — o que NÃO fazer. Don'ts são minerados dos anti-patterns nos pattern docs, regras de projeto (.cursorrules, CLAUDE.md), e pitfalls comuns da stack.

**Modo incremental:** Se `.vibeflow/` já existe, detecta mudanças via git e atualiza só o que mudou. A busca é `git log --since="<data> 00:00"`, com a data do `Analyzed:` do `index.md` e a hora explícita: com a data sozinha, o git conta a partir da hora atual daquele dia e perderia os commits feitos mais cedo. Patterns importados (em `patterns/external-*/` via `teach --from`) são protegidos: o analyze nunca sobrescreve um pattern que tem versão importada.

**Testes e pitfalls no `index.md`:** dentro dos marcadores auto-gerados, o `index.md` traz o comando da suíte inteira e o comando mais estreito que roda só os testes afetados por uma mudança (por arquivo, pacote ou tag, como a stack permitir), com o tempo medido quando rodar foi local e seguro (sem serviço pago, sem deploy) e `unmeasured` quando nunca rodou; e os pitfalls que já custaram tempo ao projeto, cada um com a fonte (`decisions.md`, uma linha da CI, um commit de revert ou de fix). No modo incremental o bloco é refeito quando falta (index de antes do bloco) ou quando mudou um arquivo de teste, a configuração da CI ou a do test runner, mesmo sem mudança estrutural; nesse caso o analyze refaz só o bloco e move o `Analyzed:` para a data de hoje.

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

**Clarifications:** as perguntas decisivas do diálogo e as respostas vão para a seção `## Clarifications` do PRD, e o `gen-spec` as leva para a spec.

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
- Riscos + mitigação, com a lista `Risk code:` (opcional): os caminhos ou funções concretos que mexem com dinheiro e totais, credenciais e permissões, apagar ou sobrescrever dado, ou fronteira de data e hora; é onde o audit sabota
- Referências (opcional) — só quando o input traz alguma
- Clarifications (opcional): cada pergunta feita nesta sessão e a resposta, no máximo 5 por sessão, mais as que vieram do PRD

**Cenários e propriedades:** um check funcional do DoD pode levar `Scenarios:`, de 1 a 3 linhas na forma EARS (`WHEN <condição> THE SYSTEM SHALL <comportamento>`), que o implementador transforma no teste vermelho; e, quando o projeto tem biblioteca de teste de propriedade, um check pode ser uma propriedade ("for any <espaço de entrada>, <invariante>") com o oráculo nomeado. São campos de um check, não checks a mais: o DoD continua com 3 a 7.

**Dúvidas abertas e auto-checagem:** o que a spec não consegue decidir vira um marcador `[NEEDS CLARIFICATION: <pergunta>]`, no máximo 3 abertos; mais do que isso, o gen-spec pergunta antes de salvar. Antes de salvar, ele confere o rascunho: todo check binário, todo check funcional nomeando seu teste ou com cenário, os marcadores contados. Se falhar, faz até 2 perguntas numa rodada só. Tudo isso é opcional: spec sem essas seções continua valendo.

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

O prompt pack é **agent-agnostic** — funciona no Codex, Copilot, Cursor, Claude Code, ou qualquer outro.

---

### `vibeflow-implement`

Implementa uma feature a partir da spec, com guardrails automáticos. Lê a spec, carrega padrões e convenções de `.vibeflow/`, e implementa seguindo budget, anti-escopo e DoD. Disponível em todas as edições (Codex, Claude Code, Copilot e Cursor).

**Quando usar:**
- Spec aprovada, quer implementar com guardrails automáticos
- O agente tem acesso ao filesystem (todas as edições suportam)

**Quando NÃO usar:**
- Precisa delegar para outro agente/sessão → use `prompt-pack`

**Fluxo (fases 0 a 8, a mesma numeração dos cabeçalhos da skill):**

0. **Encontra e valida** a spec (resolve caminho ou nome, valida seções obrigatórias)
1. **Extrai guardrails** — DoD, escopo, anti-escopo, budget, decisões técnicas
2. **Carrega contexto** — `conventions.md`, pattern docs aplicáveis, `index.md`
3. **Planeja** — identifica arquivos, verifica budget e anti-escopo, mapeia DoD → código
4. **Implementa** — segue padrões, minimum change, budget hard limit, sem decisões arquiteturais
5. **Roda testes** — detecta test runner, fixa falhas próprias (máx 2 tentativas)
6. **Refina (simplify no escopo)** — limpa o diff que escreveu (reuso, nomes, dead code) sobre baseline verde e re-roda os testes; reverte se quebrar
7. **Self-verifica DoD** — checa cada item com evidência
8. **Finaliza** — resume DoD, budget e testes e sugere `/vibeflow:audit` como próximo passo

**Papel:** Coding Agent. Segue a spec, NÃO faz decisões arquiteturais. Se a spec for ambígua, para e pergunta ao invés de assumir.

**Input:** caminho da spec (`vibeflow/specs/minha-feature.md`) ou nome da feature.

**Modo loop (`--loop`):** com `--loop`, ou `loop: true` no front matter de `.vibeflow/loop/config.md`, as fases 0 a 3 rodam como acima e, no lugar das fases 4 a 8, a sessão vira a orquestradora do loop de execução: o executor implementa numa sessão nova e a auditoria independente roda em outra. `--no-loop` desliga o loop numa rodada mesmo com o config ligado. Sem o kit ou sem Node.js 18 ou mais novo, o comando para antes da fase 0, diz o que instalar e lembra que `implement` sem `--loop` continua rodando. Veja [O loop de execução](#o-loop-de-execução).

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
- **A prova vermelha:** com o Tempo 1 escrito, o teste de regressão entra na suíte do projeto e tem que **falhar no código atual**, pela razão que a hipótese nomeia. Falhar antes é o que torna o teste um oráculo — escrito depois do fix, ele só concorda com o fix. No momento em que prova vermelho, o path do teste entra no campo `test:` do doc — um HALT depois desse ponto carrega onde o teste vermelho vive.
- **Tempo 2, depois do fix:** `Root cause`, `Fix` (com `files_changed`), `DoD` (2–4 checks binários), `Regression` completada em volta do `test:` gravado na prova vermelha (cenário WHEN/THEN, `oracle_type`, `reproduction: real | synthetic | none`, `verification: red-green | not-run`), `Deviations` (append-only).

**Status final:** `verified` só com os 4 juntos — `reproduction: real`, teste red→green, suíte detectada verde, Critical Gate limpo. Qualquer coisa menos que isso é `partial`, com a razão visível no doc (`reproduction: synthetic | none`, suíte não verde, ou `verification: not-run`). Um HALT grava `halted(<condition>)`.

**HALT set (fechado — 6 condições):** `unclear-symptom` (sem sintoma observável com evidência), `cannot-reproduce` (nenhum teste construível falha no código atual), `cause-outside-repo` (causa raiz fora do repo), `exceeds-hotfix-budget` (fix pediria mais de 2 arquivos de código além de teste+doc), `critical-gate` (o fix exige operação que o Rules Catalog do audit bloqueia), `breaker-tripped` (3 tentativas de fix falharam). Todo HALT salva o doc com o próximo passo — o rastro sobrevive mesmo quando o fix não, e o doc halted é o estado retomável. HALT que dispara depois da prova vermelha também deixa o teste de regressão vermelho na suíte — oráculo intencional que qualquer outra rodada da suíte lê como falha comum; o report declara esse estado e entrega a decisão ao humano: manter o teste com skip/quarentena até o resume, ou reverter.

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

Audita a implementação contra o DoD da spec e os padrões do projeto. Roda os testes automaticamente e passa o diff pelo Critical Gate (scan de operações destrutivas). Funciona melhor numa sessão que não implementou o trabalho.

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

**Pacote de revisão:** o audit lê a mudança de um arquivo só, para que a revisão e o Critical Gate julguem o mesmo diff. Com `--package <caminho>`, lê esse pacote; sem ele, monta um em `.vibeflow/reviews/<slug>-round-0.md` com o `review-package.mjs` do kit, a partir de `--base <ref>` quando dado, senão do merge-base com a branch padrão (ou de `HEAD`, para trabalho não commitado na branch padrão). As pastas do próprio loop em `.vibeflow/` (`loop/`, `briefings/`, `progress/`, `reviews/`, `audits/`) nunca contam como mudança. Pacote vazio onde se espera mudança (parte do loop, `--package`, `--base` ou re-audit) termina em FAIL, "nothing to audit", nunca PASS. Os casos sem pacote ficam registrados no relatório:
- trabalho já commitado na branch padrão, num audit à mão sem `--base`: o audit roda sobre o código como antes e grava `Review package: none (no uncommitted or branch change; --base <ref> audits committed work)`; o Critical Gate diz que nenhum diff foi escaneado;
- kit ausente: `Review package: none (kit not installed)`, com o comando que instala;
- Node.js ausente ou abaixo de 18: `Review package: none (Node.js 18+ not found)`.
Nesses dois últimos, o diff é calculado como antes (`git diff HEAD` ou `git diff <base>...HEAD`).

**Cabeçalho do relatório:** `Independence: fresh session | same session`, `Round: audit | reaudit <n>`, `Stage: <k>/<total> <nome> | final`, `Review package: <caminho> | none (<motivo>)` e `Base: <sha>`. O relatório é regravado a cada etapa com `Verdict: pending` até a última escrita, que põe `Stage: final` e o veredicto, então um relatório parcial nunca se passa por pronto. Rodado na sessão que fez o trabalho, o audit grava `Independence: same session` em vez de recusar. Esses rótulos ficam em inglês em qualquer idioma, porque scripts os leem.

**Severidade e causa:** todo finding é uma linha com severidade (`defect`, comportamento errado; `risk-gap`, código certo sem prova em código de risco; `low`, o resto), causa (`spec`, `implementation`, `proof`, `fix`), confiança, evidência e sonda. `defect` ou `risk-gap` aberto segura o veredicto abaixo de PASS; `low` vai para `### Follow-ups` e não bloqueia; causa `spec` vai para você ou para uma emenda registrada da spec antes de qualquer conserto. Uma lacuna de prova que a própria sonda do auditor já fecha sai como `closed-by-probe` e não segura o veredicto sozinha.

**Sabotagem e sondas (`--probes`):** o auditor lê o código e testa cenários; a sabotagem roda só em código de risco (a lista `Risk code:` da spec, ou as quatro categorias quando ela não existe), cada uma desfeita a partir de uma cópia conferida por hash, nunca com `git checkout`, `restore`, `stash` ou `reset`. Sondas de comportamento viram testes em `<pasta de testes>/audit/<feature>-<parte>.test.<ext>`, cada uma com três respostas no relatório (o contrato que protege, a regressão que a quebra, por que os testes do implementador não pegam); sonda que reproduz finding aberto leva o marcador de falha esperada do framework (`todo`, `xfail`, `test.failing`), para o audit nunca deixar a suíte vermelha. Sonda de estado (diff contra base, versão de hoje, frase de doc, número de linha, relógio real) fica no relatório. Num audit à mão, fora do loop, o arquivo de sondas e a sabotagem só rodam com `--probes`; sem a flag, o relatório lista as sondas que escreveria, como código, e grava `Sabotage: skipped (standalone audit; --probes runs it)`, e o audit só escreve em `.vibeflow/`. Dentro do loop, o briefing do auditor roda os dois.

**Re-audit (`--reaudit <commit da rodada>`):** confere uma rodada de conserto lendo só o diff do conserto: roda a suíte e as sondas do audit, fecha ou mantém cada finding aberto com a prova, procura defeito novo só no diff do conserto (causa `fix` quando o conserto o introduziu) e só refaz o audit inteiro quando o conserto saiu do escopo dos findings, dizendo por quê. Salva em `.vibeflow/audits/<slug>-reaudit-<n>.md`; à mão, segue a mesma regra do `--probes`.

**Se PARTIAL ou FAIL:** gera um prompt pack incremental cobrindo apenas os gaps.

**Regra crítica:** testes falhando = FAIL automático. Finding CRITICAL/HIGH não-justificado do gate = FAIL automático.

**Salva em:** `.vibeflow/audits/<slug>-audit.md` (numa parte do loop, `<feature>-<parte>-audit.md`)

**Flag `--consolidate-hotfixes`:** o alvo da rodada vira `.vibeflow/hotfixes/` em vez de uma spec. Para cada doc, re-executa só o que o próprio doc carrega — os checks binários do `DoD` e o teste de regressão do `Regression` — contra o código atual, e classifica: `still-holds` (tudo verde, o fix se sustenta), `promote` (tudo verde + sinais de comportamento permanente → gera um stub de entrada para o gen-spec; quem decide é o humano), `regressed` (check ou teste quebrou → vira gap no prompt pack incremental, o mesmo mecanismo da rodada normal). Docs com `reproduction` abaixo de `real`, `status: partial` ou `halted(...)` entram na lista de débito prioritário mesmo verdes; doc halted não tem fix a re-executar — `test:` preenchido nomeia o oráculo vermelho que o HALT deixou na suíte, e a entrada registra seu estado atual. Classificação por doc, sem veredicto PASS/PARTIAL/FAIL; salva em `.vibeflow/audits/<YYYY-MM-DD>-hotfix-consolidation.md`.

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

**Requisito:** precisa de audits em `.vibeflow/audits/` ou de ledgers do loop em `.vibeflow/loop/`.

**Seção Loop:** quando `.vibeflow/loop/` tem ledgers (os `.md` da pasta, menos o `config.md`, que guarda a configuração do loop), o relatório ganha `### Loop`: partes, taxa de PASS no primeiro audit, média de rodadas de conserto, mediana do relógio do despacho ao PASS, as rodadas de cada parte, findings por severidade e por causa, findings `closed-by-probe` e audits em sessão nova contra mesma sessão. Os números vêm do `loop-stats.mjs` do kit, que pula linha malformada com aviso em vez de adivinhar. Sem ledgers, o relatório é o de antes. O comando não escreve nada em disco.

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

### Feature com o loop de execução

```
1. vibeflow-gen-spec              # Spec com DoD, Risk code e cenários
2. vibeflow-implement <spec> --loop
   → executor, audit, até 2 consertos, PR com a evidência
3. [você revisa e faz o merge do PR]
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
   → doc de rastro + fix + teste de regressão escrito antes do fix
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

## O loop de execução

Desligado por padrão. Sem `--loop`, o `implement` roda o pipeline de sempre (fases 0 a 8), as seções novas da spec são opcionais, e o `audit` e o `stats` usados sem o loop mudam só no que o bloco Changed do `CHANGELOG.md` lista: as permissões (`Edit` e `Write` no `audit`, `Bash` no `stats`), o cabeçalho e as seções novas do relatório, o pacote de revisão gravado em `.vibeflow/reviews/` e o `--probes` acima. O loop existe porque quem implementou não deve aprovar: um auditor numa sessão que não viu o trabalho acha o que o implementador deixou passar.

**Como liga:** `implement <spec> --loop` numa rodada, ou `loop: true` no front matter de `.vibeflow/loop/config.md` para o projeto (as chaves `loop` e `commit-rounds` são `false` por padrão); `--no-loop` desliga numa rodada. No Claude Code, o loop precisa da versão 2.1.69 ou mais nova, a que substitui `${CLAUDE_SKILL_DIR}` no corpo da skill.

**Papéis:**
- **Orquestradora:** a sessão onde você chamou o `implement`. Corta o trabalho em partes, escreve o briefing de cada rodada, despacha cada rodada para uma sessão nova, confere de fora e mantém o ledger. Não implementa.
- **Executor:** implementa uma parte (ou uma rodada de conserto) numa sessão nova, vermelho antes do verde, com arquivo de progresso a cada marco; não commita nem chama outro agente. Responde em cinco linhas: estado (DONE, DONE WITH CAVEATS, NEEDS CONTEXT ou BLOCKED), arquivos, placar dos testes, ressalvas, caminho do progresso.
- **Auditor e reauditor:** o audit e o re-audit, cada um numa sessão nova, escrevendo só o relatório e o arquivo de sondas; nunca consertam.

**Sessão nova em cada host:** no Claude Code, os agentes `vibeflow:executor` e `vibeflow:auditor` do plugin; no Codex, o subagente nativo ou uma task nova com o caminho do briefing; no Cursor e no Copilot, um chat novo que você abre com a linha que a orquestradora escreve ("Read `<briefing>` and follow it."). Host que não abre sessão nova cai nesse chat aberto por você, e diz isso. Os papéis moram uma vez só, em `roles/executor.md` e `roles/auditor.md` do kit, e os agentes do Claude Code têm o mesmo texto.

**O fluxo de uma parte:**
1. Abertura: spec achada, branch de feature (nunca a branch padrão; nela o loop para e pede um nome), `git status` e `git stash list` lidos com dono para cada arquivo sujo, e o OK para commitar as rodadas, pedido uma vez por feature (ou `commit-rounds: true`). Antes de trabalho longo, `preflight.mjs`.
2. Briefing do executor com todo check do DoD e todo critério que o auditor vai cobrar, o anti-escopo decidido com `who-reads.mjs`, e `check-briefing.mjs` (com `--pair` no briefing do auditor) antes do despacho.
3. Conferência de fora depois de cada rodada: status e diff lidos, suíte e verificador de tipos rodados pela orquestradora, `perimeter.mjs` contra os globs do briefing. Suíte ou tipos vermelhos devolvem a rodada a um executor novo uma vez; da segunda vez, a parte para e vai para você.
4. Audit numa sessão nova, a partir do pacote do `review-package.mjs`. PASS fecha a parte; abaixo de PASS abre o conserto.
5. Conserto: cada finding é roteado (causa `spec` e mudança de escopo vão para você primeiro, `low` vira follow-up), o executor conserta numa sessão nova e o re-audit confere só o diff do conserto (`audit --reaudit <commit da rodada>`).

**Tetos:** no máximo duas rodadas de conserto por parte; a terceira precisa do seu OK, pedido numa linha com o padrão declarado. O mesmo finding voltando pela mesma causa para a parte antes do teto. Rodada que termina acima de 400 mil tokens de contexto para a parte antes do próximo conserto, e a parte sai menor. Numa fronteira de parte, com o contexto da orquestradora acima de 50%, ela escreve a passagem no ledger e para; a próxima sessão retoma do ledger e do git.

**Commits:** com o OK, cada rodada é commitada na branch de feature (`git add -- <caminhos>` e `git commit -- <caminhos>`, nunca `--no-verify`), então o último commit de uma parte é a base da próxima. Sem o OK, nada é commitado: o loop roda uma parte, para no primeiro veredicto e deixa o trabalho para você.

**Artefatos no projeto:**
- `.vibeflow/loop/<feature>.md`: o ledger (estado, tabela `## Rounds` que o `stats` lê, linhas `Decision:`, follow-ups, passagem) e `.vibeflow/loop/config.md`;
- `.vibeflow/briefings/<feature>-<parte>-<papel>[-<n>].md`: um briefing por rodada;
- `.vibeflow/progress/<feature>-<parte>.md`: o progresso do executor e de cada conserto, com a linha final `State: final` (ou `State: final · fix <n>`);
- `.vibeflow/reviews/`: os pacotes de revisão e o corpo do PR;
- `.vibeflow/audits/<feature>-<parte>-audit.md` e `-reaudit-<n>.md`;
- as sondas, na pasta de testes do projeto, em `audit/`.

**Fim no modo empresa:** com todas as partes em PASS, a orquestradora roda o `check-probes.mjs`, roda a suíte no ambiente da CI quando sua máquina é diferente (por exemplo um container da imagem da CI com a rede desligada, sobre um clone tão raso quanto o checkout da CI; quando não dá, o PR diz por quê), faz o push e abre o PR com `gh`, com o corpo preenchido do `pr-body.md` a partir do ledger, dos relatórios e dos progressos, nunca de memória. O PR sai em rascunho ou pronto conforme a convenção do repositório (template de PR, CONTRIBUTING ou sua resposta registrada); sem convenção, sai em rascunho, registrado como `Decision:`. Depois o `watch-pr.mjs` espera as checagens da CI, e o relatório final traz o link, os veredictos, o resultado das checagens, as decisões e os follow-ups. Se o `watch-pr.mjs` sai com 64 (`gh` ausente ou sem login), ninguém está vigiando as checagens, e o relatório final diz isso e dá o `gh pr checks <número> --watch` para você acompanhar.

**O PR precisa de GitHub e `gh`:** o fim em modo empresa abre o PR pelo `gh`, então precisa de um remoto no GitHub (ou GitHub Enterprise) e de `gh auth status` ok para o host dele. A linha `pr ending` do `preflight.mjs` avisa antes do primeiro despacho. Sem isso, o loop roda igual e, no fim, empurra a branch e grava o corpo em `.vibeflow/reviews/<feature>-pr-body.md`, para você abrir o PR ou MR à mão.

**Limites:** o PR é o fim do trabalho do agente. Ele nunca faz merge, nunca faz deploy, nunca aplica migração em ambiente compartilhado e nunca lê produção. Medição com dado real usa homologação ou dado anonimizado entregue pelo time.

**O kit:** fica em `plugins/vibeflow/skills/implement/loop/` (no Cursor, `.cursor/skills/vibeflow-implement/loop/`; no Copilot, `.github/vibeflow/loop/`): os nove princípios do loop, os quatro modelos de briefing, o fluxo da orquestradora, o modelo do corpo do PR, os papéis e nove scripts Node sem dependência (`preflight`, `who-reads`, `check-briefing`, `perimeter`, `review-package`, `check-probes`, `watch-pr`, `watch-round`, `loop-stats`). O `README.md` do kit diz o que cada script faz e o que cada código de saída significa. Os scripts precisam de Node.js 18 ou mais novo e saem com 64 abaixo disso, todos sem exceção, e também quando não conseguem rodar, para um erro nunca se passar por veredicto, com as duas exceções que o `README.md` do kit dá: o `review-package.mjs` sai com 2 em todo erro, e o `preflight.mjs` sai com 2 (parar) num caminho que não é repositório git. O `watch-pr.mjs` também sai com 64 na primeira leitura quando o `gh` não está instalado ou não tem login, dizendo o que fazer, porque esperar não conserta nenhum dos dois; qualquer outra falha de leitura é repetida até o teto. O `preflight.mjs --power` (bateria, tampa e sono) é só do macOS. Plataformas: testado em macOS e Linux (os scripts do kit e a suíte de testes do repositório); Windows não foi medido.

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
├── audits/           # Relatórios de auditoria e re-auditoria
├── loop/             # implement --loop: ledgers e config.md
├── briefings/        # Um briefing por rodada do loop
├── progress/         # Progresso do executor e dos consertos
└── reviews/          # Pacotes de revisão e o corpo do PR
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
- **O prompt pack é agent-agnostic.** Copie e cole em qualquer agente de IA — Codex, Copilot, Cursor, Claude Code, ChatGPT, etc.
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
