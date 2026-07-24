import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
const listenMock = vi.fn();
const testSessionCounter = { current: 0 };

/** Cada `describe` usa um sessionId novo — evita que o `bytesHandlers` module-level do `channel.ts` vaze estado entre testes que não passam por `killSession`. */
function freshSessionId(): string {
  testSessionCounter.current += 1;
  return `session-test-${testSessionCounter.current}`;
}

/** Duplo mínimo de `Channel` — só o suficiente para capturar o `onmessage`
 * atribuído por `spawnSession` e disparar mensagens manualmente no teste,
 * sem depender de `window.__TAURI_INTERNALS__` (implementação real). */
class FakeChannel<T> {
  onmessage: ((message: T) => void) | undefined;
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  Channel: FakeChannel,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

const {
  spawnSession,
  writeSession,
  resizeSession,
  killSession,
  listenForSessionExit,
  stopListeningForSessionExit,
} = await import("./channel");

beforeEach(() => {
  invokeMock.mockReset();
  listenMock.mockReset().mockResolvedValue(vi.fn());
});

describe("spawnSession", () => {
  it("invoca spawn_session com sessionId/cwd/onEvent", async () => {
    invokeMock.mockResolvedValue(undefined);

    await spawnSession("session-1", "/repo", () => {});

    expect(invokeMock).toHaveBeenCalledWith(
      "spawn_session",
      expect.objectContaining({ sessionId: "session-1", cwd: "/repo" }),
    );
  });

  it("invoca spawn_session com args: [] por padrão quando nenhum args é passado", async () => {
    invokeMock.mockResolvedValue(undefined);

    await spawnSession("session-1", "/repo", () => {});

    expect(invokeMock).toHaveBeenCalledWith(
      "spawn_session",
      expect.objectContaining({ args: [] }),
    );
  });

  it("invoca spawn_session com o args fornecido (ex.: --resume lazy-restore)", async () => {
    invokeMock.mockResolvedValue(undefined);

    await spawnSession("session-1", "/repo", () => {}, ["--resume", "session-1"]);

    expect(invokeMock).toHaveBeenCalledWith(
      "spawn_session",
      expect.objectContaining({ args: ["--resume", "session-1"] }),
    );
  });

  it("normaliza um payload number[] (JSON de Vec<u8>) para Uint8Array antes de chamar onBytes", async () => {
    invokeMock.mockResolvedValue(undefined);
    const received: Uint8Array[] = [];

    await spawnSession("session-1", "/repo", (bytes) => received.push(bytes));

    const [, args] = invokeMock.mock.calls[0] as [string, { onEvent: FakeChannel<unknown> }];
    args.onEvent.onmessage?.([104, 105]); // "hi"

    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(Uint8Array);
    expect(Array.from(received[0])).toEqual([104, 105]);
  });

  it("normaliza um payload ArrayBuffer para Uint8Array antes de chamar onBytes", async () => {
    invokeMock.mockResolvedValue(undefined);
    const received: Uint8Array[] = [];

    await spawnSession("session-1", "/repo", (bytes) => received.push(bytes));

    const [, args] = invokeMock.mock.calls[0] as [string, { onEvent: FakeChannel<unknown> }];
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    args.onEvent.onmessage?.(buffer);

    expect(received).toHaveLength(1);
    expect(Array.from(received[0])).toEqual([1, 2, 3]);
  });
});

describe("writeSession/resizeSession", () => {
  it("invoca write_session com sessionId/data", async () => {
    invokeMock.mockResolvedValue(undefined);
    await writeSession("session-1", "ls\n");
    expect(invokeMock).toHaveBeenCalledWith("write_session", { sessionId: "session-1", data: "ls\n" });
  });

  it("invoca resize_session com cols/rows", async () => {
    invokeMock.mockResolvedValue(undefined);
    await resizeSession("session-1", 80, 24);
    expect(invokeMock).toHaveBeenCalledWith("resize_session", {
      sessionId: "session-1",
      cols: 80,
      rows: 24,
    });
  });
});

describe("killSession", () => {
  it("invoca kill_session e não lança quando a sessão já não existe", async () => {
    invokeMock.mockRejectedValue(new Error("NotFound"));
    await expect(killSession("session-1")).resolves.toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith("kill_session", { sessionId: "session-1" });
  });
});

describe("setSessionBytesHandler (redirecionamento do foco — SESS-03)", () => {
  it("redireciona o onmessage de uma sessão já viva sem recriar o Channel/spawn", async () => {
    const { setSessionBytesHandler } = await import("./channel");
    const sessionId = freshSessionId();
    invokeMock.mockResolvedValue(undefined);

    const initialReceived: Uint8Array[] = [];
    await spawnSession(sessionId, "/repo", (bytes) => initialReceived.push(bytes));
    const [, args] = invokeMock.mock.calls[0] as [string, { onEvent: FakeChannel<unknown> }];

    args.onEvent.onmessage?.([1]);
    expect(initialReceived).toHaveLength(1);

    const redirected: Uint8Array[] = [];
    setSessionBytesHandler(sessionId, (bytes) => redirected.push(bytes));

    args.onEvent.onmessage?.([2]);
    expect(initialReceived).toHaveLength(1); // handler antigo não recebe mais nada
    expect(redirected).toHaveLength(1);
    expect(Array.from(redirected[0])).toEqual([2]);
    expect(invokeMock).toHaveBeenCalledTimes(1); // nunca chamou spawn_session de novo
  });

  it("killSession remove o handler registrado — mensagens tardias não vazam pra um handler morto", async () => {
    const { setSessionBytesHandler } = await import("./channel");
    const sessionId = freshSessionId();
    invokeMock.mockResolvedValueOnce(undefined);

    const received: Uint8Array[] = [];
    await spawnSession(sessionId, "/repo", (bytes) => received.push(bytes));
    const [, args] = invokeMock.mock.calls[0] as [string, { onEvent: FakeChannel<unknown> }];

    invokeMock.mockResolvedValueOnce(undefined);
    await killSession(sessionId);

    // Sem um handler registrado (removido por killSession), a mensagem
    // tardia não lança nem é silenciosamente entregue ao array antigo.
    args.onEvent.onmessage?.([3]);
    expect(received).toHaveLength(0);

    const freshHandlerCalls: Uint8Array[] = [];
    setSessionBytesHandler(sessionId, (bytes) => freshHandlerCalls.push(bytes));
    args.onEvent.onmessage?.([4]);
    expect(freshHandlerCalls).toHaveLength(1);
  });
});

describe("activityHandlers (segundo consumidor sempre-ativo — ACT-03)", () => {
  it("um activity handler sobrevive a um swap de setSessionBytesHandler (foco)", async () => {
    const { setActivityHandler, setSessionBytesHandler } = await import("./channel");
    const sessionId = freshSessionId();
    invokeMock.mockResolvedValue(undefined);

    const activityReceived: Uint8Array[] = [];
    await spawnSession(sessionId, "/repo", () => {});
    const [, args] = invokeMock.mock.calls[0] as [string, { onEvent: FakeChannel<unknown> }];

    setActivityHandler(sessionId, (bytes) => activityReceived.push(bytes));

    args.onEvent.onmessage?.([1]);
    expect(activityReceived).toHaveLength(1);

    // Troca de foco (bytesHandlers) NÃO deve remover/afetar o activity handler.
    const bytesRedirected: Uint8Array[] = [];
    setSessionBytesHandler(sessionId, (bytes) => bytesRedirected.push(bytes));

    args.onEvent.onmessage?.([2]);
    expect(bytesRedirected).toHaveLength(1);
    expect(activityReceived).toHaveLength(2); // continua recebendo, independente do foco
  });

  it("clearActivityHandler para de entregar bytes ao callback", async () => {
    const { setActivityHandler, clearActivityHandler } = await import("./channel");
    const sessionId = freshSessionId();
    invokeMock.mockResolvedValue(undefined);

    const activityReceived: Uint8Array[] = [];
    await spawnSession(sessionId, "/repo", () => {});
    const [, args] = invokeMock.mock.calls[0] as [string, { onEvent: FakeChannel<unknown> }];

    setActivityHandler(sessionId, (bytes) => activityReceived.push(bytes));
    args.onEvent.onmessage?.([1]);
    expect(activityReceived).toHaveLength(1);

    clearActivityHandler(sessionId);
    args.onEvent.onmessage?.([2]);
    expect(activityReceived).toHaveLength(1); // não recebeu mais nada
  });

  it("killSession remove o handler de AMBOS os mapas (bytesHandlers e activityHandlers)", async () => {
    const { setActivityHandler, setSessionBytesHandler } = await import("./channel");
    const sessionId = freshSessionId();
    invokeMock.mockResolvedValueOnce(undefined);

    const bytesReceived: Uint8Array[] = [];
    const activityReceived: Uint8Array[] = [];
    await spawnSession(sessionId, "/repo", (bytes) => bytesReceived.push(bytes));
    setSessionBytesHandler(sessionId, (bytes) => bytesReceived.push(bytes));
    setActivityHandler(sessionId, (bytes) => activityReceived.push(bytes));
    const [, args] = invokeMock.mock.calls[0] as [string, { onEvent: FakeChannel<unknown> }];

    invokeMock.mockResolvedValueOnce(undefined);
    await killSession(sessionId);

    args.onEvent.onmessage?.([9]);
    expect(bytesReceived).toHaveLength(0);
    expect(activityReceived).toHaveLength(0);
  });
});

describe("listenForSessionExit (evento global pty:session-exited)", () => {
  it("registra o listener em pty:session-exited e repassa o sessionId do payload", async () => {
    let capturedCallback: ((event: { payload: { sessionId: string } }) => void) | undefined;
    listenMock.mockImplementation(async (eventName: string, callback: unknown) => {
      expect(eventName).toBe("pty:session-exited");
      capturedCallback = callback as typeof capturedCallback;
      return vi.fn();
    });

    const received: string[] = [];
    await listenForSessionExit((sessionId) => received.push(sessionId));

    capturedCallback?.({ payload: { sessionId: "session-9" } });
    expect(received).toEqual(["session-9"]);
  });

  it("derruba um listener anterior antes de registrar um novo", async () => {
    const unlistenFirst = vi.fn();
    listenMock.mockResolvedValueOnce(unlistenFirst);

    await listenForSessionExit(() => {});
    await listenForSessionExit(() => {});

    expect(unlistenFirst).toHaveBeenCalled();
    expect(listenMock).toHaveBeenCalledTimes(2);
  });

  it("stopListeningForSessionExit remove o listener registrado", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValueOnce(unlisten);

    await listenForSessionExit(() => {});
    await stopListeningForSessionExit();

    expect(unlisten).toHaveBeenCalled();
  });

  it("stopListeningForSessionExit sem listener registrado não lança", async () => {
    await expect(stopListeningForSessionExit()).resolves.toBeUndefined();
  });
});
