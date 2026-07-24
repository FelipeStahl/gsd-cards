// Toolbar GSD (ACT-04) — faixa de 9 botões-ícone de comandos `/gsd-*`
// montada acima do `TerminalView` dentro do `<aside>` expandido do
// `DrawerRail`, mais o gatilho Cmd/Ctrl+K + botão "Comandos" que abre o
// `CommandPalette`. GSD_COMMANDS é a única fonte de verdade da lista
// curada/ordem fixa (`03-CONTEXT.md`/`commands.json`) — consumida tanto por
// este componente quanto por `CommandPalette.tsx` (Tarefa 3), para que a
// ordem/ícone/kind de cada comando nunca precise ser reimplementada.
//
// `kind` espelha `InjectionKind` (`../../planning/injection`) restrito às
// duas variantes que este comando-agnóstico de fase usa: `parameterless`
// (quick/next/progress/status/help — envia direto) e `parameterized`
// (discuss/plan/execute/verify — pré-preenche, sem o número de fase; o
// usuário digita `N` e confirma).
//
// commandKey.status resolve para `/gsd-stats` (NÃO o `/gsd-status`
// inexistente) — achado de pesquisa da Fase 3 (03-UI-SPEC.md ## UI
// Considerations, item unresolved), mantendo a chave i18n `list.status.*`.

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Command,
  HelpCircle,
  Info,
  MessageSquare,
  Play,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { resolveInjection } from "../../planning/injection";
import { writeSession } from "../../pty/channel";
import { useSessionStore } from "../../stores/session-store";
import { CommandPalette } from "./CommandPalette";

export type GsdCommandKind = "parameterless" | "parameterized";

export interface GsdCommandEntry {
  id: string;
  /** Chave i18n do namespace `commands` (sem prefixo `commands.`, ex. `list.discuss.label`). */
  labelKey: string;
  /** Chave i18n do namespace `commands` para o token `/gsd-*` (ex. `list.discuss.command`). */
  commandKey: string;
  icon: LucideIcon;
  kind: GsdCommandKind;
}

/**
 * Lista curada, ORDEM FIXA (nunca reordenada por uso/recência), espelhando
 * `03-CONTEXT.md` ## Indicação Visual + Paleta/Atalhos e
 * `03-UI-SPEC.md` ## Copywriting Contract `commands.json`.
 */
export const GSD_COMMANDS: GsdCommandEntry[] = [
  {
    id: "discuss",
    labelKey: "list.discuss.label",
    commandKey: "list.discuss.command",
    icon: MessageSquare,
    kind: "parameterized",
  },
  {
    id: "plan",
    labelKey: "list.plan.label",
    commandKey: "list.plan.command",
    icon: ClipboardList,
    kind: "parameterized",
  },
  {
    id: "execute",
    labelKey: "list.execute.label",
    commandKey: "list.execute.command",
    icon: Play,
    kind: "parameterized",
  },
  {
    id: "verify",
    labelKey: "list.verify.label",
    commandKey: "list.verify.command",
    icon: CheckCircle2,
    kind: "parameterized",
  },
  {
    id: "quick",
    labelKey: "list.quick.label",
    commandKey: "list.quick.command",
    icon: Zap,
    kind: "parameterless",
  },
  {
    id: "next",
    labelKey: "list.next.label",
    commandKey: "list.next.command",
    icon: ArrowRight,
    kind: "parameterless",
  },
  {
    id: "progress",
    labelKey: "list.progress.label",
    commandKey: "list.progress.command",
    icon: BarChart3,
    kind: "parameterless",
  },
  {
    id: "status",
    labelKey: "list.status.label",
    commandKey: "list.status.command",
    icon: Info,
    kind: "parameterless",
  },
  {
    id: "help",
    labelKey: "list.help.label",
    commandKey: "list.help.command",
    icon: HelpCircle,
    kind: "parameterless",
  },
];

/**
 * Move o foco de volta para a superfície do xterm depois que uma
 * ação/comando pré-preenche ou depois que a paleta fecha — xterm.js sempre
 * cria um único `<textarea class="xterm-helper-textarea">` para capturar
 * input real do teclado (confirmado contra o bundle instalado de
 * `@xterm/xterm`); no máximo UMA instância de terminal fica montada por vez
 * nesta app (limite de contexto WebGL, `02-UI-SPEC.md`), então a busca
 * global por essa classe é segura — não precisa de um ref repassado a
 * partir do `TerminalView` (fora do `files_modified` deste plano).
 */
export function focusTerminalSurface(): void {
  document.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")?.focus();
}

/**
 * `resolveInjection`'s `guardKey` carrega o prefixo `board.` por
 * documentação — `useTranslation("board")` já escopa a busca ao namespace.
 * Mesmo helper de `PhaseCardAction.tsx::stripNamespacePrefix`, duplicado
 * aqui (função de 2 linhas, sem módulo compartilhado dedicado ainda).
 */
function stripBoardPrefix(key: string): string {
  return key.startsWith("board.") ? key.slice("board.".length) : key;
}

/**
 * Faixa de 40px acima do `TerminalView`, montada só dentro do `<aside>`
 * expandido do `DrawerRail` (ou seja, só quando há sessão ativa) — 9
 * botões-ícone 32×32 na ordem fixa de `GSD_COMMANDS` + botão "Comandos"
 * (abre a paleta) + badge de atalho de teclado. Cada botão obedece o mesmo
 * `resolveInjection` do card/detail panel (Plano 04): idle envia
 * imediatamente (`\r`), parametrizado pré-preenche (espaço final, sem
 * `\r`), busy/sem-sessão desabilita sem nunca chamar `writeSession`. O
 * gatilho Cmd/Ctrl+K é um listener `window`-level (não
 * `attachCustomKeyEventHandler` do xterm, que só dispara com o terminal
 * focado) escopado ao ciclo de vida deste componente — montado só enquanto
 * a sessão está ativa, exatamente o escopo exigido por
 * `03-RESEARCH.md` ## Security Domain.
 */
export function GsdCommandToolbar() {
  const { t } = useTranslation("commands");
  const { t: tTerminal } = useTranslation("terminal");
  const { t: tBoard } = useTranslation("board");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const lastFocusedSessionId = useSessionStore((state) => state.lastFocusedSessionId);
  const sessions = useSessionStore((state) => state.sessions);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const targetSessionId = activeSessionId ?? lastFocusedSessionId;
  const target = sessions.find((session) => session.id === targetSessionId && session.origin === "live");
  const hasLiveTarget = Boolean(target);

  const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
  const shortcutHint = isMac ? "⌘K" : tTerminal("toolbar.shortcutHint");

  function handleCommandClick(entry: GsdCommandEntry) {
    const resolution = resolveInjection({
      command: t(entry.commandKey),
      kind: entry.kind,
      activity: target?.activity,
      hasLiveTarget,
    });
    if (!target || resolution.mode === "blocked" || resolution.mode === "unavailable" || resolution.payload === null) {
      return;
    }
    void writeSession(target.id, resolution.payload).catch(() => {
      // T-03-02 backstop, mesma disciplina de `PhaseCardAction` — uma
      // rejeição de sessão morta/IPC nunca é engolida; o botão volta ao
      // estado normal no próximo render (resolução recomputada a cada
      // render a partir do estado vivo da store, nunca cacheada).
    });
    if (resolution.mode === "prefill") {
      focusTerminalSurface();
    }
  }

  return (
    <div
      style={{
        position: "relative",
        height: 40,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        padding: "0 var(--spacing-md)",
        gap: "var(--spacing-xs)",
        backgroundColor: "var(--color-secondary)",
      }}
    >
      {GSD_COMMANDS.map((entry) => {
        const resolution = resolveInjection({
          command: t(entry.commandKey),
          kind: entry.kind,
          activity: target?.activity,
          hasLiveTarget,
        });
        const Icon: LucideIcon = entry.icon;
        const isSend = resolution.mode === "send";
        const isPrefill = resolution.mode === "prefill";
        const isDisabled = resolution.mode === "blocked" || resolution.mode === "unavailable";
        const label = t(entry.labelKey);

        return (
          <button
            key={entry.id}
            type="button"
            aria-label={label}
            title={isDisabled && resolution.guardKey ? tBoard(stripBoardPrefix(resolution.guardKey)) : label}
            disabled={isDisabled}
            onClick={() => handleCommandClick(entry)}
            style={{
              width: 32,
              height: 32,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              border: isPrefill ? "1px solid var(--color-accent)" : "none",
              background: "none",
              color: isSend || isPrefill ? "var(--color-accent)" : "var(--color-foreground)",
              opacity: isDisabled ? 0.4 : 1,
              cursor: isDisabled ? "not-allowed" : "pointer",
            }}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
        );
      })}
      <span style={{ flex: 1 }} aria-hidden="true" />
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--spacing-xs)",
          height: 28,
          flexShrink: 0,
          padding: "0 var(--spacing-sm)",
          borderRadius: 4,
          border: "none",
          background: "none",
          color: "var(--color-foreground)",
          fontSize: "var(--font-size-label)",
          lineHeight: "var(--line-height-label)",
          fontWeight: "var(--font-weight-label)",
          cursor: "pointer",
        }}
      >
        <Command size={14} aria-hidden="true" />
        {tTerminal("toolbar.openPalette")}
      </button>
      <span
        aria-hidden="true"
        style={{
          fontFamily: "var(--font-family-mono)",
          fontSize: "var(--font-size-label)",
          lineHeight: "var(--line-height-label)",
          fontWeight: "var(--font-weight-label)",
          color: "var(--color-foreground)",
          backgroundColor: "color-mix(in srgb, var(--color-secondary) 85%, var(--color-foreground))",
          borderRadius: 999,
          padding: "0 var(--spacing-sm)",
          flexShrink: 0,
        }}
      >
        {shortcutHint}
      </span>
      {paletteOpen ? (
        <CommandPalette
          hasLiveTarget={hasLiveTarget}
          targetSessionId={target?.id ?? null}
          targetActivity={target?.activity}
          onClose={() => setPaletteOpen(false)}
        />
      ) : null}
    </div>
  );
}
