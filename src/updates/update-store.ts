// Estado compartilhado de atualização (DIST-03) — nasce deste plano (05-03),
// sem análogo direto no repo: nenhum store existente envolve o resultado de
// UMA chamada assíncrona de plugin em estado compartilhado entre múltiplos
// mount points (05-PATTERNS.md "No Analog Found"). Segue as convenções
// genéricas de `src/stores/ui-store.ts` (só a forma da slice, não um padrão
// específico). Módulo-level/singleton por design do zustand: os DOIS mounts
// de `UpdateIndicator` (Header + HomeScreen) leem a MESMA store, então nunca
// discordam entre si independentemente da view ativa (UI-SPEC "## Update
// Affordance" mount points note).

import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdateLifecycleState =
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "error";

interface UpdateStoreState {
  state: UpdateLifecycleState;
  /** Percentual de download (0-100), só relevante durante `downloading`. */
  percent: number;
  /** Versão disponível — só populada a partir de `available`. */
  version: string | null;
  /** O objeto `Update` do plugin, guardado para que a ação de instalar
   * (disparada pelo `UpdateIndicator`, no clique explícito do usuário) e a
   * retentativa em `error` reusem a MESMA checagem já feita — nunca
   * re-chamam `check()`. */
  pendingUpdate: Update | null;
  /** Transição de boot: nenhuma atualização encontrada — renderiza `null`. */
  setUpToDate: () => void;
  /** Transição de boot: atualização encontrada — guarda o `Update` e a versão. */
  setAvailable: (update: Update) => void;
  /** Disparada pelo clique explícito em "Atualizar e reiniciar"/"Tentar
   * novamente" — remove a ação (não desabilita) enquanto baixa. */
  startDownloading: () => void;
  /** Atualiza o percentual durante o download (eventos do plugin). */
  setProgress: (percent: number) => void;
  /** Download/instalação falhou — mostra retry + dismiss. */
  setError: () => void;
  /** Esconde a linha de erro até a próxima checagem em background encontrar
   * uma atualização de novo (UI-SPEC backstop — a cadência do re-check
   * periódico é responsabilidade de um plano futuro, não deste). */
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateStoreState>((set) => ({
  state: "checking",
  percent: 0,
  version: null,
  pendingUpdate: null,
  setUpToDate: () => set({ state: "up-to-date", pendingUpdate: null, version: null }),
  setAvailable: (update) =>
    set({ state: "available", pendingUpdate: update, version: update.version, percent: 0 }),
  startDownloading: () => set({ state: "downloading", percent: 0 }),
  setProgress: (percent) => set({ percent }),
  setError: () => set({ state: "error" }),
  dismiss: () => set({ state: "up-to-date", pendingUpdate: null, version: null }),
}));
