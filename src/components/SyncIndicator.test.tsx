import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { SyncIndicator } from "./SyncIndicator";
import { useBoardStore } from "../stores/board-store";
import { ok } from "../planning/parse-result";

const initialState = useBoardStore.getState();

function seedProject() {
  useBoardStore.setState({
    status: "open",
    error: null,
    project: {
      root: "/x",
      projectName: "x",
      milestone: ok("v1.0"),
      currentPhase: ok(1),
      currentPhaseName: ok("fase"),
      progress: ok({
        totalPhases: 1,
        completedPhases: 0,
        totalPlans: 1,
        completedPlans: 0,
        percent: 0,
      }),
      blockers: [],
      phases: [],
      milestones: [],
      issues: [],
    },
  });
}

beforeEach(() => {
  useBoardStore.setState(initialState, true);
});

describe("SyncIndicator", () => {
  it("estado healthy: mostra o rótulo com segundos e o ponto de sucesso", () => {
    seedProject();
    useBoardStore.setState({
      sync: { state: "healthy", lastSyncedAt: Date.now() - 5000, degradedSince: null, reason: null },
    });

    render(<SyncIndicator />);

    expect(screen.getByText(/Sincronizado há \d+s/)).toBeInTheDocument();
  });

  it("estado degraded: mostra o rótulo de desatualização e o botão de reconectar, e NÃO mostra o texto de sincronizado", () => {
    seedProject();
    useBoardStore.setState({
      sync: { state: "degraded", lastSyncedAt: null, degradedSince: Date.now(), reason: "sumiu" },
    });

    render(<SyncIndicator />);

    expect(screen.getByText(/Desatualizado desde/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconectar" })).toBeInTheDocument();
    expect(screen.queryByText(/Sincronizado há/)).not.toBeInTheDocument();
  });

  it("clicar em 'Reconectar' chama reconnectWatcher", () => {
    seedProject();
    const reconnectWatcher = vi.fn().mockResolvedValue(undefined);
    useBoardStore.setState({
      sync: { state: "degraded", lastSyncedAt: null, degradedSince: Date.now(), reason: "sumiu" },
      reconnectWatcher,
    });

    render(<SyncIndicator />);
    fireEvent.click(screen.getByRole("button", { name: "Reconectar" }));

    expect(reconnectWatcher).toHaveBeenCalledTimes(1);
  });

  it("sem projeto aberto (idle), não renderiza nada", () => {
    const { container } = render(<SyncIndicator />);

    expect(container).toBeEmptyDOMElement();
  });
});
