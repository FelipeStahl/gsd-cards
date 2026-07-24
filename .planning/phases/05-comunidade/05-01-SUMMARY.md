---
phase: 05-comunidade
plan: 01
subsystem: i18n
tags: [i18next, react-i18next, date-fns, tauri-plugin-store, vitest]

# Dependency graph
requires:
  - phase: 04-fase-4
    provides: "app-store.ts (LazyStore wrapper, withStoreLock writer-through-lock pattern), Header.tsx/HomeScreen.tsx mount surfaces"
provides:
  - "LanguageSwitcher.tsx — two-segment pt-BR/en pill mounted in Header + HomeScreen"
  - "app-store.ts LANGUAGE_KEY + setLanguage()/getLanguage() with closed-enum validation (T-05-01 mitigation)"
  - "AppShell.tsx boot-restore effect (cancelled-flag pattern, above the home early-return)"
  - "9-namespace i18n key-parity guard (locales/parity.test.ts)"
  - "date-fns locale re-render proof for SyncIndicator/SessionRow"
affects: [05-02, 05-03, 05-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getLanguage()/setLanguage() extend app-store.ts's existing withStoreLock writer / lock-free reader split — same shape as upsertRecent/getRecents"
    - "Boot-restore effects live in AppShell.tsx ABOVE the `view === \"home\"` early return (rules-of-hooks), cancelled-flag pattern identical to HomeScreen's getRecents() effect"
    - "vi.mock(\"date-fns\", async (importOriginal) => ...) call-through wrapper for spying on named ESM exports vi.spyOn cannot target directly"

key-files:
  created:
    - src/shell/LanguageSwitcher.tsx
    - src/shell/LanguageSwitcher.test.tsx
    - src/locales/parity.test.ts
  modified:
    - src/persistence/app-store.ts
    - src/persistence/app-store.test.ts
    - src/shell/AppShell.tsx
    - src/shell/AppShell.test.tsx
    - src/shell/Header.tsx
    - src/components/home/HomeScreen.tsx
    - src/components/home/HomeScreen.test.tsx
    - src/locales/pt-BR/common.json
    - src/locales/en/common.json
    - src/components/SyncIndicator.test.tsx
    - src/components/session/SessionRow.test.tsx
    - src/test/setup.ts

key-decisions:
  - "getLanguage() enum-validates against SUPPORTED_LANGUAGES (pt-BR|en) before returning — an unrecognized persisted value resolves to null, never reaching i18n.changeLanguage (T-05-01)"
  - "LanguageSwitcher's aria-label/title full names are i18n keys (common.language.pt.full/en.full), so they read in the CURRENT UI language, not a fixed autonym — literal reading of the UI-SPEC contract"
  - "SyncIndicator's degraded-state format() uses a locale-invariant \"HH:mm\" pattern by design (no AM/PM/month-name to differ); its locale test asserts the Locale object passed to format(), not rendered text, since the text genuinely cannot differ"
  - "Added an explicit afterEach(cleanup) to src/test/setup.ts (deviation, Rule 3) — needed to make boot-restore effect tests (which mutate the global i18n singleton) deterministic against leftover mounted instances from prior tests in the same file"

patterns-established:
  - "Global-singleton-mutating effects (i18n.changeLanguage) are tested via vi.spyOn + mockImplementation no-op, asserting the CALL rather than the settled state — decouples test correctness from RTL cleanup/microtask-ordering subtleties"

requirements-completed: [DIST-01]

coverage:
  - id: D1
    description: "User can toggle the interface language between pt-BR and English from a segmented pill, and every useTranslation consumer re-renders immediately"
    requirement: "DIST-01"
    verification:
      - kind: unit
        ref: "src/shell/LanguageSwitcher.test.tsx#clicar no segmento inativo (EN) chama i18n.changeLanguage('en') E setLanguage('en')"
        status: pass
      - kind: unit
        ref: "src/shell/LanguageSwitcher.test.tsx#após trocar para 'en', o segmento EN vira o ativo"
        status: pass
    human_judgment: false
  - id: D2
    description: "The chosen language persists to app-state.json (appDataDir) via app-store and is restored on the next app boot"
    requirement: "DIST-01"
    verification:
      - kind: unit
        ref: "src/persistence/app-store.test.ts#setLanguage('en') então getLanguage() resolve 'en'"
        status: pass
      - kind: unit
        ref: "src/shell/AppShell.test.tsx#idioma salvo 'en' (enum válido, diferente do default pt-BR): o boot effect chama changeLanguage('en')"
        status: pass
    human_judgment: false
  - id: D3
    description: "A corrupted/unrecognized stored language value is enum-validated and discarded; navigator.language provides the first-run fallback"
    requirement: "DIST-01"
    verification:
      - kind: unit
        ref: "src/persistence/app-store.test.ts#T-05-01: getLanguage() resolve null quando o valor persistido é uma string corrompida/não reconhecida"
        status: pass
      - kind: unit
        ref: "src/shell/AppShell.test.tsx#sem idioma salvo + navigator.language começa com 'en': aplica o fallback changeLanguage('en')"
        status: pass
      - kind: unit
        ref: "src/shell/AppShell.test.tsx#sem idioma salvo + navigator.language não-en: mantém o default pt-BR, nunca chama changeLanguage"
        status: pass
    human_judgment: false
  - id: D4
    description: "The LanguageSwitcher is reachable both on the Home screen and inside an open project (two mount points, one component)"
    requirement: "DIST-01"
    verification:
      - kind: unit
        ref: "grep LanguageSwitcher src/shell/Header.tsx && grep LanguageSwitcher src/components/home/HomeScreen.tsx"
        status: pass
      - kind: unit
        ref: "src/components/home/HomeScreen.test.tsx (all 3 tests, LanguageSwitcher mounted, still green)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The 9-namespace pt-BR/en key structure is locked by an automated parity test that fails on any key divergence"
    requirement: "DIST-01"
    verification:
      - kind: unit
        ref: "src/locales/parity.test.ts (10 tests, one per namespace + namespace-count guard)"
        status: pass
    human_judgment: false
  - id: D6
    description: "date-fns-driven timestamps (SyncIndicator, SessionRow) render in the correct locale after a language switch"
    requirement: "DIST-01"
    verification:
      - kind: unit
        ref: "src/components/session/SessionRow.test.tsx#após i18n.changeLanguage('en'), o timestamp relativo re-renderiza no locale en-US"
        status: pass
      - kind: unit
        ref: "src/components/SyncIndicator.test.tsx#degraded: format() é chamado com o locale ptBR por default e enUS após changeLanguage('en')"
        status: pass
    human_judgment: false

duration: 24min
completed: 2026-07-24
status: complete
---

# Phase 5 Plan 1: Language Round-Trip (Switch, Persist, Restore) Summary

**Segmented pt-BR/en LanguageSwitcher wired to a closed-enum app-store LANGUAGE_KEY and an AppShell boot-restore effect, locked by a 9-namespace i18n parity test and date-fns locale re-render proofs on SyncIndicator/SessionRow.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-07-24T07:59:49Z
- **Completed:** 2026-07-24T08:23:02Z
- **Tasks:** 3
- **Files modified:** 15 (3 created, 12 modified)

## Accomplishments
- End-to-end language round-trip: click a segment → `i18n.changeLanguage` (instant, synchronous UI update) + fire-and-forget `setLanguage` (persists to `app-state.json` via `withStoreLock`) → next boot's `AppShell` effect reads `getLanguage()` and restores it, enum-validated
- `LanguageSwitcher` mounted in both `Header` (in-project, rightmost after `SyncIndicator`) and `HomeScreen` (rightmost of the CTA group) — the only two places a user can ever be
- 9-namespace i18n key-parity guard (`collectKeyPaths` recursive dotted-path diff) locks pt-BR/en structural parity against future drift
- `SyncIndicator`/`SessionRow` proven to re-render with the correct `date-fns` locale after a language switch

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end language round-trip (switch → persist → restore)** - `6bab813` (feat)
2. **Task 2: Mount LanguageSwitcher in both Header and HomeScreen** - `f06951b` (feat)
3. **Task 3: i18n key-parity guard + date-fns locale re-render coverage** - `465ae21` (test)

_Note: Task 1 is `type="tracer"` — real, production-quality implementation with real `<verify>`, not a throwaway; the tracer feedback gate was run autonomously (green `<verify>` re-run) before expanding into Tasks 2-3, per the orchestrator-approved autonomous run protocol._

## Files Created/Modified
- `src/persistence/app-store.ts` - `SUPPORTED_LANGUAGES` closed enum + `setLanguage()`/`getLanguage()` (enum-validated reader, T-05-01 mitigation)
- `src/persistence/app-store.test.ts` - round-trip, corrupted-value, and explicit-save() coverage for the new functions
- `src/shell/LanguageSwitcher.tsx` - new segmented pill component (PT|EN), UI-SPEC pixel/color/a11y contract
- `src/shell/LanguageSwitcher.test.tsx` - render, active-segment, click-round-trip, re-translation coverage
- `src/shell/AppShell.tsx` - boot-restore `useEffect` (cancelled-flag pattern) above the `view === "home"` early return
- `src/shell/AppShell.test.tsx` - saved-language, navigator-fallback (en/non-en) coverage via `changeLanguage` spy
- `src/shell/Header.tsx` - mounts `<LanguageSwitcher />` after `<SyncIndicator />`
- `src/components/home/HomeScreen.tsx` - mounts `<LanguageSwitcher />` in the right-aligned CTA group
- `src/components/home/HomeScreen.test.tsx` - extended app-store mock (deviation, see below)
- `src/locales/pt-BR/common.json` / `src/locales/en/common.json` - `language.*` copy, both languages fully populated
- `src/locales/parity.test.ts` - new 9-namespace key-parity guard
- `src/components/SyncIndicator.test.tsx` - date-fns locale-propagation coverage (Locale-object assertion via call-through mock)
- `src/components/session/SessionRow.test.tsx` - date-fns locale-propagation coverage (rendered relative-timestamp text assertion)
- `src/test/setup.ts` - explicit `afterEach(cleanup)` (deviation, see below)

## Decisions Made
- `getLanguage()` returns the stored value ONLY when it is in the closed `pt-BR | en` enum, else `null` — the persisted value is untrusted input (T-05-01) that must never reach `i18n.changeLanguage` raw
- `LanguageSwitcher`'s full-name aria-label/title (`common.language.pt.full`/`en.full`) are i18n keys per the UI-SPEC's literal table, so they read in the CURRENT UI language (e.g. "Portuguese" once the UI is in English, not the fixed autonym "Português")
- `SyncIndicator`'s degraded-state `format(date, "HH:mm", { locale })` pattern is deliberately locale-invariant (no AM/PM/month name in "HH:mm") — its coverage asserts the `Locale` object passed to `format()` (via a call-through `vi.mock("date-fns", ...)` wrapper, since `vi.spyOn` cannot target ESM named exports) rather than rendered text, which genuinely cannot differ between pt-BR and en-US for this pattern
- Boot-restore-effect tests spy on `i18n.changeLanguage` with a no-op `mockImplementation` and assert the CALL, not the settled `i18n.language` state — this fully decouples the tests from RTL cleanup/microtask-ordering flakiness around a real global-singleton mutation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended `HomeScreen.test.tsx` and `AppShell.test.tsx`'s `app-store` mocks with `SUPPORTED_LANGUAGES`/`setLanguage` (and `getLanguage` for AppShell)**
- **Found during:** Task 2 (mounting `LanguageSwitcher` in `Header`/`HomeScreen`)
- **Issue:** Both test files already `vi.mock("../persistence/app-store", ...)` at module level with only the exports their pre-existing subjects needed (`getRecents`, `upsertRecent`, etc.). Once `LanguageSwitcher` — which imports `setLanguage`/`SUPPORTED_LANGUAGES` — mounted unconditionally inside `Header`/`HomeScreen`, the mocked module returned `undefined` for those exports, crashing every test in both files on `SUPPORTED_LANGUAGES.map(...)`.
- **Fix:** Added `setLanguage`/`SUPPORTED_LANGUAGES` (and `getLanguage` in `AppShell.test.tsx`, needed since Task 1) to both `vi.mock` factories.
- **Files modified:** `src/components/home/HomeScreen.test.tsx`, `src/shell/AppShell.test.tsx`
- **Verification:** `npx vitest run src/components/home/HomeScreen.test.tsx src/shell/AppShell.test.tsx` — all green
- **Committed in:** `f06951b` (Task 2 commit)

**2. [Rule 3 - Blocking] Added explicit `afterEach(cleanup)` to `src/test/setup.ts`**
- **Found during:** Task 1 (AppShell boot-restore effect tests)
- **Issue:** `AppShell`'s new boot-restore effect mutates the real, global `i18n` singleton (`i18n.changeLanguage`). Without a guaranteed unmount between tests in the same file, a still-mounted instance's pending promise from an earlier test could resolve during a later test's execution window, producing intermittent cross-test flakiness (observed directly while iterating on the three boot-restore test cases).
- **Fix:** Added `afterEach(() => cleanup())` from `@testing-library/react` to the shared test setup file (belt-and-suspenders alongside RTL's own auto-registration, whose exact activation in this project's ESM/ Vite-transform setup wasn't worth debugging further once the explicit call resolved the flakiness).
- **Files modified:** `src/test/setup.ts`
- **Verification:** `npm test` — 556/556 green, repeated runs stable (no flakiness observed across multiple full-suite runs)
- **Committed in:** `6bab813` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking, both necessary for the plan's own test suite to compile/run correctly)
**Impact on plan:** No scope creep — both fixes are direct, minimal-diff consequences of Task 1/2's own changes; neither touches production behavior.

## Issues Encountered
- Testing a boot effect that mutates a real global i18next singleton across many pre-existing `AppShell.test.tsx` cases required care: an initial approach asserting the SETTLED `i18n.language` value was flaky due to cross-test timing; switched to asserting the `i18n.changeLanguage` CALL via a no-op spy, which is both more precise (matches the plan's own `<behavior>` wording — "calls changeLanguage") and fully deterministic
- `vi.spyOn` cannot target a named ESM export directly ("Module namespace is not configurable in ESM") — used the `vi.mock("date-fns", async (importOriginal) => ...)` call-through wrapper pattern instead (same shape as `notify.test.ts`'s existing plugin-mocking convention) for the `SyncIndicator` locale-propagation test

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The i18n + persistence + boot-restore seam is proven end-to-end on real code, not a stub — Plans 05-02/05-03/05-04 (installer/bundler, auto-update) can build on the same `app-store.ts` and `AppShell.tsx` mount surfaces with confidence
- The 9-namespace parity guard and `LANGUAGE_KEY` pattern are reusable precedent for the `update` namespace Plan 05-04 (DIST-03) will add
- No blockers

---
*Phase: 05-comunidade*
*Completed: 2026-07-24*

## Self-Check: PASSED

All created files verified on disk (`src/shell/LanguageSwitcher.tsx`, `src/shell/LanguageSwitcher.test.tsx`, `src/locales/parity.test.ts`, `.planning/phases/05-comunidade/05-01-SUMMARY.md`) and all three task commits verified in `git log` (`6bab813`, `f06951b`, `465ae21`).
