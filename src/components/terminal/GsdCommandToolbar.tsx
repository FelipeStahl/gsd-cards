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

import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  HelpCircle,
  Info,
  MessageSquare,
  Play,
  Zap,
  type LucideIcon,
} from "lucide-react";

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
