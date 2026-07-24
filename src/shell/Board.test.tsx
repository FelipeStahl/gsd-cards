import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";

import { ok } from "../planning/parse-result";
import { useBoardStore } from "../stores/board-store";
import type { PhaseModel } from "../planning/model";
import { Board } from "./Board";

function makePhase(overrides: Partial<PhaseModel>): PhaseModel {
  return {
    id: "01",
    number: 1,
    name: "Fase de teste",
    diskStatus: "planned",
    badge: "planned",
    column: "preparing",
    planCount: 1,
    summaryCount: 0,
    requirementIds: [],
    isInserted: false,
    blockers: [],
    issues: [],
    ...overrides,
  };
}

const initialBoardState = useBoardStore.getState();

beforeEach(() => {
  useBoardStore.setState(initialBoardState, true);
});

function setProjectPhases(phases: PhaseModel[]) {
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
        totalPhases: phases.length,
        completedPhases: 0,
        totalPlans: 0,
        completedPlans: 0,
        percent: 0,
      }),
      blockers: [],
      phases,
      milestones: [],
      issues: [],
    },
  });
}

describe("Board — 4 colunas, cada fase exatamente uma vez", () => {
  it("cada fase aparece exatamente uma vez, na coluna correta", () => {
    setProjectPhases([
      makePhase({ id: "01", number: 1, name: "Pendente", badge: "pending", column: "todo" }),
      makePhase({ id: "02", number: 2, name: "Planejada", badge: "planned", column: "preparing" }),
      makePhase({ id: "03", number: 3, name: "Executando", badge: "executing", column: "executing" }),
      makePhase({ id: "04", number: 4, name: "Verificada", badge: "verified", column: "done" }),
    ]);

    render(<Board />);

    // O nome/número da fase é um único nó de texto interpolado ("01. Pendente"),
    // então identificamos cada card pelo atributo `title` (id: nome) exposto
    // por `PhaseCard`, em vez de casar substring de texto (ambíguo com os
    // elementos ancestrais que também "contêm" o mesmo texto).
    expect(screen.getByTitle("01: Pendente")).toBeInTheDocument();
    expect(screen.getByTitle("02: Planejada")).toBeInTheDocument();
    expect(screen.getByTitle("03: Executando")).toBeInTheDocument();
    expect(screen.getByTitle("04: Verificada")).toBeInTheDocument();

    // Cada fase vira exatamente um card — 4 fases, 4 cards. Contado pela
    // classe `.phase-card` (não mais por `role="button"`: desde 03-01,
    // `PhaseCardAction` também renderiza um `<button>` dentro do card,
    // então `role="button"` sozinho conta card+ação juntos). Escopado às
    // colunas (`board-columns`) para excluir o botão de alternância da
    // faixa de histórico (`HistoryStrip`, Plano 06), fora da área de colunas.
    const columns = screen.getByTestId("board-columns");
    expect(columns.querySelectorAll(".phase-card")).toHaveLength(4);
  });

  it("fase executada sem verificação (badge executed) fica em 'Em execução' e nunca em 'Concluída'", () => {
    setProjectPhases([
      makePhase({
        id: "05",
        number: 5,
        name: "Executada sem verificação",
        diskStatus: "executed",
        badge: "executed",
        column: "executing",
        planCount: 2,
        summaryCount: 2,
      }),
    ]);

    render(<Board />);

    const executingColumnHeader = screen.getByText("Em execução");
    const doneColumnHeader = screen.getByText("Concluída");

    const executingColumn = executingColumnHeader.closest("div")!.parentElement!;
    const doneColumn = doneColumnHeader.closest("div")!.parentElement!;

    expect(
      within(executingColumn).getByTitle("05: Executada sem verificação"),
    ).toBeInTheDocument();
    expect(
      within(doneColumn).queryByTitle("05: Executada sem verificação"),
    ).not.toBeInTheDocument();
  });
});

describe("Board — coluna vazia", () => {
  it("uma coluna sem fases mostra o estado vazio 'Nenhuma fase aqui ainda'", () => {
    setProjectPhases([
      makePhase({ id: "01", number: 1, name: "Única fase", badge: "pending", column: "todo" }),
    ]);

    render(<Board />);

    // As outras 3 colunas (preparing/executing/done) estão vazias.
    expect(screen.getAllByText("Nenhuma fase aqui ainda")).toHaveLength(3);
  });
});
