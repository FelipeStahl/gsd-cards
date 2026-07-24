// Drawer rail — o gatilho TEMPORÁRIO "Nova sessão" do tracer (Plano 01) sai
// daqui: "Nova sessão" agora vive só na `SessionSidebar` real (Plano 04).
// Rail de 48px recolhido por padrão, com um badge accent de contagem quando
// ≥1 sessão viva (`sessions` com origin "live"); clicar o rail recolhido
// reexpande para `lastFocusedSessionId` — sem matar nem recriar a sessão,
// só reabre o drawer sobre uma sessão que já existia (`02-UI-SPEC.md` ##
// Layout Delta). Se nenhuma sessão jamais teve foco nesta execução, o rail
// fica no mesmo estado desabilitado/tooltip-only da Fase 1: nenhum ponto de
// entrada funcional até uma linha da sidebar ser clicada diretamente.

import { TerminalSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import { GsdCommandToolbar } from "../components/terminal/GsdCommandToolbar";
import { TerminalView } from "../components/terminal/TerminalView";
import { useBoardStore } from "../stores/board-store";
import { useSessionStore } from "../stores/session-store";

export function DrawerRail() {
  const { t } = useTranslation("session");
  const projectRoot = useBoardStore((state) => state.project?.root ?? null);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const lastFocusedSessionId = useSessionStore((state) => state.lastFocusedSessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const focusSession = useSessionStore((state) => state.focusSession);

  const liveCount = sessions.filter((session) => session.origin === "live").length;

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
        {liveCount > 0 ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 14,
              height: 14,
              borderRadius: 999,
              backgroundColor: "var(--color-accent)",
              color: "#ffffff",
              fontSize: 10,
              lineHeight: "14px",
              textAlign: "center",
              padding: "0 3px",
            }}
          >
            {liveCount}
          </span>
        ) : null}
      </button>
    </aside>
  );
}
