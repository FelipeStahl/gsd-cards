import "@testing-library/jest-dom/vitest";
// Inicializa o i18next globalmente para os testes — sem isso, useTranslation()
// devolve as chaves cruas (ex.: "error.notGsd.heading") em vez do texto
// traduzido, já que nenhum teste de componente importa main.tsx.
import "../i18n";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Explícito em vez de depender só do auto-registro do RTL (05-01-PLAN.md,
// DIST-01): sem desmontar de verdade entre testes, o boot-restore effect do
// AppShell (que muda `i18n.language`, um singleton GLOBAL) de um teste
// anterior podia resolver tarde e vazar estado de idioma para o próximo
// teste — flakiness observada nos testes de restauração de idioma.
afterEach(() => {
  cleanup();
});
