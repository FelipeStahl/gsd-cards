---
phase: 01-espelho-fiel
reviewed: 2026-07-23T00:00:00Z
depth: standard
files_reviewed: 74
files_reviewed_list:
  - .github/workflows/ci.yml
  - scripts/refresh-fixtures.mjs
  - src-tauri/Cargo.toml
  - src-tauri/capabilities/default.json
  - src-tauri/src/lib.rs
  - src-tauri/src/planning_watcher.rs
  - src-tauri/src/project.rs
  - src-tauri/tauri.conf.json
  - src/App.tsx
  - src/components/ArtifactModal.test.tsx
  - src/components/ArtifactModal.tsx
  - src/components/BoardColumn.tsx
  - src/components/DetailPanel.test.tsx
  - src/components/DetailPanel.tsx
  - src/components/EmptyState.tsx
  - src/components/ErrorState.tsx
  - src/components/HistoryStrip.test.tsx
  - src/components/HistoryStrip.tsx
  - src/components/PhaseCard.test.tsx
  - src/components/PhaseCard.tsx
  - src/components/ProgressBar.tsx
  - src/components/StatusBadge.tsx
  - src/components/SyncIndicator.test.tsx
  - src/components/SyncIndicator.tsx
  - src/i18n.ts
  - src/locales/en/artifact.json
  - src/locales/en/board.json
  - src/locales/en/project.json
  - src/locales/en/sync.json
  - src/locales/pt-BR/artifact.json
  - src/locales/pt-BR/board.json
  - src/locales/pt-BR/project.json
  - src/locales/pt-BR/sync.json
  - src/planning/artifact-tree.ts
  - src/planning/model.ts
  - src/planning/oracle-drift.test.ts
  - src/planning/parse-result.ts
  - src/planning/parser/milestones.test.ts
  - src/planning/parser/milestones.ts
  - src/planning/parser/plan.test.ts
  - src/planning/parser/plan.ts
  - src/planning/parser/resilience.test.ts
  - src/planning/parser/roadmap.test.ts
  - src/planning/parser/roadmap.ts
  - src/planning/parser/state.test.ts
  - src/planning/parser/state.ts
  - src/planning/parser/summary.test.ts
  - src/planning/parser/summary.ts
  - src/planning/parser/verification.test.ts
  - src/planning/parser/verification.ts
  - src/planning/paths.ts
  - src/planning/phase-scan.test.ts
  - src/planning/phase-scan.ts
  - src/planning/read.test.ts
  - src/planning/read.ts
  - src/planning/status.test.ts
  - src/planning/status.ts
  - src/planning/watch.test.ts
  - src/planning/watch.ts
  - src/shell/AppShell.test.tsx
  - src/shell/AppShell.tsx
  - src/shell/Board.test.tsx
  - src/shell/Board.tsx
  - src/shell/DrawerRail.tsx
  - src/shell/Header.tsx
  - src/shell/SidebarPlaceholder.tsx
  - src/stores/board-store.ts
  - src/stores/detail-store.ts
  - src/stores/ui-store.ts
  - src/styles/theme.css
  - src/test/setup.ts
  - src/vite-env.d.ts
findings:
  critical: 3
  warning: 2
  info: 3
  total: 8
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 74
**Status:** issues_found

## Summary

Reviewed the full Phase 01 ("Espelho Fiel") surface: the Rust/Tauri backend gate (`project.rs`, `planning_watcher.rs`, capability/CSP config), the read-only planning parsers, the zustand stores that assemble the board, and the React shell/components that render it. The architecture is disciplined about its stated invariants (no writes to `.planning/`, localized parse failure via `ParseIssue`/`unrecognized`, path containment via component-wise `starts_with` rather than string-prefix checks, CSP with no remote origins, no raw HTML re-introduced into rendered markdown). Most of the defensive design documented in the code comments is actually implemented correctly and is exercised by tests.

However, three real correctness gaps undermine the product's stated "core value" (the board must be a faithful, real-time mirror of `.planning/`): a CI gap that lets the security-critical Rust path-containment unit tests go unexecuted forever, a `reprocessPaths` code path that can leave stale blocker badges on unrelated phases when STATE.md and a phase directory change in the same debounce batch, and an artifact-content cache that never invalidates, so a previously-viewed artifact can show stale content indefinitely even after the file changes on disk. Two further findings flag a broader-than-documented filesystem permission grant. Several minor code-quality items round out the report.

## Critical Issues

### CR-01: CI never executes the Rust unit tests — path-containment security tests are dead weight

**File:** `.github/workflows/ci.yml:57-61`
**Issue:** The CI pipeline runs `npm run typecheck`, `npm run test` (frontend/vitest only), and `cargo check`. `cargo check` only type-checks the Rust crate — it never executes `#[cfg(test)] mod tests` blocks. `src-tauri/src/project.rs` and `src-tauri/src/planning_watcher.rs` both contain `#[cfg(test)]` unit tests that are the *only* automated verification of the path-containment security mitigations documented in the code (`is_contained` — mitigates T-01-01 path-traversal-via-symlink and the "sibling directory with common text prefix" escape; `is_relevant_change` — the watcher's own containment check). None of these tests ever run in CI today. A future regression to either function (e.g. someone "simplifies" `is_contained` back to a string-prefix check) would compile cleanly, pass `cargo check`, and ship silently.
**Fix:**
```yaml
      - name: Cargo check
        run: cargo check --manifest-path src-tauri/Cargo.toml

      - name: Cargo test
        run: cargo test --manifest-path src-tauri/Cargo.toml
```

### CR-02: `reprocessPaths` can leave stale `blockers` on phases untouched by the current watcher batch

**File:** `src/stores/board-store.ts:604-618`
**Issue:** When a debounced watcher batch contains both a `STATE.md` change (`needsState` → `blockersChanged = true`) and one or more phase-directory changes (`phaseNumbers.size > 0`), and the roadmap itself was not rebuilt (`!roadmapRebuilt`, the common case — most batches don't touch `ROADMAP.md`), the code takes the `if (phaseNumbers.size > 0 && !roadmapRebuilt)` branch via `mergePhaseModels`. That function only recomputes `blockers` for the phases present in `scannedSubset` (the phases whose directories changed in this batch); every other phase keeps its *old* `blockers` array from before the STATE.md re-read. The `else if (blockersChanged)` branch — which reapplies the fresh blocker filter to *every* phase — is mutually exclusive with the first branch and therefore never runs in this scenario.

  Concretely: if a GSD workflow writes a new `[Phase 5]: ...` blocker into `STATE.md` at the same time it writes `01-02-SUMMARY.md` into phase 01's directory (both land in the same ~250ms debounce window), phase 5's blocker badge will not appear until some *other*, unrelated event touches phase 5 specifically (or a full watcher reconnect happens). This directly contradicts the product's stated core value ("o board é um espelho confiável do `.planning/`... se tudo mais falhar, isso tem que funcionar").
**Fix:** Reapply the blocker filter to the full phase list whenever `blockersChanged`, regardless of which branch handled the scan:
```ts
let affectedIds: string[] = [];
if (phaseNumbers.size > 0 && !roadmapRebuilt) {
  const scannedSubset = await scanPhasesByNumber(current.root, phaseNumbers);
  const merged = mergePhaseModels(phases, scannedSubset, blockers);
  phases = merged.phases;
  affectedIds = merged.affectedIds;
}
if (blockersChanged) {
  // Reaplica sempre que blockers mudou — independente de quais fases
  // tiveram diretório varrido neste lote, um blocker novo pode citar
  // qualquer fase, inclusive uma não tocada por este lote.
  phases = phases.map((phase) => ({
    ...phase,
    blockers: blockers.filter((blocker) => blocker.phases.includes(phase.number)),
  }));
}
```

### CR-03: Artifact content cache in `detail-store` is never invalidated — the modal can show stale content forever

**File:** `src/stores/detail-store.ts:93-108` (consumed by `src/components/ArtifactModal.tsx:59-64`)
**Issue:** `loadArtifact` guards on `if (get().artifactContent[path]) return;` and never removes an entry once populated. Unlike `treeByPhaseId`, which is explicitly invalidated when a phase appears in `recentlyUpdatedPhaseIds` (see the `useBoardStore.subscribe` block at the bottom of the same file), `artifactContent` has no equivalent invalidation hook anywhere in the codebase (confirmed via search — the only other references are in `ArtifactModal.tsx`'s read and `ArtifactModal.test.tsx`'s test seeding). Once a user opens an artifact (e.g. a `PLAN.md`) once, the raw text is cached by path forever for the life of the app session. If that same file is later modified on disk (a very plausible flow: user inspects a `PLAN.md` while `/gsd-execute-phase` is running, then reopens it after the file changes), reopening the modal for that path shows the stale, pre-edit content — even though the watcher correctly detected and processed the change (it just never reaches this cache). This is the same category of "fake fidelity" bug the codebase's own `SyncIndicator`/`D-16` design explicitly tries to avoid at the sync-status level, but it slips through here at the artifact-content level.
**Fix:** Invalidate the affected artifact's cache entry alongside `treeByPhaseId` invalidation, keyed off the same `recentlyUpdatedPhaseIds` subscription (or, more precisely, off the `planning:changed` paths themselves so it also covers artifacts whose exact path was touched):
```ts
useBoardStore.subscribe((state) => {
  const affected = state.recentlyUpdatedPhaseIds;
  if (affected.length === 0 || affected === previousUpdatedIds) return;
  previousUpdatedIds = affected;

  useDetailStore.setState((detailState) => {
    for (const path of Object.keys(detailState.artifactContent)) {
      // path is `${phaseDirPath}/${fileName}` — drop any cached artifact
      // whose phase was just re-scanned so a reopen re-reads from disk.
      if (affected.some((phaseId) => path.includes(`/phases/`) /* match by phase dir */)) {
        delete detailState.artifactContent[path];
      }
    }
  });
  // ...existing treeByPhaseId invalidation...
});
```
(Exact matching logic should reuse the phase-dir resolution already available in `detail-store.ts`, e.g. by tracking which `phaseDirPath` each cached artifact belongs to when it is loaded.)

## Warnings

### WR-01: `validate_project_root` grants filesystem read scope over the entire project root, not `.planning/`

**File:** `src-tauri/src/project.rs:91-97`
**Issue:** The doc comment above `fs_scope().allow_directory(...)` says "concede escopo de leitura em runtime apenas para esta raiz canônica" and the module header claims this "mitiga... T-01-03b (escopo de fs concedido apenas por projeto aberto, nunca globalmente)". Both are true as far as they go, but the actual scope granted is `root_canonical` (the whole project directory, recursive) rather than `planning_canonical` (the already-computed, already-validated `.planning/` subdirectory). Every TypeScript-level read path (`read.ts`, `paths.ts`, `phase-scan.ts`, etc.) only ever constructs paths under `.planning/`, so this is not exploitable through the app's own code today — but it is a broader-than-necessary grant relative to the product's own stated scope ("o app só lê `.planning/`"). If any future feature (or a supply-chain-compromised dependency executing in the webview) calls the fs plugin with a path outside `.planning/` but inside the project root, it will succeed silently, because the OS-level scope allows it.
**Fix:** Grant scope to `planning_canonical` instead of `root_canonical`, since that is the only tree the app is designed to read:
```rust
app.fs_scope()
    .allow_directory(&planning_canonical, true)
    .map_err(|e| {
        ProjectError::Io(format!("Não foi possível conceder escopo de leitura: {e}"))
    })?;
```
(If some future feature genuinely needs project-root-level reads — e.g. detecting a `package.json` for terminal sessions in Phase 2 — that should be a deliberate, separately-scoped grant, not inherited implicitly from this one.)

### WR-02: Filesystem scope is never revoked when a project is closed — scope accumulates across sessions

**File:** `src/stores/board-store.ts:515-524` (`closeProject`); no corresponding Rust command exists at all
**Issue:** `closeProject` stops the file watcher (`stopWatching()`) and resets store state, but never revokes the fs-plugin scope granted in `validate_project_root`. There is no Rust command (e.g. `forbid_directory`) exposed to do so, and `lib.rs`'s `invoke_handler` only registers `validate_project_root`, `start_planning_watch`, `stop_planning_watch`. As a result, opening project A, closing it, then opening unrelated project B leaves *both* A's and B's entire directory trees permanently readable via `@tauri-apps/plugin-fs` for the remainder of the app process — scope only grows, never shrinks, for the life of the session.
**Fix:** Add a Rust command that calls `app.fs_scope().forbid_directory(&root, true)` (or clears/replaces the scope wholesale) and invoke it from `closeProject`/before granting a new root in `openProject`, so only the currently-open project ever has read scope.

## Info

### IN-01: `planningFileExists` is exported but never called

**File:** `src/planning/read.ts:117-119`
**Issue:** `planningFileExists` is a public export of the read layer, referenced only by its own mock setup in `watch.test.ts` — no production code path calls it. Dead surface area increases the API's apparent size without adding value.
**Fix:** Either remove it until a consumer needs it, or wire it into a real use site (e.g. checking `ROADMAP.md`/`STATE.md` presence without a full read) if one is planned imminently.

### IN-02: `PlanFrontmatter.mustHaves` is parsed but never consumed, and typed `unknown`

**File:** `src/planning/parser/plan.ts:34,152`
**Issue:** `mustHaves: data.must_haves` is captured on every parsed `PlanModel` but no component or store in this phase reads `frontmatter.mustHaves`. Its type is `unknown`, so even a future consumer gets no type safety benefit without narrowing/validating it first. Low-cost now, but worth tracking so it doesn't silently bit-rot into an unvalidated pass-through of arbitrary YAML.
**Fix:** Either drop the field until a Phase actually renders "must haves", or give it a proper shape (`string[]` per the gsd-core format) with the same defensive `toStringArray`-style normalization used for other fields in this file.

### IN-03: `detail-store`'s board-store subscription has no selector — runs its diff check on every board mutation

**File:** `src/stores/detail-store.ts:116-130`
**Issue:** `useBoardStore.subscribe((state) => {...})` subscribes to the entire store (no selector/equality function), so the callback body — including the `Object.values`/loop-based diff check — runs on *every* board-store state change, not just changes to `recentlyUpdatedPhaseIds`. The early-return guards make this harmless today, but it's a fragile pattern: any future board-store mutation that happens to reuse the same `recentlyUpdatedPhaseIds` array reference by mistake would silently skip invalidation, and it's easy to accidentally add expensive work inside this callback without noticing it fires far more often than intended.
**Fix:** Use Zustand's selector-based `subscribe` overload to scope the listener to the field that actually matters:
```ts
useBoardStore.subscribe(
  (state) => state.recentlyUpdatedPhaseIds,
  (affected) => {
    if (affected.length === 0) return;
    // ...existing invalidation logic...
  },
);
```

---

_Reviewed: 2026-07-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
