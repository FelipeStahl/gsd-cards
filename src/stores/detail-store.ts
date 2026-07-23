// Estado do painel de detalhe (D-10) — separado do board-store de propósito:
// carregar a árvore de artefatos de uma fase sob demanda nunca deve
// re-renderizar o board inteiro. Carregamento é preguiçoso (só quando o
// usuário seleciona uma fase) e cacheado por fase/artefato — o board com
// dezenas de fases não paga o custo de parsear todos os PLANs de uma vez.

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { listPlanningDir, readPlanningText } from "../planning/read";
import { phasesDir } from "../planning/paths";
import { parsePhaseDirName } from "../planning/phase-scan";
import { buildPhaseArtifactTree, type PhaseArtifactTree } from "../planning/artifact-tree";
import { ok, unrecognized, type ParseResult } from "../planning/parse-result";
import { useBoardStore } from "./board-store";

interface DetailStoreState {
  treeByPhaseId: Record<string, ParseResult<PhaseArtifactTree>>;
  loading: Record<string, boolean>;
  artifactContent: Record<string, ParseResult<string>>;
  loadPhaseTree: (phaseId: string) => Promise<void>;
  loadArtifact: (path: string) => Promise<void>;
}

/**
 * A árvore de fases em disco usa `<numero>-<slug>` (ex.: `01-espelho-fiel`),
 * mas o board seleciona a fase pelo id zero-padded (`01`) — resolve o nome
 * real do diretório procurando a entrada cujo `padded` bate com o id
 * selecionado, em vez de assumir um slug que o detail-store não conhece.
 */
async function resolvePhaseDirName(
  rootPhasesDir: string,
  phaseId: string,
): Promise<string | null> {
  const entries = await listPlanningDir(rootPhasesDir);
  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    const parsed = parsePhaseDirName(entry.name);
    if (parsed && parsed.padded === phaseId) return entry.name;
  }
  return null;
}

export const useDetailStore = create<DetailStoreState>()(
  immer((set, get) => ({
    treeByPhaseId: {},
    loading: {},
    artifactContent: {},

    loadPhaseTree: async (phaseId: string) => {
      if (get().treeByPhaseId[phaseId] || get().loading[phaseId]) return;

      set((state) => {
        state.loading[phaseId] = true;
      });

      const root = useBoardStore.getState().project?.root;
      if (!root) {
        set((state) => {
          state.loading[phaseId] = false;
          state.treeByPhaseId[phaseId] = unrecognized([
            { path: phaseId, reason: "Nenhum projeto aberto" },
          ]);
        });
        return;
      }

      try {
        const rootPhasesDir = phasesDir(root);
        const dirName = await resolvePhaseDirName(rootPhasesDir, phaseId);
        if (!dirName) {
          throw new Error(`Diretório da fase ${phaseId} não encontrado`);
        }
        const phaseDirPath = `${rootPhasesDir}/${dirName}`;
        const entries = await listPlanningDir(phaseDirPath);
        const fileNames = entries.filter((entry) => entry.isFile).map((entry) => entry.name);
        const tree = await buildPhaseArtifactTree(phaseDirPath, fileNames, readPlanningText);

        set((state) => {
          state.treeByPhaseId[phaseId] = ok(tree);
          state.loading[phaseId] = false;
        });
      } catch (error) {
        set((state) => {
          state.treeByPhaseId[phaseId] = unrecognized([
            { path: phaseId, reason: `Falha ao carregar a árvore da fase: ${String(error)}` },
          ]);
          state.loading[phaseId] = false;
        });
      }
    },

    loadArtifact: async (path: string) => {
      if (get().artifactContent[path]) return;

      try {
        const raw = await readPlanningText(path);
        set((state) => {
          state.artifactContent[path] = ok(raw);
        });
      } catch (error) {
        set((state) => {
          state.artifactContent[path] = unrecognized([
            { path, reason: `Falha ao ler artefato: ${String(error)}` },
          ]);
        });
      }
    },
  })),
);

// Invalida o cache de uma fase quando ela aparece em `recentlyUpdatedPhaseIds`
// do board-store (D-13) — o painel de detalhe já aberto recarrega a árvore
// em tempo real junto com o glow do card, em vez de continuar mostrando um
// snapshot obsoleto até o usuário fechar e reabrir o painel.
let previousUpdatedIds: string[] = [];
useBoardStore.subscribe((state) => {
  const affected = state.recentlyUpdatedPhaseIds;
  if (affected.length === 0 || affected === previousUpdatedIds) return;
  previousUpdatedIds = affected;

  const cached = useDetailStore.getState().treeByPhaseId;
  for (const phaseId of affected) {
    if (!(phaseId in cached)) continue;
    useDetailStore.setState((detailState) => {
      delete detailState.treeByPhaseId[phaseId];
    });
    void useDetailStore.getState().loadPhaseTree(phaseId);
  }
});
