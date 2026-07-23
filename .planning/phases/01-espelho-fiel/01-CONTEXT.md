# Phase 1: Espelho fiel - Context

**Gathered:** 2026-07-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Usuário abre um projeto GSD (o app valida a presença de `.planning/` antes de aceitar — PROJ-02) e vê, em tempo real, um board kanban hierárquico que espelha fielmente o `.planning/`: cards de fase em colunas por status, expansão em planos e tarefas, indicadores de progresso, degradação graciosa para artefatos não parseáveis e visualização renderizada de PLAN/SUMMARY/VERIFICATION. Requisitos: PROJ-02, BOARD-01, BOARD-02, BOARD-03, BOARD-04, BOARD-05, BOARD-06.

Inclui o gate de decisão da fase — Tauri vs. Electron — **resolvido nesta discussão: Tauri v2**.

**Fora desta fase:** sessões e terminal embutido (Fase 2), ações contextuais nos cards (Fase 3), página multi-projeto e persistência de sessões (Fase 4), verificação de i18n completa e distribuição (Fase 5). O board é read-only por decisão de produto — nenhuma escrita em `.planning/` pela UI, sem drag-and-drop de status.

</domain>

<decisions>
## Implementation Decisions

### Plataforma e fundação
- **D-01:** **Tauri v2** (gate resolvido). Superfície Rust mantida pequena — file watching agora, PTY na Fase 2 — com toda a lógica de produto em TypeScript/React. A recomendação de Electron em `research/ARCHITECTURE.md` fica superada nesse ponto; os padrões arquitetônicos de lá (two-speed IPC, componentes, read-only mirror) continuam valendo.
- **D-02:** **Sem spike de PTY na Fase 1** — direto para o board. O risco PTY do Tauri fica conscientemente adiado para a Fase 2 (decisão do usuário, ciente do trade-off).
- **D-03:** **CI GitHub Actions com matrix Windows/macOS/Linux desde o primeiro commit de código** (build Rust + frontend). Autor valida manualmente só no Windows; CI cobre o resto.
- **D-04:** **Esqueleto de layout completo já na Fase 1**: sidebar esquerda (placeholder de sessões), área central com o board, drawer direito recolhido (futuro terminal). Fases 2-3 preenchem os espaços sem retrabalho de layout. Strings de UI via i18next desde o início (decisão de projeto — i18n na fundação).

### Colunas e mapeamento de status
- **D-05:** **4 colunas agrupadas**: A fazer (pending) | Preparando (discussed, planned) | Em execução (executing, executed) | Concluída (verified). Fase executada sem verificação NÃO é concluída — fica em "Em execução" com badge. Alinha com o rigor de verificação do GSD.
- **D-06:** **Badge com o status exato do gsd-core em todo card** — o agrupamento de colunas nunca esconde o status real.
- **D-07:** **Fases decimais inseridas (2.1, 2.2)**: card normal na ordem numérica, com badge discreto "inserida". Sem tratamento visual de urgência.
- **D-08:** **Escopo do board: milestone ativo + seção de histórico recolhida** com milestones anteriores arquivados. O parser precisa ler `.planning/archive/` — granularidade mínima (nome/status das fases arquivadas); profundidade fica a critério do planner para não inflar a Fase 1.

### Cards e hierarquia
- **D-09:** **Card fechado denso**: número + nome da fase, badge de status exato, barra de progresso de planos (ex.: 2/3), contagem de requisitos cobertos, badge de bloqueio quando STATE.md aponta blocker na fase.
- **D-10:** **Clicar no card abre painel de detalhe** (lateral/overlay) com a árvore completa da fase: planos → tarefas → artefatos. Sem accordion inline na coluna — o board fica visualmente estável.
- **D-11:** **Artefatos renderizados abrem em modal largo sobre o board** (estilo preview do GitHub), com markdown GFM fiel (tabelas, checklists). Acionado a partir do painel de detalhe.
- **D-12:** **Header fixo acima do board** com indicadores de projeto: nome, milestone ativo, fase atual, barra de progresso geral (derivada de STATE.md) e contadores por coluna.

### Tempo real e degradação
- **D-13:** **Highlight sutil em updates**: card/elemento alterado recebe glow breve (~1s) que esvanece. Sem toasts no v1.
- **D-14:** **Indicador discreto de saúde da sincronização** no header (dot + "sincronizado há Xs"). Quando o watcher cai, vira alerta visível — o espelho nunca finge estar vivo.
- **D-15:** **Artefato não parseável = falha localizada**: badge de aviso no card afetado, mantendo o que foi parseável; o artefato problemático abre em modo raw com a causa do erro (BOARD-05). O resto do board segue confiável.
- **D-16:** **Falha total do espelho** (`.planning/` deletado/renomeado, watcher morto): board congela no último estado bom, marcado "desatualizado desde HH:MM", com botão de reconectar e auto-retry em background.

### Claude's Discretion
- Janela exata de debounce do watcher (PITFALLS.md sugere 150–300ms; tunar empiricamente contra rajadas reais do GSD)
- Regras exatas de derivação de status a partir dos artefatos (mapear formato do gsd-core na pesquisa da fase)
- Ordenação dentro das colunas (ordem numérica de fase é o natural), tratamento de colunas vazias, empty states
- Tema visual, tipografia e detalhes de UI (candidatos a `/gsd-ui-phase`)
- Arquitetura interna do parser, shape do estado (zustand), estratégia de virtualização

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Decisão de plataforma e stack
- `.planning/research/STACK.md` — Stack completa com versões verificadas (Tauri v2, React 19, xterm.js 6, notify, gray-matter/remark, zustand...); a recomendação Tauri v2 foi confirmada como decisão executiva (D-01)
- `.planning/research/ARCHITECTURE.md` — Modelo de componentes (ProjectManager, PlanningWatcher, PlanningParser, BoardStore), two-speed IPC, read-only mirror; **ignorar a recomendação de Electron** — superada por D-01
- `.planning/research/PITFALLS.md` — Pitfalls críticos desta fase: event storm do file watcher (#4), parser frágil vs. evolução do gsd-core (#5); mitigações obrigatórias
- `.planning/research/SUMMARY.md` — Síntese da pesquisa + research flags da Fase 1 (formato exato de ROADMAP/PLAN/STATE/SUMMARY do gsd-core precisa de pesquisa)
- `.planning/research/FEATURES.md` — Table stakes e diferenciais do board frente aos concorrentes

### Formato dos artefatos GSD (fonte do parser)
- `docs/pt-BR/reference/planning-artifacts.md` do gsd-core, branch `next` (repo externo: github.com/open-gsd/gsd-core) — referência canônica do formato dos artefatos que o parser espelha; instalação local em `~/.claude/gsd-core/templates/` serve de fixture primária
- `.planning/REQUIREMENTS.md` — Definições de PROJ-02 e BOARD-01…06 (escopo exato da fase)
- `.planning/ROADMAP.md` — Success criteria da Fase 1 (5 critérios verificáveis)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Nenhum — repositório greenfield (só `.planning/` existe). Primeiro scaffold via `create-tauri-app` (Tauri + Vite + React + TS), conforme seção Installation do STACK.md.

### Established Patterns
- Nenhum padrão de código ainda — as convenções estabelecidas nesta fase (estrutura de pastas, IPC, estado, i18n keys) viram o padrão das Fases 2-5. Vale caprichar: este é o código que define o projeto.

### Integration Points
- O esqueleto de layout (D-04) é o principal ponto de integração futuro: sidebar receberá sessões (Fase 2), drawer receberá terminal (Fase 2), cards receberão ações (Fase 3). Componentes devem nascer com esses encaixes em mente, sem implementá-los.

</code_context>

<specifics>
## Specific Ideas

- Modal de artefato "estilo preview do GitHub" — referência visual explícita do usuário (D-11)
- "Verificada = concluída" é postura de produto: o board deve reforçar o rigor do GSD, não suavizá-lo (D-05)
- O indicador de sincronização existe porque o core value é espelho **confiável** — confiança explícita, nunca implícita (D-14)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Espelho fiel*
*Context gathered: 2026-07-22*
