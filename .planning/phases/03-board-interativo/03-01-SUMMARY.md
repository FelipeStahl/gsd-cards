---
phase: 03-board-interativo
plan: 01
subsystem: ui
tags: [react, zustand, tauri, pty, i18next, lucide-react, rust]

# Dependency graph
requires:
  - phase: 02-sess-o-viva
    provides: "writeSession(sessionId, data) IPC primitive (src/pty/channel.ts), session-store's activeSessionId/lastFocusedSessionId/sessions[] (SESS-01/03), SessionRow's stopPropagation + transient-hint patterns"
provides:
  - "src/planning/actions.ts — derivePhaseAction (pure DiskStatus->{labelKey,command,icon} mapper) + sanitizePhaseId (T-03-01 allow-list)"
  - "src/components/PhaseCardAction.tsx — shared 3-state injection button (enabled/disabled/error), mounted in PhaseCard Row 2, reusable by a future DetailPanel plan via variant=\"detail\""
  - "board.actions.* i18n keys in both pt-BR (source) and en"
  - "src-tauri/src/pty.rs's PtyManager::write public method + src-tauri/tests/write_session_rejects.rs proving the real PtyError::NotFound rejection at the Rust boundary"
affects: [03-02, 03-03, 03-04, 03-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PhaseAction.labelKey carries a documentation-style board.* prefix (matches 03-UI-SPEC.md's copy table) but PhaseCardAction strips it before calling t() since useTranslation(\"board\") already scopes the namespace — same convention as StatusBadge.tsx's t(`status.${status}`)"
    - "PtyManager::write as a public method on the manager (mirrors the existing kill_all precedent) lets an external tests/ crate exercise the real Rust rejection path without a tauri::State/Channel"

key-files:
  created:
    - src/planning/actions.ts
    - src/planning/actions.test.ts
    - src/components/PhaseCardAction.tsx
    - src/components/PhaseCardAction.test.tsx
    - src-tauri/tests/write_session_rejects.rs
  modified:
    - src/components/PhaseCard.tsx
    - src/components/PhaseCard.test.tsx
    - src/locales/pt-BR/board.json
    - src/locales/en/board.json
    - src-tauri/src/pty.rs
    - src-tauri/src/lib.rs
    - src/shell/Board.test.tsx

key-decisions:
  - "An invalid phase.id (fails sanitizePhaseId) renders NO button at all — same treatment as the complete/null-action case — resolving an internal tension between the plan's <action> prose (\"a disabled button\") and its own must_haves truth #5 (\"a non-matching id yields a null action (no button)\") + the T-03-01 threat_model row in favor of the security-authoritative truths list"
  - "labelKey values keep the board.* prefix for documentation/test-contract fidelity to 03-UI-SPEC.md's copy table; PhaseCardAction strips the prefix before t() since the namespace is already scoped"

patterns-established:
  - "Three-state injection button (solid enabled / outlined-disabled-guard / transient-error), consumed today by PhaseCard, designed for DetailPanel reuse (variant prop already wired)"

requirements-completed: [ACT-01, ACT-02]

coverage:
  - id: D1
    description: "A non-complete phase card renders exactly one primary action button matching the locked status->action mapping (all 8 DiskStatus values)"
    requirement: ACT-01
    verification:
      - kind: unit
        ref: "src/planning/actions.test.ts#derivePhaseAction — os 8 valores de DiskStatus"
        status: pass
      - kind: unit
        ref: "src/components/PhaseCard.test.tsx#PhaseCard — ação contextual de fase (ACT-01) > fase não-complete renderiza o botão de ação mapeado"
        status: pass
    human_judgment: false
  - id: D2
    description: "complete status renders no action button; Row 2 reserves no space for it"
    requirement: ACT-01
    verification:
      - kind: unit
        ref: "src/planning/actions.test.ts#derivePhaseAction complete -> null"
        status: pass
      - kind: unit
        ref: "src/components/PhaseCard.test.tsx#fase complete não renderiza nenhum botão de ação"
        status: pass
    human_judgment: false
  - id: D3
    description: "Clicking the action on a live idle active session writes the sanitized /gsd-<command>-phase <id>\\r to writeSession exactly once"
    requirement: ACT-02
    verification:
      - kind: unit
        ref: "src/components/PhaseCardAction.test.tsx#clicar numa fase planned com sessão ativa viva escreve o comando sanitizado + \\r"
        status: pass
    human_judgment: false
  - id: D4
    description: "No live/active session -> button renders disabled with board.actions.guard.noSession tooltip, never hidden; click never calls writeSession"
    requirement: ACT-02
    verification:
      - kind: unit
        ref: "src/components/PhaseCardAction.test.tsx#sem sessão ativa/viva, o botão renderiza desabilitado com a dica noSession e não escreve nada ao clicar"
        status: pass
    human_judgment: false
  - id: D5
    description: "A phase.id failing the anchored ^\\d{2,}(\\.\\d+)?$ pattern never produces a button (T-03-01) — no best-effort-sanitized string is ever interpolated"
    verification:
      - kind: unit
        ref: "src/planning/actions.test.ts#sanitizePhaseId — allow/deny (T-03-01)"
        status: pass
      - kind: unit
        ref: "src/components/PhaseCardAction.test.tsx#phase.id inválido (T-03-01) não renderiza nenhum botão, mesmo com sessão viva"
        status: pass
    human_judgment: false
  - id: D6
    description: "writeSession rejection surfaces board.actions.error.injectFailed as a transient message and the button returns to enabled — never a silent no-op (T-03-02 backstop, JS boundary)"
    verification:
      - kind: unit
        ref: "src/components/PhaseCardAction.test.tsx#writeSession rejeitando mostra board.actions.error.injectFailed e o botão volta habilitado (backstop, T-03-02)"
        status: pass
    human_judgment: false
  - id: D7
    description: "At the real Rust boundary, a write to an absent/killed session id returns the typed, serde-serializable PtyError::NotFound — never a silent Ok(()) — the identical branch a killed session hits"
    verification:
      - kind: integration
        ref: "src-tauri/tests/write_session_rejects.rs#write_to_absent_session_returns_typed_not_found"
        status: pass
    human_judgment: false
  - id: D8
    description: "The true end-to-end 'command appears in a live running claude terminal' check"
    verification: []
    human_judgment: true
    rationale: "Explicitly deferred by the plan's own <verification> section to /gsd-verify-work — a jsdom test cannot spawn/observe a real PTY-backed claude process; the automated coverage above (D1-D7) proves every layer up to and including the real Rust write boundary."

duration: 21min
completed: 2026-07-24
status: complete
---

# Phase 3 Plan 01: Tracer — Inject Contextual /gsd-* Command From a Card Summary

**Tracer slice proving the full board->terminal injection path: derivePhaseAction/sanitizePhaseId (pure TS), PhaseCardAction (React, three-state button wired into PhaseCard Row 2), and a real Rust cargo test pinning PtyManager's typed NotFound rejection.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-07-24T02:13:00Z
- **Completed:** 2026-07-24T02:34:21Z
- **Tasks:** 3
- **Files modified:** 12 (7 created, 5 modified) + 2 downstream test fixes (Board.test.tsx, existing PhaseCard.test.tsx click test)

## Accomplishments
- `derivePhaseAction(diskStatus)` — exhaustive `DiskStatus -> PhaseAction | null` mapper mirroring `status.ts`'s `toBoardBadge` discipline (`never`-checked default), covering all 8 `DiskStatus` values, sourced from `phase.diskStatus` (never `badge`) per D-ACT01.
- `sanitizePhaseId(id)` — anchored `^\d{2,}(\.\d+)?$` allow-list (T-03-01); a non-matching id never produces a button, let alone an injected string.
- `PhaseCardAction` — presentational component consuming both, targeting `activeSessionId ?? lastFocusedSessionId` filtered to `origin === "live"`; solid-fill enabled state when a live session exists, disabled+`guard.noSession` tooltip when none does, transient `error.injectFailed` message (2500ms) + auto re-enable when `writeSession` rejects. Mounted at the end of `PhaseCard` Row 2 via `marginLeft: auto`, no new row.
- `board.actions.*` i18n keys added to both `pt-BR` (source) and `en` locales.
- Rust: `PtyManager::write` extracted as a public method (byte-identical to the old `write_session` command body); `write_session` now delegates. `src-tauri/tests/write_session_rejects.rs` proves the real `Err(PtyError::NotFound(id))` (matched on the exact variant), its serde serialization carrying `"NotFound"`, and its `Display` text — the identical branch a killed session's write would hit.
- Full JS suite (304 tests, up from the 278-test baseline) and the whole Rust crate (24 unit + 2 integration tests) both green; `npm run typecheck` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "inject the contextual /gsd-* command from a card" — tracer** - `7a6419b` (feat)
2. **Task 2: Exhaustive mapper + sanitization + injection-UI hardening tests** - `2a0b872` (test)
3. **Task 3: Prove the REAL Rust write-rejection at the backend boundary** - `4a97898` (test)

_No RED/GREEN/REFACTOR multi-commit split — `TDD_MODE=false` per the executor's `<mode>` instruction; tests were written alongside implementation and green before each task's single commit._

## Files Created/Modified
- `src/planning/actions.ts` - `derivePhaseAction`/`PhaseAction`/`sanitizePhaseId` — pure mapper + T-03-01 validation
- `src/planning/actions.test.ts` - Exhaustive 8-status table + sanitizePhaseId allow/deny table
- `src/components/PhaseCardAction.tsx` - The shared injection button (3 states: enabled/disabled/error)
- `src/components/PhaseCardAction.test.tsx` - Happy path, complete->nothing, no-session-disabled, invalid-id->nothing, inject-failure backstop
- `src/components/PhaseCard.tsx` - Mounts `<PhaseCardAction>` in Row 2
- `src/components/PhaseCard.test.tsx` - Extended: action button renders/doesn't per status, stopPropagation; fixed the now-ambiguous existing click-selection test
- `src/locales/pt-BR/board.json` / `src/locales/en/board.json` - `board.actions.*` keys
- `src-tauri/src/pty.rs` - `PtyManager::write` public method (extraction), `write_session` command now delegates
- `src-tauri/src/lib.rs` - `mod pty` -> `pub mod pty` (mirrors `process_guard`'s existing rationale)
- `src-tauri/tests/write_session_rejects.rs` - cargo test pinning the real `PtyError::NotFound` rejection contract
- `src/shell/Board.test.tsx` - Rule 1 fix: per-card count now scoped to `.phase-card` class instead of ambiguous `role="button"` (PhaseCardAction added a second button role per card)

## Decisions Made
- **Invalid `phase.id` renders no button (not a disabled one).** The plan's Task 1 `<action>` prose read as "render nothing (complete) / a disabled button respectively" for the two `if (null OR invalid) ...` branches, but the plan's own `must_haves` truth #5 and the `T-03-01` threat_model row are explicit: "a non-matching id yields a null action (**no button**), never a best-effort-sanitized string." Implemented per the security-authoritative truths/threat_model (no button, matching the `complete` treatment) — this is the safer reading and is what `PhaseCardAction.test.tsx`'s T-03-01 test asserts.
- **`labelKey` keeps its `board.*` prefix** (e.g. `board.actions.execute`) to stay byte-identical with `03-UI-SPEC.md`'s copy table and the plan's own `<behavior>` assertions; `PhaseCardAction` strips the prefix before calling `t()` since `useTranslation("board")` already scopes the namespace lookup (same pattern `StatusBadge.tsx` already uses for `status.*` keys without the `board.` prefix).
- **Real cargo test required a system dependency install** (`libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libsoup-3.0-dev` and related — Tauri v2's Linux GTK/WebKit toolchain) that was absent from this sandbox; installed via `apt-get` before `cargo test` could compile the Tauri dependency graph. No project-file change — purely an environment prerequisite for building the Tauri crate on Linux at all.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `src/shell/Board.test.tsx`'s per-card `role="button"` count broke**
- **Found during:** Task 2 (full-suite gate before final commit)
- **Issue:** `Board.test.tsx` asserted `within(columns).getAllByRole("button")` has length 4 (one per test phase) — since Task 1 mounted `PhaseCardAction` (a real `<button>`) inside every non-complete `PhaseCard`, this now counted 8 elements (card + action button per phase).
- **Fix:** Changed the assertion to count `.phase-card` elements instead (a stable class, unambiguous regardless of how many buttons live inside a card).
- **Files modified:** `src/shell/Board.test.tsx`
- **Verification:** `npx vitest run src/shell/Board.test.tsx` green; full `npm test` (304/304) green.
- **Committed in:** `2a0b872` (Task 2 commit)

**2. [Rule 1 - Bug] `PhaseCard.test.tsx`'s pre-existing click-selection test became ambiguous**
- **Found during:** Task 1 (same root cause as above)
- **Issue:** `screen.getByRole("button")` (singular) started matching two elements once `PhaseCardAction` mounted, throwing a "multiple elements found" error.
- **Fix:** Click the card's title text instead (bubbles to the outer `role="button"` div) rather than an ambiguous role query.
- **Files modified:** `src/components/PhaseCard.test.tsx`
- **Verification:** `npx vitest run src/components/PhaseCard.test.tsx` green.
- **Committed in:** `2a0b872` (Task 2 commit)

**3. [Rule 1 - Bug] jsdom does not suppress click bubbling from a disabled `<button>` the way real browsers do**
- **Found during:** Task 2 (writing the new `stopPropagation` test in `PhaseCard.test.tsx`)
- **Issue:** A first attempt at the "clicking the action button doesn't fire `selectPhase`" test used the default disabled (no-live-session) button; React does not invoke `onClick` on a disabled element, but jsdom's `fireEvent.click` still dispatches a real bubbling `MouseEvent`, so the click reached the card's own `onClick` and incorrectly appeared to prove nothing about `stopPropagation` (verified independently via a raw jsdom script).
- **Fix:** The test now sets up a live active session first so the button renders **enabled**, making `handleClick`'s `event.stopPropagation()` the actual code path under test.
- **Files modified:** `src/components/PhaseCard.test.tsx`
- **Verification:** Test passes for the right reason now — confirmed by temporarily reverting `stopPropagation()` and observing the test fail.
- **Committed in:** `2a0b872` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs/test breakage directly caused by mounting `PhaseCardAction` into a component shared across three test files)
**Impact on plan:** All three were necessary to keep the full suite green per the plan's own gate ("baseline is currently green (278 tests) — keep it green"). No scope creep — no new product behavior, only test-selector fixes in files downstream of the new mount point.

## Issues Encountered
- This sandbox lacked the system GTK/WebKit dev libraries (`libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libsoup-3.0-dev`, and related transitive packages) required to compile the Tauri v2 dependency graph on Linux at all — `cargo test` failed at `gdk-sys`'s build script (`pkg-config` couldn't find `gdk-3.0`), then again at `soup3-sys` (`libsoup-3.0`) after the first fix. Resolved by installing both via `apt-get install` before retrying; this is a one-time environment setup, not a code change, and does not affect CI/other environments that already have the Tauri Linux prerequisites installed.

## User Setup Required
None - no external service configuration required. (The GTK/WebKit dev packages above are a build-toolchain prerequisite for this sandbox, not an app-level user setup step — a real dev machine following the project's documented Tauri Linux prerequisites would already have them.)

## Next Phase Readiness
- `PhaseCardAction`'s `variant="detail"` prop is already wired (32px/Body-typography sizing branch exists) but unconsumed this plan — ready for Plan 04's future `DetailPanel` action row without touching this file again.
- The busy/awaiting-permission guard states are explicitly out of scope here (`useTerminalActivity`/`activity.ts` land in Plan 03) — `PhaseCardAction` currently treats every live session target as idle, exactly as the plan specifies ("this plan treats the target as idle — the busy/awaiting guard arrives in Plan 04").
- `board.actions.sendTo` and `board.actions.guard.prefilled` i18n keys were added per the UI-SPEC's full Copywriting Contract table even though this plan's UI doesn't render them yet (no `DetailPanel`/busy-guard consumer exists yet) — intentional forward-provisioning so Plans 03/04 don't need a separate locale-only commit.
- No blockers for Plan 02 (activity classifier byte-routing) or Plan 03/04 (activity UI + palette) — the injection primitive and its error/guard contract are now proven at both the JS and Rust boundaries.

---
*Phase: 03-board-interativo*
*Completed: 2026-07-24*

## Self-Check: PASSED
All created/modified files exist on disk; all 3 task commit hashes (7a6419b, 2a0b872, 4a97898) found in git log.
