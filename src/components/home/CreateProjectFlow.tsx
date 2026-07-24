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

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, readDir } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";

import { planningDir } from "../../planning/paths";
import { useBoardStore } from "../../stores/board-store";
import { useSessionStore } from "../../stores/session-store";

/** Intervalo de poll de `.planning/` aparecer — modesto o bastante para não
 * martelar o filesystem enquanto `/gsd-new-project` conduz sua própria
 * conversa (tipicamente alguns segundos até o primeiro artefato surgir). */
const POLL_INTERVAL_MS = 1000;

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
      await useSessionStore.getState().createProjectSession(selected);
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
          width: "min(420px, 90vw)",
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
