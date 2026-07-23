import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";

import { DetailPanel } from "./DetailPanel";
import { useUiStore } from "../stores/ui-store";
import { useBoardStore } from "../stores/board-store";
import { useDetailStore } from "../stores/detail-store";
import { ok } from "../planning/parse-result";
import type { PhaseModel } from "../planning/model";
import type { ArtifactRef, ArtifactTreePlan, PhaseArtifactTree } from "../planning/artifact-tree";

const initialUiState = useUiStore.getState();
const initialBoardState = useBoardStore.getState();
const initialDetailState = useDetailStore.getState();

beforeEach(() => {
  useUiStore.setState(initialUiState, true);
  useBoardStore.setState(initialBoardState, true);
  useDetailStore.setState(initialDetailState, true);
});

function makePhase(overrides: Partial<PhaseModel> = {}): PhaseModel {
  return {
    id: "01",
    number: 1,
    name: "Espelho fiel",
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

function setProject(phases: PhaseModel[]) {
  useBoardStore.setState({
    status: "open",
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

function makeTree(overrides: {
  plans?: ArtifactTreePlan[];
  artifacts?: ArtifactRef[];
} = {}): PhaseArtifactTree {
  return {
    phaseDirPath: "/home/x/.planning/phases/01-espelho-fiel",
    plans: overrides.plans ?? [],
    artifacts: overrides.artifacts ?? [],
  };
}

function selectPhaseWithTree(phaseId: string, tree: PhaseArtifactTree) {
  useDetailStore.setState({ treeByPhaseId: { [phaseId]: ok(tree) } });
  useUiStore.getState().selectPhase(phaseId);
}

describe("DetailPanel — árvore de 3 níveis (D-10)", () => {
  it("selecionar uma fase carrega e mostra a árvore com planos e tarefas", () => {
    setProject([makePhase()]);
    selectPhaseWithTree(
      "01",
      makeTree({
        plans: [
          {
            id: "01",
            planPath: "/x/01-01-PLAN.md",
            summaryPath: null,
            parsed: "ok",
            tasks: [{ name: "Tarefa A", type: "auto", state: "pending" }],
          },
        ],
        artifacts: [
          { path: "/x/01-01-PLAN.md", fileName: "01-01-PLAN.md", kind: "plan", parsed: "ok", issues: [] },
        ],
      }),
    );

    render(<DetailPanel />);

    expect(screen.getByText("Tarefa A")).toBeInTheDocument();
    expect(screen.getByText("01-01-PLAN.md")).toBeInTheDocument();
    expect(screen.getByText("Ver artefato")).toBeInTheDocument();
  });

  it("um plano sem SUMMARY mostra todas as tarefas em estado neutro — nenhuma marcada como concluída", () => {
    setProject([makePhase()]);
    selectPhaseWithTree(
      "01",
      makeTree({
        plans: [
          {
            id: "01",
            planPath: "/x/01-01-PLAN.md",
            summaryPath: null,
            parsed: "ok",
            tasks: [
              { name: "Tarefa A", type: "auto", state: "pending" },
              { name: "Tarefa B", type: "auto", state: "pending" },
            ],
          },
        ],
      }),
    );

    render(<DetailPanel />);

    const taskItems = [screen.getByText("Tarefa A"), screen.getByText("Tarefa B")].map((el) =>
      el.closest("li"),
    );
    for (const item of taskItems) {
      expect(item?.getAttribute("data-task-state")).toBe("pending");
    }
    expect(screen.queryByText("✓")).not.toBeInTheDocument();
  });

  it("o mesmo plano, agora com SUMMARY, mostra todas as tarefas em estado concluído", () => {
    setProject([makePhase()]);
    selectPhaseWithTree(
      "01",
      makeTree({
        plans: [
          {
            id: "01",
            planPath: "/x/01-01-PLAN.md",
            summaryPath: "/x/01-01-SUMMARY.md",
            parsed: "ok",
            tasks: [
              { name: "Tarefa A", type: "auto", state: "done" },
              { name: "Tarefa B", type: "auto", state: "done" },
            ],
          },
        ],
      }),
    );

    render(<DetailPanel />);

    const taskItems = [screen.getByText("Tarefa A"), screen.getByText("Tarefa B")].map((el) =>
      el.closest("li"),
    );
    for (const item of taskItems) {
      expect(item?.getAttribute("data-task-state")).toBe("done");
    }
  });

  it("um artefato não reconhecido mostra o rótulo de aviso", () => {
    setProject([makePhase()]);
    selectPhaseWithTree(
      "01",
      makeTree({
        artifacts: [
          {
            path: "/x/01-02-PLAN.md",
            fileName: "01-02-PLAN.md",
            kind: "plan",
            parsed: "unrecognized",
            issues: [{ path: "/x/01-02-PLAN.md", reason: "corrompido" }],
          },
        ],
      }),
    );

    render(<DetailPanel />);

    expect(screen.getByText("01-02-PLAN.md")).toBeInTheDocument();
    expect(screen.getByText("não reconhecida")).toBeInTheDocument();
  });

  it("o botão de fechar limpa selectedPhaseId", () => {
    setProject([makePhase()]);
    selectPhaseWithTree("01", makeTree());

    render(<DetailPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Fechar painel de detalhe" }));
    expect(useUiStore.getState().selectedPhaseId).toBeNull();
  });

  it("Esc também fecha o painel", () => {
    setProject([makePhase()]);
    selectPhaseWithTree("01", makeTree());

    render(<DetailPanel />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useUiStore.getState().selectedPhaseId).toBeNull();
  });

  it("selectedPhaseId nulo não renderiza o painel", () => {
    setProject([makePhase()]);
    const { container } = render(<DetailPanel />);
    expect(container).toBeEmptyDOMElement();
  });
});
