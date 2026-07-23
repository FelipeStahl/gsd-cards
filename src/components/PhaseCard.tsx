// Card fechado denso (D-09). Todo o card é clicável (seleciona a fase no
// ui-store — o painel que reage a essa seleção chega no Plano 05, mas a
// seleção já é observável em teste desde este plano).

import type { KeyboardEvent } from "react";
import { AlertTriangle, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ProgressBar } from "./ProgressBar";
import { StatusBadge } from "./StatusBadge";
import { useUiStore } from "../stores/ui-store";
import type { PhaseModel } from "../planning/model";

interface PhaseCardProps {
  phase: PhaseModel;
  /** D-13: glow de ~1000ms quando os dados subjacentes mudam — acionado a partir do Plano 04 (watcher). */
  highlighted?: boolean;
  /** BOARD-05: a fase teve algum artefato não parseável durante a varredura — badge vira "não reconhecida" com tooltip. */
  parseWarning?: boolean;
}

export function PhaseCard({ phase, highlighted = false, parseWarning = false }: PhaseCardProps) {
  const { t } = useTranslation("board");
  const selectPhase = useUiStore((state) => state.selectPhase);

  const hasBlockers = phase.blockers.length > 0;
  const planFraction = t("card.plans", {
    completed: phase.summaryCount,
    total: phase.planCount,
  });
  const planPercent =
    phase.planCount > 0 ? Math.round((phase.summaryCount / phase.planCount) * 100) : 0;

  function handleActivate() {
    selectPhase(phase.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleActivate();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      className={["phase-card", highlighted ? "phase-card--highlighted" : ""]
        .filter(Boolean)
        .join(" ")}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--spacing-sm)",
        padding: "var(--spacing-md)",
        borderRadius: 8,
        backgroundColor: "var(--color-secondary)",
        minHeight: 92,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-xs)", minWidth: 0 }}>
        <span
          title={`${phase.id}: ${phase.name}`}
          style={{
            fontSize: "var(--font-size-heading)",
            lineHeight: "var(--line-height-heading)",
            fontWeight: "var(--font-weight-heading)",
            color: "var(--color-foreground)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {phase.id}. {phase.name}
        </span>
        {phase.isInserted ? (
          <span
            style={{
              flexShrink: 0,
              fontSize: "var(--font-size-label)",
              lineHeight: "var(--line-height-label)",
              fontWeight: "var(--font-weight-label)",
              padding: "var(--spacing-xs) var(--spacing-sm)",
              borderRadius: 999,
              backgroundColor: "var(--color-dominant)",
              color: "var(--color-foreground)",
              opacity: 0.75,
            }}
          >
            {t("card.inserted")}
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)", flexWrap: "wrap" }}>
        <span title={parseWarning ? t("card.parseError.tooltip") : undefined}>
          <StatusBadge status={parseWarning ? "unknown" : phase.badge} />
        </span>
        {hasBlockers ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--spacing-xs)",
              fontSize: "var(--font-size-label)",
              lineHeight: "var(--line-height-label)",
              fontWeight: "var(--font-weight-label)",
              color: "var(--color-warning)",
            }}
          >
            <AlertTriangle size={12} aria-hidden="true" />
            {t("card.blocked")}
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
        <ProgressBar percent={planPercent} widthPx={120} label={planFraction} />
        <span
          style={{
            fontSize: "var(--font-size-label)",
            lineHeight: "var(--line-height-label)",
            fontWeight: "var(--font-weight-label)",
            color: "var(--color-foreground)",
            opacity: 0.75,
          }}
        >
          {planFraction}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-xs)",
          fontSize: "var(--font-size-label)",
          lineHeight: "var(--line-height-label)",
          fontWeight: "var(--font-weight-label)",
          color: "var(--color-foreground)",
          opacity: 0.75,
        }}
      >
        <ListChecks size={12} aria-hidden="true" />
        {t("card.requirements", { count: phase.requirementIds.length })}
      </div>
    </div>
  );
}
