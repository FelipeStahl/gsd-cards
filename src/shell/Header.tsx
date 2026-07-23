// Header fixo D-12: nome do projeto, badge de milestone, fase atual e a
// barra de progresso geral — alimentada exclusivamente por
// `progress.percent` do STATE.md, sem recálculo. Reserva os slots dos
// contadores por coluna (Plano 03) e do indicador de sincronização (Plano 04).

import { useTranslation } from "react-i18next";

import { ProgressBar } from "../components/ProgressBar";
import { statusDotVariants, type StatusTone } from "../components/StatusBadge";
import { selectColumnCounts, useBoardStore } from "../stores/board-store";
import type { BoardColumnId } from "../planning/status";

const PLACEHOLDER = "—";

/** Tom do ponto de cada coluna no contador do header — espelha a primeira cor de status daquele grupo (D-05/D-12). */
const COLUMN_TONE: Record<BoardColumnId, StatusTone> = {
  todo: "neutral",
  preparing: "accent",
  executing: "warning",
  done: "success",
};

const COLUMN_ORDER: BoardColumnId[] = ["todo", "preparing", "executing", "done"];

export function Header() {
  const { t } = useTranslation("project");
  const project = useBoardStore((state) => state.project);

  const projectName = project?.projectName ?? PLACEHOLDER;

  const milestoneValue =
    project?.milestone.kind === "ok" ? project.milestone.value : null;
  const milestoneUnrecognized = project ? milestoneValue === null : false;

  const currentPhaseValue =
    project?.currentPhase.kind === "ok" ? project.currentPhase.value : null;
  const totalPhasesValue =
    project?.progress.kind === "ok"
      ? project.progress.value.totalPhases
      : null;
  const phaseUnrecognized = project
    ? currentPhaseValue === null || totalPhasesValue === null
    : false;

  const percentValue =
    project?.progress.kind === "ok" ? project.progress.value.percent : null;

  const columnCounts = selectColumnCounts(project?.phases ?? []);

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        backgroundColor: "var(--color-secondary)",
        color: "var(--color-foreground)",
        paddingLeft: "var(--spacing-lg)",
        paddingRight: "var(--spacing-lg)",
        display: "flex",
        alignItems: "center",
        gap: "var(--spacing-md)",
      }}
    >
      <span
        style={{
          fontSize: "var(--font-size-display)",
          lineHeight: "var(--line-height-display)",
          fontWeight: "var(--font-weight-display)",
          whiteSpace: "nowrap",
        }}
      >
        {projectName}
      </span>

      <span
        aria-label={t("header.milestone")}
        title={milestoneUnrecognized ? t("header.unrecognized") : undefined}
        style={{
          fontSize: "var(--font-size-label)",
          lineHeight: "var(--line-height-label)",
          fontWeight: "var(--font-weight-label)",
          padding: "var(--spacing-xs) var(--spacing-sm)",
          borderRadius: 999,
          backgroundColor: "var(--color-dominant)",
          whiteSpace: "nowrap",
        }}
      >
        {milestoneValue ?? PLACEHOLDER}
      </span>

      <span
        title={phaseUnrecognized ? t("header.unrecognized") : undefined}
        style={{
          fontSize: "var(--font-size-body)",
          lineHeight: "var(--line-height-body)",
          fontWeight: "var(--font-weight-body)",
          whiteSpace: "nowrap",
        }}
      >
        {currentPhaseValue !== null && totalPhasesValue !== null
          ? t("header.phaseOfTotal", {
              current: currentPhaseValue,
              total: totalPhasesValue,
            })
          : PLACEHOLDER}
      </span>

      <ProgressBar percent={percentValue} widthPx={120} label={t("header.progress")} />

      <div style={{ flex: 1 }} />

      <div
        data-slot="column-counters"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-sm)",
          fontSize: "var(--font-size-label)",
          lineHeight: "var(--line-height-label)",
          fontWeight: "var(--font-weight-label)",
          whiteSpace: "nowrap",
        }}
      >
        {COLUMN_ORDER.map((columnId) => (
          <span
            key={columnId}
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-xs)" }}
          >
            <span className={statusDotVariants({ tone: COLUMN_TONE[columnId] })} aria-hidden="true" />
            {columnCounts[columnId]}
          </span>
        ))}
      </div>

      {/* Slot reservado para o indicador de sincronização — preenchido no Plano 04 */}
      <div data-slot="sync-indicator" />
    </header>
  );
}
