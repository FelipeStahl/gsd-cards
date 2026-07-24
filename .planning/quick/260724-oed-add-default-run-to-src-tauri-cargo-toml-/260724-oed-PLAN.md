---
phase: quick-260724-oed
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/Cargo.toml
autonomous: true
requirements:
  - QUICK-260724-oed-default-run
must_haves:
  truths:
    - "`cargo run` inside src-tauri (and therefore `tauri dev` / `npm run tauri dev`) selects the gsd-cards app binary without the multi-binary ambiguity error"
    - "The tree_kill_helper bin target stays buildable and discoverable, so tests/tree_kill.rs can still resolve env!(\"CARGO_BIN_EXE_tree_kill_helper\")"
  artifacts:
    - "src-tauri/Cargo.toml with a default-run key in [package]"
  key_links:
    - "default-run value equals the [package] name (gsd-cards), so cargo run resolves to the app binary and not tree_kill_helper"
---

<objective>
Add `default-run = "gsd-cards"` to the `[package]` section of `src-tauri/Cargo.toml` so bare `cargo run` (as invoked by `tauri dev` / `npm run tauri dev`) unambiguously selects the app binary.

Purpose: `src-tauri` builds two binaries — `gsd-cards` (implicit, from `[package] name` via `src/main.rs`) and `tree_kill_helper` (explicit `[[bin]]` at Cargo.toml lines 52-54, a SESS-06 test helper). Tauri's dev command runs `cargo run --no-default-features --color always --` with no `--bin` flag, so Cargo errors: "could not determine which binary to run ... available binaries: gsd-cards, tree_kill_helper". `default-run` is the exact remedy Cargo's error names.

Output: One-line manifest change; `tauri dev` no longer aborts on binary selection.
</objective>

<execution_context>
@/home/user/gsd-cards/.claude/gsd-core/workflows/execute-plan.md
@/home/user/gsd-cards/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src-tauri/Cargo.toml

# Confirms the two binaries and why default-run is safe for the test:
# - src-tauri/src/main.rs           → implicit `gsd-cards` binary (fn main → gsd_cards_lib::run())
# - src-tauri/src/bin/tree_kill_helper.rs → explicit `[[bin]]` target
# - src-tauri/tests/tree_kill.rs:66 → env!("CARGO_BIN_EXE_tree_kill_helper")
#   Cargo builds every bin target and sets that env var for integration tests
#   regardless of default-run; default-run only affects which binary bare
#   `cargo run` picks, so the helper stays fully available.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Add default-run key to [package] in src-tauri/Cargo.toml</name>
  <files>src-tauri/Cargo.toml</files>
  <action>
In the `[package]` section of src-tauri/Cargo.toml, add a `default-run` key whose value is the string `gsd-cards` (exactly matching the existing `[package] name`). Place it directly after the `name = "gsd-cards"` line so the app binary is the default target for bare `cargo run`.

Change ONLY this one key. Do NOT touch the `[[bin]] tree_kill_helper` target (lines 52-54), the `[lib]` section, dependencies, or any other line — the explicit helper bin must remain declared so the tree_kill integration test can still resolve it. Do not add a `[[bin]]` for gsd-cards (it stays implicit from `[package] name` via src/main.rs); `default-run` alone is the fix Cargo's error message names.
  </action>
  <verify>
    <automated>cargo metadata --no-deps --format-version 1 --manifest-path /home/user/gsd-cards/src-tauri/Cargo.toml | grep -o '"default_run":"gsd-cards"'</automated>
  </verify>
  <done>`cargo metadata` reports `"default_run":"gsd-cards"` for the package, and the same metadata still lists a `tree_kill_helper` bin target — proving the ambiguity is resolved without removing the test helper.</done>
</task>

<task type="auto">
  <name>Task 2: Confirm binary ambiguity is gone and the helper target survives</name>
  <files>src-tauri/Cargo.toml</files>
  <action>
Verification-only task (no source edits). Prove two things about the change from Task 1:

1. The multi-binary ambiguity Cargo raised is resolved — `cargo metadata` now carries `default_run: "gsd-cards"`, which is what `cargo run --no-default-features` (Tauri's dev invocation) consults to pick the binary. A full `cargo run`/`cargo build` of the app is heavy in this environment and is NOT required; the metadata proof plus the still-present bin target is sufficient. If a lightweight compile probe is cheap, `cargo run --no-default-features` should proceed past the previous "could not determine which binary to run" error (it may still fail later for unrelated build/GUI reasons — only the ambiguity error must be gone).

2. The `tree_kill_helper` bin target is still declared, so the SESS-06 integration test's `env!("CARGO_BIN_EXE_tree_kill_helper")` reference remains satisfiable.
  </action>
  <verify>
    <automated>cargo metadata --no-deps --format-version 1 --manifest-path /home/user/gsd-cards/src-tauri/Cargo.toml | grep -o '"tree_kill_helper"'</automated>
  </verify>
  <done>Metadata still lists the `tree_kill_helper` bin target (grep matches), confirming `default-run` did not remove or gate any target; combined with Task 1's `default_run` match, the binary-selection error that broke `npm run tauri dev` is resolved.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| build manifest → local cargo/tauri build | Cargo reads src-tauri/Cargo.toml; no untrusted input crosses here |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Tampering | src-tauri/Cargo.toml default-run key | low | accept | Single manifest key naming an existing local binary; no new dependency, network, or untrusted input introduced. Scope is limited to which local bin `cargo run` selects. |
</threat_model>

<verification>
- `cargo metadata --no-deps --format-version 1 --manifest-path /home/user/gsd-cards/src-tauri/Cargo.toml` shows `"default_run":"gsd-cards"`.
- The same metadata still lists a `tree_kill_helper` bin target.
- Only `src-tauri/Cargo.toml` changed; the diff is the single added `default-run` line.
</verification>

<success_criteria>
- `src-tauri/Cargo.toml` `[package]` contains `default-run = "gsd-cards"`.
- Cargo no longer errors with "could not determine which binary to run" for bare `cargo run` (the mechanism `tauri dev` / `npm run tauri dev` uses).
- The `tree_kill_helper` bin target is untouched and still discoverable.
</success_criteria>

<output>
Create `.planning/quick/260724-oed-add-default-run-to-src-tauri-cargo-toml-/260724-oed-SUMMARY.md` when done.
</output>
