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

  it("CR-02: awaiting respondido seguido de output busy COM o marcador esc-to-interrupt classifica busy — o awaiting antigo não fica preso no buffer", () => {
    const onChange = vi.fn();
    wireTerminalActivity("session-h", onChange);

    emit("session-h", "Do you want to proceed?\n❯ 1. Yes");
    expect(onChange).toHaveBeenLastCalledWith("awaiting");

    // Prompt respondido — nova rajada claramente busy. Sem o fix, o texto
    // "Do you want to proceed?" ainda estaria dentro dos últimos 2000
    // caracteres do buffer acumulado, e AWAITING_MARKER tem precedência
    // sobre BUSY_MARKER em `classifyActivity` — o estado ficaria preso em
    // awaiting mesmo com "esc to interrupt" presente nesta rajada.
    emit("session-h", "Working... (esc to interrupt)");

    expect(onChange).toHaveBeenLastCalledWith("busy");
  });

  it("CR-02: awaiting respondido seguido de output busy SEM nenhum marcador também classifica busy (nunca trava em awaiting)", () => {
    const onChange = vi.fn();
    wireTerminalActivity("session-i", onChange);

    emit("session-i", "Do you want to proceed?\n❯ 1. Yes");
    expect(onChange).toHaveBeenLastCalledWith("awaiting");

    // Sem NENHUM marcador nesta rajada — sem o fix, o AWAITING_MARKER do
    // texto antigo ainda presente no buffer faria `classifyActivity`
    // retornar "awaiting" de novo (mesmo estado — `transition` nem
    // dispara `onChange`), então o `onChange` mais recente continuaria
    // sendo "awaiting" em vez de refletir a rajada busy real.
    emit("session-i", "algum output qualquer, sem nenhum marcador");

    expect(onChange).toHaveBeenLastCalledWith("busy");
  });

  it("CR-02: um marcador awaiting fresco (após um ciclo busy anterior) continua classificando awaiting normalmente — limpar o buffer não quebra a detecção", () => {
    const onChange = vi.fn();
    wireTerminalActivity("session-j", onChange);

    emit("session-j", "chunk busy inicial, sem marcador\n");
    expect(onChange).toHaveBeenLastCalledWith("busy");

    emit("session-j", "Do you want to proceed?\n❯ 1. Yes");
    expect(onChange).toHaveBeenLastCalledWith("awaiting");
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
