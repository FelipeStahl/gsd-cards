// WR-01: `createTerminalKeyHandler` cobre a lógica pura (sem canvas/xterm
// real, ver a nota em `search.test.tsx`) do handler passado a
// `attachCustomKeyEventHandler`. O foco desta suíte é provar que Ctrl/Cmd+K
// NUNCA alcança o PTY — o handler retorna `false` (xterm pula seu
// processamento padrão dessa tecla, então `onData` nunca dispara para ela)
// antes mesmo de a paleta ter qualquer chance de abrir.

import { describe, expect, it, vi } from "vitest";

import { createTerminalKeyHandler } from "./TerminalView";

function keydownEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    type: "keydown",
    ctrlKey: false,
    metaKey: false,
    key: "",
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent;
}

describe("createTerminalKeyHandler — WR-01: Ctrl/Cmd+K nunca alcança o PTY", () => {
  it("retorna false para Ctrl+K — xterm pula seu processamento padrão, onData nunca dispara para essa tecla", () => {
    const handler = createTerminalKeyHandler(vi.fn());
    const event = keydownEvent({ ctrlKey: true, key: "k" });

    expect(handler(event)).toBe(false);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("retorna false para Cmd+K (metaKey, macOS) — case-insensitive na tecla", () => {
    const handler = createTerminalKeyHandler(vi.fn());
    const event = keydownEvent({ metaKey: true, key: "K" });

    expect(handler(event)).toBe(false);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+K não chama onOpenSearch — abrir a paleta continua sendo responsabilidade independente do listener window-level do GsdCommandToolbar", () => {
    const onOpenSearch = vi.fn();
    const handler = createTerminalKeyHandler(onOpenSearch);

    handler(keydownEvent({ ctrlKey: true, key: "k" }));

    expect(onOpenSearch).not.toHaveBeenCalled();
  });

  it("Ctrl+F continua abrindo a busca (comportamento pré-existente preservado)", () => {
    const onOpenSearch = vi.fn();
    const handler = createTerminalKeyHandler(onOpenSearch);
    const event = keydownEvent({ ctrlKey: true, key: "f" });

    expect(handler(event)).toBe(false);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("Cmd+F (metaKey) também abre a busca", () => {
    const onOpenSearch = vi.fn();
    const handler = createTerminalKeyHandler(onOpenSearch);

    handler(keydownEvent({ metaKey: true, key: "F" }));

    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("outras teclas (sem Ctrl/Cmd) retornam true — deixa o xterm processar normalmente como input do PTY", () => {
    const handler = createTerminalKeyHandler(vi.fn());

    expect(handler(keydownEvent({ key: "a" }))).toBe(true);
    expect(handler(keydownEvent({ ctrlKey: true, key: "c" }))).toBe(true);
  });

  it("eventos que não são keydown sempre retornam true (ex.: keyup) mesmo com Ctrl+K", () => {
    const handler = createTerminalKeyHandler(vi.fn());
    const event = keydownEvent({ type: "keyup", ctrlKey: true, key: "k" });

    expect(handler(event)).toBe(true);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
