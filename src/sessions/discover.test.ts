import { describe, expect, it, vi, beforeEach } from "vitest";

const readDirMock = vi.fn();
const statMock = vi.fn();

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: (...args: unknown[]) => readDirMock(...args),
  stat: (...args: unknown[]) => statMock(...args),
}));

const { listSessions } = await import("./discover");

function fakeEntry(name: string, isDirectory = false) {
  return { name, isDirectory, isFile: !isDirectory, isSymlink: false };
}

describe("listSessions", () => {
  beforeEach(() => {
    readDirMock.mockReset();
    statMock.mockReset();
  });

  it("lista só *.jsonl do nível raiz, filtrando subagents/ e arquivos não-.jsonl", async () => {
    readDirMock.mockResolvedValueOnce([
      fakeEntry("session-abc.jsonl"),
      fakeEntry("session-def.jsonl"),
      fakeEntry("subagents", true),
      fakeEntry(".ccr-tip.json"),
    ]);
    statMock.mockImplementation(async (path: string) => ({
      mtime: path.includes("abc") ? new Date("2026-01-01T00:00:00Z") : new Date("2026-02-01T00:00:00Z"),
    }));

    const result = await listSessions(
      "/home/user/.claude/projects/-home-user-gsd-cards",
    );

    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id).sort()).toEqual([
      "session-abc",
      "session-def",
    ]);
    // Nunca chamou stat/readDir dentro de subagents/ ou para o arquivo
    // não-.jsonl — só as duas entradas .jsonl do nível raiz foram statadas.
    expect(statMock).toHaveBeenCalledTimes(2);
    expect(readDirMock).toHaveBeenCalledWith(
      "/home/user/.claude/projects/-home-user-gsd-cards",
    );
    expect(readDirMock).toHaveBeenCalledTimes(1);
  });

  it("degrada a [] quando a pasta codificada não existe (projeto novo sem sessões)", async () => {
    readDirMock.mockRejectedValueOnce(new Error("ENOENT: no such directory"));

    const result = await listSessions(
      "/home/user/.claude/projects/-home-user-projeto-novo",
    );

    expect(result).toEqual([]);
    expect(statMock).not.toHaveBeenCalled();
  });

  it("pula uma entrada cujo stat falha, sem abortar a listagem inteira (D-15)", async () => {
    readDirMock.mockResolvedValueOnce([
      fakeEntry("session-ok.jsonl"),
      fakeEntry("session-broken.jsonl"),
    ]);
    statMock.mockImplementation(async (path: string) => {
      if (path.includes("broken")) {
        throw new Error("stat falhou (arquivo removido durante a varredura)");
      }
      return { mtime: new Date("2026-01-01T00:00:00Z") };
    });

    const result = await listSessions("/home/user/.claude/projects/-x");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("session-ok");
  });

  it("extrai o id como o nome do arquivo sem a extensão .jsonl", async () => {
    readDirMock.mockResolvedValueOnce([fakeEntry("01998f3a-uuid.jsonl")]);
    statMock.mockResolvedValueOnce({ mtime: new Date("2026-03-01T00:00:00Z") });

    const result = await listSessions("/home/user/.claude/projects/-x");

    expect(result[0].id).toBe("01998f3a-uuid");
    expect(result[0].lastModified).toEqual(new Date("2026-03-01T00:00:00Z"));
  });
});
