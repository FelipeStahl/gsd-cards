// Search bar do terminal (TERM-03), dirigida por `@xterm/addon-search`.
// 02-UI-SPEC.md ## Terminal Search Bar: input auto-focado + contador
// current/total + ChevronUp (anterior) + ChevronDown (próximo) + X (fecha).
//
// Deliberadamente NÃO importa `SearchAddon` de `@xterm/addon-search`
// diretamente como o tipo do prop — só o contrato mínimo (`SearchAddonHandle`
// abaixo), estruturalmente compatível com a classe real. Isso permite que
// `search.test.tsx` injete um mock sem instanciar `@xterm/xterm`/o addon de
// verdade, que exigem um canvas real (`HTMLCanvasElement.getContext`) e
// `window.matchMedia` que o jsdom deste projeto não fornece (confirmado
// experimentalmente durante a execução deste plano — sem o pacote `canvas`,
// que não está nas dependências e está fora do escopo desta fase). O
// highlight visual real (destaque de match no buffer) fica como UAT manual
// (backstop), conforme a Wave 0 do `02-RESEARCH.md`; esta bateria de teste
// cobre a lógica de estado da barra: contador, ciclo next/prev, borda de
// warning em zero matches.

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { IEvent } from "@xterm/xterm";
import type { ISearchOptions, ISearchResultChangeEvent } from "@xterm/addon-search";

/** Contrato mínimo exigido do addon — a classe real `SearchAddon` o satisfaz. */
export interface SearchAddonHandle {
  findNext(term: string, options?: ISearchOptions): boolean;
  findPrevious(term: string, options?: ISearchOptions): boolean;
  onDidChangeResults: IEvent<ISearchResultChangeEvent>;
}

interface TerminalSearchBarProps {
  searchAddon: SearchAddonHandle;
  onClose: () => void;
}

interface MatchState {
  current: number;
  total: number;
}

// Cores literais de decoração de match (addon-search exige hex/rgba
// literais nas `ISearchOptions.decorations`, não lê custom properties de
// CSS — mesmo motivo do tema do xterm.js em TerminalView.tsx). Sem
// `decorations`, `onDidChangeResults` não dispara (typings/addon-search.d.ts).
const SEARCH_DECORATIONS = {
  matchOverviewRuler: "#f59e0b",
  activeMatchColorOverviewRuler: "#6366f1",
  matchBackground: "rgba(245, 158, 11, 0.35)",
  activeMatchBackground: "rgba(99, 102, 241, 0.35)",
};

const ICON_BUTTON_STYLE: CSSProperties = {
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
};

export function TerminalSearchBar({ searchAddon, onClose }: TerminalSearchBarProps) {
  const { t } = useTranslation("terminal");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MatchState | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const disposable = searchAddon.onDidChangeResults((event) => {
      setResults({
        // `resultIndex` é 0-based (ou -1 quando o limite de highlight é
        // excedido) — normaliza para o contador 1-based "{{current}}/{{total}}".
        current: event.resultIndex >= 0 ? event.resultIndex + 1 : 0,
        total: event.resultCount,
      });
    });
    return () => disposable.dispose();
  }, [searchAddon]);

  function runSearch(direction: "next" | "previous", term: string, incremental = false) {
    if (term.length === 0) {
      setResults(null);
      return;
    }
    const options: ISearchOptions = {
      caseSensitive: false,
      incremental,
      decorations: SEARCH_DECORATIONS,
    };
    if (direction === "next") {
      searchAddon.findNext(term, options);
    } else {
      searchAddon.findPrevious(term, options);
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setQuery(value);
    runSearch("next", value, true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch(event.shiftKey ? "previous" : "next", query);
    }
  }

  const hasNoMatches = results !== null && results.total === 0;
  const counterLabel =
    results === null
      ? null
      : results.total === 0
        ? t("search.noMatches")
        : t("search.matchCount", { current: results.current, total: results.total });

  return (
    <div
      role="search"
      style={{
        height: 36,
        display: "flex",
        alignItems: "center",
        gap: "var(--spacing-sm)",
        padding: "0 var(--spacing-sm)",
        backgroundColor: "var(--color-secondary)",
        flexShrink: 0,
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={t("search.placeholder")}
        aria-label={t("search.placeholder")}
        style={{
          flex: 1,
          minWidth: 0,
          height: 28,
          padding: "0 var(--spacing-sm)",
          fontSize: "var(--font-size-body)",
          lineHeight: "var(--line-height-body)",
          color: "var(--color-foreground)",
          backgroundColor: "var(--color-dominant)",
          border: `1px solid ${hasNoMatches ? "var(--color-warning)" : "var(--color-secondary)"}`,
          borderRadius: 4,
          outline: "none",
        }}
      />
      {counterLabel !== null ? (
        <span
          style={{
            fontSize: "var(--font-size-label)",
            lineHeight: "var(--line-height-label)",
            fontWeight: "var(--font-weight-label)",
            color: "var(--color-foreground)",
            opacity: 0.75,
            flexShrink: 0,
            minWidth: 40,
            textAlign: "right",
          }}
        >
          {counterLabel}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => runSearch("previous", query)}
        aria-label={t("search.previous")}
        title={t("search.previous")}
        style={ICON_BUTTON_STYLE}
      >
        <ChevronUp size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => runSearch("next", query)}
        aria-label={t("search.next")}
        title={t("search.next")}
        style={ICON_BUTTON_STYLE}
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("search.close")}
        title={t("search.close")}
        style={ICON_BUTTON_STYLE}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
