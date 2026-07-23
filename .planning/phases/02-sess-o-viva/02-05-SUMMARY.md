---
phase: 02-sess-o-viva
plan: 05
subsystem: ui
tags: [xterm, tauri-plugin-opener, addon-search, addon-web-links, i18n, terminal]

# Dependency graph
requires:
  - phase: 02-sess-o-viva (Plano 01)
    provides: TerminalView.tsx (host xterm.js mínimo do tracer) + channel.ts (Channel<Uint8Array>)
  - phase: 02-sess-o-viva (Plano 03)
    provides: has_gsd_core/project detection pattern (não usado diretamente, mas fundação da fase)
provides:
  - "@tauri-apps/plugin-opener + tauri-plugin-opener registrados, capability opener:allow-open-url"
  - "TerminalView com WebLinksAddon (links clicáveis validados http(s)) e SearchAddon (busca no scrollback)"
  - "TerminalSearchBar (contador current/total, ChevronUp/Down, X, Enter/Shift+Enter, Esc)"
  - "Namespace i18n terminal.json (pt-BR/en) registrado em i18n.ts"
affects: [02-06 (algoritmo de foco/WebGL vai reusar esta mesma instância de Terminal/TerminalView)]

# Tech tracking
tech-stack:
  added:
    - "@tauri-apps/plugin-opener@^2.5.4 (JS) + tauri-plugin-opener@2 (Rust) — abrir URL no navegador do SO"
  patterns:
    - "SearchAddonHandle: contrato estrutural mínimo (não a classe SearchAddon direta) permite testar a UI da search bar com um mock, sem instanciar xterm.js real (que exige canvas real, indisponível em jsdom sem o pacote `canvas`)"
    - "Validação de esquema (isSafeUrl, só http(s)) antes de chamar openUrl — mesma disciplina de ArtifactModal.tsx (T-01-02) aplicada a uma nova superfície (T-02-08)"

key-files:
  created:
    - src/components/terminal/TerminalSearchBar.tsx
    - src/components/terminal/search.test.tsx
    - src/locales/pt-BR/terminal.json
    - src/locales/en/terminal.json
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src-tauri/capabilities/default.json
    - package.json
    - src/components/terminal/TerminalView.tsx
    - src/i18n.ts

key-decisions:
  - "tauri-plugin-opener pinado como '2' (não exato '2.5.4') para seguir a convenção dos outros plugins irmãos (tauri-plugin-fs/tauri-plugin-dialog) já no Cargo.toml"
  - "TerminalSearchBar recebe o addon via SearchAddonHandle (interface estrutural), não a classe SearchAddon do @xterm/addon-search — decisão de testabilidade, confirmada experimentalmente que o addon real exige canvas/matchMedia indisponíveis no jsdom deste projeto"
  - "decorations (ISearchDecorationOptions) só existem por chamada de busca (findNext/findPrevious), não no construtor do addon — sem isso, onDidChangeResults não dispara e o contador current/total nunca chegaria à UI"
  - "i18n.ts (fora do files_modified do plano) precisou registrar o novo namespace terminal — sem isso useTranslation('terminal') devolveria chaves cruas"

patterns-established:
  - "Segunda barreira de validação de esquema (isSafeUrl) antes de qualquer chamada a um comando de abertura externa (openUrl/openPath), mesmo quando a capability do Tauri já restringe o escopo — replicável em fases futuras que abram recursos externos"

requirements-completed: [TERM-02, TERM-03]

coverage:
  - id: D1
    description: "Terminal com scrollback limitado a 5000 linhas, copy-on-select funcional e links clicáveis abrindo no navegador do SO via plugin opener (TERM-02)"
    requirement: "TERM-02"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (grep scrollback: 5000 / WebLinksAddon / opener:allow-open-url — todos confirmados)"
        status: pass
      - kind: manual_procedural
        ref: "UAT: claude imprime uma URL no output, clique abre no navegador do SO"
        status: unknown
    human_judgment: true
    rationale: "Abrir URL no navegador real do SO via xterm.js/WebLinksAddon não é observável em DOM headless (jsdom) com fidelidade — backstop explícito no plano (02-VALIDATION.md Manual-Only), requer UAT humano"
  - id: D2
    description: "TerminalSearchBar dirigida por addon-search: contador current/total, navegação prev/next (botões + Enter/Shift+Enter), estado no-match em borda warning, Esc fecha e devolve foco"
    requirement: "TERM-03"
    verification:
      - kind: unit
        ref: "src/components/terminal/search.test.tsx (10 testes: placeholder/sem contador, contador current/total, 0/0 com warning, 1+ sem warning, Enter/Shift+Enter, botões, Esc, X, limpar campo)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Highlight visual real de matches no buffer do xterm.js (destaque colorido no texto encontrado)"
    verification: []
    human_judgment: true
    rationale: "@xterm/addon-search real exige HTMLCanvasElement.getContext e window.matchMedia indisponíveis no jsdom deste projeto sem o pacote `canvas` (fora de escopo) — confirmado experimentalmente durante a execução; backstop permanente por design (02-RESEARCH.md Wave 0), não um gap desta implementação"

duration: 20min
completed: 2026-07-23
status: complete
---

# Phase 02 Plan 05: Links Clicáveis + Busca no Terminal Summary

**Terminal expandido com links clicáveis via `@tauri-apps/plugin-opener` (TERM-02) e busca no scrollback via `TerminalSearchBar`/`@xterm/addon-search` (TERM-03), com a search bar testável por injeção de um `SearchAddonHandle` mockado.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-23T17:39:40Z (logo após 02-04)
- **Completed:** 2026-07-23T17:56:00Z
- **Tasks:** 2
- **Files modified:** 11 (7 modificados, 4 criados)

## Accomplishments
- `@tauri-apps/plugin-opener` + `tauri-plugin-opener` registrados no backend, com a capability `opener:allow-open-url` concedida (só essa, nunca `allow-open-path`/`allow-reveal-item-in-dir`, T-02-08)
- `TerminalView` carrega `WebLinksAddon` com handler que valida esquema http(s) (`isSafeUrl`) antes de chamar `openUrl` — URLs do output do `claude` ficam clicáveis, abrindo no navegador do SO
- `TerminalView` carrega `SearchAddon`; Ctrl+F/Cmd+F com o terminal focado abre `TerminalSearchBar` (via `attachCustomKeyEventHandler`), Esc fecha e devolve o foco
- `TerminalSearchBar`: input auto-focado, contador `{{current}}/{{total}}` ou `0/0`, borda em `--color-warning` só em zero matches, ChevronUp/ChevronDown/X, Enter/Shift+Enter cicla matches
- Novo namespace i18n `terminal.json` (pt-BR/en) com as chaves do UI-SPEC mais 3 chaves adicionais (`search.previous`/`search.next`/`search.close`) necessárias para os `aria-label`s dos botões da search bar

## Task Commits

Each task was committed atomically:

1. **Task 1: Plugin opener + links clicáveis + scrollback/copy-paste (TERM-02)** - `5173034` (feat)
2. **Task 2: TerminalSearchBar via addon-search (TERM-03)** - `eff82a9` (feat)

**Plan metadata:** _(commit a seguir, ver "Files Created/Modified" abaixo)_

## Files Created/Modified
- `src-tauri/Cargo.toml` - `tauri-plugin-opener = "2"` adicionado
- `src-tauri/src/lib.rs` - `.plugin(tauri_plugin_opener::init())` registrado
- `src-tauri/capabilities/default.json` - `opener:allow-open-url` adicionado, descrição atualizada
- `package.json` - `@tauri-apps/plugin-opener@^2.5.4` adicionado
- `src/components/terminal/TerminalView.tsx` - `WebLinksAddon` (links clicáveis validados) + `SearchAddon` (busca) carregados; Ctrl+F/Cmd+F abre `TerminalSearchBar`; Esc devolve foco; layout em coluna (search bar + xterm surface)
- `src/components/terminal/TerminalSearchBar.tsx` - novo componente: input + contador + prev/next/close
- `src/components/terminal/search.test.tsx` - 10 testes cobrindo a lógica de estado da search bar com um `SearchAddon` mockado
- `src/locales/pt-BR/terminal.json` / `src/locales/en/terminal.json` - novo namespace i18n
- `src/i18n.ts` - namespace `terminal` registrado (deviation, ver abaixo)

## Decisions Made
- `tauri-plugin-opener` pinado como `"2"` no Cargo.toml (não `"2.5.4"` exato que o `cargo add` sugeriu por padrão), para seguir a convenção já estabelecida pelos plugins irmãos (`tauri-plugin-fs`/`tauri-plugin-dialog`)
- `TerminalSearchBar` recebe o addon via uma interface estrutural mínima (`SearchAddonHandle`: `findNext`/`findPrevious`/`onDidChangeResults`) em vez de importar a classe `SearchAddon` real como tipo do prop — decisão de testabilidade tomada após confirmar experimentalmente (smoke test descartado) que instanciar um `Terminal`+`SearchAddon` reais em jsdom falha com `HTMLCanvasElement.getContext` não implementado e depois `matchMedia is not a function`, ambos exigindo o pacote `canvas` (fora do escopo desta fase). A classe real `SearchAddon` satisfaz essa interface estruturalmente, então `TerminalView.tsx` continua passando a instância real sem nenhum adaptador
- `ISearchOptions.decorations` (cores do highlight) é passado em cada chamada de busca (`findNext`/`findPrevious`), não no construtor do `SearchAddon` — confirmado nos typings que sem `decorations`, o evento `onDidChangeResults` (fonte do contador current/total) não dispara

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registrar o namespace `terminal` em `src/i18n.ts`**
- **Found during:** Task 2 (TerminalSearchBar via addon-search)
- **Issue:** `src/i18n.ts` não estava no `files_modified` do plano, mas sem registrar `terminal.json` no array `resources`/`ns`, `useTranslation("terminal")` devolveria as chaves cruas em vez do texto traduzido (mesmo padrão que já exige esse arquivo para `session.json` no Plano 01)
- **Fix:** Import + registro de `terminalPtBR`/`terminalEn` em `resources` e `ns` de `i18n.ts`, seguindo exatamente o padrão já usado para os namespaces anteriores
- **Files modified:** src/i18n.ts
- **Verification:** `npx vitest run` (247/247 verde, incluindo os 10 novos testes de `search.test.tsx` que dependem de `useTranslation`)
- **Committed in:** `eff82a9` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Chaves i18n adicionais para aria-label dos botões da search bar**
- **Found during:** Task 2
- **Issue:** `02-UI-SPEC.md` ## Copywriting Contract não define chaves para os `aria-label`/`title` dos botões ChevronUp/ChevronDown/X da search bar (só define `search.placeholder`/`search.matchCount`/`search.noMatches`) — sem uma chave i18n, esses botões ficariam sem rótulo acessível traduzido, violando a diretriz do CLAUDE.md de que toda string visível ao usuário é uma chave i18n
- **Fix:** Adicionadas `terminal.search.previous`/`terminal.search.next`/`terminal.search.close` a `terminal.json` (pt-BR/en), usadas como `aria-label` e `title` dos três botões
- **Files modified:** src/locales/pt-BR/terminal.json, src/locales/en/terminal.json, src/components/terminal/TerminalSearchBar.tsx
- **Verification:** `search.test.tsx` usa `screen.getByLabelText(...)` com esses textos pt-BR para localizar e clicar os botões — os 10 testes passam
- **Committed in:** `eff82a9` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking i18n registration, 1 missing critical a11y copy)
**Impact on plan:** Ambos os fixes são pré-requisitos funcionais/acessibilidade para o que o plano já pedia (namespace `terminal.json` funcionando de fato, botões da search bar com rótulo). Nenhum scope creep.

## Issues Encountered
- Confirmado experimentalmente (teste descartável, não commitado) que `@xterm/addon-search` real não é testável em jsdom sem o pacote `canvas`: `new Terminal().open(div)` falha primeiro com `HTMLCanvasElement.getContext() not implemented`, e mesmo mockando isso ainda precisaria de `window.matchMedia`. Isso confirma a hipótese levantada no `02-RESEARCH.md`/`02-VALIDATION.md` (Wave 0) e justifica a decisão de design (`SearchAddonHandle`) documentada acima — a lógica de estado da search bar é 100% coberta por teste automatizado; o highlight visual real do addon permanece como UAT manual permanente (backstop), não um gap desta implementação.
- Nenhum componente `TerminalPane`/chrome header (cabeçalho com ícone "Buscar" de 32×32, per `02-UI-SPEC.md` ## Terminal Chrome) foi construído em nenhum plano executado da Fase 2 (01-06) — `DrawerRail.tsx` monta `TerminalView` direto num `<aside>`, sem cabeçalho. Por isso, `TerminalSearchBar` abre **apenas** via Ctrl+F/Cmd+F nesta implementação; o toggle por ícone (a outra metade do must_have "abre via ícone/Ctrl+F") fica pendente até um componente de chrome header ser construído em fase futura. Registrado no ledger de defeitos (`.planning/WINDOWS.md`, entrada `deviation` #2) para rastreamento — não é um stub silencioso, é uma lacuna de escopo entre planos que este executor não pode preencher sem sair do `files_modified` desta plan (que não inclui `DrawerRail.tsx` nem um novo `TerminalPane.tsx`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `TerminalView` agora carrega `FitAddon` + `WebLinksAddon` + `SearchAddon` — Plano 06 pode estender esta mesma instância com `WebglAddon`/`SerializeAddon` para o algoritmo de foco multi-sessão, sem retrabalho estrutural
- `TerminalSearchBar` e seu `SearchAddonHandle` estão prontos para reuso; nenhum ajuste esperado no Plano 06 (que não toca em busca)
- Pendência para uma fase futura (não bloqueante): construir o chrome header/`TerminalPane` com o ícone "Buscar" — hoje só o atalho de teclado existe

## Self-Check: PASSED

All created/modified files confirmed present on disk; both task commits (`5173034`, `eff82a9`) confirmed in `git log`.

---
*Phase: 02-sess-o-viva*
*Completed: 2026-07-23*
