import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../components/terminal/TerminalView", () => ({
  TerminalView: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="terminal-view">{sessionId}</div>
  ),
}));

const writeSessionMock = vi.fn();

vi.mock("../pty/channel", () => ({
  writeSession: (...args: unknown[]) => writeSessionMock(...args),
}));

const { DrawerRail } = await import("./DrawerRail");
const { useBoardStore } = await import("../stores/board-store");
const { useSessionStore } = await import("../stores/session-store");

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
  writeSessionMock.mockReset();
});

describe("DrawerRail — recolhido, nenhuma sessão jamais focada", () => {
  it("fica no estado desabilitado (sem ponto de entrada funcional)", () => {
    render(<DrawerRail />);

    expect(screen.getByRole("button", { name: "Reabrir sessão" })).toBeDisabled();
    expect(screen.queryByTestId("terminal-view")).not.toBeInTheDocument();
  });
});

describe("DrawerRail — badge de contagem de sessões vivas", () => {
  it("não mostra badge quando não há sessão viva", () => {
    render(<DrawerRail />);

    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("mostra o count de sessões live quando ≥1 estão vivas", () => {
    useSessionStore.setState({
      sessions: [
        { id: "s1", lastModified: new Date(), origin: "live", projectRoot: "/repo" },
        { id: "s2", lastModified: new Date(), origin: "live", projectRoot: "/repo" },
        { id: "s3", lastModified: new Date(), origin: "historical", projectRoot: "/repo" },
      ],
    });

    render(<DrawerRail />);

    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("DrawerRail — reexpandir para a última sessão focada", () => {
  it("clicar o rail recolhido reexpande para lastFocusedSessionId sem matar/recriar a sessão", () => {
    openProjectAt("/repo");
    useSessionStore.setState({
      sessions: [{ id: "s1", lastModified: new Date(), origin: "live", projectRoot: "/repo" }],
      lastFocusedSessionId: "s1",
      activeSessionId: null,
    });

    render(<DrawerRail />);

    const button = screen.getByRole("button", { name: "Reabrir sessão" });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(useSessionStore.getState().activeSessionId).toBe("s1");
  });
});

describe("DrawerRail — expandido (sessão ativa)", () => {
  it("mostra o TerminalView quando activeSessionId e projectRoot existem", () => {
    openProjectAt("/repo");
    useSessionStore.setState({ activeSessionId: "s1", lastFocusedSessionId: "s1" });

    render(<DrawerRail />);

    expect(screen.getByTestId("terminal-view")).toHaveTextContent("s1");
  });
});

describe("DrawerRail — GSD command toolbar (ACT-04)", () => {
  it("não monta a toolbar no rail recolhido (sem sessão ativa)", () => {
    render(<DrawerRail />);
    expect(screen.queryByRole("button", { name: "Tarefa rápida" })).not.toBeInTheDocument();
  });

  it("monta a toolbar GSD no aside expandido (sessão ativa)", () => {
    openProjectAt("/repo");
    useSessionStore.setState({
      activeSessionId: "s1",
      lastFocusedSessionId: "s1",
      sessions: [{ id: "s1", lastModified: new Date(), origin: "live", projectRoot: "/repo" }],
    });

    render(<DrawerRail />);
    expect(screen.getByRole("button", { name: "Tarefa rápida" })).toBeInTheDocument();
  });

  it("botão parametricless numa sessão ociosa chama writeSession(id, \"/gsd-quick\\r\") e fecha a sessão", () => {
    openProjectAt("/repo");
    useSessionStore.setState({
      activeSessionId: "s1",
      lastFocusedSessionId: "s1",
      sessions: [{ id: "s1", lastModified: new Date(), origin: "live", activity: "idle", projectRoot: "/repo" }],
    });
    writeSessionMock.mockResolvedValue(undefined);

    render(<DrawerRail />);
    fireEvent.click(screen.getByRole("button", { name: "Tarefa rápida" }));

    expect(writeSessionMock).toHaveBeenCalledTimes(1);
    expect(writeSessionMock).toHaveBeenCalledWith("s1", "/gsd-quick\r");
  });

  it("sessão ocupada desabilita o botão e o clique não chama writeSession", () => {
    openProjectAt("/repo");
    useSessionStore.setState({
      activeSessionId: "s1",
      lastFocusedSessionId: "s1",
      sessions: [{ id: "s1", lastModified: new Date(), origin: "live", activity: "busy", projectRoot: "/repo" }],
    });

    render(<DrawerRail />);
    const button = screen.getByRole("button", { name: "Tarefa rápida" });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(writeSessionMock).not.toHaveBeenCalled();
  });

  it("Ctrl+K abre a paleta de comandos (listener window-level, sem precisar do xterm focado)", () => {
    openProjectAt("/repo");
    useSessionStore.setState({
      activeSessionId: "s1",
      lastFocusedSessionId: "s1",
      sessions: [{ id: "s1", lastModified: new Date(), origin: "live", activity: "idle", projectRoot: "/repo" }],
    });

    render(<DrawerRail />);
    expect(screen.queryByPlaceholderText("Buscar comando…")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(screen.getByPlaceholderText("Buscar comando…")).toBeInTheDocument();
  });

  it("o botão \"Comandos\" também abre a paleta", () => {
    openProjectAt("/repo");
    useSessionStore.setState({
      activeSessionId: "s1",
      lastFocusedSessionId: "s1",
      sessions: [{ id: "s1", lastModified: new Date(), origin: "live", activity: "idle", projectRoot: "/repo" }],
    });

    render(<DrawerRail />);
    fireEvent.click(screen.getByRole("button", { name: "Comandos" }));

    expect(screen.getByPlaceholderText("Buscar comando…")).toBeInTheDocument();
  });
});
