// Raiz do estado espelhado do projeto GSD aberto. Planos 03 (board/fases) e
// 06 (milestones) preenchem `phases`/`milestones`; declarados aqui desde já
// para que planos paralelos não disputem este arquivo depois.

import type { ParseIssue, ParseResult } from "./parse-result";

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

/** Mínimo necessário nesta fase — o Plano 03 preenche o restante da árvore fase→planos→tarefas. */
export interface PhaseModel {
  id: string;
  number: number;
  name: string;
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
