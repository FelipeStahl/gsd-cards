// Badge de status (D-06): pílula de superfície secundária (Label style) +
// ponto colorido de 8px — nunca preenchimento de cor cheia, para preservar o
// orçamento de cor 60/30/10 do UI-SPEC mesmo com 7 status distintos.

import { AlertTriangle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { useTranslation } from "react-i18next";

import type { BoardBadge } from "../planning/status";

export type StatusTone = "neutral" | "accent" | "warning" | "success";

/** Cores do ponto conforme `## Status Badge Mapping` do UI-SPEC. */
export const statusDotVariants = cva("status-dot", {
  variants: {
    tone: {
      neutral: "status-dot--neutral",
      accent: "status-dot--accent",
      warning: "status-dot--warning",
      success: "status-dot--success",
    } satisfies Record<StatusTone, string>,
  },
  defaultVariants: { tone: "neutral" },
});

export type StatusDotVariants = VariantProps<typeof statusDotVariants>;

/** Mapeamento badge -> tom do ponto, replicando `## Status Badge Mapping` literalmente. */
export const BADGE_TONE: Record<BoardBadge, StatusTone> = {
  pending: "neutral",
  discussed: "accent",
  planned: "accent",
  executing: "warning",
  executed: "warning",
  verified: "success",
  unknown: "warning",
};

interface StatusBadgeProps {
  status: BoardBadge;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation("board");
  const tone = BADGE_TONE[status];
  const label = t(`status.${status}`);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--spacing-xs)",
        padding: "var(--spacing-xs) var(--spacing-sm)",
        borderRadius: 999,
        backgroundColor: "var(--color-dominant)",
        fontSize: "var(--font-size-label)",
        lineHeight: "var(--line-height-label)",
        fontWeight: "var(--font-weight-label)",
        color: "var(--color-foreground)",
        whiteSpace: "nowrap",
      }}
    >
      {status === "unknown" ? (
        <AlertTriangle size={12} color="var(--color-warning)" aria-hidden="true" />
      ) : (
        <span className={statusDotVariants({ tone })} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
