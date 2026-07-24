import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Duplo mínimo de `LazyStore` (`@tauri-apps/plugin-store`) — um `Map`
 * em memória por instância, o suficiente para exercitar `get`/`set`/`save`
 * sem depender de `window.__TAURI_INTERNALS__` real. Estabelece o padrão
 * reutilizável de mock deste plugin (04-RESEARCH.md Wave 0 gap) para os
 * planos seguintes desta fase.
 */
class FakeLazyStore {
  static instances: FakeLazyStore[] = [];
  path: string;
  data = new Map<string, unknown>();
  saveCalls = 0;

  constructor(path: string) {
    this.path = path;
    FakeLazyStore.instances.push(this);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  async save(): Promise<void> {
    this.saveCalls += 1;
  }
}

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: FakeLazyStore,
}));

const { upsertRecent, getRecents, removeRecent, appStore } = await import("./app-store");

beforeEach(() => {
  (appStore as unknown as FakeLazyStore).data.clear();
});

describe("app-store", () => {
  it("grava no store nomeado 'app-state.json' — nunca em .planning/", () => {
    expect((appStore as unknown as FakeLazyStore).path).toBe("app-state.json");
  });

  it("upsertRecent(A) então upsertRecent(B): getRecents() devolve [B, A] (B primeiro)", async () => {
    await upsertRecent({ root: "/projects/a", name: "a", lastOpened: "2026-07-24T10:00:00.000Z" });
    await upsertRecent({ root: "/projects/b", name: "b", lastOpened: "2026-07-24T11:00:00.000Z" });

    const recents = await getRecents();

    expect(recents.map((r) => r.root)).toEqual(["/projects/b", "/projects/a"]);
  });

  it("re-upsertar A move para a frente sem duplicar", async () => {
    await upsertRecent({ root: "/projects/a", name: "a", lastOpened: "2026-07-24T10:00:00.000Z" });
    await upsertRecent({ root: "/projects/b", name: "b", lastOpened: "2026-07-24T11:00:00.000Z" });
    await upsertRecent({ root: "/projects/a", name: "a", lastOpened: "2026-07-24T12:00:00.000Z" });

    const recents = await getRecents();

    expect(recents.map((r) => r.root)).toEqual(["/projects/a", "/projects/b"]);
    expect(recents).toHaveLength(2);
  });

  it("getRecents() devolve [] quando não há nenhum recente persistido ainda", async () => {
    expect(await getRecents()).toEqual([]);
  });

  it("upsertRecent chama save() explicitamente (autoSave desabilitado)", async () => {
    const store = appStore as unknown as FakeLazyStore;
    const before = store.saveCalls;

    await upsertRecent({ root: "/projects/a", name: "a", lastOpened: "2026-07-24T10:00:00.000Z" });

    expect(store.saveCalls).toBe(before + 1);
  });

  it("removeRecent remove só a entrada com o root pedido, preservando as demais", async () => {
    await upsertRecent({ root: "/projects/a", name: "a", lastOpened: "2026-07-24T10:00:00.000Z" });
    await upsertRecent({ root: "/projects/b", name: "b", lastOpened: "2026-07-24T11:00:00.000Z" });

    await removeRecent("/projects/a");

    expect((await getRecents()).map((r) => r.root)).toEqual(["/projects/b"]);
  });

  it("removeRecent é um no-op idempotente quando o root não está na lista", async () => {
    await upsertRecent({ root: "/projects/a", name: "a", lastOpened: "2026-07-24T10:00:00.000Z" });

    await expect(removeRecent("/projects/inexistente")).resolves.toBeUndefined();
    expect((await getRecents()).map((r) => r.root)).toEqual(["/projects/a"]);
  });
});
