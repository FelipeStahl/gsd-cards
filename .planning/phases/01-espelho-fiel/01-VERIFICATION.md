---
phase: 01-espelho-fiel
verified: 2026-07-23T05:10:00Z
status: gaps_found
score: 3/5 must-haves verificadas (2 parciais — bug confirmado no código, não apenas alegação de SUMMARY)
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "O board atualiza sozinho quando o `.planning/` muda no disco, sem refresh manual (file watching debounced, sem piscar durante rajadas de escrita do GSD)."
    status: partial
    reason: >
      O mecanismo central (watcher Rust debounced + reprocessPaths em transição única immer) está implementado e
      testado para o caso comum (14 testes em watch.test.ts). Porém existe um bug de concorrência confirmado por
      leitura direta do código-fonte (relatado como CR-02 em 01-REVIEW.md, ainda não corrigido no HEAD atual):
      quando um lote de watcher contém simultaneamente uma mudança em STATE.md (que atualiza `blockers`) E uma
      mudança em um diretório de fase diferente (`phaseNumbers.size > 0`), o branch
      `if (phaseNumbers.size > 0 && !roadmapRebuilt)` é mutuamente exclusivo com
      `else if (blockersChanged)` — então `mergePhaseModels` só recalcula `blockers` para as fases citadas no
      lote (`scannedSubset`), e todas as demais fases mantêm o array `blockers` ANTIGO, de antes da releitura do
      STATE.md. Um novo bloqueio (`[Phase 5]: ...`) escrito em STATE.md ao mesmo tempo que `/gsd-execute-phase`
      grava um SUMMARY.md em outra fase (cenário plausível, ambos dentro da mesma janela de debounce de 250ms)
      não aparece no badge de bloqueio da fase 5 até que algum evento futuro toque especificamente o diretório
      da fase 5. Isso contradiz diretamente o valor central do produto ("o board é um espelho confiável do
      `.planning/`... se tudo mais falhar, isso tem que funcionar") no aspecto específico dos badges de bloqueio
      (BOARD-04) durante sincronização em tempo real (BOARD-03).
    artifacts:
      - path: "src/stores/board-store.ts"
        issue: "reprocessPaths (linhas ~604-618): branches mutuamente exclusivos entre a atualização incremental de fases citadas no lote e a reaplicação do filtro de blockers a todas as fases quando STATE.md muda no mesmo lote"
    missing:
      - "Reaplicar o filtro de blockers a TODAS as fases sempre que `blockersChanged` for verdadeiro, independentemente de qual branch tratou a varredura do lote (fix já esboçado em 01-REVIEW.md → CR-02)"
      - "Um teste de regressão em watch.test.ts/board-store cobrindo exatamente o cenário: lote com 1 caminho STATE.md (novo blocker citando uma fase NÃO tocada no mesmo lote) + 1 caminho de outra fase — hoje não há teste que cubra essa combinação"
  - truth: "Diante de um artefato não parseável, o board exibe aviso/raw em vez de mentir silenciosamente, e o usuário abre a visualização renderizada de PLAN/SUMMARY/VERIFICATION a partir do card."
    status: partial
    reason: >
      O modo raw/aviso para artefato não parseável está corretamente implementado e testado (verification.ts nunca
      cai em "passed" por default; ArtifactModal renderiza banner + texto cru quando `unrecognized`). Porém existe
      um segundo bug confirmado por leitura direta do código (CR-03 em 01-REVIEW.md, não corrigido):
      `detail-store.ts#loadArtifact` faz `if (get().artifactContent[path]) return;` e NUNCA remove uma entrada já
      cacheada — ao contrário de `treeByPhaseId`, que é explicitamente invalidado pela subscription ao
      `recentlyUpdatedPhaseIds` no rodapé do mesmo arquivo. Não existe nenhum hook de invalidação de
      `artifactContent` em lugar nenhum do código-fonte (confirmado por grep — as únicas outras referências são o
      próprio `ArtifactModal.tsx` e seu teste). Se o usuário abrir um PLAN.md no modal, o arquivo mudar no disco
      enquanto o app está aberto (fluxo plausível: inspecionar um PLAN.md enquanto `/gsd-execute-phase` está
      rodando), e reabrir o mesmo artefato depois, o modal mostra o conteúdo cru antigo — mesmo que o watcher
      tenha corretamente detectado e processado a mudança em outro lugar. Isso é exatamente a categoria de "board
      que mente" que o produto existe para evitar, só que no nível de conteúdo de artefato em vez de status de
      fase.
    artifacts:
      - path: "src/stores/detail-store.ts"
        issue: "loadArtifact (linhas 93-108): cache `artifactContent` por caminho nunca é invalidado; a subscription ao final do arquivo (linhas 112-130) só invalida `treeByPhaseId`, não `artifactContent`"
    missing:
      - "Invalidar as entradas de `artifactContent` cujo caminho pertence a uma fase presente em `recentlyUpdatedPhaseIds` (mesmo hook já usado para `treeByPhaseId`), ou invalidar diretamente pelos caminhos do payload `planning:changed`"
      - "Um teste em ArtifactModal.test.tsx ou detail-store que abra um artefato, simule uma mudança de `recentlyUpdatedPhaseIds` para a fase daquele artefato, e assine que uma releitura subsequente reflete o novo conteúdo"
  - truth: "T-01-01 (path traversal via symlink) permanece mitigado de forma contínua, não só no momento da implementação."
    status: partial
    reason: >
      Confirmado por leitura direta de `.github/workflows/ci.yml`: o job `build` roda `npm run typecheck`,
      `npm run test` e `cargo check --manifest-path src-tauri/Cargo.toml`, mas NUNCA `cargo test`. `cargo check`
      só type-checa o crate Rust — não executa os blocos `#[cfg(test)] mod tests` de `project.rs` (contenção de
      caminho `is_contained`, mitigação de T-01-01) nem de `planning_watcher.rs` (`is_relevant_change`). Esses
      testes são hoje a ÚNICA verificação automatizada dessas mitigações de segurança documentadas no próprio
      código, e nenhum deles roda em CI. Uma regressão futura em `is_contained` (ex.: alguém "simplifica" de volta
      para comparação de prefixo de string) compilaria e passaria em `cargo check` normalmente, sem alarme.
      Severidade menor que os dois gaps acima porque a correção atual dos testes já foi verificada manualmente
      durante a execução de cada plano (documentado nos SUMMARYs) — o gap é sobre proteção de regressão contínua,
      não sobre o funcionamento correto agora.
    artifacts:
      - path: ".github/workflows/ci.yml"
        issue: "Job `build` (linha ~61) executa `cargo check` mas nunca `cargo test`; os testes de contenção de path em project.rs e planning_watcher.rs nunca rodam automaticamente"
    missing:
      - "Adicionar um passo `cargo test --manifest-path src-tauri/Cargo.toml` ao job `build` do CI (fix já esboçado em 01-REVIEW.md → CR-01)"
human_verification:
  - test: "Rodar `npm run tauri dev` em uma máquina com toolchain Rust/MSVC/GTK completo, escolher `Abrir projeto` e selecionar a raiz deste repositório."
    expected: "Uma janela nativa abre; o header mostra 'GSD Cards', badge de milestone, 'Fase N de M' e a barra de progresso lidos de STATE.md real; escolher uma pasta sem `.planning/` mostra a tela 'Esta pasta não é um projeto GSD'."
    why_human: "Requer um driver de diálogo nativo de SO dentro de uma janela Tauri real — não automatizável a partir deste ambiente sandbox (sem toolchain gráfico/GTK completo disponível). Item D4 do Plano 02, deferido a end-of-phase por `workflow.human_verify_mode`."
  - test: "Com o app aberto no projeto real, rodar um comando GSD real que escreva em `.planning/` (ex.: `/gsd-execute-phase`) e observar o board."
    expected: "O board atualiza sozinho, sem piscar, sem card quebrado no meio da rajada; o card afetado recebe um glow breve; nenhum toast aparece."
    why_human: "Requer observar uma rajada de escrita real do GSD contra uma janela nativa — não reproduzível por unit test isolado. Item D4 do Plano 04. NOTA: independentemente deste teste visual, o gap CR-02 (badges de blocker desatualizados em cenário de lote concorrente) já foi confirmado por leitura de código e não depende desta verificação visual para ser considerado um gap real."
  - test: "Corromper temporariamente um artefato de fase (remover delimitador de frontmatter) com o app aberto, e depois restaurar o arquivo."
    expected: "O card ganha aviso, o modal abre em modo raw com o motivo, o resto do board continua correto; ao restaurar, o aviso some sozinho."
    why_human: "Requer uma janela Tauri nativa real e edição de arquivo em tempo real observada visualmente. Item D5 do Plano 05."
  - test: "Renomear a pasta `.planning/` por alguns segundos com o app aberto, depois restaurar e clicar 'Reconectar'."
    expected: "Header mostra 'Desatualizado desde HH:MM' com botão Reconectar; board congela no último estado bom; ao restaurar e clicar, volta a 'Sincronizado há Xs'."
    why_human: "Requer driver de janela nativa real. Item D4 do Plano 04."
  - test: "Expandir a faixa de histórico de milestones (HistoryStrip) neste repositório."
    expected: "Mostra 'Sem milestones anteriores' (este projeto ainda não enviou nenhum milestone), com o board ativo intacto."
    why_human: "Requer janela nativa real. Item D4 do Plano 06."
---

# Phase 01: Espelho fiel — Verification Report

**Phase Goal:** Usuário abre um projeto GSD e vê, em tempo real, um board kanban hierárquico que espelha fielmente o `.planning/` — o valor central do produto.
**Verified:** 2026-07-23T05:10:00Z
**Status:** gaps_found
**Re-verification:** No — verificação inicial

## Goal Achievement

### Observable Truths

| # | Truth (Success Criterion do ROADMAP) | Status | Evidence |
|---|---|---|---|
| 1 | Usuário abre um diretório e o app só o aceita como projeto após validar a presença de `.planning/`, com aviso claro quando ausente | ✓ VERIFIED | `src-tauri/src/project.rs::validate_project_root` canonicaliza, checa contenção por componente de caminho (`is_contained`, 6 testes unitários no código-fonte), rejeita `.planning/` ausente com `NotAGsdProject`; `AppShell.tsx`/`ErrorState.tsx` renderizam a tela de erro (`AppShell.test.tsx` cobre o caso `error`/`NotAGsdProject` mostrando a cópia PROJ-02 e nenhum board) |
| 2 | Usuário vê um board kanban com cards de fase distribuídos em colunas que correspondem aos status reais de fase do gsd-core | ✓ VERIFIED | `src/planning/status.ts` replica literalmente a regra do gsd-core (`deriveDiskStatus`/`toBoardBadge`/`toBoardColumn`, 34 testes, zero import de `@tauri-apps`); `Board.test.tsx` prova que fase `executed`-sem-verificação fica em "Em execução" e nunca em "Concluída"; `oracle-drift.test.ts` (6 testes) compara a derivação contra um snapshot real do `gsd-tools init manager --raw` deste próprio repositório |
| 3 | Usuário expande um card de fase e vê a hierarquia de 3 níveis (fase → planos → tarefas) derivada dos artefatos reais, com indicadores de progresso de projeto e de fases | ✓ VERIFIED | `artifact-tree.ts::buildPhaseArtifactTree` monta fase→planos→tarefas com granularidade tudo-ou-nada ancorada só na presença do SUMMARY.md (`resilience.test.ts`); `DetailPanel.tsx` renderiza a árvore sob demanda (`useUiStore`+`useDetailStore`, 7 testes); `Header.tsx`/`PhaseCard.tsx`/`ProgressBar.tsx` mostram progresso de projeto (STATE.md `progress.percent` lido literalmente, sem recálculo) e de fase (planos concluídos/total) |
| 4 | O board atualiza sozinho quando o `.planning/` muda no disco, sem refresh manual (file watching debounced, sem piscar durante rajadas de escrita do GSD) | ⚠️ PARTIAL — gap confirmado | Mecanismo central implementado e testado para o caso comum (`planning_watcher.rs` com `notify`+`notify-debouncer-full`, debounce 250ms, `is_relevant_change` filtra temporários; `reprocessPaths` aplica o lote inteiro em uma única transição `immer`, 14 testes em `watch.test.ts`). **Porém**: bug de concorrência confirmado por leitura direta do código em `board-store.ts` (linhas ~604-618) — badges de bloqueio podem ficar desatualizados em fases não tocadas quando STATE.md e outra fase mudam no mesmo lote de debounce (ver gap CR-02 abaixo, ainda não corrigido no HEAD) |
| 5 | Diante de um artefato não parseável, o board exibe aviso/raw em vez de mentir silenciosamente, e o usuário abre a visualização renderizada de PLAN/SUMMARY/VERIFICATION a partir do card | ⚠️ PARTIAL — gap confirmado | Modo raw/aviso funciona e é testado (`parseVerificationFile` nunca cai em `passed` por default; `ArtifactModal.tsx` renderiza banner + texto cru para `unrecognized`; `resilience.test.ts` prova que um PLAN corrompido não derruba os demais artefatos da fase; nenhum `dangerouslySetInnerHTML`/`rehype-raw` no componente, confirmado por grep). **Porém**: `detail-store.ts::loadArtifact` nunca invalida o cache de conteúdo por caminho (confirmado por leitura de código — só `treeByPhaseId` tem hook de invalidação), então o modal pode mostrar conteúdo obsoleto de um artefato que mudou no disco enquanto o app está aberto (gap CR-03 abaixo, ainda não corrigido) |

**Score:** 3/5 truths totalmente verificadas; 2 com gap confirmado por leitura direta do código-fonte (não apenas alegação de SUMMARY)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src-tauri/capabilities/default.json` | Allowlist somente-leitura (8 identificadores, nenhum de mutação) | ✓ VERIFIED | `["core:default","core:event:default","dialog:allow-open","fs:allow-read-text-file","fs:allow-read-dir","fs:allow-exists","fs:allow-size","fs:allow-stat"]` — nenhum verbo de escrita/criação/remoção |
| `src-tauri/src/project.rs` | `validate_project_root` com canonicalização + contenção | ✓ VERIFIED | Implementado, testado (6 testes unitários no arquivo); ver gap sobre CI abaixo |
| `src-tauri/src/planning_watcher.rs` | Watcher `notify_debouncer_full` escopado a `.planning/**` | ✓ VERIFIED | Implementado com `DEBOUNCE_MS=250`, `is_relevant_change` (5 testes), emite `planning:changed`/`planning:watcher-degraded` |
| `src/planning/status.ts` | Regra pura de derivação de status | ✓ VERIFIED | Zero I/O (`grep -c '@tauri-apps'` = 0), 8 `DiskStatus`, 7 badges, 4 colunas |
| `src/planning/phase-scan.ts` | Varredura real de diretório de fase | ✓ VERIFIED | Regex `<numero>-<NN>-PLAN.md` exclui corretamente UI-SPEC/VALIDATION/DISCUSSION-LOG/CONTEXT/RESEARCH |
| `src/planning/parser/{state,roadmap,plan,summary,verification,milestones}.ts` | Parsers tolerantes com `ParseResult<T>` | ✓ VERIFIED | Todos retornam `unrecognized` explícito em vez de exceção ou default inventado; `status` de VERIFICATION nunca cai em `passed` por default (linha explícita no código) |
| `src/components/ArtifactModal.tsx` | Render GFM + modo raw, sem HTML bruto | ✓ VERIFIED | `remarkGfm`, `urlTransform` identidade, componente `a` customizado só permite `http(s)` e mesmo assim nunca produz `<a href>` navegável (capability de URL externa não existe nesta fase); zero `dangerouslySetInnerHTML`/`rehype-raw` |
| `src/components/HistoryStrip.tsx` | Faixa de histórico recolhida (D-08) | ✓ VERIFIED | Montada em `Board.tsx`; le `.planning/milestones/` (nunca `archive`, confirmado por grep) |
| `src/stores/board-store.ts` | `reprocessPaths` em transição única | ⚠️ PARCIAL | Transição única (`set()` do immer) confirmada; ver gap CR-02 (blockers desatualizados em cenário de lote concorrente) |
| `src/stores/detail-store.ts` | Carregamento preguiçoso e cacheado de artefatos | ⚠️ PARCIAL | Cache de árvore (`treeByPhaseId`) invalida corretamente via subscription; cache de conteúdo bruto (`artifactContent`) nunca invalida (gap CR-03) |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/main.tsx` | `src/i18n.ts` | import antes do render | ✓ WIRED | `import "./i18n";` linha 3 |
| `src/styles/index.css` | `src/styles/theme.css` | `@import` | ✓ WIRED | confirmado |
| `src/planning/read.ts` | `src-tauri/src/project.rs` | `invoke("validate_project_root")` | ✓ WIRED | confirmado |
| `src/shell/Header.tsx` | `src/stores/board-store.ts` | `useBoardStore` | ✓ WIRED | confirmado |
| `src/stores/board-store.ts` | `src/planning/parser/state.ts` | `parseStateFile` | ✓ WIRED | confirmado em `openProject` e `reprocessPaths` |
| `src/shell/Board.tsx` | `src/planning/status.ts` | `selectPhasesByColumn` | ✓ WIRED | confirmado |
| `src/components/PhaseCard.tsx` | `src/stores/ui-store.ts` | `useUiStore`/`selectPhase` | ✓ WIRED | confirmado |
| `src/planning/watch.ts` | `src-tauri/src/planning_watcher.rs` | `listen("planning:changed")` | ✓ WIRED | confirmado |
| `src/planning/watch.ts` | `src/stores/board-store.ts` | `reprocessPaths` | ✓ WIRED | confirmado, mas ver gap CR-02 na implementação de `reprocessPaths` em si |
| `src/components/SyncIndicator.tsx` | `src/stores/board-store.ts` | `useBoardStore` | ✓ WIRED | confirmado |
| `src/components/DetailPanel.tsx` | `src/stores/ui-store.ts` | `useUiStore` | ✓ WIRED | confirmado |
| `src/components/ArtifactModal.tsx` | `src/stores/detail-store.ts` | `useDetailStore` | ✓ WIRED | confirmado, mas ver gap CR-03 na implementação de `loadArtifact`/cache em si |
| `src/planning/artifact-tree.ts` | `src/planning/parser/plan.ts` | `parsePlanFile` | ✓ WIRED | confirmado |
| `src/shell/Board.tsx` | `src/components/HistoryStrip.tsx` | montagem abaixo das colunas | ✓ WIRED | confirmado (`grep -c 'HistoryStrip' Board.tsx` = 2) |
| `src/planning/parser/milestones.ts` | `src/planning/paths.ts` | `milestonesDir` | ✓ WIRED | confirmado; `grep -c 'archive'` = 0 no arquivo |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Suíte de testes completa | `npm run test` (vitest) | 20 arquivos, 176 testes, todos passando | ✓ PASS |
| Typecheck | `npm run typecheck` (tsc --noEmit) | Sem erros | ✓ PASS |
| Build de produção | `npm run build` | `vite build` concluído (720KB bundle principal, aviso de chunk grande e de `eval` no `gray-matter` — não bloqueante) | ✓ PASS |
| Paridade de chaves i18n | verificação por script Node em todos os 5 namespaces (`artifact`, `board`, `common`, `project`, `sync`) | pt-BR/en idênticos nas 5 | ✓ PASS |
| Regra de status pura, sem I/O | `grep -c '@tauri-apps' src/planning/status.ts` | 0 | ✓ PASS |
| Caminho `.planning/archive` morto nunca lido | `grep -c 'archive' src/planning/parser/milestones.ts` | 0 | ✓ PASS |
| Nenhum HTML bruto no visualizador | `grep -c 'dangerouslySetInnerHTML\|rehype-raw'` em `src/` e `package.json` | 0 | ✓ PASS |
| Nenhum marcador de débito sem referência (`TBD`/`FIXME`/`XXX`) | grep em `src/`, `src-tauri/src/` | 0 ocorrências reais (falsos-positivos de "TODO" no texto em português "todo parser" e constante nomeada `PLACEHOLDER` para traço de campo `unrecognized`, ambos intencionais) | ✓ PASS |
| `cargo check` (compilação Rust) | `cargo check --manifest-path src-tauri/Cargo.toml` | **Não executável neste ambiente de verificação** — falha em `gdk-sys`/`pkg-config` por ausência de `webkit2gtk`/GTK dev libs no sandbox, e o proxy de rede bloqueia os pacotes `security.ubuntu.com` necessários para instalá-las | ? SKIP (limitação de ambiente) |
| `cargo test` (testes unitários Rust) | `cargo test --manifest-path src-tauri/Cargo.toml` | Mesma limitação acima — não executável neste sandbox | ? SKIP (limitação de ambiente) — **e**, independentemente disso, confirmado que o CI também nunca roda `cargo test` (gap CR-01) |

**Nota sobre a limitação do Rust:** como o binário Tauri depende de `webkit2gtk`/GTK para linkar no Linux, e este ambiente de verificação não tem essas bibliotecas de sistema instaladas nem acesso de rede para instalá-las (pacotes de `security.ubuntu.com` bloqueados pelo proxy), não foi possível compilar/rodar `cargo check`/`cargo test` de forma independente aqui. A avaliação do código Rust (`project.rs`, `planning_watcher.rs`) foi feita por leitura direta do código-fonte, que corresponde fielmente ao que os SUMMARYs descrevem — mas a suíte de testes unitários Rust em si não pôde ser re-executada nesta verificação, e (independentemente disso) o CI do projeto também nunca executa `cargo test` hoje (ver gap CR-01).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PROJ-02 | 01-01, 01-02 | Usuário abre um diretório como projeto; app valida presença de `.planning/` | ✓ SATISFIED | `validate_project_root` + `ErrorState`/`AppShell.test.tsx`; ver truth #1 |
| BOARD-01 | 01-03, 01-06 | Board kanban com colunas mapeando status reais do gsd-core | ✓ SATISFIED | `status.ts` + `oracle-drift.test.ts` + `Board.test.tsx`; ver truth #2 |
| BOARD-02 | 01-05 | Cards de fase expandem hierarquia de 3 níveis | ✓ SATISFIED | `artifact-tree.ts` + `DetailPanel.tsx`; ver truth #3 |
| BOARD-03 | 01-04 | Board reflete mudanças em tempo real via file watching | ⚠️ SATISFIED COM GAP | Mecanismo funciona no caso comum; gap CR-02 confirmado (badges de blocker desatualizados em cenário de lote concorrente) — ver truth #4 |
| BOARD-04 | 01-02, 01-03 | Indicadores de progresso de projeto e de fases | ✓ SATISFIED | Progresso de projeto (Header) e de fase (PhaseCard) lidos literalmente de STATE.md/scan; o gap CR-02 afeta especificamente o badge de bloqueio, não a barra de progresso |
| BOARD-05 | 01-05, 01-06 | Board degrada graciosamente com artefatos não parseáveis | ✓ SATISFIED | `unrecognized` explícito em todos os parsers; `resilience.test.ts` prova degradação localizada |
| BOARD-06 | 01-05 | Usuário abre visualização renderizada de PLAN/SUMMARY/VERIFICATION | ⚠️ SATISFIED COM GAP | Renderização GFM funciona e é segura; gap CR-03 confirmado (cache de conteúdo nunca invalida, pode mostrar versão obsoleta) — ver truth #5 |

Nenhum requisito órfão: os 7 requisitos declarados nos frontmatters dos planos (`PROJ-02, BOARD-01..06`) batem exatamente com a linha "Phase 1 (Espelho fiel)" de `REQUIREMENTS.md` (`## Traceability` → "By Phase").

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/stores/board-store.ts` | ~604-618 (`reprocessPaths`) | Branches mutuamente exclusivos deixam `blockers` desatualizado em fases não tocadas pelo lote atual | 🛑 Blocker | Viola a promessa de espelho fiel em tempo real para o badge de bloqueio (BOARD-03/04) — gap CR-02 |
| `src/stores/detail-store.ts` | 93-108 (`loadArtifact`) | Cache `artifactContent` nunca invalidado (ao contrário de `treeByPhaseId`, que tem hook de invalidação) | 🛑 Blocker | Modal de artefato pode mostrar conteúdo obsoleto indefinidamente — gap CR-03 |
| `.github/workflows/ci.yml` | ~61 | `cargo check` roda, `cargo test` nunca roda | ⚠️ Warning | Testes de segurança de contenção de caminho (`is_contained`, `is_relevant_change`) nunca são executados automaticamente — regressão futura passaria despercebida em CI — gap CR-01 |
| `src-tauri/src/project.rs` | 93-97 | Escopo de fs concedido sobre `root_canonical` (raiz inteira do projeto) em vez de `planning_canonical` (só `.planning/`) | ℹ️ Info | Não explorável pelo código atual (todo caminho TS é derivado de `.planning/`), mas é uma concessão mais ampla do que o produto declara precisar (achado WR-01 de `01-REVIEW.md`, já documentado e não bloqueante para esta verificação) |
| `src/stores/board-store.ts` (`closeProject`) | 515-524 | Escopo de fs nunca é revogado ao fechar um projeto | ℹ️ Info | Acúmulo de escopo entre projetos na mesma sessão do processo (achado WR-02 de `01-REVIEW.md`); fora do escopo de single-project desta fase, mas relevante para a Fase 4 (multi-projeto) |

Estes achados foram originalmente identificados por uma revisão de código já commitada neste repositório (`.planning/phases/01-espelho-fiel/01-REVIEW.md`, commit `4ed9ecc`) e foram **confirmados de forma independente nesta verificação por leitura direta do código-fonte atual** (não apenas citados da SUMMARY/REVIEW) — nenhum commit de correção existe no `git log` após a revisão.

## Human Verification Required

Itens que dependem de uma janela Tauri nativa real (`npm run tauri dev`) rodando em uma máquina com toolchain Rust/MSVC/GTK completo — não reproduzíveis neste ambiente de verificação sandbox. Todos os 6 planos documentaram esses itens como deferidos a "end-of-phase" (`workflow.human_verify_mode: "end-of-phase"` em `.planning/config.json`), e este é esse momento.

### 1. Fluxo completo "Abrir projeto" na janela nativa

**Test:** Rodar `npm run tauri dev`, clicar "Abrir projeto", escolher a raiz deste repositório; depois escolher uma pasta sem `.planning/`.
**Expected:** Janela abre; primeiro caso mostra header com "GSD Cards", milestone, fase atual e progresso reais; segundo caso mostra "Esta pasta não é um projeto GSD".
**Why human:** Requer driver de diálogo nativo do SO dentro de uma janela Tauri real.

### 2. Rajada de escrita real do GSD observada visualmente

**Test:** Com o app aberto, rodar `/gsd-execute-phase` (ou comando GSD real equivalente) e observar o board.
**Expected:** Atualização sem piscar, sem card quebrado, glow breve no card afetado, nenhum toast.
**Why human:** Requer observação visual de uma rajada de escrita real contra uma janela nativa. **Nota:** independente deste teste, o gap CR-02 (badges de bloqueio desatualizados em lote concorrente) já foi confirmado por leitura de código nesta verificação e é um gap real, não uma hipótese pendente deste teste.

### 3. Degradação e reconexão do watcher

**Test:** Renomear `.planning/` por alguns segundos, restaurar, clicar "Reconectar".
**Expected:** Header mostra "Desatualizado desde HH:MM"; ao reconectar, volta a "Sincronizado há Xs".
**Why human:** Requer janela nativa real.

### 4. Artefato corrompido e restaurado, observado no app

**Test:** Remover o delimitador de frontmatter de um artefato de fase temporariamente, observar o card e o modal, depois restaurar.
**Expected:** Card ganha aviso, modal abre em modo raw com o motivo; ao restaurar, aviso some sozinho.
**Why human:** Requer janela nativa real e edição de arquivo observada em tempo real.

### 5. Faixa de histórico de milestones

**Test:** Expandir a faixa de histórico neste repositório.
**Expected:** "Sem milestones anteriores" (projeto ainda não enviou milestone).
**Why human:** Requer janela nativa real.

## Gaps Summary

A Fase 1 entrega uma base sólida e majoritariamente correta: todos os 6 planos foram executados, os 176 testes automatizados passam, o typecheck e o build de produção estão limpos, e a leitura direta do código-fonte (não apenas as alegações das SUMMARYs) confirma que a arquitetura central — portão único de filesystem, `ParseResult<T>` sem defaults inventados, regra de status replicada literalmente do gsd-core, watcher debounced, render GFM seguro — está implementada fielmente ao que foi planejado.

Porém, esta verificação identificou e confirmou por leitura direta do código-fonte (não apenas citando `01-REVIEW.md`) **dois bugs de correção que seguem sem correção no HEAD atual** e que atingem diretamente o valor central do produto ("espelho confiável... se tudo mais falhar, isso tem que funcionar"):

1. **CR-02** — badges de bloqueio podem ficar desatualizados em fases não tocadas por um lote de watcher quando esse lote também contém uma mudança em STATE.md (cenário plausível em uso real do GSD, já que `/gsd-execute-phase` tipicamente grava um SUMMARY.md de uma fase e atualiza `STATE.md` em sequência rápida, dentro da mesma janela de debounce de 250ms).
2. **CR-03** — o modal de artefato nunca invalida seu cache de conteúdo bruto, podendo mostrar uma versão obsoleta de um PLAN/SUMMARY/VERIFICATION indefinidamente após esse arquivo mudar no disco.

Um terceiro achado, de severidade menor mas ainda um gap real, é que o CI nunca executa `cargo test` (só `cargo check`), deixando os testes unitários de segurança de contenção de caminho (`is_contained`/`is_relevant_change`) sem execução automática contínua (CR-01).

Nenhum desses três gaps invalida o trabalho já feito — a base é sólida e os problemas têm correções pequenas e já esboçadas (a própria `01-REVIEW.md` já contém os patches sugeridos). Mas, por serem violações confirmadas e reproduzíveis do critério de sucesso "board atualiza sozinho... sem refresh manual" (SC #4) e da promessa de honestidade do espelho ligada a SC #5/BOARD-06, esta verificação não pode marcar a fase como `passed` sem que sejam corrigidos ou explicitamente aceitos via override.

Além dos gaps de código, permanece pendente a verificação humana end-to-end com janela Tauri nativa (D4/D5 de todos os 6 planos), deferida desde o início por `workflow.human_verify_mode: "end-of-phase"` — este é esse momento, e nenhum desses checks pôde ser executado neste ambiente sandbox (sem toolchain gráfico completo).

---

_Verified: 2026-07-23T05:10:00Z_
_Verifier: Claude (gsd-verifier)_
