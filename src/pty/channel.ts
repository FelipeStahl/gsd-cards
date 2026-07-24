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
 * Handler atual de bytes por sessão — indireção que permite ao algoritmo de
 * foco (`focus-algorithm.ts`, SESS-03) redirecionar o destino dos bytes
 * (write direto no terminal em foco vs push num `backgroundBuffer` em
 * memória) sem nunca recriar o `Channel` nem o processo PTY. `spawnSession`
 * só é chamado UMA VEZ por sessão (na criação); toda troca de foco depois
 * disso só troca a entrada deste mapa via `setSessionBytesHandler`.
 */
const bytesHandlers = new Map<string, (data: Uint8Array) => void>();

/**
 * SEGUNDO mapa de handlers, independente do `bytesHandlers` acima — sempre
 * ativo para toda sessão viva, nunca redirecionado por troca de foco
 * (`redirectToTerminal`/`redirectToBackground` em `focus-algorithm.ts` só
 * tocam `bytesHandlers`). Consumido por `useTerminalActivity.ts` (ACT-03,
 * `03-RESEARCH.md` Pattern 2, load-bearing): a classificação de atividade
 * precisa de bytes mesmo para sessões em background, que é exatamente onde
 * `bytesHandlers` para de entregar bytes ao perder foco (Pitfall 1).
 */
const activityHandlers = new Map<string, (data: Uint8Array) => void>();

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
  bytesHandlers.set(sessionId, onBytes);
  onEvent.onmessage = (message) => {
    const bytes = toBytes(message);
    bytesHandlers.get(sessionId)?.(bytes);
    activityHandlers.get(sessionId)?.(bytes); // sempre dispara, independente de foco
  };
  return invoke("spawn_session", { sessionId, cwd, onEvent });
}

/**
 * Redireciona o destino dos bytes recebidos por uma sessão já viva — usado
 * pelo algoritmo de foco (`focus-algorithm.ts`, SESS-03): `terminal.write`
 * direto quando a sessão ganha foco, empilhar num `backgroundBuffer` quando
 * ela perde foco e nenhuma instância de terminal está montada. Nunca recria
 * o `Channel` nem afeta o processo PTY em si — é só uma troca de callback.
 */
export function setSessionBytesHandler(
  sessionId: string,
  onBytes: (data: Uint8Array) => void,
): void {
  bytesHandlers.set(sessionId, onBytes);
}

/**
 * Registra o callback sempre-ativo de classificação de atividade (ACT-03) —
 * NUNCA sobrescrito por `setSessionBytesHandler`/troca de foco. Chamado por
 * `useTerminalActivity.ts::wireTerminalActivity` uma vez por sessão.
 */
export function setActivityHandler(sessionId: string, onBytes: (data: Uint8Array) => void): void {
  activityHandlers.set(sessionId, onBytes);
}

/** Para de entregar bytes ao callback de atividade — chamado no cleanup de `wireTerminalActivity` (unmount/troca de sessão), além de `killSession` abaixo. */
export function clearActivityHandler(sessionId: string): void {
  activityHandlers.delete(sessionId);
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
  } finally {
    // Sem isso, o handler de bytes desta sessão (e o buffer que ele
    // eventualmente empilha) vazaria indefinidamente no mapa deste módulo
    // mesmo depois do processo morrer (T-02-02). Mesma disciplina aplicada
    // ao segundo mapa (`activityHandlers`) — sem o delete aqui, o callback
    // de classificação de atividade de uma sessão morta vazaria também.
    bytesHandlers.delete(sessionId);
    activityHandlers.delete(sessionId);
  }
}
