import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";

import { ArtifactModal } from "./ArtifactModal";
import { useUiStore } from "../stores/ui-store";
import { useDetailStore } from "../stores/detail-store";
import { ok, unrecognized } from "../planning/parse-result";

const initialUiState = useUiStore.getState();
const initialDetailState = useDetailStore.getState();

beforeEach(() => {
  useUiStore.setState(initialUiState, true);
  useDetailStore.setState(initialDetailState, true);
});

function openWithContent(path: string, content: string) {
  useDetailStore.setState({ artifactContent: { [path]: ok(content) } });
  useUiStore.getState().openArtifact(path);
}

describe("ArtifactModal — modo renderizado GFM (BOARD-06, D-11)", () => {
  it("um SUMMARY de fixture com tabela GFM renderiza um elemento de tabela com as células esperadas", () => {
    openWithContent(
      "/x/table.md",
      "| Name | Value |\n| --- | --- |\n| Alpha | 1 |\n",
    );

    const { container } = render(<ArtifactModal />);

    expect(container.querySelector("table")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("um artefato com itens de checklist renderiza caixas de seleção desabilitadas", () => {
    openWithContent(
      "/x/checklist.md",
      "- [ ] Tarefa pendente\n- [x] Tarefa concluída\n",
    );

    const { container } = render(<ArtifactModal />);

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
    for (const checkbox of checkboxes) {
      expect(checkbox).toBeDisabled();
    }
  });
});

describe("ArtifactModal — modo raw (D-15, BOARD-05)", () => {
  it("um artefato marcado como não reconhecido mostra o banner de aviso com o motivo e não renderiza markdown", () => {
    useDetailStore.setState({
      artifactContent: {
        "/x/broken.md": unrecognized(
          [{ path: "/x/broken.md", reason: "frontmatter YAML malformado" }],
          "| still | looks like | markdown |\n| --- | --- | --- |\n",
        ),
      },
    });
    useUiStore.getState().openArtifact("/x/broken.md");

    const { container } = render(<ArtifactModal />);

    expect(screen.getByText(/Falha ao processar/)).toBeInTheDocument();
    expect(screen.getByText(/frontmatter YAML malformado/)).toBeInTheDocument();
    // Modo raw nunca tenta renderizar markdown — mesmo conteúdo com sintaxe
    // de tabela deve aparecer como texto cru, nunca como <table>.
    expect(container.querySelector("table")).not.toBeInTheDocument();
  });

  it("um artefato cuja linha de origem no painel já era conhecida como não reconhecida também abre em raw, mesmo com leitura crua bem-sucedida", () => {
    useDetailStore.setState({
      artifactContent: { "/x/plan.md": ok("# Conteúdo lido com sucesso") },
      treeByPhaseId: {
        "01": ok({
          phaseDirPath: "/x",
          plans: [],
          artifacts: [
            {
              path: "/x/plan.md",
              fileName: "plan.md",
              kind: "plan",
              parsed: "unrecognized",
              issues: [{ path: "/x/plan.md", reason: "não foi possível localizar as tarefas do plano" }],
            },
          ],
        }),
      },
    });
    useUiStore.getState().openArtifact("/x/plan.md");

    render(<ArtifactModal />);

    expect(screen.getByText(/não foi possível localizar as tarefas do plano/)).toBeInTheDocument();
  });
});

describe("ArtifactModal — postura de segurança contra conteúdo hostil (T-01-02)", () => {
  it("um artefato contendo uma tag de script embutida no markdown não produz nenhum elemento de script na árvore renderizada", () => {
    openWithContent(
      "/x/hostile.md",
      "Texto normal.\n\n<script>alert('xss')</script>\n\nMais texto.",
    );

    const { container } = render(<ArtifactModal />);

    expect(container.querySelector("script")).not.toBeInTheDocument();
  });

  it("um link com esquema javascript: não produz um elemento âncora navegável", () => {
    openWithContent("/x/hostile-link.md", "[Clique aqui](javascript:alert(1))");

    const { container } = render(<ArtifactModal />);

    expect(container.querySelectorAll("a").length).toBe(0);
  });

  it("um link http(s) legítimo também não produz uma âncora navegável — capability de abrir URL ainda não existe nesta fase", () => {
    openWithContent("/x/safe-link.md", "[GSD](https://example.com)");

    const { container } = render(<ArtifactModal />);

    expect(container.querySelectorAll("a").length).toBe(0);
    expect(screen.getByText("GSD")).toBeInTheDocument();
  });
});

describe("ArtifactModal — fechar", () => {
  it("Esc fecha o modal", () => {
    openWithContent("/x/esc.md", "# Conteúdo");

    render(<ArtifactModal />);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(useUiStore.getState().openArtifactPath).toBeNull();
  });

  it("clicar no botão de fechar limpa openArtifactPath", () => {
    openWithContent("/x/close.md", "# Conteúdo");

    render(<ArtifactModal />);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(useUiStore.getState().openArtifactPath).toBeNull();
  });
});
