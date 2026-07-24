import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionDescriptor } from "../../stores/session-store";

const archiveSessionMock = vi.fn();

vi.mock("../../stores/session-store", () => ({
  useSessionStore: (selector: (state: { archiveSession: typeof archiveSessionMock }) => unknown) =>
    selector({ archiveSession: archiveSessionMock }),
}));

const { SessionRow } = await import("./SessionRow");

beforeEach(() => {
  archiveSessionMock.mockReset();
});

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
    const { container } = render(<SessionRow session={session} variant="live" />);

    expect(screen.getByText(`Sessão ${session.id.slice(0, 8)}`)).toBeInTheDocument();
    expect(container.querySelector(".session-row")).toHaveAttribute("title", session.id);
  });

  it("clique numa row live chama onSelect com o id da sessão", () => {
    const session = makeSession();
    const onSelect = vi.fn();
    const { container } = render(<SessionRow session={session} variant="live" onSelect={onSelect} />);

    fireEvent.click(container.querySelector(".session-row") as HTMLElement);

    expect(onSelect).toHaveBeenCalledWith(session.id);
  });

  it("mostra os botões Archive e Delete só no hover (visíveis no DOM, opacidade controlada por CSS)", () => {
    const session = makeSession();
    render(<SessionRow session={session} variant="live" />);

    expect(screen.getByRole("button", { name: "Arquivar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir" })).toBeInTheDocument();
  });

  it("clicar Archive chama archiveSession sem abrir diálogo de confirmação", async () => {
    const session = makeSession();
    render(<SessionRow session={session} variant="live" />);

    fireEvent.click(screen.getByRole("button", { name: "Arquivar" }));

    expect(archiveSessionMock).toHaveBeenCalledWith(session.id);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("clicar Delete abre o ConfirmDialog e só chama archiveSession após confirmar", () => {
    const session = makeSession();
    render(<SessionRow session={session} variant="live" />);

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(archiveSessionMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toBeInTheDocument();

    // O botão de confirmação do diálogo tem o MESMO rótulo ("Excluir") do
    // botão de ação da row — `within(dialog)` escopa a busca só ao modal.
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(archiveSessionMock).toHaveBeenCalledWith(session.id);
  });

  it("Cancelar no ConfirmDialog fecha o diálogo sem chamar archiveSession", () => {
    const session = makeSession();
    render(<SessionRow session={session} variant="live" />);

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(archiveSessionMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("clicar Archive/Delete nunca chama onSelect (stopPropagation)", () => {
    const session = makeSession();
    const onSelect = vi.fn();
    render(<SessionRow session={session} variant="live" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Arquivar" }));

    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("SessionRow — dot ativo por atividade (ACT-03)", () => {
  it("live + busy: dot vira warning + pulse (ActivityDot)", () => {
    const session = makeSession({ activity: "busy" });
    const { container } = render(<SessionRow session={session} variant="live" />);

    const dot = container.querySelector(".status-dot");
    expect(dot).toHaveClass("status-dot--warning");
    expect(dot).toHaveClass("status-dot--pulse");
  });

  it("live + awaiting: dot vira accent + pulse", () => {
    const session = makeSession({ activity: "awaiting" });
    const { container } = render(<SessionRow session={session} variant="live" />);

    const dot = container.querySelector(".status-dot");
    expect(dot).toHaveClass("status-dot--accent");
    expect(dot).toHaveClass("status-dot--pulse");
  });

  it("live + idle: dot vira success, sem pulse", () => {
    const session = makeSession({ activity: "idle" });
    const { container } = render(<SessionRow session={session} variant="live" />);

    const dot = container.querySelector(".status-dot");
    expect(dot).toHaveClass("status-dot--success");
    expect(dot).not.toHaveClass("status-dot--pulse");
  });

  it("live + activity undefined: mantém o fallback estático success (Fase 2)", () => {
    const session = makeSession();
    const { container } = render(<SessionRow session={session} variant="live" />);

    const dot = container.querySelector(".status-dot");
    expect(dot).toHaveClass("status-dot--success");
    expect(dot).not.toHaveClass("status-dot--pulse");
  });

  it("historical não é afetado por activity (ignora o campo mesmo se presente)", () => {
    const session = makeSession({ origin: "historical", activity: "busy" });
    const { container } = render(<SessionRow session={session} variant="historical" />);

    const dot = container.querySelector(".status-dot");
    expect(dot).toHaveClass("status-dot--neutral");
    expect(dot).toHaveClass("status-dot--outline");
    expect(dot).not.toHaveClass("status-dot--pulse");
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
