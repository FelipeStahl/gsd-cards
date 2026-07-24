---
phase: 05-comunidade
plan: 04
subsystem: infra
tags: [tauri, bundler, updater, github-actions, ci-cd, ed25519, release]

# Dependency graph
requires:
  - phase: 05-comunidade
    provides: "05-02 registered @tauri-apps/plugin-updater + plugin-process in lib.rs/Cargo.toml/capabilities/default.json (this plan only touches tauri.conf.json's bundle/plugins.updater config, not plugin registration)"
provides:
  - "Complete tauri.conf.json bundle config (icons, metadata, per-target windows/linux/macOS sections, createUpdaterArtifacts)"
  - "plugins.updater config block: HTTPS GitHub-Releases endpoint + base64-shaped placeholder pubkey"
  - "Tag-triggered .github/workflows/release.yml (tauri-action matrix: macOS aarch64+x86_64, ubuntu-latest, windows-latest)"
  - ".planning/RELEASE.md maintainer handoff (keygen, pubkey replacement, CI secrets, version bump, OS code-signing note)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tauri-action@v1 pinned to major tag as supply-chain control, secrets referenced only via env:/secrets.* context, never in run: steps"
    - "base64-shaped-but-obviously-fake placeholder pubkey (decodes to a human-readable warning string) so cargo check/JSON validation pass without a real signing key ever existing in this session"

key-files:
  created:
    - .github/workflows/release.yml
    - .planning/RELEASE.md
  modified:
    - src-tauri/tauri.conf.json

key-decisions:
  - "Placeholder pubkey chosen as base64 encoding of the literal string PANSIGN_PLACEHOLDER_NOT_A_REAL_KEY_REPLACE_VIA_TAURI_SIGNER_GENERATE — base64-shaped for schema validity (Pitfall 3) but self-documenting as fake if anyone decodes it"
  - "release.yml matrix follows RESEARCH Pattern 5 (macOS split into aarch64/x86_64 args) but reconciled toward ci.yml's ubuntu-latest + existing apt package list (no xdg-utils) per PATTERNS.md guidance, rather than RESEARCH's ubuntu-22.04 draft"
  - "Both plan checkpoints (placeholder-pubkey confirmation embedded in Task 1, and Task 3's maintainer signing-key handoff gate) resolved via orchestrator pre-authorization for this autonomous --to 5 run — no real key material generated or referenced at any point"

requirements-completed: [DIST-02, DIST-03]

coverage:
  - id: D1
    description: "tauri.conf.json carries a complete bundle config (icons, metadata, per-target sections) + createUpdaterArtifacts, and still passes cargo check config validation"
    requirement: "DIST-02"
    verification:
      - kind: unit
        ref: "node -e JSON.parse(tauri.conf.json) — exit 0"
        status: pass
      - kind: integration
        ref: "cargo check --manifest-path src-tauri/Cargo.toml"
        status: pass
    human_judgment: false
  - id: D2
    description: "plugins.updater block: HTTPS GitHub-Releases endpoint + base64-shaped placeholder pubkey, no insecure-transport override flag present"
    requirement: "DIST-03"
    verification:
      - kind: unit
        ref: "grep -q https://github.com/FelipeStahl/gsd-cards/releases/latest/download/latest.json tauri.conf.json"
        status: pass
      - kind: unit
        ref: "grep -c dangerousInsecureTransportProtocol tauri.conf.json returns 0"
        status: pass
    human_judgment: false
  - id: D3
    description: ".github/workflows/release.yml is syntactically valid YAML, tag-triggered, tauri-action matrix, references signing secrets only via env:/secrets.* context, never echoed"
    requirement: "DIST-02"
    verification:
      - kind: unit
        ref: "python3 -c \"import yaml; yaml.safe_load(open('.github/workflows/release.yml'))\""
        status: pass
      - kind: unit
        ref: "grep -nE '^[[:space:]]*(echo|printf).*TAURI_SIGNING' .github/workflows/release.yml returns nothing"
        status: pass
    human_judgment: false
  - id: D4
    description: ".planning/RELEASE.md documents every Manual-Only maintainer step (keygen, pubkey replacement, CI secret registration, version bump, OS code-signing best-effort note)"
    requirement: "DIST-02"
    verification:
      - kind: unit
        ref: "grep -q 'tauri signer generate' .planning/RELEASE.md"
        status: pass
    human_judgment: false
  - id: D5
    description: "Maintainer signing-key handoff checkpoint (Task 3, gate=blocking-human) — confirms no real key material anywhere in repo/docs/history and the Manual-Only boundary is understood"
    verification: []
    human_judgment: true
    rationale: "Task 3 is a checkpoint:human-verify gated on confirming the ed25519 signing-key boundary was scaffolded around, not crossed — resolved via orchestrator pre-authorization for this autonomous run per the executor's checkpoint_pre_authorization block, not by an automated check. Recorded as approved below; a human maintainer should still independently confirm before their first real release."

duration: 3min
completed: 2026-07-24
status: complete
---

# Phase 5 Plan 4: Distribution config + release CI Summary

**Complete tauri.conf.json bundle/updater config, tag-triggered release.yml (tauri-action matrix), and RELEASE.md maintainer handoff — the ed25519 signing key never generated or touched in this session.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-24T08:40:09Z
- **Completed:** 2026-07-24T08:42:28Z
- **Tasks:** 2 auto tasks completed + 1 checkpoint resolved (pre-authorized)
- **Files modified:** 3

## Accomplishments
- `src-tauri/tauri.conf.json` now carries a complete `bundle` block (icon array referencing the existing icon set, category/publisher/copyright/descriptions, per-target `windows.nsis`/`linux`/`macOS` sections, `createUpdaterArtifacts: true`) plus a `plugins.updater` block with an HTTPS GitHub-Releases `latest.json` endpoint and a base64-shaped, obviously-fake placeholder pubkey — validated by both `node -e "JSON.parse(...)"` and `cargo check`.
- New `.github/workflows/release.yml`: tag-triggered (`push: tags: ['v*']`) `publish-tauri` job with a fail-fast:false matrix (macOS aarch64 + x86_64 via separate `args`, ubuntu-latest, windows-latest), reusing `ci.yml`'s checkout/setup-node/Linux-deps/rust-toolchain/`npm ci` steps, then `tauri-apps/tauri-action@v1` (pinned major tag) with `TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD`/`GITHUB_TOKEN` passed exclusively through the step's `env:` block from the Actions `secrets` context.
- New `.planning/RELEASE.md`: the Manual-Only maintainer handoff — `tauri signer generate`, replacing the placeholder pubkey, registering the two CI secrets, the version-bump procedure (package.json + Cargo.toml + tauri.conf.json together, no automation), and the best-effort/optional OS-code-signing note (SmartScreen/Gatekeeper tradeoff accepted for v1).
- Both plan checkpoints resolved: the placeholder-pubkey confirmation (base64-shaped, decodes to an obviously-fake warning string, never a real key) and Task 3's maintainer signing-key handoff gate — both approved via orchestrator pre-authorization for this autonomous `--to 5` run, with the resolution recorded here rather than a live human prompt.
- This completes phase 5 (comunidade) at 4/4 plans.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bundle config + plugins.updater block in tauri.conf.json** - `dc2429f` (feat)
2. **Task 2: release.yml CI workflow + RELEASE.md maintainer handoff doc** - `30b19a8` (feat)
3. **Task 3: Maintainer signing-key handoff verification (Manual-Only boundary)** - checkpoint, no code change; resolved via orchestrator pre-authorization, documented below

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `src-tauri/tauri.conf.json` - Full bundle metadata + per-target sections + createUpdaterArtifacts; plugins.updater with HTTPS endpoint + placeholder pubkey
- `.github/workflows/release.yml` - Tag-triggered tauri-action release/sign/publish matrix
- `.planning/RELEASE.md` - Maintainer-only handoff doc (keygen, pubkey swap, CI secrets, version bump, OS signing note)

## Decisions Made
- Placeholder pubkey is a base64 encoding of `PANSIGN_PLACEHOLDER_NOT_A_REAL_KEY_REPLACE_VIA_TAURI_SIGNER_GENERATE` — satisfies the Tauri config schema's base64-shaped expectation (RESEARCH Pitfall 3) while being unambiguous and self-documenting as fake if anyone base64-decodes it.
- release.yml's Linux job uses `ubuntu-latest` + `ci.yml`'s exact existing apt package list (no `xdg-utils`), reconciling RESEARCH Pattern 5's `ubuntu-22.04` draft toward the repo's own CI convention per 05-PATTERNS.md guidance — no functional gap identified, `tauri-action`'s bundler doesn't require `xdg-utils` beyond what's already listed.
- Both plan checkpoints (Task 1's inline placeholder-pubkey confirmation and Task 3's blocking-human maintainer handoff) resolved as pre-approved for this autonomous `--to 5` orchestrator run per the executor's checkpoint pre-authorization — no real key material was generated, pasted, or referenced anywhere in this session.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

**External services require manual configuration** — but per this plan's own design, none of it happens automatically or is claimed done here. See `.planning/RELEASE.md` for the full maintainer handoff:
- Run `tauri signer generate` on the maintainer's own machine (never in CI/agentic session)
- Replace `src-tauri/tauri.conf.json`'s `plugins.updater.pubkey` placeholder with the real public key
- Register `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as GitHub Actions repository secrets
- Tag a release (`vX.Y.Z`) to trigger `release.yml` for the first real signed build

## Next Phase Readiness

Phase 5 (comunidade) is complete at 4/4 plans — DIST-01 (i18n language switcher), DIST-02 (installer config + release CI), and DIST-03 (auto-update config) are all headless-authorable work delivered. Nothing blocks moving to the next milestone phase or to `/gsd-ship`; the only outstanding items are the Manual-Only maintainer steps documented in `.planning/RELEASE.md`, which are explicitly out of scope for any autonomous session and do not block shipping the app itself (the placeholder pubkey/HTTPS endpoint config is valid and safe to ship as-is until the maintainer completes the real-key handoff).

---
*Phase: 05-comunidade*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: src-tauri/tauri.conf.json
- FOUND: .github/workflows/release.yml
- FOUND: .planning/RELEASE.md
- FOUND: .planning/phases/05-comunidade/05-04-SUMMARY.md
- FOUND commit: dc2429f
- FOUND commit: 30b19a8
