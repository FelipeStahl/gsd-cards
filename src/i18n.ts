import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import commonPtBR from "./locales/pt-BR/common.json";
import commonEn from "./locales/en/common.json";

// Estrutura deliberada: um arquivo por namespace (`common.json` agora;
// `project.json`, `board.json`, `sync.json`, `artifact.json` chegam nos
// planos seguintes) para que planos paralelos não disputem o mesmo arquivo.
export const resources = {
  "pt-BR": {
    common: commonPtBR,
  },
  en: {
    common: commonEn,
  },
} as const;

void i18next.use(initReactI18next).init({
  resources,
  lng: "pt-BR",
  fallbackLng: "pt-BR",
  defaultNS: "common",
  ns: ["common"],
  interpolation: {
    escapeValue: false,
  },
});

export { i18next as i18n };
export default i18next;
