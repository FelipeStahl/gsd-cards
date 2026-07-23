# GSD Cards

[English](README.md) · **Português (Brasil)**

> Um app desktop que dá interface gráfica ao fluxo **Claude CLI + [gsd-core](https://github.com/open-gsd/gsd-core)** — um board kanban hierárquico que espelha os artefatos de `.planning/` em **tempo real**.

[![CI](https://github.com/FelipeStahl/gsd-cards/actions/workflows/ci.yml/badge.svg)](https://github.com/FelipeStahl/gsd-cards/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Feito com Tauri v2](https://img.shields.io/badge/built%20with-Tauri%20v2-24C8DB.svg)](https://tauri.app)

---

## O que é o GSD Cards?

O GSD Cards é um app desktop open-source para a comunidade [GSD](https://github.com/open-gsd/gsd-core). Ele **orquestra** — não substitui — as ferramentas que você já usa: o **Claude CLI** e o **gsd-core**. Gerencia múltiplos projetos GSD, exibe o andamento de cada um como um board kanban hierárquico alimentado pelos artefatos de `.planning/` no disco e (no roadmap) mantém sessões persistentes do Claude, cada uma com seu próprio terminal embutido.

**Valor central:** abrir o app e ver, fielmente e em tempo real, exatamente onde cada projeto GSD está. O board é um espelho confiável do `.planning/` — nunca uma segunda fonte da verdade.

> **O board é somente leitura.** O GSD (via comandos `/gsd-*` no terminal) permanece a única fonte de escrita; o GSD Cards lê e reflete, então os dois nunca podem divergir.

## Status

> ⚠️ **Em desenvolvimento inicial — pré-lançamento (`v0.1.0`).** Espere arestas e mudanças que quebram compatibilidade.

O produto é construído como uma sequência de fatias verticais utilizáveis de ponta a ponta:

| Fase | O que entrega | Estado |
|------|---------------|--------|
| **1 · Espelho fiel** | Abrir um projeto GSD e ver um board kanban hierárquico e ao vivo (fase → planos → tarefas) que espelha o `.planning/`, atualizando conforme os arquivos mudam no disco | ✅ Implementada |
| **2 · Sessão viva** | Criar sessões numa sidebar e conversar com o `claude` interativo em um terminal real embutido, com terminais paralelos e encerramento limpo | ⬜ Planejada |
| **3 · Board interativo** | Cards com ações contextuais que disparam o comando `/gsd-*` certo no terminal da sessão | ⬜ Planejada |
| **4 · Casa persistente** | Página multi-projeto com saúde, criação de projeto do zero e sessões que persistem e restauram ao reabrir | ⬜ Planejada |
| **5 · Comunidade** | UI bilíngue pt-BR/en, instaladores empacotados multiplataforma e auto-atualização | ⬜ Planejada |

Ainda não há instalador empacotado — por enquanto você roda a partir do código-fonte (veja abaixo).

## Pré-requisitos

- **Node.js >= 22** (LTS) e **npm**
- **git**
- **Rust (stable)** via [rustup](https://rustup.rs/)
- Um toolchain C/C++ nativo da plataforma para o backend Tauri (MSVC Build Tools no Windows, Xcode Command Line Tools no macOS, pacotes de desenvolvimento do WebKitGTK no Linux)

O setup completo por plataforma — incluindo os comandos exatos de `winget` / `apt` — está em **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Primeiros passos

```bash
# 1. Clone
git clone https://github.com/FelipeStahl/gsd-cards.git
cd gsd-cards

# 2. Instale as dependências do frontend
npm install

# 3. Rode o app (abre uma janela nativa)
npm run tauri dev
```

Uma janela nativa do GSD Cards deve abrir. Aponte-a para qualquer pasta que já contenha um diretório `.planning/` (um projeto GSD) para ver o board.

### Scripts úteis

| Comando | O que faz |
|---------|-----------|
| `npm run tauri dev` | Roda o app desktop completo em modo dev |
| `npm run dev` | Roda só o frontend Vite (navegador, sem shell nativo) |
| `npm run build` | Faz type-check e builda o bundle do frontend |
| `npm run test` | Roda a suíte de testes (Vitest) |
| `npm run test:planning` | Roda só os testes do parser de `.planning/` |
| `npm run typecheck` | Type-check sem emitir |
| `npm run fixtures:refresh` | Regenera os fixtures oráculo do gsd-core (ver CONTRIBUTING) |

## Como funciona

O GSD Cards deriva tudo o que exibe dos artefatos markdown + frontmatter que o gsd-core escreve em `.planning/` (`PROJECT.md`, `ROADMAP.md`, `STATE.md`, `PLAN.md` / `SUMMARY.md` / `VERIFICATION.md` por fase, e assim por diante):

- Um **file watcher em Rust** (`notify` + debouncer) tunado para as rajadas de escrita do GSD detecta mudanças no disco.
- Um **parser resiliente** (`gray-matter` para o frontmatter, `unified` / `remark` para o corpo) transforma artefatos na hierarquia de cards / fases / tarefas e nas colunas de status do board.
- O frontend (**React + zustand**) re-deriva apenas a fatia afetada do board e re-renderiza — sem refresh manual, sem piscar durante as escritas sequenciais rápidas do GSD.
- Para não desalinhar silenciosamente com mudanças de formato do upstream, o parser é verificado contra um **snapshot oráculo** versionado, gerado a partir do próprio gsd-core.

## Stack

- **Shell:** [Tauri v2](https://tauri.app) (backend em Rust — filesystem, file watching e janela nativos)
- **UI:** [React 19](https://react.dev) · [TypeScript](https://www.typescriptlang.org) · [Vite](https://vite.dev) · [Tailwind CSS](https://tailwindcss.com)
- **Estado:** [zustand](https://github.com/pmndrs/zustand) + [immer](https://immerjs.github.io/immer/)
- **Parsing / render de artefatos:** [gray-matter](https://github.com/jonschlinkert/gray-matter) · [unified](https://unifiedjs.com) / [remark](https://remark.js.org) · [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm)
- **File watching (Rust):** [`notify`](https://github.com/notify-rs/notify) + `notify-debouncer-full`
- **i18n:** [i18next](https://www.i18next.com) / react-i18next (pt-BR / en)
- **Chega na Fase 2:** [xterm.js](https://xtermjs.org) + [`portable-pty`](https://crates.io/crates/portable-pty) para os terminais embutidos

## Estrutura do projeto

```
src/                 Frontend React
  components/          UI do board (PhaseCard, BoardColumn, ArtifactModal, …)
  planning/           Parser de .planning/ + fixtures oráculo do gsd-core
  stores/             Estado zustand
  locales/            Recursos de i18n (en, pt-BR)
  shell/              Cola de IPC do Tauri
src-tauri/           Backend Rust (janela, fs, file watching)
.planning/           Artefatos GSD do próprio projeto (ele faz dogfooding do GSD)
```

## Contribuindo

Contribuições são bem-vindas! Comece pelo **[CONTRIBUTING.md](CONTRIBUTING.md)** para o setup local completo e então abra uma issue ou um pull request. Por favor, mantenha intacto o contrato somente-leitura do board — escritas em `.planning/` pertencem ao GSD, não à UI.

## Licença

[MIT](LICENSE) © 2026 Felipe Stahlhofer

## Agradecimentos

- O projeto e a comunidade [GSD / gsd-core](https://github.com/open-gsd/gsd-core), cujo formato de `.planning/` este app espelha fielmente.
- O [Claude CLI](https://www.anthropic.com) da Anthropic, que o GSD Cards orquestra.
