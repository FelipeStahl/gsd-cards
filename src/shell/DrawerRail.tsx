// Drawer rail — o gatilho TEMPORÁRIO "Nova sessão" do tracer (Plano 01) sai
// daqui: "Nova sessão" agora vive só na `SessionSidebar` real (Plano 04).
// Rail de 48px recolhido por padrão, com um badge de contagem quando ≥1
// sessão viva (`sessions` com origin "live"); clicar o rail recolhido
// reexpande para `lastFocusedSessionId` — sem matar nem recriar a sessão,
// só reabre o drawer sobre uma sessão que já existia (`02-UI-SPEC.md` ##
// Layout Delta). Se nenhuma sessão jamais teve foco nesta execução, o rail
// fica no mesmo estado desabilitado/tooltip-only da Fase 1: nenhum ponto de
// entrada funcional até uma linha da sidebar ser clicada diretamente.
//
// Fase 4, Plano 07 (TERM-04): o badge (16px, `04-UI-SPEC.md` ## Color) agora
// segue uma PRIORIDADE sobre as sessões do projeto ATIVO (`activeProjectRoot`,
// nunca `sessions[]` cru — mesma correção de escopo de PROJ-05 já aplicada
// em `SessionSidebar`): ≥1 sessão `awaiting` -> dot accent SEM número (mais
// acionável que "ainda rodando"); senão ≥1 sessão `exited` (via `markExited`)
// -> dot warning; senão o número plano de sessões vivas (comportamento
// inalterado da Fase 2); senão (nenhuma sessão viva) nenhum badge.

import { TerminalSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import { GsdCommandToolbar } from "../components/terminal/GsdCommandToolbar";
import { TerminalView } from "../components/terminal/TerminalView";
import { useBoardStore } from "../stores/board-store";
import { useSessionStore } from "../stores/session-store";

type BadgeTone = "accent" | "warning";

export function DrawerRail() {
  const { t } = useTranslation("session");
  const projectRoot = useBoardStore((state) => state.project?.root ?? null);
  const activeProjectRoot = useBoardStore((state) => state.activeProjectRoot);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const lastFocusedSessionId = useSessionStore((state) => state.lastFocusedSessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const focusSession = useSessionStore((state) => state.focusSession);

  const liveSessions = sessions.filter(
    (session) => session.projectRoot === activeProjectRoot && session.origin === "live",
  );
  const liveCount = liveSessions.length;
  const hasAwaiting = liveSessions.some((session) => session.activity === "awaiting");
  // Sessões `exited` (markExited, TERM-04) permanecem `origin === "live"`
  // (02-UI-SPEC.md ## Session Sidebar — ficam no grupo "Ativas") — já
  // incluídas em `liveSessions` acima, só filtradas de novo aqui pela flag.
  const hasExited = liveSessions.some((session) => session.exited);

  let badgeTone: BadgeTone | null = null;
  let badgeCount: number | null = null;
  if (hasAwaiting) {
    badgeTone = "accent";
  } else if (hasExited) {
    badgeTone = "warning";
  } else if (liveCount > 0) {
    badgeTone = "accent";
    badgeCount = liveCount;
  }

  if (activeSessionId && projectRoot) {
    return (
      <aside
        style={{
          width: 640,
          flexShrink: 0,
          backgroundColor: "var(--color-secondary)",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {/* ACT-04 (Fase 3, Plano 05): toolbar GSD acima do TerminalView —
            só existe enquanto há sessão ativa (mesmo gate deste branch do
            <aside>), o que também escopa o listener Cmd/Ctrl+K do
            GsdCommandToolbar a "só enquanto o drawer está expandido"
            (03-RESEARCH.md ## Security Domain). `position: relative` no
            <aside> confina o CommandPalette (position: absolute) que o
            toolbar abre — nunca escurece o board/sidebar. */}
        <GsdCommandToolbar />
        <TerminalView sessionId={activeSessionId} projectRoot={projectRoot} />
      </aside>
    );
  }

  const canReexpand = Boolean(lastFocusedSessionId && projectRoot);
  const label = t("actions.reexpand");

  return (
    <aside
      style={{
        width: 48,
        flexShrink: 0,
        backgroundColor: "var(--color-secondary)",
        display: "flex",
        justifyContent: "center",
        paddingTop: "var(--spacing-md)",
      }}
    >
      <button
        type="button"
        disabled={!canReexpand}
        title={label}
        aria-label={label}
        onClick={() => {
          if (canReexpand && lastFocusedSessionId) {
            focusSession(lastFocusedSessionId);
          }
        }}
        style={{
          position: "relative",
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          color: "var(--color-foreground)",
          opacity: canReexpand ? 1 : 0.4,
          cursor: canReexpand ? "pointer" : "not-allowed",
          padding: 0,
        }}
      >
        <TerminalSquare size={20} aria-hidden="true" />
        {badgeTone ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              backgroundColor: badgeTone === "warning" ? "var(--color-warning)" : "var(--color-accent)",
              color: "#ffffff",
              fontSize: 10,
              lineHeight: "16px",
              textAlign: "center",
              padding: badgeCount !== null ? "0 3px" : 0,
            }}
          >
            {badgeCount}
          </span>
        ) : null}
      </button>
    </aside>
  );
}
