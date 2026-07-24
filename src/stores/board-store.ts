// Estado zustand do projeto aberto — espelho puro do `.planning/` do
// filesystem. Este store NUNCA escreve no disco (Pattern 4 da pesquisa e
// decisão de produto do PROJECT.md: "GSD permanece a fonte da verdade").

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import {
  listPlanningDir,
  readPlanningText,
  validateProjectRoot,
  type ProjectOpenErrorKind,
} from "../planning/read";
import { milestonesIndexPath, phasesDir, planningDir, roadmapPath, statePath } from "../planning/paths";
import { parseStateFile } from "../planning/parser/state";
import { parseRoadmap, type RoadmapModel } from "../planning/parser/roadmap";
import {
  parseMilestonesIndex,
  scanArchivedMilestones,
  type ArchivedMilestone,
  type MilestoneIndexEntry,
} from "../planning/parser/milestones";
import {
  parsePhaseDirName,
  scanAllPhases,
  scanPhaseDir,
  type PhaseScanEntry,
} from "../planning/phase-scan";
import {
  deriveDiskStatus,
  toBoardBadge,
  toBoardColumn,
  type BoardColumnId,
  type PhaseDirSignals,
} from "../planning/status";
import { unrecognized, type ParseIssue } from "../planning/parse-result";
import { classifyChangedPath, startWatching, stopWatching } from "../planning/watch";
import type {
  MilestoneHistoryEntry,
  PhaseBlocker,
  PhaseModel,
  ProjectStateModel,
} from "../planning/model";
import { upsertRecent } from "../persistence/app-store";

export type BoardStatus = "idle" | "opening" | "open" | "error";

/** Qual tela o `AppShell` renderiza (04-01-PLAN.md Pattern 1) — nunca um
 * router: home é um ramo de renderização condicional, não uma rota. Default
 * `"board"` para que os fluxos single-project pré-existentes (Fases 1-3)
 * continuem exatamente como antes; `openProject` bem-sucedido garante
 * `"board"` explicitamente. */
export type BoardView = "home" | "board";

export interface ProjectStoreError {
  kind: ProjectOpenErrorKind | "TooLarge";
  message: string;
}

/** Saúde do file watcher (D-14, D-16) — nunca finge estar vivo enquanto degradado. */
export interface SyncState {
  state: "idle" | "healthy" | "degraded";
  lastSyncedAt: number | null;
  degradedSince: number | null;
  reason: string | null;
}

interface BoardStoreState {
  status: BoardStatus;
  project: ProjectStateModel | null;
  error: ProjectStoreError | null;
  /** Ids de fase com glow de atualização em tempo real (D-13), limpos automaticamente após a janela do glow. */
  recentlyUpdatedPhaseIds: string[];
  /** Saúde do file watcher (D-16). */
  sync: SyncState;
  /** Tela ativa (04-01-PLAN.md) — `"home"` renderiza a lista de recentes, `"board"` o shell existente. */
  view: BoardView;
  /** Raízes de todos os projetos já abertos nesta execução (04-03-PLAN.md, PROJ-05) — nenhuma sessão de nenhum projeto listado aqui é derrubada ao trocar o ativo. */
  openProjectRoots: string[];
  /** Raiz do projeto atualmente ativo (board exibido) — `null` só antes do primeiro `openProject`. */
  activeProjectRoot: string | null;
  setView: (view: BoardView) => void;
  openProject: (root: string) => Promise<void>;
  closeProject: () => void;
  /**
   * Troca o projeto ativo entre projetos JÁ ABERTOS (04-03-PLAN.md Pattern 3,
   * single-watcher re-sync — decisão nomeada em 04-RESEARCH.md: NUNCA
   * reescrever `WatcherState` num `HashMap` por projeto). Para de observar o
   * watcher único, re-executa a mesma sequência de parse que `openProject`
   * roda para `root` (validate → STATE.md → ROADMAP.md → varredura de fases),
   * e reinicia o watcher já apontando para a nova raiz ativa. NUNCA toca
   * `sessions`/`liveSessions` (vivem em `session-store.ts`, module-level Map,
   * intocado por este store) e NUNCA chama `closeProject` — trocar de projeto
   * não mata sessão nenhuma de projeto nenhum.
   */
  switchProject: (root: string) => Promise<void>;
  /** Aplica um lote de caminhos alterados (evento `planning:changed`) em uma única transição de estado. */
  reprocessPaths: (paths: string[]) => Promise<void>;
  markSyncHealthy: (timestamp: number) => void;
  markSyncDegraded: (reason: string) => void;
  reconnectWatcher: () => Promise<void>;
}

function deriveProjectName(root: string): string {
  const segments = root.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? root;
}

function emptyMilestones(): MilestoneHistoryEntry[] {
  return [];
}

/**
 * Cruza os milestones arquivados (`scanArchivedMilestones` — fonte primária
 * de exibição da faixa de histórico) com o índice `.planning/MILESTONES.md`
 * (`parseMilestonesIndex` — só contribui nome/data de envio, quando
 * disponíveis). Uma versão arquivada sem entrada correspondente no índice
 * ainda aparece na faixa, apenas com `name`/`shippedDate` nulos.
 */
function mergeMilestoneHistory(
  index: MilestoneIndexEntry[],
  archived: ArchivedMilestone[],
): MilestoneHistoryEntry[] {
  const indexByVersion = new Map<string, MilestoneIndexEntry>();
  for (const entry of index) {
    if (entry.version.kind === "ok") {
      indexByVersion.set(entry.version.value, entry);
    }
  }

  return archived.map((milestone) => {
    const indexEntry = indexByVersion.get(milestone.version);
    return {
      ...milestone,
      name: indexEntry?.name.kind === "ok" ? indexEntry.name.value : null,
      shippedDate: indexEntry?.shippedDate.kind === "ok" ? indexEntry.shippedDate.value : null,
    };
  });
}

/**
 * Carrega o histórico de milestones (Plano 06, D-08) para uma raiz de
 * projeto já validada. Nunca lança: ausência de `.planning/milestones/`
 * (`scanArchivedMilestones` já degrada para `[]`) ou de `.planning/MILESTONES.md`
 * (capturado aqui) produzem histórico vazio, não erro — o mesmo padrão de
 * `loadRoadmapModel` (D-15).
 */
async function loadMilestoneHistory(root: string): Promise<MilestoneHistoryEntry[]> {
  const archived = await scanArchivedMilestones(root);

  let index: MilestoneIndexEntry[] = [];
  try {
    const indexPath = milestonesIndexPath(root);
    const raw = await readPlanningText(indexPath);
    const result = parseMilestonesIndex(raw, indexPath);
    if (result.kind === "ok") index = result.value;
  } catch {
    // MILESTONES.md ausente ou ilegível — a faixa de histórico segue
    // funcionando só com os dados de `scanArchivedMilestones`.
  }

  return mergeMilestoneHistory(index, archived);
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
 * Sequência completa de parse de um projeto já validado (STATE.md →
 * ROADMAP.md → varredura de fases → `ProjectStateModel`) — compartilhada por
 * `openProject` e `switchProject` (04-03-PLAN.md Pattern 3) para que a troca
 * de projeto ativo reutilize exatamente o mesmo caminho de código já testado
 * pela abertura normal, em vez de duplicar/divergir a lógica de parse.
 */
async function loadProjectStateModel(
  root: string,
  hasGsdCore: boolean,
): Promise<ProjectStateModel> {
  const projectStatePath = statePath(root);
  const rawState = await readPlanningText(projectStatePath);
  const parsedState = parseStateFile(rawState, projectStatePath);
  const projectName = deriveProjectName(root);

  const roadmapModel = await loadRoadmapModel(root);
  const scannedPhases = await scanAllPhases(root);
  const blockers = parsedState.kind === "ok" ? parsedState.value.blockers : [];
  const phases = buildPhaseModels(roadmapModel, scannedPhases, blockers);

  if (parsedState.kind === "unrecognized") {
    return {
      root,
      projectName,
      milestone: unrecognized(parsedState.issues, parsedState.raw),
      currentPhase: unrecognized(parsedState.issues),
      currentPhaseName: unrecognized(parsedState.issues),
      progress: unrecognized(parsedState.issues),
      blockers: [],
      phases,
      milestones: emptyMilestones(),
      issues: parsedState.issues,
      hasGsdCore,
    };
  }

  const parsed = parsedState.value;
  return {
    root,
    projectName,
    milestone: parsed.milestone,
    currentPhase: parsed.currentPhase,
    currentPhaseName: parsed.currentPhaseName,
    progress: parsed.progress,
    blockers: parsed.blockers,
    phases,
    milestones: emptyMilestones(),
    issues: parsed.issues,
    hasGsdCore,
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

/**
 * Varre só os diretórios de fase cujo número está em `numbers` —
 * reprocessamento incremental (Plano 04): um lote restrito à fase `02` nunca
 * chama `scanPhaseDir` para o diretório da fase `01`. `listPlanningDir(dir)`
 * ainda lista o diretório pai `.planning/phases/` inteiro (operação barata,
 * só nomes), mas a leitura profunda de arquivos (`scanPhaseDir`) só acontece
 * para as fases citadas no lote.
 */
async function scanPhasesByNumber(
  root: string,
  numbers: Set<number>,
): Promise<PhaseScanEntry[]> {
  const dir = phasesDir(root);

  let entries: Awaited<ReturnType<typeof listPlanningDir>>;
  try {
    entries = await listPlanningDir(dir);
  } catch {
    return [];
  }

  const results: PhaseScanEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    const parsed = parsePhaseDirName(entry.name);
    if (!parsed || !numbers.has(parsed.number)) continue;

    try {
      const { signals, issues } = await scanPhaseDir(dir, entry.name);
      results.push({ dirName: entry.name, ...parsed, signals, issues });
    } catch (error) {
      results.push({
        dirName: entry.name,
        ...parsed,
        signals: emptySignals(),
        issues: [
          {
            path: `${dir}/${entry.name}`,
            reason: `Falha ao varrer diretório da fase: ${String(error)}`,
          },
        ],
      });
    }
  }
  return results;
}

/**
 * Mescla um subconjunto recém-varrido de fases sobre o array de `PhaseModel[]`
 * já existente no store, em vez de reconstruir tudo — preserva `name`/
 * `requirementIds`/`isInserted` das fases não tocadas por este lote. Uma fase
 * nova (diretório que apareceu sem estar no ROADMAP ainda) é adicionada com
 * o mesmo fallback de nome de `buildPhaseModels`.
 */
function mergePhaseModels(
  existing: PhaseModel[],
  scannedSubset: PhaseScanEntry[],
  blockers: PhaseBlocker[],
): { phases: PhaseModel[]; affectedIds: string[] } {
  if (scannedSubset.length === 0) {
    return { phases: existing, affectedIds: [] };
  }

  const byNumber = new Map<number, PhaseModel>();
  for (const model of existing) {
    byNumber.set(model.number, model);
  }

  const affectedIds: string[] = [];

  for (const entry of scannedSubset) {
    const diskStatus = deriveDiskStatus(true, entry.signals);
    const badge = toBoardBadge(diskStatus, entry.signals.isActive);
    const previous = byNumber.get(entry.number);
    const column = toBoardColumn(badge, previous?.column);
    const entryBlockers = blockers.filter((blocker) => blocker.phases.includes(entry.number));

    const updated: PhaseModel = previous
      ? {
          ...previous,
          id: entry.padded,
          diskStatus,
          badge,
          column,
          planCount: entry.signals.planCount,
          summaryCount: entry.signals.summaryCount,
          blockers: entryBlockers,
          issues: entry.issues,
        }
      : {
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
          blockers: entryBlockers,
          issues: entry.issues,
        };

    byNumber.set(entry.number, updated);
    affectedIds.push(updated.id);
  }

  const merged = Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
  return { phases: merged, affectedIds };
}

/** Compara dois arrays de `PhaseBlocker` por conteúdo (não por referência) — usado para detectar quais fases realmente mudaram de blockers ao reaplicar o filtro (correção CR-02). */
function blockersEqual(a: PhaseBlocker[], b: PhaseBlocker[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((blocker, index) => {
    const other = b[index];
    return (
      blocker.text === other.text &&
      blocker.phases.length === other.phases.length &&
      blocker.phases.every((phase, phaseIndex) => phase === other.phases[phaseIndex])
    );
  });
}

/** Janela do glow de atualização em tempo real (D-13) — ~1000ms, sem toast. */
const GLOW_WINDOW_MS = 1000;

/** Intervalo crescente de auto-retry da reconexão (D-16) — satura em 15s, silencioso até dar certo. */
const RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10000, 15000];

export const useBoardStore = create<BoardStoreState>()(
  immer((set, get) => ({
    status: "idle",
    project: null,
    error: null,
    recentlyUpdatedPhaseIds: [],
    sync: { state: "idle", lastSyncedAt: null, degradedSince: null, reason: null },
    view: "board",
    openProjectRoots: [],
    activeProjectRoot: null,

    setView: (view: BoardView) => {
      set((state) => {
        state.view = view;
      });
    },

    openProject: async (root: string) => {
      set((state) => {
        state.status = "opening";
        state.error = null;
      });

      try {
        const validated = await validateProjectRoot(root);

        // Board (Plano 03): fases derivadas do merge entre ROADMAP.md e a
        // varredura real do disco. `scanAllPhases` já nunca lança (D-15);
        // `loadRoadmapModel` também degrada para `null` em vez de lançar.
        // Sequência completa compartilhada com `switchProject` (Pattern 3).
        const projectModel = await loadProjectStateModel(validated.root, validated.hasGsdCore);

        set((state) => {
          state.project = projectModel;
          state.status = "open";
          state.view = "board";
          // Multi-projeto (04-03-PLAN.md, PROJ-05): registra esta raiz entre
          // as abertas nesta execução e a torna a ativa — dedup por valor,
          // nunca duplica a mesma raiz em `openProjectRoots`.
          if (!state.openProjectRoots.includes(validated.root)) {
            state.openProjectRoots.push(validated.root);
          }
          state.activeProjectRoot = validated.root;
        });

        // Casa persistente (04-01-PLAN.md): registra este projeto como
        // recente em segundo plano — mesma disciplina de fire-and-forget de
        // `loadMilestoneHistory` logo abaixo (nunca bloqueia a abertura do
        // board já commitada acima). Sem `set()` dependente do resultado
        // aqui (a lista de recentes só é lida quando a home renderiza), mas
        // a falha de escrita é engolida da mesma forma — disco cheio ou
        // permissão negada nunca deve derrubar um projeto já aberto com
        // sucesso.
        void upsertRecent({
          root: validated.root,
          name: projectModel.projectName,
          lastOpened: new Date().toISOString(),
        }).catch(() => {
          // Falha ao persistir o recente não impede o board de abrir — a
          // lista de recentes é conveniência, não fonte da verdade (o
          // `.planning/` em disco continua sendo a fonte real do projeto).
        });

        // Board (Plano 06, D-08): o histórico de milestones carrega em
        // segundo plano, sem bloquear a renderização do board ativo já
        // commitado acima — a faixa de histórico começa vazia e se preenche
        // quando a leitura terminar. Guarda `root` contra o caso do usuário
        // trocar/fechar o projeto antes desta promise resolver.
        void loadMilestoneHistory(validated.root).then((milestones) => {
          set((state) => {
            if (state.project && state.project.root === validated.root) {
              state.project.milestones = milestones;
            }
          });
        });

        // Board (Plano 04): passa a observar `.planning/` desta raiz assim
        // que o projeto abre com sucesso — nunca antes (o watcher só deve
        // observar uma raiz já validada, nunca um caminho cru).
        try {
          await startWatching(planningDir(validated.root));
          get().markSyncHealthy(Date.now());
        } catch {
          // Falha ao iniciar o watcher não impede o board de abrir com o
          // snapshot atual — só fica sem tempo real até uma reconexão.
          get().markSyncDegraded("Não foi possível iniciar o observador de arquivos");
        }
      } catch (error) {
        set((state) => {
          state.status = "error";
          state.error = toStoreError(error);
        });
      }
    },

    closeProject: () => {
      void stopWatching();
      set((state) => {
        state.status = "idle";
        state.project = null;
        state.error = null;
        state.sync = { state: "idle", lastSyncedAt: null, degradedSince: null, reason: null };
        state.recentlyUpdatedPhaseIds = [];
      });
    },

    switchProject: async (root: string) => {
      // Trocar para a raiz já ativa é no-op — evita derrubar/reerguer o
      // watcher único à toa (04-03-PLAN.md acceptance criteria).
      if (get().activeProjectRoot === root) return;

      // Pattern 3 (04-RESEARCH.md, decisão nomeada — NÃO reescrever para um
      // HashMap por projeto): um único watcher ativo por vez. Para o
      // observador atual antes de re-sincronizar para a nova raiz ativa.
      await stopWatching();

      set((state) => {
        state.status = "opening";
        state.error = null;
      });

      try {
        // T-04-07: re-executa o mesmo portão de validação/contenção que
        // `openProject` roda — uma raiz vinda de `openProjectRoots`/recentes
        // nunca é adotada como ativa sem revalidar `validateProjectRoot`.
        const validated = await validateProjectRoot(root);
        const projectModel = await loadProjectStateModel(validated.root, validated.hasGsdCore);

        set((state) => {
          state.project = projectModel;
          state.status = "open";
          state.view = "board";
          if (!state.openProjectRoots.includes(validated.root)) {
            state.openProjectRoots.push(validated.root);
          }
          state.activeProjectRoot = validated.root;
          // Um glow pendente do projeto anterior citaria ids de fase que não
          // existem (ou significam outra coisa) na raiz recém-ativada.
          state.recentlyUpdatedPhaseIds = [];
        });

        // T-04-08 / Pitfall de sessão: switchProject NUNCA toca
        // `sessions`/`liveSessions` (session-store.ts) e NUNCA chama
        // `closeProject` — nenhuma sessão de nenhum projeto morre aqui.

        void loadMilestoneHistory(validated.root).then((milestones) => {
          set((state) => {
            if (state.project && state.project.root === validated.root) {
              state.project.milestones = milestones;
            }
          });
        });

        try {
          await startWatching(planningDir(validated.root));
          get().markSyncHealthy(Date.now());
        } catch {
          get().markSyncDegraded("Não foi possível iniciar o observador de arquivos");
        }
      } catch (error) {
        set((state) => {
          state.status = "error";
          state.error = toStoreError(error);
        });
      }
    },

    reprocessPaths: async (paths: string[]) => {
      const projectRoot = get().project?.root;
      if (!projectRoot) return;

      const classifications = paths.map((path) => classifyChangedPath(path, projectRoot));
      const needsState = classifications.some((c) => c.kind === "state");
      const needsRoadmap = classifications.some((c) => c.kind === "roadmap");
      const phaseNumbers = new Set<number>();
      for (const classification of classifications) {
        if (classification.kind === "phase") {
          const number = Number.parseFloat(classification.phaseId);
          if (Number.isFinite(number)) phaseNumbers.add(number);
        }
      }

      // Lote inteiro classificado como `milestones`/`other` — nada a
      // reprocessar nesta fase (Plano 06 cuida de milestones); nunca aplica
      // uma transição de estado vazia.
      if (!needsState && !needsRoadmap && phaseNumbers.size === 0) return;

      const current = get().project;
      if (!current) return;

      const newIssues: ParseIssue[] = [];

      let blockers = current.blockers;
      let milestone = current.milestone;
      let currentPhase = current.currentPhase;
      let currentPhaseName = current.currentPhaseName;
      let progress = current.progress;
      let blockersChanged = false;

      if (needsState) {
        const sp = statePath(current.root);
        try {
          const raw = await readPlanningText(sp);
          const parsedState = parseStateFile(raw, sp);
          if (parsedState.kind === "unrecognized") {
            // Falha localizada (D-15): o estado anterior de milestone/fase/
            // progresso/blockers é preservado — só a issue é registrada.
            newIssues.push(...parsedState.issues);
          } else {
            const parsed = parsedState.value;
            milestone = parsed.milestone;
            currentPhase = parsed.currentPhase;
            currentPhaseName = parsed.currentPhaseName;
            progress = parsed.progress;
            blockers = parsed.blockers;
            blockersChanged = true;
          }
        } catch (error) {
          newIssues.push({
            path: sp,
            reason: `Falha ao reler STATE.md: ${String(error)}`,
          });
        }
      }

      let phases = current.phases;
      let roadmapRebuilt = false;

      if (needsRoadmap) {
        const roadmapModel = await loadRoadmapModel(current.root);
        if (roadmapModel) {
          const scannedAll = await scanAllPhases(current.root);
          phases = buildPhaseModels(roadmapModel, scannedAll, blockers);
          roadmapRebuilt = true;
        } else {
          // Releitura do ROADMAP.md falhou (arquivo truncado no meio de uma
          // escrita, ou estrutura irreconhecível) — mantém o board no último
          // estado bom em vez de derrubá-lo (D-15).
          newIssues.push({
            path: roadmapPath(current.root),
            reason: "Falha ao reler ou interpretar ROADMAP.md — mantendo o board no último estado bom",
          });
        }
      }

      let affectedIds: string[] = [];
      if (phaseNumbers.size > 0 && !roadmapRebuilt) {
        const scannedSubset = await scanPhasesByNumber(current.root, phaseNumbers);
        const merged = mergePhaseModels(phases, scannedSubset, blockers);
        phases = merged.phases;
        affectedIds = merged.affectedIds;
      }
      if (blockersChanged) {
        // Correção CR-02: reaplica o filtro de blockers a TODAS as fases
        // sempre que `blockersChanged`, independentemente de qual branch
        // (se algum) tratou a varredura de diretório deste lote — um
        // blocker novo em STATE.md pode citar qualquer fase, inclusive uma
        // não tocada pelo lote atual. Este bloco é INDEPENDENTE do `if`
        // acima (não `else if`), porque os dois podem disparar juntos no
        // mesmo lote de debounce.
        const previousBlockersByNumber = new Map(
          phases.map((phase) => [phase.number, phase.blockers]),
        );
        phases = phases.map((phase) => ({
          ...phase,
          blockers: blockers.filter((blocker) => blocker.phases.includes(phase.number)),
        }));
        const blockerAffectedIds = phases
          .filter((phase) => {
            const previous = previousBlockersByNumber.get(phase.number) ?? [];
            return !blockersEqual(previous, phase.blockers);
          })
          .map((phase) => phase.id);
        affectedIds = Array.from(new Set([...affectedIds, ...blockerAffectedIds]));
      }

      const syncedAt = Date.now();

      // Transição única (immer) para o lote inteiro — o que impede o board
      // de piscar durante uma rajada de escritas do GSD (Pitfall 1/T-01-05c):
      // React re-renderiza uma vez por lote estável, nunca uma vez por arquivo.
      set((state) => {
        if (!state.project) return;
        state.project.milestone = milestone;
        state.project.currentPhase = currentPhase;
        state.project.currentPhaseName = currentPhaseName;
        state.project.progress = progress;
        state.project.blockers = blockers;
        state.project.phases = phases;
        if (newIssues.length > 0) {
          state.project.issues = [...state.project.issues, ...newIssues];
        }
        state.sync.state = "healthy";
        state.sync.lastSyncedAt = syncedAt;
        state.sync.degradedSince = null;
        state.sync.reason = null;
        state.recentlyUpdatedPhaseIds = affectedIds;
      });

      if (affectedIds.length > 0) {
        setTimeout(() => {
          set((state) => {
            const same =
              state.recentlyUpdatedPhaseIds.length === affectedIds.length &&
              state.recentlyUpdatedPhaseIds.every((id, index) => id === affectedIds[index]);
            if (same) {
              state.recentlyUpdatedPhaseIds = [];
            }
          });
        }, GLOW_WINDOW_MS);
      }
    },

    markSyncHealthy: (timestamp: number) => {
      set((state) => {
        state.sync.state = "healthy";
        state.sync.lastSyncedAt = timestamp;
        state.sync.degradedSince = null;
        state.sync.reason = null;
      });
    },

    markSyncDegraded: (reason: string) => {
      const wasAlreadyDegraded = get().sync.state === "degraded";
      set((state) => {
        state.sync.state = "degraded";
        state.sync.degradedSince = Date.now();
        state.sync.reason = reason;
        // `project` propositalmente intocado — o board congela no último
        // estado bom em vez de fingir estar sincronizado (D-16).
      });
      if (!wasAlreadyDegraded) {
        scheduleAutoRetry(0);
      }
    },

    reconnectWatcher: async () => {
      const project = get().project;
      if (!project) return;

      try {
        await startWatching(planningDir(project.root));

        // Releitura completa: mudanças podem ter sido perdidas durante a
        // degradação (o watcher esteve cego, não há lote de caminhos para
        // reprocessar incrementalmente).
        const roadmapModel = await loadRoadmapModel(project.root);
        const scannedPhases = await scanAllPhases(project.root);

        const sp = statePath(project.root);
        let milestone = project.milestone;
        let currentPhase = project.currentPhase;
        let currentPhaseName = project.currentPhaseName;
        let progress = project.progress;
        let blockers = project.blockers;
        let issues = project.issues;
        try {
          const raw = await readPlanningText(sp);
          const parsedState = parseStateFile(raw, sp);
          if (parsedState.kind === "ok") {
            const parsed = parsedState.value;
            milestone = parsed.milestone;
            currentPhase = parsed.currentPhase;
            currentPhaseName = parsed.currentPhaseName;
            progress = parsed.progress;
            blockers = parsed.blockers;
            issues = parsed.issues;
          }
        } catch {
          // Preserva o último STATE.md bom conhecido — reconectar não deve
          // quebrar o board se a releitura falhar de novo.
        }

        const phases = buildPhaseModels(roadmapModel, scannedPhases, blockers);

        set((state) => {
          if (!state.project) return;
          state.project.milestone = milestone;
          state.project.currentPhase = currentPhase;
          state.project.currentPhaseName = currentPhaseName;
          state.project.progress = progress;
          state.project.blockers = blockers;
          state.project.phases = phases;
          state.project.issues = issues;
          state.sync.state = "healthy";
          state.sync.lastSyncedAt = Date.now();
          state.sync.degradedSince = null;
          state.sync.reason = null;
        });
      } catch {
        // Reconexão falhou — permanece degradado; o auto-retry em background
        // tenta de novo, silenciosamente, no próximo intervalo (D-16).
      }
    },
  })),
);

/** Auto-retry silencioso em background (D-16) — só muda a apresentação quando a reconexão de fato funciona. */
function scheduleAutoRetry(attempt: number): void {
  const delay = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)];
  setTimeout(() => {
    const state = useBoardStore.getState();
    if (state.sync.state !== "degraded") return;
    void state.reconnectWatcher().then(() => {
      if (useBoardStore.getState().sync.state === "degraded") {
        scheduleAutoRetry(attempt + 1);
      }
    });
  }, delay);
}

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
