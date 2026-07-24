# Phase 5: Comunidade - Context

**Gathered:** 2026-07-24
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommended answers auto-accepted per grey area)

<domain>
## Phase Boundary

O app fica pronto para a comunidade GSD:
- **DIST-01 — i18n bilíngue + troca de idioma:** a infra i18n existe desde a Fase 1 e os 9 namespaces estão em paridade pt-BR/en; esta fase adiciona um **seletor de idioma** na UI, persiste a escolha e a restaura ao reabrir, e verifica a completude.
- **DIST-02 — instalador empacotado:** configurar o bundler do Tauri (ícones, targets, metadados) e um workflow de release que gera instaladores (Windows primeiro; macOS/Linux também).
- **DIST-03 — auto-atualização:** wiring do `@tauri-apps/plugin-updater` (plugin + capability + config + verificação no startup) com assinatura ed25519 própria do updater do Tauri.

**Fronteira honesta headless vs. humano/CI:** neste ambiente Linux headless dá para construir/testar o seletor de idioma, a paridade i18n, a persistência (mock), a lógica de update (mock) + o hook de startup, a validade das configs, e `cargo check`/`cargo test` com o updater. **NÃO dá** para construir instaladores Windows/macOS, rodar um ciclo real de auto-update assinado, nem gerar/segurar a chave de assinatura de produção — esses ficam como verificação humana/CI (padrão já usado no projeto: `.planning/WINDOWS.md`).

**Invariante preservada:** board read-only sobre `.planning/`; nada nesta fase escreve nos artefatos GSD.

Requisitos: DIST-01, DIST-02, DIST-03.

</domain>

<decisions>
## Implementation Decisions

### Seletor de Idioma (DIST-01)
- **Componente:** um `LanguageSwitcher` (toggle pt-BR / EN) montado no `Header` ao lado do `SyncIndicator`, seguindo o padrão de botão do `ProjectSwitcherButton`. Como o `Header` NÃO monta na Home (`AppShell.tsx:50-55` curto-circuita para `HomeScreen`), montar o switcher **também na Home** (canto do header da Home) para ser alcançável antes de abrir projeto — mesmo componente, dois pontos de montagem.
- **Troca:** chama `i18n.changeLanguage(lng)`; `react-i18next` re-renderiza os consumidores de `useTranslation` automaticamente (inclui os dois leitores de `i18n.language` para date-fns: `SyncIndicator.tsx:53`, `SessionRow.tsx:125`).
- **Persistência:** salvar a escolha via o `app-store` da Fase 4 (`app-state.json` no appDataDir) — nova chave `LANGUAGE_KEY` + `getLanguage()/setLanguage()`, copiando o padrão `upsertRecent` + `withStoreLock`. Nunca escreve em `.planning/`.
- **Restauração no startup:** `i18n.init` é síncrono (default pt-BR); um efeito no boot lê o idioma salvo (async) e chama `changeLanguage(saved)` se diferente. Fallback: se não houver escolha salva, usar `navigator.language` quando for `en*` (senão pt-BR). Idioma é um enum fechado (`pt-BR` | `en`) — validar o valor lido do store (dado não confiável) antes de aplicar.
- **Completude:** manter a paridade dos 9 namespaces como um teste automatizado (falha se pt-BR e en divergirem em chaves) — trava DIST-01 contra regressão futura.

### Bundler / Instalador (DIST-02)
- **`tauri.conf.json > bundle`:** adicionar o array `icon` referenciando os ícones já presentes em `src-tauri/icons/` (32/64/128/128@2x/icns/ico), `category`, `publisher`, `copyright`, `shortDescription`/`longDescription`. Manter `targets: "all"` (constrói o que o SO host suporta).
- **`createUpdaterArtifacts: true`** no bundle (necessário para o DIST-03 gerar os artefatos assináveis).
- **Per-target:** seções mínimas seguras — `bundle.windows.nsis` (instalador Windows, prioridade), `bundle.linux` (deb/appimage), `bundle.macOS` (dmg, minimumSystemVersion). Sem assinatura de código de SO obrigatória (decisão de projeto: aceitar aviso SmartScreen para app de comunidade — `PITFALLS.md`), documentada como best-effort/opcional.
- **Versão:** `package.json` / `Cargo.toml` / `tauri.conf.json` já em `0.1.0` sincronizados; documentar que um bump de release toca os três (sem automação nova nesta fase).

### Auto-update (DIST-03)
- **Plugin:** `@tauri-apps/plugin-updater` (JS) + `tauri-plugin-updater = "2"` (crate) + `.plugin(tauri_plugin_updater::Builder::new().build())` em `lib.rs` + capability granular `updater:default` — mesmo padrão dos plugins da Fase 4. Adicionar `@tauri-apps/plugin-process` + `process:allow-restart` se for preciso relançar após instalar.
- **Config:** `tauri.conf.json > plugins.updater` com `endpoints` (GitHub Releases `latest.json`) e `pubkey`. O `pubkey` entra como **placeholder claramente marcado** — a chave real vem do `tauri signer generate` executado pelo mantenedor.
- **Verificação no startup:** um wrapper fino `src/updates/check-update.ts` (estilo `notify.ts`: uma função por op, degrada em silêncio, promise cacheada no módulo) expondo `checkForUpdate()`; chamado num `useEffect` de mount no `AppShell`. UX: não intrusivo — se houver update, oferecer instalar (MVP pode baixar-e-instalar-e-relançar direto, ou mostrar um aviso discreto — detalhe de UI no UI-SPEC).
- **Chave de assinatura (segurança):** o par ed25519 de produção é a identidade de release do mantenedor — **NÃO** gerar nem versionar a chave privada nesta sessão autônoma. A fase entrega config + CI + docs com placeholder; gerar o par (`tauri signer generate`), preencher o `pubkey` real e cadastrar o secret `TAURI_SIGNING_PRIVATE_KEY` são passos manuais do mantenedor (Manual-Only).

### CI / Release (DIST-02, DIST-03)
- **Novo `.github/workflows/release.yml`** disparado por tag/release, usando `tauri-apps/tauri-action`, matrix Windows/macOS/Linux, que constrói instaladores, gera o manifesto `latest.json` do updater, assina os artefatos (secrets `TAURI_SIGNING_PRIVATE_KEY` + `_PASSWORD`) e publica num GitHub Release. `ci.yml` (lint/test/cargo) permanece como está.
- Secrets de code-signing de SO (Apple/Windows cert) são opcionais/best-effort, documentados.
- YAML pode ser autorado e validado (sintaxe/`actionlint` se disponível) nesta sessão; a execução real do release roda no CI do mantenedor.

### Claude's Discretion
- UX exata do aviso de update (auto-baixar+relançar vs. banner "atualizar agora") dentro do contrato do UI-SPEC.
- Forma do seletor (toggle pt/en vs. dropdown) — MVP: toggle simples.
- Endpoint exato do `latest.json` (owner/repo do GitHub Releases) — placeholder documentado se o slug final não estiver fixado.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **i18n:** `src/i18n.ts` (init síncrono, 9 namespaces, defaultNS common); bootstrap em `main.tsx:3`. Paridade pt-BR/en confirmada nos 9 namespaces.
- **Persistência (Fase 4):** `src/persistence/app-store.ts` (`LazyStore`, `withStoreLock`, get/set/save) — template `upsertRecent` para a chave de idioma.
- **Wrapper de plugin:** `src/notifications/notify.ts` (fino, degrada em silêncio, promise cacheada) — template para `src/updates/check-update.ts`.
- **Header/montagem:** `src/shell/Header.tsx` (ao lado de `SyncIndicator`), `ProjectSwitcherButton.tsx` (padrão de botão de header); Home header em `HomeScreen.tsx` (segundo ponto de montagem).
- **Plugin wiring (Fase 4):** `lib.rs` (`.plugin(...)`), `capabilities/default.json` (permissões granulares) — analog exato para o updater.
- **Ícones:** `src-tauri/icons/` já tem o set completo (só falta referenciar no bundle).
- **Consumidores de `i18n.language`:** `SyncIndicator.tsx:53`, `SessionRow.tsx:125` (date-fns locale) — re-renderam na troca.

### Established Patterns
- Capabilities granulares (nunca bundles catch-all) — header do `capabilities/default.json`.
- Teste de plugin: mock via `vi.mock("@tauri-apps/plugin-*")` + import dinâmico após `vi.resetModules()` (`notify.test.ts`); `FakeLazyStore` para o store (`app-store.test.ts`).
- Mount-hook/shell test: `AppShell.test.tsx` (mock de plugins + assert de efeito no mount).

### Integration Points
- `LanguageSwitcher` no `Header` + Home; troca via `changeLanguage`; persiste no `app-store`; restaura num efeito de boot.
- `check-update.ts` chamado no mount do `AppShell`.
- Updater: `package.json` + `Cargo.toml` + `lib.rs` + `capabilities` + `tauri.conf.json plugins.updater` + `createUpdaterArtifacts`.
- Bundle: `tauri.conf.json bundle` (icon/targets/metadados).
- `.github/workflows/release.yml` novo.

</code_context>

<specifics>
## Specific Ideas

- A paridade i18n vira um teste que falha em divergência de chaves — DIST-01 fica travado contra regressão, não só "verificado uma vez".
- Manter tudo que é escrita em disco no appDataDir (idioma) — a promessa read-only sobre `.planning/` continua verdadeira.
- Não gerar a chave privada de assinatura na sessão: é identidade de release do mantenedor. Config + docs + CI com placeholder; geração e secret são passos humanos.

</specifics>

<deferred>
## Deferred Ideas (Manual-Only / humano-CI)

- Construir instaladores **Windows** (nsis/msi) e **macOS** (dmg) — exigem esses SOs / runners de CI.
- Ciclo real de **auto-update assinado** ponta-a-ponta (release assinado + endpoint servindo `latest.json` + app instalado que relança).
- **Geração do par ed25519** de produção e cadastro do secret `TAURI_SIGNING_PRIVATE_KEY` — passo do mantenedor.
- Code-signing de SO (Apple notarization, cert Windows/EV) — best-effort, fora do MVP.
- Mais idiomas além de pt-BR/en — fora de escopo.

</deferred>
