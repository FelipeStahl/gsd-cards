// Estado zustand mínimo do ciclo de vida de sessões (Fase 2, Plano 01 —
// tracer). Só o necessário para o slice fim-a-fim: gerar um id, marcar a
// sessão ativa (o que faz o `DrawerRail` expandir e montar `TerminalView`),
// e encerrar (kill de árvore, via `channel.ts`). Nenhuma lógica de
// descoberta de sessões históricas, foco/background ou persistência ainda —
// isso chega nos Planos 03/04/06.

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { killSession as killSessionProcess } from "../pty/channel";
import { useBoardStore } from "./board-store";

export type SessionErrorKind = "AlreadyExists" | "NotFound" | "Spawn" | "Io" | "Unknown";

export interface SessionError {
  kind: SessionErrorKind;
  message: string;
}

interface SessionStoreState {
  /** Sessão atualmente exibida no drawer expandido — `null` = drawer recolhido. */
  activeSessionId: string | null;
  error: SessionError | null;
  /** Gera um novo id de sessão e o marca como ativo. Retorna `null` (sem criar nada) se nenhum projeto está aberto. */
  createSession: () => string | null;
  /** Mata a árvore de processos da sessão e limpa `activeSessionId` se for a sessão ativa. */
  killSession: (sessionId: string) => Promise<void>;
  setError: (error: SessionError | null) => void;
}

/** Normaliza qualquer erro (tagged `{ kind, message }` vindo do Rust, ou um `Error`/valor desconhecido) para `SessionError`. Mesmo padrão de `toStoreError` em `board-store.ts`. */
export function toSessionError(error: unknown): SessionError {
  if (typeof error === "object" && error !== null && "kind" in error && "message" in error) {
    const candidate = error as { kind: unknown; message: unknown };
    if (typeof candidate.kind === "string" && typeof candidate.message === "string") {
      return { kind: candidate.kind as SessionErrorKind, message: candidate.message };
    }
  }
  return { kind: "Unknown", message: String(error) };
}

export const useSessionStore = create<SessionStoreState>()(
  immer((set) => ({
    activeSessionId: null,
    error: null,

    createSession: () => {
      const root = useBoardStore.getState().project?.root;
      if (!root) {
        set((state) => {
          state.error = toSessionError(
            new Error("Nenhum projeto aberto — não é possível criar uma sessão"),
          );
        });
        return null;
      }

      const sessionId = crypto.randomUUID();
      set((state) => {
        state.activeSessionId = sessionId;
        state.error = null;
      });
      return sessionId;
    },

    killSession: async (sessionId: string) => {
      await killSessionProcess(sessionId);
      set((state) => {
        if (state.activeSessionId === sessionId) {
          state.activeSessionId = null;
        }
      });
    },

    setError: (error: SessionError | null) => {
      set((state) => {
        state.error = error;
      });
    },
  })),
);
