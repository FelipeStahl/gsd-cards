// Board de 4 colunas (D-05), lado a lado com 16px de gap, dentro da área
// central do AppShell. Abaixo das colunas: faixa de histórico de milestones
// recolhida (D-08), preenchida pelo Plano 06.

import { BoardColumn } from "../components/BoardColumn";
import { HistoryStrip } from "../components/HistoryStrip";
import { selectPhasesByColumn, useBoardStore } from "../stores/board-store";
import type { BoardColumnId } from "../planning/status";

const COLUMN_ORDER: BoardColumnId[] = ["todo", "preparing", "executing", "done"];

export function Board() {
  const phases = useBoardStore((state) => state.project?.phases ?? []);
  const recentlyUpdatedPhaseIds = useBoardStore((state) => state.recentlyUpdatedPhaseIds);
  const byColumn = selectPhasesByColumn(phases);
  const highlightedSet = new Set(recentlyUpdatedPhaseIds);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2xl)" }}>
      <div
        data-testid="board-columns"
        style={{
          display: "flex",
          gap: "var(--spacing-md)",
          alignItems: "flex-start",
        }}
      >
        {COLUMN_ORDER.map((columnId) => (
          <BoardColumn
            key={columnId}
            columnId={columnId}
            phases={byColumn[columnId]}
            highlightedPhaseIds={highlightedSet}
          />
        ))}
      </div>

      <HistoryStrip />
    </div>
  );
}
