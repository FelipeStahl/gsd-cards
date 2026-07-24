---
phase: quick-260724-oed
plan: 01
subsystem: infra
tags: [cargo, tauri, build-config]

# Dependency graph
requires: []
provides:
  - src-tauri/Cargo.toml carries default-run = "gsd-cards" so bare `cargo run` (as invoked by `tauri dev` / `npm run tauri dev`) unambiguously resolves to the app binary
affects: [tauri-dev-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: [src-tauri/Cargo.toml]

key-decisions:
  - "default-run value set to gsd-cards (matching [package] name) rather than adding an explicit [[bin]] for the app binary — Cargo's own error message names default-run as the exact remedy, keeping the implicit main.rs binary discovery unchanged"

patterns-established: []

requirements-completed: [QUICK-260724-oed-default-run]

coverage:
  - id: D1
    description: "cargo metadata reports default_run:\"gsd-cards\" for the src-tauri package, resolving the multi-binary ambiguity error"
    requirement: "QUICK-260724-oed-default-run"
    verification:
      - kind: other
        ref: "cargo metadata --no-deps --format-version 1 --manifest-path src-tauri/Cargo.toml | grep -o '\"default_run\":\"gsd-cards\"'"
        status: pass
    human_judgment: false
  - id: D2
    description: "tree_kill_helper bin target remains declared and discoverable after the default-run change, so the SESS-06 integration test's CARGO_BIN_EXE_tree_kill_helper reference stays satisfiable"
    verification:
      - kind: other
        ref: "cargo metadata --no-deps --format-version 1 --manifest-path src-tauri/Cargo.toml | grep -o '\"tree_kill_helper\"'"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-07-24
status: complete
---

# Quick Task 260724-oed: Add default-run to src-tauri/Cargo.toml Summary

**Added `default-run = "gsd-cards"` to `[package]` in src-tauri/Cargo.toml, resolving the Cargo binary-selection ambiguity that broke `tauri dev` / `npm run tauri dev`.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-24T17:37:44Z
- **Completed:** 2026-07-24T17:38:09Z
- **Tasks:** 2 (1 code change, 1 verification-only)
- **Files modified:** 1

## Accomplishments
- `src-tauri/Cargo.toml` now declares `default-run = "gsd-cards"`, so bare `cargo run` (the invocation Tauri's dev command uses, with no `--bin` flag) unambiguously selects the app binary instead of erroring with "could not determine which binary to run ... available binaries: gsd-cards, tree_kill_helper"
- Confirmed via `cargo metadata` that the fix is in effect and the `tree_kill_helper` `[[bin]]` target (used by the SESS-06 `tests/tree_kill.rs` integration test via `env!("CARGO_BIN_EXE_tree_kill_helper")`) is untouched and still discoverable

## Task Commits

Each task was committed atomically:

1. **Task 1: Add default-run key to [package] in src-tauri/Cargo.toml** - `d255cfc` (fix)
2. **Task 2: Confirm binary ambiguity is gone and the helper target survives** - verification-only, no source changes; proven by the same `cargo metadata` run captured in Task 1's commit

## Files Created/Modified
- `src-tauri/Cargo.toml` - Added `default-run = "gsd-cards"` directly after `name = "gsd-cards"` in `[package]`; single line added, no other lines touched

## Decisions Made
- Set `default-run` to the string `gsd-cards`, exactly matching the existing `[package] name`, per Cargo's own error message and the plan's guidance — no `[[bin]]` added for the app binary since it stays implicit via `src/main.rs`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification Evidence

```
$ cargo metadata --no-deps --format-version 1 --manifest-path src-tauri/Cargo.toml | grep -o '"default_run":"gsd-cards"'
"default_run":"gsd-cards"

$ cargo metadata --no-deps --format-version 1 --manifest-path src-tauri/Cargo.toml | grep -o '"tree_kill_helper"'
"tree_kill_helper"
```

Diff was exactly the single added line:
```diff
 [package]
 name = "gsd-cards"
+default-run = "gsd-cards"
 version = "0.1.0"
```

A full `cargo build`/`cargo run` of the app was intentionally skipped (heavy GUI build, not required per plan constraints) — the `cargo metadata` proof plus the intact `tree_kill_helper` bin target is sufficient evidence the ambiguity is resolved without removing the test helper.

## Next Phase Readiness
- `npm run tauri dev` should no longer abort on the "could not determine which binary to run" error. No blockers for downstream work.

---
*Phase: quick-260724-oed*
*Completed: 2026-07-24*

## Self-Check: PASSED
- FOUND: src-tauri/Cargo.toml
- FOUND: .planning/quick/260724-oed-add-default-run-to-src-tauri-cargo-toml-/260724-oed-SUMMARY.md
- FOUND: d255cfc (commit)
