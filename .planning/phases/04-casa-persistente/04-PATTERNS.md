# Phase 4: Casa persistente - Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 24 (create/modify)
**Analogs found:** 22 / 24

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/shell/AppShell.tsx` (extend) | provider/shell | request-response (view branch) | itself + `EmptyState.tsx` | exact (extend existing) |
| `src/components/home/HomeScreen.tsx` | component | CRUD (read recents, lazy health) | `src/shell/AppShell.tsx` (conditional render) + `EmptyState.tsx` | role-match |
| `src/components/home/ProjectCard.tsx` | component | transform (health → visual) | `src/components/PhaseCard.tsx` + `src/components/ProgressBar.tsx` | exact |
| `src/components/home/CreateProjectFlow.tsx` | component | event-driven (dialog → session → inject → watch) | `src/components/session/ConfirmDialog.tsx` (panel skeleton) + `AppShell.tsx` handleOpenProject | role-match |
| `src/shell/ProjectSwitcherButton.tsx` | component | request-response | `src/shell/DrawerRail.tsx` (icon-only control) | role-match |
| `src/components/session/SidebarScopeBanner.tsx` | component | transform | `src/components/StatusBadge.tsx` (small derived-tone strip) | partial |
| `src/components/session/RenameSessionControl.tsx` | component | CRUD (rename) | `src/components/session/SessionRow.tsx` (inline hover actions + `ConfirmDialog` pattern) | exact |
| `src/components/session/SessionRow.tsx` (extend) | component | CRUD | itself | exact |
| `src/components/session/SessionSidebar.tsx` (extend) | component | CRUD (filter) | itself | exact |
| `src/shell/DrawerRail.tsx` (extend) | component | event-driven (badge) | itself | exact |
| `src/shell/Header.tsx` (extend) | component | request-response | itself (mounts `ProjectSwitcherButton`) | exact |
| `src/persistence/app-store.ts` | service | CRUD (KV persistence) | `src/pty/channel.ts` (invoke-wrapper shape) — net-new mechanism | no direct analog (see below) |
| `src/persistence/session-snapshot.ts` | service | file-I/O | same as above | no direct analog |
| `src/notifications/notify.ts` | service | event-driven | `src/pty/channel.ts` (thin invoke wrapper) | partial (net-new plugin) |
| `src/stores/board-store.ts` (extend) | store | CRUD + event-driven | itself | exact |
| `src/stores/session-store.ts` (extend) | store | CRUD + event-driven | itself | exact |
| `src/sessions/id-format.ts` | utility | transform (validation) | `src/planning/actions.ts` `sanitizePhaseId` | exact |
| `src/pty/channel.ts` (extend: args + exit listener) | service | streaming + event-driven | itself + `src/planning/watch.ts` (`listen`/`startWatching` pattern) | exact |
| `src-tauri/src/pty.rs` (extend: args, exit emit, `PtyManager::remove_exited`) | backend command | streaming + event-driven | itself + `src-tauri/src/planning_watcher.rs` (`app.emit` pattern) | exact |
| `src-tauri/src/lib.rs` (extend: plugin registration) | config | — | itself | exact |
| `src-tauri/capabilities/default.json` (extend) | config | — | itself | exact |
| `src-tauri/Cargo.toml` (extend) | config | — | itself | exact |
| `src/i18n.ts` (extend: `home` namespace) | config | — | itself | exact |
| `src/locales/{pt-BR,en}/home.json` (new), `session.json`/`terminal.json` (extend) | config | — | `src/locales/pt-BR/session.json` + `i18n.ts` | exact |
| Vitest specs (`HomeScreen.test.tsx`, `ProjectCard.test.tsx`, `board-store.test.ts` additions, `session-store.test.ts` additions, `pty.rs` tests, `channel.test.ts` additions) | test | — | `src/stores/session-store.test.ts`, `src/shell/AppShell.test.tsx`, `src-tauri/src/pty.rs` inline `#[cfg(test)]` | exact |

## Pattern Assignments

### `src/shell/AppShell.tsx` (extend) — new `view` branch

**Analog:** itself (`src/shell/AppShell.tsx:19-102`), `EmptyState.tsx`

**Current ternary to extend** (lines 55-94):
```tsx
{status === "open" ? (
  <Board />
) : status === "error" ? (
  <ErrorState .../>
) : (
  <EmptyState .../>
)}
```
Pattern to copy (Pattern 1 from RESEARCH.md): add a `view: "home" | "board"` branch OUTSIDE/above this ternary (or wrap the whole `<Header>+<div flex>` block), never introduce `react-router`. `HomeScreen` replaces the entire shell render (header+sidebar+board+drawer don't mount on home), per UI-SPEC "Home Screen — Layout": so the new branch should sit at the top of the returned JSX in `AppShell`, mirroring how `status==="idle"` today falls through to `EmptyState` inside `<main>` — but `view==="home"` instead short-circuits before `<Header>`/`<SessionSidebar>`/`<DrawerRail>` mount.

**Dialog pattern to reuse** (lines 25-32, for `CreateProjectFlow`'s folder picker):
```tsx
async function handleOpenProject() {
  const selected = await open({ directory: true, multiple: false });
  if (typeof selected === "string") {
    await openProject(selected);
  }
}
```

---

### `src/components/home/HomeScreen.tsx` (new)

**Analog:** `src/components/EmptyState.tsx` (empty state shape), `src/shell/AppShell.tsx` (view root)

**Empty-state copy pattern** (`EmptyState.tsx:10-51`):
```tsx
export function EmptyState({ heading, body, action }: EmptyStateProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: "var(--spacing-md)", padding: "var(--spacing-3xl)",
      textAlign: "center", height: "100%", width: "100%", color: "var(--color-foreground)" }}>
      <h2 style={{ fontSize: "var(--font-size-display)", ... }}>{heading}</h2>
      <p style={{ fontSize: "var(--font-size-body)", ..., opacity: 0.75 }}>{body}</p>
      {action}
    </div>
  );
}
```
Reuse this verbatim for `home.empty.*` (per UI-SPEC `## UI Considerations` — zero recents renders `EmptyState` with two CTAs inline).

**Lazy per-card health loading:** reuse `board-store.ts`'s `validateProjectRoot` + `readPlanningText(statePath(root))` + `parseStateFile` calls exactly as done in `openProject` (`board-store.ts:449-461`), but scoped to ONE recent at a time, never blocking the grid render (matches UI-SPEC "each card resolves independently").

---

### `src/components/home/ProjectCard.tsx` (new)

**Analog:** `src/components/PhaseCard.tsx` (full component), `src/components/ProgressBar.tsx`

**Card shell + click-to-select pattern** (`PhaseCard.tsx:46-64`):
```tsx
<div
  role="button"
  tabIndex={0}
  onClick={handleActivate}
  onKeyDown={handleKeyDown}
  style={{
    display: "flex", flexDirection: "column", gap: "var(--spacing-sm)",
    padding: "var(--spacing-md)", borderRadius: 8,
    backgroundColor: "var(--color-secondary)", minHeight: 92,
  }}
>
```
Per UI-SPEC, `ProjectCard` uses padding 24px (`lg`) and minHeight 140px instead of PhaseCard's 16px/92px — same shape, different spacing tokens.

**Truncated title + tooltip** (`PhaseCard.tsx:65-80`): reuse `title={...}` + `overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap` verbatim for the project name row.

**Blocker badge pattern** (`PhaseCard.tsx:104-119`, `AlertTriangle` → `AlertCircle` per UI-SPEC):
```tsx
{hasBlockers ? (
  <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-xs)",
    fontSize: "var(--font-size-label)", ..., color: "var(--color-warning)" }}>
    <AlertTriangle size={12} aria-hidden="true" />
    {t("card.blocked")}
  </span>
) : null}
```

**Progress bar reuse** (`PhaseCard.tsx:123-136` composing `ProgressBar.tsx`):
```tsx
<ProgressBar percent={planPercent} widthPx={120} label={planFraction} />
```
`ProgressBar.tsx:11-40` itself is reused VERBATIM (no new variant) — accent fill, never success, per UI-SPEC's explicit correction note.

**Loading/error variants:** classify via `class-variance-authority`, per UI-SPEC ("loading/healthy/error variants via CVA") — no existing CVA usage found elsewhere in this codebase's components (they all use inline styles + plain ternaries, e.g. `StatusBadge.tsx`/`PhaseCard.tsx`'s `parseWarning` prop); this is this component's own novel use of CVA per the UI-SPEC's Design System note ("Tailwind 4 + `class-variance-authority` for variant props").

---

### `src/persistence/app-store.ts` (new) + `src/persistence/session-snapshot.ts` (new)

**No existing analog** — this is the FIRST disk-write mechanism in the app (`board-store.ts`/`planning/read.ts` are strictly read-only per the product invariant). Closest structural precedent for "thin wrapper around a Tauri plugin API, exported as small async functions" is `src/pty/channel.ts`'s `invoke`-wrapping shape (`spawnSession`/`writeSession`/`killSession` — each a one-line `invoke(...)` call with a documented safety comment above it).

**Exact code to use** (from RESEARCH.md `## Code Examples`, already vetted against `Pitfall 4`):
```ts
// src/persistence/app-store.ts
import { LazyStore } from "@tauri-apps/plugin-store";

export const appStore = new LazyStore("app-state.json", { autoSave: false });

export interface RecentProjectEntry {
  root: string;
  name: string;
  lastOpened: string;
}

export async function upsertRecent(entry: RecentProjectEntry): Promise<void> {
  const recents = (await appStore.get<RecentProjectEntry[]>("recentProjects")) ?? [];
  const next = [entry, ...recents.filter((r) => r.root !== entry.root)];
  await appStore.set("recentProjects", next);
  await appStore.save();
}
```
```ts
// src/persistence/session-snapshot.ts
import { Store } from "@tauri-apps/plugin-store";

export async function saveSnapshot(sessionId: string, snapshot: string): Promise<void> {
  const store = await Store.load(`session-${sessionId}.json`, { autoSave: false });
  await store.set("snapshot", snapshot);
  await store.set("savedAt", new Date().toISOString());
  await store.save();
  await store.close();
}

export async function loadSnapshot(sessionId: string): Promise<string | null> {
  const store = await Store.load(`session-${sessionId}.json`, { autoSave: false });
  const snapshot = (await store.get<string>("snapshot")) ?? null;
  await store.close();
  return snapshot;
}
```
Follow the same doc-comment discipline as `channel.ts`'s header comment (explain WHY split into two files — Pitfall 4 — right above the export).

---

### `src/notifications/notify.ts` (new)

**No direct analog** — closest is `src/pty/channel.ts`'s thin invoke-wrapper shape (one function per plugin operation, no extra abstraction). Wrap `@tauri-apps/plugin-notification`'s `isPermissionGranted`/`requestPermission`/`sendNotification` behind `ensurePermission()`, `notifyAwaiting()`, `notifyExited()` per RESEARCH.md's `Recommended Project Structure`. Degrade silently on permission denial (same defensive discipline as `discoverSessions` in `session-store.ts:277-286` — never throw, never block other functionality).

---

### `src/sessions/id-format.ts` (new)

**Analog:** `src/planning/actions.ts` `sanitizePhaseId` (lines 84-93) — THE pattern to mirror exactly.

**Source pattern:**
```ts
// src/planning/actions.ts:84-93
const PHASE_ID_PATTERN = /^\d+(\.\d+)?$/;

/**
 * Valida `phase.id` antes de qualquer interpolação num comando injetado
 * (T-03-01). Retorna `id` inalterado quando válido, `null` caso contrário —
 * nunca uma versão "corrigida"/truncada do input.
 */
export function sanitizePhaseId(id: string): string | null {
  return PHASE_ID_PATTERN.test(id) ? id : null;
}
```
**New file, mirroring the same shape** (anchored regex, `string | null` return, no best-effort correction, doc comment naming the specific threat mitigated — flag-injection via `--resume`):
```ts
// src/sessions/id-format.ts
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSessionId(id: string): boolean {
  return SESSION_ID_PATTERN.test(id);
}
```
Apply at the ONE call site where a persisted session id enters `spawnSession`'s `args` (`resumeSession` in `session-store.ts`), exactly as `sanitizePhaseId` is applied at the one call site before `writeSession` interpolation in `PhaseCardAction`.

---

### `src/pty/channel.ts` (extend)

**Analog:** itself, `src/planning/watch.ts` (`listen`/`unlisten` singleton pattern)

**Current `spawnSession` to extend** (lines 54-67):
```ts
export function spawnSession(
  sessionId: string,
  cwd: string,
  onBytes: (data: Uint8Array) => void,
): Promise<void> {
  const onEvent = new Channel<RawChannelMessage>();
  bytesHandlers.set(sessionId, onBytes);
  onEvent.onmessage = (message) => {
    const bytes = toBytes(message);
    bytesHandlers.get(sessionId)?.(bytes);
    activityHandlers.get(sessionId)?.(bytes);
  };
  return invoke("spawn_session", { sessionId, cwd, onEvent });
}
```
Add `args: string[] = []` param (per RESEARCH.md Code Examples), threaded straight into the `invoke` call — same minimal-surface-change style as this file's existing functions.

**Exit-listener pattern to add, copied from `watch.ts`'s singleton unlisten pattern** (`watch.ts:61-84`):
```ts
// watch.ts precedent:
let unlistenChanged: UnlistenFn | null = null;
export async function startWatching(planningRoot: string): Promise<void> {
  await stopWatching();
  unlistenChanged = await listen<string[]>("planning:changed", (event) => {
    void useBoardStore.getState().reprocessPaths(event.payload);
  });
  await invoke("start_planning_watch", { planningRoot });
}
```
Mirror this exactly for `listenForSessionExit`:
```ts
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
let unlistenExit: UnlistenFn | null = null;
export async function listenForSessionExit(
  onExit: (sessionId: string) => void,
): Promise<void> {
  unlistenExit = await listen<{ sessionId: string }>("pty:session-exited", (event) => {
    onExit(event.payload.sessionId);
  });
}
```

---

### `src-tauri/src/pty.rs` (extend)

**Analog:** itself, `src-tauri/src/planning_watcher.rs` (`app.emit(...)` pattern)

**`spawn_session` signature to extend** (lines 145-151):
```rust
#[tauri::command]
pub fn spawn_session(
    state: State<'_, PtyManager>,
    session_id: String,
    cwd: String,
    on_event: Channel<Vec<u8>>,
) -> Result<(), PtyError> {
```
Add `app: tauri::AppHandle` and `args: Vec<String>` params (RESEARCH.md Code Examples), apply args via `cmd.args(&args);` right after `cmd.cwd(&cwd);` (line 173).

**Exit-emit pattern, copied from `planning_watcher.rs`'s emit call** (`planning_watcher.rs:96-98`):
```rust
if !paths.is_empty() {
    let _ = app_for_events.emit("planning:changed", paths);
}
```
Mirror for PTY exit — extend the reader-thread closure (currently `pty.rs:197-206`):
```rust
let reader_thread = std::thread::spawn(move || {
    pump_pty_output(reader, move |chunk| {
        let _ = on_event.send(chunk);
    });
});
```
into (per RESEARCH.md Pattern 4, full example already vetted):
```rust
let app_for_exit = app.clone();
let session_id_for_exit = session_id.clone();
let state_for_exit = state.inner().clone();
let reader_thread = std::thread::spawn(move || {
    pump_pty_output(reader, move |chunk| { let _ = on_event.send(chunk); });
    state_for_exit.remove_exited(&session_id_for_exit);
    let _ = app_for_exit.emit("pty:session-exited", ExitedPayload {
        session_id: session_id_for_exit,
    });
});
```
Add `PtyManager::remove_exited` following the same lock-with-poison-recovery style as the existing `kill_all`/`write` methods (`pty.rs:79-89`, `100-113`).

**Test pattern to extend** (`pty.rs:278-333` `#[cfg(test)] mod tests`): add a unit test for `remove_exited` (pure, no `AppHandle` needed) in the same `mod tests` block, following `pty_error_display_variants`'s plain-assertion style (line 326-331).

---

### `src-tauri/src/lib.rs` (extend)

**Analog:** itself (lines 19-41)

**Plugin registration pattern:**
```rust
tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .manage(planning_watcher::WatcherState::default())
    .manage(pty::PtyManager::default())
    .invoke_handler(tauri::generate_handler![ ... ])
```
Add `.plugin(tauri_plugin_store::Builder::new().build())` and `.plugin(tauri_plugin_notification::init())` alongside the existing three `.plugin(...)` calls, same insertion point/style — no new `.manage(...)` needed for either (both plugins manage their own state internally).

---

### `src-tauri/capabilities/default.json` (extend)

**Analog:** itself

**Current shape** (lines 6-16, minimal-permission-per-command discipline, NEVER `fs:default`):
```json
"permissions": [
  "core:default",
  "core:event:default",
  "dialog:allow-open",
  "fs:allow-read-text-file",
  "fs:allow-read-dir",
  "fs:allow-exists",
  "fs:allow-size",
  "fs:allow-stat",
  "opener:allow-open-url"
]
```
Add granular `store:allow-*` (not `store:default`, per RESEARCH.md `## State of the Art`) and `notification:allow-*` entries, following the same one-permission-per-line, comment-in-description-field style as the existing `description` field explaining WHY each exception exists.

---

### `src-tauri/Cargo.toml` (extend)

**Analog:** itself (lines 1-30) — loose `"2"` pin convention already used for `tauri-plugin-fs`/`tauri-plugin-dialog`/`tauri-plugin-opener`:
```toml
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
tauri-plugin-opener = "2"
```
Add `tauri-plugin-store = "2"` and `tauri-plugin-notification = "2"` in the same `[dependencies]` block, same pin style.

---

### `src/i18n.ts` (extend) + `src/locales/{pt-BR,en}/home.json` (new)

**Analog:** itself (lines 1-63)

**Namespace registration pattern:**
```ts
import sessionPtBR from "./locales/pt-BR/session.json";
import sessionEn from "./locales/en/session.json";
// ...
export const resources = {
  "pt-BR": { ..., session: sessionPtBR, terminal: terminalPtBR },
  en: { ..., session: sessionEn, terminal: terminalEn },
} as const;
// ...
ns: ["common", "project", "board", "sync", "artifact", "session", "terminal", "commands"],
```
Add `home: homePtBR`/`home: homeEn` imports + resource entries + `"home"` in the `ns` array, exact same insertion pattern as `commands` was added for Fase 3.

---

### `src/stores/board-store.ts` (extend)

**Analog:** itself — `openProject`/`closeProject` (lines 443-539), `deriveProjectName` (77-80)

**`openProject` to extend with recents upsert** — after the successful `set({ status: "open", ... })` block (around line 496), add a call to `upsertRecent({ root: validated.root, name: projectName, lastOpened: new Date().toISOString() })`, following the SAME "fire-and-forget background task guarded by root-still-matches check" pattern already used for `loadMilestoneHistory` (lines 503-509):
```ts
void loadMilestoneHistory(validated.root).then((milestones) => {
  set((state) => {
    if (state.project && state.project.root === validated.root) {
      state.project.milestones = milestones;
    }
  });
});
```

**Multi-project state additions** (`openProjectRoots: string[]`, `activeProjectRoot: string | null`): follow the same flat-field-on-state shape as `sync`/`recentlyUpdatedPhaseIds`, updated via `immer` producers inside `set((state) => {...})`, same style as `markSyncHealthy`/`markSyncDegraded` (lines 687-708).

**Single-watcher re-sync on switch** (Pattern 3 from RESEARCH.md) — reuse `reconnectWatcher`'s exact re-parse sequence (lines 710-767: `startWatching` → `loadRoadmapModel` → `scanAllPhases` → reread `statePath` → `buildPhaseModels` → single `set()`) as the template for a new `switchProject(root)` action.

---

### `src/stores/session-store.ts` (extend)

**Analog:** itself — `SessionDescriptor` (77-88), `createSession` (202-237), `discoverSessions` (277-292), `setActivity` (300-309)

**`SessionDescriptor` to extend** (lines 77-88):
```ts
export interface SessionDescriptor {
  id: string;
  lastModified: Date | null;
  origin: SessionOrigin; // extend to include "restored"
  activity?: TerminalActivity;
}
```
Add `projectRoot: string` and `name?: string`. `origin` gains a third value `"restored"` alongside existing `"live"`/`"historical"`, per CONTEXT.md's `origin: "restored"` requirement.

**`createSession` to extend for `projectRoot`** (lines 202-219) — `root` is already read from `useBoardStore.getState().project?.root` at line 203; thread it into the pushed descriptor (currently `{ id: sessionId, lastModified: new Date(), origin: "live" }` at line 218) as `{ ..., projectRoot: root }`.

**`renameSession` action** — follow the exact same shape as `setActivity` (lines 300-309, TRANSITION-GATED no-op-if-unchanged pattern):
```ts
setActivity: (sessionId: string, activity: TerminalActivity) => {
  const current = get().sessions.find((session) => session.id === sessionId);
  if (!current || current.activity === activity) return;
  set((state) => {
    const descriptor = state.sessions.find((session) => session.id === sessionId);
    if (descriptor) descriptor.activity = activity;
  });
},
```
Mirror this shape for `renameSession(id, name)`, then persist via `appStore` (fire-and-forget, same pattern as recents upsert above).

**`discoverSessions` to filter by `projectRoot`** (lines 277-292) — `listSessions(encodedDir)` already scopes discovery per-project via `register_sessions_scope`; ensure `mergeSessionDescriptors` (lines 160-179) tags new entries with the `projectRoot` param already passed in, mirroring how it currently sets `origin: "historical"` for new entries (line 174).

**Exit-listener wiring** — call `listenForSessionExit` (new `channel.ts` export) once at store init/module load time (similar to how `discoverSessions` is invoked from `AppShell`/`SessionSidebar` on project open), routing into a new `markExited(sessionId)` action that mirrors `setActivity`'s find-then-mutate shape.

---

## Shared Patterns

### Zustand + Immer store shape
**Source:** `src/stores/board-store.ts`, `src/stores/session-store.ts` (both use `create<T>()(immer((set, get) => ({...})))`)
**Apply to:** any new store slice (`home` recents could live in `board-store.ts` per RESEARCH's Open Questions, or a new `home-store.ts` following the identical `create<T>()(immer(...))` shape).

### Module-level `Map`s for high-frequency, non-reactive state
**Source:** `src/stores/session-store.ts:46` (`liveSessions`), `:60` (`activityStops`); `src/pty/channel.ts:35,46` (`bytesHandlers`, `activityHandlers`)
**Apply to:** any new per-session in-memory cache that must NOT be immer-frozen (e.g., in-flight snapshot serialization state) — keep it as a module-level `Map`, never inside the immer-managed store shape.

### Global `tauri::Emitter` event for rare, once-per-lifetime signals
**Source:** `src-tauri/src/planning_watcher.rs:96-98,106-109` (`planning:changed`/`planning:watcher-degraded`), consumed by `src/planning/watch.ts:73-81` (`listen(...)`)
**Apply to:** `pty:session-exited` — NOT a tagged envelope inside the byte `Channel`.

### Fire-and-forget background task guarded by a staleness check
**Source:** `src/stores/board-store.ts:503-509` (`loadMilestoneHistory` then-callback checks `state.project.root === validated.root` before committing)
**Apply to:** any async persistence write kicked off after a state transition (recents upsert, snapshot save) — guard against the user having navigated away before the write's promise resolves.

### Strict allow-list sanitizer before string interpolation into a spawned command
**Source:** `src/planning/actions.ts:84-93` (`sanitizePhaseId`)
**Apply to:** `src/sessions/id-format.ts` (`isValidSessionId`) — same anchored-regex, `string | null`/boolean-refusal shape, applied at the single call site before the value reaches `spawnSession`'s `args`.

### Degrade-silently-never-throw for optional backend capability
**Source:** `src/stores/session-store.ts:277-286` (`discoverSessions` catches `register_sessions_scope` failure and returns with no sessions, no error state)
**Apply to:** `src/notifications/notify.ts` (permission denied → badge-only fallback, never throw/block).

### Minimal per-command capability grants, never `*:default` blanket permissions
**Source:** `src-tauri/capabilities/default.json:6-16` (`fs:allow-read-text-file` not `fs:default`, etc.)
**Apply to:** new `store:allow-*` and `notification:allow-*` entries — request only what's actually invoked.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/persistence/app-store.ts` | service | file-I/O | First disk-write mechanism in the app — board-store/planning/read.ts are strictly read-only by product invariant. Use RESEARCH.md's `## Code Examples` verbatim (already vetted); closest structural precedent is `channel.ts`'s thin-wrapper style. |
| `src/persistence/session-snapshot.ts` | service | file-I/O | Same reason as above (split-file design per Pitfall 4). |
| `src/notifications/notify.ts` | service | event-driven | No existing OS-notification code; use `channel.ts`'s thin-wrapper style + RESEARCH.md's `## Don't Hand-Roll` guidance (use `@tauri-apps/plugin-notification` directly, no custom bindings). |

## Metadata

**Analog search scope:** `src/`, `src-tauri/src/`, `src-tauri/capabilities/`, `src-tauri/Cargo.toml`
**Files scanned:** ~45 source files + capabilities/config
**Pattern extraction date:** 2026-07-24
