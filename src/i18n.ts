import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import commonPtBR from "./locales/pt-BR/common.json";
import commonEn from "./locales/en/common.json";
import projectPtBR from "./locales/pt-BR/project.json";
import projectEn from "./locales/en/project.json";

// Estrutura deliberada: um arquivo por namespace (`common.json`, `project.json`
// agora; `board.json`, `sync.json`, `artifact.json` chegam nos planos
// seguintes) para que planos paralelos não disputem o mesmo arquivo.
export const resources = {
  "pt-BR": {
    common: commonPtBR,
    project: projectPtBR,
  },
  en: {
    common: commonEn,
    project: projectEn,
  },
} as const;

void i18next.use(initReactI18next).init({
  resources,
  lng: "pt-BR",
  fallbackLng: "pt-BR",
  defaultNS: "common",
  ns: ["common", "project"],
  interpolation: {
    escapeValue: false,
  },
});

export { i18next as i18n };
export default i18next;
