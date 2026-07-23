// Painel de detalhe (D-10): overlay lateral direito de 480px com a árvore
// fase → planos → tarefas, carregada sob demanda via `useDetailStore`.
//
// Regra de granularidade (T-01-06d): a interface NUNCA marca uma tarefa
// individual como concluída por inferência — o `TaskState` de cada tarefa já
// vem resolvido tudo-ou-nada por `buildPhaseArtifactTree`, ancorado
// exclusivamente na presença do SUMMARY.md do plano.
//
// Botão "Ver artefato" consome a chave i18n `board.detail.viewArtifact`
// (namespace `board`, criada no Plano 03) para abrir o modal (D-11) a partir
// de qualquer linha de artefato, inclusive as marcadas como não reconhecidas.

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useUiStore } from "../stores/ui-store";
import { useDetailStore } from "../stores/detail-store";
import { useBoardStore } from "../stores/board-store";
import { StatusBadge } from "./StatusBadge";

export function DetailPanel() {
  const { t } = useTranslation("board");

  const selectedPhaseId = useUiStore((state) => state.selectedPhaseId);
  const clearSelection = useUiStore((state) => state.clearSelection);
  const openArtifact = useUiStore((state) => state.openArtifact);

  const loadPhaseTree = useDetailStore((state) => state.loadPhaseTree);
  const treeResult = useDetailStore((state) =>
    selectedPhaseId ? state.treeByPhaseId[selectedPhaseId] : undefined,
  );
  const loading = useDetailStore((state) =>
    selectedPhaseId ? Boolean(state.loading[selectedPhaseId]) : false,
  );

  const phase = useBoardStore((state) =>
    state.project?.phases.find((candidate) => candidate.id === selectedPhaseId),
  );

  useEffect(() => {
    if (selectedPhaseId) void loadPhaseTree(selectedPhaseId);
  }, [selectedPhaseId, loadPhaseTree]);

  useEffect(() => {
    if (!selectedPhaseId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") clearSelection();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPhaseId, clearSelection]);

  if (!selectedPhaseId) return null;

  const breadcrumb = t("detail.breadcrumb", {
    number: phase?.number ?? selectedPhaseId,
    name: phase?.name ?? "",
  });

  return (
    <div
      role="dialog"
      aria-label={breadcrumb}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 480,
        backgroundColor: "var(--color-secondary)",
        boxShadow: "-4px 0 16px rgba(0, 0, 0, 0.2)",
        display: "flex",
        flexDirection: "column",
        zIndex: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--spacing-lg)",
          borderBottom: "1px solid var(--color-dominant)",
        }}
      >
        <span
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
          {breadcrumb}
        </span>
        <button
          type="button"
          onClick={clearSelection}
          aria-label={t("detail.close")}
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
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "var(--spacing-lg)" }}>
        {loading || !treeResult ? (
          <p style={{ color: "var(--color-foreground)", opacity: 0.75 }}>{t("detail.loading")}</p>
        ) : treeResult.kind === "unrecognized" ? (
          <p style={{ color: "var(--color-warning)" }}>
            {treeResult.issues[0]?.reason ?? t("card.parseError.tooltip")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-lg)" }}>
            {phase ? (
              <div style={{ display: "flex", alignItems: "center" }}>
                <StatusBadge status={phase.badge} />
              </div>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-md)" }}>
              {treeResult.value.plans.map((plan) => (
                <div key={plan.planPath} style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
                  <span
                    style={{
                      fontSize: "var(--font-size-body)",
                      fontWeight: "var(--font-weight-heading)",
                      color: "var(--color-foreground)",
                    }}
                  >
                    {t("detail.plan", { id: plan.id })}
                  </span>
                  <ul
                    style={{
                      listStyle: "none",
                      margin: 0,
                      padding: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--spacing-xs)",
                    }}
                  >
                    {plan.tasks.map((task, index) => (
                      <li
                        key={`${plan.id}-${index}`}
                        data-task-state={task.state}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--spacing-xs)",
                          fontSize: "var(--font-size-body)",
                          color: "var(--color-foreground)",
                          opacity: task.state === "done" ? 1 : 0.6,
                        }}
                      >
                        <span aria-hidden="true">{task.state === "done" ? "✓" : "·"}</span>
                        {task.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-sm)" }}>
              {treeResult.value.artifacts.map((artifact) => (
                <div
                  key={artifact.path}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--spacing-sm)",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--spacing-xs)",
                      fontFamily: "var(--font-family-mono)",
                      fontSize: "var(--font-size-body)",
                      color: "var(--color-foreground)",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {artifact.parsed === "unrecognized" ? (
                      <AlertTriangle size={12} color="var(--color-warning)" aria-hidden="true" />
                    ) : null}
                    {artifact.fileName}
                    {artifact.parsed === "unrecognized" ? (
                      <span style={{ fontSize: "var(--font-size-label)", color: "var(--color-warning)" }}>
                        {t("status.unknown")}
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => openArtifact(artifact.path)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-accent)",
                      cursor: "pointer",
                      fontSize: "var(--font-size-body)",
                      flexShrink: 0,
                    }}
                  >
                    {t("detail.viewArtifact")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
