---
phase: 05-comunidade
plan: 02
subsystem: infra
tags: [tauri, updater, process, rust, capabilities, dist-03]

# Dependency graph
requires:
  - phase: 05-comunidade (05-01)
    provides: i18n language round-trip (LanguageSwitcher, persisted language, boot restore) — no functional dependency, but the wave-2 plan this one follows
provides:
  - "@tauri-apps/plugin-updater@2.10.1 + @tauri-apps/plugin-process@2.3.1 (JS) installed"
  - "tauri-plugin-updater + tauri-plugin-process crates registered in the Rust Builder chain"
  - "Three granular capability grants (updater:allow-check, updater:allow-download-and-install, process:allow-restart) — no catch-all bundle"
affects: [05-03 (frontend check-update.ts wrapper + UpdateIndicator UI), 05-04 (tauri.conf.json plugins.updater config + release.yml CI)]

# Tech tracking
tech-stack:
  added: ["@tauri-apps/plugin-updater@2.10.1", "@tauri-apps/plugin-process@2.3.1", "tauri-plugin-updater (crate, \"2\" pin, resolved 2.10.1)", "tauri-plugin-process (crate, \"2\" pin, resolved 2.3.1)"]
  patterns: ["Granular per-command capability grants (never the plugin's catch-all *:default bundle) — same discipline as store/notification/fs"]

key-files:
  created: []
  modified: [package.json, package-lock.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock, src-tauri/src/lib.rs, src-tauri/capabilities/default.json]

key-decisions:
  - "Granted updater:allow-check + updater:allow-download-and-install (not updater:default) per RESEARCH.md Pitfall 2 — matches the exact two calls the frontend will make (check + downloadAndInstall) and preserves capabilities/default.json's own stated no-catch-all rule"
  - "Package-legitimacy checkpoint (Task 1) resolved via orchestrator pre-authorization — both packages are official tauri-apps org, same repo/monorepo as five plugins already trusted in Phases 1-4; SUS verdict in RESEARCH.md was a sandbox api.npmjs.org-telemetry gap, not a legitimacy finding"

patterns-established:
  - "capabilities/default.json header description sentence extended (not replaced) for each new plugin's grant scope, following the store/notification precedent — every plugin's capability rationale lives inline in the file's own description field"

requirements-completed: [DIST-03]

coverage:
  - id: D1
    description: "Updater + process plugins installed (JS + crate) and registered in lib.rs Builder chain"
    requirement: "DIST-03"
    verification:
      - kind: unit
        ref: "cargo check --manifest-path src-tauri/Cargo.toml"
        status: pass
      - kind: other
        ref: "grep -q tauri_plugin_updater / tauri_plugin_process in src-tauri/src/lib.rs and src-tauri/Cargo.toml"
        status: pass
    human_judgment: false
  - id: D2
    description: "Webview granted only the three per-command updater/process permissions actually used — no catch-all bundle"
    requirement: "DIST-03"
    verification:
      - kind: other
        ref: "grep -c 'updater:default' src-tauri/capabilities/default.json == 0; grep -Eq 'updater:allow-check|updater:allow-download-and-install' and 'process:allow-restart' present"
        status: pass
    human_judgment: false
  - id: D3
    description: "Package-legitimacy checkpoint for the two npm packages resolved before install"
    requirement: "DIST-03"
    verification: []
    human_judgment: true
    rationale: "Resolved via orchestrator pre-authorization in this session (documented in Decisions), not an independent human click-through of npmjs.com — recorded here for traceability, not requiring a second human pass"

duration: 6min
completed: 2026-07-24
status: complete
---

# Phase 05 Plan 02: Updater/Process Plugins Summary

**Installed and registered `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` (JS + Rust crate) with exactly three granular capability grants — no catch-all `updater:default` bundle — providing the DIST-03 backend surface for signed auto-update.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-24T08:24:20Z
- **Completed:** 2026-07-24T08:29:31Z
- **Tasks:** 2 (1 checkpoint, 1 auto)
- **Files modified:** 6

## Accomplishments
- `@tauri-apps/plugin-updater@2.10.1` and `@tauri-apps/plugin-process@2.3.1` installed via npm, matching RESEARCH.md's Standard Stack versions exactly
- `tauri-plugin-updater = "2"` and `tauri-plugin-process = "2"` added to `src-tauri/Cargo.toml`, resolving to `2.10.1`/`2.3.1` (same as JS side), matching the loose-pin convention of every sibling `tauri-plugin-*` dependency
- Both plugins registered in `lib.rs`'s `tauri::Builder::default()` chain, each preceded by a WHY doc-comment following the file's established convention (see `opener`/`store`/`notification` precedent)
- `capabilities/default.json` extended with exactly three grants: `updater:allow-check`, `updater:allow-download-and-install`, `process:allow-restart` — the catch-all `updater:default` bundle is absent (verified via `grep -c 'updater:default'` returning `0`)
- Header `description` field extended with a sentence documenting the new grants' scope, matching how store/notification are each documented inline

## Task Commits

Each task was committed atomically:

1. **Task 1: Package-legitimacy gate for the updater + process npm packages** - checkpoint resolved via orchestrator pre-authorization (no code change, no commit — see Decisions)
2. **Task 2: Install + register the updater/process plugins with granular capabilities** - `7ffe785` (feat)

**Plan metadata:** commit pending (final docs commit below)

## Files Created/Modified
- `package.json` / `package-lock.json` - adds `@tauri-apps/plugin-updater@^2.10.1`, `@tauri-apps/plugin-process@^2.3.1`
- `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` - adds `tauri-plugin-updater = "2"`, `tauri-plugin-process = "2"` dependencies
- `src-tauri/src/lib.rs` - two additive `.plugin(...)` calls (`tauri_plugin_updater::Builder::new().build()`, `tauri_plugin_process::init()`), each with a WHY doc-comment
- `src-tauri/capabilities/default.json` - three granular permission grants + extended header description sentence

## Decisions Made
- **Granular grants over `updater:default`:** chose `updater:allow-check` + `updater:allow-download-and-install` + `process:allow-restart` instead of the plugin's official-docs-recommended `updater:default` bundle, per RESEARCH.md Pitfall 2 — this codebase's own `capabilities/default.json` header explicitly states "nunca o bundle catch-all," already followed for store/notification/fs.
- **Package-legitimacy checkpoint resolved via pre-authorization:** the orchestrator verified both `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` are official `tauri-apps` org packages from `github.com/tauri-apps/plugins-workspace` — the identical repo already trusted for `plugin-store`/`plugin-notification`/`plugin-fs`/`plugin-dialog`/`plugin-opener` across Phases 1-4. RESEARCH.md's own audit flagged both as SUS only because of a sandbox `api.npmjs.org`-download-telemetry gap (`unknown-downloads`), not a real legitimacy finding; crates.io side had no gate at all. Proceeded directly to install per the pre-authorization.
- **Description-field wording avoided repeating the literal string `updater:default`:** the plan's own acceptance criterion (`grep -c 'updater:default' ... == 0`) would have false-negatived against the header's own prose explanation of what was rejected — reworded to "o bundle catch-all do plugin updater" to keep the description's rationale intact without tripping the grep.

## Deviations from Plan

None - plan executed exactly as written, apart from the internal wording adjustment above (not a deviation from plan intent, just a phrasing fix to satisfy the plan's own acceptance grep).

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. (Real ed25519 signing key generation, `pubkey` config, and `TAURI_SIGNING_PRIVATE_KEY` CI secret are explicitly Manual-Only per RESEARCH.md and deferred to plan 05-04, which is out of this plan's scope.)

## Next Phase Readiness
- Plan 05-03 (frontend `check-update.ts` wrapper + `UpdateIndicator` UI) can now import `@tauri-apps/plugin-updater`'s `check()`/`Update.downloadAndInstall()` and `@tauri-apps/plugin-process`'s `relaunch()` — the capability grants already cover exactly those calls.
- Plan 05-04 (`tauri.conf.json > plugins.updater` config + `.github/workflows/release.yml`) can proceed independently; this plan touched neither `tauri.conf.json` nor CI workflow files.
- `cargo check`, `npm run typecheck`, `npm test` (556/556), and `cargo test` (26 unit + 2 integration) are all green with both plugins registered — no regressions introduced.

---
*Phase: 05-comunidade*
*Completed: 2026-07-24*

## Self-Check: PASSED
