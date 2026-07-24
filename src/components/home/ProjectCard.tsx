// Card por recente (04-04-PLAN.md, PROJ-01/PROJ-06) — resolve saúde
// (fase atual, %, bloqueios) LAZY e por card, reusando o MESMO pipeline de
// leitura já provado em `openProject`/`loadProjectStateModel`
// (board-store.ts): `validateProjectRoot` + `readPlanningText(statePath)` +
// `parseStateFile`, escopado a UM recente por vez. Cada card resolve
// independentemente — a falha de um nunca bloqueia o grid inteiro nem
// derruba os outros cards (04-UI-SPEC.md ## Project Card Anatomy, ##
// UI Considerations "error").

import { useEffect, useState, type KeyboardEvent } from "react";
import { AlertCircle } from "lucide-react";
import { cva } from "class-variance-authority";
import { useTranslation } from "react-i18next";

import { ProgressBar } from "../ProgressBar";
import { validateProjectRoot, readPlanningText } from "../../planning/read";
import { statePath } from "../../planning/paths";
import { parseStateFile } from "../../planning/parser/state";
import { removeRecent, type RecentProjectEntry } from "../../persistence/app-store";

type CardHealth =
  | { kind: "loading" }
  | { kind: "healthy"; phaseName: string; percent: number | null; blockersCount: number }
  | { kind: "error" };

/**
 * Único uso de `class-variance-authority` deste componente (04-UI-SPEC.md
 * "loading/healthy/error variants via CVA", nenhum outro componente do
 * codebase usa CVA para além de `statusDotVariants`). Só o variant
 * `healthy` reusa a classe `.phase-card` (borda accent no hover, definida
 * em `theme.css` para `PhaseCard`) — o card só é clicável nesse estado;
 * `loading`/`error` nunca sugerem uma interatividade que não existe.
 */
const projectCardVariants = cva("", {
  variants: {
    variant: {
      loading: "",
      healthy: "phase-card",
      error: "",
    },
  },
  defaultVariants: { variant: "loading" },
});

interface ProjectCardProps {
  entry: RecentProjectEntry;
  /** `openProject(root)` + `setView("board")` — só chamado a partir do
   * corpo do card no estado `healthy`. */
  onOpen: (root: string) => void | Promise<void>;
  /** Notifica a home para remover esta entrada da lista local em memória
   * DEPOIS que `removeRecent` já persistiu a remoção. */
  onRemoved: (root: string) => void;
}

export function ProjectCard({ entry, onOpen, onRemoved }: ProjectCardProps) {
  const { t } = useTranslation("home");
  const [health, setHealth] = useState<CardHealth>({ kind: "loading" });
  const [retryToken, setRetryToken] = useState(0);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHealth({ kind: "loading" });

    async function load() {
      try {
        const validated = await validateProjectRoot(entry.root);
        const sp = statePath(validated.root);
        const raw = await readPlanningText(sp);
        const parsedState = parseStateFile(raw, sp);
        if (cancelled) return;

        if (parsedState.kind === "unrecognized") {
          setHealth({ kind: "error" });
          return;
        }

        const value = parsedState.value;
        setHealth({
          kind: "healthy",
          phaseName: value.currentPhaseName.kind === "ok" ? value.currentPhaseName.value : "—",
          percent: value.progress.kind === "ok" ? value.progress.value.percent : null,
          blockersCount: value.blockers.length,
        });
      } catch {
        // Pasta movida/apagada/sem permissão (T-04-09) — degrada para o
        // card de erro, NUNCA lança (o grid inteiro precisa continuar de
        // pé mesmo quando um recente específico não existe mais).
        if (!cancelled) setHealth({ kind: "error" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [entry.root, retryToken]);

  const isClickable = health.kind === "healthy";

  function handleActivate() {
    if (!isClickable) return;
    void onOpen(entry.root);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!isClickable) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleActivate();
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeRecent(entry.root);
      onRemoved(entry.root);
    } finally {
      setRemoving(false);
    }
  }

  function handleRetry() {
    setRetryToken((token) => token + 1);
  }

  // IN-03 fix (04-REVIEW.md): computado uma vez e reusado abaixo (como o
  // label acessível do `ProgressBar` e como o texto visível adjacente) —
  // antes chamava `t("card.progress", ...)` duas vezes seguidas para o
  // mesmo valor.
  const progressLabel =
    health.kind === "healthy" ? t("card.progress", { percent: health.percent ?? 0 }) : "";

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleActivate : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      className={projectCardVariants({ variant: health.kind })}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--spacing-sm)",
        padding: "var(--spacing-lg)",
        borderRadius: 8,
        backgroundColor: "var(--color-secondary)",
        minHeight: 140,
        border: health.kind === "error" ? "1px solid var(--color-destructive)" : "1px solid transparent",
        cursor: isClickable ? "pointer" : "default",
      }}
    >
      <span
        title={entry.name}
        style={{
          fontSize: "var(--font-size-heading)",
          lineHeight: "var(--line-height-heading)",
          fontWeight: "var(--font-weight-heading)",
          color: "var(--color-foreground)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {entry.name}
      </span>

      {health.kind === "loading" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-sm)" }}>
          <span
            style={{
              fontSize: "var(--font-size-label)",
              lineHeight: "var(--line-height-label)",
              fontWeight: "var(--font-weight-label)",
              color: "var(--color-foreground)",
              opacity: 0.75,
            }}
          >
            {t("card.loading")}
          </span>
          {/* Reusa a animação `.status-dot--pulse` (mesmo timing 1200ms) do
              indicador de sessão sobre uma barra em vez de um ponto — nenhuma
              curva de animação nova (04-UI-SPEC.md ## Project Card Anatomy
              item 5). */}
          <div
            className="status-dot--pulse"
            style={{
              width: "60%",
              height: 8,
              borderRadius: 4,
              backgroundColor: "color-mix(in srgb, var(--color-foreground) 20%, transparent)",
            }}
          />
        </div>
      ) : null}

      {health.kind === "healthy" ? (
        <>
          <span
            style={{
              fontSize: "var(--font-size-body)",
              lineHeight: "var(--line-height-body)",
              fontWeight: "var(--font-weight-body)",
              color: "var(--color-foreground)",
              opacity: 0.75,
            }}
          >
            {health.phaseName}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
            <ProgressBar percent={health.percent} widthPx={120} label={progressLabel} />
            <span
              style={{
                fontSize: "var(--font-size-label)",
                lineHeight: "var(--line-height-label)",
                fontWeight: "var(--font-weight-label)",
                color: "var(--color-foreground)",
                opacity: 0.75,
              }}
            >
              {progressLabel}
            </span>
          </div>
          {health.blockersCount > 0 ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--spacing-xs)",
                fontSize: "var(--font-size-label)",
                lineHeight: "var(--line-height-label)",
                fontWeight: "var(--font-weight-label)",
                color: "var(--color-warning)",
              }}
            >
              <AlertCircle size={14} aria-hidden="true" />
              {health.blockersCount === 1
                ? t("card.blockers_one")
                : t("card.blockers_other", { count: health.blockersCount })}
            </span>
          ) : null}
        </>
      ) : null}

      {health.kind === "error" ? (
        <>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--spacing-xs)",
              fontSize: "var(--font-size-body)",
              lineHeight: "var(--line-height-body)",
              fontWeight: "var(--font-weight-heading)",
              color: "var(--color-destructive)",
            }}
          >
            <AlertCircle size={14} aria-hidden="true" />
            {t("card.error.heading")}
          </span>
          <span
            style={{
              fontSize: "var(--font-size-label)",
              lineHeight: "var(--line-height-label)",
              fontWeight: "var(--font-weight-label)",
              color: "var(--color-foreground)",
              opacity: 0.75,
            }}
          >
            {t("card.error.body", { path: entry.root })}
          </span>
          <div style={{ display: "flex", gap: "var(--spacing-md)", marginTop: "auto" }}>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: "var(--font-size-label)",
                lineHeight: "var(--line-height-label)",
                fontWeight: "var(--font-weight-label)",
                color: "var(--color-foreground)",
                cursor: removing ? "default" : "pointer",
                textDecoration: "underline",
              }}
            >
              {t("card.error.remove")}
            </button>
            <button
              type="button"
              onClick={handleRetry}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: "var(--font-size-label)",
                lineHeight: "var(--line-height-label)",
                fontWeight: "var(--font-weight-label)",
                color: "var(--color-accent)",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {t("card.error.retry")}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
