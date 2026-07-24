---
phase: 5
slug: comunidade
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-24
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (jsdom, `@testing-library/react`) + `cargo check`/`cargo test` (Rust) + JSON/YAML config validity |
| **Config file** | `vitest.config.ts` / `src-tauri/Cargo.toml` |
| **Quick run command** | `npx vitest run <changed-file>` |
| **Full suite command** | `npm test` + `cargo check --manifest-path src-tauri/Cargo.toml` |
| **Estimated runtime** | ~35 seconds (vitest) + Rust incremental |

---

## Sampling Rate

- **After every task commit:** `npx vitest run <changed-file>` (+ `cargo check` for Rust/config tasks; `node -e` JSON parse for tauri.conf.json)
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** Full suite green
- **Max feedback latency:** 35 seconds

---

## Per-Task Verification Map

> Seeded by plan-phase; completed by `/gsd-validate-phase` after plans exist.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | DIST-XX | T-05-01 / — | {expected} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Existing Vitest + cargo infrastructure covers all phase requirements — confirm during validate-phase.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Windows/macOS installer builds | DIST-02 | Require Windows/macOS runners (headless Linux cannot cross-build them) | Run the release workflow on CI (or locally on each OS); confirm the nsis/msi + dmg artifacts install and launch |
| Real signed auto-update round-trip | DIST-03 | Requires a signed release, a live endpoint serving `latest.json`, and an installed app that relaunches | After a signed release, install an older build, launch, confirm it detects + applies the update and relaunches |
| ed25519 keypair generation + CI secret | DIST-03 | Production signing key must be generated/held by the maintainer, never in an agent session | Run `tauri signer generate`; put the pubkey in tauri.conf.json; set `TAURI_SIGNING_PRIVATE_KEY` (+ password) as a CI secret |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 35s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
