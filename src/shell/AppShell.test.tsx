import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ok } from "../planning/parse-result";
import { useBoardStore } from "../stores/board-store";
import { useSessionStore } from "../stores/session-store";
import { AppShell } from "./AppShell";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

// SessionSidebar (SESS-01/PROJ-04) invoca `check_claude_on_path` (boot) e
// `register_sessions_scope` (open/reopen) — nenhum teste deste arquivo
// exercita o gate de ferramentas ausentes (ver `SessionSidebar.test.tsx`
// para essa suíte dedicada), então `claude` resolve como presente por
// padrão e a descoberta de sessões degrada silenciosamente.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn().mockRejectedValue(new Error("not mocked in this test")),
  stat: vi.fn(),
}));

const initialState = useBoardStore.getState();
const initialSessionState = useSessionStore.getState();

beforeEach(() => {
  useBoardStore.setState(initialState, true);
  useSessionStore.setState(initialSessionState, true);
  invokeMock.mockReset();
  invokeMock.mockImplementation((command: string) => {
    if (command === "check_claude_on_path") {
      return Promise.resolve({ claudePath: "/usr/local/bin/claude" });
    }
    return Promise.reject(new Error("register_sessions_scope indisponível neste teste"));
  });
});

describe("AppShell", () => {
  it("estado idle: mostra o heading de estado vazio e o botão do CTA 'Abrir projeto'", () => {
    render(<AppShell />);

    expect(screen.getByText("Nenhum projeto aberto")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Abrir projeto" }),
    ).toBeInTheDocument();
  });

  it("monta a SessionSidebar real (Plano 04) no lugar do SidebarPlaceholder — mesmo slot 240px fixo", () => {
    render(<AppShell />);

    expect(screen.getByText("Sessões")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova sessão" })).toBeInTheDocument();
  });

  it("estado error (pasta não é projeto GSD): mostra o heading de erro e não mostra o board", () => {
    useBoardStore.setState({
      status: "error",
      project: null,
      error: {
        kind: "NotAGsdProject",
        message: "Diretório .planning/ não encontrado nesta pasta",
      },
    });

    render(<AppShell />);

    expect(
      screen.getByText("Esta pasta não é um projeto GSD"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Board (chega no Plano 03)")).not.toBeInTheDocument();
  });

  it("estado open: mostra o nome do projeto, o rótulo de milestone e a barra de progresso com aria-valuenow igual ao percent", () => {
    useBoardStore.setState({
      status: "open",
      error: null,
      project: {
        root: "/home/x",
        projectName: "gsd-cards",
        milestone: ok("v1.0"),
        currentPhase: ok(1),
        currentPhaseName: ok("espelho-fiel"),
        progress: ok({
          totalPhases: 5,
          completedPhases: 0,
          totalPlans: 6,
          completedPlans: 1,
          percent: 42,
        }),
        blockers: [],
        phases: [],
        milestones: [],
        issues: [],
      },
    });

    render(<AppShell />);

    expect(screen.getByText("gsd-cards")).toBeInTheDocument();
    expect(screen.getByText("v1.0")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
  });
});
