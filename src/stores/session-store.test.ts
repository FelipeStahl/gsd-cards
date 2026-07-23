import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
const readDirMock = vi.fn();
const statMock = vi.fn();
const killSessionProcessMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: (...args: unknown[]) => readDirMock(...args),
  stat: (...args: unknown[]) => statMock(...args),
}));

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
  invokeMock.mockReset();
  readDirMock.mockReset();
  statMock.mockReset();
  killSessionProcessMock.mockReset();
});

function openProjectAt(root: string) {
  useBoardStore.setState((state) => {
    state.status = "open";
    // Só o campo que `createSession`/`discoverSessions` lê é necessário
    // para estes testes — o resto do shape de `ProjectStateModel` não é
    // exercitado aqui.
    state.project = { root } as ReturnType<typeof useBoardStore.getState>["project"];
  });
}

function fakeEntry(name: string) {
  return { name, isDirectory: false, isFile: true, isSymlink: false };
}

describe("createSession", () => {
  it("retorna null e registra um erro quando nenhum projeto está aberto", () => {
    const id = useSessionStore.getState().createSession();

    expect(id).toBeNull();
    expect(useSessionStore.getState().activeSessionId).toBeNull();
    expect(useSessionStore.getState().error?.kind).toBe("Unknown");
    expect(useSessionStore.getState().sessions).toHaveLength(0);
  });

  it("gera um id e marca activeSessionId/lastFocusedSessionId numa única transição quando um projeto está aberto", () => {
    openProjectAt("/repo");

    const id = useSessionStore.getState().createSession();

    expect(id).not.toBeNull();
    const state = useSessionStore.getState();
    expect(state.activeSessionId).toBe(id);
    expect(state.lastFocusedSessionId).toBe(id);
    expect(state.error).toBeNull();
  });

  it("gera ids diferentes a cada chamada", () => {
    openProjectAt("/repo");

    const first = useSessionStore.getState().createSession();
    const second = useSessionStore.getState().createSession();

    expect(first).not.toBe(second);
  });

  it("registra a sessão criada em sessions[] com origin live", () => {
    openProjectAt("/repo");

    const id = useSessionStore.getState().createSession();

    const session = useSessionStore.getState().sessions.find((s) => s.id === id);
    expect(session?.origin).toBe("live");
  });
});

describe("focusSession", () => {
  it("marca uma sessão existente como ativa/focada sem criar uma nova entrada em sessions[]", () => {
    useSessionStore.getState().focusSession("historical-1");

    const state = useSessionStore.getState();
    expect(state.activeSessionId).toBe("historical-1");
    expect(state.lastFocusedSessionId).toBe("historical-1");
    expect(state.sessions).toHaveLength(0);
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

describe("discoverSessions (merge incremental — SESS-01)", () => {
  it("invoca register_sessions_scope e adiciona sessões descobertas como historical", async () => {
    invokeMock.mockResolvedValueOnce("/home/user/.claude/projects/-repo");
    readDirMock.mockResolvedValueOnce([fakeEntry("session-a.jsonl")]);
    statMock.mockResolvedValueOnce({ mtime: new Date("2026-01-01T00:00:00Z") });

    await useSessionStore.getState().discoverSessions("/repo");

    expect(invokeMock).toHaveBeenCalledWith("register_sessions_scope", { projectRoot: "/repo" });
    const state = useSessionStore.getState();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]).toMatchObject({ id: "session-a", origin: "historical" });
  });

  it("nunca rebaixa uma sessão live já rastreada para historical mesmo se o .jsonl correspondente também for descoberto", async () => {
    openProjectAt("/repo");
    const liveId = useSessionStore.getState().createSession();
    expect(liveId).not.toBeNull();

    invokeMock.mockResolvedValueOnce("/home/user/.claude/projects/-repo");
    readDirMock.mockResolvedValueOnce([fakeEntry(`${liveId}.jsonl`)]);
    statMock.mockResolvedValueOnce({ mtime: new Date("2026-01-02T00:00:00Z") });

    await useSessionStore.getState().discoverSessions("/repo");

    const state = useSessionStore.getState();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].id).toBe(liveId);
    expect(state.sessions[0].origin).toBe("live");
  });

  it("merge incremental preserva sessões já conhecidas de lotes anteriores (não reconstrói o array inteiro)", async () => {
    invokeMock.mockResolvedValueOnce("/home/user/.claude/projects/-repo");
    readDirMock.mockResolvedValueOnce([fakeEntry("session-a.jsonl")]);
    statMock.mockResolvedValueOnce({ mtime: new Date("2026-01-01T00:00:00Z") });
    await useSessionStore.getState().discoverSessions("/repo");

    invokeMock.mockResolvedValueOnce("/home/user/.claude/projects/-repo");
    readDirMock.mockResolvedValueOnce([fakeEntry("session-a.jsonl"), fakeEntry("session-b.jsonl")]);
    statMock.mockImplementation(async (path: string) => ({
      mtime: path.includes("session-a")
        ? new Date("2026-01-01T00:00:00Z")
        : new Date("2026-01-03T00:00:00Z"),
    }));
    await useSessionStore.getState().discoverSessions("/repo");

    const state = useSessionStore.getState();
    expect(state.sessions.map((session) => session.id).sort()).toEqual(["session-a", "session-b"]);
  });

  it("degrada silenciosamente (sem lançar) quando register_sessions_scope falha", async () => {
    invokeMock.mockRejectedValueOnce(new Error("não está num contexto Tauri real"));

    await expect(useSessionStore.getState().discoverSessions("/repo")).resolves.toBeUndefined();
    expect(useSessionStore.getState().sessions).toHaveLength(0);
    expect(readDirMock).not.toHaveBeenCalled();
  });
});
