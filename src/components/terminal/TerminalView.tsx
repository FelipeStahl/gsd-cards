// Host imperativo do xterm.js — monta UMA instância por `sessionId`, liga o
// caminho de bytes crus do Channel (`spawnSession`) diretamente a
// `terminal.write()`, e tem uma limpeza simétrica ao mount (dispose do
// terminal + kill da sessão) que sobrevive ao double-invoke do StrictMode do
// React 19 (Pitfall 4 de `02-RESEARCH.md`): o efeito monta, o StrictMode
// desmonta e remonta imediatamente em dev — sem uma limpeza que
// efetivamente mate a sessão anterior, o segundo `spawnSession` colidiria
// com o `sessionId` ainda vivo no `PtyManager` (`AlreadyExists`).
//
// Este é o componente mínimo do tracer (Plano 02-01) — sem WebGL, busca ou
// links clicáveis ainda (Plano 05/06), sem algoritmo de foco/background
// (Plano 06). Um único caminho feliz: spawn → bytes no xterm → dispose+kill.

import { useEffect, useRef } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { killSession, resizeSession, spawnSession, writeSession } from "../../pty/channel";

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
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
      // Mata a árvore de processos desta sessão — necessário para o
      // double-invoke do StrictMode não colidir com `AlreadyExists` no
      // remount seguinte, e para nenhuma sessão sobreviver ao fechamento
      // deste componente (SESS-06).
      void killSession(sessionId);
    };
  }, [sessionId, projectRoot]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
