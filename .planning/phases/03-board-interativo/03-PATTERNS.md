# Phase 3: Board interativo - Pattern Map

**Mapped:** 2026-07-23
**Files analyzed:** 15
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/planning/actions.ts` | utility (pure mapper) | transform | `src/planning/status.ts` (`toBoardBadge`) | exact |
| `src/components/PhaseCardAction.tsx` | component (presentational, CVA/inline-style) | request-response (click→inject) | `src/components/session/SessionRow.tsx` (button block, lines 188-231) | exact |
| `src/components/ActivityDot.tsx` | component (presentational) | transform (state→visual) | `src/components/session/SessionRow.tsx` (status-dot span, lines 151-159) + `StatusBadge.tsx`'s `statusDotVariants` | exact |
| `src/pty/activity.ts` | utility (pure classifier) | streaming | `src/components/terminal/focus-algorithm.ts` (pure functions, structural-typing pattern) | role-match |
| `src/components/terminal/useTerminalActivity.ts` | hook | streaming | `src/components/terminal/focus-algorithm.ts` (`loseFocus`/`gainFocus` wiring shape) + `src/pty/channel.ts` (`bytesHandlers`) | role-match |
| `src/pty/channel.ts` (extended: `activityHandlers` map) | service (PTY bridge) | streaming | itself — extend `bytesHandlers` pattern in same file | exact |
| `src/stores/session-store.ts` (extended: `activity` field) | store | event-driven | itself — extend `SessionDescriptor`/`setError`-style setter pattern | exact |
| `src/components/terminal/GsdCommandToolbar.tsx` | component | request-response | `src/shell/DrawerRail.tsx` (button + `t()` label pattern, lines 44-60) | role-match |
| `src/components/terminal/CommandPalette.tsx` | component (modal) | request-response | `src/components/session/ConfirmDialog.tsx` (full file — backdrop/Esc/click-outside skeleton) | exact (interaction skeleton only; visual differs per UI-SPEC) |
| `src/components/PhaseCard.tsx` (extended) | component | request-response | itself — Row 2 badge line, lines 99-119 | exact |
| `src/components/DetailPanel.tsx` (extended) | component | request-response | `src/components/session/ConfirmDialog.tsx` (button styling, lines 119-135) | role-match |
| `src/components/session/SessionRow.tsx` (extended) | component | event-driven | itself — `TONE_BY_VARIANT` map, lines 34-40 | exact |
| `src/components/terminal/TerminalView.tsx` (extended) | component | streaming | itself — Ctrl+F interception, lines 225-237 | exact |
| `src/shell/DrawerRail.tsx` (extended) | component/layout | request-response | itself — expanded `<aside>` branch, lines 28-42 | exact |
| `src/locales/{pt-BR,en}/commands.json` (new), `board.json`/`terminal.json` (extended) | config (i18n) | transform | `src/i18n.ts` (resources/ns registration, lines 1-53) + `src/locales/*/terminal.json` | exact |

## Pattern Assignments

### `src/planning/actions.ts` (utility, transform)

**Analog:** `src/planning/status.ts`

**Core exhaustive-switch pattern** (lines 100-130 of `status.ts`):
```typescript
export function toBoardBadge(status: DiskStatus, isActive: boolean): BoardBadge {
  switch (status) {
    case "no_directory":
    case "empty":
      return "pending";
    case "discussed":
    case "researched":
      return "discussed";
    case "planned":
      return isActive ? "executing" : "planned";
    case "partial":
      return "executing";
    case "executed":
      return "executed";
    case "complete":
      return "verified";
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}
```
**Pattern to copy:** same shape — `DiskStatus` in, closed-union value out, `default: { const exhaustiveCheck: never = status; return exhaustiveCheck; }` for compile-time completeness whenever a new `DiskStatus` value is added. `deriveePhaseAction` (RESEARCH.md's proposed name, note the typo carried from RESEARCH — planner should fix to `derivePhaseAction`) follows this exactly, returning `PhaseAction | null` (null for `complete`).
**Security note carried from RESEARCH.md:** validate `phase.id` against `/^\d{2,}(\.\d+)?$/` before interpolating into `command(id)` — no existing analog for this validation in the codebase (new territory), but the *pattern of never trusting disk-derived strings verbatim* mirrors `board-store.ts`'s treatment of parse-warning phases.

---

### `src/components/PhaseCardAction.tsx` (component, request-response)

**Analog:** `src/components/session/SessionRow.tsx` (archive/delete button block) + `src/components/PhaseCard.tsx` (badge row placement)

**Imports pattern** (`SessionRow.tsx` lines 16-25):
```typescript
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Archive, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { statusDotVariants, type StatusTone } from "../StatusBadge";
import { useSessionStore, type SessionDescriptor } from "../../stores/session-store";
```
For `PhaseCardAction`, swap in `deriveePhaseAction` from `../planning/actions`, `writeSession` from `../pty/channel`, and the relevant lucide icons (`Play`, `MessageSquare`, etc. per UI-SPEC `## Phase Action Mapping`).

**`stopPropagation` pattern** (`SessionRow.tsx` lines 76-80, exact citation from CONTEXT.md):
```typescript
function handleArchiveClick(event: MouseEvent<HTMLButtonElement>) {
  event.stopPropagation();
  void archiveSession(session.id);
}
```
Apply identically for the card action's `onClick`, so clicking the button never triggers `PhaseCard`'s own `handleActivate`/`selectPhase`.

**Button inline-style pattern** (`SessionRow.tsx` lines 190-209 — 32×32 icon button; UI-SPEC scales this to 24px height + label for the card variant, 32px + label for `DetailPanel`):
```typescript
<button
  type="button"
  onClick={handleArchiveClick}
  aria-label={t("actions.archive")}
  title={t("actions.archive")}
  style={{
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--color-foreground)",
    flexShrink: 0,
  }}
>
  <Archive size={16} aria-hidden="true" />
</button>
```
**Disabled-state pattern:** no existing disabled-button analog in this codebase — UI-SPEC's three-state system (solid idle / outline awaiting / disabled busy-or-no-session) is new. Model the `disabled` branch on the `title`-tooltip convention already used above (native `title` attribute carries guard copy, no custom tooltip component).

**Row 2 mount point** (`PhaseCard.tsx` lines 99-119 — badge + blocker row, `marginLeft: auto` for the new button per UI-SPEC):
```typescript
<div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap" }}>
  <span title={parseWarning ? t("card.parseError.tooltip") : undefined}>
    <StatusBadge status={parseWarning ? "unknown" : phase.badge} />
  </span>
  {hasBlockers ? ( /* ... */ ) : null}
  {/* NEW: <PhaseCardAction phase={phase} style={{ marginLeft: "auto" }} /> */}
</div>
```

---

### `src/components/ActivityDot.tsx` (component, transform)

**Analog:** `src/components/session/SessionRow.tsx` lines 151-159 + `statusDotVariants` (imported from `../StatusBadge`)

**Dot rendering pattern:**
```typescript
<span
  className={[
    statusDotVariants({ tone: TONE_BY_VARIANT[variant] }),
    isHistorical ? "status-dot--outline" : "",
  ]
    .filter(Boolean)
    .join(" ")}
  aria-hidden="true"
/>
```
**Pattern to copy:** `ActivityDot` composes the same `statusDotVariants(CVA)` output with a new `"status-dot--pulse"` modifier class (to be added to `theme.css`, mirroring the existing `status-dot--outline` modifier at `theme.css:87-95` per RESEARCH.md) instead of a new component-level variant — keeps `StatusTone` a closed 4-value enum. Tone mapping: `idle→success`, `busy→warning` (+pulse), `awaiting→accent` (+pulse) — same `Record<TerminalActivity, StatusTone>` shape as `TONE_BY_VARIANT: Record<SessionRowVariant, StatusTone>` (`SessionRow.tsx:35-40`).

---

### `src/pty/activity.ts` (utility, streaming — pure classifier)

**Analog:** `src/components/terminal/focus-algorithm.ts` (pure-function-over-structural-contract style, no DOM/PTY coupling)

**Pattern to copy — pure, dependency-injected, unit-testable without mocking Tauri:**
```typescript
// focus-algorithm.ts's shape: exported pure functions operating on explicit
// params objects, zero module-level side effects, structural typing so
// tests can pass plain objects instead of real xterm.js/Tauri instances.
export function loseFocus(params: LoseFocusParams): void { /* ... */ }
export function gainFocus<T extends FocusTerminalHandle>(params: GainFocusParams<T>): GainFocusResult<T> { /* ... */ }
```
`classifyActivity(rollingBufferText: string): "busy" | "awaiting" | null` and `appendToRollingBuffer(buffer, chunk)` (per RESEARCH.md `## Architecture Patterns` Pattern 3) follow this same "pure function, explicit params/returns, no imports beyond `strip-ansi`" discipline — this is the file `focus-algorithm.test.ts` (existing, not read but implied by the pattern) would test the same way.

---

### `src/components/terminal/useTerminalActivity.ts` (hook, streaming)

**Analog:** `src/pty/channel.ts` (`bytesHandlers` map + `setSessionBytesHandler`) — dual-consumer extension

**Existing single-consumer pattern to extend** (`channel.ts` lines 35, 63-68, 43-54):
```typescript
const bytesHandlers = new Map<string, (data: Uint8Array) => void>();

export function setSessionBytesHandler(
  sessionId: string,
  onBytes: (data: Uint8Array) => void,
): void {
  bytesHandlers.set(sessionId, onBytes);
}

// inside spawnSession:
onEvent.onmessage = (message) => {
  bytesHandlers.get(sessionId)?.(toBytes(message));
};
```
**New pattern (additive, per RESEARCH.md Pattern 2) — copy this shape exactly, do not replace the existing map:**
```typescript
const activityHandlers = new Map<string, (data: Uint8Array) => void>();

export function setActivityHandler(sessionId: string, onBytes: (data: Uint8Array) => void): void {
  activityHandlers.set(sessionId, onBytes);
}
export function clearActivityHandler(sessionId: string): void {
  activityHandlers.delete(sessionId);
}

onEvent.onmessage = (message) => {
  const bytes = toBytes(message);
  bytesHandlers.get(sessionId)?.(bytes);
  activityHandlers.get(sessionId)?.(bytes); // NEW, always fires
};
```
**Cleanup pattern** — mirror `killSession`'s `finally` block (`channel.ts` lines 86-97):
```typescript
export async function killSession(sessionId: string): Promise<void> {
  try {
    await invoke("kill_session", { sessionId });
  } catch {
    // Sessão já encerrada — não é erro.
  } finally {
    bytesHandlers.delete(sessionId);
    // NEW: activityHandlers.delete(sessionId);
  }
}
```
**Hook wiring shape** — model `useTerminalActivity`'s mount/unmount on `TerminalView.tsx`'s `gainFocus`/`loseFocus` effect lifecycle (register handler on mount, `clearActivityHandler` on unmount/session-change), same register/cleanup symmetry as `redirectToTerminal`/`redirectToBackground` calls in `focus-algorithm.ts`.

---

### `src/components/terminal/CommandPalette.tsx` (component, request-response — modal skeleton)

**Analog:** `src/components/session/ConfirmDialog.tsx` (full file, 141 lines — reuse interaction skeleton only, not the full-viewport visual per UI-SPEC)

**Imports + Esc-close pattern** (lines 11, 35-41):
```typescript
import { useEffect } from "react";

useEffect(() => {
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") onCancel();
  }
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [onCancel]);
```
**Backdrop + click-outside pattern** (lines 45-62 — UI-SPEC deviates: lighter backdrop, `position: absolute` confined to the 640px aside instead of `position: fixed; inset: 0`):
```typescript
<div
  onClick={onCancel}
  style={{
    position: "fixed",       // CommandPalette: position: "absolute", confined to <aside>
    inset: 0,
    backgroundColor: "color-mix(in srgb, var(--color-secondary) 60%, transparent)", // palette: 40%
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 40,
  }}
>
  <div
    role="alertdialog"          // palette: role="dialog" (not alert) since it's a command list, not a confirmation
    aria-modal="true"
    onClick={(event) => event.stopPropagation()}
    style={{ /* surface, radius, shadow */ }}
  >
    {/* content */}
  </div>
</div>
```
**Button styling for palette rows / DetailPanel action button** (lines 103-135, reused verbatim per UI-SPEC `## Detail Panel Actions`):
```typescript
<button
  type="button"
  onClick={onConfirm}
  style={{
    padding: "var(--spacing-sm) var(--spacing-md)",
    borderRadius: 6,
    border: "none",
    backgroundColor: primaryColor,
    color: "#ffffff",
    fontSize: "var(--font-size-body)",
    lineHeight: "var(--line-height-body)",
    fontWeight: "var(--font-weight-heading)",
    cursor: "pointer",
  }}
>
  {confirmLabel}
</button>
```

---

### `src/components/terminal/TerminalView.tsx` (extended — Cmd/Ctrl+K interception)

**Analog:** itself, lines 225-237 (existing Ctrl+F pattern, explicitly cited by CONTEXT.md/RESEARCH.md as the template)

```typescript
// Ctrl+F/Cmd+F com o terminal focado abre a search bar — existing pattern,
// scoped to xterm's own attachCustomKeyEventHandler (only fires when xterm
// has DOM focus):
t.attachCustomKeyEventHandler((event) => {
  if (event.type !== "keydown") return true;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    setSearchOpen(true);
    return false;
  }
  return true;
});
```
**Divergence required for Cmd/Ctrl+K (per RESEARCH.md `## Code Examples`):** the palette must open even when the xterm surface does NOT have DOM focus (user looking at the board) — `attachCustomKeyEventHandler` only fires when xterm has focus, so Cmd/Ctrl+K needs a `window`-level listener instead, scoped to mount only while the `<aside>` is expanded:
```typescript
useEffect(() => {
  function handleKeyDown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setPaletteOpen(true);
    }
  }
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, []);
```
Place this effect in `GsdCommandToolbar.tsx` or `DrawerRail.tsx` (wherever `paletteOpen` state lives), not inside the xterm `attachCustomKeyEventHandler` block — different interception layer entirely.

---

### i18n namespace registration (`commands.json` new, `board.json`/`terminal.json` extended)

**Analog:** `src/i18n.ts` (full file)

**Pattern to copy exactly** — add import pair + resources entry + `ns` array entry, one line each, mirroring the existing `terminal` namespace addition:
```typescript
import commandsPtBR from "./locales/pt-BR/commands.json";
import commandsEn from "./locales/en/commands.json";

export const resources = {
  "pt-BR": {
    // ...existing...
    commands: commandsPtBR,
  },
  en: {
    // ...existing...
    commands: commandsEn,
  },
} as const;

void i18next.use(initReactI18next).init({
  resources,
  // ...
  ns: ["common", "project", "board", "sync", "artifact", "session", "terminal", "commands"],
  // ...
});
```
`board.json`/`terminal.json` are extended (not replaced) — add new top-level keys per UI-SPEC's `## Copywriting Contract` tables (`board.actions.*`, `terminal.activity.*`, `terminal.toolbar.*`) alongside existing keys in each file, same flat-JSON-per-namespace convention already established.

---

## Shared Patterns

### `event.stopPropagation()` on nested interactive elements inside a clickable card/row
**Source:** `src/components/session/SessionRow.tsx` lines 76-80, 82-85
**Apply to:** `PhaseCardAction` (inside `PhaseCard`'s clickable card), any button inside `DetailPanel`'s clickable rows, `CommandPalette` row clicks (to avoid the backdrop's `onCancel` firing).
```typescript
function handleArchiveClick(event: MouseEvent<HTMLButtonElement>) {
  event.stopPropagation();
  void archiveSession(session.id);
}
```

### Guarded async call with silent-if-expected-error catch
**Source:** `src/pty/channel.ts` `killSession` (lines 86-97), `src/stores/session-store.ts` `discoverSessions` (lines 220-235)
**Apply to:** every `writeSession(...)` call from an action handler (Pitfall 3 in RESEARCH.md — must `.catch()` and surface `board.actions.error.injectFailed`, never silently no-op). No existing exact analog for surfacing a transient inline error message in the UI yet — the closest precedent is `SessionRow`'s `showHistoricalHint` transient-state pattern (below).

### Transient inline hint with auto-dismiss timeout
**Source:** `src/components/session/SessionRow.tsx` lines 42-43, 56-58, 61-67, 105-120, 245-258 (`showHistoricalHint` / `HISTORICAL_HINT_TIMEOUT_MS`)
**Apply to:** `board.actions.guard.prefilled` hint (2500ms per UI-SPEC, same timeout value) and `board.actions.error.injectFailed` transient message.
```typescript
const HISTORICAL_HINT_TIMEOUT_MS = 2500;
const [showHistoricalHint, setShowHistoricalHint] = useState(false);
const hintTimeoutRef = useRef<number | undefined>(undefined);

useEffect(() => {
  return () => {
    if (hintTimeoutRef.current !== undefined) window.clearTimeout(hintTimeoutRef.current);
  };
}, []);

function handleActivate() {
  setShowHistoricalHint(true);
  if (hintTimeoutRef.current !== undefined) window.clearTimeout(hintTimeoutRef.current);
  hintTimeoutRef.current = window.setTimeout(() => setShowHistoricalHint(false), HISTORICAL_HINT_TIMEOUT_MS);
}
```

### `statusDotVariants` CVA + tone-by-state Record map
**Source:** `src/components/session/SessionRow.tsx` lines 34-40 (`TONE_BY_VARIANT`)
**Apply to:** `ActivityDot`'s `TONE_BY_ACTIVITY: Record<TerminalActivity, StatusTone>` map.

### Vitest mocking `../pty/channel` + `@tauri-apps/api/core` invoke
**Source:** `src/stores/session-store.test.ts` lines 1-19
```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
const killSessionProcessMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("../pty/channel", () => ({
  killSession: (...args: unknown[]) => killSessionProcessMock(...args),
  // for PhaseCardAction tests: writeSession: (...args) => writeSessionMock(...args),
}));

const { useSessionStore, toSessionError } = await import("./session-store");

beforeEach(() => {
  useSessionStore.setState(initialSessionState, true);
  invokeMock.mockReset();
  killSessionProcessMock.mockReset();
});
```
**Apply to:** `PhaseCardAction.test.tsx` (assert `writeSession(sessionId, "/gsd-execute-phase 3\r")` called exactly, per CONTEXT.md `## Specifics`), `useTerminalActivity.test.ts` (mock `setActivityHandler`/`clearActivityHandler` from `../pty/channel`), `activity.test.ts` (no mocks needed — pure function).

### Dual-map byte routing in `channel.ts` (load-bearing, ACT-03)
**Source:** RESEARCH.md `## Architecture Patterns` Pattern 2, grounded in the existing `bytesHandlers` single-map design read directly from `src/pty/channel.ts`.
**Apply to:** `src/pty/channel.ts` extension + `useTerminalActivity.ts`. Critical: do NOT piggyback the activity classifier on `setSessionBytesHandler` (that slot is overwritten every focus change by `focus-algorithm.ts`'s `redirectToTerminal`/`redirectToBackground` — Pitfall 1).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/pty/activity.ts` — `classifyActivity` regex/threshold logic itself | utility | streaming | No prior text-classification-over-PTY-output code exists in this codebase; only the *pure-function/testable-shell* structural pattern (`focus-algorithm.ts`) is reusable, not the domain logic. Build directly from RESEARCH.md `## Architecture Patterns` Pattern 3's code example. |
| Disabled-button visual state (three-state: solid/outline/disabled) | component | transform | No existing button in this codebase has a disabled/outline visual variant — `SessionRow`'s Archive/Trash2 buttons are always-enabled icon-only. Build from UI-SPEC `## Card Action Anatomy`'s explicit color/opacity spec (`--color-secondary` border, 40% opacity foreground, `cursor: not-allowed`), no code analog to copy beyond the base button skeleton already cited above. |

## Metadata

**Analog search scope:** `src/components/`, `src/components/session/`, `src/components/terminal/`, `src/pty/`, `src/stores/`, `src/planning/`, `src/shell/`, `src/i18n.ts`, `src/locales/`
**Files scanned:** `PhaseCard.tsx`, `SessionRow.tsx`, `ConfirmDialog.tsx`, `channel.ts`, `focus-algorithm.ts`, `TerminalView.tsx` (partial, Ctrl+F block), `session-store.ts`, `session-store.test.ts` (partial), `status.ts` (grep), `DrawerRail.tsx` (partial), `i18n.ts`
**Pattern extraction date:** 2026-07-23
