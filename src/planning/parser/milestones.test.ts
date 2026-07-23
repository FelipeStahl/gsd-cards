import { describe, expect, it, vi, beforeEach } from "vitest";

const readTextFileMock = vi.fn();
const readDirMock = vi.fn();
const existsMock = vi.fn();
const sizeMock = vi.fn();
const statMock = vi.fn();

// `@tauri-apps/plugin-fs` não roda fora de um webview Tauri real — mockado
// aqui como em `phase-scan.test.ts`. Diferente daquele arquivo, o conteúdo
// devolvido pelo mock vem do fixture real importado via `?raw` (não delega a
// `node:fs/promises`), porque `scanArchivedMilestones` deriva o caminho de
// `.planning/milestones/` a partir de `projectRoot` via `paths.ts` — alinhar
// esse caminho computado com a localização real do fixture em
// `__fixtures__/milestones/` exigiria replicar a convenção `.planning/` só
// para o teste; devolver o texto real do fixture pelo mock exercita o parser
// com o mesmo conteúdo, sem essa reindireção artificial.
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: (...args: unknown[]) => readTextFileMock(...args),
  readDir: (...args: unknown[]) => readDirMock(...args),
  exists: (...args: unknown[]) => existsMock(...args),
  size: (...args: unknown[]) => sizeMock(...args),
  stat: (...args: unknown[]) => statMock(...args),
}));

const { parseMilestonesIndex, scanArchivedMilestones } = await import("./milestones");

import v09RoadmapRaw from "../__fixtures__/milestones/v0.9-ROADMAP.md?raw";
import milestonesIndexRaw from "../__fixtures__/milestones/MILESTONES.md?raw";

beforeEach(() => {
  readTextFileMock.mockReset();
  readDirMock.mockReset();
  existsMock.mockReset();
  sizeMock.mockReset();
  statMock.mockReset();
});

describe("scanArchivedMilestones", () => {
  it("projeto sem .planning/milestones/ devolve lista vazia, sem lançar exceção", async () => {
    readDirMock.mockImplementationOnce(async () => {
      throw new Error("ENOENT: no such file or directory");
    });

    const result = await scanArchivedMilestones("/fake/root-sem-historico");

    expect(result).toEqual([]);
  });

  it("v0.9-ROADMAP.md produz a versão v0.9 e as 3 fases arquivadas com status coarse", async () => {
    readDirMock.mockImplementationOnce(async () => [
      { name: "v0.9-ROADMAP.md", isDirectory: false, isFile: true, isSymlink: false },
    ]);
    readTextFileMock.mockImplementationOnce(async () => v09RoadmapRaw);

    const results = await scanArchivedMilestones("/fake/root");

    expect(results).toHaveLength(1);
    expect(results[0].version).toBe("v0.9");
    expect(results[0].phases).toEqual([
      { number: 1, name: "Fundação", status: "Complete" },
      { number: 2, name: "Autenticação", status: "Complete" },
      { number: 3, name: "Painel inicial", status: "Complete" },
    ]);
    expect(results[0].issues).toHaveLength(0);
  });

  it("uma entrada com conteúdo ilegível vira ArchivedMilestone com issues, sem derrubar as demais", async () => {
    readDirMock.mockImplementationOnce(async () => [
      { name: "v0.9-ROADMAP.md", isDirectory: false, isFile: true, isSymlink: false },
      { name: "v0.8-ROADMAP.md", isDirectory: false, isFile: true, isSymlink: false },
    ]);
    readTextFileMock.mockImplementation(async (filePath: unknown) => {
      if (String(filePath).includes("v0.8")) {
        throw new Error("arquivo corrompido");
      }
      return v09RoadmapRaw;
    });

    const results = await scanArchivedMilestones("/fake/root");

    const v09 = results.find((m) => m.version === "v0.9");
    const v08 = results.find((m) => m.version === "v0.8");

    expect(v09?.phases).toHaveLength(3);
    expect(v09?.issues).toHaveLength(0);
    expect(v08?.phases).toHaveLength(0);
    expect(v08?.issues.length).toBeGreaterThan(0);
  });

  it("versões aparecem em ordem decrescente (mais recente primeiro)", async () => {
    readDirMock.mockImplementationOnce(async () => [
      { name: "v0.9-ROADMAP.md", isDirectory: false, isFile: true, isSymlink: false },
      { name: "v1.0-ROADMAP.md", isDirectory: false, isFile: true, isSymlink: false },
    ]);
    readTextFileMock.mockImplementation(async () => v09RoadmapRaw);

    const results = await scanArchivedMilestones("/fake/root");

    expect(results.map((m) => m.version)).toEqual(["v1.0", "v0.9"]);
  });
});

describe("parseMilestonesIndex", () => {
  it("MILESTONES.md real produz a entrada v0.9 com nome, data e contagens", () => {
    const result = parseMilestonesIndex(milestonesIndexRaw, "MILESTONES.md");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value).toHaveLength(1);
    const entry = result.value[0];
    expect(entry.version).toEqual({ kind: "ok", value: "v0.9" });
    expect(entry.name).toEqual({ kind: "ok", value: "milestone" });
    expect(entry.shippedDate).toEqual({ kind: "ok", value: "2026-05-20" });
    expect(entry.phaseCount).toEqual({ kind: "ok", value: 3 });
    expect(entry.planCount).toEqual({ kind: "ok", value: 6 });
    expect(entry.taskCount).toEqual({ kind: "ok", value: 18 });
  });

  it("texto vazio devolve ok([]) — ausência de conteúdo não é erro", () => {
    const result = parseMilestonesIndex("", "MILESTONES.md");

    expect(result).toEqual({ kind: "ok", value: [] });
  });

  it("um heading que não casa o padrão vira entrada unrecognized isolada, as demais continuam", () => {
    const raw = `# Milestones

## não é um heading de milestone válido

Algum texto qualquer aqui.

---

## v0.8 outra-fase (Shipped: 2026-01-10)

**Phases completed:** 2 phases, 4 plans, 10 tasks

**Key accomplishments:**
- Accomplishment X

---
`;

    const result = parseMilestonesIndex(raw, "MILESTONES.md");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value).toHaveLength(2);
    expect(result.value[0].version.kind).toBe("unrecognized");
    expect(result.value[1].version).toEqual({ kind: "ok", value: "v0.8" });
    expect(result.value[1].phaseCount).toEqual({ kind: "ok", value: 2 });
  });
});
