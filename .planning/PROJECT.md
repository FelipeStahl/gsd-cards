# GSD Cards

## What This Is

App desktop open-source que dá interface gráfica ao fluxo Claude CLI + gsd-core: gerencia múltiplos projetos GSD, exibe o andamento de cada um como um board kanban hierárquico alimentado pelos artefatos de `.planning/` em tempo real, e mantém sessões persistentes do Claude — cada uma com seu próprio terminal embutido. Feito para a comunidade GSD (i18n pt-BR/en), começando pelo fluxo diário do autor.

## Core Value

Abrir o app e ver fielmente, em tempo real, onde cada projeto GSD está — o board é um espelho confiável do `.planning/`. Se tudo mais falhar, isso tem que funcionar.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Página principal gerencia múltiplos projetos: abrir diretórios com `.planning/` existente e listar projetos recentes
- [ ] Criar projeto GSD do zero: apontar pasta vazia/nova e conduzir o `/gsd-new-project` numa sessão do app
- [ ] Sidebar lista as sessões do Claude CLI do projeto selecionado, com criação de novas sessões
- [ ] Cada sessão tem seu próprio terminal vivo; navegar entre sessões não fecha nenhuma (terminais seguem em background)
- [ ] Sessões persistem entre aberturas do app e são restauradas ao reabrir (via `claude --resume`)
- [ ] Board kanban hierárquico no body: cards de fase organizados em colunas de status, expandindo em planos/tarefas
- [ ] Board atualiza em tempo real conforme o GSD escreve artefatos em `.planning/`
- [ ] Cards interativos: ações contextuais por estado da fase (discutir, planejar, executar, verificar) disparam o comando `/gsd-*` certo no terminal
- [ ] Terminal real embutido no drawer direito, com camada de atalhos GSD (paleta/botões de comandos `/gsd-*`)

### Out of Scope

- Uso remoto/multi-usuário (servidor compartilhado, colaboração) — v1 é app local e single-user
- Edição direta dos artefatos `.planning/` pela UI — o GSD é a fonte de escrita; o board lê e espelha, evitando divergência de estado
- Suporte a outros runtimes de agente (Codex, Gemini CLI, OpenCode...) — foco em Claude CLI primeiro; arquitetura pode prever, mas não implementa
- Versão web/hospedada — decisão por app desktop com PTY e filesystem nativos

## Context

- O gsd-core (github.com/open-gsd/gsd-core) documenta os artefatos de planejamento em `.planning/` — PROJECT.md, config.json, REQUIREMENTS.md, ROADMAP.md, STATE.md, research/, diretórios de fase com PLAN.md/SUMMARY.md/VERIFICATION.md etc. Referência principal: `docs/pt-BR/reference/planning-artifacts.md` (branch `next`)
- O board deriva cards, hierarquia e status do parsing desses arquivos markdown; o parser precisa acompanhar o formato do gsd-core e ser resiliente a variações
- Comportamento de sessões inspirado no Claude Code: sessões persistentes por diretório, terminais vivos em paralelo, restauração ao reabrir o programa
- O Claude CLI registra conversas por diretório localmente (base do `claude --resume`) — o app se apoia nisso para listar e restaurar sessões
- Autor desenvolve em Windows 11; o app deve funcionar bem em Windows desde o início e ser multiplataforma (comunidade)

## Constraints

- **Plataforma**: App desktop (Electron ou Tauri — pesquisa decide) — requer PTY embutido, acesso a filesystem e file watching nativos
- **Dependências**: Claude CLI e gsd-core instalados pelo usuário — o app orquestra as ferramentas, não as substitui nem embute
- **Compatibilidade**: Formato dos artefatos segue o gsd-core (branch `next`); mudanças de formato upstream não podem quebrar o board silenciosamente
- **Distribuição**: Open-source para a comunidade GSD — i18n pt-BR/en e instalador multiplataforma no horizonte da v1+

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| App desktop (Electron/Tauri) | Terminal PTY embutido, filesystem e file watching nativos; experiência integrada | — Pending |
| Cards hierárquicos (fase → planos/tarefas) | Visão macro com drill-down; espelha a estrutura natural do GSD | — Pending |
| Sidebar = sessões do Claude CLI | Modelo mental do Claude Code; sessão é a unidade de trabalho do usuário | — Pending |
| Cada sessão com terminal próprio, todos vivos em paralelo | Navegar sem perder contexto; persistência/restauração via `claude --resume` | — Pending |
| Cards interativos disparam `/gsd-*` no terminal | A UI guia o fluxo GSD sem esconder o CLI | — Pending |
| Board é read-only sobre `.planning/` (só o GSD escreve) | Evita divergência de estado; GSD permanece a fonte da verdade | — Pending |
| v1 = board fiel + sessões/terminal sólidos | Valor central primeiro; atalhos avançados e polimento vêm depois | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-22 after initialization*
