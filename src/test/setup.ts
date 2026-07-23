import "@testing-library/jest-dom/vitest";
// Inicializa o i18next globalmente para os testes — sem isso, useTranslation()
// devolve as chaves cruas (ex.: "error.notGsd.heading") em vez do texto
// traduzido, já que nenhum teste de componente importa main.tsx.
import "../i18n";
