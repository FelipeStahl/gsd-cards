import { describe, expect, it, vi, beforeEach } from "vitest";

import { ok } from "../planning/parse-result";

const readPlanningTextMock = vi.fn();
const listPlanningDirMock = vi.fn();

// `detail-store.ts` e `board-store.ts` compartilham este módulo de I/O
// (mesmo caminho relativo `../planning/read` a partir de `src/stores/`) —
// mockar uma vez cobre `loadArtifact` sem precisar mockar `@tauri-apps/*`
// diretamente (mesmo padrão de `watch.test.ts`).
vi.mock("../planning/read", () => ({
  readPlanningText: (...args: unknown[]) => readPlanningTextMock(...args),
  listPlanningDir: (...args: unknown[]) => listPlanningDirMock(...args),
}));

const { useDetailStore } = await import("./detail-store");
const { useBoardStore } = await import("./board-store");

const PHASE01_PATH = "/repo/.planning/phases/01-espelho-fiel/01-01-PLAN.md";
const PHASE02_PATH = "/repo/.planning/phases/02-outra-fase/02-01-PLAN.md";

const initialDetailState = useDetailStore.getState();
const initialBoardState = useBoardStore.getState();

beforeEach(() => {
  useDetailStore.setState(initialDetailState, true);
  useBoardStore.setState(initialBoardState, true);
  readPlanningTextMock.mockReset();
  listPlanningDirMock.mockReset();
});

describe("loadArtifact — cache de conteúdo por caminho", () => {
  it("lê uma vez e serve do cache em chamadas subsequentes para o mesmo caminho", async () => {
    readPlanningTextMock.mockResolvedValue("# Conteúdo v1");

    await useDetailStore.getState().loadArtifact(PHASE01_PATH);
    expect(readPlanningTextMock).toHaveBeenCalledTimes(1);
    expect(useDetailStore.getState().artifactContent[PHASE01_PATH]).toEqual(
      ok("# Conteúdo v1"),
    );

    await useDetailStore.getState().loadArtifact(PHASE01_PATH);
    expect(readPlanningTextMock).toHaveBeenCalledTimes(1);
  });
});

describe("loadArtifact — invalidação do cache quando a fase dona é reprocessada (CR-03)", () => {
  it("descarta artifactContent[path] quando recentlyUpdatedPhaseIds passa a incluir a fase do artefato, e releitura busca conteúdo novo", async () => {
    readPlanningTextMock
      .mockResolvedValueOnce("# Conteúdo v1")
      .mockResolvedValueOnce("# Conteúdo v2");

    await useDetailStore.getState().loadArtifact(PHASE01_PATH);
    expect(useDetailStore.getState().artifactContent[PHASE01_PATH]).toEqual(
      ok("# Conteúdo v1"),
    );

    // Simula o board-store reprocessando um lote que tocou a fase 01 —
    // referência de array nova, como `reprocessPaths` produz de verdade.
    useBoardStore.setState({ recentlyUpdatedPhaseIds: ["01"] });

    expect(useDetailStore.getState().artifactContent[PHASE01_PATH]).toBeUndefined();

    await useDetailStore.getState().loadArtifact(PHASE01_PATH);
    expect(readPlanningTextMock).toHaveBeenCalledTimes(2);
    expect(useDetailStore.getState().artifactContent[PHASE01_PATH]).toEqual(
      ok("# Conteúdo v2"),
    );
  });

  it("um artefato de uma fase NÃO afetada permanece cacheado (invalidação escopada, não global)", async () => {
    readPlanningTextMock.mockResolvedValue("# Conteúdo fase 02");

    await useDetailStore.getState().loadArtifact(PHASE02_PATH);
    expect(readPlanningTextMock).toHaveBeenCalledTimes(1);

    useBoardStore.setState({ recentlyUpdatedPhaseIds: ["01"] });

    expect(useDetailStore.getState().artifactContent[PHASE02_PATH]).toEqual(
      ok("# Conteúdo fase 02"),
    );

    await useDetailStore.getState().loadArtifact(PHASE02_PATH);
    expect(readPlanningTextMock).toHaveBeenCalledTimes(1);
  });
});
