---
phase: 03-board-interativo
plan: 03
subsystem: terminal
tags: [react, zustand, strip-ansi, textdecoder, vitest, pty]

# Dependency graph
requires:
  - phase: 03-board-interativo (Plan 02)
    provides: "strip-ansi installed and package-legitimacy-verified (checkpoint:human-verify resolved by orchestrator pre-authorization)"
  - phase: 02-sess-o-viva
    provides: "src/pty/channel.ts's single-consumer bytesHandlers map, focus-algorithm.ts's redirectToTerminal/redirectToBackground, session-store.ts's SessionDescriptor/sessions[] shape and liveSessions-outside-immer discipline"
provides:
  - "src/pty/activity.ts — classifyActivity/appendToRollingBuffer (pure classifier) + TerminalActivity type + BUSY_MARKER/AWAITING_MARKER/ROLLING_BUFFER_CAP/QUIESCENCE_MS named constants"
  - "src/pty/channel.ts's activityHandlers dual-map — setActivityHandler/clearActivityHandler, always-on independent of focus routing"
  - "src/stores/session-store.ts's SessionDescriptor.activity field + transition-gated setActivity() action"
  - "src/components/terminal/useTerminalActivity.ts — wireTerminalActivity(sessionId, onChange), mounted in TerminalView.tsx"
affects: [03-04, 03-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-consumer byte routing in channel.ts: a second, always-on activityHandlers map alongside the existing focus-routed bytesHandlers — any future per-session background observer should extend this map, never piggyback on bytesHandlers"
    - "Pure classifier + timer/decoder shell split: classifyActivity/appendToRollingBuffer are pure (no timers/I-O); wireTerminalActivity owns the one-TextDecoder-per-session + one-quiescence-timer-per-session state, mirroring focus-algorithm.ts's pure-function/structural-typing discipline"
    - "Transition-gated store setters: setActivity only calls set() when the value actually changes, extending the same discipline session-store.ts already uses to keep liveSessions's high-frequency byte traffic out of zustand's reactive path"

key-files:
  created:
    - src/pty/activity.ts
    - src/pty/activity.test.ts
    - src/components/terminal/useTerminalActivity.ts
    - src/components/terminal/useTerminalActivity.test.ts
  modified:
    - src/pty/channel.ts
    - src/pty/channel.test.ts
    - src/stores/session-store.ts
    - src/stores/session-store.test.ts
    - src/components/terminal/TerminalView.tsx

key-decisions:
  - "classifyActivity never returns \"idle\" — only \"busy\" | \"awaiting\" | null; idle is entirely the caller's (wireTerminalActivity's) responsibility via the quiescence timer, since silence cannot be observed from a single decoded string. This matches 03-RESEARCH.md Pattern 3 verbatim."
  - "wireTerminalActivity's cleanup calls clearActivityHandler(sessionId) unconditionally on every TerminalView effect teardown (unmount AND session-change), redundant-but-safe with channel.ts's own killSession cleanup of the same map."

patterns-established:
  - "Named-constant marker regexes (BUSY_MARKER/AWAITING_MARKER) isolated from all wiring code — tuning them empirically at /gsd-verify-work is a one-line change, never touches channel.ts/session-store.ts/useTerminalActivity.ts"

requirements-completed: [ACT-03]

coverage:
  - id: D1
    description: "classifyActivity(buffer) returns awaiting/busy/null correctly, including markers embedded in ANSI codes and split across two appendToRollingBuffer calls; awaiting takes precedence over busy"
    requirement: ACT-03
    verification:
      - kind: unit
        ref: "src/pty/activity.test.ts — 13 tests covering every <behavior> bullet"
        status: pass
    human_judgment: false
  - id: D2
    description: "channel.ts exposes a second, always-on activityHandlers map that survives a bytesHandlers (focus) swap; killSession deletes from both maps"
    requirement: ACT-03
    verification:
      - kind: unit
        ref: "src/pty/channel.test.ts#activityHandlers (segundo consumidor sempre-ativo — ACT-03) — 3 tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "session-store's setActivity is transition-gated — same-value calls produce no new store transition (reference-stable sessions[]); different-value calls update the descriptor; unknown session id is a safe no-op"
    requirement: ACT-03
    verification:
      - kind: unit
        ref: "src/stores/session-store.test.ts#setActivity (ACT-03 — transition-gated) — 4 tests"
        status: pass
    human_judgment: false
  - id: D4
    description: "wireTerminalActivity flips to busy immediately on first byte after idle, flips back to idle only after QUIESCENCE_MS of silence (fake timers), classifies awaiting correctly, gates onChange to real transitions only, and keeps two sessions' timers independent; TerminalView mounts/cleans it up alongside existing focus wiring"
    requirement: ACT-03
    verification:
      - kind: unit
        ref: "src/components/terminal/useTerminalActivity.test.ts — 6 tests, vi.useFakeTimers()"
        status: pass
      - kind: unit
        ref: "npm run typecheck (TerminalView.tsx mount)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The empirical validation of QUIESCENCE_MS cadence and BUSY_MARKER/AWAITING_MARKER against a real Claude CLI output burst — no flicker on spinner cadence, correct busy/awaiting classification on real footer/prompt text"
    verification: []
    human_judgment: true
    rationale: "Explicitly flagged as a MANDATORY, non-deferred backstop in this plan's must_haves (statements with verification: backstop) and in 03-RESEARCH.md's Assumptions Log A1/A2 — no vendor-published contract for the Claude CLI's PTY output format exists; a jsdom/vitest unit test cannot observe real CLI spinner/prompt cadence. Must be exercised at /gsd-verify-work against a live claude session."

# Metrics
duration: 8min
completed: 2026-07-24
status: complete
---

# Phase 3 Plan 03: Terminal Activity Detection Engine (ACT-03) Summary

**A second, always-on `activityHandlers` byte consumer in `channel.ts` feeds a pure ANSI-stripped rolling-buffer classifier (`classifyActivity`) through a per-session `TextDecoder`+quiescence-timer shell (`wireTerminalActivity`), updating a transition-gated `SessionDescriptor.activity` field for every live session — foreground and background — without ever calling zustand's `set()` per byte.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-24T02:40:00Z (context load)
- **Completed:** 2026-07-24T02:44:51Z
- **Tasks:** 3
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments
- `src/pty/activity.ts`: pure, timer-free `classifyActivity(buffer)` / `appendToRollingBuffer(buffer, chunk)`, `TerminalActivity` type, and the four named constants (`BUSY_MARKER`, `AWAITING_MARKER`, `ROLLING_BUFFER_CAP=2000`, `QUIESCENCE_MS=500`) — awaiting takes precedence over busy, markers detected correctly through ANSI codes and across split rolling-buffer appends.
- `src/pty/channel.ts`: additive `activityHandlers` map + `setActivityHandler`/`clearActivityHandler`, dispatched from the SAME `onmessage` callback as the existing `bytesHandlers` (never overwritten by focus swaps); `killSession`'s `finally` now deletes from both maps.
- `src/stores/session-store.ts`: `SessionDescriptor.activity?: TerminalActivity` field + `setActivity(sessionId, activity)` — reads current value first and only calls `set()` on a real change (or a valid session id), preserving Phase 2's no-re-render-on-background-bytes invariant.
- `src/components/terminal/useTerminalActivity.ts`: `wireTerminalActivity(sessionId, onChange)` — one persistent `TextDecoder({stream:true})`, one rolling buffer, one quiescence timer per session (closure-scoped, never module-shared); immediate flip to `busy` on the first non-idle byte, `idle` only after `QUIESCENCE_MS` of silence; returns a cleanup that clears the timer and calls `clearActivityHandler`.
- `TerminalView.tsx` mounts `wireTerminalActivity` inside the existing `[sessionId, projectRoot]` effect, wiring `onChange` to `useSessionStore.getState().setActivity`, and calls the returned cleanup in the effect's teardown alongside the existing `loseFocus`/`terminal.dispose()` branch.
- Full suite: 330/330 tests green (up from the 304-test baseline: +13 activity.test.ts, +3 channel.test.ts, +4 session-store.test.ts, +6 useTerminalActivity.test.ts, +0 net TerminalView test file — none existed prior to this plan). `npm run typecheck` clean throughout.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure activity classifier (classifyActivity + rolling buffer)** - `e3e8443` (feat)
2. **Task 2: Dual-consumer byte routing in channel.ts + transition-gated activity field in session-store** - `9fee769` (feat)
3. **Task 3: useTerminalActivity wiring (decoder + quiescence timer) mounted in TerminalView** - `b022a97` (feat)

_No RED/GREEN/REFACTOR multi-commit split — `TDD_MODE=false` per the executor's `<mode>` instruction; tests were written alongside implementation and green before each task's single commit._

## Files Created/Modified
- `src/pty/activity.ts` - `classifyActivity`/`appendToRollingBuffer`/`TerminalActivity`/named marker+timing constants
- `src/pty/activity.test.ts` - 13 tests: null/busy/awaiting, ANSI-embedded markers, split-chunk detection, precedence, case-insensitivity
- `src/pty/channel.ts` - `activityHandlers` map, `setActivityHandler`/`clearActivityHandler`, dual-dispatch in `onmessage`, dual-delete in `killSession`
- `src/pty/channel.test.ts` - 3 new tests: survives focus swap, `clearActivityHandler` stops delivery, `killSession` clears both maps
- `src/stores/session-store.ts` - `SessionDescriptor.activity` field, `setActivity` transition-gated action
- `src/stores/session-store.test.ts` - 4 new tests: update on change, no-op transition on unchanged value, new transition on real change, safe no-op for unknown id
- `src/components/terminal/useTerminalActivity.ts` - `wireTerminalActivity` (decoder + rolling buffer + quiescence timer shell)
- `src/components/terminal/useTerminalActivity.test.ts` - 6 tests using `vi.useFakeTimers()`: immediate busy, idle-after-quiescence, awaiting classification, no-op onChange on repeated state, per-session timer independence, cleanup clears timer + handler
- `src/components/terminal/TerminalView.tsx` - mounts `wireTerminalActivity`/`useSessionStore.getState().setActivity`, cleanup added to effect teardown

## Decisions Made
- `classifyActivity` never returns `"idle"` — only `"busy" | "awaiting" | null`; idle is entirely the caller's (`wireTerminalActivity`'s) responsibility via the quiescence timer, per `03-RESEARCH.md` Pattern 3's explicit design (silence cannot be observed from a single decoded string).
- `wireTerminalActivity`'s cleanup calls `clearActivityHandler(sessionId)` unconditionally on every `TerminalView` effect teardown (both unmount and session-change) — redundant-but-safe with `channel.ts`'s own `killSession` cleanup of the same map, matching the plan's key_links contract.

## Deviations from Plan

None - plan executed exactly as written. All four `must_haves.truths` load-bearing requirements (second always-on `activityHandlers` map, pure ANSI-stripped classifier with split-chunk correctness, transition-gated `setActivity`, one-decoder/one-timer-per-session `wireTerminalActivity`) implemented as specified; the two `verification: backstop` statements (QUIESCENCE_MS cadence, marker regex accuracy against real Claude CLI output) are intentionally left for `/gsd-verify-work` per the plan's own instructions — see `## Known Stubs` below.

## Known Stubs

None — no hardcoded/empty data paths. The two marker regexes (`BUSY_MARKER`, `AWAITING_MARKER`) and `QUIESCENCE_MS` are fully implemented, named constants; they are LOW-confidence assumptions (no vendor-published Claude CLI output contract exists) explicitly flagged by the plan itself as requiring empirical verification at `/gsd-verify-work` — this is not a stub, it is a documented, testable, one-line-fixable assumption (T-03-05 in the plan's own threat_model, disposition `accept`).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `SessionDescriptor.activity` is now populated for every live session (foreground and background) — Plan 04 (ACT-04, visual indicator + command palette) can read this field directly for `ActivityDot`'s tone mapping and the busy/awaiting injection guard, no further plumbing needed.
- `PhaseCardAction` (Plan 01) currently treats every live session target as idle by design ("the busy/awaiting guard arrives in Plan 04") — this plan's `activity` field is exactly what that guard will read.
- The two `verification: backstop` statements (QUIESCENCE_MS empirical tuning, marker regex accuracy) are carried forward as mandatory, non-deferred items for `/gsd-verify-work 3` — do not skip them; a false classification would make the ACT-03 busy-guard inert.
- No blockers for Plan 04/05.

---
*Phase: 03-board-interativo*
*Completed: 2026-07-24*

## Self-Check: PASSED
All created/modified files exist on disk; all 3 task commit hashes (e3e8443, 9fee769, b022a97) found in git log.
