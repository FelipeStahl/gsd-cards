import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ok } from "./parse-result";
import type { PhaseModel } from "./model";

const invokeMock = vi.fn();
const listenMock = vi.fn();
const readPlanningTextMock = vi.fn();
const listPlanningDirMock = vi.fn();
const statPlanningPathMock = vi.fn();
const planningFileExistsMock = vi.fn();
const validateProjectRootMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

// `board-store.ts` e `phase-scan.ts` compartilham este módulo de I/O — mockar
// `./read` uma vez cobre as duas cadeias de leitura exercitadas por
// `reprocessPaths`/`reconnectWatcher` sem precisar mockar `@tauri-apps/plugin-fs`
// diretamente (mesmo padrão de `phase-scan.test.ts`, um nível abaixo).
vi.mock("./read", () => ({
  readPlanningText: (...args: unknown[]) => readPlanningTextMock(...args),
  listPlanningDir: (...args: unknown[]) => listPlanningDirMock(...args),
  statPlanningPath: (...args: unknown[]) => statPlanningPathMock(...args),
  planningFileExists: (...args: unknown[]) => planningFileExistsMock(...args),
  validateProjectRoot: (...args: unknown[]) => validateProjectRootMock(...args),
}));

const { classifyChangedPath, startWatching, stopWatching } = await import("./watch");
const { useBoardStore } = await import("../stores/board-store");

const ROOT = "/repo";
const PLANNING = `${ROOT}/.planning`;

function makePhase(overrides: Partial<PhaseModel> = {}): PhaseModel {
  return {
    id: "01",
    number: 1,
    name: "Espelho fiel",
    diskStatus: "planned",
    badge: "planned",
    column: "preparing",
    planCount: 1,
    summaryCount: 0,
    requirementIds: [],
    isInserted: false,
    blockers: [],
    issues: [],
    ...overrides,
  };
}

function seedProject(phases: PhaseModel[]) {
  useBoardStore.setState((state) => {
    state.status = "open";
    state.error = null;
    state.project = {
      root: ROOT,
      projectName: "repo",
      milestone: ok("v1.0"),
      currentPhase: ok(1),
      currentPhaseName: ok("espelho-fiel"),
      progress: ok({
        totalPhases: phases.length,
        completedPhases: 0,
        totalPlans: 1,
        completedPlans: 0,
        percent: 0,
      }),
      blockers: [],
      phases,
      milestones: [],
      issues: [],
    };
  });
}

/** Frontmatter mínimo válido de STATE.md — parseia com `kind: "ok"`. */
function validStateMarkdown(milestone = "v1.0"): string {
  return `---
gsd_state_version: 1.0
milestone: ${milestone}
milestone_name: milestone
current_phase: 1
current_phase_name: espelho-fiel
status: executing
last_updated: "2026-07-23T00:00:00Z"
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

function dirEntry(name: string, isDirectory: boolean) {
  return { name, isDirectory, isFile: !isDirectory, isSymlink: false };
}

const initialBoardState = useBoardStore.getState();

beforeEach(() => {
  // Timers falsos por padrão: qualquer `setTimeout` real (glow de D-13, ou o
  // auto-retry silencioso do `markSyncDegraded`) fica parado até um teste
  // explicitamente avançar o relógio — evita que um retry em background
  // dispare durante um teste seguinte não relacionado.
  vi.useFakeTimers();
  useBoardStore.setState(initialBoardState, true);
  invokeMock.mockReset().mockResolvedValue(undefined);
  listenMock.mockReset().mockResolvedValue(vi.fn());
  readPlanningTextMock.mockReset();
  listPlanningDirMock.mockReset();
  statPlanningPathMock.mockReset();
  planningFileExistsMock.mockReset();
  validateProjectRootMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("classifyChangedPath", () => {
  it("reconhece STATE.md", () => {
    expect(classifyChangedPath(`${PLANNING}/STATE.md`, ROOT)).toEqual({ kind: "state" });
  });

  it("reconhece ROADMAP.md", () => {
    expect(classifyChangedPath(`${PLANNING}/ROADMAP.md`, ROOT)).toEqual({ kind: "roadmap" });
  });

  it("reconhece um PLAN.md de fase e extrai o id numérico do diretório", () => {
    expect(
      classifyChangedPath(`${PLANNING}/phases/01-espelho-fiel/01-01-PLAN.md`, ROOT),
    ).toEqual({ kind: "phase", phaseId: "01" });
  });

  it("reconhece uma fase decimal inserida (D-07) pelo id com casa decimal", () => {
    expect(
      classifyChangedPath(`${PLANNING}/phases/02.1-hotfix/02.1-01-PLAN.md`, ROOT),
    ).toEqual({ kind: "phase", phaseId: "02.1" });
  });

  it("reconhece MILESTONES.md e um arquivo dentro de .planning/milestones/", () => {
    expect(classifyChangedPath(`${PLANNING}/MILESTONES.md`, ROOT)).toEqual({
      kind: "milestones",
    });
    expect(
      classifyChangedPath(`${PLANNING}/milestones/v1.0-ROADMAP.md`, ROOT),
    ).toEqual({ kind: "milestones" });
  });

  it("classifica qualquer outro caminho como other", () => {
    expect(classifyChangedPath(`${PLANNING}/config.json`, ROOT)).toEqual({ kind: "other" });
  });
});

describe("reprocessPaths — lote de 12 caminhos (1 STATE.md + 11 arquivos da fase 01)", () => {
  it("produz exatamente 1 notificação do store, não doze", async () => {
    seedProject([makePhase({ id: "01", number: 1 })]);

    readPlanningTextMock.mockImplementation(async (path: string) => {
      if (path === `${PLANNING}/STATE.md`) return validStateMarkdown();
      throw new Error(`não mockado: ${path}`);
    });
    listPlanningDirMock.mockImplementation(async (dir: string) => {
      if (dir === `${PLANNING}/phases`) return [dirEntry("01-espelho-fiel", true)];
      if (dir === `${PLANNING}/phases/01-espelho-fiel`) return [];
      throw new Error(`diretório não mockado: ${dir}`);
    });

    const paths = [
      `${PLANNING}/STATE.md`,
      ...Array.from({ length: 11 }, (_, i) =>
        `${PLANNING}/phases/01-espelho-fiel/01-${String(i + 1).padStart(2, "0")}-PLAN.md`,
      ),
    ];
    expect(paths).toHaveLength(12);

    let notifications = 0;
    const unsubscribe = useBoardStore.subscribe(() => {
      notifications += 1;
    });

    await useBoardStore.getState().reprocessPaths(paths);
    unsubscribe();

    expect(notifications).toBe(1);
  });
});

describe("reprocessPaths — restrito à fase 02", () => {
  it("não chama scanPhaseDir (listPlanningDir do diretório interno) para a fase 01", async () => {
    seedProject([
      makePhase({ id: "01", number: 1 }),
      makePhase({ id: "02", number: 2, name: "Outra fase" }),
    ]);

    listPlanningDirMock.mockImplementation(async (dir: string) => {
      if (dir === `${PLANNING}/phases`) {
        return [dirEntry("01-espelho-fiel", true), dirEntry("02-outra-fase", true)];
      }
      if (dir === `${PLANNING}/phases/02-outra-fase`) return [];
      throw new Error(`diretório não mockado: ${dir}`);
    });

    await useBoardStore
      .getState()
      .reprocessPaths([`${PLANNING}/phases/02-outra-fase/02-01-PLAN.md`]);

    const scannedDirs = listPlanningDirMock.mock.calls.map((call) => call[0]);
    expect(scannedDirs).not.toContain(`${PLANNING}/phases/01-espelho-fiel`);
    expect(scannedDirs).toContain(`${PLANNING}/phases/02-outra-fase`);
  });
});

describe("reprocessPaths — lote concorrente STATE.md (novo blocker) + diretório de outra fase (CR-02)", () => {
  it("aplica o blocker novo à fase 5 mesmo quando só a fase 01 foi varrida no mesmo lote", async () => {
    seedProject([
      makePhase({ id: "01", number: 1 }),
      makePhase({ id: "05", number: 5, name: "Fase futura" }),
    ]);

    readPlanningTextMock.mockImplementation(async (path: string) => {
      if (path === `${PLANNING}/STATE.md`) {
        return `${validStateMarkdown()}\n## Accumulated Context\n\n### Blockers/Concerns\n\n- [Phase 5]: Bloqueio novo de teste\n`;
      }
      throw new Error(`não mockado: ${path}`);
    });
    listPlanningDirMock.mockImplementation(async (dir: string) => {
      if (dir === `${PLANNING}/phases`) return [dirEntry("01-espelho-fiel", true)];
      if (dir === `${PLANNING}/phases/01-espelho-fiel`) return [];
      throw new Error(`diretório não mockado: ${dir}`);
    });

    // Lote único: STATE.md (novo blocker citando a fase 5) + um arquivo da
    // fase 01 (a única fase cujo diretório é varrido neste lote).
    await useBoardStore.getState().reprocessPaths([
      `${PLANNING}/STATE.md`,
      `${PLANNING}/phases/01-espelho-fiel/01-01-SUMMARY.md`,
    ]);

    const phases = useBoardStore.getState().project?.phases ?? [];
    const phase5 = phases.find((phase) => phase.number === 5);
    expect(phase5?.blockers.some((blocker) => blocker.phases.includes(5))).toBe(true);

    // O badge/glow (D-13/D-09) também deve acionar na fase 5, mesmo não
    // tocada pelo lote de varredura de diretório.
    expect(useBoardStore.getState().recentlyUpdatedPhaseIds).toContain("05");
  });
});

describe("reprocessPaths — leitura falha preserva o estado anterior", () => {
  it("mantém milestone/currentPhase anteriores e registra uma ParseIssue quando STATE.md falha ao ler", async () => {
    seedProject([makePhase({ id: "01", number: 1 })]);

    readPlanningTextMock.mockImplementation(async (path: string) => {
      if (path === `${PLANNING}/STATE.md`) {
        throw new Error("arquivo apagado durante a escrita atômica");
      }
      throw new Error(`não mockado: ${path}`);
    });

    await useBoardStore.getState().reprocessPaths([`${PLANNING}/STATE.md`]);

    const project = useBoardStore.getState().project;
    expect(project?.milestone).toEqual(ok("v1.0"));
    expect(project?.issues.some((issue) => issue.path === `${PLANNING}/STATE.md`)).toBe(true);
  });
});

describe("reprocessPaths — recentlyUpdatedPhaseIds e janela do glow (D-13)", () => {
  it("popula o id da fase afetada e limpa depois de ~1000ms", async () => {
    seedProject([makePhase({ id: "02", number: 2 })]);

    listPlanningDirMock.mockImplementation(async (dir: string) => {
      if (dir === `${PLANNING}/phases`) return [dirEntry("02-outra-fase", true)];
      if (dir === `${PLANNING}/phases/02-outra-fase`) return [];
      throw new Error(`diretório não mockado: ${dir}`);
    });

    await useBoardStore
      .getState()
      .reprocessPaths([`${PLANNING}/phases/02-outra-fase/02-01-PLAN.md`]);

    expect(useBoardStore.getState().recentlyUpdatedPhaseIds).toEqual(["02"]);

    await vi.advanceTimersByTimeAsync(1000);

    expect(useBoardStore.getState().recentlyUpdatedPhaseIds).toEqual([]);
  });
});

describe("planning:watcher-degraded", () => {
  it("transiciona sync para degraded sem apagar project", async () => {
    seedProject([makePhase()]);

    let degradedCallback: ((event: { payload: { reason: string } }) => void) | null = null;
    listenMock.mockImplementation(async (eventName: string, callback: unknown) => {
      if (eventName === "planning:watcher-degraded") {
        degradedCallback = callback as typeof degradedCallback;
      }
      return vi.fn();
    });

    await startWatching(PLANNING);
    expect(degradedCallback).not.toBeNull();

    degradedCallback!({ payload: { reason: "diretório sumiu" } });

    const state = useBoardStore.getState();
    expect(state.sync.state).toBe("degraded");
    expect(state.sync.reason).toBe("diretório sumiu");
    expect(state.project).not.toBeNull();
  });
});

describe("startWatching / stopWatching", () => {
  it("startWatching registra os dois listeners e invoca start_planning_watch com o planningRoot correto", async () => {
    await startWatching(PLANNING);

    expect(listenMock).toHaveBeenCalledWith("planning:changed", expect.any(Function));
    expect(listenMock).toHaveBeenCalledWith(
      "planning:watcher-degraded",
      expect.any(Function),
    );
    expect(invokeMock).toHaveBeenCalledWith("start_planning_watch", {
      planningRoot: PLANNING,
    });
  });

  it("stopWatching remove os listeners e invoca stop_planning_watch", async () => {
    const unlistenChanged = vi.fn();
    const unlistenDegraded = vi.fn();
    listenMock
      .mockResolvedValueOnce(unlistenChanged)
      .mockResolvedValueOnce(unlistenDegraded);

    await startWatching(PLANNING);
    invokeMock.mockClear();

    await stopWatching();

    expect(unlistenChanged).toHaveBeenCalled();
    expect(unlistenDegraded).toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("stop_planning_watch");
  });
});

describe("reconnectWatcher", () => {
  it("volta para healthy quando startWatching e a releitura completa dão certo", async () => {
    seedProject([makePhase()]);
    useBoardStore.getState().markSyncDegraded("teste");
    expect(useBoardStore.getState().sync.state).toBe("degraded");

    readPlanningTextMock.mockImplementation(async (path: string) => {
      if (path === `${PLANNING}/ROADMAP.md`) throw new Error("sem roadmap neste teste");
      if (path === `${PLANNING}/STATE.md`) return validStateMarkdown();
      throw new Error(`não mockado: ${path}`);
    });
    listPlanningDirMock.mockImplementation(async (dir: string) => {
      if (dir === `${PLANNING}/phases`) return [];
      throw new Error(`diretório não mockado: ${dir}`);
    });

    await useBoardStore.getState().reconnectWatcher();

    const state = useBoardStore.getState();
    expect(state.sync.state).toBe("healthy");
    expect(state.sync.degradedSince).toBeNull();
  });
});
