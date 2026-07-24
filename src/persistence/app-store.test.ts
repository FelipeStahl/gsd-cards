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

const {
  upsertRecent,
  getRecents,
  removeRecent,
  upsertPersistedSession,
  getPersistedSessions,
  setLanguage,
  getLanguage,
  appStore,
} = await import("./app-store");

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

  it("WR-02: duas upsertRecent CONCORRENTES (nunca await'adas em sequência) persistem AMBAS as entradas, sem lost-update", async () => {
    // Sem serialização, a leitura de B pode acontecer ANTES da escrita de A
    // aplicar (mesma ordem de microtask de `get()`/`set()` async do
    // `FakeLazyStore`) — B sobrescreveria A silenciosamente. Disparar as
    // duas SEM await intermediário (Promise.all) é o que exercita essa
    // corrida; `withStoreLock` deve serializar as duas de qualquer jeito.
    await Promise.all([
      upsertRecent({ root: "/projects/a", name: "a", lastOpened: "2026-07-24T10:00:00.000Z" }),
      upsertRecent({ root: "/projects/b", name: "b", lastOpened: "2026-07-24T11:00:00.000Z" }),
    ]);

    const roots = (await getRecents()).map((r) => r.root).sort();
    expect(roots).toEqual(["/projects/a", "/projects/b"]);
  });

  it("WR-02: upsertRecent e removeRecent concorrentes (chaves diferentes de outra escrita concorrente) nunca se perdem entre si", async () => {
    await upsertRecent({ root: "/projects/a", name: "a", lastOpened: "2026-07-24T10:00:00.000Z" });

    await Promise.all([
      upsertRecent({ root: "/projects/b", name: "b", lastOpened: "2026-07-24T11:00:00.000Z" }),
      upsertRecent({ root: "/projects/c", name: "c", lastOpened: "2026-07-24T12:00:00.000Z" }),
    ]);

    const roots = (await getRecents()).map((r) => r.root).sort();
    expect(roots).toEqual(["/projects/a", "/projects/b", "/projects/c"]);
  });
});

describe("app-store — metadados de sessão persistidos (SESS-04, 04-06-PLAN.md)", () => {
  it("getPersistedSessions devolve [] quando nada foi persistido ainda", async () => {
    expect(await getPersistedSessions("/repo")).toEqual([]);
  });

  it("upsertPersistedSession então getPersistedSessions(mesmo projectRoot) devolve a entrada", async () => {
    await upsertPersistedSession({
      id: "session-a",
      projectRoot: "/repo",
      lastActive: "2026-07-24T10:00:00.000Z",
    });

    expect(await getPersistedSessions("/repo")).toEqual([
      { id: "session-a", projectRoot: "/repo", lastActive: "2026-07-24T10:00:00.000Z" },
    ]);
  });

  it("getPersistedSessions filtra por projectRoot — sessão de outro projeto não aparece", async () => {
    await upsertPersistedSession({ id: "session-a", projectRoot: "/repo-a", lastActive: "2026-07-24T10:00:00.000Z" });
    await upsertPersistedSession({ id: "session-b", projectRoot: "/repo-b", lastActive: "2026-07-24T10:00:00.000Z" });

    expect((await getPersistedSessions("/repo-a")).map((s) => s.id)).toEqual(["session-a"]);
  });

  it("re-upsertar o mesmo id atualiza a entrada sem duplicar", async () => {
    await upsertPersistedSession({ id: "session-a", projectRoot: "/repo", lastActive: "2026-07-24T10:00:00.000Z" });
    await upsertPersistedSession({ id: "session-a", projectRoot: "/repo", lastActive: "2026-07-24T11:00:00.000Z" });

    const sessions = await getPersistedSessions("/repo");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].lastActive).toBe("2026-07-24T11:00:00.000Z");
  });

  it("WR-02: duas upsertPersistedSession CONCORRENTES para ids distintos (ex.: dois terminais perdendo foco quase ao mesmo tempo) persistem AMBAS", async () => {
    await Promise.all([
      upsertPersistedSession({ id: "session-a", projectRoot: "/repo", lastActive: "2026-07-24T10:00:00.000Z" }),
      upsertPersistedSession({ id: "session-b", projectRoot: "/repo", lastActive: "2026-07-24T10:00:01.000Z" }),
    ]);

    const ids = (await getPersistedSessions("/repo")).map((s) => s.id).sort();
    expect(ids).toEqual(["session-a", "session-b"]);
  });
});

describe("app-store — idioma persistido (DIST-01, 05-01-PLAN.md)", () => {
  it("getLanguage() resolve null quando nada foi persistido ainda", async () => {
    expect(await getLanguage()).toBeNull();
  });

  it("setLanguage('en') então getLanguage() resolve 'en' — round-trip serializado por withStoreLock", async () => {
    await setLanguage("en");

    expect(await getLanguage()).toBe("en");
  });

  it("setLanguage chama save() explicitamente (autoSave desabilitado)", async () => {
    const store = appStore as unknown as FakeLazyStore;
    const before = store.saveCalls;

    await setLanguage("pt-BR");

    expect(store.saveCalls).toBe(before + 1);
  });

  it("T-05-01: getLanguage() resolve null quando o valor persistido é uma string corrompida/não reconhecida — nunca propaga o valor bruto (enum fechado)", async () => {
    const store = appStore as unknown as FakeLazyStore;
    await store.set("language", "fr-CA");

    expect(await getLanguage()).toBeNull();
  });
});
