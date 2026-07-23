import { fileURLToPath } from "node:url";
import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

import { describe, expect, it, vi, beforeEach } from "vitest";

const readTextFileMock = vi.fn();
const readDirMock = vi.fn();
const existsMock = vi.fn();
const sizeMock = vi.fn();
const statMock = vi.fn();

// `@tauri-apps/plugin-fs` não roda fora de um webview Tauri real — nos testes,
// delegamos as chamadas para `node:fs/promises` operando sobre a árvore de
// fixtures real em `__fixtures__/phases/`, para exercitar `phase-scan.ts`
// contra arquivos reais em vez de dados fabricados em memória.
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: (...args: unknown[]) => readTextFileMock(...args),
  readDir: (...args: unknown[]) => readDirMock(...args),
  exists: (...args: unknown[]) => existsMock(...args),
  size: (...args: unknown[]) => sizeMock(...args),
  stat: (...args: unknown[]) => statMock(...args),
}));

const { parsePhaseDirName, scanAllPhases, scanPhaseDir } = await import("./phase-scan");

async function realReadDir(dirPath: string) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
    isSymlink: entry.isSymbolicLink(),
  }));
}

interface FakeFileInfo {
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mtime: Date | null;
  atime: Date | null;
  birthtime: Date | null;
  readonly: boolean;
  fileAttributes: number | null;
  dev: number | null;
  ino: number | null;
  mode: number | null;
  nlink: number | null;
  uid: number | null;
  gid: number | null;
  rdev: number | null;
  blksize: number | null;
  blocks: number | null;
}

function fakeFileInfo(overrides: Partial<FakeFileInfo> = {}): FakeFileInfo {
  return {
    isFile: true,
    isDirectory: false,
    isSymlink: false,
    size: 0,
    mtime: new Date(0),
    atime: null,
    birthtime: null,
    readonly: false,
    fileAttributes: null,
    dev: null,
    ino: null,
    mode: null,
    nlink: null,
    uid: null,
    gid: null,
    rdev: null,
    blksize: null,
    blocks: null,
    ...overrides,
  };
}

async function realStat(filePath: string): Promise<FakeFileInfo> {
  const info = await stat(filePath);
  return fakeFileInfo({
    isFile: info.isFile(),
    isDirectory: info.isDirectory(),
    isSymlink: info.isSymbolicLink(),
    size: info.size,
    mtime: info.mtime,
    atime: info.atime,
    birthtime: info.birthtime,
  });
}

beforeEach(() => {
  readTextFileMock.mockReset();
  readDirMock.mockReset();
  existsMock.mockReset();
  sizeMock.mockReset();
  statMock.mockReset();

  readDirMock.mockImplementation(realReadDir);
  readTextFileMock.mockImplementation((filePath: string) => readFile(filePath, "utf-8"));
  statMock.mockImplementation(realStat);
});

const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "phases",
);

describe("parsePhaseDirName", () => {
  it("reconhece uma fase inteira zero-padded", () => {
    expect(parsePhaseDirName("01-espelho-fiel")).toEqual({
      number: 1,
      padded: "01",
      slug: "espelho-fiel",
    });
  });

  it("reconhece uma fase decimal inserida (D-07) e devolve o número 2.1", () => {
    expect(parsePhaseDirName("02.1-hotfix")).toEqual({
      number: 2.1,
      padded: "02.1",
      slug: "hotfix",
    });
  });

  it("um nome que não casa o padrão retorna null", () => {
    expect(parsePhaseDirName("README")).toBeNull();
    expect(parsePhaseDirName("phases")).toBeNull();
  });
});

describe("scanPhaseDir — fixtures reais em __fixtures__/phases", () => {
  it("10-apenas-contexto: hasContext true, hasResearch false, planCount 0 -> disk_status discussed", async () => {
    const { signals } = await scanPhaseDir(FIXTURES_DIR, "10-apenas-contexto");
    expect(signals.hasContext).toBe(true);
    expect(signals.hasResearch).toBe(false);
    expect(signals.planCount).toBe(0);
    expect(signals.summaryCount).toBe(0);
  });

  it("11-contexto-mais-pesquisa: hasContext e hasResearch ambos true", async () => {
    const { signals } = await scanPhaseDir(FIXTURES_DIR, "11-contexto-mais-pesquisa");
    expect(signals.hasContext).toBe(true);
    expect(signals.hasResearch).toBe(true);
  });

  it("12-planos-sem-summary: planCount 2, summaryCount 0", async () => {
    const { signals } = await scanPhaseDir(FIXTURES_DIR, "12-planos-sem-summary");
    expect(signals.planCount).toBe(2);
    expect(signals.summaryCount).toBe(0);
  });

  it("13-summary-parcial: planCount 3, summaryCount 1", async () => {
    const { signals } = await scanPhaseDir(FIXTURES_DIR, "13-summary-parcial");
    expect(signals.planCount).toBe(3);
    expect(signals.summaryCount).toBe(1);
  });

  it("14-executada-sem-verificacao: planCount 2, summaryCount 2, verificationStatus gaps_found", async () => {
    const { signals, issues } = await scanPhaseDir(
      FIXTURES_DIR,
      "14-executada-sem-verificacao",
    );
    expect(signals.planCount).toBe(2);
    expect(signals.summaryCount).toBe(2);
    expect(signals.verificationStatus).toBe("gaps_found");
    expect(issues).toHaveLength(0);
  });

  it("15-verificada: planCount 2, summaryCount 2, verificationStatus passed", async () => {
    const { signals } = await scanPhaseDir(FIXTURES_DIR, "15-verificada");
    expect(signals.planCount).toBe(2);
    expect(signals.summaryCount).toBe(2);
    expect(signals.verificationStatus).toBe("passed");
  });

  it("16-contexto-com-ruido: planCount === 1 apesar de UI-SPEC/VALIDATION/DISCUSSION-LOG no mesmo diretório", async () => {
    const { signals } = await scanPhaseDir(FIXTURES_DIR, "16-contexto-com-ruido");
    expect(signals.planCount).toBe(1);
    expect(signals.summaryCount).toBe(0);
    expect(signals.hasContext).toBe(true);
    expect(signals.hasResearch).toBe(true);
  });
});

describe("scanPhaseDir — degradação graciosa de VERIFICATION.md", () => {
  it("frontmatter status com valor não reconhecido -> verificationStatus missing + ParseIssue, nunca passed", async () => {
    readDirMock.mockImplementationOnce(async () => [
      { name: "20-01-PLAN.md", isDirectory: false, isFile: true, isSymlink: false },
      { name: "20-01-SUMMARY.md", isDirectory: false, isFile: true, isSymlink: false },
      { name: "20-VERIFICATION.md", isDirectory: false, isFile: true, isSymlink: false },
    ]);
    readTextFileMock.mockImplementationOnce(async () => `---
phase: 20
status: nao-existe-esse-valor
---
`);
    statMock.mockImplementation(async () => fakeFileInfo());

    const { signals, issues } = await scanPhaseDir("/fake/phases", "20-status-invalido");

    expect(signals.verificationStatus).toBe("missing");
    expect(signals.verificationStatus).not.toBe("passed");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].field).toBe("status");
  });

  it("VERIFICATION.md ausente -> verificationStatus missing, sem ParseIssue", async () => {
    readDirMock.mockImplementationOnce(async () => [
      { name: "21-01-PLAN.md", isDirectory: false, isFile: true, isSymlink: false },
    ]);
    statMock.mockImplementation(async () => fakeFileInfo());

    const { signals, issues } = await scanPhaseDir("/fake/phases", "21-sem-verification");

    expect(signals.verificationStatus).toBe("missing");
    expect(issues).toHaveLength(0);
  });
});

describe("scanPhaseDir — isActive via mtime", () => {
  it("arquivo com mtime recente (dentro de ACTIVE_WINDOW_MS) -> isActive true", async () => {
    readDirMock.mockImplementationOnce(async () => [
      { name: "22-01-PLAN.md", isDirectory: false, isFile: true, isSymlink: false },
    ]);
    statMock.mockImplementationOnce(async () => fakeFileInfo({ mtime: new Date() }));

    const { signals } = await scanPhaseDir("/fake/phases", "22-fase-ativa");
    expect(signals.isActive).toBe(true);
  });

  it("todos os arquivos fora da janela -> isActive false", async () => {
    readDirMock.mockImplementationOnce(async () => [
      { name: "23-01-PLAN.md", isDirectory: false, isFile: true, isSymlink: false },
    ]);
    statMock.mockImplementationOnce(async () => fakeFileInfo({ mtime: new Date(0) }));

    const { signals } = await scanPhaseDir("/fake/phases", "23-fase-parada");
    expect(signals.isActive).toBe(false);
  });
});

describe("scanAllPhases — comportamento agregado", () => {
  it("ignora entradas cujo nome não casa parsePhaseDirName, sem quebrar a varredura", async () => {
    readDirMock.mockImplementationOnce(async () => [
      { name: "01-fase-valida", isDirectory: true, isFile: false, isSymlink: false },
      { name: "README.md", isDirectory: false, isFile: true, isSymlink: false },
      { name: "sem-numero", isDirectory: true, isFile: false, isSymlink: false },
    ]);
    readDirMock.mockImplementationOnce(async () => []); // conteúdo de 01-fase-valida

    const results = await scanAllPhases("/fake/root");

    expect(results).toHaveLength(1);
    expect(results[0].dirName).toBe("01-fase-valida");
  });

  it("falha ao varrer um diretório específico produz ParseIssue e não derruba as demais fases (D-15)", async () => {
    readDirMock.mockImplementationOnce(async () => [
      { name: "01-fase-com-erro", isDirectory: true, isFile: false, isSymlink: false },
      { name: "02-fase-ok", isDirectory: true, isFile: false, isSymlink: false },
    ]);
    readDirMock.mockImplementationOnce(async () => {
      throw new Error("falha simulada de leitura de diretório");
    });
    readDirMock.mockImplementationOnce(async () => []);

    const results = await scanAllPhases("/fake/root");

    expect(results).toHaveLength(2);
    const failed = results.find((r) => r.dirName === "01-fase-com-erro");
    const ok = results.find((r) => r.dirName === "02-fase-ok");
    expect(failed?.issues.length).toBeGreaterThan(0);
    expect(ok?.issues).toHaveLength(0);
  });

  it("diretório .planning/phases inexistente -> lista vazia, sem lançar exceção", async () => {
    readDirMock.mockImplementationOnce(async () => {
      throw new Error("ENOENT");
    });

    await expect(scanAllPhases("/fake/root-sem-phases")).resolves.toEqual([]);
  });
});
