// Regra de derivação de status replicada literalmente do gsd-core
// (`bin/lib/init.cjs` — `buildPhaseCompletionProjection` + `cmdInitManager`).
// Documentada em 01-RESEARCH.md → `## Architecture Patterns` → Pattern 1.
//
// Regra estrutural (T-01-06): esta função é PURA — recebe sinais já
// coletados do disco e devolve status. Nenhum I/O acontece aqui; a
// varredura do diretório de fase vive em `phase-scan.ts`. Isso mantém a
// regra central do produto testável sem Tauri de pé.
//
// O status NUNCA é derivado da tabela coarse `## Progress` do ROADMAP.md
// nem dos checkboxes de `## Phases` — ver `01-RESEARCH.md` →
// `## Anti-Patterns to Avoid`. A fonte de verdade granular é sempre a
// inspeção do diretório da fase, replicada abaixo.

/** Os 8 valores granulares que o gsd-core produz — preservados no modelo mesmo quando a apresentação colapsa dois deles (ver `toBoardBadge`). */
export type DiskStatus =
  | "no_directory"
  | "empty"
  | "discussed"
  | "researched"
  | "planned"
  | "partial"
  | "executed"
  | "complete";

/** Os 7 badges definidos em `01-UI-SPEC.md` → `## Status Badge Mapping`. */
export type BoardBadge =
  | "pending"
  | "discussed"
  | "planned"
  | "executing"
  | "executed"
  | "verified"
  | "unknown";

/** As 4 colunas de D-05. */
export type BoardColumnId = "todo" | "preparing" | "executing" | "done";

export type VerificationStatus =
  | "passed"
  | "gaps_found"
  | "human_needed"
  | "missing"
  | "not_required";

export interface PhaseDirSignals {
  planCount: number;
  summaryCount: number;
  hasResearch: boolean;
  hasContext: boolean;
  /** Algum arquivo do diretório da fase com mtime dentro de `ACTIVE_WINDOW_MS`. */
  isActive: boolean;
  verificationStatus: VerificationStatus;
}

/**
 * Janela de "fase ativa" — heurística de mtime que o próprio `cmdInitManager`
 * usa para inferir execução em andamento mesmo antes do primeiro SUMMARY.md
 * ser gravado. Registrada como Assumption A3 em `01-RESEARCH.md`
 * (risco médio): se a janela não bater com a duração real de execução de um
 * plano GSD, um card pode "voltar" de "em execução" para "planejada" no meio
 * de uma execução longa. Valor ajustável — mantido como constante nomeada e
 * exportada para não exigir garimpar um número mágico se precisar ajustar.
 */
export const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Ordem de precedência (primeira condição que casar vence) — replica
 * literalmente `buildPhaseCompletionProjection`/`cmdInitManager` de
 * `init.cjs`.
 */
export function deriveDiskStatus(
  dirExists: boolean,
  signals: PhaseDirSignals,
): DiskStatus {
  if (!dirExists) return "no_directory";

  const implementationComplete =
    signals.planCount > 0 && signals.summaryCount >= signals.planCount;
  const verificationPassed =
    implementationComplete && signals.verificationStatus === "passed";

  if (implementationComplete && verificationPassed) return "complete";
  if (implementationComplete) return "executed";
  if (signals.summaryCount > 0) return "partial";
  if (signals.planCount > 0) return "planned";
  if (signals.hasResearch) return "researched";
  if (signals.hasContext) return "discussed";
  return "empty";
}

/**
 * Mapeamento para o vocabulário de 7 badges do UI-SPEC. Decisão travada
 * neste plano (resolve Open Question #1 da pesquisa): `discussed` e
 * `researched` colapsam no mesmo badge "discutida" — o UI-SPEC define
 * exatamente 6 badges de status e ambos caem na coluna "Preparando" de
 * qualquer forma, então um 7º badge gastaria superfície visual sem mudar
 * nenhuma informação acionável. A distinção fica preservada em `DiskStatus`.
 */
export function toBoardBadge(status: DiskStatus, isActive: boolean): BoardBadge {
  switch (status) {
    case "no_directory":
    case "empty":
      return "pending";
    case "discussed":
    case "researched":
      return "discussed";
    case "planned":
      return isActive ? "executing" : "planned";
    case "partial":
      return "executing";
    case "executed":
      return "executed";
    case "complete":
      return "verified";
    default: {
      // Exhaustividade: se um novo DiskStatus for adicionado sem atualizar
      // este mapeamento, o TypeScript aponta o erro aqui.
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

/**
 * Mapeamento badge → coluna (D-05). `unknown` mantém a última coluna
 * conhecida quando disponível (parse-failure não deve "rebaixar" uma fase
 * para "A fazer" só porque um artefato específico falhou o parse); sem
 * coluna anterior conhecida, cai em "A fazer".
 */
export function toBoardColumn(
  badge: BoardBadge,
  lastKnownColumn?: BoardColumnId,
): BoardColumnId {
  switch (badge) {
    case "pending":
      return "todo";
    case "discussed":
    case "planned":
      return "preparing";
    case "executing":
    case "executed":
      return "executing";
    case "verified":
      return "done";
    case "unknown":
      return lastKnownColumn ?? "todo";
    default: {
      const exhaustiveCheck: never = badge;
      return exhaustiveCheck;
    }
  }
}
