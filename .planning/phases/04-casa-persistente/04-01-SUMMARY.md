---
phase: 04-casa-persistente
plan: 01
subsystem: infra
tags: [tauri, plugin-store, plugin-notification, persistence, zustand, i18n]

# Dependency graph
requires:
  - phase: 03-board-interativo
    provides: board-store.ts's openProject/status lifecycle, AppShell's status ternary, i18n namespace-per-file convention
provides:
  - "First disk-write mechanism in the app: src/persistence/app-store.ts (LazyStore(\"app-state.json\") wrapper)"
  - "upsertRecent/getRecents — recents metadata persisted to appDataDir, never .planning/"
  - "board-store.ts view: \"home\" | \"board\" + setView state (default \"board\", non-breaking)"
  - "openProject upserts a recent on every successful open (fire-and-forget, staleness-guarded)"
  - "AppShell.tsx view === \"home\" branch (HomeRecents) rendering clickable recents that reopen via openProject"
  - "@tauri-apps/plugin-store + @tauri-apps/plugin-notification installed, registered, scoped by granular capabilities"
  - "Reusable vi.mock(\"@tauri-apps/plugin-store\", ...) test helper pattern (04-RESEARCH.md Wave 0 gap)"
affects: [04-02, 04-03, 04-04, 04-05, 04-06, 04-07]

# Tech tracking
tech-stack:
  added:
    - "@tauri-apps/plugin-store@^2.4.4 (JS) + tauri-plugin-store = \"2\" (crate)"
    - "@tauri-apps/plugin-notification@^2.3.3 (JS) + tauri-plugin-notification = \"2\" (crate)"
  patterns:
    - "Thin invoke/plugin wrapper module under src/persistence/, mirroring src/pty/channel.ts's doc-comment discipline"
    - "Fire-and-forget background write guarded by nothing-to-guard-against-yet (mirrors loadMilestoneHistory's staleness-guard shape for future snapshot writes)"
    - "View-state branch in AppShell (no router) — Pattern 1 of 04-RESEARCH.md"
    - "Granular store:allow-*/notification:allow-* capabilities, never the bundled catch-all sets"

key-files:
  created:
    - src/persistence/app-store.ts
    - src/persistence/app-store.test.ts
    - src/locales/pt-BR/home.json
    - src/locales/en/home.json
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src-tauri/capabilities/default.json
    - src/stores/board-store.ts
    - src/shell/AppShell.tsx
    - src/shell/AppShell.test.tsx
    - src/i18n.ts
    - package.json

key-decisions:
  - "Task 1 package legitimacy checkpoint resolved via orchestrator pre-authorization — both npm packages are official tauri-apps org, same repo as three plugins already trusted in this codebase; SUS verdict was a sandbox download-telemetry gap, not a real concern (same precedent as Phase 03-02's strip-ansi)"
  - "view defaults to \"board\" (not \"home\") so all existing single-project Phase 1-3 flows are unchanged; nothing in this plan sets view to \"home\" automatically — the home entry point (default-to-home-when-no-project-open, back-to-home navigation) is deferred to Plan 04-03/04-04, this plan only proves the render/reopen seam works when view is set"
  - "upsertRecent write failure is swallowed (never rethrown) — the recents list is convenience, not source of truth; a failed persistence write must never derail an already-successfully-opened board"
  - "Tracer feedback gate (interactive run, auto mode off) required a checkpoint:human-verify after committing Task 3 before this plan could be marked complete — orchestrator approved based on the automated proof (10 new tests green, 407/407 full suite, typecheck clean, cargo build+test green) and deferred the live-GUI confirmation (an actual app-state.json file appearing under appDataDir in a running window) to human UAT via /gsd-verify-work 4, consistent with how Phase 3's marker/timing backstops were handled"

patterns-established:
  - "Persistence module shape: src/persistence/<name>.ts exports a module-level LazyStore/Store instance + small async wrapper functions, doc-comment at the top names the invariant it's protecting (appDataDir only, never .planning/) — session-snapshot.ts (SESS-04, later plan) follows this exact shape"
  - "@tauri-apps/plugin-store mock: a class-based FakeLazyStore with an in-memory Map, vi.mock'd before a dynamic import of the module under test — the pattern later persistence tests in this phase reuse"

requirements-completed: [PROJ-01]

coverage:
  - id: D1
    description: "Opening a project records it under appDataDir/app-state.json (recentProjects: root, cached name, lastOpened ISO)"
    requirement: "PROJ-01"
    verification:
      - kind: unit
        ref: "src/persistence/app-store.test.ts#upsertRecent chama save() explicitamente (autoSave desabilitado)"
        status: pass
      - kind: unit
        ref: "src/persistence/app-store.test.ts#grava no store nomeado 'app-state.json' — nunca em .planning/"
        status: pass
    human_judgment: true
    rationale: "Automated tests prove the code path writes via LazyStore(\"app-state.json\") and calls save(); confirming the file physically lands under the OS appDataDir in a real running window requires a GUI/display not available in this sandboxed executor session — deferred to human UAT per orchestrator's tracer-checkpoint approval."
  - id: D2
    description: "Reloading the app reads recentProjects back and renders it on a home view branch, ordered lastOpened descending"
    requirement: "PROJ-01"
    verification:
      - kind: unit
        ref: "src/persistence/app-store.test.ts#upsertRecent(A) então upsertRecent(B): getRecents() devolve [B, A] (B primeiro)"
        status: pass
      - kind: unit
        ref: "src/persistence/app-store.test.ts#re-upsertar A move para a frente sem duplicar"
        status: pass
      - kind: unit
        ref: "src/shell/AppShell.test.tsx#view home: renderiza um recente persistido e clicar chama openProject com o root e volta para board"
        status: pass
    human_judgment: false
  - id: D3
    description: "Clicking a rendered recent re-opens that project (validateProjectRoot → board) and switches view back to board"
    requirement: "PROJ-01"
    verification:
      - kind: unit
        ref: "src/shell/AppShell.test.tsx#view home: renderiza um recente persistido e clicar chama openProject com o root e volta para board"
        status: pass
    human_judgment: false
  - id: D4
    description: "Both plugins (plugin-store, plugin-notification) installed, registered in the Builder, scoped by granular least-privilege capabilities (never the bundled catch-all sets)"
    verification:
      - kind: integration
        ref: "cd src-tauri && cargo build (both crates resolve at v2.4.4/v2.3.3)"
        status: pass
      - kind: other
        ref: "rg -n store:allow-save src-tauri/capabilities/default.json; rg -n store:default src-tauri/capabilities/default.json (no match)"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-07-24
status: complete
---

# Phase 4 Plan 1: Casa persistente — persistence tracer Summary

**LazyStore("app-state.json")-backed recents (write→read→render→reopen) proven end-to-end, plugin-store + plugin-notification installed behind an orchestrator-approved legitimacy gate**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-24T04:39:17Z
- **Completed:** 2026-07-24T04:48:51Z
- **Tasks:** 3 (1 checkpoint resolved, 2 executed and committed)
- **Files modified:** 14

## Accomplishments
- Installed `@tauri-apps/plugin-store` and `@tauri-apps/plugin-notification` (JS + Rust crates), registered both in the Tauri `Builder` chain, and scoped them with granular `store:allow-*`/`notification:allow-*` permissions only (never the bundled catch-all sets), matching the codebase's existing `fs:allow-read-*` least-privilege discipline
- Built `src/persistence/app-store.ts` — the app's first disk-write mechanism — wrapping `LazyStore("app-state.json", { autoSave: false })` with `upsertRecent`/`getRecents`, writing exclusively under `appDataDir`, never the user's `.planning/`
- Wired the full loop: `board-store.ts`'s `openProject` upserts a recent on every successful open (fire-and-forget, guarded the same way as the existing `loadMilestoneHistory` background write) and sets `view: "board"`; `AppShell.tsx` gained a `view === "home"` branch that reads `getRecents()` on mount, renders each recent as a clickable button, and reopens it via `openProject(root)` + `setView("board")` on click
- Established the reusable `@tauri-apps/plugin-store` mock pattern (`FakeLazyStore`, a class-based in-memory `Map` double) for future persistence tests this phase, filling the Wave 0 test-infrastructure gap identified in 04-RESEARCH.md

## Task Commits

Each task was committed atomically:

1. **Task 1: Package legitimacy gate — plugin-store + plugin-notification** - resolved via orchestrator pre-authorization (no code change, no commit; see Deviations/Decisions below)
2. **Task 2: Install plugins, register in the Builder, grant least-privilege capabilities** - `ad9b4e6` (feat)
3. **Task 3: End-to-end persistence — open → persist recent → reload → render → reopen** - `b8c93df` (feat)

**Plan metadata:** _pending — this commit_ (docs: complete plan)

## Files Created/Modified
- `src/persistence/app-store.ts` - `LazyStore("app-state.json")` wrapper: `RecentProjectEntry`, `upsertRecent`, `getRecents`
- `src/persistence/app-store.test.ts` - recents round-trip + ordering tests, establishes the `@tauri-apps/plugin-store` mock helper
- `src/stores/board-store.ts` - `openProject` upserts a recent on success; new `view`/`setView` state (default `"board"`)
- `src/shell/AppShell.tsx` - `view === "home"` branch (`HomeRecents`) reading `getRecents()` and rendering clickable recents
- `src/shell/AppShell.test.tsx` - extended to prove the home branch renders a recent and reopens it on click
- `src/i18n.ts` - registered the `home` namespace
- `src/locales/pt-BR/home.json`, `src/locales/en/home.json` - `home.heading` copy (extended with full copy in Plan 04-04)
- `src-tauri/Cargo.toml` - `tauri-plugin-store = "2"`, `tauri-plugin-notification = "2"`
- `src-tauri/src/lib.rs` - `.plugin(tauri_plugin_store::Builder::new().build())` + `.plugin(tauri_plugin_notification::init())`
- `src-tauri/capabilities/default.json` - granular `store:allow-*`/`notification:allow-*` permissions, updated description
- `package.json` / `package-lock.json` - new JS dependencies

## Decisions Made
- Task 1's package legitimacy checkpoint was pre-authorized by the orchestrator (both packages are official `tauri-apps` org, same repo as three plugins already trusted in this codebase; the [SUS] verdict in 04-RESEARCH.md was a sandbox npm-download-telemetry gap, not a real concern — same precedent already logged for `strip-ansi` in Phase 03-02). Versions were independently re-verified against the live npm registry this session (`npm view` → `2.4.4`/`2.3.3`, matching RESEARCH.md exactly) before installing.
- `view` defaults to `"board"`, not `"home"` — nothing in this plan sets it to `"home"` automatically. This plan proves the render/reopen mechanism works once `view` is set; the actual home-as-default-entry-point behavior (and the "back to home" navigation control from `04-UI-SPEC.md`'s `## Project Switcher`) is deferred to Plan 04-03/04-04, per this plan's own scope (tracer for the persistence seam, not the full home screen).
- `upsertRecent` write failures are swallowed (never rethrown into `openProject`) — the recents list is convenience, not source of truth; a disk-write failure must never derail a board that already opened successfully.
- Tracer feedback gate (04-RESEARCH.md/execute-plan.md protocol): since this was an interactive run (`workflow._auto_chain_active=false`, `workflow.auto_advance=false`), a `checkpoint:human-verify` was required immediately after committing Task 3, before the plan could be marked complete. The orchestrator approved based on the automated proof already green at that point (10 new tests, 407/407 full suite, clean typecheck, green `cargo build`/`cargo test`) and explicitly deferred the live-GUI confirmation (an actual `app-state.json` file appearing under the OS `appDataDir` in a running window) to human UAT via `/gsd-verify-work 4` — this sandboxed executor session has no display to run `npm run tauri dev` against. Recorded in `coverage.D1`'s `human_judgment: true`/`rationale` above.

## Deviations from Plan

None - plan executed exactly as written. Task 1's checkpoint was resolved by orchestrator pre-authorization as instructed in this execution's prompt context (not a deviation — the plan's own Task 1 anticipated exactly this pre-approvable path, per `04-CONTEXT.md`'s "checkpoint de legitimidade esperado, pré-aprovável").

## Issues Encountered

The capabilities file's `description` field initially included the literal string `store:default` (explaining what NOT to grant), which would have failed Task 2's own acceptance criterion (`rg -n "store:default" capabilities/default.json` must return no match). Caught and fixed before committing by rephrasing the description to describe the concept ("bundle catch-all do plugin store") without using the literal disallowed token.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The persistence seam (`app-store.ts`, `upsertRecent`/`getRecents`, granular `store:*` capabilities) is proven and ready for Plan 04-02+ (per-session snapshot store, session metadata, rename) to build on without re-verifying the plugin-store mechanism from scratch.
- `plugin-notification` is installed and registered but not yet exercised by any code path — TERM-04's `notify.ts` wrapper (permission request, `notifyAwaiting`/`notifyExited`) is deferred to a later plan in this phase, per the Component Inventory in `04-UI-SPEC.md`.
- The home screen itself (grid layout, `ProjectCard` health, empty/loading/error states, header CTAs) is NOT built yet — this plan only proves the underlying data seam with a minimal button-list render; the full visual contract lands in Plan 04-04 per `04-UI-SPEC.md`.
- Deferred to human UAT (`/gsd-verify-work 4`, per orchestrator's explicit direction): confirm in a real `npm run tauri dev` window that opening a project actually produces a file at the OS `appDataDir/app-state.json`, and that its contents match what `upsertRecent` wrote.

---
*Phase: 04-casa-persistente*
*Completed: 2026-07-24*

## Self-Check: PASSED

All created files found on disk (`src/persistence/app-store.ts`, `src/persistence/app-store.test.ts`, `src/locales/pt-BR/home.json`, `src/locales/en/home.json`, this SUMMARY). Both task commit hashes (`ad9b4e6`, `b8c93df`) found in `git log --oneline --all`.
