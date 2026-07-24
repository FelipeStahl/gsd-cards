---
phase: 04-casa-persistente
plan: 03
subsystem: ui
tags: [zustand, immer, multi-project, watcher, i18n, header]

# Dependency graph
requires:
  - phase: 04-casa-persistente
    provides: "04-01's view/setView board-store state + AppShell view === \"home\" branch"
provides:
  - "board-store.ts: openProjectRoots[] + activeProjectRoot, populated by openProject and switchProject"
  - "switchProject(root) — single-watcher re-sync (Pattern 3): stops the one active watcher, re-validates + re-parses the target root via the same code path openProject uses, restarts the watcher, no-ops on same-root, never touches session-store/liveSessions, never calls closeProject"
  - "loadProjectStateModel(root, hasGsdCore) — shared parse helper extracted from openProject, reused by switchProject so both code paths stay identical"
  - "ProjectSwitcherButton — 32x32 ChevronLeft Home control mounted in Header, calls only setView(\"home\")"
  - "common.actions.backToHome i18n key (pt-BR/en)"
affects: [04-04, 04-05, 04-06, 04-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared parse-sequence helper (loadProjectStateModel) extracted so two store actions (openProject, switchProject) that must produce an identical ProjectStateModel never diverge"
    - "Icon-only 32x32 header control with React-state hover tinting (no CSS :hover available with inline-style-only convention)"

key-files:
  created:
    - src/stores/board-store.test.ts
    - src/shell/ProjectSwitcherButton.tsx
    - src/shell/ProjectSwitcherButton.test.tsx
  modified:
    - src/stores/board-store.ts
    - src/shell/Header.tsx
    - src/locales/pt-BR/common.json
    - src/locales/en/common.json

key-decisions:
  - "switchProject does NOT call upsertRecent — the plan's action spec only lists validate/re-parse/watcher-restart steps; bumping lastOpened on every switch-between-already-open-projects was judged out of this plan's scope (not required by any acceptance criterion) rather than added speculatively"
  - "closeProject left completely unchanged, per the plan's explicit instruction — it stays reserved for genuine close; switching never calls it and never will"
  - "recentlyUpdatedPhaseIds is cleared inside switchProject's committing set() (not in the plan's literal action text, but a correctness fix per Rule 1/2: a glow window carried over from the previous project's phase ids would either miss or mis-highlight phases in the newly-active project's board)"

patterns-established:
  - "loadProjectStateModel(root, hasGsdCore): the one function that turns a validated root into a ProjectStateModel (STATE.md + ROADMAP.md + phase-scan) — any future code path needing the same parse (e.g. a background health check) should call this instead of re-deriving it"

requirements-completed: [PROJ-05]

coverage:
  - id: D1
    description: "board-store tracks a set of open project roots (openProjectRoots[]) plus a single activeProjectRoot, populated by openProject"
    requirement: "PROJ-05"
    verification:
      - kind: unit
        ref: "src/stores/board-store.test.ts#openProject — estado multi-projeto (04-03-PLAN.md) > adiciona a raiz a openProjectRoots e define activeProjectRoot"
        status: pass
      - kind: unit
        ref: "src/stores/board-store.test.ts#openProject — estado multi-projeto (04-03-PLAN.md) > abrir a mesma raiz duas vezes não duplica openProjectRoots"
        status: pass
    human_judgment: false
  - id: D2
    description: "switchProject re-syncs the single watcher exactly once for the new root (stop old, start new), sets activeProjectRoot/status/project from a fresh re-parse of the target root, and is a no-op when switching to the already-active root"
    requirement: "PROJ-05"
    verification:
      - kind: unit
        ref: "src/stores/board-store.test.ts#switchProject — re-sync de watcher único (Pattern 3) > para e reinicia o watcher exatamente uma vez para a nova raiz, define activeProjectRoot, e preserva sessões"
        status: pass
      - kind: unit
        ref: "src/stores/board-store.test.ts#switchProject — re-sync de watcher único (Pattern 3) > trocar para a raiz já ativa é no-op — sem reinício de watcher"
        status: pass
    human_judgment: false
  - id: D3
    description: "switchProject never calls closeProject and never touches session-store/liveSessions — no session of any open project dies on a project switch"
    requirement: "PROJ-05"
    verification:
      - kind: unit
        ref: "src/stores/board-store.test.ts#switchProject — re-sync de watcher único (Pattern 3) > para e reinicia o watcher exatamente uma vez para a nova raiz, define activeProjectRoot, e preserva sessões (session-store sessions array asserted unchanged)"
        status: pass
      - kind: unit
        ref: "src/stores/board-store.test.ts#switchProject — re-sync de watcher único (Pattern 3) > nunca chama closeProject — status permanece open e não idle"
        status: pass
    human_judgment: false
  - id: D4
    description: "Header shows a ChevronLeft Home control (32x32, left of the project name) that calls only setView(\"home\") — no session-closing confirmation, no closeProject call"
    requirement: "PROJ-05"
    verification:
      - kind: unit
        ref: "src/shell/ProjectSwitcherButton.test.tsx#ProjectSwitcherButton > clicar chama SÓ setView('home') — nunca closeProject, nunca muta sessões"
        status: pass
      - kind: unit
        ref: "src/shell/AppShell.test.tsx (unchanged, still green) — Header mounts inside the existing board shell tests"
        status: pass
    human_judgment: false
  - id: D5
    description: "common.actions.backToHome i18n key present in both pt-BR and en locales, used as the button's title/aria-label"
    verification:
      - kind: other
        ref: "node -e \"JSON.parse(...common.json)\" exits 0 for both locales; rg backToHome src/locales/{pt-BR,en}/common.json"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-07-24
status: complete
---

# Phase 4 Plan 3: Casa persistente — multi-project state + switchProject Summary

**board-store gains openProjectRoots[]/activeProjectRoot + switchProject(root) (single-watcher re-sync, 04-RESEARCH.md Pattern 3), plus a Header ChevronLeft Home control that never closes a session**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-24T05:03:00Z
- **Completed:** 2026-07-24T05:07:31Z
- **Tasks:** 2 (both executed and committed, no checkpoints in this plan)
- **Files modified:** 7

## Accomplishments
- `board-store.ts` gained `openProjectRoots: string[]` + `activeProjectRoot: string | null`, both populated by `openProject` (dedup upsert) and by the new `switchProject(root)` action
- `switchProject` implements 04-RESEARCH.md's named single-watcher-resync decision (Pattern 3): stops the one active watcher, re-validates the target root (`validateProjectRoot` — T-04-07), re-runs the exact same STATE.md → ROADMAP.md → phase-scan sequence `openProject` uses (extracted into a shared `loadProjectStateModel` helper so the two code paths can never silently diverge), commits it in one `set()`, then restarts the watcher against the new root. Switching to the already-active root is a no-op — no redundant watcher churn.
- `switchProject` never touches `session-store.ts`'s `sessions`/`liveSessions` and never calls `closeProject` (T-04-08) — proven behaviorally in tests, not just by grep: a session pushed into `useSessionStore` before a switch is asserted byte-identical after it.
- Added `ProjectSwitcherButton` — a 32×32 `ChevronLeft` icon button (accent color on hover) mounted left of the project name in `Header.tsx`, calling only `setView("home")`. New `common.actions.backToHome` i18n key in both locales.

## Task Commits

Each task was committed atomically:

1. **Task 1: board-store multi-project state + switchProject (single-watcher re-sync)** - `7facfc1` (feat)
2. **Task 2: Header Home/back control (ProjectSwitcherButton)** - `2fa012a` (feat)

**Plan metadata:** _pending — this commit_ (docs: complete plan)

## Files Created/Modified
- `src/stores/board-store.ts` - `openProjectRoots`/`activeProjectRoot` state, `loadProjectStateModel` shared parse helper (extracted from `openProject`), new `switchProject(root)` action
- `src/stores/board-store.test.ts` - net-new file: proves `openProjectRoots`/`activeProjectRoot` population, the watcher stop/restart sequence, the same-root no-op, and that sessions survive a switch
- `src/shell/ProjectSwitcherButton.tsx` - the `ChevronLeft` 32×32 Home control
- `src/shell/ProjectSwitcherButton.test.tsx` - proves the click is non-destructive (only `view` changes)
- `src/shell/Header.tsx` - mounts `ProjectSwitcherButton` left of the project name
- `src/locales/pt-BR/common.json`, `src/locales/en/common.json` - `actions.backToHome` key

## Decisions Made
- `switchProject` does NOT call `upsertRecent` — the plan's `<action>` text only specifies validate → re-parse → commit → restart-watcher; bumping `lastOpened` on every switch between already-open projects wasn't in any acceptance criterion, so it was left out rather than added speculatively (avoids scope creep on a plan whose reversibility is rated "costly").
- `closeProject` left completely untouched, exactly as the plan instructs — it remains reserved for genuine close.
- `recentlyUpdatedPhaseIds` is cleared inside `switchProject`'s committing `set()` (not explicit in the plan's action text, but a Rule 1/2 correctness fix): without it, a glow window active on the previous project's phase ids would carry over and either miss or mis-highlight phases on the newly-active project's board, since phase ids aren't globally unique across projects.

## Deviations from Plan

None beyond the two documented decisions above (both are additive correctness details, not scope changes) - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `switchProject`/`openProjectRoots`/`activeProjectRoot` are ready for Plan 04-04's home screen (`ProjectCard` grid, PROJ-01/PROJ-06) to drive project switching from a click on any recent card, and for Plan 04-05+'s session-scope filtering (Pitfall 1: `SessionSidebar` filtering `sessions[]` by `activeProjectRoot`) to consume `activeProjectRoot` directly.
- The `ProjectSwitcherButton` mount point in `Header.tsx` is the one place PROJ-05's UI-SPEC contract lives; `SidebarScopeBanner` (the other PROJ-05 UI-SPEC component) is deferred to whichever later plan wires `SessionSidebar`'s per-project filtering, per the Component Inventory in `04-UI-SPEC.md`.
- Manual verification note (deferred, consistent with prior Phase 4 plans' sandboxed-executor caveat): this session has no display to run `npm run tauri dev` — the full click-through (open A, create a session, open B, switch back to A via Home, confirm A's session is still live) is proven at the store/component level by automated tests, not yet observed in a real running window.

---
*Phase: 04-casa-persistente*
*Completed: 2026-07-24*

## Self-Check: PASSED

All created files found on disk (`src/stores/board-store.test.ts`, `src/shell/ProjectSwitcherButton.tsx`, `src/shell/ProjectSwitcherButton.test.tsx`, this SUMMARY). Both task commit hashes (`7facfc1`, `2fa012a`) found in `git log --oneline --all`.
