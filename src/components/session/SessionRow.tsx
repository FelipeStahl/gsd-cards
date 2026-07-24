// Linha de sessão da SessionSidebar (SESS-01), 40px de altura. Plano 04 só
// produzia as variantes `live`/`historical`; `starting`/`exited` já
// existiam no tipo `SessionRowVariant` e no mapeamento de tom para não
// exigir rework quando o Plano 06 consumisse o ciclo de vida real do PTY.
//
// Fase 2/Plano 05 adicionaram as affordances de ciclo de vida (SESS-06):
// botões Archive/Trash2 32×32 visíveis só no hover da row (`.session-row`/
// `.session-row__actions` em `theme.css`). Arquivar mata a árvore de
// processos e remove a row sem confirmação; Excluir abre o `ConfirmDialog`
// primeiro. As duas chamam `archiveSession` do `session-store` — mesma
// ação, só a confirmação de UI muda (`02-UI-SPEC.md` ## Session Lifecycle
// Affordances). Nenhuma das duas toca o `.jsonl` de histórico do Claude
// Code (Pitfall 5 de `02-RESEARCH.md`) — a cópia do `ConfirmDialog` deixa
// isso explícito ao usuário.
//
// Fase 3, Plano 04 (ACT-03): o dot da row `variant === "live"` fica
// dinâmico via `ActivityDot` quando `session.activity` já foi observado
// nesta execução — substitui o `success` estático herdado da Fase 2
// (`03-UI-SPEC.md` ## Color "Supersedes note"). `starting`/`exited`/
// `historical` são inafetados.
//
// Fase 4, Plano 06 (SESS-04): uma row `historical` (que agora também
// engloba sessões `origin:"restored"` — ver `SessionSidebar.tsx`) ganha um
// ícone `History` (14px, muted) à esquerda do timestamp, substituindo o
// hollow-dot como único sinal de "não-live". Clicar a row agora RETOMA de
// verdade (`onSelect?.(id)` chama `resumeSession` — nunca mais um hint
// transitório de placeholder): o comportamento de clique é o MESMO para
// todas as variantes, o pai (`SessionSidebar`) decide se `onSelect` é
// `focusSession` (live) ou `resumeSession` (historical/restored). A cópia
// retirada `session.row.historicalTooltip` fica presa no arquivo de i18n
// (dead key, nunca deletada) — o hover-tooltip do ícone `History` usa
// `session.row.restoredTooltip` agora.

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { Archive, History, Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import type { Locale } from "date-fns";
import { useTranslation } from "react-i18next";

import { statusDotVariants, type StatusTone } from "../StatusBadge";
import { ActivityDot } from "../ActivityDot";
import { useSessionStore, type SessionDescriptor } from "../../stores/session-store";
import { ConfirmDialog } from "./ConfirmDialog";
import { RenameSessionControl } from "./RenameSessionControl";

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

interface SessionRowProps {
  session: SessionDescriptor;
  variant: SessionRowVariant;
  /** Sessão atualmente exibida no drawer expandido — 4px de borda esquerda accent + fundo um tom mais escuro. */
  active?: boolean;
  /** Chamado ao clicar a row — `focusSession` para rows `live`, `resumeSession` (SESS-04) para `historical`/rows restauradas. */
  onSelect?: (sessionId: string) => void;
}

export function SessionRow({ session, variant, active = false, onSelect }: SessionRowProps) {
  const { t, i18n } = useTranslation("session");
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const archiveSession = useSessionStore((state) => state.archiveSession);

  const isHistorical = variant === "historical";
  // Arquivar/Excluir só fazem sentido para sessões desta execução (SESS-06
  // fala de matar árvore de processos — uma row histórica não tem
  // `PtySession` viva a matar; escondê-la aqui só a faria reaparecer no
  // próximo `discoverSessions`, já que o `.jsonl` continua intacto).
  const showLifecycleActions = !isHistorical;

  function handleArchiveClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    // Sem confirmação (02-UI-SPEC.md ## Session Lifecycle Affordances).
    void archiveSession(session.id);
  }

  function handleDeleteClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setShowConfirmDelete(true);
  }

  function handleConfirmDelete() {
    setShowConfirmDelete(false);
    void archiveSession(session.id);
  }

  function handleCancelDelete() {
    setShowConfirmDelete(false);
  }

  function handleRenameClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setIsRenaming(true);
  }

  // Nome customizado (SESS-05) substitui o label derivado em todo lugar que
  // o label aparece — o id continua disponível via `title` (fallback de
  // desambiguação, nunca escondido, 04-UI-SPEC.md ## Rename Session passo 5).
  const derivedLabel = `${t("row.labelPrefix")} ${session.id.slice(0, 8)}`;
  const label = session.name ?? derivedLabel;
  const displayLabel = variant === "exited" ? `${label} ${t("row.exited")}` : label;
  const locale = DATE_FNS_LOCALE[i18n.language] ?? ptBR;
  const relativeTime =
    variant === "starting"
      ? t("row.starting")
      : session.lastModified
        ? formatDistanceToNow(session.lastModified, { addSuffix: true, locale })
        : "";

  function handleActivate() {
    // SESS-04: clicar QUALQUER variante chama `onSelect` — o pai
    // (`SessionSidebar`) decide se isso é `focusSession` (live) ou
    // `resumeSession` (historical/restaurada). Retomar substitui o
    // placeholder de hint-transitório da Fase 2.
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
        className="session-row"
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
          cursor: "pointer",
        }}
      >
        {variant === "live" && session.activity ? (
          // Plano 04 (Fase 3, ACT-03) — dot da row `live` fica dinâmico
          // quando a atividade já foi observada nesta execução, substituindo
          // o `success` estático da Fase 2 (`03-UI-SPEC.md` ## Color
          // "Supersedes note"). `starting`/`exited`/`historical` são
          // inafetados — só `live` consome `ActivityDot`.
          <ActivityDot activity={session.activity} />
        ) : (
          <span
            className={[
              statusDotVariants({ tone: TONE_BY_VARIANT[variant] }),
              isHistorical ? "status-dot--outline" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
          />
        )}
        {isRenaming ? (
          <RenameSessionControl
            sessionId={session.id}
            initialValue={session.name ?? ""}
            onDone={() => setIsRenaming(false)}
          />
        ) : (
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
        )}
        {!isRenaming && isHistorical ? (
          // SESS-04 (04-06-PLAN.md, 04-UI-SPEC.md ## Color): sinal visual de
          // "histórico restaurado, lazily resumível" — substitui o hollow
          // dot como único indicador de "não-live". `title` no `<span>`
          // wrapper (lucide-react não aceita `title` diretamente — mesmo
          // padrão de tooltip nativo dos botões de ação abaixo).
          <span title={t("row.restoredTooltip")} style={{ display: "flex", flexShrink: 0 }}>
            <History size={14} aria-hidden="true" style={{ color: "var(--color-foreground)", opacity: 0.6 }} />
          </span>
        ) : null}
        {!isRenaming ? (
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
        ) : null}
        {showLifecycleActions && !isRenaming ? (
          <span className="session-row__actions" style={{ display: "flex", flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleRenameClick}
              aria-label={t("actions.rename")}
              title={t("actions.rename")}
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--color-foreground)",
                flexShrink: 0,
              }}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleArchiveClick}
              aria-label={t("actions.archive")}
              title={t("actions.archive")}
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--color-foreground)",
                flexShrink: 0,
              }}
            >
              <Archive size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleDeleteClick}
              aria-label={t("actions.delete")}
              title={t("actions.delete")}
              className="session-row__action--delete"
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--color-foreground)",
                flexShrink: 0,
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>
      {showConfirmDelete ? (
        <ConfirmDialog
          heading={t("confirmDelete.heading")}
          body={t("confirmDelete.body")}
          confirmLabel={t("confirmDelete.confirm")}
          cancelLabel={t("confirmDelete.cancel")}
          tone="destructive"
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      ) : null}
    </div>
  );
}
