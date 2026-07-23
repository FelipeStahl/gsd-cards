import type { ReactNode } from "react";

interface EmptyStateProps {
  heading: string;
  body: string;
  action?: ReactNode;
}

/** Estado genérico — usado para "nenhum projeto aberto", coluna vazia e histórico vazio. */
export function EmptyState({ heading, body, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--spacing-md)",
        padding: "var(--spacing-3xl)",
        textAlign: "center",
        height: "100%",
        width: "100%",
        color: "var(--color-foreground)",
      }}
    >
      <h2
        style={{
          fontSize: "var(--font-size-display)",
          lineHeight: "var(--line-height-display)",
          fontWeight: "var(--font-weight-display)",
          margin: 0,
        }}
      >
        {heading}
      </h2>
      <p
        style={{
          fontSize: "var(--font-size-body)",
          lineHeight: "var(--line-height-body)",
          fontWeight: "var(--font-weight-body)",
          maxWidth: 480,
          margin: 0,
          opacity: 0.75,
        }}
      >
        {body}
      </p>
      {action}
    </div>
  );
}
