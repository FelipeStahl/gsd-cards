---
phase: 02-sess-o-viva
plan: 04
subsystem: ui
tags: [react, zustand, i18n, session-sidebar, tool-missing, sess-01, proj-04]

requires:
  - phase: 02-sess-o-viva/02-03
    provides: check_claude_on_path/checkClaudeOnPath, register_sessions_scope, listSessions (discover.ts), deriveToolMissingState
  - phase: 02-sess-o-viva/02-01
    provides: session-store tracer shape (activeSessionId/createSession/killSession), DrawerRail temporary trigger, TerminalView mount point
  - phase: 01-espelho-fiel
    provides: StatusBadge/statusDotVariants (4-tone system), EmptyState/ErrorState generic components, PhaseCard colocated-test convention, AppShell 240px sidebar slot
provides:
  - SessionSidebar (replaces SidebarPlaceholder) — Ativas/Histórico grouping, empty-group-header suppression, EmptyState, ToolMissingState gate
  - SessionRow — 40px row, live/historical/starting/exited variants via StatusTone, truncated monospace label + full-id title tooltip, historical-row inline hint (no drawer)
  - ToolMissingState — 3 copy variants (claude/gsdCore/both), reuses ErrorState's visual pattern, install-only copy
  - session-store: sessions[] descriptor list, discoverSessions (incremental merge, never downgrades live->historical), focusSession, lastFocusedSessionId
  - DrawerRail: live-session count badge, reexpand-to-last-focused on click, tracer's temporary "Nova sessão" trigger removed
  - ProjectStateModel.hasGsdCore (optional, additive) propagated from board-store's openProject
affects: [02-05, 02-06]

tech-stack:
  added: []
  patterns:
    - "mergeSessionDescriptors (session-store.ts) mirrors board-store's mergePhaseModels: merge-by-id over the existing array in a single set(), preserving fields on untouched entries — applied here to never downgrade a live-origin session to historical when its .jsonl is also discovered on disk"
    - "SessionRow's SessionRowVariant type already includes starting/exited (StatusTone mapping to accent/warning) even though session-store only produces live/historical this plan — avoids rework when Plan 06 wires real PTY lifecycle events into the store"
    - ".status-dot--outline CSS modifier layered on the existing status-dot--neutral class, keeping StatusTone a closed 4-value enum per the UI-SPEC's explicit constraint"

key-files:
  created:
    - src/components/session/SessionSidebar.tsx
    - src/components/session/SessionSidebar.test.tsx
    - src/components/session/SessionRow.tsx
    - src/components/session/SessionRow.test.tsx
    - src/components/session/ToolMissingState.tsx
    - src/components/session/ToolMissingState.test.tsx
    - src/shell/DrawerRail.test.tsx
  modified:
    - src/stores/session-store.ts
    - src/stores/session-store.test.ts
    - src/shell/AppShell.tsx
    - src/shell/AppShell.test.tsx
    - src/shell/DrawerRail.tsx
    - src/planning/model.ts
    - src/stores/board-store.ts
    - src/locales/pt-BR/session.json
    - src/locales/en/session.json
    - src/styles/theme.css
  deleted:
    - src/shell/SidebarPlaceholder.tsx

key-decisions:
  - "SessionSidebar built in two layers across the two tasks: Task 1's version has no ToolMissingState import (that component doesn't exist until Task 2), so Task 1's verify command stays green in isolation; Task 2 edits the same file to add the tool-missing gate — even though the plan's per-task <files> list only assigned SessionSidebar.tsx to Task 1, wiring ToolMissingState into it in Task 2 was structurally required by the plan's own must_haves/prohibitions"
  - "hasGsdCore added as an OPTIONAL field on ProjectStateModel (not required) specifically so the 4 pre-existing test files that construct project: {...} object literals (DetailPanel.test.tsx, SyncIndicator.test.tsx, Board.test.tsx, and this plan's own AppShell.test.tsx) keep type-checking without every one of them needing an edit; all consumers read it via ?? true (absent = not missing)"
  - "gsd-core absence only gates the sidebar when a project is actually open (hasGsdCore defaults to true/not-missing while project is null) — gsd-core is a per-project signal, so showing that variant before any project is opened would be a false positive; Claude CLI absence is global and gates immediately on first sidebar mount regardless of project state"
  - "DrawerRail's 'Nova sessão' Plus-button trigger is fully removed (SessionSidebar now owns session creation) — the rail's own click target repurposed to 'reexpand to lastFocusedSessionId', a new session-store field this plan adds so background-focus history survives independent of activeSessionId's expanded/collapsed toggling"
  - "SidebarPlaceholder.tsx deleted (no remaining importers after the AppShell swap) rather than left as dead code"

patterns-established:
  - "Two-task components (component created in Task N, extended in Task N+1 within the same plan) must be authored so the earlier task's own verify command never imports a not-yet-created module — verified by running Task 1's isolated vitest command before touching Task 2's files"

requirements-completed: [SESS-01, PROJ-04]

coverage:
  - id: D1
    description: "SessionSidebar lists discovered sessions in two labeled groups (Ativas/Histórico), each sorted by lastModified descending, mirroring session-store's sessions[]"
    requirement: "SESS-01"
    verification:
      - kind: unit
        ref: "src/components/session/SessionSidebar.test.tsx#SessionSidebar — zero-one-many > populado (live + historical): mostra os dois grupos, ordenados por lastModified desc"
        status: pass
    human_judgment: false
  - id: D2
    description: "Zero sessions renders the generic EmptyState (session.empty.heading/body) with the Nova sessão CTA still available — never a blank sidebar"
    requirement: "SESS-01"
    verification:
      - kind: unit
        ref: "src/components/session/SessionSidebar.test.tsx#SessionSidebar — zero sessões > mostra o EmptyState (nunca uma sidebar em branco)"
        status: pass
    human_judgment: false
  - id: D3
    description: "An empty group never renders its header (one live session with no historical shows only Ativas; one historical with no live shows only Histórico)"
    requirement: "SESS-01"
    verification:
      - kind: unit
        ref: "src/components/session/SessionSidebar.test.tsx#SessionSidebar — zero-one-many (both single-group tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "SessionRow truncates the id-derived label and exposes a title attribute with the full session id"
    requirement: "SESS-01"
    verification:
      - kind: unit
        ref: "src/components/session/SessionRow.test.tsx#SessionRow — variante live > renderiza o label truncável com id.slice(0,8) e o title com o id completo"
        status: pass
    human_judgment: false
  - id: D5
    description: "Clicking a historical row never opens the drawer — shows session.row.historicalTooltip inline instead; the historical dot uses the status-dot--outline modifier over neutral"
    requirement: "SESS-01"
    verification:
      - kind: unit
        ref: "src/components/session/SessionRow.test.tsx#SessionRow — variante historical (both tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "discoverSessions merges freshly-discovered .jsonl signals into sessions[] incrementally in a single set(), never downgrading a live-origin session to historical"
    requirement: "SESS-01"
    verification:
      - kind: unit
        ref: "src/stores/session-store.test.ts#discoverSessions (merge incremental — SESS-01) (all 4 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "ToolMissingState renders the correct copy variant among three (claude-missing / gsd-core-missing / both-missing), reusing ErrorState's visual pattern"
    requirement: "PROJ-04"
    verification:
      - kind: unit
        ref: "src/components/session/ToolMissingState.test.tsx#ToolMissingState — três variantes (PROJ-04) (all 3 tests)"
        status: pass
    human_judgment: false
  - id: D8
    description: "When any tool-missing state is active, SessionSidebar replaces its entire body with ToolMissingState and never renders the Nova sessão CTA — checked at first sidebar mount (claude, global) and at project open/reopen (gsd-core, per-project), before any creation affordance"
    requirement: "PROJ-04"
    verification:
      - kind: unit
        ref: "src/components/session/SessionSidebar.test.tsx#SessionSidebar — ToolMissingState (PROJ-04) (all 3 tests)"
        status: pass
    human_judgment: false
  - id: D9
    description: "AppShell mounts the real SessionSidebar in the same 240px slot SidebarPlaceholder used to occupy; SidebarPlaceholder is no longer imported/referenced"
    verification:
      - kind: unit
        ref: "src/shell/AppShell.test.tsx#AppShell > monta a SessionSidebar real (Plano 04) no lugar do SidebarPlaceholder — mesmo slot 240px fixo"
        status: pass
    human_judgment: false
  - id: D10
    description: "DrawerRail shows an accent badge with the live-session count when ≥1 session is live, and clicking the collapsed rail reexpands to lastFocusedSessionId without killing/recreating the session"
    verification:
      - kind: unit
        ref: "src/shell/DrawerRail.test.tsx (badge de contagem + reexpandir suites)"
        status: pass
    human_judgment: false
  - id: D11
    description: "Manual smoke: open a project with existing sessions and see the grouped list; simulate claude absent and see the ToolMissingState without the CTA"
    verification: []
    human_judgment: true
    rationale: "Requires an actual filesystem with a populated ~/.claude/projects/<encoded>/ and a real PATH manipulation to hide `claude` — genuine end-to-end visual/behavioral confirmation beyond what a jsdom unit test can assert; deferred to the plan's own <verification> smoke-test note."

duration: 16min
completed: 2026-07-23
status: complete
---

# Phase 02 Plan 04: SessionSidebar + ToolMissingState Summary

**SessionSidebar real com descoberta agrupada Ativas/Histórico (SESS-01) e ToolMissingState com três variantes de cópia bloqueando a criação de sessão quando `claude`/gsd-core estão ausentes (PROJ-04), substituindo o SidebarPlaceholder e o gatilho temporário do tracer**

## Performance

- **Duration:** 16 min
- **Started:** 2026-07-23T17:21:04Z (commit anterior, 02-03 finalizado)
- **Completed:** 2026-07-23T17:36:58Z
- **Tasks:** 2
- **Files modified:** 20 (7 novos, 12 modificados, 1 removido)

## Accomplishments

- `SessionSidebar` substitui o `SidebarPlaceholder` na coluna 240px fixa: agrupa sessões descobertas em "Ativas"/"Histórico" (ordenadas por `lastModified` desc), suprime o header de um grupo vazio, e mostra o `EmptyState` genérico com zero sessões
- `SessionRow` (40px): dot de status por `StatusTone` (live=success, historical=neutral+outline, starting/exited já mapeados para uso futuro), label truncado com `title` do id completo, e row histórica que mostra um hint inline em vez de abrir o drawer
- `session-store` ganha `sessions[]`, `discoverSessions` (merge incremental via `register_sessions_scope`+`listSessions`, nunca rebaixa uma sessão live para histórica), `focusSession`, e `lastFocusedSessionId`
- `ToolMissingState` (PROJ-04): três variantes de cópia (`claude`/`gsdCore`/`both` ausentes), reusa o padrão visual do `ErrorState`, nunca oferece auto-instalação — só instrui
- `SessionSidebar` checa `claude` uma única vez no boot (global) e `gsd-core` a cada open/reopen de projeto (via `ProjectStateModel.hasGsdCore`, aditivo); quando qualquer variante está ativa, o corpo inteiro é substituído pelo `ToolMissingState` e o botão "Nova sessão" nem é renderizado
- `DrawerRail` perde o gatilho temporário do tracer, ganha um badge accent de contagem de sessões vivas, e reexpande para `lastFocusedSessionId` ao clicar o rail recolhido

## Task Commits

Each task was committed atomically:

1. **Task 1: session-store de descoberta + SessionSidebar + SessionRow (SESS-01)** - `0ad8ad9` (feat)
2. **Task 2: ToolMissingState (PROJ-04) + swap no AppShell + badge no DrawerRail** - `83b545d` (feat)

_Note: no TDD tasks in this plan — both were `type="auto"`._

## Files Created/Modified

- `src/stores/session-store.ts` - `sessions[]`, `discoverSessions`, `focusSession`, `lastFocusedSessionId`, `mergeSessionDescriptors`
- `src/stores/session-store.test.ts` - extended tracer's suite with `focusSession` + `discoverSessions` merge-incremental coverage
- `src/components/session/SessionSidebar.tsx` - grouped list, empty state, tool-missing gate, CTA visibility
- `src/components/session/SessionSidebar.test.tsx` - zero/one/many grouping, CTA enable/disable, ToolMissingState wiring
- `src/components/session/SessionRow.tsx` - live/historical/starting/exited variants, truncation+tooltip, historical inline hint
- `src/components/session/SessionRow.test.tsx` - variant rendering, click behavior, dot modifier class
- `src/components/session/ToolMissingState.tsx` - 3-variant wrapper over `ErrorState`
- `src/components/session/ToolMissingState.test.tsx` - all 3 variants render the correct copy
- `src/shell/AppShell.tsx` - swaps `SidebarPlaceholder` for `SessionSidebar`
- `src/shell/AppShell.test.tsx` - adds Tauri invoke/fs mocks (SessionSidebar now performs IPC) + a swap-confirmation test
- `src/shell/DrawerRail.tsx` - removes the tracer CTA, adds the live-count badge, adds reexpand-to-last-focused
- `src/shell/DrawerRail.test.tsx` - badge count, reexpand behavior, expanded/collapsed states
- `src/shell/SidebarPlaceholder.tsx` - deleted (dead code after the AppShell swap)
- `src/planning/model.ts` - additive optional `hasGsdCore` on `ProjectStateModel`
- `src/stores/board-store.ts` - propagates `validated.hasGsdCore` into `state.project` in both `openProject` branches
- `src/locales/pt-BR/session.json` / `src/locales/en/session.json` - `sidebar.*`, `empty.*`, `row.*`, `toolMissing.*`, `actions.reexpand` keys
- `src/styles/theme.css` - `.status-dot--outline` CSS modifier

## Decisions Made

- `SessionSidebar` was deliberately split across the two task commits: Task 1's version has no `ToolMissingState` import so Task 1's isolated `vitest` command never fails on a not-yet-created module; Task 2 edits the same file to wire the gate. Verified by running Task 1's exact verify command before starting Task 2
- `hasGsdCore` added as an OPTIONAL field on `ProjectStateModel` (not required) so the pre-existing test files across the codebase that build `project: {...}` object literals (`DetailPanel.test.tsx`, `SyncIndicator.test.tsx`, `Board.test.tsx`) keep type-checking with zero edits — every consumer reads it via `?? true`
- gsd-core absence gates the sidebar only when a project is genuinely open (`hasGsdCore` defaults to "present" while `project` is `null`) since it's a per-project signal; Claude CLI absence is global and gates immediately regardless of project state, matching the UI-SPEC's "checked at app boot / first sidebar mount" instruction literally
- `DrawerRail`'s "Nova sessão" trigger fully removed — `SessionSidebar` is now the single owner of session creation; the rail's click target was repurposed to "reexpand to `lastFocusedSessionId`", a new field tracking focus history independently of `activeSessionId`'s expand/collapse toggling
- Kept the toolMissing copy exactly as specified in `02-UI-SPEC.md`'s Copywriting Contract (deliberately generic "consulte a documentação oficial", no specific install command/URL) — the UI-SPEC itself flags this as `unresolved`/an explicit planner assumption rather than a locked string, and this executor did not have a reliable way to re-verify current official install docs, so the generic wording was preserved rather than guessed at

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `hasGsdCore` to `ProjectStateModel` + propagated it in `board-store.ts`**
- **Found during:** Task 2 (wiring the gsd-core check into `SessionSidebar`)
- **Issue:** `ValidatedProject.hasGsdCore` (Fase 1/Plano 02-03) was never carried into the board-store's persisted `project` state — `openProject` discarded it after validation, so nothing downstream of "project open" could read it. Without this, the gsd-core-missing/both-missing `ToolMissingState` variants (must_haves truths, non-negotiable per the plan) had no data source
- **Fix:** Added `hasGsdCore?: boolean` (optional, additive) to `ProjectStateModel` and set it from `validated.hasGsdCore` in both `openProject` branches (`unrecognized`/`ok`)
- **Files modified:** `src/planning/model.ts`, `src/stores/board-store.ts`
- **Verification:** `npx tsc --noEmit` clean; full `npx vitest run` (237 tests, all pre-existing suites unaffected) green
- **Committed in:** `83b545d` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added `.status-dot--outline` CSS modifier to `theme.css`**
- **Found during:** Task 1 (building `SessionRow`'s historical-variant dot)
- **Issue:** The plan's `files_modified` list and Task 1's `<files>` tag omitted `theme.css`, but the plan's own "Artifacts this phase produces" section and the `must_haves` (dot mapping per `## Color`) explicitly require an outline/hollow rendering of the neutral dot for historical sessions — this CSS class did not exist yet
- **Fix:** Added `.status-dot--outline` (transparent background + 1px border, layered on the existing `.status-dot--neutral`) to `theme.css`, keeping `StatusTone` a closed 4-value enum per the UI-SPEC's explicit constraint
- **Files modified:** `src/styles/theme.css`
- **Verification:** `SessionRow.test.tsx`'s dot-modifier assertion passes
- **Committed in:** `0ad8ad9` (Task 1 commit)

**3. [Rule 2 - Missing Critical] Wired `ToolMissingState` into `SessionSidebar.tsx` during Task 2, though not in Task 2's `<files>` list**
- **Found during:** Task 2
- **Issue:** Task 2's `<files>` tag lists only `ToolMissingState.tsx`, `AppShell.tsx`, `DrawerRail.tsx`, `session.json` — it omits `SessionSidebar.tsx`. But the plan's own action text for Task 2 ("Quando ativo, a SessionSidebar renderiza o ToolMissingState no lugar do corpo da lista") and the plan-level `must_haves.truths`/`prohibitions` require exactly this integration; without it, PROJ-04's core guarantee (never show the CTA when tools are missing) would be unmet
- **Fix:** Edited `SessionSidebar.tsx` in Task 2's commit to add the `checkClaudeOnPath`/`deriveToolMissingState` gate and the conditional `ToolMissingState` render, gating the CTA on `toolMissing === "none"`
- **Files modified:** `src/components/session/SessionSidebar.tsx`
- **Verification:** `SessionSidebar.test.tsx`'s dedicated `ToolMissingState (PROJ-04)` suite (3 tests) passes
- **Committed in:** `83b545d` (Task 2 commit)

**4. [Rule 1 - Cleanup] Deleted `src/shell/SidebarPlaceholder.tsx`**
- **Found during:** Task 2 (after the `AppShell` swap)
- **Issue:** After swapping `<SidebarPlaceholder />` for `<SessionSidebar />` in `AppShell.tsx`, the file had zero remaining importers — dead code directly caused by this task's own change
- **Fix:** `git rm src/shell/SidebarPlaceholder.tsx`
- **Files modified:** `src/shell/SidebarPlaceholder.tsx` (deleted)
- **Verification:** `npx tsc --noEmit` clean, full test suite green with no references remaining
- **Committed in:** `83b545d` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (3 missing critical, 1 cleanup)
**Impact on plan:** All four were necessary for the plan's own must_haves/prohibitions to actually hold (the gsd-core data source, the historical dot's CSS, and the ToolMissingState wiring are non-negotiable per the plan text itself) or were direct, low-risk cleanup of dead code this task's own change produced. No scope creep beyond SESS-01/PROJ-04.

## Issues Encountered

- `AppShell.test.tsx`'s pre-existing "estado open" test constructs a full `project: {...}` object without `hasGsdCore` — confirmed this still type-checks and passes unmodified because the new field is optional (see Decision above), rather than editing 4 unrelated test files across the codebase.
- `SessionSidebar`'s `useEffect`-driven `checkClaudeOnPath`/`discoverSessions` calls run against the real (unmocked) `@tauri-apps/api/core` in any test file that doesn't explicitly mock it — resolved by adding `invoke`/`plugin-fs` mocks to `AppShell.test.tsx` (SessionSidebar is now always mounted there) so no test relies on Tauri's internal `invoke` throwing/rejecting by accident.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `session-store`'s `sessions[]`, `focusSession`, and `lastFocusedSessionId` are ready for Plan 05/06's multi-terminal focus/background algorithm (SESS-03) and lifecycle affordances (SESS-06, archive/delete) — the row-hover action buttons and `ConfirmDialog` are explicitly deferred to Plan 06 per the plan's own task text
- `SessionRowVariant`'s `starting`/`exited` values and their `StatusTone` mapping already exist in `SessionRow.tsx`, unused until Plan 06 wires real PTY lifecycle events (spawn/exit) into `session-store` — no rework expected when that lands
- The `session.toolMissing.*.body` copy remains the UI-SPEC's own flagged `unresolved` item (generic "consulte a documentação oficial" wording, no specific install command/URL) — carried forward unresolved, as the UI-SPEC explicitly permits, since this executor had no reliable way to re-verify current official install docs
- No blockers identified for Plan 05/06

---
*Phase: 02-sess-o-viva*
*Completed: 2026-07-23*

## Self-Check: PASSED

All 18 created/modified files confirmed present on disk (`src/components/session/SessionSidebar.tsx`, `SessionSidebar.test.tsx`, `SessionRow.tsx`, `SessionRow.test.tsx`, `ToolMissingState.tsx`, `ToolMissingState.test.tsx`, `src/shell/DrawerRail.test.tsx`, `src/stores/session-store.ts`, `session-store.test.ts`, `src/shell/AppShell.tsx`, `AppShell.test.tsx`, `DrawerRail.tsx`, `src/planning/model.ts`, `src/stores/board-store.ts`, `src/locales/pt-BR/session.json`, `src/locales/en/session.json`, `src/styles/theme.css`, this SUMMARY.md); `src/shell/SidebarPlaceholder.tsx` confirmed deleted. Both task commits (`0ad8ad9`, `83b545d`) confirmed present in `git log --oneline --all`.
