// Coluna do board (D-05): cabeçalho sticky (Label + contagem), largura
// mínima 280px que não comprime, corpo com os cards em ordem numérica de
// fase (já ordenados por `selectPhasesByColumn` no board-store).

import { useTranslation } from "react-i18next";

import { PhaseCard } from "./PhaseCard";
import type { PhaseModel } from "../planning/model";
import type { BoardColumnId } from "../planning/status";

const COLUMN_LABEL_KEY: Record<BoardColumnId, string> = {
  todo: "column.todo",
  preparing: "column.preparing",
  executing: "column.executing",
  done: "column.done",
};

interface BoardColumnProps {
  columnId: BoardColumnId;
  phases: PhaseModel[];
  highlightedPhaseIds?: ReadonlySet<string>;
}

export function BoardColumn({ columnId, phases, highlightedPhaseIds }: BoardColumnProps) {
  const { t } = useTranslation("board");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 280,
        flex: "1 0 280px",
        borderRadius: 8,
        backgroundColor: "var(--color-secondary)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--spacing-sm) var(--spacing-md)",
          backgroundColor: "var(--color-secondary)",
          fontSize: "var(--font-size-label)",
          lineHeight: "var(--line-height-label)",
          fontWeight: "var(--font-weight-label)",
          color: "var(--color-foreground)",
        }}
      >
        <span>{t(COLUMN_LABEL_KEY[columnId])}</span>
        <span style={{ opacity: 0.6 }}>{phases.length}</span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--spacing-sm)",
          padding: "var(--spacing-sm)",
          overflowY: "auto",
        }}
      >
        {phases.length === 0 ? (
          <p
            style={{
              fontSize: "var(--font-size-body)",
              lineHeight: "var(--line-height-body)",
              fontWeight: "var(--font-weight-body)",
              color: "var(--color-foreground)",
              opacity: 0.6,
              textAlign: "center",
              padding: "var(--spacing-lg) 0",
              margin: 0,
            }}
          >
            {t("column.empty")}
          </p>
        ) : (
          phases.map((phase) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              highlighted={highlightedPhaseIds?.has(phase.id) ?? false}
              parseWarning={phase.issues.length > 0}
            />
          ))
        )}
      </div>
    </div>
  );
}
