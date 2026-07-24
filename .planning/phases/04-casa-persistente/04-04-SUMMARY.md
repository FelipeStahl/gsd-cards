---
phase: 04-casa-persistente
plan: 04
subsystem: ui
tags: [react, zustand, class-variance-authority, i18next, tauri-plugin-dialog, tauri-plugin-fs]

# Dependency graph
requires:
  - phase: 04-casa-persistente (04-01)
    provides: "app-store.ts (LazyStore recents), board-store.ts view/setView state, minimal HomeRecents seam"
  - phase: 04-casa-persistente (04-03)
    provides: "openProjectRoots/activeProjectRoot, switchProject, ProjectSwitcherButton (Header 'Home' control)"
provides:
  - "HomeScreen — full 04-UI-SPEC home contract: 56px header (heading + Abrir pasta/Novo projeto GSD CTAs), responsive recents grid, EmptyState with both CTAs"
  - "ProjectCard — lazy per-card health (validateProjectRoot + readPlanningText(statePath) + parseStateFile) with loading/healthy/error variants via class-variance-authority"
  - "removeRecent() in persistence/app-store.ts — powers the error card's 'Remover da lista' action"
  - "CreateProjectFlow — folder picker -> not-empty check -> progress panel -> .planning/ poll -> auto-navigate"
  - "createProjectSession(rawFolder) in session-store.ts — the raw-folder parallel spawn entry point (04-RESEARCH Pattern 2), never validated, spawns PTY directly and injects /gsd-new-project"
affects: [04-05, 04-06, 04-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "cva-based card variant classification (loading/healthy/error) — second use of class-variance-authority in the codebase after statusDotVariants, this time to gate whether the .phase-card hover-accent class applies (only the clickable 'healthy' variant gets it)"
    - "Soft, non-blocking overlay (pointerEvents: 'none' on the fixed backdrop wrapper, pointerEvents: 'auto' only on the inner panel) — distinct from ConfirmDialog/CommandPalette's pointer-blocking backdrop, used for CreateProjectFlow per 04-UI-SPEC's 'never blocks interaction underneath' requirement"
    - "Lazy per-item health resolution scoped to one grid cell — ProjectCard reuses openProject's exact validate+read+parse sequence but scoped to a single recent, cancel-guarded via a boolean ref in useEffect cleanup"

key-files:
  created:
    - src/components/home/HomeScreen.tsx
    - src/components/home/HomeScreen.test.tsx
    - src/components/home/ProjectCard.tsx
    - src/components/home/ProjectCard.test.tsx
    - src/components/home/CreateProjectFlow.tsx
  modified:
    - src/shell/AppShell.tsx
    - src/shell/AppShell.test.tsx
    - src/stores/session-store.ts
    - src/stores/session-store.test.ts
    - src/persistence/app-store.ts
    - src/persistence/app-store.test.ts
    - src/locales/pt-BR/home.json
    - src/locales/en/home.json

key-decisions:
  - "createProjectSession spawns the PTY directly (calls spawnSession itself) instead of following createSession's lazy-spawn-on-TerminalView-mount pattern — no TerminalView ever mounts while view === 'home' (HomeScreen replaces the entire shell), so there is no later mount point to defer the spawn to."
  - "ProjectCard treats parseStateFile's overall 'unrecognized' result (malformed frontmatter YAML) as the error variant, same as a validateProjectRoot/read rejection — both degrade to the same non-clickable error card rather than distinguishing 'moved/deleted' from 'unparseable STATE.md' at the UI layer."
  - "removeRecent() added to app-store.ts (Rule 2 — missing critical functionality): the plan's Task 2 action text explicitly specifies the error card's 'Remover da lista' action removes the entry via app-store, but app-store.ts (04-01) only ever exposed upsertRecent/getRecents. Added the missing function plus two new app-store.test.ts cases (removes only the matching root; idempotent no-op on an unknown root)."
  - "AppShell.test.tsx's home-view integration test (from 04-01) mocked ProjectCard rather than being rewritten to drive the real lazy-health pipeline — ProjectCard already has its own dedicated suite covering validate/read/parse and all three variants; the AppShell-level test now proves only AppShell's own responsibility (home replaces the whole shell, click routes through openProject + setView)."

patterns-established:
  - "components/home/ as the home-screen component family (HomeScreen, ProjectCard, CreateProjectFlow) — mirrors components/session/'s per-feature subdirectory convention."

requirements-completed: [PROJ-01, PROJ-06, PROJ-03]

coverage:
  - id: D1
    description: "Home renders a responsive recents grid (repeat(auto-fill, minmax(280px,1fr))) ordered by lastOpened desc, or the two-CTA EmptyState when there are zero recents"
    requirement: "PROJ-01"
    verification:
      - kind: unit
        ref: "src/components/home/HomeScreen.test.tsx#zero recentes: renderiza o empty state com as duas CTAs"
        status: pass
      - kind: unit
        ref: "src/components/home/HomeScreen.test.tsx#N recentes: renderiza um card por recente, na ordem recebida (lastOpened desc)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each ProjectCard resolves health (phase, %, blockers) lazily and independently via the existing validateProjectRoot + readPlanningText(statePath) + parseStateFile pipeline"
    requirement: "PROJ-06"
    verification:
      - kind: unit
        ref: "src/components/home/ProjectCard.test.tsx#healthy: mostra nome, fase, progresso e bloqueios quando > 0"
        status: pass
      - kind: unit
        ref: "src/components/home/ProjectCard.test.tsx#healthy com zero bloqueios omite a linha de bloqueios (sem '0 bloqueios' de ruído)"
        status: pass
      - kind: unit
        ref: "src/components/home/ProjectCard.test.tsx#mostra o skeleton de carregamento antes da saúde resolver"
        status: pass
    human_judgment: false
  - id: D3
    description: "A recent whose folder no longer validates (moved/deleted) degrades to a non-clickable error card with 'Remover da lista'/'Tentar novamente', never a crash"
    requirement: "PROJ-06"
    verification:
      - kind: unit
        ref: "src/components/home/ProjectCard.test.tsx#error: validateProjectRoot rejeitando renderiza o card de erro com remover/tentar novamente, sem lançar (grid-safe)"
        status: pass
      - kind: unit
        ref: "src/components/home/ProjectCard.test.tsx#error: 'Remover da lista' chama removeRecent e notifica onRemoved"
        status: pass
      - kind: unit
        ref: "src/components/home/ProjectCard.test.tsx#error: 'Tentar novamente' reexecuta a leitura de saúde"
        status: pass
    human_judgment: false
  - id: D4
    description: "Clicking a healthy card's body calls openProject(root) then switches view to 'board'"
    requirement: "PROJ-01"
    verification:
      - kind: unit
        ref: "src/components/home/ProjectCard.test.tsx#healthy: clicar no corpo do card chama onOpen com o root"
        status: pass
      - kind: unit
        ref: "src/shell/AppShell.test.tsx#view home: renderiza um recente persistido e clicar chama openProject com o root e volta para board"
        status: pass
    human_judgment: false
  - id: D5
    description: "createProjectSession(rawFolder) spawns a session with the raw, unvalidated folder as cwd and injects /gsd-new-project\\r, without calling validateProjectRoot"
    requirement: "PROJ-03"
    verification:
      - kind: unit
        ref: "src/stores/session-store.test.ts#createProjectSession > spawna com a pasta crua como cwd e injeta /gsd-new-project, sem chamar validateProjectRoot"
        status: pass
      - kind: unit
        ref: "src/stores/session-store.test.ts#createProjectSession > chama invoke(register_sessions_scope) com a pasta crua, mas degrada silenciosamente se ele falhar"
        status: pass
    human_judgment: false
  - id: D6
    description: "Choosing a non-empty folder in CreateProjectFlow shows the not-empty error and returns to home without spawning; an empty folder spawns and, once .planning/ appears, auto-navigates to the new project's board"
    verification: []
    human_judgment: true
    rationale: "This is the composed end-to-end sequence flagged as a backstop by 04-UI-SPEC.md ('Create-project in-progress' UI Consideration) — picker -> readDir empty-check -> createProjectSession -> exists(.planning/) poll -> openProject -> setView('board'). Verified via code inspection (rg -n \"notEmpty|planningDir|openProject\" src/components/home/CreateProjectFlow.tsx, all three present) and via createProjectSession's own unit coverage (D5), but no automated test drives CreateProjectFlow's own useEffect end-to-end (it has no dedicated CreateProjectFlow.test.tsx per this plan's files_modified list) — the actual /gsd-new-project run against a real empty folder was never exercised in this sandboxed session. Deferred to human UAT via /gsd-verify-work 4, same disposition as 04-01's tracer checkpoint."
  - id: D7
    description: "No app code writes to .planning/ directly — CreateProjectFlow.tsx and session-store.ts only inject terminal commands / read raw-folder emptiness, never call writeTextFile against .planning/"
    verification:
      - kind: other
        ref: "rg -n \"writeSession|readTextFile|writeTextFile\" src/components/home/CreateProjectFlow.tsx src/stores/session-store.ts (only writeSession matches, no readTextFile/writeTextFile)"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-24
status: complete
---

# Phase 4 Plan 4: Home UI — recents grid + lazy health + create-from-scratch Summary

**Full 04-UI-SPEC home contract shipped: responsive ProjectCard grid with lazy per-card health via class-variance-authority variants, plus a raw-folder createProjectSession spawn path that injects /gsd-new-project and auto-navigates once .planning/ appears**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-24T05:08:48Z (approx., following 04-03's completion timestamp)
- **Completed:** 2026-07-24T05:23:20Z
- **Tasks:** 3 (all executed and committed)
- **Files modified:** 13 (5 created, 8 modified)

## Accomplishments
- `HomeScreen.tsx` replaces 04-01's minimal button-list with the full contract: 56px header (heading + "Abrir pasta"/"Novo projeto GSD" CTAs), a responsive `repeat(auto-fill, minmax(280px, 1fr))` recents grid, and `EmptyState` with both CTAs inline when there are zero recents.
- `ProjectCard.tsx` resolves each recent's health independently and lazily, reusing the exact `validateProjectRoot` + `readPlanningText(statePath)` + `parseStateFile` sequence already proven by `openProject` — three variants (loading skeleton reusing `.status-dot--pulse` timing, healthy with phase/progress/blockers, non-clickable error with remove/retry) classified via `class-variance-authority`.
- `CreateProjectFlow.tsx` + `session-store.ts`'s new `createProjectSession(rawFolder)` implement PROJ-03 end to end: OS-native folder picker → non-empty check (`readDir`) → progress panel → raw-folder session spawn + `/gsd-new-project\r` injection → `.planning/` appearance poll → `openProject` + `setView("board")` auto-navigate.
- `removeRecent()` added to `app-store.ts` (deviation, see below) so the error card's "Remover da lista" action actually persists the removal, not just renders the button.

## Task Commits

Each task was committed atomically:

1. **Task 1: HomeScreen — recents grid, header CTAs, empty state; AppShell home branch** - `5b3ba60` (feat)
2. **Task 2: ProjectCard — lazy per-card health with loading/healthy/error variants** - `d63c2e1` (feat)
3. **Task 3: CreateProjectFlow + createProjectSession (PROJ-03)** - `7ae6c28` (feat)

**Plan metadata:** _pending — this commit_ (docs: complete plan)

## Files Created/Modified
- `src/components/home/HomeScreen.tsx` - Home view: header CTAs + recents grid + empty state, replaces 04-01's `HomeRecents`
- `src/components/home/HomeScreen.test.tsx` - zero/N-recents rendering, order, CreateProjectFlow open-on-click
- `src/components/home/ProjectCard.tsx` - per-recent card, lazy health via `class-variance-authority` variants
- `src/components/home/ProjectCard.test.tsx` - loading/healthy/error variants, blocker-row omission, remove/retry, click-to-open
- `src/components/home/CreateProjectFlow.tsx` - picker → not-empty check → progress panel → `.planning/` poll → auto-navigate
- `src/shell/AppShell.tsx` - `view === "home"` branch now renders `<HomeScreen />` instead of the inline `HomeRecents`
- `src/shell/AppShell.test.tsx` - home-view test updated to mock `ProjectCard` (own dedicated suite covers its internals)
- `src/stores/session-store.ts` - `createProjectSession(rawFolder)` — raw-folder session spawn + `/gsd-new-project` injection
- `src/stores/session-store.test.ts` - `createProjectSession` coverage (spawn args, scope registration failure tolerance, activity wiring)
- `src/persistence/app-store.ts` - `removeRecent(root)` (deviation — see below)
- `src/persistence/app-store.test.ts` - `removeRecent` coverage
- `src/locales/pt-BR/home.json`, `src/locales/en/home.json` - full Copywriting Contract (actions/empty/card/create keys)

## Decisions Made
- `createProjectSession` spawns the PTY directly (calls `spawnSession` itself, unlike `createSession` which only registers the descriptor and lets `TerminalView` spawn lazily on mount) — because no `TerminalView` ever mounts while `view === "home"` (`HomeScreen` replaces the entire shell), there is no later mount point to defer the spawn to.
- `ProjectCard` treats `parseStateFile`'s overall `"unrecognized"` result (malformed frontmatter YAML) the same as a `validateProjectRoot`/read rejection — both degrade to the same non-clickable error card, rather than distinguishing "moved/deleted" from "unparseable STATE.md" at the UI layer. Simpler failure model, matches the UI-SPEC's single error variant.
- `AppShell.test.tsx`'s pre-existing home-view integration test (from 04-01) was updated to mock `ProjectCard` rather than rewritten to drive the real lazy-health pipeline end to end — `ProjectCard` already has its own dedicated suite (`ProjectCard.test.tsx`) proving `validateProjectRoot`/`readPlanningText`/`parseStateFile` and all three variants; the AppShell-level test now proves only AppShell's own responsibility (home replaces the whole shell; a click routes through `openProject` + `setView`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `removeRecent()` to `persistence/app-store.ts`**
- **Found during:** Task 2 (ProjectCard error variant)
- **Issue:** The plan's Task 2 action text explicitly specifies the error card's "Remover da lista" action "removes the entry from recents via app-store", but `app-store.ts` (built in 04-01) only ever exposed `upsertRecent`/`getRecents` — no removal function existed. Without it, the button would render but do nothing, silently failing the plan's own `<action>` description.
- **Fix:** Added `removeRecent(root: string): Promise<void>` — filters the persisted list by root, `.save()`s, idempotent no-op when the root is already absent.
- **Files modified:** `src/persistence/app-store.ts`, `src/persistence/app-store.test.ts`
- **Verification:** Two new `app-store.test.ts` cases (removes only the matching root, preserving others; idempotent no-op on an unknown root) plus `ProjectCard.test.tsx`'s "Remover da lista" case exercising it through the component.
- **Committed in:** `d63c2e1` (Task 2 commit)

**2. [Rule 1 - Bug] Updated `AppShell.test.tsx`'s home-view test to survive HomeScreen's replacement of `HomeRecents`**
- **Found during:** Task 1 (HomeScreen wiring)
- **Issue:** 04-01's `AppShell.test.tsx` test asserted `screen.findByRole("button", { name: "gsd-cards" })` — valid for the old `HomeRecents` skeleton (a plain button whose only text was the recent's name), but `ProjectCard`'s real `role="button"` element only appears once health resolves to `"healthy"`, and its accessible name aggregates name + phase + progress + blockers, not just the recent's name. The test broke as a direct, expected consequence of this plan's own Task 1 change.
- **Fix:** Mocked `../components/home/ProjectCard` in `AppShell.test.tsx` to a minimal button stub (mirrors the pattern already used in `HomeScreen.test.tsx`), scoping this test back down to AppShell's own responsibility.
- **Files modified:** `src/shell/AppShell.test.tsx`
- **Verification:** `npx vitest run src/shell/AppShell.test.tsx` green (5/5), full suite green (436/436).
- **Committed in:** `5b3ba60` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical functionality, 1 bug caused by this plan's own Task 1 change)
**Impact on plan:** Both necessary for correctness — the first makes a plan-specified action actually work, the second keeps the pre-existing test suite green after Task 1's intended replacement of the tracer's minimal home render. No scope creep beyond the plan's own stated intent.

## Issues Encountered
None beyond the two deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `components/home/` (HomeScreen, ProjectCard, CreateProjectFlow) is the complete, tested home-screen surface for PROJ-01/PROJ-06/PROJ-03 — later plans in this phase (SESS-04/05, TERM-04) build on `session-store.ts`'s session lifecycle, not on this UI layer directly.
- Deferred to human UAT (`/gsd-verify-work 4`, coverage D6): confirm in a real `npm run tauri dev` window that pointing "Novo projeto GSD" at a truly empty folder actually drives `/gsd-new-project` to completion and lands the user on the new project's board — the composed sequence (picker → session spawn → inject → `.planning/` poll → auto-navigate) is code-inspected and unit-tested piecewise (`createProjectSession`'s own coverage) but was never run end-to-end against a real `claude` process in this sandboxed executor session, consistent with 04-01's tracer checkpoint disposition.
- `ProjectCard`'s error-card copy (`home.card.error.body`) interpolates the raw folder path (`{{path}}`) directly — acceptable per 04-UI-SPEC (`## Copywriting Contract`), but worth remembering if path values ever need truncation for very long/nested paths (not observed as an issue in this plan's scope).

---
*Phase: 04-casa-persistente*
*Completed: 2026-07-24*

## Self-Check: PASSED

All created files found on disk (`src/components/home/HomeScreen.tsx`, `HomeScreen.test.tsx`, `ProjectCard.tsx`, `ProjectCard.test.tsx`, `CreateProjectFlow.tsx`, this SUMMARY). All three task commit hashes (`5b3ba60`, `d63c2e1`, `7ae6c28`) found in `git log --oneline --all`.
