import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  planningDir,
  roadmapPath,
  statePath,
  phasesDir,
  milestonesDir,
  milestonesIndexPath,
} from "./paths";

const invokeMock = vi.fn();
const readTextFileMock = vi.fn();
const readDirMock = vi.fn();
const existsMock = vi.fn();
const sizeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: (...args: unknown[]) => readTextFileMock(...args),
  readDir: (...args: unknown[]) => readDirMock(...args),
  exists: (...args: unknown[]) => existsMock(...args),
  size: (...args: unknown[]) => sizeMock(...args),
}));

describe("planning/paths (funções puras, sem mock)", () => {
  it("planningDir deriva .planning a partir de uma raiz POSIX", () => {
    expect(planningDir("/home/x")).toBe("/home/x/.planning");
  });

  it("planningDir normaliza separadores de uma raiz Windows", () => {
    expect(planningDir("C:\\dev\\x")).toBe("C:/dev/x/.planning");
  });

  it("roadmapPath e statePath derivam de planningDir", () => {
    expect(roadmapPath("/home/x")).toBe("/home/x/.planning/ROADMAP.md");
    expect(statePath("/home/x")).toBe("/home/x/.planning/STATE.md");
  });

  it("phasesDir aponta para .planning/phases", () => {
    expect(phasesDir("/home/x")).toBe("/home/x/.planning/phases");
  });

  it("milestonesDir aponta para .planning/milestones, nunca .planning/archive", () => {
    expect(milestonesDir("/home/x")).toBe("/home/x/.planning/milestones");
  });

  it("milestonesIndexPath aponta para .planning/MILESTONES.md", () => {
    expect(milestonesIndexPath("/home/x")).toBe(
      "/home/x/.planning/MILESTONES.md",
    );
  });
});

describe("validateProjectRoot (mock de @tauri-apps/api/core)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("devolve o ValidatedProject em caso de sucesso", async () => {
    const { validateProjectRoot } = await import("./read");
    invokeMock.mockResolvedValueOnce({
      root: "C:/dev/gsd-cards",
      planningDir: "C:/dev/gsd-cards/.planning",
      hasRoadmap: true,
      hasState: true,
    });

    const result = await validateProjectRoot("C:\\dev\\gsd-cards");

    expect(invokeMock).toHaveBeenCalledWith("validate_project_root", {
      root: "C:\\dev\\gsd-cards",
    });
    expect(result.root).toBe("C:/dev/gsd-cards");
    expect(result.hasRoadmap).toBe(true);
  });

  it("mapeia NotAGsdProject para ProjectOpenError com o kind preservado", async () => {
    const { validateProjectRoot, ProjectOpenError } = await import("./read");
    invokeMock.mockRejectedValueOnce({
      kind: "NotAGsdProject",
      message: "Diretório .planning/ não encontrado nesta pasta",
    });

    await expect(validateProjectRoot("/tmp/not-a-project")).rejects.toSatisfy(
      (error: unknown) => {
        expect(error).toBeInstanceOf(ProjectOpenError);
        expect((error as InstanceType<typeof ProjectOpenError>).kind).toBe(
          "NotAGsdProject",
        );
        return true;
      },
    );
  });

  it("mapeia OutsideScope para ProjectOpenError", async () => {
    const { validateProjectRoot, ProjectOpenError } = await import("./read");
    invokeMock.mockRejectedValueOnce({
      kind: "OutsideScope",
      message: "fora do escopo",
    });

    await expect(validateProjectRoot("/tmp/escaping-symlink")).rejects.toSatisfy(
      (error: unknown) => {
        expect(error).toBeInstanceOf(ProjectOpenError);
        expect((error as InstanceType<typeof ProjectOpenError>).kind).toBe(
          "OutsideScope",
        );
        return true;
      },
    );
  });

  it("mapeia o erro Rust Io para o kind IoError do domínio", async () => {
    const { validateProjectRoot, ProjectOpenError } = await import("./read");
    invokeMock.mockRejectedValueOnce({
      kind: "Io",
      message: "permission denied",
    });

    await expect(validateProjectRoot("/tmp/x")).rejects.toSatisfy(
      (error: unknown) => {
        expect(error).toBeInstanceOf(ProjectOpenError);
        expect((error as InstanceType<typeof ProjectOpenError>).kind).toBe(
          "IoError",
        );
        return true;
      },
    );
  });

  it("mapeia um erro não reconhecido (não RustProjectError) para IoError, sem lançar exceção não tratada", async () => {
    const { validateProjectRoot, ProjectOpenError } = await import("./read");
    invokeMock.mockRejectedValueOnce(new Error("network exploded"));

    await expect(validateProjectRoot("/tmp/x")).rejects.toSatisfy(
      (error: unknown) => {
        expect(error).toBeInstanceOf(ProjectOpenError);
        expect((error as InstanceType<typeof ProjectOpenError>).kind).toBe(
          "IoError",
        );
        return true;
      },
    );
  });
});

describe("readPlanningText (mock de @tauri-apps/plugin-fs)", () => {
  beforeEach(() => {
    readTextFileMock.mockReset();
    sizeMock.mockReset();
  });

  it("lê o conteúdo quando o arquivo está dentro do teto de tamanho", async () => {
    const { readPlanningText } = await import("./read");
    sizeMock.mockResolvedValueOnce(1024);
    readTextFileMock.mockResolvedValueOnce("conteúdo pequeno");

    const content = await readPlanningText("/home/x/.planning/STATE.md");

    expect(content).toBe("conteúdo pequeno");
  });

  it("rejeita com ReadTextError kind TooLarge quando o arquivo excede 2 MB", async () => {
    const { readPlanningText, ReadTextError } = await import("./read");
    sizeMock.mockResolvedValueOnce(3 * 1024 * 1024);

    await expect(
      readPlanningText("/home/x/.planning/ENORME.md"),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ReadTextError);
      expect((error as InstanceType<typeof ReadTextError>).kind).toBe(
        "TooLarge",
      );
      return true;
    });
    expect(readTextFileMock).not.toHaveBeenCalled();
  });
});
