# Phase 1: Espelho fiel - Research

**Researched:** 2026-07-22
**Domain:** App desktop Tauri v2 + React — parser resiliente de artefatos gsd-core, file watching debounced, board kanban hierárquico read-only
**Confidence:** MEDIUM-HIGH (decisão de plataforma e stack: HIGH, já travada por decisão do usuário e confirmada contra o ambiente real; formato exato dos artefatos gsd-core: HIGH, lido diretamente do código-fonte instalado, não inferido; arquitetura interna do parser/estado: MEDIUM, escolhas de implementação ainda em aberto por design)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Plataforma e fundação**
- **D-01:** **Tauri v2** (gate resolvido). Superfície Rust mantida pequena — file watching agora, PTY na Fase 2 — com toda a lógica de produto em TypeScript/React. A recomendação de Electron em `research/ARCHITECTURE.md` fica superada nesse ponto; os padrões arquitetônicos de lá (two-speed IPC, componentes, read-only mirror) continuam valendo.
- **D-02:** **Sem spike de PTY na Fase 1** — direto para o board. O risco PTY do Tauri fica conscientemente adiado para a Fase 2 (decisão do usuário, ciente do trade-off).
- **D-03:** **CI GitHub Actions com matrix Windows/macOS/Linux desde o primeiro commit de código** (build Rust + frontend). Autor valida manualmente só no Windows; CI cobre o resto.
- **D-04:** **Esqueleto de layout completo já na Fase 1**: sidebar esquerda (placeholder de sessões), área central com o board, drawer direito recolhido (futuro terminal). Fases 2-3 preenchem os espaços sem retrabalho de layout. Strings de UI via i18next desde o início (decisão de projeto — i18n na fundação).

**Colunas e mapeamento de status**
- **D-05:** **4 colunas agrupadas**: A fazer (pending) | Preparando (discussed, planned) | Em execução (executing, executed) | Concluída (verified). Fase executada sem verificação NÃO é concluída — fica em "Em execução" com badge. Alinha com o rigor de verificação do GSD.
- **D-06:** **Badge com o status exato do gsd-core em todo card** — o agrupamento de colunas nunca esconde o status real.
- **D-07:** **Fases decimais inseridas (2.1, 2.2)**: card normal na ordem numérica, com badge discreto "inserida". Sem tratamento visual de urgência.
- **D-08:** **Escopo do board: milestone ativo + seção de histórico recolhida** com milestones anteriores arquivados. O parser precisa ler o arquivamento de milestones — granularidade mínima (nome/status das fases arquivadas); profundidade fica a critério do planner para não inflar a Fase 1. **Correção factual desta pesquisa:** ver `## Common Pitfalls` #3 — o caminho real de arquivamento é `.planning/milestones/`, não `.planning/archive/`.

**Cards e hierarquia**
- **D-09:** **Card fechado denso**: número + nome da fase, badge de status exato, barra de progresso de planos (ex.: 2/3), contagem de requisitos cobertos, badge de bloqueio quando STATE.md aponta blocker na fase.
- **D-10:** **Clicar no card abre painel de detalhe** (lateral/overlay) com a árvore completa da fase: planos → tarefas → artefatos. Sem accordion inline na coluna — o board fica visualmente estável.
- **D-11:** **Artefatos renderizados abrem em modal largo sobre o board** (estilo preview do GitHub), com markdown GFM fiel (tabelas, checklists). Acionado a partir do painel de detalhe.
- **D-12:** **Header fixo acima do board** com indicadores de projeto: nome, milestone ativo, fase atual, barra de progresso geral (derivada de STATE.md) e contadores por coluna.

**Tempo real e degradação**
- **D-13:** **Highlight sutil em updates**: card/elemento alterado recebe glow breve (~1s) que esvanece. Sem toasts no v1.
- **D-14:** **Indicador discreto de saúde da sincronização** no header (dot + "sincronizado há Xs"). Quando o watcher cai, vira alerta visível — o espelho nunca finge estar vivo.
- **D-15:** **Artefato não parseável = falha localizada**: badge de aviso no card afetado, mantendo o que foi parseável; o artefato problemático abre em modo raw com a causa do erro (BOARD-05). O resto do board segue confiável.
- **D-16:** **Falha total do espelho** (`.planning/` deletado/renomeado, watcher morto): board congela no último estado bom, marcado "desatualizado desde HH:MM", com botão de reconectar e auto-retry em background.

### Claude's Discretion
- Janela exata de debounce do watcher (PITFALLS.md sugere 150–300ms; tunar empiricamente contra rajadas reais do GSD)
- Regras exatas de derivação de status a partir dos artefatos (mapear formato do gsd-core na pesquisa da fase) — **resolvido nesta pesquisa, ver `## Architecture Patterns` → Pattern 1**
- Ordenação dentro das colunas (ordem numérica de fase é o natural), tratamento de colunas vazias, empty states
- Tema visual, tipografia e detalhes de UI (candidatos a `/gsd-ui-phase` — já resolvido em `01-UI-SPEC.md`, tratar como contrato travado, não mais discricionário)
- Arquitetura interna do parser, shape do estado (zustand), estratégia de virtualização

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROJ-02 | Usuário abre um diretório como projeto; o app valida a presença de `.planning/` antes de aceitá-lo como projeto GSD | `## Architecture Patterns` Pattern 4 (validação de projeto); `## Common Pitfalls` #5 (path traversal); Environment Availability (fs plugin scoping) |
| BOARD-01 | Board kanban com colunas mapeando os status reais de fase do gsd-core | `## Architecture Patterns` Pattern 1 (regra exata de derivação de `disk_status`) + tabela de mapeamento para as 4 colunas do UI-SPEC |
| BOARD-02 | Cards de fase expandem mostrando planos e tarefas (hierarquia de 3 níveis) | `## Architecture Patterns` Pattern 2 (formatos PLAN/SUMMARY) + `## Common Pitfalls` #4 (granularidade de tarefa) |
| BOARD-03 | Board reflete mudanças do `.planning/` em tempo real via file watching | `## Architecture Patterns` Pattern 3 (two-speed IPC + debounce) + `## Common Pitfalls` #1 (event storm) |
| BOARD-04 | Indicadores de progresso do projeto e das fases (derivados de STATE.md/ROADMAP.md) | `## Architecture Patterns` Pattern 1 (campos de progresso de STATE.md/ROADMAP.md) |
| BOARD-05 | Board degrada graciosamente com artefatos não parseáveis | `## Common Pitfalls` #2 (parser como API implícita) + `## Don't Hand-Roll` |
| BOARD-06 | Visualização renderizada de artefatos (PLAN/SUMMARY/VERIFICATION) a partir do card | `## Standard Stack` (react-markdown + remark-gfm) + `## Security Domain` (sanitização) |

</phase_requirements>

## Summary

Esta pesquisa fecha as duas lacunas que o roadmap sinalizou explicitamente para a Fase 1: (1) validar a decisão de plataforma Tauri v2 contra o ambiente real de desenvolvimento, e (2) extrair — não inferir — a regra exata que o gsd-core usa para derivar o status de uma fase, lendo o código-fonte instalado em `~/.claude/gsd-core/bin/lib/*.cjs` em vez de adivinhar a partir dos templates de markdown. Essa segunda parte é o achado central: o gsd-core já implementa e testa essa derivação (`buildPhaseCompletionProjection` + `cmdInitManager` em `init.cjs`), e essa lógica foi extraída e documentada abaixo em detalhe suficiente para o planner codificar o parser em TypeScript sem adivinhação — eliminando a maior parte do risco do Pitfall 5 ("parser como API implícita") documentado em `research/PITFALLS.md`.

A decisão Tauri v2 (D-01) se confirma tecnicamente viável: o ambiente de desenvolvimento tem Node v22.13.0, npm 10.9.2, git 2.46.1 e WebView2 Runtime 150.0.4078.83 já instalados, mas **não tem o toolchain Rust nem o MSVC Build Tools** — nenhum `rustc`/`cargo`/`rustup` no PATH, e `vswhere` não encontra o componente C++ do Visual Studio. Isso não muda a decisão (ela é do usuário, informada, com trade-off aceito), mas é um bloqueio de Wave 0 real e imediato: a primeira tarefa executável da Fase 1 é instalar esse toolchain, não codar o board.

A arquitetura recomendada mantém a superfície Rust mínima conforme a mitigação de D-01: o Rust cuida apenas de observar o `.planning/` (via `notify` + `notify-debouncer-full`) e emitir eventos debounced por IPC; a leitura de arquivo em si pode acontecer inteiramente no frontend via `@tauri-apps/plugin-fs` (sem código Rust customizado para leitura), e todo o parsing (YAML frontmatter + corpo markdown) e a derivação de status vivem em TypeScript, usando `gray-matter` + `unified`/`remark-parse`/`remark-gfm`, replicando as regras exatas documentadas aqui. Isso significa que a maior parte do trabalho de produto da Fase 1 nunca toca Rust — só a inicialização do watcher.

**Primary recommendation:** Construir o parser em TypeScript codificando literalmente as regras de `disk_status`/`completion_status` extraídas de `init.cjs` (tabela completa abaixo), usar `gsd-tools init manager --raw` (já instalado localmente, não como dependência de runtime do app) como **oráculo de teste** para gerar fixtures reais durante o desenvolvimento, e resolver o bloqueio de toolchain Rust/MSVC como a primeira tarefa executável antes de qualquer código de produto.

## Architectural Responsibility Map

> Adaptação de tiers para app desktop Tauri (sem SSR/CDN): "Browser/Client" = React Renderer (webview); "API/Backend" = Rust backend do Tauri (core + comandos IPC); "Database/Storage" = filesystem do projeto aberto (`.planning/**`).

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Validar `.planning/` no diretório escolhido (PROJ-02) | Rust Backend (dialog + fs check no comando de abrir projeto) | React Renderer (empty/error state) | Validação de existência de arquivo é uma operação de sistema; deve acontecer antes de qualquer estado de UI ser criado, para nunca renderizar um "projeto" inválido |
| Observar mudanças em `.planning/**` (BOARD-03) | Rust Backend (`notify` + `notify-debouncer-full`) | — | Único ponto onde o Rust é estritamente necessário nesta fase — file watching nativo com debounce não tem equivalente confiável só em JS/webview sandboxed |
| Ler conteúdo de arquivos alterados | React Renderer (`@tauri-apps/plugin-fs`) | Rust Backend (fallback, se permissões do plugin não cobrirem o caso) | Mantém a superfície Rust "burra" (mitigação de D-01); leitura de arquivo não precisa de lógica custom, só de permissão de escopo configurada no `tauri.conf.json` |
| Parse de frontmatter YAML + corpo markdown | React Renderer (`gray-matter` + `unified`/`remark-parse`) | — | Lógica de produto pura, testável isoladamente sem Tauri rodando; deve viver em TS por decisão de arquitetura (D-01) |
| Derivação de `disk_status`/coluna do board | React Renderer (módulo `PlanningParser` em TS) | — | Replica a regra do gsd-core (ver Pattern 1); é código de produto, não infraestrutura — pertence ao frontend |
| Estado reativo do board (Zustand) | React Renderer | — | Estado "burro", só espelha o `ProjectStateModel` recebido; nunca escreve de volta ao filesystem (Pattern 4) |
| Renderização do kanban, painel de detalhe, modal de artefato | React Renderer | — | UI pura, sem lógica de negócio própria além de seletores |
| Sincronização/health indicator (D-14) | Rust Backend (detecta watcher morto/erro) | React Renderer (exibe o estado) | O backend é quem sabe se o watcher real caiu; o frontend só reflete o sinal recebido |

## Standard Stack

A stack já foi definida em `.planning/research/STACK.md` e confirmada como decisão executiva (D-01). Esta seção reafirma apenas os itens relevantes à Fase 1 (fundação + board), com versões reverificadas hoje contra os registries, e adiciona o achado de arquitetura sobre onde cada biblioteca atua.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tauri (`@tauri-apps/cli`, `@tauri-apps/api`, core Rust `tauri`) | `@tauri-apps/cli@2.11.4` [VERIFIED: npm registry, `npm view` 2026-07-22], `@tauri-apps/api@2.11.1` [CITED: `.planning/research/STACK.md`], crate `tauri` confirmado existente e ativo (`updated_at: 2026-07-01`) [VERIFIED: crates.io API direto] | Shell do app (janela, IPC, bundler) | Decisão travada D-01; footprint menor para múltiplos terminais futuros (Fase 2), permissões IPC explícitas |
| React + react-dom | `19.x` [ASSUMED — flagged `too-new` pelo `package-legitimacy` por causa da data de release recente, mas com 159M+/150M downloads semanais, claramente legítimo; ver `## Package Legitimacy Audit`] | UI do board, sidebar, drawer | Ecossistema maduro para virtualização/i18n/drag-drop futuro |
| Vite | `8.x` [ASSUMED — mesmo padrão "too-new" acima] | Bundler/dev server | Padrão de fato para templates Tauri+React |
| TypeScript | `7.0.x` (tsgo) [CITED: `.planning/research/STACK.md`] | Tipagem do parser e do estado | Type-checking rápido relevante para o parser de markdown tipado |
| `notify` + `notify-debouncer-full` (crates Rust) | `notify@9.0.0-rc.4`, `notify-debouncer-full@0.8.0-rc.2` [CITED: `.planning/research/STACK.md`; `notify` confirmado `[OK]` no legitimacy check, publicado desde 2014, 2.6M downloads/semana] | File watching de `.planning/` no Rust | Único trabalho Rust real desta fase; debounce nativo evita reprocessar rajadas |
| `@tauri-apps/plugin-fs` | `2.5.1` [CITED: `.planning/research/STACK.md`; `[OK]` no legitimacy check] | Leitura de arquivo a partir do frontend | Evita escrever comandos Rust customizados só para `readFile`; escopo de permissão configurável (ver Security Domain) |
| `gray-matter` | `4.0.3` [VERIFIED: npm registry, `npm view` 2026-07-22; `[OK]` no legitimacy check, 7,8M downloads/semana, publicado 2021] | Parse de frontmatter YAML | Padrão de mercado, mais robusto que alternativas menores |
| `unified` + `remark-parse` + `remark-gfm` + `react-markdown` | `unified@11.0.5`, `remark-parse@11.0.0`, `remark-gfm@4.0.1`, `react-markdown@10.1.0` [CITED: `.planning/research/STACK.md`; todos `[OK]` no legitimacy check] | Parse de AST + render do corpo markdown (tabelas, checklists GFM) | Necessário para BOARD-06 (modal de artefato fiel ao GFM) |
| `zustand` + `immer` | `zustand@5.0.14` [VERIFIED: npm registry, `npm view` 2026-07-22; `[OK]`], `immer@11.x` [ASSUMED — flag "too-new", mas 54M downloads/semana] | Estado do board no renderer | API por hooks simples, ideal para estado empurrado por IPC |
| `i18next` + `react-i18next` | ambos flagged "too-new" pelo legitimacy check mas com 19,9M e 13,9M downloads/semana respectivamente — claramente legítimos [ASSUMED — versão exata não reverificada nesta sessão, ver `.planning/research/STACK.md`] | i18n pt-BR/en desde o início (D-04) | Decisão de projeto — strings via chave desde o primeiro componente |
| `tailwindcss` + `class-variance-authority` + `lucide-react` | flagged "too-new"/`[OK]` no legitimacy check — ver tabela completa abaixo | Estilização e variantes de componente | Já travado por `01-UI-SPEC.md` ("Tool: none — shadcn CLI not initialized", Tailwind 4 + CVA) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-virtual` | `3.14.8` [CITED: STACK.md; `[OK]`/"too-new" flag, 19M downloads/semana] | Virtualização de listas | Só necessário se o board acumular muitas fases/planos; não crítico para o MVP inicial de 5 fases, manter no radar |
| `date-fns` | `4.4.0` [VERIFIED: `[OK]` no legitimacy check] | Formatar timestamps de `STATE.md`/frontmatter respeitando locale | Usado no header (D-12) e no sync indicator (D-14, "sincronizado há Xs") |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Parser TS custom (gray-matter+remark) codificando as regras extraídas nesta pesquisa | Invocar `gsd-tools init manager --raw` (Node CLI já instalado com o gsd-core) como fonte de dados em runtime | Elimina duplicação de lógica de derivação, mas introduz dependência de runtime em Node.js no app empacotado (a maioria dos usuários finais não terá Node instalado só para rodar o GSD Cards) e depende de uma superfície de CLI que não é documentada como API estável para terceiros. **Recomendação: usar só como oráculo de teste/fixture generator em dev, nunca em runtime do app distribuído** — ver `## Common Pitfalls` #2 |
| Leitura de arquivo via `@tauri-apps/plugin-fs` no frontend | Comando Rust customizado (`#[tauri::command] fn read_planning_file`) | Plugin oficial cobre o caso simples de leitura escopada; comando customizado só se precisar de lógica adicional (ex.: streaming de arquivos grandes) — não é o caso de `.planning/*.md`, tipicamente pequenos |
| `notify` + `notify-debouncer-full` (Rust) | Polling manual (`fs.stat` em intervalo) | Só cogitar se o watcher nativo se provar instável em algum SO específico durante testes de CI multiplataforma (D-03) — não é a recomendação de partida |

**Installation:**
```bash
# Scaffold inicial
npm create tauri-app@latest -- --template react-ts

# Frontend
npm install @tauri-apps/api@2 @tauri-apps/plugin-fs
npm install gray-matter unified remark-parse remark-gfm react-markdown
npm install zustand immer i18next react-i18next date-fns
npm install tailwindcss class-variance-authority lucide-react
npm install -D typescript vite @vitejs/plugin-react vitest

# Rust (src-tauri/Cargo.toml)
cargo add notify notify-debouncer-full serde serde_json
```

**Version verification (feita nesta sessão, 2026-07-22):**
- `npm view @tauri-apps/cli version` → `2.11.4` [VERIFIED: npm registry]
- `npm view gray-matter version` → `4.0.3` [VERIFIED: npm registry]
- `npm view zustand version` → `5.0.14` [VERIFIED: npm registry]
- `curl https://crates.io/api/v1/crates/tauri` → crate existe, `updated_at: 2026-07-01T13:56:38Z`, com histórico extenso de versões [VERIFIED: crates.io API direto — a checagem automatizada de legitimidade retornou "unknown" para este crate especificamente por limitação da própria ferramenta de verificação, não por qualquer sinal de risco; a checagem manual direta na API confirma legitimidade]

## Package Legitimacy Audit

Executado via `gsd-tools query package-legitimacy check` para todos os pacotes npm e crates Rust que esta fase instala.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `@tauri-apps/cli` | npm | release mais recente 2026-06-28 | 1,81M/semana | github.com/tauri-apps/tauri | SUS ("too-new") | Approved — falso positivo, ver nota abaixo |
| `@tauri-apps/api` | npm | release 2026-06-17 | 2,11M/semana | github.com/tauri-apps/tauri | OK | Approved |
| `@tauri-apps/plugin-fs` | npm | release 2026-05-02 | 394k/semana | github.com/tauri-apps/plugins-workspace | OK | Approved |
| `react` | npm | release 2026-07-21 | 159,7M/semana | github.com/react/react | SUS ("too-new") | Approved — falso positivo |
| `react-dom` | npm | release 2026-07-21 | 150,7M/semana | github.com/react/react | SUS ("too-new") | Approved — falso positivo |
| `vite` | npm | release 2026-07-16 | 157,1M/semana | github.com/vitejs/vite | SUS ("too-new") | Approved — falso positivo |
| `typescript` | npm | release 2026-07-08 | 239,9M/semana | github.com/microsoft/TypeScript | SUS ("too-new") | Approved — falso positivo |
| `gray-matter` | npm | release 2021-04-24 | 7,79M/semana | github.com/jonschlinkert/gray-matter | OK | Approved |
| `unified` | npm | release 2024-06-19 | 46,7M/semana | github.com/unifiedjs/unified | OK | Approved |
| `remark-parse` | npm | release 2023-09-18 | 43,5M/semana | github.com/remarkjs/remark | OK | Approved |
| `remark-gfm` | npm | release 2025-02-10 | 32,0M/semana | github.com/remarkjs/remark-gfm | OK | Approved |
| `react-markdown` | npm | release 2025-03-07 | 27,5M/semana | github.com/remarkjs/react-markdown | OK | Approved |
| `zustand` | npm | release 2026-05-28 | 45,9M/semana | github.com/pmndrs/zustand | OK | Approved |
| `immer` | npm | release 2026-07-16 | 54,2M/semana | github.com/immerjs/immer | SUS ("too-new") | Approved — falso positivo |
| `i18next` | npm | release 2026-07-09 | 20,0M/semana | github.com/i18next/i18next | SUS ("too-new") | Approved — falso positivo |
| `react-i18next` | npm | release 2026-07-22 | 13,9M/semana | github.com/i18next/react-i18next | SUS ("too-new") | Approved — falso positivo |
| `date-fns` | npm | release 2026-05-29 | 93,2M/semana | github.com/date-fns/date-fns | OK | Approved |
| `tailwindcss` | npm | release 2026-07-16 | 113,5M/semana | github.com/tailwindlabs/tailwindcss | SUS ("too-new") | Approved — falso positivo |
| `lucide-react` | npm | release 2026-07-17 | 94,8M/semana | github.com/lucide-icons/lucide | SUS ("too-new") | Approved — falso positivo |
| `class-variance-authority` | npm | release 2024-11-26 | 58,5M/semana | github.com/joe-bell/cva | OK | Approved |
| `@tanstack/react-virtual` | npm | release 2026-07-22 | 19,0M/semana | github.com/TanStack/virtual | SUS ("too-new") | Approved — falso positivo |
| `notify` | crates | release 2014-12-20 (crate original) | 2,67M/semana | github.com/notify-rs/notify | OK | Approved |
| `notify-debouncer-full` | crates | release 2023-05-17 | 244k/semana | github.com/notify-rs/notify | OK | Approved |
| `serde` / `serde_json` | crates | 2014/2015 | 18,7M / 18,7M por semana | github.com/serde-rs/* | OK | Approved |
| `tauri` (crate core) | crates | não resolvido pela ferramenta automatizada ("unknown-age", "unknown-downloads", "no-repository") | — | — | SUS (falso positivo da ferramenta) | Approved — verificado manualmente via `curl https://crates.io/api/v1/crates/tauri`: crate existe, atualizado em 2026-07-01, extenso histórico de versões [VERIFIED: crates.io API direto] |

**Nota sobre os falsos positivos "too-new":** todos os pacotes marcados `SUS` acima foram sinalizados exclusivamente pelo sinal `too-new`, que mede a data de publicação da **versão mais recente**, não a idade do pacote. Bibliotecas de altíssimo tráfego (React, Vite, TypeScript, Tailwind, i18next) publicam novas versões com frequência alta — isso é esperado de projetos ativamente mantidos, não um sinal de typosquatting. A contagem de downloads semanais (dezenas a centenas de milhões) e o link ao repositório oficial confirmam legitimidade em todos os casos. Nenhum pacote nesta fase recebeu veredito `SLOP`.

**Packages removed due to [SLOP] verdict:** nenhum.
**Packages flagged as suspicious [SUS]:** nenhum além dos falsos positivos "too-new" documentados acima, todos aprovados após checagem manual — nenhum checkpoint adicional necessário além da instalação padrão.

## Architecture Patterns

### System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│                    REACT RENDERER (WebView2)                          │
│                                                                        │
│  [Usuário escolhe pasta] ──> [validar .planning/ existe?]             │
│                                     │ não                │ sim         │
│                                     ▼                    ▼            │
│                          [ErrorState: não é projeto]  [abre projeto]  │
│                                                            │           │
│                                                            ▼           │
│              [plugin-fs: lê ROADMAP.md, STATE.md, phases/**]          │
│                                                            │           │
│                                                            ▼           │
│              [PlanningParser: gray-matter + remark-parse]             │
│              (aplica as regras de disk_status desta pesquisa)         │
│                                                            │           │
│                                                            ▼           │
│              [BoardStore (zustand) — ProjectStateModel]               │
│                     │                          │                      │
│                     ▼                          ▼                      │
│         [Board: 4 colunas + cards]   [SyncIndicator: saúde do watch]  │
│                     │                                                  │
│                     ▼ (clique no card)                                 │
│         [DetailPanel: fase→planos→tarefas]                           │
│                     │ (clique em "Ver artefato")                      │
│                     ▼                                                  │
│         [ArtifactModal: react-markdown+remark-gfm ou raw mode]        │
└───────────────────────────────┬───────────────────────────────────────┘
                    IPC (evento: planning:changed, baixa freq.)
┌───────────────────────────────┴───────────────────────────────────────┐
│                    RUST BACKEND (Tauri core)                          │
│                                                                        │
│   [notify + notify-debouncer-full observa .planning/** do projeto]   │
│   escopo: SÓ .planning/, nunca .git/ ou node_modules/ (Pitfall #1)    │
│                     │                                                  │
│                     ▼ (após janela de debounce estável)                │
│   [emite evento planning:changed com lista de paths alterados]        │
│                     │                                                  │
│                     ▼ (se watcher cair/erro)                          │
│   [emite planning:watcher-degraded]  ──> alimenta SyncIndicator        │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
                    Filesystem do projeto do usuário
                    (.planning/ROADMAP.md, STATE.md, phases/XX-name/*.md)
                    escrito pelo Claude CLI/gsd-core externamente
```

### Recommended Project Structure

```
src-tauri/
├── src/
│   ├── main.rs
│   └── planning_watcher.rs     # notify + notify-debouncer-full, escopado a .planning/**
├── tauri.conf.json             # permissões: fs read escopado ao projeto selecionado, sem fs write
└── Cargo.toml

src/
├── planning/
│   ├── parser/
│   │   ├── roadmap.ts          # parse de ROADMAP.md (fases, Progress table)
│   │   ├── state.ts            # parse de STATE.md (frontmatter + Current Position)
│   │   ├── plan.ts             # parse de {phase}-{plan}-PLAN.md
│   │   ├── summary.ts          # parse de {phase}-{plan}-SUMMARY.md
│   │   └── verification.ts     # parse de {phase}-VERIFICATION.md
│   ├── status.ts               # regras de disk_status/completion_status (ver Pattern 1)
│   └── model.ts                # ProjectStateModel + merge incremental
├── stores/
│   └── board-store.ts          # zustand + immer, espelha ProjectStateModel
├── shell/
│   ├── AppShell.tsx
│   ├── Header.tsx
│   ├── SidebarPlaceholder.tsx
│   ├── DrawerRail.tsx
│   └── Board.tsx
├── components/
│   ├── BoardColumn.tsx
│   ├── PhaseCard.tsx
│   ├── StatusBadge.tsx
│   ├── DetailPanel.tsx
│   ├── ArtifactModal.tsx
│   ├── SyncIndicator.tsx
│   ├── EmptyState.tsx
│   └── ErrorState.tsx
└── locales/
    ├── en/
    └── pt-BR/
```

### Pattern 1: Derivação exata de status de fase (fonte: `gsd-core/bin/lib/init.cjs`)

**What:** O gsd-core computa dois campos por fase — `disk_status` (granular, 8 valores) e `completion_status`/`phase_complete` (derivado de verificação) — a partir de arquivos que existem fisicamente no diretório da fase, NUNCA a partir de checkboxes do ROADMAP.md isoladamente (esses só confirmam, nunca definem). A lógica foi lida diretamente em `cmdInitManager` (linhas ~1092-1150) e `buildPhaseCompletionProjection` (linhas ~99-118) de `init.cjs`, e verificada rodando `gsd-tools init manager --raw` contra este próprio repositório.

**Regra exata (em ordem de precedência, primeira que casar vence):**

```
implementation_complete = plan_count > 0 && summary_count >= plan_count
verification_status = implementation_complete
    ? ler frontmatter `status:` de {phase}-VERIFICATION.md (passed | gaps_found | human_needed)
      — se o arquivo não existe: status = "missing"
    : "not_required"
verification_passed = verification_status === "passed"
phase_complete = implementation_complete && verification_passed

disk_status (granular, para exibição):
  se phase_complete                      → "complete"
  senão se implementation_complete       → "executed"      (plans todos com SUMMARY, mas não verificado/passou)
  senão se summary_count > 0             → "partial"       (execução em andamento — alguns planos concluídos, não todos)
  senão se plan_count > 0                → "planned"       (tem PLAN.md, nenhum SUMMARY.md ainda)
  senão se hasResearch (*-RESEARCH.md)   → "researched"
  senão se hasContext (*-CONTEXT.md)     → "discussed"
  senão                                  → "empty" (diretório da fase existe mas vazio) | "no_directory" (nem o diretório existe)
```

**Mapeamento para o vocabulário de 6 status do UI-SPEC (D-06, Status Badge Mapping) — ESTE É O ACHADO QUE FECHA A LACUNA "regras exatas de derivação" do Claude's Discretion:**

| Badge do GSD Cards (`01-UI-SPEC.md`) | Coluna (D-05) | `disk_status` do gsd-core | Condição adicional |
|---|---|---|---|
| `pending` | A fazer | `no_directory` OU `empty` | — |
| `discussed` | Preparando | `discussed` OU `researched` | O UI-SPEC não distingue "pesquisada" de "discutida" — **decisão do planner**: colapsar ambos no badge "discutida", ou adicionar um 7º badge "pesquisada" (ver Open Questions #1) |
| `planned` | Preparando | `planned` | `plan_count > 0 && summary_count === 0` |
| `executing` | Em execução | `partial` | Execução em andamento (alguns planos concluídos, não todos) |
| `executing` | Em execução | `planned` | **Somente se** a fase estiver `is_active` (mtime de algum arquivo da fase há menos de 5 min) — captura o caso raro de execução iniciada mas ainda sem nenhum SUMMARY.md gravado |
| `executed` | Em execução | `executed` (`implementation_complete && !verification_passed`) | Badge de aviso conforme D-05 — "executada sem verificação" nunca vira "Concluída" |
| `verified` | Concluída | `phase_complete === true` (equivalente a `completion_status === "complete"`) | — |
| `unparseable/unknown` | (mantém coluna anterior conhecida, ou "A fazer" se nunca resolvido) | Falha de parse em qualquer arquivo da fase | Ver Pattern 2 e Common Pitfalls #2 |

**Campos de progresso (BOARD-04), extraídos de STATE.md/ROADMAP.md:**
- `STATE.md` frontmatter: `progress.total_phases`, `progress.completed_phases`, `progress.total_plans`, `progress.completed_plans`, `progress.percent` — leitura direta, sem recálculo (o gsd-core já mantém isso atualizado via `deriveProgressFromRoadmap`/`clampPercent` em `phase-lifecycle.cjs`).
- `ROADMAP.md` seção `## Progress`: tabela com `Plans Complete` (`N/M`) e `Status` coarse (`Not started | In progress | Complete | Deferred`) — **este é um vocabulário DIFERENTE e mais pobre** do que `disk_status`; não usar a coluna `Status` desta tabela para derivar o badge do card — ela existe para leitura humana rápida do ROADMAP, não é a fonte de verdade granular. A fonte de verdade granular é sempre a inspeção do diretório da fase (`phases/XX-name/*`), replicando a regra acima.

**When to use:** Sempre, na função central `derivePhaseStatus(phaseDir): DiskStatus` do `PlanningParser`.

**Confidence:** [VERIFIED: leitura direta de `~/.claude/gsd-core/bin/lib/init.cjs` linhas 80-118 e 1092-1150, e execução de `node gsd-tools.cjs init manager --raw` contra este repositório em 2026-07-22, cujo output bate exatamente com a regra documentada]

### Pattern 2: Formato exato dos artefatos (naming, frontmatter, corpo)

Verificado contra os templates instalados (`~/.claude/gsd-core/templates/*.md`) E contra os arquivos reais já existentes neste repositório (`.planning/phases/01-espelho-fiel/01-CONTEXT.md`, `01-UI-SPEC.md`, `01-DISCUSSION-LOG.md`).

| Artefato | Path/naming | Frontmatter chave | Corpo relevante para o parser |
|---|---|---|---|
| `ROADMAP.md` | `.planning/ROADMAP.md` | nenhum (markdown puro) | `## Phases` (checklist `- [ ] **Phase N: Nome** - desc`), `### Phase N: Nome` (Goal, Depends on, Requirements, Success Criteria numerada, Plans), `## Progress` (tabela `\| Phase \| Plans Complete \| Status \| Completed \|`, vocabulário coarse: `Not started\|In progress\|Complete\|Deferred`) |
| `STATE.md` | `.planning/STATE.md` | `gsd_state_version`, `status`, `progress.{total_phases,completed_phases,total_plans,completed_plans,percent}` | `## Current Position` (Phase X of Y, Plan A of B, Status, barra ascii), `## Accumulated Context` → `### Blockers/Concerns` (alimenta o badge "bloqueada" do card, D-09) |
| `{XX}-CONTEXT.md` | `.planning/phases/XX-name/XX-CONTEXT.md` (ex.: `01-CONTEXT.md`, **sem** número de plano) | nenhum | 6 seções: domain, decisions, canonical_refs, code_context, specifics, deferred — presença do arquivo = sinal `hasContext` |
| `{XX}-RESEARCH.md` | `.planning/phases/XX-name/XX-RESEARCH.md` OU `RESEARCH.md` solto | nenhum obrigatório | Presença = sinal `hasResearch` |
| `{XX}-UI-SPEC.md` | `.planning/phases/XX-name/XX-UI-SPEC.md` | `phase`, `slug`, `status`, `shadcn_initialized`, `preset`, `created` | Não consumido por `disk_status` — é insumo de planejamento, não de execução |
| `{XX}-{YY}-PLAN.md` | `.planning/phases/XX-name/XX-YY-PLAN.md` (ex.: `01-01-PLAN.md`) | `phase`, `plan`, `type`, `wave`, `depends_on`, `files_modified`, `autonomous`, `requirements[]` (**nunca vazio**), `must_haves.{truths,artifacts,key_links}` | Corpo em XML: `<tasks>` com blocos `<task type="auto\|checkpoint:*">` — **sem checkbox de conclusão por tarefa** (ver Pattern 2 nota de granularidade abaixo) |
| `{XX}-{YY}-SUMMARY.md` | `.planning/phases/XX-name/XX-YY-SUMMARY.md` | `phase`, `plan`, `subsystem`, `tags`, `requires/provides/affects`, `tech-stack`, `key-files`, `key-decisions`, `patterns-established`, `requirements-completed[]`, `coverage[]`, `duration`, `completed`, `status: complete` | `## Task Commits` (lista numerada com hash de commit por tarefa — única fonte de granularidade de tarefa pós-fato) |
| `{XX}-VERIFICATION.md` | `.planning/phases/XX-name/XX-VERIFICATION.md` (**sem** número de plano — é por fase) | `phase`, `verified`, `status: passed\|gaps_found\|human_needed`, `score`, `behavior_unverified` | `### Observable Truths` (tabela com ✓ VERIFIED / ⚠️ PRESENT_BEHAVIOR_UNVERIFIED / ✗ FAILED / ? UNCERTAIN) |
| `config.json` | `.planning/config.json` | JSON puro: `workflow.*`, `gates.*`, `parallelization.*` | Usado para adaptar ações contextuais futuras (Fase 3), não crítico para o board da Fase 1 |
| Arquivamento de milestone | `.planning/milestones/{version}-ROADMAP.md`, `{version}-REQUIREMENTS.md`, `{version}-MILESTONE-AUDIT.md`, `{version}-phases/{phase-dir}/` (opcional), índice em `.planning/MILESTONES.md` | ver acima | **Ver Common Pitfalls #3 — corrige a suposição do CONTEXT.md sobre `.planning/archive/`** |

**Nota de granularidade de tarefa (achado do research target #4):** o PLAN.md não tem um checkbox por tarefa. Enquanto uma fase está em execução e nenhum `SUMMARY.md` ainda existe para aquele plano, **não há sinal estático confiável de qual tarefa específica já terminou** — a única fonte pós-fato é a lista `## Task Commits` do SUMMARY.md, que só existe quando o plano inteiro já terminou. Consequência de design obrigatória: **o board deve tratar a granularidade de "tarefa" como tudo-ou-nada por plano** — enquanto não existe SUMMARY.md, mostrar as tarefas do PLAN.md (lidas do XML) todas com um estado neutro "em andamento/pendente", nunca marcá-las individualmente como concluídas por inferência. Assim que o SUMMARY.md aparece, todas as tarefas daquele plano viram "concluídas" de uma vez. Tentar inferir conclusão parcial de tarefa (ex.: via git log de commits durante execução) é exatamente o tipo de "board plausível mas incorreto" que o Pitfall 5 descreve — não fazer isso na Fase 1.

**Confidence:** [VERIFIED: leitura direta de `~/.claude/gsd-core/templates/{phase-prompt,summary,verification-report,state,roadmap,milestone-archive}.md` e cross-check com arquivos reais do próprio repositório GSD Cards, 2026-07-22]

### Pattern 3: Two-speed IPC (mantido de `research/ARCHITECTURE.md`, ainda válido sob Tauri)

**What:** Canal de baixo volume para eventos de mudança do `.planning/` (Rust → frontend via `emit`/`listen` do Tauri, não IPC alta frequência como será o caso do terminal na Fase 2). O Rust não manda o conteúdo dos arquivos — só a lista de paths alterados e um timestamp; quem lê e reparsa é o frontend via `plugin-fs`.
**When to use:** Todo evento de `.planning/` mudou.
**Trade-offs:** Simples de depurar (payload pequeno, sem duplicar conteúdo de arquivo por dois processos); custo é uma segunda leitura de disco pelo frontend logo após o evento — irrelevante para arquivos markdown pequenos.

**Example:**
```rust
// src-tauri/src/planning_watcher.rs — esqueleto conceitual
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use std::time::Duration;

pub fn watch_planning(app_handle: tauri::AppHandle, planning_root: std::path::PathBuf) {
    let mut debouncer = new_debouncer(Duration::from_millis(250), None, move |result: DebounceEventResult| {
        if let Ok(events) = result {
            let paths: Vec<String> = events.iter()
                .map(|e| e.paths.iter().map(|p| p.display().to_string()).collect::<Vec<_>>())
                .flatten()
                .collect();
            let _ = app_handle.emit("planning:changed", paths);
        }
    }).unwrap();
    debouncer.watcher().watch(&planning_root, notify::RecursiveMode::Recursive).unwrap();
    // Nunca observar a raiz do projeto inteira — só planning_root (.planning/)
}
```

```typescript
// src/planning/watch.ts
import { listen } from '@tauri-apps/api/event';

listen<string[]>('planning:changed', async (event) => {
  // reparsear só os arquivos cujo caminho está em event.payload
  await boardStore.getState().reprocessPaths(event.payload);
});
```

### Pattern 4: Read-only mirror + validação de projeto (PROJ-02)

**What:** Nenhuma ação do board escreve em `.planning/`. Abrir um "projeto" é uma validação de leitura, não uma operação com efeito colateral: verificar `existsSync(join(dir, '.planning', 'PROJECT.md'))` (ou `ROADMAP.md`/`STATE.md`, seguindo a mesma checagem que `cmdInitManager` faz: `project_exists`, `roadmap_exists`, `state_exists`) antes de aceitar o diretório.
**When to use:** No fluxo "Abrir projeto" (CTA do UI-SPEC).
**Trade-offs:** Nenhum — decisão de produto já travada, sem ambiguidade.

### Anti-Patterns to Avoid
- **Derivar status a partir só da tabela `## Progress` do ROADMAP.md:** essa tabela usa um vocabulário coarse (`Not started/In progress/Complete/Deferred`) mantido por convenção humana, não a fonte granular. Usar Pattern 1 (inspeção do diretório da fase) sempre.
- **Confiar em `.planning/archive/`:** ver Common Pitfalls #3 — caminho morto no próprio gsd-core, nunca escrito.
- **Inferir conclusão de tarefa individual durante execução:** ver nota de granularidade no Pattern 2 — só o plano inteiro (via presença de SUMMARY.md) é uma unidade de granularidade segura.
- **Watcher recursivo sem escopo (raiz do repo):** nunca observar além de `.planning/**` — ver Common Pitfalls #1.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Parse de frontmatter YAML + corpo markdown | Regex manual para extrair campos de status/frontmatter | `gray-matter` (frontmatter) + `unified`/`remark-parse`/`remark-gfm` (corpo) | O formato do gsd-core evolui na branch `next`; regex quebra silenciosamente com pequenas variações de heading/tabela (Pitfall #2) |
| Derivação de status de fase | Adivinhar regras a partir dos templates markdown | Codificar literalmente a regra do Pattern 1, extraída do código-fonte do gsd-core (`init.cjs`) | É a lógica real que o próprio gsd-core usa — qualquer outra regra é uma reimplementação divergente por definição |
| Geração de fixtures de teste do parser | Escrever artefatos `.planning/` fictícios à mão | Rodar `gsd-tools init manager --raw` contra projetos GSD reais (este próprio repositório, e outros disponíveis) para capturar o output esperado como fixture | Garante que o parser TS produza exatamente o mesmo resultado que o gsd-core produziria — usa a ferramenta canônica só como **oráculo de teste em dev**, nunca como dependência de runtime do app distribuído |
| Debounce de file watching | Loop de polling manual com `setTimeout` | `notify` + `notify-debouncer-full` (Rust) | Debounce nativo já resolve atomic writes, coalescing de rajadas e detecção de estabilidade — reimplementar é reinventar uma classe inteira de bugs já resolvidos |
| Renderização de markdown GFM (tabelas, checklists) | Parser de markdown-para-HTML customizado | `react-markdown` + `remark-gfm` | Padrão de mercado, cobre GFM completo (BOARD-06); regex/parser próprio tem histórico de ambiguidades de gramática mesmo em libs maduras |
| Sanitização de HTML renderizado | `dangerouslySetInnerHTML` direto na saída do remark | `react-markdown` já evita HTML bruto por padrão; se precisar de HTML embutido, usar `rehype-sanitize` explicitamente | `.planning/` pode vir de um repositório clonado de terceiros — conteúdo é entrada não confiável (ver Security Domain) |

**Key insight:** o domínio desta fase tem exatamente UM problema genuinamente difícil e específico do produto — a derivação de status de fase a partir de artefatos gsd-core — e a pesquisa já resolveu isso lendo o código-fonte em vez de adivinhar. Todo o resto (parsing de markdown genérico, file watching, renderização) tem soluções de biblioteca maduras; a Fase 1 não deve gastar esforço de engenharia reinventando nenhuma dessas partes.

## Common Pitfalls

### Pitfall 1: Event storm do file watcher durante rajadas de escrita do GSD

**What goes wrong:** Comandos como `/gsd-plan-phase`/`/gsd-execute-phase` escrevem múltiplos arquivos em sequência rápida (PLAN.md, depois vários SUMMARY.md, depois fazem `git commit`). Um watcher sem escopo ou sem debounce reage a cada escrita isolada, causando board piscando e leitura de arquivo no meio da escrita (parse de markdown truncado).

**Why it happens:** `notify`/`fs.watch` reportam eventos por escrita bruta, não por unidade lógica de mudança; não existe transação atômica visível de fora.

**How to avoid:**
- Escopar o watcher estritamente a `.planning/**`, nunca à raiz do repositório (evita reagir a `.git/index`, `.git/objects` durante o commit do GSD).
- Debounce de 150-300ms via `notify-debouncer-full` (janela inicial sugerida pelo `PITFALLS.md` do projeto; tunar empiricamente).
- Parse resiliente: se um arquivo falhar o parse (YAML truncado, heading fora do padrão), manter o último `ProjectStateModel` válido daquele artefato específico e tentar de novo no próximo evento estável — nunca deixar uma exceção de parser derrubar o board inteiro (D-15).

**Warning signs:** Board "piscando"; cards temporariamente quebrados logo após um commit do gsd-core.

**Phase to address:** Esta fase — é o requisito central (BOARD-03).

### Pitfall 2: Parser tratado como API implícita — quebra silenciosa com evolução do gsd-core

**What goes wrong:** O gsd-core evolui na branch `next`, fora do controle deste app. Uma mudança de convenção de heading/tabela pode fazer o parser (a) lançar exceção e quebrar a tela, ou (b) pior — não lançar exceção mas interpretar errado silenciosamente (fase marcada "verificada" quando não está).

**How to avoid:**
- Fallback explícito para "não reconhecido" em cada extração — nunca inferir um valor default enganoso.
- Usar `gsd-tools init manager --raw` como oráculo de teste (ver `## Don't Hand-Roll`) para gerar fixtures reais e detectar drift assim que o gsd-core mudar, em vez de esperar um usuário reportar.
- Degradação graciosa: badge de aviso no card + modo raw no modal do artefato (D-15, BOARD-05), nunca omitir a fase inteira do board.

**Phase to address:** Esta fase — é o requisito BOARD-05, e a arquitetura do parser (Pattern 1/2) já mitiga a maior parte do risco por estar fundamentada no código-fonte real, não em suposição.

### Pitfall 3: `.planning/archive/` é um caminho morto no próprio gsd-core — corrige a suposição de D-08

**What goes wrong:** O CONTEXT.md desta fase (D-08) assume que "o parser precisa ler `.planning/archive/`". A leitura direta do código-fonte do gsd-core mostra que **nenhum workflow escreve nesse diretório** — `init.cjs` (linha 986/1010) lê `path.join(planningRoot(cwd), 'archive')` só para computar `archived_milestones`/`archive_exists`, mas nada popula essa pasta. O caminho real, confirmado em `bin/lib/milestone.cjs` (função de `complete-milestone`) e em `workflows/complete-milestone.md`, é:
- `.planning/milestones/{version}-ROADMAP.md` — roadmap completo do milestone arquivado
- `.planning/milestones/{version}-REQUIREMENTS.md` — requisitos arquivados
- `.planning/milestones/{version}-MILESTONE-AUDIT.md` — se existir
- `.planning/milestones/{version}-phases/{phase-dir}/` — diretórios de fase movidos para cá **somente se o usuário optar** durante `/gsd-complete-milestone` (a alternativa é manter em `.planning/phases/` como histórico bruto, ou arquivar depois via `/gsd-cleanup`)
- `.planning/MILESTONES.md` — índice de milestones enviados, com contagens de fase/plano/tarefa e lista de conquistas

**Why it happens:** Nomenclatura ambígua dentro do próprio gsd-core — o campo interno `archiveDir` em `init.cjs` usa um nome de diretório (`archive/`) diferente do que o workflow de arquivamento de fato usa (`milestones/`). Isso não é um bug deste projeto, é uma inconsistência a montante que só se descobre lendo o código-fonte, exatamente o que esta pesquisa fez.

**How to avoid:** O `PlanningParser` deve procurar o histórico de milestones em `.planning/milestones/` (e o índice em `.planning/MILESTONES.md`), não em `.planning/archive/`. Se nenhum dos dois existir (projeto greenfield como este, sem milestone enviado ainda), a seção de histórico do board (D-08) deve simplesmente mostrar o empty state "Sem milestones anteriores" (já especificado em `01-UI-SPEC.md`).

**Phase to address:** Esta fase — corrige a premissa antes que o planner escreva uma tarefa apontando para o caminho errado.

**Confidence:** [VERIFIED: leitura direta de `~/.claude/gsd-core/bin/lib/{init,milestone}.cjs` e `~/.claude/gsd-core/workflows/complete-milestone.md`, 2026-07-22]

### Pitfall 4: Granularidade de tarefa individual não é observável estaticamente

Ver detalhamento completo na nota de granularidade do Pattern 2. Resumo: não tentar marcar tarefas individuais como concluídas durante execução ativa de um plano — só o plano inteiro (via presença de SUMMARY.md) é seguro de expor como "concluído".

**Phase to address:** Esta fase, no design do `DetailPanel` (BOARD-02).

### Pitfall 5: Toolchain Rust/MSVC ausente na máquina de desenvolvimento real

**What goes wrong:** A decisão D-01 (Tauri v2) pressupõe um toolchain Rust funcional. A checagem direta nesta sessão mostra que `rustc`, `cargo` e `rustup` não estão no PATH, e `vswhere` não encontra o componente `Microsoft.VisualStudio.Component.VC.Tools.x86.x64` (MSVC Build Tools) instalado. Sem isso, `cargo build`/`tauri dev` falha na primeira tentativa de compilar o backend Rust.

**Why it happens:** É uma máquina de desenvolvimento nova para este projeto; Node/npm/git já estavam presentes (usados pelo Claude CLI/gsd-core), mas o toolchain Rust nunca foi instalado porque nenhum projeto Rust rodou aqui antes.

**How to avoid:** Tratar a instalação do Rust toolchain + Visual Studio Build Tools (workload "Desktop development with C++") como a primeira tarefa executável da Fase 1 (Wave 0), antes de qualquer scaffold de código — exatamente como o `STACK.md` já recomendava documentar no CONTRIBUTING, mas aqui confirmado como bloqueio real e não hipotético.

**Warning signs:** `npm create tauri-app` completa mas `npm run tauri dev` falha com erro de linker (`link.exe not found`) ou `cargo` não encontrado.

**Phase to address:** Esta fase, Wave 0 — ver `## Environment Availability`.

**Confidence:** [VERIFIED: probes locais executados nesta sessão em 2026-07-22 — `rustc --version`, `cargo --version`, `rustup --version` retornam "command not found"; `vswhere.exe -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64` retorna vazio]

## Code Examples

### Regra de derivação de status (TypeScript, replicando Pattern 1)

```typescript
// src/planning/status.ts
// Fonte: gsd-core bin/lib/init.cjs — buildPhaseCompletionProjection + cmdInitManager
export type DiskStatus =
  | 'no_directory' | 'empty' | 'discussed' | 'researched'
  | 'planned' | 'partial' | 'executed' | 'complete';

export interface PhaseDirSignals {
  planCount: number;
  summaryCount: number;
  hasResearch: boolean;
  hasContext: boolean;
  isActive: boolean; // algum arquivo da fase com mtime < 5min
  verificationStatus: 'passed' | 'gaps_found' | 'human_needed' | 'missing' | 'not_required';
}

export function deriveDiskStatus(dirExists: boolean, s: PhaseDirSignals): DiskStatus {
  if (!dirExists) return 'no_directory';
  const implementationComplete = s.planCount > 0 && s.summaryCount >= s.planCount;
  const verificationPassed = implementationComplete && s.verificationStatus === 'passed';
  if (implementationComplete && verificationPassed) return 'complete';
  if (implementationComplete) return 'executed';
  if (s.summaryCount > 0) return 'partial';
  if (s.planCount > 0) return 'planned';
  if (s.hasResearch) return 'researched';
  if (s.hasContext) return 'discussed';
  return 'empty';
}

// Mapeamento para o badge de 6 valores do UI-SPEC (D-06)
export function toBoardBadge(status: DiskStatus, isActive: boolean): string {
  switch (status) {
    case 'no_directory':
    case 'empty': return 'pending';
    case 'discussed':
    case 'researched': return 'discussed';
    case 'planned': return isActive ? 'executing' : 'planned';
    case 'partial': return 'executing';
    case 'executed': return 'executed';
    case 'complete': return 'verified';
  }
}
```

### Leitura de arquivo escopada via plugin-fs

```typescript
// src/planning/read.ts
// Source: @tauri-apps/plugin-fs docs
import { readTextFile, exists, BaseDirectory } from '@tauri-apps/plugin-fs';

export async function isGsdProject(projectRoot: string): Promise<boolean> {
  // Segue a mesma checagem de cmdInitManager: existência de ROADMAP.md + STATE.md
  return (await exists(`${projectRoot}/.planning/ROADMAP.md`))
      && (await exists(`${projectRoot}/.planning/STATE.md`));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `xterm-addon-*` sem escopo (`xterm-addon-webgl` etc.) | `@xterm/*` com escopo (não usado nesta fase, relevante já para a Fase 2) | Migração de pacote documentada em `STACK.md` | Irrelevante para Fase 1 (sem terminal ainda), mas evita erro de instalação futura |
| ROADMAP.md com status coarse (`Not started/In progress/Complete/Deferred`) como única fonte de status | `disk_status` granular (8 valores) computado por inspeção de diretório de fase | Lógica já presente no gsd-core instalado (`init.cjs`), não é uma mudança recente — é a diferença entre ler a documentação de template vs. ler o código real | Determina inteiramente a correção do BOARD-01 |

**Deprecated/outdated:** Nenhuma mudança recente relevante identificada para o escopo desta fase além da distinção acima.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Versões exatas de React 19.x/Vite 8.x/immer/i18next/react-i18next/tailwindcss/lucide-react/@tanstack/react-virtual não foram reverificadas nesta sessão via `npm view` (herdadas de `.planning/research/STACK.md`, datado do mesmo dia) | Standard Stack | Baixo — todas confirmadas `[OK]`/legítimas pelo legitimacy check; só o número de versão exato pode ter avançado um patch entre a pesquisa de projeto e esta pesquisa de fase, mesmo dia |
| A2 | Colapsar `researched` no badge "discutida" (em vez de um 7º badge próprio) é a recomendação desta pesquisa, mas não foi confirmado com o usuário | Architecture Patterns → Pattern 1 (tabela de mapeamento) | Baixo — decisão puramente visual, reversível; se o usuário preferir um badge "pesquisada" distinto, é uma mudança de UI-SPEC, não de arquitetura |
| A3 | `is_active` (mtime < 5min) como sinal de "planned mas na verdade executando" é uma heurística direta do próprio gsd-core (`cmdInitManager`), assumida como suficiente para o badge "executing" também no board — não testada especificamente contra uma execução real de fase durante o desenvolvimento desta pesquisa | Code Examples / Pattern 1 | Médio — se o intervalo de 5 min não bater com a duração real de execução de planos GSD, o card pode "voltar" para o badge "planned" no meio de uma execução longa; recomenda-se validar contra uma execução real na Fase 1 |

**Se esta tabela parecer curta:** é porque a maior parte das afirmações desta pesquisa foi verificada por leitura direta de código-fonte instalado (`~/.claude/gsd-core/bin/lib/*.cjs`) ou por comando de registry (`npm view`, `curl crates.io`), não por busca web ou conhecimento de treinamento — por isso a maioria dos achados críticos carrega tag `[VERIFIED]`, não `[ASSUMED]`.

## Open Questions

1. **Colapsar `researched` e `discussed` no mesmo badge, ou criar um 7º badge?**
   - What we know: `01-UI-SPEC.md` define exatamente 6 badges de status + 1 de "não reconhecida". O `disk_status` real do gsd-core tem 8 valores, incluindo `researched` (tem `RESEARCH.md` mas não `CONTEXT.md`... na prática, no fluxo padrão do gsd-core, `discussed` normalmente vem antes de `researched` seria incomum sem contexto — mas ambos podem coexistir teoricamente).
   - What's unclear: se vale a pena gastar um badge visual a mais para essa distinção fina, dado que ambos ficam na mesma coluna "Preparando" de qualquer forma (D-05).
   - Recommendation: colapsar em "discutida" para a Fase 1 (menor superfície visual, ainda 100% fiel à coluna); documentar a decisão explicitamente no PLAN.md para não ser esquecida.

2. **Vale usar `gsd-tools init manager --raw` como fixture generator automatizado em CI, ou só manualmente durante o desenvolvimento?**
   - What we know: o comando existe, está instalado localmente, e produz exatamente os campos que o parser TS precisa replicar. Rodá-lo em CI exigiria Node + a instalação local do gsd-core disponível no runner, o que é factível (é só um pacote npm/CLI) mas adiciona uma dependência de CI não trivial.
   - What's unclear: se o ganho de fixtures sempre-atualizadas compensa a complexidade extra de CI, versus congelar fixtures estáticas geradas uma vez e versionadas.
   - Recommendation: começar com fixtures estáticas versionadas (mais simples, D-03 já exige CI multiplataforma robusto o suficiente sem essa complexidade extra); revisitar se o parser começar a divergir do gsd-core com frequência.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Scaffold Vite/React, ferramentas de build do frontend | ✓ | v22.13.0 [VERIFIED: probe local] | — |
| npm | Instalação de dependências JS | ✓ | 10.9.2 [VERIFIED: probe local] | — |
| git | Controle de versão, commits automáticos do GSD | ✓ | 2.46.1.windows.1 [VERIFIED: probe local] | — |
| Claude CLI | Pré-requisito do próprio fluxo GSD (não desta fase diretamente) | ✓ | 2.1.216 [VERIFIED: probe local] | — |
| WebView2 Runtime (Windows) | Renderer do Tauri no Windows | ✓ | 150.0.4078.83 [VERIFIED: probe local via registro do Windows] | — |
| Rust toolchain (`rustc`/`cargo`/`rustup`) | Compilar o backend Tauri | ✗ | — | **Sem fallback viável** — é pré-requisito rígido do Tauri. Instalar via `rustup` antes de qualquer scaffold |
| MSVC Build Tools ("Desktop development with C++") | Linkar o binário Rust no Windows | ✗ (não encontrado via `vswhere`) | — | **Sem fallback viável** — instalar Visual Studio Build Tools com o workload C++ antes de compilar |

**Missing dependencies with no fallback:**
- Rust toolchain (rustup/cargo/rustc) — bloqueia todo o backend Tauri
- MSVC Build Tools (workload C++) — bloqueia a compilação/link do binário Rust no Windows

**Missing dependencies with fallback:**
- Nenhuma — os dois itens ausentes são bloqueantes e devem ser a primeira tarefa executável da Fase 1 (Wave 0), antes do scaffold `npm create tauri-app`.

## Validation Architecture

> `nyquist_validation: true` em `.planning/config.json` (chave presente e ativa) — seção obrigatória.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Nenhum instalado ainda — projeto greenfield. Recomendação: `vitest` (integra nativamente com Vite, já parte da stack) para o frontend/parser; `cargo test` (built-in) para qualquer lógica Rust não trivial (o watcher em si é fino o suficiente para não precisar de testes unitários pesados, mas o parsing de eventos debounced pode ter um teste simples) |
| Config file | Nenhum — criar `vitest.config.ts` na Wave 0 |
| Quick run command | `npx vitest run src/planning` (parser isolado, sem Tauri rodando) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROJ-02 | Diretório sem `.planning/` é rejeitado com erro claro | unit | `vitest run src/planning/read.test.ts` | ❌ Wave 0 |
| BOARD-01 | `deriveDiskStatus`/`toBoardBadge` produzem o badge correto para cada uma das 8 combinações de `disk_status` | unit | `vitest run src/planning/status.test.ts` | ❌ Wave 0 |
| BOARD-02 | Parser extrai a árvore fase→planos→tarefas de um fixture real de `.planning/phases/` | unit | `vitest run src/planning/parser/plan.test.ts` | ❌ Wave 0 |
| BOARD-03 | Debounce agrega N eventos de escrita em uma única atualização de estado, sem estado intermediário quebrado | integration (fixture com escritas simuladas em sequência) | `vitest run src/planning/watch.test.ts` | ❌ Wave 0 |
| BOARD-04 | Barra de progresso reflete exatamente `STATE.md.progress.percent` sem recálculo | unit | `vitest run src/planning/parser/state.test.ts` | ❌ Wave 0 |
| BOARD-05 | Artefato com YAML malformado não derruba o parse dos demais artefatos da fase | unit (fixture corrompido de propósito) | `vitest run src/planning/parser/resilience.test.ts` | ❌ Wave 0 |
| BOARD-06 | Modal renderiza tabela/checklist GFM de um SUMMARY.md real | component (Testing Library) | `vitest run src/components/ArtifactModal.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/planning` (parser isolado, rápido, sem precisar do Tauri de pé)
- **Per wave merge:** `npx vitest run` (suite completa, incluindo componentes React)
- **Phase gate:** Suite completa verde + `npm run tauri dev` real de pé (com um `.planning/` de fixture) antes de `/gsd-verify-work`, conforme o checklist "Board em tempo real" do `PITFALLS.md` do projeto (testar contra um `git commit` real do GSD acontecendo durante o teste, não só arquivos estáticos)

### Wave 0 Gaps
- [ ] `vitest.config.ts` — nenhum framework de teste existe ainda
- [ ] `src/planning/__fixtures__/` — capturar um `.planning/` real (este próprio repositório, `.planning/phases/01-espelho-fiel/`) como fixture de teste do parser
- [ ] Instalação de Rust toolchain + MSVC Build Tools — bloqueia inclusive `npm run tauri dev` para o teste de fase gate acima
- [ ] `npm install -D vitest @testing-library/react` — framework ainda não presente no `package.json` (projeto ainda não tem `package.json`)

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: "high"` em `.planning/config.json` — seção obrigatória.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture, Design and Threat Modeling | yes | Allowlist de capabilities/permissões do Tauri v2 restrita a leitura de arquivo (`fs:allow-read-text-file` ou equivalente) escopada ao diretório do projeto aberto; nenhum comando de escrita de arquivo exposto ao frontend nesta fase (board é read-only por decisão de produto) |
| V2 Authentication | no | App local single-user, sem conceito de autenticação nesta fase |
| V3 Session Management | no | N/A nesta fase (sessões de terminal só na Fase 2) |
| V4 Access Control | no | N/A — sem múltiplos usuários/papéis |
| V5 Input Validation and Output Encoding | yes | Sanitizar a saída de `react-markdown` — conteúdo de `.planning/` pode vir de um repositório clonado de terceiros (entrada não confiável); não usar `dangerouslySetInnerHTML` sem `rehype-sanitize` se HTML bruto for permitido |
| V6 Cryptography | no | Nenhum segredo armazenado nesta fase |
| V12/V13 File and Resources / API and Web Service | yes | Escopo de `@tauri-apps/plugin-fs` restrito à raiz do projeto selecionado; validar que o caminho resolvido (após seguir symlinks) permanece dentro da raiz antes de qualquer leitura — previne path traversal via diretório malicioso ou symlink |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via markdown/HTML malicioso embutido em um `.planning/` de repositório clonado de terceiros | Tampering / Information Disclosure | `react-markdown` já não renderiza HTML bruto por padrão; se precisar permitir, usar `rehype-sanitize` explicitamente; nunca `dangerouslySetInnerHTML` direto na saída do parser |
| Path traversal via seleção de diretório de projeto malicioso ou symlink apontando para fora do escopo esperado | Tampering | Resolver o caminho real (`fs.realpath`) antes de qualquer leitura; configurar o escopo de permissão do `@tauri-apps/plugin-fs` (`tauri.conf.json` capabilities) para o diretório do projeto, não para o filesystem inteiro |
| Allowlist de IPC/capabilities excessivamente ampla (ex.: liberar comandos de escrita "só por via das dúvidas") | Elevation of Privilege | Nesta fase, liberar **somente** capabilities de leitura de arquivo e de watch; nenhuma capability de escrita de arquivo deve existir no `tauri.conf.json` desta fase — reforça a decisão de produto "board read-only" também na camada de segurança, não só na UI |
| Parser YAML (`gray-matter`, que usa `js-yaml` por baixo) processando tags YAML inseguras (`!!js/function`) de um arquivo malicioso | Tampering / RCE | `gray-matter`/`js-yaml` usam o schema seguro por padrão (`SAFE_SCHEMA`); não trocar para `DEFAULT_SCHEMA`/`load` inseguro nem habilitar engines YAML alternativas sem necessidade explícita |

## Sources

### Primary (HIGH confidence)
- `~/.claude/gsd-core/bin/lib/init.cjs` (funções `buildPhaseCompletionProjection`, `cmdInitManager`, `cmdInitProgress`, `readVerificationStatus`-adjacent) — lido diretamente, 2026-07-22 — fonte da regra exata de `disk_status`/`completion_status`
- `~/.claude/gsd-core/bin/lib/milestone.cjs` + `~/.claude/gsd-core/workflows/complete-milestone.md` — lido diretamente, 2026-07-22 — corrige o caminho real de arquivamento de milestone (`.planning/milestones/`, não `.planning/archive/`)
- `~/.claude/gsd-core/bin/lib/roadmap-parser.cjs`, `phase-lifecycle.cjs` — lido diretamente, 2026-07-22 — lógica de extração de milestone atual e cálculo de progresso
- `~/.claude/gsd-core/templates/{roadmap,state,phase-prompt,summary,verification-report,milestone-archive}.md` — lidos diretamente, 2026-07-22 — formato canônico dos artefatos
- Execução de `node ~/.claude/gsd-core/bin/gsd-tools.cjs init manager --raw` e `init progress --raw` contra este repositório, 2026-07-22 — confirma que a regra extraída do código bate com o output real
- `npm view @tauri-apps/cli version`, `npm view gray-matter version`, `npm view zustand version` — executados diretamente, 2026-07-22
- `curl https://crates.io/api/v1/crates/tauri` — executado diretamente, 2026-07-22 — confirma legitimidade do crate `tauri`
- `gsd-tools query package-legitimacy check` (ecossistemas npm e crates) — executado diretamente, 2026-07-22 — tabela completa em `## Package Legitimacy Audit`
- Probes de ambiente locais (`node --version`, `npm --version`, `rustc/cargo/rustup --version`, `git --version`, `claude --version`, `vswhere.exe`, checagem de registro do WebView2) — executados diretamente, 2026-07-22

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/SUMMARY.md`, `.planning/research/FEATURES.md` — pesquisa de projeto já existente, datada do mesmo dia (2026-07-22), com fontes próprias já cross-checadas (npm registry, crates.io, GitHub issues oficiais)
- `~/.claude/gsd-core/references/{artifact-types,gates,mvp-concepts,planner-mvp-mode}.md` — referências internas do gsd-core sobre taxonomia de artefatos, gates e modo MVP/Walking Skeleton

### Tertiary (LOW confidence)
- Nenhuma nesta pesquisa — todos os achados críticos foram verificados via leitura de código-fonte ou registry direto; não houve necessidade de busca web para o escopo desta fase, já que a lacuna central (formato exato dos artefatos gsd-core) só é resolvida com grounding local, não com busca externa.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versões reverificadas contra npm/crates.io diretamente; decisão de plataforma já travada pelo usuário e reconfirmada contra o ambiente real
- Architecture (derivação de status): HIGH — extraída por leitura direta do código-fonte do gsd-core, não inferida de templates ou suposição
- Pitfalls: HIGH — pitfall #3 (`.planning/archive/` vs `.planning/milestones/`) e #5 (toolchain ausente) são achados verificados nesta sessão, não herdados; pitfalls #1/#2/#4 herdam a confiança HIGH de `research/PITFALLS.md` (fontes primárias: GitHub issues oficiais)

**Research date:** 2026-07-22
**Valid until:** 30 dias para as partes de stack/versões (ecossistema npm/crates.io muda rápido); a regra de derivação de status (Pattern 1) é válida enquanto o gsd-core instalado localmente não for atualizado — revalidar contra `init.cjs` após qualquer atualização de `gsd-core` antes de confiar cegamente na Fase 4 (fragilidade do parser vs. evolução do gsd-core, já sinalizada em `STATE.md`)
