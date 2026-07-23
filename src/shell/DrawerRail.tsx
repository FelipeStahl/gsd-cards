// Drawer rail de 48px, recolhido nesta fase — ícone de terminal desabilitado
// com tooltip apontando para a Fase 2, onde o terminal real é construído.

import { TerminalSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

export function DrawerRail() {
  const { t } = useTranslation("project");
  const label = t("drawer.terminalComingSoon");

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
        disabled
        title={label}
        aria-label={label}
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          color: "var(--color-foreground)",
          opacity: 0.4,
          cursor: "not-allowed",
          padding: 0,
        }}
      >
        <TerminalSquare size={20} aria-hidden="true" />
      </button>
    </aside>
  );
}
