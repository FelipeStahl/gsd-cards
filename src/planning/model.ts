// Raiz do estado espelhado do projeto GSD aberto. Planos 03 (board/fases) e
// 06 (milestones) preenchem `phases`/`milestones`; declarados aqui desde já
// para que planos paralelos não disputem este arquivo depois.

import type { ParseIssue, ParseResult } from "./parse-result";
import type { BoardBadge, BoardColumnId, DiskStatus } from "./status";

/** Espelha literalmente o frontmatter `progress` de STATE.md — sem recálculo. */
export interface ProjectProgress {
  totalPhases: number;
  completedPhases: number;
  totalPlans: number;
  completedPlans: number;
  percent: number;
}

/** Um item de `### Blockers/Concerns`, associado a uma ou mais fases (ou nenhuma, se o rótulo não casar). */
export interface PhaseBlocker {
  phases: number[];
  text: string;
}

/**
 * Uma fase do board, montada em `board-store.ts` a partir do merge entre
 * `ROADMAP.md` (nome, requisitos) e a varredura real do diretório da fase
 * (`phase-scan.ts` + `status.ts`, D-06: badge exato sempre visível).
 */
export interface PhaseModel {
  /** Número zero-padded para exibição (ex.: `01`, `02.1`) — preserva o formato original, nunca recalculado. */
  id: string;
  /** Valor numérico para ordenação (`2.1` para uma fase decimal inserida, D-07). */
  number: number;
  name: string;
  diskStatus: DiskStatus;
  badge: BoardBadge;
  column: BoardColumnId;
  planCount: number;
  summaryCount: number;
  requirementIds: string[];
  /** D-07: fase decimal inserida — badge neutro "inserida", sem tratamento de urgência. */
  isInserted: boolean;
  /** Filtrado de `ProjectStateModel.blockers` pelas fases citadas no rótulo `[Phase N]`. */
  blockers: PhaseBlocker[];
  /** `ParseIssue`s coletadas na varredura desta fase — dirige o `parseWarning` do card (BOARD-05). */
  issues: ParseIssue[];
}

/** Mínimo necessário nesta fase — o Plano 06 preenche o histórico completo de milestones. */
export interface MilestoneRef {
  id: string;
  name: string;
}

export interface ProjectStateModel {
  root: string;
  projectName: string;
  milestone: ParseResult<string>;
  currentPhase: ParseResult<number>;
  currentPhaseName: ParseResult<string>;
  progress: ParseResult<ProjectProgress>;
  blockers: PhaseBlocker[];
  phases: PhaseModel[];
  milestones: MilestoneRef[];
  issues: ParseIssue[];
}
