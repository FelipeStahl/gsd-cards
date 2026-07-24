import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const writeSessionMock = vi.fn();

vi.mock("../pty/channel", () => ({
  writeSession: (...args: unknown[]) => writeSessionMock(...args),
}));

const { PhaseCardAction } = await import("./PhaseCardAction");
const { useSessionStore } = await import("../stores/session-store");
const initialSessionState = useSessionStore.getState();

import type { PhaseModel } from "../planning/model";

function makePhase(overrides: Partial<PhaseModel> = {}): PhaseModel {
  return {
    id: "03",
    number: 3,
    name: "Board interativo",
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

beforeEach(() => {
  useSessionStore.setState(initialSessionState, true);
  writeSessionMock.mockReset();
});

function withLiveActiveSession(sessionId = "session-a1") {
  useSessionStore.setState((state) => {
    state.activeSessionId = sessionId;
    state.lastFocusedSessionId = sessionId;
    state.sessions = [{ id: sessionId, lastModified: new Date(), origin: "live" }];
  });
  return sessionId;
}

describe("PhaseCardAction — injeção fim-a-fim (ACT-01/ACT-02)", () => {
  it("clicar numa fase planned com sessão ativa viva escreve o comando sanitizado + \\r", () => {
    const sessionId = withLiveActiveSession();
    writeSessionMock.mockResolvedValue(undefined);

    render(<PhaseCardAction phase={makePhase()} />);
    fireEvent.click(screen.getByRole("button", { name: "Executar" }));

    expect(writeSessionMock).toHaveBeenCalledTimes(1);
    expect(writeSessionMock).toHaveBeenCalledWith(sessionId, "/gsd-execute-phase 03\r");
  });

  it("fase complete não renderiza nenhum botão", () => {
    withLiveActiveSession();
    render(<PhaseCardAction phase={makePhase({ diskStatus: "complete" })} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("sem sessão ativa/viva, o botão renderiza desabilitado com a dica noSession e não escreve nada ao clicar", () => {
    render(<PhaseCardAction phase={makePhase()} />);
    const button = screen.getByRole("button", { name: "Executar" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Crie ou selecione uma sessão para usar ações GSD");

    fireEvent.click(button);
    expect(writeSessionMock).not.toHaveBeenCalled();
  });
});
