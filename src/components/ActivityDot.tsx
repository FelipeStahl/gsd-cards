// Ponto de atividade do terminal (ACT-03 visual) — reaproveita
// `statusDotVariants` (`StatusBadge.tsx`) + o modificador `.status-dot--pulse`
// (`theme.css`), sem introduzir um novo `StatusTone` (mantém o enum fechado
// de 4 valores, per `03-UI-SPEC.md` ## Color "Supersedes note"). Consumido
// por `SessionRow` (dot da row `live`, Tarefa 2) e `DetailPanel` (legenda
// "Enviar para", Tarefa 3).

import { useTranslation } from "react-i18next";

import { statusDotVariants, type StatusTone } from "./StatusBadge";
import type { TerminalActivity } from "../pty/activity";

/** Mapeamento atividade -> tom, replicando `03-UI-SPEC.md` ## Color literalmente. */
export const TONE_BY_ACTIVITY: Record<TerminalActivity, StatusTone> = {
  idle: "success",
  busy: "warning",
  awaiting: "accent",
};

interface ActivityDotProps {
  activity: TerminalActivity;
  /** Quando `true`, também renderiza o texto Label (`terminal.activity.<state>`) ao lado do dot. */
  showLabel?: boolean;
}

export function ActivityDot({ activity, showLabel = false }: ActivityDotProps) {
  const { t } = useTranslation("terminal");
  const tone = TONE_BY_ACTIVITY[activity];

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-xs)" }}>
      <span
        className={[statusDotVariants({ tone }), activity !== "idle" ? "status-dot--pulse" : ""]
          .filter(Boolean)
          .join(" ")}
        aria-hidden="true"
      />
      {showLabel ? (
        <span
          style={{
            fontSize: "var(--font-size-label)",
            lineHeight: "var(--line-height-label)",
            fontWeight: "var(--font-weight-label)",
            color: "var(--color-foreground)",
          }}
        >
          {t(`activity.${activity}`)}
        </span>
      ) : null}
    </span>
  );
}
