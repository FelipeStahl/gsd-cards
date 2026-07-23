// Drawer rail — nesta fase deixa de ser só um rail desabilitado. Gatilho
// TEMPORÁRIO "Nova sessão" (substituído pela `SessionSidebar` real no Plano
// 04): rail de 48px recolhido por padrão; ao criar uma sessão, expande para
// um painel de 640px hospedando `TerminalView` (`02-UI-SPEC.md` ## Layout
// Delta). Nenhuma lógica de foco/background/histórico ainda — Planos 04/06.

import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { TerminalView } from "../components/terminal/TerminalView";
import { useBoardStore } from "../stores/board-store";
import { useSessionStore } from "../stores/session-store";

export function DrawerRail() {
  const { t } = useTranslation("session");
  const projectRoot = useBoardStore((state) => state.project?.root ?? null);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const createSession = useSessionStore((state) => state.createSession);

  const label = t("actions.newSession");

  if (activeSessionId && projectRoot) {
    return (
      <aside
        style={{
          width: 640,
          flexShrink: 0,
          backgroundColor: "var(--color-secondary)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <TerminalView sessionId={activeSessionId} projectRoot={projectRoot} />
      </aside>
    );
  }

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
        disabled={!projectRoot}
        title={label}
        aria-label={label}
        onClick={() => createSession()}
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          color: "var(--color-foreground)",
          opacity: projectRoot ? 1 : 0.4,
          cursor: projectRoot ? "pointer" : "not-allowed",
          padding: 0,
        }}
      >
        <Plus size={20} aria-hidden="true" />
      </button>
    </aside>
  );
}
