// Helpers puros sobre `SessionSignal` (já extraído por `discover.ts` via
// `readDir`/`stat`) — extração de id a partir de um nome de arquivo e
// ordenação por mtime. NUNCA lê conteúdo de `.jsonl` (mitiga T-02-06); todo
// input aqui já é `{ id, lastModified }`, nunca um caminho de arquivo a ser
// aberto.

import type { SessionSignal } from "./discover";

const JSONL_EXTENSION_PATTERN = /\.jsonl$/;

/** Extrai o id (nome do arquivo sem `.jsonl`) de um nome de arquivo. */
export function extractSessionId(fileName: string): string {
  return fileName.replace(JSONL_EXTENSION_PATTERN, "");
}

/**
 * Ordena sinais de sessão da mais recente para a mais antiga por
 * `lastModified`. Sessões sem mtime (`null`) vão para o final, na ordem em
 * que apareceram (sort estável).
 */
export function sortByLastModifiedDesc(
  sessions: SessionSignal[],
): SessionSignal[] {
  return [...sessions].sort((a, b) => {
    const aTime = a.lastModified?.getTime() ?? Number.NEGATIVE_INFINITY;
    const bTime = b.lastModified?.getTime() ?? Number.NEGATIVE_INFINITY;
    return bTime - aTime;
  });
}
