import { describe, expect, it, vi, beforeEach } from "vitest";

const checkMock = vi.fn();
const relaunchMock = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => checkMock(...args),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: (...args: unknown[]) => relaunchMock(...args),
}));

// `pendingCheck` cacheia o resultado num módulo-level `let` (by design — a
// checagem só acontece UMA vez por execução real do app, mesma disciplina de
// `permissionPromise` em `notify.ts`). `vi.resetModules()` por teste força
// uma reavaliação fresca de `./check-update` para que os testes de
// cache/degradação não vazem estado entre si (`notify.test.ts` lines 13-23,
// mesmo motivo).
beforeEach(() => {
  vi.resetModules();
  checkMock.mockReset();
  relaunchMock.mockReset();
});

describe("checkForUpdate (module-cached, nunca lança)", () => {
  it("chama check() e resolve o Update quando há atualização disponível", async () => {
    const update = { version: "1.2.0" };
    checkMock.mockResolvedValue(update);
    const { checkForUpdate } = await import("./check-update");

    await expect(checkForUpdate()).resolves.toBe(update);
    expect(checkMock).toHaveBeenCalledTimes(1);
  });

  it("cacheia o resultado — a segunda chamada não repete check()", async () => {
    checkMock.mockResolvedValue(null);
    const { checkForUpdate } = await import("./check-update");

    await checkForUpdate();
    await checkForUpdate();

    expect(checkMock).toHaveBeenCalledTimes(1);
  });

  it("degrada para null (nunca lança) quando check() rejeita — endpoint fora do ar/404/manifest malformado", async () => {
    checkMock.mockRejectedValue(new Error("network down"));
    const { checkForUpdate } = await import("./check-update");

    await expect(checkForUpdate()).resolves.toBeNull();
  });

  it("resolve null (não trata como update) quando check() resolve null (sem atualização)", async () => {
    checkMock.mockResolvedValue(null);
    const { checkForUpdate } = await import("./check-update");

    await expect(checkForUpdate()).resolves.toBeNull();
  });
});

describe("installUpdateAndRelaunch (baixa, instala, relança — nessa ordem)", () => {
  it("chama downloadAndInstall e SÓ DEPOIS relaunch", async () => {
    const callOrder: string[] = [];
    const downloadAndInstall = vi.fn().mockImplementation(async () => {
      callOrder.push("downloadAndInstall");
    });
    relaunchMock.mockImplementation(async () => {
      callOrder.push("relaunch");
    });
    const { installUpdateAndRelaunch } = await import("./check-update");

    await installUpdateAndRelaunch({ downloadAndInstall } as never);

    expect(callOrder).toEqual(["downloadAndInstall", "relaunch"]);
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });

  it("nunca verifica assinatura por conta própria — apenas repassa o objeto Update ao plugin", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    relaunchMock.mockResolvedValue(undefined);
    const { installUpdateAndRelaunch } = await import("./check-update");

    await installUpdateAndRelaunch({ downloadAndInstall } as never);

    // Nenhuma chamada a `crypto`/verificação manual — apenas o método do
    // próprio objeto `Update` fornecido pelo plugin (T-05-04).
    expect(downloadAndInstall).toHaveBeenCalledWith(expect.any(Function));
  });

  it("interpola o percentual via onProgress a partir dos eventos Started/Progress do plugin", async () => {
    const downloadAndInstall = vi.fn().mockImplementation(async (onEvent) => {
      onEvent({ event: "Started", data: { contentLength: 200 } });
      onEvent({ event: "Progress", data: { chunkLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 100 } });
    });
    relaunchMock.mockResolvedValue(undefined);
    const onProgress = vi.fn();
    const { installUpdateAndRelaunch } = await import("./check-update");

    await installUpdateAndRelaunch({ downloadAndInstall } as never, onProgress);

    expect(onProgress).toHaveBeenNthCalledWith(1, 50);
    expect(onProgress).toHaveBeenNthCalledWith(2, 100);
  });

  it("não lança quando onProgress não é fornecido, mesmo com eventos de progresso", async () => {
    const downloadAndInstall = vi.fn().mockImplementation(async (onEvent) => {
      onEvent({ event: "Progress", data: { chunkLength: 100 } });
    });
    relaunchMock.mockResolvedValue(undefined);
    const { installUpdateAndRelaunch } = await import("./check-update");

    await expect(installUpdateAndRelaunch({ downloadAndInstall } as never)).resolves.toBeUndefined();
  });
});
