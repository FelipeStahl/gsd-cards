// Assinatura dos eventos do watcher Rust (`planning_watcher.rs`) e roteamento
// para o reprocessamento incremental do board-store (Plano 04, BOARD-03).
//
// `startWatching`/`stopWatching` são declarações de função (não `const =>`)
// deliberadamente — este módulo e `../stores/board-store` importam um do
// outro (o store precisa de `classifyChangedPath` para `reprocessPaths`; este
// módulo precisa de `useBoardStore` para rotear os eventos do backend). Uma
// declaração de função é hoisted e já existe por inteiro antes de qualquer
// código do ciclo rodar, então a dependência circular nunca observa um
// export ainda não inicializado — o mesmo não valeria para `const`.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { useBoardStore } from "../stores/board-store";

/** Classificação pura de um caminho alterado — sem I/O (testável isoladamente). */
export type ChangedPathKind =
  | { kind: "state" }
  | { kind: "roadmap" }
  | { kind: "phase"; phaseId: string }
  | { kind: "milestones" }
  | { kind: "other" };

function normalizeRoot(root: string): string {
  return root.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** `<numero>-<slug>` — mesmo padrão de `phase-scan.ts#parsePhaseDirName`, aqui aplicado só ao primeiro segmento do caminho dentro de `phases/`. */
const PHASE_DIR_SEGMENT_PATTERN = /^(\d+(?:\.\d)?)-.+$/;

/**
 * Classifica um caminho alterado (absoluto ou relativo a `projectRoot`) em
 * `state` | `roadmap` | `phase` (com o id numérico extraído do nome do
 * diretório da fase) | `milestones` | `other`. Nunca faz I/O — é essa
 * classificação que torna `reprocessPaths` incremental.
 */
export function classifyChangedPath(path: string, projectRoot: string): ChangedPathKind {
  const normalizedPath = path.replace(/\\/g, "/");
  const root = normalizeRoot(projectRoot);
  const planning = root.length > 0 ? `${root}/.planning` : ".planning";

  if (normalizedPath === `${planning}/STATE.md`) return { kind: "state" };
  if (normalizedPath === `${planning}/ROADMAP.md`) return { kind: "roadmap" };
  if (normalizedPath === `${planning}/MILESTONES.md`) return { kind: "milestones" };
  if (normalizedPath.startsWith(`${planning}/milestones/`)) return { kind: "milestones" };

  const phasesPrefix = `${planning}/phases/`;
  if (normalizedPath.startsWith(phasesPrefix)) {
    const rest = normalizedPath.slice(phasesPrefix.length);
    const [segment] = rest.split("/");
    const match = segment ? PHASE_DIR_SEGMENT_PATTERN.exec(segment) : null;
    if (match) {
      return { kind: "phase", phaseId: match[1] };
    }
  }

  return { kind: "other" };
}

let unlistenChanged: UnlistenFn | null = null;
let unlistenDegraded: UnlistenFn | null = null;

/**
 * Registra os listeners de `planning:changed`/`planning:watcher-degraded` e
 * pede ao backend Rust para começar a observar `.planning/` desta raiz de
 * projeto. Chamada pelo fluxo de `openProject` do board-store e por
 * `reconnectWatcher` após uma degradação.
 */
export async function startWatching(planningRoot: string): Promise<void> {
  await stopWatching();

  unlistenChanged = await listen<string[]>("planning:changed", (event) => {
    void useBoardStore.getState().reprocessPaths(event.payload);
  });
  unlistenDegraded = await listen<{ reason: string }>(
    "planning:watcher-degraded",
    (event) => {
      useBoardStore.getState().markSyncDegraded(event.payload.reason);
    },
  );

  await invoke("start_planning_watch", { planningRoot });
}

/** Remove os listeners e derruba o watcher no backend. Chamada por `closeProject`. */
export async function stopWatching(): Promise<void> {
  if (unlistenChanged) {
    unlistenChanged();
    unlistenChanged = null;
  }
  if (unlistenDegraded) {
    unlistenDegraded();
    unlistenDegraded = null;
  }
  try {
    await invoke("stop_planning_watch");
  } catch {
    // Nenhum watcher ativo ainda (ex.: projeto nunca foi aberto) — não é erro.
  }
}
