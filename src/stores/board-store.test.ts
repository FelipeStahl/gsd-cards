// switchProject (04-03-PLAN.md, PROJ-05) — single-watcher re-sync (Pattern 3
// de 04-RESEARCH.md, decisão nomeada: NUNCA reescrever para um `HashMap` por
// projeto) e o par `openProjectRoots`/`activeProjectRoot`. Mocks no mesmo
// nível de `watch.test.ts` (`../planning/read`, `@tauri-apps/api/core`,
// `@tauri-apps/api/event`) + `../persistence/app-store` (openProject grava um
// recente em segundo plano) + as dependências de `session-store.ts` (prova
// comportamental de que trocar de projeto nunca toca sessões).

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const invokeMock = vi.fn();
const listenMock = vi.fn();
const readPlanningTextMock = vi.fn();
const listPlanningDirMock = vi.fn();
const statPlanningPathMock = vi.fn();
const planningFileExistsMock = vi.fn();
const validateProjectRootMock = vi.fn();
const upsertRecentMock = vi.fn();
const readDirMock = vi.fn();
const statMock = vi.fn();
const killSessionProcessMock = vi.fn();
const wireTerminalActivityMock = vi.fn();
const activityStopMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

// `board-store.ts`/`phase-scan.ts` compartilham este módulo de I/O — mesmo
// padrão de `watch.test.ts`.
vi.mock("../planning/read", () => ({
  readPlanningText: (...args: unknown[]) => readPlanningTextMock(...args),
  listPlanningDir: (...args: unknown[]) => listPlanningDirMock(...args),
  statPlanningPath: (...args: unknown[]) => statPlanningPathMock(...args),
  planningFileExists: (...args: unknown[]) => planningFileExistsMock(...args),
  validateProjectRoot: (...args: unknown[]) => validateProjectRootMock(...args),
}));

vi.mock("../persistence/app-store", () => ({
  upsertRecent: (...args: unknown[]) => upsertRecentMock(...args),
}));

// Só necessário para a suíte "sessões sobrevivem à troca" abaixo, que importa
// `session-store.ts` — mesmos mocks de `session-store.test.ts` para isolar
// dessas dependências de terminal/PTY.
vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: (...args: unknown[]) => readDirMock(...args),
  stat: (...args: unknown[]) => statMock(...args),
}));

vi.mock("../pty/channel", () => ({
  killSession: (...args: unknown[]) => killSessionProcessMock(...args),
}));

vi.mock("../components/terminal/useTerminalActivity", () => ({
  wireTerminalActivity: (...args: unknown[]) => wireTerminalActivityMock(...args),
}));

const { useBoardStore } = await import("./board-store");
const { useSessionStore } = await import("./session-store");

const ROOT_A = "/repo-a";
const ROOT_B = "/repo-b";

/** Frontmatter mínimo válido de STATE.md — parseia com `kind: "ok"` (mesmo helper de `watch.test.ts`). */
function validStateMarkdown(milestone = "v1.0"): string {
  return `---
gsd_state_version: 1.0
milestone: ${milestone}
milestone_name: milestone
current_phase: 1
current_phase_name: espelho-fiel
status: executing
last_updated: "2026-07-24T00:00:00Z"
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 1
  completed_plans: 0
  percent: 0
---

# Project State
`;
}

function validatedProject(root: string) {
  return {
    root,
    planningDir: `${root}/.planning`,
    hasRoadmap: false,
    hasState: true,
    hasGsdCore: true,
  };
}

const initialBoardState = useBoardStore.getState();
const initialSessionState = useSessionStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  useBoardStore.setState(initialBoardState, true);
  useSessionStore.setState(initialSessionState, true);

  invokeMock.mockReset().mockResolvedValue(undefined);
  listenMock.mockReset().mockResolvedValue(vi.fn());
  readPlanningTextMock.mockReset();
  listPlanningDirMock.mockReset().mockResolvedValue([]);
  statPlanningPathMock.mockReset();
  planningFileExistsMock.mockReset();
  validateProjectRootMock.mockReset();
  upsertRecentMock.mockReset().mockResolvedValue(undefined);
  readDirMock.mockReset();
  statMock.mockReset();
  killSessionProcessMock.mockReset();
  wireTerminalActivityMock.mockReset().mockReturnValue(activityStopMock);
  activityStopMock.mockReset();

  readPlanningTextMock.mockImplementation(async (path: string) => {
    if (path === `${ROOT_A}/.planning/STATE.md`) return validStateMarkdown("v1.0");
    if (path === `${ROOT_B}/.planning/STATE.md`) return validStateMarkdown("v2.0");
    // ROADMAP.md/MILESTONES.md não mockados aqui de propósito —
    // `loadRoadmapModel`/`loadMilestoneHistory` já degradam graciosamente
    // (kind "unrecognized"/`[]`) em vez de lançar, mesmo padrão de
    // `watch.test.ts`.
    throw new Error(`não mockado: ${path}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("openProject — estado multi-projeto (04-03-PLAN.md)", () => {
  it("adiciona a raiz a openProjectRoots e define activeProjectRoot", async () => {
    validateProjectRootMock.mockResolvedValue(validatedProject(ROOT_A));

    await useBoardStore.getState().openProject(ROOT_A);

    const state = useBoardStore.getState();
    expect(state.status).toBe("open");
    expect(state.openProjectRoots).toEqual([ROOT_A]);
    expect(state.activeProjectRoot).toBe(ROOT_A);
  });

  it("abrir a mesma raiz duas vezes não duplica openProjectRoots", async () => {
    validateProjectRootMock.mockResolvedValue(validatedProject(ROOT_A));

    await useBoardStore.getState().openProject(ROOT_A);
    await useBoardStore.getState().openProject(ROOT_A);

    expect(useBoardStore.getState().openProjectRoots).toEqual([ROOT_A]);
  });
});

describe("switchProject — re-sync de watcher único (Pattern 3)", () => {
  it("para e reinicia o watcher exatamente uma vez para a nova raiz, define activeProjectRoot, e preserva sessões", async () => {
    validateProjectRootMock.mockImplementation(async (root: string) =>
      validatedProject(root),
    );

    await useBoardStore.getState().openProject(ROOT_A);
    expect(useBoardStore.getState().activeProjectRoot).toBe(ROOT_A);

    // Sessão viva de projeto A registrada em session-store — módulo
    // separado, intocado por board-store (session-store.ts não é importado
    // nem referenciado por switchProject).
    useSessionStore.setState((state) => {
      state.sessions.push({ id: "session-a", lastModified: null, origin: "live", projectRoot: ROOT_A });
    });
    const sessionsBeforeSwitch = useSessionStore.getState().sessions;

    invokeMock.mockClear();
    listenMock.mockClear();

    await useBoardStore.getState().switchProject(ROOT_B);

    const state = useBoardStore.getState();
    expect(state.status).toBe("open");
    expect(state.activeProjectRoot).toBe(ROOT_B);
    expect(state.openProjectRoots).toEqual([ROOT_A, ROOT_B]);
    expect(state.project?.root).toBe(ROOT_B);
    // STATE.md distinto por raiz (milestone v2.0) prova que o re-parse
    // realmente usou a nova raiz, não um cache da anterior.
    expect(state.project?.milestone).toEqual({ kind: "ok", value: "v2.0" });

    // O watcher antigo foi parado e um novo iniciado — exatamente uma vez
    // para a nova raiz (`stop_planning_watch` pode aparecer mais de uma vez
    // por causa do `stopWatching` interno de `startWatching`, idempotente e
    // inofensivo; `start_planning_watch` deve refletir só a raiz nova).
    const stopCalls = invokeMock.mock.calls.filter((call) => call[0] === "stop_planning_watch");
    const startCalls = invokeMock.mock.calls.filter((call) => call[0] === "start_planning_watch");
    expect(stopCalls.length).toBeGreaterThanOrEqual(1);
    expect(startCalls).toEqual([
      ["start_planning_watch", { planningRoot: `${ROOT_B}/.planning` }],
    ]);

    // Garantia comportamental (T-04-08): nenhuma sessão foi tocada pela
    // troca — o array de sessões permanece com o mesmo conteúdo.
    expect(useSessionStore.getState().sessions).toEqual(sessionsBeforeSwitch);
  });

  it("trocar para a raiz já ativa é no-op — sem reinício de watcher", async () => {
    validateProjectRootMock.mockImplementation(async (root: string) =>
      validatedProject(root),
    );

    await useBoardStore.getState().openProject(ROOT_A);

    invokeMock.mockClear();
    listenMock.mockClear();
    validateProjectRootMock.mockClear();

    await useBoardStore.getState().switchProject(ROOT_A);

    expect(validateProjectRootMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalledWith("start_planning_watch", expect.anything());
    expect(invokeMock).not.toHaveBeenCalledWith("stop_planning_watch");
    expect(useBoardStore.getState().activeProjectRoot).toBe(ROOT_A);
  });

  it("nunca chama closeProject — status permanece open e não idle", async () => {
    validateProjectRootMock.mockImplementation(async (root: string) =>
      validatedProject(root),
    );

    await useBoardStore.getState().openProject(ROOT_A);
    await useBoardStore.getState().switchProject(ROOT_B);

    // Se switchProject tivesse chamado closeProject em algum momento
    // intermediário, o status teria passado por "idle" e `project` teria
    // sido zerado — o estado final aqui prova que isso nunca aconteceu.
    expect(useBoardStore.getState().status).toBe("open");
    expect(useBoardStore.getState().project).not.toBeNull();
  });
});
