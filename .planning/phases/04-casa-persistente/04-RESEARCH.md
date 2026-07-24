# Phase 4: Casa persistente - Research

**Researched:** 2026-07-24
**Domain:** Tauri v2 app-local persistence (`plugin-store`), OS notifications (`plugin-notification`), PTY lifecycle events, multi-project session scoping, `claude --resume`
**Confidence:** MEDIUM (official plugin docs + crate/npm registry verified directly; `claude --resume`'s exact runtime semantics are WebSearch-sourced/LOW — flagged below)

## Summary

Phase 4 turns the app from "one project at a time, sessions die with the window" into a durable multi-project home. The only genuinely new *mechanism* is disk writes: everything else (multi-project state, session scoping, PTY exit detection, `--resume` passthrough) is a matter of extending patterns the codebase already has (module-level `Map`s for high-frequency state, `tauri::Emitter`/`listen` for cross-process signals, per-command granular capabilities). `@tauri-apps/plugin-store` (JS) + `tauri-plugin-store` (Rust crate) is the correct, officially-maintained mechanism for the small, frequently-touched metadata (recents, session names, session index) — but it is the **wrong** place for xterm's serialized buffer snapshots. The store plugin's file model is "load whole JSON document into memory, `save()` rewrites the whole document" — mixing a handful of large scrollback blobs into the same file as small, hot-write metadata (renaming a session, bumping `lastOpened`) means every trivial metadata write pays the cost of re-serializing every snapshot currently in memory. The concrete recommendation below splits persistence into **one small metadata store** + **one snapshot store per session**, both still going through `@tauri-apps/plugin-store` (so the phase keeps its one storage mechanism, per `04-CONTEXT.md`), but as separate files so a rename never touches snapshot bytes and a snapshot save never touches the recents list.

Two findings are load-bearing enough to change the shape of the plan, not just its tasks:

1. **The current `WatcherState`/`start_planning_watch` design is a single global watcher, replaced (never accumulated) on every `openProject`.** PROJ-05 ("switch between open projects without closing sessions") does NOT require rewriting this into a per-project watcher — the recommendation here is to keep ONE active watcher and re-run the equivalent of `openProject`'s parse+watch startup when the user switches back to a backgrounded project (cheap: a few file reads). This avoids a risky rewrite of `PtyManager`-style `HashMap<root, Debouncer>` state under phase-4 time pressure. It should be named explicitly as a decision in the plan because it is easy to silently get wrong (e.g., someone "fixes" the single global watcher into a `HashMap` mid-phase without realizing the JS side's `unlistenChanged`/`unlistenDegraded` singletons and `reprocessPaths`'s single-`project` assumption would all need to change too).
2. **`claude --resume <id>` where `<id>` is a persisted, locally-tamperable string is a flag-injection surface**, not just a "pass the id through" problem — a session id written into `cmd.args(["--resume", id])` that happens to start with `-`/`--` can be reinterpreted as a *different* CLI flag by Claude Code's own arg parser (most CLI parsers treat any `-`-leading token as an option regardless of position). This is new in Phase 4 (no persisted, replayed-into-argv string existed before it) and needs a strict allow-list format check before the id ever reaches `CommandBuilder::args`. See `## Security Domain`.

**Primary recommendation:** Adopt `@tauri-apps/plugin-store` 2.4.4 (JS) + `tauri-plugin-store = "2"` (crate, matching the loose-pin convention already used for `tauri-plugin-fs`/`tauri-plugin-dialog`/`tauri-plugin-opener`) for ALL app-local persistence, split into a small `app-state.json` metadata store and one `session-<id>.json` per-session snapshot store (flat filenames directly under `appDataDir`, no subdirectories — `tauri-plugin-store` does not create parent directories for nested paths). Add `@tauri-apps/plugin-notification` 2.3.3 (JS) + `tauri-plugin-notification = "2"` (crate) for TERM-04, gated behind a Windows caveat (unpackaged `tauri dev` builds may not display notifications — the app needs to be installed for a registered AUMID). Wire PTY exit as a global `tauri::Emitter` event (`pty:session-exited`), mirroring the existing `planning:changed`/`planning:watcher-degraded` pattern in `planning_watcher.rs`/`watch.ts` — NOT a tagged message inside the existing raw-bytes `Channel<Vec<u8>>`, which must stay a pure byte pipe for xterm.js.

## User Constraints

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Persistência (fundação de PROJ-01, SESS-04, SESS-05)**
- Mecanismo: adotar `@tauri-apps/plugin-store` (plugin oficial Tauri) — KV/JSON no `appDataDir`, com sua própria capability (`store:*`). Substitui a necessidade de hand-rollar comandos Rust de escrita. É a primeira escrita em disco do app; grava SÓ estado do app (recentes, índice/nome/snapshot de sessão), NUNCA `.planning/`.
- Gate de legitimidade de pacote: `@tauri-apps/plugin-store` + o crate `tauri-plugin-store` são oficiais (org tauri-apps) — checkpoint de legitimidade esperado, pré-aprovável.
- Registro no backend: `.plugin(tauri_plugin_store::Builder::new().build())` em `lib.rs`; capability `store:default` (ou permissões mínimas) em `capabilities/default.json`.
- Alternativa considerada (não adotada agora): comandos Rust dedicados escrevendo em `appDataDir()`. Mais controle, sem dep JS nova, porém mais código; reconsiderar só se o plugin-store não servir para snapshots grandes.

**Página Principal + Recentes (PROJ-01, PROJ-06)**
- Sem router novo: a home é um novo ramo de renderização condicional no `AppShell` (novo view-state, ex. `status === "home"` / uma `view` no store) — não introduzir react-router.
- Modelo de recente: `{ root, name (cache), lastOpened }`. Adicionado/atualizado em todo `openProject` bem-sucedido; ordenado por `lastOpened` desc; persistido via plugin-store.
- Saúde por projeto: reaproveitar `validateProjectRoot` + `readPlanningText(statePath)` + `parseStateFile` (parser/state.ts já expõe `currentPhase`, `progress.percent`, `blockers`) para cada recente. Cálculo lazy ao montar a home; degrada graciosamente (projeto movido/apagado → item em estado de erro, não crash).
- Navegação: clicar num recente chama o fluxo `openProject` existente e troca para a view de board.

**Criar Projeto do Zero (PROJ-03)**
- Fluxo: dialog `open({ directory: true })` para uma pasta (pode estar vazia) → abrir uma sessão com `cwd` = essa pasta → injetar `/gsd-new-project\r` via `writeSession` (primitiva da Fase 3). O GSD cria o `.planning/`; o watcher detecta e o projeto passa a existir.
- Gate de validação: `validate_project_root` hoje rejeita pasta sem `.planning/` (`NotAGsdProject`). A criação usa um caminho separado que registra o escopo de sessão para a pasta crua (sem exigir `.planning/`) só para permitir abrir o terminal ali; a validação normal de projeto só roda depois que `/gsd-new-project` cria os artefatos.
- Segurança: o caminho da pasta é string do usuário — nunca interpolar cru num comando; o `cwd` vai como argumento do spawn (não concatenado em shell), e qualquer valor exibido é tratado como dado.

**Multi-projeto Aberto + Escopo de Sessão (PROJ-05)**
- Modelo: um conjunto de "projetos abertos" + um `activeProjectRoot`. Board e sidebar mostram o projeto ativo; os PTYs de TODOS os projetos abertos seguem vivos (já é o caso — `liveSessions` é Map de módulo keyed por sessionId, `openProject`/`closeProject` não matam sessões).
- Escopo de sessão: adicionar `projectRoot` ao `SessionDescriptor`. A sidebar filtra `sessions[]` pelo `activeProjectRoot` (hoje ela mistura sessões de projetos diferentes no array global — bug a corrigir). `discoverSessions` passa a anotar/filtrar por projeto.
- Trocar de projeto: troca `activeProjectRoot` (board re-deriva, sidebar filtra) — nenhuma sessão morre. Trocar NÃO chama `closeProject` destrutivo.

**Persistência & Restauração de Sessão (SESS-04)**
- O que persiste: por sessão — `{ id, projectRoot, name?, lastActive, serializedSnapshot? }` via plugin-store; snapshot do buffer via `SerializeAddon` (já instalado e fiado in-memory no `focus-algorithm.ts`), gravado em disco ao perder foco / ao sair.
- Restauração LAZY: ao reabrir o app, sessões persistidas aparecem como restauradas/históricas (visual distinto — "histórico restaurado, não processo contínuo", reaproveitar/estender `SessionRowVariant`). O PTY só re-nasce quando o usuário abre aquela sessão: `spawnSession` com `claude --resume <id>` + re-hidratação do snapshot no xterm.
- `claude --resume`: adicionar passagem de argumentos a `spawnSession` (channel.ts) e `spawn_session` (pty.rs) — `cmd.args(["--resume", id])`. Hoje não há passthrough de args.

**Renomear (SESS-05)**
- Modelo: campo `name?` no `SessionDescriptor` + ação `renameSession(id, name)` no store, persistida via plugin-store. Label cai para o derivado (`Sessão <id8>`) quando não há nome.
- Affordance: botão de renomear revelado no hover da row (padrão dos botões Archive/Trash2 já existentes), abrindo edição inline ou um pequeno diálogo (reaproveitar o esqueleto do `ConfirmDialog`). Nome é dado do usuário — exibido como texto, nunca injetado.

**Notificações & Estado de Saída (TERM-04)**
- Plugin: adicionar `@tauri-apps/plugin-notification` (JS + crate + capability `notification:*` + `.plugin(...)` em lib.rs). Pedir permissão de notificação na primeira necessidade.
- Gatilhos: disparar notificação do SO em (a) sessão transiciona para `awaiting` (precisa de input — reaproveita o classificador de atividade da Fase 3) e (b) sessão `exited`.
- Detecção de saída (net-new): `pty.rs` hoje só faz `break` no EOF do reader — não emite evento. Adicionar um sinal de saída Rust→JS (mensagem no Channel ou evento) para o front virar a sessão para `exited` (slot já existente e ocioso no `SessionRowVariant`), disparar notificação e badge.
- Badge: estender o badge do `DrawerRail` (contagem live) e o dot da `SessionRow` para refletir needs-input/exited (reaproveitar `ActivityDot`/variantes).

### Claude's Discretion
- Formato exato das chaves/arquivos do plugin-store (um store `app.json` vs. múltiplos).
- Onde exatamente mora o snapshot grande (dentro do store JSON vs. arquivo por sessão) — o planner/research decide pelo tamanho real; MVP pode começar simples e medir.
- Layout visual fino da home (grid vs. lista) dentro do contrato do UI-SPEC.
- Se a notificação de `awaiting` tem debounce para não spammar em prompts repetidos.

### Deferred Ideas (OUT OF SCOPE)
- Boards de múltiplos projetos lado a lado (split view) — fora de escopo; uma board ativa por vez.
- Busca/filtro global de projetos ou sessões entre projetos.
- Sincronização de estado do app entre máquinas (cloud) — fora de escopo.
- Escrita em disco de qualquer coisa dentro de `.planning/` — permanece proibida por invariante de produto.
</user_constraints>

## Phase Requirements

<phase_requirements>
| ID | Description | Research Support |
|----|-------------|------------------|
| PROJ-01 | Lista de projetos recentes na home, ordenada por último acesso | `## Standard Stack` (plugin-store recents key), `## Architecture Patterns` Pattern 1 (home view-state), reuses `validateProjectRoot`/`parseStateFile` already in codebase |
| PROJ-03 | Criar projeto do zero apontando pasta vazia; app abre sessão e conduz `/gsd-new-project` | `## Architecture Patterns` Pattern 2 (raw-folder session scope), `## Security Domain` (path is spawn arg, never shell-concatenated — already the pattern in `pty.rs`) |
| PROJ-05 | Alternar entre múltiplos projetos abertos sem fechar sessões | `## Architecture Patterns` Pattern 3 (single-watcher re-sync recommendation), `## Common Pitfalls` Pitfall 1 (session leak across projects) |
| PROJ-06 | Saúde de cada projeto na lista (fase, %, bloqueios) derivada de STATE.md | Reuses `parser/state.ts` exports (`currentPhase`, `progress.percent`, `blockers`) already verified present in codebase — no new parsing needed |
| SESS-04 | Sessões persistem entre aberturas; restauração lazy via snapshot + `claude --resume` | `## Standard Stack` (per-session snapshot store), `## Code Examples` (resume passthrough), `## Common Pitfalls` Pitfall 2/3 (cwd correctness, exit detection on failed resume) |
| SESS-05 | Renomear sessões | `## Standard Stack` (metadata store `name` field), `## Security Domain` (name is display-only, never interpolated) |
| TERM-04 | Notificação do SO + badge quando sessão termina ou precisa de input | `## Standard Stack` (plugin-notification), `## Architecture Patterns` Pattern 4 (PTY exit event), `## Common Pitfalls` Pitfall 5 (Windows dev-mode notification caveat) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Recents list + project health | Frontend (Zustand store) | Backend (Rust: `validate_project_root`, already exists) | Health is derived by re-reading `.planning/` through the existing read-only pipeline; the list itself is a pure frontend concern (ordering, rendering) |
| App-local persistence (recents, session metadata, session names) | Backend (Rust: `tauri-plugin-store`, file I/O under `appDataDir`) | Frontend (JS API surface consumed by Zustand actions) | Disk writes MUST go through a Tauri-managed plugin with its own capability scope — never a raw frontend `fetch`/`fs` write, consistent with `fs:allow-read-*`-only precedent in `capabilities/default.json` |
| Session buffer snapshots (xterm scrollback) | Backend (Rust: separate `tauri-plugin-store` file per session) | Frontend (`@xterm/addon-serialize`, already produces the string) | Same tier as metadata for the *storage* mechanism, but a distinct file per session so large blobs never block small, hot metadata writes |
| PTY process lifecycle + exit detection | Backend (Rust: `pty.rs` reader thread + `PtyManager`) | Frontend (session-store reacting to the emitted event) | The only tier that can observe `Ok(0)`/EOF on the real OS pipe; frontend can only react, never detect, exit |
| `claude --resume` argv construction | Backend (Rust: `CommandBuilder::args`) | Frontend (validates/selects which session id to resume before invoking) | `portable-pty` spawns directly (no shell), so argv safety is a backend concern, but the untrusted-string origin (persisted store) means the frontend must validate format before even calling `invoke` |
| OS notifications | Backend (Rust: `tauri-plugin-notification` native APIs) | Frontend (`sendNotification` JS call, permission request UX) | Native OS notification centers are only reachable through the plugin's platform-specific Rust implementations |
| Multi-project "which board is showing" | Frontend (Zustand: `activeProjectRoot`) | Backend (re-validates on switch via existing `validate_project_root`) | Switching is a pure UI/state concern once the root is already known-valid; no new backend surface needed if the single-watcher-resync pattern (Pattern 3) is adopted |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tauri-apps/plugin-store` | `^2.4.4` [VERIFIED: npm registry, checked 2026-07-24] | JSON KV persistence under `appDataDir` for recents, session metadata, session snapshots | Official `tauri-apps` plugin (same publisher/repo as already-installed `plugin-fs`/`plugin-dialog`/`plugin-opener`), exact mechanism locked in `04-CONTEXT.md` |
| `tauri-plugin-store` | `"2"` (crate, latest resolved `2.4.4`) [VERIFIED: crates.io, checked 2026-07-24] | Rust-side plugin backing the JS store API | Same org/repo as JS package; loose `"2"` pin matches the existing convention for `tauri-plugin-fs`/`tauri-plugin-dialog`/`tauri-plugin-opener` in `Cargo.toml` |
| `@tauri-apps/plugin-notification` | `^2.3.3` [VERIFIED: npm registry, checked 2026-07-24] | OS-level notifications for TERM-04 (awaiting/exited) | Official `tauri-apps` plugin, only supported way to reach native notification centers from a Tauri v2 app |
| `tauri-plugin-notification` | `"2"` (crate, latest resolved `2.3.3`) [VERIFIED: crates.io, checked 2026-07-24] | Rust-side plugin backing notification JS API | Same org/repo; loose pin for consistency |

### Supporting

No new supporting libraries needed — `@xterm/addon-serialize` (snapshot production), `strip-ansi`/`activity.ts` (awaiting classifier), and `@tauri-apps/api/event` (`listen`, already a transitive dep of `@tauri-apps/api` and already imported in `src/planning/watch.ts`) are all already in the project.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@tauri-apps/plugin-store` | Dedicated Rust commands writing to `appDataDir()` directly (the alternative `04-CONTEXT.md` names but does not adopt) | More control over file layout/locking, no new JS dependency, but reimplements load/save/serialize-debounce logic the plugin already provides correctly; only worth revisiting if the plugin's whole-document-rewrite model proves to be a real bottleneck after the split-file layout below (unlikely at this scale) |
| Global `tauri::Emitter` event for PTY exit | A tagged variant inside the existing `Channel<Vec<u8>>` byte stream (e.g. `{ kind: "bytes" \| "exit" }` envelope) | The tagged-envelope approach would require changing the wire format consumed by `bytesHandlers`/`activityHandlers`/xterm.js on every single byte chunk, for a signal that fires at most once per session lifetime — high blast radius for a rare event; the existing `planning:changed`/`planning:watcher-degraded` global-event precedent already solves this exact "rare signal, many byte messages" split |
| Flat `session-<id>.json` snapshot files under `appDataDir` root | `snapshots/<id>.json` (subdirectory) | `tauri-plugin-store` does not create parent directories for nested paths [CITED: GitHub issue reports, tauri-apps/tauri discussions] — a subdirectory needs an explicit `mkdir` step (via `@tauri-apps/plugin-fs`, requiring a NEW `fs:allow-mkdir` capability) before first use; flat filenames avoid the extra capability and the ordering bug entirely |

**Installation:**
```bash
npm install @tauri-apps/plugin-store @tauri-apps/plugin-notification
```
```toml
# src-tauri/Cargo.toml [dependencies]
tauri-plugin-store = "2"
tauri-plugin-notification = "2"
```

**Version verification:** `npm view @tauri-apps/plugin-store version` → `2.4.4` (published 2026-07-18); `npm view @tauri-apps/plugin-notification version` → `2.3.3`; `cargo search tauri-plugin-store` → `2.4.4`; `cargo search tauri-plugin-notification` → `2.3.3`. All four confirmed directly against the npm/crates.io registries on 2026-07-24 (network available in this research session).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@tauri-apps/plugin-store` | npm | Latest version (2.4.4) published 2026-07-18 (6 days before this research); crate has 35 published versions back to 2023-05-24 | Registry download telemetry unavailable in this sandbox (`weeklyDownloads: null`) | `github.com/tauri-apps/plugins-workspace` (same monorepo as already-installed `plugin-fs`/`plugin-dialog`/`plugin-opener`) | **SUS** (seam reasons: `too-new`, `unknown-downloads`) | Approved — same sandbox-telemetry-gap precedent already logged for `strip-ansi` in Phase 03-02 (`[Phase ?]: Package legitimacy checkpoint for strip-ansi resolved via orchestrator pre-authorization (SUS verdict was a sandbox download-telemetry gap...)`). Publisher `tauri-bot`/`tauri-apps` org, identical repo to plugins already trusted in this codebase. Planner must still add a `checkpoint:human-verify` task per protocol, but pre-approvable per `04-CONTEXT.md`'s own framing ("checkpoint de legitimidade esperado, pré-aprovável"). |
| `@tauri-apps/plugin-notification` | npm | Latest version (2.3.3) published 2025-10-27 (project is ~9 months old, not brand-new) | Registry download telemetry unavailable in this sandbox | `github.com/tauri-apps/plugins-workspace` | **SUS** (seam reason: `unknown-downloads` only — not flagged `too-new`) | Approved — same sandbox-telemetry-gap rationale as above; official `tauri-apps` publisher. Planner must add a `checkpoint:human-verify` task before install. |
| `tauri-plugin-store` (crate) | crates.io | 35 versions, oldest 2023-05-24 | 2,339,074 total / 1,088,924 recent downloads (crates.io reports this directly — no sandbox gap on this registry) | `github.com/tauri-apps/plugins-workspace` | OK | Approved, no checkpoint needed (crates.io telemetry confirms legitimate, high-usage package) |
| `tauri-plugin-notification` (crate) | crates.io | Multiple versions, `tauri-bot` publisher | Not separately queried (crates.io API rate-limited mid-session for the second lookup) — `cargo search` confirms the crate resolves and is the top/canonical result for the name | `github.com/tauri-apps/plugins-workspace` | OK (inferred from `cargo search` resolution + shared publisher/repo with the store crate above) | Approved, no checkpoint needed |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@tauri-apps/plugin-store`, `@tauri-apps/plugin-notification` (npm side only — both are the official `tauri-apps` plugin, same repo as three plugins already installed in this codebase; SUS verdict is a sandbox npm-download-telemetry gap, not a real legitimacy concern). Planner must still insert a `checkpoint:human-verify` task before each `npm install`, per protocol.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │              Home view (new)             │
                         │  recents[] ← app-state.json (metadata)   │
                         │  health ← validateProjectRoot +          │
                         │           readPlanningText(STATE.md) +   │
                         │           parseStateFile (lazy, per row) │
                         └───────────────┬───────────────────────────┘
                                         │ click recent / create new
                                         ▼
                  ┌──────────────────────────────────────┐
                  │   board-store: openProject(root)      │
                  │   → validate_project_root (Rust)      │
                  │   → adds root to openProjectRoots[]   │
                  │   → sets activeProjectRoot            │
                  │   → (re)starts the single watcher      │
                  │   → app-state.json: upsert recent      │
                  └───────────────┬────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────────┐
        ▼                         ▼                              ▼
 ┌────────────┐         ┌──────────────────┐          ┌────────────────────┐
 │   Board     │         │ SessionSidebar    │          │  session-store       │
 │ (active     │         │ filters sessions[] │          │  liveSessions Map    │
 │  project    │         │ by activeProject-  │          │  (unchanged, keyed   │
 │  only)      │         │ Root               │          │  by global sessionId)│
 └────────────┘         └────────┬──────────┘          └──────────┬──────────┘
                                  │ open a "restored" row            │
                                  ▼                                  │
                    ┌────────────────────────────┐                  │
                    │ resumeSession(id)            │                  │
                    │ → validate id format (UUID)  │                  │
                    │ → load session-<id>.json      │                  │
                    │   (snapshot store)             │                  │
                    │ → spawnSession(id, projectRoot,│◄─────────────────┘
                    │   args=["--resume", id])        │
                    └──────────────┬─────────────────┘
                                   ▼
                     ┌──────────────────────────────┐
                     │  Rust: spawn_session           │
                     │  CommandBuilder::new("claude") │
                     │    .cwd(projectRoot)            │
                     │    .args(["--resume", id])       │◄── resume needs SAME
                     │  reader thread: pump_pty_output  │    cwd as original spawn
                     │  on EOF → remove from map +      │
                     │    emit "pty:session-exited"     │
                     └───────────────┬───────────────────┘
                                     │ event
                                     ▼
                     ┌──────────────────────────────┐
                     │ session-store: listen(...)      │
                     │ → markExited(sessionId)          │
                     │ → sendNotification (TERM-04)      │
                     │ → DrawerRail badge + SessionRow   │
                     │   variant flips to "exited"        │
                     └──────────────────────────────┘

  On lose-focus / kill / app exit:
  focus-algorithm.loseFocus() → serializedSnapshot in liveSessions Map
      → session-store persists it: session-<id>.json.set("snapshot", ...).save()
```

### Recommended Project Structure

```
src/
├── stores/
│   ├── board-store.ts        # +openProjectRoots[], +activeProjectRoot, +recents actions
│   ├── session-store.ts      # +projectRoot/name on SessionDescriptor, +persist/resume actions
│   └── home-store.ts         # NEW — recents list + per-recent lazy health (or fold into board-store; see Open Questions)
├── persistence/
│   ├── app-store.ts          # NEW — wraps the metadata Store (LazyStore("app-state.json"))
│   └── session-snapshot.ts   # NEW — wraps one Store per session id (session-<id>.json)
├── pty/
│   └── channel.ts            # spawnSession gains an `args?: string[]` param; +listenForExit()
├── notifications/
│   └── notify.ts             # NEW — thin wrapper: ensurePermission(), notifyAwaiting(), notifyExited()
├── shell/
│   └── AppShell.tsx           # +new `view: "home" | "board"` branch, no router
└── components/
    └── home/                  # NEW — HomeScreen, ProjectCard, CreateProjectDialog

src-tauri/src/
├── pty.rs                     # spawn_session gains `args: Vec<String>`; reader thread purges
│                               #   stale entry + emits "pty:session-exited" on loop end
├── project.rs                 # unchanged — validate_project_root already does what PROJ-01/06
│                               #   health checks and PROJ-05 project-switch re-validation need
└── sessions.rs                # unchanged — register_sessions_scope already project-scoped
```

### Pattern 1: Home as a view-state branch, not a route

**What:** `AppShell` gains a `view` concept (`"home" | "board"`, driven by whether `activeProjectRoot` is set, or an explicit toggle) rendered as a third conditional branch alongside the existing `status === "open" | "error" | else"` ternary — never `react-router`.
**When to use:** Any new top-level screen in this app (home is the first one Phase 4 introduces).
**Example:**
```tsx
// src/shell/AppShell.tsx — additive to the existing status ternary
{view === "home" ? (
  <HomeScreen onOpenRecent={(root) => { openProject(root); setView("board"); }} />
) : status === "open" ? (
  <Board />
) : /* existing error/empty branches unchanged */ null}
```

### Pattern 2: Raw-folder session for `/gsd-new-project` (PROJ-03)

**What:** Creating a project needs a PTY spawned in a folder that has NOT been validated as a GSD project yet (no `.planning/`). `spawn_session`'s `cwd` argument is passed straight to `CommandBuilder::cwd` regardless of whether that folder passed `validate_project_root` — the existing code has no built-in gate requiring prior validation, so this already works mechanically. What's missing is the **session-scope registration** for `~/.claude/projects/<encoded-of-the-new-folder>/` (today only called from `discoverSessions`, itself only called with an already-validated `projectRoot`).
**When to use:** PROJ-03's "point at an empty/new folder, open a session there" flow.
**Example:**
```ts
// A parallel entry point to createSession() that does NOT require project.root
// to already be validated — takes the raw dialog-selected folder directly.
async function createProjectFromScratch(rawFolder: string) {
  const sessionId = crypto.randomUUID();
  await spawnSession(sessionId, rawFolder, onBytes); // cwd = rawFolder, unvalidated
  await writeSession(sessionId, "/gsd-new-project\r");
  // The watcher/board only start observing `rawFolder` once /gsd-new-project
  // has actually created .planning/ — i.e. once the user (or a follow-up
  // action) calls the normal openProject(rawFolder), which re-validates.
}
```
**Note:** this is a genuinely new code path (not a variant of `createSession`), because `createSession` today unconditionally reads `useBoardStore.getState().project?.root` and refuses to run without an already-open, already-validated project.

### Pattern 3: Single active watcher, re-sync on project switch (PROJ-05)

**What:** Rather than converting `WatcherState` into a `HashMap<root, Debouncer>` (mirroring `PtyManager`'s per-session map), keep exactly one active `Debouncer` for the currently-active project. Switching `activeProjectRoot` to an already-open-but-backgrounded project: (1) stops the current watcher, (2) re-runs the state/roadmap/phase parse for the newly-active root (same code `openProject` already runs), (3) starts a fresh watcher on the new root.
**When to use:** Every project switch triggered by PROJ-05's UI (project switcher in the header, per `04-UI-SPEC.md`).
**Rationale:** `.planning/` file counts are small (a handful of markdown files per phase); re-parsing on switch is cheap, and it reuses 100% of `openProject`'s existing, already-tested code path instead of introducing a second state-management scheme (`HashMap` of parsed project models, one watcher entry per project, `reprocessPaths` needing to know which project a given batch of changed paths belongs to). The tradeoff: a project sitting in the background will NOT reflect `.planning/` changes made by, e.g., a GSD command running in a session of a *different, currently-active* project's sidebar — it will simply re-sync fully on next switch. Given the core value promise ("real time when you're looking at it") is about the *active* board, this tradeoff is acceptable for v1 scope and should be named explicitly in the plan so it isn't accidentally "fixed" into a bigger rewrite mid-phase.
**Example:**
```ts
async function switchProject(root: string) {
  await stopWatching();
  set({ activeProjectRoot: root, status: "opening" });
  // re-run the exact parse steps openProject already performs for `root`
  // (validate → statePath → roadmap → scanAllPhases → set project), then:
  await startWatching(planningDir(root));
}
```

### Pattern 4: PTY exit as a global Tauri event, purging the stale `PtyManager` entry

**What:** The reader thread in `spawn_session` currently just returns when `pump_pty_output` exits its loop (EOF or read error). Extend the thread closure (not `pump_pty_output` itself, which stays a pure/tested byte-forwarding function) to, after the call returns: (a) lock `PtyManager` and remove the now-dead entry, (b) emit a global event via the captured `AppHandle`.
**When to use:** Any time a PTY's underlying child process exits on its own (natural exit, crash, or a FAILED `--resume` — see Pitfall 3).
**Why removing the stale entry matters:** without it, `spawn_session` for the SAME session id (the lazy-restore re-open flow deliberately reuses persisted ids) permanently returns `PtyError::AlreadyExists` — the session could never be reopened after its first natural exit.
**Example:**
```rust
// src-tauri/src/pty.rs — inside spawn_session, replacing the bare
// `pump_pty_output(reader, move |chunk| { ... });` reader-thread body:
let app_for_exit = app.clone();          // AppHandle, cheap to clone
let session_id_for_exit = session_id.clone();
let state_for_exit = state.inner().clone(); // Arc-like managed state handle

let reader_thread = std::thread::spawn(move || {
    pump_pty_output(reader, move |chunk| {
        let _ = on_event.send(chunk);
    });
    // Reader loop ended — child has exited (or the pipe broke). Purge the
    // stale entry (pure, testable in isolation, see PtyManager::remove_exited)
    // and notify the frontend via a global event (mirrors
    // planning_watcher.rs's `app.emit("planning:changed", ...)` precedent —
    // NOT a tagged message inside the byte Channel).
    state_for_exit.remove_exited(&session_id_for_exit);
    let _ = app_for_exit.emit("pty:session-exited", ExitedPayload {
        session_id: session_id_for_exit,
    });
});
```
```rust
// Pure, unit-testable piece (no AppHandle needed):
impl PtyManager {
    /// Removes a session entry if present — returns whether anything was
    /// removed. Called from the reader thread on EOF/error, so a session
    /// that exited naturally never blocks a future spawn_session with the
    /// same id (PtyError::AlreadyExists) once the lazy-restore flow reuses
    /// a persisted session id.
    pub fn remove_exited(&self, session_id: &str) -> bool {
        let mut sessions = match self.0.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        sessions.remove(session_id).is_some()
    }
}
```
```ts
// src/pty/channel.ts — new listener, mirrors watch.ts's startWatching pattern
import { listen, type UnlistenFn } from "@tauri-apps/api/core"; // actually "@tauri-apps/api/event"

let unlistenExit: UnlistenFn | null = null;

export async function listenForSessionExit(
  onExit: (sessionId: string) => void,
): Promise<void> {
  unlistenExit = await listen<{ sessionId: string }>("pty:session-exited", (event) => {
    onExit(event.payload.sessionId);
  });
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| App-local JSON persistence (recents, session metadata) | A hand-rolled Rust `#[tauri::command]` reading/writing a JSON file with manual `serde_json::to_writer`/locking | `@tauri-apps/plugin-store` | `04-CONTEXT.md` already locks this decision; the plugin handles debounced autosave, atomic writes, and JS-side typed access without reimplementing file-locking discipline |
| Debounced disk flush of frequent `set()` calls | A custom `setTimeout`-based debounce wrapper around manual file writes | `Store.load(path, { autoSave: <ms> })` (or `autoSave: false` + explicit `.save()` at defined lifecycle points — recommended here, see Pitfall 4) | The plugin's `StoreOptions.autoSave` already supports both a boolean and a numeric debounce window — no need to reinvent |
| Detecting whether a Claude Code session id is a legitimate identifier before it reaches process argv | A one-off `if (id.includes("-"))` sanity check | A strict format allow-list (e.g. UUID regex) applied consistently at the ONE point session ids enter `spawnSession`'s `args` | Ad-hoc checks miss the actual threat (a value like `--dangerously-skip-permissions` "looks like" a normal string until you specifically anchor against the expected UUID shape) |
| Cross-platform native notifications | Raw platform-specific bindings (`notify-rust` crate directly, Windows Toast APIs by hand, etc.) | `@tauri-apps/plugin-notification` | Official plugin already wraps all target platforms (Linux/Windows/macOS) with one JS API; hand-rolling reintroduces the exact platform-conditional complexity the plugin exists to avoid |

**Key insight:** every "don't hand-roll" item in this phase already has an officially-maintained Tauri plugin covering it — the only genuinely bespoke code this phase needs is the PTY-exit event wiring (Pattern 4) and the id-format validation (Security Domain), both of which are small, pure, and directly testable.

## Common Pitfalls

### Pitfall 1: Session leakage across projects in the sidebar (pre-existing bug, PROJ-05 prerequisite)

**What goes wrong:** `session-store.ts`'s `sessions[]` is a single flat array with no project association. With only one project ever open (current app behavior), this was never observable. The moment PROJ-05 allows a second project to be open, `SessionSidebar` will show BOTH projects' sessions mixed together.
**Why it happens:** `SessionDescriptor` has no `projectRoot` field, and `mergeSessionDescriptors`/`discoverSessions` never tag which project a discovered `.jsonl` belongs to.
**How to avoid:** Add `projectRoot: string` to `SessionDescriptor` (populated at `createSession` time from `useBoardStore.getState().project?.root`, and at `discoverSessions` time from the `projectRoot` param already passed in). Filter `sessions` in `SessionSidebar` by `activeProjectRoot` before grouping into `activeSessions`/`historicalSessions`.
**Warning signs:** Opening a second project and seeing the first project's sessions in the sidebar; `04-CONTEXT.md` names this bug explicitly ("hoje ela mistura sessões de projetos diferentes no array global — bug a corrigir").

### Pitfall 2: `claude --resume` needs the SAME cwd the session was originally spawned in

**What goes wrong:** Session id lookup for `--resume` is scoped to the directory the session was started in (and its git worktrees) [CITED: WebSearch aggregation of `code.claude.com/docs/en/sessions` + community sources — LOW/MEDIUM, no official spec fetched directly this session]. If `resumeSession(id)` is ever called with the CURRENTLY active project's root instead of the session's OWN persisted `projectRoot` (a realistic bug given PROJ-05 keeps multiple projects open simultaneously), Claude Code reports "No conversation found with session ID" and the process likely exits almost immediately.
**Why it happens:** The natural (wrong) implementation reuses whatever `cwd` value is already in scope at the call site (e.g., the active project's root) instead of threading through the session's own persisted `projectRoot`.
**How to avoid:** `resumeSession` must always read `cwd` from the session's own persisted metadata (`session.projectRoot`), never from `activeProjectRoot` / `useBoardStore.getState().project?.root`. This is exactly why `SessionDescriptor.projectRoot` (Pitfall 1's fix) is also load-bearing for SESS-04, not just PROJ-05.
**Warning signs:** Resuming a restored session from a NON-active project's sidebar row silently fails/exits instead of restoring; covered defensively anyway by Pitfall 3's exit-event wiring, but the failure would be confusing without this note.

### Pitfall 3: A failed `--resume` looks exactly like a normal exit — and that's fine, if wired through Pattern 4

**What goes wrong:** If the underlying `.jsonl` transcript was deleted (Claude Code's own retention/cleanup, or manual deletion) or the cwd is wrong (Pitfall 2), `claude --resume <id>` prints an error and the process exits near-instantly — there's no separate "resume failed" signal distinct from a normal process exit at the PTY layer.
**Why it happens:** `--resume` failure is a CLI-level early exit, not a protocol-level error the PTY/Channel layer can distinguish from `Ctrl+D` or a crash.
**How to avoid:** Don't try to special-case "resume failure" as a distinct state. The exit-event wiring from Pattern 4 already handles this correctly: a session that fails to resume transitions to `exited` (same as any other exit) almost immediately after being opened, which is a reasonably clear signal to the user ("I clicked resume and it immediately shows exited") without needing new plumbing. If product wants a friendlier message later, it would need to inspect the last bytes written before exit (already available via the same byte stream the activity classifier reads) — explicitly out of scope for this phase's research (flagged in Open Questions).
**Warning signs:** A restored session flips to `exited` within ~1 second of being opened, with minimal or no visible terminal output.

### Pitfall 4: Snapshot writes must not share a file with hot metadata writes

**What goes wrong:** `tauri-plugin-store`'s `save()` serializes the ENTIRE in-memory document for that store file, not just the changed key. If session snapshots (which can be hundreds of KB to low-MB for long scrollback) live in the same store file as the recents list / session names, every trivial metadata write (renaming a session, bumping `lastOpened` on project switch) re-serializes and re-writes every snapshot currently loaded in that store — on the main thread's IPC round-trip.
**Why it happens:** It's the natural first design ("one store file for everything") and `04-CONTEXT.md` explicitly leaves this as Claude's Discretion, sized against real numbers.
**How to avoid:** Split into `app-state.json` (small: recents + session index/names/lastActive, no snapshot bytes) and one `session-<id>.json` per session (holds only `{ snapshot, savedAt }`), both flat filenames directly under `appDataDir` (no subdirectory — see Alternatives Considered). Only load a given `session-<id>.json` when that specific session is being persisted (lose-focus/exit) or restored (user opens it) — never eagerly load all sessions' snapshot stores at once. Call `.close()` on a session's snapshot `Store`/`LazyStore` handle after the save/load completes, so its in-memory copy doesn't linger for the app's whole lifetime across many sessions (unverified exact permission name for `close()` — see Assumptions Log A3).
**Warning signs:** UI jank (a rename or project-switch feels slow) once a handful of long-running sessions have accumulated large snapshots.

### Pitfall 5: Windows notifications may not appear during `tauri dev` (unpackaged) runs

**What goes wrong:** `sendNotification()` calls succeed (no error thrown) but no toast appears on Windows.
**Why it happens:** On Windows, the app must be installed for notifications to have any effect [CITED: `tauri-plugin-notifications` crate description / `plugins-workspace` docs] — Windows Toast notifications require a registered AppUserModelID (AUMID), which an unpackaged dev build typically lacks.
**How to avoid:** Don't treat "no visible notification during `tauri dev` on Windows" as a bug during phase verification — TERM-04's manual verification for the notification (not badge) half of the requirement should happen against a built/installed artifact, or be explicitly deferred, consistent with `04-CONTEXT.md`'s "author only validates manually on Windows" note in `CLAUDE.md`. The in-app badge (`DrawerRail`/`SessionRow`) has no such caveat and should be the primary verification signal during development.
**Warning signs:** "I called `sendNotification` and nothing happened" reports during `npm run tauri dev` on Windows specifically (macOS/Linux dev builds are not known to have this limitation).

## Code Examples

### Metadata store — recents + session index (Pitfall 4's small file)

```ts
// src/persistence/app-store.ts
import { LazyStore } from "@tauri-apps/plugin-store";

// Flat filename directly under appDataDir — no subdirectory (see Alternatives
// Considered: tauri-plugin-store does not create parent dirs for nested paths).
export const appStore = new LazyStore("app-state.json", { autoSave: false });

export interface RecentProjectEntry {
  root: string;
  name: string; // cached deriveProjectName(root) — avoids re-deriving on every home render
  lastOpened: string; // ISO timestamp
}

export async function upsertRecent(entry: RecentProjectEntry): Promise<void> {
  const recents = (await appStore.get<RecentProjectEntry[]>("recentProjects")) ?? [];
  const next = [entry, ...recents.filter((r) => r.root !== entry.root)];
  await appStore.set("recentProjects", next);
  await appStore.save(); // explicit — autoSave disabled for predictable I/O timing
}
```

### Per-session snapshot store (Pitfall 4)

```ts
// src/persistence/session-snapshot.ts
import { Store } from "@tauri-apps/plugin-store";

export async function saveSnapshot(sessionId: string, snapshot: string): Promise<void> {
  const store = await Store.load(`session-${sessionId}.json`, { autoSave: false });
  await store.set("snapshot", snapshot);
  await store.set("savedAt", new Date().toISOString());
  await store.save();
  await store.close(); // release the in-memory copy — see Assumptions Log A3
}

export async function loadSnapshot(sessionId: string): Promise<string | null> {
  const store = await Store.load(`session-${sessionId}.json`, { autoSave: false });
  const snapshot = (await store.get<string>("snapshot")) ?? null;
  await store.close();
  return snapshot;
}
```

### `--resume` argument passthrough (channel.ts + pty.rs)

```ts
// src/pty/channel.ts — spawnSession gains an optional args param, defaulting
// to no extra args (existing SESS-02 "new session" call sites are unaffected).
export function spawnSession(
  sessionId: string,
  cwd: string,
  onBytes: (data: Uint8Array) => void,
  args: string[] = [],
): Promise<void> {
  const onEvent = new Channel<RawChannelMessage>();
  bytesHandlers.set(sessionId, onBytes);
  onEvent.onmessage = (message) => {
    const bytes = toBytes(message);
    bytesHandlers.get(sessionId)?.(bytes);
    activityHandlers.get(sessionId)?.(bytes);
  };
  return invoke("spawn_session", { sessionId, cwd, args, onEvent });
}
```

```rust
// src-tauri/src/pty.rs — spawn_session gains an `args` param
#[tauri::command]
pub fn spawn_session(
    state: State<'_, PtyManager>,
    app: tauri::AppHandle,
    session_id: String,
    cwd: String,
    args: Vec<String>,
    on_event: Channel<Vec<u8>>,
) -> Result<(), PtyError> {
    // ...existing AlreadyExists check, pty_system.openpty(...) unchanged...

    let mut cmd = CommandBuilder::new("claude");
    cmd.cwd(&cwd);
    cmd.args(&args); // ["--resume", session_id] for lazy restore, [] for a new session

    // ...rest of spawn unchanged, plus Pattern 4's exit-purge/emit wiring...
}
```

### UUID-format guard before `--resume` (Security Domain, load-bearing)

```ts
// src/sessions/id-format.ts — one place, applied before ANY persisted or
// disk-discovered session id is used to construct spawn args.
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSessionId(id: string): boolean {
  return SESSION_ID_PATTERN.test(id);
}
```
```ts
// resumeSession — refuses to spawn if the id doesn't match, rather than
// trusting a value that originated from a locally-tamperable JSON file.
export async function resumeSession(sessionId: string, projectRoot: string): Promise<void> {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Recusando --resume com id em formato inesperado: ${sessionId}`);
  }
  await spawnSession(sessionId, projectRoot, onBytes, ["--resume", sessionId]);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| App-local persistence via a hand-rolled Rust file-write command (the "alternative considered" in `04-CONTEXT.md`) | `@tauri-apps/plugin-store` v2 with granular per-command permissions | Store plugin has been stable at v2 since the Tauri v2 GA cycle; the granular permission model (`store:allow-*` per command, replacing a single opaque `store:default`) is the current Tauri v2 ACL convention already used elsewhere in this codebase (`fs:allow-read-text-file` etc., never `fs:default`) | Plan should request only the specific `store:allow-*` permissions actually used, not the bundled `store:default`, to stay consistent with the codebase's existing minimal-permission discipline |
| Single Channel carrying only raw PTY bytes | Same Channel for bytes + a SEPARATE global event for exit | N/A — this is a pattern choice made in this research, not a Tauri ecosystem shift | Keeps xterm.js's byte pipe uncontaminated by protocol framing; mirrors the pre-existing `planning:changed` global-event precedent |

**Deprecated/outdated:** none identified — both plugins are actively maintained, current major version (v2), no v1-only APIs referenced anywhere in this research.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `claude --resume <id>` session-id lookup is scoped to the original working directory (and git worktrees), and a mismatched cwd produces "No conversation found" | Common Pitfalls #2/#3 | If wrong, `SessionDescriptor.projectRoot` threading through `resumeSession` may be unnecessary — but even if unnecessary it is not harmful (correct cwd is always the right choice regardless), so risk is low; NOT verified against official Anthropic docs this session (WebSearch aggregation only, official `code.claude.com/docs/en/sessions` page was found but not directly fetched) |
| A2 | Claude Code session ids are UUIDv4-formatted (matching the regex in `## Code Examples`) | Security Domain, Code Examples (id-format guard) | If the real format differs (e.g., a different id scheme in some Claude Code version), the strict regex would incorrectly reject legitimate resume attempts. Mitigation independent of the exact regex: verify the real format empirically by inspecting actual `~/.claude/projects/<encoded>/*.jsonl` filenames on a dev machine (cheap, ~1 line of shell) before locking the regex in the plan, and keep the validation function isolated (`id-format.ts`) so tightening/loosening it later is a one-file change |
| A3 | `Store`/`LazyStore` in `@tauri-apps/plugin-store` v2 expose a `close()` method that releases the store's in-memory/Rust-side registration, and this is the recommended way to avoid unbounded memory growth from many per-session snapshot stores | Common Pitfalls #4, Code Examples | If `close()` doesn't exist or doesn't do what's assumed (the fetched API surface listed a `close(): Promise<void>` method but its exact capability-permission identifier and semantics were not independently confirmed), per-session snapshot stores may accumulate in memory for the app's lifetime — a slow leak, not a correctness bug, and cheap to verify/fix during implementation by checking actual Rust-side plugin source or Tauri's own store example apps |
| A4 | `tauri-plugin-store` does not auto-create parent directories for nested store file paths (motivating the flat-filename recommendation) | Standard Stack (Alternatives Considered), Code Examples | If wrong (recent plugin versions may have fixed this), the flat-filename convention is still valid and harmless — just not strictly necessary. Low risk either way since flat filenames are directly under `appDataDir`, which the plugin/app already has implicit write access to |

**If this table is empty:** N/A — see entries above.

## Open Questions (RESOLVED)

> All three resolved during planning: Q1 → board-store extended (04-03); Q2 → `origin:"restored"` added (04-06); Q3 → granular `store:allow-*` permissions (04-01).

1. **Should `openProjects`/home-derived state live in `board-store.ts` or a new `home-store.ts`?**
   - What we know: `board-store.ts` already owns `project`/`status`/`openProject`/`closeProject`; adding `openProjectRoots[]` + `activeProjectRoot` there is the smallest diff, but the file is already large (500+ lines) and mixes board-derivation concerns with persistence concerns.
   - What's unclear: whether the planner should split persistence-adjacent concerns (recents list, health-per-recent) into a separate store to keep `board-store.ts` focused on "the currently active board's derived state."
   - Recommendation: default to extending `board-store.ts` (smallest diff, consistent with the existing single-store-per-domain pattern where `session-store.ts` is the only sibling store) unless the planner's file-size/complexity budget for this phase says otherwise; not load-bearing enough to block planning.

2. **Does a "restored" session (has a persisted snapshot from THIS app's own history) need a `SessionRowVariant` distinct from plain `"historical"` (a `.jsonl` discovered on disk but never tracked by this app)?**
   - What we know: `SessionRow.tsx`'s `isHistorical` branch currently makes clicking a historical row a no-op (shows a transient hint). SESS-04 requires clicking a RESTORED row to actually trigger `resumeSession`. `04-CONTEXT.md` says "reaproveitar/estender `SessionRowVariant`" without specifying whether that means reusing `"historical"` as-is or adding a new value.
   - What's unclear: whether a `.jsonl`-only session (discovered via disk scan, never opened by this app instance, no persisted snapshot) should ALSO become resumable (mechanically it could — `claude --resume` works from any known session id in the right cwd), or whether resumability should be gated specifically to sessions this app has metadata for.
   - Recommendation: add a distinct `origin: "restored"` value (alongside existing `"live"`/`"historical"`) for sessions with a persisted `app-state.json` record, and make ONLY `"restored"` rows clickable-to-resume in this phase — leaves room to extend resumability to plain `.jsonl`-discovered sessions later without a breaking change. This is a genuine product decision, not purely technical; flag for `/gsd-discuss-phase` follow-up or planner discretion if not already resolved by `04-UI-SPEC.md`.

3. **Exact permission set for `store:*` — should the plan request `store:default` or the granular list?**
   - What we know: `store:default` exists as a bundle; the codebase's established convention (Phase 1) is granular permissions only (`fs:allow-read-text-file`, never `fs:default`).
   - What's unclear: whether `store:default` includes `store:allow-save` (some Tauri plugins exclude "write" commands from their default set as a safety default) — not independently confirmed this session.
   - Recommendation: request the granular list explicitly (`store:allow-load`, `store:allow-get`, `store:allow-set`, `store:allow-save`, `store:allow-delete`) regardless of what `store:default` bundles, consistent with the existing capability-file discipline and avoiding a dependency on an unconfirmed bundle contents.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `claude` CLI on PATH (or resolvable via existing PROJ-04 detection) | SESS-04's `--resume` spawn | Already gated by existing `checkClaudeOnPath`/`ToolMissingState` (Phase 2) — no new detection needed this phase | N/A (detection mechanism, not a version) | Existing `ToolMissingState` UI already covers "claude missing" globally; SESS-04 adds no new failure mode here |
| OS notification daemon (Linux only — `org.freedesktop.Notifications` via D-Bus, or equivalent) | TERM-04's `sendNotification` | Not probed in this research session (headless research sandbox has no desktop session) | — | `tauri-plugin-notification` on Linux without a running notification daemon typically fails the `sendNotification`/`requestPermission` call gracefully (returns an error/false rather than crashing) — the plan should wrap the call defensively (try/catch, degrade to badge-only) rather than assume a daemon is always present, especially relevant for minimal Linux desktop environments the community (`i18n pt-BR/en`, per `PROJECT.md`) may run |
| Windows AUMID registration (installed app) | TERM-04's `sendNotification` on Windows | Not applicable during `tauri dev` — see Pitfall 5 | — | Badge-only verification during development; full notification verification deferred to an installed/packaged build |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Linux notification daemon absence (degrade to badge-only, already required anyway since the badge is the more reliable signal per Pitfall 5); Windows dev-mode notification limitation (same degrade-to-badge fallback).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.10 (frontend), `cargo test` (backend) — both already configured and used throughout the codebase |
| Config file | `vitest.config.ts` (jsdom environment, `src/test/setup.ts`); Rust tests are inline `#[cfg(test)] mod tests` per file (see `pty.rs`, `project.rs`, `sessions.rs`, `planning_watcher.rs`) plus external integration crates (`src-tauri/tests/*.rs`) for tests needing a real `PtyManager`/`TreeGuard` without a mocked `tauri::State` |
| Quick run command | `npx vitest run src/persistence src/pty src/stores/session-store.test.ts` (frontend); `cargo test --lib pty::` (backend, scoped to the touched module) |
| Full suite command | `npm test` (== `vitest run`); `cargo test` (from `src-tauri/`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROJ-01 | Recents list persists across a simulated reload (upsert → reload → same entries, ordered by `lastOpened` desc) | unit | `vitest run src/persistence/app-store.test.ts` | ❌ Wave 0 |
| PROJ-01/PROJ-06 | A recent whose project folder no longer validates degrades to an error card, not a crash | unit | `vitest run src/components/home/ProjectCard.test.tsx` | ❌ Wave 0 |
| PROJ-03 | `createProjectFromScratch` spawns with the raw (unvalidated) folder as cwd and writes `/gsd-new-project\r` | unit (mocked `channel.ts`) | `vitest run src/stores/board-store.test.ts -t "createProjectFromScratch"` | ❌ Wave 0 (new test in existing suite) |
| PROJ-05 | `SessionSidebar` filters `sessions[]` by `activeProjectRoot` — a session from project B never renders while project A is active | unit | `vitest run src/components/session/SessionSidebar.test.tsx` | ✅ (extend existing file) |
| PROJ-05 | Switching `activeProjectRoot` to an already-open root stops the old watcher and starts a fresh one exactly once (no leaked listeners) | unit | `vitest run src/stores/board-store.test.ts -t "switchProject"` | ❌ Wave 0 (new test in existing suite) |
| SESS-04 | `resumeSession` uses the session's own persisted `projectRoot`, never the currently-active one | unit | `vitest run src/stores/session-store.test.ts -t "resumeSession"` | ❌ Wave 0 (new test in existing suite) |
| SESS-04 | `isValidSessionId` rejects a flag-shaped string (`--dangerously-skip-permissions`) and accepts a well-formed UUID | unit | `vitest run src/sessions/id-format.test.ts` | ❌ Wave 0 |
| SESS-04 | Snapshot round-trip: `saveSnapshot` then `loadSnapshot` for the same id returns the same string; a different id returns `null` | unit | `vitest run src/persistence/session-snapshot.test.ts` | ❌ Wave 0 |
| SESS-05 | `renameSession` persists `name` and `SessionRow` displays it in place of the derived `Sessão <id8>` label | unit | `vitest run src/components/session/SessionRow.test.tsx` | ✅ (extend existing file) |
| TERM-04 (exit) | `PtyManager::remove_exited` returns `true` exactly once for a live entry, `false` for an already-removed/unknown id | unit (Rust) | `cargo test --lib pty::tests::remove_exited` | ❌ Wave 0 |
| TERM-04 (exit) | Reader thread purge+emit fires after `pump_pty_output` returns for a real spawned process (extends the existing `pump_pty_output_forwards_bytes_from_a_real_process` test's substitute-binary technique) | integration (Rust) | `cargo test --lib pty::tests` | ❌ Wave 0 (new test in existing module) |
| TERM-04 (awaiting/exited notification) | `notifyAwaiting`/`notifyExited` call `sendNotification` with the expected title/body, gracefully no-op if permission denied or the call throws | unit (mocked `@tauri-apps/plugin-notification`) | `vitest run src/notifications/notify.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** the scoped quick-run command for the module touched (see table above).
- **Per wave merge:** `npm test` (frontend) + `cargo test` (backend, from `src-tauri/`).
- **Phase gate:** both full suites green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `src/persistence/app-store.test.ts` — covers PROJ-01 recents round-trip
- [ ] `src/persistence/session-snapshot.test.ts` — covers SESS-04 snapshot round-trip
- [ ] `src/sessions/id-format.test.ts` — covers SESS-04's flag-injection guard (Security Domain)
- [ ] `src/notifications/notify.test.ts` — covers TERM-04's permission/send wrapper
- [ ] Rust: `remove_exited` unit test + reader-thread purge+emit integration test in `pty.rs`'s existing `#[cfg(test)] mod tests`
- [ ] Mock helpers for `@tauri-apps/plugin-store` (`vi.mock("@tauri-apps/plugin-store", ...)`, following the exact `vi.mock("@tauri-apps/api/core", ...)` + dynamic-import-after-mock pattern already established in `channel.test.ts`) and `@tauri-apps/plugin-notification`
- [ ] Framework install: none — vitest/cargo test already fully configured

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user local desktop app, no auth surface introduced this phase |
| V3 Session Management | no (not web-session ASVS sense) | N/A — "session" in this codebase means a `claude` CLI process, not an ASVS web session |
| V4 Access Control | yes | `validate_project_root`'s existing canonicalize + containment check (Phase 1) is the sole gate for filesystem scope; this phase must route EVERY persisted `root` back through it before use, never trust a stored path directly |
| V5 Input Validation | yes | New this phase: session-id format allow-list before `CommandBuilder::args` (Security Domain below); session names rendered as React text nodes only (no `dangerouslySetInnerHTML` anywhere in this codebase, confirmed by pattern precedent in `SessionRow.tsx`) |
| V6 Cryptography | no | No secrets, no crypto operations introduced; `plugin-store` files are plaintext JSON (same as every other local-only Tauri app's config, no regression from current threat model) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Persisted recent-project path is tampered (locally, in the plaintext `app-state.json`) to point somewhere unexpected | Tampering | `validate_project_root` re-runs on EVERY open (recents included) — canonicalizes, requires `.planning/` to exist and be contained (not a symlink escape), and only THEN grants `fs` read scope. A tampered path either fails validation outright or, at worst, exposes exactly the same read-only scope the user could already grant themselves by manually opening that folder (no privilege escalation — same OS user, same app) |
| Persisted/replayed session id used as a CLI argv value is crafted to look like a different flag (e.g. `--dangerously-skip-permissions`) — **flag injection via argv, new in this phase** | Tampering / Elevation of Privilege | `portable-pty`'s `CommandBuilder` spawns the process directly (no shell), so classic shell-metacharacter injection is not possible — but a `-`/`--`-leading argv VALUE can still be reinterpreted as a new flag by the target program's own arg parser regardless of its position after `--resume`. Mitigation: strict format allow-list (`isValidSessionId`, `## Code Examples`) applied at the single point session ids enter `spawnSession`'s `args` array — reject anything not shaped like a legitimate id BEFORE it reaches `invoke("spawn_session", ...)` |
| Persisted session `name` (SESS-05, arbitrary user text) rendered in the UI or, hypothetically, used to construct a command | Tampering / Information Disclosure | Always render as a bound React text child/attribute (never `dangerouslySetInnerHTML`, never a template-string command); confirmed no existing precedent in this codebase for HTML-injecting user strings. `renameSession` must never allow `name` to be used as a lookup key (the `id` remains canonical) or interpolated into any `invoke(...)` argument beyond being the literal display string |
| `app-state.json` / `session-<id>.json` edited directly on disk by a local process/user with the same OS privileges as the app | Tampering | Accepted risk at the local-desktop-app threat model level (same as any other unsigned local config/DB file) — the concrete, actionable mitigation is that EVERY field read back out of these stores is re-validated at its point of use (paths via `validate_project_root`, ids via `isValidSessionId`, names via text-only rendering) rather than trusted as pre-sanitized just because it lives under `appDataDir` |
| Malicious `.planning/`/`CLAUDE.md` content in a folder presented as (or auto-suggested via) a persisted "recent project" | Information Disclosure / prompt injection into `claude` itself | Out of scope for this phase to mitigate directly — inherent to opening ANY untrusted folder as a GSD project (already true of PROJ-02's manual open flow since Phase 1); Claude Code's own trust-folder prompting is the actual mitigation layer, external to this app. Named here so the planner doesn't mistake "add a recents feature" for "add a new attack surface requiring a new mitigation" |

## Sources

### Primary (HIGH confidence)
- `npm view @tauri-apps/plugin-store version` / `npm view @tauri-apps/plugin-notification version` — direct npm registry query, 2026-07-24
- `cargo search tauri-plugin-store` / `cargo search tauri-plugin-notification` — direct crates.io query via cargo, 2026-07-24
- `curl https://crates.io/api/v1/crates/tauri-plugin-store` — direct crates.io API query (download counts, publisher, repo), 2026-07-24
- Direct codebase reads: `src-tauri/src/pty.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/project.rs`, `src-tauri/src/sessions.rs`, `src-tauri/src/planning_watcher.rs`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`, `src/pty/channel.ts`, `src/stores/session-store.ts`, `src/stores/board-store.ts`, `src/components/terminal/focus-algorithm.ts`, `src/components/session/SessionRow.tsx`, `src/components/session/SessionSidebar.tsx`, `src/sessions/discover.ts`, `src/pty/activity.ts`, `src/components/terminal/useTerminalActivity.ts`, `src/planning/watch.ts`, `src/planning/read.ts`, `package.json`, `vitest.config.ts`

### Secondary (MEDIUM confidence)
- `raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/store/README.md` and `.../store/permissions/autogenerated/reference.md` — official plugin repo, fetched directly (v2.tauri.app itself returned 403 to WebFetch this session, GitHub raw content used as the equivalent official source)
- `raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/notification/README.md` and `.../notification/guest-js/index.ts` — official plugin repo, fetched directly
- `github.com/tauri-apps/plugins-workspace` issue/discussion aggregation (WebSearch) — parent-directory-creation limitation for `tauri-plugin-store`, cross-checked against the general Tauri filesystem-doesn't-auto-mkdir pattern

### Tertiary (LOW confidence)
- WebSearch aggregation on `claude --resume` CLI behavior (ClaudeLog, `code.claude.com/docs/en/sessions` referenced but not directly fetched, Medium articles, GitHub issues) — the cwd-scoping claim (Assumption A1) should be treated as needing empirical confirmation, not settled fact
- WebSearch aggregation on `portable-pty::CommandBuilder` args API — cross-checked against `docs.rs/portable-pty` existing in the result set, but the docs.rs page itself was not directly fetched this session; the existing codebase's own `cmd.cwd(&cwd)` usage in `pty.rs` already confirms the builder pattern works as described

## Metadata

**Confidence breakdown:**
- Standard stack (plugin-store/plugin-notification versions, permissions, install steps): HIGH — versions verified directly against npm/crates.io registries; API surface CITED from official GitHub repo content
- Architecture (single-watcher-resync recommendation, PTY exit event pattern, split-store layout): MEDIUM — grounded directly in this codebase's existing patterns (`planning_watcher.rs`/`watch.ts` precedent, `PtyManager` structure), not externally sourced, so correctness depends on the analysis above rather than an authoritative doc
- Pitfalls (`--resume` cwd scoping, flag-injection risk, Windows notification caveat): MEDIUM overall — the flag-injection analysis and store-parent-directory limitation are the most load-bearing and are CITED/cross-checked; the exact `--resume` cwd semantics are LOW (WebSearch-only, flagged as Assumption A1)

**Research date:** 2026-07-24
**Valid until:** 2026-08-23 (30 days — Tauri v2 plugin ecosystem is reasonably stable, but both plugins are pre-1.0-feeling in release cadence; re-verify exact versions before implementation if this research is consumed more than a few weeks after 2026-07-24)
