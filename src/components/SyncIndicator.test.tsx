import { act, fireEvent, render, screen } from "@testing-library/react";
import { format } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { SyncIndicator } from "./SyncIndicator";
import { i18n } from "../i18n";
import { useBoardStore } from "../stores/board-store";
import { ok } from "../planning/parse-result";

// `vi.spyOn` num named export ESM não funciona ("Module namespace is not
// configurable in ESM") — `vi.mock` com `importOriginal` (mesmo padrão de
// `notify.test.ts`) envolve `format` num `vi.fn` que CHAMA a implementação
// real (call-through), preservando a formatação genuína e ainda permitindo
// inspecionar os argumentos recebidos (o objeto `Locale`).
vi.mock("date-fns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("date-fns")>();
  return { ...actual, format: vi.fn(actual.format) };
});

const initialState = useBoardStore.getState();

function seedProject() {
  useBoardStore.setState({
    status: "open",
    error: null,
    project: {
      root: "/x",
      projectName: "x",
      milestone: ok("v1.0"),
      currentPhase: ok(1),
      currentPhaseName: ok("fase"),
      progress: ok({
        totalPhases: 1,
        completedPhases: 0,
        totalPlans: 1,
        completedPlans: 0,
        percent: 0,
      }),
      blockers: [],
      phases: [],
      milestones: [],
      issues: [],
    },
  });
}

beforeEach(() => {
  useBoardStore.setState(initialState, true);
});

describe("SyncIndicator", () => {
  it("estado healthy: mostra o rótulo com segundos e o ponto de sucesso", () => {
    seedProject();
    useBoardStore.setState({
      sync: { state: "healthy", lastSyncedAt: Date.now() - 5000, degradedSince: null, reason: null },
    });

    render(<SyncIndicator />);

    expect(screen.getByText(/Sincronizado há \d+s/)).toBeInTheDocument();
  });

  it("estado degraded: mostra o rótulo de desatualização e o botão de reconectar, e NÃO mostra o texto de sincronizado", () => {
    seedProject();
    useBoardStore.setState({
      sync: { state: "degraded", lastSyncedAt: null, degradedSince: Date.now(), reason: "sumiu" },
    });

    render(<SyncIndicator />);

    expect(screen.getByText(/Desatualizado desde/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconectar" })).toBeInTheDocument();
    expect(screen.queryByText(/Sincronizado há/)).not.toBeInTheDocument();
  });

  it("clicar em 'Reconectar' chama reconnectWatcher", () => {
    seedProject();
    const reconnectWatcher = vi.fn().mockResolvedValue(undefined);
    useBoardStore.setState({
      sync: { state: "degraded", lastSyncedAt: null, degradedSince: Date.now(), reason: "sumiu" },
      reconnectWatcher,
    });

    render(<SyncIndicator />);
    fireEvent.click(screen.getByRole("button", { name: "Reconectar" }));

    expect(reconnectWatcher).toHaveBeenCalledTimes(1);
  });

  it("sem projeto aberto (idle), não renderiza nada", () => {
    const { container } = render(<SyncIndicator />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("SyncIndicator — o locale de date-fns (estado degraded) segue i18n.language (DIST-01, 05-01-PLAN.md)", () => {
  // O padrão "HH:mm" (numérico, 24h) é deliberadamente invariante por
  // locale — não há AM/PM nem nome de mês para diferenciar visualmente
  // pt-BR de en-US neste formato específico. A prova correta de que a
  // troca de idioma propaga não é o TEXTO renderizado mudar (ele não muda,
  // por design), e sim que `format()` recebe o objeto `Locale` correto do
  // `date-fns/locale` — espiar a própria função importada prova a fiação
  // `i18n.language` -> `DATE_FNS_LOCALE` -> `format(...)`.
  afterEach(async () => {
    await i18n.changeLanguage("pt-BR");
  });

  it("degraded: format() é chamado com o locale ptBR por default e enUS após changeLanguage('en')", async () => {
    vi.mocked(format).mockClear();
    seedProject();
    useBoardStore.setState({
      sync: {
        state: "degraded",
        lastSyncedAt: null,
        degradedSince: new Date("2026-07-24T10:30:00Z").getTime(),
        reason: "sumiu",
      },
    });

    render(<SyncIndicator />);

    expect(format).toHaveBeenLastCalledWith(expect.any(Number), "HH:mm", { locale: ptBR });

    await act(async () => {
      await i18n.changeLanguage("en");
    });

    expect(format).toHaveBeenLastCalledWith(expect.any(Number), "HH:mm", { locale: enUS });
  });
});
