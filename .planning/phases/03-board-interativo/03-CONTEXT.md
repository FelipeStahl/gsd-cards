# Phase 3: Board interativo - Context

**Gathered:** 2026-07-23
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommended answers auto-accepted per grey area)

<domain>
## Phase Boundary

O board deixa de ser só espelho e passa a **guiar o fluxo**: cada card de fase oferece a ação contextual correta para seu status e, ao ser acionada, injeta o comando `/gsd-*` correspondente no terminal da sessão ativa. O app detecta o estado do terminal (ocioso / ocupado / aguardando permissão) e **recusa injetar** enquanto o Claude está ocupado. Uma paleta/atalhos de comandos GSD ficam no drawer junto ao terminal.

**Invariante inegociável (PROJECT.md):** o app **nunca escreve em `.planning/` diretamente**. Toda mutação de estado acontece porque um comando `/gsd-*` foi enviado ao terminal e o GSD (via `claude`) escreveu. O board segue read-only sobre o disco; as ações desta fase só produzem *keystrokes no PTY*, não escritas de arquivo.

Requisitos cobertos: ACT-01, ACT-02, ACT-03, ACT-04. Fora de escopo (deferido): ACT-05 (paleta global Cmd+K acessível de qualquer tela).

</domain>

<decisions>
## Implementation Decisions

### Ações Contextuais (ACT-01)
- **Fonte do status:** as ações leem `phase.diskStatus` (granular), NÃO o `badge` — o badge colapsa `planned`+ativo em `executing` (`status.ts:109`), o que quebraria o mapeamento planned→Executar. Ambos os campos existem em `PhaseModel` (`model.ts:35-36`).
- **Mapeamento status→ação:** `no_directory`/`empty`→**Discutir** (`/gsd-discuss-phase N`); `discussed`/`researched`→**Planejar** (`/gsd-plan-phase N`); `planned`→**Executar** (`/gsd-execute-phase N`); `partial`→**Continuar** (`/gsd-execute-phase N`); `executed`→**Verificar** (`/gsd-verify-work N`); `complete`→sem ação primária (card em estado terminal).
- **Colocação:** ação primária única no `PhaseCard` (mantém o card compacto) + conjunto de ações no `DetailPanel` da fase selecionada (tem espaço). Botões aninhados usam `event.stopPropagation()` para não disparar o `selectPhase` do card (padrão já usado em `SessionRow.tsx:77,83`).
- **Sem confirmação modal** no clique quando o terminal está ocioso — o valor é o fluxo de um clique; a trava de segurança é o guard de "ocupado" (ACT-03), não um diálogo.

### Injeção de Comando (ACT-02)
- **Primitiva:** `writeSession(sessionId, "/gsd-...\r")` (`src/pty/channel.ts:71`) — envia a string + `\r` (Enter). Não há caminho de "paste" separado; keystrokes e strings passam pelo mesmo comando. Nenhum código Rust novo é necessário para a escrita.
- **Sessão alvo:** a sessão ativa/focada (`activeSessionId` / `lastFocusedSessionId` em `session-store.ts:67-95`). Se não houver sessão ativa viva, a ação fica desabilitada com dica ("Crie ou selecione uma sessão para usar ações GSD") — MVP não abre seletor modal de sessão nesta fase.
- **Auto-envio:** as ações de card enviam o comando com `\r` (executa) quando o terminal está ocioso — atende o critério "o comando é enviado ao terminal e aparece no `claude`". Pré-preencher-sem-enviar fica como comportamento só do caso "aguardando permissão" (ver abaixo).
- **Gate de disponibilidade:** ação só habilitada quando existe sessão viva com `claude` presente; caso contrário, estado desabilitado com dica (reaproveita o padrão `ToolMissingState`).

### Detecção de Estado do Terminal (ACT-03)
- **Fonte do sinal:** o **stream de bytes do PTY ao vivo**, NÃO os arquivos `.jsonl` — a leitura de conteúdo `.jsonl` está deliberadamente vedada por decisão de segurança (T-02-06, `discover.ts:1-10`). Um novo consumidor observa os bytes via `setSessionBytesHandler` (`channel.ts:63`) / `backgroundBuffer` (`focus-algorithm.ts:46-53`).
- **Classificação:** heurística sobre a saída recente decodificada — marcadores do Claude CLI ("esc to interrupt" / spinner) ⇒ **ocupado**; prompt de permissão ("Do you want to proceed?", opções "❯ 1. Yes") ⇒ **aguardando permissão**; quiescência (sem output novo por ~500ms) ⇒ **ocioso**. Heurística isolada numa função pura e testável (padrão `pump_pty_output`).
- **Threshold:** ~500ms de quiescência para voltar a ocioso; flip imediato para ocupado ao primeiro byte de atividade. Constante nomeada, ajuste empírico deferido à verificação com rajada real.
- **Estado novo na sessão:** adicionar campo de atividade ao `SessionDescriptor` (`session-store.ts:61`) — `SessionRowVariant` já reserva os slots `starting`/`exited` (`SessionRow.tsx:32`); estender para `idle`/`busy`/`awaiting`.
- **Comportamento do guard:** com terminal ocupado, a ação de injeção fica bloqueada com dica ("Claude está ocupado — aguarde"); com "aguardando permissão", a ação **pré-preenche sem enviar** (não rouba o Enter do usuário no prompt de permissão).

### Indicação Visual + Paleta/Atalhos (ACT-04)
- **Indicador de estado:** dot de status reaproveitando `.status-dot` + `statusDotVariants` (CVA já existente) na `SessionRow` e junto aos controles de injeção — ocupado = âmbar (pulso), ocioso = verde, aguardando permissão = azul/atenção.
- **Paleta de comandos:** monta dentro do `<aside>` de 640px do drawer (`DrawerRail.tsx:28-41`), acima do `TerminalView`. Trigger duplo: **Cmd/Ctrl+K** (interceptado antes do xterm, padrão do Ctrl+F em `TerminalView.tsx:229-237`) + uma faixa de botões GSD visível.
- **Conteúdo:** lista curada de comandos `/gsd-*` comuns (discuss, plan, execute, verify, quick, next, progress, status, help), com filtro de busca. Labels via i18n.
- **Estrutura:** construída sobre o esqueleto de modal reutilizável do `ConfirmDialog` (backdrop, Esc, click-outside — `ConfirmDialog.tsx:1-9,35-41`). Envio pela paleta respeita o mesmo guard de ocupado das ações de card.

### Claude's Discretion
- Marcadores exatos de regex para "ocupado"/"aguardando permissão" (afinar contra saída real do Claude CLI durante execução/verificação).
- Ícones `lucide-react` específicos por ação e ordenação exata dos comandos na paleta.
- Nome do novo namespace i18n (`commands` novo vs. estender `board`/`terminal`).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Injeção:** `writeSession(sessionId, data)` (`src/pty/channel.ts:71`) → comando Rust `write_session` (`src-tauri/src/pty.rs:201-219`). Já pronto.
- **Alvo de sessão:** `activeSessionId` / `focusSession` / `lastFocusedSessionId` (`session-store.ts:67-95`).
- **Status/ações:** `PhaseModel.diskStatus` + `badge` (`model.ts:35-36`); mappers puros em `status.ts:72-153`.
- **Card:** `PhaseCard.tsx:99-151` (linha de badge/blocker é o ponto de montagem da ação); `DetailPanel.tsx:130-134` (segunda casa das ações).
- **Modal reutilizável:** `ConfirmDialog.tsx` (base para a paleta).
- **Interceptação de teclado:** `TerminalView.tsx:229-237` (padrão Ctrl+F, base para Cmd+K).
- **Dots de status:** `.status-dot` + `statusDotVariants` (CVA), `SessionRowVariant` com slots `starting`/`exited` reservados.

### Established Patterns
- Estado global: Zustand + immer; `liveSessions` como `Map` de módulo fora do shape immer (autoFreeze) — mutação direta de sessão viva (decisão 02-06).
- i18n: um JSON por namespace (`i18n.ts:19-22,49`), espelhado em `src/locales/{pt-BR,en}/`. Namespaces atuais: `common, project, board, sync, artifact, session, terminal`.
- Read-only/disk-mirror: `board-store.ts` NUNCA escreve em disco (`board-store.ts:1-3`) — injeção vai pelo PTY, não pelo store.

### Integration Points
- Botões de ação: dentro de `PhaseCard` e `DetailPanel`.
- Paleta/toolbar: dentro do `<aside>` do `DrawerRail`.
- Novo consumidor de bytes: via `setSessionBytesHandler` (`channel.ts:63`), gravando estado de atividade no `session-store`.
- Novas chaves i18n em ambos os locales (labels de ação + mensagens de estado ocupado/aguardando).

</code_context>

<specifics>
## Specific Ideas

- Mapeamento de ações espelha a nomenclatura GSD em pt-BR já visível no produto: Discutir / Planejar / Executar / Continuar / Verificar.
- O guard "aguardando permissão" pré-preenche mas não envia — respeita o prompt de permissão do próprio Claude sem sequestrar o Enter.
- Testes de injeção: mockar `../pty/channel` e asserir `writeSession` chamado com `("<sessionId>", "/gsd-...\r")` (padrão `session-store.test.ts:1-22`).

</specifics>

<deferred>
## Deferred Ideas

- **ACT-05** — Paleta de comandos **global** (Cmd+K acessível de qualquer tela, fora do drawer/terminal). Esta fase entrega a paleta escopada ao drawer; a versão global de tela cheia é uma capacidade separada (nice-to-have nos REQUIREMENTS, linha 63).
- Detecção de estado via parsing estruturado de `.jsonl` — permanece vedada por T-02-06; só reconsiderar como decisão de segurança explícita futura.

</deferred>
