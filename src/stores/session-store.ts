// Estado zustand do ciclo de vida de sessões (Fase 2). Plano 01 (tracer)
// trouxe só `activeSessionId`/`createSession`/`killSession`, o suficiente
// para o slice fim-a-fim. Plano 04 adicionou a descoberta de sessões
// históricas (SESS-01): `sessions[]` (vivas desta execução + descobertas em
// `~/.claude/projects/<encoded>/*.jsonl`), merge incremental via
// `discoverSessions`, e `focusSession`/`lastFocusedSessionId` para a
// SessionSidebar selecionar uma linha viva existente sem criar uma nova.
// Este plano (06) adiciona `liveSessions` (SESS-03: estado de
// foco/background por sessão — snapshot serializado + buffer de bytes
// recebidos enquanto sem instância montada — consumido pelo algoritmo de
// foco de `focus-algorithm.ts` a partir de `TerminalView.tsx`) e
// `archiveSession` (SESS-06: arquivar/excluir matam a árvore de processos e
// removem a row desta execução, sem nunca tocar o `.jsonl` de histórico do
// Claude Code — Pitfall 5 de `02-RESEARCH.md`).

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { invoke } from "@tauri-apps/api/core";

import { createLiveSessionState, type LiveSessionState } from "../components/terminal/focus-algorithm";
import { wireTerminalActivity } from "../components/terminal/useTerminalActivity";
import { killSession as killSessionProcess } from "../pty/channel";
import type { TerminalActivity } from "../pty/activity";
import { listSessions, type SessionSignal } from "../sessions/discover";
import { useBoardStore } from "./board-store";

/**
 * Estado de foco/background por sessão (SESS-03) — `serializedSnapshot` +
 * `backgroundBuffer` + `hasWebgl`, consumido por `loseFocus`/`gainFocus`
 * (`focus-algorithm.ts`) a partir de `TerminalView.tsx`.
 *
 * Deliberadamente um `Map` de módulo, FORA do shape reativo gerenciado por
 * `immer`/zustand: o middleware `immer` congela recursivamente TODO o
 * resultado de cada `set()` quando `autoFreeze` está ativo (o padrão) —
 * mesmo campos que aquele produtor específico nunca tocou. Um `Map`
 * alcançável a partir do estado da store ficaria permanentemente congelado
 * (`Object.freeze` é irreversível) assim que QUALQUER outra ação da store
 * chamasse `set()` uma única vez, impedindo `.set()`/`.delete()` futuros
 * neste Map mesmo fora de um producer — confirmado experimentalmente
 * durante a execução deste plano. Mantê-lo aqui fora, mutado diretamente,
 * resolve isso e é também o design pretendido: bytes de uma sessão em
 * background chegam em alta frequência e nunca devem disparar uma
 * transição reativa do zustand — nada na UI precisa saber, em tempo real,
 * que um byte chegou a uma sessão que ninguém está olhando.
 */
const liveSessions = new Map<string, LiveSessionState>();

/**
 * CR-01 fix: cleanup functions returned by `wireTerminalActivity`, keyed by
 * session id — module-level, same rationale as `liveSessions` above (no
 * immer-frozen shape). Activity classification is wired ONCE per live
 * session, right here at `createSession` time, and ONLY stopped on
 * `killSession`/`archiveSession` (true end-of-life). It must NEVER be tied
 * to whether/which `TerminalView` happens to be mounted — a session that
 * loses focus, or a collapsed drawer's `lastFocusedSessionId` fallback
 * target, must keep being classified so the busy-injection guard
 * (`resolveInjection`) never goes stale for `PhaseCardAction`/
 * `GsdCommandToolbar`/`CommandPalette`.
 */
const activityStops = new Map<string, () => void>();

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
  /**
   * Estado de atividade do terminal ao vivo (ACT-03) — `idle`/`busy`/
   * `awaiting`, populado por `wireTerminalActivity` via `setActivity`
   * abaixo. `undefined` até a primeira classificação (sessão histórica
   * nunca recebe este campo — nunca tem `PtySession` viva a observar).
   */
  activity?: TerminalActivity;
}

interface SessionStoreState {
  /** Sessão atualmente exibida no drawer expandido — `null` = drawer recolhido. */
  activeSessionId: string | null;
  /** Última sessão que teve foco nesta execução — usado pelo `DrawerRail` para reexpandir ao clicar o rail recolhido. */
  lastFocusedSessionId: string | null;
  /** Sessões conhecidas (vivas desta execução + descobertas em disco), sem duplicidade por id. */
  sessions: SessionDescriptor[];
  /** Retorna (criando se necessário) o `LiveSessionState` de uma sessão (`liveSessions`, ver a nota acima) — chamado por `TerminalView` a cada troca de foco. */
  getOrCreateLiveSession: (sessionId: string) => LiveSessionState;
  /** `true` se a sessão já tem um `LiveSessionState` registrado (já foi focada/spawnada ao menos uma vez nesta execução) — usado por `TerminalView` para decidir se `spawnSession` precisa ser chamado (sessão nova) ou só o redirecionamento de foco (sessão já viva, regressando de background). */
  hasLiveSession: (sessionId: string) => boolean;
  /** Remove o `LiveSessionState` de uma sessão definitivamente encerrada (kill/archive/delete) — evita vazar um `backgroundBuffer` de uma sessão morta (T-02-02). */
  clearLiveSession: (sessionId: string) => void;
  error: SessionError | null;
  /** Gera um novo id de sessão, marca como ativa/focada e a registra em `sessions[]` como `live`. Retorna `null` (sem criar nada) se nenhum projeto está aberto. */
  createSession: () => string | null;
  /** Marca uma sessão EXISTENTE (linha viva da sidebar) como ativa/focada — não cria nada novo. */
  focusSession: (sessionId: string) => void;
  /** Mata a árvore de processos da sessão e limpa `activeSessionId` se for a sessão ativa. Não remove a sessão de `sessions[]` — ver `archiveSession` para a ação de ciclo de vida (SESS-06). */
  killSession: (sessionId: string) => Promise<void>;
  /**
   * Arquivar/Excluir (SESS-06) — mesma ação para as duas, só a confirmação
   * de UI difere (`SessionRow`/`ConfirmDialog`): mata a árvore de
   * processos se viva, remove a row de `sessions[]` desta execução, e
   * limpa o `LiveSessionState` correspondente. Nunca toca o `.jsonl` de
   * histórico do Claude Code (Pitfall 5) — nenhuma chamada de filesystem
   * acontece aqui, só o kill do processo + atualização de estado local.
   */
  archiveSession: (sessionId: string) => Promise<void>;
  /**
   * Descobre sessões históricas em `~/.claude/projects/<encoded>/` (SESS-01)
   * e faz merge incremental em `sessions[]`, num único `set()`. Nunca
   * lança — degrada silenciosamente (mesma disciplina defensiva de
   * `sessions/discover.ts`) quando `register_sessions_scope` falha (fora de
   * um contexto Tauri real, ou projeto sem `.claude/projects/` ainda).
   */
  discoverSessions: (projectRoot: string) => Promise<void>;
  setError: (error: SessionError | null) => void;
  /**
   * Atualiza `SessionDescriptor.activity` (ACT-03) — TRANSITION-GATED: só
   * chama `set()` quando o valor efetivamente muda, nunca por byte
   * recebido. Preserva o invariante "bytes de sessão em background nunca
   * disparam re-render" (Fase 2, `liveSessions` fora do shape immer) mesmo
   * agora que todo byte de toda sessão viva passa por um consumidor
   * sempre-ativo (`activityHandlers`, `channel.ts`). No-op silencioso se o
   * id não existir em `sessions[]` (sessão já encerrada/nunca registrada).
   */
  setActivity: (sessionId: string, activity: TerminalActivity) => void;
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
  immer((set, get) => ({
    activeSessionId: null,
    lastFocusedSessionId: null,
    sessions: [],
    error: null,

    getOrCreateLiveSession: (sessionId: string) => {
      const existing = liveSessions.get(sessionId);
      if (existing) return existing;
      const created = createLiveSessionState();
      liveSessions.set(sessionId, created);
      return created;
    },

    hasLiveSession: (sessionId: string) => liveSessions.has(sessionId),

    clearLiveSession: (sessionId: string) => {
      liveSessions.delete(sessionId);
    },

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

      // CR-01: wire ACT-03 activity classification for the FULL lifetime of
      // this live session, right here at creation — independent of whether
      // any `TerminalView` ever mounts for it. `wireTerminalActivity`
      // registers against `channel.ts`'s always-active `activityHandlers`
      // map, so bytes are classified even while the session sits in the
      // background or the drawer is collapsed.
      if (!activityStops.has(sessionId)) {
        activityStops.set(
          sessionId,
          wireTerminalActivity(sessionId, (activity) => {
            get().setActivity(sessionId, activity);
          }),
        );
      }

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
      // CR-01: true end-of-life for the session — stop the activity wiring
      // registered by `createSession` (never on a mere focus/session-switch,
      // that's the whole point of decoupling it from `TerminalView`).
      activityStops.get(sessionId)?.();
      activityStops.delete(sessionId);
      set((state) => {
        if (state.activeSessionId === sessionId) {
          state.activeSessionId = null;
        }
      });
    },

    archiveSession: async (sessionId: string) => {
      await killSessionProcess(sessionId);
      // CR-01: same teardown discipline as killSession above.
      activityStops.get(sessionId)?.();
      activityStops.delete(sessionId);
      set((state) => {
        if (state.activeSessionId === sessionId) {
          state.activeSessionId = null;
        }
        if (state.lastFocusedSessionId === sessionId) {
          state.lastFocusedSessionId = null;
        }
        state.sessions = state.sessions.filter((session) => session.id !== sessionId);
      });
      get().clearLiveSession(sessionId);
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

    setActivity: (sessionId: string, activity: TerminalActivity) => {
      const current = get().sessions.find((session) => session.id === sessionId);
      // No-op se a sessão não existe OU se o valor não mudou — nenhuma das
      // duas condições deve produzir uma transição reativa do zustand.
      if (!current || current.activity === activity) return;
      set((state) => {
        const descriptor = state.sessions.find((session) => session.id === sessionId);
        if (descriptor) descriptor.activity = activity;
      });
    },
  })),
);
