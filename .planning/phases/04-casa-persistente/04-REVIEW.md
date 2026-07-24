---
phase: 04-casa-persistente
reviewed: 2026-07-24T00:00:00Z
depth: deep
files_reviewed: 51
files_reviewed_list:
  - src-tauri/Cargo.toml
  - src-tauri/capabilities/default.json
  - src-tauri/src/lib.rs
  - src-tauri/src/pty.rs
  - src/components/DetailPanel.test.tsx
  - src/components/PhaseCard.test.tsx
  - src/components/PhaseCardAction.test.tsx
  - src/components/home/CreateProjectFlow.tsx
  - src/components/home/HomeScreen.test.tsx
  - src/components/home/HomeScreen.tsx
  - src/components/home/ProjectCard.test.tsx
  - src/components/home/ProjectCard.tsx
  - src/components/session/RenameSessionControl.tsx
  - src/components/session/SessionRow.test.tsx
  - src/components/session/SessionRow.tsx
  - src/components/session/SessionSidebar.test.tsx
  - src/components/session/SessionSidebar.tsx
  - src/components/session/SidebarScopeBanner.tsx
  - src/components/terminal/TerminalView.tsx
  - src/components/terminal/focus-algorithm.test.ts
  - src/components/terminal/focus-algorithm.ts
  - src/i18n.ts
  - src/locales/en/common.json
  - src/locales/en/home.json
  - src/locales/en/session.json
  - src/locales/en/terminal.json
  - src/locales/pt-BR/common.json
  - src/locales/pt-BR/home.json
  - src/locales/pt-BR/session.json
  - src/locales/pt-BR/terminal.json
  - src/notifications/notify.test.ts
  - src/notifications/notify.ts
  - src/persistence/app-store.test.ts
  - src/persistence/app-store.ts
  - src/persistence/session-snapshot.test.ts
  - src/persistence/session-snapshot.ts
  - src/pty/channel.test.ts
  - src/pty/channel.ts
  - src/sessions/id-format.test.ts
  - src/sessions/id-format.ts
  - src/shell/AppShell.test.tsx
  - src/shell/AppShell.tsx
  - src/shell/DrawerRail.test.tsx
  - src/shell/DrawerRail.tsx
  - src/shell/Header.tsx
  - src/shell/ProjectSwitcherButton.test.tsx
  - src/shell/ProjectSwitcherButton.tsx
  - src/stores/board-store.test.ts
  - src/stores/board-store.ts
  - src/stores/session-store.test.ts
  - src/stores/session-store.ts
findings:
  critical: 3
  warning: 3
  info: 3
  total: 9
status: issues_found
fix_status: all_fixed
fixed_at: 2026-07-24T07:04:00Z
---

# Phase 4: Code Review Report

**Reviewed:** 2026-07-24
**Depth:** deep
**Files Reviewed:** 51 (source diff of `src/` and `src-tauri/` from `c75be94` to `HEAD`, commits `04-01`..`04-07`)
**Status:** issues_found

## Summary

Phase 4 ("Casa persistente") is well-engineered at the mechanism level: the flag-injection guard (`isValidSessionId`) is applied at the single correct call site before `--resume` ever reaches argv, `PtyManager::remove_exited`/`handle_session_exit` are covered by real-process Rust tests, `cargo build`/`cargo check` are clean (no warnings), and the full frontend suite (514 tests, 48 files) passes. i18n key parity between `pt-BR` and `en` is exact for all four touched namespaces. The persistence split (`app-store.ts` small-metadata vs. `session-snapshot.ts` per-session file) correctly follows the documented Pitfall-4 rationale, and `capabilities/default.json` grants only the granular `store:allow-*`/`notification:allow-*` permissions actually used.

However, three requirement-level defects were found that undermine the phase's own stated goals, plus a handful of narrower correctness/security gaps:

1. The new home/landing screen — the entire point of "casa persistente" and PROJ-01 — is never shown automatically on app launch or re-launch; the app still boots into the pre-Phase-4 "no project open" empty state, with Home reachable only via a small, undiscoverable header chevron.
2. The create-project flow (PROJ-03) discards all PTY output from the injected `/gsd-new-project` session and never mounts a terminal for the user to view or answer it, directly contradicting `04-UI-SPEC.md`'s own explicit requirement that "the terminal underneath" stay visible/interactive for exactly this purpose.
3. That same flow has no timeout and no cancel affordance during the "creating project" spinner, and an async rejection from the spawn is unhandled — a failed or stalled creation traps the user in a permanently stuck dialog.

## Critical Issues

### CR-01: Home screen is never the default/entry view — PROJ-01 unreachable except via undiscoverable navigation

**Fix status:** fixed — commit `e8b1bf7`. `board-store.ts`'s initial `view` is now `"home"` (was `"board"`); `AppShell`'s `handleOpenProject` now also switches to `"board"` after the attempt (success or failure), so an open triggered from Home always surfaces the resulting board/error state. `AppShell.test.tsx` updated to assert Home renders on fresh boot, plus a new regression test for the open-from-home-then-board-on-failure path. Full suite green (516/516 at the time of this fix).

**File:** `src/stores/board-store.ts:522`, `src/shell/AppShell.tsx:20-47`, `src/App.tsx`, `src/main.tsx`

**Issue:** `board-store.ts` initializes `view: "board"` (line 522) and nothing in `App.tsx`/`main.tsx`/`AppShell.tsx` ever calls `setView("home")` on boot. `AppShell`'s home branch (`view === "home"`) is only reached by an explicit user click on `ProjectSwitcherButton`'s chevron-left "back to home" icon inside the `Header` — a control that itself only exists once the full shell (`Header`/`SessionSidebar`/`DrawerRail`) is already rendering. On a fresh launch (or any relaunch with `status: "idle"`), the user lands directly on the pre-Phase-4 `EmptyState` ("Nenhum projeto aberto" / "Abrir projeto" button), never on the recents grid the phase was built to deliver. `AppShell.test.tsx:77-84` ("estado idle: mostra o heading de estado vazio...") explicitly locks in this behavior as current/expected.

This directly contradicts the phase's own framing: `04-UI-SPEC.md:14` and `:18` call the new screen "the home/landing screen"; `04-CONTEXT.md`'s `## Phase Boundary` opens with "Página principal multi-projeto (PROJ-01, PROJ-06): lista de projetos recentes ordenada por último acesso" as the first thing the phase delivers; the phase itself is named "04-casa-persistente" (persistent home). `04-01-SUMMARY.md:155` even flags this explicitly as deferred work ("the actual home-as-default-entry-point behavior... is deferred to Plan 04-03/04-04"), but no plan from 04-02 through 04-07 implements it — it was silently dropped, not merely deferred and later resolved.

**Fix:**
```tsx
// src/shell/AppShell.tsx — decide the initial view once, on mount, instead
// of always trusting board-store's static "board" default.
useEffect(() => {
  if (useBoardStore.getState().status === "idle") {
    useBoardStore.getState().setView("home");
  }
}, []);
```
or, more simply, change `board-store.ts`'s initial state to `view: "home"` and have `openProject`'s existing `state.view = "board"` assignment (already present) cover every subsequent successful open — `AppShell.test.tsx`'s "estado idle" test would then need updating to assert the Home screen renders by default, matching the actual product intent.

### CR-02: Create-project flow gives the user no way to see or answer `/gsd-new-project`'s prompts

**Fix status:** fixed — commit `5ad3b28`. `createProjectSession` now accepts an optional `onBytes` callback forwarded verbatim to `spawnSession` (option (a) from the Fix suggestion below — a minimal in-panel mini-terminal, since the Home-replaces-the-whole-shell model in option (b) would have required undoing this phase's own view architecture). `CreateProjectFlow` wires bytes into a capped, auto-scrolling `<pre>` output pane plus an input field wired to `writeSession`, so the user can watch and respond to the session live inside the progress panel. New `CreateProjectFlow.test.tsx` covers the onBytes wiring, decoded output rendering, and input submission.

**File:** `src/stores/session-store.ts:436`, `src/components/home/CreateProjectFlow.tsx:49-108`

**Issue:** `createProjectSession` spawns the raw-folder session with `onBytes: () => {}` (session-store.ts:436) — every byte the injected `/gsd-new-project\r` conversation produces is discarded. `CreateProjectFlow` never mounts a `TerminalView` while running (`view` stays `"home"` for the whole flow — confirmed by `04-04-SUMMARY.md`'s own deviation note: "no TerminalView ever mounts while view === 'home' (HomeScreen replaces the entire shell)"). The progress dialog (`CreateProjectFlow.tsx:150-184`) shows only a generic `Loader2` spinner and static copy — no scrollback, no input box, no way to type a reply.

This is a direct contradiction of the phase's own UI contract: `04-UI-SPEC.md:237` states "The panel never blocks the ability to see terminal output — if the user wants to watch `/gsd-new-project`'s own prompts/output live rather than wait on the progress panel, the panel includes no modal backdrop-blocking of keyboard input to the terminal underneath... because the user may need to interact with the terminal (e.g. answer a `/gsd-new-project` prompt) while this panel is visible." The implementation makes this categorically impossible — there is no terminal underneath at all while `view === "home"`. `/gsd-new-project` is GSD's standard project-bootstrap command and is interactive (it gathers project context via Q&A, the same pattern this very command family uses elsewhere in this codebase) — any project creation that requires more than a single fire-and-forget command will silently stall with the user unable to see why or respond.

**Fix:** Either (a) route `createProjectSession`'s bytes into a visible/minimal terminal surface inside the `CreateProjectFlow` dialog itself (e.g., mount a lightweight `xterm.js` instance or at minimum stream raw text into a `<pre>` with an input box wired to `writeSession`), or (b) keep `view` at `"board"`-equivalent by mounting the real `TerminalView`/`DrawerRail` for the newly created session underneath the soft overlay, consistent with what `04-UI-SPEC.md:237` already promises. A minimal fix: drop the `HomeScreen`-replaces-everything model for the duration of `CreateProjectFlow` and reuse the existing `TerminalView` component instead of discarding bytes.

### CR-03: Create-project "in progress" state can hang forever with no cancel and an unhandled rejection

**Fix status:** fixed — commit `8758093`. `waitForPlanningDir` now takes an `isTimedOut()` predicate; the flow tracks an inactivity timestamp (reset on every byte received) and times out after 60s of silence (idle timeout rather than an absolute deadline, so a real, slow `/gsd-new-project` Q&A the user is actively answering is never punished). The whole `createProjectSession`/`waitForPlanningDir`/`openProject` sequence is wrapped in `try`/`catch`, landing on a new `"error"` phase with a dismiss button instead of an unhandled rejection. A Cancel button was added to the `"progress"` phase. WR-03 (below) was bundled into this same commit since it touches the same `run()` function. New tests cover the timeout/resolve/still-polling behavior of `waitForPlanningDir` (exported for direct unit testing), cancel-during-progress never reaching `openProject`, and the generic error state + dismiss.

**File:** `src/components/home/CreateProjectFlow.tsx:42-47, 57-108, 150-184`

**Issue:** `waitForPlanningDir` (lines 42-47) polls `exists(planningDir(root))` in an unbounded `while (!isCancelled())` loop with no timeout — the only way `isCancelled()` becomes `true` is if the component unmounts, but nothing in the "progress" render branch (lines 150-172) offers a close/cancel button (only the `"notEmpty"` branch does, lines 209-227). If `/gsd-new-project` never completes (stalls on a question the user can't answer per CR-02, the CLI is missing, or the command errors out without ever creating `.planning/`), the spinner dialog is permanently stuck with no escape short of restarting the app.

Compounding this, `run()` (lines 57-108) has no `try`/`catch` around `await useSessionStore.getState().createProjectSession(selected)` (line 88) or the subsequent `writeSession` call inside it. `createProjectSession` (session-store.ts:397-440) itself does not wrap its own `spawnSession`/`writeSession` calls (lines 436-437) in a `try`/`catch` either — only the unrelated `register_sessions_scope` call is guarded. If `spawn_session` fails (e.g., `claude` not resolvable, `PtyError::Spawn`), the rejection propagates out of `createProjectSession`, out of `run()`, and since `run()` is invoked as `void run()` (line 102) with no `.catch()`, this becomes an unhandled promise rejection — the dialog is left in whatever `phase` it was last set to (likely still `"progress"`, spinner forever), with no error surfaced to the user.

**Fix:**
```tsx
async function run() {
  try {
    // ...existing picker/readDir logic...
    setPhase("progress");
    await useSessionStore.getState().createProjectSession(selected);
    if (cancelledRef.current) return;

    await waitForPlanningDir(selected, () => cancelledRef.current, /* timeoutMs */ 60_000);
    // ...
  } catch (error) {
    if (!cancelledRef.current) setPhase("error"); // new phase + a visible dismiss button
  }
}
```
Add a `"error"` `FlowPhase` (rendered like `"notEmpty"`, with a dismiss button) reachable both from a caught rejection and from `waitForPlanningDir` timing out, and add a cancel/close affordance to the `"progress"` render branch itself so the user is never trapped regardless of cause.

## Warnings

### WR-01: `resumeSession`'s `cwd` is read from persisted state without ever being re-validated

**Fix status:** fixed — commit `633cb27`. `resumeSession` now re-validates `session.projectRoot` via `validateProjectRoot` immediately before any other side effect (activity wiring, snapshot load, `activeSessionId` change, spawn); a validation failure refuses to resume (never spawns) and surfaces a `toSessionError`, same pattern as every other error path in this store. Spawns with the validated/canonicalized root, not the raw persisted value. New tests: spawnSession receives the validated root when it differs from the raw persisted one, and a validation failure never spawns/promotes/focuses the session.

**File:** `src/stores/session-store.ts:594-602`

**Issue:** `resumeSession` spawns `claude --resume <id>` using `session.projectRoot` (line 602) as `cwd` — sourced, for `origin: "restored"` sessions, directly from `PersistedSessionEntry.projectRoot` in `app-state.json` (`loadPersistedSessions`, session-store.ts:497-525), a plaintext, locally-tamperable file. Unlike every other project-root consumer touched by this phase (`openProject`, `switchProject`, `ProjectCard`'s health check), this path is never passed through `validate_project_root`/`validateProjectRoot` before being used to spawn a process. `04-RESEARCH.md`'s own `## Security Domain` states the invariant for this phase in `V4 Access Control`: "this phase must route EVERY persisted `root` back through it before use, never trust a stored path directly" — `resumeSession` is the one path that doesn't. Exploitability is bounded (same-OS-user tampering, `portable-pty` spawns without a shell so the value itself can't be used for command injection), but it is an unenforced trust-boundary gap against the phase's own documented threat model, and could point `cwd` at an arbitrary local directory.

**Fix:** Re-validate `session.projectRoot` via `validateProjectRoot` immediately before the `spawnSession(..., ["--resume", sessionId])` call in `resumeSession`, and surface the same `error` state used elsewhere (`toStoreError`) if validation fails, rather than trusting the persisted value directly.

### WR-02: Lost-update race on `app-store.ts`'s shared JSON store across concurrent persistence calls

**Fix status:** fixed — commit `1832b87`. Adds a single in-module promise-chain lock (`withStoreLock`) and routes all four read-modify-write functions (`upsertRecent`, `removeRecent`, `setSessionName`, `upsertPersistedSession`) through it, serializing every write against this store regardless of which key/function triggered it — matches the Fix suggestion below verbatim. Regression tests prove two never-awaited-in-sequence concurrent `upsertRecent`/`upsertPersistedSession` calls both persist; verified locally that these same tests fail (reproduce the lost-update) against the pre-fix code before committing the fix.

**File:** `src/persistence/app-store.ts:44-49, 62-67, 78-88, 118-123`

**Issue:** `upsertRecent`, `removeRecent`, `setSessionName`, and `upsertPersistedSession` all perform an unprotected read-modify-write cycle against the same top-level array/object key of the shared `appStore` `LazyStore`: `await appStore.get(KEY)` → compute a new array/object → `await appStore.set(KEY, next)` → `await appStore.save()`. Because each step is a separate async IPC round-trip, two concurrent calls that touch the *same* key (most plausibly `upsertPersistedSession`, called by `persistSnapshot` on every terminal lose-focus, or `setSessionName` if two rename actions land close together) can interleave: call B's `get()` can read the array *before* call A's `set()` has been applied, so B's subsequent `set()` overwrites A's write, silently dropping A's persisted entry. With multiple projects/sessions open simultaneously — the exact scenario this phase introduces — concurrent lose-focus events across sessions are a realistic trigger, not a contrived one.

**Fix:** Serialize writes to `appStore` through a single in-module promise chain (a simple mutex), e.g.:
```ts
let writeQueue: Promise<unknown> = Promise.resolve();
function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.catch(() => {});
  return next;
}
// wrap each exported read-modify-write function's body in withStoreLock(...)
```

### WR-03: `readDir` failure in `CreateProjectFlow` is silently mapped to the wrong error state

**Fix status:** fixed — commit `8758093` (bundled with CR-03, same `run()` function). `readDir` failures now set a distinct `"readFailed"` error kind/copy ("couldn't read that folder") instead of faking an empty-array entry to reuse the `"notEmpty"` copy. New regression test asserts the read-failure copy renders and `createProjectSession` is never called, with an explicit assertion that the `"notEmpty"` copy does NOT appear.

**File:** `src/components/home/CreateProjectFlow.tsx:72-85`

**Issue:** When `readDir(selected)` throws (unreadable/permission-denied folder), the `catch` block sets `entries = [{}]` (a fake single-entry array) purely so the subsequent `entries.length > 0` check routes into the `"notEmpty"` phase. This shows the user the "folder is not empty" error copy (`create.error.notEmpty.*`) even when the real problem is that the folder couldn't be read at all — a misleading diagnostic that will confuse anyone hitting a genuine permissions issue.

**Fix:** Introduce a distinct phase (or reuse the CR-03 `"error"` phase) for the `readDir` failure case, with copy that reflects "couldn't read that folder" rather than "that folder isn't empty."

## Info

### IN-01: Dead i18n key acknowledged but never removed

**Fix status:** fixed — commit `7e76dd5`. `historicalTooltip` removed from both `session.json` files (parity preserved); the stale file-header comment in `SessionRow.tsx` documenting it as an intentional dead key was updated to reflect the removal.

**File:** `src/locales/en/session.json:31`, `src/locales/pt-BR/session.json:31`

**Issue:** `session.row.historicalTooltip` is explicitly called out as dead in `SessionRow.tsx`'s file-header comment ("A cópia retirada `session.row.historicalTooltip` fica presa no arquivo de i18n (dead key, nunca deletada)") but was never deleted from either locale file.

**Fix:** Remove `historicalTooltip` from both `session.json` files now that `restoredTooltip` fully supersedes it.

### IN-02: `SessionSidebar.test.tsx` triggers "not wrapped in act(...)" warnings

**Fix status:** fixed — commit `6ef0813`. Wrapped the assertions that depend on `checkClaudeOnPath`/`discoverSessions`/`loadPersistedSessions` settling in `await waitFor(...)` across all `render()` call sites in this file, consistent with the pattern already used correctly in the `ToolMissingState` suite. `npx vitest run` for this file no longer prints act() warnings.

**File:** `src/components/session/SessionSidebar.test.tsx` (multiple `render(<SessionSidebar />)` call sites, e.g. lines 50, 66, 80, 106, 130)

**Issue:** Running the suite (`npx vitest run`) prints repeated React `act()` warnings for this file — `SessionSidebar`'s effects (`discoverSessions`, `loadPersistedSessions`, `checkClaudeOnPath`) resolve asynchronously and call `set()` outside of `act()`/`waitFor()`. All 514 tests currently pass, but this pattern is a known source of test flakiness under different scheduling/timing (CI machines, future React versions).

**Fix:** Wrap assertions that depend on the async effects settling in `await waitFor(() => ...)` (already used correctly elsewhere in this same file, e.g. around persisted-session assertions) consistently across all `render()` call sites in this file.

### IN-03: `t("card.progress", ...)` computed/rendered twice for the same value

**Fix status:** fixed — commit `addd770`. Computes `progressLabel` once (in the component body, guarded on `health.kind === "healthy"`) and reuses it for both the `ProgressBar` label and the adjacent visible text.

**File:** `src/components/home/ProjectCard.tsx:205-221`

**Issue:** The healthy-card progress row calls `t("card.progress", { percent: health.percent ?? 0 })` twice in a row (once as the `ProgressBar` label, once as adjacent visible text) — harmless duplication but avoidable.

**Fix:** Compute `const progressLabel = t("card.progress", { percent: health.percent ?? 0 });` once and reuse it in both places.

---

## Fix Pass Summary

All 9 findings fixed (3 critical, 3 warning, 3 info) — `fix_status: all_fixed`. Nine atomic commits, one per finding (WR-03 bundled into CR-03's commit since it shares the same `run()` function):

| Finding | Commit | Status |
|---|---|---|
| CR-01 | `e8b1bf7` | fixed |
| CR-02 | `5ad3b28` | fixed |
| CR-03 | `8758093` | fixed |
| WR-01 | `633cb27` | fixed |
| WR-02 | `1832b87` | fixed |
| WR-03 | `8758093` (bundled with CR-03) | fixed |
| IN-01 | `7e76dd5` | fixed |
| IN-02 | `6ef0813` | fixed |
| IN-03 | `addd770` | fixed |

Regression tests were added for every fix (including a dedicated `CreateProjectFlow.test.tsx`, new here). `npm run typecheck` and the full `npx vitest run` suite were re-run after each individual commit and stayed green throughout — 533/533 tests passing at the end of the fix pass (up from the pre-fix baseline of 514; net +19 tests across the nine fixes, several of which add multiple regression cases per finding). WR-02's regression tests were additionally verified to FAIL against the pre-fix code (reproduced the lost-update race locally) before the fix was committed, per the fixer's verification discipline for concurrency fixes.

_Fixed: 2026-07-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

---

_Reviewed: 2026-07-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
