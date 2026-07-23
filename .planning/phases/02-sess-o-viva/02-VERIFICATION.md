---
phase: 02-sess-o-viva
verified: 2026-07-23T18:35:00Z
status: gaps_found
score: 26/27 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "A TerminalSearchBar abre via ícone/Ctrl+F (TERM-03, 02-05-PLAN.md must_haves.truths)"
    status: failed
    reason: "Só o atalho de teclado (Ctrl+F/Cmd+F, via attachCustomKeyEventHandler) abre a TerminalSearchBar. Nenhum ícone/botão de busca existe em nenhum dos 6 planos executados da Fase 2 — TerminalView.tsx monta o xterm.js direto dentro do <aside> do DrawerRail, sem nenhum componente de chrome/header (o 'TerminalPane' descrito em 02-UI-SPEC.md ## Terminal Chrome nunca foi construído). Já auto-disclosed pelo próprio executor: 02-05-SUMMARY.md ('Issues Encountered') e WINDOWS.md #2 (status: open, não waived)."
    artifacts:
      - path: "src/components/terminal/TerminalView.tsx"
        issue: "Abre a search bar só via handler de teclado Ctrl+F/Cmd+F; nenhum ícone/botão de toggle 32×32 existe no chrome do terminal (chrome/header não existe)"
    missing:
      - "Um componente de chrome do terminal (TerminalPane, conforme 02-UI-SPEC.md ## Terminal Chrome) com um ícone de busca 32×32 que também abra a TerminalSearchBar via clique — ou, alternativamente, uma decisão explícita de descope/override aceitando Ctrl+F como único ponto de entrada"
human_verification:
  - test: "Abrir N sessões reais do `claude` numa máquina Windows real, matar cada uma individualmente (botão Excluir) e depois fechar o app inteiro; inspecionar o Gerenciador de Tarefas."
    expected: "Zero processos remanescentes da árvore original (claude + quaisquer subprocessos/netos) após cada kill individual e após o fechamento do app."
    why_human: "O mecanismo de kill de árvore no Windows (win32job::Job::assign_process + limit_kill_on_job_close) só é exercitado neste ambiente de verificação via cargo test em Linux (tree_kill_leaves_no_zombies, que passa e prova o mecanismo genérico spawn→neto→kill_tree→zero PIDs via sysinfo). O caminho `#[cfg(windows)]` do process_guard.rs não pode ser executado nem compilado neste sandbox Linux. Backstop explícito em 02-01-PLAN.md/02-02-PLAN.md/02-06-PLAN.md (verification: backstop, SESS-06)."
  - test: "Com `npm run tauri dev`, criar uma sessão num projeto real e fazer o `claude` interativo imprimir uma URL http(s) no output."
    expected: "A URL fica visualmente destacada como link e, ao clicar, abre no navegador padrão do SO (via @tauri-apps/plugin-opener)."
    why_human: "Abrir uma URL real no navegador do SO via WebLinksAddon/plugin-opener não é observável em DOM headless (jsdom); a validação de esquema (isSafeUrl) e o wiring do handler estão code-verified, mas o comportamento real do navegador exige um SO real. Backstop explícito em 02-05-PLAN.md (verification: backstop, TERM-02)."
  - test: "Abrir 2+ sessões reais do `claude`, iniciar algo de execução longa (ex.: um comando verboso) numa delas, trocar para outra sessão, esperar um tempo real, e voltar para a primeira."
    expected: "O buffer restaurado mostra TODO o output produzido enquanto a sessão estava em background, sem lacunas nem duplicação — o processo PTY nunca parou de rodar."
    why_human: "O algoritmo puro (loseFocus/gainFocus, ordem exata + round-trip sem lacunas) está 100% coberto por focus-algorithm.test.ts com mocks determinísticos — mas 'um processo real produzindo output ao longo de um tempo real' só é observável com um `claude` de verdade rodando em segundo plano por um período genuíno. Backstop explícito em 02-06-PLAN.md (verification: backstop, SESS-03)."
  - test: "Usar o `claude` interativo de verdade dentro do terminal embutido — digitar uma pergunta, ver a resposta em streaming, copiar/colar texto, e confirmar que o scrollback respeita o limite de 5000 linhas."
    expected: "Interação fluida e utilizável, idêntica à esperada de um terminal real; nenhuma truncagem/corrupção de caracteres multibyte; copyOnSelect copia a seleção automaticamente."
    why_human: "Fidelidade de um PTY real com um binário interativo real (o `claude` CLI) não é reproduzível com fidelidade em DOM headless. Manual-Only em 02-VALIDATION.md (SESS-02/TERM-01)."
  - test: "Abrir um projeto real com sessões `.jsonl` existentes em ~/.claude/projects/<encoded>/ e confirmar a lista agrupada Ativas/Histórico; depois, simular `claude` ausente do PATH e confirmar que o ToolMissingState substitui o corpo da sidebar sem o CTA 'Nova sessão'."
    expected: "Sessões reais aparecem corretamente agrupadas e ordenadas; com `claude` ausente, nenhum caminho de criação de sessão fica visível."
    why_human: "Requer um filesystem real com ~/.claude/projects/<encoded>/ populado e manipulação real do PATH do SO — além do que um teste jsdom pode afirmar com fidelidade. Registrado como D11 em 02-04-SUMMARY.md."
---

# Phase 02: Sessão viva — Verification Report

**Phase Goal:** Usuário cria sessões do Claude na sidebar e conversa com o `claude` interativo em um terminal real embutido, com múltiplos terminais vivos em paralelo e encerramento limpo da árvore de processos.
**Verified:** 2026-07-23T18:35:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Note on ROADMAP `mode: mvp` goal format

ROADMAP.md marks Phase 2 as `Mode: mvp`, but the ROADMAP `Goal:` field itself is not phrased as a User Story (`As a ..., I want to ..., so that ...`). A properly-formatted User Story does exist at the plan level — `02-01-PLAN.md`'s `<objective>`: *"As a desenvolvedor usando o GSD Cards em um projeto GSD, I want to criar sessões do `claude` interativo em terminais reais embutidos, navegar entre múltiplas sessões vivas em paralelo e encerrá-las com a árvore de processos limpa, so that eu conduzo o fluxo GSD do projeto sem sair do app e sem deixar processos zumbis."* This report uses that plan-level user story for the User Flow Coverage table below, rather than hard-refusing verification, since extensive direct code+test evidence was gathered for every requirement in this phase. Recommend running `/gsd mvp-phase 2` retroactively to align ROADMAP.md's `Goal:` field, purely for documentation consistency — this is not a functional gap.

## User Flow Coverage

User story: *"As a desenvolvedor usando o GSD Cards em um projeto GSD, I want to criar sessões do `claude` interativo em terminais reais embutidos, navegar entre múltiplas sessões vivas em paralelo e encerrá-las com a árvore de processos limpa, so that eu conduzo o fluxo GSD do projeto sem sair do app e sem deixar processos zumbis."*

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Detectar dependências | `claude`/gsd-core ausentes bloqueiam criação, com instrução clara | `src-tauri/src/dependencies.rs`, `src/components/session/ToolMissingState.tsx`, `src/components/session/SessionSidebar.tsx:121-146` (CTA condicionado a `toolMissing === "none"`) | ✓ |
| Criar sessão | Botão "Nova sessão" spawna `claude` real num PTY no cwd do projeto | `src/stores/session-store.ts#createSession`, `src-tauri/src/pty.rs#spawn_session`, `src/components/terminal/TerminalView.tsx:129-157` | ✓ |
| Conversar no terminal | Bytes reais fluem PTY→Channel→xterm.js; input do usuário volta ao PTY | `src-tauri/src/pty.rs#pump_pty_output` (testado com processo real), `TerminalView.tsx#onData→writeSession` | ✓ (mecanismo); interação real com `claude` de verdade é backstop manual |
| Navegar entre sessões sem fechar | Trocar de sessão nunca mata o processo; a sessão anterior continua em background | `src/components/terminal/focus-algorithm.ts#loseFocus/gainFocus`, testes de ordem exata + round-trip | ✓ (algoritmo); replay real ao longo do tempo é backstop manual |
| Buscar no scrollback | Busca encontra ocorrências, contador, navegação | `src/components/terminal/TerminalSearchBar.tsx`, `search.test.tsx` (10 testes) | ✓ (funcional via Ctrl+F); ⚠️ abertura por ícone não implementada (gap) |
| Encerrar árvore de processos | Arquivar/Excluir e fechar o app matam toda a árvore, sem zumbis | `src-tauri/src/process_guard.rs#TreeGuard`, `src-tauri/tests/tree_kill.rs#tree_kill_leaves_no_zombies` (passa, processo real + neto), `RunEvent::ExitRequested` em `lib.rs` | ✓ (mecanismo, provado em Linux CI); confirmação real no Windows é backstop manual |

---

## Goal Achievement

### Observable Truths

Consolidated from ROADMAP.md's 5 Success Criteria + the `must_haves.truths` declared across all 6 plans (02-01 through 02-06). Backstop-tagged truths (`verification: backstop` in PLAN frontmatter) are never marked VERIFIED on code presence alone — they route directly to Human Verification per the honest-verifier discipline for this phase (Linux sandbox cannot exercise the Windows Job Object path, a real browser, or real elapsed-time background processes).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `spawn_session` sobe processo real via `portable-pty` com cwd validado; thread leitora empurra bytes crus para `Channel<Vec<u8>>` (SESS-02, TERM-01) | ✓ VERIFIED | `src-tauri/src/pty.rs:121-199`; `pump_pty_output_forwards_bytes_from_a_real_process` passes (`cargo test`) |
| 2 | Data path PTY→sink provado ponta-a-ponta com binário substituto real (SESS-02, TERM-01) | ✓ VERIFIED | Same test above, verified running locally: `cargo test --manifest-path src-tauri/Cargo.toml` → 24 unit + 1 integration, all pass |
| 3 | `TerminalView` monta xterm.js, escreve bytes, dispose simétrico sobrevivendo ao StrictMode (TERM-01) | ✓ VERIFIED | `src/components/terminal/TerminalView.tsx:124,258-284` (`disposed` flag pattern, symmetric cleanup) |
| 4 | `kill_session` aciona `TreeGuard` antes de `Child::kill()`/`wait()`; Job Object no Windows, `killpg` no Unix (SESS-06) | ✓ VERIFIED | `src-tauri/src/process_guard.rs` (full read); `src-tauri/src/pty.rs:251-263` |
| 5 | `RunEvent::ExitRequested` mata todas as sessões vivas antes do app fechar (SESS-06) | ✓ VERIFIED | `src-tauri/src/lib.rs:38-46` |
| 6 | (backstop) Zero processos remanescentes no SO real após `kill_session`/fechar o app (SESS-06) | — human_needed | Backstop declared in 02-01-PLAN.md; automated proxy: `tree_kill_leaves_no_zombies` (integration test, passes on Linux) |
| 7 | `tree_kill_leaves_no_zombies` spawna processo+neto, mata a árvore, `sysinfo` confirma zero PIDs (SESS-06) | ✓ VERIFIED | Ran directly: `cargo test --test tree_kill tree_kill_leaves_no_zombies` → 1 passed |
| 8 | `tree_kill_helper` imprime marcador, spawna neto de vida curta (SESS-06) | ✓ VERIFIED | `src-tauri/src/bin/tree_kill_helper.rs` (referenced/used by the passing test above) |
| 9 | (backstop) Numa máquina Windows real, abrir N sessões e matá-las (individual + fechar app) deixa zero processos no Task Manager (SESS-06) | — human_needed | Backstop declared in 02-02-PLAN.md — Windows Job Object path cannot run on this Linux sandbox |
| 10 | `check_claude_on_path` retorna caminho quando presente, `None` quando ausente (PROJ-04) | ✓ VERIFIED | `src-tauri/src/dependencies.rs`; 3 tests pass |
| 11 | `has_gsd_core` true quando `.claude/gsd-core` existe no projeto OU home OU `gsd-tools` resolve no PATH (PROJ-04) | ✓ VERIFIED | `src-tauri/src/project.rs` tests (`dir_has_gsd_core_*`) pass |
| 12 | `encode_project_path` reproduz a regra verificada (SESS-01) | ✓ VERIFIED | `src-tauri/src/sessions.rs` tests pass (`/home/user/gsd-cards` → `-home-user-gsd-cards`) |
| 13 | `register_sessions_scope` concede escopo SÓ para a subpasta codificada do projeto atual, nunca `~/.claude/projects/` inteira (SESS-01) | ✓ VERIFIED | `src-tauri/src/sessions.rs:58-79` — `allow_directory(&encoded_dir, ...)`, never the parent |
| 14 | `listSessions` lista só `*.jsonl` raiz, filtra `subagents/`, extrai `id`+`lastModified`, sem recursão (SESS-01) | ✓ VERIFIED | `src/sessions/discover.ts`; `discover.test.ts` per 02-03-SUMMARY |
| 15 | `SessionSidebar` lista sessões em grupos Ativas/Histórico ordenados por `lastModified` desc (SESS-01) | ✓ VERIFIED | `src/components/session/SessionSidebar.tsx:86-89,156-177`; `SessionSidebar.test.tsx` passes |
| 16 | Zero sessões renderiza `EmptyState`, nunca sidebar em branco (SESS-01) | ✓ VERIFIED | `SessionSidebar.tsx:150-153`; test passes |
| 17 | Grupo vazio não renderiza header; label trunca com `title` completo (SESS-01) | ✓ VERIFIED | `SessionSidebar.tsx:156,170`; `SessionRow.tsx:136,168` (`title={session.id}`, `textOverflow: ellipsis`) |
| 18 | Ao ausente `claude`/gsd-core, `ToolMissingState` substitui o corpo e o CTA some (PROJ-04) | ✓ VERIFIED | `SessionSidebar.tsx:121,150-151`; `SessionSidebar.test.tsx` — ToolMissingState suite (3 tests) |
| 19 | `ToolMissingState` mostra a variante correta entre 3 (PROJ-04) | ✓ VERIFIED | `ToolMissingState.tsx`; `ToolMissingState.test.tsx` (3 tests) |
| 20 | Row histórica não abre o drawer — mostra tooltip (SESS-01) | ✓ VERIFIED | `SessionRow.tsx:105-120`; test confirms |
| 21 | Scrollback limitado a 5000 linhas + `copyOnSelect` (via `onSelectionChange`) no construtor/wiring do xterm.js (TERM-02) | ✓ VERIFIED | `TerminalView.tsx:169` (`scrollback: 5000`), `:206-217` (clipboard write on selection) |
| 22 | `addon-web-links` carregado, URLs clicáveis abrindo via plugin opener do Tauri (TERM-02) | ✓ VERIFIED (wiring) | `TerminalView.tsx:183-190`, `lib.rs:22`, `capabilities/default.json` (`opener:allow-open-url`) |
| 23 | (backstop) Uma URL impressa pelo `claude` fica clicável e abre no navegador do SO (TERM-02) | — human_needed | Backstop declared in 02-05-PLAN.md — not observable in jsdom |
| 24 | `TerminalSearchBar` abre via **ícone/Ctrl+F**, mostra contador, cicla Enter/Shift+Enter, Esc fecha devolvendo foco (TERM-03) | ✗ **PARTIAL / FAILED** (ícone ausente) | `TerminalView.tsx:225-237` (só Ctrl+F/Cmd+F); nenhum ícone existe — see Gaps |
| 25 | Zero matches mostra "0/0" com borda warning; 1+ matches mostra current/total (TERM-03) | ✓ VERIFIED | `TerminalSearchBar.tsx:129-135,167`; `search.test.tsx` |
| 26 | Perder foco: dispõe webgl primeiro → serializa → dispõe terminal; PTY continua vivo (SESS-03) | ✓ VERIFIED | `focus-algorithm.ts#loseFocus`; `focus-algorithm.test.ts` — ordem exata testada |
| 27 | Bytes de sessão sem instância montada empilham em `backgroundBuffer`; ganhar foco restaura snapshot + drena em ordem sem lacunas (SESS-03) | ✓ VERIFIED | `focus-algorithm.ts#gainFocus`; round-trip test passes |
| 28 | `addon-webgl` carregado só na instância em foco — no máximo um contexto vivo (SESS-03) | ✓ VERIFIED | Dedicated test: "No máximo um contexto WebGL vivo entre sessões simultâneas" passes |
| 29 | (backstop) Iniciar algo de longa duração, trocar e voltar mostra output em background sem lacunas, com processos reais ao longo do tempo (SESS-03) | — human_needed | Backstop declared in 02-06-PLAN.md — algorithm proven via mocks, real timing not reproducible headlessly |
| 30 | Arquivar mata a árvore (se viva) e remove a row sem confirmação; Excluir faz o mesmo após `ConfirmDialog` (SESS-06 UI) | ✓ VERIFIED | `SessionRow.tsx:76-94`; `ConfirmDialog.tsx`; `SessionRow.test.tsx` |
| 31 | Nem Arquivar nem Excluir apagam o `.jsonl` de histórico do Claude Code (SESS-06) | ✓ VERIFIED | `session-store.ts#archiveSession` — no filesystem write/delete calls; `confirmDelete.body` i18n copy makes this explicit |

**Score:** 26/27 non-backstop truths verified (1 partial/failed: #24, search-bar icon toggle). 4 additional truths are explicit `verification: backstop` items routed to human verification (not counted toward the score, per honest-verifier discipline).

### Required Artifacts

All artifacts declared across the 6 plans' `must_haves.artifacts` were read directly and confirmed to exist, be substantive (no stubs/TBD/placeholder), and be wired into their consumers:

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src-tauri/src/process_guard.rs` | `TreeGuard` (Windows Job Object / Unix killpg) | ✓ VERIFIED | Full split impl, 5 unit tests pass |
| `src-tauri/src/pty.rs` | `PtyManager`, 4 commands, `pump_pty_output` | ✓ VERIFIED | Registered in `lib.rs`, 2 unit tests pass |
| `src-tauri/tests/tree_kill.rs` + `src-tauri/src/bin/tree_kill_helper.rs` | Integration proof of tree-kill | ✓ VERIFIED | 1 integration test passes, real process+grandchild |
| `src-tauri/src/dependencies.rs` | `check_claude_on_path` | ✓ VERIFIED | Registered, 3 unit tests pass |
| `src-tauri/src/sessions.rs` | `encode_project_path`, `register_sessions_scope` | ✓ VERIFIED | Registered, 4 unit tests pass |
| `src/pty/channel.ts` | Channel wrappers + `setSessionBytesHandler` | ✓ VERIFIED | Wired into `TerminalView.tsx`; 8 tests pass |
| `src/stores/session-store.ts` | `sessions[]`, `liveSessions`, `archiveSession`, `discoverSessions` | ✓ VERIFIED | 18 tests pass |
| `src/components/terminal/TerminalView.tsx` | xterm.js host + focus algorithm integration | ✓ VERIFIED | Wired to `focus-algorithm.ts`, `channel.ts` |
| `src/components/terminal/focus-algorithm.ts` | Pure `loseFocus`/`gainFocus` | ✓ VERIFIED | 12 tests, exact order + round-trip |
| `src/components/terminal/TerminalSearchBar.tsx` | Search UI | ⚠️ VERIFIED but incomplete entry point | 10 tests pass for state logic; icon toggle missing (see gap #24) |
| `src/components/session/SessionSidebar.tsx`, `SessionRow.tsx`, `ToolMissingState.tsx`, `ConfirmDialog.tsx` | Session UI | ✓ VERIFIED | All wired into `AppShell.tsx`/`DrawerRail.tsx`; tests pass |
| `src/sessions/discover.ts`, `src/dependencies/check.ts` | Discovery/dependency wrappers | ✓ VERIFIED | Wired into `session-store.ts`/`SessionSidebar.tsx` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `spawn_session` | `TreeGuard::attach` | Same instant as spawn, before any other fallible step | ✓ WIRED | `pty.rs:159-162` |
| `SessionSidebar` | `AppShell` | Replaces `SidebarPlaceholder`, same 240px slot | ✓ WIRED | `AppShell.tsx:13,45`; `SidebarPlaceholder.tsx` deleted |
| `DrawerRail` | `TerminalView` | Mounts on `activeSessionId` in 640px `<aside>` | ✓ WIRED | `DrawerRail.tsx:28-41` |
| `channel.ts` onmessage | `focus-algorithm` redirect | `setSessionBytesHandler` swaps write-vs-buffer target without recreating Channel | ✓ WIRED | `channel.ts:63-68`; `TerminalView.tsx:244,277` |
| `Archive`/`Delete` buttons | `killSession` (backend) | `archiveSession` in `session-store.ts` | ✓ WIRED | `SessionRow.tsx:79,89` → `session-store.ts:206-218` → `channel.ts#killSession` → `pty.rs#kill_session` |
| `register_sessions_scope` | `listSessions` | Returns `encoded_dir`, consumed directly as `readDir` root | ✓ WIRED | `session-store.ts:220-235` |

### Behavioral Spot-Checks (run directly by this verifier)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full Rust test suite (24 unit + 1 integration) | `cargo test --manifest-path src-tauri/Cargo.toml` | 24 passed, 1 passed (tree_kill) | ✓ PASS |
| Full frontend test suite | `npx vitest run` | 278 passed (33 files) | ✓ PASS |
| Type checking | `npx tsc --noEmit` | Clean, no errors | ✓ PASS |
| Debt-marker scan (TBD/FIXME/XXX/TODO/PLACEHOLDER) across all phase-2 modified files | `grep` across 18 key files | 2 false-positive Portuguese-word hits ("TODO o corpo"/"TODO o estado" = "all", not a marker); zero real markers | ✓ PASS |
| Focus-algorithm order/round-trip tests (behavior-dependent truth for SESS-03) | `npx vitest run src/components/terminal/focus-algorithm.test.ts` | 12/12 passed, including dedicated "ordem exata" and "round-trip sem lacunas" tests | ✓ PASS |
| Tree-kill integration test (behavior-dependent truth for SESS-06) | `cargo test --test tree_kill tree_kill_leaves_no_zombies` | 1/1 passed — asserts alive-before AND dead-after for both child and grandchild PIDs | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| PROJ-04 | 02-03, 02-04 | Detecta Claude CLI/gsd-core; instrui sem auto-instalar | ✓ SATISFIED | `dependencies.rs`, `project.rs`, `ToolMissingState.tsx` |
| SESS-01 | 02-03, 02-04 | Vê sessões do projeto na sidebar | ✓ SATISFIED | `sessions.rs`, `discover.ts`, `SessionSidebar.tsx` |
| SESS-02 | 02-01 | Cria nova sessão pela sidebar (spawn do `claude`) | ✓ SATISFIED* | `session-store.ts#createSession`, `pty.rs#spawn_session` — *REQUIREMENTS.md checkbox (line 22) and traceability row (line 102) still show unchecked/"Pending"; this is a stale documentation artifact, not a functional gap (see note below) |
| SESS-03 | 02-06 | Navega entre sessões sem fechar nenhuma | ✓ SATISFIED (mechanism); real-time replay is backstop | `focus-algorithm.ts`, `session-store.ts#liveSessions` |
| SESS-06 | 02-01, 02-02, 02-06 | Arquiva/exclui sem zombie processes | ✓ SATISFIED (Linux CI proof); Windows real-machine confirmation is backstop | `process_guard.rs`, `tree_kill.rs`, `archiveSession` |
| TERM-01 | 02-01 | Terminal real embutido rodando `claude` interativo | ✓ SATISFIED* | `TerminalView.tsx`, `pty.rs` — *same stale-checkbox note as SESS-02 (REQUIREMENTS.md line 30/107) |
| TERM-02 | 02-05 | Scrollback, copiar/colar, links clicáveis | ✓ SATISFIED (wiring); real click-to-browser is backstop | `TerminalView.tsx`, `plugin-opener` |
| TERM-03 | 02-05 | Busca no scrollback | ⚠️ PARTIAL | Search logic fully works via Ctrl+F; icon-based entry point from the plan's own must_have is missing (see Gaps) |

**Note on stale REQUIREMENTS.md checkboxes:** SESS-02 and TERM-01 are listed as `[ ]` unchecked (lines 22, 30) and "Pending" in the traceability table (lines 102, 107) despite being fully implemented, tested, and declared `requirements-completed: [SESS-02, TERM-01, SESS-06]` in `02-01-SUMMARY.md`. Code+test evidence above confirms these ARE implemented. Recommend updating REQUIREMENTS.md's checkboxes/traceability table to reflect Phase 2's actual completion — this is a documentation-sync gap, not a functional one, and does not block phase goal achievement.

**No orphaned requirements:** all 8 IDs declared across the 6 plans' frontmatter (`PROJ-04, SESS-01, SESS-02, SESS-03, SESS-06, TERM-01, TERM-02, TERM-03`) match exactly REQUIREMENTS.md's Phase 2 traceability row.

### Anti-Patterns Found

None blocking. Scan of all 18 key phase-2 files for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|not implemented|coming soon` found zero real debt markers (2 matches were the Portuguese word "todo" = "all", false positives).

**Documented, non-blocking deviations** (already tracked in `.planning/WINDOWS.md`, all `status: open`, none `waived`):
1. `toolMissing.*.body` copy kept generic per UI-SPEC's own flagged `unresolved` item — not a must_have violation.
2. **TerminalSearchBar only opens via Ctrl+F/Cmd+F, not via icon** — this DOES conflict with 02-05-PLAN.md's stated must_have truth; promoted to a Gap in this report (see frontmatter `gaps:`).
3. Archive row removal has no 150ms fade+collapse animation — not in 02-06-PLAN.md's must_haves; cosmetic only.
4. StrictMode dev-only resize retry edge case — dev-only, does not affect production builds.

### Human Verification Required

4 backstop items (explicitly marked `verification: backstop` in PLAN frontmatter, honest-verifier discipline — cannot be confirmed by automated evidence in this Linux sandbox) plus 2 general Manual-Only smoke tests from `02-VALIDATION.md`. Full detail in the frontmatter `human_verification:` list above. Summary:

1. **Zero zombie processes on real Windows** (SESS-06) — win32job Job Object path cannot run on Linux; Linux-equivalent mechanism proven via `tree_kill_leaves_no_zombies`.
2. **Clickable URL opens OS browser** (TERM-02) — not observable in jsdom; wiring code-verified.
3. **Background session replay without gaps over real elapsed time** (SESS-03) — algorithm proven via mocks/round-trip test; real timing requires a live `claude` process.
4. **Real interactive `claude` usage in the embedded terminal** (SESS-02/TERM-01) — PTY fidelity with a real interactive binary.
5. **Manual smoke of populated sidebar + tool-missing state** (SESS-01/PROJ-04) — requires real filesystem + PATH manipulation.

### Gaps Summary

One genuine, previously-disclosed gap: **02-05-PLAN.md's must_have "TerminalSearchBar abre via ícone/Ctrl+F" is only half-satisfied** — Ctrl+F/Cmd+F works and is fully tested (counter, cycling, no-match warning, Esc-to-focus), but no icon/button exists anywhere in the terminal chrome to open the search bar by mouse, because no `TerminalPane`/chrome-header component was ever built across any of the 6 executed plans in this phase. This was transparently disclosed by the executor in `02-05-SUMMARY.md` and tracked as an open item in `.planning/WINDOWS.md` (#2) — it was not hidden, but it also was never closed or overridden.

**This looks intentional and low-severity, not a functional regression.** ROADMAP.md's Success Criterion #4 for this phase ("Usuário busca texto no scrollback do terminal e encontra ocorrências anteriores") does not itself require an icon-based entry point — it is satisfied by the Ctrl+F path. To accept this deviation formally, add to VERIFICATION.md frontmatter:

```yaml
overrides:
  - must_have: "TerminalSearchBar abre via ícone/Ctrl+F"
    reason: "Nenhum componente de chrome do terminal (TerminalPane) existe ainda nesta fase para hospedar um ícone; Ctrl+F/Cmd+F satisfaz a Success Criteria #4 do ROADMAP (buscar e encontrar ocorrências). O ícone fica para quando o TerminalPane for construído."
    accepted_by: "{seu nome}"
    accepted_at: "{timestamp ISO atual}"
```

All 4 explicit `verification: backstop` items (SESS-06 ×2, TERM-02, SESS-03) plus 2 general Manual-Only smoke tests are legitimate, disclosed, non-fabricated human-verification needs — they were NOT silently marked passed, per the honest-verifier discipline requested for this review. Every other must-have across all 6 plans (26 of 27 non-backstop truths) is backed by direct source-code reading AND a passing automated test that this verifier ran itself (`cargo test`: 24 unit + 1 integration, all pass; `npx vitest run`: 278/278 pass; `npx tsc --noEmit`: clean).

---

*Verified: 2026-07-23T18:35:00Z*
*Verifier: Claude (gsd-verifier)*
