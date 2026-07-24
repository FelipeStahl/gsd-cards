// Wrapper fino sobre `@tauri-apps/plugin-notification` (TERM-04) — mesmo
// estilo minimal-surface de `src/pty/channel.ts` (uma função por operação do
// plugin, sem abstração extra). `ensurePermission`/`notifyAwaiting`/
// `notifyExited` NUNCA lançam nem bloqueiam outra funcionalidade — o badge
// em app (`DrawerRail`/`SessionRow`) é o contrato durável e independente de
// permissão (T-04-21); o toast do SO é best-effort, sujeito a negação de
// permissão, ausência de daemon (Linux) ou AUMID ausente em builds de dev
// não empacotados no Windows (04-RESEARCH.md Pitfall 5). Mesma disciplina
// degrade-silently de `discoverSessions` em `session-store.ts`.

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import { i18n } from "../i18n";

/**
 * Cache da permissão já resolvida (ou em voo) — garante que a permissão só é
 * pedida UMA vez, lazily, na primeira necessidade (04-CONTEXT.md), nunca
 * re-perguntada agressivamente a cada notificação subsequente.
 */
let permissionPromise: Promise<boolean> | null = null;

/**
 * Pede permissão de notificação lazily, uma única vez por execução do app —
 * chamadas subsequentes reaproveitam a mesma promise em voo/já resolvida.
 * Nunca lança: qualquer falha do plugin (daemon ausente, AUMID ausente,
 * etc.) resolve para `false`, degradando para badge-only sem propagar erro.
 */
export function ensurePermission(): Promise<boolean> {
  if (!permissionPromise) {
    permissionPromise = (async () => {
      try {
        const granted = await isPermissionGranted();
        if (granted) return true;
        const permission = await requestPermission();
        return permission === "granted";
      } catch {
        return false;
      }
    })();
  }
  return permissionPromise;
}

/**
 * Dispara `sendNotification` com o título/corpo resolvidos via i18n para
 * `titleKey`/`bodyKey` (namespace `terminal`, interpolando `sessionLabel`).
 * No-op silencioso (nunca lança) quando a permissão é negada ou o próprio
 * plugin lança (`sendNotification` é síncrono e pode lançar se o daemon de
 * notificação do SO não existir) — o badge em app permanece o contrato
 * durável independente do resultado desta chamada.
 */
async function notify(titleKey: string, bodyKey: string, sessionLabel: string): Promise<void> {
  try {
    const granted = await ensurePermission();
    if (!granted) return;
    sendNotification({
      title: i18n.t(titleKey, { ns: "terminal" }),
      body: i18n.t(bodyKey, { ns: "terminal", sessionLabel }),
    });
  } catch {
    // Degrade-silently (T-04-21) — nunca bloqueia setActivity/markExited.
  }
}

/** Dispara o toast do SO quando uma sessão transiciona para `awaiting` (precisa de input do usuário). */
export function notifyAwaiting(sessionLabel: string): Promise<void> {
  return notify("notification.awaiting.title", "notification.awaiting.body", sessionLabel);
}

/** Dispara o toast do SO quando uma sessão `exited` (o processo encerrou). */
export function notifyExited(sessionLabel: string): Promise<void> {
  return notify("notification.exited.title", "notification.exited.body", sessionLabel);
}
