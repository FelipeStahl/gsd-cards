import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Duplo mínimo de `Store` (`@tauri-apps/plugin-store`) — diferente do
 * `FakeLazyStore` de `app-store.test.ts` (que modela `new LazyStore(path)`,
 * uma única instância de vida longa), aqui `Store.load(path, opts)` é
 * ESTÁTICO e devolve uma instância nova a cada chamada — mas o dado
 * persiste entre chamadas via um `Map` de módulo keyed por `path`,
 * exatamente como o `tauri-plugin-store` real persistiria em disco entre um
 * `saveSnapshot`/`loadSnapshot` e o próximo. `close()` é um no-op no fake
 * (não há nada para "liberar" num Map em memória de teste), mas é chamado
 * (contabilizado) para provar que o código de produção chama `.close()`.
 */
const backingFiles = new Map<string, Map<string, unknown>>();
const closeCalls: string[] = [];

class FakeStore {
  path: string;
  private data: Map<string, unknown>;

  constructor(path: string) {
    this.path = path;
    if (!backingFiles.has(path)) backingFiles.set(path, new Map());
    this.data = backingFiles.get(path) as Map<string, unknown>;
  }

  static async load(path: string): Promise<FakeStore> {
    return new FakeStore(path);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  async save(): Promise<void> {
    // Fake: `data` já É o "disco" (Map de módulo por path), nada a fazer.
  }

  async close(): Promise<void> {
    closeCalls.push(this.path);
  }
}

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: FakeStore,
}));

const { saveSnapshot, loadSnapshot } = await import("./session-snapshot");

beforeEach(() => {
  backingFiles.clear();
  closeCalls.length = 0;
});

describe("session-snapshot (SESS-04 — split-file snapshot store)", () => {
  it("saveSnapshot então loadSnapshot para o MESMO id devolve a mesma string", async () => {
    await saveSnapshot("session-a", "linha 1\r\nlinha 2\r\n");

    const result = await loadSnapshot("session-a");

    expect(result).toBe("linha 1\r\nlinha 2\r\n");
  });

  it("loadSnapshot de um id desconhecido devolve null, nunca lança", async () => {
    await expect(loadSnapshot("nunca-persistido")).resolves.toBeNull();
  });

  it("cada sessão usa o PRÓPRIO arquivo plano session-<id>.json (nunca compartilhado)", async () => {
    await saveSnapshot("session-a", "conteúdo A");
    await saveSnapshot("session-b", "conteúdo B");

    expect(await loadSnapshot("session-a")).toBe("conteúdo A");
    expect(await loadSnapshot("session-b")).toBe("conteúdo B");
    expect(Array.from(backingFiles.keys()).sort()).toEqual([
      "session-session-a.json",
      "session-session-b.json",
    ]);
  });

  it("saveSnapshot e loadSnapshot chamam .close() ao fim (libera a cópia em memória — Pitfall 4)", async () => {
    await saveSnapshot("session-c", "x");
    await loadSnapshot("session-c");

    expect(closeCalls).toEqual(["session-session-c.json", "session-session-c.json"]);
  });

  it("saveSnapshot sobrescreve um snapshot anterior do mesmo id", async () => {
    await saveSnapshot("session-d", "primeira versão");
    await saveSnapshot("session-d", "segunda versão");

    expect(await loadSnapshot("session-d")).toBe("segunda versão");
  });
});
