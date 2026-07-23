# Phase 1: Espelho fiel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-22
**Phase:** 1-Espelho fiel
**Areas discussed:** Tauri vs. Electron, Colunas e status do board, Cards e hierarquia, Tempo real e erros

---

## Tauri vs. Electron

| Option | Description | Selected |
|--------|-------------|----------|
| Tauri v2 (Recomendado) | N sessões/terminais com RAM baixa; ConPTY nativo via portable-pty sem rebuild ABI; instalador pequeno; custo: Rust no backend | ✓ |
| Electron | Comunidade 100% JS/TS; node-pty + chokidar maduros; custo: ~150-300MB ociosos, @electron/rebuild, ABI mismatch | |

**User's choice:** Tauri v2

| Option | Description | Selected |
|--------|-------------|----------|
| Spike PTY no início (Recomendado) | Smoke-test descartável de portable-pty + claude antes do board; seguro de 1-2 dias | |
| Direto pro board | Confiar na pesquisa; risco PTY só aparece na Fase 2 | ✓ |

**User's choice:** Direto pro board — risco PTY conscientemente adiado para a Fase 2

| Option | Description | Selected |
|--------|-------------|----------|
| Matrix completa já (Recomendado) | Build nas 3 plataformas desde o primeiro commit | ✓ |
| Só build Windows por ora | Matrix completa só na Fase 5 | |
| Sem CI na Fase 1 | Foco total no produto | |

**User's choice:** Matrix completa (Windows/macOS/Linux) desde o primeiro commit de código

| Option | Description | Selected |
|--------|-------------|----------|
| Esqueleto completo (Recomendado) | Shell definitivo: sidebar placeholder + board central + drawer recolhido | ✓ |
| Só o board | Janela = board; layout real na Fase 2 | |

**User's choice:** Esqueleto completo

---

## Colunas e status do board

| Option | Description | Selected |
|--------|-------------|----------|
| 1 coluna por status (Recomendado) | ~6 colunas espelhando o vocabulário GSD | |
| Colunas agrupadas (3-4) | Board compacto + badge do status exato no card | ✓ |
| Você decide | Claude escolhe no planejamento | |

**User's choice:** Colunas agrupadas com badge de status exato

| Option | Description | Selected |
|--------|-------------|----------|
| Verificada = concluída (Recomendado) | A fazer (pending) \| Preparando (discussed, planned) \| Em execução (executing, executed) \| Concluída (verified) | ✓ |
| Executada = concluída | Concluída = executed + verified | |
| 3 colunas simples | A fazer \| Em progresso \| Concluída | |

**User's choice:** Verificada = concluída — fase executada sem verificação fica visível como trabalho pendente

| Option | Description | Selected |
|--------|-------------|----------|
| Card normal + badge (Recomendado) | Ordem numérica + badge discreto "inserida" | ✓ |
| Visual de urgência | Cor/borda de atenção além do badge | |
| Você decide | Claude escolhe | |

**User's choice:** Card normal + badge "inserida"

| Option | Description | Selected |
|--------|-------------|----------|
| Só milestone ativo (Recomendado) | Board = espelho do ROADMAP.md atual | |
| Ativo + histórico recolhido | Seção extra recolhida com milestones arquivados (parser lê archive/) | ✓ |
| Você decide | Claude escolhe | |

**User's choice:** Ativo + histórico recolhido — histórico completo da jornada visível

---

## Cards e hierarquia

| Option | Description | Selected |
|--------|-------------|----------|
| Denso (Recomendado) | Nome, badge de status, barra de progresso, requisitos, badge de bloqueio | ✓ |
| Minimalista | Só número + nome + badge | |
| Denso + goal | Denso mais primeira linha do goal | |

**User's choice:** Denso

| Option | Description | Selected |
|--------|-------------|----------|
| Accordion na coluna (Recomendado) | Expansão inline dentro da coluna | |
| Painel de detalhe | Card abre painel lateral/overlay com árvore completa | ✓ |
| Híbrido | Accordion nível 2 + painel para tarefas | |

**User's choice:** Painel de detalhe — board visualmente estável

| Option | Description | Selected |
|--------|-------------|----------|
| No painel de detalhe (Recomendado) | Artefato renderiza dentro do painel | |
| Modal em cima do board | Modal largo estilo preview do GitHub | ✓ |
| Você decide | Claude escolhe | |

**User's choice:** Modal em cima do board

| Option | Description | Selected |
|--------|-------------|----------|
| Header acima do board (Recomendado) | Projeto, milestone, fase atual, progresso geral, contadores | ✓ |
| Só nos cards/colunas | Sem header dedicado | |
| Você decide | Claude escolhe | |

**User's choice:** Header acima do board

---

## Tempo real e erros

| Option | Description | Selected |
|--------|-------------|----------|
| Highlight sutil (Recomendado) | Glow breve (~1s) no que mudou | ✓ |
| Silencioso | Board só reflete o novo estado | |
| Toast + highlight | Destaque + toast descritivo | |

**User's choice:** Highlight sutil

| Option | Description | Selected |
|--------|-------------|----------|
| Indicador discreto (Recomendado) | Dot + "sincronizado há Xs"; vira alerta em falha | ✓ |
| Só alertar em falha | Nada visível em operação normal | |
| Você decide | Claude escolhe | |

**User's choice:** Indicador discreto

| Option | Description | Selected |
|--------|-------------|----------|
| Badge + raw local (Recomendado) | Badge no card afetado + raw com causa do erro; falha localizada | ✓ |
| Card em modo raw | Card inteiro em estado degradado | |
| Banner global + badge | Banner no topo lista todos os erros de parse | |

**User's choice:** Badge + raw local

| Option | Description | Selected |
|--------|-------------|----------|
| Último estado + stale (Recomendado) | Congela último estado bom marcado "desatualizado", reconectar + auto-retry | ✓ |
| Tela de erro | Estado de erro explícito substitui o board | |
| Você decide | Claude escolhe | |

**User's choice:** Último estado + stale

## Claude's Discretion

- Janela exata de debounce do watcher (150–300ms como ponto de partida, tunar empiricamente)
- Regras de derivação de status a partir dos artefatos gsd-core
- Ordenação dentro de colunas, colunas vazias, empty states
- Tema visual e detalhes de UI (candidatos a /gsd-ui-phase)
- Arquitetura do parser, shape do estado, virtualização

## Deferred Ideas

None — discussion stayed within phase scope.
