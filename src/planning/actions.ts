// Mapeamento status→ação (ACT-01), mirroring status.ts's exhaustive-switch
// discipline (`toBoardBadge`). PURO — nenhum I/O, nenhuma referência a
// sessão/PTY aqui; `PhaseCardAction` é quem combina isto com o alvo de
// injeção real.
//
// Fonte do status: SEMPRE `phase.diskStatus` (granular), NUNCA `phase.badge`
// — o badge colapsa `planned`+ativo em `executing` (`status.ts:109`), o que
// quebraria o mapeamento `planned`→Executar (D-ACT01, `03-CONTEXT.md`).
//
// `sanitizePhaseId` é a mitigação de T-03-01: `phase.id` vem de um nome de
// diretório em disco — potencialmente não confiável (repo clonado/
// compartilhado) — e é interpolado numa string que acaba sendo escrita
// literalmente no stdin de um shell/CLI real via `writeSession`. Um id que
// não bate com o padrão âncorado nunca produz uma string "melhor esforço"
// sanitizada — produz `null`, e o chamador trata isso como "sem ação
// disponível" (nunca um best-effort).

import type { DiskStatus } from "./status";

export interface PhaseAction {
  labelKey: string;
  command: (phaseId: string) => string;
  icon: "MessageSquare" | "ClipboardList" | "Play" | "FastForward" | "CheckCircle2";
}

/** Mapeamento literal de `03-UI-SPEC.md` `## Phase Action Mapping` (D-ACT01). */
export function derivePhaseAction(status: DiskStatus): PhaseAction | null {
  switch (status) {
    case "no_directory":
    case "empty":
      return {
        labelKey: "board.actions.discuss",
        command: (id) => `/gsd-discuss-phase ${id}`,
        icon: "MessageSquare",
      };
    case "discussed":
    case "researched":
      return {
        labelKey: "board.actions.plan",
        command: (id) => `/gsd-plan-phase ${id}`,
        icon: "ClipboardList",
      };
    case "planned":
      return {
        labelKey: "board.actions.execute",
        command: (id) => `/gsd-execute-phase ${id}`,
        icon: "Play",
      };
    case "partial":
      return {
        labelKey: "board.actions.continue",
        command: (id) => `/gsd-execute-phase ${id}`,
        icon: "FastForward",
      };
    case "executed":
      return {
        labelKey: "board.actions.verify",
        command: (id) => `/gsd-verify-work ${id}`,
        icon: "CheckCircle2",
      };
    case "complete":
      return null;
    default: {
      // Exhaustividade: um novo DiskStatus sem entrada aqui falha o
      // type-check (mesma disciplina de `status.ts::toBoardBadge`).
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

/** Padrão âncorado — só dígitos, opcionalmente com um sufixo decimal (fase inserida, ex. `02.1`). */
const PHASE_ID_PATTERN = /^\d{2,}(\.\d+)?$/;

/**
 * Valida `phase.id` antes de qualquer interpolação num comando injetado
 * (T-03-01). Retorna `id` inalterado quando válido, `null` caso contrário —
 * nunca uma versão "corrigida"/truncada do input.
 */
export function sanitizePhaseId(id: string): string | null {
  return PHASE_ID_PATTERN.test(id) ? id : null;
}
