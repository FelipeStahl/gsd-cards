# Phase 3: Board interativo - Research

**Researched:** 2026-07-23
**Domain:** PTY byte-stream parsing for terminal-state classification (browser/Tauri renderer), React/Zustand action-injection wiring, xterm.js multi-consumer byte routing
**Confidence:** MEDIUM — codebase-derived findings are HIGH (read directly from source); the Claude CLI output-marker heuristic is inherently LOW/ASSUMED (no vendor-published contract for terminal output; must be verified empirically per `03-CONTEXT.md`'s own admission)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Ações Contextuais (ACT-01)**
- Actions read `phase.diskStatus` (granular), NEVER `badge` — badge collapses `planned`+active into `executing`.
- Status→action mapping: `no_directory`/`empty`→Discutir (`/gsd-discuss-phase N`); `discussed`/`researched`→Planejar (`/gsd-plan-phase N`); `planned`→Executar (`/gsd-execute-phase N`); `partial`→Continuar (`/gsd-execute-phase N`); `executed`→Verificar (`/gsd-verify-work N`); `complete`→no primary action.
- Placement: single primary action on `PhaseCard` + action set on `DetailPanel`. Buttons use `event.stopPropagation()` (pattern: `SessionRow.tsx:76,83`).
- No confirmation modal on click when terminal is idle — the busy guard (ACT-03) is the safety net, not a dialog.

**Injeção de Comando (ACT-02)**
- Primitive: `writeSession(sessionId, "/gsd-...\r")` (`src/pty/channel.ts:71`). No separate "paste" path. No new Rust code needed.
- Target session: active/focused session (`activeSessionId`/`lastFocusedSessionId`, `session-store.ts:67-95`). No live session → disabled with hint. MVP does not open a session-picker modal.
- Card actions send with `\r` (executes) when terminal is idle. Prefill-without-send only for the awaiting-permission case.
- Availability gate: action enabled only when a live session with `claude` present exists; otherwise disabled with hint (reuses `ToolMissingState` pattern).

**Detecção de Estado do Terminal (ACT-03)**
- Signal source: live PTY byte stream, NOT `.jsonl` files (`.jsonl` content reading is deliberately walled off, T-02-06, `discover.ts:1-10`). New consumer observes bytes via `setSessionBytesHandler`/`backgroundBuffer`.
- Classification: heuristic over recently decoded output — "esc to interrupt"/spinner markers ⇒ busy; permission prompt ("Do you want to proceed?", "❯ 1. Yes") ⇒ awaiting; ~500ms quiescence ⇒ idle. Isolated in a pure, testable function.
- Threshold: ~500ms quiescence to return to idle; immediate flip to busy on first activity byte. Named constant, empirical tuning deferred to verification.
- New session state: activity field on `SessionDescriptor` — `SessionRowVariant` already reserves `starting`/`exited` slots; extend with `idle`/`busy`/`awaiting`.
- Guard behavior: busy → injection blocked with hint ("Claude está ocupado — aguarde"); awaiting-permission → injection prefills without sending (never steals the Enter key from the CLI's own permission prompt).

**Indicação Visual + Paleta/Atalhos (ACT-04)**
- Status indicator: dot reusing `.status-dot`/`statusDotVariants` on `SessionRow` and near injection controls — busy=amber (pulse), idle=green, awaiting=indigo/attention.
- Command palette: mounts inside the 640px drawer `<aside>` (`DrawerRail.tsx:28-41`), above `TerminalView`. Dual trigger: Cmd/Ctrl+K (intercepted before xterm, pattern of Ctrl+F in `TerminalView.tsx:229-237`) + a visible GSD button strip.
- Content: curated `/gsd-*` list (discuss, plan, execute, verify, quick, next, progress, status, help) with search filter. i18n labels.
- Structure: built on the reusable `ConfirmDialog` modal skeleton (backdrop, Esc, click-outside — `ConfirmDialog.tsx:1-9,35-41`). Palette send respects the same busy guard as card actions.

### Claude's Discretion
- Exact regex markers for "busy"/"awaiting permission" (tune against real Claude CLI output during execution/verification).
- Specific `lucide-react` icons per action and exact command ordering in the palette.
- Name of the new i18n namespace (`commands` new vs. extending `board`/`terminal`).

### Deferred Ideas (OUT OF SCOPE)
- **ACT-05** — Global command palette (Cmd+K from any screen, outside the drawer/terminal). This phase delivers the drawer-scoped palette; the full-screen global version is a separate capability (nice-to-have in REQUIREMENTS, line 63).
- State detection via structured `.jsonl` parsing — remains walled off by T-02-06; only reconsider as an explicit future security decision.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACT-01 | Cards de fase oferecem ações contextuais conforme o status | `## Architecture Patterns` Pattern 1 (status→action mapping is pure/testable, mirrors `status.ts`'s existing `toBoardBadge` pattern); `## Code Examples` #1 |
| ACT-02 | Disparar uma ação envia o comando `/gsd-*` correto para o terminal da sessão escolhida/ativa | `## Code Examples` #1/#2; `writeSession` error-propagation confirmed in `## Common Pitfalls` Pitfall 3 |
| ACT-03 | App detecta estado do terminal (ocioso/ocupado/aguardando permissão) e não injeta com Claude ocupado | `## Architecture Patterns` Pattern 2 (dual-consumer byte routing) + Pattern 3 (classification heuristic); `## Common Pitfalls` Pitfalls 1, 2, 4 |
| ACT-04 | Usuário tem atalhos GSD (paleta/botões) no drawer junto ao terminal | `## Code Examples` #3; `/gsd-status` command-name correction in `## Assumptions Log`/`## Metadata` |
</phase_requirements>

## Summary

Phase 3 adds no new Rust and no new IPC primitive — `writeSession` already exists and is sufficient for every injection surface (`03-CONTEXT.md` confirms this). The two genuinely open technical problems are: (1) classifying Claude CLI's raw PTY byte stream into idle/busy/awaiting-permission without a vendor-published output contract, and (2) routing PTY bytes to a *second*, always-on consumer (the activity classifier) without disturbing the existing single-consumer focus-routing indirection in `channel.ts`/`focus-algorithm.ts` that Phase 2 built for exactly one purpose (write-to-terminal vs. buffer-in-background).

Finding (2) is the most load-bearing architectural insight of this research: the UI-SPEC requires the activity dot to be live for **every** live session in the sidebar, not just the focused one (`03-UI-SPEC.md` "Supersedes note"). But `channel.ts`'s `bytesHandlers` map holds exactly one handler per session, and `focus-algorithm.ts` overwrites that handler on every focus change (`redirectToTerminal`/`redirectToBackground`). A classifier that piggybacks on that single slot would silently stop receiving bytes the moment a session loses focus — exactly the sessions whose activity state matters most (background sessions the user isn't currently watching). The fix is a second, independent map in `channel.ts` that always receives every byte regardless of focus routing (see Pattern 2 below).

Finding (1) requires accepting genuine uncertainty: there is no public Anthropic specification for Claude Code's PTY output format, and it is explicitly out of scope to solve this by reading `.jsonl` session content (T-02-06). The correct engineering response — already implied by `03-CONTEXT.md`'s own "empirical tuning deferred to verification" language — is to build the classifier as a small, pure, fully unit-testable function driven by named-constant regexes and a name­d quiescence threshold, so that tuning the markers later never touches wiring code. Prior art in the wider PTY-wrapper ecosystem (`pty-manager` on npm) independently converges on the same normalize-then-classify shape (strip ANSI/spinner/duration noise, then match against a small state grammar), which validates the approach even though that specific package cannot be used directly (it requires `node-pty`, a Node-only native module incompatible with a Tauri **renderer**-side classifier).

**Primary recommendation:** Build `useTerminalActivity` as a pure function `classifyActivity(rollingBuffer: string) => "idle" | "busy" | "awaiting"` fed by a small rolling text buffer (last ~2000 decoded chars, ANSI-stripped) per session, wired into `channel.ts` as a second always-on byte consumer independent of focus routing, and gate `set()` calls to zustand so re-renders only fire on state *transitions* — never per byte — preserving Phase 2's "background bytes never trigger re-render" invariant while satisfying ACT-04's reactive per-session dot.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Status→action mapping (ACT-01) | Frontend (pure TS module) | — | Pure derivation from `PhaseModel.diskStatus`, same tier/pattern as existing `status.ts` mappers — no I/O |
| Command injection (ACT-02) | Frontend → Rust PTY bridge | — | `writeSession` already crosses the IPC boundary; frontend only decides *what* string and *when*, Rust only writes bytes to the PTY's stdin |
| Terminal-state classification (ACT-03) | Frontend (renderer, pure function over decoded bytes) | — | Byte stream already arrives fully decoded/normalized bytes in the renderer via the existing `Channel`; no Rust-side text parsing exists or should be added (keeps `pty.rs` a dumb byte pipe, consistent with its current design — Rust never decodes UTF-8, per `channel.ts`'s header comment) |
| Activity indicator UI (ACT-04 visual) | Frontend (React components) | — | Presentational, reads classified state from the store |
| Command palette / toolbar (ACT-04) | Frontend (React component + keyboard interception) | — | Same tier as `TerminalSearchBar`'s existing Ctrl+F interception pattern |

No capability in this phase touches the Database/Storage or CDN/Static tiers; everything is renderer-tier except the pre-existing `write_session`/PTY byte-pipe boundary.

## Standard Stack

### Core

No new core runtime dependency is required — `writeSession`, `setSessionBytesHandler`, `Channel<T>`, and the zustand/immer store are all already in place from Phases 1-2.

### Supporting

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `strip-ansi` | 7.2.0 (verified via `npm view`, published 4 months ago) | Strip ANSI escape codes from decoded PTY text before running the busy/awaiting-permission regex classifiers | Avoids hand-rolling an ANSI-stripping regex (a well-known correctness trap — CSI/OSC/DCS sequences have subtle edge cases); `sindresorhus`/`chalk`-org package, zero-dependency transitive (`ansi-regex@6.2.2`), ESM-only which is compatible with this project's `"type": "module"` + Vite pipeline |

**Package Legitimacy note:** the automated legitimacy gate flagged `strip-ansi` `SUS` only because weekly-download telemetry was unavailable to the tool (`"unknown-downloads"`), not because of any actual red flag — `exists: true`, real GitHub repo (`chalk/strip-ansi`), no deprecation, no postinstall script. See `## Package Legitimacy Audit` below; still gated behind `checkpoint:human-verify` per protocol since the automated verdict is `SUS`, not `OK`.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `strip-ansi` (small, renderer-safe) | `pty-manager` (npm) | Rejected — depends on `node-pty` (native Node module), architecturally incompatible with a Tauri **renderer**-side classifier that only ever sees already-decoded bytes from a `Channel`, never spawns its own PTY. Still useful as a design reference (see Common Pitfalls) |
| `strip-ansi` | Hand-rolled ANSI regex | Rejected — ANSI/CSI/OSC parsing has real edge cases (multi-parameter sequences, 8-bit vs. 7-bit forms); a maintained, widely-depended-upon package is safer than a first-pass regex for something that gates a security-relevant guard (never-inject-while-busy) |

**Installation:**
```bash
npm install strip-ansi
```

**Version verification:** `npm view strip-ansi version` → `7.2.0`, published 4 months before this research date. `npm view ansi-regex version` → `6.2.2` (transitive dep), no deps of its own.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `strip-ansi` | npm | 7.2.0 published ~4 months ago (package itself: long-standing, `sindresorhus/chalk` ecosystem) | Not resolvable by the legitimacy tool in this environment (`weeklyDownloads: null`) — historically one of the most-depended-upon npm packages (used transitively by `chalk`, `eslint`, etc.) | `github.com/chalk/strip-ansi` | SUS (tool-reported — reason: `unknown-downloads`, not a content/behavior red flag) | Flagged — planner must add `checkpoint:human-verify` before `npm install strip-ansi` (confirm the download-count signal manually, e.g. `npmjs.com/package/strip-ansi`, before installing) |

**Packages removed due to `SLOP` verdict:** none.
**Packages flagged as suspicious `SUS`:** `strip-ansi` — flagged solely due to a tooling data-availability gap in this sandbox (outbound network to `api.npmjs.org` was unreachable during this research pass), not a genuine legitimacy concern. The planner must still gate the install behind `checkpoint:human-verify` per protocol.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │  Rust backend (src-tauri/src/pty.rs)     │
                         │  spawn_session / write_session /         │
                         │  resize_session / kill_session           │
                         │  — never decodes UTF-8, byte pipe only   │
                         └───────────────┬───────────────────────────┘
                                         │ Channel<RawChannelMessage> (per-session)
                                         ▼
                         ┌─────────────────────────────────────────┐
                         │  src/pty/channel.ts                      │
                         │  onEvent.onmessage → toBytes(message)    │
                         │       │                                  │
                         │       ├──▶ bytesHandlers.get(id)?.(bytes)│  (EXISTING, Phase 2)
                         │       │      focus-routed: either        │
                         │       │      terminal.write() OR         │
                         │       │      backgroundBuffer.push()     │
                         │       │                                  │
                         │       └──▶ activityHandlers.get(id)?.    │  (NEW, this phase)
                         │              (bytes) — ALWAYS wired,     │
                         │              independent of focus        │
                         └───────────────┬───────────────────────────┘
                                         │ Uint8Array chunks (possibly split
                                         │ UTF-8 / split ANSI sequences)
                                         ▼
                         ┌─────────────────────────────────────────┐
                         │  useTerminalActivity (per session)       │
                         │  1. TextDecoder({stream:true}).decode()  │
                         │  2. append to rolling buffer (cap ~2000) │
                         │  3. strip-ansi                           │
                         │  4. classifyActivity(buffer) [PURE FN]   │
                         │       → "idle" | "busy" | "awaiting"     │
                         │  5. quiescence timer (500ms) for busy→idle│
                         └───────────────┬───────────────────────────┘
                                         │ only on STATE TRANSITION
                                         ▼
                         ┌─────────────────────────────────────────┐
                         │  session-store.ts (zustand/immer)        │
                         │  sessions[].activity = "idle"|"busy"|... │
                         │  set() called ONLY on transition          │
                         └───────────────┬───────────────────────────┘
                                         │ reactive subscribe
                                         ▼
        ┌────────────────────────────────────────────────────────────────┐
        │  UI consumers (all read the same derived state, never re-derive)│
        │  SessionRow dot · ActivityDot (TerminalPane header, DetailPanel)│
        │  PhaseCardAction / DetailPanel action button (guard state)      │
        │  GsdCommandToolbar / CommandPalette (guard state)                │
        └────────────────────────────────────────────────────────────────┘
                                         │ user clicks an action
                                         ▼
                         ┌─────────────────────────────────────────┐
                         │  writeSession(activeSessionId, cmd)      │
                         │  — idle: cmd + "\r" (sends)               │
                         │  — awaiting: cmd, no "\r" (prefills)      │
                         │  — busy: never called (button disabled)  │
                         └─────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── planning/
│   └── actions.ts              # NEW — pure diskStatus→{label,command,icon} mapper (ACT-01), mirrors status.ts's shape
├── pty/
│   ├── channel.ts               # EXTENDED — add activityHandlers map + setActivityHandler export
│   └── activity.ts              # NEW — classifyActivity(buffer) pure function + regex constants (ACT-03)
├── stores/
│   └── session-store.ts         # EXTENDED — SessionDescriptor.activity field, setActivity() action (transition-gated set())
├── components/
│   ├── PhaseCardAction.tsx       # NEW — shared button, consumed by PhaseCard + DetailPanel
│   ├── ActivityDot.tsx           # NEW — dot + optional label, tone from activity state
│   ├── session/
│   │   └── SessionRow.tsx        # EXTENDED — live-variant dot becomes activity-aware
│   └── terminal/
│       ├── useTerminalActivity.ts # NEW — hook wiring channel.ts bytes → activity.ts → store, per session
│       ├── TerminalView.tsx       # EXTENDED — mounts useTerminalActivity alongside existing focus wiring
│       └── GsdCommandToolbar.tsx  # NEW
│       └── CommandPalette.tsx     # NEW
├── shell/
│   └── DrawerRail.tsx            # EXTENDED — position: relative, mounts GsdCommandToolbar
└── locales/{pt-BR,en}/
    ├── board.json                 # EXTENDED — board.actions.*
    ├── terminal.json              # EXTENDED — terminal.activity.*, terminal.toolbar.*
    └── commands.json              # NEW namespace
```

### Pattern 1: Pure status→action mapping (ACT-01)

**What:** A single exported map/function translating `DiskStatus` to `{ labelKey, command, icon }`, mirroring the existing exhaustiveness-checked pattern in `status.ts`'s `toBoardBadge`.
**When to use:** Both `PhaseCard` and `DetailPanel` — never duplicate the switch statement (this is exactly why `03-UI-SPEC.md`'s Component Inventory calls for a single `PhaseCardAction` component consuming this map).
**Example:**
```typescript
// src/planning/actions.ts — mirrors status.ts's deriveDiskStatus/toBoardBadge shape
import type { DiskStatus } from "./status";

export interface PhaseAction {
  labelKey: string;      // i18n key, e.g. "board.actions.execute"
  command: (phaseId: string) => string; // e.g. (id) => `/gsd-execute-phase ${id}`
  icon: "MessageSquare" | "ClipboardList" | "Play" | "FastForward" | "CheckCircle2";
}

export function deriveePhaseAction(status: DiskStatus): PhaseAction | null {
  switch (status) {
    case "no_directory":
    case "empty":
      return { labelKey: "board.actions.discuss", command: (id) => `/gsd-discuss-phase ${id}`, icon: "MessageSquare" };
    case "discussed":
    case "researched":
      return { labelKey: "board.actions.plan", command: (id) => `/gsd-plan-phase ${id}`, icon: "ClipboardList" };
    case "planned":
      return { labelKey: "board.actions.execute", command: (id) => `/gsd-execute-phase ${id}`, icon: "Play" };
    case "partial":
      return { labelKey: "board.actions.continue", command: (id) => `/gsd-execute-phase ${id}`, icon: "FastForward" };
    case "executed":
      return { labelKey: "board.actions.verify", command: (id) => `/gsd-verify-work ${id}`, icon: "CheckCircle2" };
    case "complete":
      return null;
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}
```
Security note (see `## Security Domain`): validate `phaseId` against `/^\d{2,}(\.\d+)?$/` before interpolating into `command()` — never trust a directory-derived string verbatim in a string that gets written to a live shell/PTY.

### Pattern 2: Dual-consumer byte routing in `channel.ts` (ACT-03, load-bearing)

**What:** Extend `channel.ts`'s single `bytesHandlers` map with a second, independent map that is populated once (at `spawnSession` time, or lazily on first `setActivityHandler` call) and is **never** overwritten by `loseFocus`/`gainFocus`'s focus-redirection logic. Both maps are consulted on every `onEvent.onmessage`.
**When to use:** Any consumer that needs to observe a session's bytes regardless of whether that session currently has a mounted `xterm.js` instance — which is exactly this phase's requirement (activity must be known for background live sessions too, per `03-UI-SPEC.md`'s "Supersedes note").
**Why it's necessary:** `focus-algorithm.ts`'s `redirectToTerminal`/`redirectToBackground` are designed around **one** sink per session (Phase 2's whole point — bytes go either to the visible terminal or to an in-memory buffer, never split). Piggybacking activity classification onto that single slot would mean a session loses its activity signal the instant it loses focus — the opposite of what's needed.
**Example:**
```typescript
// src/pty/channel.ts — additive, does not change existing bytesHandlers behavior
const activityHandlers = new Map<string, (data: Uint8Array) => void>();

export function setActivityHandler(
  sessionId: string,
  onBytes: (data: Uint8Array) => void,
): void {
  activityHandlers.set(sessionId, onBytes);
}

export function clearActivityHandler(sessionId: string): void {
  activityHandlers.delete(sessionId);
}

// Inside spawnSession's onEvent.onmessage, ADD (don't replace) the second dispatch:
onEvent.onmessage = (message) => {
  const bytes = toBytes(message);
  bytesHandlers.get(sessionId)?.(bytes);
  activityHandlers.get(sessionId)?.(bytes);   // NEW — always fires, focus-independent
};

// killSession's cleanup must also delete from the new map (mirrors the
// existing bytesHandlers.delete(sessionId) in the `finally` block) to avoid
// the same leak class documented for bytesHandlers (T-02-02).
```

### Pattern 3: Terminal-state classification as a pure, rolling-buffer function (ACT-03)

**What:** `classifyActivity` never looks at a single chunk in isolation — ANSI escape sequences and multi-line permission prompts ("Do you want to proceed?\n❯ 1. Yes") can legitimately arrive split across multiple PTY writes/`onmessage` calls. Maintain a small rolling window of *decoded, ANSI-stripped* text (cap ~2000 chars — bounded so a runaway output burst can't grow memory unboundedly) and classify against that window, not the raw incoming chunk.
**When to use:** Every byte received via `setActivityHandler`'s callback.
**Example:**
```typescript
// src/pty/activity.ts — pure, unit-testable without any PTY/xterm/Tauri mock
import stripAnsi from "strip-ansi";

export type TerminalActivity = "idle" | "busy" | "awaiting";

// Claude's Discretion per 03-CONTEXT.md — tune against real CLI output during
// verification. Named constants so tuning never touches call sites.
const BUSY_MARKER = /esc to interrupt/i;
const AWAITING_MARKER = /do you want to proceed\?/i;
const ROLLING_BUFFER_CAP = 2000;
const QUIESCENCE_MS = 500;

export function appendToRollingBuffer(buffer: string, chunk: string): string {
  const next = buffer + chunk;
  return next.length > ROLLING_BUFFER_CAP ? next.slice(-ROLLING_BUFFER_CAP) : next;
}

/** Pure — no timers, no I/O. Quiescence (busy→idle after silence) is the
 *  caller's responsibility (a setTimeout reset on every byte, see
 *  useTerminalActivity), since "no new bytes for 500ms" cannot be observed
 *  from a single decoded string. */
export function classifyActivity(rollingBufferText: string): "busy" | "awaiting" | null {
  const clean = stripAnsi(rollingBufferText);
  if (AWAITING_MARKER.test(clean)) return "awaiting";
  if (BUSY_MARKER.test(clean)) return "busy";
  return null; // caller falls back to "idle" once the quiescence timer fires
}

export { QUIESCENCE_MS };
```
```typescript
// src/components/terminal/useTerminalActivity.ts — the timer/decoder shell around the pure function
import { classifyActivity, appendToRollingBuffer, QUIESCENCE_MS, type TerminalActivity } from "../../pty/activity";
import { setActivityHandler, clearActivityHandler } from "../../pty/channel";

export function wireTerminalActivity(
  sessionId: string,
  onChange: (activity: TerminalActivity) => void,
): () => void {
  const decoder = new TextDecoder(); // ONE persistent instance per session — see Pitfall 2
  let buffer = "";
  let current: TerminalActivity = "idle";
  let quiescenceTimer: ReturnType<typeof setTimeout> | null = null;

  function transition(next: TerminalActivity) {
    if (next === current) return; // gate — only re-render/set() on real transitions
    current = next;
    onChange(next);
  }

  setActivityHandler(sessionId, (bytes) => {
    const text = decoder.decode(bytes, { stream: true });
    buffer = appendToRollingBuffer(buffer, text);

    const classified = classifyActivity(buffer);
    if (classified) {
      transition(classified);
    } else {
      // Any new byte, once no longer matching busy/awaiting markers, still
      // means "activity just happened" — flip to busy immediately per
      // 03-CONTEXT.md ("flip imediato para ocupado ao primeiro byte"),
      // then let quiescence decide idle.
      transition("busy");
    }

    if (quiescenceTimer) clearTimeout(quiescenceTimer);
    quiescenceTimer = setTimeout(() => transition("idle"), QUIESCENCE_MS);
  });

  return () => {
    if (quiescenceTimer) clearTimeout(quiescenceTimer);
    clearActivityHandler(sessionId);
  };
}
```

### Anti-Patterns to Avoid

- **Classifying raw chunks in isolation:** A regex match against only the latest `onmessage` payload will miss markers split across PTY writes (a redraw frame, a spinner tick, a two-line permission prompt). Always classify against the rolling buffer.
- **Piggybacking on `bytesHandlers` for activity:** Silently breaks activity detection for every session that isn't currently focused — defeats the UI-SPEC's explicit requirement that background live sessions also show a correct dot.
- **Calling zustand `set()` on every byte:** Reintroduces the exact per-byte re-render cost Phase 2's `liveSessions`-outside-immer design was built to avoid (`session-store.ts:30-42`). Gate `set()` behind state-transition detection (Pattern 3 above).
- **Reading `.jsonl` session files for activity signal:** Explicitly walled off by T-02-06 and reaffirmed by `03-CONTEXT.md`'s Deferred Ideas — not a viable data source for this phase under any circumstance.
- **Trusting `phase.id`/`phase.name` unsanitized inside an injected command string:** see `## Security Domain`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ANSI escape sequence stripping | A first-pass regex for CSI/OSC/DCS sequences | `strip-ansi` (npm, see `## Standard Stack`) | ANSI parsing has real edge cases (8-bit vs. 7-bit escapes, multi-parameter CSI sequences); this classifier gates a security-relevant guard (never inject while busy), so correctness here matters more than usual |
| Multi-byte UTF-8 chunk boundaries | Ad-hoc byte-buffering/lookahead logic | A single persistent `TextDecoder` instance per session, called with `{ stream: true }` on every chunk | This is exactly what the Web platform's streaming-decode contract exists for (`developer.mozilla.org/.../TextDecoder/decode`) — reimplementing UTF-8 continuation-byte detection by hand is a well-known source of mojibake bugs |

**Key insight:** This phase is unusual in that the *obvious* "don't hand-roll" answer for the hardest problem (classifying a full PTY session's state — ready/blocked/stalled/exited) does NOT have a usable off-the-shelf library: the closest prior art (`pty-manager` on npm, see `## Sources`) is architecturally incompatible because it assumes it owns the `node-pty` process itself (Node-only native module), whereas this app's classifier only ever receives already-decoded bytes handed to it by a Tauri `Channel` in the browser-side renderer. The correct response is not "avoid hand-rolling the whole thing" but "hand-roll only the small pure classification function, using off-the-shelf pieces (`strip-ansi`, `TextDecoder`) for the parts that already have a correct, standard solution."

## Common Pitfalls

### Pitfall 1: Classifying only the focused session's bytes
**What goes wrong:** Sidebar activity dots for background sessions freeze on whatever state they were in when they lost focus, or never update at all.
**Why it happens:** Wiring the classifier through the same `setSessionBytesHandler` call that `focus-algorithm.ts` already uses for terminal-vs-buffer routing — that call is single-consumer by design.
**How to avoid:** Use the independent `activityHandlers` map (Pattern 2) that is populated once and never touched by focus transitions.
**Warning signs:** A live session's dot in `SessionRow` only ever updates while its terminal is the one mounted in the drawer.

### Pitfall 2: Recreating `TextDecoder` per chunk
**What goes wrong:** A multi-byte UTF-8 character (e.g., an emoji or accented pt-BR character in Claude's output) split across two PTY chunks decodes as `�` (replacement character) instead of the correct glyph, which can also corrupt a marker regex match if the split lands inside an ANSI sequence's parameter bytes.
**Why it happens:** `new TextDecoder().decode(chunk)` (no `stream: true`, or a fresh decoder instance per call) discards the "unfinished" trailing bytes instead of carrying them forward.
**How to avoid:** One `TextDecoder` instance per session, reused across every `decode(bytes, { stream: true })` call (Pattern 3's `wireTerminalActivity`).
**Warning signs:** Occasional `�` characters appearing only in the activity classifier's view of the stream (the xterm.js terminal itself won't show this, since `terminal.write()` accepts raw `Uint8Array` and does its own internal UTF-8 handling — this bug is specific to any new text-decoding consumer).

### Pitfall 3: Not surfacing `writeSession` rejection
**What goes wrong:** User clicks a card action targeting a session whose PTY process has already died (killed out-of-band, or the tab was left open across an OS sleep/wake); the click silently no-ops.
**Why it happens:** `write_session` (Rust, `pty.rs:201-219`) returns `Err(PtyError::NotFound)` when `sessions.get_mut(&session_id)` fails — this **is** already a typed, catchable rejection (confirmed by reading `pty.rs` directly), but an un-awaited/un-caught `writeSession(...)` call swallows it.
**How to avoid:** `03-UI-SPEC.md`'s backstop error case ("If `writeSession` rejects... shows `board.actions.error.injectFailed`") is not speculative — it maps directly onto a real, already-implemented Rust error path. `.catch()` every `writeSession` call from an action handler and normalize with the existing `toSessionError`-style pattern (`session-store.ts:108-116`).
**Warning signs:** No automated test exercises "kill the session process out-of-band, then click a card action" — this is the UI-SPEC's own flagged backstop test; do not skip it in the plan's verification loop.

### Pitfall 4: Treating `500ms` as a global constant instead of per-session state
**What goes wrong:** A single shared quiescence timer for all sessions means one session's burst of output resets or fires the wrong session's idle transition.
**Why it happens:** Copy-pasting a naive "one setTimeout" implementation without per-session scoping.
**How to avoid:** Each `wireTerminalActivity(sessionId, ...)` call owns its own closure-scoped `quiescenceTimer`/`buffer`/`decoder` (as shown in Pattern 3) — never a module-level shared timer.
**Warning signs:** Sessions' activity dots flip in lockstep instead of independently.

## Runtime State Inventory

Not applicable — this phase is additive/greenfield (new components, new store fields, extended byte-routing), not a rename/refactor/migration. No existing stored data, live service config, OS-registered state, secrets, or build artifacts reference anything being renamed or moved in this phase.

## Code Examples

### Gating a live-session-with-`claude` check (ACT-02's "gate de disponibilidade")

```typescript
// No new state needed — a "live" SessionDescriptor was, by construction,
// spawned via `spawnSession` which always runs `claude` in the PTY
// (src-tauri/src/pty.rs). Combine with the existing global `claude`-on-PATH
// check (src/dependencies/check.ts) already used by SessionSidebar.tsx:83-84.
import { useSessionStore } from "../stores/session-store";

function useInjectionTarget(): { sessionId: string | null; enabled: boolean } {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const target = sessions.find((s) => s.id === activeSessionId && s.origin === "live");
  // Combine with the toolMissing==="none"/"claude-missing" check already
  // computed in SessionSidebar for the full ACT-02 gate.
  return { sessionId: target?.id ?? null, enabled: Boolean(target) };
}
```

### Cmd/Ctrl+K interception (ACT-04), extending the existing Ctrl+F pattern

```typescript
// Same shape as TerminalView.tsx:229-237's attachCustomKeyEventHandler for
// Ctrl+F, but at the DrawerRail/document level (the palette can open even
// when the xterm surface itself doesn't have DOM focus, e.g. user is
// looking at the board). A window-level listener (not xterm's
// attachCustomKeyEventHandler, which only fires when xterm has focus) is
// required here — 03-UI-SPEC.md explicitly says the trigger works even from
// outside the terminal surface ("Comandos" button OR the shortcut).
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — this is this project's first pass at terminal-state classification | Pure-function classifier over a rolling, ANSI-stripped text buffer, fed by a dedicated always-on byte consumer | This phase | Establishes the pattern any future terminal-state feature (e.g. TERM-04's "notify on session needing input", Phase 4) should reuse rather than re-deriving |

**Deprecated/outdated:** Not applicable — no prior implementation exists in this codebase to deprecate.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The exact Claude CLI output markers ("esc to interrupt", "Do you want to proceed?", "❯ 1. Yes") are stable enough across Claude CLI versions/terminal widths to regex-match reliably | `## Architecture Patterns` Pattern 3, carried verbatim from `03-CONTEXT.md` | If the CLI changes its footer text or spinner rendering, the busy/awaiting classification silently stops working — commands could be sent while Claude is actually busy (the exact failure ACT-03 exists to prevent). `03-CONTEXT.md` and `03-UI-SPEC.md` both already flag this as requiring empirical verification against a real burst — do not skip that verification step in the plan |
| A2 | ~500ms quiescence and "immediate flip to busy" are the right thresholds for Claude CLI's actual output cadence | `## Architecture Patterns` Pattern 3 | Too short → flickers busy/idle on normal redraw cadence (spinner ticks, streaming tokens); too long → guard blocks injection longer than necessary after Claude actually finishes. Named constant (`QUIESCENCE_MS`) makes this a one-line tuning fix, not a rewrite |
| A3 | `strip-ansi`'s automated-tool `SUS` verdict reflects a data-availability gap in this sandbox rather than a real legitimacy problem | `## Package Legitimacy Audit` | If actually compromised/typosquatted (it is not — `chalk/strip-ansi` is a well-known, long-standing package), installing it unverified would pull untrusted code into the renderer bundle. Mitigated by the required `checkpoint:human-verify` gate before install |

## Open Questions (RESOLVED)

1. **Should the awaiting-permission prefill also handle multi-option prompts beyond "Yes/No" (e.g., Claude's 3-option confirm dialogs)?**
   - What we know: `03-CONTEXT.md`/`03-UI-SPEC.md` only specify prefill-don't-send behavior; they don't specify inspecting *which* options are on screen.
   - What's unclear: Whether the classifier needs to distinguish "awaiting permission" sub-variants, or whether one `awaiting` state covering all confirm-style prompts is sufficient for MVP.
   - RESOLVED — Recommendation: Treat as out of scope for this phase — one `awaiting` state is what both locked documents specify. Revisit only if verification reveals real prompt variants that need different guard copy.

2. **Does a completed/exited `claude` process (session ended, e.g. user typed `/exit`) need its own activity state, or does it fall back to the existing `exited` `SessionRowVariant`?**
   - What we know: `SessionRowVariant` already has an `exited` slot (Phase 2), independent from the new `idle`/`busy`/`awaiting` activity states this phase adds.
   - What's unclear: Whether `exited` should suppress/override activity-dot rendering entirely, or coexist.
   - RESOLVED — Recommendation: `exited` wins — `03-UI-SPEC.md`'s "Supersedes note" scopes the new activity-aware dot to `variant === "live"` rows only, so this is already resolved by the UI-SPEC; flagged here only so the plan doesn't re-litigate it.

## Environment Availability

Skipped — this phase has no new external tool/service/runtime dependency beyond what Phases 1-2 already require (Tauri, Node/npm, the already-installed `claude` CLI). `strip-ansi` is a pure-JS npm package, no native/system dependency.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 + `@testing-library/react` 16.3.2 + jsdom 29.1.1 |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `npx vitest run src/pty/activity.test.ts` (or the relevant new test file) |
| Full suite command | `npm test` (→ `vitest run`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| ACT-01 | `deriveePhaseAction(diskStatus)` returns the correct `{labelKey, command, icon}` for all 8 `DiskStatus` values, `null` for `complete` | unit | `npx vitest run src/planning/actions.test.ts` | ❌ Wave 0 |
| ACT-01 | `PhaseCard`/`DetailPanel` render the mapped action button per status, `stopPropagation` doesn't trigger `selectPhase` | component | `npx vitest run src/components/PhaseCard.test.tsx` | ✅ (extend existing file) |
| ACT-02 | Clicking an idle-terminal action calls `writeSession(sessionId, "/gsd-... N\r")` exactly | unit (mocked `../pty/channel`) | `npx vitest run src/components/PhaseCardAction.test.tsx` | ❌ Wave 0 |
| ACT-02 | `writeSession` rejection surfaces `board.actions.error.injectFailed` and the button returns to enabled | component | same file as above | ❌ Wave 0 |
| ACT-03 | `classifyActivity(buffer)` returns `"busy"`/`"awaiting"`/`null` for representative buffer strings (with embedded ANSI codes, split across simulated chunks) | unit | `npx vitest run src/pty/activity.test.ts` | ❌ Wave 0 |
| ACT-03 | `wireTerminalActivity` flips to `busy` on first byte after idle, and to `idle` only after `QUIESCENCE_MS` of silence (fake timers) | unit | `npx vitest run src/components/terminal/useTerminalActivity.test.ts` | ❌ Wave 0 |
| ACT-03 | Busy-terminal action button is disabled with the guard tooltip; awaiting-permission action prefills without `\r` | component | extend `PhaseCardAction.test.tsx` | ❌ Wave 0 |
| ACT-04 | Cmd/Ctrl+K opens the palette; Esc/click-outside closes it; substring filter matches label OR command token | component | `npx vitest run src/components/terminal/CommandPalette.test.tsx` | ❌ Wave 0 |
| ACT-04 | Toolbar/palette rows obey the Injection Behavior Matrix per state (parameterless send-immediately vs. parameterized prefill-only) | component | same file as above | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched-file>.test.ts(x)`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/planning/actions.test.ts` — covers ACT-01's pure mapper
- [ ] `src/pty/activity.test.ts` — covers ACT-03's pure classifier (highest-value test in the phase — this is the one piece of logic with no vendor contract to lean on)
- [ ] `src/components/terminal/useTerminalActivity.test.ts` — covers ACT-03's timer/decoder shell (use `vi.useFakeTimers()` for the 500ms quiescence assertion)
- [ ] `src/components/PhaseCardAction.test.tsx` — covers ACT-02's injection + error-surfacing, shared by PhaseCard/DetailPanel
- [ ] `src/components/terminal/CommandPalette.test.tsx` — covers ACT-04's palette open/close/filter/guard behavior
- No framework install needed — Vitest/jsdom/Testing Library are already configured and used by 10+ existing test files in this repo.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | no | Single-user local desktop app, no auth surface touched by this phase |
| V3 Session Management | no | "Session" here means PTY/Claude session, not an auth session — out of ASVS V3's scope |
| V4 Access Control | no | No multi-user/permission boundary introduced |
| V5 Input Validation | yes | Validate `phase.id` against a strict numeric-ish pattern (`/^\d{2,}(\.\d+)?$/`) before interpolating it into any string passed to `writeSession` — see threat pattern below. The palette's search-filter input is read-only local filtering (never sent to the PTY), so it does not need the same treatment |
| V6 Cryptography | no | Not touched by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Malicious/corrupted phase-directory name flows into an injected PTY command string (e.g. a cloned repo with a crafted `.planning/03-something\nrm -rf ~/-name` directory ends up as `phase.id`, then gets written verbatim into `/gsd-execute-phase <id>\r` and executed by the shell/CLI sitting behind the PTY) | Tampering | Validate `phase.id` against a strict allow-list pattern before it's ever interpolated into a command string; reject/fall back to "no action available" rather than best-effort-sanitizing. This extends the same defensive posture Phase 1/2 already apply elsewhere to disk-derived strings (e.g. `dunce::canonicalize`, `T-01-05`'s size-check-before-read) — disk content is not fully trusted input even in a single-user local app, because the `.planning/` directory can originate from a cloned/shared repository |
| Un-awaited `writeSession` promise rejection silently drops a user-initiated action | Denial of Service (soft — UX-level, not security-critical) | Always `.catch()`/await `writeSession` calls from action handlers and surface `board.actions.error.injectFailed` per `03-UI-SPEC.md`'s backstop — see `## Common Pitfalls` Pitfall 3 |
| Command palette's Cmd/Ctrl+K global-ish listener intercepts the shortcut even when an unrelated input has focus elsewhere in the app | (not a STRIDE security issue, but a correctness/accessibility concern flagged here since it shares the interception mechanism) | Scope the `window`-level keydown listener's effect to only be mounted while `DrawerRail`'s expanded `<aside>` is rendered (i.e., `activeSessionId` is set), matching `03-UI-SPEC.md`'s own scoping ("only when a session is active") |

## Sources

### Primary (HIGH confidence)
- Direct source reads of this repository: `src/pty/channel.ts`, `src/components/terminal/focus-algorithm.ts`, `src/components/terminal/TerminalView.tsx`, `src/stores/session-store.ts`, `src/planning/status.ts`, `src/planning/model.ts`, `src/components/PhaseCard.tsx`, `src/components/DetailPanel.tsx`, `src/shell/DrawerRail.tsx`, `src/components/session/{SessionRow,ConfirmDialog,SessionSidebar}.tsx`, `src/dependencies/check.ts`, `src/styles/theme.css`, `src-tauri/src/pty.rs`, `src/i18n.ts`, `package.json`, `vitest.config.ts` — all read directly this session, dated 2026-07-23
- Filesystem inspection of `.claude/commands/*.md` confirming the installed gsd-core command surface: `gsd-discuss-phase`, `gsd-plan-phase`, `gsd-execute-phase`, `gsd-verify-work`, `gsd-quick`, `gsd-next`, `gsd-progress`, `gsd-stats`, `gsd-help` all exist; **`gsd-status` does NOT exist** — resolves `03-UI-SPEC.md`'s explicitly flagged unresolved item (`commands.list.status.command` should be `/gsd-stats`, not `/gsd-status`)
- `npm view strip-ansi` / `npm view ansi-regex` (registry.npmjs.org, run this session) — versions and dependency graph confirmed directly

### Secondary (MEDIUM confidence)
- WebSearch, `TextDecoder.decode()` `stream` option behavior — cross-checked against `javascript.info/text-decoder` and MDN's own page title/URL appearing in results (`developer.mozilla.org/en-US/docs/Web/API/TextDecoder/decode`); direct MDN fetch was blocked by this sandbox's outbound proxy, so treated as CITED-via-search rather than a direct fetch
- `pty-manager` npm package documentation (fetched via WebFetch on its GitHub repo) — confirms the normalize-then-classify architectural pattern (strip ANSI/spinner/duration noise, rolling-buffer content hash, stall-timeout with backoff) independently converges on this research's Pattern 3 design, even though the package itself is not usable here (Node/`node-pty`-only)

### Tertiary (LOW confidence)
- The exact Claude CLI output markers ("esc to interrupt", "Do you want to proceed?", "❯ 1. Yes") — carried verbatim from `03-CONTEXT.md`'s own locked decision, itself acknowledged there as needing empirical verification; no official Anthropic documentation of the CLI's PTY output format was found (WebSearch on this topic surfaced only GitHub issues about Esc-key interrupt *reliability*, not the output format/marker text itself)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new core dependency; the one supporting library (`strip-ansi`) is directly version-verified against the registry
- Architecture: HIGH for the dual-consumer byte-routing pattern (derived directly from reading the existing single-consumer implementation and its stated design constraints) — MEDIUM for the exact rolling-buffer cap size (2000 chars is a reasoned default, not empirically tuned)
- Pitfalls: HIGH for Pitfalls 1-2-4 (derived from direct code reading) — MEDIUM for Pitfall 3 (the Rust error path is confirmed real, but no existing test in this repo exercises it yet)
- Terminal-state marker regexes themselves: LOW — this is the one area where `03-CONTEXT.md` itself, `03-UI-SPEC.md`, and this research all independently agree empirical verification against a real Claude CLI burst is required before shipping

**Research date:** 2026-07-23
**Valid until:** 30 days for the architecture/wiring findings (stable, codebase-internal); re-verify the marker-regex assumptions (A1) against any Claude CLI version bump sooner than that, since that's the one part of this research with no stable published contract underneath it
