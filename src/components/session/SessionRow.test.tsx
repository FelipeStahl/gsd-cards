import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionRow } from "./SessionRow";
import type { SessionDescriptor } from "../../stores/session-store";

function makeSession(overrides: Partial<SessionDescriptor> = {}): SessionDescriptor {
  return {
    id: "session-a3f91c2dabc",
    lastModified: new Date("2026-07-01T00:00:00Z"),
    origin: "live",
    ...overrides,
  };
}

describe("SessionRow — variante live", () => {
  it("renderiza o label truncável com id.slice(0,8) e o title com o id completo", () => {
    const session = makeSession();
    render(<SessionRow session={session} variant="live" />);

    expect(screen.getByText(`Sessão ${session.id.slice(0, 8)}`)).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("title", session.id);
  });

  it("clique numa row live chama onSelect com o id da sessão", () => {
    const session = makeSession();
    const onSelect = vi.fn();
    render(<SessionRow session={session} variant="live" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button"));

    expect(onSelect).toHaveBeenCalledWith(session.id);
  });
});

describe("SessionRow — variante historical", () => {
  it("clique numa row histórica NÃO chama onSelect e mostra o tooltip session.row.historicalTooltip", () => {
    const session = makeSession({ origin: "historical" });
    const onSelect = vi.fn();
    render(<SessionRow session={session} variant="historical" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button"));

    expect(onSelect).not.toHaveBeenCalled();
    expect(
      screen.getByText("Sessão de execuções anteriores — retomar chega na Fase 4"),
    ).toBeInTheDocument();
  });

  it("dot histórico usa o modificador CSS status-dot--outline sobre neutral", () => {
    const session = makeSession({ origin: "historical" });
    const { container } = render(<SessionRow session={session} variant="historical" />);

    const dot = container.querySelector(".status-dot");
    expect(dot).toHaveClass("status-dot--neutral");
    expect(dot).toHaveClass("status-dot--outline");
  });
});

describe("SessionRow — variante exited", () => {
  it("mostra o sufixo session.row.exited após o label", () => {
    const session = makeSession({ origin: "live" });
    render(<SessionRow session={session} variant="exited" />);

    expect(
      screen.getByText(`Sessão ${session.id.slice(0, 8)} (encerrada)`),
    ).toBeInTheDocument();
  });
});
