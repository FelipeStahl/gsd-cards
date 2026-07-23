// Wrapper de invoke("check_claude_on_path") + estado combinado de
// dependências ausentes (PROJ-04). NENHUMA lógica de auto-instalação aqui —
// só detecta e devolve dados para a UI decidir como instruir o usuário
// (REQUIREMENTS.md ## Out of Scope: auto-instalação é proibida).

import { invoke } from "@tauri-apps/api/core";

export interface ClaudeDependencyStatus {
  claudePath: string | null;
}

/**
 * Invoca o comando Rust `check_claude_on_path` — checagem GLOBAL de
 * `claude` no PATH do SO, independente de qual projeto está aberto.
 */
export async function checkClaudeOnPath(): Promise<ClaudeDependencyStatus> {
  return invoke<ClaudeDependencyStatus>("check_claude_on_path");
}

export type ToolMissingState =
  | "none"
  | "claude-missing"
  | "gsd-core-missing"
  | "both-missing";

/**
 * Combina `claudePath` (checagem global, `checkClaudeOnPath`) com
 * `hasGsdCore` (checagem por-projeto, já calculada em
 * `ValidatedProject.hasGsdCore` — `project.rs`, Fase 1) numa única variante
 * de "ferramenta ausente" consumida pela UI (Plano 04). Puramente uma
 * classificação do que já foi detectado — não instala nada.
 */
export function deriveToolMissingState(
  claudePath: string | null,
  hasGsdCore: boolean,
): ToolMissingState {
  const claudeMissing = claudePath === null;
  const gsdCoreMissing = !hasGsdCore;

  if (claudeMissing && gsdCoreMissing) return "both-missing";
  if (claudeMissing) return "claude-missing";
  if (gsdCoreMissing) return "gsd-core-missing";
  return "none";
}
