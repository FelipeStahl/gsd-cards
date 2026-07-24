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

// `renameSession` (SESS-05) e `persistSnapshot`/`loadPersistedSessions`
// (SESS-04, 04-06-PLAN.md) persistem via `app-store.ts` — mockado no nível
// do módulo (mesmo padrão de `AppShell.test.tsx`) para que estas
// suítes de ciclo de vida de sessão nunca façam uma chamada real de
// `LazyStore`/plugin Tauri.
const setSessionNameMock = vi.fn();
const upsertPersistedSessionMock = vi.fn();
const getPersistedSessionsMock = vi.fn();
vi.mock("../persistence/app-store", () => ({
  setSessionName: (...args: unknown[]) => setSessionNameMock(...args),
  upsertPersistedSession: (...args: unknown[]) => upsertPersistedSessionMock(...args),
  getPersistedSessions: (...args: unknown[]) => getPersistedSessionsMock(...args),
}));

// `resumeSession` (SESS-04) carrega/grava o snapshot serializado via
// `session-snapshot.ts` — mockado pelo mesmo motivo acima.
const loadSnapshotMock = vi.fn();
const saveSnapshotMock = vi.fn();
vi.mock("../persistence/session-snapshot", () => ({
  loadSnapshot: (...args: unknown[]) => loadSnapshotMock(...args),
  saveSnapshot: (...args: unknown[]) => saveSnapshotMock(...args),
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
  upsertPersistedSessionMock.mockReset().mockResolvedValue(undefined);
  getPersistedSessionsMock.mockReset().mockResolvedValue([]);
  loadSnapshotMock.mockReset().mockResolvedValue(null);
  saveSnapshotMock.mockReset().mockResolvedValue(undefined);
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

/** Insere um `SessionDescriptor` diretamente em `sessions[]`, sem passar
 * pelo fluxo real de `createSession`/`discoverSessions` — usado pelas
 * suítes de `resumeSession`/`persistSnapshot` (SESS-04) que precisam de
 * uma sessão `historical`/`restored` já conhecida antes do teste agir. */
function seedSession(overrides: Partial<import("./session-store").SessionDescriptor> = {}) {
  useSessionStore.setState((state) => {
    state.sessions.push({
      id: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
      lastModified: new Date("2026-07-01T00:00:00Z"),
      origin: "historical",
      projectRoot: "/repo",
      ...overrides,
    });
  });
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

describe("resumeSession (SESS-04 — T-04-16 flag-injection guard)", () => {
  it("recusa um id flag-shaped e NUNCA chama spawnSession (a asserção central T-04)", async () => {
    await useSessionStore.getState().resumeSession("--dangerously-skip-permissions");

    expect(spawnSessionMock).not.toHaveBeenCalled();
    expect(useSessionStore.getState().error?.message).toContain("--dangerously-skip-permissions");
  });

  it("recusa um id flag-shaped mesmo quando uma sessão com esse id existe em sessions[]", async () => {
    seedSession({ id: "-x" });

    await useSessionStore.getState().resumeSession("-x");

    expect(spawnSessionMock).not.toHaveBeenCalled();
  });

  it("registra um erro e não spawna para um id desconhecido (não presente em sessions[])", async () => {
    await useSessionStore.getState().resumeSession("a1b2c3d4-e5f6-4789-a012-3456789abcde");

    expect(spawnSessionMock).not.toHaveBeenCalled();
    expect(useSessionStore.getState().error?.message).toContain("Sessão desconhecida");
  });

  it("um id válido carrega o snapshot ANTES de spawnar, e spawna com args --resume e a PRÓPRIA projectRoot da sessão", async () => {
    // `liveSessions` (channel de módulo, ver o topo de session-store.ts) NÃO
    // é resetado entre testes — cada teste que passa pelo caminho de
    // sucesso de `resumeSession` precisa de um id ÚNICO, senão colide com a
    // marca "já viva" deixada por um teste anterior (idempotência).
    seedSession({ id: "11111111-1111-4111-a111-111111111111", projectRoot: "/repo-da-sessao" });
    loadSnapshotMock.mockResolvedValueOnce("snapshot serializado");
    // O projeto ATIVO é diferente do dono da sessão — prova que resumeSession
    // nunca usa activeProjectRoot (Pitfall 2 de 04-RESEARCH.md).
    openProjectAt("/projeto-ativo-diferente");

    await useSessionStore.getState().resumeSession("11111111-1111-4111-a111-111111111111");

    expect(loadSnapshotMock).toHaveBeenCalledWith("11111111-1111-4111-a111-111111111111");
    expect(spawnSessionMock).toHaveBeenCalledWith(
      "11111111-1111-4111-a111-111111111111",
      "/repo-da-sessao",
      expect.any(Function),
      ["--resume", "11111111-1111-4111-a111-111111111111"],
    );
  });

  it("grava o snapshot carregado em liveSession.serializedSnapshot ANTES da chamada a spawnSession (ordem exigida pelo backstop de rehidratação)", async () => {
    seedSession({ id: "22222222-2222-4222-a222-222222222222" });
    const order: string[] = [];
    loadSnapshotMock.mockImplementationOnce(async () => {
      order.push("loadSnapshot");
      return "snapshot antigo";
    });
    spawnSessionMock.mockImplementationOnce(async () => {
      order.push("spawnSession");
    });

    await useSessionStore.getState().resumeSession("22222222-2222-4222-a222-222222222222");

    expect(order).toEqual(["loadSnapshot", "spawnSession"]);
    const liveSession = useSessionStore
      .getState()
      .getOrCreateLiveSession("22222222-2222-4222-a222-222222222222");
    expect(liveSession.serializedSnapshot).toBe("snapshot antigo");
  });

  it("marca activeSessionId/lastFocusedSessionId e promove origin para live após retomar com sucesso", async () => {
    seedSession({ id: "33333333-3333-4333-a333-333333333333", origin: "restored" });

    await useSessionStore.getState().resumeSession("33333333-3333-4333-a333-333333333333");

    const state = useSessionStore.getState();
    expect(state.activeSessionId).toBe("33333333-3333-4333-a333-333333333333");
    expect(state.lastFocusedSessionId).toBe("33333333-3333-4333-a333-333333333333");
    expect(state.sessions[0].origin).toBe("live");
  });

  it("id sem snapshot persistido (loadSnapshot devolve null) ainda spawna normalmente", async () => {
    seedSession({ id: "44444444-4444-4444-a444-444444444444" });
    loadSnapshotMock.mockResolvedValueOnce(null);

    await useSessionStore.getState().resumeSession("44444444-4444-4444-a444-444444444444");

    expect(spawnSessionMock).toHaveBeenCalled();
    const liveSession = useSessionStore
      .getState()
      .getOrCreateLiveSession("44444444-4444-4444-a444-444444444444");
    expect(liveSession.serializedSnapshot).toBeNull();
  });

  it("wireia a classificação de atividade (ACT-03) ao retomar, mesma disciplina de createSession", async () => {
    seedSession({ id: "55555555-5555-4555-a555-555555555555" });

    await useSessionStore.getState().resumeSession("55555555-5555-4555-a555-555555555555");

    expect(wireTerminalActivityMock).toHaveBeenCalledWith(
      "55555555-5555-4555-a555-555555555555",
      expect.any(Function),
    );
  });

  it("uma sessão já viva (hasLiveSession) só refoca — nunca spawna de novo (idempotência)", async () => {
    seedSession({ id: "66666666-6666-4666-a666-666666666666" });
    useSessionStore.getState().getOrCreateLiveSession("66666666-6666-4666-a666-666666666666");

    await useSessionStore.getState().resumeSession("66666666-6666-4666-a666-666666666666");

    expect(spawnSessionMock).not.toHaveBeenCalled();
    expect(loadSnapshotMock).not.toHaveBeenCalled();
    expect(useSessionStore.getState().activeSessionId).toBe("66666666-6666-4666-a666-666666666666");
  });
});

describe("loadPersistedSessions (SESS-04)", () => {
  it("faz merge de sessões persistidas como origin restored, escopadas ao projectRoot pedido", async () => {
    getPersistedSessionsMock.mockResolvedValueOnce([
      { id: "session-x", projectRoot: "/repo", name: "Meu terminal", lastActive: "2026-07-24T10:00:00.000Z" },
    ]);

    await useSessionStore.getState().loadPersistedSessions("/repo");

    expect(getPersistedSessionsMock).toHaveBeenCalledWith("/repo");
    const state = useSessionStore.getState();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]).toMatchObject({
      id: "session-x",
      origin: "restored",
      projectRoot: "/repo",
      name: "Meu terminal",
    });
  });

  it("nunca spawna um PtySession — restauração é lazy", async () => {
    getPersistedSessionsMock.mockResolvedValueOnce([
      { id: "session-x", projectRoot: "/repo", lastActive: "2026-07-24T10:00:00.000Z" },
    ]);

    await useSessionStore.getState().loadPersistedSessions("/repo");

    expect(spawnSessionMock).not.toHaveBeenCalled();
  });

  it("nunca rebaixa uma sessão já conhecida (live/historical) para restored", async () => {
    openProjectAt("/repo");
    const liveId = useSessionStore.getState().createSession() as string;
    getPersistedSessionsMock.mockResolvedValueOnce([
      { id: liveId, projectRoot: "/repo", lastActive: "2026-07-24T10:00:00.000Z" },
    ]);

    await useSessionStore.getState().loadPersistedSessions("/repo");

    const state = useSessionStore.getState();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].origin).toBe("live");
  });

  it("degrada silenciosamente (sem lançar, sem sessões novas) quando a leitura do disco falha", async () => {
    getPersistedSessionsMock.mockRejectedValueOnce(new Error("plugin-store indisponível"));

    await expect(useSessionStore.getState().loadPersistedSessions("/repo")).resolves.toBeUndefined();
    expect(useSessionStore.getState().sessions).toHaveLength(0);
  });
});

describe("persistSnapshot (SESS-04)", () => {
  it("chama saveSnapshot com o id e o snapshot recebidos", () => {
    seedSession({ id: "session-y", projectRoot: "/repo" });

    useSessionStore.getState().persistSnapshot("session-y", "conteúdo serializado");

    expect(saveSnapshotMock).toHaveBeenCalledWith("session-y", "conteúdo serializado");
  });

  it("chama upsertPersistedSession com id/projectRoot/name/lastActive da sessão", () => {
    seedSession({ id: "session-y", projectRoot: "/repo", name: "Meu terminal" });

    useSessionStore.getState().persistSnapshot("session-y", "conteúdo serializado");

    expect(upsertPersistedSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-y", projectRoot: "/repo", name: "Meu terminal" }),
    );
  });

  it("é um no-op seguro (nunca chama saveSnapshot/upsertPersistedSession) para um id desconhecido", () => {
    useSessionStore.getState().persistSnapshot("sessao-inexistente", "x");

    expect(saveSnapshotMock).not.toHaveBeenCalled();
    expect(upsertPersistedSessionMock).not.toHaveBeenCalled();
  });
});
