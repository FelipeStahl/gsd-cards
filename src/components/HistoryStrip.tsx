// Faixa de histórico de milestones (D-08) — recolhida por padrão, montada
// abaixo das 4 colunas do board (ver `Board.tsx`). Granularidade
// deliberadamente mínima: versão do milestone + fases arquivadas (número,
// nome, status coarse do arquivamento) — nunca o `DiskStatus` granular do
// board ativo, para deixar claro visualmente que isto é histórico, não
// estado vivo (tratamento neutro apagado, sem os pontos coloridos de status
// de `StatusBadge`).
//
// Sem histórico, o empty state usa a chave `board.history.empty` (namespace
// `board`, já criada no Plano 03 — `t("history.empty")` abaixo resolve para
// essa mesma chave totalmente qualificada); o cabeçalho clicável permanece
// visível mesmo vazio, para que o usuário entenda que a seção existe.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useBoardStore } from "../stores/board-store";

export function HistoryStrip() {
  const { t } = useTranslation("board");
  const milestones = useBoardStore((state) => state.project?.milestones ?? []);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
        backgroundColor: "var(--color-secondary)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-xs)",
          padding: "var(--spacing-sm) var(--spacing-md)",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontSize: "var(--font-size-label)",
          lineHeight: "var(--line-height-label)",
          fontWeight: "var(--font-weight-label)",
          color: "var(--color-foreground)",
        }}
      >
        {expanded ? (
          <ChevronDown size={14} aria-hidden="true" />
        ) : (
          <ChevronRight size={14} aria-hidden="true" />
        )}
        {t("history.toggle")}
      </button>

      {expanded ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-md)",
            padding: "0 var(--spacing-md) var(--spacing-md)",
          }}
        >
          {milestones.length === 0 ? (
            <p
              style={{
                fontSize: "var(--font-size-body)",
                lineHeight: "var(--line-height-body)",
                fontWeight: "var(--font-weight-body)",
                color: "var(--color-foreground)",
                opacity: 0.6,
                margin: 0,
              }}
            >
              {t("history.empty")}
            </p>
          ) : (
            milestones.map((milestone) => (
              <div
                key={milestone.version}
                style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-sm)" }}
              >
                <span
                  style={{
                    alignSelf: "flex-start",
                    fontSize: "var(--font-size-label)",
                    lineHeight: "var(--line-height-label)",
                    fontWeight: "var(--font-weight-label)",
                    padding: "var(--spacing-xs) var(--spacing-sm)",
                    borderRadius: 999,
                    backgroundColor: "var(--color-dominant)",
                    color: "var(--color-foreground)",
                  }}
                >
                  {milestone.version}
                </span>

                {milestone.phases.length > 0 ? (
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
                    {milestone.phases.map((phase) => (
                      <li
                        key={phase.number}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--spacing-sm)",
                          fontSize: "var(--font-size-body)",
                          lineHeight: "var(--line-height-body)",
                          fontWeight: "var(--font-weight-body)",
                          color: "var(--color-foreground)",
                          opacity: 0.75,
                        }}
                      >
                        <span>
                          {phase.number}. {phase.name}
                        </span>
                        <span
                          style={{
                            fontSize: "var(--font-size-label)",
                            lineHeight: "var(--line-height-label)",
                            fontWeight: "var(--font-weight-label)",
                            padding: "0 var(--spacing-xs)",
                            borderRadius: 999,
                            backgroundColor: "var(--color-dominant)",
                          }}
                        >
                          {phase.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
