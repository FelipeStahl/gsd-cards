import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const getRecentsMock = vi.fn();
const setLanguageMock = vi.fn();

// 05-01-PLAN.md (DIST-01): `HomeScreen` agora monta `LanguageSwitcher`
// incondicionalmente no header — que importa `setLanguage`/
// `SUPPORTED_LANGUAGES` do MESMO módulo `../../persistence/app-store`. Sem
// estender este mock, `SUPPORTED_LANGUAGES` chegaria `undefined` no
// `LanguageSwitcher` (o mock só cobria `getRecents`) e o `.map` quebraria
// TODOS os testes deste arquivo, não só os que tocam idioma.
vi.mock("../../persistence/app-store", () => ({
  getRecents: (...args: unknown[]) => getRecentsMock(...args),
  setLanguage: (...args: unknown[]) => setLanguageMock(...args),
  SUPPORTED_LANGUAGES: ["pt-BR", "en"],
  isSupportedLanguage: (value: string) => ["pt-BR", "en"].includes(value),
}));

// `ProjectCard`/`CreateProjectFlow` têm suas próprias suítes dedicadas
// (`ProjectCard.test.tsx`, verificação manual de `CreateProjectFlow` via
// `session-store.test.ts` -t "createProjectSession") — mockados aqui para
// que `HomeScreen.test.tsx` exercite só a responsabilidade desta camada
// (grid/empty-state/ordem), sem depender do pipeline de saúde lazy
// (`validateProjectRoot`/`readPlanningText`/`parseStateFile`) nem do
// diálogo nativo de pasta.
vi.mock("./ProjectCard", () => ({
  ProjectCard: ({ entry }: { entry: { root: string; name: string } }) => (
    <div data-testid="project-card">{entry.name}</div>
  ),
}));

vi.mock("./CreateProjectFlow", () => ({
  CreateProjectFlow: () => <div data-testid="create-project-flow" />,
}));

const { HomeScreen } = await import("./HomeScreen");

beforeEach(() => {
  getRecentsMock.mockReset();
  setLanguageMock.mockReset().mockResolvedValue(undefined);
});

describe("HomeScreen", () => {
  it("zero recentes: renderiza o empty state com as duas CTAs", async () => {
    getRecentsMock.mockResolvedValue([]);

    render(<HomeScreen onOpenFolder={vi.fn()} onOpenRecent={vi.fn()} />);

    expect(await screen.findByText("Nenhum projeto ainda")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Abrir pasta" }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("button", { name: "Novo projeto GSD" }).length,
    ).toBeGreaterThanOrEqual(1);
    // Duas CTAs no header + duas repetidas dentro do EmptyState (04-UI-SPEC
    // ## Home Screen — Layout: "zero recentes renderiza EmptyState... com
    // ambas as CTAs inline").
    expect(screen.getAllByRole("button", { name: "Abrir pasta" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Novo projeto GSD" })).toHaveLength(2);
  });

  it("N recentes: renderiza um card por recente, na ordem recebida (lastOpened desc)", async () => {
    getRecentsMock.mockResolvedValue([
      { root: "/projects/b", name: "b", lastOpened: "2026-07-24T11:00:00.000Z" },
      { root: "/projects/a", name: "a", lastOpened: "2026-07-24T10:00:00.000Z" },
    ]);

    render(<HomeScreen onOpenFolder={vi.fn()} onOpenRecent={vi.fn()} />);

    const cards = await screen.findAllByTestId("project-card");
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.textContent)).toEqual(["b", "a"]);
    expect(screen.queryByText("Nenhum projeto ainda")).not.toBeInTheDocument();
  });

  it("clicar em 'Novo projeto GSD' abre o CreateProjectFlow", async () => {
    getRecentsMock.mockResolvedValue([]);

    render(<HomeScreen onOpenFolder={vi.fn()} onOpenRecent={vi.fn()} />);
    await screen.findByText("Nenhum projeto ainda");

    expect(screen.queryByTestId("create-project-flow")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Novo projeto GSD" })[0]);

    expect(screen.getByTestId("create-project-flow")).toBeInTheDocument();
  });
});
