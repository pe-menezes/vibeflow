# PRD: /vibeflow:hotfix — fix rastreável em 1 chamada (+ consolidação no audit)

> Generated via /vibeflow:discover on 2026-08-16 (2 rounds, modo assíncrono)

## Problem

Bug nascido de produção — usuário na tela, dado errado, evidência concreta — faz
o agente abandonar o método. Gerar PRD+spec custa 8–10 minutos por ciclo, e
nesse momento velocidade importa mais que cerimônia. Resultado medido no
dogfooding de 2026-07-12 (fin-app): 5 fixes de madrugada sem spec nem audit, o
requisito vivendo no prompt do orquestrador (contaminação de contexto), e o
porquê de cada fix perdido nos commits.

O `quick` não cobre o caso: é para tarefa pequena planejada e bem-definida,
entrega um prompt pack de handoff e existe, por contrato, para "when you want a
prompt pack now rather than a paper trail" — o oposto do que produção quebrada
pede (executar já, com rastro).

Um segundo caso motiva o desenho do oráculo: em 2026-08-16, neste próprio repo,
o smoke harness commitou a implementação antes do `/audit`; o audit computou
diff vazio e carimbou PASS sobre nada, sustentando um selo de "sem regressão"
por um dia. É a classe de confiança falsa que um teste obrigado a falhar antes
do fix (vermelho→verde) não deixa passar.

Princípio de design inegociável: se o caminho certo for mais lento que o
atalho, o atalho vence sempre — o hotfix tem que ser mais rápido que abandonar
o método. E a resposta à doutrina contrária (superpowers: "systematic debugging
is faster, especially under pressure"): o hotfix não é menos processo, é o
processo sistemático com custo fixo dimensionado para a classe do problema. O
que falhou em 12/07 foi custo de cerimônia de feature aplicado a bug de
produção.

## Target Audience

Dev operando um agente sobre um produto real no momento em que produção quebra.
Primário: os próprios autores em dogfooding (fin-app é o gerador natural de
casos). Secundário: times que adotam vibeflow e precisam que o rastro de hotfix
sobreviva à madrugada. Consumidor downstream: quem roda a consolidação no
audit.

## Proposed Solution

`/vibeflow:hotfix`: em uma chamada, produz um doc curto de rastro e implementa
o fix, que nasce com teste de regressão que falha antes do fix. Diferencial
confirmado em 2 benchmarks (2026-07-15 e 2026-08-16): nenhum player entrega
rastro+fix numa chamada. Consolidação posterior via flag do audit.

### O doc em 2 tempos

`.vibeflow/hotfixes/<YYYY-MM-DD>-<slug>.md`, um arquivo por bug. Nomes de
seção/campo são contratos literais em inglês, byte-checked entre edições, como
os demais guardrails do repo.

Tempo 1 — escrito antes de tocar código:

- `Symptom` — imutável depois de escrito; com o dado real observado.
- `Checkpoint` — hypothesis (sobrescrevível), falsification_test, blind_spots.
- `Preservation` — 1–3 propriedades "SHALL CONTINUE TO" (o que não pode mudar).
- `origin: session | prompt | third-party | resumed` — de onde veio a evidência.

Tempo 2 — depois do fix:

- `Root cause` e `Fix` (com files_changed).
- `DoD` — 2–4 checks binários.
- `Regression` — 1 cenário WHEN/THEN com o dado,
  `oracle_type: specified | derived | metamorphic | implicit`,
  `reproduction: real | synthetic | none`.
- `Deviations` — append-only; desvio do assessment não é silenciado.
- `status: verified | partial | halted(<condition>)`.

`Eliminated / Evidence` (append-only) só materializa quando a hipótese 1 falha
— o caminho feliz fica leve. O teste de regressão vive na suíte do projeto; o
doc carrega o cenário em prosa e o path do teste.

O comando nunca commita. O report final instrui commitar fix+teste+doc juntos
(restrição de gitignore em installs padrão no Technical Context).

Escrever o tempo 1 antes de qualquer edição é a resposta ao superpowers: o
preâmbulo sistemático tem custo fixo de ~1 minuto, e a imutabilidade do sintoma
só é real se ele existe antes do fix que poderia racionalizá-lo.

### Definição operacional de "1 chamada"

Uma invocação com sintoma+evidência (e o contexto de sessão, quando houver) na
entrada; exatamente duas saídas estruturadas: done (doc + fix + teste
vermelho→verde) ou HALT nomeado. Zero perguntas obrigatórias no meio — pergunta
que seria feita vira HALT. Degradação nunca é silenciosa: host que não consegue
rodar testes grava `verification: not-run` e o status trava em partial.

Por edição: Claude Code = skill com as allowed-tools do implement (Read, Grep,
Glob, Bash, Edit, Write); Copilot = prompt com `agent: 'agent'` (precedente do
implement — escreve código, não roda sob vibeflow-architect); Cursor = skill
com trigger hint restrito a defeito observado com evidência.

### Pontos de entrada (user flows)

O contrato é o mesmo nos três flows; muda onde a investigação aconteceu.

**(a) Conversa pós-investigação — flow primário.** O bug chega em conversa
livre; a investigação roda solta na sessão. O /hotfix herda o contexto: não
re-investiga — formaliza (transcreve `Symptom` com o dado real já presente na
conversa + hypothesis herdada, `origin: session`) e audita a investigação
informal com a prova vermelha: o teste que codifica a causa achada tem que
falhar no código atual. Não falha → a investigação estava errada → HALT
`cannot-reproduce` antes de tocar código. É a transcrição (não re-investigação)
que mantém o preâmbulo abaixo de ~1 minuto neste flow.

**(b) Headless/CI.** Sintoma+evidência chegam no prompt (`origin: prompt`); a
investigação acontece dentro da chamada, na escala deslizante do método
embutido.

**(c) Evidência de terceiro.** Achado de review, falha de harness, report de
usuário (`origin: third-party`); igual a (b), com a origem marcada.

Linha temporal: "achei a causa, não mexi no código" = momento certo. "Já
consertei" = tarde — modo retroativo fica fora da v1 (Anti-scope).

Qualquer flow aceita como entrada um doc `halted(...)` existente
(`origin: resumed`): o próximo /hotfix continua de onde parou, respeitando
`Symptom` imutável e `Eliminated / Evidence` append-only. O doc é o estado
retomável.

### Método de investigação embutido (decisão de produto)

O tempo 1 *é* o método de investigação, em escala deslizante: checkpoint →
`Eliminated / Evidence` só quando hipótese falha → breaker de 3 tentativas de
fix → HALT sempre salva o doc. Não haverá comando /debug separado; o porquê
está no Anti-scope.

### HALT — conjunto fechado

Condições nomeadas, literais entre edições:

| Condição | Dispara quando |
|---|---|
| `unclear-symptom` | não dá para enunciar sintoma observável com evidência |
| `cannot-reproduce` | nenhum teste construível falha no código atual — inclui prova vermelha reprovada no flow (a) |
| `cause-outside-repo` | causa raiz fora do repo (third-party, infra) |
| `exceeds-hotfix-budget` | fix pediria >2 arquivos de código, além de teste+doc |
| `critical-gate` | o fix exigiria operação que o Rules Catalog do audit marca CRITICAL/HIGH — reusa o catálogo por referência, não duplica regras |
| `breaker-tripped` | 3 tentativas de fix falharam |

Todo HALT salva o doc com `status: halted(<condition>)` e o próximo passo para
o humano. O rastro sobrevive mesmo quando o fix não sai — metade do valor do
produto.

### Gate do dado real (declarativo, nunca bloqueante)

`reproduction: real | synthetic | none` é obrigatório no doc. Abaixo de `real`,
o status trava em partial e a consolidação trata como dívida prioritária. A
regra inegociável é outra: o teste falha antes do fix, sempre (vermelho→verde)
— o oráculo externo que o caso de 16/08 não sobreviveria. Dado real entra
minimizado: preserva a propriedade que dispara o bug, remove identificadores; o
doc registra a transformação.

`status: verified` exige: `reproduction: real` + vermelho→verde + suíte
detectada verde + diff limpo no Critical Gate. Falha pré-existente de suíte em
código não tocado é reportada, não consertada (precedente do implement), com
status partial declarado.

### Fronteiras hotfix × quick × implement

O discriminador é evidência, não ambiente: hotfix = defeito observado com
evidência reproduzível (produção é o caso motivador, não gate — inverificável
pelo agente); quick = tarefa planejada bem-definida querendo pack de handoff;
implement = já existe spec. Codificado nas descrições das 3 edições e em listas
"Not for:" cruzadas. Na mesma release, a descrição do quick perde o "e.g. bug
fix" que hoje invade este território (mudança de descrição → 3 edições +
tabelas de README, pela regra de sync).

### Consolidação — flag do audit

`/vibeflow:audit --consolidate-hotfixes` varre `.vibeflow/hotfixes/`,
re-executa o DoD binário e o teste de regressão de cada doc contra o código
atual e classifica:

- `still-holds` — DoD verde; o fix segue valendo.
- `promote` — virou comportamento permanente → stub de entrada para gen-spec
  (não spec pronta; humano decide).
- `regressed` — DoD quebrou → gap com prompt pack incremental (mecanismo
  existente do audit).

Consome as entradas de `Deviations`/deferred (append-only). Determinismo por
construção: só re-executa checks que cada doc carrega — sem repetir o problema
aberto de recall-sem-mapping do audit (backlog-pos-unhobbling §6). Rodada
normal do audit imprime 1 linha de nudge: contagem de hotfixes não
consolidados.

## Success Criteria

1. Bug real sai com doc+fix+teste em uma chamada; preâmbulo percebido de até
   ~1 minuto no flow (a).
2. Todo doc carrega teste que falhou antes do fix, com `reproduction`
   declarado; `verified` só com `reproduction: real`.
3. HALT nunca perde trabalho: doc salvo, retomável pelo próximo /hotfix.
4. `--consolidate-hotfixes` classifica cada doc em still-holds | promote |
   regressed contra o código atual.
5. Counter-metric (critério de morte): no dogfooding, hotfixes criados via
   comando vs fixes que contornaram o comando. Se os próprios autores pularem o
   comando sob pressão real, o produto está errado — o risco identificado nesta
   discovery é fricção/execução (preâmbulo percebido acima de ~1 minuto mata a
   adoção), não conceito. fin-app é o gerador natural de casos.

## Scope v0

- `/vibeflow:hotfix` com os contratos acima: doc em 2 tempos, 1 chamada com
  HALT set fechado, gate declarativo, breaker, prova vermelha, herança de
  sessão, retomada de doc halted.
- Flag `--consolidate-hotfixes` + linha de nudge no audit.
- Fix da descrição do quick, na mesma release.
- Superfície de comando novo pela regra do repo: 3 edições + READMEs +
  MANUAL.md + CHANGELOG + bump de versão + listas do CLI
  (`COPILOT_FILES`/`CURSOR_FILES`) + o mapa de `.vibeflow/` das camadas
  persistentes ganha `hotfixes/`.
- Faseamento (3 edições de uma vez vs Claude Code primeiro) é decisão do
  gen-spec — deliberadamente não travado aqui.

## Anti-scope

- Modo retroativo ("documenta um fix que já fiz") — quebra o contrato
  vermelho→verde; upgrade path em Open Questions.
- Comando /debug separado — identidade de leveza do produto (precedente
  negativo: GSD com 67 comandos); o doc halted já é o artefato de investigação
  retomável que um /debug produziria; upgrade path em Open Questions.
- Multi-bug / cascata de triage — 1 hotfix = 1 bug; achado colateral vai para a
  lista deferred append-only, consumida na consolidação.
- Resume de contexto vivo cross-session (re-verificar só o que mudou etc.) — a
  retomada na v1 é só via artefato (doc halted como entrada); o breaker é
  numérico.
- Auto-commit, PR, rollback e qualquer ação de incident-response.
- Auto-promoção a spec — consolidação propõe, humano dispõe via gen-spec.
- Integração com stats.
- Comando /consolidate próprio — v1 é a flag do audit; upgrade path em Open
  Questions.

## Technical Context

- Sync: Claude Code é fonte da verdade, espelhado semanticamente na mesma PR
  (`patterns/cross-edition-sync.md`). Os nomes de HALT, campos do doc,
  vocabulário de status, paths e outputs da consolidação entram no conjunto de
  guardrails literais byte-checked. Prosa no dialeto unhobbling
  (`proposals/unhobbling-style.md`, normativo).
- Frontmatter por edição conforme `patterns/skill-prompt-format.md`. Copilot
  usa `agent: 'agent'` (precedente do implement); Cursor precisa de trigger
  hint calibrado para defeito observado + ajuste do hint do quick.
- `critical-gate` reusa o Rules Catalog do audit por referência — não duplicar
  as ~40 regras. A consolidação evita o achado aberto de recall-sem-mapping
  (`proposals/backlog-pos-unhobbling.md` §6) por construção: só re-executa
  DoD+teste que cada doc carrega.
- Gitignore em installs padrão: o CLI (`GITIGNORE_BLOCKS` em `cli/index.js`)
  ignora `.vibeflow/` inteiro em installs Copilot/Cursor ("remove to track in
  git"), o que conflita com "commitar o doc junto do fix". Requisito duro para
  o gen-spec: o report final não pode instruir um commit impossível — detectar
  o ignore (`git check-ignore`) e orientar (`git add -f` ou carve-out
  `!.vibeflow/hotfixes/`). Mudar o `GITIGNORE_BLOCKS` do CLI é candidato, mas
  toca a área do bug aberto de markers aninhados (backlog §1) — decidir no
  gen-spec.
- Budget do repo é ≤6 arquivos por task (`index.md`); esta feature excede —
  esperar auto-split do gen-spec (comando ×3 edições / consolidação /
  docs+CLI).
- O smoke harness (`test/`) dirige sessões headless e assevera headings em
  inglês — casa com o flow (b) e é o lar natural de uma futura asserção do
  contrato de artefato do hotfix (fora do scope v0 do comando em si).
- Neste repo `.vibeflow/` é gitignored (cópias duráveis → `proposals/`); em
  repos de usuário o doc de hotfix é feito para ser commitado com fix+teste.

## Open Questions

1. Modo retroativo (upgrade path): o que uma entrada "tarde demais" exigiria —
   uma classe de veredito para teste que não pode mais falhar-antes (ex.:
   `reproduction: reconstructed`) e seu tratamento na consolidação. Desenhar
   quando o dogfooding mostrar volume (lotes tipo 12/07).
2. Skill de disciplina de investigação em conversa (upgrade path; referência:
   systematic-debugging do superpowers): camada leve para o estágio de
   investigação livre que alimenta o flow (a). Só se os docs halted do
   dogfooding mostrarem a necessidade.
3. /consolidate como comando próprio (upgrade path): promover a flag se o uso
   mostrar necessidade de invocação independente do audit.
