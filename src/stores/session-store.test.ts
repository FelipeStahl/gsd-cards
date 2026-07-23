import { describe, expect, it, vi, beforeEach } from "vitest";

const killSessionProcessMock = vi.fn();

vi.mock("../pty/channel", () => ({
  killSession: (...args: unknown[]) => killSessionProcessMock(...args),
}));

const { useSessionStore, toSessionError } = await import("./session-store");
const { useBoardStore } = await import("./board-store");

const initialSessionState = useSessionStore.getState();
const initialBoardState = useBoardStore.getState();

beforeEach(() => {
  useSessionStore.setState(initialSessionState, true);
  useBoardStore.setState(initialBoardState, true);
  killSessionProcessMock.mockReset();
});

function openProjectAt(root: string) {
  useBoardStore.setState((state) => {
    state.status = "open";
    // Só o campo que `createSession` lê é necessário para este teste — o
    // resto do shape de `ProjectStateModel` não é exercitado aqui.
    state.project = { root } as ReturnType<typeof useBoardStore.getState>["project"];
  });
}

describe("createSession", () => {
  it("retorna null e registra um erro quando nenhum projeto está aberto", () => {
    const id = useSessionStore.getState().createSession();

    expect(id).toBeNull();
    expect(useSessionStore.getState().activeSessionId).toBeNull();
    expect(useSessionStore.getState().error?.kind).toBe("Unknown");
  });

  it("gera um id e marca activeSessionId numa única transição quando um projeto está aberto", () => {
    openProjectAt("/repo");

    const id = useSessionStore.getState().createSession();

    expect(id).not.toBeNull();
    expect(useSessionStore.getState().activeSessionId).toBe(id);
    expect(useSessionStore.getState().error).toBeNull();
  });

  it("gera ids diferentes a cada chamada", () => {
    openProjectAt("/repo");

    const first = useSessionStore.getState().createSession();
    const second = useSessionStore.getState().createSession();

    expect(first).not.toBe(second);
  });
});

describe("killSession", () => {
  it("chama killSession do channel e limpa activeSessionId quando é a sessão ativa", async () => {
    openProjectAt("/repo");
    const id = useSessionStore.getState().createSession();
    killSessionProcessMock.mockResolvedValue(undefined);

    await useSessionStore.getState().killSession(id as string);

    expect(killSessionProcessMock).toHaveBeenCalledWith(id);
    expect(useSessionStore.getState().activeSessionId).toBeNull();
  });

  it("não mexe em activeSessionId quando o id encerrado não é o ativo", async () => {
    openProjectAt("/repo");
    const activeId = useSessionStore.getState().createSession();
    killSessionProcessMock.mockResolvedValue(undefined);

    await useSessionStore.getState().killSession("outra-sessao");

    expect(useSessionStore.getState().activeSessionId).toBe(activeId);
  });
});

describe("toSessionError", () => {
  it("normaliza um erro tagged { kind, message } vindo do Rust", () => {
    expect(toSessionError({ kind: "NotFound", message: "sessão x" })).toEqual({
      kind: "NotFound",
      message: "sessão x",
    });
  });

  it("degrada para Unknown quando o formato não é reconhecido", () => {
    expect(toSessionError("boom").kind).toBe("Unknown");
  });
});
