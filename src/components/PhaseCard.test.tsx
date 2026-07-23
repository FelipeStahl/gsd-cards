import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";

import { PhaseCard } from "./PhaseCard";
import { useUiStore } from "../stores/ui-store";
import type { PhaseModel } from "../planning/model";
import type { BoardBadge } from "../planning/status";

function makePhase(overrides: Partial<PhaseModel> = {}): PhaseModel {
  return {
    id: "01",
    number: 1,
    name: "Espelho fiel",
    diskStatus: "planned",
    badge: "planned",
    column: "preparing",
    planCount: 3,
    summaryCount: 1,
    requirementIds: ["PROJ-02", "BOARD-01", "BOARD-02"],
    isInserted: false,
    blockers: [],
    issues: [],
    ...overrides,
  };
}

const initialUiState = useUiStore.getState();

beforeEach(() => {
  useUiStore.setState(initialUiState, true);
});

const BADGE_LABELS: Record<BoardBadge, string> = {
  pending: "pendente",
  discussed: "discutida",
  planned: "planejada",
  executing: "em execução",
  executed: "executada",
  verified: "verificada",
  unknown: "não reconhecida",
};

describe("PhaseCard — os 7 badges de status", () => {
  for (const [badge, label] of Object.entries(BADGE_LABELS) as [BoardBadge, string][]) {
    it(`badge "${badge}" mostra o rótulo "${label}"`, () => {
      render(<PhaseCard phase={makePhase({ badge })} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  }
});

describe("PhaseCard — bloqueio (D-09)", () => {
  it("fase com blockers mostra o badge de bloqueio", () => {
    render(
      <PhaseCard
        phase={makePhase({
          blockers: [{ phases: [1], text: "Bloqueio de exemplo" }],
        })}
      />,
    );
    expect(screen.getByText("bloqueada")).toBeInTheDocument();
  });

  it("fase sem blockers não mostra o badge de bloqueio", () => {
    render(<PhaseCard phase={makePhase({ blockers: [] })} />);
    expect(screen.queryByText("bloqueada")).not.toBeInTheDocument();
  });
});

describe("PhaseCard — fase decimal inserida (D-07)", () => {
  it("isInserted true mostra o badge 'inserida'", () => {
    render(
      <PhaseCard
        phase={makePhase({ id: "02.1", number: 2.1, isInserted: true })}
      />,
    );
    expect(screen.getByText("inserida")).toBeInTheDocument();
  });

  it("isInserted false não mostra o badge 'inserida'", () => {
    render(<PhaseCard phase={makePhase({ isInserted: false })} />);
    expect(screen.queryByText("inserida")).not.toBeInTheDocument();
  });
});

describe("PhaseCard — clique seleciona a fase (D-10)", () => {
  it("clicar no card chama selectPhase com o id certo", () => {
    render(<PhaseCard phase={makePhase({ id: "03" })} />);
    fireEvent.click(screen.getByRole("button"));
    expect(useUiStore.getState().selectedPhaseId).toBe("03");
  });
});

describe("PhaseCard — parseWarning (BOARD-05)", () => {
  it("parseWarning true troca o badge de status pelo badge 'não reconhecida'", () => {
    render(<PhaseCard phase={makePhase({ badge: "planned" })} parseWarning />);
    expect(screen.getByText("não reconhecida")).toBeInTheDocument();
    expect(screen.queryByText("planejada")).not.toBeInTheDocument();
  });
});

describe("PhaseCard — progresso de planos e requisitos", () => {
  it("mostra a fração concluídos/total e a contagem de requisitos", () => {
    render(
      <PhaseCard
        phase={makePhase({ planCount: 3, summaryCount: 1, requirementIds: ["A", "B"] })}
      />,
    );
    expect(screen.getAllByText("1/3").length).toBeGreaterThan(0);
    expect(screen.getByText("2 requisitos")).toBeInTheDocument();
  });
});
