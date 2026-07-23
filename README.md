# GSD Cards

**English** · [Português (Brasil)](README.pt-BR.md)

> A desktop app that puts a graphical interface on the **Claude CLI + [gsd-core](https://github.com/open-gsd/gsd-core)** workflow — a hierarchical kanban board that mirrors your `.planning/` artifacts in **real time**.

[![CI](https://github.com/FelipeStahl/gsd-cards/actions/workflows/ci.yml/badge.svg)](https://github.com/FelipeStahl/gsd-cards/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built with Tauri v2](https://img.shields.io/badge/built%20with-Tauri%20v2-24C8DB.svg)](https://tauri.app)

---

## What is GSD Cards?

GSD Cards is an open-source desktop app for the [GSD](https://github.com/open-gsd/gsd-core) community. It **orchestrates** — it does not replace — the tools you already use: the **Claude CLI** and **gsd-core**. It manages multiple GSD projects, shows each one's progress as a hierarchical kanban board driven by the `.planning/` artifacts on disk, and (on the roadmap) keeps persistent Claude sessions, each with its own embedded terminal.

**Core value:** open the app and see, faithfully and in real time, exactly where every GSD project stands. The board is a trustworthy mirror of `.planning/` — never a second source of truth.

> **The board is read-only.** GSD (via `/gsd-*` commands in the terminal) remains the single source of writes; GSD Cards reads and reflects, so the two can never disagree.

## Status

> ⚠️ **Early development — pre-release (`v0.1.0`).** Expect rough edges and breaking changes.

The product is built as a sequence of end-to-end vertical slices:

| Phase | What it delivers | State |
|-------|------------------|-------|
| **1 · Faithful mirror** | Open a GSD project and see a live, hierarchical kanban board (phase → plans → tasks) that mirrors `.planning/`, updating as files change on disk | ✅ Implemented |
| **2 · Live session** | Create sessions in a sidebar and talk to interactive `claude` in a real embedded terminal, with parallel terminals and clean shutdown | ⬜ Planned |
| **3 · Interactive board** | Cards with contextual actions that fire the right `/gsd-*` command in the session's terminal | ⬜ Planned |
| **4 · Persistent home** | Multi-project home with health, project creation from scratch, and sessions that persist and restore across restarts | ⬜ Planned |
| **5 · Community** | Bilingual pt-BR/en UI, packaged cross-platform installers, and auto-update | ⬜ Planned |

There is no packaged installer yet — for now you run it from source (see below).

## Requirements

- **Node.js >= 22** (LTS) and **npm**
- **git**
- **Rust (stable)** via [rustup](https://rustup.rs/)
- A platform-native C/C++ toolchain for the Tauri backend (MSVC Build Tools on Windows, Xcode Command Line Tools on macOS, WebKitGTK dev packages on Linux)

Full per-platform setup — including the exact `winget` / `apt` commands — lives in **[CONTRIBUTING.md](CONTRIBUTING.md)** *(currently written in Portuguese)*.

## Getting started

```bash
# 1. Clone
git clone https://github.com/FelipeStahl/gsd-cards.git
cd gsd-cards

# 2. Install frontend dependencies
npm install

# 3. Run the app (opens a native window)
npm run tauri dev
```

A native GSD Cards window should open. Point it at any folder that already contains a `.planning/` directory (a GSD project) to see the board.

### Useful scripts

| Command | What it does |
|---------|--------------|
| `npm run tauri dev` | Run the full desktop app in dev mode |
| `npm run dev` | Run only the Vite frontend (browser, no native shell) |
| `npm run build` | Type-check and build the frontend bundle |
| `npm run test` | Run the test suite (Vitest) |
| `npm run test:planning` | Run only the `.planning/` parser tests |
| `npm run typecheck` | Type-check with no emit |
| `npm run fixtures:refresh` | Regenerate the gsd-core oracle fixtures (see CONTRIBUTING) |

## How it works

GSD Cards derives everything it shows from the markdown + frontmatter artifacts that gsd-core writes under `.planning/` (`PROJECT.md`, `ROADMAP.md`, `STATE.md`, per-phase `PLAN.md` / `SUMMARY.md` / `VERIFICATION.md`, and so on):

- A **Rust file watcher** (`notify` + a debouncer) tuned to GSD's write bursts detects changes on disk.
- A **resilient parser** (`gray-matter` for frontmatter, `unified` / `remark` for the body) turns artifacts into the board's card / phase / task hierarchy and status columns.
- The frontend (**React + zustand**) re-derives only the affected slice of the board and re-renders — no manual refresh, no flicker during GSD's rapid sequential writes.
- To avoid silently drifting from upstream format changes, the parser is checked against a versioned **oracle snapshot** generated from gsd-core itself.

## Tech stack

- **Shell:** [Tauri v2](https://tauri.app) (Rust backend — native filesystem, file watching, and window)
- **UI:** [React 19](https://react.dev) · [TypeScript](https://www.typescriptlang.org) · [Vite](https://vite.dev) · [Tailwind CSS](https://tailwindcss.com)
- **State:** [zustand](https://github.com/pmndrs/zustand) + [immer](https://immerjs.github.io/immer/)
- **Artifact parsing / rendering:** [gray-matter](https://github.com/jonschlinkert/gray-matter) · [unified](https://unifiedjs.com) / [remark](https://remark.js.org) · [react-markdown](https://github.com/remarkjs/react-markdown) + [remark-gfm](https://github.com/remarkjs/remark-gfm)
- **File watching (Rust):** [`notify`](https://github.com/notify-rs/notify) + `notify-debouncer-full`
- **i18n:** [i18next](https://www.i18next.com) / react-i18next (pt-BR / en)
- **Coming in Phase 2:** [xterm.js](https://xtermjs.org) + [`portable-pty`](https://crates.io/crates/portable-pty) for the embedded terminals

## Project structure

```
src/                 React frontend
  components/          Board UI (PhaseCard, BoardColumn, ArtifactModal, …)
  planning/           .planning/ parser + gsd-core oracle fixtures
  stores/             zustand state
  locales/            i18n resources (en, pt-BR)
  shell/              Tauri IPC glue
src-tauri/           Rust backend (window, fs, file watching)
.planning/           This project's own GSD artifacts (it dogfoods GSD)
```

## Contributing

Contributions are welcome! Start with **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full local setup, then open an issue or a pull request. Please keep the board's read-only contract intact — writes to `.planning/` belong to GSD, not the UI.

> Note: the project's planning docs and `CONTRIBUTING.md` are currently written in Portuguese (pt-BR). Contributions and discussion in English are equally welcome.

## License

[MIT](LICENSE) © 2026 Felipe Stahlhofer

## Acknowledgements

- The [GSD / gsd-core](https://github.com/open-gsd/gsd-core) project and community, whose `.planning/` format this app faithfully mirrors.
- Anthropic's [Claude CLI](https://www.anthropic.com), which GSD Cards orchestrates.
