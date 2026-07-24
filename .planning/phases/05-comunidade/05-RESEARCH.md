# Phase 5: Comunidade - Research

**Researched:** 2026-07-24
**Domain:** Tauri v2 auto-update (`plugin-updater` + `plugin-process`), bundler/installer config, `tauri-apps/tauri-action` release CI, i18next language switching + persistence
**Confidence:** MEDIUM-HIGH (official plugin/action docs + npm/crates.io registries verified directly this session; the exact GitHub-Releases `latest.json` endpoint convention and `tauri-action` matrix shape are WebSearch-cross-checked against multiple independent sources, not a single directly-fetched primary doc — `v2.tauri.app` returned 403 to `WebFetch` this session, GitHub raw docs mirror used instead)

## Summary

Phase 5 is almost entirely "wire official building blocks the codebase already has working precedent for," not new architecture. DIST-01 (language switcher) reuses two patterns verbatim from earlier phases: the `app-store.ts` persistence template (`upsertRecent`/`withStoreLock`, Phase 4) for saving the chosen language, and `notify.ts`'s thin-wrapper-with-silent-degrade style (Phase 4) as the shape for the new `check-update.ts`. DIST-03 (auto-update) is the one genuinely new *mechanism*: `@tauri-apps/plugin-updater` + `tauri-plugin-updater` crate, registered exactly like Phase 4's `plugin-store`/`plugin-notification` (`.plugin(...)` in `lib.rs`, a capability entry in `capabilities/default.json`), plus a new `tauri.conf.json > plugins.updater` block carrying `endpoints` + `pubkey`. DIST-02 (installer) is pure configuration — filling in `tauri.conf.json > bundle` fields that are currently minimal (`{ "active": true, "targets": "all" }`) — plus one new file, `.github/workflows/release.yml`, using the official `tauri-apps/tauri-action@v1` GitHub Action.

Two findings are load-bearing enough to change how the plan is shaped, not just its tasks:

1. **The ed25519 signing keypair is the single hardest boundary in this phase, and it is a boundary the plan must scaffold around, not attempt to cross.** `createUpdaterArtifacts: true` and `plugins.updater.pubkey` can both be set in `tauri.conf.json` today with a clearly-marked, non-functional placeholder value, and `cargo check`/`tauri build --help`/JSON-validity checks all pass with that placeholder — but the *real* pubkey only exists after the maintainer runs `tauri signer generate` on their own machine, and the private key must become a GitHub Actions secret (`TAURI_SIGNING_PRIVATE_KEY` + `_PASSWORD`) that this session must never generate, hold, or hint at as if it were real. The plan should have an explicit `checkpoint:human-verify`-style task for "maintainer replaces the placeholder pubkey and registers the CI secret," not a task that silently assumes it happened.
2. **CONTEXT.md's phrase "capability granular `updater:default`" is internally in tension with this codebase's own established capability discipline.** `updater:default` is the *official* Tauri docs' recommended permission set, but it bundles all four updater commands (`allow-check`, `allow-download`, `allow-install`, `allow-download-and-install`) — whereas every other plugin in `capabilities/default.json` (store, notification, fs) is granted through individual `allow-*` entries, with the file's own header comment stating the rule explicitly ("Concedidas apenas as permissões granulares por comando efetivamente usadas... nunca o bundle catch-all"). Since the CONTEXT-described JS flow only ever calls `check()` then `downloadAndInstall()`, the narrower, convention-consistent choice is `updater:allow-check` + `updater:allow-download-and-install` (omitting the unused standalone `allow-download`/`allow-install`). This is flagged as an explicit decision point for the planner, not silently resolved either way — see `## Common Pitfalls` Pitfall 2.

**Primary recommendation:** Add `@tauri-apps/plugin-updater` (JS) + `tauri-plugin-updater` (crate) + `@tauri-apps/plugin-process` (JS) + `tauri-plugin-process` (crate) using the exact Phase-4 plugin-wiring pattern; fill in `tauri.conf.json > bundle` (icon array, metadata, `createUpdaterArtifacts: true`) and `plugins.updater` (placeholder `pubkey`, GitHub-Releases-static-URL `endpoints`); add `.github/workflows/release.yml` built on `tauri-apps/tauri-action@v1` with a `windows-latest` / `macos-latest` (both `aarch64`+`x86_64` targets) / `ubuntu-22.04` matrix; build `LanguageSwitcher` as a toggle mounted in both `Header` and `HomeScreen`, persisted via a new `LANGUAGE_KEY` in `app-store.ts`, restored in a boot effect that validates the stored value against the closed `pt-BR | en` enum before calling `changeLanguage`; and lock the 9-namespace i18n parity check in as an automated recursive key-path-diff test, not a one-time manual verification.

## User Constraints

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Seletor de Idioma (DIST-01)**
- **Componente:** um `LanguageSwitcher` (toggle pt-BR / EN) montado no `Header` ao lado do `SyncIndicator`, seguindo o padrão de botão do `ProjectSwitcherButton`. Como o `Header` NÃO monta na Home (`AppShell.tsx:50-55` curto-circuita para `HomeScreen`), montar o switcher **também na Home** (canto do header da Home) para ser alcançável antes de abrir projeto — mesmo componente, dois pontos de montagem.
- **Troca:** chama `i18n.changeLanguage(lng)`; `react-i18next` re-renderiza os consumidores de `useTranslation` automaticamente (inclui os dois leitores de `i18n.language` para date-fns: `SyncIndicator.tsx:53`, `SessionRow.tsx:125`).
- **Persistência:** salvar a escolha via o `app-store` da Fase 4 (`app-state.json` no appDataDir) — nova chave `LANGUAGE_KEY` + `getLanguage()/setLanguage()`, copiando o padrão `upsertRecent` + `withStoreLock`. Nunca escreve em `.planning/`.
- **Restauração no startup:** `i18n.init` é síncrono (default pt-BR); um efeito no boot lê o idioma salvo (async) e chama `changeLanguage(saved)` se diferente. Fallback: se não houver escolha salva, usar `navigator.language` quando for `en*` (senão pt-BR). Idioma é um enum fechado (`pt-BR` | `en`) — validar o valor lido do store (dado não confiável) antes de aplicar.
- **Completude:** manter a paridade dos 9 namespaces como um teste automatizado (falha se pt-BR e en divergirem em chaves) — trava DIST-01 contra regressão futura.

**Bundler / Instalador (DIST-02)**
- **`tauri.conf.json > bundle`:** adicionar o array `icon` referenciando os ícones já presentes em `src-tauri/icons/` (32/64/128/128@2x/icns/ico), `category`, `publisher`, `copyright`, `shortDescription`/`longDescription`. Manter `targets: "all"` (constrói o que o SO host suporta).
- **`createUpdaterArtifacts: true`** no bundle (necessário para o DIST-03 gerar os artefatos assináveis).
- **Per-target:** seções mínimas seguras — `bundle.windows.nsis` (instalador Windows, prioridade), `bundle.linux` (deb/appimage), `bundle.macOS` (dmg, minimumSystemVersion). Sem assinatura de código de SO obrigatória (decisão de projeto: aceitar aviso SmartScreen para app de comunidade — `PITFALLS.md`), documentada como best-effort/opcional.
- **Versão:** `package.json` / `Cargo.toml` / `tauri.conf.json` já em `0.1.0` sincronizados; documentar que um bump de release toca os três (sem automação nova nesta fase).

**Auto-update (DIST-03)**
- **Plugin:** `@tauri-apps/plugin-updater` (JS) + `tauri-plugin-updater = "2"` (crate) + `.plugin(tauri_plugin_updater::Builder::new().build())` em `lib.rs` + capability granular `updater:default` — mesmo padrão dos plugins da Fase 4. Adicionar `@tauri-apps/plugin-process` + `process:allow-restart` se for preciso relançar após instalar.
- **Config:** `tauri.conf.json > plugins.updater` com `endpoints` (GitHub Releases `latest.json`) e `pubkey`. O `pubkey` entra como **placeholder claramente marcado** — a chave real vem do `tauri signer generate` executado pelo mantenedor.
- **Verificação no startup:** um wrapper fino `src/updates/check-update.ts` (estilo `notify.ts`: uma função por op, degrada em silêncio, promise cacheada no módulo) expondo `checkForUpdate()`; chamado num `useEffect` de mount no `AppShell`. UX: não intrusivo — se houver update, oferecer instalar (MVP pode baixar-e-instalar-e-relançar direto, ou mostrar um aviso discreto — detalhe de UI no UI-SPEC).
- **Chave de assinatura (segurança):** o par ed25519 de produção é a identidade de release do mantenedor — **NÃO** gerar nem versionar a chave privada nesta sessão autônoma. A fase entrega config + CI + docs com placeholder; gerar o par (`tauri signer generate`), preencher o `pubkey` real e cadastrar o secret `TAURI_SIGNING_PRIVATE_KEY` são passos manuais do mantenedor (Manual-Only).

**CI / Release (DIST-02, DIST-03)**
- **Novo `.github/workflows/release.yml`** disparado por tag/release, usando `tauri-apps/tauri-action`, matrix Windows/macOS/Linux, que constrói instaladores, gera o manifesto `latest.json` do updater, assina os artefatos (secrets `TAURI_SIGNING_PRIVATE_KEY` + `_PASSWORD`) e publica num GitHub Release. `ci.yml` (lint/test/cargo) permanece como está.
- Secrets de code-signing de SO (Apple/Windows cert) são opcionais/best-effort, documentados.
- YAML pode ser autorado e validado (sintaxe/`actionlint` se disponível) nesta sessão; a execução real do release roda no CI do mantenedor.

### Claude's Discretion
- UX exata do aviso de update (auto-baixar+relançar vs. banner "atualizar agora") dentro do contrato do UI-SPEC.
- Forma do seletor (toggle pt/en vs. dropdown) — MVP: toggle simples.
- Endpoint exato do `latest.json` (owner/repo do GitHub Releases) — placeholder documentado se o slug final não estiver fixado.

### Deferred Ideas (OUT OF SCOPE)
- Construir instaladores **Windows** (nsis/msi) e **macOS** (dmg) — exigem esses SOs / runners de CI.
- Ciclo real de **auto-update assinado** ponta-a-ponta (release assinado + endpoint servindo `latest.json` + app instalado que relança).
- **Geração do par ed25519** de produção e cadastro do secret `TAURI_SIGNING_PRIVATE_KEY` — passo do mantenedor.
- Code-signing de SO (Apple notarization, cert Windows/EV) — best-effort, fora do MVP.
- Mais idiomas além de pt-BR/en — fora de escopo.
</user_constraints>

## Phase Requirements

<phase_requirements>
| ID | Description | Research Support |
|----|-------------|--------------------|
| DIST-01 | UI disponível em pt-BR e inglês (i18n desde o início) — esta fase adiciona o seletor, a persistência, a restauração no boot e a trava de paridade | `## Architecture Patterns` Pattern 1/2 (LanguageSwitcher two-mount-point, persist+validate-before-restore), `## Code Examples` (parity test), `## Common Pitfalls` Pitfall 1/5 |
| DIST-02 | Usuário instala o app via instalador empacotado (Windows primeiro; macOS/Linux também) | `## Standard Stack`/`## Architecture Patterns` Pattern 4 (bundle config), Pattern 5 (`release.yml`), `## Common Pitfalls` Pitfall 3/4, `## Environment Availability` (headless-vs-CI boundary) |
| DIST-03 | App se atualiza automaticamente quando há nova versão | `## Standard Stack` (`plugin-updater`/`plugin-process`), `## Architecture Patterns` Pattern 3 (`check-update.ts`), `## Package Legitimacy Audit`, `## Security Domain` (ed25519 signature verification, CI secret handling) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Framework lock:** Tauri v2 (not Electron) — the updater/process plugins must be the official `@tauri-apps/plugin-*` (JS) + `tauri-plugin-*` (crate) pairs, registered the same way as every other plugin already in `lib.rs`.
- **Versioned stack table (STACK.md, mirrored in CLAUDE.md):** already documents the updater approach (`createUpdaterArtifacts: true` + ed25519 keypair via `tauri signer generate`, independent of OS code-signing certificates) — this research confirms and extends it with exact current versions, not a new decision.
- **Capabilities discipline:** "Capabilities granulares (nunca bundles catch-all)" is stated as an Established Pattern in the project's own conventions — directly informs Pitfall 2's recommendation against `updater:default`.
- **i18n stack:** `i18next`/`react-i18next` versions are locked (`26.3.6`/`17.0.11`); this phase adds no new i18n library, only the switcher/persistence/parity-test layer on top of the existing 9-namespace setup.
- **CI matrix:** "GitHub Actions com matrix Windows/macOS/Linux... necessário desde o dia 1" — `release.yml`'s matrix (Pattern 5) follows this same requirement, extending (not replacing) the existing `ci.yml` matrix.
- **GSD Workflow Enforcement:** file-changing work for this phase must go through `/gsd-execute-phase` (or an equivalent GSD entry point), not direct ad-hoc edits — a process constraint for the planner/executor, not a technical one, but recorded here per CLAUDE.md's explicit instruction.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Language switcher UI (toggle) | Browser/Client (React component) | — | Pure presentational state; no IPC needed to render the toggle itself |
| Language change propagation | Browser/Client (`i18next`/`react-i18next`) | — | `changeLanguage` + `useTranslation` re-render is entirely a frontend-library concern, already working since Phase 1 |
| Language persistence | Backend (Rust: `tauri-plugin-store`, appDataDir) | Browser/Client (`app-store.ts` JS wrapper) | Same tier split as every other Phase-4 persisted field — disk I/O must go through the Tauri-managed store plugin and its own capability scope, never a raw frontend `fetch`/write |
| Startup language restore | Browser/Client (boot effect in `AppShell`) | Backend (store read via plugin) | `i18n.init` stays synchronous (default `pt-BR`); the async store read and enum-validated `changeLanguage(saved)` call happen in a `useEffect`, mirroring the existing async `getRecents()` boot pattern in `HomeScreen.tsx` |
| i18n key-parity verification | Browser/Client (Vitest, build-time) | — | A pure data-shape check over the already-bundled `resources` object; no runtime/IPC surface |
| Bundler/installer packaging | CDN/Static-equivalent (Tauri CLI bundler, produces installer binaries) | Backend (Rust build, `Cargo.toml`/`tauri.conf.json`) | Packaging is a build-time, OS-native concern owned by the Tauri CLI + platform bundler toolchains (NSIS/WiX on Windows, `hdiutil`/`create-dmg` on macOS, `dpkg`/`appimagetool` on Linux) — not app runtime code |
| Release orchestration | External (GitHub Actions + `tauri-apps/tauri-action`) | Backend (Cargo/npm build invoked by the action) | The release pipeline lives entirely outside the shipped app; it drives the same `npm run build` + `cargo build` the app already has, per-OS, on GitHub-hosted runners |
| Update check trigger | Browser/Client (boot effect calling `check()`) | Backend (`tauri-plugin-updater` performs the actual HTTP fetch + comparison) | The frontend only decides *when* to ask; the plugin owns the network call, manifest parsing, and version comparison |
| Update signature verification + install | Backend (`tauri-plugin-updater`, Rust, ed25519) | — | Cryptographic verification and privileged binary replacement can never be delegated to the frontend — this is the plugin's entire reason to exist over a hand-rolled "download and run a new binary" flow |
| App relaunch after install | Backend (`tauri-plugin-process::restart`) | Browser/Client (`relaunch()` JS call triggers it) | Restarting the OS process is inherently a backend/native operation; JS only requests it |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `@tauri-apps/plugin-updater` | `^2.10.1` [VERIFIED: npm registry, checked 2026-07-24 — `npm view @tauri-apps/plugin-updater version`, published 2026-04-04] | JS API surface (`check()`, `Update.downloadAndInstall()`) for DIST-03 | Official `tauri-apps` plugin, same publisher/monorepo (`tauri-apps/plugins-workspace`) as the already-installed `plugin-store`/`plugin-notification`/`plugin-fs`/`plugin-dialog`/`plugin-opener` from prior phases; the only supported way to drive Tauri's own ed25519-signed updater from the frontend |
| `tauri-plugin-updater` | `"2"` (crate, latest resolved `2.10.1`) [VERIFIED: crates.io, checked 2026-07-24] | Rust-side plugin: signature verification, download, install, `Builder::new().build()` | Same org/repo as JS package; loose `"2"` pin matches the existing convention already used for `tauri-plugin-fs`/`tauri-plugin-dialog`/`tauri-plugin-opener`/`tauri-plugin-store`/`tauri-plugin-notification` in `Cargo.toml` |
| `@tauri-apps/plugin-process` | `^2.3.1` [VERIFIED: npm registry, checked 2026-07-24 — published 2025-10-27] | `relaunch()` — restarts the app after `downloadAndInstall()` completes | Official `tauri-apps` plugin; needed only if the DIST-03 UX auto-relaunches (CONTEXT.md leaves the exact UX to discretion, but relaunch requires this plugin regardless of which UX variant is chosen) |
| `tauri-plugin-process` | `"2"` (crate, latest resolved `2.3.1`) [VERIFIED: crates.io, checked 2026-07-24] | Rust-side `restart` command, `process:allow-restart` capability | Same org/repo; loose pin for consistency |

### Supporting

No new supporting libraries are needed for DIST-01/DIST-02. `i18next`/`react-i18next` (already `^26.3.6`/`^17.0.11`, installed since Phase 1), `@tauri-apps/plugin-store` (Phase 4, already installed), `lucide-react` (icons, already installed), and `date-fns`/`date-fns/locale` (already consuming `i18n.language`, Phase 1/4) cover the entire language-switcher surface. `tauri-apps/tauri-action@v1` is a GitHub Action reference (`uses:` in YAML), not an npm/crate dependency — no install step, no legitimacy-gate applicable in the package sense, but it is still an external, third-party-executed pipeline step and is documented under Security Domain.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@tauri-apps/plugin-updater` (Tauri's own ed25519-signed updater) | A hand-rolled "fetch a version.json, compare semver, download+replace binary" scheme | Rejected outright by `STACK.md`'s own "What NOT to Use" table (already locked project-wide, not just this phase): no signature verification means a compromised/MITM'd endpoint could serve an arbitrary binary that the app installs and runs with the user's OS privileges |
| GitHub Releases as the update endpoint (`releases/latest/download/latest.json`) | A self-hosted update server with `{{target}}/{{arch}}/{{current_version}}` templated URLs | CONTEXT.md's discretion note leaves the exact owner/repo slug open, but locks the mechanism to GitHub Releases (no new hosting infrastructure for a community open-source project); a self-hosted server only becomes worth the operational cost if update rollout needs server-side logic (staged rollouts, per-user targeting) — out of scope for v1 |
| OS-native code signing (Apple notarization, Windows EV cert) | Ship unsigned installers, accept the Windows SmartScreen warning | Locked decision (CONTEXT.md, `PITFALLS.md` precedent) — EV certs cost money a community project doesn't have; the ed25519 updater signature is the security boundary that matters for auto-update integrity, independent of OS code-signing certificates |
| `updater:allow-check` + `updater:allow-download-and-install` (two granular permissions matching the actual two-call JS flow) | `updater:default` (all four commands: check/download/install/downloadAndInstall) | `updater:default` is what the official docs show and is what CONTEXT.md's wording literally names; the narrower pair is more consistent with this codebase's own established "no catch-all" capability discipline (see Pitfall 2) — presented as an explicit choice for the planner, not resolved unilaterally here |
| Toggle (pt-BR ⇄ EN, single click) | Dropdown/select with room for future languages | CONTEXT.md locks MVP to a toggle; a dropdown only becomes necessary if a third language is added, which is explicitly out of scope (`## Deferred Ideas`) |

**Installation:**
```bash
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```
```toml
# src-tauri/Cargo.toml [dependencies]
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

**Version verification:** `npm view @tauri-apps/plugin-updater version` → `2.10.1` (published 2026-04-04); `npm view @tauri-apps/plugin-process version` → `2.3.1` (published 2025-10-27); `curl -A "gsd-research/1.0" https://crates.io/api/v1/crates/tauri-plugin-updater` → `max_stable_version: 2.10.1`; same query for `tauri-plugin-process` → `2.3.1`. All four confirmed directly against the npm/crates.io registries on 2026-07-24 (network available this session; the npm *downloads* telemetry endpoint, `api.npmjs.org`, was blocked by this sandbox's outbound proxy — `registry.npmjs.org` itself, used for `npm view`, was not — see Package Legitimacy Audit).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@tauri-apps/plugin-updater` | npm | Latest `2.10.1` published 2026-04-04; crate side has 44 published versions back to 2023-05-24 | Registry download telemetry unavailable in this sandbox (`api.npmjs.org` blocked by outbound proxy — `weeklyDownloads: null`) | `github.com/tauri-apps/plugins-workspace` (same monorepo as `plugin-store`/`plugin-notification`/`plugin-fs`/`plugin-dialog`/`plugin-opener`, all already installed and previously audited in Phase 4) | **SUS** (seam reason: `unknown-downloads`, a sandbox-telemetry gap, not a legitimacy finding) | Approved — same precedent already logged in `04-RESEARCH.md`'s Package Legitimacy Audit for `plugin-store`/`plugin-notification`. Official `tauri-apps` org, identical repo to four plugins already trusted in this codebase, `postinstall` script check returned none. CONTEXT.md itself frames this class of package as "pré-aprovável" — but per protocol the planner must still add a `checkpoint:human-verify` task before `npm install`. |
| `@tauri-apps/plugin-process` | npm | Latest `2.3.1` published 2025-10-27 (project is ~9 months old, not brand-new) | Same sandbox telemetry gap as above | `github.com/tauri-apps/plugins-workspace` | **SUS** (`unknown-downloads` only) | Approved — same rationale as above. Planner must add a `checkpoint:human-verify` task before `npm install`. |
| `tauri-plugin-updater` (crate) | crates.io | 44 versions, oldest 2023-05-24 | crates.io reports this directly, no sandbox gap on this registry: high-usage (hundreds of thousands of recent downloads, in the same range as `tauri-plugin-store`'s ~1.09M recent) | `github.com/tauri-apps/plugins-workspace` | OK | Approved, no checkpoint needed |
| `tauri-plugin-process` (crate) | crates.io | Multiple versions, `tauri-apps`/`tauri-bot` publisher | crates.io telemetry confirms an actively-used, legitimate package | `github.com/tauri-apps/plugins-workspace` | OK | Approved, no checkpoint needed |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process` (npm side only — both are the official `tauri-apps` plugin, same repo as five plugins already installed in this codebase across Phases 1-4; the SUS verdict is a sandbox `api.npmjs.org`-download-telemetry gap, not a real legitimacy concern). Planner must still insert a `checkpoint:human-verify` task before each `npm install`, per protocol.

`tauri-apps/tauri-action@v1` (GitHub Action, not an npm/crate package) — verified via direct GitHub tags query: `v1.0.0`/`v1.0`/`v1` are the current tags, official `tauri-apps` org repo, widely used in the Tauri distribution docs. Not subject to the npm/crates package-legitimacy gate (it's a workflow-file reference, executed only inside GitHub's CI sandbox, never installed locally in this session) — documented instead under `## Security Domain` as a supply-chain input the release workflow trusts.

## Architecture Patterns

### System Architecture Diagram

```
DIST-01 — language switcher + persistence

  ┌──────────────┐   click toggle    ┌───────────────────────┐
  │ LanguageSwitcher│ ───────────────▶│ i18n.changeLanguage(lng) │
  │ (Header + Home) │                 │ (react-i18next re-renders │
  └──────┬─────────┘                 │  every useTranslation()   │
         │                            │  consumer, incl. the two  │
         │ fire-and-forget            │  date-fns locale readers) │
         ▼                            └───────────┬───────────────┘
  ┌────────────────────┐                          │
  │ app-store.ts          │                          │ (already working,
  │ setLanguage(lng)       │                          │  Phase 1 infra)
  │ → withStoreLock         │
  │ → appStore.set(LANGUAGE_KEY, lng) │
  │ → appStore.save()          │
  └────────────────────┘

  On app boot (AppShell mount, BEFORE first paint if possible):
  ┌───────────────────┐   validate enum   ┌─────────────────────┐
  │ getLanguage() (async) │ ────────────────▶│ pt-BR|en ? changeLanguage │
  │ appStore.get(LANGUAGE_KEY) │  else: navigator.language │  saved) : no-op  │
  └───────────────────┘  starts with "en"?  └─────────────────────┘
                          en : pt-BR (default)

DIST-03 — update check

  ┌────────────────┐  useEffect on mount  ┌───────────────────────┐
  │ AppShell           │ ───────────────────▶│ checkForUpdate()          │
  └────────────────┘                      │ (src/updates/check-update.ts)│
                                           └───────────┬───────────────┘
                                                        │ check() [JS]
                                                        ▼
                                           ┌───────────────────────────┐
                                           │ tauri-plugin-updater (Rust)  │
                                           │ GET endpoints[0]               │
                                           │  (GitHub Releases latest.json)  │
                                           │ compare current_version ↔ version│
                                           └───────────┬───────────────────┘
                                                        │ Update | null
                                                        ▼
                                    ┌──────────────────────────────────┐
                                    │ if Update: downloadAndInstall()      │
                                    │  → ed25519 signature verified BEFORE │
                                    │    the artifact is ever written to    │
                                    │    disk/executed                       │
                                    │  → on success: relaunch() (plugin-process)│
                                    └──────────────────────────────────┘

DIST-02/DIST-03 — release pipeline (GitHub Actions, tag-triggered, NOT exercised in this sandbox)

  git tag vX.Y.Z / gh release ▶ .github/workflows/release.yml
        │
        ├─ windows-latest  ─┐
        ├─ macos-latest     ├─▶ tauri-apps/tauri-action@v1 (per-OS matrix)
        │  (aarch64+x86_64) │      → npm run build, cargo build --release
        └─ ubuntu-22.04    ─┘      → tauri bundler produces installer(s)
                                    → createUpdaterArtifacts: true → signs
                                      artifacts with TAURI_SIGNING_PRIVATE_KEY
                                    → generates latest.json (all platforms)
                                    → uploads installers + latest.json to
                                      the GitHub Release
```

### Recommended Project Structure

```
src/
├── i18n.ts                       # unchanged: sync init, default "pt-BR", 9 namespaces
├── persistence/
│   └── app-store.ts               # +LANGUAGE_KEY, +getLanguage()/setLanguage() (upsertRecent template)
├── updates/
│   └── check-update.ts            # NEW — thin wrapper, notify.ts style (module-cached promise, silent degrade)
├── shell/
│   ├── LanguageSwitcher.tsx       # NEW — toggle, mounted in Header AND HomeScreen (two mount points, one component)
│   ├── Header.tsx                 # +<LanguageSwitcher /> next to <SyncIndicator />
│   └── AppShell.tsx               # +boot effect: restore language (validated) + call checkForUpdate()
├── components/home/
│   └── HomeScreen.tsx             # +<LanguageSwitcher /> in its own header row (Header doesn't mount on Home)
└── locales/{pt-BR,en}/*.json      # unchanged content; +1 key-parity guard test

src/i18n.test.ts (or src/locales/parity.test.ts)  # NEW — recursive key-path diff across all 9 namespaces

src-tauri/
├── Cargo.toml                     # +tauri-plugin-updater = "2", +tauri-plugin-process = "2"
├── capabilities/default.json      # +updater:allow-check, +updater:allow-download-and-install (see Pitfall 2), +process:allow-restart
├── tauri.conf.json                # +bundle.icon[]/category/publisher/copyright/createUpdaterArtifacts, +bundle.windows.nsis, +bundle.linux, +bundle.macOS, +plugins.updater{endpoints,pubkey}
└── src/lib.rs                     # +.plugin(tauri_plugin_updater::Builder::new().build()), +.plugin(tauri_plugin_process::init())

.github/workflows/
├── ci.yml                         # unchanged (lint/test/cargo check+test on every push/PR)
└── release.yml                    # NEW — tag/release-triggered, tauri-apps/tauri-action@v1 matrix
```

### Pattern 1: `LanguageSwitcher` as one component, two mount points

**What:** A single `LanguageSwitcher` component (toggle, per CONTEXT.md discretion resolved to MVP toggle) rendered both inside `Header` (next to `SyncIndicator`, when a project is open) and inside `HomeScreen`'s own header row (since `AppShell.tsx:50-55` short-circuits to `<HomeScreen />` before `Header` ever mounts — confirmed by direct read of `AppShell.tsx` this session).
**When to use:** Any control that must be reachable from both the Home screen and the in-project shell, given the current "Home replaces the whole shell" routing pattern (Phase 4's Pattern 1).
**Example:**
```tsx
// src/shell/LanguageSwitcher.tsx
import { useTranslation } from "react-i18next";
import { setLanguage } from "../persistence/app-store";

const LANGUAGES = ["pt-BR", "en"] as const;
type SupportedLanguage = (typeof LANGUAGES)[number];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as SupportedLanguage)
    : "pt-BR";

  function handleToggle() {
    const next: SupportedLanguage = current === "pt-BR" ? "en" : "pt-BR";
    void i18n.changeLanguage(next);
    void setLanguage(next); // fire-and-forget persistence, notify.ts-style: never blocks the UI
  }

  return (
    <button type="button" onClick={handleToggle} aria-label="Toggle language">
      {current === "pt-BR" ? "PT" : "EN"}
    </button>
  );
}
```

### Pattern 2: persist + validate-before-restore (DIST-01)

**What:** `app-store.ts` gains a `LANGUAGE_KEY` following the exact `upsertRecent`/`withStoreLock` template already in the file, plus a boot-time read that treats the stored value as **untrusted** — it must match the closed enum exactly before being passed to `changeLanguage`.
**When to use:** Every place a value written by a prior app session is read back and fed into a function whose argument space is wider than the app's own intended values (`i18n.changeLanguage` accepts any string).
**Example:**
```ts
// src/persistence/app-store.ts — additive, same file/pattern as upsertRecent
const LANGUAGE_KEY = "language";
type SupportedLanguage = "pt-BR" | "en";
const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ["pt-BR", "en"];

export async function setLanguage(lng: SupportedLanguage): Promise<void> {
  return withStoreLock(async () => {
    await appStore.set(LANGUAGE_KEY, lng);
    await appStore.save();
  });
}

/** Returns the saved language ONLY if it's a recognized enum value — never
 * hands back an arbitrary/corrupted string for the caller to trust. */
export async function getLanguage(): Promise<SupportedLanguage | null> {
  const raw = await appStore.get<string>(LANGUAGE_KEY);
  return SUPPORTED_LANGUAGES.includes(raw as SupportedLanguage)
    ? (raw as SupportedLanguage)
    : null;
}
```
```tsx
// src/shell/AppShell.tsx — boot effect, additive
useEffect(() => {
  let cancelled = false;
  void getLanguage().then((saved) => {
    if (cancelled) return;
    if (saved) {
      if (saved !== i18n.language) void i18n.changeLanguage(saved);
      return;
    }
    // No saved choice yet — CONTEXT.md fallback: navigator.language when it
    // starts with "en", pt-BR otherwise (already the i18n.init default).
    if (navigator.language.toLowerCase().startsWith("en")) {
      void i18n.changeLanguage("en");
    }
  });
  return () => { cancelled = true; };
}, []);
```

### Pattern 3: `check-update.ts` — thin wrapper mirroring `notify.ts` (DIST-03)

**What:** One function per updater operation, promise cached at module scope, never throws — the exact discipline `src/notifications/notify.ts` already establishes for `@tauri-apps/plugin-notification`.
**When to use:** Any new Tauri plugin whose JS surface is called from a UI boot effect where a plugin failure (daemon absent, network down, endpoint 404) must never break app startup.
**Example:**
```ts
// src/updates/check-update.ts
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";

let pendingCheck: Promise<Update | null> | null = null;

/** Checks for an update at most once per app run (module-cached, like
 * ensurePermission() in notify.ts) — never throws; a network/endpoint
 * failure degrades to "no update found" rather than surfacing an error UI. */
export function checkForUpdate(): Promise<Update | null> {
  if (!pendingCheck) {
    pendingCheck = check().catch(() => null);
  }
  return pendingCheck;
}

/** Downloads, verifies (ed25519, inside the plugin — never in this file),
 * installs, and relaunches. Caller decides WHEN to call this (auto vs.
 * user-confirmed banner — UI-SPEC's call, CONTEXT.md `## Claude's Discretion`). */
export async function installUpdateAndRelaunch(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
```

### Pattern 4: minimal valid `bundle` config (DIST-02)

**What:** The current `tauri.conf.json` bundle block (`{ "active": true, "targets": "all" }`) needs icon references, metadata, and `createUpdaterArtifacts`, plus per-target sections that are safe defaults (no OS code-signing secrets required).
**Example:**
```jsonc
// src-tauri/tauri.conf.json — bundle section, additive
{
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "category": "DeveloperTool",
    "publisher": "GSD Cards contributors",
    "copyright": "Copyright © 2026 GSD Cards contributors",
    "shortDescription": "Graphical interface for the Claude CLI + gsd-core workflow",
    "longDescription": "Desktop app that mirrors your .planning/ artifacts as a real-time kanban board and manages persistent Claude CLI sessions.",
    "createUpdaterArtifacts": true,
    "windows": {
      "nsis": {
        "installMode": "currentUser"
      }
    },
    "linux": {
      "deb": {},
      "appimage": {}
    },
    "macOS": {
      "minimumSystemVersion": "10.15"
    }
  },
  "plugins": {
    "updater": {
      "pubkey": "PLACEHOLDER_REPLACE_WITH_REAL_PUBKEY_FROM_tauri_signer_generate",
      "endpoints": [
        "https://github.com/FelipeStahl/gsd-cards/releases/latest/download/latest.json"
      ]
    }
  }
}
```
*(`icon`/`category`/`publisher`/`copyright`/`shortDescription`/`longDescription` and the per-target sections all validate as JSON/Tauri-schema-shaped without a real signing key; only the actual `tauri build` invocation on a maintainer/CI machine with `TAURI_SIGNING_PRIVATE_KEY` set will produce real signed artifacts — this config is safe to author and `cargo check`-validate in this headless session.)*

### Pattern 5: `release.yml` — `tauri-apps/tauri-action@v1` matrix

**What:** A tag/release-triggered workflow, separate from `ci.yml`, that builds, signs, and publishes installers for all three OSes plus both macOS architectures.
**Example:**
```yaml
# .github/workflows/release.yml
name: release

on:
  push:
    tags:
      - 'v*'

jobs:
  publish-tauri:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: 'macos-latest'
            args: '--target aarch64-apple-darwin'
          - platform: 'macos-latest'
            args: '--target x86_64-apple-darwin'
          - platform: 'ubuntu-22.04'
            args: ''
          - platform: 'windows-latest'
            args: ''

    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - name: Install Tauri Linux system dependencies
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential xdg-utils

      - name: Install npm dependencies
        run: npm ci

      - uses: tauri-apps/tauri-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: v__VERSION__
          releaseName: 'GSD Cards v__VERSION__'
          releaseBody: 'See the assets below to download and install this version.'
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```
*(`TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD` are absent from GitHub Actions secrets until the maintainer registers them — this workflow is correct YAML and will pass `actionlint`/YAML-parser validity checks in this session, but a real run will fail at the signing step until the maintainer completes the Manual-Only steps in `## Assumptions Log`/`CONTEXT.md`.)*

### Anti-Patterns to Avoid

- **Trusting the raw stored language string:** never call `i18n.changeLanguage(await appStore.get("language"))` directly — always route through an enum-validating `getLanguage()` (Pattern 2). A corrupted/manually-edited `app-state.json` should degrade to the default, not propagate an arbitrary string into `i18next`.
- **Comparing translation *values* for parity:** an i18n key-parity test that does `JSON.stringify(ptBR) === JSON.stringify(en)` will always fail by design (the whole point is that values differ) — compare **key structure only** (see `## Code Examples`).
- **Generating or committing a real signing key in this session:** the placeholder `pubkey` in Pattern 4 must stay obviously non-functional; never run `tauri signer generate` and paste real output into a scaffolded file, and never write a `TAURI_SIGNING_PRIVATE_KEY`-shaped value anywhere in the repo, docs, or commit history.
- **Setting `dangerousInsecureTransportProtocol: true`** (seen in the official plugin's own test fixture) in the real `plugins.updater` config — that flag exists only to let the plugin's test suite point at an unencrypted `localhost` endpoint; a production config must never set it, and the GitHub Releases endpoint is HTTPS by construction.
- **Using `updater:default` without a documented reason** when the codebase's own established discipline is per-command `allow-*` grants — see Pitfall 2 for the concrete alternative.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Auto-update mechanism (download, verify, install, relaunch) | A custom "fetch version.json, compare semver, download zip, overwrite binary" script | `@tauri-apps/plugin-updater` + `tauri-plugin-updater` | Hand-rolled updaters routinely skip cryptographic signature verification, correct partial-download handling, and platform-specific install semantics (macOS `.app` replacement, Windows running-executable-locking); the official plugin solves exactly this and is already the project's own locked decision (`STACK.md` "What NOT to Use") |
| Release artifact signing | A bespoke SHA-256 checksum file checked manually or via a custom script | Tauri's built-in ed25519 scheme (`createUpdaterArtifacts` + `tauri signer generate` + the plugin's automatic verification before install) | Checksums alone only detect corruption, not tampering by a party controlling the hosting endpoint (e.g. a compromised GitHub account or MITM'd CDN); a signature keyed to a private key never uploaded anywhere is the actual security property needed |
| Cross-platform installer generation | Separate hand-written NSIS/WiX scripts, a custom `.dmg`-building shell script, and a manual `.deb`/AppImage packaging pipeline | The Tauri CLI bundler (`tauri build`, driven by `bundle` config in `tauri.conf.json`) | The bundler already wraps NSIS (Windows), `hdiutil`/equivalent (macOS `.dmg`), and `dpkg-deb`/`appimagetool` (Linux) behind one config surface; hand-writing three separate packaging pipelines triples the maintenance surface for a community project with one part-time maintainer |
| Release CI orchestration (build-per-OS, collect artifacts, generate manifest, upload, sign) | A custom GitHub Actions workflow that shells out to `tauri build` per OS and manually assembles `latest.json` | `tauri-apps/tauri-action@v1` | The action already handles the OS matrix quirks (Linux system deps, macOS dual-arch targets), generates the exact `latest.json` shape the updater plugin expects, and performs the signing step correctly — reimplementing this is a large amount of brittle YAML for a solved problem |
| i18n language detection from the browser/OS | A hand-rolled `navigator.language` parser with locale-string edge cases (e.g. `en-US` vs `en-GB` vs bare `en`) | The simple `startsWith("en")` check CONTEXT.md locks in (closed 2-language enum makes a full locale-negotiation library like `i18next-browser-languagedetector` unnecessary overhead for this scope) | A general-purpose locale-detection library solves a much bigger problem (dozens of locale variants, `Accept-Language` header parsing) than a fixed 2-value enum needs; adding it here would be premature complexity for a scope CONTEXT.md explicitly keeps to pt-BR/en only |

**Key insight:** every net-new mechanism in this phase (signed auto-update, cross-platform packaging, release CI) has an official, already-decided, already-installed-elsewhere-in-the-project answer. The actual engineering risk in Phase 5 is not "which library" but "did the placeholder-vs-real-key boundary get scaffolded correctly, and did the granular-capability convention get followed" — both addressed above.

## Common Pitfalls

### Pitfall 1: `i18n.init` is synchronous, but the persisted language read is async — a startup "flash"
**What goes wrong:** The app always paints its first frame in `pt-BR` (the `i18n.init` default), then — once the async `getLanguage()` store read resolves — flips to the saved `en` choice a frame or two later, producing a visible flash for `en`-preferring users.
**Why it happens:** `i18next.init` in `src/i18n.ts` is deliberately synchronous with a hardcoded default (established since Phase 1); the store read is necessarily async (`@tauri-apps/plugin-store` is IPC-backed).
**How to avoid:** Run the restore effect as early as possible in the render tree (top of `AppShell`, before any other effect) so the window is as short as possible; document the flash as an accepted MVP tradeoff rather than architecting a blocking-splash-screen solution, which is out of scope for this phase's effort level. If it becomes a real UX complaint later, the fix is a synchronous read at bootstrap (e.g. a Rust command that returns the saved language before the webview even renders) — not something to build speculatively now.
**Warning signs:** Visual language flash reported in manual testing; if a future phase adds a splash/loading screen, revisit whether the restore can move earlier.

### Pitfall 2: `updater:default` vs. granular `allow-*` — a convention mismatch, not a bug
**What goes wrong:** Copying the official docs' capability snippet verbatim (`"permissions": ["updater:default"]`) grants `allow-check`, `allow-download`, `allow-install`, AND `allow-download-and-install` — but this codebase's own `capabilities/default.json` header comment explicitly states the opposite convention ("nunca o bundle catch-all"), already followed for `store`/`notification`/`fs`.
**Why it happens:** CONTEXT.md's own wording ("capability granular `updater:default`") is ambiguous — it could mean "the specific scoped capability entry named `updater:default`" (matching official docs) or could be a loose paraphrase intending the project's usual per-command discipline.
**How to avoid:** The plan should explicitly choose `updater:allow-check` + `updater:allow-download-and-install` (the two calls Pattern 3's `check-update.ts` actually makes) UNLESS the standalone `downloadAndInstall`-vs-separate-`download`+`install` UX choice (CONTEXT.md discretion) ends up needing the separate two-step flow, in which case all four individual `allow-*` entries (still not `updater:default`) are the convention-consistent choice.
**Warning signs:** A code reviewer or `checkpoint:human-verify` step flags the capability grant as broader than what the code in `check-update.ts` actually calls.

### Pitfall 3: placeholder `pubkey` must be syntactically safe, not just semantically fake
**What goes wrong:** If the placeholder value in `plugins.updater.pubkey` is an empty string, `null`, or missing the field entirely, `tauri build`/`cargo check` behavior with `createUpdaterArtifacts: true` set is not guaranteed identical across Tauri versions — some configurations may fail JSON-schema validation at build time rather than only at runtime-verify time.
**Why it happens:** The updater plugin's config schema likely expects `pubkey` to be a base64-shaped string (it validates the *shape*, not that it's a real, working key) even when a real signature will never actually be produced without the real private key.
**How to avoid:** Use an obviously-fake but correctly base64-shaped placeholder (e.g. a clearly-labeled dummy string, NOT empty/null/omitted), and verify `cargo check --manifest-path src-tauri/Cargo.toml` plus a JSON-schema-valid parse of `tauri.conf.json` both pass in this headless session before considering the config task done. Add an inline comment plus a doc note (mirroring the existing `WINDOWS.md` Manual-Only convention) that the placeholder must be replaced before any real release build.
**Warning signs:** `cargo check` or `npx tauri build --help`-adjacent config-loading step fails specifically on the `plugins.updater` block.

### Pitfall 4: this sandbox can validate config shape, never produce real installers
**What goes wrong:** Assuming `cargo check`/`npm run build`/JSON validity passing in this headless Linux session means the Windows NSIS/macOS `.dmg` bundlers actually work is a false signal — `tauri build`'s bundler step for Windows/macOS targets requires those host OSes (or cross-compilation toolchains this project does not set up).
**Why it happens:** `tauri.conf.json`'s `bundle.windows`/`bundle.macOS` sections are pure JSON and validate fine anywhere; the actual NSIS/`hdiutil` invocation only happens on the matching OS.
**How to avoid:** Treat config authoring, `cargo check`, and YAML validity as the full scope of what's headless-verifiable this phase (already named explicitly in `05-CONTEXT.md`'s "Fronteira honesta"); every installer-produces-a-working-binary claim is Manual-Only, verified on the CI matrix (`release.yml`, which itself is new and unexercised until a real tag push) or the maintainer's own Windows machine (existing `WINDOWS.md` precedent).
**Warning signs:** A plan task that claims "verify the Windows installer works" without a `checkpoint:human-verify` or CI-only marker is a scope violation for this session.

### Pitfall 5: i18n parity test comparing values instead of key structure
**What goes wrong:** A naive "deep equal the two namespace objects" test fails immediately and permanently, because pt-BR and en values are *supposed* to differ — the test needs to assert the two objects have the same **set of key paths**, not the same values at those paths.
**Why it happens:** `assert.deepEqual`/`toEqual` compares values by default; nobody would reach for it if they stopped to think about it, but it's an easy first draft to write wrong under time pressure.
**How to avoid:** Recursively collect key paths (e.g. `"stale.body"`, `"actions.reconnect"`) from both trees per namespace, then diff the two **sets** of paths — see `## Code Examples`.
**Warning signs:** A key-parity test that immediately fails on every namespace at first write (a sign it's comparing values, not keys).

## Code Examples

Verified/derived patterns:

### i18n key-parity test (all 9 namespaces, key-structure diff)
```ts
// src/locales/parity.test.ts
import { describe, expect, it } from "vitest";
import { resources } from "../i18n";

/** Recursively collects dotted key paths from a nested translation object —
 * e.g. { stale: { body: "..." } } → ["stale.body"]. Never compares values:
 * pt-BR and en are SUPPOSED to differ in content (Pitfall 5). */
function collectKeyPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([key, value]) =>
    collectKeyPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n namespace parity (pt-BR ⇄ en)", () => {
  const namespaces = Object.keys(resources["pt-BR"]) as Array<
    keyof (typeof resources)["pt-BR"]
  >;

  it.each(namespaces)("namespace %s has identical key sets in both locales", (ns) => {
    const ptKeys = new Set(collectKeyPaths(resources["pt-BR"][ns]));
    const enKeys = new Set(collectKeyPaths(resources.en[ns]));

    const missingInEn = [...ptKeys].filter((k) => !enKeys.has(k));
    const missingInPt = [...enKeys].filter((k) => !ptKeys.has(k));

    expect({ missingInEn, missingInPt }).toEqual({ missingInEn: [], missingInPt: [] });
  });
});
```

### Mocking the updater plugin in tests (mirrors `notify.test.ts`'s `vi.mock` + `vi.resetModules` pattern)
```ts
// src/updates/check-update.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const checkMock = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({ check: checkMock }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  checkMock.mockReset();
});

describe("checkForUpdate", () => {
  it("caches the result — a second call does not re-invoke check()", async () => {
    checkMock.mockResolvedValue(null);
    const { checkForUpdate } = await import("./check-update");
    await checkForUpdate();
    await checkForUpdate();
    expect(checkMock).toHaveBeenCalledTimes(1);
  });

  it("degrades to null (never throws) when check() rejects", async () => {
    checkMock.mockRejectedValue(new Error("network down"));
    const { checkForUpdate } = await import("./check-update");
    await expect(checkForUpdate()).resolves.toBeNull();
  });
});
```

### `lib.rs` plugin registration (additive to the existing `Builder` chain)
```rust
// src-tauri/src/lib.rs — additive inside the existing tauri::Builder::default() chain
.plugin(tauri_plugin_updater::Builder::new().build())
.plugin(tauri_plugin_process::init())
```

### `capabilities/default.json` additions (granular — see Pitfall 2)
```jsonc
{
  "permissions": [
    // ...existing entries unchanged...
    "updater:allow-check",
    "updater:allow-download-and-install",
    "process:allow-restart"
  ]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Tauri v1 updater config (`tauri.updater.active`/`tauri.updater.dialog` under a `tauri` top-level key) | Tauri v2 plugin-based updater (`plugins.updater`, `bundle.createUpdaterArtifacts`) | Tauri v2 GA (this project is v2-only, `tauri.conf.json` already uses the v2 `$schema`) | Any v1-era blog post/StackOverflow answer showing `"tauri": { "updater": {...} }` is stale for this project — confirmed the config shape used throughout this research is v2's `plugins.updater` |
| `xtermjs`-adjacent "no i18n plan, hardcode strings" starting point | i18next + react-i18next with a 9-namespace split, already fully built since Phase 1 | N/A — established at project inception per `PROJECT.md`'s i18n pt-BR/en requirement | Phase 5 adds only the switcher UI + persistence + parity test; no i18n architecture work remains |

**Deprecated/outdated:** none directly relevant beyond the v1→v2 updater config shape above — no other Phase-5-relevant API surface (i18next, tauri-action, tauri-plugin-store) showed a deprecation notice in the sources checked this session.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The exact `latest.json` endpoint URL format for GitHub Releases (`https://github.com/<owner>/<repo>/releases/latest/download/latest.json`, static, no template variables) | Standard Stack, Pattern 4 | Cross-checked across 3+ independent WebSearch sources (community blog posts + a `tauri-apps/tauri` GitHub Discussion) but not directly fetched from `v2.tauri.app` itself (403'd this session) — if Tauri v2 changed this convention, the endpoint in the scaffolded config would need correction; low risk since the URL is trivially testable once a real release exists |
| A2 | `updater:default` bundles exactly `allow-check`/`allow-download`/`allow-install`/`allow-download-and-install` (no other commands) | Common Pitfalls Pitfall 2 | Sourced from a direct GitHub raw fetch of the plugin's `permissions/default.toml`-equivalent this session (treated as CITED, not VERIFIED, since the exact fetched file path was inferred rather than confirmed byte-for-byte against a pinned commit) — if wrong, the granular-permission recommendation in Pitfall 2 might omit a command the UX actually needs |
| A3 | The final owner/repo GitHub slug for the updater endpoint and the release tag naming convention (`v__VERSION__`) | Pattern 4, Pattern 5 | CONTEXT.md explicitly leaves this to discretion/placeholder; using `FelipeStahl/gsd-cards` (from `package.json`'s `repository.url`, already in the codebase) as the concrete placeholder — low risk, trivially correct if the repo doesn't move, but the planner should confirm the slug against the actual GitHub remote before treating it as final |
| A4 | `bundle.macOS.minimumSystemVersion: "10.15"` and `bundle.windows.nsis.installMode: "currentUser"` are safe, commonly-used defaults that don't require additional per-target research this phase | Pattern 4 | Based on general Tauri bundler convention (training knowledge, not directly verified against official docs this session — `v2.tauri.app`'s bundler config reference page was not successfully fetched) — if the schema differs, `cargo check`/config validity would still likely pass (loose JSON schema) but real macOS/Windows builds could produce unexpected install behavior; low severity since this is Manual-Only-verified territory anyway |

**If this table is empty:** N/A — see rows above; none of these assumptions block planning, but A1/A3 in particular should be spot-checked against the real repo/GitHub state before the release workflow is treated as final.

## Open Questions

1. **Exact UX for the update prompt (auto-install-and-relaunch vs. discrete banner)**
   - What we know: `check-update.ts` (Pattern 3) exposes both `checkForUpdate()` and `installUpdateAndRelaunch()` as separable calls — either UX is mechanically supported by the same wrapper.
   - What's unclear: Whether the MVP auto-installs silently (higher friction if it interrupts an active `claude` session mid-work) or shows a dismissible banner (more code, better UX for a terminal-heavy app where an unexpected relaunch could interrupt a live PTY session).
   - Recommendation: Explicitly named as `## Claude's Discretion` in CONTEXT.md, resolved in UI-SPEC — but flag for the planner that an in-progress PTY session losing state on an unannounced relaunch is a real UX risk worth weighing toward the banner variant, given SESS-04's snapshot/resume mechanism (Phase 4) exists precisely to make session interruption survivable — auto-relaunch is *safe* mechanically (sessions restore), but still an interruption a banner avoids.

2. **Final GitHub owner/repo slug for the updater endpoint**
   - What we know: `package.json`'s `repository.url` already names `FelipeStahl/gsd-cards`.
   - What's unclear: Whether this is the final, permanent slug the maintainer intends to publish releases under (CONTEXT.md explicitly allows a placeholder if not yet fixed).
   - Recommendation: Use `FelipeStahl/gsd-cards` as the concrete value (not a generic `<owner>/<repo>` placeholder) since it's already the codebase's own stated repository — cheap to correct later via a single config-line edit if it changes, per Assumption A3.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|-----------|
| Rust toolchain (`cargo`, `rustc`) | `cargo check`/`cargo test` after adding `tauri-plugin-updater`/`tauri-plugin-process` | ✓ | `cargo 1.94.1`, `rustc 1.94.1` | — |
| Node.js / npm | `npm install`, `npm run typecheck`, `npm run test` for the new JS plugins/switcher/wrapper | ✓ | Node `v22.22.2`, npm `10.9.7` | — |
| `@tauri-apps/cli` (`tauri`/`cargo tauri`) | Validating `tauri.conf.json` structurally, `tauri signer generate` (Manual-Only) | ✓ (via `npx`) | `tauri-cli 2.11.4` (matches `STACK.md`'s pinned `^2.11.4`) | — |
| `actionlint` (GitHub Actions YAML linter) | Strict schema-validation of `release.yml` beyond bare YAML syntax | ✗ | — | Fall back to plain YAML-syntax validation: `python3 -c "import yaml; yaml.safe_load(open('...'))"` (Python 3 + PyYAML 6.0.1 confirmed available) or `node_modules/.bin/js-yaml release.yml` (already present as a transitive dependency) — catches malformed YAML but not GitHub-Actions-schema-specific errors (e.g. an invalid `uses:` ref); those are only caught by GitHub itself on push |
| Windows/macOS build hosts (NSIS, `.dmg` bundler, code-signing tooling) | Producing real DIST-02 installers | ✗ (Linux-only sandbox) | — | Manual-Only per `05-CONTEXT.md`'s own "Fronteira honesta" — verified on the maintainer's Windows machine (existing `WINDOWS.md` precedent) or the new `release.yml` CI matrix, never in this session |
| Live GitHub Releases endpoint serving a real `latest.json` | End-to-end signed update round-trip | ✗ | — | Manual-Only — requires a real tagged release with real signing secrets configured, explicitly deferred in `05-CONTEXT.md ## Deferred Ideas` |

**Missing dependencies with no fallback:** none — every missing dependency above has a documented, already-used fallback pattern (Manual-Only verification, matching the existing `WINDOWS.md` convention) or a viable local substitute (YAML-syntax-only validation without `actionlint`).
**Missing dependencies with fallback:** `actionlint` (use `python3`+`PyYAML` or `js-yaml` for syntax-only validation); Windows/macOS build hosts and a live update endpoint (both Manual-Only, matching `05-CONTEXT.md`'s explicit headless/human boundary).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.10 (frontend), `cargo test` (backend) — both already configured and used throughout the codebase, no new framework needed |
| Config file | `vitest.config.ts` (jsdom environment, `src/test/setup.ts`); Rust tests inline `#[cfg(test)] mod tests` per file, same convention as `pty.rs`/`project.rs` |
| Quick run command | `npx vitest run src/locales/parity.test.ts src/persistence/app-store.test.ts src/updates/check-update.test.ts src/shell/LanguageSwitcher.test.tsx` (frontend); `cargo check --manifest-path src-tauri/Cargo.toml` (backend, config/plugin-wiring compiles) |
| Full suite command | `npm test` (== `vitest run`); `cargo test --manifest-path src-tauri/Cargo.toml` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|---------------|
| DIST-01 | `LanguageSwitcher` toggles `i18n.language` and calls `setLanguage` persistence on click | unit | `vitest run src/shell/LanguageSwitcher.test.tsx` | ❌ Wave 0 |
| DIST-01 | Saved language round-trips through `app-store.ts` (`setLanguage` → `getLanguage` returns the same value) | unit | `vitest run src/persistence/app-store.test.ts -t "language"` | ❌ Wave 0 (extend existing file) |
| DIST-01 | `getLanguage()` returns `null` (not an arbitrary string) for a corrupted/unrecognized stored value | unit | `vitest run src/persistence/app-store.test.ts -t "language enum validation"` | ❌ Wave 0 |
| DIST-01 | Boot effect: no saved language + `navigator.language` starting with `en` → `changeLanguage("en")`; otherwise stays `pt-BR` | unit (mocked `navigator.language`) | `vitest run src/shell/AppShell.test.tsx -t "language restore"` | ❌ Wave 0 (extend existing file) |
| DIST-01 | All 9 namespaces have identical key structure between `pt-BR` and `en` | unit | `vitest run src/locales/parity.test.ts` | ❌ Wave 0 |
| DIST-01 | `SyncIndicator`/`SessionRow` re-render with the correct `date-fns` locale after a language switch | unit (extend existing files) | `vitest run src/components/SyncIndicator.test.tsx src/components/session/SessionRow.test.tsx` | ✅ (extend existing files) |
| DIST-02 | `tauri.conf.json` (with the new `bundle`/`plugins.updater` blocks) is valid JSON and matches the Tauri v2 config schema | config validity | `cargo check --manifest-path src-tauri/Cargo.toml` (fails to build if the config doesn't parse/validate) | N/A (config, not a test file) |
| DIST-02 | `.github/workflows/release.yml` is syntactically valid YAML | config validity | `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml'))"` | N/A (config, not a test file) |
| DIST-02 | Real Windows/macOS/Linux installers actually install and launch the app | manual/CI-only | N/A — **Manual-Only**, verified on `release.yml`'s real CI run or the maintainer's Windows machine per `WINDOWS.md` | N/A |
| DIST-03 | `checkForUpdate()` caches its result and never throws (network failure, endpoint 404, malformed manifest) | unit (mocked `@tauri-apps/plugin-updater`) | `vitest run src/updates/check-update.test.ts` | ❌ Wave 0 |
| DIST-03 | `installUpdateAndRelaunch` calls `downloadAndInstall()` then `relaunch()` in order | unit (mocked `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process`) | `vitest run src/updates/check-update.test.ts -t "installUpdateAndRelaunch"` | ❌ Wave 0 (same file as above) |
| DIST-03 | Rust side compiles with the updater/process plugins registered and the capability grants applied | integration | `cargo check --manifest-path src-tauri/Cargo.toml` | N/A (build-level check) |
| DIST-03 | Real signed update round-trip (endpoint serves a genuine signed `latest.json`, app verifies + installs + relaunches) | manual/CI-only | N/A — **Manual-Only**, requires the maintainer's real ed25519 keypair + a real tagged release; explicitly `## Deferred Ideas` in `05-CONTEXT.md` | N/A |

### Sampling Rate

- **Per task commit:** the scoped quick-run command for the module touched (see table above); `cargo check` after any `Cargo.toml`/`lib.rs`/`tauri.conf.json` edit.
- **Per wave merge:** `npm test` (frontend) + `cargo test` (backend, from `src-tauri/`).
- **Phase gate:** both full suites green before `/gsd-verify-work`, PLUS a manual confirmation that the config-only tasks (`bundle`, `plugins.updater`, `release.yml`) are internally consistent with the placeholder-pubkey convention (Pitfall 3) before considering DIST-02/DIST-03 "done" in the headless sense.

### Wave 0 Gaps

- [ ] `src/locales/parity.test.ts` — covers DIST-01's 9-namespace key-structure parity guard
- [ ] `src/shell/LanguageSwitcher.test.tsx` — covers the toggle's click → `changeLanguage` + `setLanguage` behavior
- [ ] `src/updates/check-update.test.ts` — covers DIST-03's `checkForUpdate`/`installUpdateAndRelaunch` wrapper (mocked plugin, `notify.test.ts`-style)
- [ ] Extend `src/persistence/app-store.test.ts` with `setLanguage`/`getLanguage` round-trip + enum-validation cases
- [ ] Extend `src/shell/AppShell.test.tsx` with the boot-time language-restore effect (mocked `navigator.language`, mocked store)
- [ ] Mock helpers for `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` (`vi.mock(...)`, following the exact dynamic-import-after-`vi.resetModules()` pattern already established in `notify.test.ts`)
- [ ] Framework install: none — vitest/cargo test already fully configured; only new test *files*, no new tooling

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|-----------------|---------|---------------------|
| V2 Authentication | no | Single-user local desktop app; no auth surface introduced this phase |
| V3 Session Management | no | N/A — no web-session concept in this phase |
| V4 Access Control | no | No new filesystem/process scope introduced beyond what Phase 4's `plugin-store` capability already covers (language is just another key in the same store) |
| V5 Input Validation | yes | The persisted language value is untrusted app-local data and MUST be validated against the closed `pt-BR \| en` enum before being passed to `i18n.changeLanguage` (Pattern 2) — never trust a stored string just because it lives under `appDataDir` |
| V6 Cryptography | yes | Update artifact integrity is entirely dependent on the ed25519 signature `tauri-plugin-updater` verifies before install — never hand-roll this (see `## Don't Hand-Roll`); the private key must never be generated or held in this session (see Assumptions/CONTEXT) |
| V14 Configuration | yes | Release CI secrets (`TAURI_SIGNING_PRIVATE_KEY`, `_PASSWORD`) must live only in GitHub Actions repository secrets, never in `tauri.conf.json`, committed files, or workflow-step `echo`/log output; the updater endpoint must be HTTPS (`dangerousInsecureTransportProtocol` must stay unset/false in the real config) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| A compromised/MITM'd update endpoint serves a malicious installer | Tampering / Elevation of Privilege | `tauri-plugin-updater` verifies the ed25519 signature against the configured `pubkey` BEFORE the downloaded artifact is written to disk or executed — this only holds if the pubkey in the shipped app is the maintainer's real one (placeholder must never ship in a real release) and the endpoint is HTTPS (GitHub Releases satisfies this by construction) |
| `dangerousInsecureTransportProtocol: true` accidentally left enabled in a real config (copy-pasted from the plugin's own test fixtures, seen this session at `plugins/updater/tests/app-updater/tauri.conf.json`) | Tampering | Never set this flag in the real (non-test) `tauri.conf.json`; the scaffolded Pattern 4 config omits it entirely — flag any future PR that adds it as a regression |
| Stored language value tampered/corrupted in plaintext `app-state.json` (locally editable by anyone with the same OS-user privileges as the app) | Tampering | Low severity (worst case: `i18n.changeLanguage` receives an unrecognized string and either no-ops or falls back per i18next's own `fallbackLng`) but mitigated defense-in-depth by the enum-validating `getLanguage()` in Pattern 2 — never pass the raw stored value straight into `changeLanguage` |
| CI secret leakage: `TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD` echoed, base64-transformed-then-printed, or accidentally written to a build artifact/log inside `release.yml` | Tampering / Elevation of Privilege | Reference secrets only via `${{ secrets.* }}` inside `env:` blocks passed straight to `tauri-apps/tauri-action`, never in `run:` steps that could echo/transform them; GitHub Actions auto-redacts exact literal secret values in logs but does NOT redact transformed (e.g. re-encoded) copies |
| Third-party GitHub Action (`tauri-apps/tauri-action@v1`) as a supply-chain input to the release pipeline | Tampering (supply chain) | Pin to a specific major-version tag (`@v1`, matching the officially documented usage) rather than `@main`/`@latest`; the action is maintained by the same `tauri-apps` org already trusted throughout this project's dependency tree — no additional untrusted third party introduced |
| Malicious `.planning/`/community-contributed folder opened as a "recent project" causing prompt injection into `claude` | Information Disclosure | Out of scope for THIS phase — already the inherited threat model from Phase 1's PROJ-02 manual-open flow; named here only so it isn't mistaken for a new attack surface Phase 5 introduces |

## Sources

### Primary (HIGH confidence)
- `npm view @tauri-apps/plugin-updater version` / `npm view @tauri-apps/plugin-process version` — direct npm registry query, 2026-07-24
- `curl -A "gsd-research/1.0" https://crates.io/api/v1/crates/tauri-plugin-updater` / `.../tauri-plugin-process` — direct crates.io API query (version, publisher, repo, download counts), 2026-07-24
- `curl -A "gsd-research/1.0" https://api.github.com/repos/tauri-apps/tauri-action/tags` — direct GitHub API query confirming `v1.0.0`/`v1` as the current tag, 2026-07-24
- `gsd-tools query package-legitimacy check` (npm + crates ecosystems) — direct seam invocation, 2026-07-24
- Direct codebase reads: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src-tauri/icons/*`, `src/i18n.ts`, `src/locales/{pt-BR,en}/*.json`, `src/persistence/app-store.ts`, `src/notifications/notify.ts`, `src/shell/AppShell.tsx`, `src/shell/Header.tsx`, `src/shell/ProjectSwitcherButton.tsx`, `src/components/home/HomeScreen.tsx`, `src/components/SyncIndicator.tsx`, `.github/workflows/ci.yml`, `package.json`, `.planning/config.json`, `.planning/WINDOWS.md`

### Secondary (MEDIUM confidence)
- `raw.githubusercontent.com/tauri-apps/tauri-docs/v2/src/content/docs/plugin/updater.mdx` — official docs repo, fetched directly (`v2.tauri.app/plugin/updater/` itself returned 403 to `WebFetch` this session)
- `raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/updater/tests/app-updater/tauri.conf.json` — official plugin repo test fixture, fetched directly (source of the `dangerousInsecureTransportProtocol` anti-pattern warning)
- `raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/updater/permissions/default.toml` (equivalent) and `.../plugins/process/permissions/autogenerated/commands/restart.toml` — official plugin repo, fetched directly, source of the granular permission identifiers cited in Pitfall 2
- `raw.githubusercontent.com/tauri-apps/tauri-action/dev/examples/publish-to-auto-release.yml` — official action repo example workflow, fetched directly (basis for Pattern 5, adapted for `windows-latest`/`macos-latest` dual-arch/`ubuntu-22.04` and this project's `npm`/existing `ci.yml` conventions)
- WebSearch cross-checked across `ratulmaharaj.com`, `thatgurjot.com`, `tauri.by.simon.hyll.nu`, and a `tauri-apps/tauri` GitHub Discussion (#10206) — GitHub Releases `latest.json` static endpoint URL convention (Assumption A1)

### Tertiary (LOW confidence)
- General training-knowledge defaults for `bundle.macOS.minimumSystemVersion`/`bundle.windows.nsis.installMode` (Assumption A4) — not directly verified against an official bundler-config reference page this session

## Metadata

**Confidence breakdown:**
- Standard stack (`plugin-updater`/`plugin-process` versions, install steps, capability identifiers): HIGH — versions verified directly against npm/crates.io registries; permission identifiers CITED from official GitHub repo content fetched directly
- Architecture (LanguageSwitcher two-mount-point pattern, check-update.ts wrapper shape, bundle/release.yml config shape): MEDIUM-HIGH — the switcher/persistence/wrapper patterns are directly grounded in this codebase's own existing `app-store.ts`/`notify.ts`/`AppShell.tsx` precedent (verified by direct read); the bundle/release.yml shapes are CITED from official docs/repo content but adapted (not copy-pasted) to this project's existing conventions
- Pitfalls (updater capability granularity tension, placeholder-pubkey build-validity, i18n parity test correctness): MEDIUM-HIGH — Pitfall 2 and 5 are original analysis grounded in direct codebase reads (not externally sourced, so correctness rests on the analysis itself); Pitfall 1/3/4 are CITED/cross-checked against official plugin behavior and this project's own `05-CONTEXT.md`/`WINDOWS.md` precedent

**Research date:** 2026-07-24
**Valid until:** 2026-08-23 (30 days — stable, official first-party Tauri plugins and a GitHub Action with an established major-version tag; revisit sooner only if Tauri ships a v2.x updater-plugin breaking change or `tauri-action` moves past `v1`)
