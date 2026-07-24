import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// `LanguageSwitcher` importa `setLanguage` de `../persistence/app-store`
// (que por sua vez importa o `LazyStore` real do plugin Tauri) — mockado no
// nível do módulo, mesmo padrão de `HomeScreen.test.tsx`, para que este
// arquivo nunca dependa de `window.__TAURI_INTERNALS__`.
const setLanguageMock = vi.fn();
vi.mock("../persistence/app-store", () => ({
  setLanguage: (...args: unknown[]) => setLanguageMock(...args),
  SUPPORTED_LANGUAGES: ["pt-BR", "en"],
}));

const { LanguageSwitcher } = await import("./LanguageSwitcher");
const { i18n } = await import("../i18n");

beforeEach(() => {
  setLanguageMock.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  // `i18n.changeLanguage` muda o singleton global de verdade — sem
  // resetar (e AWAIT'ar), um teste que troca para "en" vazaria para os
  // testes seguintes deste mesmo arquivo (isolamento do vitest é por
  // arquivo, não por teste).
  await i18n.changeLanguage("pt-BR");
});

describe("LanguageSwitcher", () => {
  it("renderiza role=group com o aria-label do groupLabel e dois segmentos PT/EN", () => {
    render(<LanguageSwitcher />);

    expect(screen.getByRole("group")).toHaveAttribute("aria-label", "Idioma da interface");
    expect(screen.getByRole("button", { name: "Português" })).toHaveTextContent("PT");
    expect(screen.getByRole("button", { name: "English" })).toHaveTextContent("EN");
  });

  it("default pt-BR: o segmento PT tem aria-pressed=true e o EN aria-pressed=false", () => {
    render(<LanguageSwitcher />);

    expect(screen.getByRole("button", { name: "Português" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("clicar no segmento inativo (EN) chama i18n.changeLanguage('en') E setLanguage('en')", async () => {
    render(<LanguageSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(i18n.language).toBe("en");
    expect(setLanguageMock).toHaveBeenCalledWith("en");
  });

  it("após trocar para 'en', o segmento EN vira o ativo (aria-pressed reflete i18n.language) — e os próprios rótulos re-traduzem (todo useTranslation re-renderiza)", async () => {
    render(<LanguageSwitcher />);

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    // A troca de idioma re-renderiza TODO consumidor `useTranslation` —
    // inclusive os próprios rótulos a11y do switcher, que passam a ler as
    // chaves `common.language.*` na tradução "en" ("Portuguese" no lugar de
    // "Português"). `getByRole` com o nome antigo ("Português") deixaria de
    // encontrar o botão — a própria prova de que o re-render é real.
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Portuguese" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
