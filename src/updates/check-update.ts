// Wrapper fino sobre `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process`
// (DIST-03) — mesmo estilo minimal-surface + degrade-silently de
// `src/notifications/notify.ts`: uma função por operação do plugin, sem
// abstração extra. `checkForUpdate()` NUNCA lança (um endpoint fora do ar,
// 404 ou manifest malformado degrada para "sem update" em vez de quebrar o
// boot do app) e cacheia a promise no módulo (checado no máximo UMA vez por
// execução, mesma disciplina de `ensurePermission()`). Verificação de
// assinatura (ed25519) acontece inteiramente dentro do plugin Rust
// `tauri-plugin-updater` — este arquivo nunca verifica nada por conta
// própria (T-05-04, RESEARCH.md V6/"Don't Hand-Roll").

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Cache da checagem já resolvida (ou em voo) — garante que `check()` só é
 * chamado UMA vez por execução real do app, mesmo que múltiplos
 * `UpdateIndicator` montem ou o `AppShell` re-renderize.
 */
let pendingCheck: Promise<Update | null> | null = null;

/**
 * Checa por atualização no máximo uma vez por execução do app (module-cached,
 * como `ensurePermission()` em `notify.ts`). Nunca lança: uma falha de rede,
 * endpoint 404 ou manifest malformado degrada para `null` ("sem update"),
 * nunca surge como erro de UI nem quebra o boot (T-05-05).
 */
export function checkForUpdate(): Promise<Update | null> {
  if (!pendingCheck) {
    pendingCheck = check().catch(() => null);
  }
  return pendingCheck;
}

/**
 * Baixa, verifica (ed25519, dentro do plugin — nunca aqui), instala e
 * relança o app, nessa ordem. O clique que dispara esta função é sempre
 * explícito do usuário (nunca automático) — proteção das sessões PTY vivas
 * (T-05-06, UI-SPEC "## Update Affordance" resolved discretion). `onProgress`
 * é opcional e alimenta o percentual mostrado pelo `UpdateIndicator` durante
 * o download — computado a partir dos eventos `Started`/`Progress` do
 * plugin, nunca de um `setInterval` sintético.
 */
export async function installUpdateAndRelaunch(
  update: Update,
  onProgress?: (percent: number) => void,
): Promise<void> {
  let contentLength = 0;
  let downloaded = 0;

  await update.downloadAndInstall((event) => {
    if (!onProgress) return;
    if (event.event === "Started") {
      contentLength = event.data.contentLength ?? 0;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      if (contentLength > 0) {
        onProgress(Math.min(100, Math.round((downloaded / contentLength) * 100)));
      }
    }
  });
  await relaunch();
}
