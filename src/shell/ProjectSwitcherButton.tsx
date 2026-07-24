// Controle Home/voltar do Header (04-03-PLAN.md, PROJ-05) — 32×32,
// icon-only, `ChevronLeft` (04-UI-SPEC.md `## Project Switcher`). Clicar
// SEMPRE chama `setView("home")`, nunca `closeProject`: 04-CONTEXT.md
// garante que trocar/voltar para a home não mata nenhuma sessão de nenhum
// projeto aberto, então este botão nunca mostra confirmação de fechamento —
// a home em si é o "trocador" (grid de recentes) para abrir outro projeto.

import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useBoardStore } from "../stores/board-store";

export function ProjectSwitcherButton() {
  const { t } = useTranslation("common");
  const setView = useBoardStore((state) => state.setView);
  const [hovered, setHovered] = useState(false);

  const label = t("actions.backToHome");

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => setView("home")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 32,
        height: 32,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "none",
        border: "none",
        borderRadius: 4,
        color: hovered ? "var(--color-accent)" : "var(--color-foreground)",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <ChevronLeft size={20} aria-hidden="true" />
    </button>
  );
}
