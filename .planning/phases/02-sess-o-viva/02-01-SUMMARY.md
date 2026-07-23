---
phase: 02-sess-o-viva
plan: 01
subsystem: pty-terminal
tags: [pty, portable-pty, tree-kill, win32job, xterm, tauri-channel, tracer, mvp]

# Dependency graph
requires:
  - phase: 01-espelho-fiel (plano 01-02)
    provides: "validate_project_root / root canonicalizado (project.rs) — usado como cwd de spawn_session"
  - phase: 01-espelho-fiel (plano 01-04)
    provides: "planning_watcher.rs — padrão de thread de background + streaming ao frontend replicado por pty.rs"
provides:
  - "PtyManager + comandos spawn_session/write_session/resize_session/kill_session (pty.rs), streaming de bytes crus por Channel<Vec<u8>>"
  - "TreeGuard (process_guard.rs) — kill de árvore de processos cross-platform (win32job no Windows, killpg no Unix)"
  - "channel.ts / session-store.ts / TerminalView.tsx — caminho frontend Channel<Uint8Array> → xterm.js"
  - "RunEvent::ExitRequested teardown de todas as sessões vivas no fechamento do app"
affects: [pty, terminal, session-lifecycle, sess-06-foundation]

# Tech tracking
tech-stack:
  added:
    - "portable-pty 0.9.0 (Rust) — PTY real com ConPTY no Windows"
    - "which 8.0.5 (Rust) — detecção de binários no PATH"
    - "win32job 2.0.3 (Rust, cfg(windows)) — Job Object kill-on-job-close (spike A1 resolvido)"
    - "nix 0.31.3 feature signal (Rust, cfg(unix)) — killpg(-pid, SIGKILL)"
    - "@xterm/xterm 6.0.0 + addon-fit/webgl/search/serialize/web-links"
  patterns:
    - "Bytes crus (Vec<u8>/Uint8Array) atravessam o Tauri Channel sem decodificação UTF-8 no Rust — xterm.js decodifica incrementalmente"
    - "TreeGuard::attach chamado DENTRO de spawn_session, no instante do spawn (associação no momento da criação é pré-requisito do kill de árvore)"

key-files:
  created:
    - src-tauri/src/process_guard.rs
    - src-tauri/src/pty.rs
    - src/pty/channel.ts
    - src/pty/channel.test.ts
    - src/stores/session-store.ts
    - src/stores/session-store.test.ts
    - src/components/terminal/TerminalView.tsx
    - src/locales/pt-BR/session.json
    - src/locales/en/session.json
  modified:
    - src-tauri/src/lib.rs
    - src-tauri/Cargo.toml
    - package.json
    - src/i18n.ts
    - src/shell/DrawerRail.tsx

key-decisions:
  - "win32job 2.0.3 confirmado (spike A1): ExtendedLimitInfo + limit_kill_on_job_close + assign_process associando o Child já spawnado ao Job — a árvore morre quando o handle do Job fecha"
  - "Channel<Vec<u8>> transporta bytes crus; nenhuma decodificação UTF-8 no lado Rust (evita cortar caractere multibyte no limite do chunk)"
  - "cwd de spawn_session vem exclusivamente do root já validado por validate_project_root da Fase 1 — nunca um caminho cru do frontend"

patterns-established:
  - "process_guard.rs: split #[cfg(windows)]/#[cfg(unix)] com uma API TreeGuard unificada (attach/kill_tree)"
  - "pty.rs: PtyManager(Mutex<HashMap<String, PtySession>>) + função testável pump_pty_output isolada do Channel real"

requirements-completed: [SESS-02, TERM-01, SESS-06]

coverage:
  - id: T1
    description: "spawn_session sobe processo real via portable-pty com cwd validado; thread leitora empurra bytes crus para Channel<Vec<u8>> por sessão"
    requirement: "SESS-02, TERM-01"
    verification:
      - kind: unit
        ref: "cargo test --manifest-path src-tauri/Cargo.toml pty (pump_pty_output_forwards_bytes_from_a_real_process)"
        status: pass
    human_judgment: false
  - id: T2
    description: "Caminho de dados PTY→sink transporta bytes de um binário substituto end-to-end"
    requirement: "SESS-02, TERM-01"
    verification:
      - kind: unit
        ref: "cargo test pty + npx vitest run src/pty src/stores/session-store.test.ts (13 passed)"
        status: pass
    human_judgment: false
  - id: T3
    description: "kill_session aciona TreeGuard antes de Child::kill(); Job Object (Windows) / killpg (Unix); ExitRequested mata todas as sessões vivas"
    requirement: "SESS-06"
    verification:
      - kind: unit
        ref: "cargo test --manifest-path src-tauri/Cargo.toml process_guard (5 passed)"
        status: pass
    human_judgment: false
  - id: T4
    description: "Após kill_session ou fechar o app, nenhum processo da árvore do claude (incl. netos) permanece vivo no SO real"
    requirement: "SESS-06"
    verification:
      - kind: other
        ref: "UAT manual em SO real (Task Manager/ps) — backstop must_have; prova automatizada de árvore fica no Plano 02-02"
        status: unknown
    human_judgment: true
    rationale: "must_have backstop (verification: backstop). O teste de integração automatizado de tree-kill (spawn→neto→kill→zero PIDs) é o Plano 02-02; a confirmação final 'zero zumbis' na máquina Windows do autor é o gate de fundação de /gsd-verify-work."

duration: ~12min
completed: 2026-07-23
status: complete
---

# Phase 02 Plan 01: Fatia-traçadora — sessão viva end-to-end Summary

**Slice vertical mais fino da Fase 2, ligado de ponta a ponta e verificado: criar sessão → `spawn` de um processo real num PTY (`portable-pty`) no cwd validado do projeto → streaming de bytes crus por um Tauri `Channel<Vec<u8>>` → `terminal.write()` num xterm.js vivo no drawer → `kill` limpo da árvore de processos via `TreeGuard` (Job Object no Windows / `killpg` no Unix) + teardown de todas as sessões no `RunEvent::ExitRequested`. O spike A1 (`win32job`) foi resolvido antes de qualquer código de produção depender dele.**

## Reconciliation note

Este SUMMARY foi reconstruído pelo orquestrador (fluxo "close out manually" do safe_resume_gate do execute-phase). As duas tarefas do plano já haviam sido implementadas e commitadas por uma execução anterior interrompida (commits `7811443` e `9a3ff39`), mas essa execução parou antes de escrever o SUMMARY. Todos os comandos `<verify>` do plano foram re-executados nesta sessão e passaram (evidência abaixo) antes de fechar o plano e prosseguir para a Wave 2. Nenhuma re-execução de código foi feita — evitando trabalho duplicado/conflito.

## Performance

- **Duration:** ~12 min (execução original; janela dos commits 16:01→16:13Z)
- **Completed:** 2026-07-23
- **Tasks:** 2
- **Files created:** 9 · **Files modified:** 5

## Accomplishments
- **Spike A1 resolvido** — `win32job` 2.0.3 confirmado para associar um `Child` já spawnado a um Job Object com `limit_kill_on_job_close`; `process_guard.rs` (`TreeGuard`, 175 linhas) construído sobre isso, com split `#[cfg(windows)]`/`#[cfg(unix)]`
- **PTY real + streaming** — `pty.rs` (320 linhas): `PtyManager`, `spawn_session`/`write_session`/`resize_session`/`kill_session`, e `pump_pty_output` (função testável isolada do Channel)
- **Caminho frontend** — `channel.ts` (`Channel<Uint8Array>` → 4 comandos), `session-store.ts` (zustand+immer mínimo), `TerminalView.tsx` (host xterm.js com dispose simétrico sobrevivendo ao double-invoke do StrictMode), gatilho temporário no `DrawerRail`
- **Teardown de fundação (SESS-06)** — `kill_session` aciona `TreeGuard` antes de `Child::kill()`; `RunEvent::ExitRequested` itera e mata todas as sessões vivas ao fechar o app
- **i18n** — novo namespace `session.json` (pt-BR/en)

## Task Commits

Each task was committed atomically:

1. **Task 1: Dependências PTY/terminal + TreeGuard (spike A1 win32job)** — `7811443` (feat)
2. **Task 2: Fatia end-to-end criar sessão → claude no PTY → bytes no xterm → kill limpo** — `9a3ff39` (feat)

## Verification Evidence (re-run this session)

- `cargo build --manifest-path src-tauri/Cargo.toml` → exit 0 (1 warning benigno de `dead_code` em `GuardError`, campos usados só em `cfg(windows)`)
- `cargo test --manifest-path src-tauri/Cargo.toml process_guard` → **5 passed**
- `cargo test --manifest-path src-tauri/Cargo.toml pty` → **2 passed** (incl. `pump_pty_output_forwards_bytes_from_a_real_process`)
- `npx vitest run src/pty src/stores/session-store.test.ts` → **13 passed** (2 arquivos)

## Files Created/Modified
- **Criados:** `src-tauri/src/process_guard.rs`, `src-tauri/src/pty.rs`, `src/pty/channel.ts` (+`.test.ts`), `src/stores/session-store.ts` (+`.test.ts`), `src/components/terminal/TerminalView.tsx`, `src/locales/{pt-BR,en}/session.json`
- **Modificados:** `src-tauri/src/lib.rs` (`.manage(PtyManager)`, `generate_handler!` dos 4 comandos, handler `ExitRequested`), `src-tauri/Cargo.toml` (+portable-pty/which/win32job/nix), `package.json` (+`@xterm/*`), `src/i18n.ts` (namespace session), `src/shell/DrawerRail.tsx` (gatilho temporário)

## Decisions Made
- `win32job` associando o Child já spawnado (não o processo atual) ao Job — resolve a Open Question #3 / Assumption A1 do `02-RESEARCH.md`
- Bytes crus no Channel, decodificação UTF-8 só no xterm.js
- cwd de `spawn_session` sempre do root validado da Fase 1

## Deviations from Plan

None — as duas tarefas foram implementadas conforme escritas (verificado por re-execução dos `<verify>`).

## Issues Encountered

O plano foi implementado por uma execução anterior que foi interrompida após os dois commits de código mas antes de escrever este SUMMARY (anomalia detectada pelo `safe_resume_gate`: commits de produção presentes, SUMMARY ausente). Reconciliado nesta sessão re-executando todos os `<verify>` (todos verdes) e escrevendo este SUMMARY — sem re-executar código.

## User Setup Required

None.

## Next Phase Readiness

Tracer verde e verificado — a arquitetura PTY↔Channel↔xterm e o mecanismo de kill de árvore estão provados. As Waves 2-4 expandem a partir daqui: **02-02** adiciona o teste de integração automatizado de tree-kill (SESS-06, prova de "zero PIDs" com um neto real), **02-03** o backend de detecção de tools + descoberta de sessões, **02-04/02-05** a sidebar/terminal chrome, **02-06** o foco multi-sessão + affordances de arquivar/excluir. Gate de fundação pendente para `/gsd-verify-work`: UAT manual de SESS-06 (zero zumbis em SO real, Windows).

---
*Phase: 02-sess-o-viva*
*Completed: 2026-07-23*
