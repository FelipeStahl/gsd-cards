import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mockado só para o teste de stopPropagation abaixo, que precisa de um
// PhaseCardAction HABILITADO (sessão live) para provar que o clique não
// vaza até o card — sem mock, `writeSession` real chamaria `invoke` do
// Tauri fora de um contexto real. Mesmo padrão de `PhaseCardAction.test.tsx`.
vi.mock("../pty/channel", () => ({
  writeSession: () => Promise.resolve(),
}));

import { PhaseCard } from "./PhaseCard";
import { useUiStore } from "../stores/ui-store";
import { useSessionStore } from "../stores/session-store";
import type { PhaseModel } from "../planning/model";
import type { BoardBadge } from "../planning/status";

function makePhase(overrides: Partial<PhaseModel> = {}): PhaseModel {
  return {
    id: "01",
    number: 1,
    name: "Espelho fiel",
    diskStatus: "planned",
    badge: "planned",
    column: "preparing",
    planCount: 3,
    summaryCount: 1,
    requirementIds: ["PROJ-02", "BOARD-01", "BOARD-02"],
    isInserted: false,
    blockers: [],
    issues: [],
    ...overrides,
  };
}

const initialUiState = useUiStore.getState();
const initialSessionState = useSessionStore.getState();

beforeEach(() => {
  useUiStore.setState(initialUiState, true);
  useSessionStore.setState(initialSessionState, true);
});

const BADGE_LABELS: Record<BoardBadge, string> = {
  pending: "pendente",
  discussed: "discutida",
  planned: "planejada",
  executing: "em execução",
  executed: "executada",
  verified: "verificada",
  unknown: "não reconhecida",
};

describe("PhaseCard — os 7 badges de status", () => {
  for (const [badge, label] of Object.entries(BADGE_LABELS) as [BoardBadge, string][]) {
    it(`badge "${badge}" mostra o rótulo "${label}"`, () => {
      render(<PhaseCard phase={makePhase({ badge })} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  }
});

describe("PhaseCard — bloqueio (D-09)", () => {
  it("fase com blockers mostra o badge de bloqueio", () => {
    render(
      <PhaseCard
        phase={makePhase({
          blockers: [{ phases: [1], text: "Bloqueio de exemplo" }],
        })}
      />,
    );
    expect(screen.getByText("bloqueada")).toBeInTheDocument();
  });

  it("fase sem blockers não mostra o badge de bloqueio", () => {
    render(<PhaseCard phase={makePhase({ blockers: [] })} />);
    expect(screen.queryByText("bloqueada")).not.toBeInTheDocument();
  });
});

describe("PhaseCard — fase decimal inserida (D-07)", () => {
  it("isInserted true mostra o badge 'inserida'", () => {
    render(
      <PhaseCard
        phase={makePhase({ id: "02.1", number: 2.1, isInserted: true })}
      />,
    );
    expect(screen.getByText("inserida")).toBeInTheDocument();
  });

  it("isInserted false não mostra o badge 'inserida'", () => {
    render(<PhaseCard phase={makePhase({ isInserted: false })} />);
    expect(screen.queryByText("inserida")).not.toBeInTheDocument();
  });
});

describe("PhaseCard — clique seleciona a fase (D-10)", () => {
  it("clicar no card chama selectPhase com o id certo", () => {
    render(<PhaseCard phase={makePhase({ id: "03", name: "Board interativo" })} />);
    // Clica no título (bolha até o role="button" do card) em vez de
    // screen.getByRole("button") — desde este plano (03-01) o card também
    // renderiza o botão de PhaseCardAction em Row 2, então há mais de um
    // elemento com role="button" no DOM.
    fireEvent.click(screen.getByText("03. Board interativo"));
    expect(useUiStore.getState().selectedPhaseId).toBe("03");
  });
});

describe("PhaseCard — ação contextual de fase (ACT-01)", () => {
  it("fase não-complete renderiza o botão de ação mapeado", () => {
    render(<PhaseCard phase={makePhase({ diskStatus: "planned" })} />);
    expect(screen.getByRole("button", { name: "Executar" })).toBeInTheDocument();
  });

  it("fase complete não renderiza nenhum botão de ação", () => {
    render(<PhaseCard phase={makePhase({ diskStatus: "complete", badge: "verified" })} />);
    // Só o role="button" do próprio card deve sobrar — nenhum botão de ação.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("clicar no botão de ação não dispara selectPhase (stopPropagation)", () => {
    // Sessão live para o botão renderizar HABILITADO — um botão desabilitado
    // não invoca o onClick do React, então não provaria nada sobre
    // stopPropagation (o bubbling nativo do clique num <button disabled>
    // ainda alcançaria o card no jsdom, mascarando um regresso real).
    useSessionStore.setState((state) => {
      state.activeSessionId = "session-a1";
      state.lastFocusedSessionId = "session-a1";
      state.sessions = [{ id: "session-a1", lastModified: new Date(), origin: "live" }];
    });
    render(<PhaseCard phase={makePhase({ id: "03", diskStatus: "planned" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Executar" }));
    expect(useUiStore.getState().selectedPhaseId).toBeNull();
  });
});

describe("PhaseCard — parseWarning (BOARD-05)", () => {
  it("parseWarning true troca o badge de status pelo badge 'não reconhecida'", () => {
    render(<PhaseCard phase={makePhase({ badge: "planned" })} parseWarning />);
    expect(screen.getByText("não reconhecida")).toBeInTheDocument();
    expect(screen.queryByText("planejada")).not.toBeInTheDocument();
  });
});

describe("PhaseCard — progresso de planos e requisitos", () => {
  it("mostra a fração concluídos/total e a contagem de requisitos", () => {
    render(
      <PhaseCard
        phase={makePhase({ planCount: 3, summaryCount: 1, requirementIds: ["A", "B"] })}
      />,
    );
    expect(screen.getAllByText("1/3").length).toBeGreaterThan(0);
    expect(screen.getByText("2 requisitos")).toBeInTheDocument();
  });
});
