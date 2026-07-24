import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ComponentProps } from "react";

const writeSessionMock = vi.fn();

vi.mock("../../pty/channel", () => ({
  writeSession: (...args: unknown[]) => writeSessionMock(...args),
}));

const { CommandPalette } = await import("./CommandPalette");

beforeEach(() => {
  writeSessionMock.mockReset();
});

type CommandPaletteProps = ComponentProps<typeof CommandPalette>;

function renderPalette(overrides: Partial<CommandPaletteProps> = {}) {
  const onClose = vi.fn();
  const props: CommandPaletteProps = {
    hasLiveTarget: true,
    targetSessionId: "session-a1",
    targetActivity: "idle",
    onClose,
    ...overrides,
  };
  render(<CommandPalette {...props} />);
  return { onClose };
}

describe("CommandPalette — abrir/fechar (ACT-04)", () => {
  it("abre com o input de busca auto-focado e as 9 rows curadas em ordem fixa", () => {
    renderPalette();

    const input = screen.getByPlaceholderText("Buscar comando…");
    expect(input).toHaveFocus();

    const rows = screen.getAllByRole("button").filter((button) => button !== input);
    // 9 comandos curados + nenhuma row extra.
    expect(rows).toHaveLength(9);
    expect(screen.getByRole("button", { name: "Discutir fase" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajuda" })).toBeInTheDocument();
  });

  it("Esc fecha a paleta", () => {
    const { onClose } = renderPalette();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clique fora (backdrop) fecha a paleta", () => {
    const { onClose } = renderPalette();

    fireEvent.click(screen.getByRole("dialog"));

    expect(onClose).not.toHaveBeenCalled();

    // O backdrop é o pai do dialog — clicar nele (fora do painel) fecha.
    const backdrop = screen.getByRole("dialog").parentElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clique dentro do painel não fecha a paleta (stopPropagation)", () => {
    const { onClose } = renderPalette();

    fireEvent.click(screen.getByRole("dialog"));

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("CommandPalette — filtro (ACT-04)", () => {
  it("filtra por substring do label (case-insensitive)", () => {
    renderPalette();
    const input = screen.getByPlaceholderText("Buscar comando…");

    fireEvent.change(input, { target: { value: "ajuda" } });

    expect(screen.getByRole("button", { name: "Ajuda" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discutir fase" })).not.toBeInTheDocument();
  });

  it("filtra por substring do token /gsd-* mesmo quando o label não contém a query", () => {
    renderPalette();
    const input = screen.getByPlaceholderText("Buscar comando…");

    // "discuss" só aparece no token "/gsd-discuss-phase" — o label pt-BR
    // "Discutir fase" não contém essa substring.
    fireEvent.change(input, { target: { value: "discuss" } });

    expect(screen.getByRole("button", { name: "Discutir fase" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajuda" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Planejar fase" })).not.toBeInTheDocument();
  });

  it("sem match nenhum mostra commands.palette.empty, input continua editável", () => {
    renderPalette();
    const input = screen.getByPlaceholderText("Buscar comando…");

    fireEvent.change(input, { target: { value: "zzzzzznomatch" } });

    expect(screen.getByText("Nenhum comando encontrado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajuda" })).not.toBeInTheDocument();
    expect(input).not.toBeDisabled();
  });
});

describe("CommandPalette — injeção por row obedece resolveInjection (ACT-02/ACT-03)", () => {
  it("row parameterless (quick) em sessão ociosa: writeSession com \\r, fecha a paleta", () => {
    const { onClose } = renderPalette({ targetActivity: "idle" });
    writeSessionMock.mockResolvedValue(undefined);

    fireEvent.click(screen.getByRole("button", { name: "Tarefa rápida" }));

    expect(writeSessionMock).toHaveBeenCalledTimes(1);
    expect(writeSessionMock).toHaveBeenCalledWith("session-a1", "/gsd-quick\r");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("row parameterized (discuss) em sessão ociosa: pré-preenche com espaço final, SEM \\r, fecha a paleta", () => {
    const { onClose } = renderPalette({ targetActivity: "idle" });
    writeSessionMock.mockResolvedValue(undefined);

    fireEvent.click(screen.getByRole("button", { name: "Discutir fase" }));

    expect(writeSessionMock).toHaveBeenCalledTimes(1);
    expect(writeSessionMock).toHaveBeenCalledWith("session-a1", "/gsd-discuss-phase ");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sessão ocupada (busy): row renderiza desabilitada dentro da lista (nunca filtrada), clique não chama writeSession", () => {
    const { onClose } = renderPalette({ targetActivity: "busy" });

    const button = screen.getByRole("button", { name: "Tarefa rápida" });
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(writeSessionMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sem sessão viva (hasLiveTarget=false): input mostra a dica noSession e fica desabilitado, rows desabilitadas", () => {
    renderPalette({ hasLiveTarget: false, targetSessionId: null, targetActivity: undefined });

    const input = screen.getByPlaceholderText("Crie ou selecione uma sessão para usar ações GSD");
    expect(input).toBeDisabled();

    const button = screen.getByRole("button", { name: "Tarefa rápida" });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(writeSessionMock).not.toHaveBeenCalled();
  });
});

describe("CommandPalette — navegação por teclado (ACT-04)", () => {
  it("↓ move a seleção e Enter ativa a row selecionada", () => {
    const { onClose } = renderPalette({ targetActivity: "idle" });
    writeSessionMock.mockResolvedValue(undefined);
    const input = screen.getByPlaceholderText("Buscar comando…");

    // Ordem fixa: discuss(0), plan(1) — uma seta para baixo seleciona "plan".
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(writeSessionMock).toHaveBeenCalledWith("session-a1", "/gsd-plan-phase ");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
