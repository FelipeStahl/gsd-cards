import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const validateProjectRootMock = vi.fn();
const readPlanningTextMock = vi.fn();
const removeRecentMock = vi.fn();

vi.mock("../../planning/read", () => ({
  validateProjectRoot: (...args: unknown[]) => validateProjectRootMock(...args),
  readPlanningText: (...args: unknown[]) => readPlanningTextMock(...args),
}));

vi.mock("../../persistence/app-store", () => ({
  removeRecent: (...args: unknown[]) => removeRecentMock(...args),
}));

const { ProjectCard } = await import("./ProjectCard");

const ENTRY = { root: "/repo/projeto-x", name: "projeto-x", lastOpened: "2026-01-01T00:00:00.000Z" };

const HEALTHY_STATE_MD = `---
milestone: v1.0
milestone_name: milestone
current_phase: 3
current_phase_name: board-interativo
status: executing
last_updated: "2026-01-01T00:00:00.000Z"
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 10
  completed_plans: 6
  percent: 60
---

# Project State

## Accumulated Context

### Blockers/Concerns

- [Phase 3]: Bloqueio um
- [Phase 3]: Bloqueio dois
`;

const HEALTHY_NO_BLOCKERS_STATE_MD = `---
milestone: v1.0
milestone_name: milestone
current_phase: 3
current_phase_name: board-interativo
status: executing
last_updated: "2026-01-01T00:00:00.000Z"
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 10
  completed_plans: 6
  percent: 60
---

# Project State
`;

beforeEach(() => {
  validateProjectRootMock.mockReset();
  readPlanningTextMock.mockReset();
  removeRecentMock.mockReset().mockResolvedValue(undefined);
});

describe("ProjectCard", () => {
  it("mostra o skeleton de carregamento antes da saúde resolver", () => {
    validateProjectRootMock.mockReturnValue(new Promise(() => {}));

    render(<ProjectCard entry={ENTRY} onOpen={vi.fn()} onRemoved={vi.fn()} />);

    expect(screen.getByText("Carregando saúde…")).toBeInTheDocument();
  });

  it("healthy: mostra nome, fase, progresso e bloqueios quando > 0", async () => {
    validateProjectRootMock.mockResolvedValue({ root: ENTRY.root, hasGsdCore: true });
    readPlanningTextMock.mockResolvedValue(HEALTHY_STATE_MD);

    render(<ProjectCard entry={ENTRY} onOpen={vi.fn()} onRemoved={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("board-interativo")).toBeInTheDocument());
    expect(screen.getByText("60% concluído")).toBeInTheDocument();
    expect(screen.getByText("2 bloqueios pendentes")).toBeInTheDocument();
  });

  it("healthy com zero bloqueios omite a linha de bloqueios (sem '0 bloqueios' de ruído)", async () => {
    validateProjectRootMock.mockResolvedValue({ root: ENTRY.root, hasGsdCore: true });
    readPlanningTextMock.mockResolvedValue(HEALTHY_NO_BLOCKERS_STATE_MD);

    render(<ProjectCard entry={ENTRY} onOpen={vi.fn()} onRemoved={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("board-interativo")).toBeInTheDocument());
    expect(screen.queryByText(/bloqueio/i)).not.toBeInTheDocument();
  });

  it("error: validateProjectRoot rejeitando renderiza o card de erro com remover/tentar novamente, sem lançar (grid-safe)", async () => {
    validateProjectRootMock.mockRejectedValue(new Error("pasta movida"));
    const onOpen = vi.fn();

    render(<ProjectCard entry={ENTRY} onOpen={onOpen} onRemoved={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Projeto não encontrado")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Remover da lista" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    // Card não é primary-clickable no estado de erro: não existe um
    // role="button" cobrindo o corpo do card inteiro (só os dois botões de
    // ação acima existem como button).
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("healthy: clicar no corpo do card chama onOpen com o root", async () => {
    validateProjectRootMock.mockResolvedValue({ root: ENTRY.root, hasGsdCore: true });
    readPlanningTextMock.mockResolvedValue(HEALTHY_STATE_MD);
    const onOpen = vi.fn();

    render(<ProjectCard entry={ENTRY} onOpen={onOpen} onRemoved={vi.fn()} />);
    const card = await waitFor(() => screen.getByRole("button"));

    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith(ENTRY.root);
  });

  it("error: 'Remover da lista' chama removeRecent e notifica onRemoved", async () => {
    validateProjectRootMock.mockRejectedValue(new Error("pasta apagada"));
    const onRemoved = vi.fn();

    render(<ProjectCard entry={ENTRY} onOpen={vi.fn()} onRemoved={onRemoved} />);
    await waitFor(() => expect(screen.getByText("Projeto não encontrado")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Remover da lista" }));

    await waitFor(() => expect(removeRecentMock).toHaveBeenCalledWith(ENTRY.root));
    expect(onRemoved).toHaveBeenCalledWith(ENTRY.root);
  });

  it("error: 'Tentar novamente' reexecuta a leitura de saúde", async () => {
    validateProjectRootMock
      .mockRejectedValueOnce(new Error("temporário"))
      .mockResolvedValueOnce({ root: ENTRY.root, hasGsdCore: true });
    readPlanningTextMock.mockResolvedValue(HEALTHY_STATE_MD);

    render(<ProjectCard entry={ENTRY} onOpen={vi.fn()} onRemoved={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Projeto não encontrado")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.getByText("board-interativo")).toBeInTheDocument());
    expect(validateProjectRootMock).toHaveBeenCalledTimes(2);
  });
});
