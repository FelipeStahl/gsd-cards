---
phase: 1
slug: espelho-fiel
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-22
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` (frontend + parser, ambiente `jsdom` com `@testing-library/react`) e `cargo test` (lógica Rust pura) |
| **Config file** | `vitest.config.ts` — **não existe ainda**; criado no Plano 01-01 Task 3 (ver Wave 0 Requirements) |
| **Quick run command** | `npx vitest run src/planning` |
| **Full suite command** | `npm run test && cargo test --manifest-path src-tauri/Cargo.toml` |
| **Estimated runtime** | ~8s (parser isolado) · ~25s (suíte completa incluindo componentes) · ~40s adicionais no primeiro `cargo test` (compilação a frio) |

Regra estrutural que sustenta a latência baixa: `src/planning/**` não importa nada de `@tauri-apps` a não ser nos módulos de I/O (`read.ts`, `watch.ts`), que são mockados nos testes. A regra de derivação de status (`status.ts`) é função pura e roda sem Tauri de pé.

Nenhum script usa modo watch — todos terminam sozinhos, para servirem de gate de tarefa e de CI.

---

## Sampling Rate

- **After every task commit:** `npx vitest run src/planning` (parser isolado, rápido)
- **After every plan wave:** `npm run test && cargo test --manifest-path src-tauri/Cargo.toml` (suíte completa)
- **Before `/gsd-verify-work`:** suíte completa verde **mais** um `npm run tauri dev` real contra um `.planning/` de verdade, com uma escrita real do GSD acontecendo durante o teste (não só arquivos estáticos) — o gate de tempo real do `PITFALLS.md` só é observável com uma rajada real
- **Max feedback latency:** 25 segundos

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | PROJ-02 | — | N/A (toolchain) | smoke/CLI | `cargo --version && rustc --version && grep -q '## Pré-requisitos' CONTRIBUTING.md` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | PROJ-02 | T-01-SC | Pacotes fora da auditoria de legitimidade não são instalados sem confirmação humana | checkpoint | *(gate humano bloqueante — não automatizável por design)* | ✅ | ⬜ pending |
| 1-01-03 | 01 | 1 | PROJ-02 | T-01-03 | Allowlist de capabilities sem nenhum verbo de mutação de filesystem | unit + build | `npm run typecheck && npm run test && cargo check --manifest-path src-tauri/Cargo.toml` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 1 | PROJ-02 | T-01-02a | CSP `default-src 'self'` sem origem remota de script | unit | `npm run typecheck && npm run test` (+ paridade de chaves de locale) | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 2 | PROJ-02 | T-01-01 / T-01-03b / T-01-05 | Caminho canonicalizado e contido na raiz; escopo `fs` concedido só à raiz validada; teto de 2 MB por leitura | unit + cargo test | `npx vitest run src/planning/read.test.ts && cargo test --manifest-path src-tauri/Cargo.toml` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 2 | BOARD-04 | T-01-04 / T-01-06a | Schema YAML seguro; `unrecognized` explícito em vez de default inferido | unit | `npx vitest run src/planning/parser/state.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-03 | 02 | 2 | PROJ-02, BOARD-04 | T-01-01 | Pasta sem `.planning/` produz tela de erro, nunca board vazio | component | `npx vitest run src/shell/AppShell.test.tsx && npm run typecheck` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 3 | BOARD-01 | T-01-06 | Status derivado da inspeção de diretório, nunca da tabela coarse do ROADMAP; executada-sem-verificação nunca vira concluída | unit | `npx vitest run src/planning/status.test.ts` | ❌ W0 | ⬜ pending |
| 1-03-02 | 03 | 3 | BOARD-01 | T-01-08 / T-01-05b | Nome de diretório fora do padrão é ignorado, não concatenado; falha em uma fase não aborta a varredura | unit | `npx vitest run src/planning/phase-scan.test.ts src/planning/parser/roadmap.test.ts` | ❌ W0 | ⬜ pending |
| 1-03-03 | 03 | 3 | BOARD-01, BOARD-04 | T-01-06 | Badge exato sempre visível (agrupamento nunca esconde o status real) | component | `npx vitest run src/components/PhaseCard.test.tsx src/shell/Board.test.tsx && npm run typecheck` | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 4 | BOARD-03 | T-01-05c / T-01-11 | Watcher escopado a `.planning/**`; temporários de escrita atômica filtrados; watcher único por projeto | cargo test | `cargo test --manifest-path src-tauri/Cargo.toml && cargo check --manifest-path src-tauri/Cargo.toml` | ❌ W0 | ⬜ pending |
| 1-04-02 | 04 | 4 | BOARD-03 | T-01-10 | Caminhos do evento só são aceitos dentro da raiz validada; lote inteiro em uma única transição de estado | integration | `npx vitest run src/planning/watch.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 1-04-03 | 04 | 4 | BOARD-03 | T-01-06b | Estado degradado nunca exibe "sincronizado há X" | component | `npx vitest run src/components/SyncIndicator.test.tsx && npm run typecheck` | ❌ W0 | ⬜ pending |
| 1-05-01 | 05 | 4 | BOARD-02, BOARD-05 | T-01-06c / T-01-06d / T-01-04b | `status` de VERIFICATION nunca cai em `passed` por default; granularidade de tarefa é tudo-ou-nada por plano | unit | `npx vitest run src/planning/parser && npm run typecheck` | ❌ W0 | ⬜ pending |
| 1-05-02 | 05 | 4 | BOARD-02 | T-01-05d | Carregamento preguiçoso por fase selecionada, não eager para todo o board | component | `npx vitest run src/components/DetailPanel.test.tsx && npm run typecheck` | ❌ W0 | ⬜ pending |
| 1-05-03 | 05 | 4 | BOARD-05, BOARD-06 | T-01-02 | HTML embutido em artefato não é renderizado; link de esquema hostil não vira âncora navegável | component | `npx vitest run src/components/ArtifactModal.test.tsx && npm run typecheck` | ❌ W0 | ⬜ pending |
| 1-06-01 | 06 | 4 | BOARD-01 | T-01-08b | Só arquivos no padrão `<versao>-ROADMAP.md` dentro de `.planning/milestones/` são lidos | unit | `npx vitest run src/planning/parser/milestones.test.ts && npm run typecheck` | ❌ W0 | ⬜ pending |
| 1-06-02 | 06 | 4 | BOARD-01 | — | Histórico ausente mostra empty state, nunca seção quebrada | component | `npx vitest run src/components/HistoryStrip.test.tsx && npm run typecheck` | ❌ W0 | ⬜ pending |
| 1-06-03 | 06 | 4 | BOARD-05 | T-01-12 / T-01-06e | Teste lê snapshot versionado, nunca executa processo externo; drift de formato quebra a suíte | unit | `npx vitest run src/planning/oracle-drift.test.ts && npm run test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Continuidade de amostragem:** nenhuma sequência de 3 tarefas consecutivas fica sem verificação automatizada. A única tarefa sem comando automatizado é `1-01-02`, um gate humano bloqueante exigido pela política de legitimidade de pacotes (não automatizável por design); ela é imediatamente precedida e sucedida por tarefas com comando automatizado.

---

## Wave 0 Requirements

Todo o `❌ W0` acima aponta para o mesmo bloco de infraestrutura ausente, criado nas Tasks 1 e 3 do Plano **01-01**, que por isso é a Wave 0 de fato desta fase:

- [ ] Toolchain Rust (`rustup`/`cargo`/`rustc`) + MSVC Build Tools — **ausente na máquina, verificado por probe**; bloqueia `cargo test`, `cargo check` e `npm run tauri dev` (Plano 01-01 Task 1)
- [ ] `package.json` com os scripts `test`, `test:planning`, `typecheck` — o repositório não tem `package.json` (Plano 01-01 Task 3)
- [ ] `vitest.config.ts` com ambiente `jsdom` e setup do `@testing-library/jest-dom` (Plano 01-01 Task 3)
- [ ] Instalação de `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` — precedida pelo gate de legitimidade (Plano 01-01 Task 2)
- [ ] `src/smoke.test.ts` — primeiro teste, prova que a suíte roda (Plano 01-01 Task 3)
- [ ] `src-tauri/Cargo.toml` com o crate de teste habilitado — `cargo test` sem alvo não é gate válido (Plano 01-01 Task 3)
- [ ] `src/planning/__fixtures__/` — capturado incrementalmente: `state/` no Plano 01-02, `roadmap/` e `phases/` no 01-03, `artifacts/` no 01-05, `milestones/` e `oracle/` no 01-06

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Board atualiza sem piscar durante uma rajada real de escrita do GSD | BOARD-03 | O comportamento depende do debounce nativo do SO reagindo a escritas reais de um processo externo (Claude CLI + git). Um teste com escritas simuladas prova a coalescência no frontend, mas não prova que a janela de debounce está bem calibrada contra o padrão real do gsd-core | Com `npm run tauri dev` aberto em `C:\dev\gsd-cards`, rodar um comando `/gsd-*` que escreva vários arquivos e faça commit. Observar: nenhum card quebrado durante a rajada, um único glow por lote estável, sem piscar. Se falhar, ajustar `DEBOUNCE_MS` dentro de 150-300ms e registrar o valor no SUMMARY |
| Watcher degradado e reconexão | BOARD-03 | Exige renomear/remover o diretório observado no filesystem real e observar a reação do watcher nativo | Renomear `.planning/` por alguns segundos → header vira "Desatualizado desde HH:MM" com botão "Reconectar" e board congelado. Restaurar e clicar em "Reconectar" → volta a saudável |
| Janela nativa abre e o linker Rust funciona | PROJ-02 | Compilação e link do binário nativo não são observáveis pela suíte de teste do frontend | `npm run tauri dev` abre uma janela sem erro de linker |
| Fidelidade visual ao `01-UI-SPEC.md` (densidade do card, glow de 1000ms, tema claro/escuro do SO) | BOARD-01, BOARD-04 | Julgamento visual contra um contrato de design; a suíte assegura estrutura e rótulos, não aparência | Abrir o app nos temas claro e escuro do SO e comparar com as seções `## Card Anatomy`, `## Status Badge Mapping` e `## Real-Time & Degradation States` do UI-SPEC |
| Heurística de fase ativa (`ACTIVE_WINDOW_MS`, 5 min) | BOARD-01 | `01-RESEARCH.md` Assumption A3, risco médio: a janela nunca foi validada contra uma execução real de plano GSD | Durante uma execução real de fase que dure mais de 5 minutos sem gravar SUMMARY, observar se o card oscila entre "planejada" e "em execução". Se oscilar, ajustar a constante e registrar no SUMMARY |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 25s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-22
