---
phase: 03-board-interativo
plan: 04
subsystem: ui
tags: [react, zustand, i18next, class-variance-authority, css-animation]

# Dependency graph
requires:
  - phase: 03-board-interativo (Plan 01)
    provides: "derivePhaseAction/sanitizePhaseId (src/planning/actions.ts), PhaseCardAction's three-state skeleton and variant=\"detail\" prop already wired"
  - phase: 03-board-interativo (Plan 03)
    provides: "SessionDescriptor.activity field + transition-gated setActivity() (src/stores/session-store.ts), TerminalActivity type (src/pty/activity.ts)"
provides:
  - "src/planning/injection.ts — resolveInjection(): the single pure resolver for the entire Injection Behavior Matrix (send/prefill/blocked/unavailable), consumed by every command-emitting surface (today: PhaseCardAction; future: toolbar/palette in Plan 05)"
  - "src/components/ActivityDot.tsx — TONE_BY_ACTIVITY map + presentational dot, reused by SessionRow (live rows) and DetailPanel (send-to caption)"
  - ".status-dot--pulse CSS modifier (theme.css) — first real implementation of the pulse animation Phase 2's UI-SPEC described in prose but never shipped"
  - "terminal.activity.{idle,busy,awaiting} i18n keys (pt-BR + en)"
  - "PhaseCardAction upgraded from idle-only (Plan 01) to the full three-state busy/awaiting/idle guard"
  - "SessionRow's live-variant dot now activity-aware (falls back to Phase 2's static success dot when activity is undefined)"
  - "DetailPanel's new action + \"send to\" caption row"
affects: [03-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolveInjection centralizes the busy/awaiting/idle/no-target decision as a pure function returning {mode, payload, guardKey} — every injection surface (card, detail panel, and Plan 05's toolbar/palette) calls it instead of re-deriving the guard logic"
    - "ActivityDot composes statusDotVariants + a new .status-dot--pulse modifier class (same compositional pattern as the existing .status-dot--outline) so StatusTone stays a closed 4-value enum"
    - "DetailPanel splits an i18n interpolation template around a marker string (SESSION_SLOT_MARKER) to apply a different font-family to just the interpolated session-id substring, without introducing a new i18n key or <Trans>"

key-files:
  created:
    - src/planning/injection.ts
    - src/planning/injection.test.ts
    - src/components/ActivityDot.tsx
  modified:
    - src/styles/theme.css
    - src/locales/pt-BR/terminal.json
    - src/locales/en/terminal.json
    - src/components/PhaseCardAction.tsx
    - src/components/PhaseCardAction.test.tsx
    - src/components/session/SessionRow.tsx
    - src/components/session/SessionRow.test.tsx
    - src/components/DetailPanel.tsx
    - src/components/DetailPanel.test.tsx

key-decisions:
  - "undefined activity (session live but not yet classified this run) is treated as idle throughout — both by resolveInjection (send immediately) and by ActivityDot's tone (falls back to the Phase 2 static success dot, no pulse) — consistent single interpretation of \"no signal yet\" across every consumer"
  - "DetailPanel's caption reuses board.actions.sendTo verbatim (no new i18n key) by splitting the interpolated template around a private marker string to give the session-id substring its own JetBrains Mono span"

patterns-established:
  - "Pure injection-matrix resolver as the single source of truth for busy/awaiting/idle/no-target behavior — future command-emitting surfaces (Plan 05's toolbar/palette) call resolveInjection instead of reimplementing the guard"

requirements-completed: [ACT-01, ACT-02, ACT-03]

coverage:
  - id: D1
    description: "resolveInjection implements the full Injection Behavior Matrix as a pure function: no live target -> unavailable; busy -> blocked with payload null and zero injection; phase/parameterless idle-or-undefined -> send + CR; awaiting -> prefill with no CR; parameterized -> always prefill + trailing space regardless of idle/awaiting"
    requirement: ACT-02
    verification:
      - kind: unit
        ref: "src/planning/injection.test.ts — 24 tests, full {kind}x{activity}x{hasLiveTarget} table"
        status: pass
    human_judgment: false
  - id: D2
    description: "PhaseCardAction's three visual states (solid accent fill / accent outline / disabled) are driven by resolveInjection's mode: busy target disables the button and click never calls writeSession; awaiting target writes the command WITHOUT a trailing CR and shows the guard.prefilled hint; idle target writes with CR and shows no hint"
    requirement: ACT-02
    verification:
      - kind: unit
        ref: "src/components/PhaseCardAction.test.tsx#PhaseCardAction — guard de atividade (ACT-03) — 3 tests (busy/awaiting/idle)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SessionRow's live-variant dot reflects session.activity (busy->warning+pulse, awaiting->accent+pulse, idle->success no pulse) via ActivityDot; undefined activity keeps the Phase 2 static success dot; historical dot is unaffected even if activity happens to be set"
    requirement: ACT-03
    verification:
      - kind: unit
        ref: "src/components/session/SessionRow.test.tsx#SessionRow — dot ativo por atividade (ACT-03) — 5 tests"
        status: pass
    human_judgment: false
  - id: D4
    description: "DetailPanel renders PhaseCardAction (variant=detail) + a \"Enviar para: Sessão <id8>\" caption + ActivityDot for a non-complete phase with a live target session; falls back to the guard.noSession caption with no session label/dot when none exists; a complete phase renders neither button nor caption"
    requirement: ACT-01
    verification:
      - kind: unit
        ref: "src/components/DetailPanel.test.tsx#DetailPanel — ação contextual + legenda de envio (ACT-01/02/03) — 3 tests"
        status: pass
    human_judgment: false
  - id: D5
    description: "writeSession rejection from the card/detail action surfaces board.actions.error.injectFailed transiently and the button returns to enabled — carried forward from Plan 01, still exercised after the resolveInjection refactor"
    verification:
      - kind: unit
        ref: "src/components/PhaseCardAction.test.tsx#writeSession rejeitando mostra board.actions.error.injectFailed e o botão volta habilitado (backstop, T-03-02)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The true end-to-end 'busy blocks / awaiting prefills without stealing Enter / idle sends' check against a real live claude session"
    verification: []
    human_judgment: true
    rationale: "A jsdom test cannot spawn/observe a real PTY-backed claude process or a genuine permission prompt — deferred to /gsd-verify-work per this plan's own <verification> section, same discipline as Plan 01's D8 and Plan 03's D5 (BUSY_MARKER/AWAITING_MARKER regex accuracy, still an open backstop from Plan 03)."

# Metrics
duration: 33min
completed: 2026-07-24
status: complete
---

# Phase 3 Plan 04: Injection Guard Matrix + ActivityDot + DetailPanel Actions Summary

**A single pure `resolveInjection` resolver encodes the entire busy/awaiting/idle/no-target Injection Behavior Matrix, consumed by an upgraded three-state `PhaseCardAction`, an activity-aware `SessionRow` dot, and a new `DetailPanel` action+caption row — closing ACT-02/ACT-03's safety-critical guard and ACT-01's second injection surface.**

## Performance

- **Duration:** 33 min
- **Started:** 2026-07-24T02:47:00Z
- **Completed:** 2026-07-24T03:20:00Z
- **Tasks:** 3
- **Files modified:** 12 (3 created, 9 modified)

## Accomplishments
- `resolveInjection({command, kind, activity, hasLiveTarget})` — pure function implementing `03-UI-SPEC.md`'s `## Injection Behavior Matrix` exactly: no live target → `unavailable`; busy → `blocked` with `payload: null` and zero injection attempted (never queued); idle/undefined → `send` (+CR) for `phase`/`parameterless`, `prefill` (+trailing space, no CR) for `parameterized`; awaiting → always `prefill`, never CR, with the trailing space still applied when `parameterized`. `undefined` activity (session live but not yet classified this run) is treated as idle throughout.
- `ActivityDot` — presentational primitive reusing `statusDotVariants` + a new `.status-dot--pulse` CSS modifier (opacity 100%→40%→100%, 1200ms loop, composed on top of the existing tone class exactly like `.status-dot--outline`, keeping `StatusTone` a closed 4-value enum). `TONE_BY_ACTIVITY`: idle→success (static), busy→warning (pulse), awaiting→accent (pulse).
- `terminal.activity.{idle,busy,awaiting}` added to both `pt-BR` and `en` `terminal.json`.
- `PhaseCardAction` upgraded from Plan 01's idle-only button to the full three-state guard: solid accent fill (send), accent outline (prefill), disabled secondary-border/40%-opacity (blocked/unavailable) with the resolver's `guardKey` as the native `title`. Click on a blocked/unavailable button never calls `writeSession`. A `prefill` click shows the existing `guard.prefilled` transient hint (2500ms, same timeout as the Plan 01 error hint).
- `SessionRow`'s `variant === "live"` dot now renders via `ActivityDot` when `session.activity` is set, superseding Phase 2's permanently-static `success` dot per the UI-SPEC's documented override; falls back to the original static dot when activity is `undefined`. `historical`/`starting`/`exited` variants are untouched.
- `DetailPanel` gained a new row directly below the existing `StatusBadge` row: `PhaseCardAction` (`variant="detail"`) + a "Enviar para: Sessão `<id8>`" caption (JetBrains Mono for just the session-id substring, via a template-split trick — no new i18n key) + `ActivityDot`. No live target → caption falls back to `board.actions.guard.noSession`, no session label/dot. Complete phase (or an invalid `phase.id`, T-03-01) → neither button nor caption, same gate `PhaseCardAction` already applies internally.
- Full suite: 365/365 tests green (up from the 330-test baseline: +24 `injection.test.ts`, +3 `PhaseCardAction.test.tsx`, +5 `SessionRow.test.tsx`, +3 `DetailPanel.test.tsx`). `npm run typecheck` clean throughout.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure injection-matrix resolver + ActivityDot primitive + pulse + activity i18n** - `96a1d10` (feat)
2. **Task 2: Three-state card action guard + activity-aware SessionRow dot** - `794ba67` (feat)
3. **Task 3: DetailPanel contextual action + "send to" caption surface** - `92e7a1f` (feat)

_No RED/GREEN/REFACTOR multi-commit split — `TDD_MODE=false` per the executor's `<mode>` instruction; tests were written alongside implementation and green before each task's single commit._

## Files Created/Modified
- `src/planning/injection.ts` - `resolveInjection`/`InjectionKind`/`InjectionMode`/`InjectionResolution` — the pure Injection Behavior Matrix resolver
- `src/planning/injection.test.ts` - 24 tests: full `{kind}x{activity}x{hasLiveTarget}` matrix table
- `src/components/ActivityDot.tsx` - `TONE_BY_ACTIVITY` + presentational dot composing `statusDotVariants` + `.status-dot--pulse`
- `src/styles/theme.css` - `.status-dot--pulse` modifier + `status-dot-pulse` keyframes
- `src/locales/pt-BR/terminal.json` / `src/locales/en/terminal.json` - `activity.{idle,busy,awaiting}` keys
- `src/components/PhaseCardAction.tsx` - Reads target session `activity`, calls `resolveInjection(kind="phase")`, branches the three visual states, shows `guard.prefilled` hint on prefill
- `src/components/PhaseCardAction.test.tsx` - Extended: busy→disabled+no writeSession, awaiting→prefill without `\r`+hint, idle(explicit)→send with `\r`
- `src/components/session/SessionRow.tsx` - Live-variant dot renders `ActivityDot` when `session.activity` is set
- `src/components/session/SessionRow.test.tsx` - Extended: 5 new tests (busy/awaiting/idle/undefined/historical-unaffected)
- `src/components/DetailPanel.tsx` - New action+caption row below `StatusBadge`, reusing `PhaseCardAction`/`ActivityDot`/`board.actions.sendTo`
- `src/components/DetailPanel.test.tsx` - Extended: 3 new tests (action+caption with live session, noSession fallback, complete→neither)

## Decisions Made
- **`undefined` activity is treated as idle everywhere**, not just in `resolveInjection`: `ActivityDot` isn't called with `undefined` directly (its prop type is the closed `TerminalActivity` union) — both `SessionRow` and `DetailPanel` coerce `session.activity ?? "idle"`/keep the pre-existing static dot for the `undefined` case, matching the UI-SPEC's documented "session with no activity signal yet falls back to the Phase 2 static success dot" rule.
- **DetailPanel's session-id substring gets its own JetBrains Mono span without a new i18n key**: `board.actions.sendTo`'s `"Enviar para: {{session}}"` template is rendered once with a private marker string (`SESSION_SLOT_MARKER = "%%SESSION%%"`) as the `session` interpolation value, then the resulting string is split on that marker into a prefix/suffix pair, letting the id substring be wrapped in its own `<span style={{fontFamily: mono}}>` — reuses the existing translated copy verbatim per the plan's explicit instruction ("do not add new i18n keys here"), while still matching the UI-SPEC's "same session label format... JetBrains Mono" requirement for just the id part.
- **DetailPanel's action/caption row gates on the exact same `derivePhaseAction`/`sanitizePhaseId` check `PhaseCardAction` performs internally** (not just "phase is complete") — an invalid `phase.id` (T-03-01) hides the row entirely rather than showing a caption next to a button that silently doesn't render, keeping the two surfaces' behavior identical ("matching the card" per the plan's own instruction).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `DetailPanel.tsx` initial marker constant accidentally contained a literal NUL byte**
- **Found during:** Task 3, while authoring the template-split helper for the "send to" caption
- **Issue:** A first attempt at `SESSION_SLOT_MARKER` was intended to be a single space character but the tool call inserted a literal `\0` byte into the source file (confirmed via `od -c`), turning `DetailPanel.tsx` into a file `grep`/`file` classified as binary — a real correctness/tooling risk (NUL bytes in a TS/JSX source file can break some editors, linters, and bundlers unpredictably even though `tsc`/`vitest` happened to still parse it).
- **Fix:** Rewrote the file cleanly with a printable, collision-improbable marker string (`"%%SESSION%%"`) instead of a control character, verified with `file`/`grep -a` that the file is plain UTF-8 text again.
- **Files modified:** `src/components/DetailPanel.tsx`
- **Verification:** `file src/components/DetailPanel.tsx` reports "ASCII/Unicode text" (not binary); `npx vitest run src/components/DetailPanel.test.tsx` and `npm run typecheck` both green.
- **Committed in:** `92e7a1f` (Task 3 commit) — the NUL byte never reached a commit; it was caught and fixed before staging.

---

**Total deviations:** 1 auto-fixed (Rule 1 — tooling artifact caught before any commit, not a plan-authored bug)
**Impact on plan:** No scope creep — pure authoring-time fix, same final behavior the plan specified.

## Issues Encountered
None beyond the auto-fixed tooling artifact above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `resolveInjection` is the single resolver every future command-emitting surface should call — Plan 05's `GsdCommandToolbar`/`CommandPalette` (parameterless/parameterized kinds) can consume it directly with zero guard-logic duplication; `InjectionKind`'s `"parameterless"`/`"parameterized"` variants already exist and are fully tested even though no Plan 04 surface uses them yet.
- `ActivityDot` (with `showLabel`) is ready for `TerminalPane`'s chrome header (Plan 05, per `03-UI-SPEC.md` `## Terminal Activity Indicator` item 1) — only rendered once activity is known, same pattern already proven here in `SessionRow`/`DetailPanel`.
- Two `verification: backstop` items remain open, carried forward unmodified from earlier plans: `QUIESCENCE_MS`/`BUSY_MARKER`/`AWAITING_MARKER` empirical accuracy (Plan 03's D5) and this plan's own D6 (busy-blocks/awaiting-prefills-without-stealing-Enter against a real live `claude` session) — both require `/gsd-verify-work 3` against a real terminal, not deferrable further within Plan 05.
- No blockers for Plan 05.

---
*Phase: 03-board-interativo*
*Completed: 2026-07-24*

## Self-Check: PASSED
All created/modified files exist on disk; all 3 task commit hashes (96a1d10, 794ba67, 92e7a1f) found in git log.
