// Sidebar 240px fixos, sem interação nesta fase — o Plano 2 (sessões do
// Claude CLI) preenche este espaço.

import { useTranslation } from "react-i18next";

export function SidebarPlaceholder() {
  const { t } = useTranslation("project");

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        backgroundColor: "var(--color-secondary)",
        padding: "var(--spacing-md)",
      }}
    >
      <p
        style={{
          fontSize: "var(--font-size-body)",
          lineHeight: "var(--line-height-body)",
          fontWeight: "var(--font-weight-body)",
          color: "var(--color-foreground)",
          opacity: 0.6,
          margin: 0,
        }}
      >
        {t("sidebar.comingSoon")}
      </p>
    </aside>
  );
}
