---
phase: 01-espelho-fiel
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - CONTRIBUTING.md
  - .gitignore
  - package.json
  - package-lock.json
  - tsconfig.json
  - tsconfig.node.json
  - index.html
  - vite.config.ts
  - vitest.config.ts
  - src/main.tsx
  - src/App.tsx
  - src/styles/theme.css
  - src/styles/index.css
  - src/i18n.ts
  - src/locales/pt-BR/common.json
  - src/locales/en/common.json
  - src/smoke.test.ts
  - src-tauri/Cargo.toml
  - src-tauri/build.rs
  - src-tauri/src/main.rs
  - src-tauri/src/lib.rs
  - src-tauri/tauri.conf.json
  - src-tauri/capabilities/default.json
  - .github/workflows/ci.yml
autonomous: false
requirements: [PROJ-02]
must_haves:
  truths:
    - "O desenvolvedor consegue rodar `npm run tauri dev` e ver uma janela nativa do app com strings vindas do i18next"
    - "O desenvolvedor consegue rodar a suíte de testes e ela passa"
    - "O app não tem nenhuma permissão de filesystem que permita escrita (board read-only reforçado na camada de capability)"
  artifacts:
    - path: "src-tauri/capabilities/default.json"
      provides: "Allowlist de permissões Tauri v2 somente-leitura"
      contains: "fs:allow-read-text-file"
    - path: "src/styles/theme.css"
      provides: "Design tokens do 01-UI-SPEC.md (cores, espaçamento, tipografia) em Tailwind 4 @theme"
      contains: "@theme"
    - path: "src/i18n.ts"
      provides: "Bootstrap do i18next com namespaces pt-BR/en"
      exports: ["i18n"]
    - path: ".github/workflows/ci.yml"
      provides: "CI matrix Windows/macOS/Linux (D-03)"
      contains: "windows-latest"
    - path: "CONTRIBUTING.md"
      provides: "Pré-requisitos de toolchain documentados"
      contains: "## Pré-requisitos"
  key_links:
    - from: "src/main.tsx"
      to: "src/i18n.ts"
      via: "import do bootstrap i18next antes do render do React"
      pattern: "import.*['\"]\\./i18n['\"]"
    - from: "src/styles/index.css"
      to: "src/styles/theme.css"
      via: "@import dos tokens depois do @import do tailwindcss"
      pattern: "@import.*theme\\.css"

<objective>
Desbloquear o toolchain de compilação e levantar a fundação executável do GSD Cards: um app Tauri v2 + React 19 + TypeScript que abre uma janela nativa, com design tokens do `01-UI-SPEC.md`, i18next configurado desde o primeiro componente (D-04), suíte de testes vitest funcionando e CI multiplataforma (D-03).

Este é o primeiro tijolo do Walking Skeleton: sem ele nenhuma outra fatia da fase pode ser compilada. A `RESEARCH.md` (Pitfall 5, `## Environment Availability`) confirmou por probe direto que a máquina de desenvolvimento **não tem** `rustc`/`cargo`/`rustup` nem o MSVC Build Tools — isso é bloqueio real, não hipotético, e é a primeira tarefa executável.

A superfície Rust nasce mínima por decisão D-01 (Tauri v2 com toda a lógica de produto em TypeScript) e sem qualquer trabalho de PTY (D-02 — PTY fica para a Fase 2).

Purpose: sem toolchain e sem scaffold, nenhuma fatia vertical desta fase existe. Este plano transforma o repositório (hoje só `.planning/`) em um app que roda.
Output: repositório com app Tauri executável, tokens de design, i18n, testes e CI verdes.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-espelho-fiel/01-CONTEXT.md
@.planning/phases/01-espelho-fiel/01-RESEARCH.md
@.planning/phases/01-espelho-fiel/01-UI-SPEC.md
@.planning/phases/01-espelho-fiel/SKELETON.md
@.claude/CLAUDE.md
</context>

## Phase Goal

**As a** desenvolvedor que usa o fluxo GSD no dia a dia, **I want to** abrir uma pasta de projeto e ver um board kanban hierárquico que espelha o `.planning/` em tempo real, **so that** eu saiba com confiança, sem abrir o editor, exatamente onde cada fase do meu projeto está.

> Fatia vertical deste plano: o desenvolvedor consegue **rodar o app** — uma janela nativa abre com conteúdo real renderizado pelo React e traduzido pelo i18next. Antes deste plano não existe binário nenhum.

## Artifacts this phase produces

Símbolos e arquivos criados por **este plano** (novos — não existem no repositório hoje):

| Tipo | Símbolo / caminho |
|---|---|
| Arquivo de config | `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore` |
| Entrypoint React | `src/main.tsx`, `src/App.tsx` |
| CSS | `src/styles/index.css`, `src/styles/theme.css` (bloco `@theme` com os tokens do UI-SPEC) |
| Módulo TS | `src/i18n.ts` → export `i18n` |
| Locales | `src/locales/pt-BR/common.json`, `src/locales/en/common.json` (namespace `common`) |
| Teste | `src/smoke.test.ts` |
| Rust | `src-tauri/src/main.rs`, `src-tauri/src/lib.rs` (fn `run`), `src-tauri/build.rs`, `src-tauri/Cargo.toml` |
| Tauri config | `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json` (capability id `default`) |
| CI | `.github/workflows/ci.yml` (job `build`) |
| Docs | `CONTRIBUTING.md` (seção `## Pré-requisitos`) |
| Scripts npm | `dev`, `build`, `tauri`, `test`, `test:planning`, `typecheck`, `lint` |

<tasks>

<task type="auto">
  <name>Task 1: Desbloquear o toolchain Rust + MSVC e documentar pré-requisitos</name>
  <read_first>
    - `.planning/phases/01-espelho-fiel/01-RESEARCH.md` — seções `## Common Pitfalls` → Pitfall 5 e `## Environment Availability` (probes que confirmam a ausência do toolchain)
    - `.planning/research/STACK.md` — seção Development Tools (exigência do workload "Desktop development with C++" no Windows)
  </read_first>
  <files>CONTRIBUTING.md</files>
  <action>
    Instalar o toolchain Rust e o linker MSVC na máquina atual (Windows), via `winget` — os IDs de pacote foram verificados no catálogo winget local durante o planejamento:

    1. `winget install --id Rustlang.Rustup --exact --accept-source-agreements --accept-package-agreements` (ID confirmado: `Rustlang.Rustup`, versão 1.29.0 no catálogo).
    2. `winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --accept-source-agreements --accept-package-agreements --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621"` (ID confirmado: `Microsoft.VisualStudio.2022.BuildTools`, versão 17.14.36 no catálogo).
    3. Depois da instalação, garantir o toolchain default MSVC: `rustup default stable-x86_64-pc-windows-msvc`.
    4. Abrir um shell novo (o instalador do rustup altera o PATH; o shell atual pode não enxergar `cargo`) e confirmar `rustc --version` e `cargo --version`.

    **Gate de elevação:** a instalação do Visual Studio Build Tools exige elevação (UAC). Se qualquer um dos comandos falhar com erro de privilégio/elevação, NÃO tente contornar — crie um checkpoint bloqueante dinâmico pedindo ao desenvolvedor que rode o comando exato acima em um terminal com privilégios de administrador, e retome depois da confirmação. Este é o mesmo padrão dos auth gates: criado dinamicamente quando a automação esbarra em uma barreira de permissão, não pré-planejado.

    Criar `CONTRIBUTING.md` com uma seção `## Pré-requisitos` listando, por plataforma: Node.js >= 22, npm, git, Rust stable via rustup, e o requisito de linker por SO — Windows: Visual Studio Build Tools 2022 com o workload VCTools (comando winget acima); macOS: Xcode Command Line Tools (`xcode-select --install`); Linux: `webkit2gtk-4.1`, `libappindicator3`, `librsvg2`, `patchelf` e `build-essential`. Incluir também a instrução de verificação (`cargo --version`) e a nota de que o PATH só é atualizado em um shell novo.
  </action>
  <acceptance_criteria>
    - `rustc --version` exits 0 e imprime uma versão `1.x`
    - `cargo --version` exits 0 e imprime uma versão `1.x`
    - `rustup show` reporta um toolchain default cujo host termina em `pc-windows-msvc` (na máquina Windows atual)
    - `CONTRIBUTING.md` contains `## Pré-requisitos`
    - `CONTRIBUTING.md` contains `Rustlang.Rustup`
    - `CONTRIBUTING.md` contains `Microsoft.VisualStudio.Workload.VCTools`
    - `CONTRIBUTING.md` menciona as três plataformas: contains `Windows`, contains `macOS`, contains `Linux`
  </acceptance_criteria>
  <verify>
    <automated>cargo --version &amp;&amp; rustc --version &amp;&amp; grep -q '## Pré-requisitos' CONTRIBUTING.md</automated>
  </verify>
  <done>`cargo` e `rustc` respondem no PATH de um shell novo, e `CONTRIBUTING.md` documenta como um contribuidor novo chega no mesmo estado nas três plataformas.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking-human">
  <name>Task 2: Gate de legitimidade dos pacotes fora da auditoria da pesquisa</name>
  <files>(nenhum arquivo é modificado — gate de aprovação anterior ao primeiro npm install)</files>
  <action>
    Apresentar ao desenvolvedor a tabela de pacotes abaixo e aguardar aprovação explícita antes que a Task 3 execute qualquer instalação. Este gate é exigido pela política de legitimidade de pacotes e **não** é auto-aprovável — a configuração de auto-avanço do workflow não se aplica a ele.

    Não instalar nada, não editar nenhum arquivo e não prosseguir para a Task 3 antes da resposta. Se algum pacote for reprovado, registrar a substituição indicada e ajustar a lista de dependências da Task 3 de acordo antes de instalar.
  </action>
  <acceptance_criteria>
    - Nenhum comando de instalação foi executado antes da resposta do desenvolvedor
    - A resposta do desenvolvedor (aprovação ou lista de reprovados com substituições) está registrada no SUMMARY do plano
    - `.planning/phases/01-espelho-fiel/01-RESEARCH.md` contains `## Package Legitimacy Audit` (a auditoria de referência existe e foi apresentada junto)
  </acceptance_criteria>
  <verify>
    <automated>grep -q '## Package Legitimacy Audit' .planning/phases/01-espelho-fiel/01-RESEARCH.md</automated>
    <human-check>O desenvolvedor conferiu cada pacote da tabela em `npmjs.com/package/{nome}` e respondeu com aprovação ou com a lista de reprovados.</human-check>
  </verify>
  <done>Aprovação humana registrada; a Task 3 está liberada para instalar exatamente a lista aprovada.</done>
  <what-built>
    Nada ainda — este é o gate de legitimidade de pacotes exigido antes do primeiro `npm install` desta fase.

    A `01-RESEARCH.md` (`## Package Legitimacy Audit`) auditou e aprovou 25 pacotes npm/crates. Os pacotes abaixo serão instalados pela Task 3 e **não constam** naquela tabela — por política do gate de legitimidade, eles entram como `[ASSUMED]` e precisam de confirmação humana antes da instalação:

    | Pacote | Registry | Por que é necessário | Publicador esperado |
    |---|---|---|---|
    | `@tauri-apps/plugin-dialog` | npm | Seletor nativo de diretório do fluxo "Abrir projeto" (PROJ-02, Plano 02) | `tauri-apps` (mesma org de `@tauri-apps/plugin-fs`, já aprovado) |
    | `@tailwindcss/vite` | npm | Plugin oficial do Tailwind 4 para Vite (Tailwind 4 é config-first em CSS) | `tailwindlabs` (mesma org de `tailwindcss`, já aprovado) |
    | `@vitejs/plugin-react` | npm | Plugin React oficial do Vite | `vitejs` (mesma org de `vite`, já aprovado) |
    | `vitest` | npm | Framework de teste escolhido em `01-RESEARCH.md` → `## Validation Architecture` | `vitest-dev` |
    | `@vitest/coverage-v8` | npm | Cobertura da suíte | `vitest-dev` |
    | `@testing-library/react` + `@testing-library/jest-dom` | npm | Testes de componente (BOARD-06) | `testing-library` |
    | `jsdom` | npm | Ambiente DOM para os testes de componente | `jsdom` |
    | `@fontsource-variable/inter` | npm | Fonte Inter self-hosted (contrato do `01-UI-SPEC.md`) | `fontsource` |
    | `@fontsource-variable/jetbrains-mono` | npm | Fonte monoespaçada self-hosted (contrato do `01-UI-SPEC.md`) | `fontsource` |
  </what-built>
  <how-to-verify>
    Para cada pacote da tabela acima, abrir `https://npmjs.com/package/{nome}` e confirmar:
    1. O campo **Repository** aponta para o repositório oficial da organização esperada (coluna "Publicador esperado").
    2. O volume de downloads semanais é compatível com uma biblioteca amplamente usada (não dezenas/centenas de downloads).
    3. O nome não é uma variação tipográfica de outro pacote (typosquat).

    Se algum pacote não passar, responda com o nome dele e a substituição desejada em vez de "aprovado".
  </how-to-verify>
  <resume-signal>Digite "aprovado" para liberar a instalação, ou liste os pacotes reprovados e a alternativa desejada.</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Scaffold do app Tauri v2 + React + TypeScript com capabilities somente-leitura</name>
  <read_first>
    - `CONTRIBUTING.md` — criado na Task 1
    - `.planning/phases/01-espelho-fiel/01-RESEARCH.md` — seções `## Standard Stack` (Installation), `## Architecture Patterns` → Recommended Project Structure, e `## Security Domain` (escopo de capabilities)
    - `.claude/CLAUDE.md` — stack travada e tabela "What NOT to Use"
  </read_first>
  <files>package.json, package-lock.json, tsconfig.json, tsconfig.node.json, index.html, vite.config.ts, vitest.config.ts, src/main.tsx, src/App.tsx, src/smoke.test.ts, .gitignore, src-tauri/Cargo.toml, src-tauri/build.rs, src-tauri/src/main.rs, src-tauri/src/lib.rs, src-tauri/tauri.conf.json, src-tauri/capabilities/default.json</files>
  <action>
    Fazer o scaffold do app na raiz do repositório (que hoje contém apenas `.planning/` e `.claude/`), preservando esses dois diretórios.

    Estrutura de saída conforme `01-RESEARCH.md` → "Recommended Project Structure": frontend em `src/`, backend Tauri em `src-tauri/`.

    **Frontend:** template React + TypeScript sobre Vite. Dependências de runtime: `@tauri-apps/api`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, `react`, `react-dom`, `zustand`, `immer`, `gray-matter`, `unified`, `remark-parse`, `remark-gfm`, `react-markdown`, `i18next`, `react-i18next`, `date-fns`, `class-variance-authority`, `lucide-react`, `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`. Dependências de desenvolvimento: `@tauri-apps/cli`, `typescript`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`. Instalar as versões correntes de cada registry e travar em `package-lock.json` (commitado).

    **Scripts npm obrigatórios:** `dev` (vite), `build` (typecheck + vite build), `tauri` (`tauri`), `test` (`vitest run`), `test:planning` (`vitest run src/planning`), `typecheck` (`tsc --noEmit`). Nenhum script pode usar modo watch — a suíte precisa terminar sozinha em CI e nos gates de tarefa.

    **vitest.config.ts:** `environment: 'jsdom'`, `globals: true`, setup file com `@testing-library/jest-dom`, e `include` cobrindo `src/**/*.{test,spec}.{ts,tsx}`.

    **Backend Rust (`src-tauri/`):** crate binário mínimo com `main.rs` delegando para `lib.rs::run()`; `Cargo.toml` com `tauri`, `tauri-plugin-fs`, `tauri-plugin-dialog`, `serde`, `serde_json`. Nenhuma dependência de PTY/terminal nesta fase (D-02). `Cargo.lock` commitado.

    **`src-tauri/capabilities/default.json` (controle de segurança central desta fase — ASVS V1/V12, mitiga T-01-03):** capability de id `default`, `windows: ["main"]`, e a lista de `permissions` restrita EXATAMENTE a estes identificadores, nada além: `core:default`, `core:event:default`, `dialog:allow-open`, `fs:allow-read-text-file`, `fs:allow-read-dir`, `fs:allow-exists`. O conjunto é fechado por decisão de produto: o board é read-only, então nenhum verbo de mutação de arquivo (criar, escrever, remover, renomear, copiar) pode existir nesta allowlist. Confirmar os identificadores exatos contra a documentação do `@tauri-apps/plugin-fs` da versão instalada antes de fechar o arquivo; se algum identificador tiver nome diferente na versão instalada, use o equivalente de leitura e registre a diferença no SUMMARY.

    **`src-tauri/tauri.conf.json`:** `productName: "GSD Cards"`, `identifier: "dev.gsdcards.app"`, janela principal com `width: 1280`, `height: 800`, `minWidth: 1024`, `title` vindo do bundle. `withGlobalTauri: false`. CSP em `app.security.csp` restringindo `default-src 'self'` e proibindo `script-src` remoto (mitiga T-01-02 na camada de plataforma).

    **`src/App.tsx`:** componente mínimo que renderiza um `<h1>` com o texto obtido do i18next (a Task 4 cria o bootstrap; nesta task use um texto literal temporário só se necessário para compilar, e a Task 4 substitui).

    **`src/smoke.test.ts`:** teste unitário simples que prova que a suíte roda (ex.: uma asserção sobre uma função utilitária trivial ou sobre o `package.json` ter os scripts obrigatórios).

    **`.gitignore`:** `node_modules/`, `dist/`, `src-tauri/target/`, `.DS_Store`. Não ignorar `package-lock.json` nem `src-tauri/Cargo.lock`.
  </action>
  <acceptance_criteria>
    - `npm run typecheck` exits 0
    - `npm run test` exits 0 e reporta pelo menos 1 teste passando
    - `npx tsc --noEmit` não emite erros
    - `cargo check --manifest-path src-tauri/Cargo.toml` exits 0
    - `package.json` scripts contêm as chaves `dev`, `build`, `tauri`, `test`, `test:planning`, `typecheck`
    - Nenhum script em `package.json` contém a substring `--watch`
    - `src-tauri/capabilities/default.json` parseia como JSON e seu array `permissions` é exatamente o conjunto `["core:default","core:event:default","dialog:allow-open","fs:allow-read-text-file","fs:allow-read-dir","fs:allow-exists"]` (ordem irrelevante, conteúdo idêntico)
    - `src-tauri/tauri.conf.json` contains `"identifier": "dev.gsdcards.app"`
    - `package-lock.json` e `src-tauri/Cargo.lock` existem e não estão em `.gitignore`
  </acceptance_criteria>
  <verify>
    <automated>npm run typecheck &amp;&amp; npm run test &amp;&amp; cargo check --manifest-path src-tauri/Cargo.toml</automated>
    <human-check>Rodar `npm run tauri dev` e confirmar que uma janela nativa abre sem erro de linker.</human-check>
  </verify>
  <done>`npm run typecheck`, `npm run test` e `cargo check` passam; a allowlist de capabilities contém somente os seis identificadores de leitura/evento acordados.</done>
</task>

<task type="auto">
  <name>Task 4: Design tokens do UI-SPEC, bootstrap i18next e CI multiplataforma</name>
  <read_first>
    - `.planning/phases/01-espelho-fiel/01-UI-SPEC.md` — seções `## Design System`, `## Spacing Scale`, `## Typography`, `## Color`, `## Copywriting Contract` (fonte literal dos valores abaixo)
    - `src/App.tsx`, `src/main.tsx`, `vite.config.ts`, `package.json` — criados na Task 3
    - `.planning/phases/01-espelho-fiel/01-CONTEXT.md` — D-03 (CI desde o primeiro commit de código) e D-04 (i18n na fundação)
  </read_first>
  <files>src/styles/theme.css, src/styles/index.css, src/i18n.ts, src/locales/pt-BR/common.json, src/locales/en/common.json, src/main.tsx, src/App.tsx, vite.config.ts, .github/workflows/ci.yml</files>
  <action>
    **Tokens (Tailwind 4, config-first em CSS):** registrar o plugin `@tailwindcss/vite` em `vite.config.ts`. Criar `src/styles/index.css` com `@import "tailwindcss";` seguido de `@import "./theme.css";` e dos imports das fontes self-hosted (`@fontsource-variable/inter` e a monoespaçada). Criar `src/styles/theme.css` com um bloco `@theme` que declara os tokens exatos do `01-UI-SPEC.md`:

    - Espaçamento (múltiplos de 4): `xs 4px`, `sm 8px`, `md 16px`, `lg 24px`, `xl 32px`, `2xl 48px`, `3xl 64px`.
    - Tipografia — quatro papéis, apenas dois pesos (400 e 600, nunca 500 nem 700): Label `12px/1.4/600`, Body `14px/1.5/400`, Heading `18px/1.3/600`, Display `24px/1.2/600`.
    - Famílias: UI = Inter variável com fallback `system-ui, -apple-system, "Segoe UI", sans-serif`; código = JetBrains Mono com fallback `ui-monospace, "Cascadia Code", monospace`.
    - Cores, em pares claro/escuro implementados como custom properties trocadas por `prefers-color-scheme` (o app segue o tema do SO, sem toggle manual nesta fase): dominante `#ffffff` / `#0b0d10`; secundária `#f4f4f5` / `#18191c`; acento `#6366f1` / `#818cf8`; warning `#f59e0b` / `#fbbf24`; success `#10b981` / `#34d399`; destructive `#ef4444` / `#f87171` (token declarado agora, sem uso nesta fase — o board não tem ação destrutiva).

    **i18n (D-04):** criar `src/i18n.ts` que inicializa o `i18next` com `react-i18next`, idioma padrão `pt-BR`, fallback `pt-BR`, `interpolation.escapeValue: false`, e carrega os recursos por namespace a partir de `src/locales/{pt-BR,en}/*.json`. A estrutura de arquivo é **um arquivo por namespace** (`common.json` agora; `project.json`, `board.json`, `sync.json`, `artifact.json` chegam nos planos seguintes) — isso é deliberado para que planos paralelos não disputem o mesmo arquivo de locale. Exportar a instância como `i18n`. Importar `./i18n` em `src/main.tsx` antes do `createRoot`.

    Criar `src/locales/pt-BR/common.json` e `src/locales/en/common.json` com o namespace `common` contendo pelo menos `app.title` (pt-BR: "GSD Cards") e `app.loading` (pt-BR: "Carregando…"). O `en` recebe as traduções equivalentes. Regra permanente do projeto: nenhum componente pode conter string literal de UI — toda string entra por chave `namespace.section.key`.

    Ajustar `src/App.tsx` para consumir `useTranslation('common')` e renderizar `t('app.title')`, aplicando as classes utilitárias dos tokens (superfície dominante de fundo, tipografia Display no título).

    **CI (D-03):** criar `.github/workflows/ci.yml` disparado em `push` e `pull_request`, com um job `build` em `strategy.matrix.os: [windows-latest, macos-latest, ubuntu-latest]` e `fail-fast: false`. Passos: checkout; setup Node 22 com cache npm; `npm ci`; instalar dependências de sistema do Tauri no runner Linux (`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `build-essential`); setup do toolchain Rust stable com cache de `~/.cargo` e `src-tauri/target`; `npm run typecheck`; `npm run test`; `cargo check --manifest-path src-tauri/Cargo.toml`.
  </action>
  <acceptance_criteria>
    - `src/styles/theme.css` contains `@theme`
    - `src/styles/theme.css` contains cada um dos seis valores hex do modo claro: `#ffffff`, `#f4f4f5`, `#6366f1`, `#f59e0b`, `#10b981`, `#ef4444`
    - `src/styles/theme.css` contains cada um dos seis valores hex do modo escuro: `#0b0d10`, `#18191c`, `#818cf8`, `#fbbf24`, `#34d399`, `#f87171`
    - `src/styles/theme.css` contains `prefers-color-scheme`
    - `src/styles/index.css` contains `@import "tailwindcss"`
    - `src/i18n.ts` contains `export` e `i18next`
    - `src/main.tsx` contains `./i18n`
    - `src/locales/pt-BR/common.json` e `src/locales/en/common.json` parseiam como JSON e ambos têm as mesmas chaves de primeiro e segundo nível
    - `src/App.tsx` contains `useTranslation` e não contém a string literal `GSD Cards` (o título vem da chave `app.title`)
    - `.github/workflows/ci.yml` contains `windows-latest`, `macos-latest` e `ubuntu-latest`
    - `.github/workflows/ci.yml` contains `npm run test`
    - `npm run test` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npm run typecheck &amp;&amp; npm run test &amp;&amp; node -e "const a=require('./src/locales/pt-BR/common.json'),b=require('./src/locales/en/common.json');const k=o=>Object.keys(o).flatMap(x=>typeof o[x]==='object'?Object.keys(o[x]).map(y=>x+'.'+y):[x]).sort();if(JSON.stringify(k(a))!==JSON.stringify(k(b)))process.exit(1)"</automated>
    <human-check>Rodar `npm run tauri dev`: a janela abre mostrando o título vindo do i18next, com a tipografia Inter e o fundo seguindo o tema claro/escuro do sistema operacional.</human-check>
  </verify>
  <done>App roda com tokens do UI-SPEC aplicados, strings vindas do i18next em pt-BR/en com paridade de chaves, e CI multiplataforma definido.</done>
</task>


<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| registry npm/crates.io → repositório | Código de terceiros entra na árvore de build; a cadeia de suprimentos é a superfície de ataque desta fase |
| webview React → backend Rust (IPC) | A allowlist de capabilities define tudo que o frontend pode pedir ao SO; qualquer permissão a mais é privilégio permanente |
| filesystem do usuário → app | (Estabelecido aqui apenas como escopo de permissão; o consumo real de arquivos começa no Plano 02) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-01-03 | Elevation of Privilege | `src-tauri/capabilities/default.json` | high | mitigate | Allowlist fechada com exatamente seis identificadores (`core:default`, `core:event:default`, `dialog:allow-open`, `fs:allow-read-text-file`, `fs:allow-read-dir`, `fs:allow-exists`); nenhum verbo de mutação de arquivo é concedido, reforçando o board read-only na camada de plataforma. Critério de aceite compara o conjunto exato. |
| T-01-02a | Tampering | `src-tauri/tauri.conf.json` → `app.security.csp` | high | mitigate | CSP `default-src 'self'` sem origem remota de script, impedindo que conteúdo renderizado no webview carregue código externo (defesa em profundidade para o modal de artefato do Plano 05) |
| T-01-SC | Tampering | instalações npm/cargo (supply chain) | high | mitigate | `01-RESEARCH.md` → `## Package Legitimacy Audit` cobre 25 pacotes (nenhum `[SLOP]`); os 10 pacotes fora daquela tabela passam pelo checkpoint bloqueante `gate="blocking-human"` da Task 2 antes do primeiro install. `package-lock.json` e `Cargo.lock` commitados; CI usa `npm ci` (instalação determinística a partir do lockfile). |
| T-01-07 | Denial of Service | build cross-platform | low | accept | Uma quebra de build específica de macOS/Linux não é explorável por atacante; é risco de produtividade, mitigado pela matrix de CI (D-03) que detecta em minutos em vez de em release |
</threat_model>

<verification>
- `cargo --version` e `rustc --version` respondem
- `npm run typecheck` exits 0
- `npm run test` exits 0
- `cargo check --manifest-path src-tauri/Cargo.toml` exits 0
- `npm run tauri dev` abre uma janela nativa com o título traduzido
- `src-tauri/capabilities/default.json` não concede nenhuma permissão de mutação de filesystem
</verification>

<success_criteria>
- O repositório saiu de "só `.planning/`" para um app Tauri v2 compilável e executável nas três plataformas do CI
- Todo o contrato de design do `01-UI-SPEC.md` (espaçamento, tipografia, cores claro/escuro) existe como tokens consumíveis
- Nenhuma string de UI hardcoded: o primeiro componente já consome i18next com paridade de chaves pt-BR/en
- A superfície de permissão do app é somente-leitura por construção
</success_criteria>

<output>
Create `.planning/phases/01-espelho-fiel/01-01-SUMMARY.md` when done
</output>
