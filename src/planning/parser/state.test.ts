import { describe, expect, it } from "vitest";

import { parseStateFile } from "./state";
import { isUnrecognized } from "../parse-result";

// `?raw` é o import de asset suportado nativamente pelo Vite (ver
// node_modules/vite/client.d.ts) — mais confiável em ambiente de teste do
// que `new URL(..., import.meta.url)` + `fs`, que o Vite reescreve como
// referência de asset em vez de deixar como URL `file://` de runtime.
import healthyStateMd from "../__fixtures__/state/healthy-STATE.md?raw";
import brokenFrontmatterStateMd from "../__fixtures__/state/broken-frontmatter-STATE.md?raw";

describe("parseStateFile — fixture saudável", () => {
  it("extrai milestone, currentPhase, currentPhaseName e progress do frontmatter", () => {
    const result = parseStateFile(healthyStateMd, "healthy-STATE.md");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value.milestone).toEqual({ kind: "ok", value: "v1.0" });
    expect(result.value.currentPhase).toEqual({ kind: "ok", value: 1 });
    expect(result.value.currentPhaseName).toEqual({
      kind: "ok",
      value: "espelho-fiel",
    });
    expect(result.value.progress.kind).toBe("ok");
    if (result.value.progress.kind === "ok") {
      expect(result.value.progress.value.percent).toBe(0);
      expect(result.value.progress.value.totalPhases).toBe(5);
    }
  });

  it("extrai os três blockers de ### Blockers/Concerns com as fases corretas", () => {
    const result = parseStateFile(healthyStateMd, "healthy-STATE.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value.blockers).toHaveLength(3);
    expect(result.value.blockers[0].phases).toEqual([1]);
    expect(result.value.blockers[2].phases).toEqual([2]);
  });

  it("blocker rotulado com o padrão [Phase 1/4] produz phases: [1, 4]", () => {
    const result = parseStateFile(healthyStateMd, "healthy-STATE.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const multiPhaseBlocker = result.value.blockers.find((b) =>
      b.text.includes("Fragilidade do parser"),
    );
    expect(multiPhaseBlocker).toBeDefined();
    expect(multiPhaseBlocker?.phases).toEqual([1, 4]);
  });

  it("ignora o parágrafo de comentário entre colchetes sob o heading (não é um item de lista)", () => {
    const result = parseStateFile(healthyStateMd, "healthy-STATE.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const commentAsBlocker = result.value.blockers.find((b) =>
      b.text.includes("Issues that affect future work"),
    );
    expect(commentAsBlocker).toBeUndefined();
  });
});

describe("parseStateFile — degradação graciosa", () => {
  it("carrega broken-frontmatter-STATE.md, resulta em unrecognized e não lança exceção", () => {
    expect(() => {
      const result = parseStateFile(
        brokenFrontmatterStateMd,
        "broken-frontmatter-STATE.md",
      );
      expect(result.kind).toBe("unrecognized");
      expect(isUnrecognized(result)).toBe(true);
    }).not.toThrow();
  });

  it("frontmatter sem a chave progress: progress vira unrecognized, milestone/currentPhase continuam disponíveis", () => {
    const raw = `---
milestone: v2.0
current_phase: 3
current_phase_name: some-phase
status: executing
---

# Project State
`;
    const result = parseStateFile(raw, "no-progress.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value.milestone).toEqual({ kind: "ok", value: "v2.0" });
    expect(result.value.currentPhase).toEqual({ kind: "ok", value: 3 });
    expect(isUnrecognized(result.value.progress)).toBe(true);
  });

  it("item de blocker que não casa o rótulo [Phase N] entra com phases: [] sem ser descartado", () => {
    const raw = `---
milestone: v2.0
current_phase: 3
current_phase_name: some-phase
status: executing
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 1
  completed_plans: 0
  percent: 0
---

## Accumulated Context

### Blockers/Concerns

- Um blocker sem rótulo de fase reconhecível.
`;
    const result = parseStateFile(raw, "unlabeled-blocker.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value.blockers).toHaveLength(1);
    expect(result.value.blockers[0].phases).toEqual([]);
    expect(result.value.blockers[0].text).toContain("sem rótulo de fase");
  });
});

describe("parseStateFile — percent nunca recalculado", () => {
  it("devolve progress.percent exatamente como está no arquivo, mesmo quando não bate com completed/total", () => {
    const raw = `---
milestone: v2.0
current_phase: 3
current_phase_name: some-phase
status: executing
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 10
  completed_plans: 3
  percent: 77
---

# Project State
`;
    // 2/5 fases matematicamente daria 40%, não 77% — o parser deve devolver
    // o valor literal do arquivo, nunca recalculado a partir de completed/total.
    const result = parseStateFile(raw, "literal-percent.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.value.progress.kind).toBe("ok");
    if (result.value.progress.kind === "ok") {
      expect(result.value.progress.value.percent).toBe(77);
    }
  });
});
