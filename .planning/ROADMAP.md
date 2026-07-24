# Roadmap: GSD Cards

## Overview

GSD Cards evolui de um espelho fiel do `.planning/` a um orquestrador completo do fluxo Claude CLI + gsd-core. A jornada começa provando o valor central — abrir um projeto e ver, em tempo real, um board kanban hierárquico que reflete o `.planning/` (Fase 1, que também resolve o gate de decisão Tauri vs. Electron). Em seguida ganha vida com sessões e terminal embutido (Fase 2), conecta board e terminal por meio de cards que disparam `/gsd-*` na sessão certa (Fase 3), amadurece como casa persistente multi-projeto com onboarding e restauração de sessões (Fase 4) e, por fim, chega à comunidade com i18n e distribuição multiplataforma (Fase 5). Cada fase é uma fatia vertical utilizável de ponta a ponta; robustez de PTY (sem zombie processes) e parser resiliente são critérios de fundação, não polimento.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Espelho fiel** - Abrir um projeto e ver, em tempo real, um board kanban hierárquico que espelha fielmente o `.planning/`
- [ ] **Phase 2: Sessão viva** - Criar sessões na sidebar e conversar com o `claude` interativo em um terminal real embutido, com terminais paralelos e encerramento limpo
- [ ] **Phase 3: Board interativo** - Cards com ações contextuais que disparam o `/gsd-*` certo no terminal da sessão, com detecção de estado
- [ ] **Phase 4: Casa persistente** - Página principal multi-projeto com saúde, criação de projeto do zero e sessões que persistem e restauram ao reabrir
- [ ] **Phase 5: Comunidade** - UI bilíngue pt-BR/en, instalador empacotado multiplataforma e auto-atualização

## Phase Details

### Phase 1: Espelho fiel

**Goal**: Usuário abre um projeto GSD e vê, em tempo real, um board kanban hierárquico que espelha fielmente o `.planning/` — o valor central do produto.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Decision gate**: Tauri vs. Electron — resolver no início da fase (decisão executiva informada por `research/STACK.md` + `research/ARCHITECTURE.md`) antes de consolidar a stack; desbloqueia toda a arquitetura subsequente.
**Requirements**: PROJ-02, BOARD-01, BOARD-02, BOARD-03, BOARD-04, BOARD-05, BOARD-06
**Success Criteria** (what must be TRUE):

  1. Usuário abre um diretório e o app só o aceita como projeto após validar a presença de `.planning/`, com aviso claro quando ausente.
  2. Usuário vê um board kanban com cards de fase distribuídos em colunas que correspondem aos status reais de fase do gsd-core.
  3. Usuário expande um card de fase e vê a hierarquia de 3 níveis (fase → planos → tarefas) derivada dos artefatos reais, com indicadores de progresso de projeto e de fases.
  4. O board atualiza sozinho quando o `.planning/` muda no disco, sem refresh manual (file watching debounced, sem piscar durante rajadas de escrita do GSD).
  5. Diante de um artefato não parseável, o board exibe aviso/raw em vez de mentir silenciosamente, e o usuário abre a visualização renderizada de PLAN/SUMMARY/VERIFICATION a partir do card.

**Plans**: 8/8 plans executed
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Fundação executável: toolchain Rust/MSVC, scaffold Tauri v2 + React + TS, tokens do UI-SPEC, i18n e CI multiplataforma

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Abrir e validar um projeto GSD (PROJ-02), esqueleto de layout e header com dados reais de STATE.md

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Board kanban de 4 colunas com cards de fase derivados da regra de status do gsd-core

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-04-PLAN.md — Espelho vivo: watcher Rust debounced, reprocessamento incremental e indicador de sincronização
- [x] 01-05-PLAN.md — Painel de detalhe hierárquico e modal de artefato com render GFM e modo raw
- [x] 01-06-PLAN.md — Histórico de milestones e guarda de regressão contra evolução de formato do gsd-core

**Wave 5** *(remediação dos gaps confirmados em 01-VERIFICATION.md — CR-01/CR-02/CR-03)*

- [x] 01-07-PLAN.md — Correção do espelho em tempo real: badges de bloqueio obsoletos (CR-02) e cache de conteúdo de artefato nunca invalidado (CR-03), teste-primeiro
- [x] 01-08-PLAN.md — Rede de segurança do CI Rust: `cargo test` em toda build para os testes de contenção de caminho de T-01-01 (CR-01)

**UI hint**: yes

### Phase 2: Sessão viva

**Goal**: Usuário cria sessões do Claude na sidebar e conversa com o `claude` interativo em um terminal real embutido, com múltiplos terminais vivos em paralelo e encerramento limpo da árvore de processos.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: PROJ-04, SESS-01, SESS-02, SESS-03, SESS-06, TERM-01, TERM-02, TERM-03
**Success Criteria** (what must be TRUE):

  1. Quando Claude CLI ou gsd-core não estão instalados, o app mostra instrução clara de instalação (sem auto-instalar); com eles presentes, o usuário vê as sessões do projeto na sidebar e cria uma nova, que faz spawn do `claude` no diretório do projeto.
  2. Usuário interage com um terminal real embutido no drawer direito rodando o `claude` interativo, com scrollback limitado, copiar/colar e links clicáveis.
  3. Usuário navega entre sessões sem fechar nenhuma — os terminais das sessões inativas continuam vivos em background.
  4. Usuário busca texto no scrollback do terminal e encontra ocorrências anteriores.
  5. Usuário arquiva/exclui uma sessão e a árvore de processos é encerrada de forma limpa — nenhum processo zumbi permanece, inclusive ao fechar o app no Windows (tree-kill validado como critério de fundação).

**Plans**: 6/6 plans executed
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Fatia-traçadora: sessão viva end-to-end (spawn PTY do claude → bytes no xterm → kill limpo de árvore) + spike win32job A1

**Wave 2** *(blocked on Wave 1)*

- [x] 02-02-PLAN.md — SESS-06 fundação: teste de integração de tree-kill (spawn→neto→kill→zero PIDs)
- [x] 02-03-PLAN.md — Backend de sessões: detecção de Claude CLI/gsd-core (PROJ-04) + escopo estreito de descoberta (SESS-01)

**Wave 3** *(blocked on Wave 2)*

- [x] 02-04-PLAN.md — Sidebar de sessões (SESS-01) + tela tool-missing (PROJ-04)
- [x] 02-05-PLAN.md — Terminal: scrollback/copiar-colar/links clicáveis (TERM-02) + busca no scrollback (TERM-03)

**Wave 4** *(blocked on Wave 3)*

- [x] 02-06-PLAN.md — Foco multi-sessão em background (SESS-03) + affordances arquivar/excluir (SESS-06 UI)

**UI hint**: yes

### Phase 3: Board interativo

**Goal**: O board deixa de ser só espelho e passa a guiar o fluxo: cards mostram ações contextuais por status e disparam o `/gsd-*` certo no terminal da sessão, com segurança contra injeção quando o Claude está ocupado.
**Mode:** mvp
**Depends on**: Phase 1 (board), Phase 2 (sessões/terminal)
**Requirements**: ACT-01, ACT-02, ACT-03, ACT-04
**Success Criteria** (what must be TRUE):

  1. Cada card de fase oferece as ações contextuais corretas para seu status (pending→Discutir, discussed→Planejar, planned→Executar, executed→Verificar...).
  2. Ao disparar uma ação, o comando `/gsd-*` correto é enviado ao terminal da sessão escolhida/ativa e aparece no `claude`.
  3. O app detecta o estado do terminal (ocioso/ocupado/aguardando permissão) e não injeta comandos enquanto o Claude está ocupado.
  4. Usuário aciona atalhos GSD (paleta/botões de comandos `/gsd-*`) no drawer junto ao terminal.

**Plans**: 4/5 plans executed
Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Fatia-traçadora: card lê `diskStatus`, sanitiza `phase.id` e injeta o `/gsd-*` correto via `writeSession` (ACT-01/ACT-02)
- [x] 03-02-PLAN.md — Gate de legitimidade + install de `strip-ansi@7.2.0` (dependência do classificador)

**Wave 2** *(blocked on Wave 1)*

- [x] 03-03-PLAN.md — Motor de detecção de estado: `activityHandlers` sempre-ligado, `classifyActivity` puro, campo `activity` transition-gated (ACT-03)

**Wave 3** *(blocked on Wave 2)*

- [x] 03-04-PLAN.md — Matriz de injeção (`resolveInjection`), guard 3-estados no card, dot de atividade e ação no DetailPanel (ACT-01/ACT-02/ACT-03)

**Wave 4** *(blocked on Wave 3)*

- [ ] 03-05-PLAN.md — Toolbar de comandos GSD + paleta Cmd/Ctrl+K no drawer, sob o mesmo guard (ACT-04)

**UI hint**: yes

### Phase 4: Casa persistente

**Goal**: O app vira a casa persistente do fluxo diário: página principal multi-projeto com saúde, criação de projeto do zero, troca entre projetos sem perder sessões, e sessões que persistem e restauram ao reabrir.
**Mode:** mvp
**Depends on**: Phase 2 (sessões/PTY), Phase 1 (board multi-projeto)
**Requirements**: PROJ-01, PROJ-03, PROJ-05, PROJ-06, SESS-04, SESS-05, TERM-04
**Success Criteria** (what must be TRUE):

  1. Na página principal, usuário vê a lista de projetos recentes ordenada por último acesso, cada um com saúde derivada de STATE.md (fase atual, % de progresso, bloqueios pendentes).
  2. Usuário cria um projeto GSD do zero apontando uma pasta vazia/nova; o app abre uma sessão e conduz o `/gsd-new-project`.
  3. Usuário alterna entre múltiplos projetos abertos sem que nenhuma sessão de nenhum deles seja fechada.
  4. Ao reabrir o app, as sessões são restauradas (snapshot do buffer + histórico via `claude --resume`, restauração lazy), comunicando visualmente que é histórico restaurado, não processo contínuo.
  5. Usuário renomeia sessões e é notificado (alerta do SO + badge na sidebar) quando uma sessão termina ou precisa de input.

**Plans**: TBD
**UI hint**: yes

### Phase 5: Comunidade

**Goal**: O app está pronto para a comunidade GSD: UI bilíngue pt-BR/en, instalador empacotado multiplataforma e auto-atualização.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: DIST-01, DIST-02, DIST-03
**Success Criteria** (what must be TRUE):

  1. Usuário usa a UI em pt-BR ou inglês e alterna o idioma (infraestrutura i18n adotada desde a fundação, verificada completa aqui).
  2. Usuário instala o app via instalador empacotado (Windows primeiro; macOS/Linux também).
  3. O app detecta uma nova versão e se atualiza automaticamente.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Espelho fiel | 8/8 | In Progress|  |
| 2. Sessão viva | 6/6 | In Progress|  |
| 3. Board interativo | 4/5 | In Progress|  |
| 4. Casa persistente | 0/TBD | Not started | - |
| 5. Comunidade | 0/TBD | Not started | - |
