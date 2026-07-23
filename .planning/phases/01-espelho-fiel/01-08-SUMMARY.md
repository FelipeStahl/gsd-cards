---
phase: 01-espelho-fiel
plan: 08
subsystem: infra
tags: [ci, github-actions, cargo-test, rust, security-regression]

# Dependency graph
requires:
  - phase: 01-espelho-fiel (planos 01-01, 01-02)
    provides: "is_contained (project.rs, mitigação T-01-01) e is_relevant_change (planning_watcher.rs), ambos com testes #[cfg(test)] já escritos"
provides:
  - "Passo `Cargo test` no job `build` do CI, logo após `Cargo check`, executando `cargo test --manifest-path src-tauri/Cargo.toml` na mesma matriz Windows/macOS/Linux"
affects: [ci, gap-closure, security-regression]

# Tech tracking
tech-stack:
  added: []
  patterns: ["CI executa a suíte de testes Rust (não só type-check) a partir deste plano — reaproveita o mesmo toolchain/cache/libs GTK já configurados para o Cargo check"]

key-files:
  created: []
  modified:
    - .github/workflows/ci.yml

key-decisions:
  - "Nenhuma mudança de matriz, cache ou dependências GTK — cargo test reaproveita exatamente o setup existente do cargo check"

patterns-established: []

requirements-completed: [PROJ-02]

coverage:
  - id: D1
    description: "CI job `build` executa `cargo test --manifest-path src-tauri/Cargo.toml` logo após `Cargo check`, na mesma matriz de SO"
    requirement: "PROJ-02"
    verification:
      - kind: other
        ref: "grep -q 'cargo test --manifest-path src-tauri/Cargo.toml' .github/workflows/ci.yml"
        status: pass
      - kind: unit
        ref: "cargo test --manifest-path src-tauri/Cargo.toml (project.rs::tests, planning_watcher.rs::tests)"
        status: unknown
    human_judgment: true
    rationale: "A presença e posição do passo no ci.yml foi verificada localmente (grep). A execução real da suíte Rust (6 testes de is_contained/T-01-01 + testes de is_relevant_change) não pôde ser confirmada neste sandbox — falta o toolchain GTK/webkit2gtk necessário para linkar o crate Tauri (mesma limitação documentada em 01-VERIFICATION.md). A confirmação de que os testes de fato passam em CI fica para a primeira execução real do workflow no GitHub Actions."

duration: 8min
completed: 2026-07-23
status: complete
---

# Phase 01 Plan 08: CI roda `cargo test` — fecha o gap CR-01 Summary

**Adicionado o passo `Cargo test` (`cargo test --manifest-path src-tauri/Cargo.toml`) ao job `build` do CI, logo após o `Cargo check` existente, na mesma matriz Windows/macOS/Linux — os testes `#[cfg(test)]` de contenção de caminho (`is_contained`, mitigação T-01-01) e do watcher (`is_relevant_change`) passam a rodar em toda build em vez de serem peso morto.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-23T10:20:00Z
- **Completed:** 2026-07-23T10:28:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Passo `Cargo test` acrescentado ao job `build` de `.github/workflows/ci.yml`, imediatamente após `Cargo check`, dentro da mesma matriz `[windows-latest, macos-latest, ubuntu-latest]`
- Nenhuma mudança de matriz, cache de cargo ou instalação de dependências GTK — `cargo test` reaproveita integralmente o setup já existente do `cargo check`
- Gap CR-01 (confirmado em `01-VERIFICATION.md` e esboçado em `01-REVIEW.md`) fechado: T-01-01 (path traversal via symlink / prefixo textual comum) ganha proteção de regressão contínua no CI, não só verificação manual pontual

## Task Commits

Each task was committed atomically:

1. **Task 1: Rodar os testes unitários Rust em toda build de CI (CR-01)** - `135d84a` (feat)

**Plan metadata:** commit pendente (docs: complete plan)

## Files Created/Modified
- `.github/workflows/ci.yml` - Acrescentado o passo `Cargo test` (`run: cargo test --manifest-path src-tauri/Cargo.toml`) logo após `Cargo check`, mesma matriz de SO

## Decisions Made
- Nenhuma mudança de matriz, cache de cargo (`actions/cache@v4`) ou instalação de libs GTK do Linux — `cargo test` reaproveita o mesmo toolchain (`dtolnay/rust-toolchain@stable`) e o mesmo cache já configurados para `cargo check`, conforme esboçado em `01-REVIEW.md` → CR-01

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Ao tentar validar localmente com `cargo test --manifest-path src-tauri/Cargo.toml` (além do `grep` exigido pelo `<verify>` automatizado), a compilação falhou em `gdk-sys` por ausência de `gdk-3.0.pc`/GTK dev libs no sandbox (`pkg-config` não encontra `gdk-3.0`) — a mesma limitação de ambiente já documentada em `01-VERIFICATION.md` ("Nota sobre a limitação do Rust"). Nenhuma tentativa foi feita de instalar o toolchain Rust/GTK/webkit2gtk no sandbox, conforme instrução explícita do ambiente de execução deste plano. A verificação local ficou restrita à checagem `grep -q 'cargo test --manifest-path src-tauri/Cargo.toml' .github/workflows/ci.yml`, que passou (exit 0). A execução real da suíte de testes Rust (6 testes de `is_contained` + testes de `is_relevant_change`) fica a cargo da primeira execução deste workflow no GitHub Actions, que roda em `ubuntu-latest`/`macos-latest`/`windows-latest` com as libs GTK já instaladas pelo passo "Install Tauri Linux system dependencies" existente.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Gap CR-01 fechado — junto com CR-02 (01-07) e CR-03 (01-07), os três gaps confirmados em `01-VERIFICATION.md` foram endereçados. Os dois gaps de correção mais severos (CR-02, badges de bloqueio desatualizados; CR-03, cache de artefato nunca invalidado) já foram corrigidos e commitados no plano 01-07. Este plano fecha o terceiro e último gap (CR-01), de severidade menor. Recomenda-se rodar `/gsd-audit-uat` ou uma nova passada de `/gsd-verify-work`/`/gsd-verify-phase` para confirmar que os três gaps do `01-VERIFICATION.md` foram de fato fechados antes de avançar para a próxima fase. A execução real de `cargo test` em CI (Windows/macOS/Linux) ainda não foi observada diretamente (bloqueada pela limitação de toolchain GTK neste sandbox) — o primeiro push/PR que disparar este workflow será a confirmação definitiva de que os 6+ testes Rust passam nas três plataformas.

---
*Phase: 01-espelho-fiel*
*Completed: 2026-07-23*
