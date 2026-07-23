# Walking Skeleton — GSD Cards

**Phase:** 1
**Generated:** 2026-07-22

> Contrato arquitetônico, não rascunho. As decisões registradas aqui são a base sobre a qual todas as fatias verticais das Fases 2-5 são construídas, sem renegociação.

## Capability Proven End-to-End

O usuário abre uma pasta pelo seletor nativo, o app valida que ela é um projeto GSD, lê `.planning/STATE.md` do disco real e mostra o nome do projeto, o milestone ativo, a fase atual e a barra de progresso no header — em uma janela nativa produzida por `npm run tauri dev`.

Essa capability atravessa a pilha inteira: interação de UI → IPC → comando Rust → filesystem → parser TypeScript → estado reativo → renderização. É entregue pelos Planos **01-01** (toolchain, scaffold, tokens, i18n, CI) e **01-02** (validação, parser de STATE, esqueleto de layout, header). Os Planos 01-03 a 01-06 empilham fatias verticais sobre essa base sem alterar nenhuma decisão desta tabela.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Shell do app | **Tauri v2** (`@tauri-apps/api` v2, `@tauri-apps/cli` v2) | Gate de decisão da fase resolvido em D-01. Footprint menor e modelo de permissões explícito para um app que na Fase 2 vai controlar shells reais. A recomendação de Electron em `research/ARCHITECTURE.md` fica superada; os padrões arquitetônicos daquele documento (two-speed IPC, modelo de componentes, read-only mirror) continuam valendo. |
| Divisão de responsabilidade Rust/TS | **Superfície Rust mínima.** Rust faz: validação canônica de caminho + concessão de escopo, e file watching debounced. Todo o resto — leitura de arquivo, parsing, derivação de status, estado, UI — é TypeScript. | Mitigação explícita de D-01. Mantém a lógica de produto testável sem Tauri de pé (`vitest run src/planning` roda em segundos, sem janela). |
| UI | **React 19 + TypeScript + Vite** | Ecossistema maduro para virtualização, i18n e drag-and-drop futuro; travado em `.claude/CLAUDE.md`. |
| Estilo | **Tailwind 4 (config-first em CSS, `@theme`) + `class-variance-authority` + `lucide-react`.** Sem shadcn/Radix nesta fase. | `01-UI-SPEC.md` documenta um sistema manual; adotar shadcn depois é uma decisão nova e explícita, não um efeito colateral. |
| Camada de dados | **Filesystem do projeto aberto (`.planning/**`), somente leitura.** Sem banco de dados, sem cache em disco, sem estado persistido pelo app nesta fase. | O `.planning/` é a única fonte da verdade. Qualquer persistência própria criaria uma segunda fonte e quebraria a garantia de espelho fiel. |
| Escrita | **Nenhuma.** O board é read-only, reforçado na camada de capability: `src-tauri/capabilities/default.json` não concede nenhum verbo de mutação de filesystem. | Decisão de produto do `PROJECT.md`, implementada como controle de segurança e não só como ausência de botão. |
| Parsing | **`gray-matter` (frontmatter YAML, schema seguro) + `unified`/`remark-parse`/`remark-gfm` (corpo, via AST).** Proibido casar estrutura de markdown por expressão regular. | O formato do gsd-core evolui na branch `next`; regex quebra em silêncio com variações pequenas (Pitfall 2). |
| Derivação de status | **Regra replicada literalmente de `gsd-core/bin/lib/init.cjs`** (`buildPhaseCompletionProjection` + `cmdInitManager`), documentada em `01-RESEARCH.md` Pattern 1 e codificada em `src/planning/status.ts` como função pura. | É a lógica real que o gsd-core usa. Qualquer outra regra é uma reimplementação divergente por definição. |
| Contrato de falha | **`ParseResult<T>` com estado `unrecognized` explícito.** Proibido inferir valor default quando a extração falha. | Um valor plausível e errado destrói a confiança que é o core value do produto. Melhor admitir do que mentir. |
| Estado | **`zustand` + `immer`, três stores por responsabilidade:** `board-store` (projeto, fases, sync), `ui-store` (seleção de fase e artefato aberto), `detail-store` (árvore e conteúdo carregados sob demanda). | Estado empurrado por eventos de IPC; a separação evita que o carregamento preguiçoso de artefatos re-renderize o board inteiro e permite que planos paralelos não disputem o mesmo arquivo. |
| IPC | **Two-speed.** Nesta fase, apenas o canal de baixo volume: o Rust emite `planning:changed` com a lista de caminhos alterados (nunca o conteúdo) e `planning:watcher-degraded`; o frontend lê os arquivos via `@tauri-apps/plugin-fs`. | Payload pequeno, fácil de depurar, sem duplicar conteúdo entre dois processos. O canal de alta frequência (terminal) chega na Fase 2 e não altera este. |
| i18n | **`i18next` + `react-i18next` desde o primeiro componente**, com **um arquivo por namespace** (`common`, `project`, `board`, `sync`, `artifact`) em `src/locales/{pt-BR,en}/`. Fonte pt-BR; `en` com paridade total de chaves. | D-04. A granularidade por namespace também é o mecanismo que permite planos paralelos sem conflito de arquivo de locale. |
| Testes | **`vitest` (frontend/parser, ambiente jsdom, Testing Library) + `cargo test` (lógica Rust pura).** Sem flags de watch em nenhum script. | `01-RESEARCH.md` → `## Validation Architecture`. O parser é testável isoladamente, o que mantém o ciclo de feedback abaixo de ~10s. |
| Guarda de regressão | **`gsd-tools init manager --raw` como oráculo de desenvolvimento**, capturado em snapshot versionado; **nunca dependência de runtime do app distribuído.** | O usuário final não terá Node instalado só para rodar o GSD Cards. O snapshot mantém o CI determinístico e detecta drift de formato em code review. |
| Distribuição / CI | **GitHub Actions com matrix Windows/macOS/Linux desde o primeiro commit de código.** | D-03. O autor valida manualmente só no Windows; a matrix pega quebras de build Rust nas outras plataformas antes do release. |
| Layout | **Esqueleto completo já na Fase 1:** header 56px de largura total, sidebar 240px fixa (placeholder de sessões), área central do board, drawer rail 48px recolhido (futuro terminal). | D-04. Fases 2-3 preenchem os espaços reservados sem retrabalho de layout. |
| Directory layout | `src-tauri/src/` (backend: `main.rs`, `lib.rs`, `project.rs`, `planning_watcher.rs`) · `src/planning/` (leitura, parsers, status, modelo, fixtures) · `src/stores/` · `src/shell/` (composição de layout) · `src/components/` (unidades reutilizáveis) · `src/locales/{pt-BR,en}/` | Estrutura recomendada em `01-RESEARCH.md`. A separação `shell/` versus `components/` deixa explícito o que é composição de layout (estável entre fases) e o que é peça reutilizável. |

## Stack Touched in Phase 1

- [ ] **Project scaffold** — Tauri v2 + React 19 + TypeScript + Vite, Tailwind 4, vitest, CI matrix (Plano 01-01)
- [ ] **Routing** — não aplicável: app desktop de janela única com estado de tela derivado do store (`idle` / `open` / `error`); nenhuma biblioteca de rotas é adotada nesta fase
- [ ] **Camada de dados** — leitura real de `.planning/STATE.md`, `ROADMAP.md`, `phases/**` e `milestones/**` (Planos 01-02, 01-03, 01-06). **Escrita: nenhuma, por decisão de produto** — o equivalente ao "write" do esqueleto padrão é a leitura reativa via file watcher (Plano 01-04), que prova o ciclo completo disco → app sem intervenção manual
- [ ] **UI** — "Abrir projeto" (seletor nativo → validação → parse → header) e clique no card → painel de detalhe → modal de artefato (Planos 01-02, 01-03, 01-05)
- [ ] **Deployment** — comando local documentado que exercita a pilha inteira: `npm run tauri dev`. Instalador empacotado e auto-update são escopo da Fase 5 (DIST-02, DIST-03)

## Out of Scope (Deferred to Later Slices)

Explicitamente fora do esqueleto. Esta lista impede que fases futuras rediscutam o minimalismo da Fase 1.

- PTY, terminal embutido e qualquer spawn de processo (D-02 — Fase 2)
- Sessões do Claude CLI, sidebar funcional, drawer expansível (Fase 2)
- Ações contextuais nos cards e injeção de comandos `/gsd-*` (Fase 3)
- Página multi-projeto, lista de recentes, criação de projeto do zero, persistência/restauração de sessões (Fase 4)
- Instalador empacotado, auto-update assinado, verificação completa do bilinguismo (Fase 5)
- Qualquer escrita em `.planning/` pela UI, drag-and-drop de status, edição de artefatos (fora de escopo permanente — `REQUIREMENTS.md` → `## Out of Scope`)
- Virtualização de listas (`@tanstack/react-virtual`) — só entra se e quando o volume de fases medido justificar
- Abertura de links externos no navegador do sistema a partir do modal de artefato — exige capability nova e decisão consciente
- Adoção de shadcn/Radix — decisão nova e explícita, se algum dia for feita

## Subsequent Slice Plan

Cada fase seguinte adiciona uma fatia vertical sobre este esqueleto sem alterar suas decisões arquitetônicas:

- **Fase 2 (Sessão viva):** sessões na sidebar e terminal real embutido no drawer — adiciona o canal IPC de alta frequência e a superfície Rust de PTY (`portable-pty`), preenchendo os espaços de layout já reservados. Primeiro ponto em que a superfície Rust cresce de propósito.
- **Fase 3 (Board interativo):** ações contextuais nos cards disparando `/gsd-*` no terminal da sessão — consome o `disk_status` já derivado na Fase 1 para decidir qual ação oferecer.
- **Fase 4 (Casa persistente):** página multi-projeto, criação de projeto do zero e restauração de sessões — primeira vez que o app persiste estado próprio, e o faz **fora** do `.planning/`, preservando a garantia de fonte única.
- **Fase 5 (Comunidade):** tradução `en` completa sobre as chaves já criadas desde a Fase 1, instalador empacotado e auto-update assinado.
