// Modal de artefato (D-11, BOARD-06) — "GitHub preview" estilo: markdown GFM
// fiel (tabelas, checklists) em modo renderizado, ou banner de erro + texto
// cru em modo raw (D-15, BOARD-05) quando o artefato não foi parseável.
//
// Postura de segurança (mitiga T-01-02 — `.planning/` pode vir de um
// repositório clonado de terceiros, conteúdo NÃO confiável):
// - `react-markdown` já descarta HTML embutido por padrão; nenhum plugin de
//   HTML bruto (nenhum rehype para reintroduzir markup cru) é adicionado
//   aqui, e nenhuma string de markup é injetada via inner-HTML direto em
//   nenhum caminho.
// - `urlTransform` é identidade proposital: a decisão de "isso é navegável?"
//   fica inteiramente no componente `a` customizado abaixo, não no
//   sanitizador default da lib — para que um esquema hostil ainda apareça
//   como texto legível (nunca escondido), só nunca como âncora clicável.
// - Nesta fase o app não tem capability de abrir URLs externas — mesmo um
//   link `http`/`https` legítimo renderiza como texto na cor de acento com a
//   URL no atributo de título, nunca como um elemento `<a href>` navegável.

import { useEffect } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { useUiStore } from "../stores/ui-store";
import { useDetailStore } from "../stores/detail-store";

const SAFE_URL_PATTERN = /^https?:\/\//i;

function isSafeUrl(href: string): boolean {
  return SAFE_URL_PATTERN.test(href);
}

const markdownComponents: Components = {
  a({ href, children }) {
    if (href && isSafeUrl(href)) {
      return (
        <span style={{ color: "var(--color-accent)" }} title={href}>
          {children}
        </span>
      );
    }
    // Esquema não-http(s) (ex.: `javascript:`) — nunca vira âncora
    // navegável; a URL crua fica visível como texto simples, nunca oculta.
    return <span>{href ?? ""}</span>;
  },
};

/** Passa a URL adiante sem transformação — o filtro de segurança é o componente `a` acima, não o sanitizador default da lib. */
function identityUrlTransform(url: string): string {
  return url;
}

export function ArtifactModal() {
  const { t } = useTranslation("artifact");

  const openArtifactPath = useUiStore((state) => state.openArtifactPath);
  const closeArtifact = useUiStore((state) => state.closeArtifact);
  const loadArtifact = useDetailStore((state) => state.loadArtifact);

  const contentResult = useDetailStore((state) =>
    openArtifactPath ? state.artifactContent[openArtifactPath] : undefined,
  );

  // A linha de origem no painel de detalhe (Plano 05, Task 2) pode já saber
  // que este artefato é `unrecognized` estruturalmente (frontmatter/região
  // de tarefas corrompida) mesmo quando a leitura crua do arquivo funciona —
  // esse caso também abre em modo raw, per D-15.
  const structuralReason = useDetailStore((state) => {
    if (!openArtifactPath) return null;
    for (const treeResult of Object.values(state.treeByPhaseId)) {
      if (treeResult.kind !== "ok") continue;
      const ref = treeResult.value.artifacts.find(
        (artifact) => artifact.path === openArtifactPath,
      );
      if (ref && ref.parsed === "unrecognized") {
        return ref.issues[0]?.reason ?? "";
      }
    }
    return null;
  });

  useEffect(() => {
    if (openArtifactPath) void loadArtifact(openArtifactPath);
  }, [openArtifactPath, loadArtifact]);

  useEffect(() => {
    if (!openArtifactPath) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeArtifact();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openArtifactPath, closeArtifact]);

  if (!openArtifactPath) return null;

  const fileName = openArtifactPath.split("/").pop() ?? openArtifactPath;
  const isRawMode = contentResult?.kind === "unrecognized" || structuralReason !== null;
  const rawText =
    contentResult?.kind === "ok"
      ? contentResult.value
      : contentResult?.kind === "unrecognized"
        ? (contentResult.raw ?? "")
        : "";
  const reason =
    contentResult?.kind === "unrecognized"
      ? (contentResult.issues[0]?.reason ?? "")
      : (structuralReason ?? "");

  return (
    <div
      onClick={closeArtifact}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "color-mix(in srgb, var(--color-secondary) 60%, transparent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 30,
      }}
    >
      <div
        role="dialog"
        aria-label={fileName}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(900px, 90vw)",
          maxHeight: "85vh",
          backgroundColor: "var(--color-dominant)",
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--spacing-lg)",
            borderBottom: "1px solid var(--color-secondary)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: "var(--font-size-heading)",
              lineHeight: "var(--line-height-heading)",
              fontWeight: "var(--font-weight-heading)",
              fontFamily: "var(--font-family-mono)",
              color: "var(--color-foreground)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {fileName}
          </span>
          <button
            type="button"
            onClick={closeArtifact}
            aria-label={t("modal.close")}
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

        <div style={{ overflowY: "auto", padding: "var(--spacing-lg)" }}>
          {!contentResult ? (
            <p style={{ color: "var(--color-foreground)", opacity: 0.75 }}>{t("modal.loading")}</p>
          ) : isRawMode ? (
            <div>
              <div
                style={{
                  backgroundColor: "var(--color-warning)",
                  color: "#1a1200",
                  padding: "var(--spacing-sm) var(--spacing-md)",
                  borderRadius: 6,
                  marginBottom: "var(--spacing-md)",
                  fontSize: "var(--font-size-body)",
                }}
              >
                {t("modal.parseError.banner", { reason })}
              </div>
              <pre
                style={{
                  fontFamily: "var(--font-family-mono)",
                  fontSize: "var(--font-size-body)",
                  color: "var(--color-foreground)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: 0,
                }}
              >
                {rawText}
              </pre>
            </div>
          ) : (
            <div className="artifact-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={identityUrlTransform}
                components={markdownComponents}
              >
                {rawText}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
