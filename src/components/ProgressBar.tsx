// Barra de progresso reutilizável (usada no Header agora; o card de fase do
// Plano 03 reusa exatamente este componente).

interface ProgressBarProps {
  /** `null` quando o valor de origem veio como `unrecognized` — nunca inventar um percentual. */
  percent: number | null;
  widthPx?: number;
  label?: string;
}

export function ProgressBar({ percent, widthPx = 120, label }: ProgressBarProps) {
  const clamped =
    percent === null ? null : Math.min(100, Math.max(0, percent));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped ?? undefined}
      style={{
        width: widthPx,
        height: 4,
        borderRadius: 2,
        overflow: "hidden",
        backgroundColor: "color-mix(in srgb, var(--color-secondary) 80%, black)",
      }}
    >
      <div
        style={{
          width: clamped === null ? "0%" : `${clamped}%`,
          height: "100%",
          backgroundColor: "var(--color-accent)",
          transition: "width 200ms ease-out",
        }}
      />
    </div>
  );
}
