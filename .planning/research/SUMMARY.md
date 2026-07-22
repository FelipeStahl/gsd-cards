# Project Research Summary

**Project:** GSD Cards (Orquestrador de Claude CLI + gsd-core)
**Domain:** App desktop para gerenciamento de sessões de agentes de IA com kanban em tempo real
**Researched:** 2026-07-22
**Confidence:** MEDIUM (STACK e ARCHITECTURE possuem confiança MEDIUM-HIGH individualmente; conflito de decisão entre eles reduz confiança geral)

## Executive Summary

GSD Cards é um app desktop que orquestra o Claude CLI + gsd-core, expondo um kanban hierárquico que reflete fielmente o estado do `.planning/` de um projeto. A pesquisa converge em torno de um modelo arquitetônico robusto — terminal PTY embarcado + file watching debounced + parser resiliente de artefatos markdown — mas **apresenta uma decisão crítica em aberto sobre plataforma**: a pesquisa de Stack recomenda **Tauri v2** (portable-pty nativo, footprint reduzido para múltiplos terminais), enquanto a pesquisa de Architecture recomenda **Electron** (node-pty + chokidar como ecossistema maduro, velocidade de time JS/TS). Ambas as recomendações são tecnicamente defensáveis para este domínio específico. Os achados convergem em padrões arquitetônicos que funcionam independentemente da plataforma: serialização de buffer para terminais em background (evita limite de contextos WebGL), IPC de duas velocidades (planning state vs. terminal data), restauração lazy de sessões.

Os riscos críticos são bem-documentados: zombie processes do PTY (exige tree-kill explícito no Windows), ilusão de sessão "restaurada" (recupera histórico, não continuidade de processo), event storms do file watcher durante commits do GSD (exige debouncing agressivo e watching escopado), fragilidade do parser contra evolução de formato do gsd-core (exige fixtures versionadas e degradação graciosa). Cada um desses pitfalls é endereçável, mas nenhum é trivial — a ordem de fases deve priorizá-los desde a fundação.

O MVP é viável: sessões paralelas, board hierárquico de fases→planos, terminal embutido com ações contextuais que disparam `/gsd-*` no terminal certo. Diferenciais competitivos (nenhum concorrente é GSD-aware) justificam o investimento em parser e sync em tempo real.

## Key Findings

### Stack Recomendado (com decisão aberta)

**Tauri v2 (recomendado em STACK.md):**
- Múltiplos terminais PTY em background penalizam Electron (~150-300MB ociosos por processo); Tauri usa WebView2 nativo (~30-60MB)
- portable-pty (Rust): Suporte nativo a ConPTY no Windows, sem rebuild ABI de node-gyp
- Precedente em ferramentas terminal-para-agentes (wezterm, similar products)
- Desvantagem: Exige toolchain Rust; mitigado mantendo superfície Rust pequena (PTY spawning, file watching) e lógica em TypeScript/React

**Electron (recomendado em ARCHITECTURE.md):**
- node-pty 1.1.0 + chokidar 5.0.0 são módulos Node maduros (VS Code, Hyper usam o mesmo par)
- Time GSD é majoritariamente JS/TS; não exige onboarding de Rust
- Electron ecosystem (electron-builder, @electron/rebuild) é robusto para distribuição cross-platform
- Desvantagem: Instalador maior, mais RAM ociosa com múltiplos terminais, rebuild a cada bump de Electron

**Recomendação:** Decisão aberta antes de Phase 1. Ambas são tecnicamente defensáveis. Escolha depende de: (1) preferência de team (JS-only vs. JS+Rust), (2) constraints de distribuição, (3) risk tolerance com rebuild de módulo nativo.

**Elementos convergentes:** React 19.2.8 + Vite 8.1.5, TypeScript 7.0.x, xterm.js 6.0.0 com addon-serialize, zustand 5.0.14, gray-matter + unified/remark, i18next, debouncer para file watching.

### Features Esperadas

Landscape de 5+ concorrentes (Conductor, Crystal, Claude Code Desktop, Warp, AI Agent Board) analisado. **GSD Cards diferencia-se por ser GSD-aware**: nenhum lê `.planning/` como fonte de verdade nem modela status com vocabulário de fases do gsd-core.

**Table Stakes:** Projetos recentes, seletor de diretório, múltiplos projetos, sidebar com sessões, criar sessões, múltiplas sessões vivas em paralelo, terminal com scrollback/busca, persistência via `claude --resume`, board kanban com status, progresso, paleta de comandos.

**Differentiators:** Board hierárquico fase→planos→tarefas (3 níveis derivados de artefatos reais), atualização em tempo real via file watching, ações contextuais por status, visualizador de artefato renderizado, indicador de saúde de projeto, restauração completa de PTY, i18n pt-BR nativo.

**Anti-Features (out of scope v1):** Drag-and-drop para mudar status (contradiz read-only), edição direta de artefatos, auto-instalação do Claude CLI, worktree isolation, multi-runtime (cada runtime tem formato diferente).

### Abordagem Arquitetônica

Dois padrões convergem independentemente de Tauri/Electron:

1. **Two-speed IPC:** Canal baixa frequência `planning:state-updated` (snapshots) e canal alta frequência `terminal:data` (bytes brutos).
2. **Read-only mirror:** BoardStore é downstream puro; nenhuma ação escreve em `.planning/` — toda ação injeta comando `/gsd-*` que realimenta o watcher.

**Componentes:** ProjectManager (registro), PlanningWatcher (observar `.planning/`), PlanningParser (parse resiliente), BoardStore (estado reativo), SessionManager (ciclo de vida de sessões), PtyHost (spawn/kill/tree-kill), AppStateStore (persistência local).

### Pitfalls Críticos

1. **Zombie processes do PTY** — PID rastreamento central, tree-kill no Windows, handlers `before-quit`/`will-quit`. Phase: fundação sessões/PTY.

2. **Ilusão de "sessão restaurada"** — `claude --resume` recupera histórico, não processo vivo. Mitigação: modelar histórico persistente + processo efêmero; comunicar visualmente. Phase: sessões/restauração.

3. **node-pty rebuild hell (Electron only)** — ABI mismatch, ConPTY bugs Windows. Exige `@electron/rebuild` no CI, `asarUnpack`, teste do instalador real. Phase: fundação terminal.

4. **Event storm do file watcher** — `/gsd-execute-phase` escreve múltiplos arquivos; watcher ingênuo causa rajada → board pisca, parse truncado. Mitigação: watcher escopado a `.planning/`, debounce 150–300ms, parse resiliente. Phase: sincronização board↔`.planning/`.

5. **Parser frágil vs. evolução gsd-core** — Mudança de formato quebra silenciosamente. Mitigação: fixtures versionadas em CI, fallback explícito, degradação graciosa. Phase: definição parser.

6. **Injetar comandos sem detecção de estado** — Card dispara comando mas Claude está ocupado/aguardando. Mitigação: detectar estabilidade, reconhecer prompt, focar terminal e ecoar. Phase: cards interativos.

## Implications for Roadmap

| Phase | Name | Rationale | Delivers |
|-------|------|-----------|----------|
| 1 | Fundação (Framework + Parser) | Tauri/Electron bloqueia tudo. Parser é core value. | Framework setup (decisão executiva), ProjectManager, PlanningParser com fixtures, BoardStore read-only |
| 2 | Sessões + PTY Fundação | Sessões/PTY fundamentam diferencial (múltiplos terminais). | SessionManager, PtyHost, cleanup handlers, testes zombie processes |
| 3 | Terminal Embutido + IPC Alta Freq. | Integrar xterm.js após PTY robusto. | Drawer com xterm.js, addon-serialize, scrollback com limite |
| 4 | Sincronização Board ↔ `.planning/` | Board atualiza em tempo real via file watching. | PlanningWatcher robusto, reconciliação incremental, teste com projeto real |
| 5 | Cards Interativos + Injeção Comando | Board atualiza; cards disparam `/gsd-*`. | Botões contextuais, detecção de estado PTY, injeção segura, paleta |
| 6 | Onboarding + Persistência Sessão | UX primeiro-uso, restauração completa ao reabrir. | Fluxo onboarding, `/gsd-new-project`, persistência snapshot, restauração lazy |
| 7 | Notificações + Polimento | UX multi-sessão paralelas. | Notificações, badges, renomear/arquivar, busca, visualizador artefato |
| 8 | i18n Completo + Empacotamento | Suporte pt-BR, distribuição cross-platform. | i18n completo, build instalador, auto-updater, checksums |

**Phase Ordering Rationale:**
- Tauri/Electron decision bloqueia Phase 1
- Parser antes de UI interativa (é o core value)
- Sessões/PTY antes de terminal UI (fundamenta)
- Terminal UI antes de board reativo (precedência)
- Cards interativos depois de file watching sólido (evita instabilidade)
- Onboarding/persistência depois de core loop (polimentos)
- i18n último (não bloqueia)

**Research Flags:**

| Phase | Research Needed? | Why |
|-------|------------------|-----|
| 1 | **Sim, decisória** | Tauri vs. Electron — ambas viáveis, executivo decide |
| 1 | Sim | Formato exato ROADMAP/PLAN/STATE/SUMMARY do gsd-core |
| 2 | Sim | Format `.jsonl` sessão, descoberta session-id, validação `--resume` |
| 3 | Sim | xterm.js context limits, ConPTY Windows, node-pty rebuild (Electron) |
| 4 | Sim | Debounce window otimizado, multi-projeto strategy |
| 5 | Sim | Reverse-engineering prompt Claude CLI |
| 6 | Talvez | Latência restauração lazy — aceitável? |
| 7 | Não | Padrões estabelecidos em concorrentes |
| 8 | Não | Auto-update e cross-platform documentados oficialmente |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Ambas viáveis. Conflito reduz a MEDIUM-HIGH. Versões verificadas direto no registry. Trade-offs claros. |
| Features | MEDIUM | 5+ concorrentes bem documentados. Cross-checados. Grounding local reduz ambiguidade. |
| Architecture | MEDIUM | Padrões de mercado estabelecidos. Sessão Claude verificada contra docs oficiais + comportamento local. |
| Pitfalls | HIGH | GitHub issues como fontes primárias. Enraizados em comportamento documentado de bibliotecas. |

**Overall:** MEDIUM — Pesquisa fornece direção clara para roadmap. Ressalva: decisão Tauri vs. Electron deve sair de Phase 1 (executiva, não técnica).

### Gaps to Address

1. **Tauri vs. Electron:** Ambas viáveis. Executivo avalia preferência de team, constraints de distribuição, risk tolerance. Resolução antes de Phase 1 terminar.

2. **Evolução de gsd-core:** Parser contra templates atuais. Fixtures versionadas em CI, testes contra múltiplas versões, graceful degradation. Identifica-se Phase 1, valida-se Phase 4.

3. **ConPTY no Windows:** Comportamento variável entre versões. Teste em máquinas reais. Manifesta-se Phase 3, matriz CI em Windows real.

4. **Prompt do Claude CLI:** Detecção de idle crítica para Phase 5. Reverse-engineering necessário. Identifica-se Phase 2, testes contra CLI real.

5. **Scale multi-projeto:** Múltiplos projetos podem impactar CPU/memória. Baixa prioridade, validável empiricamente Phase 4.

6. **Assinatura de builds:** SmartScreen pode avisar sem certificado pago. Decisão: aceitar warning + docs claras ou Azure Trusted Signing. Non-blocking, resolve-se Phase 8.

## Sources

**Primary (HIGH confidence):**
- npm registry (registry.npmjs.org), 2026-07-22 — versões verificadas direto
- crates.io, 2026-07-22 — `portable-pty`, `notify`, `notify-debouncer-full`, `tauri`
- code.claude.com/docs/en/sessions — documentação oficial Anthropic + verificado contra `~/.claude/projects/` local
- gsd-core templates locais (`~/.claude/gsd-core/templates/`) — fonte primária lida direto
- GitHub issues: microsoft/node-pty, electron/electron, anthropics/claude-code, paulmillr/chokidar, xtermjs/xterm.js

**Secondary (MEDIUM confidence):**
- Web searches sobre Tauri vs. Electron 2026 — cross-checadas contra docs oficiais
- Análise de 5+ concorrentes (Conductor, Crystal, Claude Code Desktop, Warp, AI Agent Board)

**Tertiary (validation needed):**
- ConPTY no Windows 11 recente — comportamento pode variar por versão
- Prompt do Claude CLI — reverse-engineering necessário
- Latência de `claude --resume` em hardware limitado

---

**Pesquisa completada:** 2026-07-22
**Pronto para roadmap:** Sim, com decisão Tauri vs. Electron pendente da Phase 1
