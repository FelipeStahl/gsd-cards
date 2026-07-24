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
import {
  killSession as killSessionProcess,
  listenForSessionExit,
  spawnSession,
  writeSession,
} from "../pty/channel";
import type { TerminalActivity } from "../pty/activity";
import { listSessions, type SessionSignal } from "../sessions/discover";
import { isValidSessionId } from "../sessions/id-format";
import { validateProjectRoot } from "../planning/read";
import { loadSnapshot, saveSnapshot } from "../persistence/session-snapshot";
import { notifyAwaiting, notifyExited } from "../notifications/notify";
import { i18n } from "../i18n";
import { useBoardStore } from "./board-store";
import {
  getPersistedSessions,
  setSessionName,
  upsertPersistedSession,
  type PersistedSessionEntry,
} from "../persistence/app-store";

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

export type SessionOrigin = "live" | "historical" | "restored";

/**
 * Uma sessão conhecida pelo store — `live` (criada nesta execução do app,
 * via `createSession`, OU retomada com sucesso via `resumeSession`),
 * `historical` (descoberta via `.jsonl` no disco, sem `PtySession` viva a
 * rastreá-la) ou `restored` (SESS-04, 04-06-PLAN.md: metadado persistido em
 * `app-state.json` de uma execução anterior, carregado por
 * `loadPersistedSessions` — igualmente sem `PtySession` viva até o usuário
 * clicar a row e `resumeSession` promovê-la para `live`). Nunca a mesma
 * sessão em mais de um grupo ao mesmo tempo — ver `mergeSessionDescriptors`.
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
  /**
   * Raiz do projeto dono desta sessão (PROJ-05, 04-05-PLAN.md) — populado em
   * TODO ponto de criação/descoberta (`createSession`, `createProjectSession`,
   * `mergeSessionDescriptors`). `SessionSidebar` filtra `sessions[]` por
   * `activeProjectRoot` usando este campo, corrigindo o bug pré-existente de
   * mistura de sessões entre projetos (04-RESEARCH.md Pitfall 1). Também
   * load-bearing para SESS-04 (04-06): `resumeSession` deve ler o `cwd` da
   * PRÓPRIA `projectRoot` persistida da sessão, nunca de `activeProjectRoot`.
   */
  projectRoot: string;
  /**
   * Nome customizado (SESS-05, 04-05-PLAN.md) — `undefined` até o usuário
   * renomear via `renameSession`. Quando ausente, todo consumidor do label
   * cai para o derivado `"Sessão " + id.slice(0,8)`. Persistido via
   * `app-store.ts` (`setSessionName`), nunca em `.planning/`.
   */
  name?: string;
  /**
   * `true` quando o evento global `pty:session-exited` (04-02) foi
   * observado para esta sessão (TERM-04, 04-07-PLAN.md) — o processo saiu
   * naturalmente, crashou, ou um `--resume` falhou (Pitfall 3 de
   * 04-RESEARCH.md, mesmo sinal). `undefined`/`false` até então. Nunca
   * rebaixa `origin` — uma sessão `live` que sai permanece `live` (02-UI-SPEC.md:
   * "exited-this-run" continua no grupo "Ativas" da sidebar, só com a
   * variante/dot visual mudando via `markExited`), nunca migra para
   * `historical`. Consumido por `SessionSidebar` (variant="exited") e pelo
   * badge de prioridade do `DrawerRail`.
   */
  exited?: boolean;
}

/**
 * Deriva o label de exibição de uma sessão (mesmo cálculo de
 * `SessionRow.tsx`'s `derivedLabel`) para as chamadas de `notifyAwaiting`/
 * `notifyExited` — nome customizado (SESS-05) se houver, senão
 * `"Sessão " + id.slice(0,8)` traduzido via `session.row.labelPrefix`. Único
 * ponto que resolve isso fora de um componente React (`notify.ts` recebe só
 * o label já pronto, nunca um `SessionDescriptor` cru).
 */
function deriveSessionLabel(session: SessionDescriptor): string {
  if (session.name) return session.name;
  const prefix = i18n.t("row.labelPrefix", { ns: "session" });
  return `${prefix} ${session.id.slice(0, 8)}`;
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
  /**
   * Cria uma sessão numa pasta CRUA, ainda sem `.planning/` (PROJ-03,
   * 04-RESEARCH.md Pattern 2) — caminho paralelo a `createSession`, NUNCA
   * uma variante dele: `createSession` recusa rodar sem
   * `useBoardStore.getState().project` já aberto/validado, exatamente o
   * portão que este fluxo precisa contornar (a pasta escolhida no diálogo
   * de "Novo projeto GSD" ainda não é um projeto GSD válido). Spawna com
   * `rawFolder` como `cwd` (sem `validateProjectRoot` prévio) e injeta
   * `/gsd-new-project\r` assim que o backend confirma o processo up.
   * Diferente de `createSession` (que só REGISTRA a sessão e deixa
   * `TerminalView` chamar `spawnSession` na montagem — nenhum
   * `TerminalView` monta na home), esta ação spawna o PTY ela mesma, já que
   * não há terminal montado enquanto `view === "home"`. Nunca chama
   * `openProject`/escreve `.planning/` — quem observa o `.planning/`
   * aparecer e chama `openProject(rawFolder)` é o caller
   * (`CreateProjectFlow`). Retorna o id da sessão criada.
   *
   * CR-02 fix (04-REVIEW.md): aceita um `onBytes` opcional encaminhado
   * verbatim a `spawnSession` — antes desta correção os bytes eram sempre
   * descartados (`onBytes: () => {}`), deixando o usuário sem nenhuma forma
   * de ver ou responder aos prompts interativos de `/gsd-new-project`.
   * `CreateProjectFlow` passa um handler que alimenta um mini-terminal
   * visível no próprio painel de progresso. Omitir o parâmetro preserva o
   * comportamento anterior (bytes descartados) para qualquer outro caller.
   */
  createProjectSession: (rawFolder: string, onBytes?: (data: Uint8Array) => void) => Promise<string>;
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
  /**
   * Carrega os metadados de sessão persistidos (SESS-04, 04-06-PLAN.md) de
   * `app-state.json` para `projectRoot` e faz merge incremental em
   * `sessions[]` como `origin:"restored"` — NUNCA spawna um `PtySession`
   * (a restauração é lazy: só `resumeSession` faz isso, sob clique
   * explícito do usuário). Uma sessão já conhecida (live/historical/
   * restored de uma chamada anterior) nunca é rebaixada/sobrescrita — mesma
   * disciplina de `mergeSessionDescriptors`. Nunca lança — degrada
   * silenciosamente se a leitura do disco falhar.
   */
  loadPersistedSessions: (projectRoot: string) => Promise<void>;
  /**
   * Retoma uma sessão histórica/restaurada (SESS-04) — o ÚNICO call site
   * que monta `["--resume", sessionId]` para `spawnSession`. Ordem
   * inegociável: (1) `isValidSessionId` — um id flag-shaped é recusado e
   * NUNCA alcança `spawnSession`/`invoke` (T-04-16, guarda de
   * flag-injection); (2) WR-01 fix (04-REVIEW.md): re-valida a `projectRoot`
   * PERSISTIDA da sessão via `validateProjectRoot` antes de usá-la como
   * cwd — nunca confia direto no valor lido de `app-state.json` (um arquivo
   * plaintext, localmente adulterável), mesmo portão que TODO outro
   * consumidor de project-root já passa (`openProject`, `switchProject`,
   * o health-check do `ProjectCard`); uma falha de validação recusa o
   * resume (nunca spawna) e surfaça o mesmo `toSessionError` usado em
   * qualquer outro caminho de erro deste store; (3) usa a raiz JÁ
   * VALIDADA/canonicalizada como cwd — nunca `activeProjectRoot`/o projeto
   * atualmente aberto (Pitfall 2 de 04-RESEARCH.md); (4) `loadSnapshot` do
   * disco e grava em `liveSession.serializedSnapshot` ANTES de
   * `activeSessionId` mudar — o único gatilho que faz `TerminalView`
   * montar/chamar `gainFocus` para esta sessão, garantindo por construção
   * que o snapshot já esteja disponível quando o check síncrono existente
   * de `gainFocus` (SESS-03/focus-algorithm.ts) o escreve no xterm
   * recém-montado, antes de qualquer byte real do `--resume` chegar
   * (backstop de 04-06-PLAN.md). Idempotente: uma sessão já viva nesta
   * execução só é refocada, nunca re-spawnada (e portanto nunca
   * re-validada — a validação já aconteceu na primeira vez que esta sessão
   * foi retomada com sucesso nesta execução).
   */
  resumeSession: (sessionId: string) => Promise<void>;
  /**
   * Persiste em disco o snapshot serializado de uma sessão ao perder foco
   * (SESS-04) — chamado por `TerminalView`/`focus-algorithm.ts`'s
   * `loseFocus`, estendendo o fluxo em memória do SESS-03 (nunca o
   * substituindo). Grava o snapshot em `session-<id>.json`
   * (`persistence/session-snapshot.ts`) e atualiza o metadado pequeno
   * (`id`, `projectRoot`, `name`, `lastActive`) em `app-state.json` — os
   * dois arquivos que `loadPersistedSessions`/`resumeSession` leem de
   * volta na próxima abertura do app. Fire-and-forget, mesma disciplina de
   * `renameSession`/`upsertRecent` — a UI nunca espera o disco, e um id
   * desconhecido (sessão já removida de `sessions[]`) é um no-op seguro.
   */
  persistSnapshot: (sessionId: string, snapshot: string) => void;
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
  /**
   * Renomeia uma sessão (SESS-05) — TRANSITION-GATED como `setActivity`: só
   * chama `set()` quando o nome efetivamente muda, no-op para um id
   * desconhecido. Nome vazio (após `trim()`) limpa `name` de volta para
   * `undefined`, fazendo o label cair para o derivado `Sessão <id8>`.
   * Persiste via `app-store.ts` (fire-and-forget, mesma disciplina de
   * `upsertRecent` em `board-store.ts`) — a UI nunca espera o disco.
   */
  renameSession: (sessionId: string, name: string) => void;
  /**
   * Marca uma sessão como `exited` (TERM-04, 04-07-PLAN.md) — chamado pelo
   * callback registrado por `wireSessionExitListener` abaixo.
   * TRANSITION-GATED como `setActivity`: no-op para um id desconhecido OU já
   * marcado como `exited` (o evento nunca deveria repetir para o mesmo id,
   * mas a guarda cobre defensivamente). Nunca rebaixa `origin` — só liga a
   * flag `exited`. Dispara `notifyExited` (fire-and-forget, degrade-silently
   * já garantido por `notify.ts`) com o label derivado da sessão.
   */
  markExited: (sessionId: string) => void;
  /**
   * Wireia (idempotentemente) o listener do evento global `pty:session-exited`
   * (04-02) para `markExited` acima (TERM-04, 04-07-PLAN.md). Chamado por
   * `SessionSidebar` a cada abertura/reabertura de projeto — NÃO um efeito
   * colateral de import do módulo (calling this eagerly at module-load broke
   * every test file that transitively imports `session-store.ts` without
   * mocking `../pty/channel`'s `listenForSessionExit`, incluindo suítes que
   * nunca renderizam sessão alguma). Nunca lança — degrada silenciosamente
   * fora de um contexto Tauri real (`.catch()` na implementação).
   */
  wireSessionExitListener: () => void;
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
  projectRoot: string,
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
      byId.set(signal.id, {
        id: signal.id,
        lastModified: signal.lastModified,
        origin: "historical",
        projectRoot,
      });
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
        state.sessions.push({ id: sessionId, lastModified: new Date(), origin: "live", projectRoot: root });
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

    createProjectSession: async (rawFolder: string, onBytes?: (data: Uint8Array) => void) => {
      const sessionId = crypto.randomUUID();

      try {
        await invoke("register_sessions_scope", { projectRoot: rawFolder });
      } catch {
        // Escopo de descoberta histórica não concedido (fora de um
        // contexto Tauri real, ou falha do backend) — não impede o spawn
        // em si, mesma disciplina defensiva de `discoverSessions`.
      }

      set((state) => {
        state.activeSessionId = sessionId;
        state.lastFocusedSessionId = sessionId;
        state.error = null;
        state.sessions.push({
          id: sessionId,
          lastModified: new Date(),
          origin: "live",
          projectRoot: rawFolder,
        });
      });

      // CR-01: mesma disciplina de `createSession` — atividade wireada para
      // a vida inteira da sessão, aqui na criação, independente de haver
      // algum `TerminalView` montado (não há, enquanto `view === "home"`).
      if (!activityStops.has(sessionId)) {
        activityStops.set(
          sessionId,
          wireTerminalActivity(sessionId, (activity) => {
            get().setActivity(sessionId, activity);
          }),
        );
      }

      // `rawFolder` NUNCA passou por `validateProjectRoot` — é exatamente o
      // ponto deste caminho paralelo (T-04-10: a pasta vem só do diálogo
      // OS-nativo, nunca digitada/construída, e chega aqui como argumento
      // de spawn, nunca concatenada numa string de shell).
      //
      // CR-02: `onBytes` (default no-op, preserva o comportamento anterior
      // para callers que não passam nada) — nunca mais um destino fixo
      // `() => {}` que descarta toda a conversa de `/gsd-new-project`.
      await spawnSession(sessionId, rawFolder, onBytes ?? (() => {}));
      await writeSession(sessionId, "/gsd-new-project\r");

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
        state.sessions = mergeSessionDescriptors(state.sessions, discovered, projectRoot);
      });
    },

    loadPersistedSessions: async (projectRoot: string) => {
      let persisted: PersistedSessionEntry[];
      try {
        persisted = await getPersistedSessions(projectRoot);
      } catch {
        // Falha de leitura do plugin-store (fora de um contexto Tauri real,
        // ou primeira execução sem app-state.json ainda) — degrada sem
        // sessões restauradas, mesma disciplina de `discoverSessions`.
        return;
      }

      if (persisted.length === 0) return;

      set((state) => {
        for (const entry of persisted) {
          // Uma sessão já conhecida (live desta execução, ou historical/
          // restored de uma chamada anterior) nunca é rebaixada/duplicada —
          // mesmo invariante de `mergeSessionDescriptors`.
          if (state.sessions.some((session) => session.id === entry.id)) continue;
          state.sessions.push({
            id: entry.id,
            lastModified: entry.lastActive ? new Date(entry.lastActive) : null,
            origin: "restored",
            projectRoot: entry.projectRoot,
            name: entry.name,
          });
        }
      });
    },

    resumeSession: async (sessionId: string) => {
      // T-04-16: valida o FORMATO do id antes de qualquer outra coisa —
      // inclusive antes de procurar a sessão em `sessions[]` — para que a
      // recusa nunca dependa de o descriptor existir ou não. Um id
      // flag-shaped nunca alcança `spawnSession`/`invoke`.
      if (!isValidSessionId(sessionId)) {
        set((state) => {
          state.error = toSessionError(
            new Error(`Recusando --resume: id de sessão em formato inesperado (${sessionId})`),
          );
        });
        return;
      }

      const session = get().sessions.find((candidate) => candidate.id === sessionId);
      if (!session) {
        set((state) => {
          state.error = toSessionError(new Error(`Sessão desconhecida: ${sessionId}`));
        });
        return;
      }

      if (get().hasLiveSession(sessionId)) {
        // Já retomada/viva nesta execução (re-clique numa row já em
        // "starting"/já ativa, ou o call site de segurança em
        // `TerminalView` caindo aqui depois do clique já ter disparado
        // tudo) — só refoca, nunca spawna de novo.
        set((state) => {
          state.activeSessionId = sessionId;
          state.lastFocusedSessionId = sessionId;
        });
        return;
      }

      // WR-01 fix: `session.projectRoot` é lido de `app-state.json`
      // (`origin: "restored"`) — um arquivo plaintext, adulterável
      // localmente. Toda outra rota de entrada de project-root neste app
      // (`openProject`, `switchProject`, o health-check do `ProjectCard`)
      // já passa por `validateProjectRoot` antes de usar o valor; esta era
      // a única exceção. Uma falha aqui recusa o resume ANTES de qualquer
      // outro efeito colateral (wiring de atividade, snapshot, spawn) —
      // nunca spawna com um `cwd` não revalidado.
      let validatedRoot: string;
      try {
        validatedRoot = (await validateProjectRoot(session.projectRoot)).root;
      } catch (error) {
        set((state) => {
          state.error = toSessionError(error);
        });
        return;
      }

      set((state) => {
        state.error = null;
      });

      if (!activityStops.has(sessionId)) {
        activityStops.set(
          sessionId,
          wireTerminalActivity(sessionId, (activity) => {
            get().setActivity(sessionId, activity);
          }),
        );
      }

      // Registra o LiveSessionState (idempotência acima) e carrega o
      // snapshot ANTES de `activeSessionId` mudar abaixo — `activeSessionId`
      // é o ÚNICO gatilho que faz `TerminalView` montar/chamar `gainFocus`
      // para esta sessão, então por construção o snapshot já está
      // disponível quando o check síncrono existente de `gainFocus`
      // (SESS-03/focus-algorithm.ts) o escreve no xterm recém-montado —
      // nunca uma corrida com os bytes reais do `--resume`, que só chegam
      // depois de um round-trip de IPC real (spawnSession abaixo), ordens
      // de magnitude mais lento que este `set()` síncrono.
      const liveSession = get().getOrCreateLiveSession(sessionId);
      const snapshot = await loadSnapshot(sessionId).catch(() => null);
      if (snapshot !== null) {
        liveSession.serializedSnapshot = snapshot;
      }

      set((state) => {
        state.activeSessionId = sessionId;
        state.lastFocusedSessionId = sessionId;
      });

      // Pitfall 2 (04-RESEARCH.md): usa a raiz da PRÓPRIA sessão — NUNCA
      // `activeProjectRoot`/o projeto atualmente aberto, que pode ser um
      // projeto diferente do dono desta sessão (PROJ-05 mantém múltiplos
      // projetos abertos ao mesmo tempo). `validatedRoot` (WR-01, acima) é a
      // raiz JÁ canonicalizada/validada — nunca o `session.projectRoot` cru
      // lido de `app-state.json`. `origin` permanece "historical"/"restored"
      // durante este await — a sessão renderiza `variant="starting"`
      // (pulse, 04-UI-SPEC.md ## Color) na row já ativa até o spawn
      // resolver, mesmo tratamento visual de "starting" que uma sessão nova
      // recebe.
      await spawnSession(sessionId, validatedRoot, () => {}, ["--resume", sessionId]);

      set((state) => {
        // Uma sessão retomada com sucesso passa a ter um PtySession vivo de
        // verdade — nunca mais "historical"/"restored" (ambos significam
        // exatamente "sem PtySession viva"), promovida para "live" como
        // qualquer sessão criada nesta execução.
        const descriptor = state.sessions.find((candidate) => candidate.id === sessionId);
        if (descriptor) descriptor.origin = "live";
      });
    },

    persistSnapshot: (sessionId: string, snapshot: string) => {
      const session = get().sessions.find((candidate) => candidate.id === sessionId);
      // Sessão já removida de `sessions[]` (arquivada/excluída) entre o
      // agendamento do lose-focus e este callback rodar — no-op seguro,
      // nunca persiste um snapshot órfão sem `projectRoot` para escopá-lo.
      if (!session) return;

      void saveSnapshot(sessionId, snapshot).catch(() => {
        // Persistência é conveniência (sobrevive a reaberturas), nunca a
        // fonte de verdade em memória desta execução — mesma disciplina de
        // `renameSession`.
      });
      void upsertPersistedSession({
        id: sessionId,
        projectRoot: session.projectRoot,
        name: session.name,
        lastActive: new Date().toISOString(),
      }).catch(() => {});
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

      // TERM-04 (04-07-PLAN.md): dispara o toast do SO exatamente na
      // TRANSIÇÃO idle/busy->awaiting — o guard acima (`current.activity ===
      // activity`) já garante que isto só roda uma vez por transição, nunca
      // por byte repetido enquanto a sessão permanece awaiting. Nenhum
      // debounce extra é necessário (04-CONTEXT.md Claude's Discretion,
      // resolvido em 04-07-PLAN.md `planner_assumptions`). Fire-and-forget —
      // `notify.ts` já degrada silenciosamente, nunca lança aqui.
      if (activity === "awaiting") {
        void notifyAwaiting(deriveSessionLabel(current));
      }
    },

    markExited: (sessionId: string) => {
      const current = get().sessions.find((session) => session.id === sessionId);
      // No-op para um id desconhecido OU já marcado como exited — mesma
      // disciplina TRANSITION-GATED de setActivity acima.
      if (!current || current.exited) return;

      set((state) => {
        const descriptor = state.sessions.find((session) => session.id === sessionId);
        if (descriptor) descriptor.exited = true;
      });

      // Fire-and-forget, mesma disciplina de notifyAwaiting acima — o badge
      // em app (já atualizado pelo set() acima) é o contrato durável,
      // independente do resultado desta chamada.
      void notifyExited(deriveSessionLabel(current));
    },

    renameSession: (sessionId: string, name: string) => {
      const current = get().sessions.find((session) => session.id === sessionId);
      if (!current) return;

      const trimmed = name.trim();
      const nextName = trimmed.length > 0 ? trimmed : undefined;
      // No-op se o id não existir OU se o nome não mudou — mesma disciplina
      // TRANSITION-GATED de `setActivity` acima.
      if (current.name === nextName) return;

      set((state) => {
        const descriptor = state.sessions.find((session) => session.id === sessionId);
        if (descriptor) descriptor.name = nextName;
      });

      // Fire-and-forget: a UI já refletiu o novo nome via `set()` acima, o
      // disco nunca bloqueia a resposta visual (mesma disciplina de
      // `upsertRecent` em `board-store.ts`). Falha ao persistir não reverte
      // o nome já aplicado em memória.
      void setSessionName(sessionId, nextName ?? "").catch(() => {
        // Persistência é conveniência (sobrevive a reaberturas), nunca a
        // fonte de verdade em memória desta execução.
      });
    },

    wireSessionExitListener: () => {
      // TERM-04 (04-07-PLAN.md): roteia o evento global `pty:session-exited`
      // (04-02) para `markExited`, independente de qual `projectRoot` a
      // sessão pertence (o sessionId sozinho já basta para localizar o
      // descriptor em `sessions[]`). Chamado por `SessionSidebar` no MESMO
      // `useEffect` que já dispara `discoverSessions`/`loadPersistedSessions`
      // a cada abertura/reabertura de projeto ("wire ... once at store
      // init/project-open"). `channel.ts::listenForSessionExit` já derruba
      // qualquer listener anterior antes de registrar um novo (mesma
      // disciplina de `watch.ts::startWatching`), então chamar isto de novo
      // a cada projeto aberto só re-registra o mesmo callback, nunca
      // acumula assinaturas duplicadas — nenhuma guarda extra é necessária
      // aqui. `.catch()` degrada silenciosamente fora de um contexto Tauri
      // real (mesma disciplina de `discoverSessions`/`checkClaudeOnPath`).
      void listenForSessionExit((sessionId) => {
        get().markExited(sessionId);
      }).catch(() => {});
    },
  })),
);
