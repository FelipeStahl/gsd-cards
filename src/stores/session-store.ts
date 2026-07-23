// Estado zustand do ciclo de vida de sessões (Fase 2). Plano 01 (tracer)
// trouxe só `activeSessionId`/`createSession`/`killSession`, o suficiente
// para o slice fim-a-fim. Este plano (04) adiciona a descoberta de sessões
// históricas (SESS-01): `sessions[]` (vivas desta execução + descobertas em
// `~/.claude/projects/<encoded>/*.jsonl`), merge incremental via
// `discoverSessions`, e `focusSession`/`lastFocusedSessionId` para a
// SessionSidebar selecionar uma linha viva existente sem criar uma nova.
// Foco/background (SESS-03) e persistência de status starting/exited
// (ciclo de vida do PTY) chegam no Plano 06.

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { invoke } from "@tauri-apps/api/core";

import { killSession as killSessionProcess } from "../pty/channel";
import { listSessions, type SessionSignal } from "../sessions/discover";
import { useBoardStore } from "./board-store";

export type SessionErrorKind = "AlreadyExists" | "NotFound" | "Spawn" | "Io" | "Unknown";

export interface SessionError {
  kind: SessionErrorKind;
  message: string;
}

export type SessionOrigin = "live" | "historical";

/**
 * Uma sessão conhecida pelo store — `live` (criada nesta execução do app,
 * via `createSession`) ou `historical` (descoberta via `.jsonl` no disco,
 * sem `PtySession` viva a rastreá-la). Nunca a mesma sessão em ambos os
 * grupos ao mesmo tempo — ver `mergeSessionDescriptors`.
 */
export interface SessionDescriptor {
  id: string;
  lastModified: Date | null;
  origin: SessionOrigin;
}

interface SessionStoreState {
  /** Sessão atualmente exibida no drawer expandido — `null` = drawer recolhido. */
  activeSessionId: string | null;
  /** Última sessão que teve foco nesta execução — usado pelo `DrawerRail` para reexpandir ao clicar o rail recolhido. */
  lastFocusedSessionId: string | null;
  /** Sessões conhecidas (vivas desta execução + descobertas em disco), sem duplicidade por id. */
  sessions: SessionDescriptor[];
  error: SessionError | null;
  /** Gera um novo id de sessão, marca como ativa/focada e a registra em `sessions[]` como `live`. Retorna `null` (sem criar nada) se nenhum projeto está aberto. */
  createSession: () => string | null;
  /** Marca uma sessão EXISTENTE (linha viva da sidebar) como ativa/focada — não cria nada novo. */
  focusSession: (sessionId: string) => void;
  /** Mata a árvore de processos da sessão e limpa `activeSessionId` se for a sessão ativa. */
  killSession: (sessionId: string) => Promise<void>;
  /**
   * Descobre sessões históricas em `~/.claude/projects/<encoded>/` (SESS-01)
   * e faz merge incremental em `sessions[]`, num único `set()`. Nunca
   * lança — degrada silenciosamente (mesma disciplina defensiva de
   * `sessions/discover.ts`) quando `register_sessions_scope` falha (fora de
   * um contexto Tauri real, ou projeto sem `.claude/projects/` ainda).
   */
  discoverSessions: (projectRoot: string) => Promise<void>;
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

/**
 * Mescla os sinais recém-descobertos (`SessionSignal[]`, de `discover.ts`)
 * sobre o array `sessions[]` já existente, por id — nunca rebaixa uma
 * sessão já rastreada como `live` para `historical` só porque o `.jsonl`
 * correspondente também foi descoberto no disco (o `.jsonl` de uma sessão
 * viva criada nesta execução aparece no disco assim que o Claude Code
 * escreve nele). Uma sessão nova (nunca vista) entra como `historical`.
 * Mesmo padrão de `mergePhaseModels` em `board-store.ts`.
 */
function mergeSessionDescriptors(
  existing: SessionDescriptor[],
  discovered: SessionSignal[],
): SessionDescriptor[] {
  const byId = new Map<string, SessionDescriptor>();
  for (const session of existing) {
    byId.set(session.id, session);
  }

  for (const signal of discovered) {
    const previous = byId.get(signal.id);
    if (previous) {
      byId.set(signal.id, { ...previous, lastModified: signal.lastModified });
    } else {
      byId.set(signal.id, { id: signal.id, lastModified: signal.lastModified, origin: "historical" });
    }
  }

  return Array.from(byId.values());
}

export const useSessionStore = create<SessionStoreState>()(
  immer((set) => ({
    activeSessionId: null,
    lastFocusedSessionId: null,
    sessions: [],
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
        state.lastFocusedSessionId = sessionId;
        state.error = null;
        state.sessions.push({ id: sessionId, lastModified: new Date(), origin: "live" });
      });
      return sessionId;
    },

    focusSession: (sessionId: string) => {
      set((state) => {
        state.activeSessionId = sessionId;
        state.lastFocusedSessionId = sessionId;
      });
    },

    killSession: async (sessionId: string) => {
      await killSessionProcess(sessionId);
      set((state) => {
        if (state.activeSessionId === sessionId) {
          state.activeSessionId = null;
        }
      });
    },

    discoverSessions: async (projectRoot: string) => {
      let encodedDir: string;
      try {
        encodedDir = await invoke<string>("register_sessions_scope", { projectRoot });
      } catch {
        // Sem escopo concedido (fora de um contexto Tauri real, ou falha do
        // backend) — degrada sem sessões históricas, nunca lança (mesma
        // disciplina de `discover.ts`/`phase-scan.ts`).
        return;
      }

      const discovered = await listSessions(encodedDir);
      set((state) => {
        state.sessions = mergeSessionDescriptors(state.sessions, discovered);
      });
    },

    setError: (error: SessionError | null) => {
      set((state) => {
        state.error = error;
      });
    },
  })),
);
