---
phase: 05-comunidade
plan: 03
subsystem: ui
tags: [tauri, plugin-updater, plugin-process, zustand, i18next, react]

requires:
  - phase: 05-comunidade (05-02)
    provides: "tauri-plugin-updater/tauri-plugin-process registered in lib.rs, granular capabilities (updater:allow-check, updater:allow-download-and-install, process:allow-restart), Cargo.toml/package.json deps"
provides:
  - "src/updates/check-update.ts — module-cached, never-throws checkForUpdate() + installUpdateAndRelaunch() with progress callback"
  - "src/updates/update-store.ts — shared zustand slice (checking|up-to-date|available|downloading|error) + percent/version/pendingUpdate"
  - "src/updates/UpdateIndicator.tsx — 5-state update affordance reusing SyncIndicator's dot+label+inline-action recipe"
  - "update i18n namespace (pt-BR + en), 10th namespace in src/i18n.ts"
  - "AppShell boot-time checkForUpdate() effect, mounted regardless of view"
  - "UpdateIndicator mounted in Header and HomeScreen, after LanguageSwitcher"
affects: [05-comunidade (05-04, boundary docs / Manual-Only real update round-trip)]

tech-stack:
  added: []
  patterns:
    - "check-update.ts mirrors notify.ts exactly: module-level promise cache + .catch(() => null) never-throws wrapper"
    - "update-store holds the live Update plugin object (pendingUpdate) alongside primitive state, so available/error actions can re-invoke installUpdateAndRelaunch without re-checking"
    - "installUpdateAndRelaunch accepts an optional onProgress(percent) callback derived from the plugin's Started/Progress download events (no synthetic timer)"

key-files:
  created:
    - src/updates/check-update.ts
    - src/updates/check-update.test.ts
    - src/updates/update-store.ts
    - src/updates/UpdateIndicator.tsx
    - src/updates/UpdateIndicator.test.tsx
    - src/locales/pt-BR/update.json
    - src/locales/en/update.json
  modified:
    - src/i18n.ts
    - src/locales/parity.test.ts
    - src/shell/AppShell.tsx
    - src/shell/AppShell.test.tsx
    - src/shell/Header.tsx
    - src/components/home/HomeScreen.tsx

key-decisions:
  - "update-store stores the live plugin Update object (pendingUpdate) in addition to state/percent/version, so the error state's retry action and the available state's install action both call installUpdateAndRelaunch(pendingUpdate) without re-calling check()"
  - "installUpdateAndRelaunch takes an optional onProgress callback wired to the plugin's downloadAndInstall(onEvent) Started/Progress events to drive the downloading state's percent label — not specified verbatim in RESEARCH.md Pattern 3 but required by the UI-SPEC's downloading state contract"
  - "dismiss() and setUpToDate() both reset state to up-to-date (renders null) — the UI-SPEC backstop about the error pill reappearing after a future successful background re-check is left to a later plan that owns periodic re-check cadence; this plan only wires the one-shot boot check"

patterns-established:
  - "Plugin-backed async-result store: zustand slice that caches both a state machine AND the live async-op result object (pendingUpdate), used when a UI action needs to re-invoke an operation on the same underlying resource rather than re-fetching it"

requirements-completed: [DIST-03]

coverage:
  - id: D1
    description: "checkForUpdate() checks the updater plugin at most once per app run (module-cached) and degrades to null on any rejection (network down/404/malformed manifest), never throwing"
    requirement: "DIST-03"
    verification:
      - kind: unit
        ref: "src/updates/check-update.test.ts#checkForUpdate (module-cached, nunca lança)"
        status: pass
    human_judgment: false
  - id: D2
    description: "installUpdateAndRelaunch(update) calls downloadAndInstall() then relaunch() in that order, interpolating percent via onProgress from the plugin's Started/Progress events"
    requirement: "DIST-03"
    verification:
      - kind: unit
        ref: "src/updates/check-update.test.ts#installUpdateAndRelaunch (baixa, instala, relança — nessa ordem)"
        status: pass
    human_judgment: false
  - id: D3
    description: "UpdateIndicator renders null for checking/up-to-date; accent dot+label+action for available; pulsing accent dot+percent with no action button for downloading; warning dot+retry+dismiss for error"
    requirement: "DIST-03"
    verification:
      - kind: unit
        ref: "src/updates/UpdateIndicator.test.tsx (8 tests covering all 5 states + interactions)"
        status: pass
    human_judgment: false
  - id: D4
    description: "AppShell calls checkForUpdate() once on mount (above the view === 'home' early return) and feeds the result into the shared update-store; UpdateIndicator mounted after LanguageSwitcher in both Header and HomeScreen so both views always agree"
    requirement: "DIST-03"
    verification:
      - kind: unit
        ref: "src/shell/AppShell.test.tsx#AppShell — checagem de atualização no boot (DIST-03, T-05-05)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real signed update round-trip (actual endpoint, real ed25519 signature, real relaunch) is Manual-Only, out of scope for this plan's headless mocked-plugin tests"
    human_judgment: true
    rationale: "No CI/sandbox environment can perform a real Tauri-signed release round-trip; the mocked unit tests prove the wrapper's logic/never-throws/ordering contract, but the actual network check + signature verification + relaunch can only be validated by a maintainer running a packaged build against a real release endpoint (owned by 05-04's boundary docs)."

duration: 7min
completed: 2026-07-24
status: complete
---

# Phase 5 Plan 3: DIST-03 Frontend Update Affordance Summary

**Never-throws `check-update.ts` wrapper + shared zustand `update-store` + a 5-state `UpdateIndicator` (SyncIndicator recipe) wired into a single `AppShell` boot check, mounted on both Home and in-project headers, requiring one explicit click before any download/relaunch.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-24T08:30:41Z
- **Completed:** 2026-07-24T08:37:12Z
- **Tasks:** 3
- **Files modified:** 13 (7 created, 6 modified)

## Accomplishments
- `check-update.ts`: module-cached `checkForUpdate()` that never throws (degrades to `null` on any `check()` rejection) + `installUpdateAndRelaunch(update, onProgress?)` that downloads, installs, and relaunches in that order, deriving download percent from the plugin's own `Started`/`Progress` events
- `update-store.ts`: a shared zustand slice (`checking | up-to-date | available | downloading | error` + `percent`/`version`/`pendingUpdate`) read identically by both `UpdateIndicator` mounts, so Home and in-project never disagree
- `UpdateIndicator.tsx`: all 5 UI-SPEC states implemented reusing `SyncIndicator`'s exact dot+label+inline-action recipe — silent on `checking`/`up-to-date`, accent dot+action on `available`, pulsing dot+percent with the action button *removed* (not disabled) on `downloading`, warning dot+retry+dismiss on `error`
- `update` i18n namespace (10th namespace) fully populated in both `pt-BR` and `en`, wired additively into `src/i18n.ts`
- `AppShell` boot effect calls `checkForUpdate()` once, above the `view === "home"` early return, feeding the shared store regardless of which view the user lands on
- `UpdateIndicator` mounted rightmost after `LanguageSwitcher` in both `Header.tsx` and `HomeScreen.tsx`

## Task Commits

Each task was committed atomically:

1. **Task 1: check-update wrapper + shared update-store + update namespace** - `b858032` (feat)
2. **Task 2: UpdateIndicator component (all 5 states, SyncIndicator recipe)** - `7912dfc` (feat)
3. **Task 3: Wire boot check in AppShell + mount UpdateIndicator on Home and in-project** - `950d419` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/updates/check-update.ts` - checkForUpdate() / installUpdateAndRelaunch(), notify.ts-style wrapper
- `src/updates/check-update.test.ts` - mocked-plugin tests (cache, degrade, ordering, progress interpolation)
- `src/updates/update-store.ts` - shared zustand update state slice
- `src/updates/UpdateIndicator.tsx` - the 5-state update affordance component
- `src/updates/UpdateIndicator.test.tsx` - 8 tests covering all states + click interactions
- `src/locales/pt-BR/update.json`, `src/locales/en/update.json` - new `update` namespace copy
- `src/i18n.ts` - registers the `update` namespace (10th namespace)
- `src/locales/parity.test.ts` - namespace count updated 9 → 10 (in-scope fix, our own addition)
- `src/shell/AppShell.tsx` - boot `useEffect` calling `checkForUpdate()`, feeding `update-store`
- `src/shell/AppShell.test.tsx` - mocks `../updates/check-update`, asserts boot-check behavior
- `src/shell/Header.tsx` - mounts `<UpdateIndicator />` after `<LanguageSwitcher />`
- `src/components/home/HomeScreen.tsx` - mounts `<UpdateIndicator />` after `<LanguageSwitcher />`

## Decisions Made
- `update-store` holds the live plugin `Update` object (`pendingUpdate`) alongside the primitive `state`/`percent`/`version` fields — the RESEARCH.md/PATTERNS.md "no analog" store description only specified the primitive slice shape, but `UpdateIndicator`'s `available` action and `error` retry action both need to call `installUpdateAndRelaunch` on the *same* checked `Update` instance without re-invoking `check()`. This is an additive, in-scope extension of the store's documented shape, not an architectural deviation.
- `installUpdateAndRelaunch` accepts an optional `onProgress(percent: number)` callback wired to `Update.downloadAndInstall(onEvent)`'s `Started`/`Progress` events (computing `downloaded/contentLength`). RESEARCH.md Pattern 3's near-final code didn't include this parameter, but the UI-SPEC's `downloading` state explicitly requires a live `{{percent}}` label — deriving it from the plugin's own byte-progress events (not a synthetic timer) is the only correct source.
- `dismiss()` and the boot-time `setUpToDate()` both reset to the `up-to-date` state (renders `null`). The UI-SPEC's backstop ("dismissing the error pill hides it until the next periodic background re-check finds an update again") explicitly defers the re-check *cadence* to a later implementation concern outside this plan's boot-once check — this plan only guarantees the state model supports it (a future re-check just calls `setAvailable` again), not the periodic trigger itself.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated `src/locales/parity.test.ts` namespace count from 9 to 10**
- **Found during:** Task 1 (adding the `update` namespace to `src/i18n.ts`)
- **Issue:** `parity.test.ts` hardcodes `expect(namespaces).toHaveLength(9)`. Adding the 10th namespace (`update`) as required by this plan's own acceptance criteria ("`npx vitest run src/locales/parity.test.ts` still passes") would otherwise break this assertion.
- **Fix:** Updated the hardcoded count to `10` and the accompanying doc comments (both in the test file and its own header) to reflect the new namespace.
- **Files modified:** `src/locales/parity.test.ts`
- **Verification:** `npx vitest run src/locales/parity.test.ts` passes (10 namespaces, full key-path parity for `update` in both languages)
- **Committed in:** `b858032` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix, directly caused by this plan's own namespace addition)
**Impact on plan:** No scope creep — the fix was required by the plan's own stated acceptance criteria (parity test must still pass).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. (The real signed update round-trip against a live release endpoint remains Manual-Only, per this plan's scope note — owned by 05-04's boundary docs.)

## Next Phase Readiness
- DIST-03's frontend is fully wired: boot check → shared store → 5-state indicator on both mount points, all covered by mocked-plugin unit tests.
- `npm test` (576 tests, up from the 556 baseline) and `npm run typecheck` both green.
- 05-04 (boundary docs) can now document the Manual-Only real update round-trip against this working mocked-plugin foundation — no blockers.

---
*Phase: 05-comunidade*
*Completed: 2026-07-24*

## Self-Check: PASSED

All 14 files verified present on disk; all 3 task commits (`b858032`, `7912dfc`, `950d419`) verified in git log.
