import { describe, expect, it, vi, beforeEach } from "vitest";

const isPermissionGrantedMock = vi.fn();
const requestPermissionMock = vi.fn();
const sendNotificationMock = vi.fn();

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: (...args: unknown[]) => isPermissionGrantedMock(...args),
  requestPermission: (...args: unknown[]) => requestPermissionMock(...args),
  sendNotification: (...args: unknown[]) => sendNotificationMock(...args),
}));

// `ensurePermission` cacheia o resultado num módulo-level `let` (by design —
// pedida só UMA vez por execução real do app). `vi.resetModules()` por teste
// força uma reavaliação fresca de `./notify` (e de `../i18n`, síncrono e
// idempotente já que os recursos são literais JSON, sem backend assíncrono)
// para que os testes de cache/degradação não vazem estado entre si.
beforeEach(() => {
  vi.resetModules();
  isPermissionGrantedMock.mockReset();
  requestPermissionMock.mockReset();
  sendNotificationMock.mockReset();
});

describe("ensurePermission (lazy, uma vez por execução)", () => {
  it("chama isPermissionGranted e, se negada, requestPermission — resolve true quando concedida", async () => {
    isPermissionGrantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue("granted");
    const { ensurePermission } = await import("./notify");

    await expect(ensurePermission()).resolves.toBe(true);
    expect(isPermissionGrantedMock).toHaveBeenCalledTimes(1);
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
  });

  it("não chama requestPermission quando a permissão já está concedida", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    const { ensurePermission } = await import("./notify");

    await expect(ensurePermission()).resolves.toBe(true);
    expect(requestPermissionMock).not.toHaveBeenCalled();
  });

  it("resolve false quando o usuário nega o pedido de permissão", async () => {
    isPermissionGrantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue("denied");
    const { ensurePermission } = await import("./notify");

    await expect(ensurePermission()).resolves.toBe(false);
  });

  it("cacheia o resultado — a segunda chamada não repete isPermissionGranted", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    const { ensurePermission } = await import("./notify");

    await ensurePermission();
    await ensurePermission();

    expect(isPermissionGrantedMock).toHaveBeenCalledTimes(1);
  });

  it("degrada para false (nunca lança) quando o plugin lança — daemon ausente/AUMID ausente", async () => {
    isPermissionGrantedMock.mockRejectedValue(new Error("sem daemon de notificação do SO"));
    const { ensurePermission } = await import("./notify");

    await expect(ensurePermission()).resolves.toBe(false);
  });
});

describe("notifyAwaiting", () => {
  it("chama sendNotification com o título/corpo de terminal.notification.awaiting.*", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    const { notifyAwaiting } = await import("./notify");

    await notifyAwaiting("Sessão a3f91c2d");

    expect(sendNotificationMock).toHaveBeenCalledWith({
      title: "Claude precisa de você",
      body: "A sessão Sessão a3f91c2d está aguardando sua permissão.",
    });
  });

  it("no-op silencioso (nunca chama sendNotification) quando a permissão é negada", async () => {
    isPermissionGrantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue("denied");
    const { notifyAwaiting } = await import("./notify");

    await expect(notifyAwaiting("Sessão a3f91c2d")).resolves.toBeUndefined();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("no-op silencioso (nunca lança) quando o próprio sendNotification lança", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    sendNotificationMock.mockImplementation(() => {
      throw new Error("daemon de notificação indisponível");
    });
    const { notifyAwaiting } = await import("./notify");

    await expect(notifyAwaiting("Sessão a3f91c2d")).resolves.toBeUndefined();
  });

  it("no-op silencioso (nunca lança) quando ensurePermission em si lança", async () => {
    isPermissionGrantedMock.mockRejectedValue(new Error("sem daemon"));
    const { notifyAwaiting } = await import("./notify");

    await expect(notifyAwaiting("Sessão a3f91c2d")).resolves.toBeUndefined();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});

describe("notifyExited", () => {
  it("chama sendNotification com o título/corpo de terminal.notification.exited.*", async () => {
    isPermissionGrantedMock.mockResolvedValue(true);
    const { notifyExited } = await import("./notify");

    await notifyExited("Sessão a3f91c2d");

    expect(sendNotificationMock).toHaveBeenCalledWith({
      title: "Sessão encerrada",
      body: "A sessão Sessão a3f91c2d terminou.",
    });
  });

  it("no-op silencioso (nunca chama sendNotification) quando a permissão é negada", async () => {
    isPermissionGrantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue("denied");
    const { notifyExited } = await import("./notify");

    await expect(notifyExited("Sessão a3f91c2d")).resolves.toBeUndefined();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});
