import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";

import { useBoardStore } from "../stores/board-store";
import { useSessionStore } from "../stores/session-store";
import { ProjectSwitcherButton } from "./ProjectSwitcherButton";

const initialBoardState = useBoardStore.getState();
const initialSessionState = useSessionStore.getState();

beforeEach(() => {
  useBoardStore.setState(initialBoardState, true);
  useSessionStore.setState(initialSessionState, true);
});

describe("ProjectSwitcherButton", () => {
  it("renderiza o ícone ChevronLeft com o rótulo i18n de voltar para a home", () => {
    render(<ProjectSwitcherButton />);

    expect(
      screen.getByRole("button", { name: "Voltar para a página inicial" }),
    ).toBeInTheDocument();
  });

  it("clicar chama SÓ setView('home') — nunca closeProject, nunca muta sessões", () => {
    useBoardStore.setState({
      status: "open",
      view: "board",
      activeProjectRoot: "/repo-a",
      openProjectRoots: ["/repo-a"],
      project: { root: "/repo-a" } as ReturnType<typeof useBoardStore.getState>["project"],
    });
    useSessionStore.setState((state) => {
      state.sessions.push({ id: "session-a", lastModified: null, origin: "live" });
    });
    const sessionsBeforeClick = useSessionStore.getState().sessions;

    render(<ProjectSwitcherButton />);
    fireEvent.click(screen.getByRole("button", { name: "Voltar para a página inicial" }));

    expect(useBoardStore.getState().view).toBe("home");
    // Nunca uma chamada destrutiva — status/project/activeProjectRoot
    // permanecem intocados (closeProject teria zerado status/project para
    // "idle"/null; switchProject teria mudado activeProjectRoot).
    expect(useBoardStore.getState().status).toBe("open");
    expect(useBoardStore.getState().project).not.toBeNull();
    expect(useBoardStore.getState().activeProjectRoot).toBe("/repo-a");
    // Sessões preservadas — nenhuma mutação de session-store neste clique.
    expect(useSessionStore.getState().sessions).toEqual(sessionsBeforeClick);
  });
});
