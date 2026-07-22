# Feature Research

**Domain:** App desktop de orquestração de agentes de IA em CLI (terminal-manager + board de pipeline) — nicho: GUI para Claude CLI + gsd-core
**Researched:** 2026-07-22
**Confidence:** MEDIUM (achados cross-checados entre 5+ produtos concorrentes; nenhuma fonte única tratada como definitiva — ver metodologia em Sources)

## Feature Landscape

O nicho "terminal-manager + orquestração de agentes de IA" já tem categoria estabelecida em 2026: Conductor (Melty Labs), Crystal/Nimbalyst (Stravu), o próprio Claude Code Desktop oficial da Anthropic (redesenhado em abril/2026 em torno de sessões paralelas), Warp (terminal com notificações de agente) e uma leva de "kanban para agentes" (Agent Kanban, Kanboard, AI Agent Board, KaibanJS/Kaiban Board). Nenhum desses, porém, é *GSD-aware*: nenhum lê `.planning/` como fonte de verdade nem modela fases com o vocabulário de status do gsd-core (pending → discussed → planned → executing → verified → complete). Isso é o espaço em branco que o GSD Cards ocupa — a maioria dos concorrentes resolve "gerenciar sessões de agente" bem, mas nenhum resolve "espelhar fielmente o estado de um projeto GSD".

### Table Stakes (Users Expect These)

Funcionalidades que qualquer usuário vindo do Crystal, Conductor, Claude Code Desktop ou Warp vai assumir que existem. Faltar = produto parece quebrado ou amador.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Lista de projetos recentes na tela inicial | Todo IDE/terminal-manager (Crystal, Conductor, VS Code, Cursor) abre numa lista de workspaces recentes, não numa tela em branco | LOW | Persistir caminho + timestamp de último acesso; ordenar por recência |
| Seletor de diretório para abrir projeto existente com `.planning/` | É a operação primária do app; sem isso não há como começar a usar | LOW | Validar presença de `.planning/PROJECT.md` antes de aceitar como "projeto GSD" |
| Múltiplos projetos abertos/gerenciáveis ao mesmo tempo (não só 1 workspace) | Conductor e Crystal já assumem múltiplos workspaces simultâneos como padrão | MEDIUM | Cada projeto = seu próprio conjunto de sessões e board |
| Lista de sessões por projeto (sidebar) | Padrão consolidado em Crystal e Conductor (sidebar com sessões nomeadas) e no próprio Claude Code Desktop redesenhado (sidebar manager, filtro por status/repo) | LOW | Base do modelo mental "sessão é a unidade de trabalho" |
| Criar nova sessão a partir da sidebar | Ação primária em todos os concorrentes analisados | LOW | — |
| Múltiplas sessões vivas em paralelo sem fechar ao trocar de aba | Conductor e Crystal rodam múltiplas instâncias simultâneas por design; é o motivo de existirem | MEDIUM-HIGH | Requer PTYs persistentes em background, não apenas troca de foco de UI |
| Persistência de sessão entre reaberturas do app ("Session Persistence — Resume conversations anytime") | Crystal anuncia isso como feature headline; usuário de Claude Code já espera `--resume` funcionar | MEDIUM-HIGH | Ver nota de diferenciação abaixo — persistir *conversa* é table stakes; persistir *terminal PTY vivo* é mais raro |
| Renomear e arquivar/excluir sessões | Gerenciamento básico de lista esperado em qualquer app de sessões (Crystal expõe isso) | LOW | — |
| Terminal embutido com scrollback, busca, copiar/colar, links clicáveis | Funcionalidade mínima de qualquer emulador de terminal moderno (Warp, iTerm2, VS Code integrated terminal) | MEDIUM | Base: xterm.js + addons (search, web-links, fit) |
| Notificação quando o agente termina ou precisa de input | Warp trata isso como feature headline ("Agent Notifications" com badge em aba + alerta nativo do SO); Crystal também lista "Notifications — Desktop alerts when sessions need input" | MEDIUM | Requer heurística de parsing do output do PTY (prompt de confirmação, fim de resposta) |
| Quadro kanban com colunas por status | É a categoria de produto ("kanban para agentes": Agent Kanban, Kanboard, AI Agent Board todos têm isso) | MEDIUM | Colunas devem mapear aos status reais do gsd-core (ver Grounding abaixo), não a um kanban genérico "To Do/Doing/Done" |
| Indicador de progresso (barra/%, X de Y fases ou planos) | STATE.md do gsd-core já carrega `progress.percent`, `total_phases/completed_phases`; qualquer board decente expõe isso | LOW | Ler direto do frontmatter YAML de STATE.md |
| Paleta de comandos / atalhos (Cmd+K estilo) | Padrão consolidado em VS Code, Warp, Raycast, Linear — usuários de ferramentas dev esperam isso em 2026 | MEDIUM | Pode compor com ações contextuais do board |
| Detecção de que Claude CLI está instalado e acessível no PATH | Sem isso o app não funciona; onboarding mínimo em qualquer ferramenta que envolva CLI externo | LOW | `claude --version` ou checagem de binário; falha clara com instrução de instalação |
| Onboarding guiado para criar o primeiro projeto | Requisito explícito do produto (Active requirements); padrão em apps que envolvem fluxo de setup não trivial | MEDIUM | Conduzir `/gsd-new-project` dentro de uma sessão do próprio app, não fora dele |

### Differentiators (Competitive Advantage)

Funcionalidades que separam o GSD Cards da categoria genérica "gerenciador de sessões de agente de IA". Devem se alinhar ao Core Value do PROJECT.md: *"o board é um espelho confiável do `.planning/`"*.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Board hierárquico fase → planos → tarefas (drill-down) | Nenhum concorrente pesquisado modela hierarquia de 3 níveis derivada de artefatos reais de um metodologia de planejamento; Agent Kanban/Kanboard/AI Agent Board modelam "tarefas" avulsas, não fases com múltiplos planos e sub-tarefas rastreáveis | HIGH | Card de fase expande em cards de plano (`XX-YY-PLAN.md`), que por sua vez listam tarefas com tipo e critério de sucesso |
| Atualização em tempo real via *file watching* do `.planning/` (não via API/backend próprio) | Diferencia de Agent Kanban/AI Agent Board, que usam SSE de um backend que eles próprios controlam; aqui a fonte da verdade é markdown escrito por um CLI externo — sincronizar sem polling ingênuo é o desafio real | HIGH | Requer parser resiliente a variações de formato (ver Constraint do PROJECT.md sobre não quebrar silenciosamente) |
| Ações contextuais por card que disparam o comando `/gsd-*` certo na sessão certa | Nenhum concorrente compõe uma paleta de comandos ciente da máquina de estados de um workflow externo (discutir → planejar → executar → verificar); Conductor tem slash commands genéricos no chat, não amarrados a um status de domínio | MEDIUM-HIGH | Card na coluna "pending" oferece "Discutir"; em "discussed" oferece "Planejar"; em "planned" oferece "Executar"; em "executing" oferece acompanhar; em "complete" oferece "Transição/Próxima fase" |
| Visualizador de detalhe/diff de artefato (abrir PLAN.md, SUMMARY.md, VERIFICATION.md renderizado a partir do card) | Vai além do "ver progresso" — permite auditar o que o agente decidiu sem sair do app nem abrir editor externo | MEDIUM | Renderização markdown read-only; reforça o princípio "board não edita, só espelha" |
| Indicador de saúde do projeto na lista de projetos (fase atual, % completo, última atividade, bloqueios pendentes) | Nenhum concorrente pesquisado mostra "saúde de projeto" cruzando dados estruturados (STATE.md) na tela de seleção de projetos — eles mostram só nome/branch | MEDIUM | Ler `Blockers/Concerns` e `Pending Todos` de STATE.md para badge de atenção |
| Restauração completa de sessões vivas ao reabrir o app (não só histórico de conversa, o terminal reconectado via `claude --resume`) | A maioria dos concorrentes ("Session Persistence") restaura o *histórico*; restaurar o PTY/terminal como se nunca tivesse fechado, amarrado ao card de fase correspondente, é mais raro e é decisão explícita do produto | HIGH | Depende de sessão management (ver dependências) |
| i18n pt-BR nativo para o fluxo GSD | Nenhum dos concorrentes analisados (Conductor, Crystal, Warp, Claude Code Desktop) oferece pt-BR; é aposta deliberada de comunidade | LOW-MEDIUM | Public de nicho, mas baixo custo de implementação se a UI for desenhada com i18n desde o início |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Drag-and-drop para mudar status de card no board (mover fase entre colunas manualmente) | Todo kanban "de verdade" tem drag-and-drop (é o que Kanboard, AI Agent Board, Trello fazem) | Contradiz a decisão explícita do PROJECT.md: "Board é read-only sobre `.planning/`" — mover um card manualmente criaria estado divergente do que o gsd-core realmente processou (arquivos não escritos, fase não de fato planejada/executada) | Card mostra estado real; se usuário quer avançar, o botão de ação contextual dispara o comando `/gsd-*` real, que é quem de fato muda o status ao escrever o artefato |
| Edição direta de PLAN.md/STATE.md/ROADMAP.md pela UI (formulários, campos editáveis) | Parece conveniente — "por que preciso ir no CLI para corrigir um typo?" | Já listado como Out of Scope no PROJECT.md; cria duas fontes de verdade e risco de o parser do app e o gsd-core discordarem sobre o schema | UI oferece "copiar comando para editar" ou abre o arquivo no editor padrão do SO; escrita continua sendo tarefa do GSD/CLI |
| Auto-instalação/auto-atualização silenciosa do Claude CLI ou do gsd-core pelo app | Reduz fricção de onboarding — "clique aqui e eu instalo pra você" | Contradiz a constraint "app orquestra as ferramentas, não as substitui nem embute"; instalar binários de terceiros silenciosamente é superfície de risco de segurança e de suporte (versões incompatíveis) | Detectar ausência/versão, mostrar instrução copiável (`npm install -g...` ou link) e deixar o usuário instalar via canal oficial |
| Isolamento automático de sessão via git worktree por sessão (padrão Conductor/Crystal) | É a killer feature dos dois concorrentes mais próximos, parece óbvio herdar | GSD já organiza trabalho por fase/plano dentro de um único diretório de trabalho; sessões aqui mapeiam a fases GSD, não a branches paralelas de experimentação — misturar os dois modelos mentais (fase vs. branch) infla complexidade sem servir ao Core Value | Se o usuário quiser trabalho paralelo em branches, ele mesmo abre múltiplos clones/worktrees como projetos separados no app (já suportado por "múltiplos projetos") |
| Suporte simultâneo a Codex, Gemini CLI, OpenCode etc. na v1 | Amplia mercado imediatamente e parece "mais completo" | Explicitamente Out of Scope no PROJECT.md; cada runtime tem formato de sessão e protocolo de resume diferentes — tentar abstrair isso na v1 atrasa o board fiel, que é o valor central | Arquitetura pode prever um adapter de "agent runtime", mas só implementar o adapter Claude CLI na v1 |
| Chat/UI de conversa próprio sobre o terminal (bolhas de mensagem, markdown renderizado por cima do PTY, à la interface do Claude Code Desktop oficial) | Parece "mais bonito" que um terminal cru | Contradiz a decisão "a UI guia o fluxo GSD sem esconder o CLI" — duplicar a interface de chat do próprio Claude Code é reinventar um produto que a Anthropic já mantém, e quebra sempre que o formato de output do CLI mudar | Terminal real (xterm.js) como fonte única de interação; camada de atalhos/paleta é *ao lado* do terminal, não uma reimplementação dele |
| Versão web/hospedada ou colaboração multi-usuário em tempo real na v1 | Aumentaria alcance e permitiria "compartilhar board com o time" | Explicitamente Out of Scope; exigiria servidor, autenticação multi-usuário e sincronização de PTYs remotos — nenhum dos concorrentes locais (Conductor, Crystal) resolve isso, e é uma categoria de produto totalmente diferente (mais perto de Devin/Jules hospedados) | v1 fica local single-user; se a demanda aparecer, é uma decisão de milestone futura, não де v1 |

## Feature Dependencies

```
[Detectar Claude CLI instalado]
    └──requires──> [Onboarding guiado de primeiro projeto]

[Lista/seletor de projetos recentes]
    └──requires──> [Detectar .planning/ válido no diretório]

[Board hierárquico fase → plano → tarefa]
    └──requires──> [Parser de artefatos .planning/ (ROADMAP.md, STATE.md, PLAN.md, SUMMARY.md)]
                       └──requires──> [File watching em tempo real]

[Ações contextuais no card (Discutir/Planejar/Executar/Verificar)]
    └──requires──> [Sessão ativa/selecionável para receber o comando]
                       └──requires──> [Gerenciamento de sessões (lista, criar)]

[Restauração de sessão viva ao reabrir o app]
    └──requires──> [Gerenciamento de sessões]
    └──requires──> [claude --resume funcionando por diretório]

[Notificação de "agente precisa de input" / "agente terminou"]
    └──requires──> [Terminal embutido com parsing de output do PTY]

[Visualizador de diff/detalhe de artefato]
    └──enhances──> [Board hierárquico] (não é pré-requisito, mas eleva o valor do drill-down)

[Paleta de comandos global (Cmd+K)]
    └──enhances──> [Ações contextuais do card] (mesma composição de comandos, atalho de acesso diferente)

[Drag-and-drop para mudar status] ──conflicts──> [Board read-only / fonte única de verdade no gsd-core]
[Edição direta de artefatos pela UI] ──conflicts──> [Board read-only / fonte única de verdade no gsd-core]
```

### Dependency Notes

- **Board hierárquico requer parser + file watching:** sem um parser resiliente ao formato do gsd-core (ROADMAP.md com fases/planos, STATE.md com frontmatter YAML de progresso, PLAN.md/SUMMARY.md por plano) o board não tem dado — este é o dependency mais crítico do produto e deve ser a primeira fase técnica.
- **Ações contextuais requerem sessão ativa:** um botão "Executar fase 3" só faz sentido se existir (ou puder ser criada na hora) uma sessão de terminal para receber o comando `/gsd-execute-phase 3`. Isso amarra o board à camada de sessões — não dá para entregar cards "clicáveis" antes de ter gerenciamento de sessão funcional.
- **Restauração de sessão viva requer gerenciamento de sessões básico primeiro:** listar/criar sessões é pré-requisito; persistir e "reconectar" o PTY ao reabrir é uma capacidade adicional em cima disso, não algo que se constrói do zero.
- **Drag-and-drop e edição direta conflitam com o princípio de read-only:** qualquer feature que permita ao usuário alterar status de card ou conteúdo de artefato pela UI sem passar pelo gsd-core quebra a garantia central do Core Value ("board é um espelho confiável"). Essas duas features devem ficar permanentemente fora do roadmap, não apenas adiadas.

## MVP Definition

### Launch With (v1)

Já definido como Active Requirements no PROJECT.md — mapeado aqui à categorização de features:

- [ ] Tela principal com projetos recentes + abrir diretório com `.planning/` existente — *table stakes*
- [ ] Fluxo guiado de criação de projeto (`/gsd-new-project` numa sessão do app) — *table stakes*
- [ ] Sidebar de sessões por projeto, com criação de novas sessões — *table stakes*
- [ ] Sessões paralelas vivas, navegação sem fechar terminais — *table stakes*
- [ ] Persistência e restauração de sessões via `claude --resume` ao reabrir o app — *differentiator (versão completa: PTY reconectado, não só histórico)*
- [ ] Board kanban hierárquico (fase → planos/tarefas) em colunas de status — *differentiator central*
- [ ] Atualização em tempo real do board via escrita de artefatos — *differentiator central*
- [ ] Cards interativos com ações contextuais (`/gsd-*` no terminal certo) — *differentiator*
- [ ] Terminal embutido no drawer + camada de atalhos/paleta de comandos GSD — *table stakes (terminal) + differentiator (paleta ciente de status)*

### Add After Validation (v1.x)

- [ ] Busca no scrollback do terminal — *trigger: usuários reclamando de não achar output antigo*
- [ ] Notificações (badge/som/alerta do SO) quando sessão termina ou precisa de input — *trigger: usuário perde acompanhamento com várias sessões em paralelo*
- [ ] Renomear/arquivar sessões — *trigger: lista de sessões cresce e fica difícil de navegar*
- [ ] Paleta de comandos global (Cmd+K) além dos botões de card — *trigger: usuários avançados pedindo atalho de teclado*
- [ ] Visualizador de diff/detalhe renderizado de PLAN.md/SUMMARY.md/VERIFICATION.md a partir do card — *trigger: usuário quer auditar decisão sem abrir editor*
- [ ] Badge de saúde de projeto na lista (bloqueios pendentes, última atividade) — *trigger: usuário gerencia 3+ projetos simultâneos*

### Future Consideration (v2+)

- [ ] Suporte a outros runtimes de agente (Codex, Gemini CLI, OpenCode) — *deferir: exige abstração de protocolo de sessão/resume por runtime, e a v1 precisa provar o modelo com Claude CLI primeiro*
- [ ] Isolamento por git worktree por sessão — *deferir: modelo mental concorrente ao de "sessão = fase GSD"; avaliar demanda real antes de importar a feature do Conductor/Crystal*
- [ ] Uso remoto/multi-usuário — *deferir: categoria de produto diferente, exige servidor e auth*
- [ ] Dashboard cross-projeto (métricas de velocidade agregadas entre projetos, usando Performance Metrics de cada STATE.md) — *deferir até existir base de usuários com múltiplos projetos ativos simultaneamente*

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Parser resiliente de `.planning/` + file watching | HIGH | HIGH | P1 |
| Board hierárquico fase→plano→tarefa | HIGH | HIGH | P1 |
| Gerenciamento de sessões (lista/criar) | HIGH | MEDIUM | P1 |
| Sessões paralelas vivas em background | HIGH | HIGH | P1 |
| Ações contextuais nos cards (`/gsd-*`) | HIGH | MEDIUM | P1 |
| Terminal embutido (scrollback/busca/copiar) | HIGH | MEDIUM | P1 |
| Detecção de Claude CLI/gsd-core no onboarding | HIGH | LOW | P1 |
| Restauração de sessão viva (`--resume`) ao reabrir | HIGH | HIGH | P1 |
| Notificações de agente (finalizou/precisa input) | MEDIUM | MEDIUM | P2 |
| Visualizador de diff/detalhe de artefato | MEDIUM | MEDIUM | P2 |
| Renomear/arquivar sessões | MEDIUM | LOW | P2 |
| Badge de saúde de projeto na lista | MEDIUM | LOW | P2 |
| Paleta de comandos global (Cmd+K) | MEDIUM | MEDIUM | P2 |
| Suporte multi-runtime (Codex/Gemini/OpenCode) | MEDIUM | HIGH | P3 |
| Isolamento por git worktree | LOW-MEDIUM | HIGH | P3 |
| Dashboard cross-projeto | LOW-MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Conductor | Crystal / Nimbalyst | Claude Code Desktop (oficial) | Warp | Kanban-para-agentes (Agent Kanban/Kanboard) | Nossa abordagem (GSD Cards) |
|---------|-----------|----------------------|--------------------------------|------|-----------------------------------------------|------------------------------|
| Sessões/agentes paralelos | Sim, por worktree isolado | Sim, por worktree isolado | Sim, sidebar multi-sessão com filtro por status/repo | N/A (terminal, não orquestrador de agente) | Sim, tarefas paralelas via MCP/worker | Sim, mas amarradas a fases GSD de um único projeto, sem worktree obrigatório |
| Fonte de verdade do estado | Estado interno do app (workspaces nomeados) | Estado interno do app (sessões + worktrees) | Estado interno do produto Anthropic | N/A | Board próprio (backend do produto) | `.planning/` do gsd-core — o app não é dono do estado, só espelha |
| Board kanban | Não (chat + diff + terminal) | Não (lista de sessões) | Não | Não | Sim, genérico (tarefas avulsas) | Sim, hierárquico e ciente do vocabulário de status do gsd-core |
| Ações que escrevem/avançam estado pela UI | Sim (chat dispara ações do agente) | Sim (chat) | Sim (chat/cowork/code) | N/A | Sim, drag-and-drop move tarefa entre colunas | Não via drag-and-drop — só via comando `/gsd-*` real disparado no terminal |
| Notificações de agente | Não destacado nas fontes | Sim (desktop alerts) | Não detalhado nas fontes | Sim, feature headline (badge + alerta nativo) | Não é foco (produto server-side) | Planejado para v1.x, inspirado no padrão Warp/Crystal |
| Restauração completa de terminal ao reabrir | Parcial (reabre workspace) | Sim, "resume conversations anytime" | Sim, redesenho 2026 preserva sessões | N/A | N/A | Sim — objetivo explícito via `claude --resume` reconectado ao card de fase |
| Multi-runtime de agente | Sim (Claude Code, Codex, Cursor) | Sim (Codex e Claude Code) | Só Claude | N/A | Sim (Copilot, Codex, Claude, OpenCode) | Não na v1 (só Claude CLI); arquitetura pode prever adapter futuro |

## Sources

- [Conductor — Run parallel coding agents on your Mac](https://www.conductor.build/) — MEDIUM (cross-checado com Medium/ChatGate/Ry Walker sobre o mesmo produto)
- [Scaling the Loop: Run 5 Claude Code Sessions in Parallel with conductor.build (Medium)](https://georgetaskos.medium.com/scaling-the-loop-run-5-claude-code-sessions-in-parallel-with-conductor-build-539b52888a81) — MEDIUM
- [GitHub — stravu/crystal (Crystal is now Nimbalyst)](https://github.com/stravu/crystal) — MEDIUM (fonte primária do próprio projeto)
- [Nimbalyst — Crystal: Supercharge Your Development with Multi-Session Claude Code Management](https://nimbalyst.com/blog/crystal-supercharge-your-development-with-multi-session-claude-code-management) — MEDIUM
- [MacRumors — Anthropic Rebuilds Claude Code Desktop App Around Parallel Sessions (abr/2026)](https://www.macrumors.com/2026/04/15/anthropic-rebuilds-claude-code-desktop-app/) — MEDIUM
- [AI.cc — Claude Code Desktop Redesign: Multi-Session + Routines](https://www.ai.cc/blogs/claude-code-desktop-redesign-2026-multi-session-routines-automation/) — MEDIUM
- [9to5Mac — Anthropic highlights Claude Code's in-app browser on desktop (jul/2026)](https://9to5mac.com/2026/07/10/anthropic-highlights-claude-codes-in-app-browser-on-the-desktop/) — LOW (fonte única não cruzada para esse detalhe específico)
- [Warp Docs — Desktop Notifications](https://docs.warp.dev/terminal/more-features/notifications/) — MEDIUM (documentação oficial, cruzada com issue do GitHub)
- [Warp Docs — Agent Notifications](https://docs.warp.dev/agent-platform/capabilities/agent-notifications/) — MEDIUM
- [GitHub — warpdotdev/warp issue #8851 (badge de notificação em aba)](https://github.com/warpdotdev/warp/issues/8851) — LOW
- [SpecStory — Features](https://docs.specstory.com/specstory/features) — LOW (fonte única, produto adjacente de captura de histórico, não de orquestração de sessão)
- [GitHub — Agent Kanban / kanaiban-ai/kaiban-board / DanWahlin/ai-agent-board / kanboard.io](https://agent-kanban.dev/) — MEDIUM (múltiplos projetos independentes convergindo no mesmo padrão de kanban-para-agente)
- **Grounding local (não é achado de busca, é leitura direta dos artefatos do projeto):**
  - `C:\Users\user\.claude\gsd-core\templates\ROADMAP.md` — estrutura de fases/planos, numeração inteira vs. decimal, tabela de Progress com status `Not started/In progress/Complete/Deferred`
  - `C:\Users\user\.claude\gsd-core\templates\STATE.md` — frontmatter YAML com `progress.percent/total_phases/completed_phases`, seções de Blockers/Concerns e Pending Todos que alimentam o badge de saúde de projeto
  - `C:\Users\user\.claude\gsd-core\references\artifact-types.md` — taxonomia completa de artefatos (ROADMAP.md, STATE.md, CONTEXT.md, PLAN.md, SUMMARY.md, HANDOFF.json) e seus consumidores, base para o parser do board
  - `C:\Users\user\.claude\gsd-core\references\gates.md` — taxonomia de gates (pre-flight/revision/escalation/abort) que explica por que certas transições de fase não podem ser simuladas por drag-and-drop na UI
  - `C:\dev\gsd-cards\.planning\PROJECT.md` — requisitos ativos, decisões-chave e escopo explícito (out of scope) usados para classificar table stakes vs. anti-features

---
*Feature research for: terminal-manager / AI-agent-orchestration GUI (GSD Cards)*
*Researched: 2026-07-22*
