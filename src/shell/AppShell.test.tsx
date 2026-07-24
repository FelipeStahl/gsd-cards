import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";

import { i18n } from "../i18n";
import { ok } from "../planning/parse-result";
import { useBoardStore } from "../stores/board-store";
import { useSessionStore } from "../stores/session-store";
import { useUpdateStore } from "../updates/update-store";
import { AppShell } from "./AppShell";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

// A home (04-01-PLAN.md) lê `getRecents()` via `../persistence/app-store` —
// mockado no nível do módulo (não do plugin `@tauri-apps/plugin-store` cru)
// para que TODOS os testes deste arquivo (inclusive os que nem tocam a
// home) nunca façam uma chamada real de `invoke` ao plugin de store.
// `getLanguage`/`setLanguage`/`SUPPORTED_LANGUAGES` (05-01-PLAN.md, DIST-01)
// entram no mesmo mock pelo mesmo motivo: o boot-restore effect do AppShell
// chama `getLanguage()` incondicionalmente, e o `LanguageSwitcher` agora
// montado dentro de `Header`/`HomeScreen` (Plano 05-01 Tarefa 2) lê
// `SUPPORTED_LANGUAGES` no PRIMEIRO render — sem isso, `undefined.map`
// quebraria TODOS os testes deste arquivo, não só os de idioma.
const getRecentsMock = vi.fn();
const upsertRecentMock = vi.fn();
const getLanguageMock = vi.fn();
const setLanguageMock = vi.fn();
vi.mock("../persistence/app-store", () => ({
  getRecents: (...args: unknown[]) => getRecentsMock(...args),
  upsertRecent: (...args: unknown[]) => upsertRecentMock(...args),
  removeRecent: vi.fn(),
  getLanguage: (...args: unknown[]) => getLanguageMock(...args),
  setLanguage: (...args: unknown[]) => setLanguageMock(...args),
  SUPPORTED_LANGUAGES: ["pt-BR", "en"],
}));

// DIST-03 (05-03-PLAN.md): o boot effect do AppShell chama `checkForUpdate()`
// incondicionalmente, mesmo motivo do mock de `getLanguage` acima — sem
// isso, o `check()` real do `@tauri-apps/plugin-updater` seria chamado (via
// `invoke`) em TODOS os testes deste arquivo, não só os de update.
const checkForUpdateMock = vi.fn();
vi.mock("../updates/check-update", () => ({
  checkForUpdate: (...args: unknown[]) => checkForUpdateMock(...args),
  installUpdateAndRelaunch: vi.fn(),
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
const initialUpdateState = useUpdateStore.getState();

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
  // Default "pt-BR" (não `null`) de propósito: o jsdom deste ambiente de
  // teste relata `navigator.language === "en-US"` por padrão, então um
  // default `null` acionaria o fallback de navigator em TODOS os testes
  // deste arquivo (inclusive os que nunca tocam idioma), trocando a UI para
  // "en" e quebrando os `getByText` em pt-BR já existentes. Um "pt-BR"
  // salvo simula o caso comum (usuário já tem uma escolha persistida) e
  // mantém os testes pré-existentes neutros; os testes de boot-restore
  // abaixo sobrescrevem este mock explicitamente por teste.
  getLanguageMock.mockReset().mockResolvedValue("pt-BR");
  setLanguageMock.mockReset().mockResolvedValue(undefined);
  checkForUpdateMock.mockReset().mockResolvedValue(null);
  useUpdateStore.setState(initialUpdateState, true);
  vi.mocked(open).mockReset().mockResolvedValue(null);
});

afterEach(async () => {
  // O boot-restore effect (DIST-01) muda `i18n.language` de verdade — sem
  // resetar (e AWAIT'ar) aqui, um teste que restaura "en" vazaria para os
  // testes seguintes DESTE arquivo (mesmo registro de módulo, isolamento do
  // vitest é por arquivo, não por teste).
  await i18n.changeLanguage("pt-BR");
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

describe("AppShell — restauração de idioma no boot (DIST-01, T-05-01)", () => {
  const originalNavigatorLanguage = window.navigator.language;

  afterEach(() => {
    Object.defineProperty(window.navigator, "language", {
      value: originalNavigatorLanguage,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  // Cada teste cria seu PRÓPRIO spy de `i18n.changeLanguage` (sem
  // implementação real, `mockResolvedValue` no-op) e restaura no afterEach —
  // isola completamente da mutação real do singleton global `i18n.language`,
  // que outros testes deste mesmo arquivo (SessionSidebar, EmptyState etc.)
  // continuam assumindo em pt-BR. A asserção verifica a CHAMADA (o que o
  // `<behavior>` do plano especifica), não o estado final assentado.
  function spyOnChangeLanguage() {
    return vi.spyOn(i18n, "changeLanguage").mockImplementation(
      (() => Promise.resolve(i18n.t)) as typeof i18n.changeLanguage,
    );
  }

  it("idioma salvo 'en' (enum válido, diferente do default pt-BR): o boot effect chama changeLanguage('en')", async () => {
    getLanguageMock.mockResolvedValue("en");
    const changeLanguageSpy = spyOnChangeLanguage();

    render(<AppShell />);

    await waitFor(() => {
      expect(changeLanguageSpy).toHaveBeenCalledWith("en");
    });
  });

  it("sem idioma salvo + navigator.language começa com 'en': aplica o fallback changeLanguage('en')", async () => {
    getLanguageMock.mockResolvedValue(null);
    Object.defineProperty(window.navigator, "language", { value: "en-US", configurable: true });
    const changeLanguageSpy = spyOnChangeLanguage();

    render(<AppShell />);

    await waitFor(() => {
      expect(changeLanguageSpy).toHaveBeenCalledWith("en");
    });
  });

  it("sem idioma salvo + navigator.language não-en: mantém o default pt-BR, nunca chama changeLanguage", async () => {
    getLanguageMock.mockResolvedValue(null);
    Object.defineProperty(window.navigator, "language", { value: "fr-FR", configurable: true });
    const changeLanguageSpy = spyOnChangeLanguage();

    render(<AppShell />);

    await waitFor(() => {
      expect(getLanguageMock).toHaveBeenCalled();
    });
    expect(changeLanguageSpy).not.toHaveBeenCalled();
  });
});

describe("AppShell — checagem de atualização no boot (DIST-03, T-05-05)", () => {
  it("chama checkForUpdate() UMA vez no mount, independentemente da view", () => {
    render(<AppShell />);

    expect(checkForUpdateMock).toHaveBeenCalledTimes(1);
  });

  it("quando checkForUpdate resolve um Update, popula a update-store com available + a versão", async () => {
    const update = { version: "9.9.9" };
    checkForUpdateMock.mockResolvedValue(update);

    render(<AppShell />);

    await waitFor(() => {
      expect(useUpdateStore.getState().state).toBe("available");
    });
    expect(useUpdateStore.getState().version).toBe("9.9.9");
    expect(useUpdateStore.getState().pendingUpdate).toBe(update);
  });

  it("quando checkForUpdate resolve null (sem atualização ou falha degradada), marca a update-store como up-to-date", async () => {
    checkForUpdateMock.mockResolvedValue(null);

    render(<AppShell />);

    await waitFor(() => {
      expect(useUpdateStore.getState().state).toBe("up-to-date");
    });
  });
});
