---
phase: 04-casa-persistente
plan: 06
subsystem: security+persistence
tags: [zustand, plugin-store, xterm-serialize, flag-injection-guard, session-lifecycle]

# Dependency graph
requires:
  - phase: 04-casa-persistente (04-02)
    provides: spawn_session/spawnSession args passthrough (["--resume", id])
  - phase: 04-casa-persistente (04-05)
    provides: SessionDescriptor.projectRoot/name, app-store.ts sessionNames pattern
provides:
  - "isValidSessionId — strict UUID allow-list flag-injection guard (T-04-16), mirrors sanitizePhaseId"
  - "session-snapshot.ts — saveSnapshot/loadSnapshot over one flat session-<id>.json per session"
  - "app-store.ts upsertPersistedSession/getPersistedSessions — small session metadata (id, projectRoot, name, lastActive), scoped by projectRoot"
  - "session-store.ts loadPersistedSessions/resumeSession/persistSnapshot — the full lazy-restore lifecycle"
  - "SessionOrigin gains 'restored'"
  - "SessionRow History icon + click-to-resume replacing Phase 2's placeholder no-op"
affects: [04-07 (TERM-04 exit notifications will observe resumed sessions the same as any live session)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resumeSession loads the snapshot and stashes it on liveSession.serializedSnapshot BEFORE activeSessionId changes — the only trigger that mounts TerminalView for that session — so gainFocus's existing SESS-03 synchronous snapshot-write check picks it up before any --resume byte can arrive, with no new write path"
    - "loseFocus gains an optional persistSnapshot(snapshot) hook fired right after serialize() — extends the in-memory SESS-03 flow to disk without duplicating when/what to serialize"
    - "origin flip historical/restored -> live happens AFTER spawnSession resolves (not before) so the row can render variant=\"starting\" (pulse) while the resume spawn is in flight, same treatment as a brand-new session"
    - "resumeSession is idempotent via hasLiveSession — safe to call from both SessionRow's click and TerminalView's defensive mount-time fallback without double-spawning"

key-files:
  created:
    - src/sessions/id-format.ts
    - src/sessions/id-format.test.ts
    - src/persistence/session-snapshot.ts
    - src/persistence/session-snapshot.test.ts
  modified:
    - src/persistence/app-store.ts
    - src/persistence/app-store.test.ts
    - src/stores/session-store.ts
    - src/stores/session-store.test.ts
    - src/components/session/SessionRow.tsx
    - src/components/session/SessionRow.test.tsx
    - src/components/session/SessionSidebar.tsx
    - src/components/terminal/TerminalView.tsx
    - src/components/terminal/focus-algorithm.ts
    - src/components/terminal/focus-algorithm.test.ts
    - src/locales/pt-BR/session.json
    - src/locales/en/session.json

key-decisions:
  - "resumeSession validates isValidSessionId FIRST, before even looking up the session descriptor — a flag-shaped id is refused regardless of whether a matching descriptor exists, defense-in-depth against any future call site that might not go through the normal sessions[] lookup first"
  - "app-store.ts upsertPersistedSession/getPersistedSessions added (not in 04-06-PLAN.md's files_modified list) — Rule 2 deviation, required by the plan's own read_first/action text for loadPersistedSessions/persistSnapshot to have anything to read/write"
  - "SessionSidebar.tsx wired to loadPersistedSessions + resumeSession, and its historical group now includes both origin:\"historical\" and origin:\"restored\" (not in files_modified either) — Rule 2 deviation, without this wiring restored sessions never appear or resume"
  - "restored sessions render with variant=\"starting\" while being resumed (session.id === activeSessionId, origin not yet flipped to live) and variant=\"historical\" otherwise — reuses the existing SessionRowVariant system per 04-UI-SPEC.md, no new variant introduced"

requirements-completed: [SESS-04]

coverage:
  - id: D1
    description: "isValidSessionId accepts a well-formed UUID and rejects a flag-shaped string (leading dash) — the T-04-16 acceptance criterion"
    requirement: "SESS-04"
    verification:
      - kind: unit
        ref: "src/sessions/id-format.test.ts#isValidSessionId (T-04-16 — flag-injection guard) > REJEITA uma string flag-shaped (--dangerously-skip-permissions)"
        status: pass
    human_judgment: false
  - id: D2
    description: "resumeSession refuses to spawn when the id fails the format check — the value never reaches spawnSession/invoke"
    requirement: "SESS-04"
    verification:
      - kind: unit
        ref: "src/stores/session-store.test.ts#resumeSession (SESS-04 — T-04-16 flag-injection guard) > recusa um id flag-shaped e NUNCA chama spawnSession"
        status: pass
    human_judgment: false
  - id: D3
    description: "resumeSession uses the session's OWN persisted projectRoot as cwd, never the currently-active project's root"
    requirement: "SESS-04"
    verification:
      - kind: unit
        ref: "src/stores/session-store.test.ts#resumeSession > um id válido carrega o snapshot ANTES de spawnar, e spawna com args --resume e a PRÓPRIA projectRoot da sessão"
        status: pass
    human_judgment: false
  - id: D4
    description: "Snapshot round-trip: saveSnapshot then loadSnapshot for the same id returns the same string; an unknown id returns null; each session uses its own flat session-<id>.json"
    requirement: "SESS-04"
    verification:
      - kind: unit
        ref: "src/persistence/session-snapshot.test.ts#session-snapshot (SESS-04 — split-file snapshot store)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Persisted sessions reappear on reopen as restored rows (History icon, resumable), scoped to their project"
    requirement: "SESS-04"
    verification:
      - kind: unit
        ref: "src/stores/session-store.test.ts#loadPersistedSessions (SESS-04) > faz merge de sessões persistidas como origin restored, escopadas ao projectRoot pedido"
        status: pass
      - kind: unit
        ref: "src/components/session/SessionRow.test.tsx#SessionRow — variante historical/restored (SESS-04) > mostra o ícone History"
        status: pass
    human_judgment: false
  - id: D6
    description: "resumeSession stashes the loaded snapshot on liveSession.serializedSnapshot BEFORE spawnSession is called — the rehydrate-before-first-byte ordering backstop, verified structurally (not against real IPC timing)"
    requirement: "SESS-04"
    verification:
      - kind: unit
        ref: "src/stores/session-store.test.ts#resumeSession > grava o snapshot carregado em liveSession.serializedSnapshot ANTES da chamada a spawnSession"
        status: pass
      - kind: unit
        ref: "src/components/terminal/focus-algorithm.test.ts#loseFocus — ordem exata do algoritmo > SESS-04: chama persistSnapshot com o MESMO valor guardado em liveSession.serializedSnapshot"
        status: pass
    human_judgment: true
  - id: D7
    description: "A failed --resume transitions the row to exited via the pty:session-exited event, not a stuck 'starting' state"
    requirement: "SESS-04"
    verification:
      - kind: backstop
        ref: "Relies on 04-02's already-proven exit-purge/emit wiring (no new code this plan) — end-to-end proof (real claude --resume against a deleted/wrong-cwd transcript) is manual, per 04-VALIDATION.md"
        status: pass
    human_judgment: true

# Metrics
duration: 32min
completed: 2026-07-24
status: complete
---

# Phase 04 Plan 06: Snapshot persistence + lazy restore + flag-injection guard Summary

**`isValidSessionId` (strict UUID allow-list mirroring `sanitizePhaseId`) gates the single point a persisted, locally-tamperable session id becomes `claude --resume <id>` argv; snapshots persist per-session to `appDataDir` and restore lazily via `resumeSession`, which loads the snapshot before `activeSessionId` flips so the existing SESS-03 `gainFocus` write picks it up before any `--resume` byte arrives.**

## Performance

- **Duration:** ~32 min
- **Tasks:** 3
- **Files modified:** 16 (4 new: `id-format.ts`/`.test.ts`, `session-snapshot.ts`/`.test.ts`)

## Accomplishments

- **T-04-16, the phase's centerpiece threat mitigation:** `src/sessions/id-format.ts` exports `isValidSessionId`, an anchored UUID-v4-shaped regex mirroring `sanitizePhaseId`'s refuse-never-correct discipline. `resumeSession` (session-store.ts) applies it as the FIRST check — before even looking up the session descriptor — so a flag-shaped id (`--dangerously-skip-permissions`, `-x`) is refused and never reaches `spawnSession`/`invoke`.
- `src/persistence/session-snapshot.ts` — `saveSnapshot`/`loadSnapshot` over one flat `session-<id>.json` per session under `appDataDir` (never `app-state.json`, per Pitfall 4), `.close()` after each op to release the in-memory copy.
- `app-store.ts` gained `upsertPersistedSession`/`getPersistedSessions` (a `sessions` key, scoped by `projectRoot`) — the small metadata (id, projectRoot, name, lastActive) that `loadPersistedSessions` reads back on reopen and `persistSnapshot` writes on lose-focus.
- `session-store.ts`: `SessionOrigin` gains `"restored"`; `loadPersistedSessions(projectRoot)` merges persisted metadata into `sessions[]` without ever spawning a PTY; `resumeSession(sessionId)` is the single call site that builds `["--resume", id]` — guard first, then the session's OWN `projectRoot` (never `activeProjectRoot`, Pitfall 2), then `loadSnapshot` stashed onto `liveSession.serializedSnapshot` BEFORE `activeSessionId` changes, then `spawnSession`; origin flips to `"live"` only after the spawn resolves so the row can render `variant="starting"` (pulse) while in flight. `persistSnapshot(sessionId, snapshot)` fire-and-forgets `saveSnapshot` + `upsertPersistedSession`.
- `focus-algorithm.ts`'s `loseFocus` gained an optional `persistSnapshot?(snapshot)` hook, fired right after `serialize()` — extends the SESS-03 in-memory flow to disk without duplicating the serialize timing. `TerminalView.tsx` wires it to `useSessionStore.getState().persistSnapshot(sessionId, snapshot)` on lose-focus, and (defensively) calls `resumeSession(sessionId)` instead of a raw `spawnSession` for a first mount of a `restored`-origin session.
- `SessionRow.tsx`: historical/restored rows show a muted 14px `History` icon (`session.row.restoredTooltip`) and clicking now calls `onSelect(id)` unconditionally — replacing Phase 2's transient no-op hint. `SessionSidebar.tsx` wires `onSelect` to `resumeSession` for the merged historical/restored group, calls `loadPersistedSessions` alongside `discoverSessions`, and renders the row currently being resumed as `variant="starting"`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Primitives — isValidSessionId + per-session snapshot store** - `32fb4dd` (feat)
2. **Task 2: resumeSession + restored-session lifecycle in session-store** - `da4686d` (feat)
3. **Task 3: Terminal wiring — snapshot save/rehydrate, SessionRow resume click** - `1325970` (feat)

**Plan metadata:** (this commit, follows)

## Files Created/Modified

- `src/sessions/id-format.ts` / `.test.ts` — `isValidSessionId`, the T-04-16 flag-injection guard
- `src/persistence/session-snapshot.ts` / `.test.ts` — `saveSnapshot`/`loadSnapshot`, one file per session
- `src/persistence/app-store.ts` / `.test.ts` — `upsertPersistedSession`/`getPersistedSessions` (new `sessions` key)
- `src/stores/session-store.ts` / `.test.ts` — `SessionOrigin` gains `"restored"`, `loadPersistedSessions`, `resumeSession`, `persistSnapshot`
- `src/components/terminal/focus-algorithm.ts` / `.test.ts` — `loseFocus` gains `persistSnapshot?` hook
- `src/components/terminal/TerminalView.tsx` — wires `persistSnapshot` on lose-focus, `resumeSession` fallback for restored-origin first mount
- `src/components/session/SessionRow.tsx` / `.test.tsx` — `History` icon, click-to-resume, removed Phase 2's hint-timeout mechanism
- `src/components/session/SessionSidebar.tsx` — wires `loadPersistedSessions`/`resumeSession`, merges `historical`+`restored` into one group
- `src/locales/{pt-BR,en}/session.json` — `session.row.restoredTooltip`/`resuming` added, `historicalTooltip` left in place (dead key, per UI-SPEC retirement note)

## Decisions Made

- `resumeSession` validates `isValidSessionId` FIRST, before looking up the session descriptor in `sessions[]` — a flag-shaped id is refused regardless of whether a matching descriptor exists. Defense-in-depth: the guard never depends on lookup order or on the id having been previously registered.
- The snapshot-rehydration-before-first-byte ordering is achieved structurally, not via a new/racy write path: `resumeSession` loads the snapshot and mutates `liveSession.serializedSnapshot` BEFORE the `set()` that changes `activeSessionId` — the ONLY state transition that causes `TerminalView` to mount and call `gainFocus` for that session. `gainFocus`'s existing SESS-03 synchronous check (`if (liveSession.serializedSnapshot !== null) terminal.write(...)`) then picks it up naturally, with zero new write path in `TerminalView`/`gainFocus` itself. This is provably correct by construction with respect to React re-render timing (the mount literally cannot happen before the snapshot is set), though the full "does this beat the real `--resume` IPC round-trip and first PTY byte" claim is inherently a manual/e2e concern, exactly as the plan's backstop wording anticipates.
- `origin` flips from `historical`/`restored` to `live` only AFTER `spawnSession` resolves (not immediately when `activeSessionId` is set) — this lets `SessionSidebar` render the in-flight row as `variant="starting"` (pulse) instead of jumping straight to a plain `live` dot, matching `04-UI-SPEC.md`'s "restoring gets the same starting treatment as a new spawn" note, at essentially no extra cost (the flip was going to happen in a `set()` either way).
- `resumeSession` is idempotent via `hasLiveSession(sessionId)`: it registers the `liveSession` (marking it "live" for this purpose) synchronously before the first `await`, so a second call for the same id (e.g., `TerminalView`'s defensive fallback firing shortly after `SessionRow`'s click already triggered the real resume) just refocuses instead of double-spawning.
- `getOrCreateLiveSession`'s underlying `liveSessions` module-level `Map` is NOT reset between test cases in `session-store.test.ts` — tests exercising the full successful `resumeSession` path each use a distinct hardcoded UUID (`11111111-...`, `22222222-...`, etc.) to avoid colliding with a prior test's "already live" idempotency marker.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `app-store.ts` needed new persisted-session-metadata storage not listed in 04-06-PLAN.md's `files_modified`**
- **Found during:** Task 2 (designing `loadPersistedSessions`/`persistSnapshot`)
- **Issue:** The plan's frontmatter `files_modified` for this plan doesn't list `src/persistence/app-store.ts`, but Task 2's own `read_first`/`action` text explicitly requires "persisted session metadata (`sessions` key)" in `app-state.json` for `loadPersistedSessions` to read and `persistSnapshot` to write — nothing in the codebase provided this yet (only `recentProjects`/`sessionNames` existed).
- **Fix:** Added `upsertPersistedSession(entry)`/`getPersistedSessions(projectRoot)` to `app-store.ts` under a new `sessions` key, same upsert-by-id/filter-by-root pattern as `recentProjects`/`sessionNames`.
- **Files modified:** `src/persistence/app-store.ts`, `src/persistence/app-store.test.ts`
- **Verification:** 11 tests in `app-store.test.ts` green (4 new); full suite green
- **Committed in:** `da4686d` (Task 2 commit)

**2. [Rule 2 - Missing critical functionality] `SessionSidebar.tsx` needed wiring not listed in 04-06-PLAN.md's `files_modified`**
- **Found during:** Task 3 (making restored sessions actually visible/resumable end-to-end)
- **Issue:** `loadPersistedSessions`/`resumeSession` exist in the store, and `SessionRow` shows the `History` icon and calls `onSelect`, but nothing called `loadPersistedSessions` on project open, and nothing wired `SessionRow`'s `onSelect` to `resumeSession` for the historical group — without this, restored sessions would never appear in the sidebar or ever resume.
- **Fix:** `SessionSidebar.tsx`'s existing `discoverSessions` effect now also calls `loadPersistedSessions(projectRoot)`; the historical group's `SessionRow`s receive `onSelect={(id) => void resumeSession(id).catch(() => {})}` and a `variant` that reflects the actively-resuming row (`"starting"`) vs. idle history (`"historical"`).
- **Files modified:** `src/components/session/SessionSidebar.tsx`
- **Verification:** `SessionSidebar.test.tsx` (12 tests) green with no changes needed to the existing suite; full suite green
- **Committed in:** `1325970` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2 — missing critical functionality required for the feature to actually work end-to-end, not scope creep beyond the plan's own task descriptions).
**Impact on plan:** Both additions were necessary for `loadPersistedSessions`/`resumeSession`/`persistSnapshot` to be reachable and functional; no behavior outside the plan's `must_haves` was added.

## Issues Encountered

- Reconciling the "rehydrate snapshot before first `--resume` byte" backstop with `gainFocus`'s existing purely-synchronous snapshot-write check (designed for the in-memory SESS-03 case, not an async disk load) required moving the `activeSessionId` transition to happen strictly AFTER the snapshot has been loaded and stashed on `liveSession`, rather than immediately on click — resolved by restructuring `resumeSession`'s internal ordering (guard → register liveSession → await loadSnapshot → set snapshot → THEN flip activeSessionId → await spawnSession → THEN flip origin to live) so the ordering guarantee holds by construction rather than by timing luck.
- The shared module-level `liveSessions` Map (not reset between test cases, by design — see `session-store.ts`'s own doc comment on why it's outside the immer-managed shape) caused four `resumeSession` tests to initially collide on the same hardcoded UUID; fixed by giving each success-path test its own distinct id.

## User Setup Required

None — no external service configuration required (both plugins already installed/approved in 04-01).

## Next Phase Readiness

- SESS-04 is fully implemented: flag-injection guard, per-session snapshot persistence, lazy restore via `resumeSession`, and the rehydrate-before-first-byte ordering (structurally guaranteed, backstop-flagged for manual e2e per `04-VALIDATION.md`).
- 04-07 (TERM-04, exit notifications) can treat a resumed session exactly like any other live session — `resumeSession` promotes `origin` to `"live"` and registers the same `liveSession`/activity-wiring/`listenForSessionExit` surface as `createSession`, no special-casing needed.
- Manual verification still owed (per this plan's own `backstops`): a real end-to-end session restore against an actual prior `claude` conversation (snapshot + `claude --resume`), and the exact rehydrate-before-first-byte timing against real IPC — both explicitly deferred to `04-VALIDATION.md`.

---
*Phase: 04-casa-persistente*
*Completed: 2026-07-24*

## Self-Check: PASSED
