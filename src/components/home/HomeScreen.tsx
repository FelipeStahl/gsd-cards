// Home — a "casa persistente" (04-04-PLAN.md). Substitui o esqueleto
// mínimo `HomeRecents` do Plano 01 pelo contrato completo do
// 04-UI-SPEC.md ## Home Screen — Layout: header 56px com duas CTAs
// right-aligned + grid responsivo de recentes (PROJ-01) ordenado por
// `lastOpened` desc (garantido pela própria ordem de `getRecents()`, nunca
// re-ordenado aqui), com saúde por card resolvida lazy/independentemente
// (`ProjectCard`, PROJ-06). Zero recentes renderiza `EmptyState` com as
// DUAS CTAs inline.

import { useEffect, useState } from "react";
import { FolderOpen, FolderPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CSSProperties } from "react";

import { EmptyState } from "../EmptyState";
import { getRecents, type RecentProjectEntry } from "../../persistence/app-store";
import { LanguageSwitcher } from "../../shell/LanguageSwitcher";
import { CreateProjectFlow } from "./CreateProjectFlow";
import { ProjectCard } from "./ProjectCard";

interface HomeScreenProps {
  /** Diálogo nativo de pasta + `openProject` — mesmo handler que o AppShell
   * já usa para o CTA do `EmptyState` em-projeto (reuso literal, não uma
   * segunda implementação do fluxo "abrir pasta"). */
  onOpenFolder: () => void | Promise<void>;
  /** `openProject(root)` + `setView("board")` — chamado quando o corpo de
   * um card saudável é clicado. */
  onOpenRecent: (root: string) => void | Promise<void>;
}

const ctaSecondaryStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-xs)",
  backgroundColor: "transparent",
  color: "var(--color-foreground)",
  border: "1px solid var(--color-secondary)",
  borderRadius: 6,
  padding: "var(--spacing-sm) var(--spacing-md)",
  fontSize: "var(--font-size-body)",
  lineHeight: "var(--line-height-body)",
  fontWeight: "var(--font-weight-heading)",
  cursor: "pointer",
};

const ctaPrimaryStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-xs)",
  backgroundColor: "var(--color-accent)",
  color: "#ffffff",
  border: "none",
  borderRadius: 6,
  padding: "var(--spacing-sm) var(--spacing-md)",
  fontSize: "var(--font-size-body)",
  lineHeight: "var(--line-height-body)",
  fontWeight: "var(--font-weight-heading)",
  cursor: "pointer",
};

export function HomeScreen({ onOpenFolder, onOpenRecent }: HomeScreenProps) {
  const { t } = useTranslation("home");
  const [recents, setRecents] = useState<RecentProjectEntry[]>([]);
  const [showCreateFlow, setShowCreateFlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getRecents().then((loaded) => {
      if (!cancelled) setRecents(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleRemoved(root: string) {
    setRecents((current) => current.filter((recent) => recent.root !== root));
  }

  const openFolderButton = (
    <button type="button" onClick={() => void onOpenFolder()} style={ctaSecondaryStyle}>
      <FolderOpen size={16} aria-hidden="true" />
      {t("actions.openFolder")}
    </button>
  );
  const newProjectButton = (
    <button type="button" onClick={() => setShowCreateFlow(true)} style={ctaPrimaryStyle}>
      <FolderPlus size={16} aria-hidden="true" />
      {t("actions.newProject")}
    </button>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "var(--color-dominant)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
          flexShrink: 0,
          padding: "0 var(--spacing-lg)",
          borderBottom: "1px solid var(--color-secondary)",
        }}
      >
        <h1
          style={{
            fontSize: "var(--font-size-heading)",
            lineHeight: "var(--line-height-heading)",
            fontWeight: "var(--font-weight-heading)",
            color: "var(--color-foreground)",
            margin: 0,
          }}
        >
          {t("heading")}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
          {openFolderButton}
          {newProjectButton}
          <LanguageSwitcher />
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "var(--spacing-xl)" }}>
        {recents.length === 0 ? (
          <EmptyState
            heading={t("empty.heading")}
            body={t("empty.body")}
            action={
              <div style={{ display: "flex", gap: "var(--spacing-sm)" }}>
                {openFolderButton}
                {newProjectButton}
              </div>
            }
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "var(--spacing-lg)",
            }}
          >
            {recents.map((recent) => (
              <ProjectCard
                key={recent.root}
                entry={recent}
                onOpen={onOpenRecent}
                onRemoved={handleRemoved}
              />
            ))}
          </div>
        )}
      </main>

      {showCreateFlow ? <CreateProjectFlow onClose={() => setShowCreateFlow(false)} /> : null}
    </div>
  );
}
