# Requirements: GSD Cards

**Defined:** 2026-07-22
**Core Value:** Abrir o app e ver fielmente, em tempo real, onde cada projeto GSD está — o board é um espelho confiável do `.planning/`.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Projetos (PROJ)

- [ ] **PROJ-01**: Usuário vê lista de projetos recentes na página principal, ordenada por último acesso
- [ ] **PROJ-02**: Usuário abre um diretório como projeto; o app valida a presença de `.planning/` antes de aceitá-lo como projeto GSD
- [ ] **PROJ-03**: Usuário cria um projeto GSD do zero apontando uma pasta vazia/nova; o app abre uma sessão e conduz o `/gsd-new-project`
- [ ] **PROJ-04**: App detecta Claude CLI e gsd-core instalados; quando ausentes, mostra instrução clara de instalação (sem auto-instalar)
- [ ] **PROJ-05**: Usuário alterna entre múltiplos projetos abertos sem fechar sessões de nenhum deles
- [ ] **PROJ-06**: Usuário vê saúde de cada projeto na lista (fase atual, % de progresso, bloqueios pendentes) derivada de STATE.md

### Sessões (SESS)

- [ ] **SESS-01**: Usuário vê as sessões do Claude CLI do projeto selecionado na sidebar
- [ ] **SESS-02**: Usuário cria nova sessão pela sidebar (spawn do `claude` no diretório do projeto)
- [ ] **SESS-03**: Usuário navega entre sessões sem fechar nenhuma — terminais continuam vivos em background
- [ ] **SESS-04**: Sessões persistem entre aberturas do app e são restauradas ao reabrir (snapshot do buffer + histórico via `claude --resume`, restauração lazy)
- [ ] **SESS-05**: Usuário renomeia sessões
- [ ] **SESS-06**: Usuário arquiva/exclui sessões, com encerramento limpo da árvore de processos (sem zombie processes)

### Terminal (TERM)

- [ ] **TERM-01**: Usuário interage com terminal real embutido no drawer direito rodando o `claude` interativo
- [ ] **TERM-02**: Terminal tem scrollback com limite, copiar/colar e links clicáveis
- [ ] **TERM-03**: Usuário busca texto no scrollback do terminal
- [ ] **TERM-04**: Usuário é notificado quando uma sessão termina ou precisa de input (alerta do SO + badge na sidebar)

### Board (BOARD)

- [ ] **BOARD-01**: Usuário vê board kanban com colunas mapeando os status reais de fase do gsd-core
- [ ] **BOARD-02**: Cards de fase expandem mostrando planos e tarefas (hierarquia de 3 níveis derivada dos artefatos reais)
- [ ] **BOARD-03**: Board reflete mudanças do `.planning/` em tempo real via file watching, sem refresh manual
- [ ] **BOARD-04**: Usuário vê indicadores de progresso do projeto e das fases (derivados de STATE.md/ROADMAP.md)
- [ ] **BOARD-05**: Board degrada graciosamente com artefatos não parseáveis (mostra aviso/raw; nunca mente silenciosamente)
- [ ] **BOARD-06**: Usuário abre visualização renderizada de artefatos (PLAN/SUMMARY/VERIFICATION) a partir do card

### Ações GSD (ACT)

- [ ] **ACT-01**: Cards de fase oferecem ações contextuais conforme o status (pending→Discutir, discussed→Planejar, planned→Executar, executed→Verificar...)
- [ ] **ACT-02**: Disparar uma ação envia o comando `/gsd-*` correto para o terminal da sessão escolhida/ativa
- [ ] **ACT-03**: App detecta estado do terminal (ocioso/ocupado/aguardando permissão) e não injeta comandos com o Claude ocupado
- [ ] **ACT-04**: Usuário tem atalhos GSD (paleta/botões) no drawer junto ao terminal

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
| (populated during roadmap creation) | | |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 0
- Unmapped: 29 ⚠️ (roadmap pending)

---
*Requirements defined: 2026-07-22*
*Last updated: 2026-07-22 after initial definition*
