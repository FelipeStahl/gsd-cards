import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";

import { ok } from "../planning/parse-result";
import { useBoardStore } from "../stores/board-store";
import { useSessionStore } from "../stores/session-store";
import { AppShell } from "./AppShell";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

// A home (04-01-PLAN.md) lê `getRecents()` via `../persistence/app-store` —
// mockado no nível do módulo (não do plugin `@tauri-apps/plugin-store` cru)
// para que TODOS os testes deste arquivo (inclusive os que nem tocam a
// home) nunca façam uma chamada real de `invoke` ao plugin de store.
const getRecentsMock = vi.fn();
const upsertRecentMock = vi.fn();
vi.mock("../persistence/app-store", () => ({
  getRecents: (...args: unknown[]) => getRecentsMock(...args),
  upsertRecent: (...args: unknown[]) => upsertRecentMock(...args),
  removeRecent: vi.fn(),
}));

// `ProjectCard` (04-04-PLAN.md) tem sua própria suíte dedicada
// (`components/home/ProjectCard.test.tsx`) cobrindo o pipeline de saúde
// lazy (validate/read/parse) e os três variants — mockado aqui como um
// botão mínimo para que ESTE teste (AppShell) prove só o que é sua própria
// responsabilidade: a home substitui o shell inteiro e o clique num
// recente chama `openProject` + volta a view para "board".
vi.mock("../components/home/ProjectCard", () => ({
  ProjectCard: ({
    entry,
    onOpen,
  }: {
    entry: { root: string; name: string };
    onOpen: (root: string) => void;
  }) => (
    <button type="button" onClick={() => onOpen(entry.root)}>
      {entry.name}
    </button>
  ),
}));

// SessionSidebar (SESS-01/PROJ-04) invoca `check_claude_on_path` (boot) e
// `register_sessions_scope` (open/reopen) — nenhum teste deste arquivo
// exercita o gate de ferramentas ausentes (ver `SessionSidebar.test.tsx`
// para essa suíte dedicada), então `claude` resolve como presente por
// padrão e a descoberta de sessões degrada silenciosamente.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn().mockRejectedValue(new Error("not mocked in this test")),
  stat: vi.fn(),
}));

const initialState = useBoardStore.getState();
const initialSessionState = useSessionStore.getState();

beforeEach(() => {
  useBoardStore.setState(initialState, true);
  useSessionStore.setState(initialSessionState, true);
  invokeMock.mockReset();
  invokeMock.mockImplementation((command: string) => {
    if (command === "check_claude_on_path") {
      return Promise.resolve({ claudePath: "/usr/local/bin/claude" });
    }
    return Promise.reject(new Error("register_sessions_scope indisponível neste teste"));
  });
  getRecentsMock.mockReset().mockResolvedValue([]);
  upsertRecentMock.mockReset().mockResolvedValue(undefined);
  vi.mocked(open).mockReset().mockResolvedValue(null);
});

describe("AppShell", () => {
  it("CR-01: boot fresco (sem projeto ativo) renderiza a Home automaticamente — nunca o EmptyState do board pré-Fase-4", async () => {
    // Nenhum `useBoardStore.setState({ view: ... })` explícito aqui de
    // propósito — este teste prova o DEFAULT de `board-store.ts` (view
    // inicial "home"), não um estado forçado. `04-REVIEW.md` CR-01: antes
    // desta correção, este mesmo cenário renderizava o `EmptyState` do
    // board ("Nenhum projeto aberto"), nunca a Home/recentes.
    render(<AppShell />);

    await screen.findByText("Projetos recentes");
    // Home substitui o shell inteiro — Header/SessionSidebar nunca montam
    // enquanto view === "home".
    expect(screen.queryByText("Sessões")).not.toBeInTheDocument();
    expect(screen.queryByText("Nenhum projeto aberto")).not.toBeInTheDocument();
  });

  it("CR-01: abrir uma pasta a partir da Home (CTA 'Abrir pasta') troca para a view board mesmo quando openProject falha", async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    vi.mocked(open).mockResolvedValueOnce("/pasta-invalida");
    // `invokeMock` (default deste arquivo) rejeita `validate_project_root`
    // (nenhum `mockImplementation` cobre esse comando), então `openProject`
    // termina em status "error" — o que este teste prova é que a VIEW ainda
    // assim troca para "board" (onde o ErrorState realmente renderiza),
    // nunca deixando o usuário preso na Home sem feedback algum.
    render(<AppShell />);
    await screen.findByText("Projetos recentes");

    // Sem recentes, o CTA "Abrir pasta" aparece duas vezes (header + dentro
    // do EmptyState inline) — qualquer um dos dois aciona o mesmo
    // `onOpenFolder`/`handleOpenProject`, então o primeiro basta aqui.
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir pasta" })[0]);

    await waitFor(() => {
      expect(useBoardStore.getState().view).toBe("board");
    });
    await waitFor(() => {
      expect(useBoardStore.getState().status).toBe("error");
    });
  });

  it("monta a SessionSidebar real (Plano 04) no lugar do SidebarPlaceholder — mesmo slot 240px fixo", () => {
    useBoardStore.setState({ view: "board" });

    render(<AppShell />);

    expect(screen.getByText("Sessões")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova sessão" })).toBeInTheDocument();
  });

  it("estado idle (view board explícita): mostra o heading de estado vazio e o botão do CTA 'Abrir projeto'", () => {
    // `view: "board"` explícito aqui — o comportamento "idle mostra
    // EmptyState" continua existindo DENTRO da view board (ex.: usuário já
    // navegou para o board e fecha o projeto ativo); só deixou de ser o
    // default de boot, que é o que CR-01 corrigiu.
    useBoardStore.setState({ view: "board" });

    render(<AppShell />);

    expect(screen.getByText("Nenhum projeto aberto")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Abrir projeto" }),
    ).toBeInTheDocument();
  });

  it("estado error (pasta não é projeto GSD): mostra o heading de erro e não mostra o board", () => {
    useBoardStore.setState({
      view: "board",
      status: "error",
      project: null,
      error: {
        kind: "NotAGsdProject",
        message: "Diretório .planning/ não encontrado nesta pasta",
      },
    });

    render(<AppShell />);

    expect(
      screen.getByText("Esta pasta não é um projeto GSD"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Board (chega no Plano 03)")).not.toBeInTheDocument();
  });

  it("estado open: mostra o nome do projeto, o rótulo de milestone e a barra de progresso com aria-valuenow igual ao percent", () => {
    useBoardStore.setState({
      view: "board",
      status: "open",
      error: null,
      project: {
        root: "/home/x",
        projectName: "gsd-cards",
        milestone: ok("v1.0"),
        currentPhase: ok(1),
        currentPhaseName: ok("espelho-fiel"),
        progress: ok({
          totalPhases: 5,
          completedPhases: 0,
          totalPlans: 6,
          completedPlans: 1,
          percent: 42,
        }),
        blockers: [],
        phases: [],
        milestones: [],
        issues: [],
      },
    });

    render(<AppShell />);

    expect(screen.getByText("gsd-cards")).toBeInTheDocument();
    expect(screen.getByText("v1.0")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
  });

  it("view home: renderiza um recente persistido e clicar chama openProject com o root e volta para board", async () => {
    getRecentsMock.mockResolvedValue([
      { root: "/home/x/gsd-cards", name: "gsd-cards", lastOpened: "2026-07-24T10:00:00.000Z" },
    ]);
    useBoardStore.setState({ view: "home" });

    render(<AppShell />);

    const recentButton = await screen.findByRole("button", { name: "gsd-cards" });

    // Home substitui o shell inteiro (Header/SessionSidebar/DrawerRail não montam).
    expect(screen.queryByText("Sessões")).not.toBeInTheDocument();

    fireEvent.click(recentButton);

    // openProject engole a falha de invoke (não mockado neste teste) e
    // segue para status "error" — o que importa aqui é que o fluxo de
    // clique SEMPRE chama openProject com o root exato do recente e SEMPRE
    // troca a view de volta para "board" em seguida.
    await waitFor(() => {
      expect(useBoardStore.getState().view).toBe("board");
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "validate_project_root",
      expect.objectContaining({ root: "/home/x/gsd-cards" }),
    );
  });
});
