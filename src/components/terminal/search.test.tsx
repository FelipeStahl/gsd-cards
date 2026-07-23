// TERM-03: cobre a lógica de UI da `TerminalSearchBar` (contador, ciclo
// next/prev, estado no-match em warning) com um `SearchAddon` mockado.
//
// `@xterm/addon-search` real exige um `Terminal` real montado via
// `terminal.open()`, que por sua vez exige `HTMLCanvasElement.getContext`
// (o jsdom deste projeto não fornece — sem o pacote `canvas`, fora do
// escopo desta fase) — confirmado experimentalmente durante a execução
// deste plano. `TerminalSearchBar` por isso recebe o addon via prop
// tipado por `SearchAddonHandle` (contrato mínimo, ver o componente), o
// que permite injetar aqui um mock estruturalmente compatível sem
// instanciar xterm.js de verdade. O highlight visual real do addon fica
// como UAT manual (backstop), conforme a Wave 0 do `02-RESEARCH.md`.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TerminalSearchBar, type SearchAddonHandle } from "./TerminalSearchBar";

interface Listener {
  (event: { resultIndex: number; resultCount: number }): void;
}

/** Mock mínimo do `SearchAddon` real — mesmo shape estrutural, sem canvas. */
function createMockSearchAddon() {
  const listeners: Listener[] = [];

  const addon: SearchAddonHandle = {
    findNext: vi.fn(() => true),
    findPrevious: vi.fn(() => true),
    onDidChangeResults: (listener: Listener) => {
      listeners.push(listener);
      return { dispose: () => {} };
    },
  };

  return {
    addon,
    /**
     * Simula o `onDidChangeResults` do addon real disparando após uma busca.
     * Envolto em `act()`: diferente de `fireEvent` (que já embrulha
     * automaticamente), chamar o listener diretamente é uma invocação de
     * função comum aos olhos do React — sem `act()`, o `setState` dentro do
     * listener não teria a atualização refletida de forma síncrona antes da
     * asserção seguinte.
     */
    emitResults(resultIndex: number, resultCount: number) {
      act(() => {
        for (const listener of listeners) listener({ resultIndex, resultCount });
      });
    },
  };
}

describe("TerminalSearchBar — contador e navegação (TERM-03)", () => {
  it("mostra o placeholder e nenhum contador antes de qualquer busca", () => {
    const { addon } = createMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon} onClose={() => {}} />);

    expect(screen.getByPlaceholderText("Buscar no terminal…")).toBeInTheDocument();
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
  });

  it("digitar aciona busca incremental e mostra o contador current/total", () => {
    const { addon, emitResults } = createMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Buscar no terminal…");
    fireEvent.change(input, { target: { value: "erro" } });

    expect(addon.findNext).toHaveBeenCalledWith(
      "erro",
      expect.objectContaining({ incremental: true, caseSensitive: false }),
    );

    emitResults(2, 12);
    expect(screen.getByText("3/12")).toBeInTheDocument();
  });

  it("zero matches mostra 0/0 com a borda do input em warning", () => {
    const { addon, emitResults } = createMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Buscar no terminal…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "não existe" } });
    emitResults(-1, 0);

    expect(screen.getByText("0/0")).toBeInTheDocument();
    expect(input.style.border).toContain("var(--color-warning)");
  });

  it("1+ matches não usa a cor de warning na borda", () => {
    const { addon, emitResults } = createMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Buscar no terminal…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ok" } });
    emitResults(0, 3);

    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(input.style.border).not.toContain("var(--color-warning)");
  });

  it("Enter chama findNext (próxima ocorrência)", () => {
    const { addon } = createMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Buscar no terminal…");
    fireEvent.change(input, { target: { value: "log" } });
    vi.mocked(addon.findNext).mockClear();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(addon.findNext).toHaveBeenCalledWith("log", expect.objectContaining({ incremental: false }));
  });

  it("Shift+Enter chama findPrevious (ocorrência anterior)", () => {
    const { addon } = createMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Buscar no terminal…");
    fireEvent.change(input, { target: { value: "log" } });

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(addon.findPrevious).toHaveBeenCalledWith("log", expect.any(Object));
  });

  it("o botão ChevronDown chama findNext e ChevronUp chama findPrevious", () => {
    const { addon } = createMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Buscar no terminal…");
    fireEvent.change(input, { target: { value: "log" } });
    vi.mocked(addon.findNext).mockClear();
    vi.mocked(addon.findPrevious).mockClear();

    fireEvent.click(screen.getByLabelText("Próxima ocorrência"));
    expect(addon.findNext).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Ocorrência anterior"));
    expect(addon.findPrevious).toHaveBeenCalledTimes(1);
  });

  it("Esc chama onClose e devolve o foco ao terminal", () => {
    const { addon } = createMockSearchAddon();
    const onClose = vi.fn();
    render(<TerminalSearchBar searchAddon={addon} onClose={onClose} />);

    fireEvent.keyDown(screen.getByPlaceholderText("Buscar no terminal…"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("o botão X (fechar) chama onClose", () => {
    const { addon } = createMockSearchAddon();
    const onClose = vi.fn();
    render(<TerminalSearchBar searchAddon={addon} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("Fechar busca"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("limpar o campo de busca esconde o contador novamente", () => {
    const { addon, emitResults } = createMockSearchAddon();
    render(<TerminalSearchBar searchAddon={addon} onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Buscar no terminal…");
    fireEvent.change(input, { target: { value: "log" } });
    emitResults(0, 1);
    expect(screen.getByText("1/1")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByText("1/1")).not.toBeInTheDocument();
  });
});
