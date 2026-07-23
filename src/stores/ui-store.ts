// Estado de seleção de fase e de artefato aberto — separado do board-store
// (que só espelha dados lidos do disco). Este store nasce completo neste
// plano: o Plano 05 apenas consome estas ações ao montar o painel de detalhe
// e o modal de artefato, sem precisar editar este arquivo.

import { create } from "zustand";

interface UiStoreState {
  selectedPhaseId: string | null;
  openArtifactPath: string | null;
  selectPhase: (id: string) => void;
  clearSelection: () => void;
  openArtifact: (path: string) => void;
  closeArtifact: () => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  selectedPhaseId: null,
  openArtifactPath: null,
  selectPhase: (id) => set({ selectedPhaseId: id }),
  clearSelection: () => set({ selectedPhaseId: null }),
  openArtifact: (path) => set({ openArtifactPath: path }),
  closeArtifact: () => set({ openArtifactPath: null }),
}));
