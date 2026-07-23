// Indicador de saúde da sincronização (D-14, D-16): ponto de 8px + rótulo no
// header. A regra de honestidade é o ponto inteiro do componente — enquanto
// degradado, NUNCA mostra "sincronizado há X"; o espelho nunca finge estar
// vivo. A retentativa automática (board-store) acontece em background sem
// mudar a apresentação — o indicador só volta a saudável quando a
// reconexão de fato funciona.

import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import type { Locale } from "date-fns";

import { useBoardStore } from "../stores/board-store";
import { statusDotVariants } from "./StatusBadge";

const DATE_FNS_LOCALE: Record<string, Locale> = {
  "pt-BR": ptBR,
  en: enUS,
};

const LABEL_STYLE: CSSProperties = {
  fontSize: "var(--font-size-label)",
  lineHeight: "var(--line-height-label)",
  fontWeight: "var(--font-weight-label)",
  color: "var(--color-foreground)",
  opacity: 0.75,
  whiteSpace: "nowrap",
};

export function SyncIndicator() {
  const { t, i18n } = useTranslation("sync");
  const project = useBoardStore((state) => state.project);
  const sync = useBoardStore((state) => state.sync);
  const reconnectWatcher = useBoardStore((state) => state.reconnectWatcher);

  // Recalcula "sincronizado há Xs" a cada segundo enquanto saudável — o
  // valor em si vem de `Date.now() - lastSyncedAt`, este estado só força o
  // re-render (D-14).
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (sync.state !== "healthy") return undefined;
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [sync.state]);

  // idle (nenhum projeto aberto): o indicador não é renderizado (D-14).
  if (!project || sync.state === "idle") {
    return null;
  }

  if (sync.state === "degraded") {
    const locale = DATE_FNS_LOCALE[i18n.language] ?? enUS;
    const time = sync.degradedSince
      ? format(sync.degradedSince, "HH:mm", { locale })
      : "--:--";

    return (
      <div
        data-slot="sync-indicator"
        style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}
      >
        <span className={statusDotVariants({ tone: "warning" })} aria-hidden="true" />
        <span title={t("stale.body")} style={LABEL_STYLE}>
          {t("stale.label", { time })}
        </span>
        <button
          type="button"
          onClick={() => void reconnectWatcher()}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--color-accent)",
            fontSize: "var(--font-size-label)",
            lineHeight: "var(--line-height-label)",
            fontWeight: "var(--font-weight-label)",
          }}
        >
          {t("actions.reconnect")}
        </button>
      </div>
    );
  }

  const seconds = sync.lastSyncedAt
    ? Math.max(0, Math.floor((Date.now() - sync.lastSyncedAt) / 1000))
    : 0;

  return (
    <div
      data-slot="sync-indicator"
      style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}
    >
      <span className={statusDotVariants({ tone: "success" })} aria-hidden="true" />
      <span style={LABEL_STYLE}>{t("healthy.label", { seconds })}</span>
    </div>
  );
}
