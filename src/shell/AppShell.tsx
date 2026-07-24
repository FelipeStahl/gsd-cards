// Esqueleto de layout D-04: header fixo + sidebar 240px + área do board +
// drawer rail 48px. Quando nenhum projeto está aberto (ou a validação
// falhou), a área central mostra EmptyState/ErrorState ocupando o espaço
// inteiro — nunca um board com zero cards (PROJ-02).

import { useEffect, useState } from "react";

import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";

import { ArtifactModal } from "../components/ArtifactModal";
import { DetailPanel } from "../components/DetailPanel";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { SessionSidebar } from "../components/session/SessionSidebar";
import { getRecents, type RecentProjectEntry } from "../persistence/app-store";
import { useBoardStore } from "../stores/board-store";
import { Board } from "./Board";
import { DrawerRail } from "./DrawerRail";
import { Header } from "./Header";

/**
 * Ramo mínimo da home (04-01-PLAN.md, tracer da Fase 4): lê `getRecents()`
 * uma vez ao montar e renderiza cada recente como botão clicável. O grid de
 * `ProjectCard`/saúde por projeto/estado de carregamento chega no Plano
 * 04-04 — esta função é deliberadamente um esqueleto funcional, não o
 * layout final do UI-SPEC, provando só o loop persistência→leitura→render.
 */
function HomeRecents({ onOpenRecent }: { onOpenRecent: (root: string) => void }) {
  const { t } = useTranslation("home");
  const [recents, setRecents] = useState<RecentProjectEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getRecents().then((loaded) => {
      if (!cancelled) setRecents(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--spacing-md)",
        padding: "var(--spacing-xl)",
      }}
    >
      <h2 style={{ fontSize: "var(--font-size-heading)", fontWeight: "var(--font-weight-heading)" }}>
        {t("heading")}
      </h2>
      {recents.map((recent) => (
        <button
          key={recent.root}
          type="button"
          onClick={() => onOpenRecent(recent.root)}
          style={{
            textAlign: "left",
            backgroundColor: "var(--color-secondary)",
            color: "var(--color-foreground)",
            border: "none",
            borderRadius: 8,
            padding: "var(--spacing-md)",
            cursor: "pointer",
          }}
        >
          {recent.name}
        </button>
      ))}
    </div>
  );
}

export function AppShell() {
  const { t } = useTranslation("project");
  const status = useBoardStore((state) => state.status);
  const error = useBoardStore((state) => state.error);
  const view = useBoardStore((state) => state.view);
  const openProject = useBoardStore((state) => state.openProject);
  const setView = useBoardStore((state) => state.setView);

  async function handleOpenProject() {
    // Único caminho que entra no app: o escolhido pelo diálogo nativo — nunca
    // um caminho digitado ou construído no frontend.
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      await openProject(selected);
    }
  }

  async function handleOpenRecent(root: string) {
    await openProject(root);
    setView("board");
  }

  if (view === "home") {
    // Home substitui o shell inteiro (Header/SessionSidebar/DrawerRail não
    // montam) — Pattern 1 de 04-RESEARCH.md, curto-circuita ANTES do
    // ternário `status` abaixo.
    return <HomeRecents onOpenRecent={handleOpenRecent} />;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "var(--color-dominant)",
      }}
    >
      <Header />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <SessionSidebar />
        <main
          style={{
            flex: 1,
            minWidth: 1024,
            overflowX: "auto",
            backgroundColor: "var(--color-dominant)",
            padding: "var(--spacing-xl)",
          }}
        >
          {status === "open" ? (
            <Board />
          ) : status === "error" ? (
            <ErrorState
              heading={
                error?.kind === "NotAGsdProject"
                  ? t("error.notGsd.heading")
                  : t("error.generic.heading")
              }
              body={
                error?.kind === "NotAGsdProject"
                  ? t("error.notGsd.body")
                  : t("error.generic.body", { message: error?.message ?? "" })
              }
            />
          ) : (
            <EmptyState
              heading={t("empty.heading")}
              body={t("empty.body")}
              action={
                <button
                  type="button"
                  onClick={handleOpenProject}
                  style={{
                    backgroundColor: "var(--color-accent)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 6,
                    padding: "var(--spacing-sm) var(--spacing-lg)",
                    fontSize: "var(--font-size-body)",
                    lineHeight: "var(--line-height-body)",
                    fontWeight: "var(--font-weight-heading)",
                    cursor: "pointer",
                  }}
                >
                  {t("actions.open")}
                </button>
              }
            />
          )}
        </main>
        <DrawerRail />
      </div>
      <DetailPanel />
      <ArtifactModal />
    </div>
  );
}
