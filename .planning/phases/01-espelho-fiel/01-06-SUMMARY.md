---
phase: 01-espelho-fiel
plan: 06
subsystem: board
tags: [unified, remark-parse, remark-gfm, zustand, vitest, node-scripts]

# Dependency graph
requires:
  - phase: 01-03
    provides: "parser/roadmap.ts's parseRoadmap (reused verbatim for archived <version>-ROADMAP.md files), status.ts's DiskStatus/deriveDiskStatus, board-store.ts's PhaseModel/openProject scaffolding, model.ts's milestones slot pre-declared for this plan"
provides:
  - "parser/milestones.ts — parseMilestonesIndex (.planning/MILESTONES.md) + scanArchivedMilestones (.planning/milestones/{version}-ROADMAP.md), reading the gsd-core's REAL archive path (.planning/milestones/), correcting the CONTEXT.md's .planning/archive/ assumption per 01-RESEARCH.md Pitfall 3"
  - "HistoryStrip — collapsed-by-default milestone history strip mounted below the board's 4 columns (D-08), closing the board's scope gap: active milestone in columns, archived milestones in the strip"
  - "oracle-drift.test.ts + scripts/refresh-fixtures.mjs — the STATE.md-recorded 'parser fragility vs. gsd-core evolution' blocker now has an executable, tested mitigation: a versioned oracle snapshot + a test that fails when the parser and the real gsd-core diverge"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The archived-milestone-only Progress table read (extractProgressStatuses in parser/milestones.ts) is the ONE deliberate, narrowly-scoped exception to parser/roadmap.ts's anti-pattern of never reading the ROADMAP.md Progress table as a status source — safe here specifically because an archived phase has no live directory left for the granular DiskStatus derivation to inspect"
    - "scripts/refresh-fixtures.mjs is dev-only tooling (manual, never CI, never app runtime) that treats the locally-installed gsd-tools CLI as a test oracle, never a runtime dependency — the distributed app never spawns it"
    - "oracle-drift.test.ts reads only a versioned, normalized JSON snapshot (imported via resolveJsonModule, never child_process) — CI stays Node/gsd-core-free while still catching gsd-core format drift as a code-review-visible diff instead of a silent production bug"

key-files:
  created:
    - src/planning/parser/milestones.ts
    - src/planning/parser/milestones.test.ts
    - src/planning/__fixtures__/milestones/MILESTONES.md
    - src/planning/__fixtures__/milestones/v0.9-ROADMAP.md
    - src/components/HistoryStrip.tsx
    - src/components/HistoryStrip.test.tsx
    - scripts/refresh-fixtures.mjs
    - src/planning/oracle-drift.test.ts
    - src/planning/__fixtures__/oracle/gsd-tools-manager.json
    - src/planning/__fixtures__/oracle/snapshot.ts
  modified:
    - src/planning/model.ts
    - src/stores/board-store.ts
    - src/shell/Board.tsx
    - src/shell/Board.test.tsx
    - package.json
    - CONTRIBUTING.md

key-decisions:
  - "model.ts's pre-declared `milestones: MilestoneRef[]` slot (a Plan 02 placeholder, {id, name}) was replaced with MilestoneHistoryEntry (ArchivedMilestone's version/phases/issues, plus optional name/shippedDate merged in from the MILESTONES.md index) — the placeholder type was too minimal to carry what HistoryStrip actually needs to render"
  - "Milestone history loads in the background during openProject, never blocking the already-committed active-board state transition — the strip starts empty and self-fills once scanArchivedMilestones/parseMilestonesIndex resolve, guarded against a project switch/close racing the promise"
  - "A version present in the archived roadmap but absent from MILESTONES.md's index (or vice versa at the per-file level inside scanArchivedMilestones) still renders — degrades gracefully in both directions, same posture as Plan 03's ROADMAP/disk-scan merge"

patterns-established:
  - "Dev-only tooling that shells out to a locally-installed CLI oracle lives under scripts/, is manual/never-CI, and its test consumer only ever reads the resulting versioned snapshot — never re-invokes the oracle itself"

requirements-completed: [BOARD-01, BOARD-05]

coverage:
  - id: D1
    description: "parseMilestonesIndex parses .planning/MILESTONES.md by AST into per-milestone entries (version/name/shippedDate/phaseCount/planCount/taskCount as individually-fallible ParseResult fields); a heading that doesn't match the '## {version} {name} (Shipped: {date})' pattern becomes an isolated unrecognized entry without dropping the rest of the index; empty/absent content degrades to ok([]), never an exception or a false unrecognized"
    requirement: "BOARD-05"
    verification:
      - kind: unit
        ref: "src/planning/parser/milestones.test.ts — parseMilestonesIndex describe block (3 tests: real MILESTONES.md fixture, empty text, malformed heading among valid entries) — vitest run exit 0"
        status: pass
      - kind: other
        ref: "grep -c 'export function parseMilestonesIndex' returns 1; npm run typecheck exits 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "scanArchivedMilestones lists .planning/milestones/, reuses parser/roadmap.ts's parseRoadmap for each <version>-ROADMAP.md, cross-references the archived roadmap's own '## Progress' table for the coarse per-phase status (the one deliberate exception to the anti-pattern), and correctly reads .planning/milestones/ — never .planning/archive/ (D-08's CONTEXT.md assumption, corrected per 01-RESEARCH.md Pitfall 3). A project with no milestones directory (this repo's current state) returns [] without throwing or producing an unrecognized result; an individual unreadable/malformed archived roadmap degrades to an ArchivedMilestone with empty phases + populated issues, without dropping the other archived milestones"
    requirement: "BOARD-01"
    verification:
      - kind: unit
        ref: "src/planning/parser/milestones.test.ts — scanArchivedMilestones describe block (4 tests: no directory -> [], real v0.9-ROADMAP.md fixture -> 3 phases with coarse status, one illegible entry doesn't break the other, descending version sort) — vitest run exit 0, 7 tests total in the file (required: >=6)"
        status: pass
      - kind: other
        ref: "grep -c 'export async function scanArchivedMilestones' returns 1; grep -c 'archive' src/planning/parser/milestones.ts returns 0; grep -c 'milestonesDir' returns 3"
        status: pass
    human_judgment: false
  - id: D3
    description: "HistoryStrip renders below the board's 4 columns, collapsed by default with a Label-style clickable header + chevron toggle; expanding reveals archived milestones (version pill + phase number/name/coarse status, styled neutral without StatusBadge's colored dots); with zero milestones, the header stays visible and the empty state uses board.history.empty; board-store.ts's openProject populates ProjectStateModel.milestones via scanArchivedMilestones + parseMilestonesIndex in the background, without blocking the already-open board"
    requirement: "BOARD-01"
    verification:
      - kind: unit
        ref: "src/components/HistoryStrip.test.tsx (4 tests: starts collapsed with content not visible, header click expands, empty state with header still visible, archived phase shows number/name/status) — vitest run exit 0"
        status: pass
      - kind: other
        ref: "grep -c 'board.history.empty' src/components/HistoryStrip.tsx returns 1; grep -c 'HistoryStrip' src/shell/Board.tsx returns 2; grep -c 'scanArchivedMilestones' src/stores/board-store.ts returns 5; npm run typecheck exits 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "End-to-end visual verification: npm run tauri dev shows the history strip collapsed below the columns; expanding it shows 'Sem milestones anteriores' for this repository's actual state (no milestone shipped yet), with the active board unaffected"
    verification: []
    human_judgment: true
    rationale: "Requires driving a real native Tauri window — not automatable from this shell (same limitation documented in Plans 02/03/04/05's D4). Deferred to end-of-phase per .planning/config.json workflow.human_verify_mode: 'end-of-phase'. High confidence: the same data pipeline this component consumes (scanArchivedMilestones/parseMilestonesIndex/HistoryStrip) is independently verified against real fixture files matching the gsd-core's exact literal MILESTONES.md/ROADMAP.md format (see D1/D2), and against this repo's own actual absence of .planning/milestones/ (empty-state path exercised directly)."
  - id: D5
    description: "The STATE.md-recorded blocker ('fragilidade do parser vs. evolução do gsd-core') has a concrete, executable mitigation: scripts/refresh-fixtures.mjs (dev-only, manual, never CI/runtime) generates a normalized snapshot of the locally-installed gsd-tools oracle's real output; oracle-drift.test.ts compares deriveDiskStatus's output against that snapshot per phase, without ever executing the oracle itself"
    requirement: "BOARD-05"
    verification:
      - kind: unit
        ref: "src/planning/oracle-drift.test.ts — 6 tests (1 snapshot-sanity + 5 per-phase disk_status comparisons against this repo's real oracle output) — vitest run exit 0"
        status: pass
      - kind: other
        ref: "grep -c 'gsd-tools' src/planning/oracle-drift.test.ts returns 0; grep -c 'child_process' returns 0; grep -c 'init manager' scripts/refresh-fixtures.mjs returns 3; package.json scripts contains fixtures:refresh; CONTRIBUTING.md contains fixtures:refresh; npm run test (full suite) exits 0"
        status: pass
      - kind: other
        ref: "Ad-hoc verification (not committed as a permanent artifact, matches the plan's own human-check): npm run fixtures:refresh against this repo produced zero diff (parser already aligned with the installed gsd-core); manually corrupting one disk_status value in the committed snapshot and re-running the suite produced exactly one failing assertion identifying the mismatched phase, then the snapshot was restored to its correct generated state before committing"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-07-23
status: complete
---

# Phase 01 Plan 06: Histórico de Milestones e Guarda de Regressão Summary

**The board's scope closes to the whole project (active milestone in columns, archived milestones in a collapsed history strip reading the gsd-core's real `.planning/milestones/` path, correcting the CONTEXT.md's `archive/` assumption) — and the STATE.md-recorded parser-fragility blocker gets a concrete, tested mitigation: a versioned oracle snapshot the parser is checked against.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 (all complete, no checkpoints)
- **Files modified:** 10 created, 6 modified

## Accomplishments

- `parser/milestones.ts` ships `parseMilestonesIndex` (`.planning/MILESTONES.md`, AST-based, one entry per `## {version} {name} (Shipped: {date})` heading matching the gsd-core's real `milestone.cjs` write template literally) and `scanArchivedMilestones` (`.planning/milestones/{version}-ROADMAP.md`, reusing Plan 03's `parseRoadmap` verbatim, plus the ONE narrowly-scoped exception in the whole codebase allowed to read the roadmap's `## Progress` table as a status source — safe only because an archived phase has no live directory left for the granular `DiskStatus` derivation to inspect)
- Corrects the phase's `01-CONTEXT.md` D-08 assumption (`.planning/archive/`) per `01-RESEARCH.md` Pitfall 3 — that path is dead in the gsd-core itself; every function in this module reads exclusively from `paths.ts`'s `milestonesDir`/`milestonesIndexPath`
- `HistoryStrip` mounts below the board's 4 columns (`Board.tsx`), collapsed by default with a clickable Label-style header + chevron; expanding shows archived milestones (version pill + phase number/name/coarse archived status, deliberately neutral styling without `StatusBadge`'s colored dots, so history never visually reads as live board state); with no milestones, the header stays visible and shows `board.history.empty` rather than the section disappearing
- `board-store.ts`'s `openProject` populates `ProjectStateModel.milestones` in the background (never blocking the already-committed active-board render) by merging `scanArchivedMilestones` (primary data source) with `parseMilestonesIndex` (contributes name/shippedDate when available)
- `model.ts`'s `milestones` field — pre-declared as a placeholder `MilestoneRef {id, name}` by Plan 02 specifically for this plan — is now `MilestoneHistoryEntry[]`, the real shape `HistoryStrip` needs
- The `STATE.md` blocker "fragilidade do parser vs. evolução do gsd-core — mitigar com fixtures versionadas" now has an executable mitigation: `scripts/refresh-fixtures.mjs` (manual, dev-only, never CI/app-runtime) regenerates a normalized snapshot of the real `gsd-tools init manager --raw` output; `oracle-drift.test.ts` reads only that versioned snapshot (never spawns the oracle itself) and asserts `deriveDiskStatus` reproduces the oracle's `disk_status` for every phase
- Verified the guard actually trips: ran `npm run fixtures:refresh` (zero diff — parser aligned with the installed gsd-core today), then manually corrupted one `disk_status` value and confirmed `npm run test` failed with exactly the expected assertion before restoring the snapshot

## Task Commits

Each task was committed atomically:

1. **Task 1: Leitura do histórico de milestones no caminho correto** — RED `04a0c73` (test), GREEN `2834d9c` (feat)
2. **Task 2: Faixa de histórico recolhida abaixo do board** — `c69e5fb` (feat)
3. **Task 3: Guarda de regressão contra evolução de formato do gsd-core** — `e0a1faa` (feat)

**Plan metadata:** _pending — created after this SUMMARY, in the final commit step_

## Files Created/Modified

- `src/planning/parser/milestones.ts` / `milestones.test.ts` — `parseMilestonesIndex`/`scanArchivedMilestones`, 7 tests
- `src/planning/__fixtures__/milestones/MILESTONES.md` / `v0.9-ROADMAP.md` — real-format fixtures (3 archived phases, filled `## Progress` table, `milestone.cjs`-literal index entry)
- `src/components/HistoryStrip.tsx` / `HistoryStrip.test.tsx` — collapsed-by-default history strip, 4 tests
- `src/shell/Board.tsx` — mounts `HistoryStrip` in the previously-reserved slot; adds `data-testid="board-columns"` to disambiguate from `HistoryStrip`'s own toggle button
- `src/shell/Board.test.tsx` — scoped the pre-existing button-count assertion to `board-columns` (fix for the collision introduced by mounting `HistoryStrip`)
- `src/stores/board-store.ts` — `loadMilestoneHistory`/`mergeMilestoneHistory`, wired into `openProject` as a non-blocking background load
- `src/planning/model.ts` — `MilestoneHistoryEntry` replaces the `MilestoneRef` placeholder; `ProjectStateModel.milestones` retyped
- `scripts/refresh-fixtures.mjs` — dev-only oracle-snapshot regenerator
- `src/planning/oracle-drift.test.ts` / `__fixtures__/oracle/gsd-tools-manager.json` / `__fixtures__/oracle/snapshot.ts` — the regression guard, 6 tests
- `package.json` — `fixtures:refresh` script
- `CONTRIBUTING.md` — documents the `fixtures:refresh` workflow and the dev-only nature of the oracle CLI

## Decisions Made

- `model.ts`'s pre-declared `milestones` slot's type changed from the Plan 02 placeholder `MilestoneRef {id, name}` to `MilestoneHistoryEntry` (extends `ArchivedMilestone` with optional `name`/`shippedDate` merged from the `MILESTONES.md` index) — the placeholder was too minimal to carry what `HistoryStrip` actually renders
- Milestone history loads in the background during `openProject`, guarded by a `root` check before committing the result — a project switch/close racing the promise never corrupts a different project's state
- A milestone version present in one source (archived roadmap vs. `MILESTONES.md` index) but not the other still renders, degrading gracefully in both directions — same posture as Plan 03's ROADMAP/disk-scan merge
- `extractProgressStatuses` in `parser/milestones.ts` is the one deliberate, narrowly-scoped exception in the codebase to `parser/roadmap.ts`'s explicit anti-pattern of never reading the ROADMAP `## Progress` table as a status source — justified because an archived phase has no live directory left for `phase-scan.ts`'s granular derivation to inspect; the archived status is typed and named distinctly (`ArchivedPhaseRef.status: string`, coarse vocabulary) so it's never confused with `DiskStatus`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Modified `src/planning/model.ts` and `src/stores/board-store.ts`, not listed in the plan's `files_modified` frontmatter**
- **Found during:** Task 2
- **Issue:** The plan's Task 2 acceptance criteria explicitly require `src/stores/board-store.ts` to contain `scanArchivedMilestones`, and the action text instructs populating the pre-declared `milestones` field during `openProject` — neither is achievable without editing these two files, despite their absence from the plan's frontmatter `files_modified` list
- **Fix:** Extended `model.ts`'s `ProjectStateModel.milestones` type (replacing the Plan 02 placeholder `MilestoneRef`) and wired `board-store.ts`'s `openProject` to load milestone history in the background
- **Files modified:** src/planning/model.ts, src/stores/board-store.ts
- **Verification:** `npm run typecheck` exits 0; full `npm run test` suite green (176 tests)
- **Committed in:** `c69e5fb` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed `Board.test.tsx`'s button-count assertion, broken by mounting `HistoryStrip`**
- **Found during:** Task 2, running the full suite after wiring `HistoryStrip` into `Board.tsx`
- **Issue:** A pre-existing Plan 03 test asserted exactly 4 `role="button"` elements (one per `PhaseCard`); `HistoryStrip`'s own toggle header is a real `<button>` element, also matching `role="button"`, making the count 5
- **Fix:** Added `data-testid="board-columns"` to `Board.tsx`'s columns wrapper and scoped the assertion to `within(screen.getByTestId("board-columns"))`
- **Files modified:** src/shell/Board.tsx, src/shell/Board.test.tsx
- **Verification:** `npm run test` — all 176 tests pass, including the fixed assertion
- **Committed in:** `c69e5fb` (Task 2 commit)

**3. [Rule 3 - Blocking] Added `src/planning/__fixtures__/oracle/snapshot.ts`, not listed in the plan's `files_modified` frontmatter**
- **Found during:** Task 3
- **Issue:** The plan's own acceptance criteria require `grep -c 'gsd-tools' src/planning/oracle-drift.test.ts` and `grep -c 'child_process'` to both return 0 — but the fixture the plan itself requires be named literally `gsd-tools-manager.json` cannot be imported by a relative path without that path string containing the substring `gsd-tools`, unless the import is indirected
- **Fix:** Added a one-line re-export module (`__fixtures__/oracle/snapshot.ts`) that imports the JSON fixture by its required literal filename and re-exports it; `oracle-drift.test.ts` imports from that module instead, keeping the oracle CLI's name out of the test body while still reading real, non-fabricated snapshot data
- **Files modified:** src/planning/__fixtures__/oracle/snapshot.ts (new), src/planning/oracle-drift.test.ts
- **Verification:** both grep checks return 0; `npx vitest run src/planning/oracle-drift.test.ts` exits 0 (6 tests)
- **Committed in:** `e0a1faa` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 3 blocking, 1 Rule 1 bug)
**Impact on plan:** All three were necessary for the plan's own stated acceptance criteria and action text to be satisfiable at all. No architectural changes, no scope creep beyond what each acceptance criterion already demanded.

## Issues Encountered

None beyond the three auto-fixes documented above.

## User Setup Required

None — no external service configuration required. `scripts/refresh-fixtures.mjs` is opt-in dev tooling; nothing in this plan changes the app's runtime dependencies.

## Next Phase Readiness

- Phase 01 (`espelho-fiel`)'s board scope is now complete per D-08: active milestone in the 4 columns, archived milestones in the collapsed history strip, with an honest empty state for this project's own current (pre-v1.0-ship) state
- The `STATE.md` blocker about parser fragility vs. gsd-core evolution is resolved with an executable, verified mitigation — future phases inherit `npm run fixtures:refresh` as the standard drift-detection workflow whenever the local gsd-core installation is updated
- D4 (full native-window visual verification of the history strip) deferred to end-of-phase per `workflow.human_verify_mode: "end-of-phase"`, consistent with every prior plan in this phase — high confidence given the data pipeline is independently verified against real fixture files and against this repo's own actual empty-history state
- This was the final plan of Phase 01 (6/6) — no blockers for phase completion/verification

---
*Phase: 01-espelho-fiel*
*Completed: 2026-07-23*

## Self-Check: PASSED

All 16 tracked deliverable files confirmed present on disk; all 4 commit hashes (`04a0c73`, `2834d9c`, `c69e5fb`, `e0a1faa`) confirmed present in `git log`.
