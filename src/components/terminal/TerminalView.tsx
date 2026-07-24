// Host imperativo do xterm.js — monta a instância em foco para `sessionId`
// através do algoritmo de foco (`focus-algorithm.ts`, Plano 06, SESS-03):
// perder o foco (efeito desmontando ou trocando de `sessionId`) dispõe o
// addon-webgl, serializa o buffer via addon-serialize, dispõe a instância e
// redireciona o Channel do PTY para empilhar bytes num buffer em memória — o
// processo PTY em si NUNCA é morto aqui (`killSession` só acontece via
// `archiveSession`, ação explícita de Arquivar/Excluir, ou ao fechar o
// app). Ganhar foco monta uma instância nova, restaura o snapshot + drena o
// buffer acumulado, e só então carrega o webgl — no máximo um contexto
// WebGL vivo por vez em todo o app.
//
// `spawnSession` só é chamado UMA VEZ por sessão (`!hasLiveSession`, a
// primeira vez que ela é focada) — trocar de foco depois disso nunca
// recria o processo, só redireciona onde os bytes recebidos vão parar
// (`setSessionBytesHandler`, `channel.ts`). Isso também resolve o
// double-invoke do StrictMode do React 19 (Pitfall 4 de `02-RESEARCH.md`)
// de graça: o remount do StrictMode enxerga a sessão já como "viva" (o
// `LiveSessionState` foi criado no primeiro mount) e não tenta spawnar de
// novo — só reaplica o algoritmo de ganhar foco sobre o mesmo processo.

import { useEffect, useRef, useState } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@xterm/xterm/css/xterm.css";

import { gainFocus, loseFocus } from "./focus-algorithm";
import { resizeSession, setSessionBytesHandler, spawnSession, writeSession } from "../../pty/channel";
import { useSessionStore } from "../../stores/session-store";
import { TerminalSearchBar } from "./TerminalSearchBar";
import { wireTerminalActivity } from "./useTerminalActivity";

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

    // Nova sessão ganhando foco nesta mesma instância do componente (o rail
    // não usa `key={sessionId}` — troca de sessão reusa o componente) — a
    // barra de busca de uma sessão anterior não deve vazar para a próxima.
    setSearchOpen(false);

    const sessionStore = useSessionStore.getState();
    const isNewSession = !sessionStore.hasLiveSession(sessionId);
    const liveSession = sessionStore.getOrCreateLiveSession(sessionId);

    let disposed = false;
    const disposables: { dispose(): void }[] = [];
    let fitAddon: FitAddon | null = null;
    let serializeAddon: SerializeAddon | null = null;

    // ACT-03: classificação de atividade via o consumidor sempre-ativo de
    // `channel.ts` — independente do redirecionamento de foco abaixo
    // (`redirectToTerminal`/`redirectToBackground` só afetam
    // `bytesHandlers`, nunca `activityHandlers`). Mantém a sessão
    // classificada mesmo quando ela perde foco/vai para background.
    const stopWiringActivity = wireTerminalActivity(sessionId, (activity) => {
      useSessionStore.getState().setActivity(sessionId, activity);
    });

    if (isNewSession) {
      // Registra o Channel/processo ANTES de `gainFocus` abaixo — o
      // redirect síncrono de `gainFocus` (via `setSessionBytesHandler`)
      // sobrescreve este handler inicial antes que qualquer byte real
      // possa chegar (o roundtrip do `invoke()` é assíncrono; o canal só
      // existe de fato depois dele). `spawnSession` só é chamado esta UMA
      // vez por sessão — trocar de foco depois nunca volta a chamá-lo.
      void spawnSession(sessionId, projectRoot, () => {}).then(
        () => {
          // O resize síncrono feito por `fitAndResize` logo abaixo pode ter
          // corrido antes do backend confirmar o spawn (sessão nova) — este
          // segundo resize, feito com o tamanho ATUAL do terminal (que já
          // pode ter mudado se o usuário trocou de sessão nesse meio
          // tempo), garante que o PTY real fique com o tamanho certo.
          if (!disposed && terminalRef.current) {
            void resizeSession(sessionId, terminalRef.current.cols, terminalRef.current.rows).catch(
              () => {},
            );
          }
        },
        (error: unknown) => {
          if (!disposed) {
            terminalRef.current?.write(
              `\r\n\x1b[31mNão foi possível iniciar esta sessão: ${String(error)}\x1b[0m\r\n`,
            );
          }
        },
      );
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    const { terminal, webglAddon } = gainFocus<Terminal>({
      liveSession,
      container,
      createTerminal: () =>
        new Terminal({
          fontFamily: FONT_FAMILY,
          fontSize: 13,
          lineHeight: 1.2,
          scrollback: 5000,
          cursorBlink: true,
          cursorStyle: "block",
          disableStdin: false,
          theme: prefersDark ? DARK_THEME : LIGHT_THEME,
        }),
      loadBaseAddons: (t) => {
        fitAddon = new FitAddon();
        t.loadAddon(fitAddon);

        // TERM-02: URLs no output ficam clicáveis; o handler só abre
        // esquemas http(s) validados (`isSafeUrl`) via o comando `opener`
        // do Tauri — nunca renderiza markup, é uma interação do addon
        // sobre o buffer que já foi escrito por `terminal.write()` (T-02-05).
        const webLinksAddon = new WebLinksAddon((_event, uri) => {
          if (!isSafeUrl(uri)) return;
          void openUrl(uri).catch(() => {
            // Abrir no navegador do SO falhou — o texto do link continua
            // selecionável/copiável no terminal, só a ação de clique degrada.
          });
        });
        t.loadAddon(webLinksAddon);

        // TERM-03: busca no scrollback.
        const searchAddon = new SearchAddon();
        t.loadAddon(searchAddon);
        searchAddonRef.current = searchAddon;

        // SESS-03: serializa o buffer ao perder foco (Pattern 3) — sempre
        // carregado, mesmo padrão de fit/search/web-links.
        serializeAddon = new SerializeAddon();
        t.loadAddon(serializeAddon);

        // `copyOnSelect` (02-UI-SPEC.md): não existe como opção do
        // construtor do xterm.js core (verificado contra
        // `typings/xterm.d.ts`) — o equivalente funcional real é ouvir
        // `onSelectionChange` e copiar a seleção atual para o clipboard.
        disposables.push(
          t.onSelectionChange(() => {
            const selection = t.getSelection();
            if (selection.length > 0) {
              void navigator.clipboard.writeText(selection).catch(() => {
                // Sem permissão de clipboard — a seleção de texto em si
                // continua funcionando normalmente, só a cópia automática
                // degrada.
              });
            }
          }),
        );

        disposables.push(
          t.onData((data) => {
            void writeSession(sessionId, data);
          }),
        );

        // Ctrl+F/Cmd+F com o terminal focado abre a search bar
        // (02-UI-SPEC.md ## Terminal Search Bar) — `preventDefault` para
        // que o navegador não abra sua própria busca nativa, e `return
        // false` para que o xterm.js não insira o atalho como input do PTY.
        t.attachCustomKeyEventHandler((event) => {
          if (event.type !== "keydown") return true;
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
            event.preventDefault();
            setSearchOpen(true);
            return false;
          }
          return true;
        });
      },
      loadWebglAddon: (t) => {
        const addon = new WebglAddon();
        t.loadAddon(addon);
        return addon;
      },
      redirectToTerminal: (write) => setSessionBytesHandler(sessionId, write),
      fitAndResize: (t) => {
        fitAddon?.fit();
        void resizeSession(sessionId, t.cols, t.rows).catch(() => {
          // Corrida possível só na primeira vez (sessão nova): o backend
          // ainda pode não ter confirmado `spawn_session` quando este
          // resize inicial dispara. O `.then()` do spawn abaixo repete o
          // resize com o tamanho atual assim que o spawn resolver.
        });
      },
    });

    terminalRef.current = terminal;

    return () => {
      disposed = true;
      for (const disposable of disposables) disposable.dispose();
      searchAddonRef.current = null;
      terminalRef.current = null;

      // ACT-03: para o timer de quiescência e desregistra o consumidor de
      // atividade desta sessão. Redundante-mas-seguro com o delete que
      // `killSession` já faz no mapa (T-02-02-style leak fix) — cobre tanto
      // unmount/troca de sessão quanto o caso de kill explícito.
      stopWiringActivity();

      const currentLiveSession = useSessionStore.getState().hasLiveSession(sessionId)
        ? useSessionStore.getState().getOrCreateLiveSession(sessionId)
        : null;

      if (currentLiveSession && serializeAddon) {
        // Sessão ainda viva (não foi arquivada/excluída enquanto focada) —
        // roda o algoritmo de perder foco: o PTY continua rodando em
        // background, só a instância de terminal é desmontada.
        loseFocus({
          liveSession: currentLiveSession,
          terminal,
          serializeAddon,
          webglAddon,
          redirectToBackground: (push) => setSessionBytesHandler(sessionId, push),
        });
      } else {
        // Sessão já foi encerrada (arquivar/excluir/kill) antes deste
        // cleanup rodar — nada para preservar, só descarta a instância.
        terminal.dispose();
      }
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
