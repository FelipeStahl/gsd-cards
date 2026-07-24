import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const setActivityHandlerMock = vi.fn();
const clearActivityHandlerMock = vi.fn();

/** Handlers registrados por sessão via `setActivityHandler` — o teste simula
 * bytes de PTY chegando invocando o callback capturado aqui diretamente,
 * sem precisar de um Channel/Tauri real (mesmo espírito de `channel.test.ts`'s `FakeChannel`). */
const registeredHandlers = new Map<string, (data: Uint8Array) => void>();

vi.mock("../../pty/channel", () => ({
  setActivityHandler: (sessionId: string, onBytes: (data: Uint8Array) => void) => {
    registeredHandlers.set(sessionId, onBytes);
    setActivityHandlerMock(sessionId, onBytes);
  },
  clearActivityHandler: (sessionId: string) => {
    registeredHandlers.delete(sessionId);
    clearActivityHandlerMock(sessionId);
  },
}));

const { wireTerminalActivity } = await import("./useTerminalActivity");
const { QUIESCENCE_MS } = await import("../../pty/activity");

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function emit(sessionId: string, text: string): void {
  const handler = registeredHandlers.get(sessionId);
  if (!handler) throw new Error(`nenhum handler registrado para ${sessionId}`);
  handler(encode(text));
}

beforeEach(() => {
  vi.useFakeTimers();
  registeredHandlers.clear();
  setActivityHandlerMock.mockReset();
  clearActivityHandlerMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("wireTerminalActivity", () => {
  it("transiciona para busy imediatamente no primeiro byte após idle (antes de QUIESCENCE_MS)", () => {
    const onChange = vi.fn();
    wireTerminalActivity("session-a", onChange);

    emit("session-a", "some random output\n");

    expect(onChange).toHaveBeenCalledExactlyOnceWith("busy");
  });

  it("transiciona para idle após QUIESCENCE_MS de silêncio (fake timers)", () => {
    const onChange = vi.fn();
    wireTerminalActivity("session-b", onChange);

    emit("session-b", "some output\n");
    onChange.mockClear();

    vi.advanceTimersByTime(QUIESCENCE_MS);

    expect(onChange).toHaveBeenCalledExactlyOnceWith("idle");
  });

  it("um buffer contendo o marcador awaiting transiciona para awaiting (não busy)", () => {
    const onChange = vi.fn();
    wireTerminalActivity("session-c", onChange);

    emit("session-c", "Do you want to proceed?\n❯ 1. Yes");

    expect(onChange).toHaveBeenCalledExactlyOnceWith("awaiting");
  });

  it("onChange só dispara em transições reais — um segundo byte no mesmo estado não re-invoca onChange", () => {
    const onChange = vi.fn();
    wireTerminalActivity("session-d", onChange);

    emit("session-d", "chunk um\n");
    expect(onChange).toHaveBeenCalledTimes(1);

    emit("session-d", "chunk dois, ainda sem marcador\n");
    // Ambos os chunks classificam como busy — sem transição real na segunda chamada.
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("cada sessão tem seu próprio decoder/buffer/timer — duas sessões não ficam em lockstep", () => {
    const onChangeA = vi.fn();
    const onChangeB = vi.fn();
    wireTerminalActivity("session-e", onChangeA);
    wireTerminalActivity("session-f", onChangeB);

    // Só a sessão E recebe bytes agora.
    emit("session-e", "output só na sessão E\n");
    expect(onChangeA).toHaveBeenCalledWith("busy");
    expect(onChangeB).not.toHaveBeenCalled();

    // Avança o tempo o suficiente para E voltar a idle — F nunca recebeu
    // bytes, então nunca teve um timer armado, e não deve transicionar.
    vi.advanceTimersByTime(QUIESCENCE_MS);
    expect(onChangeA).toHaveBeenCalledWith("idle");
    expect(onChangeB).not.toHaveBeenCalled();
  });

  it("o cleanup retornado limpa o timer pendente e chama clearActivityHandler", () => {
    const onChange = vi.fn();
    const cleanup = wireTerminalActivity("session-g", onChange);

    emit("session-g", "output\n");
    onChange.mockClear();

    cleanup();
    expect(clearActivityHandlerMock).toHaveBeenCalledWith("session-g");

    // Timer já foi limpo pelo cleanup — avançar o tempo não deve mais
    // disparar a transição idle pendente.
    vi.advanceTimersByTime(QUIESCENCE_MS);
    expect(onChange).not.toHaveBeenCalled();
  });
});
