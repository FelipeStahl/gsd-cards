import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToolMissingState } from "./ToolMissingState";

describe("ToolMissingState — três variantes (PROJ-04)", () => {
  it("claude-missing: mostra a cópia de Claude CLI ausente", () => {
    render(<ToolMissingState state="claude-missing" />);

    expect(screen.getByText("Claude CLI não encontrado")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Instale o Claude CLI e adicione-o ao PATH do sistema. Consulte a documentação oficial do Claude Code para instruções. Depois de instalar, reabra este projeto.",
      ),
    ).toBeInTheDocument();
  });

  it("gsd-core-missing: mostra a cópia de gsd-core ausente", () => {
    render(<ToolMissingState state="gsd-core-missing" />);

    expect(screen.getByText("gsd-core não encontrado neste projeto")).toBeInTheDocument();
  });

  it("both-missing: mostra a cópia de ambos ausentes", () => {
    render(<ToolMissingState state="both-missing" />);

    expect(screen.getByText("Claude CLI e gsd-core não encontrados")).toBeInTheDocument();
  });
});
