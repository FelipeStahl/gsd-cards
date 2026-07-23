# Phase 2: Sessão viva - Research

**Researched:** 2026-07-23
**Domain:** PTY real embutido (Rust `portable-pty` + Tauri v2 Channels) + xterm.js 6 no React 19 + descoberta de sessões do Claude Code (`~/.claude/projects/`) — encerramento limpo de árvore de processos como critério de fundação
**Confidence:** MEDIUM-HIGH (encerramento de árvore de processos e formato de sessão do Claude Code: HIGH, verificados por leitura direta do ambiente real desta máquina, não só busca; API exata do `portable-pty`/`win32job`/Tauri Channel: MEDIUM, verificada via documentação oficial/READMEs cruzados, mas sem execução de código Rust nesta sessão de pesquisa — algumas assinaturas exatas de método precisam de confirmação durante a implementação, ver `## Assumptions Log`)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROJ-04 | App detecta Claude CLI e gsd-core instalados; quando ausentes, mostra instrução clara de instalação (sem auto-instalar) | `## Architecture Patterns` Pattern 5 (detecção de dependências); `## Common Pitfalls` #6 |
| SESS-01 | Usuário vê as sessões do Claude CLI do projeto selecionado na sidebar | `## Architecture Patterns` Pattern 4 (descoberta via `~/.claude/projects/`) + Pattern 6 (escopo de fs estreito) |
| SESS-02 | Usuário cria nova sessão pela sidebar (spawn do `claude` no diretório do projeto) | `## Architecture Patterns` Pattern 1 (spawn + streaming via Channel) |
| SESS-03 | Usuário navega entre sessões sem fechar nenhuma — terminais continuam vivos em background | `## Architecture Patterns` Pattern 3 (algoritmo de troca de foco xterm.js) |
| SESS-06 | Usuário arquiva/exclui sessões, com encerramento limpo da árvore de processos (sem zombie processes) | `## Architecture Patterns` Pattern 2 (Job Object/process group) — **critério de fundação, maior risco desta fase** |
| TERM-01 | Usuário interage com terminal real embutido no drawer direito rodando o `claude` interativo | `## Architecture Patterns` Pattern 1 + Pattern 3 |
| TERM-02 | Terminal tem scrollback com limite, copiar/colar e links clicáveis | `## Standard Stack` (achado: `@xterm/addon-web-links` ausente do `CLAUDE.md`, necessário para este requisito) |
| TERM-03 | Usuário busca texto no scrollback do terminal | `## Standard Stack` (`@xterm/addon-search`) + `## Code Examples` |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

`./.claude/CLAUDE.md` já trava a stack central desta fase como decisão de projeto — tratado com a mesma autoridade de uma decisão travada de `CONTEXT.md` (não há `CONTEXT.md` para esta fase; `/gsd-discuss-phase` não foi executado). Diretivas extraídas, relevantes à Fase 2:

| Diretiva | Fonte | Como esta pesquisa a respeita |
|---|---|---|
| Tauri v2 (não Electron) — gate já resolvido na Fase 1 | CLAUDE.md `## Technology Stack` | Toda a arquitetura abaixo assume Tauri v2; nenhuma alternativa Electron é reconsiderada |
| `portable-pty` 0.9.0 para PTY no Rust | CLAUDE.md, `STACK.md` | Usado como base de Pattern 1/2; versão reverificada nesta sessão (ver `## Standard Stack`) |
| `@xterm/*` (nunca os pacotes antigos sem escopo `xterm-addon-*`) | CLAUDE.md `## What NOT to Use` | Todas as recomendações usam exclusivamente o namespace `@xterm/*` |
| WebGL (`@xterm/addon-webgl`) **só no terminal em foco**; terminais em background usam renderer DOM padrão ou ficam desmontados com buffer congelado via `@xterm/addon-serialize` | CLAUDE.md `## What NOT to Use` + `## Stack Patterns by Variant` | Formalizado como o "algoritmo de troca de foco" no Pattern 3 — não é uma opção entre alternativas, é a instrução a implementar literalmente |
| `notify`/`notify-debouncer-full` já resolvido na Fase 1 — não há novo trabalho de watcher nesta fase | CLAUDE.md, `01-RESEARCH.md` | Fora de escopo desta pesquisa |
| Board é read-only; nenhuma escrita em `.planning/` pela UI | CLAUDE.md `## What NOT to Use` | Não se aplica diretamente a esta fase (sessões vivem em `~/.claude/projects/`, um namespace de filesystem diferente de `.planning/`), mas o princípio geral de "nunca escrever num filesystem que pertence a outra ferramenta sem necessidade explícita" é estendido a esse namespace também — ver `## Common Pitfalls` #5 |
| GSD Workflow Enforcement — mudanças de arquivo só via `/gsd-*` | CLAUDE.md `## GSD Workflow Enforcement` | Processual, não afeta o conteúdo técnico desta pesquisa |

**Achado que exige atenção do planner:** a tabela de "Supporting Libraries" do `CLAUDE.md`/`STACK.md` **não lista `@xterm/addon-web-links`**, mas TERM-02 exige "links clicáveis" — xterm.js não detecta/hyperlinka URLs no core, isso é exclusivamente responsabilidade desse addon separado. Esta pesquisa adiciona `@xterm/addon-web-links@0.12.0` [VERIFIED: npm registry, `npm view` 2026-07-23] à Standard Stack como uma correção necessária, não uma alternativa — sem ele, TERM-02 é literalmente não implementável. Da mesma forma, `win32job` (crate Rust) e `which` (crate Rust) são adições novas, não previstas no `CLAUDE.md`/`STACK.md` original, justificadas pelo achado de Pattern 2/Pattern 5 abaixo.

## Summary

O risco central desta fase — explicitamente sinalizado no `ROADMAP.md`/`STATE.md` como "critério de fundação" — é o encerramento limpo da árvore de processos (SESS-06). A pesquisa confirma que **nem `portable-pty` sozinho nem `Child::kill()` resolvem isso**: no Windows, matar só o processo `claude.exe` direto não mata subprocessos que ele mesmo spawna (ex.: `git`, ferramentas MCP, processos do gsd-core); no Unix, o mesmo problema existe se algum descendente escapar do grupo de processos. A solução correta e verificável é **Windows Job Objects** (via o crate `win32job`, um wrapper seguro e maduro sobre `CreateJobObject`/`AssignProcessToJobObject`/`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) no Windows, e **matar o grupo de processos** (`killpg` sobre o pid negativo, via o crate `nix`) no Unix — apoiado no fato verificado de que um processo anexado ao lado slave de um PTY normalmente vira líder de sessão/grupo (via `setsid`), então seus próprios filhos (que não chamam `setsid` de novo) herdam o mesmo grupo e morrem juntos com um único `killpg`. Nenhum desses dois mecanismos plataforma-específicos é fornecido pelo `portable-pty` — ambos precisam ser adicionados explicitamente pelo app, e o `Child::kill()` nativo do `portable-pty` deve ser usado só como uma segunda camada de segurança, nunca como o mecanismo primário.

O segundo achado importante é o **caminho de dados do terminal**: o Tauri v2 `tauri::ipc::Channel<T>` suporta payload binário bruto (sem serialização JSON completa, [CITED: PR/issue oficiais do `tauri-apps/tauri` sobre otimização de payload raw em eventos]), o que resolve de uma vez dois problemas que o prompt de pesquisa levantou — performance de streaming em alta frequência, e fronteira de bytes UTF-8 quebrada no meio de um chunk. A recomendação é: o Rust **nunca decodifica UTF-8** — ele lê bytes crus do master do PTY e manda `Vec<u8>` pelo Channel; o xterm.js recebe o `Uint8Array` e faz `terminal.write(bytes)` diretamente, porque o parser interno do xterm.js mantém estado de decodificação UTF-8 entre chamadas [CITED: xterm.js — API `Terminal.write`/`writeUtf8`, discussão oficial sobre issue #2326]. Isso elimina inteiramente a preocupação de "chunk cortou um caractere multi-byte ao meio" sem nenhum código de buffering manual no Rust.

O terceiro achado, verificado diretamente **nesta própria máquina** (não por busca), é a regra exata de codificação de `~/.claude/projects/<encoded>/`: `/home/user/gsd-cards` vira literalmente `-home-user-gsd-cards` (toda barra `/` vira `-`), confirmando a hipótese já registrada em `research/ARCHITECTURE.md`. Também descobri, inspecionando o `.jsonl` real desta sessão, dois detalhes que o parser de descoberta de sessões precisa tratar: (a) existe uma subpasta `subagents/` (e, neste ambiente específico, um arquivo auxiliar `.ccr-tip.json`) ao lado do `.jsonl` principal — a listagem de sessões deve filtrar estritamente por `*.jsonl` diretamente dentro da pasta codificada, nunca recursar em subpastas nem contar arquivos não-`.jsonl`; (b) a primeira linha de um `.jsonl` real pode ser um evento de infraestrutura (`{"type":"queue-operation", ...}`), não uma mensagem — qualquer extração de "título" a partir da primeira mensagem de usuário deve pular linhas cujo `type` não seja `user`/`assistant`, replicando o Anti-Pattern 1 já documentado em `ARCHITECTURE.md` (tratar o `.jsonl` só como sinal de existência/descoberta, nunca fazer parsing semântico profundo).

O quarto achado é de segurança: o modelo de escopo do `@tauri-apps/plugin-fs` estabelecido na Fase 1 (`allow_directory` só para a raiz do projeto aberto) **não cobre** `~/.claude/projects/`, que fica fora de qualquer projeto GSD. Ler ali exige um novo grant de escopo — e esse grant deve ser o mais estreito possível (só a subpasta codificada do projeto atualmente aberto, nunca `~/.claude/projects/` inteiro, que contém sessões de outros projetos do mesmo usuário sem relação com o projeto GSD Cards aberto).

**Primary recommendation:** Construir a fatia-traçadora (tracer) end-to-end nesta ordem, cada etapa validável isoladamente antes da próxima: (1) comando Rust `spawn_session` que sobe `claude` via `portable-pty` com `cwd` do projeto e imediatamente registra o mecanismo de kill de árvore específico da plataforma (Job Object/process group) — nunca adicionar isso depois; (2) thread leitora que envia bytes crus por um `tauri::ipc::Channel<Vec<u8>>` dedicado à sessão; (3) `TerminalView.tsx` com `@xterm/xterm` + `addon-fit`/`addon-web-links`/`addon-search` sempre carregados, `addon-webgl` só quando a sessão está em foco; (4) comando `kill_session` que primeiro aciona o mecanismo de árvore, só então chama `Child::kill()`/`wait()` como rede de segurança; (5) UAT manual explícito de zero processos remanescentes (Task Manager no Windows / `ps` no Unix) como critério de aceite, não só "a UI não mostra mais o terminal".

## Architectural Responsibility Map

> Mesma adaptação de tiers da Fase 1: "Browser/Client" = React Renderer (webview); "API/Backend" = Rust backend do Tauri; "Database/Storage" = filesystem (`.planning/`, `~/.claude/projects/`, e o processo do SO em si para o PTY).

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Detectar `claude`/gsd-core instalados (PROJ-04) | Rust Backend (`which::which`, checagem de `.claude/gsd-core`) | React Renderer (tela de instrução de instalação) | Resolver caminho de PATH e existência de diretório é operação de sistema; deve bloquear a UI de sessões antes de qualquer estado ser criado |
| Spawnar `claude` num PTY real (SESS-02, TERM-01) | Rust Backend (`portable-pty`) | — | Único jeito de ter um PTY nativo real (ConPTY no Windows); não existe equivalente em JS/webview sandboxed |
| Encerramento de árvore de processos (SESS-06) | Rust Backend (Job Object no Windows / process group no Unix) | — | Mecanismo é inteiramente do SO; a UI só decide **quando** disparar, nunca **como** |
| Streaming de bytes do terminal | Rust Backend (thread leitora → `Channel<Vec<u8>>`) | React Renderer (`terminal.write(bytes)`) | Two-speed IPC (Pattern 3 da Fase 1) — canal de alta frequência, dedicado, byte cru |
| Descoberta de sessões existentes (SESS-01) | React Renderer (`@tauri-apps/plugin-fs` após escopo concedido) | Rust Backend (concessão do escopo + resolução do caminho codificado) | Mesma divisão de trabalho da Fase 1: Rust resolve/valida/concede escopo, TS lê conteúdo — mantém a superfície Rust pequena |
| Ciclo de vida de UI de sessão (criar/selecionar/arquivar) | React Renderer (Zustand `session-store`) | Rust Backend (mapa `sessionId → PtySession` vivo) | Sessão lógica ≠ processo vivo (Pattern já estabelecido em `ARCHITECTURE.md`) — o renderer só espelha o que o backend reporta |
| Renderização/interação do terminal (xterm.js) | React Renderer | — | UI pura; algoritmo de foco/WebGL/serialize vive inteiramente no componente `TerminalView` |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `portable-pty` | `0.9.0` [VERIFIED: crates.io API, 2026-07-23 — `max_stable_version: 0.9.0`, 9,3M downloads totais, repo `github.com/wezterm/wezterm`, atualizado em 2025-02-11] | PTY real cross-platform no backend Rust | Já travado no `CLAUDE.md`; usado pelo wezterm; ConPTY nativo sem fallback winpty |
| `win32job` | `2.0.3` [VERIFIED: crates.io API, 2026-07-23 — 1,08M downloads totais, repo `github.com/ohadravid/win32job-rs`, atualizado em 2025-05-15] | Wrapper seguro sobre Windows Job Objects para matar a árvore de processos inteira ao fechar o handle do job | **Adição desta pesquisa, não estava no `CLAUDE.md`.** É o mecanismo verificado para SESS-06 no Windows — `portable-pty` não oferece isso nativamente (ver Pattern 2) |
| `nix` | `0.31.3` (feature `signal`) [VERIFIED: crates.io API, 2026-07-23 — 682M downloads totais, repo `github.com/nix-rust/nix`] | Bindings seguras para `killpg`/sinais POSIX no Unix | **Adição desta pesquisa.** Fornece `killpg` tipado sem `unsafe` manual sobre `libc::killpg` |
| `which` | `8.0.5` [VERIFIED: crates.io API, 2026-07-23 — 378,5M downloads totais, repo `github.com/harryfei/which-rs`] | Localizar o binário `claude` no PATH de forma cross-platform (PROJ-04) | **Adição desta pesquisa.** Crate de fato padrão para isso em Rust; evita reimplementar a lógica de `PATH`/extensões `.exe`/`.cmd` do Windows na mão |
| `@xterm/xterm` | `6.0.0` [VERIFIED: npm registry, `npm view` 2026-07-23] | Emulador de terminal no frontend | Já travado no `CLAUDE.md`; padrão de mercado (VS Code, Hyper) |
| `@xterm/addon-fit` | `0.11.0` [VERIFIED: npm registry, `npm view` 2026-07-23] | Redimensiona o terminal ao container e propaga `cols`/`rows` para o resize do PTY | Sempre carregado, em todo terminal montado (já travado no `CLAUDE.md`) |
| `@xterm/addon-webgl` | `0.19.0` [VERIFIED: npm registry, `npm view` 2026-07-23] | Renderer GPU — só no terminal em foco | Já travado; ver Pattern 3 para o algoritmo exato de quando (des)ativar |
| `@xterm/addon-serialize` | `0.14.0` [VERIFIED: npm registry, `npm view` 2026-07-23] | Serializa o buffer para congelar terminais em background | Já travado; ver Pattern 3 |
| `@xterm/addon-search` | `0.16.0` [VERIFIED: npm registry, `npm view` 2026-07-23] | Busca no scrollback (TERM-03) | Já travado |
| `@xterm/addon-web-links` | `0.12.0` [VERIFIED: npm registry, `npm view` 2026-07-23] | Detecta URLs no output e as torna clicáveis (TERM-02) | **Adição desta pesquisa — ausente do `CLAUDE.md`/`STACK.md`, mas requisito TERM-02 ("links clicáveis") não é atingível sem este addon; xterm.js core não faz detecção de URL** |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tauri` (core, já presente) | `2.11.5` [VERIFIED: crates.io API, 2026-07-23 — igual ao já confirmado na Fase 1] | `tauri::ipc::Channel<T>` para streaming de bytes do PTY | Nenhuma dependência nova — `tauri::ipc::Channel` já vem com o crate `tauri` já instalado; só é preciso importar o módulo |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `win32job` (crate dedicado) | Bindings cruas do crate `windows` (`windows::Win32::System::JobObjects::*`) direto, sem wrapper | `windows` já é dependência transitiva do ecossistema Tauri, então "gratuito" em termos de árvore de dependências, mas exige `unsafe` manual em cada chamada (`CreateJobObjectW`, `SetInformationJobObject`, etc.) e reimplementar o RAII (fechar o handle no `Drop`) que `win32job` já oferece pronto e testado. Recomendação: usar `win32job` a menos que surja uma necessidade muito específica de uma flag de Job Object não exposta pelo wrapper |
| `nix::sys::signal::killpg` | `libc::killpg` direto (`unsafe`) | `nix` é só uma camada de tipos seguros sobre a mesma chamada; usar `libc` diretamente só economiza uma dependência pequena, ao custo de `unsafe` espalhado pelo código — não vale a troca |
| Canal `tauri::ipc::Channel<Vec<u8>>` por sessão | Um único evento global `terminal:data` (`app.emit`) com `sessionId` embutido no payload, replicando o Pattern 3 (`Pattern 3: Two-speed IPC`) já usado para `planning:changed` na Fase 1 | Funciona, mas eventos globais (`emit`/`listen`) em Tauri v2 fazem broadcast para todos os listeners da janela e são serializados como JSON por padrão — perde o caminho de payload binário otimizado que o `Channel` oferece especificamente. Preferir `Channel` para o caminho de alta frequência; `emit`/`listen` continua correto para eventos raros como `session:exited` |
| `which` (crate) para achar `claude` no PATH | `std::env::var("PATH")` + busca manual, testando extensões `.exe`/`.cmd`/`.bat` no Windows | Reimplementar a lógica de resolução de PATH do Windows (que testa múltiplas extensões via `PATHEXT`) é exatamente o tipo de problema "parece simples, tem detalhes" que `which` já resolve e testa há anos — não vale reimplementar |

**Installation:**
```bash
# Frontend
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-search @xterm/addon-serialize @xterm/addon-web-links

# Rust (src-tauri/Cargo.toml)
cargo add portable-pty
cargo add which
cargo add win32job --target 'cfg(windows)'
cargo add nix --target 'cfg(unix)' --features signal
```

**Version verification (feita nesta sessão, 2026-07-23):**
- `npm view @xterm/xterm version` → `6.0.0` [VERIFIED: npm registry]
- `npm view @xterm/addon-fit version` → `0.11.0` [VERIFIED: npm registry]
- `npm view @xterm/addon-webgl version` → `0.19.0` [VERIFIED: npm registry]
- `npm view @xterm/addon-search version` → `0.16.0` [VERIFIED: npm registry]
- `npm view @xterm/addon-serialize version` → `0.14.0` [VERIFIED: npm registry]
- `npm view @xterm/addon-web-links version` → `0.12.0` [VERIFIED: npm registry]
- `curl https://crates.io/api/v1/crates/portable-pty` → `0.9.0`, repo `wezterm/wezterm` [VERIFIED: crates.io API direto]
- `curl https://crates.io/api/v1/crates/win32job` → `2.0.3`, repo `ohadravid/win32job-rs` [VERIFIED: crates.io API direto]
- `curl https://crates.io/api/v1/crates/which` → `8.0.5`, repo `harryfei/which-rs` [VERIFIED: crates.io API direto]
- `curl https://crates.io/api/v1/crates/nix` → `0.31.3`, repo `nix-rust/nix` [VERIFIED: crates.io API direto]

## Package Legitimacy Audit

Executado via `gsd-tools query package-legitimacy check` para todos os pacotes novos que esta fase introduz (os já auditados na Fase 1 — Tauri, React, etc. — não são reauditados aqui).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `@xterm/xterm` | npm | publicado 2025-12-22 | desconhecido pela ferramenta (`unknown-downloads`) | `github.com/xtermjs/xterm.js` | SUS | Approved — falso positivo, ver nota abaixo |
| `@xterm/addon-fit` | npm | publicado 2025-12-22 | `unknown-downloads` | `github.com/xtermjs/xterm.js` | SUS | Approved — falso positivo |
| `@xterm/addon-webgl` | npm | publicado 2025-12-22 | `unknown-downloads` | `github.com/xtermjs/xterm.js` | SUS | Approved — falso positivo |
| `@xterm/addon-search` | npm | publicado 2025-12-22 | `unknown-downloads` | `github.com/xtermjs/xterm.js` | SUS | Approved — falso positivo |
| `@xterm/addon-serialize` | npm | publicado 2025-12-22 | `unknown-downloads` | `github.com/xtermjs/xterm.js` | SUS | Approved — falso positivo |
| `@xterm/addon-web-links` | npm | publicado 2025-12-22 | `unknown-downloads` | `github.com/xtermjs/xterm.js` | SUS | Approved — falso positivo |
| `portable-pty` | crates | criado 2019-05-20 | 9,3M totais / 290k semana | `github.com/wezterm/wezterm` | OK | Approved |
| `win32job` | crates | criado 2020-02-05 | 1,08M totais / 31k semana | `github.com/ohadravid/win32job-rs` | OK | Approved |
| `which` | crates | criado 2015-10-06 | 378,5M totais / 5,0M semana | `github.com/harryfei/which-rs` | OK | Approved |
| `nix` | crates | criado 2014-11-11 | 682M totais / 11,8M semana | `github.com/nix-rust/nix` | OK | Approved |

**Nota sobre os falsos positivos `unknown-downloads`:** os seis pacotes `@xterm/*` foram sinalizados `SUS` porque a checagem automatizada não conseguiu obter a contagem de downloads semanais desta vez (`weeklyDownloads: null`) — não porque haja qualquer sinal de risco real. O `repository` de cada um resolve para o repositório oficial `xtermjs/xterm.js`, o mesmo pacote já aprovado como parte da stack central em `.planning/research/STACK.md` (que documentou `@xterm/addon-webgl@0.19.0` etc. com a mesma nota de legitimidade). Verificação manual via `registry.npmjs.org/@xterm%2Fxterm` confirma a versão `6.0.0` publicada em 2025-12-22 pelo mantenedor oficial [VERIFIED: registry.npmjs.org direto, 2026-07-23]. Os pacotes antigos sem escopo que estes substituem (`xterm`, `xterm-addon-webgl`, etc.) têm dezenas de milhões de downloads/semana historicamente — a migração de namespace é a mesma documentada no `STACK.md`/`State of the Art` da Fase 1.

**Packages removed due to [SLOP] verdict:** nenhum.
**Packages flagged as suspicious [SUS]:** os 6 pacotes `@xterm/*` listados acima, todos aprovados após verificação manual do campo `repository` e do registry direto — nenhum `checkpoint:human-verify` adicional necessário além da instalação padrão, seguindo o mesmo precedente estabelecido na Fase 1 para pacotes de alto tráfego sinalizados só por metadados incompletos da ferramenta.

## Architecture Patterns

### System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                      REACT RENDERER (WebView2)                            │
│                                                                             │
│  [Sidebar: lista de sessões] ──clica "Nova sessão"──> [session-store]      │
│         │ descoberta (SESS-01)                              │             │
│         ▼                                                    ▼             │
│  [register_sessions_scope] --Rust--> [readDir/stat via plugin-fs]          │
│  (resolve encoded dir + grant escopo)     (lista .jsonl, filtra           │
│                                             subagents/ e não-.jsonl)       │
│                                                                │            │
│                                                                ▼            │
│                                          [createSession(projectRoot)]      │
│                                                     │                       │
│                                    invoke("spawn_session", {onEvent})       │
│                                                     │                       │
│  ┌──────────────────────────────────────────────────┴─────────────────┐   │
│  │  new Channel<Uint8Array>() ──> onmessage: terminal.write(bytes)     │   │
│  │  (redirecionado p/ buffer de fundo quando a sessão não está em foco)│   │
│  └──────────────────────────────────────────────────┬─────────────────┘   │
│                                                       │                     │
│  [TerminalView.tsx focado]: addon-fit + addon-search + addon-web-links +   │
│  addon-webgl SÓ aqui. Terminais em background: mesmos addons exceto        │
│  webgl (descartado), instância desmontada + snapshot via addon-serialize.  │
└───────────────────────────────┬─────────────────────────────────────────────┘
                    IPC (Channel, ALTA freq., bytes crus)   │  invoke (baixa freq.)
┌───────────────────────────────┴─────────────────────────────────────────────┐
│                    RUST BACKEND (Tauri core)                                │
│                                                                              │
│  [spawn_session(cwd, on_event)]                                             │
│       │ portable-pty::native_pty_system().openpty(PtySize)                 │
│       │ CommandBuilder::new("claude").cwd(project_root)                    │
│       ▼                                                                     │
│  [pair.slave.spawn_command(cmd)] ── Unix: já é líder de sessão/grupo ──┐    │
│       │                                    (setsid implícito do PTY)  │    │
│       ├─ #[cfg(windows)]: win32job::Job::create() + limit_kill_on_job_close│
│       │  + assign_process(child handle)  ← ESSENCIAL, não opcional        │
│       │                                                                │    │
│       ▼                                                                │    │
│  [thread leitora: master.try_clone_reader().read(buf)] ──> Channel.send(buf)│
│       │ (nunca decodifica UTF-8 — bytes crus)                          │    │
│       ▼                                                                │    │
│  [PtyManager: Mutex<HashMap<sessionId, PtySession>>]                   │    │
│       │                                                                │    │
│  [kill_session(id)] ── #[cfg(windows)]: drop(job) (kill-on-close) ─────┤    │
│                    └── #[cfg(unix)]: nix::killpg(-pid, SIGKILL) ───────┘    │
│                    └── child.kill() + child.wait() (rede de segurança)     │
│                                                                              │
│  [RunEvent::ExitRequested]: itera TODAS as sessões vivas e chama kill_session│
│  antes de permitir o app fechar (cobre fechar o app com sessões abertas)    │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                 │
                    ┌────────────┴─────────────┐         ┌──────────────────────┐
                    │  Processo `claude` real   │         │ ~/.claude/projects/  │
                    │  (PTY slave, cwd=projeto) │         │ <encoded>/<id>.jsonl  │
                    │  pode spawnar git/MCP/etc │         │ (Claude Code escreve; │
                    │  — TODOS morrem juntos    │         │  app só lê p/ discovery)│
                    └───────────────────────────┘         └──────────────────────┘
```

### Recommended Project Structure

```
src-tauri/
├── src/
│   ├── lib.rs                   # registra os novos comandos no invoke_handler
│   ├── project.rs               # (Fase 1) — ganha campo has_gsd_core em ValidatedProject
│   ├── planning_watcher.rs      # (Fase 1, sem mudanças)
│   ├── dependencies.rs          # NOVO: check_claude_on_path() via `which` (PROJ-04)
│   ├── sessions.rs              # NOVO: register_sessions_scope(project_root) — encoding + fs scope estreito (SESS-01)
│   ├── pty.rs                   # NOVO: PtySession, PtyManager, spawn_session/write_session/resize_session/kill_session
│   └── process_guard.rs         # NOVO: mecanismo de kill de árvore cfg(windows)/cfg(unix), testável isoladamente
├── Cargo.toml                   # + portable-pty, which, win32job (windows), nix (unix)
└── capabilities/default.json    # SEM novas entradas — comandos de app não passam pelo ACL de plugin (ver Security Domain)

src/
├── dependencies/
│   └── check.ts                 # invoke("check_claude_on_path"); tela de instrução de instalação
├── sessions/
│   ├── discover.ts               # invoke("register_sessions_scope") + readDir/stat via plugin-fs
│   └── jsonl-signals.ts          # extrai só id (nome do arquivo) + mtime; NUNCA parse profundo (Anti-Pattern 1 de ARCHITECTURE.md)
├── pty/
│   └── channel.ts                # wrapper de invoke("spawn_session"/"write_session"/"resize_session"/"kill_session") + Channel<Uint8Array>
├── stores/
│   └── session-store.ts          # NOVO: zustand — sessions[], liveSessions Map<id, LiveSessionState>, activeSessionId
├── components/
│   └── terminal/
│       ├── TerminalView.tsx      # monta/desmonta xterm.js; algoritmo de foco (Pattern 3)
│       └── SessionList.tsx       # substitui SidebarPlaceholder
└── shell/
    └── DrawerRail.tsx             # deixa de ser só um rail desabilitado — abre o drawer com TerminalView
```

### Pattern 1: Spawn de PTY real + streaming de bytes crus via Tauri Channel

**What:** Um comando `spawn_session` abre um par PTY nativo (`native_pty_system().openpty(PtySize{ rows, cols, pixel_width: 0, pixel_height: 0 })`), constrói o comando `claude` com `CommandBuilder::new("claude").cwd(project_root)`, spawna no lado slave (`pair.slave.spawn_command(cmd)`), e dropa o `slave` no processo pai — exigência da própria API do `portable-pty` (o slave só deve viver no processo filho depois do spawn). Uma thread dedicada faz `pair.master.try_clone_reader()` e um loop bloqueante de `read()`, mandando cada chunk (`&[u8]`, nunca decodificado) por um `tauri::ipc::Channel<Vec<u8>>` criado no frontend e passado como argumento do comando.

**When to use:** Toda criação de sessão (SESS-02) e todo terminal ativo (TERM-01).

**Por que bytes crus, não `String`:** decodificar UTF-8 no Rust antes de mandar exige lidar com um chunk que corta um caractere multi-byte ao meio (um `read()` de 4096 bytes não respeita fronteiras de caractere). O xterm.js resolve isso de graça: seu parser interno mantém estado de decodificação UTF-8 entre chamadas de `write()`, então passar `Uint8Array` bruto (via `terminal.write(new Uint8Array(bytes))`) é simultaneamente mais simples E mais rápido que decodificar em Rust e mandar `String` [CITED: xterm.js issue #2326 "Allow arbitrary binary data for triggerDataEvent/onData"; xterm.js docs de `Terminal.write`]. O `tauri::ipc::Channel` suporta esse caminho binário sem overhead de serialização JSON completa [CITED: PR `tauri-apps/tauri#14269` "optimize raw payload in event system"].

**Confidence:** MEDIUM — API exata de `portable-pty` (`try_clone_reader`, `take_writer`, `spawn_command`) confirmada via `docs.rs`/busca cruzada [CITED], mas não executada nesta sessão de pesquisa (sem toolchain Rust rodando aqui — mesma limitação de ambiente já documentada na Fase 1). Confirmar a compilação exata durante a Wave 0 de implementação.

**Example:**
```rust
// src-tauri/src/pty.rs — esqueleto conceitual
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::ipc::Channel;
use std::io::Read;

pub fn spawn(cwd: String, on_event: Channel<Vec<u8>>) -> Result<PtySession, PtyError> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })?;

    let mut cmd = CommandBuilder::new("claude");
    cmd.cwd(cwd);
    let child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave); // exigido pela API — o slave não deve sobreviver no processo pai

    let mut reader = pair.master.try_clone_reader()?;
    let writer = pair.master.take_writer()?;

    let handle = std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF: processo filho saiu
                Ok(n) => { let _ = on_event.send(buf[..n].to_vec()); }
                Err(_) => break,
            }
        }
    });

    Ok(PtySession { master: pair.master, writer, child, reader_thread: Some(handle) })
}
```

```typescript
// src/pty/channel.ts
import { invoke, Channel } from "@tauri-apps/api/core";

export function spawnSession(sessionId: string, projectRoot: string, onBytes: (data: Uint8Array) => void) {
  const onEvent = new Channel<Uint8Array>();
  onEvent.onmessage = (bytes) => onBytes(bytes); // xterm: terminal.write(bytes) direto, sem decode manual
  return invoke("spawn_session", { sessionId, cwd: projectRoot, onEvent });
}
```

### Pattern 2: Encerramento limpo da árvore de processos (SESS-06 — critério de fundação)

**What:** `portable-pty` não resolve isso — seu `Child::kill()` mata só o processo direto que ele spawnou (o shell/`claude`), não os descendentes que esse processo eventualmente cria (git, subprocessos MCP, etc.). A solução correta é específica por plataforma:

- **Windows:** ao spawnar, criar um Job Object (`win32job::Job::create()`), configurar `limit_kill_on_job_close()` na `ExtendedLimitInfo`, e associar o processo filho a esse job. Fechar (dropar) o handle do job mata **todo** processo ainda associado a ele, incluindo qualquer descendente que o `claude` tenha spawnado — porque, por padrão, um processo filho criado por um processo já associado ao job herda a mesma associação automaticamente [VERIFIED: Microsoft Learn — `Job Objects`, `AssignProcessToJobObject`, comportamento de herança confirmado na documentação oficial].
- **Unix:** o processo anexado ao lado slave de um PTY tipicamente vira líder de uma nova sessão (comportamento padrão de abrir um terminal controlador, verificado via múltiplas fontes sobre semântica de `setsid`/sessões de PTY [CITED]) — então, ao matar o **grupo de processos** inteiro com `killpg(-pid, SIGKILL)` (via `nix::sys::signal::killpg`), qualquer filho que o `claude` spawne (e que não chame `setsid()` de novo por conta própria) morre junto, porque herda o mesmo grupo do processo líder.
- Em ambos os casos, `child.kill()` + `child.wait()` do `portable-pty` continua sendo chamado **depois** do mecanismo específico de plataforma, como rede de segurança (reaping do processo direto), nunca como o mecanismo primário.

**When to use:** Todo `kill_session` (arquivar/excluir uma sessão) e no handler de `RunEvent::ExitRequested` do app inteiro — iterando **todas** as sessões vivas do `PtyManager` antes de permitir que o app feche. Esse último ponto é crítico: fechar a janela sem esse handler deixa exatamente os zombies que o Pitfall 1 de `research/PITFALLS.md` já documentou como o bug mais caro deste domínio.

**Trade-offs:** Nenhum — este não é um "nice to have", é o requisito explícito (D-16/SESS-06 do roadmap). O único custo é código específico por plataforma (`#[cfg(windows)]`/`#[cfg(unix)]`), isolado em `process_guard.rs` para ficar testável (a lógica de "qual pid/grupo/job pertence a qual sessão" é testável sem depender do SO real).

**Confidence:** HIGH para a análise do problema e a escolha dos mecanismos (Job Objects e process groups são os mecanismos de SO documentados oficialmente para exatamente este problema); MEDIUM para a assinatura exata do método `win32job::Job` que associa um processo **já spawnado** (não o processo atual) ao job — os exemplos encontrados via busca mostram majoritariamente `assign_current_process()`; a API para associar um processo filho por handle (equivalente a `AssignProcessToJobObject(job, child_handle)`) deve existir (é o caso de uso central do crate) mas o nome exato do método não foi confirmado via leitura direta do código-fonte nesta sessão — **verificar contra a documentação/código-fonte do crate na primeira tarefa de implementação, antes de escrever o restante do `process_guard.rs`** (ver `## Assumptions Log` A1).

**Example:**
```rust
// src-tauri/src/process_guard.rs — esqueleto conceitual
#[cfg(windows)]
pub struct TreeGuard { job: win32job::Job }

#[cfg(windows)]
impl TreeGuard {
    pub fn attach(child: &dyn portable_pty::Child) -> Result<Self, GuardError> {
        let job = win32job::Job::create()?;
        let mut info = job.query_extended_limit_info()?;
        info.limit_kill_on_job_close();
        job.set_extended_limit_info(&mut info)?;
        // Método exato de associar um processo filho (não o processo atual) a
        // confirmar contra a doc/código do crate win32job na implementação —
        // ver Assumptions Log A1. Semântica esperada: equivalente a
        // AssignProcessToJobObject(job_handle, child_process_handle).
        job.assign_process(child.as_raw_handle())?;
        Ok(Self { job })
    }
    // Drop de `job` (chamado implicitamente ao remover a sessão do
    // PtyManager, ou explicitamente em kill_session) fecha o handle do job —
    // com limit_kill_on_job_close, isso mata toda a árvore ainda viva.
}

#[cfg(unix)]
pub struct TreeGuard { pid: i32 }

#[cfg(unix)]
impl TreeGuard {
    pub fn attach(child: &dyn portable_pty::Child) -> Result<Self, GuardError> {
        let pid = child.process_id().ok_or(GuardError::NoPid)?;
        Ok(Self { pid: pid as i32 })
    }

    pub fn kill_tree(&self) -> Result<(), GuardError> {
        use nix::sys::signal::{killpg, Signal};
        use nix::unistd::Pid;
        // O processo do PTY slave normalmente é líder de sessão/grupo — matar
        // o grupo (pid negativo) alcança qualquer descendente que não tenha
        // criado sua própria sessão.
        killpg(Pid::from_raw(self.pid), Signal::SIGKILL)
            .map_err(GuardError::from)
    }
}
```

### Pattern 3: Algoritmo de troca de foco do xterm.js (SESS-03 — múltiplas sessões vivas em background)

**What:** Literal ao `CLAUDE.md` (`## Stack Patterns by Variant`): só o terminal em foco carrega `@xterm/addon-webgl`; terminais em background têm sua instância `xterm.js` **desmontada** (não só escondida via CSS — xterm.js não suporta oficialmente desanexar/reanexar um `Terminal` já aberto a um novo container), com o buffer preservado via `@xterm/addon-serialize` e restaurado ao focar de novo.

**Algoritmo exato ao perder foco (sessão A deixa de ser a ativa):**
1. Se `addon-webgl` estava carregado em A, chamar `webglAddon.dispose()` primeiro (libera o contexto WebGL antes de qualquer outra coisa — contextos WebGL são um recurso finito do processo, ver `research/STACK.md`).
2. `const snapshot = serializeAddon.serialize()` — string com sequências de escape que recriam o estado visual e o scrollback (usar `serialize()`, não `serializeAsHTML()` — o `write()` do xterm.js espera dados de terminal, não HTML).
3. Guardar `snapshot` em `session-store` (`liveSessions.get(A).serializedSnapshot`).
4. `terminal.dispose()` — libera a instância inteira (DOM, listeners, buffers internos).
5. Redirecionar o `onmessage` do `Channel` de A: em vez de chamar `terminal.write(bytes)`, empilhar os bytes recebidos num array em memória (`liveSessions.get(A).backgroundBuffer`) — o processo PTY continua rodando e gerando output mesmo sem uma instância de terminal para exibi-lo.

**Algoritmo exato ao ganhar foco (sessão B se torna a ativa):**
1. `const terminal = new Terminal({ scrollback: N, ... })` — nova instância.
2. `terminal.open(container)`.
3. Carregar sempre: `addon-fit`, `addon-search`, `addon-web-links`.
4. Se `liveSessions.get(B).serializedSnapshot` existir: `terminal.write(snapshot)` — restaura o estado visual anterior.
5. Drenar `backgroundBuffer` (se houver bytes acumulados enquanto B estava sem instância): `terminal.write(bytes)` em ordem, depois limpar o buffer.
6. Carregar `addon-webgl` **agora** (só nesta instância, a única em foco no momento).
7. Redirecionar o `onmessage` do `Channel` de B de volta para `terminal.write(bytes)` diretamente (sem mais buffering).
8. `fitAddon.fit()` e invocar `resize_session(B, terminal.cols, terminal.rows)` — o container pode ter mudado de tamanho desde a última vez que B esteve visível.

**When to use:** Toda troca de sessão ativa na sidebar (SESS-03). Como o drawer mostra exatamente uma sessão por vez nesta fase (sem split-view), no máximo um contexto WebGL existe a qualquer momento — dentro do limite de 8-16 contextos documentado no `STACK.md`/issue oficial do xterm.js, com folga.

**Trade-offs:** Mais estados para gerenciar (`serializedSnapshot` + `backgroundBuffer` por sessão) do que simplesmente deixar todas as instâncias montadas e escondidas via CSS — mas essa alternativa mais simples não é oficialmente suportada pelo xterm.js (não existe um `.close()`/reattach documentado; só `.dispose()`, que é definitivo) e o `CLAUDE.md` já resolveu essa escolha explicitamente a favor do padrão dispose+serialize.

**Confidence:** MEDIUM — o padrão dispose+serialize é confirmado pela documentação oficial do addon (`addon-serialize` README: "keep track of a terminal's state... upon reconnection") [CITED], e o comportamento de `WebglAddon.onContextLoss`/`dispose()` também é oficial [CITED: README `xtermjs/xterm.js/addons/addon-webgl`]; a combinação exata "buffer bytes recebidos enquanto não há instância" é uma composição desta pesquisa, não um padrão documentado literalmente em nenhuma fonte única — validar com um teste manual de "sessão em background continua produzindo saída" antes de considerar este pattern fechado.

### Pattern 4: Descoberta de sessões existentes (SESS-01) — `~/.claude/projects/<encoded>/`

**What:** A regra de codificação é **verificada diretamente nesta máquina**, não só documentada: o caminho absoluto do projeto tem cada `/` substituído por `-` (ex.: `/home/user/gsd-cards` → `-home-user-gsd-cards`), e cada sessão é um arquivo `<session-id>.jsonl` diretamente dentro dessa pasta codificada. Duas descobertas adicionais, também verificadas localmente e não documentadas nas pesquisas de projeto anteriores:
1. Existe uma subpasta `subagents/` ao lado do(s) `.jsonl` principal — a listagem de sessões deve considerar **só arquivos `.jsonl` diretamente no nível raiz** da pasta codificada, nunca recursar.
2. A primeira linha de um `.jsonl` real observado nesta máquina era `{"type":"queue-operation", "operation":"enqueue", ...}` — um evento de infraestrutura, não uma mensagem de conversa. Qualquer tentativa futura de extrair um "título" a partir da primeira mensagem de usuário (fora do escopo mínimo desta fase, ver `## Open Questions` #1) precisa pular linhas cujo campo `type` não seja `user`/`assistant`.

**When to use:** Ao abrir um projeto (popular a sidebar de sessões, SESS-01) e ao criar uma nova sessão (decidir o próximo passo — `claude` puro vs. `claude --resume <id>`, embora `--resume` de sessão existente seja explicitamente um requisito da Fase 4/SESS-04, não desta fase).

**Escopo mínimo para esta fase (MVP/tracer-first):** listar `id` (nome do arquivo sem `.jsonl`) + `lastModified` (mtime, via a permissão `fs:allow-stat` já concedida na Fase 1) é suficiente para SESS-01 ("vê as sessões... na sidebar"). **Não** ler o conteúdo do `.jsonl` para extrair um título amigável nesta fase — arquivos `.jsonl` reais de sessões longas passam facilmente de várias centenas de KB (o `.jsonl` desta própria sessão de pesquisa tem 638KB e ainda está em andamento) e carregar o arquivo inteiro via `plugin-fs.readTextFile` só para ler a primeira linha é exatamente o anti-padrão que a Fase 1 já evitou para artefatos `.planning/` (`fs:allow-size` antes de `readTextFile`, D-01-05). Ver `## Common Pitfalls` #3.

**Confidence:** HIGH para a regra de codificação e a existência de `subagents/` (verificado por leitura direta do filesystem local nesta sessão, não por busca); MEDIUM para a generalização de que **todo** ambiente Claude Code real produz o mesmo padrão de `subagents/`/primeira-linha-não-mensagem — confirmado só nesta instalação específica, tratar como o comportamento esperado mas não como garantia absoluta entre versões (mesmo aviso já registrado em `ARCHITECTURE.md`: o formato é interno e pode mudar).

### Pattern 5: Detecção de dependências — Claude CLI e gsd-core (PROJ-04)

**What:** Duas checagens independentes, com escopos diferentes:
1. **`claude` no PATH** — checagem **global**, independente de qual projeto está aberto: `which::which("claude")`. Roda uma vez (ex.: no boot do app, ou lazy na primeira tentativa de abrir a sidebar de sessões) e é cacheada; se ausente, bloqueia a criação de sessão com uma tela de instrução (nunca auto-instala, conforme `Out of Scope` do `REQUIREMENTS.md`).
2. **gsd-core presente** — checagem **por projeto aberto**, porque gsd-core pode estar instalado de duas formas diferentes observadas na prática (confirmado nesta própria máquina, que tem `gsd-core` instalado em `<repo>/.claude/gsd-core/`, um install local-por-projeto, não global): (a) `<project_root>/.claude/gsd-core/` existe, OU (b) um diretório equivalente existe no home do usuário (`~/.claude/gsd-core/`), OU (c) `which::which("gsd-tools")` resolve (instalação global via npm). Qualquer uma das três é suficiente — não exigir todas.

**Onde integrar:** Estender o `ValidatedProject` que `project.rs::validate_project_root` já retorna (Fase 1) com um campo `has_gsd_core: bool`, calculado durante a mesma validação — é uma mudança aditiva pequena a um comando já testado, em vez de um novo fluxo paralelo. A checagem de `claude` no PATH é separada (não depende de qual projeto está aberto) e pode virar seu próprio comando `check_claude_on_path`.

**When to use:** Ao abrir/reabrir um projeto (para gsd-core) e ao montar a tela de sessões (para `claude`) — ambos antes de qualquer tentativa de `spawn_session`.

**Confidence:** MEDIUM — a checagem de `claude` via `which` é um padrão direto e bem estabelecido [VERIFIED: `which` é o crate de fato para isso, 378M downloads]; a checagem de gsd-core é uma inferência desta pesquisa a partir da observação real desta máquina (instalação local-por-projeto) cruzada com o padrão de múltiplos diretórios candidatos já visível na própria cadeia de fallback usada pelas ferramentas do gsd-core (que testam `.claude/`, `.codex/`, `.cursor/`, etc.) — **não há uma "API de detecção" oficial do gsd-core para isso**; é uma checagem de existência de diretório, não uma chamada a um comando de "doctor"/health-check do gsd-core (nenhum foi encontrado no código-fonte lido nesta sessão).

### Pattern 6: Escopo de filesystem estreito para `~/.claude/projects/` (segurança)

**What:** O modelo de escopo do `@tauri-apps/plugin-fs` estabelecido na Fase 1 (`app.fs_scope().allow_directory(&root_canonical, true)`) concede acesso só à raiz do projeto GSD aberto — isso **não cobre** `~/.claude/projects/`, que fica fora de qualquer projeto GSD e contém, no mesmo diretório pai, sessões de **outros** projetos não relacionados do mesmo usuário. Um novo comando Rust (`register_sessions_scope`) deve: (1) resolver o diretório do home do usuário (via `dirs`/`std::env::home_dir` equivalente já disponível como dependência transitiva do Tauri, ou `tauri::path::home_dir()` do `PathResolver`), (2) aplicar a mesma regra de codificação (barra→traço) ao caminho absoluto do projeto atualmente aberto, (3) conceder escopo de leitura **só** a essa subpasta específica (`~/.claude/projects/<encoded-do-projeto-atual>/`), nunca a `~/.claude/projects/` inteira.

**When to use:** Imediatamente após `validate_project_root` ter sucesso, antes de qualquer leitura de sessões.

**Trade-offs:** Nenhum — é estritamente mais seguro que a alternativa óbvia (conceder escopo à pasta `~/.claude/projects/` inteira "por simplicidade"), ao custo de recalcular o caminho codificado toda vez que um projeto é aberto — operação barata, sem I/O.

**Confidence:** HIGH — é uma extensão direta e mecânica do padrão já implementado e testado em `project.rs` na Fase 1 (mesmo raciocínio de "conceder escopo só para o que foi validado", nada novo a verificar externamente).

### Anti-Patterns to Avoid

- **Confiar só em `Child::kill()` do `portable-pty` para SESS-06:** mata o processo direto, não a árvore — ver Pitfall 1 e Pattern 2.
- **Decodificar UTF-8 no Rust antes de mandar pelo Channel:** desnecessário e introduz o próprio bug de fronteira de bytes que se está tentando evitar — mandar `Vec<u8>` cru (Pattern 1).
- **Fazer parsing semântico do `.jsonl` do Claude Code** (ler `message.content`, reconstruir a conversa, etc.): o formato é interno e muda entre versões (Anti-Pattern 1 já documentado em `ARCHITECTURE.md`); usar só para descoberta (nome do arquivo = id, mtime = última atividade).
- **Ler o `.jsonl` inteiro via `plugin-fs.readTextFile` só para extrair um título:** arquivos reais passam de centenas de KB; ver Pattern 4 e Common Pitfalls #3.
- **Manter todas as instâncias `xterm.js` montadas e só escondidas via CSS para "simplificar":** não é o padrão suportado pela lib nem o que o `CLAUDE.md` prescreve — usar o algoritmo de dispose+serialize do Pattern 3.
- **Conceder escopo de `plugin-fs` a `~/.claude/projects/` inteira:** vaza sessões de outros projetos não relacionados — usar Pattern 6 (escopo por subpasta codificada).
- **Chamar `kill_session` só a partir de um botão de UI, sem um handler de `RunEvent::ExitRequested`:** fechar o app inteiro com sessões vivas sem esse handler é exatamente o Pitfall 1 (zombies acumulando a cada ciclo abrir/fechar do app) — ver Pattern 2.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Encerramento de árvore de processos no Windows | Chamar `taskkill /pid <pid> /T /F` via `std::process::Command` (shell-out) | `win32job::Job` com `limit_kill_on_job_close` | Chamar `taskkill` via shell-out é frágil (depende do `taskkill.exe` estar no PATH, parsing de código de saída, mais um processo extra só para matar o outro) e mais lento que o mecanismo de kernel nativo (Job Objects fecham a árvore inteira ao fechar um handle, sem spawnar nada) |
| Encerramento de grupo de processos no Unix | Reimplementar `killpg` chamando `libc::killpg` cru com `unsafe` | `nix::sys::signal::killpg` | `nix` já oferece o tipo `Pid`/`Signal` seguros sobre a mesma syscall — não há ganho em reimplementar |
| Detecção de binário no PATH | Reimplementar a busca em `PATH`/`PATHEXT` (Windows testa `.exe`/`.cmd`/`.bat`/etc.) | `which::which` | Lógica de resolução de PATH tem detalhes específicos de plataforma (extensões no Windows) que `which` já testa exaustivamente |
| Parsing do `.jsonl` do Claude Code | Deserializar cada linha como JSON tipado e extrair `message.content` | Tratar como sinal de existência (nome do arquivo, mtime) — nunca abrir o conteúdo estruturado nesta fase | O formato é documentadamente interno e sujeito a mudança sem aviso (Anti-Pattern 1 de `ARCHITECTURE.md`) |
| Detecção de fronteira UTF-8 em streaming | Buffer manual em Rust que acumula bytes até ter uma sequência UTF-8 completa antes de mandar | Mandar bytes crus (`Vec<u8>`) e deixar o parser interno do xterm.js decodificar incrementalmente | O parser do xterm.js já resolve isso; reimplementar em Rust é trabalho redundante e mais uma superfície de bug |

**Key insight:** assim como a Fase 1 identificou "derivação de status de fase" como o único problema genuinamente específico do domínio, esta fase tem o seu: **encerramento correto de árvore de processos multiplataforma**. É o único item desta pesquisa que não tem uma biblioteca de alto nível pronta cobrindo os dois SOs de uma vez (crates como `processkit` prometem isso, mas são recentes e menos maduros que a combinação verificada `win32job` + `nix`, que são individualmente crates estabelecidos com anos de uso e milhões de downloads) — todo o resto (streaming de bytes, terminal embutido, descoberta de sessão) tem solução de biblioteca madura e não deve ser reinventado.

## Common Pitfalls

### Pitfall 1: Matar só o processo raiz, não a árvore (SESS-06)

Já detalhado em `research/PITFALLS.md` Pitfall 1 e em Pattern 2 acima. Resumo do risco específico desta fase: o `Child::kill()` do `portable-pty` mata só o processo direto do PTY (o `claude`), nunca os descendentes que ele mesmo spawna (subprocessos MCP, `git`, etc). **Warning sign:** processos remanescentes no Task Manager/`ps` depois de "fechar" uma sessão pela UI — o teste de aceite tem que ser a inspeção real do SO, não só a UI deixando de mostrar o terminal.

**Phase to address:** Esta fase — é o critério de fundação explícito do roadmap.

### Pitfall 2: Fechar o app com sessões vivas sem handler de shutdown

Mesmo com `kill_session` funcionando perfeitamente quando chamado, fechar a janela/app sem registrar `RunEvent::ExitRequested` (ou `will-quit`-equivalente do Tauri) simplesmente nunca chama esse código — o app encerra e os processos PTY (e toda a árvore deles) ficam órfãos. **How to avoid:** o `PtyManager` precisa expor uma função "kill all" que o handler de `RunEvent::ExitRequested` chama antes de deixar o app fechar de fato; testar explicitamente "fechar o app com N sessões abertas, verificar zero processos remanescentes" como parte do UAT desta fase, não só "fechar uma sessão individual pelo botão".

**Phase to address:** Esta fase.

### Pitfall 3: Ler o `.jsonl` inteiro para extrair metadado de exibição

Arquivos `.jsonl` de sessão real crescem rápido (o desta própria sessão de pesquisa já tem 638KB). Ler o arquivo inteiro via `plugin-fs.readTextFile` só para pegar a primeira linha (nome/título) trava a UI numa sessão longa e reintroduz o mesmo anti-padrão que a Fase 1 já mitigou para artefatos `.planning/` grandes (checar `size()` antes de `readTextFile`, D-01-05). **How to avoid:** para esta fase, não extrair título nenhum do conteúdo — usar só o `id` (nome do arquivo) e o `mtime` (via `fs:allow-stat`, já concedido na Fase 1). Se um título amigável virar requisito futuro, a forma correta é um comando Rust que lê só os primeiros bytes/linha via leitura em streaming (`BufReader::read_line`), nunca carregar o arquivo inteiro pelo IPC do `plugin-fs`.

**Phase to address:** Esta fase (evitar) — título amigável fica para uma fase futura, se virar requisito.

### Pitfall 4: `xterm.js` + React StrictMode — dispose duplo/faltante em dev

Em desenvolvimento, o `StrictMode` do React invoca `useEffect` duas vezes (monta→desmonta→monta de novo) para simular o ciclo de vida — isso é uma fonte conhecida de bugs com bibliotecas que gerenciam recursos externos ao React (como uma instância `xterm.js` presa a um nó DOM real) [CITED: múltiplas fontes sobre o comportamento de `StrictMode` em React 18/19]. Se o efeito de montagem não for pareado corretamente com sua função de limpeza (dispose), o segundo ciclo de montagem pode criar uma instância órfã sem referência, ou tentar reusar uma instância já descartada. **How to avoid:** garantir que toda montagem de `Terminal` tenha exatamente uma função de limpeza simétrica que chama `.dispose()`; testar o componente `TerminalView` explicitamente em modo dev (com `StrictMode` ativo) antes de considerar o ciclo de vida "pronto" — não confiar só no comportamento em build de produção (onde `StrictMode` não duplica efeitos).

**Phase to address:** Esta fase, no design de `TerminalView.tsx`.

### Pitfall 5: Confundir "arquivar/excluir sessão" (SESS-06) com apagar o histórico do Claude Code

SESS-06 pede encerramento limpo da árvore de **processos** — isso não implica apagar o arquivo `.jsonl` correspondente em `~/.claude/projects/`, que é um dado que pertence ao Claude Code, não ao GSD Cards (mesmo princípio de "não escrever num filesystem de outra ferramenta sem necessidade explícita" já aplicado a `.planning/`). **How to avoid:** nesta fase, "arquivar/excluir" deve significar: matar o processo PTY (se vivo) + remover a sessão da lista visível/ativa do app. Um registro persistente de "sessões arquivadas pelo usuário" que sobrevive a reaberturas do app (para não ela reaparecer na lista após reabrir) é, estritamente, um dado do **próprio app** (não do Claude Code) — mas persistir esse registro entre reaberturas do app é o mesmo problema de `AppStateStore` que `ARCHITECTURE.md` já reserva para a Fase 4 (SESS-04/05). Um botão de "excluir definitivamente o histórico desta conversa" (apagando o `.jsonl` de fato) é uma ação destrutiva sobre dado de outra ferramenta e deveria, no mínimo, ter uma confirmação explícita separada — considerar se isso é sequer necessário para o MVP desta fase, dado que SESS-06 fala de processos, não de arquivos de histórico.

**Phase to address:** Esta fase (para o escopo mínimo — matar processo + esconder da lista) e Fase 4 (para persistência do registro de arquivamento entre reaberturas do app).

### Pitfall 6: Detectar dependências ausentes tarde demais (depois de já tentar spawnar)

Se `spawn_session` for chamado sem checar antes se `claude` está no PATH, o erro que o usuário vê é o erro genérico de "programa não encontrado" do `portable-pty`/SO — confuso e sem instrução de correção (já documentado como UX Pitfall em `research/PITFALLS.md`: "Fingir que o app funciona igual sem Claude CLI/gsd-core instalados"). **How to avoid:** checar `check_claude_on_path` antes de habilitar qualquer botão de "nova sessão" na sidebar, mostrando a tela de instrução de instalação em vez do botão quando ausente (PROJ-04) — nunca deixar o usuário descobrir a ausência só depois de tentar criar uma sessão.

**Phase to address:** Esta fase.

## Code Examples

### Comando de resize propagado do addon-fit para o PTY

```typescript
// src/components/terminal/TerminalView.tsx (trecho)
import { FitAddon } from "@xterm/addon-fit";

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
fitAddon.fit();
await invoke("resize_session", { sessionId, cols: terminal.cols, rows: terminal.rows });

// Reagir a resize do container (ex.: ResizeObserver no elemento do drawer)
resizeObserver.observe(container);
function onContainerResize() {
  fitAddon.fit();
  void invoke("resize_session", { sessionId, cols: terminal.cols, rows: terminal.rows });
}
```

```rust
// src-tauri/src/pty.rs (trecho)
#[tauri::command]
pub fn resize_session(state: State<'_, PtyManager>, session_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let mut sessions = state.0.lock().map_err(|_| "PtyManager mutex poisoned".to_string())?;
    let session = sessions.get_mut(&session_id).ok_or("Sessão não encontrada")?;
    session.master.resize(portable_pty::PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("Falha ao redimensionar PTY: {e}"))
}
```

### Detecção de `claude` no PATH (PROJ-04)

```rust
// src-tauri/src/dependencies.rs
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyStatus {
    pub claude_path: Option<String>,
}

#[tauri::command]
pub fn check_claude_on_path() -> DependencyStatus {
    DependencyStatus {
        claude_path: which::which("claude").ok().map(|p| p.to_string_lossy().to_string()),
    }
}
```

### Codificação do diretório de sessões (`/` → `-`, verificado localmente)

```rust
// src-tauri/src/sessions.rs
fn encode_project_path(root: &str) -> String {
    // Verificado nesta máquina: /home/user/gsd-cards -> -home-user-gsd-cards
    // (cada separador de caminho vira um traço; a regra vale igual no Windows
    // após normalizar `\` para `/` primeiro).
    let normalized = root.replace('\\', "/");
    normalized.replace('/', "-")
}
```

### Filtro de listagem de sessões (só `.jsonl` de topo, nunca `subagents/`)

```typescript
// src/sessions/discover.ts
import { readDir, stat } from "@tauri-apps/plugin-fs";

export async function listSessions(encodedDir: string) {
  const entries = await readDir(encodedDir);
  const jsonlFiles = entries.filter(
    (entry) => !entry.isDirectory && entry.name.endsWith(".jsonl"),
  );
  return Promise.all(
    jsonlFiles.map(async (entry) => {
      const info = await stat(`${encodedDir}/${entry.name}`);
      return {
        id: entry.name.replace(/\.jsonl$/, ""),
        lastModified: info.mtime,
      };
    }),
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `xterm-addon-*` sem escopo | `@xterm/*` com escopo | Já documentado no `STACK.md` da Fase 1 | Esta fase é a primeira a de fato instalar esses pacotes — confirmar que nenhum exemplo copiado de fontes antigas usa o namespace antigo |
| `node-pty` + rebuild de ABI do Electron | `portable-pty` compilado nativamente com o binário Rust do Tauri (sem rebuild de ABI) | Decisão já travada na Fase 1 (D-01) | Elimina inteiramente a classe de bugs "funciona em dev, quebra no instalador empacotado" documentada em `PITFALLS.md` Pitfall 3 — mas troca por uma nova responsabilidade (Job Objects/process groups) que `node-pty`/Electron também não resolveriam de graça |
| Matar só o PID direto do processo de terminal | Job Object (Windows) / process group (Unix) como mecanismo primário, `Child::kill()` como rede de segurança | Não é uma mudança recente de versão — é a lacuna que esta pesquisa fecha para o roadmap deste projeto | Determina inteiramente a correção de SESS-06 |

**Deprecated/outdated:** Nenhuma mudança recente de versão relevante além das já documentadas na Fase 1; o achado desta fase é de **arquitetura correta**, não de biblioteca desatualizada.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | O crate `win32job` expõe um método para associar um processo **filho já spawnado** (não só `assign_current_process()`) a um `Job` — assumido pela lógica central de Pattern 2, mas o nome exato do método não foi confirmado via leitura direta do código-fonte do crate nesta sessão (só exemplos de busca, que mostram majoritariamente o caso "processo atual") | Pattern 2, Code Examples | Alto se o método não existir com essa assinatura exata — bloquearia a implementação inteira do mecanismo de Windows; mitigação: primeira tarefa da Wave de implementação deve ser um spike isolado confirmando a API real do crate (`cargo doc --open` local ou leitura do código-fonte baixado), antes de escrever o resto de `process_guard.rs` |
| A2 | Um processo anexado ao lado slave de um PTY sempre vira líder de uma nova sessão/grupo por padrão no Unix (premissa central de que `killpg` no Unix alcança os descendentes do `claude`) | Pattern 2 | Médio — se `portable-pty` não fizer `setsid()` implicitamente ao abrir o slave em alguma plataforma Unix específica (BSD/macOS podem ter nuances), `killpg` pode não cobrir a árvore inteira; mitigação: testar explicitamente em macOS/Linux reais como parte do UAT desta fase (SESS-06), não confiar só na leitura de documentação |
| A3 | "gsd-core instalado" (PROJ-04) é melhor modelado como checagem de existência de diretório (`.claude/gsd-core` local-por-projeto ou global) OU `which gsd-tools`, não uma chamada a algum comando de health-check do próprio gsd-core — não foi encontrado nenhum comando "doctor" no código-fonte lido | Pattern 5 | Baixo — reversível, é só lógica de detecção; se o gsd-core ganhar um comando de health-check oficial no futuro, trocar a implementação é isolado a `dependencies.rs`/`project.rs` |
| A4 | A combinação exata "buffer de bytes em memória enquanto uma sessão está sem instância `xterm.js` montada" (Pattern 3, passo de perda de foco) é uma composição desta pesquisa sobre os padrões oficiais dos addons, não um exemplo documentado literalmente em nenhuma fonte única consultada | Pattern 3 | Baixo-Médio — é lógica de aplicação relativamente simples (array de bytes + flush ordenado), mas deve ser coberta por um teste específico ("sessão em background continua produzindo saída, trocar de volta mostra tudo sem lacunas") antes de considerar o pattern validado |

**Nota geral de confiança:** ao contrário da Fase 1 (onde a maioria dos achados críticos veio de leitura direta de código-fonte do gsd-core), esta fase depende mais de documentação oficial de terceiros (crates.io, READMEs do xterm.js, docs da Microsoft) cruzada via busca — Context7 MCP não estava disponível nesta sessão (ver `## Sources`), então as tags `[CITED]` refletem página oficial encontrada e lida via busca/fetch, não um SDK de documentação estruturado. Os achados verificados **por inspeção direta desta máquina** (regra de codificação de `~/.claude/projects/`, estrutura real do `.jsonl`, ausência de toolchain irrelevante aqui pois já resolvida na Fase 1) mantêm tag `[VERIFIED]`/HIGH.

## Open Questions

1. **Vale a pena extrair um título amigável da primeira mensagem de usuário do `.jsonl`, ou o `id`+timestamp bruto é suficiente para o MVP desta fase?**
   - What we know: SESS-01 só exige "vê as sessões... na sidebar", sem especificar um formato de exibição; ler o conteúdo do `.jsonl` para isso reintroduz o risco de arquivo grande (Pitfall 3).
   - What's unclear: se a experiência de "todas as sessões mostram só um UUID + data" é boa o suficiente para o UAT desta fase, ou se o usuário vai achar isso inutilizável com 3+ sessões abertas.
   - Recommendation: MVP com `id` truncado + timestamp relativo (`date-fns`, já na stack) para esta fase; se o UAT rejeitar isso, um comando Rust de streaming-read (não `plugin-fs.readTextFile`) para extrair só a primeira mensagem de usuário é a extensão segura, documentada aqui para não ser esquecida.

2. **A checagem de gsd-core (Pattern 5) deve olhar só o projeto atualmente aberto, ou também os runtimes de outras ferramentas de IA (`.codex/`, `.cursor/`, etc.) que o próprio ecossistema gsd-core já suporta?**
   - What we know: o `PROJECT.md`/`CLAUDE.md` deste app descrevem o v1 como especificamente "Claude CLI + gsd-core", não multi-runtime (RUN-01 é v2/deferred).
   - What's unclear: se checar só `.claude/gsd-core` (e variantes do home do Claude) é suficiente, ou se vale já checar `.codex/gsd-core` etc. por robustez, mesmo sem suportar spawnar outros runtimes ainda.
   - Recommendation: escopo mínimo desta fase — checar só as localizações relacionadas ao Claude Code (`.claude/gsd-core` local e global, `gsd-tools` no PATH), consistente com o v1 ser Claude-only; ampliar só quando RUN-01 virar requisito real.

3. **`win32job::Job::assign_process` (ou nome equivalente) — confirmar assinatura exata antes de comprometer o design de `process_guard.rs`.**
   - What we know: a API existe conceitualmente (é o propósito central do crate), exemplos de busca mostram só o caso `assign_current_process()`.
   - What's unclear: nome exato do método para um processo filho arbitrário, e se ele recebe um `HANDLE` bruto do Windows ou algo já tipado que o `portable-pty::Child` expõe diretamente.
   - Recommendation: primeira tarefa de implementação (spike isolado, sem lógica de produto acoplada) deve confirmar isso lendo o código-fonte do crate ou rodando `cargo doc --open` localmente, antes de escrever o resto do módulo — ver Assumptions Log A1.

## Environment Availability

> Esta fase depende só de pacotes de registry (npm/crates.io) — as dependências de ambiente já resolvidas na Fase 1 (toolchain Rust, MSVC Build Tools, Node/npm) continuam válidas e não são reauditadas aqui. A única dependência de ambiente **nova e específica desta fase** é a presença do próprio `claude` CLI, que é ao mesmo tempo um pré-requisito de teste desta pesquisa e um requisito funcional do produto (PROJ-04).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Claude CLI (`claude`) no PATH | Todo o fluxo de sessão (SESS-02, TERM-01) | ✓ | 2.1.218 [VERIFIED: probe local, `claude --version`, 2026-07-23] | — (é exatamente o caso que PROJ-04 precisa detectar e comunicar quando ausente numa máquina de usuário real) |
| gsd-core instalado | Não é uma dependência de build desta fase, mas o cenário que PROJ-04 detecta | ✓ (local-por-projeto, `.claude/gsd-core/`) [VERIFIED: probe local, 2026-07-23] | — | — |
| Rust toolchain + MSVC Build Tools | Compilar os novos crates (`portable-pty`, `win32job`, `nix`, `which`) | Não reverificado nesta sessão — ver `01-RESEARCH.md` Pitfall 5 (bloqueio já documentado na Fase 1); assume-se resolvido como pré-condição de Wave 0 da Fase 1, não desta fase | — | — |
| Ambiente Windows real para testar Job Objects | Validar Pattern 2 (mecanismo específico de Windows) | ✗ — esta sessão de pesquisa roda em Linux (probe local: `uname`) | — | **Sem fallback viável para a validação real** — o autor do projeto valida manualmente só no Windows (conforme `CLAUDE.md`); a Wave de implementação desta fase precisa incluir um teste manual explícito em máquina Windows real antes do UAT, não só CI |

**Missing dependencies with no fallback:**
- Ambiente Windows real para validar o mecanismo de Job Object end-to-end (SESS-06) — mitigar com teste manual explícito na máquina de desenvolvimento real do autor (Windows), documentado como parte do `## Validation Architecture` abaixo, já que o CI multiplataforma (D-03 da Fase 1) roda testes automatizados mas não substitui a inspeção manual de "zero processos remanescentes" que só faz sentido numa máquina real.

**Missing dependencies with fallback:**
- Nenhuma outra identificada para esta fase.

## Validation Architecture

> `nyquist_validation: true` em `.planning/config.json` — seção obrigatória.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` (já instalado desde a Fase 1) para a lógica de frontend (session-store, discover.ts, algoritmo de foco isolado de DOM real); `cargo test` (já usado em `project.rs`/`planning_watcher.rs`) para a lógica Rust isolável de I/O real (`is_relevant_change`-style — ex.: `encode_project_path`, filtros de `process_guard.rs` que não dependem de spawnar um processo de verdade) |
| Config file | `vitest.config.ts` já existe (Fase 1); nenhum novo framework necessário |
| Quick run command | `npx vitest run src/sessions src/pty src/stores/session-store.test.ts` |
| Full suite command | `npm test` (já existente) + `cargo test` (via `src-tauri/`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROJ-04 | `check_claude_on_path` retorna caminho quando presente, `None` quando ausente (mockar `which`) | unit (Rust) | `cargo test check_claude_on_path` | ❌ Wave 0 |
| SESS-01 | `encode_project_path` reproduz exatamente a regra verificada (`/a/b` → `-a-b`) | unit (Rust) | `cargo test encode_project_path` | ❌ Wave 0 |
| SESS-01 | `listSessions` filtra `subagents/` e arquivos não-`.jsonl`, extrai só `id`+`lastModified` | unit (TS, fixture de diretório simulado) | `vitest run src/sessions/discover.test.ts` | ❌ Wave 0 |
| SESS-02, TERM-01 | `spawn_session` sobe um processo real, escreve/lê através do Channel — **não automatizável em unit test puro** (depende de spawnar um binário real) | integration manual + smoke test com um binário de eco simples no lugar de `claude` em CI | Documentar como UAT manual desta fase; smoke test de CI pode usar `cat`/`cmd /c type` como substituto do `claude` real, só para validar o caminho de dados PTY→Channel→xterm | ❌ Wave 0 (smoke test com binário substituto) |
| SESS-03 | Algoritmo de foco (Pattern 3) — dispose/serialize/restore/flush de buffer — isolável de DOM real via mocks de `Terminal`/`SerializeAddon` | unit (TS) | `vitest run src/components/terminal/focus-algorithm.test.ts` | ❌ Wave 0 |
| SESS-06 | **Não automatizável de forma confiável em CI multiplataforma** — depende de inspecionar processos reais do SO após kill | manual (UAT explícito) | Abrir N sessões reais, matar cada uma (e o app inteiro), inspecionar Task Manager (Windows)/`ps -ef` (Unix) confirmando zero processos remanescentes | Ver nota abaixo |
| TERM-02 | `@xterm/addon-web-links` detecta URL no output e a torna clicável | manual (UAT) — bibliotecas de terminal são notoriamente difíceis de testar via DOM headless com fidelidade | UAT explícito: gerar uma URL no output do `claude` (ex.: pedir para ele imprimir uma), confirmar que fica clicável | — |
| TERM-03 | `addon-search` encontra ocorrência de texto no scrollback | manual (UAT) ou component test com Testing Library se o addon expuser uma API testável sem canvas real | `vitest run src/components/terminal/search.test.tsx` (se viável) ou UAT manual | ❌ Wave 0 (avaliar viabilidade durante a implementação) |

**Nota sobre SESS-06 não ser automatizável em CI:** matar um Job Object/process group e depois inspecionar se sobrou algum processo exige rodar de fato num SO real com processos reais — isso é possível em CI (`windows-latest`/`ubuntu-latest`/`macos-latest` já fazem parte da matrix D-03 da Fase 1), mas o teste correto **não é** um unit test, é um teste de processo real: spawnar um script auxiliar que por sua vez spawna um neto (simulando `claude` spawnando `git`), matar a árvore pelo mecanismo desta pesquisa, e no próprio processo de teste verificar (via `sysinfo`/`tasklist`/`ps`) que nenhum PID da árvore original ainda existe. Recomenda-se que a Wave de implementação desta fase inclua esse teste como um `cargo test` de integração (não unit puro) rodando na matrix de CI já existente — é automatizável, só não é um teste unitário no sentido estrito.

### Sampling Rate
- **Per task commit:** `npx vitest run src/sessions src/pty src/stores` (frontend) + `cargo test` (Rust, dentro de `src-tauri/`)
- **Per wave merge:** `npm test` completo + `cargo test` completo + smoke test manual de "criar sessão, ver output real do `claude` aparecer no terminal"
- **Phase gate:** Suite completa verde + UAT manual explícito de SESS-06 (abrir N sessões, matar individualmente e via fechar o app inteiro, inspecionar processos reais no SO — Windows real, conforme a máquina de validação do autor) antes de `/gsd-verify-work`, tratado como critério de fundação não-negociável, não uma verificação opcional

### Wave 0 Gaps
- [ ] `src-tauri/src/process_guard.rs` — não existe ainda; primeira tarefa deve ser o spike de confirmação da API real do `win32job` (Assumptions Log A1) antes de qualquer outro código depender dele
- [ ] `vitest run src/sessions/discover.test.ts`, `src/components/terminal/focus-algorithm.test.ts` — nenhum fixture/mock de `Terminal`/`Channel` existe ainda
- [ ] Um binário auxiliar simples de teste (ex.: um script que imprime, aguarda, e spawna um "neto" de vida curta) para o teste de integração de SESS-06 descrito acima — precisa ser criado como parte da Wave 0 desta fase, não reaproveitado de nenhum lugar existente
- [ ] Confirmar viabilidade de testar `@xterm/addon-search` sem canvas real (Testing Library + jsdom, já presentes desde a Fase 1) — se inviável, documentar como UAT manual permanente

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: "high"` em `.planning/config.json` — seção obrigatória. Esta fase introduz a primeira superfície real de execução de processo arbitrário do app (spawnar um shell interativo de verdade), então o escopo de segurança é maior que o da Fase 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture, Design and Threat Modeling | yes | Nenhum comando novo desta fase passa por capabilities/ACL de plugin (comandos de app registrados via `invoke_handler` são liberados por padrão para todas as janelas do app, [CITED: docs oficiais Tauri v2 sobre permissões de comandos de app vs. plugin]) — a superfície de confiança relevante é "o próprio código Rust do app", não uma allowlist externa; qualquer validação de entrada (ex.: `cwd` do `spawn_session`) deve acontecer dentro do próprio comando, replicando o padrão de `validate_project_root` (canonicalizar, checar containment) |
| V2 Authentication | no | App local single-user, sem conceito de autenticação nesta fase |
| V3 Session Management | partial | "Sessão" aqui é um conceito de produto (processo PTY + registro lógico), não uma sessão de autenticação — mas a mesma disciplina de "nunca confiar em estado implícito" aplica: o `PtyManager` é a única fonte de verdade sobre quais sessões estão de fato vivas, o frontend nunca assume que uma sessão está viva sem confirmar via o backend |
| V4 Access Control | no | N/A — sem múltiplos usuários/papéis |
| V5 Input Validation and Output Encoding | yes | O `cwd` passado a `spawn_session` deve ser o `root` já canonicalizado e validado por `validate_project_root` (Fase 1) — nunca um caminho cru vindo direto de outra fonte do frontend; dados escritos no PTY (input do usuário no terminal) não precisam de sanitização própria do app (é um terminal real, o shell/CLI de destino é responsável por sua própria interpretação), mas comandos `/gsd-*` disparados programaticamente por cards (Fase 3, fora de escopo aqui) deverão tratar isso com cuidado adicional |
| V6 Cryptography | no | Nenhum segredo novo armazenado nesta fase |
| V12/V13 File and Resources / API and Web Service | yes | Escopo de `@tauri-apps/plugin-fs` para `~/.claude/projects/<encoded>/` deve ser concedido **só** para a subpasta do projeto atualmente aberto (Pattern 6) — nunca `~/.claude/projects/` inteira, que vazaria a existência/metadados de sessões de outros projetos não relacionados do mesmo usuário |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Escalada de escopo de filesystem via concessão ampla demais para `~/.claude/projects/` | Information Disclosure | Escopo estreito por subpasta codificada do projeto atual (Pattern 6), nunca a pasta pai inteira |
| Processo zumbi/órfão sobrevivendo ao encerramento de uma sessão ou do app — não é classicamente "STRIDE" mas é um risco de disponibilidade/recursos real deste domínio | Denial of Service (esgotamento de recursos do próprio usuário) | Job Object (Windows)/process group (Unix) como mecanismo primário de kill + handler de `RunEvent::ExitRequested` cobrindo o shutdown do app inteiro (Pattern 2) |
| `cwd` de `spawn_session` recebendo um caminho não validado/não canonicalizado do frontend | Tampering (spawnar `claude` num diretório inesperado, potencialmente fora do projeto GSD legítimo) | Sempre usar o `root` já canonicalizado e validado pelo `validate_project_root` da Fase 1 como única fonte do `cwd` — nunca aceitar um caminho cru adicional vindo de outro lugar do frontend para este parâmetro |
| Vazamento de variáveis de ambiente específicas do runtime do app para o processo `claude` spawnado (ex.: tokens/segredos do próprio processo Tauri) | Information Disclosure | Ao construir o `CommandBuilder`, herdar o ambiente do usuário (necessário para o `claude` funcionar normalmente — PATH, HOME, etc.), mas nunca injetar variáveis específicas do processo Tauri/app que não fariam sentido vazar para um shell interativo que o usuário vai digitar comandos livremente dentro |
| Renderização de output do terminal contendo sequências de escape maliciosas/inesperadas | Tampering (visual) | xterm.js já sanitiza/interpreta sequências ANSI de forma segura por design (é sua função central) — não usar `dangerouslySetInnerHTML` em nenhum lugar do fluxo de terminal; o output vai sempre por `terminal.write()`, nunca por renderização HTML direta |

## Sources

### Primary (HIGH confidence)
- Probe local desta máquina: `ls -la ~/.claude/projects/`, inspeção do `.jsonl` real de sessão, `stat`/`date` do arquivo — executado diretamente, 2026-07-23 — confirma a regra de codificação `/` → `-` e a existência de `subagents/`/linhas de infraestrutura não-mensagem
- Probe local: `which claude`, `claude --version` (2.1.218), `find` por `.claude/gsd-core` — executado diretamente, 2026-07-23 — confirma o padrão de instalação local-por-projeto do gsd-core
- `curl https://crates.io/api/v1/crates/{portable-pty,win32job,which,nix}` — executado diretamente, 2026-07-23 — versões, downloads, repositórios
- `npm view @xterm/{xterm,addon-fit,addon-webgl,addon-search,addon-serialize,addon-web-links} version` — executado diretamente, 2026-07-23
- `gsd-tools query package-legitimacy check` (ecossistemas npm e crates) — executado diretamente, 2026-07-23

### Secondary (MEDIUM confidence)
- Microsoft Learn — `Job Objects`, `AssignProcessToJobObject` (`learn.microsoft.com/windows/win32/procthread/job-objects`) — comportamento de herança de job por processos filhos
- `github.com/ohadravid/win32job-rs` (README, via busca/fetch) — exemplo de uso de `Job::create`/`ExtendedLimitInfo`/`limit_kill_on_job_close`
- `docs.rs/portable-pty` (via busca) — API de `PtySize`, `CommandBuilder`, `try_clone_reader`, `take_writer`
- `docs.rs/tauri/latest/tauri/ipc/struct.Channel.html`, `v2.tauri.app/develop/calling-rust/` (via busca) — exemplo de `Channel<T>` e uso no frontend (`new Channel()`, `onmessage`)
- `github.com/tauri-apps/tauri` PR #14269 ("optimize raw payload in event system") e issue #13405 — suporte a payload binário em eventos/channels do Tauri v2
- `github.com/xtermjs/xterm.js/blob/master/addons/addon-webgl/README.md` (via fetch) — `WebglAddon`, `onContextLoss`, `dispose()`
- `npmjs.com/package/@xterm/addon-serialize` (via busca) — `serialize()`/`serializeAsHTML()`, caso de uso de restauração de estado
- `github.com/xtermjs/xterm.js` issue #2326 ("Allow arbitrary binary data for triggerDataEvent/onData") — confirma que `Terminal.write` aceita `Uint8Array` com decodificação UTF-8 incremental própria
- Múltiplas fontes sobre `setsid`/sessões de PTY no Unix (man pages, artigos técnicos cruzados via busca) — comportamento de líder de sessão/grupo ao abrir um PTY slave
- `code.claude.com/docs/en/sessions` (herdado da pesquisa de projeto `ARCHITECTURE.md`, já MEDIUM/HIGH lá) — estrutura `~/.claude/projects/<encoded>/<session-id>.jsonl`, agora corroborado por observação direta nesta sessão

### Tertiary (LOW confidence)
- Assinatura exata de `win32job::Job` para associar um processo filho arbitrário (não o processo atual) — não confirmada por leitura direta do código-fonte do crate nesta sessão, só por exemplos de busca que mostram majoritariamente `assign_current_process()`; ver `## Assumptions Log` A1 e `## Open Questions` #3
- Generalização de que o padrão `subagents/`/linha `queue-operation` observado nesta máquina se replica identicamente em toda instalação Claude Code — confirmado só localmente, não contra múltiplas instalações

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH para versões (todas verificadas via `npm view`/`curl crates.io` diretos nesta sessão) — MEDIUM para a completude da lista (achado de `@xterm/addon-web-links` ausente do `CLAUDE.md` original é desta pesquisa, não herdado)
- Architecture (encerramento de árvore de processos): MEDIUM-HIGH — a escolha de mecanismo (Job Object/process group) é HIGH (documentação oficial da Microsoft + comportamento de PTY bem estabelecido), mas a assinatura exata da API do crate `win32job` para o caso de uso central (associar processo filho, não o atual) precisa de confirmação na implementação
- Pitfalls: HIGH para os pitfalls herdados de `research/PITFALLS.md` (fontes primárias: issues oficiais do `anthropics/claude-code`/`microsoft/node-pty`); MEDIUM para os pitfalls novos desta pesquisa (StrictMode, jsonl grande, escopo de sessão vs. histórico) — raciocínio direto a partir de fontes verificadas, mas sem um caso relatado publicamente específico deste app

**Research date:** 2026-07-23
**Valid until:** 30 dias para versões de pacotes npm/crates.io (ecossistema muda rápido); a regra de codificação de `~/.claude/projects/` e o comportamento de Job Objects/process groups são estáveis por natureza (mecanismos de SO/formato interno do Claude Code) — mas revalidar a estrutura do `.jsonl` se a versão do Claude Code instalada mudar significativamente antes da execução desta fase (mesma cautela já registrada para o parser gsd-core na Fase 1)
