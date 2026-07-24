---
phase: 05-comunidade
verified: 2026-07-24T09:30:00Z
status: human_needed
score: 24/24 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Dismiss the update-error pill, then trigger a second successful checkForUpdate() that finds an update available again (e.g. call useUpdateStore.getState().setAvailable(update) after a dismiss(), or wait for a future periodic re-check once one is built) and confirm the UpdateIndicator row reappears on both Header and HomeScreen mounts."
    expected: "The indicator reappears with the accent dot + label + action after the next successful check, per the 05-03-PLAN.md backstop statement — it must never stay silently hidden forever after a dismiss."
    why_human: "05-03-PLAN.md tags this must-have with verification: backstop (a non-inferable truth per honest-verifier.md/ADR-550 D7a). No held-out test exercises the dismiss -> subsequent setAvailable() -> reappear sequence end-to-end; existing tests independently cover 'dismiss hides the row' and 'available renders the row' but never chain them. Per the honest-verifier protocol, symbol presence + two separately-passing tests is not explicit evidence for a non-inferable truth — this must abstain to human_needed (reason: insufficient_spec) rather than be marked VERIFIED on inference alone."
  - test: "Run `tauri signer generate`, replace the placeholder pubkey in tauri.conf.json with the real public key, and register TAURI_SIGNING_PRIVATE_KEY / TAURI_SIGNING_PRIVATE_KEY_PASSWORD as GitHub Actions repository secrets."
    expected: "The maintainer completes the ed25519 keypair generation and CI secret registration exactly as documented in .planning/RELEASE.md steps 1-3."
    why_human: "05-04-PLAN.md backstop, verification: human. Explicitly Manual-Only by design (CONTEXT 'Chave de assinatura', T-05-07) — the private key must never be generated or held inside an agentic session. Cannot be exercised headless."
  - test: "Push a version tag (vX.Y.Z) to trigger release.yml, confirm real Windows/macOS/Linux installers build and a real signed auto-update round-trip (check -> download -> verify -> install -> relaunch) succeeds against the real GitHub Releases endpoint."
    expected: "Installers are produced by the CI matrix and a running app instance successfully self-updates via the real signed artifact."
    why_human: "05-04-PLAN.md backstop, verification: human. This Linux headless session can only validate config/YAML shape (confirmed below); producing/launching real cross-platform installers and exercising a real signed round-trip is Manual-Only per 05-RESEARCH.md Pitfall 4 and .planning/RELEASE.md section 6."
---

# Phase 5: Comunidade Verification Report

**Phase Goal:** O app está pronto para a comunidade GSD — UI bilíngue pt-BR/en com troca de idioma, instalador empacotado multiplataforma (Windows primeiro; macOS/Linux), e auto-atualização (updater do Tauri com assinatura ed25519).
**Verified:** 2026-07-24T09:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Plan | Status | Evidence |
|---|-------|------|--------|----------|
| 1 | User can toggle pt-BR/en from a segmented pill; every `useTranslation` consumer re-renders | 05-01 | VERIFIED | `src/shell/LanguageSwitcher.tsx` (onClick calls `i18n.changeLanguage` + `setLanguage`); `LanguageSwitcher.test.tsx` passes |
| 2 | Choice persists to `app-state.json` (appDataDir) and restores on next boot | 05-01 | VERIFIED | `app-store.ts` `setLanguage`/`getLanguage` via `withStoreLock`; `AppShell.tsx` boot effect; `app-store.test.ts` + `AppShell.test.tsx` pass |
| 3 | Corrupted/unrecognized stored value is enum-validated and discarded; navigator.language is the first-run fallback | 05-01 | VERIFIED | `isSupportedLanguage()` guard in `app-store.ts:188-190`, `getLanguage()` never returns raw string; `AppShell.tsx:50-68` `.catch(() => null)` chain (WR-01 fix, commit `3a6b4fb`) |
| 4 | LanguageSwitcher reachable both on Home and inside an open project | 05-01 | VERIFIED | `grep LanguageSwitcher` present in `Header.tsx:143` and `HomeScreen.tsx:128` |
| 5 | 9-namespace pt-BR/en key parity locked by automated test | 05-01 | VERIFIED | `src/locales/parity.test.ts` — `collectKeyPaths` present; test run: 10/10 namespace tests pass (10, not 9, after the `update` namespace was added by 05-03 — count updated correctly) |
| 6 | date-fns timestamps (SyncIndicator, SessionRow) render in correct locale after switch | 05-01 | VERIFIED | `SyncIndicator.test.tsx` / `SessionRow.test.tsx` locale-propagation cases pass |
| 7 | LanguageSwitcher shows exactly two fixed segments (PT/EN) | 05-01 | VERIFIED | `SUPPORTED_LANGUAGES = ["pt-BR", "en"] as const` (`app-store.ts:176`), `.map()` over exactly these two in `LanguageSwitcher.tsx:80` |
| 8 | Cold boot renders synchronous pt-BR default, may flip once to saved language | 05-01 | VERIFIED | `i18n.ts` synchronous init default + `AppShell.tsx` async boot-restore effect; `AppShell.test.tsx` covers saved/en-fallback/non-en-fallback cases |
| 9 | Updater + process plugins installed (JS + crate), registered in Rust builder chain | 05-02 | VERIFIED | `Cargo.toml` has `tauri-plugin-updater`/`tauri-plugin-process`; `lib.rs` has `.plugin(tauri_plugin_updater::Builder::new().build())` + `.plugin(tauri_plugin_process::init())`; `cargo check` passes |
| 10 | Webview granted ONLY the per-command permissions used — never the catch-all bundle | 05-02 | VERIFIED | `capabilities/default.json` has exactly `updater:allow-check`, `updater:allow-download-and-install`, `process:allow-restart`; `grep -c 'updater:default'` returns 0 |
| 11 | `cargo check` passes with plugins + capabilities | 05-02 | VERIFIED | Ran `cargo check --manifest-path src-tauri/Cargo.toml` directly — clean, 0.33s |
| 12 | App checks for update once on boot (module-cached, never-throws), degrades safely on failure | 05-03 | VERIFIED | `check-update.ts:20-33` — `pendingCheck` module cache, `check().catch(() => null)`; `check-update.test.ts` passes |
| 13 | Non-intrusive UpdateIndicator (dot+label+action) when update available, reachable both mount points | 05-03 | VERIFIED | `UpdateIndicator.tsx:118-128`; mounted in `Header.tsx:145`/`HomeScreen.tsx:129`; `UpdateIndicator.test.tsx` "estado available" passes |
| 14 | One explicit click required before download/install/relaunch — never silent auto-relaunch | 05-03 | VERIFIED | `installUpdateAndRelaunch` is called ONLY from `UpdateIndicator.tsx`'s `onClick` handlers (`grep -rn installUpdateAndRelaunch src/` shows the only non-test call site); the `AppShell.tsx` boot effect calls `checkForUpdate()`, never `installUpdateAndRelaunch` |
| 15 | During download, dot pulses with percent label; action button removed (not disabled) | 05-03 | VERIFIED | `UpdateIndicator.test.tsx` "estado downloading" — asserts `.status-dot--pulse` class present and `queryByRole("button")` returns none |
| 16 | On failure, dot flips to warning with retry + dismiss (X) that hides the row | 05-03 | VERIFIED | `UpdateIndicator.test.tsx` "estado error" tests (render, retry re-calls `installUpdateAndRelaunch`, dismiss empties the DOM) all pass |
| 17 | checking/up-to-date render nothing — never announces "up to date" | 05-03 | VERIFIED | `UpdateIndicator.tsx:74-76` early return `null`; both cases tested |
| 18 | Both UpdateIndicator mounts read one shared module-level state | 05-03 | VERIFIED | Single `useUpdateStore` zustand module (`update-store.ts`) imported by both mount sites; no per-instance state |
| 19 | Labels short/bounded (percent <=4 chars; version only in tooltip) | 05-03 | VERIFIED | `update.json` — `downloading.label` interpolates only `{{percent}}%` (max "100%" = 4 chars); `available.label` has no version, version appears only in `available.tooltip` |
| 20 | Signature verification happens inside `tauri-plugin-updater` (ed25519), never hand-rolled in frontend | 05-03 | VERIFIED | `check-update.ts` doc-comment + code: only calls plugin `check()`/`downloadAndInstall()`, no crypto in the file |
| B1 | Dismissing the error pill hides it until a subsequent successful re-check finds an update again | 05-03 | **⚠️ insufficient_spec (backstop)** | Tagged `verification: backstop` in 05-03-PLAN.md frontmatter. `dismiss()` and `setAvailable()` are each independently tested, but no held-out test chains dismiss -> next check -> reappear. Per honest-verifier.md, this must abstain to human_needed rather than be inferred VERIFIED. |
| 21 | `tauri.conf.json` carries complete bundle config + `createUpdaterArtifacts`, passes cargo check | 05-04 | VERIFIED | `tauri.conf.json` bundle block (icons, category, publisher, per-target sections, `createUpdaterArtifacts: true`); `node -e "JSON.parse(...)"` and `cargo check` both pass |
| 22 | Updater endpoint is HTTPS, insecure-transport override flag absent | 05-04 | VERIFIED | `endpoints: ["https://github.com/.../latest.json"]`; `grep -c dangerousInsecureTransportProtocol` returns 0 |
| 23 | `release.yml` valid YAML, tag-triggered, tauri-action matrix, secrets only via env | 05-04 | VERIFIED | `python3 -c "yaml.safe_load(...)"` passes; `on.push.tags: ["v*"]`; matrix (macOS aarch64+x86_64, ubuntu, windows); secrets referenced only inside `env:` (no `echo`/`printf` of `TAURI_SIGNING*`) |
| 24 | Version bump procedure documented (package.json + Cargo.toml + tauri.conf.json together) | 05-04 | VERIFIED | `.planning/RELEASE.md` section 4 |
| B2 | Real ed25519 keypair generation + CI secret registration | 05-04 | **Manual-Only (human_needed)** | `verification: human` in PLAN frontmatter; explicitly never performed in this session by design (T-05-07) |
| B3 | Real Windows/macOS/Linux installers + real signed update round-trip | 05-04 | **Manual-Only (human_needed)** | `verification: human` in PLAN frontmatter; cannot be exercised headless (05-RESEARCH.md Pitfall 4) |

**Score:** 24/24 inferable must-haves truths verified (100%). 1 backstop truth abstained (insufficient_spec, B1). 2 explicitly Manual-Only backstops (B2, B3) routed to human verification by design, not failures.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/persistence/app-store.ts` | `LANGUAGE_KEY` + `setLanguage()`/`getLanguage()` enum-validated | VERIFIED | `getLanguage`/`isSupportedLanguage`/`SUPPORTED_LANGUAGES` present, wired, real |
| `src/shell/LanguageSwitcher.tsx` | Two-segment pt-BR/en pill | VERIFIED | 105 lines, real UI-SPEC-compliant implementation, no stub markers |
| `src/locales/parity.test.ts` | Recursive key-path parity guard | VERIFIED | `collectKeyPaths` present, 10 namespace tests pass |
| `src/locales/{pt-BR,en}/common.json` | `language.*` keys | VERIFIED | Both languages fully populated (`groupLabel`, `pt.short/full`, `en.short/full`) |
| `src-tauri/Cargo.toml` | updater+process crate deps | VERIFIED | `tauri-plugin-updater`/`tauri-plugin-process` = "2" present |
| `src-tauri/src/lib.rs` | Builder registration of both plugins | VERIFIED | Both `.plugin(...)` calls present with WHY doc-comments |
| `src-tauri/capabilities/default.json` | Granular updater/process grants | VERIFIED | Exactly 3 grants, no catch-all |
| `src/updates/check-update.ts` | `checkForUpdate()`/`installUpdateAndRelaunch()` | VERIFIED | `pendingCheck` cache present, never-throws, correct download->install->relaunch order |
| `src/updates/update-store.ts` | Shared 5-state update slice | VERIFIED | 61 lines, `checking\|up-to-date\|available\|downloading\|error` + percent/version/pendingUpdate |
| `src/updates/UpdateIndicator.tsx` | 5-state update affordance | VERIFIED | 129 lines, all 5 states implemented per UI-SPEC, uses `useTranslation` throughout |
| `src/locales/{pt-BR,en}/update.json` | update.* copy | VERIFIED | Both languages fully populated |
| `src-tauri/tauri.conf.json` | Bundle config + plugins.updater | VERIFIED | Complete, validates via JSON.parse + cargo check |
| `.github/workflows/release.yml` | tauri-action release workflow | VERIFIED | Valid YAML, tag-triggered, matrix, secrets-safe |
| `.planning/RELEASE.md` | Manual-Only maintainer steps | VERIFIED | 101 lines, all 5 sections present (keygen, pubkey swap, secrets, version bump, OS-signing note) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `LanguageSwitcher.tsx` | `app-store.ts` | `onClick` calls `i18n.changeLanguage` + `setLanguage` | WIRED | Confirmed in code (`handleClick`) |
| `AppShell.tsx` | `app-store.ts` | boot effect reads `getLanguage()` then `changeLanguage(saved)` | WIRED | Confirmed, plus WR-01 `.catch()` hardening |
| `lib.rs` | `Cargo.toml` | `tauri_plugin_updater::Builder::new().build()` requires the crate dep | WIRED | Both present, `cargo check` green |
| `capabilities/default.json` | `Cargo.toml` | permission identifiers from plugin schemas | WIRED | Confirmed real identifiers (cross-checked against vendored crate sources per 05-REVIEW.md) |
| `AppShell.tsx` | `check-update.ts` | boot effect calls `checkForUpdate()`, feeds `update-store` | WIRED | Confirmed in code |
| `UpdateIndicator.tsx` | `update-store.ts` | subscribes to shared state slice | WIRED | Confirmed, both mounts import the same module |
| `check-update.ts` | `@tauri-apps/plugin-updater` | `check()` + `Update.downloadAndInstall()` then `plugin-process relaunch()` | WIRED | Confirmed, correct order |
| `tauri.conf.json` | GitHub Releases `latest.json` endpoint | `plugins.updater.endpoints[0]` HTTPS URL | WIRED | Confirmed present, HTTPS |
| `release.yml` | `tauri-apps/tauri-action@v1` | build/sign/publish step | WIRED | Confirmed, pinned to `@v1` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted phase test suite | `npx vitest run <9 phase-relevant test files>` | 96/96 passed | PASS |
| Full frontend test suite (run once) | `npm test` | 577/577 passed, 53 test files | PASS |
| Rust config/plugin compile | `cargo check --manifest-path src-tauri/Cargo.toml` | Clean, no errors | PASS |
| TypeScript typecheck | `npm run typecheck` | Clean | PASS |
| tauri.conf.json JSON validity | `node -e "JSON.parse(...)"` | Exit 0 | PASS |
| release.yml YAML validity | `python3 -c "yaml.safe_load(...)"` | Exit 0 | PASS |
| Placeholder pubkey is obviously fake | `base64 -d` on the pubkey value | Decodes to `PANSIGN_PLACEHOLDER_NOT_A_REAL_KEY_REPLACE_VIA_TAURI_SIGNER_GENERATE` | PASS |
| No insecure-transport flag | `grep -c dangerousInsecureTransportProtocol tauri.conf.json` | 0 | PASS |
| No catch-all updater capability | `grep -c 'updater:default' capabilities/default.json` | 0 | PASS |
| No echoed signing secrets in CI | `grep -nE '(echo\|printf).*TAURI_SIGNING' release.yml` | (empty) | PASS |
| `installUpdateAndRelaunch` never called outside explicit click | `grep -rn installUpdateAndRelaunch src/` (excluding tests) | Only call site: `UpdateIndicator.tsx:81` inside `handleInstall()` | PASS |

### Anti-Patterns Found

Scanned all files touched by this phase (`app-store.ts`, `LanguageSwitcher.tsx`, `AppShell.tsx`, `Header.tsx`, `HomeScreen.tsx`, `parity.test.ts`, `check-update.ts`, `update-store.ts`, `UpdateIndicator.tsx`, `lib.rs`, `Cargo.toml`, `capabilities/default.json`, `tauri.conf.json`, `release.yml`, `RELEASE.md`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`-as-debt-marker patterns.

None found in any phase-5 file. (One unrelated match: `PLACEHOLDER` constant in `src/shell/Header.tsx` — a pre-existing em-dash fallback string for missing project metadata, from an earlier phase, not a debt marker, not modified by this phase.)

No blockers. No warnings beyond the backstop item already tracked as human verification above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| DIST-01 | 05-01 | UI disponível em pt-BR e inglês (i18n desde o início) | SATISFIED | Truths 1-8 all VERIFIED |
| DIST-02 | 05-04 | Usuário instala o app via instalador empacotado | SATISFIED | Truths 21, 23, 24 VERIFIED (headless-authorable scope); real installer production is B3 (Manual-Only by design, documented) |
| DIST-03 | 05-02, 05-03, 05-04 | App se atualiza automaticamente quando há nova versão | SATISFIED | Truths 9-20, 22 VERIFIED (headless-authorable scope); real signed round-trip is B3/B2 (Manual-Only by design, documented) |

No orphaned requirements — all three phase-5 requirement IDs (DIST-01, DIST-02, DIST-03) are declared across the four plans' frontmatter and match `REQUIREMENTS.md`'s Phase 5 mapping exactly.

### Human Verification Required

#### 1. Dismiss-then-reappear backstop (DIST-03, 05-03-PLAN.md)

**Test:** Dismiss the update-error pill, then trigger a subsequent successful `checkForUpdate()` (or manually call `useUpdateStore.getState().setAvailable(update)` after `dismiss()`) and confirm the `UpdateIndicator` row reappears in both `Header` and `HomeScreen`.
**Expected:** The indicator reappears with the accent dot + label + action.
**Why human:** This is an author-tagged `verification: backstop` (non-inferable) truth per `05-03-PLAN.md`. No held-out test chains the dismiss -> next-check -> reappear sequence end-to-end; the two halves are tested independently but never composed. Per `honest-verifier.md`, this must abstain to `human_needed` (reason `insufficient_spec`) rather than be marked VERIFIED on inferred composition of two separate passing tests.

#### 2. Maintainer signing-key handoff (DIST-02/DIST-03, 05-04-PLAN.md, Manual-Only by design)

**Test:** Run `tauri signer generate`, replace the placeholder `pubkey` in `tauri.conf.json`, register `TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD` as GitHub Actions secrets.
**Expected:** Real signing material exists only on the maintainer's machine and in the GitHub secret store — never in this repo/session.
**Why human:** Explicitly Manual-Only per the phase's own security design (T-05-07) — the private key must never be generated inside an agentic session. Already documented in `.planning/RELEASE.md`; nothing to fix, this is expected handoff, not a gap.

#### 3. Real installers + signed update round-trip (DIST-02/DIST-03, 05-04-PLAN.md, Manual-Only by design)

**Test:** Push a version tag to trigger `release.yml`, confirm real Windows/macOS/Linux installers build, and exercise a real signed auto-update round-trip.
**Expected:** Installers build successfully on the CI matrix; a running app instance self-updates via the real signed artifact.
**Why human:** Cannot be exercised headless in this Linux sandbox (05-RESEARCH.md Pitfall 4). Config/YAML validity is already confirmed automated above; this is the acknowledged next step, documented in `.planning/RELEASE.md` section 6, not a gap in this phase's delivered scope.

### Gaps Summary

No gaps found. All 24 inferable must-haves truths across the four plans are VERIFIED against real, wired, tested code — not stubs, not placeholders masquerading as complete. The three code-review findings from `05-REVIEW.md` (WR-01, IN-01, IN-02) were all independently confirmed fixed in the actual codebase (commits `3a6b4fb`, `388c3d1`, `3536093`), not just claimed fixed in the review doc. The full automated suite (577 vitest tests, `cargo check`, `npm run typecheck`, JSON/YAML config validation) is green.

The phase routes to `human_needed` rather than `passed` solely because of three items that are correctly NOT closeable in this headless session: one author-flagged non-inferable backstop truth lacking an explicit held-out test (should get a dedicated dismiss->reappear test in a follow-up), and two explicitly Manual-Only maintainer steps (signing-key generation, real installer/round-trip verification) that this phase's own design correctly refuses to fake. None of these represent incomplete or stubbed work — they represent honest boundaries the phase itself drew and documented.

---

_Verified: 2026-07-24T09:30:00Z_
_Verifier: Claude (gsd-verifier)_
