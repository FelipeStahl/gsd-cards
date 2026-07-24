---
phase: 04-casa-persistente
plan: 07
subsystem: notifications+session-lifecycle
tags: [tauri-plugin-notification, tauri-emitter, zustand, i18next, xterm]

# Dependency graph
requires:
  - phase: 04-casa-persistente (04-02)
    provides: "pty:session-exited global Tauri event + channel.ts's listenForSessionExit/stopListeningForSessionExit singleton listener"
  - phase: 04-casa-persistente (04-06)
    provides: "SessionOrigin gains 'restored', resumeSession/loadPersistedSessions lifecycle, SessionSidebar wiring precedent for Rule 2 deviations"
provides:
  - "src/notifications/notify.ts — ensurePermission/notifyAwaiting/notifyExited, thin plugin-notification wrapper that never throws (badge stays the durable, permission-independent contract)"
  - "session-store.ts markExited(id) — flips a live session's exited flag on the real pty:session-exited signal, never rebases origin, fires notifyExited"
  - "session-store.ts wireSessionExitListener() — routes channel.ts's exit-event singleton into markExited, called from SessionSidebar's existing project-open effect (not a module-load side effect)"
  - "setActivity fires notifyAwaiting exactly once per idle/busy->awaiting transition (no debounce needed — transition-gating already dedupes)"
  - "DrawerRail badge priority: awaiting (accent, no number) > exited (warning, no number) > plain live count > no badge, scoped to activeProjectRoot"
  - "SessionSidebar computes SessionRow variant=\"exited\" from the real markExited signal for live-origin sessions (stay in the 'Ativas' group, per 02-UI-SPEC)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Store-level side effects that call a Tauri plugin (listenForSessionExit) must be exposed as an explicit, lazily-invoked action — NEVER a module-top-level `void someAsyncCall(...)` — because vitest's module graph means any unrelated test file that transitively imports the store (even one that partially mocks a sibling module) will eagerly execute that call at import time, either throwing synchronously against an incomplete mock or producing an unhandled promise rejection against the real (unmocked) Tauri API. Discovered via a full-suite regression during this plan's Task 1 (5 unrelated test files broke) and fixed by moving the listenForSessionExit registration into a `wireSessionExitListener()` store action invoked from SessionSidebar's project-open effect, with `.catch(() => {})` at the call site for defense in depth."
    - "notify.ts resolves i18n copy directly via the raw `i18n.t(key, { ns })` singleton (not react-i18next's `useTranslation` hook) since it's a non-component module — same pattern would apply to any future service-layer module needing localized strings outside JSX."

key-files:
  created:
    - src/notifications/notify.ts
    - src/notifications/notify.test.ts
  modified:
    - src/stores/session-store.ts
    - src/stores/session-store.test.ts
    - src/shell/DrawerRail.tsx
    - src/shell/DrawerRail.test.tsx
    - src/components/session/SessionRow.tsx
    - src/components/session/SessionSidebar.tsx
    - src/locales/pt-BR/terminal.json
    - src/locales/en/terminal.json

key-decisions:
  - "wireSessionExitListener is an explicit store action called from SessionSidebar's effect, NOT the module-top-level `void listenForSessionExit(...)` originally drafted per the plan's read_first guidance — the eager version broke 5 unrelated test files (board-store.test.ts, PhaseCard.test.tsx, PhaseCardAction.test.tsx, CommandPalette.test.tsx, DrawerRail.test.tsx) via synchronous throws against partial pty/channel mocks and unhandled promise rejections against the real @tauri-apps/api/event in files that never mock it. channel.ts's own listenForSessionExit already self-replaces any prior listener, so calling this action on every project open is safe and never accumulates duplicate listeners."
  - "DrawerRail's badge now filters sessions by activeProjectRoot (board-store.ts, added in 04-03) before computing liveCount/hasAwaiting/hasExited — this also fixes a pre-existing scope gap where the badge counted sessions across ALL open projects, not just the active one (same class of bug as 04-RESEARCH.md's Pitfall 1, just never surfaced for the rail badge specifically until this plan needed correct awaiting/exited detection)."
  - "markExited never demotes origin — a live session that exits stays origin:\"live\" with exited:true, per 02-UI-SPEC.md's 'exited-this-run sessions stay in Ativas' rule; SessionSidebar computes variant=\"exited\" instead of \"live\" for those rows rather than moving them to the historical group."

patterns-established:
  - "Degrade-silently service wrapper for a Tauri plugin: ensurePermission caches a single in-flight/resolved Promise<boolean> (asked once, lazily), and every consumer-facing function wraps the plugin call in try/catch, resolving to a no-op rather than propagating — same discipline as discoverSessions in session-store.ts."

requirements-completed: [TERM-04]

coverage:
  - id: D1
    description: "notifyAwaiting/notifyExited send the correct terminal.notification.* title/body (interpolating sessionLabel) and no-op silently (never throw) on permission denial or a thrown sendNotification/isPermissionGranted call"
    requirement: "TERM-04"
    verification:
      - kind: unit
        ref: "src/notifications/notify.test.ts (11 tests: ensurePermission lazy/cached/degrade-silent, notifyAwaiting/notifyExited copy + silent no-op paths)"
        status: pass
    human_judgment: false
  - id: D2
    description: "markExited flips a live session's exited flag (never demoting origin) on the real pty:session-exited event and fires notifyExited; setActivity fires notifyAwaiting exactly once per idle/busy->awaiting transition"
    requirement: "TERM-04"
    verification:
      - kind: unit
        ref: "src/stores/session-store.test.ts#wireSessionExitListener / markExited / setActivity (TERM-04) describe blocks"
        status: pass
    human_judgment: false
  - id: D3
    description: "DrawerRail's rail badge follows the awaiting > exited > plain-count > none priority, scoped to the active project's live sessions"
    requirement: "TERM-04"
    verification:
      - kind: unit
        ref: "src/shell/DrawerRail.test.tsx#DrawerRail — prioridade do badge (TERM-04)"
        status: pass
    human_judgment: false
  - id: D4
    description: "SessionRow's exited variant renders correctly (warning tone, static, session.row.exited suffix) and is now driven end-to-end by the real markExited signal via SessionSidebar"
    requirement: "TERM-04"
    verification:
      - kind: unit
        ref: "src/components/session/SessionRow.test.tsx#SessionRow — variante exited"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real OS notification appears on an awaiting/exited transition, and the rail badge is correct even when notification permission is denied — against a real installed Tauri build, not the mocked plugin"
    verification: []
    human_judgment: true
    rationale: "Requires a real Tauri runtime with a native notification daemon/AUMID (04-RESEARCH.md Pitfall 5) — not reproducible in jsdom. Recorded in .planning/WINDOWS.md (id 6, kind unrun-verify) and deferred to /gsd-verify-work 4 per 04-VALIDATION.md's Manual-Only classification, exactly as the plan's own <verification> block anticipated."

# Metrics
duration: 20min
completed: 2026-07-24
status: complete
---

# Phase 04 Plan 07: OS notifications + rail badge priority + exit-event wiring Summary

**`notify.ts` wraps `@tauri-apps/plugin-notification` behind a degrade-silently `ensurePermission`/`notifyAwaiting`/`notifyExited` API; `markExited` consumes the real `pty:session-exited` event (04-02) to flip live sessions to the `exited` variant without demoting `origin`; `DrawerRail`'s rail badge now follows an awaiting > exited > count > none priority scoped to the active project.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-24T06:06Z (immediately after 04-06 completion)
- **Completed:** 2026-07-24T06:26Z
- **Tasks:** 2
- **Files modified:** 10 (2 new: `notify.ts`/`notify.test.ts`)

## Accomplishments

- `src/notifications/notify.ts` — `ensurePermission()` requests notification permission lazily, once per app run (cached promise), never re-prompting; `notifyAwaiting(sessionLabel)`/`notifyExited(sessionLabel)` resolve title/body from `terminal.notification.{awaiting,exited}.{title,body}` via the raw `i18n.t()` singleton and call `sendNotification`. Every path wraps plugin calls in try/catch and no-ops on failure or denial — the in-app badge remains the durable, permission-independent contract (T-04-21).
- `session-store.ts` gains `markExited(sessionId)` (TRANSITION-GATED like `setActivity`: no-op for an unknown id or one already marked exited; flips `exited: true` without touching `origin`; fires `notifyExited`) and `wireSessionExitListener()` (delegates to `channel.ts`'s `listenForSessionExit` singleton, `.catch(() => {})` for defense-in-depth). `setActivity` fires `notifyAwaiting` exactly once on the idle/busy→awaiting transition, reusing the existing transition-gate — no debounce needed (04-CONTEXT.md `## Claude's Discretion`, resolved per the plan's `planner_assumptions`).
- `DrawerRail.tsx`'s rail badge now computes, over the active project's live sessions only: any `awaiting` → filled accent 16px dot, no number; else any `exited` → filled warning 16px dot; else the plain accent numeric live count (Phase 2 behavior, unchanged); else no badge. Badge diameter bumped from 14px to 16px per `04-UI-SPEC.md`.
- `SessionSidebar.tsx` wires `wireSessionExitListener()` into its existing project-open `useEffect` (alongside `discoverSessions`/`loadPersistedSessions`) and computes `variant={session.exited ? "exited" : "live"}` for the "Ativas" group, so `SessionRow`'s pre-existing `exited` variant (warning tone, static, `session.row.exited` suffix) is finally driven by a real signal instead of sitting idle.
- `terminal.notification.awaiting.{title,body}` / `terminal.notification.exited.{title,body}` added to both locale files.

## Task Commits

Each task was committed atomically:

1. **Task 1: notify.ts wrapper + exit/awaiting wiring in session-store** - `a4b7d23` (feat)
2. **Task 2: DrawerRail badge priority + SessionRow exited variant** - `0db84dd` (feat)

**Plan metadata:** (this commit, follows)

## Files Created/Modified

- `src/notifications/notify.ts` / `.test.ts` — `ensurePermission`/`notifyAwaiting`/`notifyExited`, degrade-silently plugin-notification wrapper
- `src/stores/session-store.ts` / `.test.ts` — `SessionDescriptor.exited`, `markExited`, `wireSessionExitListener`, `setActivity`→`notifyAwaiting` wiring
- `src/shell/DrawerRail.tsx` / `.test.tsx` — badge priority (awaiting > exited > count > none), scoped to `activeProjectRoot`, 16px
- `src/components/session/SessionRow.tsx` — doc-comment only, confirming the pre-existing `exited` variant is now real-signal-driven
- `src/components/session/SessionSidebar.tsx` — wires `wireSessionExitListener`, computes `variant="exited"` for exited live sessions (Rule 2 deviation)
- `src/locales/{pt-BR,en}/terminal.json` — `notification.{awaiting,exited}.{title,body}`

## Decisions Made

- `wireSessionExitListener` is an explicit, lazily-invoked store action called from `SessionSidebar`'s effect — NOT the module-top-level `void listenForSessionExit(...)` the plan's `read_first`/`action` text initially pointed toward ("wire ... once at store init"). The eager version was implemented first and broke the full suite (5 unrelated test files: `board-store.test.ts`, `PhaseCard.test.tsx`, `PhaseCardAction.test.tsx`, `CommandPalette.test.tsx`, `DrawerRail.test.tsx`) — some via a synchronous `TypeError` when a partial `../pty/channel` mock lacked the new export, others via an unhandled promise rejection against the real, unmocked `@tauri-apps/api/event`. Moving the call into an action invoked only when `SessionSidebar` actually mounts (with `.catch(() => {})` at the call site) fixed all five without weakening the "wire once, never accumulate" guarantee — `channel.ts`'s own `listenForSessionExit` already self-replaces any prior listener before registering a new one.
- `DrawerRail`'s badge computation now filters `sessions[]` by `activeProjectRoot` before deriving `liveCount`/`hasAwaiting`/`hasExited` — previously the badge counted live sessions across ALL open projects (a scope gap from before PROJ-05 existed, never fixed because nothing exercised it). This plan's priority logic needed a correctly-scoped session set to be meaningful, so the fix was applied here rather than deferred.
- `markExited` never demotes `origin` — a `live` session that exits keeps `origin: "live"` with `exited: true` set, per `02-UI-SPEC.md`'s explicit rule that "exited-this-run" sessions stay in the "Ativas" group rather than migrating to "Histórico". `SessionSidebar` reads the flag to pick `variant="exited"` vs `"live"` for that group only — `historicalSessions` grouping is untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Module-load-time `listenForSessionExit` wiring broke the full test suite**
- **Found during:** Task 1, immediately after first full-suite run (`npx vitest run`)
- **Issue:** A bare `void listenForSessionExit(...)` at `session-store.ts`'s module top level (as literally described in the plan's Task 1 `action` text) executes at import time for EVERY test file that transitively imports `session-store.ts`. `board-store.test.ts` (and 3 other files) partially mock `../pty/channel` without the new export, causing a synchronous `TypeError` that crashed the entire test file before any test ran; `Board.test.tsx`/`TerminalView.test.ts` don't mock `@tauri-apps/api/event` at all, producing an unhandled promise rejection against the real Tauri API in jsdom.
- **Fix:** Replaced the module-top-level call with an explicit `wireSessionExitListener()` store action, invoked lazily from `SessionSidebar`'s existing project-open `useEffect`, with `.catch(() => {})` at the call site.
- **Files modified:** `src/stores/session-store.ts`, `src/stores/session-store.test.ts`, `src/components/session/SessionSidebar.tsx`
- **Verification:** Full suite green (48 files, 509→514 tests across both task commits)
- **Committed in:** `a4b7d23` (Task 1 commit)

**2. [Rule 2 - Missing critical functionality] `SessionSidebar.tsx` wiring not in `files_modified`**
- **Found during:** Task 1 (making `markExited` reachable end-to-end) and Task 2 (making the `exited` variant observable)
- **Issue:** `04-07-PLAN.md`'s `files_modified` doesn't list `src/components/session/SessionSidebar.tsx`, but the plan's own `## Component Inventory` (`04-UI-SPEC.md`, "SessionSidebar — extended") and the `must_haves.truths` ("When pty:session-exited fires ... markExited flips its row to the exited variant") require it: without wiring `wireSessionExitListener()` there, the exit event never reaches the store from a running app, and without computing `variant={session.exited ? "exited" : "live"}` there, `SessionRow`'s pre-existing `exited` variant never renders for a real exit.
- **Fix:** Added both pieces of wiring to `SessionSidebar.tsx`'s existing project-open effect and "Ativas" group render.
- **Files modified:** `src/components/session/SessionSidebar.tsx`
- **Verification:** `SessionSidebar.test.tsx`/`AppShell.test.tsx` (both render `<SessionSidebar />`) stay green with no changes needed to their own assertions; full suite green.
- **Committed in:** `a4b7d23` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 — regression fix discovered via full-suite verification, 1 Rule 2 — missing critical wiring, same precedent as 04-06's `SessionSidebar.tsx` deviation).
**Impact on plan:** Both necessary for the plan's own `must_haves`/acceptance criteria to hold true end-to-end (not just in isolated unit tests); no behavior outside TERM-04's stated scope was added.

## Issues Encountered

- The plan's Task 1 `action` text described the exit-listener wiring as a module-load-time side effect ("wire ... once at store init"). Taken literally this broke 5 unrelated test files across the codebase — resolved by re-reading the intent ("wire once, no duplicate listeners") and satisfying it via an idempotent, lazily-invoked action instead, which `channel.ts`'s own internal replace-not-accumulate guard already made safe to call from a component effect. See Deviation 1 above.

## User Setup Required

None — no external service configuration required (both plugins already installed/approved in 04-01; no new packages this plan).

## Next Phase Readiness

- This is the LAST plan of Phase 4 (7/7). TERM-04, and with it Phase 4's full requirement set (PROJ-01, PROJ-03, PROJ-05, PROJ-06, SESS-04, SESS-05, TERM-04), is now implemented and automated-test-covered.
- Manual verification owed (per this plan's own `<verification>` and `04-VALIDATION.md`'s Manual-Only classification): a real OS notification against an installed Tauri build, and rail-badge correctness when notification permission is denied — recorded in `.planning/WINDOWS.md` (entry 6, `unrun-verify`) and deferred to `/gsd-verify-work 4`.
- No blockers for milestone completion review.

---
*Phase: 04-casa-persistente*
*Completed: 2026-07-24*

## Self-Check: PASSED

All files created/modified found on disk; both task commit hashes (`a4b7d23`, `0db84dd`) found in git history.
