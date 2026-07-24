// Esqueleto de layout D-04: header fixo + sidebar 240px + área do board +
// drawer rail 48px. Quando nenhum projeto está aberto (ou a validação
// falhou), a área central mostra EmptyState/ErrorState ocupando o espaço
// inteiro — nunca um board com zero cards (PROJ-02).

import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";

import { ArtifactModal } from "../components/ArtifactModal";
import { DetailPanel } from "../components/DetailPanel";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { HomeScreen } from "../components/home/HomeScreen";
import { SessionSidebar } from "../components/session/SessionSidebar";
import { useBoardStore } from "../stores/board-store";
import { Board } from "./Board";
import { DrawerRail } from "./DrawerRail";
import { Header } from "./Header";

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
      // CR-01 fix: este handler também é usado pelo CTA "Abrir pasta" da
      // Home (`view === "home"` por default agora) — sem este `setView`,
      // uma falha de `openProject` (pasta não é projeto GSD, IoError etc.)
      // muda `status` para "error" mas o usuário permanece preso na Home,
      // nunca vendo o `ErrorState` correspondente (que só renderiza dentro
      // do ramo `view === "board"`). Mesma disciplina de `handleOpenRecent`
      // abaixo: SEMPRE troca para "board" após a tentativa, sucesso ou não.
      setView("board");
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
    return <HomeScreen onOpenFolder={handleOpenProject} onOpenRecent={handleOpenRecent} />;
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
