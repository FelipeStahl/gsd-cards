# Phase 5: Comunidade - Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 20
**Analogs found:** 17 / 20 (3 are net-new mechanisms with no in-repo analog — release.yml, updater plugin config block, update-store.ts)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/shell/LanguageSwitcher.tsx` | component | request-response (click → sync state change) | `src/shell/ProjectSwitcherButton.tsx` + `src/components/SyncIndicator.tsx` | exact (button chrome from former, dot/label row + tone-driven rendering pattern from latter) |
| `src/updates/UpdateIndicator.tsx` | component | event-driven (subscribes to shared update state) | `src/components/SyncIndicator.tsx` | exact (identical dot+label+inline-action recipe, identical `null`-on-idle-state discipline) |
| `src/updates/update-store.ts` | store | event-driven / pub-sub | `src/stores/ui-store.ts` (closest zustand slice in repo — not read line-by-line here, same role) | role-match (no existing "wraps a plugin async op into shared state" store; closest by role is any zustand store) |
| `src/persistence/app-store.ts` (+`LANGUAGE_KEY`) | service (persistence) | CRUD | same file, `upsertRecent`/`getRecents` (lines 73-86) | exact — additive to existing file, same template |
| `src/i18n.ts` (+`update` namespace) | config | transform (static resource merge) | same file, `resources`/`ns` array (lines 30-64) | exact — additive |
| `src/shell/AppShell.tsx` (+boot effect ×2) | component (mount hook) | request-response / event-driven | same file, `HomeScreen` early-return + handlers (lines 20-55); mount-effect pattern from `src/components/home/HomeScreen.tsx` lines 65-73 | exact |
| `src/shell/Header.tsx` (+2 mounts) | component | request-response | same file, `<SyncIndicator />` mount (line 139) + `<ProjectSwitcherButton />` mount (line 66) | exact |
| `src/components/home/HomeScreen.tsx` (+2 mounts) | component | request-response | same file, header CTA row (lines 101-127) | exact |
| `src/locales/pt-BR/common.json`, `en/common.json` | config | transform | existing `common.json` (structure only, not re-read — see `src/i18n.ts` import list) | exact |
| `src/locales/{pt-BR,en}/update.json` | config | transform | `src/locales/{pt-BR,en}/home.json` (namespace-per-file precedent, Phase 4) | exact (structural precedent, not content) |
| `src/locales/parity.test.ts` | test | transform (pure data-shape diff) | none in-repo (new mechanism) — closest analog by role is any vitest unit test file (e.g. `src/persistence/app-store.test.ts`) for file conventions only | no analog for logic; role-match for test file conventions |
| `src/updates/check-update.ts` | service (plugin wrapper) | request-response | `src/notifications/notify.ts` (entire file) | exact |
| `src-tauri/Cargo.toml` (+2 deps) | config | — | same file, existing `tauri-plugin-store`/`tauri-plugin-notification` lines | exact |
| `src-tauri/src/lib.rs` (+2 `.plugin(...)`) | config (plugin registration) | — | same file, `.plugin(tauri_plugin_store::Builder::new().build())` / `.plugin(tauri_plugin_notification::init())` (lines 31-35) | exact |
| `src-tauri/capabilities/default.json` (+3 perms) | config | — | same file, `store:allow-*`/`notification:allow-*` blocks (lines 16-23) | exact |
| `src-tauri/tauri.conf.json` (`bundle` + `plugins.updater`) | config | — | same file, current minimal `bundle` block (lines 28-31) | exact structure, net-new content (icons/updater block have no existing precedent in this file) |
| `.github/workflows/release.yml` | config (CI) | batch | `.github/workflows/ci.yml` (entire file) | role-match (matrix/setup steps reusable; `tauri-action` step and release triggers are net-new) |
| `src/shell/LanguageSwitcher.test.tsx` | test | — | `src/shell/ProjectSwitcherButton.test.tsx` (component test conventions) | exact (not re-read; same directory/naming convention) |
| `src/updates/check-update.test.ts` | test | — | `src/notifications/notify.test.ts` (entire file, mock+dynamic-import pattern) | exact |
| `src/persistence/app-store.test.ts` (+language cases) | test | — | same file, `FakeLazyStore` (lines 10-36) | exact — additive |

## Pattern Assignments

### `src/shell/LanguageSwitcher.tsx` (component, request-response)

**Analogs:** `src/shell/ProjectSwitcherButton.tsx` (button chrome/hover) + `src/components/SyncIndicator.tsx` (row layout, i18n-driven re-render)

**Imports pattern** (`ProjectSwitcherButton.tsx` lines 8-12):
```tsx
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useBoardStore } from "../stores/board-store";
```
For `LanguageSwitcher`, swap the store import for the new persistence functions:
```tsx
import { useTranslation } from "react-i18next";
import { setLanguage } from "../persistence/app-store";
```

**Core toggle/segment pattern** — button-per-state chrome from `ProjectSwitcherButton.tsx` (lines 21-46), inline-style-object convention, `aria-label`/`title` from `t(...)`:
```tsx
<button
  type="button"
  title={label}
  aria-label={label}
  onClick={() => setView("home")}
  style={{
    width: 32,
    height: 32,
    ...
    color: hovered ? "var(--color-accent)" : "var(--color-foreground)",
    cursor: "pointer",
  }}
>
```
UI-SPEC requires a segmented pill (two `<button>`s in a `role="group"` container, `aria-pressed`) rather than a single icon button — adapt the button-chrome convention (inline style object, hover state via `useState`) to two segments per `05-UI-SPEC.md` `## Language Switcher` exact pixel/color spec (active: `var(--color-accent)` fill + white text; inactive: 0.7 opacity, no bg).

**i18n re-render + language-driven derivation pattern** (`SyncIndicator.tsx` lines 31-53):
```tsx
const { t, i18n } = useTranslation("sync");
...
const locale = DATE_FNS_LOCALE[i18n.language] ?? enUS;
```
`LanguageSwitcher` reads `i18n.language` the same way to derive the active segment, and calls `i18n.changeLanguage(next)` + fire-and-forget `setLanguage(next)` on click (RESEARCH.md Pattern 1 gives the exact handler shape — no `await`, matches `notify.ts`'s "never blocks the UI" discipline).

**Row/gap convention** (`SyncIndicator.tsx` lines 59-62):
```tsx
<div
  data-slot="sync-indicator"
  style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}
>
```
Use `data-slot="language-switcher"` for the container; per UI-SPEC the container itself uses `display: inline-flex`, `padding: 4px`, `borderRadius: 999`, `border: 1px solid var(--color-secondary)`, `gap: 4px` (xs) between segments — not the `sm` gap `SyncIndicator` uses for its own row (that gap is for THIS component's mount point spacing in `Header`/`HomeScreen`, not the segment gap inside it).

**Mount points** — copy the exact mount pattern:
- `Header.tsx` line 139: `<SyncIndicator />` → add `<LanguageSwitcher />` immediately before/after it in the same flex row (after `SyncIndicator` per UI-SPEC ordering, i.e. `SyncIndicator` then `LanguageSwitcher` then `UpdateIndicator`, or per UI-SPEC "rightmost, after SyncIndicator").
- `HomeScreen.tsx` lines 123-126 (the CTA group `<div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>`) — add `<LanguageSwitcher />` (and `<UpdateIndicator />`) into that same right-aligned row, per UI-SPEC "rightmost of the existing CTA group, after 'Novo projeto GSD'".

---

### `src/updates/UpdateIndicator.tsx` (component, event-driven)

**Analog:** `src/components/SyncIndicator.tsx` (entire file, 100 lines) — UI-SPEC explicitly names this as the recipe to reuse.

**Null-on-idle-state pattern** (lines 47-50):
```tsx
if (!project || sync.state === "idle") {
  return null;
}
```
`UpdateIndicator` mirrors this exactly for its `checking`/`up-to-date` states (UI-SPEC `## Update Affordance` states table): both render `null`, same early-return-before-JSX discipline.

**Tone-branch + dot + label + inline action pattern** (lines 52-85, the `degraded` branch):
```tsx
return (
  <div data-slot="sync-indicator" style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
    <span className={statusDotVariants({ tone: "warning" })} aria-hidden="true" />
    <span title={t("stale.body")} style={LABEL_STYLE}>
      {t("stale.label", { time })}
    </span>
    <button
      type="button"
      onClick={() => void reconnectWatcher()}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        color: "var(--color-accent)",
        fontSize: "var(--font-size-label)",
        lineHeight: "var(--line-height-label)",
        fontWeight: "var(--font-weight-label)",
      }}
    >
      {t("actions.reconnect")}
    </button>
  </div>
);
```
This is the **exact** shape for `UpdateIndicator`'s `available`/`error` states: dot (`statusDotVariants({tone:"accent"})` or `{tone:"warning"}`) + `LABEL_STYLE`-equivalent label + inline text-button action (`update.available.action` / `update.error.action`). The `downloading` state adds `.status-dot--pulse` (existing CSS modifier, Phase 3) to the dot span and removes the action button (UI-SPEC: "action button is removed, not disabled").

**`LABEL_STYLE` constant** (lines 22-29) — reuse verbatim (module-level `CSSProperties` const), since `update.json` labels use the same Label typography/opacity convention.

**Module-level locale map convention** (lines 17-20) is NOT needed for `UpdateIndicator` (no date-fns usage) — omit.

**State source:** unlike `SyncIndicator` (reads `useBoardStore`), `UpdateIndicator` reads the new `update-store.ts` slice (`checking | up-to-date | available | downloading | error` + `percent`/`version`) — both `Header` and `HomeScreen` mounts subscribe to the same store so they never disagree (UI-SPEC `## Update Affordance` mount points note).

---

### `src/persistence/app-store.ts` (+`LANGUAGE_KEY`) (service, CRUD)

**Analog:** same file, `upsertRecent`/`getRecents` (lines 65-86).

**Exact template to copy** (lines 65-86, minus the array/filter logic since language is a scalar not a list):
```ts
const RECENTS_KEY = "recentProjects";

export async function upsertRecent(entry: RecentProjectEntry): Promise<void> {
  return withStoreLock(async () => {
    const recents = (await appStore.get<RecentProjectEntry[]>(RECENTS_KEY)) ?? [];
    const next = [entry, ...recents.filter((recent) => recent.root !== entry.root)];
    await appStore.set(RECENTS_KEY, next);
    await appStore.save();
  });
}

export async function getRecents(): Promise<RecentProjectEntry[]> {
  return (await appStore.get<RecentProjectEntry[]>(RECENTS_KEY)) ?? [];
}
```
New code (per RESEARCH.md Pattern 2, already concretely drafted there):
```ts
const LANGUAGE_KEY = "language";
type SupportedLanguage = "pt-BR" | "en";
const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ["pt-BR", "en"];

export async function setLanguage(lng: SupportedLanguage): Promise<void> {
  return withStoreLock(async () => {
    await appStore.set(LANGUAGE_KEY, lng);
    await appStore.save();
  });
}

export async function getLanguage(): Promise<SupportedLanguage | null> {
  const raw = await appStore.get<string>(LANGUAGE_KEY);
  return SUPPORTED_LANGUAGES.includes(raw as SupportedLanguage) ? (raw as SupportedLanguage) : null;
}
```
Note `setLanguage` uses `withStoreLock` (module-level `let writeQueue` at line 40) exactly like every other writer in the file — never a bespoke lock. `getLanguage` deliberately does NOT go through `withStoreLock` (reads don't need serialization), matching `getRecents`'s read-only pattern (line 84-86).

---

### `src/shell/AppShell.tsx` (+boot effect) (component, mount hook)

**Analog:** `src/components/home/HomeScreen.tsx` mount effect (lines 65-73) for the effect *shape*; `AppShell.tsx` itself (lines 20-55) for where or how to slot new logic before the `view === "home"` early return.

**Mount-effect pattern to copy** (`HomeScreen.tsx` lines 65-73):
```tsx
useEffect(() => {
  let cancelled = false;
  void getRecents().then((loaded) => {
    if (!cancelled) setRecents(loaded);
  });
  return () => {
    cancelled = true;
  };
}, []);
```
This exact cancelled-flag + fire-and-forget `.then()` shape is the template for both the language-restore effect and the `checkForUpdate()` call in `AppShell`. **Critical placement note** (confirmed by direct read of `AppShell.tsx` lines 20-55): both new effects MUST run as hooks before the `if (view === "home") return <HomeScreen ... />` early return (line 50) so they fire regardless of `view` — React rules of hooks require this anyway, and it matches UI-SPEC's explicit note ("the check itself runs once at AppShell mount ... since AppShell's hooks run before its view === 'home' early return").

**Exact new-effect code** (from RESEARCH.md Pattern 2, verified consistent with the `HomeScreen` template above):
```tsx
useEffect(() => {
  let cancelled = false;
  void getLanguage().then((saved) => {
    if (cancelled) return;
    if (saved) {
      if (saved !== i18n.language) void i18n.changeLanguage(saved);
      return;
    }
    if (navigator.language.toLowerCase().startsWith("en")) {
      void i18n.changeLanguage("en");
    }
  });
  return () => { cancelled = true; };
}, []);
```

---

### `src/shell/Header.tsx` / `src/components/home/HomeScreen.tsx` (mount edits)

**Analog:** existing mount lines — `Header.tsx` line 139 `<SyncIndicator />`; `HomeScreen.tsx` lines 123-126 CTA group.

`Header.tsx` — add import + JSX after `<SyncIndicator />`:
```tsx
import { SyncIndicator } from "../components/SyncIndicator";
...
<SyncIndicator />
<LanguageSwitcher />
<UpdateIndicator />
```

`HomeScreen.tsx` — add into the existing right-aligned group (lines 123-126):
```tsx
<div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
  {openFolderButton}
  {newProjectButton}
  <LanguageSwitcher />
  <UpdateIndicator />
</div>
```

---

### `src/updates/check-update.ts` (service, request-response)

**Analog:** `src/notifications/notify.ts` (entire file, 78 lines) — RESEARCH.md Pattern 3 already gives the near-final code.

**Module-cached-promise + never-throws pattern** (`notify.ts` lines 24-46):
```ts
let permissionPromise: Promise<boolean> | null = null;

export function ensurePermission(): Promise<boolean> {
  if (!permissionPromise) {
    permissionPromise = (async () => {
      try {
        const granted = await isPermissionGranted();
        if (granted) return true;
        const permission = await requestPermission();
        return permission === "granted";
      } catch {
        return false;
      }
    })();
  }
  return permissionPromise;
}
```
Exact template for `checkForUpdate()`:
```ts
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";

let pendingCheck: Promise<Update | null> | null = null;

export function checkForUpdate(): Promise<Update | null> {
  if (!pendingCheck) {
    pendingCheck = check().catch(() => null);
  }
  return pendingCheck;
}

export async function installUpdateAndRelaunch(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
```
**Degrade-silently discipline** — same as `notify()` (lines 56-67, `try { ... } catch { /* degrade */ }`): `checkForUpdate()`'s `.catch(() => null)` on the `check()` call IS this discipline, one line instead of a full try/catch because `check()` is the only fallible call.

---

### `src/i18n.ts` (+`update` namespace) (config, transform)

**Analog:** same file, `home` namespace addition precedent (lines 20-21, 40, 51, 60) — this is literally how the last new namespace (Phase 4, `home.json`) was wired in.

**Exact pattern** (lines 4-21 import block + lines 30-53 `resources` + line 60 `ns` array):
```ts
import homePtBR from "./locales/pt-BR/home.json";
import homeEn from "./locales/en/home.json";
...
export const resources = {
  "pt-BR": { ..., home: homePtBR },
  en: { ..., home: homeEn },
} as const;
...
ns: [..., "home"],
```
Add `updatePtBR`/`updateEn` imports and `update:` entries in both language objects, plus `"update"` in the `ns` array (line 60) — additive only, no restructuring.

---

### `src/locales/parity.test.ts` (test, transform)

**No in-repo analog** (net-new mechanism — first automated i18n structural test in the codebase). RESEARCH.md `## Code Examples` already supplies the concrete recursive key-path-diff implementation (verified against Pitfall 5: never compare *values*, only key *paths*). File-location/test-runner convention follows any existing `*.test.ts` (e.g. `src/persistence/app-store.test.ts`'s plain `describe`/`it`/`expect` from `vitest`, no React Testing Library needed since this is pure data).

---

### `src-tauri/src/lib.rs` (+2 `.plugin(...)`) (config, plugin registration)

**Analog:** same file, existing plugin registration block (lines 19-35).

**Exact template to copy** (lines 31-35):
```rust
// Primeira escrita em disco do app (04-01-PLAN.md) — SEMPRE
// appDataDir via este plugin, NUNCA o `.planning/` do usuário
// (invariante de produto, 04-CONTEXT.md `## Phase Boundary`).
.plugin(tauri_plugin_store::Builder::new().build())
// Notificações do SO (TERM-04, plano futuro desta fase) — registrado
// já neste plano-tracer junto com o store para não reabrir o gate de
// legitimidade de pacote duas vezes.
.plugin(tauri_plugin_notification::init())
```
Add, in the same builder chain, after the existing plugins and before `.manage(...)` (line 36):
```rust
.plugin(tauri_plugin_updater::Builder::new().build())
.plugin(tauri_plugin_process::init())
```
Follow the file's own convention of a doc comment above each `.plugin(...)` explaining WHY (see lines 22-30 for the `opener` example — explains exact capability granted and why not broader).

---

### `src-tauri/capabilities/default.json` (+3 permissions) (config)

**Analog:** same file, `store:allow-*` / `notification:allow-*` blocks (lines 16-23), and the file's own header `description` field (line 4) establishing the granular-only rule.

**Exact template** (lines 16-23):
```json
"store:allow-load",
"store:allow-get",
"store:allow-set",
"store:allow-save",
"store:allow-delete",
"notification:allow-is-permission-granted",
"notification:allow-request-permission",
"notification:allow-notify"
```
Add (per RESEARCH.md Pitfall 2 — granular, NOT `updater:default`):
```json
"updater:allow-check",
"updater:allow-download-and-install",
"process:allow-restart"
```
Also extend the file's `description` string (line 4) with a clause about the updater permissions, matching the existing convention of documenting each grant's scope inline (see how the `store`/`notification` grants each got a sentence explaining their boundary).

---

### `src-tauri/Cargo.toml` (+2 deps) (config)

**Analog:** same file, existing plugin dependency lines:
```toml
tauri-plugin-store = "2"
tauri-plugin-notification = "2"
```
Add:
```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```
Same loose `"2"` pin convention as every other `tauri-plugin-*` dependency in the file (`fs`, `dialog`, `opener`, `store`, `notification`).

---

### `src-tauri/tauri.conf.json` (`bundle` + `plugins.updater`) (config)

**Analog:** same file, current minimal `bundle` block (lines 28-31):
```json
"bundle": {
  "active": true,
  "targets": "all"
}
```
**Net-new content** (no existing precedent in this file for `icon`/`plugins`/updater config) — RESEARCH.md Pattern 4 gives the full concrete block already reviewed against Pitfall 3 (placeholder pubkey must be syntactically base64-shaped, not empty/null). Use that block verbatim as the starting point; icons already exist at `src-tauri/icons/` (32x32.png, 128x128.png, 128x128@2x.png, icon.icns, icon.ico — confirmed present per CONTEXT.md "só falta referenciar").

---

### `.github/workflows/release.yml` (config, CI)

**Analog:** `.github/workflows/ci.yml` (entire file, 65 lines) — reuse its matrix/setup/Linux-deps steps structure; the `tauri-action` step itself and the tag-trigger are net-new (no precedent in this repo).

**Directly reusable steps** (`ci.yml` lines 17-52 — checkout, setup-node, Linux system deps, setup Rust, npm ci):
```yaml
- name: Checkout
  uses: actions/checkout@v4

- name: Setup Node
  uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: "npm"

- name: Install Tauri Linux system dependencies
  if: matrix.os == 'ubuntu-latest'
  run: |
    sudo apt-get update
    sudo apt-get install -y \
      libwebkit2gtk-4.1-dev \
      libappindicator3-dev \
      librsvg2-dev \
      patchelf \
      build-essential

- name: Setup Rust
  uses: dtolnay/rust-toolchain@stable
```
Note `ci.yml` uses `matrix.os` with `ubuntu-latest` (no `xdg-utils` in its apt list) — RESEARCH.md's Pattern 5 release.yml draft uses `ubuntu-22.04` + adds `xdg-utils`; reconcile toward `ci.yml`'s existing `ubuntu-latest` + package list unless the extra packages are specifically required by `tauri-action`'s bundler (verify against official `tauri-action` docs, not assumed). Trigger block (`on: push: tags: ['v*']`) and the `tauri-apps/tauri-action@v1` step itself are net-new — use RESEARCH.md `## Architecture Patterns` Pattern 5 verbatim for those parts, since no analog exists in this repo.

---

### Test files

**`src/persistence/app-store.test.ts` (+language cases)** — Analog: same file, `FakeLazyStore` (lines 10-36):
```ts
class FakeLazyStore {
  static instances: FakeLazyStore[] = [];
  path: string;
  data = new Map<string, unknown>();
  saveCalls = 0;
  constructor(path: string) { this.path = path; FakeLazyStore.instances.push(this); }
  async get<T>(key: string): Promise<T | undefined> { return this.data.get(key) as T | undefined; }
  async set(key: string, value: unknown): Promise<void> { this.data.set(key, value); }
  async save(): Promise<void> { this.saveCalls += 1; }
}
vi.mock("@tauri-apps/plugin-store", () => ({ LazyStore: FakeLazyStore }));
```
Add `describe("getLanguage/setLanguage")` cases using the same `FakeLazyStore` instance, asserting `withStoreLock` serialization and the enum-validation discard-on-corrupt-value behavior (Pitfall/anti-pattern from RESEARCH.md — a corrupted stored string must resolve to `null`, not propagate).

**`src/updates/check-update.test.ts`** — Analog: `src/notifications/notify.test.ts` (entire file). Copy the `vi.mock(...)` + `vi.resetModules()` + dynamic `await import("./notify")` pattern (lines 1-23) exactly, substituting `@tauri-apps/plugin-updater`'s `check` and `@tauri-apps/plugin-process`'s `relaunch` for the notification mocks. The module-level promise cache means every test needing a fresh module state MUST call `vi.resetModules()` in `beforeEach` — this is the load-bearing reason `notify.test.ts` does it, and `check-update.test.ts` has the identical requirement (`pendingCheck` is a module-level `let`, same shape as `permissionPromise`).

**`src/shell/AppShell.test.tsx` (+boot effect assertions)** — Analog: same file (lines 1-60 shown) — mock `../persistence/app-store` at module level (lines 20-24 pattern) to add `getLanguage`/`setLanguage` mocks alongside the existing `getRecents`/`upsertRecent`/`removeRecent` mocks; mock `../updates/check-update` similarly. Assert the boot effect calls `i18n.changeLanguage` and `checkForUpdate` on mount, following the same `waitFor(...)` assertion style already imported (line 1) for this file's other async-effect tests.

## Shared Patterns

### Fire-and-forget persistence (never blocks UI)
**Source:** `src/persistence/app-store.ts` `upsertRecent` callers (e.g. any `void upsertRecent(...)` call site) + `notify.ts`'s degrade-silently discipline (lines 56-67)
**Apply to:** `LanguageSwitcher`'s `setLanguage(next)` call, `check-update.ts`'s `check()` call — both use `void` / `.catch(() => null)`, never `await` in a way that blocks rendering or throws into the UI.

### Module-level promise cache for "once per app run" plugin calls
**Source:** `src/notifications/notify.ts` lines 24-46 (`permissionPromise`)
**Apply to:** `src/updates/check-update.ts` (`pendingCheck`) — identical shape, identical test implication (`vi.resetModules()` requirement in tests).

### `withStoreLock` serialized read-modify-write
**Source:** `src/persistence/app-store.ts` lines 40-51 (`writeQueue`/`withStoreLock`)
**Apply to:** `setLanguage` — every write to `appStore` in this codebase goes through this lock, no exceptions.

### Granular capability grants (never catch-all)
**Source:** `src-tauri/capabilities/default.json` line 4 (file header, explicit rule statement) + every existing `allow-*` entry (lines 6-24)
**Apply to:** `updater:allow-check` + `updater:allow-download-and-install` + `process:allow-restart` — explicitly NOT `updater:default` (RESEARCH.md Pitfall 2 is authoritative on this; the planner must not silently accept the CONTEXT.md wording as literal).

### `data-slot` + inline-style-object + CSS custom property convention
**Source:** `src/components/SyncIndicator.tsx` (throughout), `src/shell/ProjectSwitcherButton.tsx` (throughout)
**Apply to:** `LanguageSwitcher.tsx`, `UpdateIndicator.tsx` — no Tailwind classes, no CSS files; every visual value reads a `var(--...)` custom property or a literal from the 4px spacing grid, matching Phase 1-4's "Tool: none" manual system (`05-UI-SPEC.md` `## Design System`).

### `useTranslation(namespace)` + `t(key, {interpolation})` for all copy
**Source:** every component read in this session (`Header.tsx` line 28, `SyncIndicator.tsx` line 32, `HomeScreen.tsx` line 61)
**Apply to:** `LanguageSwitcher` (`common` namespace), `UpdateIndicator` (`update` namespace) — no hardcoded strings anywhere.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/updates/update-store.ts` | store | event-driven/pub-sub | No existing store wraps a plugin async-op-result into shared cross-component state in this codebase (`board-store`/`ui-store`/`detail-store`/`session-store` all wrap file-watching or UI selection, not a one-shot plugin call result); planner should follow generic zustand conventions from `src/stores/ui-store.ts` for slice shape only, not a specific pattern |
| `src/locales/parity.test.ts` logic | test | transform | No existing automated i18n structural test in the repo (first of its kind) — RESEARCH.md `## Code Examples` supplies the implementation directly, not a codebase analog |
| `.github/workflows/release.yml` (tauri-action step, tag trigger) | config (CI) | batch | No release/tag-triggered workflow exists yet — `ci.yml` is push/PR-triggered lint+test only; RESEARCH.md Pattern 5 is the source of truth for the net-new parts |
| `src-tauri/tauri.conf.json` `plugins.updater` block | config | — | No `plugins` key exists in the current file at all; RESEARCH.md Pattern 4 supplies the concrete placeholder-safe shape |

## Metadata

**Analog search scope:** `src/`, `src-tauri/` (excluding `target/`), `.github/workflows/`
**Files read this session:** `05-CONTEXT.md`, `05-RESEARCH.md`, `05-UI-SPEC.md`, `src/shell/ProjectSwitcherButton.tsx`, `src/components/SyncIndicator.tsx`, `src/persistence/app-store.ts`, `src/notifications/notify.ts`, `src/i18n.ts`, `src/shell/AppShell.tsx`, `src/shell/Header.tsx`, `src/components/home/HomeScreen.tsx`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `.github/workflows/ci.yml`, `src/shell/AppShell.test.tsx` (partial), `src/notifications/notify.test.ts` (partial), `src/persistence/app-store.test.ts` (partial)
**Pattern extraction date:** 2026-07-24
