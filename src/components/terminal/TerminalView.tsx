// Host imperativo do xterm.js — monta UMA instância por `sessionId`, liga o
// caminho de bytes crus do Channel (`spawnSession`) diretamente a
// `terminal.write()`, e tem uma limpeza simétrica ao mount (dispose do
// terminal + kill da sessão) que sobrevive ao double-invoke do StrictMode do
// React 19 (Pitfall 4 de `02-RESEARCH.md`): o efeito monta, o StrictMode
// desmonta e remonta imediatamente em dev — sem uma limpeza que
// efetivamente mate a sessão anterior, o segundo `spawnSession` colidiria
// com o `sessionId` ainda vivo no `PtyManager` (`AlreadyExists`).
//
// Plano 05 estende o tracer (Plano 01) com scrollback/copy-on-select já
// confirmados + links clicáveis (`WebLinksAddon`, TERM-02) e busca no
// scrollback (`SearchAddon` + `TerminalSearchBar`, TERM-03). O algoritmo de
// foco/WebGL (Plano 06) vem a seguir, sobre esta mesma instância.

import { useEffect, useRef, useState } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@xterm/xterm/css/xterm.css";

import { killSession, resizeSession, spawnSession, writeSession } from "../../pty/channel";
import { TerminalSearchBar } from "./TerminalSearchBar";

// Mesmo padrão de `ArtifactModal.tsx` (T-01-02): só esquema http(s) é
// aberto — nunca `file:`/`javascript:`/outro esquema arbitrário do output
// não confiável do `claude` (T-02-08). O opener do Tauri em si só tem a
// capability `opener:allow-open-url` concedida (nunca `allow-open-path`),
// mas a validação de esquema aqui é uma segunda barreira antes mesmo de
// chamar o comando do backend.
const SAFE_URL_PATTERN = /^https?:\/\//i;

function isSafeUrl(uri: string): boolean {
  return SAFE_URL_PATTERN.test(uri);
}

// Valores EXATOS de `02-UI-SPEC.md` ## Terminal Chrome & xterm Theme —
// xterm.js exige hex/rgba literais, não lê custom properties de CSS.
const FONT_FAMILY = '"JetBrains Mono Variable", ui-monospace, "Cascadia Code", monospace';

const LIGHT_THEME: ITheme = {
  background: "#ffffff",
  foreground: "#18181b",
  cursor: "#6366f1",
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(99, 102, 241, 0.3)",
  black: "#18181b",
  red: "#ef4444",
  green: "#10b981",
  yellow: "#f59e0b",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#06b6d4",
  white: "#d4d4d8",
  brightBlack: "#71717a",
  brightRed: "#f87171",
  brightGreen: "#34d399",
  brightYellow: "#fbbf24",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#fafafa",
};

const DARK_THEME: ITheme = {
  background: "#0b0d10",
  foreground: "#f4f4f5",
  cursor: "#818cf8",
  cursorAccent: "#0b0d10",
  selectionBackground: "rgba(129, 140, 248, 0.3)",
  black: "#18191c",
  red: "#f87171",
  green: "#34d399",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#d4d4d8",
  brightBlack: "#71717a",
  brightRed: "#fca5a5",
  brightGreen: "#6ee7b7",
  brightYellow: "#fde68a",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#fafafa",
};

interface TerminalViewProps {
  sessionId: string;
  projectRoot: string;
}

export function TerminalView({ sessionId, projectRoot }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Nova sessão montando nesta mesma instância do componente (o rail não
    // usa `key={sessionId}` — troca de sessão reusa o componente) — a barra
    // de busca de uma sessão anterior não deve vazar para a próxima.
    setSearchOpen(false);

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const terminal = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: 5000,
      cursorBlink: true,
      cursorStyle: "block",
      disableStdin: false,
      theme: prefersDark ? DARK_THEME : LIGHT_THEME,
    });
    terminalRef.current = terminal;

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // TERM-02: URLs no output ficam clicáveis; o handler só abre esquemas
    // http(s) validados (`isSafeUrl`) via o comando `opener` do Tauri —
    // nunca renderiza markup, é uma interação do addon sobre o buffer que
    // já foi escrito por `terminal.write()` (T-02-05).
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      if (!isSafeUrl(uri)) return;
      void openUrl(uri).catch(() => {
        // Abrir no navegador do SO falhou — o texto do link continua
        // selecionável/copiável no terminal, só a ação de clique degrada.
      });
    });
    terminal.loadAddon(webLinksAddon);

    // TERM-03: busca no scrollback. `decorations` precisa ser passado nas
    // chamadas de busca (não no construtor do addon) para que
    // `onDidChangeResults` dispare com o contador current/total que
    // `TerminalSearchBar` usa (typings/addon-search.d.ts).
    const searchAddon = new SearchAddon();
    terminal.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    terminal.open(container);
    fitAddon.fit();

    // `copyOnSelect` (02-UI-SPEC.md): não existe como opção do construtor
    // do xterm.js core (verificado contra `typings/xterm.d.ts`) — o
    // equivalente funcional real é ouvir `onSelectionChange` e copiar a
    // seleção atual para o clipboard, replicando o comportamento descrito.
    const selectionDisposable = terminal.onSelectionChange(() => {
      const selection = terminal.getSelection();
      if (selection.length > 0) {
        void navigator.clipboard.writeText(selection).catch(() => {
          // Sem permissão de clipboard — a seleção de texto em si continua
          // funcionando normalmente, só a cópia automática degrada.
        });
      }
    });

    const dataDisposable = terminal.onData((data) => {
      void writeSession(sessionId, data);
    });

    // Ctrl+F/Cmd+F com o terminal focado abre a search bar (02-UI-SPEC.md
    // ## Terminal Search Bar) — `preventDefault` para que o navegador não
    // abra sua própria busca nativa, e `return false` para que o xterm.js
    // não insira o atalho como input do PTY.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        return false;
      }
      return true;
    });

    let disposed = false;

    void spawnSession(sessionId, projectRoot, (bytes) => {
      if (!disposed) terminal.write(bytes);
    })
      .then(() => {
        if (!disposed) {
          void resizeSession(sessionId, terminal.cols, terminal.rows);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          terminal.write(
            `\r\n\x1b[31mNão foi possível iniciar esta sessão: ${String(error)}\x1b[0m\r\n`,
          );
        }
      });

    return () => {
      disposed = true;
      selectionDisposable.dispose();
      dataDisposable.dispose();
      terminal.dispose();
      searchAddonRef.current = null;
      terminalRef.current = null;
      // Mata a árvore de processos desta sessão — necessário para o
      // double-invoke do StrictMode não colidir com `AlreadyExists` no
      // remount seguinte, e para nenhuma sessão sobreviver ao fechamento
      // deste componente (SESS-06).
      void killSession(sessionId);
    };
  }, [sessionId, projectRoot]);

  function handleCloseSearch() {
    setSearchOpen(false);
    // Esc devolve o foco ao terminal (02-UI-SPEC.md ## Terminal Search Bar).
    terminalRef.current?.focus();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      {searchOpen && searchAddonRef.current ? (
        <TerminalSearchBar searchAddon={searchAddonRef.current} onClose={handleCloseSearch} />
      ) : null}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}
