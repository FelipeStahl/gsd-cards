// SessionSidebar (SESS-01) substitui o `SidebarPlaceholder` — mesma coluna
// 240px fixa da Fase 1. Descobre as sessões do projeto aberto (histórico em
// disco, via `discoverSessions`) e as agrupa em "Ativas"/"Histórico",
// ordenadas por `lastModified` descendente; um grupo vazio não renderiza
// seu header. Zero sessões mostra o `EmptyState` genérico. O bloqueio de
// criação quando `claude`/gsd-core estão ausentes (PROJ-04,
// `ToolMissingState`) é adicionado no Plano 04/Tarefa 2, sobre este mesmo
// arquivo.

import { useEffect } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "../EmptyState";
import { SessionRow } from "./SessionRow";
import { useBoardStore } from "../../stores/board-store";
import { useSessionStore, type SessionDescriptor } from "../../stores/session-store";

function byLastModifiedDesc(a: SessionDescriptor, b: SessionDescriptor): number {
  const aTime = a.lastModified ? a.lastModified.getTime() : 0;
  const bTime = b.lastModified ? b.lastModified.getTime() : 0;
  return bTime - aTime;
}

const GROUP_LABEL_STYLE = {
  fontSize: "var(--font-size-label)",
  lineHeight: "var(--line-height-label)",
  fontWeight: "var(--font-weight-label)",
  color: "var(--color-foreground)",
  opacity: 0.6,
  textTransform: "uppercase" as const,
  padding: "var(--spacing-sm) var(--spacing-md) var(--spacing-xs)",
  margin: 0,
};

export function SessionSidebar() {
  const { t } = useTranslation("session");
  const projectRoot = useBoardStore((state) => state.project?.root ?? null);
  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const createSession = useSessionStore((state) => state.createSession);
  const focusSession = useSessionStore((state) => state.focusSession);
  const discoverSessions = useSessionStore((state) => state.discoverSessions);

  // Descoberta de sessões históricas: reavalia a cada open/reopen de
  // projeto (nunca antes de um `projectRoot` já validado existir).
  useEffect(() => {
    if (projectRoot) {
      void discoverSessions(projectRoot);
    }
  }, [projectRoot, discoverSessions]);

  const activeSessions = sessions.filter((session) => session.origin === "live").sort(byLastModifiedDesc);
  const historicalSessions = sessions
    .filter((session) => session.origin === "historical")
    .sort(byLastModifiedDesc);

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        backgroundColor: "var(--color-secondary)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--spacing-sm)",
          padding: "var(--spacing-md)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--font-size-heading)",
            lineHeight: "var(--line-height-heading)",
            fontWeight: "var(--font-weight-heading)",
            color: "var(--color-foreground)",
            margin: 0,
          }}
        >
          {t("sidebar.heading")}
        </h2>
        <button
          type="button"
          disabled={!projectRoot}
          onClick={() => createSession()}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--spacing-xs)",
            backgroundColor: "var(--color-accent)",
            color: "#ffffff",
            border: "none",
            borderRadius: 6,
            padding: "var(--spacing-sm) var(--spacing-md)",
            fontSize: "var(--font-size-body)",
            lineHeight: "var(--line-height-body)",
            fontWeight: "var(--font-weight-heading)",
            cursor: projectRoot ? "pointer" : "not-allowed",
            opacity: projectRoot ? 1 : 0.5,
          }}
        >
          <Plus size={16} aria-hidden="true" />
          {t("actions.newSession")}
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {sessions.length === 0 ? (
          <EmptyState heading={t("empty.heading")} body={t("empty.body")} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {activeSessions.length > 0 ? (
              <>
                <p style={GROUP_LABEL_STYLE}>{t("sidebar.groups.active")}</p>
                {activeSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    variant="live"
                    active={session.id === activeSessionId}
                    onSelect={focusSession}
                  />
                ))}
              </>
            ) : null}
            {historicalSessions.length > 0 ? (
              <>
                <p style={GROUP_LABEL_STYLE}>{t("sidebar.groups.history")}</p>
                {historicalSessions.map((session) => (
                  <SessionRow key={session.id} session={session} variant="historical" />
                ))}
              </>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
