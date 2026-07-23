---
phase: 2
slug: sess-o-viva
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-23
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by plan-phase from `02-RESEARCH.md` `## Validation Architecture`. The
> Per-Task Verification Map is completed once PLAN.md tasks exist (validate-phase §6).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` (já instalado desde a Fase 1, ambiente `jsdom`) para a lógica de frontend isolável de DOM real: `session-store`, `sessions/discover.ts`, e o algoritmo de foco (Pattern 3, mockando `Terminal`/`SerializeAddon`). `cargo test` (já usado em `project.rs`/`planning_watcher.rs`) para a lógica Rust isolável de I/O real: `encode_project_path`, filtros de `process_guard.rs`, e um teste de **integração** de tree-kill (spawn → neto → kill → assert zero PIDs). |
| **Config file** | `vitest.config.ts` já existe (Fase 1); nenhum novo framework necessário. |
| **Quick run command** | `npx vitest run src/sessions src/pty src/stores/session-store.test.ts` |
| **Full suite command** | `npm run test && cargo test --manifest-path src-tauri/Cargo.toml` |
| **Estimated runtime** | ~10s (frontend isolado) · ~40s+ no primeiro `cargo test` (compilação a frio + teste de integração de processo real). |

Regra estrutural que sustenta a latência baixa: a lógica de descoberta de sessões, o
store e o algoritmo de foco são funções/reducers puros — não dependem de spawnar um
processo real nem de um canvas WebGL de verdade. O caminho que **não** é unit-testável
(spawnar o `claude` real e ver bytes voltarem pelo Channel) fica isolado atrás do
`PtyManager` e é coberto por smoke test / UAT (ver Manual-Only).

---

## Sampling Rate

- **After every task commit:** `npx vitest run src/sessions src/pty src/stores` (frontend) + `cargo test --manifest-path src-tauri/Cargo.toml` (Rust)
- **After every plan wave:** `npm run test && cargo test --manifest-path src-tauri/Cargo.toml` (suíte completa) + smoke manual de "criar sessão, ver output real do `claude` aparecer no terminal"
- **Before `/gsd-verify-work`:** suíte completa verde **mais** o UAT explícito de SESS-06 (tree-kill) tratado como critério de fundação não-negociável
- **Max feedback latency:** 25 segundos (frontend) — o `cargo test` de integração de processo real é mais lento e roda por-wave, não por-commit

---

## Per-Task Verification Map

> **Draft — a completar após o planejamento.** As linhas abaixo são derivadas do
> `## Validation Architecture` do `02-RESEARCH.md` no nível de requisito. O planner
> escreve `<verify>` por tarefa; validate-phase (§6) preenche os Task IDs concretos e
> promove `status: validated` + `nyquist_compliant: true`.

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|-------------|----------|-----------|-------------------|-------------|
| PROJ-04 | `check_claude_on_path` retorna caminho quando presente, `None` quando ausente | unit (Rust) | `cargo test check_claude_on_path` | ❌ W0 |
| SESS-01 | `encode_project_path` reproduz a regra `/a/b` → `-a-b` | unit (Rust) | `cargo test encode_project_path` | ❌ W0 |
| SESS-01 | `listSessions` filtra `subagents/` e não-`.jsonl`, extrai `id`+`lastModified` | unit (TS, fixture de diretório) | `npx vitest run src/sessions/discover.test.ts` | ❌ W0 |
| SESS-02, TERM-01 | `spawn_session` sobe processo real e transporta bytes PTY→Channel→xterm | smoke (binário substituto de `claude` em CI) + UAT manual | ver Manual-Only | ❌ W0 |
| SESS-03 | Algoritmo de foco (dispose/serialize/restore/flush) isolável via mocks | unit (TS) | `npx vitest run src/components/terminal/focus-algorithm.test.ts` | ❌ W0 |
| SESS-06 | Kill de árvore de processos: spawn → neto → kill → **zero PIDs remanescentes** | integration (Rust, processo real) | `cargo test tree_kill_leaves_no_zombies` | ❌ W0 |
| TERM-02 | `@xterm/addon-web-links` torna URL do output clicável | UAT manual | ver Manual-Only | — |
| TERM-03 | `@xterm/addon-search` encontra ocorrência no scrollback | unit (se addon testável sem canvas) ou UAT | `npx vitest run src/components/terminal/search.test.tsx` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Derivado de `02-RESEARCH.md` `### Wave 0 Gaps`. A infraestrutura de teste (vitest, cargo)
já existe desde a Fase 1; o que falta é específico desta fase:

- [ ] **Spike A1 (bloqueante, primeira tarefa):** confirmar a API real do `win32job` para associar um processo filho já spawnado (não o processo atual) a um Job Object, via `cargo doc`/código-fonte, antes de `process_guard.rs` ser construído (Assumptions Log A1 / Open Question #3 do research)
- [ ] `src-tauri/src/process_guard.rs` — não existe ainda; criado depois do spike A1
- [ ] Binário/script auxiliar de teste que imprime, aguarda e spawna um "neto" de vida curta — necessário para o teste de integração de tree-kill de SESS-06
- [ ] Fixtures/mocks de `Terminal`/`Channel`/`SerializeAddon` para `src/sessions/discover.test.ts` e `src/components/terminal/focus-algorithm.test.ts`
- [ ] Confirmar viabilidade de testar `@xterm/addon-search` sem canvas real (jsdom já presente) — se inviável, mover TERM-03 para Manual-Only permanente

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Zero processos remanescentes após kill de sessão e após fechar o app | SESS-06 | Inspecionar a árvore de processos real do SO após o kill exige um SO real com processos reais; é um teste de processo (automatizável como `cargo test` de integração), mas a confirmação final "zero zumbis" na máquina Windows do autor é um gate manual de fundação | Abrir N sessões reais do `claude`, matar cada uma individualmente e depois fechar o app inteiro. Inspecionar Task Manager (Windows) / `ps -ef` (Unix) confirmando que nenhum PID da árvore original sobrevive. Critério de fundação não-negociável antes de `/gsd-verify-work`. |
| Output real do `claude` interativo aparece e é utilizável no terminal embutido | SESS-02, TERM-01 | Fidelidade de um PTY real com um binário interativo real não é reproduzível com fidelidade em DOM headless | Com `npm run tauri dev`, criar uma sessão num projeto real, digitar uma pergunta ao `claude`, confirmar streaming de output fluido, copiar/colar e scrollback com limite |
| URL no output vira link clicável | TERM-02 | Bibliotecas de terminal são difíceis de testar via DOM headless com fidelidade | Fazer o `claude` imprimir uma URL; confirmar que fica clicável e abre no navegador do SO |
| Sessões inativas continuam vivas ao trocar de foco | SESS-03 | O comportamento "processo em background continua produzindo/recebendo" só é observável com processos reais ao longo do tempo | Abrir 2+ sessões, iniciar algo de longa duração em uma, trocar para outra e voltar — confirmar que o buffer restaurado contém o que foi produzido enquanto estava em background |

---

## Validation Sign-Off

- [ ] All tasks have `<verify>` (automated) or Wave 0 dependencies — *pending planning*
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify — *pending planning*
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s (frontend)
- [ ] `nyquist_compliant: true` set in frontmatter — *set by validate-phase after plans exist*

**Approval:** draft (seeded by plan-phase 2026-07-23) — awaiting task map completion
