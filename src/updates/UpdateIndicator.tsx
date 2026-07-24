// Affordance de auto-atualização (DIST-03) — reusa o recipe exato de
// `SyncIndicator.tsx` (dot de 8px + Label + botão de texto inline em accent,
// `gap: var(--spacing-sm)` flex row) em vez de inventar um novo padrão de
// banner/toast/modal, per 05-UI-SPEC.md `## Update Affordance` (não
// intrusivo por construção). `checking`/`up-to-date` renderizam `null`
// (nunca anuncia "você está atualizado", mesma disciplina do early return
// `idle` de `SyncIndicator`). Um único clique explícito do usuário
// ("Atualizar e reiniciar"/"Tentar novamente") dispara
// `installUpdateAndRelaunch` — NUNCA automático, protegendo sessões PTY
// vivas (T-05-06). Os dois mount points (Header + HomeScreen) leem a mesma
// `update-store`, então nunca discordam entre si.

import type { CSSProperties } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { statusDotVariants } from "../components/StatusBadge";
import { installUpdateAndRelaunch } from "./check-update";
import { useUpdateStore } from "./update-store";

const LABEL_STYLE: CSSProperties = {
  fontSize: "var(--font-size-label)",
  lineHeight: "var(--line-height-label)",
  fontWeight: "var(--font-weight-label)",
  color: "var(--color-foreground)",
  opacity: 0.75,
  whiteSpace: "nowrap",
};

const ACTION_STYLE: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  color: "var(--color-accent)",
  fontSize: "var(--font-size-label)",
  lineHeight: "var(--line-height-label)",
  fontWeight: "var(--font-weight-label)",
};

const DISMISS_STYLE: CSSProperties = {
  width: 16,
  height: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--color-foreground)",
  opacity: 0.7,
  flexShrink: 0,
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-sm)",
};

export function UpdateIndicator() {
  const { t } = useTranslation("update");
  const state = useUpdateStore((s) => s.state);
  const percent = useUpdateStore((s) => s.percent);
  const version = useUpdateStore((s) => s.version);
  const pendingUpdate = useUpdateStore((s) => s.pendingUpdate);
  const startDownloading = useUpdateStore((s) => s.startDownloading);
  const setProgress = useUpdateStore((s) => s.setProgress);
  const setError = useUpdateStore((s) => s.setError);
  const dismiss = useUpdateStore((s) => s.dismiss);

  // checking / up-to-date: nunca renderiza nada — mesma disciplina do early
  // return de `SyncIndicator` (idle), nunca anuncia "você está atualizado".
  if (state === "checking" || state === "up-to-date") {
    return null;
  }

  function handleInstall() {
    if (!pendingUpdate) return;
    startDownloading();
    installUpdateAndRelaunch(pendingUpdate, setProgress).catch(() => setError());
  }

  if (state === "downloading") {
    return (
      <div data-slot="update-indicator" style={ROW_STYLE}>
        <span
          className={[statusDotVariants({ tone: "accent" }), "status-dot--pulse"].join(" ")}
          aria-hidden="true"
        />
        <span style={LABEL_STYLE}>{t("downloading.label", { percent })}</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div data-slot="update-indicator" style={ROW_STYLE}>
        <span className={statusDotVariants({ tone: "warning" })} aria-hidden="true" />
        <span style={LABEL_STYLE}>{t("error.label")}</span>
        <button type="button" onClick={handleInstall} style={ACTION_STYLE}>
          {t("error.action")}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("error.dismiss")}
          title={t("error.dismiss")}
          style={DISMISS_STYLE}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  // available
  return (
    <div data-slot="update-indicator" style={ROW_STYLE}>
      <span className={statusDotVariants({ tone: "accent" })} aria-hidden="true" />
      <span title={t("available.tooltip", { version })} style={LABEL_STYLE}>
        {t("available.label")}
      </span>
      <button type="button" onClick={handleInstall} style={ACTION_STYLE}>
        {t("available.action")}
      </button>
    </div>
  );
}
