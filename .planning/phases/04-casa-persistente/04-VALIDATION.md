---
phase: 4
slug: casa-persistente
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-24
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (jsdom, `@testing-library/react`) + `cargo test` (Rust backend) |
| **Config file** | `vitest.config.ts` / `src-tauri/Cargo.toml` |
| **Quick run command** | `npx vitest run <changed-file>` |
| **Full suite command** | `npm test` (`vitest run`) + `cargo test --manifest-path src-tauri/Cargo.toml` |
| **Estimated runtime** | ~35 seconds (vitest) + Rust incremental |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed-file>` (and `cargo test` for Rust tasks)
- **After every plan wave:** Run `npm test` (+ `cargo test` if Rust touched)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 35 seconds

---

## Per-Task Verification Map

> Seeded by plan-phase; completed by `/gsd-validate-phase` after plans exist.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | PROJ-XX | T-04-01 / — | {expected} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Existing Vitest + cargo infrastructure covers all phase requirements — confirm during validate-phase.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Session restore end-to-end (`claude --resume` + snapshot rehydration) against a real prior session | SESS-04 | Requires a real `claude` CLI + a persisted prior run; cannot be exercised headless | Reopen the app after closing with a live session; confirm the restored row reads as history, and re-activating it resumes the real conversation |
| OS notification actually fires on the desktop | TERM-04 | System-rendered; needs a real desktop session + granted permission | Trigger an `awaiting` state and a session exit; confirm OS notification appears |

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
