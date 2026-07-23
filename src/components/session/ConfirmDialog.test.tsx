import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <ConfirmDialog
      heading="Excluir sessão?"
      body="Isso encerra o processo do Claude nesta sessão. O histórico da conversa permanece salvo pelo Claude Code."
      confirmLabel="Excluir"
      cancelLabel="Cancelar"
      tone="destructive"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { ...utils, onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("renderiza heading/body/confirm/cancel", () => {
    renderDialog();

    expect(screen.getByRole("alertdialog", { name: "Excluir sessão?" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Isso encerra o processo do Claude nesta sessão. O histórico da conversa permanece salvo pelo Claude Code.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("clicar em confirm chama onConfirm", () => {
    const { onConfirm, onCancel } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("clicar em cancel chama onCancel, nunca onConfirm", () => {
    const { onConfirm, onCancel } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Esc chama onCancel", () => {
    const { onCancel } = renderDialog();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("clicar no backdrop chama onCancel; clicar dentro do diálogo não propaga pro backdrop", () => {
    const { onCancel, container } = renderDialog();

    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(dialog);
    expect(onCancel).not.toHaveBeenCalled();

    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("tone=destructive usa --color-destructive no botão de confirmação; tone=neutral usa --color-accent", () => {
    const { rerender } = renderDialog({ tone: "destructive" });
    expect(screen.getByRole("button", { name: "Excluir" }).style.backgroundColor).toBe(
      "var(--color-destructive)",
    );

    rerender(
      <ConfirmDialog
        heading="Confirmar?"
        body="corpo"
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        tone="neutral"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Confirmar" }).style.backgroundColor).toBe(
      "var(--color-accent)",
    );
  });
});
