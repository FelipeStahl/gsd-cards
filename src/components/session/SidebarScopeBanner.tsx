// Faixa fina de escopo (PROJ-05, 04-05-PLAN.md) — 24px, no topo da
// `SessionSidebar`, acima do heading "Sessões". Torna legível a filtragem
// por `activeProjectRoot` que `SessionSidebar` agora aplica (corrige o bug
// pré-existente de mistura de sessões entre projetos — 04-RESEARCH.md
// Pitfall 1): sem esta faixa, o usuário não teria como distinguir "sessões
// de outro projeto escondidas de propósito" de "sessões perdidas".
// `04-UI-SPEC.md` ## Project Switcher.

import { useTranslation } from "react-i18next";

interface SidebarScopeBannerProps {
  projectName: string;
}

export function SidebarScopeBanner({ projectName }: SidebarScopeBannerProps) {
  const { t } = useTranslation("session");

  return (
    <div
      style={{
        height: 24,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        padding: "0 var(--spacing-md)",
        backgroundColor: "color-mix(in srgb, var(--color-secondary) 85%, var(--color-foreground))",
      }}
    >
      <span
        style={{
          fontSize: "var(--font-size-label)",
          lineHeight: "var(--line-height-label)",
          fontWeight: "var(--font-weight-label)",
          color: "var(--color-foreground)",
          opacity: 0.7,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {t("sidebar.scopeBanner", { projectName })}
      </span>
    </div>
  );
}
