import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import commonPtBR from "./locales/pt-BR/common.json";
import commonEn from "./locales/en/common.json";
import projectPtBR from "./locales/pt-BR/project.json";
import projectEn from "./locales/en/project.json";
import boardPtBR from "./locales/pt-BR/board.json";
import boardEn from "./locales/en/board.json";
import syncPtBR from "./locales/pt-BR/sync.json";
import syncEn from "./locales/en/sync.json";
import artifactPtBR from "./locales/pt-BR/artifact.json";
import artifactEn from "./locales/en/artifact.json";
import sessionPtBR from "./locales/pt-BR/session.json";
import sessionEn from "./locales/en/session.json";
import terminalPtBR from "./locales/pt-BR/terminal.json";
import terminalEn from "./locales/en/terminal.json";

// Estrutura deliberada: um arquivo por namespace (`common.json`, `project.json`,
// `board.json`, `sync.json`, `artifact.json` — Plano 05, `session.json` —
// Plano 02-01, `terminal.json` — Plano 02-05) para que planos paralelos não
// disputem o mesmo arquivo.
export const resources = {
  "pt-BR": {
    common: commonPtBR,
    project: projectPtBR,
    board: boardPtBR,
    sync: syncPtBR,
    artifact: artifactPtBR,
    session: sessionPtBR,
    terminal: terminalPtBR,
  },
  en: {
    common: commonEn,
    project: projectEn,
    board: boardEn,
    sync: syncEn,
    artifact: artifactEn,
    session: sessionEn,
    terminal: terminalEn,
  },
} as const;

void i18next.use(initReactI18next).init({
  resources,
  lng: "pt-BR",
  fallbackLng: "pt-BR",
  defaultNS: "common",
  ns: ["common", "project", "board", "sync", "artifact", "session", "terminal"],
  interpolation: {
    escapeValue: false,
  },
});

export { i18next as i18n };
export default i18next;
