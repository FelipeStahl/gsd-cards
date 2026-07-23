// ToolMissingState (PROJ-04) — substitui o corpo inteiro da SessionSidebar
// quando `claude`/gsd-core estão ausentes. Reusa literalmente o padrão
// visual do `ErrorState` genérico (ícone de aviso centralizado + heading +
// body), só trocando a cópia por uma das três variantes — nunca um takeover
// de página inteira, o board continua funcionando com ou sem as
// ferramentas presentes (`02-UI-SPEC.md` ## Tool-Missing State). NENHUMA
// lógica de auto-instalação aqui — só instrui (REQUIREMENTS.md ## Out of
// Scope).

import { useTranslation } from "react-i18next";

import { ErrorState } from "../ErrorState";
import type { ToolMissingState as ToolMissingKind } from "../../dependencies/check";

const COPY_KEY: Record<Exclude<ToolMissingKind, "none">, string> = {
  "claude-missing": "claude",
  "gsd-core-missing": "gsdCore",
  "both-missing": "both",
};

interface ToolMissingStateProps {
  state: Exclude<ToolMissingKind, "none">;
}

export function ToolMissingState({ state }: ToolMissingStateProps) {
  const { t } = useTranslation("session");
  const key = COPY_KEY[state];

  return (
    <ErrorState heading={t(`toolMissing.${key}.heading`)} body={t(`toolMissing.${key}.body`)} />
  );
}
