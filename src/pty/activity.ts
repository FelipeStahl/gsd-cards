// Classificador puro do estado do terminal (ACT-03, `03-RESEARCH.md`
// Architecture Patterns Pattern 3). Opera SEMPRE sobre uma janela rolante de
// texto já decodificado e com ANSI removido — nunca sobre um chunk isolado,
// porque marcadores (o footer "esc to interrupt", o prompt "Do you want to
// proceed?") podem legitimamente chegar divididos entre dois `onmessage` do
// PTY. Sem timers, sem I/O: quiescência (busy→idle após silêncio) é
// responsabilidade do chamador (`useTerminalActivity.ts`, Tarefa 3), porque
// "nenhum byte novo por 500ms" não é algo observável a partir de uma única
// string.
//
// Os marcadores são regexes nomeadas — "Claude's Discretion" per
// `03-CONTEXT.md`, tuning empírico deferido a `/gsd-verify-work` (assunção
// A1, LOW confidence). Isolar como constantes nomeadas garante que o ajuste
// futuro seja uma mudança de uma linha, nunca um rewrite de wiring.

import stripAnsi from "strip-ansi";

/** Estado de atividade de uma sessão viva — `idle` nunca é retornado por `classifyActivity` (ver comentário no export), só existe no estado do caller/store. */
export type TerminalActivity = "idle" | "busy" | "awaiting";

/** Footer do Claude CLI durante uma tarefa em andamento ("esc to interrupt"). LOW confidence — sem contrato publicado pela Anthropic, ver Assumptions Log A1 de `03-RESEARCH.md`. */
export const BUSY_MARKER = /esc to interrupt/i;

/** Prompt de permissão do Claude CLI ("Do you want to proceed?"). LOW confidence — mesma ressalva de `BUSY_MARKER`. */
export const AWAITING_MARKER = /do you want to proceed\?/i;

/** Cap da janela rolante em caracteres decodificados — bounded independente do tamanho de uma rajada de output (T-03-04, mitigação DoS). */
export const ROLLING_BUFFER_CAP = 2000;

/** Janela de silêncio (ms) para o caller considerar a sessão `idle` de novo após o último byte classificado como atividade. Ajuste empírico deferido a `/gsd-verify-work` (Assumptions Log A2). */
export const QUIESCENCE_MS = 500;

/**
 * Concatena `chunk` ao `buffer` existente e mantém só a cauda — quando a
 * soma excede `ROLLING_BUFFER_CAP`, só os últimos `ROLLING_BUFFER_CAP`
 * caracteres sobrevivem. Um marcador cujos bytes decodificados cheguem
 * divididos entre dois `appendToRollingBuffer` é detectado assim que ambos
 * os pedaços estiverem na janela.
 */
export function appendToRollingBuffer(buffer: string, chunk: string): string {
  const next = buffer + chunk;
  return next.length > ROLLING_BUFFER_CAP ? next.slice(-ROLLING_BUFFER_CAP) : next;
}

/**
 * Função pura — sem timers, sem I/O. Remove sequências ANSI antes de testar
 * os marcadores (um marcador cercado/intercalado por códigos de cor/cursor
 * ainda deve casar depois do strip). `awaiting` tem precedência sobre `busy`
 * quando ambos aparecem na janela — o prompt de permissão é sempre o estado
 * mais recente/relevante quando presente.
 */
export function classifyActivity(rollingBufferText: string): "busy" | "awaiting" | null {
  const clean = stripAnsi(rollingBufferText);
  if (AWAITING_MARKER.test(clean)) return "awaiting";
  if (BUSY_MARKER.test(clean)) return "busy";
  return null;
}
