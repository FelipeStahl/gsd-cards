---
phase: 03-board-interativo
reviewed: 2026-07-24T03:23:05Z
depth: deep
files_reviewed: 37
files_reviewed_list:
  - src-tauri/src/lib.rs
  - src-tauri/src/pty.rs
  - src-tauri/tests/write_session_rejects.rs
  - src/components/ActivityDot.tsx
  - src/components/DetailPanel.test.tsx
  - src/components/DetailPanel.tsx
  - src/components/PhaseCard.test.tsx
  - src/components/PhaseCard.tsx
  - src/components/PhaseCardAction.test.tsx
  - src/components/PhaseCardAction.tsx
  - src/components/session/SessionRow.test.tsx
  - src/components/session/SessionRow.tsx
  - src/components/terminal/CommandPalette.test.tsx
  - src/components/terminal/CommandPalette.tsx
  - src/components/terminal/GsdCommandToolbar.tsx
  - src/components/terminal/TerminalView.tsx
  - src/components/terminal/useTerminalActivity.test.ts
  - src/components/terminal/useTerminalActivity.ts
  - src/i18n.ts
  - src/locales/en/board.json
  - src/locales/en/commands.json
  - src/locales/en/terminal.json
  - src/locales/pt-BR/board.json
  - src/locales/pt-BR/commands.json
  - src/locales/pt-BR/terminal.json
  - src/planning/actions.test.ts
  - src/planning/actions.ts
  - src/planning/injection.test.ts
  - src/planning/injection.ts
  - src/pty/activity.test.ts
  - src/pty/activity.ts
  - src/pty/channel.test.ts
  - src/pty/channel.ts
  - src/shell/Board.test.tsx
  - src/shell/DrawerRail.test.tsx
  - src/shell/DrawerRail.tsx
  - src/stores/session-store.test.ts
  - src/stores/session-store.ts
findings:
  critical: 2
  warning: 2
  info: 2
  total: 6
status: fixed
fixed_at: 2026-07-24T03:40:00Z
fix_summary:
  fixed: 6
  deferred: 0
  skipped: 0
---

# Phase 3: Code Review Report

**Reviewed:** 2026-07-24T03:23:05Z
**Depth:** deep
**Files Reviewed:** 37 (`src`/`src-tauri` diff, `1827f16..HEAD`)
**Status:** fixed (all 6 findings resolved — see per-finding `Fix status` notes below)

## Summary

Phase 3 wires the board's contextual actions (ACT-01/02), a byte-stream terminal-activity classifier (ACT-03), and a GSD command toolbar/palette (ACT-04) into the existing PTY injection primitive. The individual pure-function layers are well-built and well-tested in isolation: `sanitizePhaseId`/`derivePhaseAction` (T-03-01), `resolveInjection`'s Injection Behavior Matrix, and `classifyActivity`'s marker regexes all have solid unit coverage and every `writeSession` call is `.catch()`-guarded (T-03-02 backstop). `channel.ts`'s dual-consumer `activityHandlers` map is correctly implemented in isolation and its own unit tests pass.

However, tracing the wiring **across** files (the required focus of this review) surfaces two critical defects that the per-file/per-plan test suites did not catch because each plan tested its own layer in isolation rather than the full integration:

1. **The activity classifier is only ever wired for the single currently-focused/open session** (`TerminalView.tsx` is the sole caller of `wireTerminalActivity`, and only one `TerminalView` is ever mounted app-wide, gated to `activeSessionId`). The moment a session loses focus or the drawer collapses, its `activityHandlers` entry is torn down, freezing `SessionDescriptor.activity` — this reintroduces "Pitfall 1" that `03-RESEARCH.md`'s dual-consumer-map design (Pattern 2) was explicitly built to prevent, and it directly weakens the busy-injection guard for the `lastFocusedSessionId` fallback target that `PhaseCardAction`/`GsdCommandToolbar`/`CommandPalette` all use when the drawer is collapsed.
2. **`classifyActivity`'s rolling buffer never invalidates a stale `awaiting` marker on transition**, so once a permission prompt has been shown and answered, the buffer can keep matching `AWAITING_MARKER` for up to ~2000 subsequent characters of genuinely busy output, causing `resolveInjection` to `prefill` (write bytes to a live, busy PTY) instead of `blocked` (zero injection) — a direct, traceable violation of T-03-03's "block, never queue" invariant.

Two further warnings (Cmd/Ctrl+K key-stealing from a focused xterm surface, and a silent action-button gap for un-padded single-digit phase numbers) and two info-level maintainability notes round out the findings. i18n key parity (pt-BR/en) is complete across all three touched namespaces (`board`, `commands`, `terminal`), and no hardcoded secrets, `eval`/`innerHTML`, or debug artifacts were found in the diff.

## Critical Issues

### CR-01: Background/unfocused live sessions stop being activity-classified — the busy-guard can go stale for the injection target used when the drawer is collapsed

**Fix status:** fixed — `src/stores/session-store.ts` (commit `cd332e1`). `wireTerminalActivity` is now registered once per live session at `createSession` time, independent of any `TerminalView` mount, and only stopped in `killSession`/`archiveSession`. Removed the wiring entirely from `TerminalView.tsx`'s mount effect. Regression tests added in `src/stores/session-store.test.ts` ("activity wiring lifecycle (CR-01 — always-on, independent of TerminalView)") proving: a background/never-focused session still updates `SessionDescriptor.activity`; `focusSession` (session switch/collapse-equivalent) never re-wires or stops wiring; only `killSession`/`archiveSession` stop it.

**File:** `src/components/terminal/TerminalView.tsx:135, 268-278`
**Issue:** `wireTerminalActivity(sessionId, onChange)` is called **only** from `TerminalView.tsx`'s `[sessionId, projectRoot]`-keyed effect, and `DrawerRail.tsx` mounts a single `TerminalView` instance app-wide, only when `activeSessionId && projectRoot` (collapsed rail renders no `TerminalView` at all). When the effect's cleanup runs — on every session switch *and* on drawer collapse — it unconditionally calls `stopWiringActivity()`, which calls `clearActivityHandler(sessionId)` (`src/pty/channel.ts:93-95`), deleting that session's entry from the always-on `activityHandlers` map.

This means a session's `SessionDescriptor.activity` freezes at whatever value it held the instant it lost terminal focus (most commonly `undefined`, treated as idle by both `ActivityDot` and `resolveInjection`) and never updates again until the user re-opens that exact session in the drawer. `03-RESEARCH.md`'s entire justification for the dual-consumer `activityHandlers` map (Pattern 2, explicitly called "the most load-bearing architectural insight of this research") was to avoid exactly this — "Pitfall 1: Classifying only the focused session's bytes" — but the pitfall is reintroduced one layer up, at the `TerminalView` wiring, even though `channel.ts` itself is implemented correctly in isolation (its own unit tests in `channel.test.ts` only prove the map survives a `setSessionBytesHandler` swap in isolation, not that it survives real `TerminalView` mount/unmount cycles).

Concrete impact: `PhaseCardAction`, `GsdCommandToolbar`, and `CommandPalette` all target `activeSessionId ?? lastFocusedSessionId` (e.g. `PhaseCardAction.tsx:94`) — precisely the case where the drawer may be collapsed or showing a *different* session. If the target session is actually busy but the drawer isn't currently open on it, `target.activity` is stale/frozen (commonly `undefined`), `resolveInjection` treats that as idle, and a card/toolbar/palette click will `send` a command (with `\r`) into a session that may genuinely be mid-task — the exact scenario ACT-03 exists to prevent.

**Fix:** Decouple activity-handler lifetime from `TerminalView`'s mount lifecycle. Register `wireTerminalActivity` once per *live session* (e.g. at session-creation time in `session-store.ts`/wherever `spawnSession` is first invoked, or in a dedicated always-mounted per-session hook keyed by session id, not by "currently focused terminal"), and only unregister it on `killSession`/session archival — never on a focus/session-switch inside `TerminalView`. Sketch:
```typescript
// e.g. own the wiring alongside session creation instead of TerminalView's
// per-focus effect, so it is independent of which session is currently open:
useEffect(() => {
  const stops = new Map<string, () => void>();
  for (const session of sessions.filter((s) => s.origin === "live")) {
    if (!stops.has(session.id)) {
      stops.set(session.id, wireTerminalActivity(session.id, (activity) =>
        useSessionStore.getState().setActivity(session.id, activity),
      ));
    }
  }
  return () => { for (const stop of stops.values()) stop(); };
}, [sessions]);
```
At minimum, `TerminalView.tsx`'s cleanup must stop calling `stopWiringActivity()` on a plain session-switch (only on true session-kill/app-teardown), since the whole point of the dual map was to keep classification alive independent of focus.

### CR-02: Stale `awaiting` marker in the rolling buffer can mask a genuinely `busy` session, causing the guard to `prefill`-write instead of `block`

**Fix status:** fixed — `src/components/terminal/useTerminalActivity.ts` (commit `f0f50e5`). Adapted from the suggested sketch: clearing the buffer only on a `transition()` out of `awaiting` does not fully close the bug, because when the stale marker keeps re-matching, `current` never actually changes (`transition`'s same-state gate returns early before reaching the clear), so the buffer would never be cleared. Instead, the buffer is cleared immediately after ANY confirmed marker match (`classified` truthy), regardless of whether a state transition occurred — this guarantees a matched marker's text can never be re-matched against future chunks. Regression tests added in `src/components/terminal/useTerminalActivity.test.ts` covering: awaiting→busy with a busy marker in the next chunk, awaiting→busy with no marker at all in the next chunk, and a fresh awaiting marker after a prior busy cycle still classifying correctly.

**File:** `src/pty/activity.ts:52-57`
**Issue:** `classifyActivity` gives `awaiting` unconditional precedence over `busy` whenever `AWAITING_MARKER` matches anywhere in the rolling window — and `appendToRollingBuffer` (`activity.ts:40-43`) never clears or invalidates old content on a state transition, it only trims to the last `ROLLING_BUFFER_CAP` (2000) characters. Once a permission prompt ("Do you want to proceed?") has appeared and been answered, its text remains inside the 2000-character rolling window for as long as fewer than ~2000 new characters of output have streamed since. Any classification performed during that window — even while Claude is now genuinely busy processing (spinner/"esc to interrupt" markers actively present too) — still returns `awaiting`, because `AWAITING_MARKER.test(clean)` is checked first and short-circuits.

`resolveInjection` (`src/planning/injection.ts:55-58`) treats `awaiting` as `prefill`: it still calls `writeSession` with a non-null payload (just without a trailing `\r`). This directly violates the locked, security-relevant T-03-03 invariant ("busy ⇒ blocked, payload null, zero injection — never enfileirar") for the entire duration of that stale-marker window: a session that is actually busy gets bytes written to its live PTY stdin because it was misclassified as merely "awaiting".
**Fix:** Reset/invalidate the rolling buffer (or at minimum strip the already-matched `awaiting` substring) whenever a transition *away from* `awaiting` occurs, or track "have we already resolved this specific awaiting occurrence" state in the caller (`wireTerminalActivity`) rather than re-deriving purely from buffer content on every byte. Simplest fix: clear `buffer` in `wireTerminalActivity` whenever `transition()` moves *out of* `"awaiting"`:
```typescript
function transition(next: TerminalActivity) {
  if (next === current) return;
  if (current === "awaiting" && next !== "awaiting") buffer = ""; // drop the stale prompt text
  current = next;
  onChange(next);
}
```
Add a regression test asserting that a buffer containing an `awaiting` marker followed by enough new "esc to interrupt" content (post-transition) classifies as `busy`, not `awaiting`.

## Warnings

### WR-01: Cmd/Ctrl+K does not actually intercept the shortcut when the terminal has DOM focus — it both leaks a byte to the live PTY and opens the palette

**Fix status:** fixed — `src/components/terminal/TerminalView.tsx` (commit `8d83cdf`). Extracted the `attachCustomKeyEventHandler` logic (Ctrl+F and now Ctrl/Cmd+K) into a pure, canvas-independent `createTerminalKeyHandler` function so it's unit-testable in this project's jsdom (no `HTMLCanvasElement.getContext`). Ctrl/Cmd+K now returns `false` there, so xterm skips its default handling entirely and the byte never reaches the PTY via `onData`. `GsdCommandToolbar`'s window-level listener is unchanged and still opens the palette independently (needed so the shortcut works when the terminal isn't focused). Regression tests added in `src/components/terminal/TerminalView.test.ts` proving Ctrl+K/Cmd+K return `false` (swallowed) and Ctrl+F/Cmd+F behavior is preserved.

**File:** `src/components/terminal/GsdCommandToolbar.tsx:171-180`
**Issue:** The Cmd/Ctrl+K trigger is a plain bubble-phase `window.addEventListener("keydown", ...)`. This is unlike the existing, correct Ctrl+F pattern in the same codebase (`TerminalView.tsx:239-247`), which registers via xterm's `attachCustomKeyEventHandler` and returns `false` to stop xterm from processing the key at all. Because xterm's own keydown handling happens on its hidden `<textarea>` during the event's target/bubble phase *before* the event reaches `window`, when the terminal itself has focus and the user presses Ctrl+K, xterm will already have processed the keystroke as normal terminal input (Ctrl+K is the standard readline "kill to end of line" binding and gets sent to the PTY via the existing `t.onData` → `writeSession` path, `TerminalView.tsx:229-233`) by the time the `window`-level listener runs `event.preventDefault()` — too late to stop what already happened. The palette then also opens. Net effect: every Cmd/Ctrl+K press while the terminal is focused both corrupts/interrupts whatever the user or Claude was doing in the live session *and* opens the palette on top of it.
This scenario is untested: `DrawerRail.test.tsx` mocks `TerminalView` entirely (lines 4-11), so no test ever exercises a real, focused xterm instance receiving this shortcut.
**Fix:** Register the shortcut the same way Ctrl+F is registered — inside `TerminalView`'s `attachCustomKeyEventHandler` (returning `false` for Ctrl/Cmd+K to suppress xterm's own handling), in addition to (or instead of) the `window`-level listener needed for the "works even when focus is elsewhere on the board" requirement. At minimum, the `window`-level handler should check `event.defaultPrevented` or coordinate with `TerminalView` so Ctrl+K is consumed exactly once, never forwarded to the PTY.

### WR-02: `sanitizePhaseId`'s 2-digit minimum silently drops the action button for un-padded single-digit phase numbers

**Fix status:** fixed — `src/planning/actions.ts` (commit `1005ddd`). `PHASE_ID_PATTERN` relaxed to `^\d+(\.\d+)?$` (first suggested option) — still fully anchored, still rejects any non-digit/injection characters. Updated `src/planning/actions.test.ts`: `"3"` moved from the reject list to the accept list, plus `"9"`/`"9.1"` added as additional single-digit coverage.

**File:** `src/planning/actions.ts:73`
**Issue:** `PHASE_ID_PATTERN = /^\d{2,}(\.\d+)?$/` requires at least two digits before any optional decimal suffix. `phase-scan.ts`'s own directory-name pattern (`PHASE_DIR_NAME_PATTERN = /^(\d+(?:\.\d)?)-(.+)$/`, `src/planning/phase-scan.ts:33`) accepts a single digit (e.g. a real directory named `9-something-phase`), which this project's own convention avoids (`01-`, `02-`, `03-`...) but which other GSD repositories — this app's stated target audience per `CLAUDE.md` ("Feito para a comunidade GSD") — are not guaranteed to follow. Such a phase renders normally everywhere else on the board (status badge, progress bar, requirements) but silently gets **no** action button in either `PhaseCard` or `DetailPanel`, with no tooltip/warning explaining why — indistinguishable in the UI from the `complete` terminal state.
**Fix:** Either relax `PHASE_ID_PATTERN` to `^\d+(\.\d+)?$` (still fully anchored, still rejects anything with non-digit/injection characters — the T-03-01 threat is about disallowed characters, not digit count) or, if the 2-digit minimum is intentional, surface a visible degraded state (e.g. a disabled button with a "phase id not recognized" tooltip) instead of silently rendering nothing.

## Info

### IN-01: `resolveInjection` is recomputed twice per click in `GsdCommandToolbar`

**Fix status:** fixed — `src/components/terminal/GsdCommandToolbar.tsx` (commit `8dbf112`). `resolution` is now computed once per entry in the `.map()` body and passed into `handleCommandClick(resolution)`; the `entry` parameter that became redundant after this change was removed from the signature. Covered indirectly by the existing `DrawerRail.test.tsx` toolbar click tests, which pass unchanged.

**File:** `src/components/terminal/GsdCommandToolbar.tsx:189-208, 223-229`
**Issue:** The same `resolveInjection({...})` call (identical inputs) is evaluated once per entry during render (to derive the button's visual state) and again inside `handleCommandClick` when the button is actually clicked — duplicated computation of a pure function with the same arguments, unlike `PhaseCardAction`, which computes `resolution` once per render and reuses it in `handleClick`.
**Fix:** Compute `resolution` once in the `.map()` body and pass it into `handleCommandClick(entry, resolution)` instead of recomputing.

### IN-02: `PhaseCardAction`'s prefill path never returns keyboard focus to the terminal, unlike the toolbar/palette's identical prefill path

**Fix status:** fixed — `src/components/PhaseCardAction.tsx` (commit `e6afe95`). Imports `focusTerminalSurface` from `./terminal/GsdCommandToolbar` and calls it in the `isPrefill` branch of `handleClick`, matching `GsdCommandToolbar`/`CommandPalette`. Regression test added in `src/components/PhaseCardAction.test.tsx` asserting a `.xterm-helper-textarea` element receives focus after a prefill click.

**File:** `src/components/PhaseCardAction.tsx:119-128`
**Issue:** `GsdCommandToolbar.handleCommandClick` (`GsdCommandToolbar.tsx:205-207`) and `CommandPalette.activateEntry` (`CommandPalette.tsx:119-121`) both call `focusTerminalSurface()` after a `prefill` write so the user can immediately press Enter. `PhaseCardAction.handleClick` performs the identical `writeSession` + prefill flow but never calls `focusTerminalSurface()`, leaving the user to manually click into the terminal before confirming — an inconsistent experience across the three surfaces that are documented as sharing one behavior contract.
**Fix:** Call `focusTerminalSurface()` (import from `./terminal/GsdCommandToolbar`, or hoist it to a shared module) in `PhaseCardAction`'s `isPrefill` branch, matching the other two surfaces.

## Fix Verification

All 6 findings (2 critical, 2 warning, 2 info) fixed across 6 atomic commits on this branch. `npm test` (401 tests, up from 383 baseline — 18 new regression tests) and `npm run typecheck` both green after every commit.

| Finding | Commit | Files |
|---|---|---|
| CR-01 | `cd332e1` | `src/stores/session-store.ts`, `src/stores/session-store.test.ts`, `src/components/terminal/TerminalView.tsx` |
| CR-02 | `f0f50e5` | `src/components/terminal/useTerminalActivity.ts`, `src/components/terminal/useTerminalActivity.test.ts` |
| WR-01 | `8d83cdf` | `src/components/terminal/TerminalView.tsx`, `src/components/terminal/TerminalView.test.ts` |
| WR-02 | `1005ddd` | `src/planning/actions.ts`, `src/planning/actions.test.ts` |
| IN-01 | `8dbf112` | `src/components/terminal/GsdCommandToolbar.tsx` |
| IN-02 | `e6afe95` | `src/components/PhaseCardAction.tsx`, `src/components/PhaseCardAction.test.tsx` |

CR-01/CR-02 are cross-file wiring/state-machine defects — per `verification_strategy`'s logic-bug caveat, their fixes were verified with targeted regression tests proving the exact failure mode described in the finding no longer reproduces (see each finding's "Fix status" note above), not just syntax/type checks, but a human should still confirm end-to-end via `/gsd-verify-work` given the LOW-confidence marker regexes noted in `03-RESEARCH.md`'s Assumptions Log (A1/A2).

---

_Reviewed: 2026-07-24T03:23:05Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
