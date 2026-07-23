// Linha de sessão da SessionSidebar (SESS-01), 40px de altura. Este plano
// (04) só produz as variantes `live`/`historical` (as únicas que
// `session-store` sabe distinguir hoje); `starting`/`exited` já existem no
// tipo `SessionRowVariant` e no mapeamento de tom para não exigir rework
// quando o Plano 06 consumir o ciclo de vida real do PTY (evento de
// spawn/exit do backend).

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import type { Locale } from "date-fns";
import { useTranslation } from "react-i18next";

import { statusDotVariants, type StatusTone } from "../StatusBadge";
import type { SessionDescriptor } from "../../stores/session-store";

const DATE_FNS_LOCALE: Record<string, Locale> = {
  "pt-BR": ptBR,
  en: enUS,
};

export type SessionRowVariant = "live" | "historical" | "starting" | "exited";

/** Mapeamento variante -> tom do dot, replicando `## Color` do UI-SPEC. */
const TONE_BY_VARIANT: Record<SessionRowVariant, StatusTone> = {
  live: "success",
  starting: "accent",
  exited: "warning",
  historical: "neutral",
};

/** Janela de exibição do hint inline ao clicar uma row histórica (SESS-01). */
const HISTORICAL_HINT_TIMEOUT_MS = 2500;

interface SessionRowProps {
  session: SessionDescriptor;
  variant: SessionRowVariant;
  /** Sessão atualmente exibida no drawer expandido — 4px de borda esquerda accent + fundo um tom mais escuro. */
  active?: boolean;
  /** Chamado só para rows não-históricas (live) — marca a sessão como ativa/focada. */
  onSelect?: (sessionId: string) => void;
}

export function SessionRow({ session, variant, active = false, onSelect }: SessionRowProps) {
  const { t, i18n } = useTranslation("session");
  const [showHistoricalHint, setShowHistoricalHint] = useState(false);
  const hintTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (hintTimeoutRef.current !== undefined) {
        window.clearTimeout(hintTimeoutRef.current);
      }
    };
  }, []);

  const isHistorical = variant === "historical";
  const label = `${t("row.labelPrefix")} ${session.id.slice(0, 8)}`;
  const displayLabel = variant === "exited" ? `${label} ${t("row.exited")}` : label;
  const locale = DATE_FNS_LOCALE[i18n.language] ?? ptBR;
  const relativeTime =
    variant === "starting"
      ? t("row.starting")
      : session.lastModified
        ? formatDistanceToNow(session.lastModified, { addSuffix: true, locale })
        : "";

  function handleActivate() {
    if (isHistorical) {
      // Row histórica nunca abre o drawer (retomar chega na Fase 4) — só
      // mostra o hint inline transitoriamente.
      setShowHistoricalHint(true);
      if (hintTimeoutRef.current !== undefined) {
        window.clearTimeout(hintTimeoutRef.current);
      }
      hintTimeoutRef.current = window.setTimeout(
        () => setShowHistoricalHint(false),
        HISTORICAL_HINT_TIMEOUT_MS,
      );
      return;
    }
    onSelect?.(session.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleActivate();
    }
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
        title={session.id}
        style={{
          height: 40,
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-sm)",
          padding: "0 var(--spacing-md)",
          borderLeft: active ? "4px solid var(--color-accent)" : "4px solid transparent",
          backgroundColor: active
            ? "color-mix(in srgb, var(--color-secondary) 85%, var(--color-foreground))"
            : "transparent",
          cursor: isHistorical ? "default" : "pointer",
        }}
      >
        <span
          className={[
            statusDotVariants({ tone: TONE_BY_VARIANT[variant] }),
            isHistorical ? "status-dot--outline" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
        />
        <span
          style={{
            fontFamily: "var(--font-family-mono)",
            fontSize: "var(--font-size-label)",
            lineHeight: "var(--line-height-label)",
            fontWeight: "var(--font-weight-label)",
            color: "var(--color-foreground)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {displayLabel}
        </span>
        <span
          style={{
            fontSize: "var(--font-size-label)",
            lineHeight: "var(--line-height-label)",
            fontWeight: "var(--font-weight-label)",
            color: "var(--color-foreground)",
            opacity: 0.7,
            flexShrink: 0,
          }}
        >
          {relativeTime}
        </span>
      </div>
      {isHistorical && showHistoricalHint ? (
        <div
          role="status"
          style={{
            fontSize: "var(--font-size-label)",
            lineHeight: "var(--line-height-label)",
            padding: "0 var(--spacing-md) var(--spacing-xs)",
            color: "var(--color-foreground)",
            opacity: 0.75,
          }}
        >
          {t("row.historicalTooltip")}
        </div>
      ) : null}
    </div>
  );
}
