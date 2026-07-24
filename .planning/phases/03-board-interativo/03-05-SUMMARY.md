---
phase: 03-board-interativo
plan: 05
subsystem: ui
tags: [react, zustand, i18next, lucide-react, xterm]

# Dependency graph
requires:
  - phase: 03-board-interativo (Plan 04)
    provides: "resolveInjection() (src/planning/injection.ts) — the single pure resolver for the Injection Behavior Matrix, consumed by every command-emitting surface; SessionDescriptor.activity"
provides:
  - "GsdCommandToolbar (src/components/terminal/GsdCommandToolbar.tsx) — 40px icon strip mounted above TerminalView inside DrawerRail's expanded aside, 9 buttons in GSD_COMMANDS fixed order + trailing 'Comandos' button + shortcut-hint badge"
  - "GSD_COMMANDS — the single fixed-order source of truth (id/labelKey/commandKey/icon/kind) for the curated /gsd-* command list, consumed by both GsdCommandToolbar and CommandPalette"
  - "focusTerminalSurface() — shared helper that returns keyboard focus to the xterm hidden textarea after a prefill/palette-close"
  - "CommandPalette (src/components/terminal/CommandPalette.tsx) — Cmd/Ctrl+K overlay confined to the drawer aside, search+filter+keyboard-nav over GSD_COMMANDS, same resolveInjection guard per row"
  - "commands i18n namespace (pt-BR/en) + terminal.toolbar.* keys"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GSD_COMMANDS as the single fixed-order data source, exported from GsdCommandToolbar.tsx and imported by CommandPalette.tsx — a deliberate circular module reference (data flows one way at runtime: CommandPalette only reads GSD_COMMANDS inside function bodies, never at module-eval time) that keeps the curated list from being duplicated between the two consuming surfaces"
    - "resolveInjection re-used identically by a fourth surface (toolbar icon button) and a fifth (palette row) — no surface reimplements the busy/awaiting/idle/no-target guard, exactly as Plan 04 designed"
    - "window-level keydown listener (not xterm's attachCustomKeyEventHandler) for Cmd/Ctrl+K, scoped to the component's own mount lifecycle (which only mounts while a session is active) instead of an explicit enabled flag"

key-files:
  created:
    - src/components/terminal/GsdCommandToolbar.tsx
    - src/components/terminal/CommandPalette.tsx
    - src/components/terminal/CommandPalette.test.tsx
    - src/locales/pt-BR/commands.json
    - src/locales/en/commands.json
  modified:
    - src/i18n.ts
    - src/locales/pt-BR/terminal.json
    - src/locales/en/terminal.json
    - src/shell/DrawerRail.tsx
    - src/shell/DrawerRail.test.tsx

key-decisions:
  - "commands.list.status.command resolves to /gsd-stats, not the /gsd-status carried verbatim in 03-UI-SPEC.md — /gsd-status does not exist under .claude/commands/, /gsd-stats does; i18n key name (list.status.*) kept unchanged per the plan's explicit instruction"
  - "CommandPalette.tsx was built during Task 2 (not Task 3, its nominally-assigned task) because GsdCommandToolbar unconditionally imports and renders it — the plan's own design has GsdCommandToolbar own paletteOpen state and GSD_COMMANDS flow back into CommandPalette, a circular data/render relationship that requires both files to exist and compile together. Task 3 added CommandPalette.test.tsx (12 tests) against the already-working component."
  - "focusTerminalSurface() queries document for the single global .xterm-helper-textarea (xterm.js's real input capture element) instead of a ref threaded through TerminalView — TerminalView.tsx is outside this plan's files_modified, and the app's own WebGL-context-limit architecture (Phase 2) guarantees at most one live terminal instance is ever mounted, making the global query safe"
  - "row buttons in CommandPalette got an explicit aria-label — without it, the accessible name concatenated the label span AND the monospace command-token span (e.g. 'Discutir fase/gsd-discuss-phase'), which would also have broken screen-reader row announcements, not just test queries"

requirements-completed: [ACT-04]

coverage:
  - id: D1
    description: "GsdCommandToolbar mounts a 40px icon strip inside DrawerRail's expanded 640px aside, above TerminalView, only when a session is active (never in the collapsed 48px rail) — 9 icon buttons in GSD_COMMANDS fixed order + trailing 'Comandos' button + shortcut-hint badge, each button obeying resolveInjection (idle send, parameterized prefill, busy/no-session disabled with zero writeSession calls)"
    requirement: ACT-04
    verification:
      - kind: unit
        ref: "src/shell/DrawerRail.test.tsx#DrawerRail — GSD command toolbar (ACT-04) — 6 tests (absent in collapsed rail, present in expanded aside, idle send with \\r, busy disables + zero writeSession, Ctrl+K opens palette, Comandos button opens palette)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cmd/Ctrl+K opens CommandPalette via a window-level keydown listener scoped to GsdCommandToolbar's own mount lifecycle (only mounted while a session is active); Esc and click-outside close it; the palette is position:absolute confined to the aside (aside gets position:relative), never dimming the board/sidebar"
    requirement: ACT-04
    verification:
      - kind: unit
        ref: "src/shell/DrawerRail.test.tsx#Ctrl+K abre a paleta de comandos — 1 test; src/components/terminal/CommandPalette.test.tsx#CommandPalette — abrir/fechar (ACT-04) — 4 tests (auto-focus+9 rows, Esc closes, click-outside closes, click-inside does not close)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The palette lists all 9 curated commands in GSD_COMMANDS fixed order (never re-sorted); a case-insensitive substring query filters by label OR the /gsd-* command token — including a query that matches ONLY the token and not the visible pt-BR label; no match renders commands.palette.empty with the search input still editable"
    requirement: ACT-04
    verification:
      - kind: unit
        ref: "src/components/terminal/CommandPalette.test.tsx#CommandPalette — filtro (ACT-04) — 3 tests (label substring, token-only substring for 'discuss'->'Discutir fase', empty state)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every toolbar button and palette row calls resolveInjection with the correct kind (parameterless/parameterized) and the live target's activity — idle parameterless sends with a trailing \\r, idle parameterized prefills with a trailing space and no \\r, busy renders disabled in place (rows never filtered out of the palette list) with zero writeSession calls, no-live-target disables the entire surface (palette input placeholder becomes the noSession guard copy)"
    requirement: ACT-04
    verification:
      - kind: unit
        ref: "src/shell/DrawerRail.test.tsx (toolbar idle-send/busy-disabled) + src/components/terminal/CommandPalette.test.tsx#CommandPalette — injeção por row obedece resolveInjection (ACT-02/ACT-03) — 4 tests (parameterless send, parameterized prefill, busy disabled-in-place, no-live-target disables input+rows)"
        status: pass
    human_judgment: false
  - id: D5
    description: "commands.list.status.command resolves to /gsd-stats (not the non-existent /gsd-status) in both locales, keeping the i18n key name status.* unchanged"
    requirement: ACT-04
    verification:
      - kind: unit
        ref: "node -e check against src/locales/en/commands.json (Task 1 <verify>) + .claude/commands/ directory listing confirming gsd-stats.md exists and gsd-status.md does not"
        status: pass
    human_judgment: false
  - id: D6
    description: "The true end-to-end toolbar/palette injection behavior against a real live claude session (busy truly blocks a real permission prompt from being stolen, prefill genuinely leaves the cursor ready for the user's own Enter)"
    verification: []
    human_judgment: true
    rationale: "A jsdom test cannot spawn/observe a real PTY-backed claude process or a genuine permission prompt — deferred to /gsd-verify-work per this plan's own <verification> section, same discipline as Plan 04's D6 and Plan 03's D5 (BUSY_MARKER/AWAITING_MARKER regex accuracy, still an open backstop carried forward unmodified)."

# Metrics
duration: 15min
completed: 2026-07-24
status: complete
---

# Phase 3 Plan 05: GSD Command Toolbar + Cmd/Ctrl+K Command Palette Summary

**A 9-button GSD command toolbar mounted above the terminal plus a Cmd/Ctrl+K command palette confined to the drawer aside — both surfaces reuse Plan 04's `resolveInjection` guard verbatim, closing ACT-04 and completing Phase 3's 5/5 plans.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-24T02:56:58Z
- **Completed:** 2026-07-24T03:11:34Z
- **Tasks:** 3
- **Files modified:** 10 (5 created, 5 modified)

## Accomplishments
- **`commands` i18n namespace** (pt-BR/en) — palette placeholder/empty copy + 9 curated `list.<id>.label`/`.command` pairs, registered in `i18n.ts`'s `resources`/`ns` array alongside the existing 7 namespaces. `commands.list.status.command` resolves to `/gsd-stats` (the UI-SPEC carried the non-existent `/gsd-status` verbatim; `.claude/commands/gsd-stats.md` exists, `gsd-status.md` does not — verified directly against the installed command surface, i18n key name kept unchanged as instructed).
- **`GSD_COMMANDS`** (`GsdCommandToolbar.tsx`) — the single fixed-order (`discuss, plan, execute, verify, quick, next, progress, status, help`) source of truth for id/labelKey/commandKey/icon/kind, consumed by both the toolbar and the palette so the curated list is never duplicated.
- **`GsdCommandToolbar`** — 40px secondary-surface strip mounted above `TerminalView` inside `DrawerRail`'s expanded `<aside>` (which gained `position: relative`), only when a session is active. 9 icon-only 32×32 buttons + trailing `Command`-icon "Comandos" button + a platform-aware shortcut-hint badge (`⌘K` via `navigator.platform` on macOS, `terminal.toolbar.shortcutHint` = "Ctrl+K" otherwise). Each button calls `resolveInjection` per-render against the live target's activity — idle parameterless sends immediately, idle parameterized prefills (trailing space, no `\r`), busy/no-target disables with zero `writeSession` calls.
- **Cmd/Ctrl+K trigger** — a `window`-level `keydown` listener (not xterm's `attachCustomKeyEventHandler`, which only fires when the terminal itself has DOM focus) mounted in a `useEffect` scoped to `GsdCommandToolbar`'s own lifecycle — since the toolbar only renders while a session is active, this is exactly the required scope (never intercepts the shortcut when the drawer is collapsed) with no extra enabled-flag needed.
- **`CommandPalette`** — Cmd/Ctrl+K (or "Comandos" button) overlay built on `ConfirmDialog`'s interaction skeleton (Esc closes, click-outside closes) but visually confined per the UI-SPEC's explicit deviation: `position: absolute` inside the aside (not `position: fixed; inset: 0`), a lighter 40%-opacity backdrop (vs. `ConfirmDialog`'s 60%), top-anchored below the 40px toolbar, `max-height: 480px`, `box-shadow` matching `DetailPanel`'s exact value. 36px auto-focused search input filters the 9 rows live by case-insensitive substring against label OR command token (a query like "discuss" matches "Discutir fase" only via its `/gsd-discuss-phase` token, since the pt-BR label doesn't contain that substring). ↑/↓ moves selection, Enter activates, no match renders `commands.palette.empty` with the input still editable. Every row resolves through the identical `resolveInjection` call as the toolbar — busy rows render disabled in place (never filtered out of the list), no-live-target disables the input (placeholder becomes the `noSession` guard copy) and every row.
- `focusTerminalSurface()` — shared helper (queries the single global `.xterm-helper-textarea` xterm.js creates) that returns keyboard focus to the terminal after a prefill or after the palette closes, without threading a ref through `TerminalView.tsx` (outside this plan's `files_modified`; safe because the app's WebGL-context-limit architecture guarantees at most one live terminal instance mounted at a time).
- Full suite: 383/383 tests green (up from the 365-test baseline: +18 new — 6 `DrawerRail.test.tsx` toolbar/palette-trigger tests + 12 `CommandPalette.test.tsx`). `npm run typecheck` clean throughout all 3 tasks.

## Task Commits

Each task was committed atomically:

1. **Task 1: `commands` namespace + toolbar i18n + curated GSD_COMMANDS list** - `4bb448d` (feat)
2. **Task 2: GsdCommandToolbar mounted in DrawerRail + Cmd/Ctrl+K trigger** - `798c6d6` (feat) — includes `CommandPalette.tsx` built ahead of its nominal task (see Deviations)
3. **Task 3: CommandPalette test suite** - `af84b16` (test)
4. **Addendum: Ctrl+K/"Comandos" actually-opens-the-palette coverage** - `8b01a07` (test) — closes a gap where Task 2's tests exercised the listener's guard conditions but never asserted the palette actually appears

_No RED/GREEN/REFACTOR multi-commit split — `TDD_MODE=false` per the executor's `<mode>` instruction; tests were written alongside implementation and green before each task's commit._

## Files Created/Modified
- `src/locales/pt-BR/commands.json` / `src/locales/en/commands.json` - new `commands` namespace: palette copy + 9 curated label/command pairs
- `src/locales/pt-BR/terminal.json` / `src/locales/en/terminal.json` - `toolbar.openPalette` + `toolbar.shortcutHint` keys added alongside the existing `activity.*` keys
- `src/i18n.ts` - `commands` namespace registered in `resources` (both locales) and the `ns` array
- `src/components/terminal/GsdCommandToolbar.tsx` - `GSD_COMMANDS` fixed-order data + `focusTerminalSurface()` + the `GsdCommandToolbar` component (9 icon buttons, Cmd/Ctrl+K listener, palette state owner)
- `src/components/terminal/CommandPalette.tsx` - Cmd/Ctrl+K overlay: search/filter/keyboard-nav over `GSD_COMMANDS`, per-row `resolveInjection`
- `src/components/terminal/CommandPalette.test.tsx` - 12 tests: open/close, filter (label + token-only), empty state, injection matrix (send/prefill/busy-disabled/no-target), keyboard nav
- `src/shell/DrawerRail.tsx` - expanded `<aside>` gains `position: relative` + mounts `<GsdCommandToolbar />` above `<TerminalView>`
- `src/shell/DrawerRail.test.tsx` - extended: toolbar absent/present, idle send, busy disables, Ctrl+K opens palette, "Comandos" button opens palette

## Decisions Made
- **`commands.list.status.command` = `/gsd-stats`, not the UI-SPEC's verbatim `/gsd-status`** — confirmed directly against `.claude/commands/` (`gsd-stats.md` exists, `gsd-status.md` does not), resolving the explicitly-flagged unresolved item from `03-UI-SPEC.md` without renaming the `status` i18n key, per the plan's own instruction.
- **`CommandPalette.tsx` built during Task 2's commit, not Task 3's** (Rule 3 deviation — see below) — the plan's own architecture has `GsdCommandToolbar` own `paletteOpen` state and unconditionally render `<CommandPalette>`, while `CommandPalette` imports `GSD_COMMANDS` back from `GsdCommandToolbar`. This circular data/render relationship means both files must exist and compile together; Task 2's own `<verify>` (`npx vitest run src/shell/DrawerRail.test.tsx && npm run typecheck`) would fail without a real `CommandPalette.tsx` on disk. Task 3 then added `CommandPalette.test.tsx` (12 tests) against the already-working component, satisfying its own `<verify>` unchanged.
- **`focusTerminalSurface()` queries the DOM globally for `.xterm-helper-textarea`** instead of receiving a ref from `TerminalView` — `TerminalView.tsx` is outside this plan's `files_modified`, and Phase 2's WebGL-context-limit architecture guarantees at most one live terminal instance is ever mounted app-wide, making the global query equivalent to a scoped one in practice.
- **Palette row buttons gained an explicit `aria-label`** — without it, the browser's accessible-name algorithm concatenated both the label span and the monospace command-token span's text content (e.g. `"Discutir fase/gsd-discuss-phase"`), which broke `getByRole("button", { name: ... })` queries in tests and would equally have broken screen-reader row announcements in production — fixed before it shipped, not deferred.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `CommandPalette.tsx` created during Task 2 instead of Task 3**
- **Found during:** Task 2, while wiring `GsdCommandToolbar`'s `paletteOpen` state to an actual rendered overlay
- **Issue:** The plan's own design (GsdCommandToolbar owns `paletteOpen` and renders `<CommandPalette>`; `CommandPalette` imports `GSD_COMMANDS` back from `GsdCommandToolbar`) creates a hard compile-time dependency: Task 2's `npm run typecheck`/`vitest run src/shell/DrawerRail.test.tsx` cannot pass if `./CommandPalette` doesn't exist as a real module yet, since `GsdCommandToolbar.tsx` unconditionally imports it.
- **Fix:** Built the full `CommandPalette.tsx` component (search, filter, keyboard nav, per-row `resolveInjection`, confined overlay styling) as part of Task 2's commit. Task 3 then added `CommandPalette.test.tsx` (12 tests) against this already-correct component — its own `<verify>` command still ran and passed unchanged.
- **Files modified:** `src/components/terminal/CommandPalette.tsx` (created in Task 2's commit rather than Task 3's)
- **Verification:** `npm run typecheck` passed at every task boundary; `npx vitest run src/shell/DrawerRail.test.tsx` (Task 2) and `npx vitest run src/components/terminal/CommandPalette.test.tsx` (Task 3) both green independently.
- **Committed in:** `798c6d6` (Task 2 commit)

**2. [Rule 1 - Bug] `CommandPalette` row buttons' accessible name concatenated label + command token**
- **Found during:** Task 3, while writing `CommandPalette.test.tsx`'s name-based `getByRole` queries
- **Issue:** Each row button had no `aria-label`, so its accessible name was computed by concatenating the text content of both inner `<span>`s (label + monospace command token), e.g. `"Ajuda/gsd-help"` — every `getByRole("button", { name: "Ajuda" })` query failed with "multiple/no elements found", and the same concatenation would have degraded screen-reader announcements of each row in production.
- **Fix:** Added `aria-label={label}` to the row `<button>`, giving it a stable accessible name independent of its children's rendered text.
- **Files modified:** `src/components/terminal/CommandPalette.tsx`
- **Verification:** All 12 `CommandPalette.test.tsx` tests pass; `npm run typecheck` clean.
- **Committed in:** `af84b16` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 — blocking circular-dependency ordering, 1 Rule 1 — accessibility/testability bug caught before it shipped)
**Impact on plan:** No scope creep — Deviation 1 is a file-ownership reordering forced by the plan's own architecture, not new functionality; Deviation 2 is a correctness fix (accessible names) required for the very tests Task 3 specified. Both auto-fixes necessary for the plan's own `<verify>` commands to pass at each task boundary.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 (board-interativo) is now 5/5 plans complete — ACT-01 through ACT-04 all delivered. ACT-05 (a global, screen-wide Cmd+K palette independent of the drawer) remains explicitly deferred per `03-CONTEXT.md`'s `## Deferred Ideas`.
- Two `verification: human_judgment: true` backstop items remain open, carried forward unmodified across Plans 03/04/05: `QUIESCENCE_MS`/`BUSY_MARKER`/`AWAITING_MARKER` empirical accuracy (Plan 03's D5) and the true end-to-end busy/awaiting/idle behavior against a real live `claude` session, now exercised by five surfaces (card, detail panel, toolbar, palette rows, keyboard nav) instead of just two — all five require `/gsd-verify-work 3` against a real terminal, not deferrable further.
- No blockers for milestone completion / `/gsd-ship`.

---
*Phase: 03-board-interativo*
*Completed: 2026-07-24*

## Self-Check: PASSED
All created/modified files exist on disk; all 4 commit hashes (4bb448d, 798c6d6, af84b16, 8b01a07) found in git log.
