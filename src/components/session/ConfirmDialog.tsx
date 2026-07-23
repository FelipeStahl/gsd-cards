// Modal genérico de confirmação — pequeno, centrado, distinto do
// `ArtifactModal` (que é o "GitHub preview" de artefatos, ~900px). Reusa o
// mesmo padrão visual de backdrop (60% opacidade, clique fora fecha, Esc
// fecha) e superfície dominante da Fase 1, mas com max-width 400px
// (`02-UI-SPEC.md` ## Session Lifecycle Affordances / ## Component
// Inventory). Reusável por fases futuras que precisem de uma confirmação
// leve — props só de conteúdo (`heading`/`body`/`confirmLabel`/
// `cancelLabel`) + `tone` para a cor do botão primário, nada específico de
// sessão vaza para este componente.

import { useEffect } from "react";

export type ConfirmDialogTone = "destructive" | "neutral";

interface ConfirmDialogProps {
  heading: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** `destructive` pinta o botão primário em `--color-destructive` (ex.: Excluir); `neutral` usa `--color-accent` (ex.: confirmações não-destrutivas de fases futuras). */
  tone: ConfirmDialogTone;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  heading,
  body,
  confirmLabel,
  cancelLabel,
  tone,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const primaryColor = tone === "destructive" ? "var(--color-destructive)" : "var(--color-accent)";

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "color-mix(in srgb, var(--color-secondary) 60%, transparent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 40,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(400px, 90vw)",
          backgroundColor: "var(--color-dominant)",
          borderRadius: 8,
          padding: "var(--spacing-lg)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--spacing-md)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--font-size-heading)",
            lineHeight: "var(--line-height-heading)",
            fontWeight: "var(--font-weight-heading)",
            color: "var(--color-foreground)",
            margin: 0,
          }}
        >
          {heading}
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
          {body}
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "var(--spacing-sm)",
            marginTop: "var(--spacing-xs)",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "var(--spacing-sm) var(--spacing-md)",
              borderRadius: 6,
              border: "1px solid var(--color-secondary)",
              backgroundColor: "transparent",
              color: "var(--color-foreground)",
              fontSize: "var(--font-size-body)",
              lineHeight: "var(--line-height-body)",
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "var(--spacing-sm) var(--spacing-md)",
              borderRadius: 6,
              border: "none",
              backgroundColor: primaryColor,
              color: "#ffffff",
              fontSize: "var(--font-size-body)",
              lineHeight: "var(--line-height-body)",
              fontWeight: "var(--font-weight-heading)",
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
