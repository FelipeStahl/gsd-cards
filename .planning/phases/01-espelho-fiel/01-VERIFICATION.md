---
phase: 01-espelho-fiel
verified: 2026-07-23T11:00:00Z
status: human_needed
score: 5/5 must-haves verificadas (código-fonte; verificação humana com janela nativa ainda pendente, deferida a end-of-phase)
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "CR-02 — badges de bloqueio desatualizados em lote concorrente (STATE.md + diretório de outra fase)"
    - "CR-03 — cache de conteúdo de artefato (`artifactContent`) nunca invalidado"
    - "CR-01 — CI nunca executava `cargo test` (só `cargo check`)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Rodar `npm run tauri dev` em uma máquina com toolchain Rust/MSVC/GTK completo, escolher 'Abrir projeto' e selecionar a raiz deste repositório; depois escolher uma pasta sem `.planning/`."
    expected: "Janela nativa abre; header mostra 'GSD Cards', badge de milestone, 'Fase N de M' e barra de progresso lidos de STATE.md real; pasta sem `.planning/` mostra 'Esta pasta não é um projeto GSD'."
    why_human: "Requer driver de diálogo nativo de SO dentro de uma janela Tauri real — não automatizável neste ambiente sandbox (sem toolchain gráfico/GTK completo). Deferido a end-of-phase por `workflow.human_verify_mode`."
  - test: "Com o app aberto no projeto real, rodar um comando GSD real que escreva em `.planning/` (ex.: `/gsd-execute-phase`) e observar o board, incluindo o cenário de lote concorrente que motivou CR-02 (STATE.md + diretório de outra fase na mesma janela de debounce)."
    expected: "Board atualiza sozinho, sem piscar, sem card quebrado no meio da rajada; card afetado recebe glow breve; badge de bloqueio de uma fase não tocada pelo lote de diretório também atualiza quando STATE.md muda no mesmo lote; nenhum toast aparece."
    why_human: "Requer observar uma rajada de escrita real do GSD contra uma janela nativa. NOTA: a correção de código para CR-02 já foi confirmada por leitura direta do código-fonte e por teste de regressão automatizado passando nesta verificação — este item humano confirma o comportamento visual/end-to-end, não é mais uma verificação pendente da correção em si."
  - test: "Corromper temporariamente um artefato de fase (remover delimitador de frontmatter) com o app aberto, e depois restaurar o arquivo; também abrir um artefato no modal, editá-lo no disco enquanto o modal está fechado, e reabri-lo (cenário que motivou CR-03)."
    expected: "Card ganha aviso, modal abre em modo raw com o motivo, resto do board continua correto; ao restaurar, aviso some sozinho. Reabrir um artefato modificado no disco mostra o conteúdo NOVO, não uma versão obsoleta em cache."
    why_human: "Requer janela Tauri nativa real e edição de arquivo em tempo real observada visualmente. NOTA: a correção de código para CR-03 já foi confirmada por leitura direta do código-fonte e por 2 testes de regressão automatizados passando nesta verificação."
  - test: "Renomear a pasta `.planning/` por alguns segundos com o app aberto, depois restaurar e clicar 'Reconectar'."
    expected: "Header mostra 'Desatualizado desde HH:MM' com botão Reconectar; board congela no último estado bom; ao restaurar e clicar, volta a 'Sincronizado há Xs'."
    why_human: "Requer driver de janela nativa real."
  - test: "Expandir a faixa de histórico de milestones (HistoryStrip) neste repositório."
    expected: "Mostra 'Sem milestones anteriores' (este projeto ainda não enviou nenhum milestone), com o board ativo intacto."
    why_human: "Requer janela nativa real."
---

# Phase 01: Espelho fiel — Verification Report (RE-VERIFICAÇÃO)

**Phase Goal:** Usuário abre um projeto GSD e vê, em tempo real, um board kanban hierárquico que espelha fielmente o `.planning/` — o valor central do produto.
**Verified:** 2026-07-23T11:00:00Z
**Status:** human_needed
**Re-verification:** Yes — após fechamento de gaps (planos 01-07, 01-08)

## Resumo executivo

Esta é uma re-verificação da Fase 1 após a execução dos planos de remediação `01-07-PLAN.md` (CR-02, CR-03) e `01-08-PLAN.md` (CR-01), que fecham os 3 gaps confirmados em `01-VERIFICATION.md` (score anterior 3/5, status `gaps_found`).

**Metodologia:** cada um dos 3 gaps foi verificado independentemente por leitura direta do código-fonte atual (HEAD), não por confiança nas SUMMARYs dos planos de remediação. Os testes de regressão citados pelas SUMMARYs foram executados nesta sessão (não apenas citados) e confirmados passando. A suíte completa de testes do frontend também foi re-executada.

**Veredito por gap:**

| Gap | Status na verificação anterior | Status nesta re-verificação | Evidência |
|---|---|---|---|
| CR-02 (badges de bloqueio obsoletos em lote concorrente) | 🛑 Confirmado, não corrigido | ✅ **CLOSED** | `src/stores/board-store.ts` linhas 624-646 |
| CR-03 (cache de conteúdo de artefato nunca invalidado) | 🛑 Confirmado, não corrigido | ✅ **CLOSED** | `src/stores/detail-store.ts` linhas 111-174 |
| CR-01 (CI nunca roda `cargo test`) | ⚠️ Confirmado, não corrigido | ✅ **CLOSED** | `.github/workflows/ci.yml` linhas 63-64 |

Os 3 gaps de código estão fechados. O que resta é a mesma verificação humana com janela Tauri nativa já identificada na verificação anterior (deferida a end-of-phase por `workflow.human_verify_mode: "end-of-phase"`), que continua não executável neste ambiente sandbox. Por isso o status desta re-verificação é `human_needed`, não `passed` — nenhum dos 5 itens humanos foi resolvido, apenas a nota de cada item foi atualizada para refletir que a correção de código subjacente (quando aplicável) já está confirmada.

## Goal Achievement

### Observable Truths

| # | Truth (Success Criterion do ROADMAP) | Status | Evidence |
|---|---|---|---|
| 1 | Usuário abre um diretório e o app só o aceita como projeto após validar a presença de `.planning/`, com aviso claro quando ausente | ✓ VERIFIED | Sem mudanças desde a verificação anterior. `src-tauri/src/project.rs::validate_project_root` presente e inalterado; `AppShell.tsx`/`ErrorState.tsx` inalterados. Regressão checada: arquivo existe, sem novos marcadores de débito |
| 2 | Usuário vê um board kanban com cards de fase distribuídos em colunas que correspondem aos status reais de fase do gsd-core | ✓ VERIFIED | Sem mudanças desde a verificação anterior. `src/planning/status.ts` presente e inalterado (não tocado pelos planos 01-07/01-08) |
| 3 | Usuário expande um card de fase e vê a hierarquia de 3 níveis (fase → planos → tarefas) derivada dos artefatos reais, com indicadores de progresso de projeto e de fases | ✓ VERIFIED | Sem mudanças desde a verificação anterior. `artifact-tree.ts`/`DetailPanel.tsx` inalterados; `detail-store.ts` foi modificado (CR-03) mas só na parte de cache de conteúdo bruto, não na árvore de fase→planos→tarefas em si |
| 4 | O board atualiza sozinho quando o `.planning/` muda no disco, sem refresh manual (file watching debounced, sem piscar durante rajadas de escrita do GSD) | ✓ VERIFIED (código) | **CR-02 fechado.** `board-store.ts::reprocessPaths` (linhas 624-646) agora reaplica o filtro de blockers a TODAS as fases sempre que `blockersChanged === true`, como um bloco `if` independente do merge de diretório (`if (phaseNumbers.size > 0 && !roadmapRebuilt)`, linha 618) — os dois blocos não são mais mutuamente exclusivos. Teste de regressão `src/planning/watch.test.ts` describe "reprocessPaths — lote concorrente STATE.md (novo blocker) + diretório de outra fase (CR-02)" (linhas 225-259) reproduz exatamente o cenário do gap (STATE.md com novo blocker citando fase 5 + arquivo da fase 01 no mesmo lote) e **passa** (`npx vitest run src/planning/watch.test.ts -t "CR-02"` → 1 passed). Restante: verificação humana end-to-end da rajada real (item 2 abaixo) |
| 5 | Diante de um artefato não parseável, o board exibe aviso/raw em vez de mentir silenciosamente, e o usuário abre a visualização renderizada de PLAN/SUMMARY/VERIFICATION a partir do card | ✓ VERIFIED (código) | **CR-03 fechado.** `detail-store.ts` agora rastreia a fase dona de cada artefato cacheado em `artifactPhaseId` (linha 22, populado em `loadArtifact` linhas 111-130) e a subscription a `recentlyUpdatedPhaseIds` (linhas 146-174) descarta as entradas correspondentes de `artifactContent`/`artifactPhaseId` quando a fase dona é reprocessada — antes só `treeByPhaseId` tinha esse hook. Testes de regressão em `src/stores/detail-store.test.ts` (3 testes: cache básico, invalidação escopada por fase reprocessada com releitura confirmando conteúdo novo, e preservação do cache de fase não afetada) **passam** (`npx vitest run src/stores/detail-store.test.ts` → 3 passed) |

**Score:** 5/5 truths verificadas por evidência de código-fonte + teste automatizado. Nenhuma tem gap de código confirmado nesta re-verificação.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src-tauri/capabilities/default.json` | Allowlist somente-leitura | ✓ VERIFIED | Inalterado, presente |
| `src-tauri/src/project.rs` | `validate_project_root` com canonicalização + contenção | ✓ VERIFIED | Inalterado, presente; agora protegido continuamente em CI (ver CR-01 abaixo) |
| `src-tauri/src/planning_watcher.rs` | Watcher `notify_debouncer_full` escopado | ✓ VERIFIED | Inalterado, presente; `is_relevant_change` agora protegido continuamente em CI |
| `src/planning/status.ts` | Regra pura de derivação de status | ✓ VERIFIED | Inalterado |
| `src/planning/phase-scan.ts` | Varredura real de diretório de fase | ✓ VERIFIED | Inalterado; `parsePhaseDirName` agora reaproveitado por `detail-store.ts` para derivar a fase dona de um artefato (CR-03) |
| `src/planning/parser/*` | Parsers tolerantes com `ParseResult<T>` | ✓ VERIFIED | Inalterados |
| `src/components/ArtifactModal.tsx` | Render GFM + modo raw | ✓ VERIFIED | Inalterado; zero `dangerouslySetInnerHTML`/`rehype-raw` confirmado novamente (`grep` = 0 ocorrências) |
| `src/components/HistoryStrip.tsx` | Faixa de histórico | ✓ VERIFIED | Inalterado, presente |
| `src/stores/board-store.ts` | `reprocessPaths` em transição única, blockers sempre reaplicados quando `blockersChanged` | ✓ VERIFIED | **Antes: PARCIAL (CR-02). Agora: VERIFIED.** Bloco `if (blockersChanged)` (linhas 624-646) independente do merge de diretório; nova função `blockersEqual` (linha 417) compara blockers por conteúdo para computar `affectedIds` corretamente |
| `src/stores/detail-store.ts` | Carregamento preguiçoso e cacheado de artefatos, com invalidação | ✓ VERIFIED | **Antes: PARCIAL (CR-03). Agora: VERIFIED.** `artifactPhaseId` (mapa companheiro) + invalidação escopada por fase na subscription existente |
| `.github/workflows/ci.yml` | `cargo test` no job `build`, mesma matriz que `cargo check` | ✓ VERIFIED | **Antes: ausente (CR-01). Agora: VERIFIED.** Passo "Cargo test" (linhas 63-64) logo após "Cargo check" (linhas 60-61), dentro do mesmo job `build` e mesma matriz `[windows-latest, macos-latest, ubuntu-latest]` (linha 12), sem mudança de setup/cache/dependências |

### Key Link Verification

Sem mudanças desde a verificação anterior nos links de wiring já confirmados (`main.tsx→i18n.ts`, `read.ts→project.rs`, `Header.tsx→board-store.ts`, `Board.tsx→status.ts`, `PhaseCard.tsx→ui-store.ts`, `watch.ts→planning_watcher.rs`, `SyncIndicator.tsx→board-store.ts`, `DetailPanel.tsx→ui-store.ts`, `artifact-tree.ts→plan.ts`, `Board.tsx→HistoryStrip.tsx`, `milestones.ts→paths.ts`) — todos permanecem ✓ WIRED por inspeção de regressão (arquivos existem, imports inalterados).

Dois links ganham confirmação adicional nesta re-verificação:

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/planning/watch.ts` | `src/stores/board-store.ts` | `reprocessPaths` | ✓ WIRED | Confirmado, e agora a implementação interna de `reprocessPaths` também corrige CR-02 — o link em si sempre esteve correto, o bug estava dentro da função |
| `src/components/ArtifactModal.tsx` | `src/stores/detail-store.ts` | `useDetailStore` | ✓ WIRED | Confirmado, e agora a implementação interna de `loadArtifact`/cache também corrige CR-03 |
| `src/stores/board-store.ts` (`recentlyUpdatedPhaseIds`) | `src/stores/detail-store.ts` (subscription) | `useBoardStore.subscribe` | ✓ WIRED (novo) | A mesma subscription que já invalidava `treeByPhaseId` (D-13) agora também invalida `artifactContent`/`artifactPhaseId` por fase dona (linhas 161-173 de `detail-store.ts`) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Teste de regressão CR-02 (nomeado) | `npx vitest run src/planning/watch.test.ts -t "CR-02"` | 1 passed, 14 skipped | ✓ PASS |
| Testes de regressão CR-03 (arquivo completo) | `npx vitest run src/stores/detail-store.test.ts` | 3 passed | ✓ PASS |
| Suíte de testes completa (executada 1x) | `npm run test` (vitest) | 21 arquivos, **180 testes**, todos passando (bate com a expectativa de ~180 após os 4 testes novos de 01-07 sobre os 176 anteriores) | ✓ PASS |
| Typecheck | `npm run typecheck` (tsc --noEmit) | Sem erros | ✓ PASS |
| `git log` confirma os 3 commits de correção citados pelas SUMMARYs | `git log --oneline` | `29bcf50` (CR-02), `8ec90df` (CR-03), `135d84a` (CR-01) todos presentes, mensagens batem com a descrição das SUMMARYs | ✓ PASS |
| CI YAML: passo `cargo test` presente, posição e matriz corretas | leitura direta de `.github/workflows/ci.yml` | Linha 63-64, job `build`, mesma matriz `windows-latest/macos-latest/ubuntu-latest`, logo após `cargo check` (linha 60-61) | ✓ PASS (estrutura) — execução real em CI ainda não observada (ver limitação de ambiente abaixo) |
| Nenhum marcador de débito sem referência nos arquivos tocados por 01-07/01-08 | grep `TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER` em `board-store.ts`, `detail-store.ts`, `ci.yml`, `watch.test.ts`, `detail-store.test.ts` | 0 ocorrências | ✓ PASS |
| Nenhum HTML bruto no visualizador (regressão) | `grep -c 'dangerouslySetInnerHTML\|rehype-raw'` em `src/` e `package.json` | 0 | ✓ PASS |

**Limitação de ambiente (idêntica à verificação anterior — não conta como falha da fase):** este sandbox não tem toolchain Rust/GTK/webkit2gtk nem acesso de rede para instalá-lo, então `cargo check`/`cargo test` não puderam ser executados de forma independente aqui, exatamente como documentado em `01-VERIFICATION.md` e confirmado de novo pela seção "Issues Encountered" de `01-08-SUMMARY.md`. A confirmação de que o passo `cargo test` do CI de fato roda e passa nas 3 plataformas (Windows/macOS/Linux) só ocorre no primeiro push/PR que disparar o workflow real no GitHub Actions. A avaliação de CR-01 nesta re-verificação é por leitura direta do YAML (posição do passo, mesmo job, mesma matriz), o que é suficiente para confirmar que o gap "CI nunca roda cargo test" está fechado — mas não substitui a primeira execução real do workflow.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PROJ-02 | 01-01, 01-02, 01-08 | Usuário abre um diretório como projeto; validação de `.planning/`; proteção contínua de T-01-01 em CI | ✓ SATISFIED | Truth #1 + CR-01 fechado |
| BOARD-01 | 01-03, 01-06 | Board kanban com colunas mapeando status reais | ✓ SATISFIED | Truth #2, inalterado |
| BOARD-02 | 01-05 | Cards de fase expandem hierarquia de 3 níveis | ✓ SATISFIED | Truth #3, inalterado |
| BOARD-03 | 01-04, 01-07 | Board reflete mudanças em tempo real via file watching | ✓ SATISFIED (antes: gap) | CR-02 fechado — ver truth #4 |
| BOARD-04 | 01-02, 01-03, 01-07 | Indicadores de progresso de projeto e de fases (inclui badge de bloqueio) | ✓ SATISFIED (antes: gap) | CR-02 fechado — badge de bloqueio agora sempre reflete STATE.md |
| BOARD-05 | 01-05, 01-06 | Board degrada graciosamente com artefatos não parseáveis | ✓ SATISFIED | Inalterado |
| BOARD-06 | 01-05, 01-07 | Usuário abre visualização renderizada de PLAN/SUMMARY/VERIFICATION, sempre atualizada | ✓ SATISFIED (antes: gap) | CR-03 fechado — cache de conteúdo agora invalida por fase dona |

`REQUIREMENTS.md` marca todos os 7 requisitos da Fase 1 (PROJ-02, BOARD-01..06) como `Complete` — confirmado nesta re-verificação por leitura direta da tabela `## Traceability` (nenhuma divergência com o que este relatório encontrou). Nenhum requisito órfão.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src-tauri/src/project.rs` | 93-97 | Escopo de fs concedido sobre `root_canonical` em vez de `planning_canonical` (achado WR-01 de `01-REVIEW.md`) | ℹ️ Info | Não corrigido, não regride — já documentado e não bloqueante desde a verificação anterior; não fazia parte dos 3 gaps desta remediação |
| `src/stores/board-store.ts` (`closeProject`) | ~515-524 | Escopo de fs nunca revogado ao fechar projeto (achado WR-02 de `01-REVIEW.md`) | ℹ️ Info | Mesmo status — fora do escopo desta remediação, relevante para Fase 4 |
| `.planning/ROADMAP.md` / `.planning/STATE.md` | linha 62 (ROADMAP) / bloco de progresso (STATE) | `01-08-PLAN.md` está marcado `[ ]` (não concluído) no checklist do ROADMAP, e `STATE.md` ainda mostra `stopped_at: Completed 01-07-PLAN.md` / `completed_plans: 7` / `Plan: 2 of 8`, apesar de `01-08-SUMMARY.md` existir com `status: complete` e o commit `135d84a` estar no `git log` | ⚠️ Warning | Dessincronia de metadados de progresso — não afeta nenhuma das 5 verdades observáveis do board (que leem STATE.md/ROADMAP.md tal como estão, então o board hoje mostraria a fase como "em execução" com 7/8 planos, o que é tecnicamente falso mas é exatamente o que esses arquivos dizem — o board continua sendo um espelho fiel do que está escrito). Recomenda-se rodar o passo de fechamento de fase (atualizar ROADMAP.md/STATE.md) antes de avançar para a Fase 2 |

Nenhum novo marcador de débito (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) nos arquivos tocados por esta remediação.

**Nota sobre `mode: mvp`:** o ROADMAP.md declara `Mode: mvp` para a Fase 1, mas o texto do `Goal` ("Usuário abre um projeto GSD e vê, em tempo real...") não segue o formato de User Story (`As a..., I want..., so that...`) exigido pela verificação em modo MVP. Como a verificação inicial (`01-VERIFICATION.md` anterior) também não aplicou o formato de User Flow Coverage e usou verificação goal-backward padrão sobre os Success Criteria do ROADMAP, esta re-verificação manteve a mesma metodologia por consistência e para não introduzir um formato de relatório novo no meio do fechamento de gaps. Isso é uma observação informativa, não um gap desta remediação.

## Human Verification Required

Os mesmos 5 itens da verificação anterior, todos ainda pendentes de execução (requerem janela Tauri nativa real, não disponível neste ambiente sandbox). Ver frontmatter `human_verification` para o texto atualizado — dois itens (rajada de escrita real e artefato corrompido/cache) tiveram sua nota `why_human` atualizada para deixar claro que a correção de código subjacente (CR-02/CR-03) já foi confirmada nesta re-verificação; o item humano agora confirma o comportamento end-to-end/visual, não a correção do bug em si.

### 1. Fluxo completo "Abrir projeto" na janela nativa
**Test:** Rodar `npm run tauri dev`, clicar "Abrir projeto", escolher a raiz deste repositório; depois escolher uma pasta sem `.planning/`.
**Expected:** Janela abre; primeiro caso mostra header com dados reais; segundo caso mostra "Esta pasta não é um projeto GSD".
**Why human:** Requer driver de diálogo nativo do SO dentro de uma janela Tauri real.

### 2. Rajada de escrita real do GSD observada visualmente (inclui cenário CR-02)
**Test:** Com o app aberto, rodar um comando GSD real e observar o board, incluindo um cenário onde STATE.md e o diretório de outra fase mudam na mesma janela de debounce.
**Expected:** Atualização sem piscar, sem card quebrado, glow breve no card afetado; badge de bloqueio de uma fase não tocada pelo lote de diretório também atualiza.
**Why human:** Requer observação visual de uma rajada de escrita real contra uma janela nativa. A correção de CR-02 já está confirmada por código + teste automatizado nesta re-verificação.

### 3. Degradação e reconexão do watcher
**Test:** Renomear `.planning/` por alguns segundos, restaurar, clicar "Reconectar".
**Expected:** Header mostra "Desatualizado desde HH:MM"; ao reconectar, volta a "Sincronizado há Xs".
**Why human:** Requer janela nativa real.

### 4. Artefato corrompido e restaurado, observado no app (inclui cenário CR-03)
**Test:** Remover o delimitador de frontmatter de um artefato temporariamente, observar card/modal, restaurar; e editar um artefato já aberto no modal enquanto fechado, depois reabrir.
**Expected:** Card ganha aviso, modal abre em modo raw; ao restaurar, aviso some. Reabrir um artefato editado mostra conteúdo novo, não cache obsoleto.
**Why human:** Requer janela nativa real e edição de arquivo observada em tempo real. A correção de CR-03 já está confirmada por código + 2 testes automatizados nesta re-verificação.

### 5. Faixa de histórico de milestones
**Test:** Expandir a faixa de histórico neste repositório.
**Expected:** "Sem milestones anteriores".
**Why human:** Requer janela nativa real.

## Gaps Summary

Nenhum gap de código permanece aberto nesta re-verificação. Os 3 gaps confirmados na verificação anterior (`CR-02`, `CR-03`, `CR-01`) foram verificados como fechados por leitura direta do código-fonte atual, não por confiança nas SUMMARYs:

1. **CR-02 — FECHADO.** `board-store.ts::reprocessPaths` agora reaplica o filtro de blockers a todas as fases como um bloco independente (`if`, não `else if`) sempre que `blockersChanged`. Teste de regressão nomeado (`-t "CR-02"`) executado nesta sessão e passando.
2. **CR-03 — FECHADO.** `detail-store.ts` rastreia a fase dona de cada artefato cacheado e invalida `artifactContent` pela mesma subscription que já invalidava `treeByPhaseId`. 3 testes de regressão executados nesta sessão e passando (incluindo o caso de preservação de cache não afetado).
3. **CR-01 — FECHADO.** `.github/workflows/ci.yml` agora executa `cargo test --manifest-path src-tauri/Cargo.toml` no job `build`, logo após `cargo check`, na mesma matriz de 3 SOs. Confirmado por leitura direta do YAML; a execução real em CI fica pendente do primeiro push/PR (mesma limitação de ambiente sandbox documentada na verificação anterior, não uma falha desta remediação).

A suíte completa de testes do frontend (180 testes, 21 arquivos) passa integralmente, o typecheck está limpo, e nenhum novo marcador de débito ou anti-padrão foi introduzido pelos planos de remediação.

O que resta pendente — e o motivo do status ser `human_needed` em vez de `passed` — são os mesmos 5 itens de verificação humana identificados na verificação inicial, todos dependentes de uma janela Tauri nativa real rodando com toolchain gráfico completo, deferidos desde o início por `workflow.human_verify_mode: "end-of-phase"` e ainda não executáveis neste ambiente sandbox. Dois desses itens (rajada de escrita real, artefato corrompido/cache) agora servem apenas para confirmar visualmente o comportamento cujo bug de código já foi corrigido e testado — não são mais "gaps confirmados por código" como estavam na verificação anterior, apenas confirmação end-to-end pendente.

Achado adicional, não bloqueante: `ROADMAP.md` (checklist do plano 01-08) e `STATE.md` (progresso/`stopped_at`) não foram atualizados para refletir a conclusão do plano 01-08, apesar do `01-08-SUMMARY.md` e do commit `135d84a` confirmarem sua execução. Recomenda-se sincronizar esses metadados antes de fechar a fase.

---

_Verified: 2026-07-23T11:00:00Z_
_Verifier: Claude (gsd-verifier)_
