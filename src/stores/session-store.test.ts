import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
const readDirMock = vi.fn();
const statMock = vi.fn();
const killSessionProcessMock = vi.fn();
const spawnSessionMock = vi.fn();
const writeSessionMock = vi.fn();
const wireTerminalActivityMock = vi.fn();
const activityStopMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: (...args: unknown[]) => readDirMock(...args),
  stat: (...args: unknown[]) => statMock(...args),
}));

vi.mock("../pty/channel", () => ({
  killSession: (...args: unknown[]) => killSessionProcessMock(...args),
  spawnSession: (...args: unknown[]) => spawnSessionMock(...args),
  writeSession: (...args: unknown[]) => writeSessionMock(...args),
}));

// CR-01: `createSession` now wires ACT-03 activity classification directly
// (independent of any `TerminalView` mount) via
// `useTerminalActivity::wireTerminalActivity`. Mocked here so these
// session-lifecycle tests stay isolated from the decoder/rolling-buffer
// implementation (covered separately by `useTerminalActivity.test.ts`) —
// what THIS suite must prove is the wiring/teardown CONTRACT: wired at
// creation regardless of UI, stopped only at kill/archive.
vi.mock("../components/terminal/useTerminalActivity", () => ({
  wireTerminalActivity: (...args: unknown[]) => wireTerminalActivityMock(...args),
}));

// `renameSession` (SESS-05) persiste via `app-store.ts` — mockado no nível
// do módulo (mesmo padrão de `AppShell.test.tsx`) para que estas
// suítes de ciclo de vida de sessão nunca façam uma chamada real de
// `LazyStore`/plugin Tauri.
const setSessionNameMock = vi.fn();
vi.mock("../persistence/app-store", () => ({
  setSessionName: (...args: unknown[]) => setSessionNameMock(...args),
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
  spawnSessionMock.mockReset().mockResolvedValue(undefined);
  writeSessionMock.mockReset().mockResolvedValue(undefined);
  wireTerminalActivityMock.mockReset();
  activityStopMock.mockReset();
  wireTerminalActivityMock.mockReturnValue(activityStopMock);
  setSessionNameMock.mockReset().mockResolvedValue(undefined);
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

  it("tag a sessão criada com o projectRoot do projeto aberto (PROJ-05)", () => {
    openProjectAt("/repo");

    const id = useSessionStore.getState().createSession();

    const session = useSessionStore.getState().sessions.find((s) => s.id === id);
    expect(session?.projectRoot).toBe("/repo");
  });
});

describe("createProjectSession", () => {
  it("spawna com a pasta crua como cwd e injeta /gsd-new-project, sem chamar validateProjectRoot", async () => {
    invokeMock.mockResolvedValueOnce("/home/user/.claude/projects/-nova-pasta");

    const id = await useSessionStore.getState().createProjectSession("/nova-pasta");

    expect(id).toEqual(expect.any(String));
    expect(spawnSessionMock).toHaveBeenCalledWith(id, "/nova-pasta", expect.any(Function));
    expect(writeSessionMock).toHaveBeenCalledWith(id, "/gsd-new-project\r");
    // Nenhum outro módulo deste teste expõe/mocka `validateProjectRoot` —
    // se `createProjectSession` tentasse chamá-lo, o import real (não
    // mockado) do módulo `../planning/read` seria exercitado, o que não
    // acontece aqui (nenhuma chamada de `invoke("validate_project_root", ...)`).
    expect(invokeMock).not.toHaveBeenCalledWith("validate_project_root", expect.anything());
  });

  it("registra a sessão criada em sessions[] com origin live e a marca ativa/focada", async () => {
    invokeMock.mockResolvedValueOnce("/home/user/.claude/projects/-nova-pasta");

    const id = await useSessionStore.getState().createProjectSession("/nova-pasta");

    const state = useSessionStore.getState();
    expect(state.activeSessionId).toBe(id);
    expect(state.lastFocusedSessionId).toBe(id);
    expect(state.sessions.find((session) => session.id === id)?.origin).toBe("live");
  });

  it("tag a sessão criada com a pasta crua como projectRoot (PROJ-05)", async () => {
    invokeMock.mockResolvedValueOnce("/home/user/.claude/projects/-nova-pasta");

    const id = await useSessionStore.getState().createProjectSession("/nova-pasta");

    const state = useSessionStore.getState();
    expect(state.sessions.find((session) => session.id === id)?.projectRoot).toBe("/nova-pasta");
  });

  it("chama invoke(register_sessions_scope) com a pasta crua, mas degrada silenciosamente se ele falhar", async () => {
    invokeMock.mockRejectedValueOnce(new Error("register_sessions_scope indisponível"));

    const id = await useSessionStore.getState().createProjectSession("/nova-pasta");

    expect(invokeMock).toHaveBeenCalledWith("register_sessions_scope", { projectRoot: "/nova-pasta" });
    // O spawn/injeção acontecem mesmo com a falha do registro de escopo —
    // esse registro só afeta a descoberta de sessões históricas, nunca o
    // fluxo de criação em si.
    expect(spawnSessionMock).toHaveBeenCalledWith(id, "/nova-pasta", expect.any(Function));
    expect(writeSessionMock).toHaveBeenCalledWith(id, "/gsd-new-project\r");
  });

  it("wireia a classificação de atividade (ACT-03) para a sessão criada, mesma disciplina de createSession", async () => {
    invokeMock.mockResolvedValueOnce("/home/user/.claude/projects/-nova-pasta");

    const id = await useSessionStore.getState().createProjectSession("/nova-pasta");

    expect(wireTerminalActivityMock).toHaveBeenCalledWith(id, expect.any(Function));
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

describe("liveSessions (SESS-03)", () => {
  it("getOrCreateLiveSession cria um LiveSessionState vazio na primeira chamada", () => {
    const liveSession = useSessionStore.getState().getOrCreateLiveSession("session-x-1");

    expect(liveSession).toEqual({ serializedSnapshot: null, backgroundBuffer: [], hasWebgl: false });
    expect(useSessionStore.getState().hasLiveSession("session-x-1")).toBe(true);
  });

  it("getOrCreateLiveSession retorna a MESMA instância em chamadas subsequentes (nunca recria)", () => {
    const first = useSessionStore.getState().getOrCreateLiveSession("session-x-2");
    first.hasWebgl = true;

    const second = useSessionStore.getState().getOrCreateLiveSession("session-x-2");

    expect(second).toBe(first);
    expect(second.hasWebgl).toBe(true);
  });

  it("hasLiveSession é false para uma sessão nunca focada", () => {
    expect(useSessionStore.getState().hasLiveSession("session-x-nunca-focada")).toBe(false);
  });

  it("clearLiveSession remove a entrada do mapa", () => {
    useSessionStore.getState().getOrCreateLiveSession("session-x-3");
    useSessionStore.getState().clearLiveSession("session-x-3");

    expect(useSessionStore.getState().hasLiveSession("session-x-3")).toBe(false);
  });
});

describe("archiveSession (SESS-06 — Arquivar/Excluir)", () => {
  it("mata a árvore de processos, remove a sessão de sessions[] e limpa activeSessionId/lastFocusedSessionId quando é a sessão ativa", async () => {
    openProjectAt("/repo");
    const id = useSessionStore.getState().createSession() as string;
    useSessionStore.getState().getOrCreateLiveSession(id);
    killSessionProcessMock.mockResolvedValue(undefined);

    await useSessionStore.getState().archiveSession(id);

    expect(killSessionProcessMock).toHaveBeenCalledWith(id);
    const state = useSessionStore.getState();
    expect(state.activeSessionId).toBeNull();
    expect(state.lastFocusedSessionId).toBeNull();
    expect(state.sessions.find((session) => session.id === id)).toBeUndefined();
    expect(state.hasLiveSession(id)).toBe(false);
  });

  it("não mexe em activeSessionId quando a sessão arquivada/excluída não é a ativa", async () => {
    openProjectAt("/repo");
    const activeId = useSessionStore.getState().createSession() as string;
    const otherId = useSessionStore.getState().createSession() as string;
    killSessionProcessMock.mockResolvedValue(undefined);

    // `createSession` marca a sessão mais recente como ativa/focada —
    // arquiva a PRIMEIRA (não ativa) e confirma que a ativa é preservada.
    useSessionStore.getState().focusSession(activeId);
    await useSessionStore.getState().archiveSession(otherId);

    const state = useSessionStore.getState();
    expect(state.activeSessionId).toBe(activeId);
    expect(state.sessions.find((session) => session.id === otherId)).toBeUndefined();
    expect(state.sessions.find((session) => session.id === activeId)).toBeDefined();
  });
});

describe("activity wiring lifecycle (CR-01 — always-on, independent of TerminalView)", () => {
  it("createSession wires ACT-03 activity classification for the new live session id — no TerminalView involved at all", () => {
    openProjectAt("/repo");

    const id = useSessionStore.getState().createSession();

    expect(wireTerminalActivityMock).toHaveBeenCalledWith(id, expect.any(Function));
  });

  it("invoking the wired onChange callback updates SessionDescriptor.activity for a session that never had a TerminalView mounted (a background/non-active session, or the collapsed drawer's lastFocusedSessionId fallback target)", () => {
    openProjectAt("/repo");
    const activeId = useSessionStore.getState().createSession() as string;
    // A second session created (and thus never focused/active) — this is
    // exactly the "background session" scenario CR-01 was about: its
    // activity must still update even though it is never the
    // activeSessionId and no TerminalView ever mounts for it in this test.
    const backgroundId = useSessionStore.getState().createSession() as string;
    expect(backgroundId).not.toBe(activeId);

    const backgroundOnChange = wireTerminalActivityMock.mock.calls.find(
      ([sessionId]) => sessionId === backgroundId,
    )?.[1] as ((activity: string) => void) | undefined;
    expect(backgroundOnChange).toBeDefined();

    backgroundOnChange?.("busy");

    const session = useSessionStore.getState().sessions.find((s) => s.id === backgroundId);
    expect(session?.activity).toBe("busy");
  });

  it("killSession stops the activity wiring for that session (true end-of-life, not a focus change)", async () => {
    openProjectAt("/repo");
    const id = useSessionStore.getState().createSession() as string;
    killSessionProcessMock.mockResolvedValue(undefined);

    await useSessionStore.getState().killSession(id);

    expect(activityStopMock).toHaveBeenCalledTimes(1);
  });

  it("archiveSession stops the activity wiring for that session", async () => {
    openProjectAt("/repo");
    const id = useSessionStore.getState().createSession() as string;
    killSessionProcessMock.mockResolvedValue(undefined);

    await useSessionStore.getState().archiveSession(id);

    expect(activityStopMock).toHaveBeenCalledTimes(1);
  });

  it("focusSession (switching which session is active/displayed) never stops or re-wires activity — a collapsed drawer or session switch must not freeze the busy-guard", () => {
    openProjectAt("/repo");
    const id = useSessionStore.getState().createSession() as string;
    wireTerminalActivityMock.mockClear();
    activityStopMock.mockClear();

    useSessionStore.getState().focusSession("some-other-session");
    useSessionStore.getState().focusSession(id);

    expect(wireTerminalActivityMock).not.toHaveBeenCalled();
    expect(activityStopMock).not.toHaveBeenCalled();
  });
});

describe("setActivity (ACT-03 — transition-gated)", () => {
  it("atualiza SessionDescriptor.activity quando o valor muda", () => {
    openProjectAt("/repo");
    const id = useSessionStore.getState().createSession() as string;

    useSessionStore.getState().setActivity(id, "busy");

    const session = useSessionStore.getState().sessions.find((s) => s.id === id);
    expect(session?.activity).toBe("busy");
  });

  it("chamar com o mesmo valor duas vezes não produz uma nova transição de store (sessions[] mantém a mesma referência)", () => {
    openProjectAt("/repo");
    const id = useSessionStore.getState().createSession() as string;

    useSessionStore.getState().setActivity(id, "busy");
    const sessionsAfterFirst = useSessionStore.getState().sessions;

    useSessionStore.getState().setActivity(id, "busy");
    const sessionsAfterSecond = useSessionStore.getState().sessions;

    expect(sessionsAfterSecond).toBe(sessionsAfterFirst); // sem set() na segunda chamada
  });

  it("chamar com um valor diferente atualiza o descriptor e produz uma nova transição", () => {
    openProjectAt("/repo");
    const id = useSessionStore.getState().createSession() as string;

    useSessionStore.getState().setActivity(id, "busy");
    const sessionsAfterBusy = useSessionStore.getState().sessions;

    useSessionStore.getState().setActivity(id, "awaiting");
    const sessionsAfterAwaiting = useSessionStore.getState().sessions;

    expect(sessionsAfterAwaiting).not.toBe(sessionsAfterBusy);
    const session = useSessionStore.getState().sessions.find((s) => s.id === id);
    expect(session?.activity).toBe("awaiting");
  });

  it("é um no-op seguro para um id de sessão desconhecido/ausente", () => {
    expect(() => useSessionStore.getState().setActivity("sessao-inexistente", "busy")).not.toThrow();
    expect(
      useSessionStore.getState().sessions.find((s) => s.id === "sessao-inexistente"),
    ).toBeUndefined();
  });
});

describe("renameSession (SESS-05)", () => {
  it("define o nome e persiste via app-store", async () => {
    openProjectAt("/repo");
    const id = useSessionStore.getState().createSession() as string;

    useSessionStore.getState().renameSession(id, "Meu terminal");

    const session = useSessionStore.getState().sessions.find((s) => s.id === id);
    expect(session?.name).toBe("Meu terminal");
    expect(setSessionNameMock).toHaveBeenCalledWith(id, "Meu terminal");
  });

  it("nome vazio (após trim) limpa name de volta para undefined — label cai para o derivado", () => {
    openProjectAt("/repo");
    const id = useSessionStore.getState().createSession() as string;
    useSessionStore.getState().renameSession(id, "Meu terminal");

    useSessionStore.getState().renameSession(id, "   ");

    const session = useSessionStore.getState().sessions.find((s) => s.id === id);
    expect(session?.name).toBeUndefined();
    expect(setSessionNameMock).toHaveBeenLastCalledWith(id, "");
  });

  it("valor inalterado é um no-op (sessions[] mantém a mesma referência, sem persistir de novo)", () => {
    openProjectAt("/repo");
    const id = useSessionStore.getState().createSession() as string;
    useSessionStore.getState().renameSession(id, "Meu terminal");
    setSessionNameMock.mockClear();
    const sessionsAfterFirst = useSessionStore.getState().sessions;

    useSessionStore.getState().renameSession(id, "Meu terminal");

    expect(useSessionStore.getState().sessions).toBe(sessionsAfterFirst);
    expect(setSessionNameMock).not.toHaveBeenCalled();
  });

  it("é um no-op seguro para um id de sessão desconhecido/ausente", () => {
    expect(() => useSessionStore.getState().renameSession("sessao-inexistente", "x")).not.toThrow();
    expect(setSessionNameMock).not.toHaveBeenCalled();
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
    expect(state.sessions[0]).toMatchObject({ id: "session-a", origin: "historical", projectRoot: "/repo" });
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
