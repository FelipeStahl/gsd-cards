// Paleta de comandos GSD (ACT-04) — overlay Cmd/Ctrl+K, confinado ao
// `<aside>` de 640px do drawer (nunca escurece o board/sidebar), construído
// sobre o esqueleto de INTERAÇÃO do `ConfirmDialog` (Esc fecha, clique fora
// fecha) mas com o visual divergente descrito em `03-UI-SPEC.md` ## GSD
// Command Toolbar & Palette: `position: absolute` dentro do `<aside>`
// (`position: relative`, Tarefa 2), ancorado abaixo da toolbar de 40px,
// backdrop mais claro (40% vs. os 60% do `ConfirmDialog`), nunca `position:
// fixed; inset: 0`.
//
// GSD_COMMANDS (`./GsdCommandToolbar`, Tarefa 1) é a única fonte de
// verdade da lista/ordem/ícone/kind — a paleta nunca reordena por
// recência/frequência. Cada row obedece o mesmo `resolveInjection`
// (`../../planning/injection`, Plano 04) que o toolbar/card/detail panel —
// busy renderiza desabilitada DENTRO da lista (nunca filtrada/escondida),
// nunca chama `writeSession`.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { resolveInjection } from "../../planning/injection";
import { writeSession } from "../../pty/channel";
import type { TerminalActivity } from "../../pty/activity";
import { GSD_COMMANDS, focusTerminalSurface, type GsdCommandEntry } from "./GsdCommandToolbar";

/**
 * `resolveInjection`'s `guardKey` carrega o prefixo `board.` por documentação
 * (mesma grafia da coluna "i18n key" de `03-UI-SPEC.md`), mas
 * `useTranslation("board")` já escopa a busca ao namespace — mesmo helper de
 * `PhaseCardAction.tsx::stripNamespacePrefix`, duplicado aqui (função de 2
 * linhas, sem módulo compartilhado dedicado para isso ainda).
 */
function stripBoardPrefix(key: string): string {
  return key.startsWith("board.") ? key.slice("board.".length) : key;
}

interface CommandPaletteProps {
  hasLiveTarget: boolean;
  targetSessionId: string | null;
  targetActivity: TerminalActivity | undefined;
  onClose: () => void;
}

export function CommandPalette({
  hasLiveTarget,
  targetSessionId,
  targetActivity,
  onClose,
}: CommandPaletteProps) {
  const { t } = useTranslation("commands");
  const { t: tBoard } = useTranslation("board");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        focusTerminalSurface();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      GSD_COMMANDS.filter((entry) => {
        if (!normalizedQuery) return true;
        const label = t(entry.labelKey).toLowerCase();
        const token = t(entry.commandKey).toLowerCase();
        return label.includes(normalizedQuery) || token.includes(normalizedQuery);
      }),
    [normalizedQuery, t],
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [normalizedQuery]);

  function resolveEntry(entry: GsdCommandEntry) {
    return resolveInjection({
      command: t(entry.commandKey),
      kind: entry.kind,
      activity: targetActivity,
      hasLiveTarget,
    });
  }

  function activateEntry(entry: GsdCommandEntry) {
    const resolution = resolveEntry(entry);
    if (
      !targetSessionId ||
      resolution.mode === "blocked" ||
      resolution.mode === "unavailable" ||
      resolution.payload === null
    ) {
      return;
    }
    void writeSession(targetSessionId, resolution.payload).catch(() => {
      // T-03-02 backstop: mesma disciplina de `PhaseCardAction` — uma
      // rejeição não trava a UI; a paleta já fechou e o foco já voltou ao
      // terminal, então não há superfície de erro transitória própria aqui
      // (o próximo clique de ação no card/detail panel continua funcional).
    });
    onClose();
    focusTerminalSurface();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const entry = filtered[selectedIndex];
      if (entry) activateEntry(entry);
    }
  }

  const placeholder = hasLiveTarget ? t("palette.placeholder") : tBoard("actions.guard.noSession");

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        top: 40,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "color-mix(in srgb, var(--color-secondary) 40%, transparent)",
        zIndex: 30,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.placeholder")}
        onClick={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          maxHeight: 480,
          backgroundColor: "var(--color-dominant)",
          borderRadius: 8,
          boxShadow: "-4px 0 16px rgba(0, 0, 0, 0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          disabled={!hasLiveTarget}
          placeholder={placeholder}
          aria-label={t("palette.placeholder")}
          style={{
            height: 36,
            flexShrink: 0,
            border: "none",
            borderBottom: "1px solid var(--color-secondary)",
            padding: "0 var(--spacing-md)",
            fontSize: "var(--font-size-body)",
            lineHeight: "var(--line-height-body)",
            color: "var(--color-foreground)",
            backgroundColor: "transparent",
            outline: "none",
          }}
        />
        <div style={{ overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <p
              style={{
                fontSize: "var(--font-size-body)",
                lineHeight: "var(--line-height-body)",
                color: "var(--color-foreground)",
                opacity: 0.75,
                textAlign: "center",
                padding: "var(--spacing-lg)",
                margin: 0,
              }}
            >
              {t("palette.empty")}
            </p>
          ) : (
            filtered.map((entry, index) => {
              const resolution = resolveEntry(entry);
              const isDisabled = resolution.mode === "blocked" || resolution.mode === "unavailable";
              const isSelected = index === selectedIndex;
              const Icon = entry.icon;
              const label = t(entry.labelKey);
              const token = t(entry.commandKey);
              return (
                <button
                  key={entry.id}
                  type="button"
                  disabled={isDisabled}
                  aria-label={label}
                  title={isDisabled && resolution.guardKey ? tBoard(stripBoardPrefix(resolution.guardKey)) : label}
                  onClick={() => activateEntry(entry)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    width: "100%",
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-sm)",
                    padding: "0 var(--spacing-md)",
                    border: "none",
                    borderLeft: isSelected ? "4px solid var(--color-accent)" : "4px solid transparent",
                    backgroundColor: isSelected
                      ? "color-mix(in srgb, var(--color-secondary) 85%, var(--color-foreground))"
                      : "transparent",
                    color: "var(--color-foreground)",
                    opacity: isDisabled ? 0.4 : 1,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    textAlign: "left",
                  }}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span
                    title={label}
                    style={{
                      fontSize: "var(--font-size-body)",
                      lineHeight: "var(--line-height-body)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {label}
                  </span>
                  <span
                    title={token}
                    style={{
                      fontFamily: "var(--font-family-mono)",
                      fontSize: "var(--font-size-label)",
                      lineHeight: "var(--line-height-label)",
                      fontWeight: "var(--font-weight-label)",
                      color: "var(--color-foreground)",
                      opacity: 0.7,
                      flexShrink: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 160,
                    }}
                  >
                    {token}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
