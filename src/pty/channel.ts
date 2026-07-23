// Wrapper de `invoke`/`Channel` para os comandos `spawn_session`/
// `write_session`/`resize_session`/`kill_session` do backend Rust
// (`src-tauri/src/pty.rs`). Mesmo shape de `src/planning/watch.ts`
// (invoke + canal dedicado), mas usando `Channel<T>` por sessão em vez de
// `listen`/`emit` global — o caminho de alta frequência dos bytes do
// terminal precisa de um canal dedicado, não de um broadcast (ver
// `02-RESEARCH.md` Alternatives Considered).
//
// O backend nunca decodifica UTF-8 — o payload que chega aqui pode ser
// tanto um array simples de números (via serialização JSON do
// `Vec<u8>`, caminho atual do Tauri v2 para tipos `Serialize` genéricos)
// quanto um `ArrayBuffer` (caminho binário otimizado, para payloads
// pequenos o bastante). `new Uint8Array(message)` normaliza os dois casos
// para o mesmo tipo que `terminal.write()` espera, sem nenhuma
// interpretação de texto no meio do caminho.

import { invoke, Channel } from "@tauri-apps/api/core";

/** Payload bruto que pode chegar do Channel — normalizado por `toBytes`. */
type RawChannelMessage = number[] | ArrayBuffer | Uint8Array;

function toBytes(message: RawChannelMessage): Uint8Array {
  if (message instanceof Uint8Array) return message;
  return new Uint8Array(message);
}

/**
 * Cria um `Channel` dedicado a esta sessão e pede ao backend para subir o
 * `claude` num PTY real no `cwd` fornecido. `cwd` DEVE ser o `root` já
 * canonicalizado por `validateProjectRoot` (Fase 1) — nunca um caminho cru
 * (mitigação T-02-03).
 */
export function spawnSession(
  sessionId: string,
  cwd: string,
  onBytes: (data: Uint8Array) => void,
): Promise<void> {
  const onEvent = new Channel<RawChannelMessage>();
  onEvent.onmessage = (message) => onBytes(toBytes(message));
  return invoke("spawn_session", { sessionId, cwd, onEvent });
}

/** Envia texto digitado/colado no terminal de volta ao processo (stdin do PTY). */
export function writeSession(sessionId: string, data: string): Promise<void> {
  return invoke("write_session", { sessionId, data });
}

/** Propaga um resize de container (via `addon-fit`) para o PTY real. */
export function resizeSession(sessionId: string, cols: number, rows: number): Promise<void> {
  return invoke("resize_session", { sessionId, cols, rows });
}

/**
 * Mata a árvore de processos da sessão (TreeGuard + `Child::kill`/`wait`
 * como rede de segurança, ver `pty.rs::kill_session`). Mesmo padrão de
 * teardown de `stopWatching` — "sessão já não existe" nunca é tratado como
 * erro, é o estado esperado de uma sessão já encerrada.
 */
export async function killSession(sessionId: string): Promise<void> {
  try {
    await invoke("kill_session", { sessionId });
  } catch {
    // Sessão já encerrada/nunca existiu — não é erro.
  }
}
