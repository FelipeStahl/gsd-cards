# Phase 2: Sessão viva - Pattern Map

**Mapped:** 2026-07-23
**Files analyzed:** 13
**Analogs found:** 11 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src-tauri/src/dependencies.rs` | controller (Tauri command) | request-response | `src-tauri/src/project.rs` | role-match |
| `src-tauri/src/sessions.rs` | controller (Tauri command) | file-I/O + request-response | `src-tauri/src/project.rs` | exact (scope-grant pattern) |
| `src-tauri/src/pty.rs` | service/controller | streaming (PTY bytes) | `src-tauri/src/planning_watcher.rs` | role-match (thread + stream + state) |
| `src-tauri/src/process_guard.rs` | utility (OS process control) | event-driven (kill signal) | *no direct analog* | net-new — closest structural sibling `pty.rs`'s `#[cfg]` split none exists yet; test-shape analog `project.rs`'s `#[cfg(test)] mod tests` |
| `src-tauri/src/lib.rs` (modified) | config (command registration) | — | itself (existing) | exact |
| `src-tauri/Cargo.toml` (modified) | config | — | itself (existing) | exact |
| `src/dependencies/check.ts` | service (invoke wrapper) | request-response | `src/planning/read.ts` (`validateProjectRoot` wrapper) | role-match |
| `src/sessions/discover.ts` | service (fs scan) | file-I/O (defensive directory scan) | `src/planning/phase-scan.ts` | exact |
| `src/sessions/jsonl-signals.ts` | utility (pure filter/extract) | transform | `src/planning/phase-scan.ts` (`parsePhaseDirName`, pure helpers) | role-match |
| `src/pty/channel.ts` | service (invoke + Channel wrapper) | streaming | `src/planning/watch.ts` | exact (Channel vs listen, same wrapper shape) |
| `src/stores/session-store.ts` | store (Zustand+immer) | CRUD + event-driven | `src/stores/board-store.ts` | exact |
| `src/components/terminal/TerminalView.tsx` | component | streaming (xterm render) | `src/shell/DrawerRail.tsx` (shell chrome) + component test convention below | partial (no live-terminal analog exists; DrawerRail is the mount point being replaced) |
| `src/components/terminal/SessionList.tsx` | component | CRUD (list/select) | `src/components/PhaseCard.tsx` (+ its colocated test) | role-match |
| `src/shell/DrawerRail.tsx` (modified) | component (drawer host) | — | itself (existing) | exact |

## Pattern Assignments

### `src-tauri/src/sessions.rs` (controller, file-I/O)

**Analog:** `src-tauri/src/project.rs`

**Imports pattern** (lines 12-17):
```rust
use std::fmt;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri_plugin_fs::FsExt;
```

**Error type + Display pattern** (lines 27-45): Follow `ProjectError`'s tagged enum (`#[serde(tag = "kind", content = "message")]`) shape for a new `SessionsError` (e.g. `NoHomeDir`, `Io`).

**Core scope-grant pattern** (lines 61-105 — `validate_project_root`): canonicalize input → verify containment via `is_contained` (component-wise `starts_with`, never textual prefix) → `app.fs_scope().allow_directory(&path, true)`. `register_sessions_scope(project_root)` must replicate this exactly but scope only `~/.claude/projects/<encoded>/`, never the parent — reuse `is_contained`-style containment test if resolving symlinks matters.

**Path encoding helper** — from RESEARCH.md Code Examples (`src-tauri/src/sessions.rs`):
```rust
fn encode_project_path(root: &str) -> String {
    let normalized = root.replace('\\', "/");
    normalized.replace('/', "-")
}
```

**Test pattern** (lines 107-155 of `project.rs`): `#[cfg(test)] mod tests` with plain `assert!`/`assert_eq!` on pure helper functions (`is_contained`), including `#[cfg(windows)]`-gated variants for platform-specific path semantics. Apply the same shape to `encode_project_path` unit tests (verified case: `/home/user/gsd-cards` → `-home-user-gsd-cards`).

---

### `src-tauri/src/pty.rs` (service/controller, streaming)

**Analog:** `src-tauri/src/planning_watcher.rs`

**State pattern** (lines 29-33): a `Mutex`-guarded managed-state struct registered via `.manage(...)`:
```rust
#[derive(Default)]
pub struct WatcherState(pub Mutex<Option<PlanningDebouncer>>);
```
For `pty.rs`, use `pub struct PtyManager(pub Mutex<HashMap<String, PtySession>>)` — same shape, swap `Option<T>` for a `HashMap<sessionId, PtySession>` since multiple sessions coexist (unlike the single active watcher).

**Command + background-thread pattern** (lines 67-128 — `start_planning_watch`): a `#[tauri::command]` that builds a background worker (debouncer there, PTY reader thread here), moves cloned handles into a closure, and stores the live handle into `State` under a lock — "replace previous, never accumulate" is explicit in the watcher (comment lines 123-125); `pty.rs` differs in that it *accumulates* one entry per session (keyed by id) rather than replacing a singleton.

**Streaming emit pattern** (lines 82-99): the debouncer's closure filters/collects paths and calls `app_for_events.emit("planning:changed", paths)`. `pty.rs`'s reader thread instead calls `on_event.send(buf[..n].to_vec())` on a per-session `tauri::ipc::Channel<Vec<u8>>` (see RESEARCH.md Pattern 1 code example) — same "background thread → push to frontend" shape, but Channel instead of global `emit`, because this is the high-frequency per-session path (see RESEARCH.md `Alternatives Considered` on why Channel over emit here).

**Teardown pattern** (lines 130-138 — `stop_planning_watch`): acquire the mutex, set state to cleared/dropped, propagate mutex-poison as a stringified `Result::Err`:
```rust
#[tauri::command]
pub fn stop_planning_watch(state: State<'_, WatcherState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "Estado do watcher corrompido (mutex poisoned)".to_string())?;
    *guard = None;
    Ok(())
}
```
`kill_session(id)` should follow this same mutex-lock-and-error-map shape, but additionally invoke `process_guard::TreeGuard::kill_tree()` before removing/dropping the entry (see Pattern 2 in RESEARCH.md) and must ALSO be invoked from a new `RunEvent::ExitRequested` handler in `lib.rs` iterating all live sessions — no existing analog for that handler; this is new plumbing in `lib.rs`.

---

### `src-tauri/src/process_guard.rs` (net-new, no analog)

**No existing analog in this codebase.** This is the first Rust module doing OS-process-tree management; nothing in `project.rs`/`planning_watcher.rs` touches child processes. Structural conventions to keep consistent with the rest of the codebase, per RESEARCH.md's own skeleton (Pattern 2 code example):
- Use `#[cfg(windows)]`/`#[cfg(unix)]` split structs (`TreeGuard`), not a single cross-platform struct with runtime branching — matches the existing convention of `#[cfg(windows)]`-gated tests in `project.rs` (lines 138-154).
- Error type should follow the `ProjectError`-style tagged Serialize enum if it needs to cross the IPC boundary; if purely internal to `pty.rs`, a plain `Result<(), GuardError>` with `impl std::error::Error` (mirroring `project.rs` lines 27-45) is sufficient.
- Test module: pure/isolable logic only (e.g., "does this pid belong to this session's tracked set") — the OS-level kill itself is explicitly flagged in RESEARCH.md as an *integration* test (spawn helper binary with a grandchild, kill, verify via `sysinfo`/`ps`/`tasklist`), not a unit test — follow the `#[cfg(test)] mod tests` convention for structure, but expect this suite to be `cargo test --test process_guard_integration`-style, separate from the unit tests in `project.rs`/`planning_watcher.rs`.

---

### `src/sessions/discover.ts` (service, file-I/O defensive scan)

**Analog:** `src/planning/phase-scan.ts`

**Defensive per-entry error handling / "failure never aborts the whole scan" pattern** (lines 155-192, 201-237 — `scanPhaseDir`/`scanAllPhases`): list directory entries, filter by type/name pattern, and treat any single-entry read failure as a non-fatal issue pushed into an `issues: ParseIssue[]` array rather than throwing — apply the same shape to `discover.ts`'s `listSessions`, where a `stat()` failure on one `.jsonl` should be skipped/logged, not abort the whole session list.

**Filtering pattern** (lines 164-172 of `phase-scan.ts`): `entries.filter((entry) => entry.isFile)` + regex/name matching — directly mirrors RESEARCH.md's own code example for `discover.ts`:
```typescript
import { readDir, stat } from "@tauri-apps/plugin-fs";

export async function listSessions(encodedDir: string) {
  const entries = await readDir(encodedDir);
  const jsonlFiles = entries.filter(
    (entry) => !entry.isDirectory && entry.name.endsWith(".jsonl"),
  );
  return Promise.all(
    jsonlFiles.map(async (entry) => {
      const info = await stat(`${encodedDir}/${entry.name}`);
      return { id: entry.name.replace(/\.jsonl$/, ""), lastModified: info.mtime };
    }),
  );
}
```
Critically: never recurse into subdirectories (`subagents/`) — same "shallow, name-pattern-gated" discipline as `phase-scan.ts`'s `PHASE_DIR_NAME_PATTERN` regex gate, applied here as `entry.name.endsWith(".jsonl")` with no recursion.

**Top-level scan-all-then-degrade pattern** (lines 201-237 — `scanAllPhases`): wraps the top `listPlanningDir` call in try/catch, returning `[]` on total failure (e.g. directory doesn't exist) rather than throwing — apply directly to `discover.ts` for the case where `~/.claude/projects/<encoded>/` doesn't exist yet (brand new project, no sessions ever created).

---

### `src/pty/channel.ts` (service, streaming wrapper)

**Analog:** `src/planning/watch.ts`

**Invoke + listener registration pattern** (lines 70-84 — `startWatching`): register a listener BEFORE calling the backend `invoke` that starts the stream, store the unlisten/cleanup handle in module scope, and route incoming payloads into a store action:
```typescript
export async function startWatching(planningRoot: string): Promise<void> {
  await stopWatching();
  unlistenChanged = await listen<string[]>("planning:changed", (event) => {
    void useBoardStore.getState().reprocessPaths(event.payload);
  });
  ...
  await invoke("start_planning_watch", { planningRoot });
}
```
`channel.ts` differs by using `Channel<Uint8Array>` (per-session, created client-side and passed as an invoke argument) instead of global `listen`/`emit` — RESEARCH.md's own code example is the direct template:
```typescript
import { invoke, Channel } from "@tauri-apps/api/core";

export function spawnSession(sessionId: string, projectRoot: string, onBytes: (data: Uint8Array) => void) {
  const onEvent = new Channel<Uint8Array>();
  onEvent.onmessage = (bytes) => onBytes(bytes);
  return invoke("spawn_session", { sessionId, cwd: projectRoot, onEvent });
}
```

**Teardown pattern** (lines 86-101 — `stopWatching`): try/catch around the `invoke` that stops the backend resource, swallowing "nothing to stop yet" as a non-error — apply the same shape to `killSession`/session unmount cleanup in `channel.ts`.

---

### `src/stores/session-store.ts` (store, CRUD + event-driven)

**Analog:** `src/stores/board-store.ts`

**Store shape / immer middleware pattern** (lines 1-7, 435-441):
```typescript
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
...
export const useBoardStore = create<BoardStoreState>()(
  immer((set, get) => ({ ... })),
);
```
Use identically for `useSessionStore`.

**Async action + try/catch-to-error-state pattern** (lines 443-526 — `openProject`): set a loading-ish status, await validation/IO calls, commit a single `set()` transition on success, catch-and-map errors into a typed `error` field via a `toStoreError` helper (lines 783-796). `createSession`/`archiveSession` in `session-store.ts` should follow this same "one commit, no partial in-between renders" discipline — note board-store's explicit comment (lines 650-652) about batching state transitions to avoid UI flicker during rapid events; the same applies to high-frequency PTY byte events (buffer bytes, flush via a single scheduled state update, don't `set()` per chunk).

**Degraded/health-tracking sub-state pattern** (`SyncState` interface lines 53-58, `markSyncHealthy`/`markSyncDegraded`/auto-retry lines 685-781): model live-vs-backgrounded terminal state (`liveSessions: Map<sessionId, LiveSessionState>` per RESEARCH.md's recommended structure) the same way `sync: SyncState` is modeled — a nested sub-object with explicit state enum, never inferred implicitly from other fields.

**Incremental merge pattern** (lines 358-414 — `mergePhaseModels`): merge a subset of freshly-scanned entries into existing array state by key, preserving untouched fields — same shape needed for `session-store.ts` merging newly-discovered sessions from `discover.ts` into the existing `sessions[]` without clobbering `liveSessions` state for sessions already tracked as live.

---

### `src/components/terminal/SessionList.tsx` (component, CRUD list/select)

**Analog:** `src/components/PhaseCard.tsx` (+ colocated `PhaseCard.test.tsx`)

No content read in this pass beyond confirming the colocated-test convention exists (`src/components/*.test.tsx` sits next to the component, e.g. `PhaseCard.test.tsx`, `DetailPanel.test.tsx`, `SyncIndicator.test.tsx`). Apply the same colocation to `SessionList.test.tsx` and `TerminalView.test.tsx` / `focus-algorithm.test.ts` (per RESEARCH.md's Validation Architecture section, which explicitly names `src/components/terminal/focus-algorithm.test.ts` and `src/components/terminal/search.test.tsx` as the expected test files).

---

### `src/shell/DrawerRail.tsx` (modified — component, drawer host)

**Full current file** (this IS the file being modified, 45 lines): currently a disabled 48px rail with a `TerminalSquare` icon and i18n tooltip (`t("drawer.terminalComingSoon")`), rendered unconditionally disabled. The phase-2 change replaces the `disabled` state with real click-to-open-drawer behavior hosting `TerminalView.tsx`, driven by `session-store`'s `activeSessionId`. Keep the existing inline-style convention (`style={{...}}` with `var(--color-*)` CSS custom properties) rather than introducing a new styling approach — no Tailwind/CSS-module usage found elsewhere in `src/shell/`.

## Shared Patterns

### Tauri command error handling (Rust)
**Source:** `src-tauri/src/project.rs` lines 27-45, 61-105
**Apply to:** `sessions.rs`, `pty.rs`, `dependencies.rs`, `process_guard.rs` (if IPC-facing)
Tagged `#[serde(tag = "kind", content = "message")]` enum for structured errors returned across IPC; plain `Result<T, String>` (via `.map_err(|e| format!(...))`) for simpler commands like `planning_watcher.rs`'s `start_planning_watch`/`stop_planning_watch`. Prefer the tagged-enum style for anything the frontend needs to branch on (e.g. distinguishing "claude not on PATH" from "gsd-core missing"); prefer the plain-string style for internal plumbing errors (mutex poisoned, watcher creation failed).

### Path containment / canonicalization (Rust)
**Source:** `src-tauri/src/project.rs` lines 50-59, 61-69
**Apply to:** `sessions.rs` (validating the project root passed to `register_sessions_scope`), `pty.rs` (validating `cwd` passed to `spawn_session` — RESEARCH.md's Security Domain section explicitly requires reusing the already-canonicalized `root` from `validate_project_root`, never accepting a fresh raw path).
```rust
fn is_contained(root: &Path, candidate: &Path) -> bool {
    candidate.starts_with(root)
}
fn canonicalize(path: &Path) -> std::io::Result<PathBuf> {
    dunce::canonicalize(path)
}
```

### Command registration (Rust)
**Source:** `src-tauri/src/lib.rs` lines 1-17
**Apply to:** all new Rust modules — add `mod sessions; mod pty; mod process_guard; mod dependencies;` at top, register new managed state via `.manage(...)`, and list every new `#[tauri::command]` fn inside `tauri::generate_handler![...]`. No capability/ACL file changes needed — RESEARCH.md's Security Domain section confirms app commands (vs. plugin commands) bypass `capabilities/*.json` entirely.

### Zustand + immer store shape (TypeScript)
**Source:** `src/stores/board-store.ts` lines 1-7, 435-441, 783-796
**Apply to:** `session-store.ts`
`create<State>()(immer((set, get) => ({...})))`, with a `toStoreError`-style normalizer for catching typed vs. unknown errors, and single-commit `set()` transitions per logical event (never multiple `set()` calls per user action).

### Defensive directory scan / never-throw-the-whole-scan (TypeScript)
**Source:** `src/planning/phase-scan.ts` lines 155-237
**Apply to:** `sessions/discover.ts`
Filter entries defensively, push per-entry failures into an issues/log array instead of throwing, and let the top-level scan function degrade to `[]` on total directory-read failure.

### Colocated component tests
**Source:** `src/components/PhaseCard.test.tsx`, `DetailPanel.test.tsx`, `SyncIndicator.test.tsx` (file listing only, not read this pass)
**Apply to:** `SessionList.test.tsx`, `TerminalView.test.tsx`
Test file sits next to the component in the same directory, named `<Component>.test.tsx`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src-tauri/src/process_guard.rs` | utility (OS process tree kill) | event-driven | First Rust module in this codebase touching child-process lifecycle/OS primitives (Job Objects, process groups); no prior Windows/Unix `#[cfg]`-split module exists. Planner should build directly from RESEARCH.md Pattern 2's code skeleton rather than from a codebase analog. |
| `src/components/terminal/TerminalView.tsx` | component (xterm.js host) | streaming | No prior component in this codebase mounts a non-React-managed, imperatively-disposed external widget (xterm.js `Terminal` instance) with a manual mount/dispose lifecycle against a raw DOM node. Closest partial parallel is `DrawerRail.tsx` only as the surrounding chrome/mount point, not the imperative-widget lifecycle itself. Build from RESEARCH.md Pattern 3's exact dispose/serialize/restore algorithm, respecting the React 19 StrictMode double-invoke pitfall (Pitfall 4) explicitly called out in RESEARCH.md. |

## Metadata

**Analog search scope:** `src-tauri/src/` (all `.rs` files), `src/planning/`, `src/stores/`, `src/shell/`, `src/components/` (glob for `*.test.tsx`), `src-tauri/Cargo.toml`
**Files scanned:** 8 read in full (`project.rs`, `planning_watcher.rs`, `lib.rs`, `Cargo.toml`, `phase-scan.ts`, `watch.ts`, `board-store.ts`, `DrawerRail.tsx`) + 1 glob (component test files)
**Pattern extraction date:** 2026-07-23
