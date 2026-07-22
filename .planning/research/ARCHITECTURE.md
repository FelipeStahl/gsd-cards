# Architecture Research

**Domain:** App desktop de orquestração (Claude CLI + gsd-core) — kanban em tempo real sobre `.planning/` + múltiplos terminais PTY persistentes
**Researched:** 2026-07-22
**Confidence:** MEDIUM (padrões de mercado bem estabelecidos via busca web cruzada; mecânica de sessões do Claude Code verificada contra docs oficiais e comportamento real da instalação local — essa parte é HIGH)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      RENDERER (Chromium / React)                    │
├───────────────┬───────────────────────────┬─────────────────────────┤
│  Sidebar       │  Board (kanban)           │  Drawer (terminal)      │
│  - lista       │  - BoardStore (Zustand)   │  - xterm.js por sessão  │
│    projetos    │  - colunas por status     │  - paleta /gsd-*        │
│  - lista       │  - cards fase→plano→task  │  - addon-serialize      │
│    sessões     │                           │    (snapshot p/ restore)│
└───────┬────────┴─────────────┬─────────────┴───────────┬─────────────┘
        │ IPC (baixa freq.)     │ IPC (baixa freq.)       │ IPC (ALTA freq.)
        │ project:*, session:*  │ planning:state-updated  │ terminal:data
┌───────┴───────────────────────┴─────────────────────────┴─────────────┐
│                         MAIN PROCESS (Node.js)                        │
│  ┌────────────────┐  ┌──────────────────────┐  ┌────────────────────┐│
│  │ ProjectManager │  │ PlanningWatcher +     │  │ SessionManager     ││
│  │ - registro de  │  │ PlanningParser        │  │ - claude --resume  ││
│  │   projetos     │  │ - chokidar por projeto│  │ - descobre jsonl   ││
│  │                │  │ - debounce/awaitWrite │  │   ~/.claude/projects││
│  └───────┬────────┘  └──────────┬────────────┘  └──────────┬─────────┘│
│          │                      │                           │         │
│          │              ProjectStateModel              PtyHost        │
│          │              (normalizado)                  (node-pty)    │
│          └──────────────┬───────┴──────────────┬────────────┘        │
│                  ┌───────┴────────┐    ┌────────┴────────┐           │
│                  │ AppStateStore  │    │ processos claude│           │
│                  │ (JSON userData)│    │ (1 por sessão)  │           │
│                  └────────────────┘    └─────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
                              │                    │
                    .planning/*.md (leitura)   OS PTY (stdin/stdout)
                              │                    │
                    ┌─────────┴────────┐  ┌────────┴─────────┐
                    │ Filesystem do    │  │ ~/.claude/projects│
                    │ projeto (escrito │  │ /<cwd-encoded>/   │
                    │ pelo próprio     │  │ <session-id>.jsonl│
                    │ Claude CLI/gsd)  │  │ (Claude Code)     │
                    └──────────────────┘  └───────────────────┘
```

**Decisão de plataforma:** Electron, não Tauri. `node-pty` + `chokidar` são módulos Node maduros e é exatamente esse par que sustenta o board (watcher) e os terminais (PTY) — recriar isso em Rust/Tauri exigiria reescrever ambos os pilares do produto sem ganho perceptível para um app single-user. O trade-off (instalador maior, mais RAM) é aceitável porque não há concorrência de recursos: o app roda um projeto por vez em primeiro plano, e a maturidade do ecossistema (xterm.js + node-pty é a combinação de fato usada por VS Code, Hyper, Windows Terminal-likes) reduz risco de reescrever infraestrutura de terminal do zero.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| ProjectManager | Registro de projetos GSD conhecidos (path, nome, último aberto), abrir diretório existente, iniciar fluxo `/gsd-new-project` num diretório novo | Main process; API sobre `AppStateStore`; valida presença de `.planning/` antes de listar como "projeto GSD" |
| PlanningWatcher | Observa `.planning/**` de cada projeto aberto, filtra ruído de editor/atomic writes, emite lote de arquivos alterados | `chokidar` por projeto, com `awaitWriteFinish` e `atomic` configurados (ver Pitfalls) |
| PlanningParser | Lê os artefatos alterados (ROADMAP.md, STATE.md, config.json, `phases/XX-name/*-PLAN.md`/`*-SUMMARY.md`/`*-VERIFICATION.md`) e produz um `ProjectStateModel` normalizado | Parser puro (markdown+frontmatter YAML → objeto), sem side-effects; resiliente a parse parcial |
| BoardStore | Estado reativo do board no renderer, derivado do `ProjectStateModel` recebido via IPC | Zustand (ou Redux) no renderer, atualizado por push do main, nunca escreve de volta ao filesystem |
| SessionManager | Ciclo de vida lógico das sessões Claude por projeto: criar, nomear, listar, marcar "resumível", persistir registro | Main process; cruza `AppStateStore` (o que o app acha que existe) com `~/.claude/projects/<cwd-encoded>/*.jsonl` (o que realmente existe no disco) |
| PtyHost | Spawna e mantém processos PTY (`claude` ou `claude --resume <id>`), expõe write/resize/kill, faz stream de dados brutos | `node-pty`, um `Map<sessionId, IPty>` no main process (ou num utility process dedicado) |
| AppStateStore | Persistência do próprio app: projetos abertos, sessões conhecidas, layout de janela | JSON em `app.getPath('userData')`, padrão `electron-store` |
| UI Shell | Sidebar (projetos/sessões), Board (colunas por status), Drawer (terminal + paleta de comandos) | React; consome BoardStore e um `SessionStore` fino; dispara ações via IPC |

## Recommended Project Structure

```
src/
├── main/                       # Processo principal Electron (Node.js)
│   ├── project-manager/        # Registro de projetos, abrir/criar
│   │   └── project-manager.ts
│   ├── planning/                # Pipeline de ingestão do .planning/
│   │   ├── watcher.ts           # chokidar wrapper por projeto
│   │   ├── parser/              # um parser por tipo de artefato
│   │   │   ├── roadmap.ts
│   │   │   ├── state.ts
│   │   │   ├── plan.ts
│   │   │   ├── summary.ts
│   │   │   └── verification.ts
│   │   └── model.ts              # ProjectStateModel + merge/normalização
│   ├── sessions/
│   │   ├── session-manager.ts    # registro lógico de sessões por projeto
│   │   ├── claude-projects-fs.ts  # leitura de ~/.claude/projects/**
│   │   └── pty-host.ts            # node-pty, um IPty por sessão viva
│   ├── app-state/
│   │   └── store.ts               # persistência JSON (userData)
│   └── ipc/
│       ├── channels.ts            # nomes/tipos de canal (contrato compartilhado)
│       ├── planning-ipc.ts        # canal baixa frequência (snapshots/diffs)
│       └── terminal-ipc.ts        # canal alta frequência (bytes brutos)
├── preload/
│   └── index.ts                  # contextBridge — expõe API tipada, zero Node direto no renderer
├── renderer/                    # React
│   ├── stores/
│   │   ├── board-store.ts        # Zustand, espelha ProjectStateModel
│   │   └── session-store.ts      # Zustand, lista de sessões + status vivo/morto
│   ├── shell/
│   │   ├── Sidebar.tsx
│   │   ├── Board.tsx
│   │   └── Drawer.tsx            # xterm.js + addon-serialize + paleta /gsd-*
│   └── components/
└── shared/
    └── types.ts                  # ProjectStateModel, Session, IPC payloads — único ponto de verdade dos tipos
```

### Structure Rationale

- **`main/planning/`:** isola o pipeline de ingestão como um subsistema testável isoladamente (dar um diretório `.planning/` de fixture e verificar o `ProjectStateModel` resultante, sem precisar de Electron rodando).
- **`main/sessions/` separado de `main/planning/`:** são duas fontes de verdade completamente diferentes (filesystem `.planning/` vs filesystem `~/.claude/projects/`) e não devem se acoplar — o board nunca deve depender do estado de uma sessão para renderizar, e uma sessão nunca deve depender do parser do board para funcionar.
- **`shared/types.ts`:** contrato único entre main e renderer evita drift de schema no IPC — especialmente importante porque `ProjectStateModel` muda de forma conforme o gsd-core evolui.
- **`preload/` fino:** nenhuma lógica de negócio no preload, só a ponte tipada; mantém o renderer sem acesso direto a Node (segurança + testabilidade do renderer com mocks).

## Architectural Patterns

### Pattern 1: Two-speed IPC (canal de estado vs canal de stream)

**What:** Dois canais IPC com contratos e frequências completamente diferentes: `planning:state-updated` (baixa frequência, snapshot/diff completo do board, poucas vezes por minuto) e `terminal:data` (alta frequência, chunks de bytes do PTY, dezenas/centenas de vezes por segundo durante output do Claude).
**When to use:** Sempre que o app combinar dado estruturado de baixa cardinalidade com stream binário/textual de alta cardinalidade na mesma janela.
**Trade-offs:** Canal de board pode se dar ao luxo de enviar o objeto inteiro (fácil de debugar, sem risco de divergência incremental); canal de terminal precisa ser bytes crus sem serialização JSON pesada e sem IPC síncrono (bloquearia o event loop do main a cada tecla digitada).

**Example:**
```typescript
// main/ipc/terminal-ipc.ts
pty.onData((chunk: string) => {
  win.webContents.send(`terminal:data:${sessionId}`, chunk); // async, sem round-trip
});

// main/ipc/planning-ipc.ts
watcher.onModelUpdated((model: ProjectStateModel) => {
  win.webContents.send('planning:state-updated', { projectId, model }); // objeto completo, throttled
});
```

### Pattern 2: Read-only mirror (board nunca escreve em `.planning/`)

**What:** O `BoardStore` e toda a UI do board são estritamente downstream do `PlanningParser`. Nenhuma ação do usuário no board escreve diretamente em arquivos `.planning/`; ações de card (discutir/planejar/executar/verificar) apenas injetam um comando `/gsd-*` no terminal da sessão associada, e é o próprio Claude CLI/gsd-core que reescreve os artefatos — o que realimenta o watcher.
**When to use:** Sempre — é uma decisão de produto já registrada em PROJECT.md ("Board é read-only sobre `.planning/`").
**Trade-offs:** Simplicidade e ausência de conflitos de escrita concorrente; custo é que toda ação "parece" ter uma latência (esperar o Claude processar e o watcher reagir) em vez de atualização otimista instantânea — mitigável com um estado de UI "pendente" enquanto o comando roda no terminal.

### Pattern 3: Sessão lógica ≠ processo vivo

**What:** Uma "sessão" no app é uma entidade lógica persistente (projeto + session-id do Claude + nome + último snapshot de tela), independente de existir um processo PTY vivo para ela. Um processo PTY é um recurso efêmero criado sob demanda (nova sessão ou reabertura) e destruído quando a sessão é fechada ou o app encerra.
**When to use:** Essencial para "sessões persistem entre aberturas do app" — não é possível manter um processo do SO vivo entre execuções do Electron; o que persiste é a referência (`session-id`) que permite `claude --resume <id>` recriar a continuidade da conversa.
**Trade-offs:** Ao reabrir o app, há uma janela onde a sessão "existe" na UI (nome, último snapshot de tela) mas ainda não tem processo — tratar isso como estado explícito (`idle` → `spawning` → `attached`) evita UI inconsistente.

## Data Flow

### Request Flow (ação de card → terminal → volta ao board)

```
[Usuário clica "Planejar" no card da Fase 3]
    ↓
[Board.tsx dispara ação] → [IPC: session:send-command {projectId, sessionId, cmd: "/gsd-plan-phase"}]
    ↓
[SessionManager resolve/garante PTY ativo] → [PtyHost.write(cmd + "\n")]
    ↓
[Processo `claude` executa /gsd-plan-phase, escreve 03-01-PLAN.md em .planning/phases/03-nome/]
    ↓
[PlanningWatcher detecta mudança] → [PlanningParser reprocessa ROADMAP.md + phase dir] → [ProjectStateModel atualizado]
    ↓
[IPC: planning:state-updated] → [BoardStore atualiza] → [Board.tsx re-renderiza card com novo status/plano]
```

### State Management

```
main/planning/model.ts (fonte de verdade derivada do filesystem)
    ↓ (push via IPC, não pull)
renderer/stores/board-store.ts (Zustand — espelho local, somente leitura de ação do usuário)
    ↕ (seletores)
Sidebar.tsx / Board.tsx / Drawer.tsx (consomem via hooks, nunca mutam board-store diretamente)
```

O `board-store` no renderer é deliberadamente "burro": recebe o `ProjectStateModel` inteiro (ou diff) do main e substitui/faz merge, sem lógica de negócio própria. Toda a lógica de "o que é um card", "quais transições de status existem" vive no `PlanningParser` do main — assim há um único lugar para acompanhar mudanças de formato do gsd-core.

### Key Data Flows

1. **Ingestão do `.planning/`:** filesystem → chokidar (debounce + awaitWriteFinish) → parser por tipo de artefato → merge em `ProjectStateModel` → IPC push → `board-store` → UI. Fluxo unidirecional, sem retorno.
2. **Ciclo de vida de sessão:** `AppStateStore` (registro persistido) + varredura de `~/.claude/projects/<cwd-encoded>/*.jsonl` (verdade do Claude Code) → `SessionManager` reconcilia os dois → UI lista sessões com estado (`attached`/`resumable`/`orphaned`) → usuário abre aba → `PtyHost` spawna `claude` ou `claude --resume <id>` sob demanda → stream de dados sobe por canal de alta frequência.
3. **Snapshot de restauração:** a cada N segundos (ou ao trocar de aba/fechar sessão), o Drawer serializa o buffer do xterm.js (`xterm-addon-serialize`) e envia ao main, que grava no `AppStateStore` junto ao registro da sessão. Ao reabrir o app, a UI pinta instantaneamente o snapshot serializado (percepção de continuidade) enquanto o `claude --resume` real é disparado em paralelo (lazy, só quando a aba é focada — nunca todas de uma vez no boot).

## Scaling Considerations

Este é um app desktop single-user (fora de escopo: uso remoto/multi-usuário), então "escala" aqui significa robustez sob número de projetos e sessões abertas, não usuários simultâneos.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 projeto, poucas sessões | Um watcher, poucos PTYs — arquitetura descrita já é suficiente sem ajuste |
| Vários projetos abertos simultaneamente (dezenas) | Um `PlanningWatcher` + `ProjectStateModel` por projeto (nunca um watcher global recursivo); watchers de projetos não focados podem reduzir frequência de push ao renderer (só recalcular sob demanda ao trocar de aba) |
| Muitas sessões/terminais vivos ao mesmo tempo (dezenas de PTYs) | Cada `IPty` consome memória do SO real (processo `claude` completo) — vale impor um limite prático ou avisar o usuário; nunca ressuscitar sessões antigas eagerly no boot, só sob demanda |
| Repositórios de projeto muito grandes | `chokidar` deve observar apenas `.planning/**` (nunca a raiz do repo/`node_modules`), senão o custo de watch cresce com o tamanho do código-fonte, não do planejamento |

### Scaling Priorities

1. **Primeiro gargalo provável:** volume de eventos de filesystem durante uma execução de fase (`gsd-execute-phase` cria/edita vários arquivos em sequência rápida — PLAN.md, SUMMARY.md, commits). Mitigar com debounce agressivo (200-500ms) e reprocessamento apenas dos artefatos cujo caminho mudou, não um re-parse total de `.planning/`.
2. **Segundo gargalo provável:** múltiplos processos `claude` vivos simultaneamente competindo por CPU/memória em máquinas modestas. Mitigar com spawn sob demanda (nunca todas as sessões restauradas de uma vez no boot) e permitir "pausar"/"encerrar" sessões idle da UI sem perder o registro lógico.

## Anti-Patterns

### Anti-Pattern 1: Parsear o `.jsonl` interno do Claude Code para extrair estado de sessão

**What people do:** Ler `~/.claude/projects/<cwd>/<id>.jsonl` linha a linha e depender de campos internos (estrutura de mensagens, tool-use, etc.) para construir UI.
**Why it's wrong:** A própria documentação oficial do Claude Code declara que esse formato é interno e muda entre versões da CLI sem aviso — qualquer parser profundo quebra silenciosamente em um update.
**Do this instead:** Tratar o arquivo `.jsonl` apenas como sinal de existência/descoberta (nome do arquivo = session id, mtime = última atividade, opcionalmente o primeiro campo `cwd`/primeira mensagem de usuário para um título amigável) e delegar toda a semântica de conversa ao próprio `claude --resume <id>` ou a interfaces suportadas (`/export`, saída JSON do modo headless).

### Anti-Pattern 2: Restaurar todas as sessões persistidas eagerly no boot do app

**What people do:** Ao reabrir o app, disparar `claude --resume <id>` para cada sessão salva de cada projeto, tentando "restaurar tudo" imediatamente.
**Why it's wrong:** Cada `--resume` sobe um processo `claude` completo; com várias sessões e projetos isso significa dezenas de processos concorrentes no boot, boot lento, e possíveis limites de taxa/uso.
**Do this instead:** Restaurar apenas a UI (lista de sessões + snapshot serializado de tela) instantaneamente; spawnar o processo real só quando o usuário foca aquela aba/sessão pela primeira vez na nova execução do app.

### Anti-Pattern 3: Escrever em `.planning/` a partir da UI

**What people do:** Permitir edição direta de checkboxes/status no board que gravam de volta no ROADMAP.md/STATE.md.
**Why it's wrong:** Cria duas fontes de verdade (o parser do gsd-core e a UI) que podem divergir — exatamente o risco que a decisão de produto "board é espelho read-only" existe para evitar.
**Do this instead:** Toda mudança de estado passa pelo terminal real via comando `/gsd-*`, nunca por escrita direta de arquivo pela UI.

### Anti-Pattern 4: Re-parsear `.planning/` inteiro a cada evento de filesystem

**What people do:** A cada callback do watcher, reler e reprocessar todos os arquivos de `.planning/` do zero.
**Why it's wrong:** Durante uma execução de fase, dezenas de eventos de escrita ocorrem em segundos; re-parse total desperdiça CPU e pode gerar flicker no board.
**Do this instead:** Debounce por lote (`awaitWriteFinish` + uma janela de agregação curta) e reprocessar apenas os arquivos cujo caminho está no lote de mudanças, atualizando incrementalmente o `ProjectStateModel` (ROADMAP.md e STATE.md sempre são baratos de reler; arquivos de fase só quando tocados).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude CLI (`claude`) | Spawn via `node-pty` como processo interativo real, cwd = raiz do projeto; comandos `/gsd-*` são apenas texto escrito no stdin do PTY | O app não reimplementa nada do CLI — orquestra um terminal real, igual a um usuário digitando |
| Armazenamento de sessão do Claude Code (`~/.claude/projects/<cwd-encoded>/*.jsonl`) | Leitura somente para *descoberta* (listar sessões existentes de um diretório, extrair session-id do nome do arquivo, mtime) | Confirmado na doc oficial (`code.claude.com/docs/en/sessions`) e na instalação local: pasta é o cwd absoluto com caracteres não-alfanuméricos trocados por `-`; arquivo é `<session-id>.jsonl`; formato interno, não fazer parse profundo |
| gsd-core (via Claude CLI, não diretamente) | Nenhuma integração direta — o app nunca invoca gsd-core como biblioteca, só observa o resultado (`.planning/`) do que o Claude+gsd-core escrevem | Mantém o app agnóstico de versão de gsd-core além do *formato* dos artefatos |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Renderer ↔ Main (estado do board) | IPC assíncrono, canal `planning:state-updated`, payload = `ProjectStateModel` (ou diff) | Baixa frequência; pode carregar objeto completo sem problema de performance |
| Renderer ↔ Main (dados de terminal) | IPC assíncrono, canal `terminal:data:<sessionId>` (entrada) / `terminal:input:<sessionId>` (saída) | Alta frequência; nunca usar `ipcRenderer.sendSync`; batelar múltiplos eventos `data` do PTY emitidos no mesmo tick antes de repassar, se necessário |
| PlanningWatcher/Parser ↔ SessionManager | Nenhuma — subsistemas desacoplados, cada um lê sua própria fonte de verdade no filesystem | Evita que um bug no parser de board trave descoberta de sessões e vice-versa |
| SessionManager ↔ PtyHost | Chamada direta em processo (mesmo main process), API `spawn(sessionId, cwd, resumeId?)`/`write`/`resize`/`kill` | PtyHost não sabe o que é "sessão GSD" — é um host de PTY genérico; SessionManager decide *qual comando* rodar (`claude` vs `claude --resume <id>`) |
| AppStateStore ↔ tudo | Chamada direta em processo; único ponto de escrita/leitura do JSON em `userData` | Evita múltiplos componentes escrevendo o mesmo arquivo JSON concorrentemente (corrupção) |

## Referência: formatos parseáveis do gsd-core (base do `PlanningParser`)

Levantado diretamente dos templates instalados em `~/.claude/gsd-core/templates/` (fonte primária, não inferência):

| Artefato | O que o parser extrai | Formato-chave |
|----------|------------------------|---------------|
| `ROADMAP.md` | Lista de fases (`## Phases`, checklist `- [ ] **Phase N: Nome** - descrição`), detalhe por fase (`### Phase N: Nome` com **Goal**, **Depends on**, **Requirements**, **Success Criteria** numerada, **Plans**), lista de planos por fase (`Plans:` checklist `- [ ] NN-MM: descrição`), tabela `## Progress` (`\| Phase \| Plans Complete \| Status \| Completed \|`) | Markdown + convenções de heading fixas; fases decimais (`2.1`) marcam inserções urgentes; variante pós-milestone envolve fases concluídas em `<details>` com emoji (✅🚧📋) |
| `STATE.md` | Frontmatter YAML (`gsd_state_version`, `status`, `progress.{total_phases,completed_phases,total_plans,completed_plans,percent}`), seção `## Current Position` (`Phase: X of Y`, `Plan: A of B`, `Status:`, barra ascii) | YAML frontmatter + corpo com campos posicionais previsíveis; arquivo é mantido pequeno (<100 linhas) por design |
| `phases/XX-nome/{fase}-{plano}-PLAN.md` | Frontmatter YAML (`phase`, `plan`, `type`, `wave`, `depends_on`, `files_modified`, `autonomous`, `requirements`, `must_haves.{truths,artifacts,key_links}`) | YAML estruturado — dá para derivar status "em execução"/"tem checkpoint pendente" sem ler o corpo |
| `phases/XX-nome/{fase}-{plano}-SUMMARY.md` | Frontmatter YAML (`phase`, `plan`, `subsystem`, `tags`, `requires/provides/affects`, `tech-stack`, `key-files`, `key-decisions`, `patterns-established`, `requirements-completed`, `coverage[]`, `duration`, `completed`, `status`) | Presença do arquivo = plano concluído; `status: complete` no frontmatter confirma |
| `phases/XX-nome/{fase}-VERIFICATION.md` | Frontmatter YAML (`phase`, `verified`, `status: passed\|gaps_found\|human_needed`, `score`, `behavior_unverified`) | Determina se o card de fase pode avançar para "verificado" vs "gaps encontrados" |
| `config.json` | Toggles de workflow (`workflow.*`, `gates.*`, `parallelization.*`) | JSON simples; usado para adaptar quais ações de card mostrar (ex.: se `gates.confirm_plan` está ativo, avisar na UI que o fluxo pausa para confirmação) |

**Resiliência exigida do parser:** cada arquivo é parseado isoladamente com try/catch; falha de parse de um artefato (arquivo sendo escrito no meio, YAML malformado, heading fora do padrão) mantém o último `ProjectStateModel` válido para aquele artefato e marca o card correspondente com um estado visual de "não sincronizado" — nunca deixa uma exceção de parser derrubar o board inteiro. Isso é ainda mais importante porque o próprio Claude CLI escreve esses arquivos de forma incremental durante `execute-plan`, então "arquivo a meio caminho de ser escrito" é esperado, não exceção rara.

## Suggested Build Order

Ordem recomendada por dependência real entre componentes (não por prioridade de produto — isso é papel do roadmap):

1. **ProjectManager + AppStateStore** — abrir/listar projetos, persistir estado do app. Não depende de mais nada; é a base sobre a qual tudo aponta um `cwd`.
2. **PlanningWatcher + PlanningParser + ProjectStateModel** — pipeline de ingestão pura, testável com fixtures de `.planning/` sem precisar de Electron rodando nem de terminal nenhum.
3. **BoardStore + UI do Board (somente leitura)** — consome (2) via IPC; nesse ponto já existe o "core value" do produto (board fiel em tempo real), mesmo sem terminais.
4. **PtyHost genérico** — spawn/resize/kill de PTY, testável com qualquer shell antes de integrar especificamente com `claude`.
5. **SessionManager** — camada Claude-específica sobre (4): spawnar `claude`, descobrir sessões existentes em `~/.claude/projects/`, decidir `claude` vs `claude --resume <id>`.
6. **Drawer/terminal UI (xterm.js) + canal IPC de alta frequência** — integra (4)+(5) à UI; primeira vez que o usuário digita de fato num terminal do app.
7. **Sidebar + ações de card disparando comando no terminal certo** — camada de integração final entre (3) e (5)/(6); é o que fecha o loop "clicar no card → comando roda → arquivo muda → card atualiza".
8. **Persistência/restauração de sessão entre relançamentos** (snapshot serializado + reconciliação com `.jsonl`) — depende de (5)/(6) já estáveis; é uma camada de resiliência, não o caminho feliz inicial.
9. **i18n (pt-BR/en) e empacotamento multiplataforma** — cross-cutting, deixado por último por não bloquear nenhum outro componente.

Essa ordem também minimiza retrabalho: (2) e (4) podem ser construídos e testados em paralelo por serem completamente desacoplados (nenhum depende do outro), convergindo apenas em (7).

## Sources

- [Manage sessions — Claude Code Docs (code.claude.com)](https://code.claude.com/docs/en/sessions) — HIGH confidence, documentação oficial da Anthropic; cruzado com comportamento real observado em `~/.claude/projects/` na máquina local (estrutura `<drive>--<path>/<session-id>.jsonl`, presença de subpasta `<session-id>/subagents/`)
- [Comparing Electron and Tauri for Desktop Applications](https://blog.openreplay.com/comparing-electron-tauri-desktop-applications/) — MEDIUM
- [Tauri vs. Electron: The Ultimate Desktop Framework Comparison](https://peerlist.io/jagss/articles/tauri-vs-electron-a-deep-technical-comparison) — MEDIUM
- [Electron Forge + node-pty — bundling a terminal in an Electron app](https://thomasdeegan.medium.com/electron-forge-node-pty-9dd18d948956) — MEDIUM
- [Browser-based terminals with Electron.js and Xterm.js](https://www.opcito.com/blogs/browser-based-terminals-with-xtermjs-and-electronjs) — MEDIUM
- [Electron Performance docs](https://www.electronjs.org/docs/latest/tutorial/performance) — MEDIUM
- [xterm-addon-serialize (npm)](https://www.npmjs.com/package/xterm-addon-serialize) — MEDIUM
- [chokidar (GitHub/npm) — awaitWriteFinish, atomic writes](https://github.com/paulmillr/chokidar) — MEDIUM
- [electron-store (sindresorhus/GitHub)](https://github.com/sindresorhus/electron-store) — MEDIUM
- [Zustand + Electron IPC bridging (zutron/@zubridge)](https://777genius.medium.com/how-to-sync-state-across-electron-windows-vue-zustand-svelte-pinia-valtio-83cfbf3223c5) — MEDIUM
- Templates locais do gsd-core (`~/.claude/gsd-core/templates/roadmap.md`, `state.md`, `phase-prompt.md`, `summary.md`, `verification-report.md`, `config.json`) — HIGH confidence, fonte primária lida diretamente

---
*Architecture research for: app desktop de orquestração Claude CLI + gsd-core*
*Researched: 2026-07-22*
