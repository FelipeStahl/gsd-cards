// Seletor de idioma (DIST-01, 05-01-PLAN.md) — pill segmentada com
// exatamente dois segmentos fixos (PT | EN), 05-UI-SPEC.md `## Language
// Switcher`. NÃO é um botão-ciclo: mostrar os dois idiomas de uma vez (com o
// ativo preenchido) é mais discoverable para um projeto de comunidade
// bilíngue do que um único botão cujo estado "próximo" é implícito.
//
// Um componente, dois mount points (Header + HomeScreen, `AppShell.tsx`
// nunca monta os dois ao mesmo tempo porque `view` é mutuamente exclusiva) —
// o estado ativo é derivado GLOBALMENTE de `i18n.language`, nunca via props,
// então as duas instâncias sempre concordariam mesmo se ambas estivessem
// visíveis. Clicar dispara `i18n.changeLanguage` (re-render síncrono de todo
// consumidor `useTranslation`) e `setLanguage` fire-and-forget (persistência
// nunca bloqueia a UI, mesma disciplina de `notify.ts`).

import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { setLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "../persistence/app-store";

const CONTAINER_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 24,
  padding: 4,
  borderRadius: 999,
  border: "1px solid var(--color-secondary)",
  backgroundColor: "transparent",
  gap: 4,
};

/** `pt-BR` -> chave curta `pt` usada em `common.json` (`language.pt.*`/`language.en.*`). */
const NAMESPACE_KEY: Record<SupportedLanguage, "pt" | "en"> = {
  "pt-BR": "pt",
  en: "en",
};

function segmentStyle(isActive: boolean, isHovered: boolean): CSSProperties {
  return {
    padding: "4px 8px",
    border: "none",
    borderRadius: 999,
    fontSize: "var(--font-size-label)",
    lineHeight: "var(--line-height-label)",
    fontWeight: "var(--font-weight-label)",
    cursor: "pointer",
    backgroundColor: isActive ? "var(--color-accent)" : "transparent",
    color: isActive ? "#ffffff" : "var(--color-foreground)",
    opacity: isActive || isHovered ? 1 : 0.7,
  };
}

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation("common");
  const [hoveredLng, setHoveredLng] = useState<SupportedLanguage | null>(null);

  // `i18n.language` pode ser um valor fora do enum durante transições raras
  // (ex.: detector externo) — cai para pt-BR (o default de `i18n.init`) em
  // vez de deixar nenhum segmento marcado como ativo.
  const active: SupportedLanguage = (SUPPORTED_LANGUAGES as readonly string[]).includes(
    i18n.language,
  )
    ? (i18n.language as SupportedLanguage)
    : "pt-BR";

  function handleClick(next: SupportedLanguage) {
    void i18n.changeLanguage(next);
    void setLanguage(next);
  }

  return (
    <div
      role="group"
      aria-label={t("language.groupLabel")}
      data-slot="language-switcher"
      style={CONTAINER_STYLE}
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const isActive = lng === active;
        const nsKey = NAMESPACE_KEY[lng];
        const shortLabel = t(`language.${nsKey}.short`);
        const fullLabel = t(`language.${nsKey}.full`);

        return (
          <button
            key={lng}
            type="button"
            aria-pressed={isActive}
            title={fullLabel}
            aria-label={fullLabel}
            onClick={() => handleClick(lng)}
            onMouseEnter={() => setHoveredLng(lng)}
            onMouseLeave={() => setHoveredLng(null)}
            style={segmentStyle(isActive, hoveredLng === lng)}
          >
            {shortLabel}
          </button>
        );
      })}
    </div>
  );
}
