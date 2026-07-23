import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";

import { ok } from "../planning/parse-result";
import { useBoardStore } from "../stores/board-store";
import type { MilestoneHistoryEntry } from "../planning/model";
import { HistoryStrip } from "./HistoryStrip";

const initialBoardState = useBoardStore.getState();

beforeEach(() => {
  useBoardStore.setState(initialBoardState, true);
});

function setProjectMilestones(milestones: MilestoneHistoryEntry[]) {
  useBoardStore.setState({
    status: "open",
    error: null,
    project: {
      root: "/home/x",
      projectName: "gsd-cards",
      milestone: ok("v1.0"),
      currentPhase: ok(1),
      currentPhaseName: ok("teste"),
      progress: ok({
        totalPhases: 1,
        completedPhases: 0,
        totalPlans: 0,
        completedPlans: 0,
        percent: 0,
      }),
      blockers: [],
      phases: [],
      milestones,
      issues: [],
    },
  });
}

describe("HistoryStrip — recolhida por padrão", () => {
  it("começa recolhida: o conteúdo dos milestones não está visível antes do clique de expansão", () => {
    setProjectMilestones([
      {
        version: "v0.9",
        name: "milestone",
        shippedDate: "2026-05-20",
        phases: [{ number: 1, name: "Fundação", status: "Complete" }],
        issues: [],
      },
    ]);

    render(<HistoryStrip />);

    expect(screen.queryByText("v0.9")).not.toBeInTheDocument();
    expect(screen.queryByText(/Fundação/)).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("clicar no cabeçalho expande e revela os milestones", () => {
    setProjectMilestones([
      {
        version: "v0.9",
        name: "milestone",
        shippedDate: "2026-05-20",
        phases: [{ number: 1, name: "Fundação", status: "Complete" }],
        issues: [],
      },
    ]);

    render(<HistoryStrip />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("v0.9")).toBeInTheDocument();
    expect(screen.getByText(/Fundação/)).toBeInTheDocument();
  });

  it("sem milestones, o estado vazio aparece com o texto correto ao expandir, com o cabeçalho sempre visível", () => {
    setProjectMilestones([]);

    render(<HistoryStrip />);

    expect(screen.getByRole("button")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Sem milestones anteriores")).toBeInTheDocument();
  });

  it("uma fase arquivada mostra número, nome e status coarse", () => {
    setProjectMilestones([
      {
        version: "v0.9",
        name: "milestone",
        shippedDate: "2026-05-20",
        phases: [
          { number: 1, name: "Fundação", status: "Complete" },
          { number: 2, name: "Autenticação", status: "Complete" },
        ],
        issues: [],
      },
    ]);

    render(<HistoryStrip />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("1. Fundação")).toBeInTheDocument();
    expect(screen.getByText("2. Autenticação")).toBeInTheDocument();
    expect(screen.getAllByText("Complete")).toHaveLength(2);
  });
});
