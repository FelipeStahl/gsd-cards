---
phase: 04-casa-persistente
plan: 02
subsystem: infra
tags: [tauri, rust, portable-pty, tauri-emitter, pty, event-driven]

# Dependency graph
requires:
  - phase: 04-01
    provides: appDataDir persistence groundwork (plugin-store), tracer pattern for this phase's Rust surface
provides:
  - "spawn_session(args) argv passthrough on both the Rust command and the channel.ts wrapper — empty-default preserves every existing SESS-02 call site byte-for-byte"
  - "PtyManager::remove_exited — purges a dead session entry so a naturally-exited session id can be re-spawned (unblocks lazy-restore in 04-06)"
  - "Global pty:session-exited Tauri event (reader-thread emit) + channel.ts listenForSessionExit/stopListeningForSessionExit singleton listener"
affects: [04-06 (--resume lazy restore, consumes spawnSession args + the id allow-list guard), 04-07 (exit notifications, consumes listenForSessionExit)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Global tauri::Emitter event for a rare, once-per-lifetime signal (pty:session-exited), kept OUT of the high-frequency per-session Channel<Vec<u8>> byte pipe — mirrors planning_watcher.rs's app.emit precedent"
    - "handle_session_exit extracted with a generic notify callback (not tied to AppHandle::emit) — same testability rationale as pump_pty_output's generic sink parameter"
    - "AppHandle captured + app.state::<T>() inside a spawned thread, instead of trying to move/clone a tauri::State<'_, T> across the thread boundary (State's lifetime doesn't survive the command call)"

key-files:
  created: []
  modified:
    - src-tauri/src/pty.rs
    - src/pty/channel.ts
    - src/pty/channel.test.ts

key-decisions:
  - "handle_session_exit extracted as a standalone function (manager + generic notify closure) rather than inlining the purge+emit directly in the reader-thread closure — makes the purge+emit sequence unit-testable without a real tauri::AppHandle"
  - "insert_dummy_session test helper spawns a real portable_pty session (open pty + spawn_command('true'/'cmd /C exit') + TreeGuard::attach) to populate PtyManager for remove_exited/handle_session_exit tests, since PtySession's private fields (Box<dyn MasterPty>/Box<dyn Child>/TreeGuard) are only constructible via a real spawn"

patterns-established:
  - "Rare Rust->JS signals go through a global tauri::Emitter event, never a tagged variant inside a high-frequency Channel; document this in threat_model registers when the boundary is security-relevant (T-04-06 in this plan)"

requirements-completed: [SESS-04, TERM-04]

coverage:
  - id: D1
    description: "spawn_session accepts an args list and forwards it verbatim to CommandBuilder; empty args is byte-identical to prior behavior"
    requirement: "SESS-04"
    verification:
      - kind: unit
        ref: "src-tauri/src/pty.rs#pty::tests (cargo build green with new signature; cmd.args(&args) confirmed via rg)"
        status: pass
      - kind: unit
        ref: "src/pty/channel.test.ts#spawnSession invoca spawn_session com args: [] por padrão / com o args fornecido"
        status: pass
    human_judgment: false
  - id: D2
    description: "A PTY child exit purges the stale PtyManager entry and emits a global pty:session-exited event carrying the session id; the byte Channel never carries the exit signal"
    requirement: "TERM-04"
    verification:
      - kind: unit
        ref: "src-tauri/src/pty.rs#pty::tests::remove_exited_returns_true_once_then_false"
        status: pass
      - kind: unit
        ref: "src-tauri/src/pty.rs#pty::tests::handle_session_exit_purges_entry_and_notifies_after_pump_returns"
        status: pass
      - kind: unit
        ref: "src/pty/channel.test.ts#listenForSessionExit (evento global pty:session-exited)"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-07-24
status: complete
---

# Phase 04 Plan 02: PTY args passthrough + exit event Summary

**`spawn_session`/`spawnSession` gained a verbatim argv passthrough param, and the reader thread now purges the dead `PtyManager` entry and emits a global `pty:session-exited` Tauri event on natural exit, proven by a real-process substitute-binary test — no frontend consumption wired yet.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-24T04:50Z (immediately after 04-01 completion)
- **Completed:** 2026-07-24T04:59Z
- **Tasks:** 2
- **Files modified:** 3 (`src-tauri/src/pty.rs`, `src/pty/channel.ts`, `src/pty/channel.test.ts`)

## Accomplishments
- `spawn_session` (Rust) and `spawnSession` (channel.ts) both take an `args`/argv-forwarding parameter, defaulting to `[]` so every existing SESS-02 call site is untouched (`cmd.args(&args)` right after `cmd.cwd(&cwd)`).
- `PtyManager::remove_exited` purges a dead session entry (poison-safe lock, same style as `kill_all`/`write`) — proven true-then-false via a real spawned `portable-pty` session in a new unit test.
- The reader-thread closure now calls a new `handle_session_exit` helper after `pump_pty_output` returns: it purges the entry and fires a `notify` callback carrying `ExitedPayload { session_id }`; in production `notify` calls `app.emit("pty:session-exited", payload)`. The byte `Channel<Vec<u8>>` is untouched — confirmed by grep (`on_event` only ever sends raw chunks).
- `channel.ts` exports `listenForSessionExit`/`stopListeningForSessionExit`, a `watch.ts`-style singleton listener on the global event, with no store wiring yet (that's 04-06/04-07).

## Task Commits

Each task was committed atomically:

1. **Task 1: Rust — args passthrough, PtyManager::remove_exited, reader-thread purge+emit** - `476bfd7` (feat)
2. **Task 2: channel.ts — spawnSession args param + listenForSessionExit singleton** - `f338d9d` (feat)

**Plan metadata:** (this commit, follows)

## Files Created/Modified
- `src-tauri/src/pty.rs` - `ExitedPayload`, `PtyManager::remove_exited`, `handle_session_exit` (testable purge+notify), `spawn_session(app, args, ...)`, reader-thread purge+emit, 2 new unit tests + a real-spawn test helper (`insert_dummy_session`)
- `src/pty/channel.ts` - `spawnSession(sessionId, cwd, onBytes, args = [])`, `listenForSessionExit`/`stopListeningForSessionExit` (singleton, mirrors `watch.ts`)
- `src/pty/channel.test.ts` - args default/override assertions, `listenForSessionExit` register/replace/teardown coverage (6 new tests)

## Decisions Made
- `handle_session_exit` extracted as a standalone function taking `&PtyManager` + a generic `notify: impl FnMut(ExitedPayload)` closure, instead of inlining the purge+emit directly in the reader-thread closure. This mirrors why `pump_pty_output` itself takes a generic `sink` — it makes the purge+emit sequence unit-testable without needing a real `tauri::AppHandle` (no `tauri::test` feature/dev-dependency was added; this decision avoided that dependency entirely).
- Inside the spawned reader thread, exit handling uses `app_for_exit.state::<PtyManager>()` (via the `Manager` trait, same pattern already used in `lib.rs`'s `RunEvent::ExitRequested` handler) rather than trying to clone/move the command's `tauri::State<'_, PtyManager>` directly — `State`'s borrow doesn't outlive the command invocation, so `AppHandle::state::<T>()` is the correct way to re-derive a `&PtyManager` from inside the thread.
- `insert_dummy_session` test helper spawns a genuine `portable_pty` session (`openpty` → `spawn_command("true"` / `cmd /C exit)` → `TreeGuard::attach` → `take_writer`) to populate a `PtyManager` for the `remove_exited`/`handle_session_exit` tests, since `PtySession`'s fields (`Box<dyn MasterPty>`, `Box<dyn Child>`, `TreeGuard`) are private and only constructible through a real spawn — no fake/mock session type was introduced.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>`/`<behavior>` specs; no auto-fixes were needed.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `spawn_session`/`spawnSession` argv passthrough is proven and ready for 04-06 to call with `["--resume", id]`, gated behind the id allow-list guard that plan will add at its single frontend call site (T-04-04, documented in this plan's threat model, not re-litigated here).
- The Rust→JS exit signal (`pty:session-exited`) is proven end-to-end at the backend/channel.ts layer (purge + emit + listener wrapper); 04-06/04-07 can now wire `listenForSessionExit` into the session-store without needing to prove the reader thread can emit after `pump_pty_output` returns — that risk is retired.
- No blockers for 04-03 through 04-07.

---
*Phase: 04-casa-persistente*
*Completed: 2026-07-24*

## Self-Check: PASSED

All created/modified files found on disk; both task commit hashes (`476bfd7`, `f338d9d`) found in git history.
