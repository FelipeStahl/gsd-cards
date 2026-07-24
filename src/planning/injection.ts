// resolveInjection — resolvedor puro do "Injection Behavior Matrix"
// (`03-UI-SPEC.md` ## Injection Behavior Matrix), combinando o mapeamento
// status->comando (`derivePhaseAction`, Plano 01) com o sinal de atividade ao
// vivo da sessão (`TerminalActivity`, Plano 03) numa única decisão testável,
// consumida por TODA superfície de injeção (`PhaseCardAction`, `DetailPanel`,
// e futuramente o toolbar/palette do Plano 05) — nenhuma delas reimplementa
// o guard.
//
// Precedência (D-ACT02/D-ACT03):
//   1. Sem alvo vivo -> `unavailable` (guard.noSession), qualquer atividade.
//   2. Ocupado -> `blocked` (guard.busy), payload `null`, ZERO injeção —
//      nunca enfileirado para depois (`03-CONTEXT.md` explícito: bloquear,
//      não enfileirar).
//   3. Ocioso/`undefined` (sessão viva sem sinal de atividade observado
//      ainda nesta execução — tratada como ociosa) -> `send` (kind
//      `phase`/`parameterless`) ou `prefill` + espaço final (`parameterized`).
//   4. Aguardando permissão -> sempre `prefill` (nunca `"\r"` — nunca rouba
//      o Enter do próprio prompt de permissão do Claude), com espaço final
//      extra quando `parameterized`.

import type { TerminalActivity } from "../pty/activity";

export type InjectionKind = "phase" | "parameterless" | "parameterized";
export type InjectionMode = "send" | "prefill" | "blocked" | "unavailable";

export interface InjectionResolution {
  mode: InjectionMode;
  payload: string | null;
  guardKey?: string;
}

export interface ResolveInjectionParams {
  command: string;
  kind: InjectionKind;
  /** `undefined` = sessão viva sem sinal de atividade observado ainda nesta execução — tratada como ociosa. */
  activity: TerminalActivity | undefined;
  hasLiveTarget: boolean;
}

/** Implementa `03-UI-SPEC.md` `## Injection Behavior Matrix` exatamente. */
export function resolveInjection({
  command,
  kind,
  activity,
  hasLiveTarget,
}: ResolveInjectionParams): InjectionResolution {
  if (!hasLiveTarget) {
    return { mode: "unavailable", payload: null, guardKey: "board.actions.guard.noSession" };
  }

  if (activity === "busy") {
    return { mode: "blocked", payload: null, guardKey: "board.actions.guard.busy" };
  }

  if (activity === "awaiting") {
    const payload = kind === "parameterized" ? `${command} ` : command;
    return { mode: "prefill", payload, guardKey: "board.actions.guard.prefilled" };
  }

  // Ocioso ou undefined (sessão viva ainda sem classificação observada
  // nesta execução) — tratado como ocioso.
  if (kind === "parameterized") {
    return { mode: "prefill", payload: `${command} `, guardKey: "board.actions.guard.prefilled" };
  }
  return { mode: "send", payload: `${command}\r` };
}
