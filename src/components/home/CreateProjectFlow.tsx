// Fluxo de criação de projeto do zero (04-04-PLAN.md, PROJ-03) — dialog
// nativo de pasta → checagem de pasta vazia → sessão crua + injeção de
// `/gsd-new-project` (session-store.ts::createProjectSession) → poll de
// `.planning/` aparecer → auto-navegação para o board recém-criado. Reusa o
// esqueleto de painel pequeno-centrado do `ConfirmDialog`
// (04-UI-SPEC.md ## Create-Project Flow), mas com overlay SUAVE
// (`pointerEvents: "none"` no backdrop) — ao contrário do
// `ConfirmDialog`/`CommandPalette`, este painel nunca bloqueia clique/
// teclado fora de si mesmo, para o usuário poder interagir com o que
// estiver por baixo enquanto acompanha o progresso.
//
// Invariante inegociável: este componente NUNCA escreve `.planning/` — só
// injeta o comando `/gsd-new-project\r` numa sessão real (é o próprio GSD,
// rodando dentro do terminal, quem cria os artefatos). A única escrita
// feita neste fluxo é a sessão em si (`createProjectSession`), que também
// não toca `.planning/` (T-04-11).

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, readDir } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";

import { planningDir } from "../../planning/paths";
import { writeSession } from "../../pty/channel";
import { useBoardStore } from "../../stores/board-store";
import { useSessionStore } from "../../stores/session-store";

/** Intervalo de poll de `.planning/` aparecer — modesto o bastante para não
 * martelar o filesystem enquanto `/gsd-new-project` conduz sua própria
 * conversa (tipicamente alguns segundos até o primeiro artefato surgir). */
const POLL_INTERVAL_MS = 1000;

/** Teto defensivo do buffer de output acumulado do mini-terminal (CR-02) —
 * uma sessão que produz muito texto (ex.: `/gsd-new-project` narrando saída
 * verbosa) nunca deve crescer esta string sem limite pela vida do diálogo;
 * mantém só a cauda mais recente, que é o que importa para responder a um
 * prompt em andamento. */
const MAX_TERMINAL_OUTPUT_CHARS = 20_000;

type FlowPhase = "notEmpty" | "progress";

interface CreateProjectFlowProps {
  onClose: () => void;
}

/** Poll simples, cancelável — resolve assim que `.planning/` existir sob
 * `root`, ou nunca resolve se `isCancelled()` virar `true` antes disso
 * (usuário fechou a home/desmontou o fluxo no meio do caminho). */
async function waitForPlanningDir(root: string, isCancelled: () => boolean): Promise<void> {
  while (!isCancelled()) {
    if (await exists(planningDir(root))) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export function CreateProjectFlow({ onClose }: CreateProjectFlowProps) {
  const { t } = useTranslation("home");
  const [phase, setPhase] = useState<FlowPhase | null>(null);
  const cancelledRef = useRef(false);

  // CR-02 (04-REVIEW.md): mini-terminal embutido no próprio painel —
  // `createProjectSession` antes descartava todo byte produzido por
  // `/gsd-new-project` (`onBytes: () => {}`), deixando o usuário sem
  // qualquer forma de ver ou responder aos prompts interativos do comando.
  // Nenhum `TerminalView`/xterm.js real é montado aqui de propósito (a Home
  // substitui o shell inteiro enquanto `view === "home"` — reusar o xterm
  // real exigiria desfazer esse modelo); um `<pre>` decodificado + input
  // wired a `writeSession` é o mínimo suficiente descrito pela própria
  // sugestão de correção da revisão.
  const sessionIdRef = useRef<string | null>(null);
  const decoderRef = useRef(new TextDecoder());
  const outputContainerRef = useRef<HTMLPreElement | null>(null);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalInput, setTerminalInput] = useState("");

  useEffect(() => {
    // Auto-scroll para o fim a cada byte novo — mesma disciplina de
    // "sempre mostrar a saída mais recente" de um terminal real.
    const container = outputContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [terminalOutput]);

  function handleSessionBytes(data: Uint8Array) {
    const text = decoderRef.current.decode(data, { stream: true });
    setTerminalOutput((previous) => {
      const next = previous + text;
      return next.length > MAX_TERMINAL_OUTPUT_CHARS
        ? next.slice(next.length - MAX_TERMINAL_OUTPUT_CHARS)
        : next;
    });
  }

  function handleSubmitTerminalInput(event: FormEvent) {
    event.preventDefault();
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    void writeSession(sessionId, `${terminalInput}\r`);
    setTerminalInput("");
  }

  useEffect(() => {
    cancelledRef.current = false;

    async function run() {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("create.pickerPrompt"),
      });
      if (cancelledRef.current) return;

      if (typeof selected !== "string") {
        // Cancelado no diálogo nativo (OS-owned) — volta para a home sem
        // efeito nenhum, picker pode ser reaberto pelo CTA.
        onClose();
        return;
      }

      let entries: unknown[];
      try {
        entries = await readDir(selected);
      } catch {
        // Pasta ilegível — tratamento conservador: nunca spawna uma sessão
        // numa pasta que nem conseguimos listar.
        entries = [{}];
      }
      if (cancelledRef.current) return;

      if (entries.length > 0) {
        setPhase("notEmpty");
        return;
      }

      setPhase("progress");
      const sessionId = await useSessionStore
        .getState()
        .createProjectSession(selected, handleSessionBytes);
      sessionIdRef.current = sessionId;
      if (cancelledRef.current) return;

      await waitForPlanningDir(selected, () => cancelledRef.current);
      if (cancelledRef.current) return;

      // Mesmo fluxo de um recente saudável clicado (openProject + view
      // "board") — a criação bem-sucedida IS a tela de sucesso, sem passo
      // intermediário (04-UI-SPEC.md ## Create-Project Flow item 4).
      await useBoardStore.getState().openProject(selected);
      useBoardStore.getState().setView("board");
      onClose();
    }

    void run();

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda exatamente uma vez por montagem (uma flow == uma tentativa de criação).
  }, []);

  // Antes do diálogo OS-nativo resolver, ou depois de cancelado (onClose já
  // chamado): nenhum efeito visual próprio — a pasta é escolha "OS-owned",
  // não estilizável (04-UI-SPEC.md ## UI Considerations "partial").
  if (phase === null) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 40,
      }}
    >
      <style>{`
        @keyframes create-project-flow-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          phase === "notEmpty" ? t("create.error.notEmpty.heading") : t("create.progress.heading")
        }
        style={{
          pointerEvents: "auto",
          // CR-02: em progresso, o painel cresce para caber o mini-terminal
          // (output + input) — as outras fases (notEmpty/erro) permanecem
          // no tamanho compacto original.
          width: phase === "progress" ? "min(520px, 90vw)" : "min(420px, 90vw)",
          backgroundColor: "var(--color-dominant)",
          borderRadius: 8,
          padding: "var(--spacing-lg)",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--spacing-md)",
        }}
      >
        {phase === "progress" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
              <Loader2
                size={20}
                aria-hidden="true"
                style={{
                  animation: "create-project-flow-spin 900ms linear infinite",
                  color: "var(--color-accent)",
                }}
              />
              <h2
                style={{
                  fontSize: "var(--font-size-heading)",
                  lineHeight: "var(--line-height-heading)",
                  fontWeight: "var(--font-weight-heading)",
                  color: "var(--color-foreground)",
                  margin: 0,
                }}
              >
                {t("create.progress.heading")}
              </h2>
            </div>
            <p
              style={{
                fontSize: "var(--font-size-body)",
                lineHeight: "var(--line-height-body)",
                color: "var(--color-foreground)",
                opacity: 0.85,
                margin: 0,
              }}
            >
              {t("create.progress.body")}
            </p>
            {/* CR-02: mini-terminal — nunca discarda os bytes de
               /gsd-new-project; o usuário vê a saída em tempo real e pode
               responder qualquer prompt interativo pelo campo abaixo. */}
            <pre
              ref={outputContainerRef}
              data-testid="create-project-terminal-output"
              aria-label={t("create.progress.terminalLabel")}
              style={{
                margin: 0,
                maxHeight: 180,
                overflowY: "auto",
                backgroundColor: "var(--color-secondary)",
                color: "var(--color-foreground)",
                borderRadius: 4,
                padding: "var(--spacing-sm)",
                fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
                fontSize: 12,
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {terminalOutput || t("create.progress.terminalPlaceholder")}
            </pre>
            <form
              onSubmit={handleSubmitTerminalInput}
              style={{ display: "flex", gap: "var(--spacing-sm)" }}
            >
              <input
                type="text"
                value={terminalInput}
                onChange={(event) => setTerminalInput(event.target.value)}
                placeholder={t("create.progress.inputPlaceholder")}
                aria-label={t("create.progress.inputPlaceholder")}
                style={{
                  flex: 1,
                  fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
                  fontSize: "var(--font-size-body)",
                  padding: "var(--spacing-xs) var(--spacing-sm)",
                  borderRadius: 4,
                  border: "1px solid var(--color-secondary)",
                  backgroundColor: "var(--color-dominant)",
                  color: "var(--color-foreground)",
                }}
              />
            </form>
          </>
        ) : (
          <>
            <h2
              style={{
                fontSize: "var(--font-size-heading)",
                lineHeight: "var(--line-height-heading)",
                fontWeight: "var(--font-weight-heading)",
                color: "var(--color-foreground)",
                margin: 0,
              }}
            >
              {t("create.error.notEmpty.heading")}
            </h2>
            <p
              style={{
                fontSize: "var(--font-size-body)",
                lineHeight: "var(--line-height-body)",
                color: "var(--color-foreground)",
                opacity: 0.85,
                margin: 0,
              }}
            >
              {t("create.error.notEmpty.body")}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "var(--spacing-sm) var(--spacing-md)",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: "var(--color-accent)",
                  color: "#ffffff",
                  fontSize: "var(--font-size-body)",
                  lineHeight: "var(--line-height-body)",
                  fontWeight: "var(--font-weight-heading)",
                  cursor: "pointer",
                }}
              >
                {t("create.error.notEmpty.dismiss")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
