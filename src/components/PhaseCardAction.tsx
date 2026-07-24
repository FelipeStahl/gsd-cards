// Botão de ação contextual de fase (ACT-01/ACT-02/ACT-03) — a superfície de
// injeção reaproveitada por `PhaseCard` (Row 2) e `DetailPanel`
// (variant="detail"). Consome `derivePhaseAction`/`sanitizePhaseId`
// (`../planning/actions`) + `resolveInjection` (`../planning/injection`,
// Plano 04) para decidir enviar/pré-preencher/bloquear/desabilitar, e escreve
// no terminal via `writeSession` (`../pty/channel`).
//
// Alvo de injeção: `activeSessionId ?? lastFocusedSessionId`, filtrado a uma
// sessão com `origin === "live"` (`session-store.ts:67-95`) — uma sessão
// histórica nunca tem processo real para escrever. A atividade desse alvo
// (`SessionDescriptor.activity`, Plano 03 — `undefined` até a primeira
// classificação) é o que `resolveInjection` usa para decidir o modo.
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
// T-03-03: `resolveInjection` retorna `blocked`/`payload:null` para
// atividade `busy` — o botão fica desabilitado e o clique NUNCA chama
// `writeSession` (bloquear, nunca enfileirar).

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { CheckCircle2, ClipboardList, FastForward, MessageSquare, Play, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { derivePhaseAction, sanitizePhaseId, type PhaseAction } from "../planning/actions";
import { resolveInjection } from "../planning/injection";
import { writeSession } from "../pty/channel";
import { useSessionStore } from "../stores/session-store";
import type { PhaseModel } from "../planning/model";
import { focusTerminalSurface } from "./terminal/GsdCommandToolbar";

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
 * `PhaseAction.labelKey`/`InjectionResolution.guardKey` carregam o prefixo
 * `board.` por documentação (mesma grafia da coluna "i18n key" de
 * `03-UI-SPEC.md` ## Copywriting Contract) — mas `useTranslation("board")` já
 * escopa a busca ao namespace `board`, cujo JSON não tem um nível `board`
 * aninhado por dentro de si mesmo (mesmo padrão de `StatusBadge.tsx`'s
 * `t(\`status.\${status}\`)`, sem prefixo). Remove o prefixo redundante antes
 * de repassar a `t()`.
 */
function stripNamespacePrefix(key: string): string {
  return key.startsWith("board.") ? key.slice("board.".length) : key;
}

interface PhaseCardActionProps {
  phase: PhaseModel;
  /** `card` (Row 2 do `PhaseCard`, 24px) vs `detail` (`DetailPanel`, 32px). */
  variant?: "card" | "detail";
  style?: CSSProperties;
}

export function PhaseCardAction({ phase, variant = "card", style }: PhaseCardActionProps) {
  const { t } = useTranslation("board");
  const [transientMessage, setTransientMessage] = useState<"prefilled" | "error" | null>(null);
  const messageTimeoutRef = useRef<number | undefined>(undefined);

  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const lastFocusedSessionId = useSessionStore((state) => state.lastFocusedSessionId);
  const sessions = useSessionStore((state) => state.sessions);

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current !== undefined) {
        window.clearTimeout(messageTimeoutRef.current);
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
  const hasLiveTarget = Boolean(target);

  const resolution = resolveInjection({
    command: action.command(sanitizedId),
    kind: "phase",
    activity: target?.activity,
    hasLiveTarget,
  });

  const Icon = ICON_BY_NAME[action.icon];
  const isDetail = variant === "detail";
  const isSend = resolution.mode === "send";
  const isPrefill = resolution.mode === "prefill";
  const isDisabled = resolution.mode === "blocked" || resolution.mode === "unavailable";

  function showTransientMessage(kind: "prefilled" | "error") {
    setTransientMessage(kind);
    if (messageTimeoutRef.current !== undefined) {
      window.clearTimeout(messageTimeoutRef.current);
    }
    messageTimeoutRef.current = window.setTimeout(() => setTransientMessage(null), TRANSIENT_MESSAGE_TIMEOUT_MS);
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!target || isDisabled || resolution.payload === null) return;
    void writeSession(target.id, resolution.payload).catch(() => {
      showTransientMessage("error");
    });
    if (isPrefill) {
      showTransientMessage("prefilled");
      // IN-02: mesma disciplina de `GsdCommandToolbar.handleCommandClick`/
      // `CommandPalette.activateEntry` — devolve o foco ao terminal depois
      // de um prefill para que o usuário possa apertar Enter imediatamente,
      // sem precisar clicar manualmente na superfície do xterm primeiro.
      focusTerminalSurface();
    }
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
        disabled={isDisabled}
        title={isDisabled && resolution.guardKey ? t(stripNamespacePrefix(resolution.guardKey)) : undefined}
        style={{
          ...baseStyle,
          display: "inline-flex",
          alignItems: "center",
          border: isPrefill
            ? "1px solid var(--color-accent)"
            : isDisabled
              ? "1px solid var(--color-secondary)"
              : "none",
          backgroundColor: isSend ? "var(--color-accent)" : "transparent",
          color: isSend ? "#ffffff" : isPrefill ? "var(--color-accent)" : "var(--color-foreground)",
          opacity: isDisabled ? 0.4 : 1,
          cursor: isDisabled ? "not-allowed" : "pointer",
          flexShrink: 0,
        }}
      >
        <Icon size={isDetail ? 16 : 14} aria-hidden="true" />
        {t(stripNamespacePrefix(action.labelKey))}
      </button>
      {transientMessage ? (
        <span
          role="status"
          style={{
            fontSize: "var(--font-size-label)",
            lineHeight: "var(--line-height-label)",
            color: transientMessage === "error" ? "var(--color-warning)" : "var(--color-foreground)",
            opacity: transientMessage === "prefilled" ? 0.75 : 1,
            marginTop: "var(--spacing-xs)",
          }}
        >
          {transientMessage === "error" ? t("actions.error.injectFailed") : t("actions.guard.prefilled")}
        </span>
      ) : null}
    </span>
  );
}
