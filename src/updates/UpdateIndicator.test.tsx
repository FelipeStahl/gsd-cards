import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { UpdateIndicator } from "./UpdateIndicator";
import { useUpdateStore } from "./update-store";

const installUpdateAndRelaunchMock = vi.fn();
vi.mock("./check-update", () => ({
  installUpdateAndRelaunch: (...args: unknown[]) => installUpdateAndRelaunchMock(...args),
}));

const initialState = useUpdateStore.getState();

beforeEach(() => {
  useUpdateStore.setState(initialState, true);
  installUpdateAndRelaunchMock.mockReset().mockResolvedValue(undefined);
});

describe("UpdateIndicator", () => {
  it("estado checking: não renderiza nada", () => {
    useUpdateStore.setState({ state: "checking" });

    const { container } = render(<UpdateIndicator />);

    expect(container).toBeEmptyDOMElement();
  });

  it("estado up-to-date: não renderiza nada — nunca anuncia 'você está atualizado'", () => {
    useUpdateStore.setState({ state: "up-to-date" });

    const { container } = render(<UpdateIndicator />);

    expect(container).toBeEmptyDOMElement();
  });

  it("estado available: mostra o dot accent, o rótulo, o tooltip com a versão e o botão de ação", () => {
    useUpdateStore.setState({
      state: "available",
      version: "1.2.0",
      pendingUpdate: { downloadAndInstall: vi.fn() } as never,
    });

    render(<UpdateIndicator />);

    expect(screen.getByText("Nova versão disponível")).toHaveAttribute(
      "title",
      "A versão 1.2.0 está disponível.",
    );
    expect(screen.getByRole("button", { name: "Atualizar e reiniciar" })).toBeInTheDocument();
  });

  it("clicar em 'Atualizar e reiniciar' transiciona para downloading e chama installUpdateAndRelaunch com o Update pendente", () => {
    const pendingUpdate = { downloadAndInstall: vi.fn() };
    useUpdateStore.setState({ state: "available", version: "1.2.0", pendingUpdate: pendingUpdate as never });

    render(<UpdateIndicator />);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar e reiniciar" }));

    expect(installUpdateAndRelaunchMock).toHaveBeenCalledWith(pendingUpdate, expect.any(Function));
    expect(useUpdateStore.getState().state).toBe("downloading");
  });

  it("estado downloading: dot pulsa, mostra o percentual, e NÃO mostra o botão de ação (removido, não desabilitado)", () => {
    useUpdateStore.setState({ state: "downloading", percent: 42 });

    render(<UpdateIndicator />);

    expect(screen.getByText("Baixando atualização… 42%")).toBeInTheDocument();
    const dot = document.querySelector('[aria-hidden="true"]');
    expect(dot).toHaveClass("status-dot--pulse");
    expect(screen.queryByRole("button", { name: "Atualizar e reiniciar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("estado error: dot warning, rótulo de erro, botão de retry e botão de dismiss com aria-label", () => {
    const pendingUpdate = { downloadAndInstall: vi.fn() };
    useUpdateStore.setState({ state: "error", pendingUpdate: pendingUpdate as never });

    render(<UpdateIndicator />);

    expect(screen.getByText("Não foi possível atualizar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dispensar" })).toBeInTheDocument();
  });

  it("estado error: clicar em 'Tentar novamente' rechama installUpdateAndRelaunch com o mesmo Update pendente", () => {
    const pendingUpdate = { downloadAndInstall: vi.fn() };
    useUpdateStore.setState({ state: "error", pendingUpdate: pendingUpdate as never });

    render(<UpdateIndicator />);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(installUpdateAndRelaunchMock).toHaveBeenCalledWith(pendingUpdate, expect.any(Function));
  });

  it("estado error: clicar em 'Dispensar' esconde a linha (volta a não renderizar nada)", () => {
    const pendingUpdate = { downloadAndInstall: vi.fn() };
    useUpdateStore.setState({ state: "error", pendingUpdate: pendingUpdate as never });

    const { container } = render(<UpdateIndicator />);
    fireEvent.click(screen.getByRole("button", { name: "Dispensar" }));

    expect(container).toBeEmptyDOMElement();
  });
});
