---
phase: 01-espelho-fiel
plan: 04
subsystem: sync
tags: [notify, notify-debouncer-full, tauri-event, zustand, immer, date-fns, i18next, vitest, cargo-test]

# Dependency graph
requires:
  - phase: 01-03
    provides: "board-store.ts openProject/buildPhaseModels, PhaseCard `highlighted`/`parseWarning` props, sync/recentlyUpdatedPhaseIds pre-declared slots, Header sync-indicator slot"
provides:
  - "planning_watcher.rs — watcher notify+notify-debouncer-full escopado estritamente a .planning/**, DEBOUNCE_MS=250, is_relevant_change filtra temporários de escrita atômica, emite planning:changed (lote deduplicado) e planning:watcher-degraded"
  - "watch.ts — classifyChangedPath (pura) + startWatching/stopWatching (listeners Tauri + comandos Rust)"
  - "board-store.ts reprocessPaths — reprocessamento incremental do lote em uma única transição immer (scanPhasesByNumber + mergePhaseModels), sync: {state,lastSyncedAt,degradedSince,reason}, markSyncHealthy/markSyncDegraded/reconnectWatcher com auto-retry silencioso de intervalo crescente"
  - "SyncIndicator — D-14/D-16, três estados (healthy/degraded/idle), nunca mostra 'sincronizado' enquanto degradado"
affects: [01-05, 01-06]

# Tech tracking
tech-stack:
  added:
    - "notify@9.0.0-rc.4 (crate Rust)"
    - "notify-debouncer-full@0.8.0-rc.2 (crate Rust)"
  patterns:
    - "watch.ts e board-store.ts importam um do outro (classifyChangedPath vs. useBoardStore) — ciclo ESM deliberado e seguro porque os exports usados do lado ainda-não-avaliado são sempre function declarations (hoisted), nunca const/arrow, e só são chamados dentro de outras funções invocadas depois que ambos os módulos terminam de carregar"
    - "reprocessPaths aplica TODO o lote (STATE/ROADMAP/N fases) em uma única chamada de `set` do immer — é essa transição única, e não o debounce do Rust sozinho, que garante 'uma notificação por lote' ao React"
    - "scanPhasesByNumber + mergePhaseModels: reprocessamento incremental de verdade — só os diretórios de fase citados no lote são varridos (scanPhaseDir), o restante do array de PhaseModel[] é preservado por referência"

key-files:
  created:
    - src-tauri/src/planning_watcher.rs
    - src/planning/watch.ts
    - src/planning/watch.test.ts
    - src/components/SyncIndicator.tsx
    - src/components/SyncIndicator.test.tsx
    - src/locales/pt-BR/sync.json
    - src/locales/en/sync.json
  modified:
    - src-tauri/src/lib.rs
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src/stores/board-store.ts
    - src/shell/Header.tsx
    - src/i18n.ts

key-decisions:
  - "DEBOUNCE_MS mantido em 250ms (meio da faixa 150-300ms sugerida por PITFALLS.md) — nenhum ajuste empírico foi necessário nesta execução; a verificação visual real de rajada (`npm run tauri dev` + `/gsd-execute-phase` real) fica deferida ao end-of-phase (ver Human Verification abaixo), então este valor deve ser revisitado se essa verificação mostrar piscar"
  - "reprocessPaths só reconstrói o board inteiro (buildPhaseModels + scanAllPhases) quando o próprio ROADMAP.md muda; mudanças de STATE.md e de fases específicas são aplicadas por cima do array de PhaseModel[] existente (scanPhasesByNumber + mergePhaseModels), preservando name/requirementIds/isInserted das fases não tocadas sem I/O extra"
  - "auto-retry de reconexão (D-16) usa backoff crescente [1s,2s,5s,10s,15s] e só reagenda enquanto sync.state permanecer 'degraded' — para sozinho assim que reconnectWatcher (manual ou automático) tiver sucesso"
  - "watch.ts e board-store.ts formam um ciclo de import mútuo deliberado (classifyChangedPath/startWatching/stopWatching vs. useBoardStore) — resolvido com function declarations exportadas (hoisted) em vez de const arrow functions, para que o ciclo nunca observe um export ainda não inicializado"

patterns-established:
  - "Toda transição de estado disparada por um evento de filesystem passa por exatamente uma chamada de `set` do immer, mesmo quando múltiplas fontes de leitura (STATE/ROADMAP/N fases) precisam ser combinadas — nunca setState parcial em sequência"
  - "Falha de leitura de um artefato específico durante reprocessamento nunca lança: preserva o valor anterior daquele artefato e acumula uma ParseIssue em project.issues (D-15 aplicado ao caminho de watch, não só à varredura inicial do Plano 03)"

requirements-completed: [BOARD-03]

coverage:
  - id: D1
    description: "planning_watcher.rs observa estritamente .planning/** (nunca a raiz do repo), com debounce nativo de 250ms; is_relevant_change filtra corretamente markdown/config.json dentro da raiz, temporários de escrita atômica, caminhos fora da raiz e o caso de diretório irmão com prefixo textual comum"
    requirement: "BOARD-03"
    verification:
      - kind: unit
        ref: "src-tauri/src/planning_watcher.rs#tests — 5 testes (11 no total do crate, incluindo os 6 pré-existentes de project.rs) — cargo test exit 0"
        status: pass
      - kind: other
        ref: "cargo check --manifest-path src-tauri/Cargo.toml exit 0; capabilities/default.json sem nenhum novo identificador de mutação de filesystem"
        status: pass
    human_judgment: false
  - id: D2
    description: "classifyChangedPath classifica corretamente os 5 tipos de caminho (state/roadmap/phase+id/milestones/other, incluindo fase decimal D-07); reprocessPaths aplica um lote de 12 caminhos (1 STATE + 11 da mesma fase) em exatamente 1 notificação do store; um lote restrito à fase 02 nunca chama scanPhaseDir para o diretório da fase 01; uma leitura que falha preserva o artefato anterior e registra ParseIssue; planning:watcher-degraded transiciona sync sem apagar project"
    requirement: "BOARD-03"
    verification:
      - kind: unit
        ref: "src/planning/watch.test.ts — 14 testes, vitest run exit 0"
        status: pass
      - kind: other
        ref: "npm run typecheck (tsc --noEmit) exit 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "SyncIndicator mostra o estado saudável com contagem de segundos, o estado degradado com horário + botão Reconectar (sem nunca exibir o rótulo saudável simultaneamente), chama reconnectWatcher ao clicar, e não renderiza nada sem projeto aberto; locales pt-BR/en com paridade de chaves"
    requirement: "BOARD-03"
    verification:
      - kind: unit
        ref: "src/components/SyncIndicator.test.tsx — 4 testes, vitest run exit 0 (healthy / degraded sem rótulo saudável / clique chama reconnectWatcher / idle não renderiza)"
        status: pass
      - kind: other
        ref: "grep de paridade de chaves entre src/locales/pt-BR/sync.json e src/locales/en/sync.json — idênticas; npm run build (typecheck + vite build) exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Verificação end-to-end real: npm run tauri dev aberto, um comando GSD real (/gsd-execute-phase) escrevendo em .planning/ atualiza o board sozinho sem piscar e com glow no card afetado; renomear .planning/ produz o header 'Desatualizado desde HH:MM' com botão Reconectar e o board congelado; restaurar e clicar Reconectar volta a saudável"
    verification: []
    human_judgment: true
    rationale: "Requer dirigir uma janela Tauri nativa real e observar uma rajada de escritas real do GSD — não automatizável a partir deste shell. Deferido ao end-of-phase por `.planning/config.json` `workflow.human_verify_mode: 'end-of-phase'`, mesmo precedente de D4 dos Planos 02/03. A lógica de reprocessamento incremental e a preservação do último estado bom já foram verificadas isoladamente por unidade (D2), dando confiança alta de que o resultado visual vai bater sem precisar da janela nativa neste passo — mas o DEBOUNCE_MS=250ms só pode ser validado empiricamente contra uma rajada real, então esse valor específico depende desta verificação futura."

duration: ~25min
completed: 2026-07-23
status: complete
---

# Phase 01 Plan 04: Sincronização em Tempo Real (Espelho Vivo) Summary

**Um watcher `notify`+`notify-debouncer-full` em Rust escopado estritamente a `.planning/**`, um reprocessador incremental no frontend que aplica lotes inteiros (STATE/ROADMAP/N fases) em uma única transição immer, e um indicador de sincronização que nunca finge estar vivo — transformando o board de foto estática em espelho de verdade.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 (todas completas, sem checkpoints)
- **Files modified:** 7 criados, 6 modificados

## Accomplishments

- `planning_watcher.rs` implementa `start_planning_watch`/`stop_planning_watch` com `notify`+`notify-debouncer-full` (versões RC travadas exatas em `Cargo.lock`, conforme a pesquisa exigia), observando **só** o `.planning/` do projeto já validado (nunca a raiz do repositório — o que faria o `.git/` gerar tempestade de eventos durante um commit do GSD). `is_relevant_change` é uma função pura testada com 5 casos: markdown/`config.json` dentro da raiz (relevante), temporários de escrita atômica `.tmp`/`.swp`/`~arquivo` (irrelevante), caminho fora da raiz (irrelevante), e o caso de diretório irmão com prefixo textual comum tipo `.planning-backup` vs `.planning` (irrelevante — mesma regra de `project.rs::is_contained`). Emite `planning:changed` (lote deduplicado de caminhos, nunca conteúdo de arquivo) e `planning:watcher-degraded` (motivo legível) quando o debouncer reporta erro. `WatcherState` com `Mutex` garante que abrir um novo projeto substitui o watcher anterior em vez de acumular (T-01-11).
- `watch.ts` expõe `classifyChangedPath` (função pura, sem I/O) que reconhece `STATE.md` → `state`, `ROADMAP.md` → `roadmap`, um arquivo dentro de `phases/NN-slug/` → `phase` com o id extraído do nome do diretório (incluindo fases decimais D-07 como `02.1`), `MILESTONES.md`/`.planning/milestones/**` → `milestones`, qualquer outro → `other`. `startWatching`/`stopWatching` gerenciam os listeners Tauri (`planning:changed`/`planning:watcher-degraded`) e os comandos do backend.
- `board-store.ts`'s `reprocessPaths` classifica o lote inteiro primeiro, deduplica por tipo, e só então executa as leituras necessárias: releitura de `STATE.md` só se algum caminho for `state`; releitura+parse de `ROADMAP.md` (com varredura completa de fases) só se algum caminho for `roadmap`; e `scanPhasesByNumber` — uma varredura restrita apenas às fases citadas no lote — para os demais casos. `mergePhaseModels` funde esse subconjunto sobre o array de `PhaseModel[]` já existente sem reconstruir tudo, preservando nome/requisitos/badge "inserida" das fases não tocadas. Tudo isso é aplicado em **uma única** chamada de `set` do immer — é essa transição única, não o debounce do Rust sozinho, que garante que um lote de 12 caminhos produza exatamente 1 notificação aos assinantes do React, nunca doze.
- Falha de leitura de qualquer artefato durante o reprocessamento (arquivo apagado ou truncado no meio de uma escrita) nunca lança: o valor anterior daquele artefato específico é preservado e uma `ParseIssue` é acumulada em `project.issues` — o restante do lote continua sendo aplicado (D-15 estendido do caminho de varredura inicial do Plano 03 para o caminho de watch em tempo real).
- `sync: { state, lastSyncedAt, degradedSince, reason }` substitui o placeholder do Plano 03. `markSyncHealthy`/`markSyncDegraded` atualizam esse estado; `markSyncDegraded` agenda um auto-retry silencioso com backoff crescente (1s→2s→5s→10s→15s) que chama `reconnectWatcher` repetidamente em background, parando assim que o `sync.state` deixar de ser `degraded` — a apresentação só muda quando a reconexão de fato funciona (nunca otimista). `reconnectWatcher` reinicia o watcher e faz uma releitura completa do projeto (mudanças podem ter sido perdidas durante a janela cega da degradação).
- `SyncIndicator` (D-14, D-16) tem três apresentações: `healthy` (ponto verde 8px + "Sincronizado há Xs", recalculado a cada segundo via `setInterval`), `degraded` (ponto amber + "Desatualizado desde HH:mm" formatado com `date-fns` respeitando o locale ativo pt-BR/en + botão de texto "Reconectar" que chama `reconnectWatcher`, com o corpo explicativo como tooltip), `idle`/sem projeto (não renderiza nada). A regra de honestidade central é testada explicitamente: enquanto degradado, o rótulo "sincronizado" nunca aparece na árvore renderizada.
- `openProject` agora chama `startWatching` assim que o projeto abre com sucesso (usando a raiz canônica já validada, nunca um caminho cru do frontend); `closeProject` chama `stopWatching` e reseta `sync`/`recentlyUpdatedPhaseIds`. Se iniciar o watcher falhar, o board ainda abre com o snapshot atual, só sem tempo real até uma reconexão.
- Namespace `sync` (pt-BR/en, paridade total de chaves) registrado em `i18n.ts`, com os textos-fonte exatos do UI-SPEC (`sync.healthy.label`, `sync.stale.label`, `sync.stale.body`, `sync.actions.reconnect`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Watcher Rust debounced escopado a .planning/** — `c764287` (feat)
2. **Task 2: Reprocessamento incremental do lote no frontend** — `f280e05` (feat)
3. **Task 3: Indicador de sincronização com estado degradado e reconexão** — `573e4f7` (feat)

**Plan metadata:** _pending — created after this SUMMARY, in the final commit step_

## Files Created/Modified

- `src-tauri/src/planning_watcher.rs` - watcher notify+notify-debouncer-full, `is_relevant_change` puro com 5 testes
- `src-tauri/src/lib.rs` - registra `start_planning_watch`/`stop_planning_watch` e `WatcherState` gerenciado
- `src-tauri/Cargo.toml`/`Cargo.lock` - `notify@9.0.0-rc.4`, `notify-debouncer-full@0.8.0-rc.2` travados
- `src/planning/watch.ts` / `watch.test.ts` - `classifyChangedPath`, `startWatching`/`stopWatching`, 14 testes
- `src/stores/board-store.ts` - `reprocessPaths`, `scanPhasesByNumber`, `mergePhaseModels`, `sync`, `markSyncHealthy`/`markSyncDegraded`/`reconnectWatcher`; `openProject`/`closeProject` amarrados a `startWatching`/`stopWatching`
- `src/components/SyncIndicator.tsx` / `SyncIndicator.test.tsx` - indicador de 3 estados, 4 testes
- `src/locales/pt-BR/sync.json` / `en/sync.json` - namespace `sync`
- `src/i18n.ts` - registra o namespace `sync` (instrução explícita do corpo do plano, ainda que ausente do `files_modified` do frontmatter — ver Deviations)
- `src/shell/Header.tsx` - monta `<SyncIndicator />` no slot já reservado

## Decisions Made

- `DEBOUNCE_MS` mantido em 250ms — nenhum ajuste empírico foi feito nesta execução porque a verificação de rajada real (`npm run tauri dev` + comando GSD real) está deferida ao end-of-phase; revisitar esse valor se essa verificação mostrar piscar ou card quebrado
- Reconstrução completa do board (`buildPhaseModels` + `scanAllPhases`) só acontece quando o próprio `ROADMAP.md` muda; mudanças de `STATE.md` e de fases específicas são aplicadas incrementalmente sobre o array já existente
- Auto-retry de reconexão com backoff crescente `[1s,2s,5s,10s,15s]`, silencioso, parando assim que `sync.state` deixar de ser `degraded`
- `watch.ts`/`board-store.ts` formam um ciclo de import mútuo deliberado, resolvido com function declarations exportadas (hoisted) em vez de `const` arrow functions — nenhum export é observado antes de estar inicializado, mesmo em carregamento circular

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `src/i18n.ts` modificado apesar de ausente do `files_modified` do frontmatter**
- **Found during:** Task 3
- **Issue:** O corpo da Task 3 instrui explicitamente "Registrar o namespace `sync` no `src/i18n.ts`", mas o frontmatter `files_modified` do plano não lista esse arquivo — sem essa mudança, `useTranslation("sync")` no `SyncIndicator` nunca resolveria as chaves reais (cairia nos placeholders do i18next)
- **Fix:** Adicionado o import de `syncPtBR`/`syncEn` e o namespace `sync` ao objeto `resources` e ao array `ns` de `i18n.ts`, seguindo exatamente o padrão já usado pelo namespace `board` do Plano 03
- **Files modified:** src/i18n.ts
- **Verification:** `SyncIndicator.test.tsx` passa (os 4 testes dependem das chaves reais resolvendo); `npm run typecheck`/`npm run build` exit 0
- **Committed in:** `573e4f7` (Task 3 commit)

Nenhum outro desvio — os demais dois arquivos "extras" (`src-tauri/Cargo.lock`, atualizado automaticamente por `cargo add`) são consequência direta e esperada de adicionar as duas crates que o próprio plano especifica.

---

**Total deviations:** 1 auto-fixed (Rule 2 missing-critical)
**Impact on plan:** Necessário para a própria Task 3 funcionar como especificado (as chaves de i18n citadas na ação e nos critérios de aceitação da task). Sem escopo de arquitetura alterado, sem scope creep.

## Issues Encountered

Nenhum além do desvio documentado acima.

## Known Stubs

Nenhum. Todo o caminho de dados (watcher Rust → `planning:changed`/`planning:watcher-degraded` → `reprocessPaths`/`markSyncDegraded` → `SyncIndicator`) está conectado ponta a ponta com dados reais, sem placeholder.

## Threat Flags

Nenhuma superfície nova além da já registrada no `<threat_model>` do próprio plano (T-01-05c, T-01-10, T-01-06b, T-01-11) — todas as quatro mitigações foram implementadas conforme especificado:
- T-01-05c: watcher escopado a `.planning/**`, debounce nativo, `is_relevant_change` filtrando temporários, lote aplicado em transição única
- T-01-10: `classifyChangedPath` só aceita caminhos contidos na raiz do projeto validado; toda leitura passa por `readPlanningText`, que opera dentro do escopo `fs` já concedido pelo Plano 02
- T-01-06b: board congela no último estado bom quando degradado; indicador nunca mostra "sincronizado" nesse estado; retentativa silenciosa só muda a apresentação ao reconectar de fato
- T-01-11: `WatcherState` com `Mutex` garante watcher único, substituído (não acumulado) a cada `openProject`

## User Setup Required

None - nenhuma configuração externa de serviço necessária.

## Human Verification Required (end-of-phase, per `workflow.human_verify_mode`)

Como nos Planos 02/03, a verificação visual completa fica deferida ao end-of-phase:

1. Abrir `npm run tauri dev` em `C:\dev\gsd-cards`
2. Confirmar que o header mostra "Sincronizado há Xs" contando
3. Rodar um comando GSD real que escreva em `.planning/` (ex.: `/gsd-execute-phase` gravando PLAN/SUMMARY + `git commit`) e observar o board atualizar sozinho, com glow breve no card afetado, sem piscar e sem card quebrado no meio da rajada
4. Renomear a pasta `.planning/` por alguns segundos e confirmar "Desatualizado desde HH:MM" + botão "Reconectar", board congelado no último estado bom
5. Restaurar o nome e clicar "Reconectar" — indicador volta a saudável, board se atualiza
6. Se o passo 3 piscar ou mostrar um card quebrado, aumentar `DEBOUNCE_MS` (150-300ms) em `src-tauri/src/planning_watcher.rs` e registrar o valor final

## Next Phase Readiness

- `watch.ts`/`board-store.ts` ficam prontos para o Plano 05 (painel de detalhe) e Plano 06 (milestones) consumirem sem precisar editar a lógica de reprocessamento — `classifyChangedPath` já classifica `milestones` como um tipo próprio (ainda não acionando releitura nesta fase; Plano 06 decide o que fazer com isso)
- `SyncIndicator`/`sync` state ficam estáveis para qualquer plano futuro que precise refletir saúde de sincronização
- D4 (verificação visual completa end-to-end) deferida ao end-of-phase, mesmo precedente dos Planos 02/03
- Nenhum bloqueio para o Plano 05

---
*Phase: 01-espelho-fiel*
*Completed: 2026-07-23*

## Self-Check: PASSED

All 7 tracked deliverable files (plus this SUMMARY.md) confirmed present on disk; all 3 commit hashes (`c764287`, `f280e05`, `573e4f7`) confirmed present in `git log`.
