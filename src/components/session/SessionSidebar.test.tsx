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
  invokeMock.mockRejectedValue(new Error("register_sessions_scope indisponível neste teste"));
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

    const rowIds = Array.from(container.querySelectorAll("[title]")).map((el) =>
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
