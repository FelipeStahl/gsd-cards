# Phase 4: Casa persistente - Context

**Gathered:** 2026-07-24
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommended answers auto-accepted per grey area)

<domain>
## Phase Boundary

O app deixa de abrir um único projeto e vira a **casa persistente** do fluxo diário:
- **Página principal multi-projeto** (PROJ-01, PROJ-06): lista de projetos recentes ordenada por último acesso, cada um com saúde derivada do `STATE.md` (fase atual, % de progresso, bloqueios).
- **Criar projeto do zero** (PROJ-03): apontar uma pasta vazia, abrir uma sessão nela e conduzir o `/gsd-new-project`.
- **Alternar entre projetos abertos** (PROJ-05) sem fechar nenhuma sessão de nenhum projeto — todos os PTYs seguem vivos.
- **Sessões persistentes** (SESS-04): sobrevivem ao fechar/reabrir o app e restauram sob demanda (snapshot do buffer + histórico via `claude --resume`, restauração **lazy**), comunicando visualmente "histórico restaurado, não processo contínuo".
- **Renomear sessões** (SESS-05).
- **Notificações** (TERM-04): alerta do SO + badge na sidebar quando uma sessão termina ou precisa de input.

**Invariante inegociável preservada:** o board continua **read-only sobre `.planning/`** — o app NUNCA escreve nos artefatos GSD. Toda a persistência desta fase (recentes, nomes de sessão, snapshots) grava no **diretório de dados do próprio app** (Tauri `appDataDir`), não no `.planning/` do usuário. Criar projeto acontece disparando `/gsd-new-project` no terminal (é o GSD que escreve `.planning/`), nunca o app.

Requisitos: PROJ-01, PROJ-03, PROJ-05, PROJ-06, SESS-04, SESS-05, TERM-04.

</domain>

<decisions>
## Implementation Decisions

### Persistência (fundação de PROJ-01, SESS-04, SESS-05)
- **Mecanismo:** adotar `@tauri-apps/plugin-store` (plugin oficial Tauri) — KV/JSON no `appDataDir`, com sua própria capability (`store:*`). Substitui a necessidade de hand-rollar comandos Rust de escrita. É a primeira escrita em disco do app; grava SÓ estado do app (recentes, índice/nome/snapshot de sessão), NUNCA `.planning/`.
- **Gate de legitimidade de pacote:** `@tauri-apps/plugin-store` + o crate `tauri-plugin-store` são oficiais (org tauri-apps) — checkpoint de legitimidade esperado, pré-aprovável.
- **Registro no backend:** `.plugin(tauri_plugin_store::Builder::new().build())` em `lib.rs`; capability `store:default` (ou permissões mínimas) em `capabilities/default.json`.
- **Alternativa considerada (não adotada agora):** comandos Rust dedicados escrevendo em `appDataDir()`. Mais controle, sem dep JS nova, porém mais código; reconsiderar só se o plugin-store não servir para snapshots grandes.

### Página Principal + Recentes (PROJ-01, PROJ-06)
- **Sem router novo:** a home é um novo ramo de renderização condicional no `AppShell` (novo view-state, ex. `status === "home"` / uma `view` no store) — não introduzir react-router.
- **Modelo de recente:** `{ root, name (cache), lastOpened }`. Adicionado/atualizado em todo `openProject` bem-sucedido; ordenado por `lastOpened` desc; persistido via plugin-store.
- **Saúde por projeto:** reaproveitar `validateProjectRoot` + `readPlanningText(statePath)` + `parseStateFile` (parser/state.ts já expõe `currentPhase`, `progress.percent`, `blockers`) para cada recente. Cálculo lazy ao montar a home; degrada graciosamente (projeto movido/apagado → item em estado de erro, não crash).
- **Navegação:** clicar num recente chama o fluxo `openProject` existente e troca para a view de board.

### Criar Projeto do Zero (PROJ-03)
- **Fluxo:** dialog `open({ directory: true })` para uma pasta (pode estar vazia) → abrir uma sessão com `cwd` = essa pasta → injetar `/gsd-new-project\r` via `writeSession` (primitiva da Fase 3). O GSD cria o `.planning/`; o watcher detecta e o projeto passa a existir.
- **Gate de validação:** `validate_project_root` hoje rejeita pasta sem `.planning/` (`NotAGsdProject`). A criação usa um caminho separado que **registra o escopo de sessão para a pasta crua** (sem exigir `.planning/`) só para permitir abrir o terminal ali; a validação normal de projeto só roda depois que `/gsd-new-project` cria os artefatos.
- **Segurança:** o caminho da pasta é string do usuário — nunca interpolar cru num comando; o `cwd` vai como argumento do spawn (não concatenado em shell), e qualquer valor exibido é tratado como dado.

### Multi-projeto Aberto + Escopo de Sessão (PROJ-05)
- **Modelo:** um conjunto de "projetos abertos" + um `activeProjectRoot`. Board e sidebar mostram o projeto ativo; os PTYs de TODOS os projetos abertos seguem vivos (já é o caso — `liveSessions` é Map de módulo keyed por sessionId, `openProject`/`closeProject` não matam sessões).
- **Escopo de sessão:** adicionar `projectRoot` ao `SessionDescriptor`. A sidebar filtra `sessions[]` pelo `activeProjectRoot` (hoje ela mistura sessões de projetos diferentes no array global — bug a corrigir). `discoverSessions` passa a anotar/filtrar por projeto.
- **Trocar de projeto:** troca `activeProjectRoot` (board re-deriva, sidebar filtra) — nenhuma sessão morre. Trocar NÃO chama `closeProject` destrutivo.

### Persistência & Restauração de Sessão (SESS-04)
- **O que persiste:** por sessão — `{ id, projectRoot, name?, lastActive, serializedSnapshot? }` via plugin-store; snapshot do buffer via `SerializeAddon` (já instalado e fiado in-memory no `focus-algorithm.ts`), gravado em disco ao perder foco / ao sair.
- **Restauração LAZY:** ao reabrir o app, sessões persistidas aparecem como **restauradas/históricas** (visual distinto — "histórico restaurado, não processo contínuo", reaproveitar/estender `SessionRowVariant`). O PTY só re-nasce quando o usuário abre aquela sessão: `spawnSession` com `claude --resume <id>` + re-hidratação do snapshot no xterm.
- **`claude --resume`:** adicionar passagem de argumentos a `spawnSession` (channel.ts) e `spawn_session` (pty.rs) — `cmd.args(["--resume", id])`. Hoje não há passthrough de args.

### Renomear (SESS-05)
- **Modelo:** campo `name?` no `SessionDescriptor` + ação `renameSession(id, name)` no store, persistida via plugin-store. Label cai para o derivado (`Sessão <id8>`) quando não há nome.
- **Affordance:** botão de renomear revelado no hover da row (padrão dos botões Archive/Trash2 já existentes), abrindo edição inline ou um pequeno diálogo (reaproveitar o esqueleto do `ConfirmDialog`). Nome é dado do usuário — exibido como texto, nunca injetado.

### Notificações & Estado de Saída (TERM-04)
- **Plugin:** adicionar `@tauri-apps/plugin-notification` (JS + crate + capability `notification:*` + `.plugin(...)` em lib.rs). Pedir permissão de notificação na primeira necessidade.
- **Gatilhos:** disparar notificação do SO em (a) sessão transiciona para `awaiting` (precisa de input — reaproveita o classificador de atividade da Fase 3) e (b) sessão `exited`.
- **Detecção de saída (net-new):** `pty.rs` hoje só faz `break` no EOF do reader — não emite evento. Adicionar um sinal de saída Rust→JS (mensagem no Channel ou evento) para o front virar a sessão para `exited` (slot já existente e ocioso no `SessionRowVariant`), disparar notificação e badge.
- **Badge:** estender o badge do `DrawerRail` (contagem live) e o dot da `SessionRow` para refletir needs-input/exited (reaproveitar `ActivityDot`/variantes).

### Claude's Discretion
- Formato exato das chaves/arquivos do plugin-store (um store `app.json` vs. múltiplos).
- Onde exatamente mora o snapshot grande (dentro do store JSON vs. arquivo por sessão) — o planner/research decide pelo tamanho real; MVP pode começar simples e medir.
- Layout visual fino da home (grid vs. lista) dentro do contrato do UI-SPEC.
- Se a notificação de `awaiting` tem debounce para não spammar em prompts repetidos.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Saúde de projeto:** `parser/state.ts` (`currentPhase`, `extractProgress`→percent, `extractBlockers`); `model.ts` (`ProjectStateModel`, `ProjectProgress`, `PhaseBlocker`); `read.ts` `validateProjectRoot`; `paths.ts` `statePath`.
- **Abrir projeto:** `AppShell.tsx:25-32` (dialog + `openProject`), `board-store.ts:443-539` (`openProject`/`closeProject`, `deriveProjectName`).
- **Sessões:** `session-store.ts` (`SessionDescriptor` :77-88 — sem `name`/`projectRoot`; `liveSessions` Map de módulo :46; `createSession` lê `project.root` no spawn :203; `killSession`/`archiveSession`/`discoverSessions`/`setActivity`); `sessions/discover.ts` (`listSessions` keyed por filename).
- **PTY:** `channel.ts` `spawnSession` :54-67 (sem args passthrough); `pty.rs` `spawn_session` :145-223 (`CommandBuilder::new("claude")`, sem `.arg`, size fixo 24x80; reader dá `break` no EOF sem emitir evento).
- **Snapshot:** `TerminalView.tsx:252-322` (`SerializeAddon`, `loseFocus`/`gainFocus`); `focus-algorithm.ts:46-161` (`LiveSessionState.serializedSnapshot`, restore via `terminal.write`).
- **Atividade (Fase 3):** `activity.ts` (`awaiting` classifier), `useTerminalActivity.ts` (always-on, wired em `createSession`), `setActivity`.
- **UI:** `SessionRow.tsx` (variantes `live|historical|starting|exited` — `starting`/`exited` ociosos; hover actions :204-248), `ConfirmDialog.tsx` (modal reutilizável), `DrawerRail.tsx:94-114` (badge de contagem).
- **Injeção (Fase 3):** `writeSession` (channel.ts) para PROJ-03 disparar `/gsd-new-project`.

### Established Patterns
- Sem router — troca de tela por render condicional em `AppShell` keyed no store.
- `liveSessions`/`bytesHandlers`/`activityHandlers` são Maps de módulo keyed por sessionId (fora do immer).
- Capabilities hoje SÓ leitura (`capabilities/default.json` — `fs:allow-read-*`, sem escrita).
- i18n: um JSON por namespace (`project.json` existe, sem chaves de home/rename); adicionar chaves em pt-BR **e** en.
- Testes: vitest com mock de `@tauri-apps/api/core` invoke, `@tauri-apps/plugin-fs`, `../pty/channel`; import dinâmico do store após mocks; reset via `setState(initial, true)`.

### Integration Points
- Home: novo ramo em `AppShell.tsx` + novo namespace i18n (`home.json`).
- Persistência: plugin-store (JS) + `tauri-plugin-store` (Cargo) + capability + init em `lib.rs`.
- `projectRoot`/`name` no `SessionDescriptor` + filtro na `SessionSidebar`.
- `--resume` em `channel.ts` + `pty.rs`; evento de saída Rust→JS em `pty.rs` + wiring no store.
- Notificação: `@tauri-apps/plugin-notification` + crate + capability + init.

</code_context>

<specifics>
## Specific Ideas

- Restauração lazy é o coração de SESS-04: reabrir o app é barato (só lê metadados + snapshots), e só re-spawna `claude --resume` quando o usuário realmente abre a sessão.
- Persistir no `appDataDir` do app é o que mantém a promessa "board read-only sobre `.planning/`" verdadeira mesmo com escrita em disco.
- Reaproveitar a classificação `awaiting` da Fase 3 para "precisa de input" fecha o loop entre as duas fases.
- Corrigir o vazamento de sessões entre projetos na sidebar (hoje `sessions[]` é global) é pré-requisito de PROJ-05.

</specifics>

<deferred>
## Deferred Ideas

- Boards de múltiplos projetos lado a lado (split view) — fora de escopo; uma board ativa por vez.
- Busca/– filtro global de projetos ou sessões entre projetos.
- Sincronização de estado do app entre máquinas (cloud) — fora de escopo.
- Escrita em disco de qualquer coisa dentro de `.planning/` — permanece proibida por invariante de produto.

</deferred>
