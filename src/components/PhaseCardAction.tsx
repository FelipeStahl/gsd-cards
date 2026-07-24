// Botão de ação contextual de fase (ACT-01/ACT-02) — a única superfície de
// injeção deste plano. Consome `derivePhaseAction`/`sanitizePhaseId`
// (`../planning/actions`) e escreve no terminal via `writeSession`
// (`../pty/channel`). Reaproveitado por `PhaseCard` (Row 2, este plano) e,
// futuramente, `DetailPanel` (variant="detail") — daí o componente
// compartilhado em vez de duplicar a lógica de três estados em cada card.
//
// Alvo de injeção: `activeSessionId ?? lastFocusedSessionId`, filtrado a uma
// sessão com `origin === "live"` (`session-store.ts:67-95`) — uma sessão
// histórica nunca tem processo real para escrever.
//
// T-03-01: um `phase.id` que falha `sanitizePhaseId` nunca produz um botão —
// mesmo tratamento do status `complete` (`derivePhaseAction` retorna null).
// Nunca um "melhor esforço" com o id cru.
//
// T-03-02: todo `writeSession` é `.catch()`ado — uma rejeição (sessão morta/
// IPC falhou) nunca é engolida silenciosamente; surge como
// `board.actions.error.injectFailed`, mensagem transitória (mesmo padrão
// `showHistoricalHint`/`HISTORICAL_HINT_TIMEOUT_MS` de `SessionRow.tsx`), e o
// botão volta ao estado habilitado normal — nunca fica travado desabilitado.
//
// Este plano trata qualquer sessão live encontrada como ociosa (o guard de
// ocupado/aguardando permissão chega no Plano 04, via activity state).

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { CheckCircle2, ClipboardList, FastForward, MessageSquare, Play, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { derivePhaseAction, sanitizePhaseId, type PhaseAction } from "../planning/actions";
import { writeSession } from "../pty/channel";
import { useSessionStore } from "../stores/session-store";
import type { PhaseModel } from "../planning/model";

const ICON_BY_NAME: Record<PhaseAction["icon"], LucideIcon> = {
  MessageSquare,
  ClipboardList,
  Play,
  FastForward,
  CheckCircle2,
};

/** Janela do hint/erro transitório (mesmo valor de `SessionRow.HISTORICAL_HINT_TIMEOUT_MS`). */
const TRANSIENT_MESSAGE_TIMEOUT_MS = 2500;

/**
 * `PhaseAction.labelKey` carrega o prefixo `board.` por documentação (mesma
 * grafia da coluna "i18n key" de `03-UI-SPEC.md` ## Copywriting Contract) —
 * mas `useTranslation("board")` já escopa a busca ao namespace `board`, cujo
 * JSON não tem um nível `board` aninhado por dentro de si mesmo (mesmo
 * padrão de `StatusBadge.tsx`'s `t(\`status.\${status}\`)`, sem prefixo).
 * Remove o prefixo redundante antes de repassar a `t()`.
 */
function stripNamespacePrefix(key: string): string {
  return key.startsWith("board.") ? key.slice("board.".length) : key;
}

interface PhaseCardActionProps {
  phase: PhaseModel;
  /** `card` (Row 2 do `PhaseCard`, 24px) vs `detail` (`DetailPanel`, 32px — consumido a partir de um plano futuro). */
  variant?: "card" | "detail";
  style?: CSSProperties;
}

export function PhaseCardAction({ phase, variant = "card", style }: PhaseCardActionProps) {
  const { t } = useTranslation("board");
  const [showError, setShowError] = useState(false);
  const errorTimeoutRef = useRef<number | undefined>(undefined);

  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const lastFocusedSessionId = useSessionStore((state) => state.lastFocusedSessionId);
  const sessions = useSessionStore((state) => state.sessions);

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current !== undefined) {
        window.clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  const action = derivePhaseAction(phase.diskStatus);
  const sanitizedId = sanitizePhaseId(phase.id);

  // `complete` (action null) e um id que falha a validação (T-03-01) nunca
  // renderizam botão algum — nunca um "melhor esforço" com o id cru, nunca
  // espaço reservado vazio.
  if (!action || !sanitizedId) return null;

  const targetSessionId = activeSessionId ?? lastFocusedSessionId;
  const target = sessions.find((session) => session.id === targetSessionId && session.origin === "live");
  const hasTarget = Boolean(target);

  const Icon = ICON_BY_NAME[action.icon];
  const isDetail = variant === "detail";

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!target || !action || !sanitizedId) return;
    void writeSession(target.id, action.command(sanitizedId) + "\r").catch(() => {
      setShowError(true);
      if (errorTimeoutRef.current !== undefined) {
        window.clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = window.setTimeout(() => setShowError(false), TRANSIENT_MESSAGE_TIMEOUT_MS);
    });
  }

  const baseStyle: CSSProperties = isDetail
    ? {
        height: 32,
        padding: "var(--spacing-sm) var(--spacing-md)",
        borderRadius: 6,
        fontSize: "var(--font-size-body)",
        lineHeight: "var(--line-height-body)",
        fontWeight: "var(--font-weight-heading)",
        gap: "var(--spacing-xs)",
      }
    : {
        height: 24,
        padding: "var(--spacing-xs) var(--spacing-sm)",
        borderRadius: 4,
        fontSize: "var(--font-size-label)",
        lineHeight: "var(--line-height-label)",
        fontWeight: "var(--font-weight-label)",
        gap: "var(--spacing-xs)",
      };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", ...style }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={!hasTarget}
        title={hasTarget ? undefined : t("actions.guard.noSession")}
        style={{
          ...baseStyle,
          display: "inline-flex",
          alignItems: "center",
          border: hasTarget ? "none" : "1px solid var(--color-secondary)",
          backgroundColor: hasTarget ? "var(--color-accent)" : "transparent",
          color: hasTarget ? "#ffffff" : "var(--color-foreground)",
          opacity: hasTarget ? 1 : 0.4,
          cursor: hasTarget ? "pointer" : "not-allowed",
          flexShrink: 0,
        }}
      >
        <Icon size={isDetail ? 16 : 14} aria-hidden="true" />
        {t(stripNamespacePrefix(action.labelKey))}
      </button>
      {showError ? (
        <span
          role="status"
          style={{
            fontSize: "var(--font-size-label)",
            lineHeight: "var(--line-height-label)",
            color: "var(--color-warning)",
            marginTop: "var(--spacing-xs)",
          }}
        >
          {t("actions.error.injectFailed")}
        </span>
      ) : null}
    </span>
  );
}
