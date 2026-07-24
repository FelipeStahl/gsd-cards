import { render, screen, waitFor } from "@testing-library/react";
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

function openProjectAt(root: string, projectName = "repo") {
  useBoardStore.setState((state) => {
    state.project = { root, projectName } as ReturnType<typeof useBoardStore.getState>["project"];
    // PROJ-05 (04-05-PLAN.md): a sidebar filtra `sessions[]` por
    // `activeProjectRoot`, não mais por `project.root` cru — o helper de
    // teste precisa espelhar o que `openProject`/`switchProject` fazem de
    // verdade (setam os dois campos numa única transição).
    state.activeProjectRoot = root;
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
  it("mostra o EmptyState (nunca uma sidebar em branco)", async () => {
    render(<SessionSidebar />);

    // IN-02 fix (04-REVIEW.md): `checkClaudeOnPath()` dispara em TODO mount
    // (efeito assíncrono, `setClaudePath` fora de `act()` quando a asserção
    // roda antes dele assentar) — `await waitFor(...)` garante que o efeito
    // já assentou antes da asserção, consistente com o padrão já usado nas
    // suítes `ToolMissingState` abaixo.
    await waitFor(() => {
      expect(screen.getByText("Nenhuma sessão ainda")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Crie uma sessão para conversar com o claude neste projeto."),
    ).toBeInTheDocument();
  });
});

describe("SessionSidebar — zero-one-many", () => {
  it("uma sessão live sem histórico: mostra só o header 'Ativas', sem 'Histórico' órfão", async () => {
    openProjectAt("/repo");
    useSessionStore.setState({
      sessions: [{ id: "session-live-1", lastModified: new Date(), origin: "live", projectRoot: "/repo" }],
    });

    render(<SessionSidebar />);

    await waitFor(() => {
      expect(screen.getByText("Ativas")).toBeInTheDocument();
    });
    expect(screen.queryByText("Histórico")).not.toBeInTheDocument();
  });

  it("uma sessão histórica sem ativas: mostra só o header 'Histórico', sem 'Ativas' órfão", async () => {
    openProjectAt("/repo");
    useSessionStore.setState({
      sessions: [
        { id: "session-hist-1", lastModified: new Date(), origin: "historical", projectRoot: "/repo" },
      ],
    });

    render(<SessionSidebar />);

    await waitFor(() => {
      expect(screen.getByText("Histórico")).toBeInTheDocument();
    });
    expect(screen.queryByText("Ativas")).not.toBeInTheDocument();
  });

  it("populado (live + historical): mostra os dois grupos, ordenados por lastModified desc", async () => {
    openProjectAt("/repo");
    useSessionStore.setState({
      sessions: [
        {
          id: "aaaaaaaa-old",
          lastModified: new Date("2026-01-01T00:00:00Z"),
          origin: "historical",
          projectRoot: "/repo",
        },
        {
          id: "zzzzzzzz-new",
          lastModified: new Date("2026-06-01T00:00:00Z"),
          origin: "historical",
          projectRoot: "/repo",
        },
        { id: "live-session", lastModified: new Date(), origin: "live", projectRoot: "/repo" },
      ],
    });

    const { container } = render(<SessionSidebar />);

    await waitFor(() => {
      expect(screen.getByText("Ativas")).toBeInTheDocument();
    });
    expect(screen.getByText("Histórico")).toBeInTheDocument();

    // `.session-row` escopa a busca à própria row — os botões de
    // Arquivar/Excluir (Plano 06) também têm `title`, mas não são rows.
    const rowIds = Array.from(container.querySelectorAll(".session-row")).map((el) =>
      el.getAttribute("title"),
    );
    expect(rowIds).toEqual(["live-session", "zzzzzzzz-new", "aaaaaaaa-old"]);
  });
});

describe("SessionSidebar — escopo por projeto (PROJ-05, corrige 04-RESEARCH.md Pitfall 1)", () => {
  it("uma sessão de outro projeto (B) NÃO renderiza enquanto o projeto A está ativo; as sessões de A renderizam", async () => {
    openProjectAt("/repo-a", "repo-a");
    useSessionStore.setState({
      sessions: [
        { id: "session-a-1", lastModified: new Date(), origin: "live", projectRoot: "/repo-a" },
        { id: "session-b-1", lastModified: new Date(), origin: "live", projectRoot: "/repo-b" },
      ],
    });

    const { container } = render(<SessionSidebar />);

    await waitFor(() => {
      expect(container.querySelectorAll(".session-row")).toHaveLength(1);
    });
    const rowIds = Array.from(container.querySelectorAll(".session-row")).map((el) =>
      el.getAttribute("title"),
    );
    expect(rowIds).toEqual(["session-a-1"]);
  });

  it("mostra a faixa de escopo com o nome do projeto ativo quando um projeto está aberto", async () => {
    openProjectAt("/repo-a", "repo-a");
    useSessionStore.setState({
      sessions: [{ id: "session-a-1", lastModified: new Date(), origin: "live", projectRoot: "/repo-a" }],
    });

    render(<SessionSidebar />);

    await waitFor(() => {
      expect(screen.getByText("Mostrando sessões de: repo-a")).toBeInTheDocument();
    });
  });

  it("não mostra a faixa de escopo quando nenhum projeto está aberto", async () => {
    render(<SessionSidebar />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Nova sessão" })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Mostrando sessões de:/)).not.toBeInTheDocument();
  });
});

describe("SessionSidebar — CTA Nova sessão", () => {
  it("desabilitado quando nenhum projeto está aberto", async () => {
    render(<SessionSidebar />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Nova sessão" })).toBeDisabled();
    });
  });

  it("habilitado quando um projeto está aberto", async () => {
    openProjectAt("/repo");

    render(<SessionSidebar />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Nova sessão" })).toBeEnabled();
    });
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
