# Audit Report: Série /vibeflow:hotfix — Parts 1–5 (v1.14.0)

> Specs: `.vibeflow/specs/hotfix-part-1.md` … `hotfix-part-5.md`
> Date: 2026-08-16
> Alvo: trabalho commitado em `feat/hotfix`, commits `0e756e5..b57921a` (`git diff main...HEAD`: 20 arquivos, +868/−17)
> Auditor: Claude Fable 5 — evidências mecânicas re-executadas pelo auditor (greps, diffs, contagens); nada foi corrigido. Findings são decisão do dono.

**Veredito do pacote: PASS — condicionado à pendência externa P1 (smoke `--arm new` em execução pelo operador)**

| Spec | Veredito | Budget real/declarado | Anti-scope |
|---|---|---|---|
| Part 1 — comando (Claude Code) + fronteira do quick | **PASS** | 2/2 (commit `0e756e5`) | respeitado |
| Part 2 — port Copilot + Cursor | **PASS** | 6/6 (commit `ff1ead1`) | respeitado |
| Part 3 — audit `--consolidate-hotfixes` + nudge | **PASS** (DoD 5 deferido → P1) | 3/3 (commit `1090917`) | respeitado |
| Part 4 — READMEs + MANUAL | **PASS** | 5/5 (commit `b57921a`) | respeitado |
| Part 5 — CLI + versões + CHANGELOG | **PASS** (DoD 5 por inspeção → P2) | 4/4 (commit `48b3ba3`) | respeitado |

Soma dos commits = 20 arquivos, sem overlap entre parts (cada commit toca exatamente o scope da sua spec).

---

## Part 1 — `claude-code/skills/hotfix/SKILL.md` + fronteira do quick

**Verdict: PASS**

### DoD Checklist

- [x] **DoD 1** — Frontmatter completo e anatomia canônica.
  - Evidência: `name: hotfix`; description em 3ª pessoa com "Use when a defect has concrete evidence…"; `argument-hint: "<symptom + evidence | path to halted doc>"`; `allowed-tools: Read, Grep, Glob, Bash, Edit, Write` (precedente do implement). Anatomia: `## Description and examples` (4 exemplos: 3 flows + retomada de doc halted), `## Language`, linha de tarefa `Fix the observed defect: $ARGUMENTS` (linha 41), corpo, rodapé `## Maintenance`.
- [x] **DoD 2** — Todos os contratos literais de TD1 presentes.
  - Evidência re-executada: template fence com os 9 nomes de seção (`Symptom` 64, `Checkpoint` 67, `Preservation` 72, `Eliminated / Evidence` 75, `Root cause` 78, `Fix`, `DoD`, `Regression` 88, `Deviations` 94); path `.vibeflow/hotfixes/<YYYY-MM-DD>-<slug>.md` (1×); HALT set fechado com 6 condições, cada nome 2× no arquivo; vocabulários `origin: session | prompt | third-party | resumed` (1×), `oracle_type: specified | derived | metamorphic | implicit` (1×), `reproduction: real | synthetic | none` (1×), `verified | partial | halted` (2×), `verification: not-run` (2×); breaker de 3 tentativas ("The third failed attempt → HALT `breaker-tripped`"); prova vermelha no flow (a) antes de tocar código ("The only new work before the fix is the red proof"); doc `halted(...)` como entrada (`origin: resumed`); definição de 1 chamada (duas saídas estruturadas, pergunta vira HALT); `verified` só com os 4 (real + red→green + suíte verde + gate limpo); degradação declarada (`verification: not-run` → `partial`).
- [x] **DoD 3** — Report final conforme TD3, com desvio documentado no carve-out.
  - Evidência: "The command commits nothing"; instrução de commit fix+teste+doc juntos; `git check-ignore -q` no path do doc; ignorado → `git add -f` ou carve-out; "Guidance, not a gate"; check com erro (sem git) → instrui sem a nota (mitigação do risco da spec).
  - **Desvio sancionado:** a spec pedia o literal `!.vibeflow/hotfixes/` sozinho; a implementação instrui `.vibeflow/` → `.vibeflow/*` + `!.vibeflow/hotfixes/`. O literal original é no-op na semântica do git (gitignore(5): não é possível re-incluir arquivo sob diretório excluído). Desvio declarado no commit `0e756e5` com a prova experimental citada ("negation inside excluded dir is a no-op"); consistente com o bloco real que o CLI instala (`GITIGNORE_BLOCKS` usa `.vibeflow/`, forma diretório — verificado em `cli/index.js:74/81`). Re-execução da prova pelo auditor bloqueada pelo ambiente (ver Tests); semântica confirmada pela documentação do git. Tratado como documentado e correto.
- [x] **DoD 4** — Catálogo por referência: `grep -E "DS10|SEC10|IAC10|K8S10|CFG10|DAT10"` re-executado nas 3 superfícies do hotfix → **zero**.
- [x] **DoD 5** — `quick/SKILL.md`: numstat 2+/1− = exatamente a troca "(e.g. bug fix, tiny feature)" → "(e.g. tiny feature, small planned change)" (TD6) + linha nova no "Not for:" ("An observed defect with reproducible evidence → use `/vibeflow:hotfix`." como primeira linha). Nenhuma outra mudança.
- [x] **DoD 6** — Dialeto: `grep -E "MANDATORY|NEVER|ALWAYS|CRITICAL|Do NOT"` re-executado nos 2 arquivos → **zero**; `⚠️` → zero. Revisão D1–D5 do auditor: sem achados (ver Pattern Compliance). Retention test re-executado pelo auditor no corpo novo: sem achados. Ressalva: a sub-cláusula "resultado registrado no self-verification do implement" não tem artefato durável no repo (commit registra só "dialect greps clean") — ver finding F4 (INFO, não bloqueia; o auditor re-executou o teste, que é o que substitui confiar no report).

### Anti-scope

- [x] Commit `0e756e5` toca só os 2 arquivos do scope — zero em `copilot/`, `cursor/`, audit, READMEs, MANUAL, CHANGELOG, plugin.json, CLI, `test/`.
- [x] `GITIGNORE_BLOCKS` intocado (TD4) — detecção vive no report do comando.

---

## Part 2 — Port Copilot + Cursor

**Verdict: PASS**

### DoD Checklist

- [x] **DoD 1** — Copilot: frontmatter do host (`name: 'vibeflow-hotfix'`, description de 1 linha entre aspas simples, `agent: 'agent'`); corpo abre `# Vibeflow: Hotfix` + `> format-agnostic, repo-local prompt asset` + `**Usage:**`. Greps re-executados: `Description and examples` / `ARGUMENTS` / `## Maintenance` → **zero** nos 2 ports.
- [x] **DoD 2** — Cursor: `name: vibeflow-hotfix` sem aspas; description com trigger restrito ("Use when a defect was observed and the evidence is in hand…") e não-disparo nomeado ("Not for planned tasks (vibeflow-quick) or spec'd features (vibeflow-implement)"); sem tagline (divergência sancionada, confirmada no diff).
- [x] **DoD 3** — Contratos literais byte-checked. Evidência mecânica: `git diff --no-index` copilot↔cursor e claude↔copilot — **todas** as diferenças são o conjunto sancionado (frontmatter, tagline, `$ARGUMENTS`, `## Description and examples`, `## Maintenance`, e 7 trocas de referência de host "command/prompt/skill"). Template fence, nomes de seção, HALT set (6 nomes, 2× em cada edição), vocabulários e path: byte-idênticos nas 3 superfícies (contagens por grep -c iguais nas 3).
- [x] **DoD 4** — Camadas persistentes: `vibeflow.instructions.md:28` e `vibeflow.mdc:29` ganham a linha `.vibeflow/hotfixes/` — "Hotfix trace docs (one file per bug, resumable)" (idêntica ×2); entrada `vibeflow-hotfix` nas duas listas; ride-along do `vibeflow-implement` aplicado nas duas listas e **declarado** no commit `ff1ead1` ("omitted since the March port").
- [x] **DoD 5** — Fronteira do quick nas duas edições: linha "Not for:" com o sufixo por host ("…the vibeflow-hotfix prompt." / "…the vibeflow-hotfix skill."); description do quick no Cursor recalibrada (os dois lados da fronteira editados juntos, TD2).
- [x] **DoD 6** — Dialeto: grep re-executado nos 6 arquivos → **zero** (e nenhum `⚠️`). D4 por host: o prompt novo não repete nada que a camada persistente carrega (guardrails/roles/mapa ficam na camada; `## Language` próprio é o padrão dos 10 prompts do host — verificado por grep -l). Retention test amostral re-executado (description do Cursor + corpo): sem achados.

### Anti-scope

- [x] Commit `ff1ead1` = exatamente os 6 arquivos do scope. `claude-code/`, superfícies do audit, docs, CLI, `copilot/AGENTS.md`, `cursor/AGENTS.md`, `copilot-instructions.md`: intocados (confirmado por stat do commit + grep de "hotfix" nos ponteiros → zero).

---

## Part 3 — audit `--consolidate-hotfixes` + nudge

**Verdict: PASS** — com DoD 5 deferido ao operador (pendência externa P1, por instrução do dono; não conta como FAIL da spec)

### DoD Checklist

- [x] **DoD 1** — As 3 superfícies documentam a flag: varre `.vibeflow/hotfixes/*.md`; para cada doc re-executa só os 2–4 checks do `DoD` e o teste no `test:` do `Regression`; literais `still-holds` / `promote` / `regressed`; output em fence próprio (formato TD3: `<arquivo> — classificação — <evidência em meia linha>` + Priority debt + Deviations/deferred + Promote stubs + prompt pack).
- [x] **DoD 2** — Consequências codificadas: `regressed` → "feeds the incremental prompt pack, the same mechanism the normal round uses" (reuso por referência, sem segundo pipeline); `promote` → "gen-spec entry stub, not a spec — the human decides"; `Deviations`/deferred "consumed into the report as listed debt".
- [x] **DoD 3** — Determinismo declarado ("re-execute only what the doc itself carries"); `reproduction` abaixo de `real` / `status: partial` → priority debt "even when green"; "Classification silences nothing"; docs `halted(...)` também entram na lista com a instrução de retomada.
- [x] **DoD 4** — Nudge condicional na rodada normal (step 7 novo): 1 linha `N hotfix docs not yet consolidated` apontando a flag; "Directory absent or empty → no line"; "No consolidation state is tracked: every doc present counts" (a heurística v1 declarada, TD4).
- [ ] **DoD 5** — `node test/run-smoke.mjs --arm new`: **deferido ao operador**, que está executando o smoke em paralelo (instrução do dono; também declarado no commit `1090917`). Registrado como **pendência externa P1** do pacote — se falhar, esta part (e o pacote) volta para re-audit.
- [x] **DoD 6** — Seções novas limpas: hits de `CRITICAL` nas 3 superfícies estão todos no Rules Catalog / verdict rules pré-existentes (linhas mapeadas; nenhuma na seção nova — a seção de consolidação extraída não contém nenhum sinal da delete-list). Flag descrita no lugar onde se aplica: desvio de rota no início dos Steps + o modo próprio; menção de meia linha no description (sancionada pelo scope da spec) e o ponteiro do nudge (exigido pelo DoD 4); **zero** eco em Output format e Verdict rules (mapa de linhas: claude 8/34/158/219; copilot 3/27/151/213; cursor 3/24/148/210). Literais e seção inteira byte-idênticos nas 3 edições — provado por `git diff --no-index` (copilot↔cursor: zero hunks na seção; claude↔copilot: zero hunks na seção).

### Anti-scope

- [x] Commit `1090917` = só as 3 superfícies do audit. Rules Catalog, verdicts PASS/PARTIAL/FAIL e fluxo normal intocados além do step 7 (hunks só nos 4 pontos por arquivo); `test/` intocado; sem comando /consolidate; sem stats; superfícies do hotfix intocadas.

---

## Part 4 — READMEs + MANUAL

**Verdict: PASS**

### DoD Checklist

- [x] **DoD 1** — `README.md`: linha **hotfix** byte-exata da spec ("Traceable fix in one call: trace doc + fix + red→green regression test" / "Observed defect with reproducible evidence"), na tabela principal (TD1); linha do audit menciona `--consolidate-hotfixes` (linha 36); linha Utility do quick sem vocabulário de bug (linha 39: "fast-track small tasks").
- [x] **DoD 2** — `claude-code/README.md`: tabela com `/vibeflow:hotfix` (linha 89, inclui retomada de doc halted); nota do `--consolidate-hotfixes` (93); árvore com `hotfix/SKILL.md` (174); workflow de bug via Shortcuts (121: "observed defect with reproducible evidence … (quick stays for planned small tasks)"). `grep -in "bug"` no arquivo: só "one per bug" (141) — nenhum roteamento residual para o quick.
- [x] **DoD 3** — `cursor/README.md`: árvore (19) + lista Secundários (58). `copilot/README.md`: árvore anotada com a entrada (23) — neste README a árvore com descrições **é** a lista de comandos (não existe lista separada; padrão do arquivo respeitado).
- [x] **DoD 4** — `MANUAL.md`: seção `### vibeflow-hotfix` entre implement (177) e quick (233), na posição 204 (TD3); resume o contrato com os mesmos literais de TD1 (2 tempos, 1 chamada, HALT set 6, prova vermelha, retomada, commit conjunto + nota de gitignore na forma correta de 2 linhas); seção do audit ganha flag (276) + nudge (278); "Quando usar" do quick perde "Bug fix" ("Feature pequena ou mudança planejada"); fluxo "Investigação de bug" redesenhado com o discriminador como primeira pergunta (374) e ramos gen-spec/discover preservados; fluxo renomeado "Task pequena planejada" (364); árvore `.vibeflow/` ganha `hotfixes/` (430).
- [x] **DoD 5** — Consistência mecânica re-executada: `grep -n "hotfix"` nos 5 arquivos confere com a disponibilidade real (as 3 edições têm os arquivos — parts 1–2 desta branch; nenhuma menção órfã — grep em CLAUDE.md/CONTRIBUTING/AGENTS/workflows: zero); `grep -in "bug fix" MANUAL.md README.md` → **zero**; formatos respeitados (MANUAL PT-BR, READMEs EN, tabelas/árvores no padrão).

### Consistência cruzada docs×implementação (parts 1–3)

- [x] Formulação única "observed defect with reproducible evidence" / "defeito observado com evidência reproduzível" reusada verbatim em README raiz, claude-code/README, cursor/README, MANUAL, CHANGELOG e nas 6 superfícies de quick/hotfix (grep transversal).
- [x] MANUAL ↔ superfícies: HALT set (6 nomes idênticos), status/vocabulários em EN, path do doc, budget do HALT (`>2 arquivos de código além de teste+doc`), save path da consolidação (`.vibeflow/audits/<YYYY-MM-DD>-hotfix-consolidation.md`), literal do nudge (`N hotfix docs not yet consolidated`) — todos batem.
- [x] Orientação de carve-out do MANUAL (229) na forma completa de 2 linhas, idêntica às superfícies.
- Findings menores de consistência: F2 e F3 abaixo.

### Anti-scope

- [x] Commit `b57921a` = só os 5 docs. Site intocado (follow-up registrado — P3, decisão do dono); CHANGELOG/plugin/CLI na part 5; superfícies de prompt intocadas; baseline dos prompts do MANUAL não recalculado; CONTRIBUTING/CLAUDE.md intocados (gap pré-existente, fora da spec).

---

## Part 5 — CLI + versões + CHANGELOG

**Verdict: PASS** — DoD 5 verificado por inspeção; re-execução bloqueada no ambiente do auditor (pendência trivial P2)

### DoD Checklist

- [x] **DoD 1** — `cli/index.js`: entries exatas nas duas listas (`COPILOT_FILES` linha 18, `CURSOR_FILES` linha 35), posição alfabética entre gen-spec e implement; numstat 2+/0− — nenhuma outra mudança no arquivo.
- [x] **DoD 2** — `GITIGNORE_BLOCKS` intocado (grep "gitignore" no diff do cli → zero); wildcards existentes cobrem os arquivos novos — verificado no código: `.github/prompts/vibeflow-*.prompt.md` (linha 75) e `.cursor/skills/vibeflow-*/` (linha 84).
- [x] **DoD 3** — `cli/package.json`: 0.14.1 → 0.15.0 (1+/1−, só a versão).
- [x] **DoD 4** — `plugin.json` 1.13.0 → 1.14.0; `CHANGELOG.md` com `### v1.14.0 (2026-08-16)` no topo cobrindo os 5 itens exigidos: comando hotfix (3 edições), flag + nudge, fronteira do quick, `.vibeflow/hotfixes/` nas camadas persistentes, CLI 0.15.0.
- [x] **DoD 5** — `node --check cli/index.js` e `node cli/index.js --help`: **re-execução negada pelo ambiente do auditor** (comando `node` requer aprovação indisponível nesta sessão; tentado 3×, inclusive sem sandbox). Evidência substituta: (a) leitura integral do arquivo — o diff são 2 object literals de dados em arrays pré-existentes, sem risco sintático; (b) caminho do `--help` explícito no código (`cli/index.js:203-209`: `--help`/`-h` → `printUsage()` → `process.exit(0)`, antes de qualquer outra coisa, sem rede/escrita); (c) commit `48b3ba3` declara "check 5 run by the operator outside the sandbox: node --check passes". Confirmação trivial listada como **P2**.
- [x] **DoD 6** — Shape `{ src, dest }` exato, config estática no topo, zero lógica nova; formato da entrada de CHANGELOG idêntico às existentes; `marketplace.json` intocado (sem stat no diff; segue 1.10.0) e o não-toque **declarado** no commit, como a spec exigia.

### Anti-scope

- [x] Sem npm publish/git tag (ação humana pós-merge — P4); `GITIGNORE_BLOCKS`/`EDITIONS`/`upsertDelimitedBlock` e toda a lógica do CLI intocados (área do bug aberto de markers, backlog §1); `marketplace.json` intocado; docs e superfícies intocados neste commit.

---

## Pattern Compliance (série)

- [x] **prompt-dialect** — greps da delete-list re-executados: **zero** nas 11 superfícies tocadas (nos 3 arquivos do audit, os hits de `CRITICAL` são exclusivamente o Rules Catalog/verdict rules pré-existentes — keep-list). Retention test amostral re-executado por spec: Part 1 (`claude-code/skills/hotfix/SKILL.md`, corpo inteiro), Part 2 (description + corpo do Cursor), Part 3 (seção de consolidação claude-code), Part 4 (seção do MANUAL — não é superfície de prompt, mas segue o tom). Resultado: cada regra declarada uma vez com razão quando há gotcha ("Failing before the fix is what makes the test an oracle…", "Symptom is immutable… cannot rationalize it"); "SHALL CONTINUE TO" e "ALL output" são literais sancionados (TD1 / seção Language canônica); regra de minimização de dado real vem do PRD (§ Gate do dado real), não é invenção do implementador. Sem achados.
- [x] **cross-edition-sync** — fonte da verdade nasceu em claude-code (part 1) e foi espelhada semanticamente na mesma PR; divergências por host são exatamente as sancionadas; guardrails literais byte-checked (provas por `git diff --no-index` acima); listas do CLI atualizadas; CHANGELOG + bump conforme a regra.
- [x] **skill-prompt-format** — frontmatter por plataforma correto nas 3 superfícies novas; anatomia canônica na edição claude-code; ports sem os blocos claude-only.
- [x] **delimited-block-upsert** — leitura obrigatória respeitada na prática: part 5 não tocou o upsert nem os markers (só as duas listas + versão).
- [x] **pipeline-smoke-harness** — o contrato de artefatos foi protegido por construção (nudge condicional; fixture sem `.vibeflow/hotfixes/` → output do audit inalterado); validação executável é a P1.

## Convention Violations

Nenhuma detectada nos arquivos tocados (naming, formato de CHANGELOG, Conventional Commits nos 5 commits, PT-BR/EN por documento, config estática do CLI).

## Critical Gate (diff completo da branch, `main...HEAD`)

Varredura re-executada nas linhas **adicionadas**, contra o catálogo integral (6 domínios):

- Database (DS101–DS110): **0** ocorrências (nenhum `.sql`/migration no diff).
- Security (SEC101–SEC108): **0** — nenhum secret hardcoded (sweep extra de `password|api_key|token|secret` nas linhas adicionadas: zero), nenhum TLS/cert desabilitado, nenhum exec dinâmico (`child_process`/`subprocess`: zero), nenhuma proteção removida (diff não remove nenhuma linha de código executável — as 17 remoções são texto de docs/versões).
- IaC (IAC101–106): **0** (nenhum `.tf`/`.hcl`).
- Kubernetes (K8S101–106): **0** (nenhum yml/yaml tocado).
- Config (CFG101–105): **0** — os 2 JSONs tocados são bumps de versão.
- Data (DAT101–105): **0** (triggers `delete_all|destroy_all|removeAll|bulk_delete|purge`: zero nas linhas adicionadas).
- Overrides `vibeflow:allow`: nenhum presente, nenhum necessário.

**Clean — no destructive operations detected.** O diff é 100% markdown + 2 bumps de versão + 2 entries de config estática.

## Findings (numerados, por severidade)

1. **F1 · LOW (confiança alta) — CLAUDE.md § File mapping sem a linha do hotfix.** A tabela de mapeamento entre edições (referência operacional do sync) não ganhou a linha `skills/hotfix/SKILL.md` ↔ `vibeflow-hotfix.prompt.md` ↔ `vibeflow-hotfix/SKILL.md`. Nenhuma spec cobre CLAUDE.md (o checklist do próprio arquivo não se lista), então não é violação de DoD — mas a tabela ficou incompleta para o 10º comando. Follow-up sugerido: 1 linha em CLAUDE.md.
2. **F2 · LOW (confiança média) — CHANGELOG resume o carve-out na forma curta.** A entrada v1.14.0 diz "a `!.vibeflow/hotfixes/` carve-out in the Vibeflow block of `.gitignore`" sem o passo `.vibeflow/` → `.vibeflow/*`; aplicada ao pé da letra, a forma curta é o no-op que a série corrigiu. MANUAL e as 3 superfícies trazem a forma completa (são elas que o usuário segue); risco baixo por ser release note, não instrução operacional.
3. **F3 · INFO — MANUAL.md:276, compressão sobre docs `halted`.** "Docs com `reproduction` abaixo de `real`, `status: partial` ou `halted(...)` entram na lista de débito prioritário **mesmo verdes**" — o "mesmo verdes" não se aplica a `halted` (nada é re-executado neles; as superfícies separam os casos). Sem contradição de contrato; só imprecisão de compressão.
4. **F4 · INFO — Registro do retention test sem artefato durável.** DoD 6 das parts 1–2 pede o resultado "registrado no self-verification do implement"; os commits registram "dialect greps clean" mas não o retention test (self-verification é artefato de chat, e `.vibeflow/` é gitignored neste repo). O auditor re-executou o teste nas superfícies amostradas — sem achados. Sugestão: incluir o resultado no corpo do commit nas próximas séries.
5. **F5 · INFO — Ordem dos commits inverte a dependência declarada da part 5.** `48b3ba3` (part 5) precede `b57921a` (part 4) na branch, contrariando "docs prontos antes do registro da release". Efeito material nulo: merge atômico da branch, e a dependência dura real (arquivos da part 2 antes das entries do CLI em `main`) está satisfeita — as entries e os arquivos entram juntos.
6. **F6 · INFO — Pré-existente, confirmado: `marketplace.json` em 1.10.0** vs plugin agora 1.14.0 (4 releases de lag). Intocado por decisão declarada (spec part 5 + commit); decisão do dono segue pendente.

## Pendências externas do pacote

- **P1 — smoke `--arm new`** (`node test/run-smoke.mjs --arm new`): DoD 5 da part 3, deferido ao operador, **em execução em paralelo** no momento deste audit. É a condição do PASS do pacote — se o estágio audit do braço novo quebrar, re-auditar a part 3.
- **P2 — confirmação trivial dos checks do CLI**: `node --check cli/index.js` e `node cli/index.js --help` (exit 0 + usage) — re-execução negada pelo ambiente do auditor; 10 segundos no terminal do operador fecham o item.
- **P3 — site (decisão do dono, registrada por exigência do anti-scope da part 4):** o copy do quick ainda oferece bug fix (`site/src/i18n/en.ts:117/167/304`, `pt-br.ts:167/304` — confirmado por grep) e a página de comandos não tem hotfix. Follow-up de site fora do v0.
- **P4 — pós-merge humano:** npm publish do CLI 0.15.0 + git tag (anti-scope da part 5). Atenção operacional: `cli/README.md` está **untracked** no worktree — `npm publish` empacota o filesystem, não o git; commitá-lo ou removê-lo antes de publicar.
- **P5 — higiene de conhecimento pós-merge:** re-rodar analyze incremental (`.vibeflow/index.md` diz "9 SKILL.md"; agora são 10) e a linha do F1 em CLAUDE.md.

## Tests

Runner do projeto: `node test/run-smoke.mjs` (smoke harness de 2 braços). Execução **deferida ao operador por instrução expressa** (rodando em paralelo — P1); nenhum resultado de teste foi assumido neste report. Comandos `node` e `git check-ignore`/`git init` (prova experimental do gitignore) foram tentados e negados pelo ambiente do auditor; a prova do carve-out fica sustentada pela citação no commit `0e756e5` e pela semântica documentada do git.

## Veredito e próximos passos

**PASS condicionado a P1.** Com o smoke verde: pronto para merge — restam apenas as pendências externas listadas (nenhuma bloqueia o merge da série; P4 bloqueia apenas o publish). Se o smoke falhar, re-auditar a part 3 antes de qualquer outra coisa.
