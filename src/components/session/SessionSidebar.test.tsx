import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn().mockRejectedValue(new Error("not mocked in this test")),
  stat: vi.fn(),
}));

const { SessionSidebar } = await import("./SessionSidebar");
const { useBoardStore } = await import("../../stores/board-store");
const { useSessionStore } = await import("../../stores/session-store");

const initialBoardState = useBoardStore.getState();
const initialSessionState = useSessionStore.getState();

function openProjectAt(root: string) {
  useBoardStore.setState((state) => {
    state.project = { root } as ReturnType<typeof useBoardStore.getState>["project"];
  });
}

beforeEach(() => {
  useBoardStore.setState(initialBoardState, true);
  useSessionStore.setState(initialSessionState, true);
  invokeMock.mockReset();
  // Por padrão: `claude` presente (não é o foco destes testes de
  // grouping/CTA — `ToolMissingState` tem sua própria suíte dedicada) e
  // `register_sessions_scope` indisponível (degrada sem sessões históricas).
  invokeMock.mockImplementation((command: string) => {
    if (command === "check_claude_on_path") {
      return Promise.resolve({ claudePath: "/usr/local/bin/claude" });
    }
    return Promise.reject(new Error("register_sessions_scope indisponível neste teste"));
  });
});

describe("SessionSidebar — zero sessões", () => {
  it("mostra o EmptyState (nunca uma sidebar em branco)", () => {
    render(<SessionSidebar />);

    expect(screen.getByText("Nenhuma sessão ainda")).toBeInTheDocument();
    expect(
      screen.getByText("Crie uma sessão para conversar com o claude neste projeto."),
    ).toBeInTheDocument();
  });
});

describe("SessionSidebar — zero-one-many", () => {
  it("uma sessão live sem histórico: mostra só o header 'Ativas', sem 'Histórico' órfão", () => {
    openProjectAt("/repo");
    useSessionStore.setState({
      sessions: [{ id: "session-live-1", lastModified: new Date(), origin: "live" }],
    });

    render(<SessionSidebar />);

    expect(screen.getByText("Ativas")).toBeInTheDocument();
    expect(screen.queryByText("Histórico")).not.toBeInTheDocument();
  });

  it("uma sessão histórica sem ativas: mostra só o header 'Histórico', sem 'Ativas' órfão", () => {
    useSessionStore.setState({
      sessions: [{ id: "session-hist-1", lastModified: new Date(), origin: "historical" }],
    });

    render(<SessionSidebar />);

    expect(screen.getByText("Histórico")).toBeInTheDocument();
    expect(screen.queryByText("Ativas")).not.toBeInTheDocument();
  });

  it("populado (live + historical): mostra os dois grupos, ordenados por lastModified desc", () => {
    useSessionStore.setState({
      sessions: [
        { id: "aaaaaaaa-old", lastModified: new Date("2026-01-01T00:00:00Z"), origin: "historical" },
        { id: "zzzzzzzz-new", lastModified: new Date("2026-06-01T00:00:00Z"), origin: "historical" },
        { id: "live-session", lastModified: new Date(), origin: "live" },
      ],
    });

    const { container } = render(<SessionSidebar />);

    expect(screen.getByText("Ativas")).toBeInTheDocument();
    expect(screen.getByText("Histórico")).toBeInTheDocument();

    // `.session-row` escopa a busca à própria row — os botões de
    // Arquivar/Excluir (Plano 06) também têm `title`, mas não são rows.
    const rowIds = Array.from(container.querySelectorAll(".session-row")).map((el) =>
      el.getAttribute("title"),
    );
    expect(rowIds).toEqual(["live-session", "zzzzzzzz-new", "aaaaaaaa-old"]);
  });
});

describe("SessionSidebar — CTA Nova sessão", () => {
  it("desabilitado quando nenhum projeto está aberto", () => {
    render(<SessionSidebar />);

    expect(screen.getByRole("button", { name: "Nova sessão" })).toBeDisabled();
  });

  it("habilitado quando um projeto está aberto", () => {
    openProjectAt("/repo");

    render(<SessionSidebar />);

    expect(screen.getByRole("button", { name: "Nova sessão" })).toBeEnabled();
  });
});

describe("SessionSidebar — ToolMissingState (PROJ-04)", () => {
  it("claude ausente: substitui o corpo pelo ToolMissingState e NÃO renderiza o CTA Nova sessão", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_claude_on_path") {
        return Promise.resolve({ claudePath: null });
      }
      return Promise.reject(new Error("register_sessions_scope indisponível neste teste"));
    });
    openProjectAt("/repo");

    render(<SessionSidebar />);

    expect(await screen.findByText("Claude CLI não encontrado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nova sessão" })).not.toBeInTheDocument();
    expect(screen.queryByText("Nenhuma sessão ainda")).not.toBeInTheDocument();
  });

  it("gsd-core ausente (claude presente): mostra a variante gsd-core e esconde o CTA", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_claude_on_path") {
        return Promise.resolve({ claudePath: "/usr/local/bin/claude" });
      }
      return Promise.reject(new Error("register_sessions_scope indisponível neste teste"));
    });
    useBoardStore.setState({
      project: { root: "/repo", hasGsdCore: false } as ReturnType<
        typeof useBoardStore.getState
      >["project"],
    });

    render(<SessionSidebar />);

    expect(await screen.findByText("gsd-core não encontrado neste projeto")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nova sessão" })).not.toBeInTheDocument();
  });

  it("ambos ausentes: mostra a variante both e esconde o CTA", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_claude_on_path") {
        return Promise.resolve({ claudePath: null });
      }
      return Promise.reject(new Error("register_sessions_scope indisponível neste teste"));
    });
    useBoardStore.setState({
      project: { root: "/repo", hasGsdCore: false } as ReturnType<
        typeof useBoardStore.getState
      >["project"],
    });

    render(<SessionSidebar />);

    expect(
      await screen.findByText("Claude CLI e gsd-core não encontrados"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nova sessão" })).not.toBeInTheDocument();
  });
});
