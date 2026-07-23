import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();

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

const { spawnSession, writeSession, resizeSession, killSession } = await import("./channel");

beforeEach(() => {
  invokeMock.mockReset();
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
