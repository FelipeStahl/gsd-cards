// Guard estrito de formato de id de sessão (SESS-04, T-04-16 — o centro de
// gravidade de segurança da Fase 4). Mesmo padrão de `sanitizePhaseId`
// (`src/planning/actions.ts:84-93`): regex âncorada, refuse-never-correct
// (nunca uma versão "corrigida"/truncada do input), aplicado no ÚNICO ponto
// em que um id de sessão PERSISTIDO (e, portanto, localmente adulterável —
// `app-state.json` é um arquivo comum do usuário) entra no argv de
// `spawnSession`/`CommandBuilder::args` como `["--resume", id]`.
//
// A ameaça concreta: `portable-pty` spawna sem shell (não é injeção de
// shell), mas o parser de flags do próprio Claude Code trata qualquer token
// iniciado por `-`/`--` como uma opção, independente de posição. Um id
// adulterado como `--dangerously-skip-permissions` reinterpretado como flag
// real seria uma escalação de privilégio local via um arquivo que o próprio
// usuário pode editar. A mitigação é um allow-list de formato ANTES desse
// valor alcançar `invoke("spawn_session", ...)` — nunca uma tentativa de
// "escapar" ou sanitizar o caractere de traço, só recusar por completo
// qualquer coisa que não seja um UUID v4-shaped bem-formado (04-RESEARCH.md
// `## Security Domain`, `## Code Examples`).
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verdadeiro só para um UUID v4-shaped bem-formado — falso para QUALQUER
 * outra coisa, incluindo strings iniciadas por `-`/`--` (flag-shaped),
 * caminhos de travessia (`../../etc`), vazio/whitespace, ou qualquer id
 * "quase válido". Aplicado no único call site que monta
 * `["--resume", id]` (`resumeSession` em `src/stores/session-store.ts`) —
 * ver `key_links` de `04-06-PLAN.md`.
 */
export function isValidSessionId(id: string): boolean {
  return SESSION_ID_PATTERN.test(id);
}
