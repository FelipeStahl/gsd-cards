---
phase: 03-board-interativo
verified: 2026-07-24T03:40:13Z
status: human_needed
score: 9/9 must-haves verified (automated)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Open a real project with a live `claude` session. Wait for Claude to start a long task (spinner/'esc to interrupt' visible in the terminal). Click a phase card's action button, the DetailPanel action, a GsdCommandToolbar icon, and a CommandPalette row while busy."
    expected: "All four surfaces render/behave as disabled (or, for the palette, disabled-in-list) with the `guard.busy` tooltip; NONE of them call writeSession — zero bytes reach the live PTY while Claude is busy."
    why_human: "classifyActivity's BUSY_MARKER (`/esc to interrupt/i`) and AWAITING_MARKER (`/do you want to proceed\\?/i`) are LOW-confidence assumptions with no vendor-published Claude CLI output contract (03-RESEARCH.md Assumptions Log A1). A jsdom/vitest test cannot spawn or observe a real PTY-backed claude process, so marker accuracy against real CLI byte output cannot be proven in this headless environment. Explicitly flagged verification:backstop in 03-03-PLAN.md, carried forward unresolved through 03-04/03-05 SUMMARY.md."
  - test: "With the same real session, trigger a permission prompt ('Do you want to proceed?'). Confirm the busy-guard flip: while Claude is busy and mid-task, wait for it to stop being busy and observe whether the activity dot flickers between busy/idle on normal streaming-token cadence."
    expected: "The activity dot flips to busy immediately on the first byte of new output after quiescence and flips back to idle only after ~500ms of continued silence — no flicker during normal token-streaming/spinner cadence, no false-idle mid-stream."
    why_human: "QUIESCENCE_MS=500ms is an empirically-tuned constant with no real Claude CLI burst to validate against in this sandbox (03-RESEARCH.md Assumption A2, LOW confidence). Explicitly flagged verification:backstop and MANDATORY non-deferred in 03-03-PLAN.md."
  - test: "With a live session showing a real permission prompt ('Do you want to proceed? ❯ 1. Yes'), click a card action, the DetailPanel action, a toolbar button, or a palette row."
    expected: "The command is prefilled into the terminal's input line WITHOUT a trailing Enter/carriage-return — the user's own Enter keystroke (answering the actual permission prompt) is never stolen or double-submitted."
    why_human: "The true end-to-end 'awaiting prefills without stealing Enter' behavior against a real PTY-backed claude process and a genuine permission prompt cannot be exercised by a jsdom test (no real terminal I/O). Explicitly deferred to /gsd-verify-work by 03-01 (D8), 03-04 (D6), and 03-05 (D6) SUMMARY.md — all three still open."
  - test: "With the terminal genuinely focused (click into the xterm surface) and a session live, press Ctrl+K (or Cmd+K on macOS)."
    expected: "The command palette opens and the keystroke is NOT also delivered to the live PTY (i.e., no readline 'kill to end of line' side-effect reaches the running claude process)."
    why_human: "WR-01's fix (src/components/terminal/TerminalView.tsx's createTerminalKeyHandler intercepting Ctrl/Cmd+K via attachCustomKeyEventHandler) is unit-tested against xterm's handler function directly, but the real end-to-end interaction between a genuinely-DOM-focused xterm instance and a live PTY write cannot be observed in jsdom (no real canvas/WebGL renderer, per the 'HTMLCanvasElement getContext not implemented' warnings seen during `npx vitest run`)."
---

# Phase 3: Board interativo Verification Report

**Phase Goal:** O board deixa de ser só espelho e passa a guiar o fluxo — cards mostram ações contextuais por status e disparam o `/gsd-*` certo no terminal da sessão, com segurança contra injeção quando o Claude está ocupado; paleta/atalhos GSD no drawer.
**Verified:** 2026-07-24T03:40:13Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A non-`complete` phase card renders exactly one contextual primary action button matching `phase.diskStatus` (ACT-01) | ✓ VERIFIED | `src/planning/actions.ts` `derivePhaseAction` — exhaustive 8-case switch with `never`-checked default, driven by `diskStatus` not `badge`, exactly per D-ACT01. `src/planning/actions.test.ts` table-driven over all 8 values; `PhaseCard.test.tsx`/`PhaseCardAction.test.tsx` assert render. `complete` → null → no button (`derivePhaseAction` case `complete: return null`). |
| 2 | Clicking a card action on a live idle session writes `/gsd-<command>-phase <sanitized-id>\r` to `writeSession` on the active/last-focused live session (ACT-02) | ✓ VERIFIED | `src/components/PhaseCardAction.tsx:99-134` — `resolveInjection` mode `send` → `writeSession(target.id, payload)`; `injection.ts` `send` payload = `command + "\r"`. Unit-proven in `PhaseCardAction.test.tsx` and `injection.test.ts` (24-case matrix). |
| 3 | `phase.id` is validated against an anchored digit pattern before interpolation; a non-matching id yields no button, never a best-effort-sanitized string (T-03-01) | ✓ VERIFIED | `src/planning/actions.ts:84-93` `PHASE_ID_PATTERN = /^\d+(\.\d+)?$/` (WR-02-relaxed to accept single digits, still fully anchored — rejects `"3; rm -rf ~"`, `"03\rmalicious"`); `sanitizePhaseId` returns `null` on mismatch, `PhaseCardAction.tsx:93` `if (!action \|\| !sanitizedId) return null;` — no button, not a disabled one. |
| 4 | App detects terminal state (idle/busy/awaiting) from the live PTY byte stream for EVERY live session (foreground and background), and this state never goes stale (ACT-03) | ✓ VERIFIED | `src/pty/activity.ts` pure `classifyActivity`/`appendToRollingBuffer`; `src/pty/channel.ts` always-on `activityHandlers` dual-map (independent of focus-routed `bytesHandlers`); `src/stores/session-store.ts` `createSession` wires `wireTerminalActivity` for the FULL session lifetime (fixed post-review, CR-01, commit `cd332e1` — previously only wired while `TerminalView` was mounted, going stale on focus loss/drawer collapse). Regression test: `session-store.test.ts` "activity wiring lifecycle (CR-01)". |
| 5 | Injection is BLOCKED (zero writes, never queued) while the target session is busy; PREFILLED (no `\r`, no stolen Enter) while awaiting permission; a stale `awaiting` classification cannot mask genuinely busy output (ACT-03 guard) | ✓ VERIFIED | `src/planning/injection.ts` `resolveInjection`: `busy` → `{mode:"blocked", payload:null}`; `awaiting` → `{mode:"prefill", payload: command (no \r)}`. Buffer-staleness bug found and fixed post-review (CR-02, commit `f0f50e5`): `useTerminalActivity.ts:48-66` now clears the rolling buffer immediately after ANY confirmed marker match, so a resolved `awaiting` marker can never re-match against later busy output. Regression tests added covering awaiting→busy transitions. |
| 6 | No-session (or `claude` missing) target renders every injection surface disabled with the correct guard copy, never hidden | ✓ VERIFIED | `resolveInjection` `hasLiveTarget=false` → `unavailable`/`guard.noSession`; consumed identically by `PhaseCardAction`, `DetailPanel`, `GsdCommandToolbar` (9 buttons), and `CommandPalette` (input + all rows disabled, placeholder becomes noSession copy). |
| 7 | `writeSession` rejection surfaces a transient, visible error and the surface returns to enabled — never a silent no-op (T-03-02, both JS and real Rust boundary) | ✓ VERIFIED | JS: `PhaseCardAction.tsx` `.catch(() => showTransientMessage("error"))`, unit-tested. Rust: `src-tauri/tests/write_session_rejects.rs` — `cargo test` run directly by this verification, PASSED — asserts the real `PtyError::NotFound` (typed variant, not `is_err()`), its serde `"NotFound"` payload, and `Display` text, on a real `PtyManager` with no mock. |
| 8 | The DetailPanel exposes the same guarded contextual action + a "send to session" caption with an activity dot; a `complete` phase shows neither (ACT-01 second surface) | ✓ VERIFIED | `src/components/DetailPanel.tsx` — new row reusing `PhaseCardAction variant="detail"` + `board.actions.sendTo` caption + `ActivityDot`; gated on the same `derivePhaseAction`/`sanitizePhaseId` check as the card, `DetailPanel.test.tsx` (3 tests: live session, no-session fallback, complete → neither). |
| 9 | A GSD command toolbar (9 curated `/gsd-*` shortcuts) + Cmd/Ctrl+K palette live in the drawer, confined to the aside, and every emitting row obeys the same injection guard as the card (ACT-04) | ✓ VERIFIED | `src/components/terminal/GsdCommandToolbar.tsx` (`GSD_COMMANDS`, 9 fixed-order entries, `discuss/plan/execute/verify` parameterized, `quick/next/progress/status/help` parameterless — `status` resolves to `/gsd-stats`, confirmed against `.claude/commands/` which has `gsd-stats.md` and no `gsd-status.md`); `CommandPalette.tsx` (search/filter by label OR token, keyboard nav, per-row `resolveInjection`, busy disabled-in-place never filtered); mounted in `DrawerRail.tsx`'s expanded `<aside>` (`position: relative`), only when a session is active. `DrawerRail.test.tsx`/`CommandPalette.test.tsx` green. |

**Score:** 9/9 automatable truths verified. No truth is behavior-dependent-and-unproven in a way that trips ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (the state-transition logic itself — busy immediate-flip, idle-after-quiescence, transition-gated store updates — IS exercised by passing fake-timer unit tests in `useTerminalActivity.test.ts`/`session-store.test.ts`). What remains open is *empirical accuracy of the marker regexes and timing constant against a real Claude CLI process*, which is a fundamentally different kind of gap (an untestable-in-this-environment external contract, not an unexercised code path) — routed to Human Verification below per the plans' own explicit, MANDATORY, non-deferred backstop items.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/planning/actions.ts` | `derivePhaseAction`, `sanitizePhaseId` | ✓ VERIFIED | Exists, exhaustive, wired into `PhaseCardAction`/`DetailPanel` |
| `src/planning/injection.ts` | `resolveInjection`, `InjectionMode` | ✓ VERIFIED | Single resolver, consumed by 4 surfaces (card, detail, toolbar, palette) |
| `src/components/PhaseCardAction.tsx` | 3-state injection button | ✓ VERIFIED | Mounted in `PhaseCard` Row 2 + `DetailPanel` (variant="detail") |
| `src/components/ActivityDot.tsx` | Tone+pulse dot | ✓ VERIFIED | Used in `SessionRow` (live variant) + `DetailPanel` |
| `src/pty/activity.ts` | `classifyActivity`, markers, constants | ✓ VERIFIED | Pure, 13 unit tests; imports only `strip-ansi` |
| `src/pty/channel.ts` | `activityHandlers` dual-map | ✓ VERIFIED | Always-on second consumer; `killSession` deletes from both maps |
| `src/stores/session-store.ts` | `SessionDescriptor.activity`, transition-gated `setActivity`, session-lifetime activity wiring | ✓ VERIFIED | CR-01 fix confirmed present: wiring happens in `createSession`, torn down only in `killSession`/`archiveSession` |
| `src/components/terminal/useTerminalActivity.ts` | Decoder+timer shell | ✓ VERIFIED | CR-02 fix confirmed present: buffer cleared on any confirmed marker match |
| `src/components/terminal/GsdCommandToolbar.tsx` | 9-button toolbar + Cmd/Ctrl+K | ✓ VERIFIED | `GSD_COMMANDS` fixed order, mounted in `DrawerRail` |
| `src/components/terminal/CommandPalette.tsx` | Search/filter/keyboard-nav overlay | ✓ VERIFIED | Confined `position:absolute`, busy rows disabled-in-place |
| `src-tauri/tests/write_session_rejects.rs` | Real Rust `PtyError::NotFound` proof | ✓ VERIFIED | `cargo test --test write_session_rejects` run directly, PASSED |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `PhaseCard` Row 2 | `PhaseCardAction` | mount | ✓ WIRED | `PhaseCard.tsx` mounts `<PhaseCardAction phase={phase} .../>` |
| `PhaseCardAction`/`DetailPanel`/`GsdCommandToolbar`/`CommandPalette` | `resolveInjection` | direct call | ✓ WIRED | All 4 surfaces call the same pure resolver, no guard reimplementation found |
| `resolveInjection` result | `writeSession` | `.catch()`-guarded call | ✓ WIRED | Every surface's `send`/`prefill` path calls `writeSession(id, payload).catch(...)` |
| `channel.ts onmessage` | `bytesHandlers` AND `activityHandlers` | dual dispatch | ✓ WIRED | `spawnSession`'s `onmessage` calls both maps unconditionally (`channel.ts:61-65`) |
| `session-store.createSession` | `wireTerminalActivity` | direct call at session creation | ✓ WIRED | Confirmed post-CR-01-fix; `activityStops` map tracks cleanup, torn down only at `killSession`/`archiveSession` |
| `DrawerRail` expanded aside | `GsdCommandToolbar` + `CommandPalette` | mount, `position:relative`/`position:absolute` | ✓ WIRED | `DrawerRail.tsx:48` mounts toolbar above `TerminalView`; toolbar conditionally renders palette |
| `TerminalView` xterm instance | Ctrl/Cmd+K interception | `attachCustomKeyEventHandler` | ✓ WIRED | WR-01 fix confirmed: `createTerminalKeyHandler` swallows Ctrl/Cmd+K before it reaches the PTY |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full JS test suite | `npx vitest run` | 401/401 tests, 40/40 files green | ✓ PASS |
| TypeScript compiles | `npm run typecheck` | clean, no output | ✓ PASS |
| Full Rust test suite | `cargo test --manifest-path src-tauri/Cargo.toml` | 24 unit + 2 integration tests, all green | ✓ PASS |
| Real Rust rejection boundary (single named test) | `cargo test --test write_session_rejects` | `write_to_absent_session_returns_typed_not_found ... ok` | ✓ PASS |
| Board read-only invariant (no `.planning/` writes) | `grep` for `fs::write`/`File::create`/`writeTextFile` in `src/`, `src-tauri/src/` | No matches | ✓ PASS |
| Debt markers (TBD/FIXME/XXX/HACK/PLACEHOLDER) in phase-touched files | `grep` across 13 core phase-3 files | No matches (one Portuguese false-positive "TODO o" = "all the", not a marker) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ACT-01 | 03-01, 03-04 | Cards offer contextual actions by status | ✓ SATISFIED | `derivePhaseAction` (8-case exhaustive), rendered in `PhaseCard` + `DetailPanel` |
| ACT-02 | 03-01, 03-04 | Firing an action sends the correct `/gsd-*` to the chosen/active session | ✓ SATISFIED | `resolveInjection` → `writeSession`, proven end-to-end at the JS mock + real Rust boundary |
| ACT-03 | 03-02, 03-03, 03-04 | App detects terminal state and refuses injection while busy | ✓ SATISFIED (automated) — marker/timing empirical accuracy is human_needed | `classifyActivity` + always-on `activityHandlers` + `resolveInjection`'s `busy → blocked` branch; CR-01/CR-02 wiring bugs found by code review and fixed with regression tests |
| ACT-04 | 03-05 | GSD shortcuts (palette/buttons) in the drawer next to the terminal | ✓ SATISFIED | `GsdCommandToolbar` (9 buttons) + `CommandPalette` (Cmd/Ctrl+K), confined to the aside, sharing `resolveInjection` |

No orphaned requirements — `REQUIREMENTS.md`'s Phase 3 row lists exactly ACT-01..04, and all four appear in the `requirements:` frontmatter of at least one of the five plans.

### Anti-Patterns Found

None (blocker or warning level) in the phase-3-touched files. No `TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER` markers, no `eval`/`innerHTML`, no hardcoded secrets (confirmed independently by `03-REVIEW.md`'s deep review and re-confirmed by this verification's own grep pass).

### Code Review Findings (03-REVIEW.md) — Independently Re-Verified

The phase's own deep code review found 2 critical + 2 warning + 2 info issues. This verification independently re-read the current state of every fixed file (not just the review's "Fix status" claim) and confirms all 6 are genuinely present in the code, not just claimed:

| Finding | Claimed Fix Commit | Re-Verified In Code |
|---------|--------------------|--------------------|
| CR-01 (activity classification goes stale off-focus) | `cd332e1` | ✓ `session-store.ts`'s `createSession`/`killSession`/`archiveSession` wire/unwind `wireTerminalActivity` independent of `TerminalView` mount |
| CR-02 (stale `awaiting` marker masks real `busy`) | `f0f50e5` | ✓ `useTerminalActivity.ts:52-66` clears buffer after any confirmed marker match |
| WR-01 (Ctrl+K leaks to PTY when terminal focused) | `8d83cdf` | ✓ `TerminalView.tsx`'s `createTerminalKeyHandler` intercepts via `attachCustomKeyEventHandler` |
| WR-02 (single-digit phase id silently loses its button) | `1005ddd` | ✓ `actions.ts:84` `PHASE_ID_PATTERN = /^\d+(\.\d+)?$/` |
| IN-01 (double `resolveInjection` call per click) | `8dbf112` | ✓ `GsdCommandToolbar.tsx` computes `resolution` once in `.map()`, passes into `handleCommandClick` |
| IN-02 (prefill doesn't return terminal focus) | `e6afe95` | ✓ `PhaseCardAction.tsx:126-133` calls `focusTerminalSurface()` on prefill |

### Human Verification Required

4 items need human testing against a real, running `claude` CLI session (see frontmatter `human_verification` for full detail). Summary:

1. **Busy-guard blocks real injection** — click every surface (card/detail/toolbar/palette) while Claude is genuinely mid-task; confirm zero `writeSession` calls succeed.
2. **No flicker on real cadence** — confirm the activity dot doesn't flicker busy/idle during normal token-streaming, and QUIESCENCE_MS=500ms feels correct.
3. **Awaiting-prefill never steals the real permission-prompt Enter** — confirm prefilled text sits in the input line without auto-submitting over a genuine "Do you want to proceed?" prompt.
4. **Ctrl+K doesn't leak into a focused live terminal** — confirm no readline side-effect reaches the real PTY when the shortcut is pressed with the terminal focused.

These four items are not code gaps — every mechanism they exercise (busy→blocked, awaiting→prefill-no-CR, quiescence timer, Ctrl+K interception) is implemented, unit-tested, and passing 401/401 automated tests plus the full Rust suite. They are explicitly flagged in the plans themselves (`verification: backstop`, LOW-confidence assumptions per `03-RESEARCH.md`'s Assumptions Log A1/A2) as requiring a real Claude CLI process that cannot be spawned/observed in this headless verification environment.

### Gaps Summary

No automated must-have failed. All 9 observable truths derived from the ROADMAP goal + all 5 plans' `must_haves` (including the code-review-driven CR-01/CR-02 fixes) are verified in the actual codebase — not just claimed in SUMMARY.md. 401/401 vitest tests, full `cargo test` suite (24 unit + 2 integration), and `npm run typecheck` all pass when run directly by this verification, not merely cited from SUMMARY.md. The board-read-only invariant holds (no `fs::write`/`writeTextFile` anywhere in `src/`/`src-tauri/src/`). Requirements ACT-01 through ACT-04 are all satisfied with no orphans.

The phase cannot reach a clean `passed` status because 4 backstop items — explicitly designed into the plans as MANDATORY, non-deferred, LOW-confidence assumptions about real Claude CLI byte output (marker regex text, quiescence timing) and real PTY/xterm focus interaction — structurally require a live desktop app + live `claude` process that this headless verification cannot spawn. This is the expected, planned outcome for this phase (every plan's own `<verification>` section names `/gsd-verify-work` as the place these get closed), not a sign of missing work.
