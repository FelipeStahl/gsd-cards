---
phase: 01-espelho-fiel
plan: 07
subsystem: board-store
tags: [zustand, vitest, tdd, watch, board-store, detail-store, cache-invalidation]

# Dependency graph
requires:
  - phase: 01-04
    provides: "reprocessPaths e o watcher debounced (file watching em tempo real)"
  - phase: 01-05
    provides: "detail-store.ts e o cache artifactContent/treeByPhaseId"
provides:
  - "reprocessPaths reaplica o filtro de blockers a TODAS as fases sempre que blockersChanged, independentemente de qual branch tratou a varredura do lote (CR-02 fechado)"
  - "detail-store.ts invalida artifactContent por fase dona quando recentlyUpdatedPhaseIds muda (CR-03 fechado)"
affects: [01-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bloco de reaplicação de blockers independente (if, não else if) do branch de merge de fases varridas — dois efeitos do mesmo lote de debounce não são mutuamente exclusivos"
    - "Mapa companheiro (artifactPhaseId) rastreando a fase dona de cada entrada de cache de conteúdo, para permitir invalidação escopada por fase na mesma subscription que já invalida treeByPhaseId"

key-files:
  created:
    - src/stores/detail-store.test.ts
  modified:
    - src/stores/board-store.ts
    - src/planning/watch.test.ts
    - src/stores/detail-store.ts

key-decisions:
  - "CR-02: affectedIds passa a ser a união dos ids afetados pelo merge de diretório com os ids cujos blockers efetivamente mudaram (comparação por conteúdo via blockersEqual, não por referência) — evita marcar como afetada uma fase cujo array de blockers foi recriado mas tem o mesmo conteúdo"
  - "CR-03: a fase dona de um artefato é derivada do penúltimo segmento do caminho via parsePhaseDirName (já usado em phase-scan.ts), não de um novo parser — reaproveita a mesma regra de nome de diretório de fase em todo o codebase"

requirements-completed: [BOARD-03, BOARD-04, BOARD-05, BOARD-06]

coverage:
  - id: D1
    description: "reprocessPaths reaplica o filtro de blockers a TODAS as fases (não só as varridas pelo lote) sempre que STATE.md muda no mesmo lote de debounce"
    requirement: "BOARD-03"
    verification:
      - kind: unit
        ref: "src/planning/watch.test.ts#reprocessPaths — lote concorrente STATE.md (novo blocker) + diretório de outra fase (CR-02) > aplica o blocker novo à fase 5 mesmo quando só a fase 01 foi varrida no mesmo lote"
        status: pass
    human_judgment: false
  - id: D2
    description: "cache artifactContent do detail-store é invalidado por fase dona quando recentlyUpdatedPhaseIds muda; uma fase não afetada permanece cacheada"
    requirement: "BOARD-06"
    verification:
      - kind: unit
        ref: "src/stores/detail-store.test.ts#loadArtifact — invalidação do cache quando a fase dona é reprocessada (CR-03) > descarta artifactContent[path]..."
        status: pass
      - kind: unit
        ref: "src/stores/detail-store.test.ts#loadArtifact — invalidação do cache quando a fase dona é reprocessada (CR-03) > um artefato de uma fase NÃO afetada permanece cacheado..."
        status: pass
    human_judgment: false

# Metrics
duration: 22min
completed: 2026-07-23
status: complete
---

# Phase 01 Plan 07: Fechamento de gaps CR-02/CR-03 (badges de blocker e cache de artefato obsoletos) Summary

**`reprocessPaths` reaplica blockers a todas as fases em lote concorrente e o cache de conteúdo de artefato invalida por fase dona — ambos travados por testes que falhavam antes da correção.**

## Performance

- **Duration:** 22 min
- **Completed:** 2026-07-23T10:14:30Z
- **Tasks:** 2
- **Files modified:** 4 (1 criado, 3 modificados)

## Accomplishments
- CR-02 fechado: um blocker novo em STATE.md (ex.: `[Phase 5]: ...`) agora alcança o badge da fase 5 mesmo quando o mesmo lote de debounce só varreu o diretório da fase 01 — o bloco de reaplicação de blockers deixou de ser `else if` (mutuamente exclusivo com o merge de diretório) e passou a ser um `if` independente
- CR-03 fechado: `detail-store.ts` agora rastreia a fase dona de cada artefato cacheado (`artifactPhaseId`) e descarta a entrada de `artifactContent` correspondente quando essa fase aparece em `recentlyUpdatedPhaseIds` — reabrir o modal relê do disco em vez de mostrar conteúdo obsoleto
- Ambos os gaps têm um teste de regressão que reproduz o cenário exato descrito em `01-VERIFICATION.md`/`01-REVIEW.md`, confirmado FALHANDO contra o código pré-correção antes de qualquer fix ser aplicado

## Task Commits

Each task was committed atomically:

1. **Task 1: Corrigir badges de bloqueio obsoletos em lote concorrente (CR-02)** - `29bcf50` (fix)
2. **Task 2: Invalidar o cache de conteúdo de artefato quando a fase muda (CR-03)** - `8ec90df` (fix)

_Nota: ambas as tasks eram `tdd="true"` mas o teste e a correção foram commitados juntos em um único commit `fix` por task (o RED foi observado e registrado abaixo, não commitado isoladamente) — o teste novo e a correção do bug vivem na mesma mudança lógica, seguindo o padrão de "teste de regressão + fix" já usado nos commits anteriores da fase, em vez do ciclo test→feat→refactor de uma feature nova._

## RED Observations (confirmadas antes da correção)

### Task 1 — CR-02

Rodando `npx vitest run src/planning/watch.test.ts -t "CR-02"` contra o `board-store.ts` **pré-correção** (branch `else if (blockersChanged)`, mutuamente exclusivo com o merge de diretório):

```
AssertionError: expected false to be true
❯ src/planning/watch.test.ts:253:76
  expect(phase5?.blockers.some((blocker) => blocker.phases.includes(5))).toBe(true);
```

A fase 5 não recebia o blocker novo porque `phaseNumbers.size > 0` (fase 01 varrida no lote) desviava para o branch `if (phaseNumbers.size > 0 && !roadmapRebuilt)`, e o `else if (blockersChanged)` nunca rodava — exatamente o gap descrito em `01-VERIFICATION.md`/CR-02.

### Task 2 — CR-03

Rodando `npx vitest run src/stores/detail-store.test.ts` contra o `detail-store.ts` **pré-correção** (sem `artifactPhaseId`, sem invalidação de `artifactContent` na subscription):

```
AssertionError: expected { kind: 'ok', value: '# Conteúdo v1' } to be undefined
❯ src/stores/detail-store.test.ts:63:69
  expect(useDetailStore.getState().artifactContent[PHASE01_PATH]).toBeUndefined();
```

O cache de `artifactContent` nunca era descartado — `recentlyUpdatedPhaseIds` mudando para incluir a fase do artefato não tinha efeito nenhum sobre o conteúdo cacheado, exatamente o gap descrito em `01-VERIFICATION.md`/CR-03.

## Files Created/Modified
- `src/stores/board-store.ts` - `reprocessPaths`: bloco `if (blockersChanged)` independente (não mais `else if`), reaplica o filtro de blockers à lista COMPLETA de fases; nova função `blockersEqual` para detectar quais fases mudaram de blocker por conteúdo (não por referência) e unir seus ids a `affectedIds`
- `src/planning/watch.test.ts` - novo `describe` com o teste de regressão do lote concorrente STATE.md (blocker citando fase 5) + diretório da fase 01
- `src/stores/detail-store.ts` - novo campo de estado `artifactPhaseId: Record<string, string>` (mapa companheiro de `artifactContent`); `loadArtifact` grava a fase dona derivada do caminho via `parsePhaseDirName`; a subscription a `recentlyUpdatedPhaseIds` (já existente para `treeByPhaseId`) passa a também descartar as entradas de `artifactContent`/`artifactPhaseId` cuja fase dona está na lista de fases afetadas
- `src/stores/detail-store.test.ts` (novo arquivo) - 3 testes: cache básico por caminho, invalidação escopada por fase quando `recentlyUpdatedPhaseIds` muda (com releitura subsequente confirmando conteúdo novo), e preservação do cache de uma fase NÃO afetada

## Decisions Made
- CR-02: `affectedIds` agora é a união (via `Set`) dos ids do merge de diretório com os ids cujos blockers mudaram de conteúdo (`blockersEqual` compara por valor, não por referência de array) — evita falso positivo de glow numa fase cujo array de blockers foi recriado mas tem exatamente o mesmo conteúdo de antes
- CR-03: a fase dona de um artefato é derivada do penúltimo segmento do caminho (`.../phases/<numero>-<slug>/<arquivo>`) reaproveitando `parsePhaseDirName` já importado em `detail-store.ts` — nenhum parser novo, mesma regra de nome de diretório usada em `phase-scan.ts`

## Deviations from Plan

None - plan executed exactly as written. Ambas as tasks seguiram o padrão RED→fix→GREEN descrito no plano, reaproveitando os patches de referência de `01-REVIEW.md` (CR-02/CR-03) sem alterações estruturais.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

`01-08-PLAN.md` (CR-01: CI nunca roda `cargo test`) segue independente deste plano — nenhuma dependência entre eles. Com CR-02 e CR-03 fechados, os Success Criteria #4 e #5 do ROADMAP (badge de bloqueio e conteúdo de artefato nunca obsoletos) passam de PARCIAL para satisfeitos, restando apenas a verificação humana end-to-end (janela Tauri nativa) já deferida para o fim da fase em `01-VERIFICATION.md`.

---
*Phase: 01-espelho-fiel*
*Completed: 2026-07-23*

## Self-Check: PASSED

All files created/modified exist on disk; both task commits (`29bcf50`, `8ec90df`) found in git log.
