import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../components/terminal/TerminalView", () => ({
  TerminalView: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="terminal-view">{sessionId}</div>
  ),
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
        { id: "s1", lastModified: new Date(), origin: "live" },
        { id: "s2", lastModified: new Date(), origin: "live" },
        { id: "s3", lastModified: new Date(), origin: "historical" },
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
      sessions: [{ id: "s1", lastModified: new Date(), origin: "live" }],
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
