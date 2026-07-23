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
import { statePath } from "../planning/paths";
import { parseStateFile } from "../planning/parser/state";
import { unrecognized } from "../planning/parse-result";
import type { MilestoneRef, PhaseModel, ProjectStateModel } from "../planning/model";

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

function emptyPhases(): PhaseModel[] {
  return [];
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
              phases: emptyPhases(),
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
              phases: emptyPhases(),
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
