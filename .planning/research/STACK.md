# Stack Research

**Domain:** App desktop (Electron/Tauri) que orquestra Claude CLI + gsd-core: terminais PTY embutidos, file watching de markdown, board kanban
**Researched:** 2026-07-22
**Confidence:** MEDIUM-HIGH (decisão de framework: MEDIUM-HIGH; versões de bibliotecas: HIGH, verificadas direto no registry.npmjs.org/crates.io em 2026-07-22; comparações de ecossistema: MEDIUM, cross-checadas em múltiplas fontes — vários resultados de busca vieram de sites de conteúdo agregado/SEO sobre "Tauri vs Electron 2026" que foram tratados como MEDIUM apenas quando confirmados por fontes primárias como docs oficiais, GitHub e exemplos reais de produtos comparáveis)

## Decisão Central: Tauri v2, não Electron

**Veredito: Tauri v2.** Confiança: MEDIUM-HIGH.

Por quê, especificamente para este projeto (não em geral):

1. **Múltiplos terminais persistentes em background é o caso de uso que mais penaliza Electron.** Cada `BrowserWindow`/processo Electron carrega um Chromium completo (~150-300MB ociosos, instaladores 100MB+); Tauri usa o WebView2 nativo do Windows (já instalado no Windows 11) e roda ocioso em ~30-60MB, com bundles de dígito único de MB. Como o app existe para manter várias sessões do `claude` vivas ao mesmo tempo, o custo fixo por processo importa mais do que num app de janela única.
2. **`node-pty` no Windows é uma fonte real e documentada de atrito para contribuidores JS.** É um addon nativo que precisa ser recompilado contra o ABI do Node embutido no Electron via `@electron/rebuild` — exige Visual Studio Build Tools, Python e node-gyp na máquina de quem for compilar, e historicamente arrasta consigo o `winpty` como fallback para consoles antigos. Isso é exatamente o tipo de fricção que afasta contribuidores de um projeto open-source pt-BR/en. Em Rust, `portable-pty` (crate do projeto wezterm) já embute suporte nativo a ConPTY sem esse fallback, e não precisa de rebuild de ABI porque é compilado diretamente com o binário Rust do app.
3. **Precedente direto no mesmo domínio.** Ferramentas comparáveis — apps de terminal para agentes de IA — escolheram Tauri especificamente por isso: gerenciamento de PTY, protocolo de shell e persistência de sessão feitos em Rust, frontend em xterm.js/React. Não é só teoria de blog; é a escolha replicada por quem já resolveu este problema.
4. **Postura de segurança adequada a um app que fala com um shell de verdade.** O modelo de permissões/capabilities do Tauri (allowlist explícita por comando IPC) é mais defensável para um app open-source rodando `claude` num terminal real do que a superfície ampla do Node integrado ao Electron.
5. **Atualização automática gratuita nos dois, mas Tauri não amarra a assinatura de update a um certificado pago.** O updater do Tauri usa um par de chaves ed25519 próprio (gerado com `tauri signer generate`) independente da assinatura de código do SO — importante para um projeto comunitário sem orçamento para certificado EV.

**Contraponto honesto (por isso não é HIGH):** a base de contribuidores GSD é majoritariamente JS/TS, não Rust. Adotar Tauri implica exigir toolchain Rust para quem mexer no backend (PTY, file watching, comandos IPC). Mitigação recomendada: manter a superfície Rust deliberadamente pequena e "burra" — spawnar/matar PTY, observar arquivos, repassar eventos por IPC — e concentrar toda a lógica de negócio (parsing de markdown, derivação do kanban, i18n, estado da UI) em TypeScript/React. Feito assim, a maioria das mudanças do dia a dia nunca toca o lado Rust.

**Quando reconsiderar Electron:** se o projeto precisar de recursos de automação de desktop mais profundos só disponíveis via Node (ex.: automação de outras apps, certas integrações OS-level), ou se a equipe decidir que nenhum mantenedor quer tocar Rust a longo prazo. Não é o caso hoje pelas Key Decisions do PROJECT.md.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Tauri | 2.11.5 (core Rust) / `@tauri-apps/cli` 2.11.4 / `@tauri-apps/api` 2.11.1 | Shell do app desktop (janela, IPC, bundler, updater) | Menor footprint, PTY nativo via Rust, modelo de permissões mais seguro para um app que controla shells reais; ver decisão acima |
| React | 19.2.8 | UI do board kanban, sidebar de sessões, terminais | Maior ecossistema para drag-and-drop (dnd-kit), virtualização de listas e i18n; equipe provavelmente já conhece React vindo do mundo GSD/Claude Code tooling |
| Vite | 8.1.5 | Bundler/dev server do frontend Tauri | Padrão de fato para frontends Tauri/React em 2026; HMR rápido, plugin oficial `@tauri-apps/cli` já assume Vite nos templates |
| TypeScript | 7.0.x (GA em 08/07/2026, compilador nativo em Go, ~10x mais rápido que o TS6) | Tipagem do frontend inteiro | GA recente confirmado (RC em 18/06/2026, `tsgo` virou o `tsc` padrão do pacote `typescript`); type-checking 8-12x mais rápido é relevante num monorepo com parsing de markdown tipado |
| xterm.js (`@xterm/xterm`) | 6.0.0 | Emulador de terminal no frontend | Padrão de mercado (VS Code, Hyper, muitos apps Tauri); pacotes migraram do namespace antigo `xterm`/`xterm-addon-*` (deprecado) para `@xterm/*` |
| portable-pty (crate Rust) | 0.9.0 | Gerência de processos PTY no backend Rust | Suporte nativo a ConPTY no Windows sem fallback winpty; mesma base usada pelo wezterm; combina naturalmente com Tauri Channels para stream bidirecional |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@xterm/addon-fit` | 0.11.0 | Redimensiona o terminal ao container | Sempre, em todo terminal montado |
| `@xterm/addon-webgl` | 0.19.0 | Renderer acelerado por GPU | Só no terminal **em foco**. Navegadores/Chromium limitam contextos WebGL simultâneos (tipicamente 8-16); com várias sessões vivas em background, ativar WebGL em todas trava ou perde contexto. Ver "Stack Patterns by Variant" |
| `@xterm/addon-canvas` | 0.7.0 | Renderer 2D canvas (fallback) | Alternativa ao DOM renderer padrão para terminais secundários visíveis simultaneamente, se algum dia houver split-view |
| `@xterm/addon-search` | 0.16.0 | Busca no scrollback | Sessões longas do Claude geram scrollback grande; útil desde o v1 |
| `@xterm/addon-serialize` | 0.14.0 | Serializa o buffer do terminal em string/HTML | Peça-chave para "congelar" terminais em background: desmonta o xterm.js real da sessão inativa, guarda o snapshot serializado, e só recria o buffer quando o usuário volta a essa sessão — sem precisar manter WebGL/DOM ativo para todas ao mesmo tempo |
| `notify` + `notify-debouncer-full` (crates Rust) | notify 9.0.0-rc.4 / notify-debouncer-full 0.8.0-rc.2 | File watching de `.planning/` no backend Rust | Implementação direta no lado Rust do Tauri em vez de plugin genérico, para controlar a janela de debounce (GSD escreve vários arquivos em sequência rápida durante um commit de fase — ver `PITFALLS.md`) |
| `@tauri-apps/plugin-fs` | 2.5.1 | Acesso a filesystem do frontend (ler `.planning/`) | Leitura de arquivos a partir do frontend quando não precisar do watch customizado acima |
| `gray-matter` | 4.0.3 | Parse de frontmatter YAML dos artefatos GSD | Extração simples de metadados (status, fase, datas) dos `.md` — mais robusto e popular (6,6M downloads/semana) que alternativas do tipo `front-matter`/`yaml-front-matter` |
| `unified` + `remark-parse` + `remark-gfm` + `react-markdown` | unified 11.0.5 / remark-parse 11.0.0 / remark-gfm 4.0.1 / react-markdown 10.1.0 | Parse de AST markdown + render do conteúdo (checklists, tabelas) dos PLAN.md/SUMMARY.md nos cards expandidos | Quando o board precisar renderizar o corpo do markdown (não só o frontmatter) com fidelidade — tabelas GFM, listas de tarefas `- [ ]` |
| `zustand` | 5.0.14 | Estado global do frontend (projetos, sessões, board derivado dos arquivos) | API por hooks sem boilerplate de Provider; ideal para estado "empurrado" por eventos de IPC/file-watch — o backend notifica mudança de arquivo, um único `set()` atualiza a árvore do board |
| `immer` | 11.1.15 | Atualizações imutáveis dentro do zustand | Ao mesclar diffs de arquivo no estado do board (ex.: só uma fase mudou de status), evita reescrever a árvore inteira manualmente |
| `@dnd-kit/core` + `@dnd-kit/sortable` | 6.3.1 / 10.0.0 | Interações de arrastar (se houver) no board kanban | Ver nota em "What NOT to Use" — o board é **read-only** por decisão de produto (PROJECT.md), então dnd-kit só entra se/quando reordenação manual virar requisito; documentado aqui para não escolher a alternativa errada quando isso acontecer |
| `i18next` + `react-i18next` | 26.3.6 / 17.0.11 | i18n pt-BR/en | Padrão de fato para i18n em React; estrutura de arquivos `/locales/en`, `/locales/pt-BR` mapeia direto no requisito do PROJECT.md |
| `date-fns` | 4.4.0 | Formatação de datas/timestamps dos artefatos (locale-aware) | Formatar timestamps de `STATE.md`/frontmatter respeitando o locale ativo (pt-BR vs en) |
| `@tanstack/react-virtual` | 3.14.8 | Virtualização de listas longas | Projetos com muitas fases/sessões, ou scrollback muito longo fora do xterm — evita re-render de centenas de cards |
| `tailwindcss` | 4.3.3 | Estilização utilitária | Padrão atual para apps React modernos; produtividade alta para um board com muitos estados visuais (por status de fase) |
| `lucide-react` | 1.25.0 | Ícones | Biblioteca de ícones leve e consistente, comum em stacks Tailwind/shadcn |
| `class-variance-authority` | 0.7.1 | Variantes de componentes (botões, badges de status) | Combinada com Tailwind para os estados visuais dos cards (a fazer / em progresso / bloqueado / concluído) |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Rust toolchain (rustup, MSVC build tools no Windows) | Compilar o backend Tauri | No Windows, exige "Desktop development with C++" do Visual Studio Build Tools — documentar isso claramente no CONTRIBUTING para não surpreender contribuidores JS |
| `cargo-tauri` (via `@tauri-apps/cli`) | CLI de dev/build do Tauri | `tauri dev`, `tauri build`, geração de ícones, geração de chaves do updater (`tauri signer generate`) |
| ESLint + Prettier (config TS7-aware) | Lint/format do frontend | TypeScript 7 muda o compilador mas mantém compatibilidade de tipos; conferir plugins de lint que ainda dependem do `tsc` antigo antes de migrar totalmente |
| GitHub Actions com matrix Windows/macOS/Linux | CI de build multiplataforma | Necessário desde o dia 1 porque o app é cross-platform mas o autor só valida manualmente no Windows — CI pega quebras de build no Rust/PTY nas outras plataformas |

## Installation

```bash
# Scaffold inicial (gera projeto Tauri + Vite + React + TS)
npm create tauri-app@latest -- --template react-ts

# Core do frontend
npm install @tauri-apps/api@2 @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-search @xterm/addon-serialize
npm install gray-matter unified remark-parse remark-gfm react-markdown
npm install zustand immer i18next react-i18next date-fns
npm install @tanstack/react-virtual tailwindcss class-variance-authority lucide-react

# Só quando/se reordenação manual do board virar requisito
npm install @dnd-kit/core @dnd-kit/sortable

# Plugins Tauri (lado JS)
npm install @tauri-apps/plugin-fs

# Dev dependencies
npm install -D typescript vite @vitejs/plugin-react

# Lado Rust (Cargo.toml do src-tauri)
cargo add portable-pty notify notify-debouncer-full
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Tauri v2 | Electron 43.2.0 + `node-pty` 1.1.0 + `electron-builder` 26.15.3 | Se o time de contribuidores for exclusivamente JS/TS e nunca quiser tocar Rust, ou se surgir necessidade de integração OS-level só disponível via Node nativo. Nesse caso: `node-pty` (ConPTY nativo desde Windows 10 1809+, sem winpty) + `@electron/rebuild` no postinstall + `electron-builder`/`electron-updater` para empacotar e atualizar |
| `portable-pty` (Rust) | `node-pty` (Node) | Só junto com a escolha de Electron acima |
| `notify` + `notify-debouncer-full` (Rust, direto no backend Tauri) | `chokidar` 5.0.0 (Node) ou `@parcel/watcher` 2.6.0 (Node) | Se o app fosse Electron: `chokidar` é suficiente para o volume pequeno de arquivos de `.planning/` (não é um caso de 50k+ arquivos onde `@parcel/watcher` compensa); usar a opção `awaitWriteFinish` para lidar com escritas sequenciais rápidas |
| `zustand` | Redux Toolkit | Se o estado global crescer para o ponto de precisar de DevTools de time-travel debugging estruturado com múltiplos desenvolvedores simultâneos e regras de mutação rígidas — não é o caso de um app de estado derivado de arquivo com poucos "domínios" (projetos, sessões, board) |
| `zustand` | Jotai | Se a granularidade de re-render por átomo individual virar gargalo real (medido, não hipotético) — improvável dado que o board já é re-derivado em blocos por arquivo, não por campo individual |
| `dnd-kit` | `react-beautiful-dnd` | Nunca recomendado para projeto novo: `react-beautiful-dnd` está sem manutenção desde 2023. Só usar se precisar das animações prontas que ele tem e aceitar o risco de manutenção |
| `react-markdown` + `remark-gfm` | `marked` / `markdown-it` | Se precisar apenas de HTML final rápido sem manipular a AST (ex.: preview simples) — perde a facilidade de plugar `remark-gfm` para checklists/tabelas GFM dos artefatos GSD |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `xterm-addon-webgl` / `xterm-addon-fit` (pacotes antigos sem escopo) | Deprecados em favor dos pacotes `@xterm/*` | `@xterm/addon-webgl`, `@xterm/addon-fit`, etc. |
| WebGL addon em **todos** os terminais simultaneamente | Contextos WebGL são limitados pelo Chromium/navegador (tipicamente 8-16 simultâneos); com várias sessões persistentes em background isso estoura, causando perda de contexto (`webglcontextlost`) ou travamento visual | Ativar WebGL só no terminal em foco; terminais em background usam o renderer DOM padrão (sem addon) ou ficam desmontados com o buffer congelado via `addon-serialize` |
| `react-beautiful-dnd` | Sem manutenção desde 2023; risco de incompatibilidade futura com React 19+ | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Editar `.planning/` pela UI (input bidirecional no board) | Contraria decisão explícita do PROJECT.md ("Board é read-only... GSD permanece a fonte da verdade"); qualquer lib de edição de markdown WYSIWYG está fora de escopo do v1 | Board somente leitura; toda escrita acontece via comandos `/gsd-*` disparados no terminal |
| Parsing de markdown com regex manual | Formato dos artefatos GSD evolui (branch `next` do gsd-core); regex quebra silenciosamente com pequenas variações de formatação | `gray-matter` para frontmatter + `unified`/`remark-parse` para o corpo, com parser resiliente e testes contra variações reais de artefatos |
| Depender só do updater nativo do SO sem o updater do Tauri | Sem assinatura de update própria, um MITM em rede pode servir binário malicioso durante auto-update | Configurar `createUpdaterArtifacts: true` + par de chaves ed25519 do próprio Tauri updater, independente da assinatura de código do SO |
| Node.js puro no lado Electron para lidar com PTY sem `@electron/rebuild` no fluxo de CI/instalação | Native module com ABI desalinhado quebra silenciosamente só em runtime, gerando bug report difícil de reproduzir | Se for pela via Electron: sempre rodar `electron-rebuild`/`@electron/rebuild` como parte do `postinstall`, documentado no CONTRIBUTING |

## Stack Patterns by Variant

**Se o terminal está em foco (ativo na UI):**
- Usar `@xterm/addon-webgl` para renderização
- Porque é o único cenário em que a performance de renderização de texto em alta taxa (streaming do `claude` CLI) realmente importa visualmente para o usuário

**Se o terminal está em background (sessão viva, mas não visível):**
- Manter o processo PTY vivo no backend Rust (via `portable-pty`), mas desmontar/pausar a instância `xterm.js` ou rodá-la sem addon de GPU
- Usar `@xterm/addon-serialize` para guardar um snapshot do buffer ao trocar de sessão, e restaurar/re-hidratar ao voltar
- Porque isso resolve ao mesmo tempo o limite de contextos WebGL do navegador e reduz custo de renderização de N terminais que ninguém está olhando

**Se o volume de arquivos observados crescer muito (múltiplos projetos abertos ao mesmo tempo, cada um com seu `.planning/`):**
- Um watcher `notify` por projeto aberto, com debounce de ~300-500ms tunado empiricamente contra o padrão real de commits do GSD (vários arquivos escritos em sequência rápida)
- Porque um único watcher global recursivo do diretório de projetos raiz seria mais simples, mas perde a granularidade de "qual projeto mudou" sem trabalho extra de filtragem

**Se o requisito de reordenação manual do board (drag-and-drop) entrar no roadmap:**
- Usar `@dnd-kit/core` + `@dnd-kit/sortable`, mas lembrando que isso implica quebrar a regra "board é read-only" do PROJECT.md — precisa virar uma decisão de produto explícita antes, não uma decisão de stack

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `@tauri-apps/api@2.11.1` | `@tauri-apps/cli@2.11.4`, Tauri core `2.11.5` | Manter API/CLI/core na mesma linha major (v2); v1 é legado e não deve ser usado em projeto novo |
| `react@19.2.8` | `react-dom@19.2.8`, `react-i18next@17.0.11`, `@dnd-kit/*@6.x/10.x` | react-i18next 17 já assume React 18+/19; checar changelog se downgrade de React for cogitado |
| `typescript@7.0.x` (tsgo) | Plugins de ESLint/bundlers que dependem de APIs internas do compilador antigo (`tsc` em JS) | Alguns plugins de lint/build ainda não migraram totalmente para o compilador nativo em Go — validar compatibilidade do `@typescript-eslint` atual antes de travar a versão em CI |
| `notify-debouncer-full@0.8.0-rc.2` | `notify@9.0.0-rc.4` | Ambos ainda em release candidate na data da pesquisa (2026-07-22); travar versões exatas no `Cargo.lock` e revisitar quando saírem da RC |
| `@xterm/xterm@6.0.0` | `@xterm/addon-fit@0.11.0`, `@xterm/addon-webgl@0.19.0`, `@xterm/addon-canvas@0.7.0`, `@xterm/addon-search@0.16.0`, `@xterm/addon-serialize@0.14.0` | Todos os addons no escopo `@xterm/*` seguem o major do core; não misturar com os pacotes antigos sem escopo |

## Sources

- npm registry (`registry.npmjs.org`), consultado diretamente em 2026-07-22 — versões exatas de: `@xterm/*`, `node-pty`, `chokidar`, `@parcel/watcher`, `gray-matter`, `react`/`react-dom`, `zustand`, `i18next`/`react-i18next`, `@dnd-kit/*`, `electron`/`electron-builder`/`electron-updater`, `vite`, `typescript`, `tailwindcss`, `@tanstack/react-virtual`, `react-markdown`, `remark-*`/`unified`, `immer`, `date-fns`, `@radix-ui/react-tabs`, `class-variance-authority`, `lucide-react`, `@tauri-apps/cli`, `@tauri-apps/api`, `@tauri-apps/plugin-fs` — HIGH confidence (fonte primária)
- crates.io (`crates.io/api/v1/crates/...`), consultado diretamente em 2026-07-22 — versões de `portable-pty`, `notify`, `tauri`, `tauri-plugin-pty`, `notify-debouncer-full` — HIGH confidence (fonte primária)
- WebSearch (múltiplas queries, ver histórico da sessão) sobre Electron vs Tauri, node-pty/ConPTY, xterm.js addons e limite de contexto WebGL, chokidar vs @parcel/watcher, gray-matter vs remark, dnd-kit vs react-beautiful-dnd, i18next, electron-builder/Tauri updater, zustand/jotai/redux — MEDIUM confidence (cross-checado entre GitHub issues oficiais, npm/docs oficiais e pelo menos duas fontes independentes por afirmação; uma parcela dos resultados de busca sobre "Tauri vs Electron 2026" veio de sites agregadores/SEO de baixa autoria — tratados como MEDIUM só quando a afirmação também apareceu em fonte primária, como issues do próprio `xtermjs/xterm.js` ou docs oficiais do Tauri)
- `github.com/xtermjs/xterm.js` issue #4379 ("Support dozens of terminals on a single page") — confirma o limite prático de contextos WebGL simultâneos, achado central para a arquitetura de múltiplos terminais em background
- `v2.tauri.app/plugin/updater/` e `v2.tauri.app/distribute/` — confirma mecanismo de assinatura própria do updater do Tauri, independente de certificado de assinatura de código do SO
- `github.com/anthropics/claude-code` issue #50891 e docs oficiais do Claude Code (`code.claude.com/docs/en/sessions`) — confirma que sessões ficam em `~/.claude/projects/<projeto>/<session-id>.jsonl`, formato interno sujeito a mudança entre versões (relevante para o parser de sessões do app, tratado com mais detalhe em `ARCHITECTURE.md`/`PITFALLS.md`)

---
*Stack research for: App desktop orquestrador de Claude CLI + gsd-core (terminais PTY, board kanban em tempo real)*
*Researched: 2026-07-22*
