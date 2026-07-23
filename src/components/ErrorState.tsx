import { AlertTriangle } from "lucide-react";

interface ErrorStateProps {
  heading: string;
  body: string;
}

/** Estado genérico — usado para "pasta não é projeto GSD" e "mirror desatualizado". */
export function ErrorState({ heading, body }: ErrorStateProps) {
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
      <AlertTriangle
        size={32}
        color="var(--color-warning)"
        aria-hidden="true"
      />
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
    </div>
  );
}
