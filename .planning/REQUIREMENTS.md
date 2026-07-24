# Requirements: GSD Cards

**Defined:** 2026-07-22
**Core Value:** Abrir o app e ver fielmente, em tempo real, onde cada projeto GSD está — o board é um espelho confiável do `.planning/`.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Projetos (PROJ)

- [x] **PROJ-01**: Usuário vê lista de projetos recentes na página principal, ordenada por último acesso
- [x] **PROJ-02**: Usuário abre um diretório como projeto; o app valida a presença de `.planning/` antes de aceitá-lo como projeto GSD
- [x] **PROJ-03**: Usuário cria um projeto GSD do zero apontando uma pasta vazia/nova; o app abre uma sessão e conduz o `/gsd-new-project`
- [x] **PROJ-04**: App detecta Claude CLI e gsd-core instalados; quando ausentes, mostra instrução clara de instalação (sem auto-instalar)
- [x] **PROJ-05**: Usuário alterna entre múltiplos projetos abertos sem fechar sessões de nenhum deles
- [x] **PROJ-06**: Usuário vê saúde de cada projeto na lista (fase atual, % de progresso, bloqueios pendentes) derivada de STATE.md

### Sessões (SESS)

- [x] **SESS-01**: Usuário vê as sessões do Claude CLI do projeto selecionado na sidebar
- [ ] **SESS-02**: Usuário cria nova sessão pela sidebar (spawn do `claude` no diretório do projeto)
- [x] **SESS-03**: Usuário navega entre sessões sem fechar nenhuma — terminais continuam vivos em background
- [x] **SESS-04**: Sessões persistem entre aberturas do app e são restauradas ao reabrir (snapshot do buffer + histórico via `claude --resume`, restauração lazy)
- [ ] **SESS-05**: Usuário renomeia sessões
- [x] **SESS-06**: Usuário arquiva/exclui sessões, com encerramento limpo da árvore de processos (sem zombie processes)

### Terminal (TERM)

- [ ] **TERM-01**: Usuário interage com terminal real embutido no drawer direito rodando o `claude` interativo
- [x] **TERM-02**: Terminal tem scrollback com limite, copiar/colar e links clicáveis
- [x] **TERM-03**: Usuário busca texto no scrollback do terminal
- [x] **TERM-04**: Usuário é notificado quando uma sessão termina ou precisa de input (alerta do SO + badge na sidebar)

### Board (BOARD)

- [x] **BOARD-01**: Usuário vê board kanban com colunas mapeando os status reais de fase do gsd-core
- [x] **BOARD-02**: Cards de fase expandem mostrando planos e tarefas (hierarquia de 3 níveis derivada dos artefatos reais)
- [x] **BOARD-03**: Board reflete mudanças do `.planning/` em tempo real via file watching, sem refresh manual
- [x] **BOARD-04**: Usuário vê indicadores de progresso do projeto e das fases (derivados de STATE.md/ROADMAP.md)
- [x] **BOARD-05**: Board degrada graciosamente com artefatos não parseáveis (mostra aviso/raw; nunca mente silenciosamente)
- [x] **BOARD-06**: Usuário abre visualização renderizada de artefatos (PLAN/SUMMARY/VERIFICATION) a partir do card

### Ações GSD (ACT)

- [x] **ACT-01**: Cards de fase oferecem ações contextuais conforme o status (pending→Discutir, discussed→Planejar, planned→Executar, executed→Verificar...)
- [x] **ACT-02**: Disparar uma ação envia o comando `/gsd-*` correto para o terminal da sessão escolhida/ativa
- [x] **ACT-03**: App detecta estado do terminal (ocioso/ocupado/aguardando permissão) e não injeta comandos com o Claude ocupado
- [x] **ACT-04**: Usuário tem atalhos GSD (paleta/botões) no drawer junto ao terminal

### Distribuição (DIST)

- [ ] **DIST-01**: UI disponível em pt-BR e inglês (i18n desde o início)
- [ ] **DIST-02**: Usuário instala o app via instalador empacotado (Windows primeiro; macOS/Linux também)
- [ ] **DIST-03**: App se atualiza automaticamente quando há nova versão

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Ações GSD

- **ACT-05**: Paleta de comandos global (Cmd+K) acessível de qualquer tela

### Projetos

- **PROJ-07**: Dashboard cross-projeto com métricas agregadas (velocidade, fases/semana)

### Runtimes

- **RUN-01**: Adapter para outros runtimes de agente (Codex, Gemini CLI, OpenCode)

### Sessões

- **SESS-07**: Isolamento opcional por git worktree por sessão (padrão Conductor/Crystal)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Drag-and-drop para mudar status de card | Viola o princípio do board read-only — criaria estado divergente do que o gsd-core processou; avanço de fase só via comando `/gsd-*` real |
| Edição direta de artefatos `.planning/` pela UI | GSD é a única fonte de escrita; duas fontes de verdade quebram a garantia do espelho fiel |
| Auto-instalação do Claude CLI/gsd-core | App orquestra as ferramentas, não as substitui; instalar binários de terceiros silenciosamente é risco de segurança/suporte |
| UI de chat própria por cima do terminal | Reimplementar a interface do Claude Code é duplicar produto mantido pela Anthropic e quebra a cada mudança de output |
| Versão web/hospedada, multi-usuário, colaboração | Categoria de produto diferente (exige servidor, auth, PTY remoto); v1 é local e single-user |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROJ-01 | Phase 4 | Complete |
| PROJ-02 | Phase 1 | Complete |
| PROJ-03 | Phase 4 | Complete |
| PROJ-04 | Phase 2 | Complete |
| PROJ-05 | Phase 4 | Complete |
| PROJ-06 | Phase 4 | Complete |
| SESS-01 | Phase 2 | Complete |
| SESS-02 | Phase 2 | Pending |
| SESS-03 | Phase 2 | Complete |
| SESS-04 | Phase 4 | Complete |
| SESS-05 | Phase 4 | Pending |
| SESS-06 | Phase 2 | Complete |
| TERM-01 | Phase 2 | Pending |
| TERM-02 | Phase 2 | Complete |
| TERM-03 | Phase 2 | Complete |
| TERM-04 | Phase 4 | Complete |
| BOARD-01 | Phase 1 | Complete |
| BOARD-02 | Phase 1 | Complete |
| BOARD-03 | Phase 1 | Complete |
| BOARD-04 | Phase 1 | Complete |
| BOARD-05 | Phase 1 | Complete |
| BOARD-06 | Phase 1 | Complete |
| ACT-01 | Phase 3 | Complete |
| ACT-02 | Phase 3 | Complete |
| ACT-03 | Phase 3 | Complete |
| ACT-04 | Phase 3 | Complete |
| DIST-01 | Phase 5 | Pending |
| DIST-02 | Phase 5 | Pending |
| DIST-03 | Phase 5 | Pending |

**Coverage:**

- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0 ✓ (100% coverage)

**By Phase:**

- Phase 1 (Espelho fiel): PROJ-02, BOARD-01, BOARD-02, BOARD-03, BOARD-04, BOARD-05, BOARD-06 (7)
- Phase 2 (Sessão viva): PROJ-04, SESS-01, SESS-02, SESS-03, SESS-06, TERM-01, TERM-02, TERM-03 (8)
- Phase 3 (Board interativo): ACT-01, ACT-02, ACT-03, ACT-04 (4)
- Phase 4 (Casa persistente): PROJ-01, PROJ-03, PROJ-05, PROJ-06, SESS-04, SESS-05, TERM-04 (7)
- Phase 5 (Comunidade): DIST-01, DIST-02, DIST-03 (3)

---
*Requirements defined: 2026-07-22*
*Last updated: 2026-07-22 after roadmap creation (29/29 mapped)*
