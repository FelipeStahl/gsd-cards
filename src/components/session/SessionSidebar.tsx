// SessionSidebar (SESS-01) substitui o `SidebarPlaceholder` — mesma coluna
// 240px fixa da Fase 1. Descobre as sessões do projeto aberto (histórico em
// disco, via `discoverSessions`) e as agrupa em "Ativas"/"Histórico",
// ordenadas por `lastModified` descendente; um grupo vazio não renderiza
// seu header. Zero sessões mostra o `EmptyState` genérico.
//
// PROJ-04 (Plano 04/Tarefa 2): quando `claude` (checagem global, uma única
// vez na primeira montagem — "boot") ou gsd-core (checagem por-projeto, via
// `ValidatedProject.hasGsdCore` já calculado na Fase 1, reavaliada a cada
// open/reopen) estão ausentes, o `ToolMissingState` substitui TODO o corpo
// abaixo do heading — e o botão "Nova sessão" nem é renderizado (Pitfall 6:
// nunca deixar o usuário descobrir a ausência só depois de tentar criar).
//
// Fase 4, Plano 06 (SESS-04): junto com `discoverSessions`, carrega os
// metadados de sessão PERSISTIDOS (`loadPersistedSessions`, escopados por
// `projectRoot`) — mesmo grupo visual "Histórico" que `origin:"historical"`
// (04-UI-SPEC.md ## Color: "restored" reusa a variante `historical`, nunca
// uma variante nova). O clique nesse grupo agora chama `resumeSession`
// (T-04-16 guard + snapshot rehidratado + `claude --resume`), substituindo
// o placeholder de hint da Fase 2 — a row em retomada (`activeSessionId`
// igual ao seu id, `origin` ainda não promovido para `live`) renderiza
// `variant="starting"` (mesmo pulse de uma sessão nova).

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "../EmptyState";
import { SessionRow } from "./SessionRow";
import { SidebarScopeBanner } from "./SidebarScopeBanner";
import { ToolMissingState } from "./ToolMissingState";
import { checkClaudeOnPath, deriveToolMissingState } from "../../dependencies/check";
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
  const projectName = useBoardStore((state) => state.project?.projectName ?? null);
  // Ausência de projeto aberto nunca deve, por si só, disparar o
  // ToolMissingState de gsd-core (esse é um sinal por-projeto) — default
  // "presente" até um projeto real ser validado.
  const hasGsdCore = useBoardStore((state) => state.project?.hasGsdCore ?? true);
  // PROJ-05 (04-05-PLAN.md, corrige 04-RESEARCH.md Pitfall 1): a sidebar
  // filtra por `activeProjectRoot`, nunca exibe `sessions[]` cru — sessão de
  // outro projeto aberto simultaneamente é escondida, não perdida.
  const activeProjectRoot = useBoardStore((state) => state.activeProjectRoot);
  const allSessions = useSessionStore((state) => state.sessions);
  const sessions = allSessions.filter((session) => session.projectRoot === activeProjectRoot);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const createSession = useSessionStore((state) => state.createSession);
  const focusSession = useSessionStore((state) => state.focusSession);
  const discoverSessions = useSessionStore((state) => state.discoverSessions);
  const loadPersistedSessions = useSessionStore((state) => state.loadPersistedSessions);
  const resumeSession = useSessionStore((state) => state.resumeSession);

  // Claude CLI (checagem GLOBAL, independente de projeto): só na primeira
  // montagem da sidebar (app boot), nunca por projeto.
  const [claudePath, setClaudePath] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void checkClaudeOnPath()
      .then((status) => {
        if (!cancelled) setClaudePath(status.claudePath);
      })
      .catch(() => {
        if (!cancelled) setClaudePath(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Descoberta de sessões históricas + carregamento de sessões restauradas
  // (SESS-04): reavalia a cada open/reopen de projeto (nunca antes de um
  // `projectRoot` já validado existir). As duas chamadas são independentes
  // (fontes de dado diferentes — `.jsonl` em disco vs. `app-state.json`) e
  // nunca spawnam um PtySession por si só.
  useEffect(() => {
    if (projectRoot) {
      void discoverSessions(projectRoot);
      void loadPersistedSessions(projectRoot);
    }
  }, [projectRoot, discoverSessions, loadPersistedSessions]);

  // Antes da primeira resolução de `checkClaudeOnPath` (`claudePath`
  // continua `undefined`), nunca afirma "ausente" preventivamente — só
  // decide a variante quando a checagem de fato responder.
  const toolMissing =
    claudePath === undefined ? "none" : deriveToolMissingState(claudePath, hasGsdCore);

  const activeSessions = sessions.filter((session) => session.origin === "live").sort(byLastModifiedDesc);
  // SESS-04: `restored` (metadado persistido de uma execução anterior) reusa
  // o MESMO grupo visual/variante `historical` de `origin:"historical"`
  // (.jsonl descoberto em disco) — 04-UI-SPEC.md ## Color não introduz uma
  // variante nova para isso, ambos significam "sem PtySession viva ainda".
  const historicalSessions = sessions
    .filter((session) => session.origin === "historical" || session.origin === "restored")
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
      {projectRoot && projectName ? <SidebarScopeBanner projectName={projectName} /> : null}
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
        {toolMissing === "none" ? (
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
        ) : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {toolMissing !== "none" ? (
          <ToolMissingState state={toolMissing} />
        ) : sessions.length === 0 ? (
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
                  <SessionRow
                    key={session.id}
                    session={session}
                    // SESS-04: a row sendo retomada agora (clicada, ainda sem
                    // PtySession viva — `origin` só é promovido a "live"
                    // depois que `resumeSession` termina o spawn) recebe o
                    // mesmo tratamento visual "starting" (pulse) de uma
                    // sessão nova, 04-UI-SPEC.md ## Color.
                    variant={session.id === activeSessionId ? "starting" : "historical"}
                    onSelect={(id) => void resumeSession(id).catch(() => {})}
                  />
                ))}
              </>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
