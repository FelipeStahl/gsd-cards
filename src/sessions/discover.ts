// Descoberta de sessões existentes do Claude Code (SESS-01) —
// `~/.claude/projects/<encoded>/*.jsonl`. Usa SÓ o nome do arquivo (id) e o
// mtime (via `stat`) como sinal de existência/atividade — NUNCA lê o
// conteúdo do `.jsonl` (mitiga T-02-06 / Anti-Pattern 1 de ARCHITECTURE.md:
// arquivos reais de sessões longas passam de centenas de KB).
//
// Segue a mesma disciplina defensiva de `planning/phase-scan.ts`: uma falha
// de `stat` numa entrada específica não aborta a listagem inteira (só essa
// entrada é pulada), e a pasta codificada inexistente (projeto novo, nenhuma
// sessão criada ainda) degrada a `[]` em vez de lançar.

import { readDir, stat } from "@tauri-apps/plugin-fs";

export interface SessionSignal {
  /** Nome do arquivo sem a extensão `.jsonl` — id da sessão. */
  id: string;
  /** mtime do arquivo `.jsonl` — última atividade observável, sem ler conteúdo. */
  lastModified: Date | null;
}

const JSONL_EXTENSION = ".jsonl";

/**
 * Lista as sessões (`*.jsonl`) diretamente no nível raiz de `encodedDir`
 * (`~/.claude/projects/<encoded>/`, já concedido por
 * `register_sessions_scope`). Nunca recursa em subpastas (ex.:
 * `subagents/`) e ignora qualquer entrada que não seja um arquivo
 * terminando em `.jsonl`. Degrada a `[]` quando `encodedDir` não existe —
 * nunca lança.
 */
export async function listSessions(encodedDir: string): Promise<SessionSignal[]> {
  let entries;
  try {
    entries = await readDir(encodedDir);
  } catch {
    return [];
  }

  const jsonlFiles = entries.filter(
    (entry) => !entry.isDirectory && entry.name.endsWith(JSONL_EXTENSION),
  );

  const results: SessionSignal[] = [];
  for (const entry of jsonlFiles) {
    try {
      const info = await stat(`${encodedDir}/${entry.name}`);
      results.push({
        id: entry.name.slice(0, -JSONL_EXTENSION.length),
        lastModified: info.mtime,
      });
    } catch {
      // Falha de stat numa entrada específica não derruba a listagem
      // inteira — mesma disciplina de `scanPhaseDir`/`isDirRecentlyActive`
      // em `phase-scan.ts` (D-15, falha localizada).
    }
  }

  return results;
}
