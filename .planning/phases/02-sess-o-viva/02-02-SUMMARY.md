---
phase: 02-sess-o-viva
plan: 02
subsystem: testing
tags: [rust, portable-pty, sysinfo, process-guard, integration-test, sess-06]

# Dependency graph
requires:
  - phase: 02-01
    provides: "process_guard::TreeGuard (win32job/killpg) + pty.rs spawn/kill_session já implementados"
provides:
  - "Teste de integração automatizado tree_kill_leaves_no_zombies, rodando na matriz de CI multiplataforma"
  - "Binário auxiliar tree_kill_helper reutilizável por futuros testes de processo real desta fase"
  - "process_guard como pub mod, exercitável por testes de integração externos ao crate"
affects: [02-03, 02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added: ["sysinfo 0.38.4 (dev-dependency, inspeção real da tabela de processos do SO)"]
  patterns:
    - "Binário auxiliar de teste que se re-invoca a si mesmo (via flag --grandchild) para simular topologia processo->subprocesso sem depender de comandos de SO específicos de plataforma (sleep/timeout)"
    - "Teste de integração que confirma vivo-antes/morto-depois via sysinfo, nunca só a ausência do processo depois do kill (evita teste vacuoso)"

key-files:
  created:
    - src-tauri/src/bin/tree_kill_helper.rs
    - src-tauri/tests/tree_kill.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs

key-decisions:
  - "sysinfo pinado em 0.38.4 (não 0.39.x mais recente) porque 0.39 exige rustc 1.95 e o toolchain deste ambiente é 1.94.1; API de refresh_processes/Pid idêntica entre as duas séries"
  - "process_guard passou de mod privado para pub mod em lib.rs, exigido pelo key_link do plano (teste de integração exercita TreeGuard diretamente como crate externo)"
  - "Neto simulado via segunda invocação do próprio tree_kill_helper (flag --grandchild), não via sleep/timeout do SO, para evitar dependência de binários que variam entre plataformas (timeout.exe recusa rodar sem console real quando stdout é pipe)"

patterns-established:
  - "Testes de integração de processo real usam portable-pty (não std::process::Command) para exercitar TreeGuard::attach exatamente como pty.rs::spawn_session faz em produção"

requirements-completed: [SESS-06]

coverage:
  - id: D1
    description: "cargo test tree_kill_leaves_no_zombies spawna processo com neto, aciona TreeGuard::kill_tree, e afirma via sysinfo que nenhum PID original sobrevive"
    requirement: "SESS-06"
    verification:
      - kind: integration
        ref: "src-tauri/tests/tree_kill.rs#tree_kill_leaves_no_zombies"
        status: pass
    human_judgment: false
  - id: D2
    description: "Confirmação real em máquina Windows: abrir N sessões e matá-las (individualmente e via fechar o app) deixa zero processos remanescentes no Task Manager"
    requirement: "SESS-06"
    verification: []
    human_judgment: true
    rationale: "Backstop explícito do PLAN.md (must_haves.truths, verification: backstop) — mecanismo Job Object é específico do Windows e este ambiente de execução é Linux; validação real fica para UAT do autor em máquina Windows, conforme 02-VALIDATION.md Manual-Only"

duration: 7min
completed: 2026-07-23
status: complete
---

# Phase 02 Plan 02: Prova de fundação SESS-06 (tree-kill) Summary

**Teste de integração `tree_kill_leaves_no_zombies` que spawna um processo real com neto via `portable-pty`, aciona `TreeGuard::kill_tree`, e confirma via `sysinfo` — inspecionando a tabela de processos real do SO — que nem filho nem neto sobrevivem.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-23T17:02:32Z
- **Completed:** 2026-07-23T17:09:19Z
- **Tasks:** 2
- **Files modified:** 4 (2 criados, 2 modificados, além de Cargo.lock)

## Accomplishments
- `src-tauri/src/bin/tree_kill_helper.rs`: binário auxiliar mínimo que imprime um marcador determinístico, spawna um "neto" (segunda invocação de si mesmo via `--grandchild`), imprime o PID do neto, e dorme indefinidamente até ser morto — reproduzindo a topologia real `claude (filho) → subprocesso (neto)`
- `src-tauri/tests/tree_kill.rs`: teste de integração `tree_kill_leaves_no_zombies` que spawna o helper via `portable_pty` (mesmo fluxo de `pty.rs::spawn_session`), aciona `TreeGuard::attach`/`kill_tree`, e usa `sysinfo` para afirmar vivo-antes (não-vacuoso) e morto-depois para ambos os PIDs
- `sysinfo` 0.38.4 adicionado como dev-dependency — inspeciona a tabela de processos real do SO, nunca a UI (fecha exatamente a lacuna do Pitfall 1 documentado em `02-RESEARCH.md`)
- SESS-06 agora tem prova automatizada rodando na suite `cargo test`, além do UAT manual em Windows real que permanece como backstop de fundação

## Task Commits

Each task was committed atomically:

1. **Task 1: Binário auxiliar com neto + dependência sysinfo** - `6473f07` (feat)
2. **Task 2: Teste de integração tree_kill_leaves_no_zombies** - `6d18a22` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src-tauri/src/bin/tree_kill_helper.rs` - Binário auxiliar: marcador + spawn de neto (auto-invocação com `--grandchild`) + sleep indefinido
- `src-tauri/tests/tree_kill.rs` - Teste de integração `tree_kill_leaves_no_zombies`
- `src-tauri/Cargo.toml` - `sysinfo = "0.38.4"` em `[dev-dependencies]`, `[[bin]] name = "tree_kill_helper"`
- `src-tauri/src/lib.rs` - `mod process_guard` → `pub mod process_guard` (necessário para o teste de integração externo acessar `TreeGuard`)

## Decisions Made
- `sysinfo` pinado em `0.38.4` em vez do `0.39.6` mais recente do crates.io: `0.39.x` declara `rust-version = "1.95"` e o toolchain deste ambiente é `rustc 1.94.1`, então `cargo test` falhava na resolução de dependências antes mesmo de compilar. `0.38.4` (`rust-version = "1.88"`) expõe a mesma API usada aqui (`System::new`, `refresh_processes(ProcessesToUpdate::All, true)`, `Pid::from_u32`, `System::process`), sem nenhuma mudança de código necessária além da versão no `Cargo.toml`.
- O "neto" da topologia de teste é uma segunda invocação do próprio `tree_kill_helper` (via `env::current_exe()` + flag `--grandchild`), não um comando de sistema como `sleep`/`timeout`. Isso evita depender de binários que se comportam diferente entre plataformas — notavelmente `timeout.exe` no Windows recusa rodar sem um console real quando stdout está redirecionado por pipe, o que quebraria justamente o cenário do teste (`portable-pty` conecta stdout a um master de PTY, não a um pipe simples, mas a robustez de não depender de nenhum binário externo era preferível e mais fácil de raciocinar entre as três plataformas de CI).
- `process_guard` module tornou-se `pub` (era `mod process_guard;` privado) — exigência direta do `key_links` do PLAN.md ("o teste de integração exercita `process_guard::TreeGuard` do crate lib diretamente"); sem isso, `tests/tree_kill.rs` (compilado como um crate externo separado que depende de `gsd_cards_lib`) não teria visibilidade nenhuma sobre `TreeGuard`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `process_guard` precisou virar `pub mod` em lib.rs**
- **Found during:** Task 2 (escrita do teste de integração)
- **Issue:** O plano listava `files_modified` como apenas `Cargo.toml`, `tree_kill_helper.rs` e `tests/tree_kill.rs` — mas `process_guard` era um `mod` privado em `lib.rs`. Um teste de integração em `tests/` é compilado como crate externo separado; itens não-`pub` de um módulo não-`pub` são invisíveis fora do crate, então `use gsd_cards_lib::process_guard::TreeGuard;` não compilaria.
- **Fix:** `mod process_guard;` → `pub mod process_guard;` em `src-tauri/src/lib.rs`, com comentário explicando o motivo. `TreeGuard::attach`/`kill_tree` já eram `pub fn`, então nenhuma outra mudança de visibilidade foi necessária.
- **Files modified:** `src-tauri/src/lib.rs`
- **Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --test tree_kill tree_kill_leaves_no_zombies` compila e passa
- **Committed in:** `6d18a22` (Task 2 commit)

**2. [Rule 3 - Blocking] `sysinfo` pinado em 0.38.4 em vez da versão mais recente (0.39.6)**
- **Found during:** Task 2 (primeira execução de `cargo test`)
- **Issue:** `sysinfo = "0.39.6"` (versão estável mais recente no momento da Task 1) falhou na resolução de dependências: `sysinfo@0.39.6 requires rustc 1.95`, e o toolchain instalado neste ambiente é `1.94.1`.
- **Fix:** `cargo info sysinfo@<versão>` confirmou que a série `0.38.x` (rust-version 1.88) é a mais recente compatível; `Cargo.toml` atualizado para `sysinfo = "0.38.4"` (última patch da série 0.38), `Cargo.lock` regenerado. Nenhuma mudança de código necessária — a API usada (`System::new`, `refresh_processes`, `ProcessesToUpdate::All`, `Pid::from_u32`, `System::process`) é idêntica entre as duas séries.
- **Files modified:** `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
- **Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --test tree_kill tree_kill_leaves_no_zombies` passa; suite completa (`cargo test --manifest-path src-tauri/Cargo.toml`) também verde (16 testes unitários + 1 de integração)
- **Committed in:** `6d18a22` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (ambos Rule 3 - blocking)
**Impact on plan:** Ambos os fixes eram estritamente necessários para o teste sequer compilar/rodar; nenhum escopo novo foi introduzido além do que o plano já pedia (o teste de integração e o binário auxiliar).

## Issues Encountered
None além dos dois itens documentados acima em "Deviations from Plan".

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SESS-06 tem prova automatizada rodando na matriz de CI multiplataforma (Windows/macOS/Linux) da Fase 1 — o mecanismo `TreeGuard` (Job Object/process group) implementado no Plano 01 agora tem um teste de integração que falharia de verdade se o kill de árvore regredisse (ex.: alguém trocasse `killpg` por `kill()` simples, ou removesse `assign_process` no Windows).
- Suite `cargo test` completa verde: 16 testes unitários (incluindo os 5 de `process_guard`) + 1 teste de integração (`tree_kill_leaves_no_zombies`), sem nenhum processo remanescente (`ps aux` confirmado limpo após a execução).
- **Pendência explícita e esperada (não é um blocker deste plano):** a confirmação real "zero zumbis no Windows" (`must_haves.truths` marcado `verification: backstop`) permanece como UAT manual do autor em máquina Windows real, conforme `02-VALIDATION.md` Manual-Only — este ambiente de execução é Linux e não pode validar o caminho `#[cfg(windows)]` de `win32job` de forma alguma além de compilação cruzada (não tentada aqui, fora do escopo deste plano).
- Nenhum stub, teste pulado ou `<verify>` não executado a registrar no `WINDOWS.md` — ambos os `<verify>` automatizados do plano rodaram e passaram.

---
*Phase: 02-sess-o-viva*
*Completed: 2026-07-23*

## Self-Check: PASSED

- FOUND: src-tauri/src/bin/tree_kill_helper.rs
- FOUND: src-tauri/tests/tree_kill.rs
- FOUND: .planning/phases/02-sess-o-viva/02-02-SUMMARY.md
- FOUND commit: 6473f07 (Task 1)
- FOUND commit: 6d18a22 (Task 2)
- FOUND commit: 2edd406 (SUMMARY)
