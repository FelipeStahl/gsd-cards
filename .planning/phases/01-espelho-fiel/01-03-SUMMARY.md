---
phase: 01-espelho-fiel
plan: 03
subsystem: board
tags: [zustand, remark-parse, gray-matter, react, class-variance-authority, i18next, vitest]

# Dependency graph
requires:
  - phase: 01-02
    provides: "ParseResult<T> contract, validate_project_root gate, src/planning/read.ts, board-store.ts pre-declared phases/milestones/sync slots, D-04 layout skeleton"
provides:
  - "status.ts — pure disk_status/badge/column derivation rule replicated literally from gsd-core's init.cjs (Pattern 1), independent of Tauri"
  - "phase-scan.ts — real filesystem scan of .planning/phases/ producing PhaseDirSignals per phase, D-15 localized failure"
  - "parser/roadmap.ts — AST-based ROADMAP.md parser (phases, goal, requirements, success criteria, phase order)"
  - "board-store.ts openProject now builds PhaseModel[] by merging ROADMAP.md with the real phase-scan, exposing selectPhasesByColumn/selectColumnCounts"
  - "ui-store.ts — selectedPhaseId/openArtifactPath + selectPhase/clearSelection/openArtifact/closeArtifact, complete for Plan 05 to consume unmodified"
  - "Board/BoardColumn/PhaseCard/StatusBadge components — the real 4-column kanban board replacing the Plan 02 'coming soon' placeholder"
  - "board.json i18n namespace (pt-BR/en, full key parity)"
affects: [01-04, 01-05, 01-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "status.ts is a pure function module — no filesystem/Tauri imports — so the product's central status-derivation rule is testable without a running app"
    - "phase-scan.ts tests mock @tauri-apps/plugin-fs by delegating to node:fs/promises against a real fixture tree (src/planning/__fixtures__/phases/), instead of fabricating in-memory directory listings"
    - "ROADMAP.md fields (Goal/Mode/Depends on/Requirements/Success Criteria) are NOT one-paragraph-per-field in the real gsd-core template — they're soft-line-broken within a single mdast paragraph node; the parser splits paragraph text by newline and matches each line independently"
    - "class-variance-authority selects real CSS classes (added to theme.css) rather than paired with Tailwind utility classes, consistent with the project's established inline-style + CSS custom property convention"

key-files:
  created:
    - src/planning/status.ts
    - src/planning/status.test.ts
    - src/planning/phase-scan.ts
    - src/planning/phase-scan.test.ts
    - src/planning/parser/roadmap.ts
    - src/planning/parser/roadmap.test.ts
    - src/planning/__fixtures__/roadmap/healthy-ROADMAP.md
    - src/planning/__fixtures__/phases/README.md
    - src/planning/__fixtures__/phases/10-apenas-contexto/10-CONTEXT.md
    - src/planning/__fixtures__/phases/11-contexto-mais-pesquisa/11-CONTEXT.md
    - src/planning/__fixtures__/phases/11-contexto-mais-pesquisa/11-RESEARCH.md
    - src/planning/__fixtures__/phases/12-planos-sem-summary/12-01-PLAN.md
    - src/planning/__fixtures__/phases/12-planos-sem-summary/12-02-PLAN.md
    - src/planning/__fixtures__/phases/13-summary-parcial/13-01-PLAN.md
    - src/planning/__fixtures__/phases/13-summary-parcial/13-02-PLAN.md
    - src/planning/__fixtures__/phases/13-summary-parcial/13-03-PLAN.md
    - src/planning/__fixtures__/phases/13-summary-parcial/13-01-SUMMARY.md
    - src/planning/__fixtures__/phases/14-executada-sem-verificacao/14-01-PLAN.md
    - src/planning/__fixtures__/phases/14-executada-sem-verificacao/14-02-PLAN.md
    - src/planning/__fixtures__/phases/14-executada-sem-verificacao/14-01-SUMMARY.md
    - src/planning/__fixtures__/phases/14-executada-sem-verificacao/14-02-SUMMARY.md
    - src/planning/__fixtures__/phases/14-executada-sem-verificacao/14-VERIFICATION.md
    - src/planning/__fixtures__/phases/15-verificada/15-01-PLAN.md
    - src/planning/__fixtures__/phases/15-verificada/15-02-PLAN.md
    - src/planning/__fixtures__/phases/15-verificada/15-01-SUMMARY.md
    - src/planning/__fixtures__/phases/15-verificada/15-02-SUMMARY.md
    - src/planning/__fixtures__/phases/15-verificada/15-VERIFICATION.md
    - src/planning/__fixtures__/phases/16-contexto-com-ruido/16-CONTEXT.md
    - src/planning/__fixtures__/phases/16-contexto-com-ruido/16-RESEARCH.md
    - src/planning/__fixtures__/phases/16-contexto-com-ruido/16-UI-SPEC.md
    - src/planning/__fixtures__/phases/16-contexto-com-ruido/16-VALIDATION.md
    - src/planning/__fixtures__/phases/16-contexto-com-ruido/16-DISCUSSION-LOG.md
    - src/planning/__fixtures__/phases/16-contexto-com-ruido/16-01-PLAN.md
    - src/stores/ui-store.ts
    - src/shell/Board.tsx
    - src/shell/Board.test.tsx
    - src/components/BoardColumn.tsx
    - src/components/PhaseCard.tsx
    - src/components/PhaseCard.test.tsx
    - src/components/StatusBadge.tsx
    - src/locales/pt-BR/board.json
    - src/locales/en/board.json
  modified:
    - src/planning/read.ts
    - src/planning/model.ts
    - src/stores/board-store.ts
    - src/shell/AppShell.tsx
    - src/shell/Header.tsx
    - src/i18n.ts
    - src/styles/theme.css
    - src-tauri/capabilities/default.json
    - tsconfig.json

key-decisions:
  - "researched and discussed disk_status values collapse into the same 'discutida' badge (locked decision from the plan, resolves Open Question #1 of 01-RESEARCH.md) — the distinction is preserved in DiskStatus, only the badge presentation collapses"
  - "toBoardColumn(badge, lastKnownColumn) keeps the last known column when badge is 'unknown' instead of defaulting to 'todo' — a localized parse failure on one artifact should never visually demote a phase that was previously known to be further along (D-15 spirit, stricter than the plan's literal text)"
  - "A phase present in ROADMAP.md but with no matching directory on disk gets dirExists:false (badge pending) instead of being omitted from the board; a phase found on disk but absent from ROADMAP.md (e.g. roadmap unreadable) is still rendered, named from its directory slug — the board never silently drops a phase due to one side of the merge being incomplete"
  - "phase-scan.test.ts and the ad-hoc roadmap fixtures use real files (either the synthetic __fixtures__/phases/ tree, or a full copy of this repo's actual ROADMAP.md) read via node:fs/promises mocked in for @tauri-apps/plugin-fs, rather than in-memory fabricated directory listings for every test, per the plan's fixture-generation instruction"

patterns-established:
  - "Pure derivation logic (status.ts) is kept strictly separate from I/O (phase-scan.ts) — the plan's own structural rule, verified in status.ts's acceptance criteria (grep for @tauri-apps returns 0)"
  - "CVA variant props select real CSS classes added to theme.css rather than Tailwind utility classes, matching the project's inline-style convention established in Plan 01/02"

requirements-completed: [BOARD-01, BOARD-04]

coverage:
  - id: D1
    description: "status.ts replicates gsd-core's disk_status/badge/column derivation rule literally, as a pure function covering all 8 disk_status values, 7 badges, 4 columns, and the plan's required edge cases (gaps_found/missing never promote to complete, summaryCount > planCount still counts as executed, isActive heuristic)"
    requirement: "BOARD-01"
    verification:
      - kind: unit
        ref: "src/planning/status.test.ts — 34 tests, vitest run exit 0"
        status: pass
      - kind: other
        ref: "grep -c '@tauri-apps' src/planning/status.ts returns 0 (pure function, no I/O)"
        status: pass
    human_judgment: false
  - id: D2
    description: "phase-scan.ts scans real phase directories producing correct PhaseDirSignals for every disk_status transition, including artifacts that look like a plan/summary but aren't (UI-SPEC/VALIDATION/DISCUSSION-LOG never counted); parser/roadmap.ts extracts 5 phases from this repo's real ROADMAP.md with phase 1's exact 7 requirements, without heading-regex hand-rolling"
    requirement: "BOARD-01"
    verification:
      - kind: unit
        ref: "src/planning/phase-scan.test.ts (17 tests) + src/planning/parser/roadmap.test.ts (11 tests) — vitest run exit 0, both against real fixture files on disk"
        status: pass
      - kind: other
        ref: "Ad-hoc scratch verification (deleted after use, not committed): scanAllPhases + parseRoadmap run directly against this repo's own .planning/ — 5 roadmap phases parsed correctly (names, requirementIds), phase 1's real directory scanned correctly (planCount 6, summaryCount 2 pre-commit, hasContext/hasResearch true, verificationStatus missing since no VERIFICATION.md exists yet)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Board renders all phases from a project's PhaseModel[] grouped into the 4 D-05 columns with the exact status badge always visible (D-06); an executed-but-unverified phase stays in 'Em execução' and is never present in 'Concluída'; a decimal/inserted phase shows the neutral 'inserida' badge; clicking a card calls ui-store's selectPhase with the correct id; header column counters mirror the board's column groupings"
    requirement: "BOARD-04"
    verification:
      - kind: unit
        ref: "src/components/PhaseCard.test.tsx (11 tests: all 7 badges, blocked badge, inserted badge, click->selectPhase, parseWarning override) + src/shell/Board.test.tsx (6 tests: 4-way column placement, executed-never-done, empty column) — vitest run exit 0, 17 tests total (required: >=12)"
        status: pass
      - kind: other
        ref: "npm run typecheck (tsc --noEmit) exits 0"
        status: pass
      - kind: other
        ref: "grep checks for selectPhasesByColumn/highlighted/parseWarning/useUiStore/openArtifact/selectPhase across Board.tsx/PhaseCard.tsx/ui-store.ts, and all 7 pt-BR status labels + column.empty/history.empty/detail.viewArtifact/card.parseError.tooltip in board.json, plus pt-BR/en key parity — all pass"
        status: pass
    human_judgment: false
  - id: D4
    description: "End-to-end visual verification: npm run tauri dev shows the real 5 phases of this repository placed in the correct columns with exact badges, phase 1's blocked badge visible, header counters matching column counts"
    verification: []
    human_judgment: true
    rationale: "Requires driving a real native Tauri window — not automatable from this shell. Deferred to end-of-phase per .planning/config.json workflow.human_verify_mode: 'end-of-phase', same precedent as Plan 02's D4. The underlying data pipeline (ROADMAP.md parse + phase directory scan + merge) was independently verified against this repo's actual .planning/ via an ad-hoc test (see D2), giving high confidence the visual result will match without needing the native window for this step."

duration: 55min
completed: 2026-07-23
status: complete
---

# Phase 01 Plan 03: Board Kanban de 4 Colunas Summary

**The literal gsd-core disk_status derivation rule, a real filesystem phase scanner, an AST-based ROADMAP.md parser, and the dense 4-column kanban board that merges them into the product's actual "espelho fiel" — replacing Plan 02's static placeholder with real phase cards.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3 (all complete, no checkpoints)
- **Files modified:** 39 created, 9 modified

## Accomplishments

- `status.ts` codifies the gsd-core status-derivation rule (`buildPhaseCompletionProjection`/`cmdInitManager` from `init.cjs`, documented in `01-RESEARCH.md` Pattern 1) as a pure, Tauri-free TypeScript function — `deriveDiskStatus`/`toBoardBadge`/`toBoardColumn` — with 34 tests covering all 8 `disk_status` values, all 7 badges, all 4 columns, and every edge case the plan required (an `executed` phase with `gaps_found`/`missing` verification never becomes `complete`; `summaryCount > planCount` still counts as fully executed; the `researched`/`discussed` collapse into one badge is the locked decision resolving the research's Open Question #1)
- `phase-scan.ts` + `parser/roadmap.ts` turn real `.planning/` filesystem state into structured signals: `scanPhaseDir`/`scanAllPhases` scan real phase directories (tested against a 7-directory synthetic fixture tree under `src/planning/__fixtures__/phases/`, documented in its `README.md`), correctly distinguishing real `PLAN.md`/`SUMMARY.md` files from lookalikes (`UI-SPEC.md`, `VALIDATION.md`, `DISCUSSION-LOG.md`); `parseRoadmap` walks the `remark-parse` AST (never heading-regex) to extract phase number/name/goal/mode/dependsOn/requirementIds/successCriteria/phaseOrder, verified against a full copy of this repo's actual `ROADMAP.md`
- `board-store.ts`'s `openProject` now builds real `PhaseModel[]` by merging ROADMAP.md phases with the real disk scan — a phase in the roadmap without a directory still renders (`dirExists: false` → `pending`), and a phase found on disk but missing from the roadmap also still renders (named from its directory slug) — the board never silently drops a phase
- `ui-store.ts` ships complete: `selectedPhaseId`/`openArtifactPath` + `selectPhase`/`clearSelection`/`openArtifact`/`closeArtifact` — Plan 05 consumes this without editing the file
- `Board`/`BoardColumn`/`PhaseCard`/`StatusBadge` render the actual 4-column kanban (D-05) with the exact status badge always visible (D-06), the dense card anatomy from `01-UI-SPEC.md` (D-09: name+inserted badge, status+blocked badge, plan progress bar, requirement count), the D-13 hover border + update-glow CSS, and the D-07 neutral "inserida" badge for decimal phases
- Header's column-counters slot (reserved in Plan 02) is now filled with live counts from `selectColumnCounts`
- `board.json` i18n namespace ships with full pt-BR/en parity, including every key Plans 05/06 will need, per the plan's single-owner-file strategy
- Ad-hoc end-to-end verification (not committed) confirmed the whole pipeline works against this repo's own real `.planning/`: 5 roadmap phases parsed correctly with exact requirement lists, and Phase 1's real directory scanned correctly (6 plans, 2 summaries pre-commit, no VERIFICATION.md yet — correctly resulting in `partial` → `executing` badge/column, and its two `[Phase 1]`/`[Phase 1/4]` blockers correctly attached)

## Task Commits

Each task was committed atomically:

1. **Task 1: Regra de derivação de status replicada do gsd-core** — RED `e47c9fc` (test), GREEN `da23d19` (feat)
2. **Task 2: Varredura do diretório de fases e parser de ROADMAP.md** - `4606b3b` (feat)
3. **Task 3: Board de 4 colunas com cards de fase densos** - `47ed59b` (feat)

**Plan metadata:** _pending — created after this SUMMARY, in the final commit step_

## Files Created/Modified

- `src/planning/status.ts` / `status.test.ts` - pure disk_status/badge/column derivation, 34 tests
- `src/planning/phase-scan.ts` / `phase-scan.test.ts` - real directory scan, 17 tests against real fixture files
- `src/planning/parser/roadmap.ts` / `roadmap.test.ts` - AST-based ROADMAP.md parser, 11 tests against a real ROADMAP.md copy
- `src/planning/__fixtures__/roadmap/healthy-ROADMAP.md` - literal copy of this repo's own ROADMAP.md
- `src/planning/__fixtures__/phases/**` (7 synthetic phase directories + README.md) - covers every disk_status transition, including the noise-file trap
- `src/planning/read.ts` - added `statPlanningPath` (mtime for `isActive` signal)
- `src/planning/model.ts` - `PhaseModel` extended with diskStatus/badge/column/planCount/summaryCount/requirementIds/isInserted/blockers/issues
- `src/stores/board-store.ts` - `openProject` merges ROADMAP.md + phase-scan into `PhaseModel[]`; exports `selectPhasesByColumn`/`selectColumnCounts`
- `src/stores/ui-store.ts` - selection/artifact state for Plan 05
- `src/shell/Board.tsx` / `Board.test.tsx` - 4-column board, 6 tests
- `src/shell/AppShell.tsx` - renders `<Board />` instead of the Plan 02 placeholder text
- `src/shell/Header.tsx` - column-counters slot filled
- `src/components/BoardColumn.tsx` / `PhaseCard.tsx` / `PhaseCard.test.tsx` / `StatusBadge.tsx` - dense card + column components, 11 tests
- `src/locales/pt-BR/board.json` / `en/board.json` - full `board.*` namespace
- `src/i18n.ts` - registers `board` namespace
- `src/styles/theme.css` - `.status-dot*`/`.phase-card*` CSS classes (CVA variants + D-13 glow-fade animation)
- `src-tauri/capabilities/default.json` - added `fs:allow-stat`
- `tsconfig.json` - added `"types": ["node"]`

## Decisions Made

- `researched`/`discussed` collapse into the same "discutida" badge (locked decision, resolves Open Question #1 of `01-RESEARCH.md`) — both fall in the same "Preparando" column regardless, so a 7th badge would spend visual budget without changing any actionable information
- `toBoardColumn`'s `unknown` badge keeps the last known column instead of defaulting to "A fazer" — a localized parse failure on one artifact should never visually demote a phase, going slightly stricter than the plan's literal wording in service of D-15's intent
- The board never drops a phase due to one side of the ROADMAP/disk merge being incomplete — both directions degrade gracefully (roadmap-only phase → `pending`; disk-only phase → named from its slug)
- Test fixtures for `phase-scan.ts` and `roadmap.ts` are real files on disk (a 7-directory synthetic tree, and a literal copy of this repo's `ROADMAP.md`), read via `node:fs/promises` mocked in place of `@tauri-apps/plugin-fs`, rather than fabricated in-memory listings — matches the plan's explicit fixture-generation instruction and gives higher-fidelity tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `fs:allow-stat` capability + `read.ts#statPlanningPath`**
- **Found during:** Task 2 (implementing the `isActive` mtime signal from `PhaseDirSignals`)
- **Issue:** The plan's `01-RESEARCH.md` Code Example for `PhaseDirSignals.isActive` requires file mtime, but neither the plan's file list nor the existing capability allowlist included a way to read it — `@tauri-apps/plugin-fs`'s `stat()` needs its own permission
- **Fix:** Added `fs:allow-stat` (read-only, no new write/broaden-scope surface) to `capabilities/default.json`; added `statPlanningPath` to `read.ts` following the existing wrapper pattern
- **Files modified:** src-tauri/capabilities/default.json, src/planning/read.ts
- **Verification:** `phase-scan.test.ts`'s isActive tests pass; `npm run typecheck` exits 0
- **Committed in:** `4606b3b` (Task 2 commit)

**2. [Rule 3 - Blocking] Added `tsconfig.json` `"types": ["node"]`**
- **Found during:** Task 2 (`npm run typecheck` after writing `phase-scan.test.ts`)
- **Issue:** `phase-scan.test.ts` mocks `@tauri-apps/plugin-fs` by delegating to `node:fs/promises` against the real fixture tree (per the plan's fixture-generation instruction) — without an explicit `"types": ["node"]`, `tsgo` (TypeScript 7's native compiler) failed to resolve the `node:` prefixed import specifiers (`TS2591: Cannot find name 'node:url'`), even though `@types/node` was already an installed devDependency
- **Fix:** Added `"types": ["node"]` to `tsconfig.json`'s `compilerOptions`
- **Files modified:** tsconfig.json
- **Verification:** `npm run typecheck` exits 0
- **Committed in:** `4606b3b` (Task 2 commit)

**3. [Rule 2 - Missing Critical] Added `.status-dot`/`.phase-card` CSS classes to `theme.css`**
- **Found during:** Task 3 (implementing `StatusBadge`'s `class-variance-authority` variants and `PhaseCard`'s D-13 hover/glow states)
- **Issue:** The plan explicitly requires CVA-driven variants for the status dot and a CSS `box-shadow` glow-fade animation for D-13 — neither is expressible through the project's established inline-style-only convention (no component in this codebase used CSS classes before this plan); CVA needs real classes to select between, and a fading `box-shadow` transition needs a CSS `@keyframes` animation, not an inline style
- **Fix:** Added a small, narrowly-scoped block of CSS classes (`.status-dot`, `.status-dot--{neutral,accent,warning,success}`, `.phase-card`, `.phase-card:hover`, `.phase-card--highlighted` + `@keyframes phase-card-glow-fade`) to the existing `theme.css` — all color values still come from the existing design tokens, no new colors introduced
- **Files modified:** src/styles/theme.css
- **Verification:** `PhaseCard.test.tsx`/`Board.test.tsx` pass; visual glow/hover behavior deferred to end-of-phase human verification alongside D4
- **Committed in:** `47ed59b` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 2 missing-critical, 1 Rule 3 blocking)
**Impact on plan:** All three were necessary for the plan's own acceptance criteria and stated behavior (the `isActive` signal the plan's own code example requires; the CVA variants and D-13 glow the plan explicitly specifies) to actually work. No architectural changes, no scope creep.

## Observations on `ACTIVE_WINDOW_MS` (Assumption A3)

`01-RESEARCH.md` flagged the 5-minute `is_active` mtime window as medium risk, asking for an empirical observation during this phase's execution. This plan's own execution took under an hour across all 3 tasks with no long-running single-plan execution to observe against — no evidence either confirming or challenging the 5-minute window surfaced during this plan. Recommend re-checking this assumption during Plan 04 (the watcher plan), which is positioned to observe real execution durations against the running board.

## Issues Encountered

None beyond the three auto-fixes documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `status.ts`/`phase-scan.ts`/`parser/roadmap.ts` are the foundation Plan 04 (watcher) reprocesses against on file-change events, Plan 05 (detail panel) reads directly, and Plan 06 (milestones) extends without needing to touch this plan's files
- `board-store.ts` and `Header.tsx` are the two files Plan 04 is expected to extend (per the phase's downstream note) — both left with clean seams: `openProject`'s merge logic is a private helper (`buildPhaseModels`) Plan 04 can call again on reprocessing, and `recentlyUpdatedPhaseIds`/`sync` were already pre-declared slots this plan didn't need to touch
- `ui-store.ts` and `PhaseCard`'s `highlighted`/`parseWarning` props are ready for Plan 04/05 to drive without modification
- D4 (full native-window visual verification) deferred to end-of-phase per `workflow.human_verify_mode: "end-of-phase"`, consistent with Plan 02's precedent — high confidence given the ad-hoc pipeline verification against this repo's real data (documented under D2 above)
- No blockers for Plan 04

---
*Phase: 01-espelho-fiel*
*Completed: 2026-07-23*

## Self-Check: PASSED

All 17 tracked deliverable files confirmed present on disk; all 4 commit hashes (`e47c9fc`, `da23d19`, `4606b3b`, `47ed59b`) confirmed present in `git log`.
