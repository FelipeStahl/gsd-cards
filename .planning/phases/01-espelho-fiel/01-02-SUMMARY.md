---
phase: 01-espelho-fiel
plan: 02
subsystem: ui
tags: [tauri, rust, react, zustand, immer, gray-matter, remark-parse, i18next, vitest]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Tauri v2 + React 19 + TS scaffold, read-only capability allowlist, design tokens, i18next bootstrap, vitest/testing-library"
provides:
  - "validate_project_root Rust command — single filesystem entry gate (canonicalize + containment check + runtime fs scope grant)"
  - "src/planning/ read layer (paths.ts, read.ts) and STATE.md parser (parser/state.ts) with the ParseResult<T> contract every future parser must use"
  - "board-store.ts (zustand+immer) mirroring a validated project's STATE.md into ProjectStateModel, with phases/milestones/recentlyUpdatedPhaseIds/sync slots pre-declared"
  - "Full D-04 layout skeleton (Header/SidebarPlaceholder/DrawerRail/AppShell) with real Header data and the Open Project flow (native dialog -> validateProjectRoot -> parseStateFile -> store)"
  - "project.json i18n namespace (pt-BR/en, full key parity)"
affects: [01-03, 01-04, 01-05, 01-06]

# Tech tracking
tech-stack:
  added:
    - "dunce 1.0.5 (Rust) — canonicalize without the \\\\?\\ Windows extended-path prefix, already resolved transitively in Cargo.lock; added as a direct dependency"
  patterns:
    - "ParseResult<T> (ok/unrecognized/isUnrecognized) is now the mandatory return shape for every .planning/ parser — no parser may invent a plausible default when extraction fails"
    - "Single filesystem entry gate: validate_project_root is the only place a frontend-supplied path is canonicalized/scoped; every other read goes through src/planning/read.ts on top of the already-validated root"
    - "AST-based markdown parsing (remark-parse) instead of regex for gsd-core body sections (### Blockers/Concerns), so heading/list formatting drift doesn't silently break extraction"
    - "Board store is a pure read mirror — openProject never writes to disk, only reads + parses"

key-files:
  created:
    - src-tauri/src/project.rs
    - src/planning/paths.ts
    - src/planning/read.ts
    - src/planning/read.test.ts
    - src/planning/parse-result.ts
    - src/planning/model.ts
    - src/planning/parser/state.ts
    - src/planning/parser/state.test.ts
    - src/planning/__fixtures__/state/healthy-STATE.md
    - src/planning/__fixtures__/state/broken-frontmatter-STATE.md
    - src/stores/board-store.ts
    - src/shell/AppShell.tsx
    - src/shell/Header.tsx
    - src/shell/SidebarPlaceholder.tsx
    - src/shell/DrawerRail.tsx
    - src/shell/AppShell.test.tsx
    - src/components/EmptyState.tsx
    - src/components/ErrorState.tsx
    - src/components/ProgressBar.tsx
    - src/locales/pt-BR/project.json
    - src/locales/en/project.json
  modified:
    - src-tauri/src/lib.rs
    - src-tauri/Cargo.toml
    - src-tauri/capabilities/default.json
    - src/App.tsx
    - src/i18n.ts
    - src/styles/theme.css
    - src/test/setup.ts

key-decisions:
  - "Used dunce::canonicalize instead of std::fs::canonicalize in Rust — std's version returns the \\\\?\\C:\\... verbatim prefix on Windows, which would break the string-concatenation path derivation in paths.ts; dunce was already a transitive dependency (1.0.5), no new supply-chain surface"
  - "ValidatedProject Rust struct uses #[serde(rename_all = \"camelCase\")] so the IPC payload is already camelCase — read.ts consumes it directly with no snake_case-to-camelCase mapping layer to get wrong"
  - "readPlanningText checks size() before readTextFile() (not after) so a >2MB file's content never crosses the IPC boundary at all — added fs:allow-size to the capability allowlist for this (Rule 2, T-01-05)"
  - "Blocker extraction walks the remark-parse mdast tree to find the first List node after the '### Blockers/Concerns' heading, rather than regex over raw text — naturally skips the bracketed comment paragraph the gsd-core template places under that heading"
  - "healthy-STATE.md fixture's current_phase_name is 'espelho-fiel' (the literal frontmatter value), not the plan's illustrative 'Espelho fiel' example — kept literal per the project's own no-invented-values rule (T-01-06a) rather than reformatting a slug into title case"

patterns-established:
  - "Every .planning/ parser returns ParseResult<T>; unrecognized carries ParseIssue[] with a human-readable reason, never a default value"
  - "UI components split into namespace-owning components (Header/AppShell/DrawerRail/SidebarPlaceholder, all call useTranslation) and prop-driven generic components (EmptyState/ErrorState/ProgressBar, no i18n of their own, text supplied by callers)"

requirements-completed: [PROJ-02, BOARD-04]

coverage:
  - id: D1
    description: "validate_project_root: canonicalizes the chosen root, rejects missing .planning/, rejects a .planning symlink that resolves outside the root (by path-component containment, not string prefix), and grants fs scope only to the validated root"
    requirement: "PROJ-02"
    verification:
      - kind: unit
        ref: "src-tauri/src/project.rs#tests (6 tests: nested_path_is_contained, sibling_with_common_text_prefix_is_not_contained, unrelated_path_is_not_contained, root_is_contained_in_itself, windows_style_sibling_with_common_prefix_is_not_contained, windows_style_nested_path_is_contained) — cargo test exit 0"
        status: pass
      - kind: unit
        ref: "src/planning/read.test.ts (13 tests: paths.ts pure functions + validateProjectRoot error-kind mapping + readPlanningText size gate) — vitest exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "parseStateFile extracts STATE.md frontmatter progress/milestone/phase fields and ### Blockers/Concerns list items (including multi-phase [Phase 1/4] labels), degrading individual fields to unrecognized instead of inventing defaults, and never throwing on malformed YAML"
    requirement: "BOARD-04"
    verification:
      - kind: unit
        ref: "src/planning/parser/state.test.ts (8 tests, including the [Phase 1/4] -> phases:[1,4] case and the broken-frontmatter-STATE.md unrecognized/no-throw case) — vitest exit 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Header reads project name/milestone/current phase/overall progress exclusively from board-store's ProjectStateModel (progress.percent read literally, never recomputed); D-04 layout skeleton (header/sidebar/board area/drawer rail) stands with Plan 03/04's slots reserved"
    requirement: "BOARD-04"
    verification:
      - kind: unit
        ref: "src/shell/AppShell.test.tsx (3 tests: idle shows empty-state CTA, error/NotAGsdProject shows the PROJ-02 error copy and no board placeholder, open shows project name + milestone badge + progressbar aria-valuenow==percent) — vitest exit 0"
        status: pass
      - kind: other
        ref: "npm run typecheck (tsc --noEmit, exit 0) and npm run build (vite build, exit 0, 1952 modules transformed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "End-to-end 'Open project' flow: real folder chosen via native dialog opens a real project and shows real STATE.md data in the running app; an invalid folder shows the PROJ-02 error screen instead of an empty board"
    verification: []
    human_judgment: true
    rationale: "Requires driving the native OS folder picker inside a real `npm run tauri dev` window — not automatable from this shell. Deferred to end-of-phase human verification per .planning/config.json workflow.human_verify_mode: \"end-of-phase\"; all automatable layers underneath (D1-D3) are proven green."

duration: 47min
completed: 2026-07-22
status: complete
---

# Phase 01 Plan 02: Open a Real Project Summary

**Users can open a real folder, the app validates it's a GSD project through a single canonicalizing Rust gate, reads and parses the real `STATE.md`, and the header shows the real project name/milestone/phase/progress — replacing the Plan 01 static-title window with the first genuinely useful vertical slice.**

## Performance

- **Duration:** 47 min
- **Started:** 2026-07-22T23:34:00-03:00 (approx. — research/read pass before Task 1's commit)
- **Completed:** 2026-07-22T23:21:54-03:00
- **Tasks:** 3 (all complete, no checkpoints)
- **Files modified:** 27 created, 7 modified

## Accomplishments

- `validate_project_root` (Rust) is the single gate every filesystem path crosses: canonicalizes with `dunce` (no Windows `\\?\` prefix), rejects a missing `.planning/`, rejects a `.planning` symlink that escapes the chosen root via path-component containment (not string-prefix comparison — `/a/bc` is correctly NOT contained in `/a/b`), and grants `tauri-plugin-fs` scope only to that validated root
- `src/planning/` read layer + `ParseResult<T>` contract (`ok`/`unrecognized`/`isUnrecognized`) that every future `.planning/` parser in this project must use — never invent a plausible default when extraction fails
- `parseStateFile` extracts STATE.md's frontmatter progress/milestone/phase fields and walks the `remark-parse` AST to collect `### Blockers/Concerns` items, correctly handling multi-phase labels (`[Phase 1/4]` -> `phases: [1, 4]`) and never throwing on malformed YAML
- `board-store.ts` (zustand+immer) mirrors a validated project into `ProjectStateModel` — pure read mirror, never writes to disk
- Full D-04 layout skeleton (`Header`/`SidebarPlaceholder`/`DrawerRail`/`AppShell`) with the Header showing real STATE.md-derived data (project name, milestone badge, "Fase N de M", progress bar) and graceful placeholder+tooltip when a field is `unrecognized`
- "Open project" flow wired end-to-end: native folder dialog -> `validateProjectRoot` -> `readPlanningText` -> `parseStateFile` -> store -> Header
- `project.json` i18n namespace with full pt-BR/en key parity; zero hardcoded UI strings in any namespace-owning component

## Task Commits

Each task was committed atomically:

1. **Task 1: Portão de entrada seguro do filesystem — comando Rust `validate_project_root` + camada de leitura TS** - `031e8c7` (feat)
2. **Task 2: Modelo do projeto e parser de STATE.md com fallback explícito** - `542709b` (feat)
3. **Task 3: Esqueleto de layout, header com dados reais e fluxo "Abrir projeto"** - `4460aaf` (feat)

**Plan metadata:** _pending — created after this SUMMARY, in the final commit step_

## Files Created/Modified

- `src-tauri/src/project.rs` - `validate_project_root` command, `ValidatedProject`/`ProjectError`, pure `is_contained` + 6 unit tests
- `src-tauri/src/lib.rs` - registers `project::validate_project_root` in the invoke handler
- `src-tauri/Cargo.toml` - added `dunce = "1"` (already transitively resolved at 1.0.5)
- `src-tauri/capabilities/default.json` - added `fs:allow-size` (read-only, needed for the pre-read size gate)
- `src/planning/paths.ts` - `planningDir`/`roadmapPath`/`statePath`/`phasesDir`/`milestonesDir`/`milestonesIndexPath`, normalized separators
- `src/planning/read.ts` - `validateProjectRoot`, `readPlanningText` (2MB cap via `size()` before `readTextFile()`), `listPlanningDir`, `planningFileExists`
- `src/planning/read.test.ts` - 13 tests (paths.ts pure functions + error-kind mapping + size gate)
- `src/planning/parse-result.ts` - `ParseResult<T>`/`ok`/`unrecognized`/`isUnrecognized`/`ParseIssue`
- `src/planning/model.ts` - `ProjectStateModel`, `ProjectProgress`, `PhaseBlocker`, minimal `PhaseModel`/`MilestoneRef`
- `src/planning/parser/state.ts` - `parseStateFile`; per-field `ParseResult` wrapping + AST-based blocker extraction
- `src/planning/parser/state.test.ts` - 8 tests
- `src/planning/__fixtures__/state/healthy-STATE.md` / `broken-frontmatter-STATE.md` - real + intentionally-corrupted fixtures
- `src/stores/board-store.ts` - `useBoardStore` (zustand+immer), `openProject`/`closeProject`
- `src/shell/AppShell.tsx` / `Header.tsx` / `SidebarPlaceholder.tsx` / `DrawerRail.tsx` - D-04 layout skeleton
- `src/shell/AppShell.test.tsx` - 3 tests (idle/error/open store states)
- `src/components/EmptyState.tsx` / `ErrorState.tsx` / `ProgressBar.tsx` - generic reusable components
- `src/locales/pt-BR/project.json` / `en/project.json` - full key parity
- `src/App.tsx` - now renders `AppShell`
- `src/i18n.ts` - registers the `project` namespace
- `src/styles/theme.css` - added `--color-foreground` light/dark pair (see deviations)
- `src/test/setup.ts` - imports `../i18n` globally (see deviations)

## Decisions Made

- `dunce::canonicalize` over `std::fs::canonicalize` in Rust to avoid the Windows `\\?\` prefix breaking TS-side path concatenation — verified via direct read of `tauri-2.11.5`/`tauri-plugin-fs-2.5.1` crate source before writing the command
- `ValidatedProject` serializes as camelCase over IPC (`#[serde(rename_all = "camelCase")]`) so `read.ts` never needs a manual snake_case mapping layer
- `readPlanningText` calls `size()` before `readTextFile()` so an oversized file's bytes never cross IPC at all, not just get rejected after loading — required adding `fs:allow-size` to the capability allowlist (documented as a deviation below)
- Blocker extraction uses the `remark-parse` mdast tree (find the heading, then the next `List` sibling) instead of regex-over-text, so the gsd-core template's bracketed comment paragraph under `### Blockers/Concerns` is structurally skipped rather than needing a special-cased exclusion rule
- `healthy-STATE.md`'s `current_phase_name` fixture value is the literal frontmatter string `espelho-fiel`, not the plan's illustrative `"Espelho fiel"` — kept literal per the project's core "never invent a plausible value" rule rather than reformatting a slug

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `dunce` as a direct Rust dependency**
- **Found during:** Task 1 (writing `validate_project_root`)
- **Issue:** `std::fs::canonicalize` returns Windows extended-length paths (`\\?\C:\dev\gsd-cards`); concatenating `.planning/ROADMAP.md` onto that in `paths.ts` would produce a broken path, failing the plan's own acceptance criterion "funciona com raiz Windows (`C:\dev\x`)"
- **Fix:** Added `dunce = "1"` to `src-tauri/Cargo.toml` (already resolved at 1.0.5 as a transitive dependency of the existing approved stack — no new supply-chain surface) and used `dunce::canonicalize` in `project.rs`
- **Files modified:** src-tauri/Cargo.toml, src-tauri/Cargo.lock, src-tauri/src/project.rs
- **Verification:** `cargo test` passes including Windows-style containment tests; `cargo check` clean
- **Committed in:** 031e8c7 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added `fs:allow-size` capability + pre-read size gate**
- **Found during:** Task 1 (implementing the T-01-05 2MB cap on `readPlanningText`)
- **Issue:** Checking file size only after `readTextFile()` already loaded the content defeats the DoS mitigation's purpose (the oversized content would have already crossed the IPC boundary into the webview)
- **Fix:** Added `fs:allow-size` (read-only, no new write/broaden-scope surface) to `capabilities/default.json`; `readPlanningText` now calls `size()` first and only calls `readTextFile()` if under the 2MB cap
- **Files modified:** src-tauri/capabilities/default.json, src/planning/read.ts
- **Verification:** `read.test.ts` "rejeita com ReadTextError kind TooLarge... " test asserts `readTextFileMock` was never called
- **Committed in:** 031e8c7 (Task 1 commit)

**3. [Rule 2 - Missing Critical] Added `--color-foreground` design token (light/dark pair)**
- **Found during:** Task 3 (building EmptyState/ErrorState/Header, all of which render text)
- **Issue:** `theme.css` from Plan 01 declared background tokens (dominant/secondary/accent/warning/success/destructive) that swap via `prefers-color-scheme`, but no accompanying text-color token — any component using inherited/default text color would be unreadable in dark mode (near-black default text on the `#0b0d10` dark background)
- **Fix:** Added `--color-foreground: #18181b` (light) / `#f4f4f5` (dark) to `theme.css`, consumed by every new text-rendering component
- **Files modified:** src/styles/theme.css
- **Verification:** Manual reasoning + consistent usage across Header/EmptyState/ErrorState/SidebarPlaceholder/DrawerRail; full dark-mode visual check deferred to end-of-phase human verification alongside D4
- **Committed in:** 4460aaf (Task 3 commit)

**4. [Rule 3 - Blocking] Imported `../i18n` in the global test setup**
- **Found during:** Task 3 (`AppShell.test.tsx` initially rendered raw i18next keys like `"error.notGsd.heading"` instead of translated text)
- **Issue:** No test file previously exercised `useTranslation`, so nothing had triggered `i18next.init()` in the vitest environment; `react-i18next` falls back to returning keys verbatim without it
- **Fix:** Added `import "../i18n";` to `src/test/setup.ts`, which vitest.config.ts already loads via `setupFiles` for every test
- **Files modified:** src/test/setup.ts
- **Verification:** `AppShell.test.tsx` assertions on translated text (`"Nenhum projeto aberto"`, `"Esta pasta não é um projeto GSD"`, etc.) pass
- **Committed in:** 4460aaf (Task 3 commit)

**5. [Rule 3 - Blocking] Used `?raw` Vite asset imports instead of `fs.readFileSync(new URL(...))` for test fixtures**
- **Found during:** Task 2 (`state.test.ts` initially threw `ENOENT`/`TypeError: The URL must be of scheme file`)
- **Issue:** Vite statically rewrites the `new URL('relative/path', import.meta.url)` pattern into an asset reference at build/transform time rather than leaving it as a runtime `file://` URL, breaking `fs.readFileSync(fileURLToPath(url))` in the vitest environment
- **Fix:** Switched fixture loading to `import healthyStateMd from "../__fixtures__/state/healthy-STATE.md?raw"`, Vite's native raw-text asset import (declared in `vite/client.d.ts`, already referenced via the project's `vite-env.d.ts`)
- **Files modified:** src/planning/parser/state.test.ts
- **Verification:** All 8 `state.test.ts` tests pass
- **Committed in:** 542709b (Task 2 commit)

---

**Total deviations:** 5 auto-fixed (2 Rule 3 blocking on Rust/Cargo path handling and test tooling, 1 Rule 3 blocking on a separate test-tooling issue, 2 Rule 2 missing-critical on security/DoS posture and dark-mode text contrast)
**Impact on plan:** All five were necessary for the plan's own acceptance criteria to pass (Windows path correctness, the T-01-05 DoS mitigation actually mitigating, tests exercising translated text, tests actually loading their fixtures). No architectural changes, no scope creep beyond what each acceptance criterion already demanded.

## Issues Encountered

None beyond the five auto-fixes documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `ParseResult<T>` contract, `validate_project_root` gate, and `src/planning/read.ts` are now the foundation every remaining Phase 1 plan (board/cards in 01-03, file watching in 01-04, artifact modal in 01-05, milestone history in 01-06) builds on without re-deriving path handling or parse-failure semantics
- `board-store.ts` already declares the `phases`/`milestones`/`recentlyUpdatedPhaseIds`/`sync` slots Plans 03/04/06 need, so those plans extend rather than restructure the store
- End-to-end manual verification (real `npm run tauri dev`, real folder picker, both valid and invalid `.planning/` folders) is deferred to end-of-phase per `workflow.human_verify_mode: "end-of-phase"` in `.planning/config.json` — flagged as coverage item D4, `human_judgment: true`
- No blockers for Plan 03

---
*Phase: 01-espelho-fiel*
*Completed: 2026-07-22*

## Self-Check: PASSED

All 21 tracked deliverable files confirmed present on disk; all 3 task commit hashes (`031e8c7`, `542709b`, `4460aaf`) confirmed present in `git log`.
