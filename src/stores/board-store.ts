// Estado zustand do projeto aberto — espelho puro do `.planning/` do
// filesystem. Este store NUNCA escreve no disco (Pattern 4 da pesquisa e
// decisão de produto do PROJECT.md: "GSD permanece a fonte da verdade").

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import {
  readPlanningText,
  validateProjectRoot,
  type ProjectOpenErrorKind,
} from "../planning/read";
import { roadmapPath, statePath } from "../planning/paths";
import { parseStateFile } from "../planning/parser/state";
import { parseRoadmap, type RoadmapModel } from "../planning/parser/roadmap";
import { scanAllPhases, type PhaseScanEntry } from "../planning/phase-scan";
import {
  deriveDiskStatus,
  toBoardBadge,
  toBoardColumn,
  type BoardColumnId,
  type PhaseDirSignals,
} from "../planning/status";
import { unrecognized } from "../planning/parse-result";
import type { MilestoneRef, PhaseBlocker, PhaseModel, ProjectStateModel } from "../planning/model";

export type BoardStatus = "idle" | "opening" | "open" | "error";

export interface ProjectStoreError {
  kind: ProjectOpenErrorKind | "TooLarge";
  message: string;
}

/** Preenchido pelo Plano 04 (watcher + debounce); campo declarado agora para não disputar este arquivo depois. */
export interface SyncState {
  status: "healthy" | "stale" | "unknown";
  lastSyncedAt: string | null;
}

interface BoardStoreState {
  status: BoardStatus;
  project: ProjectStateModel | null;
  error: ProjectStoreError | null;
  /** Preenchido pelo Plano 04 — ids de fase com glow de atualização em tempo real (D-13). */
  recentlyUpdatedPhaseIds: string[];
  /** Preenchido pelo Plano 04 — saúde do file watcher (D-16). */
  sync: SyncState;
  openProject: (root: string) => Promise<void>;
  closeProject: () => void;
}

function deriveProjectName(root: string): string {
  const segments = root.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? root;
}

function emptyMilestones(): MilestoneRef[] {
  return [];
}

function emptySignals(): PhaseDirSignals {
  return {
    planCount: 0,
    summaryCount: 0,
    hasResearch: false,
    hasContext: false,
    isActive: false,
    verificationStatus: "missing",
  };
}

/** Zero-padded a partir de um número puro (ex.: `2` -> `02`, `2.1` -> `02.1`) — só usado quando não há uma fase no disco que já preserve o padded original. */
function formatPadded(number: number): string {
  if (Number.isInteger(number)) {
    return String(number).padStart(2, "0");
  }
  const [intPart, fracPart] = number.toFixed(1).split(".");
  return `${intPart.padStart(2, "0")}.${fracPart}`;
}

/** Fallback de nome legível a partir do slug do diretório — usado quando o ROADMAP.md não tem o nome da fase (unrecognized) ou quando a fase só existe no disco. */
function humanizeSlug(slug: string): string {
  if (slug.length === 0) return slug;
  const spaced = slug.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Monta os `PhaseModel[]` do board a partir do merge entre `ROADMAP.md`
 * (nome, requisitos) e a varredura real de `.planning/phases/`
 * (`phase-scan.ts` + `status.ts` — a fonte de verdade granular do status).
 *
 * Uma fase do ROADMAP sem diretório correspondente recebe `dirExists: false`
 * (badge `pending`) em vez de ser omitida do board; uma fase presente no
 * disco mas ausente do ROADMAP (ex.: roadmap não pôde ser lido) também não
 * some — degrada graciosamente com um nome derivado do slug do diretório.
 */
function buildPhaseModels(
  roadmap: RoadmapModel | null,
  scanned: PhaseScanEntry[],
  blockers: PhaseBlocker[],
): PhaseModel[] {
  const scannedByNumber = new Map<number, PhaseScanEntry>();
  for (const entry of scanned) {
    scannedByNumber.set(entry.number, entry);
  }

  const seenNumbers = new Set<number>();
  const models: PhaseModel[] = [];

  const roadmapPhases = roadmap?.phases ?? [];
  for (const roadmapPhase of roadmapPhases) {
    // Sem número reconhecível não há como posicionar a fase no board — a
    // fase inteira nunca é derrubada por causa disso (roadmap parser),
    // apenas fica de fora da renderização do board até o ROADMAP.md ser
    // corrigido a montante.
    if (roadmapPhase.number.kind !== "ok") continue;

    const number = roadmapPhase.number.value;
    seenNumbers.add(number);

    const scanEntry = scannedByNumber.get(number);
    const dirExists = Boolean(scanEntry);
    const signals = scanEntry?.signals ?? emptySignals();
    const diskStatus = deriveDiskStatus(dirExists, signals);
    const badge = toBoardBadge(diskStatus, signals.isActive);
    const column = toBoardColumn(badge);

    const name =
      roadmapPhase.name.kind === "ok"
        ? roadmapPhase.name.value
        : humanizeSlug(scanEntry?.slug ?? formatPadded(number));
    const requirementIds =
      roadmapPhase.requirementIds.kind === "ok" ? roadmapPhase.requirementIds.value : [];

    models.push({
      id: scanEntry?.padded ?? formatPadded(number),
      number,
      name,
      diskStatus,
      badge,
      column,
      planCount: signals.planCount,
      summaryCount: signals.summaryCount,
      requirementIds,
      isInserted: !Number.isInteger(number),
      blockers: blockers.filter((blocker) => blocker.phases.includes(number)),
      issues: scanEntry?.issues ?? [],
    });
  }

  for (const entry of scanned) {
    if (seenNumbers.has(entry.number)) continue;

    const diskStatus = deriveDiskStatus(true, entry.signals);
    const badge = toBoardBadge(diskStatus, entry.signals.isActive);
    const column = toBoardColumn(badge);

    models.push({
      id: entry.padded,
      number: entry.number,
      name: humanizeSlug(entry.slug),
      diskStatus,
      badge,
      column,
      planCount: entry.signals.planCount,
      summaryCount: entry.signals.summaryCount,
      requirementIds: [],
      isInserted: !Number.isInteger(entry.number),
      blockers: blockers.filter((blocker) => blocker.phases.includes(entry.number)),
      issues: entry.issues,
    });
  }

  models.sort((a, b) => a.number - b.number);
  return models;
}

const BOARD_COLUMNS: BoardColumnId[] = ["todo", "preparing", "executing", "done"];

/** Agrupa as fases por coluna (D-05), em ordem numérica dentro de cada coluna. */
export function selectPhasesByColumn(
  phases: PhaseModel[],
): Record<BoardColumnId, PhaseModel[]> {
  const grouped: Record<BoardColumnId, PhaseModel[]> = {
    todo: [],
    preparing: [],
    executing: [],
    done: [],
  };
  for (const phase of phases) {
    grouped[phase.column].push(phase);
  }
  for (const column of BOARD_COLUMNS) {
    grouped[column].sort((a, b) => a.number - b.number);
  }
  return grouped;
}

/** Contagem de fases por coluna — alimenta os contadores do header (D-12). */
export function selectColumnCounts(phases: PhaseModel[]): Record<BoardColumnId, number> {
  const byColumn = selectPhasesByColumn(phases);
  return {
    todo: byColumn.todo.length,
    preparing: byColumn.preparing.length,
    executing: byColumn.executing.length,
    done: byColumn.done.length,
  };
}

/**
 * Lê e parseia `ROADMAP.md`. Nunca lança — uma falha de leitura (ex.:
 * arquivo apagado após a validação inicial) ou de parse estrutural degrada
 * para `null`, e `buildPhaseModels` continua funcionando a partir só da
 * varredura de disco (D-15: falha localizada, nunca derruba o board inteiro).
 */
async function loadRoadmapModel(root: string): Promise<RoadmapModel | null> {
  try {
    const raw = await readPlanningText(roadmapPath(root));
    const result = parseRoadmap(raw, roadmapPath(root));
    return result.kind === "ok" ? result.value : null;
  } catch {
    return null;
  }
}

export const useBoardStore = create<BoardStoreState>()(
  immer((set) => ({
    status: "idle",
    project: null,
    error: null,
    recentlyUpdatedPhaseIds: [],
    sync: { status: "unknown", lastSyncedAt: null },

    openProject: async (root: string) => {
      set((state) => {
        state.status = "opening";
        state.error = null;
      });

      try {
        const validated = await validateProjectRoot(root);
        const projectStatePath = statePath(validated.root);
        const rawState = await readPlanningText(projectStatePath);
        const parsedState = parseStateFile(rawState, projectStatePath);
        const projectName = deriveProjectName(validated.root);

        // Board (Plano 03): fases derivadas do merge entre ROADMAP.md e a
        // varredura real do disco. `scanAllPhases` já nunca lança (D-15);
        // `loadRoadmapModel` também degrada para `null` em vez de lançar.
        const roadmapModel = await loadRoadmapModel(validated.root);
        const scannedPhases = await scanAllPhases(validated.root);
        const blockers = parsedState.kind === "ok" ? parsedState.value.blockers : [];
        const phases = buildPhaseModels(roadmapModel, scannedPhases, blockers);

        set((state) => {
          if (parsedState.kind === "unrecognized") {
            state.project = {
              root: validated.root,
              projectName,
              milestone: unrecognized(parsedState.issues, parsedState.raw),
              currentPhase: unrecognized(parsedState.issues),
              currentPhaseName: unrecognized(parsedState.issues),
              progress: unrecognized(parsedState.issues),
              blockers: [],
              phases,
              milestones: emptyMilestones(),
              issues: parsedState.issues,
            };
          } else {
            const parsed = parsedState.value;
            state.project = {
              root: validated.root,
              projectName,
              milestone: parsed.milestone,
              currentPhase: parsed.currentPhase,
              currentPhaseName: parsed.currentPhaseName,
              progress: parsed.progress,
              blockers: parsed.blockers,
              phases,
              milestones: emptyMilestones(),
              issues: parsed.issues,
            };
          }
          state.status = "open";
        });
      } catch (error) {
        set((state) => {
          state.status = "error";
          state.error = toStoreError(error);
        });
      }
    },

    closeProject: () => {
      set((state) => {
        state.status = "idle";
        state.project = null;
        state.error = null;
      });
    },
  })),
);

function toStoreError(error: unknown): ProjectStoreError {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error
  ) {
    const candidate = error as { kind: unknown; message: unknown };
    if (typeof candidate.kind === "string" && typeof candidate.message === "string") {
      return { kind: candidate.kind as ProjectStoreError["kind"], message: candidate.message };
    }
  }
  return { kind: "IoError", message: String(error) };
}
