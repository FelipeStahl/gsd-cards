import { describe, expect, it } from "vitest";

import { parseRoadmap } from "./roadmap";
import { isUnrecognized } from "../parse-result";

import healthyRoadmapMd from "../__fixtures__/roadmap/healthy-ROADMAP.md?raw";

describe("parseRoadmap — fixture real deste repositório", () => {
  it("devolve exatamente 5 fases", () => {
    const result = parseRoadmap(healthyRoadmapMd, "healthy-ROADMAP.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.value.phases).toHaveLength(5);
  });

  it("a fase 1 tem number 1 e name 'Espelho fiel'", () => {
    const result = parseRoadmap(healthyRoadmapMd, "healthy-ROADMAP.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const phase1 = result.value.phases[0];
    expect(phase1.number).toEqual({ kind: "ok", value: 1 });
    expect(phase1.name).toEqual({ kind: "ok", value: "Espelho fiel" });
  });

  it("a fase 1 tem goal não vazio", () => {
    const result = parseRoadmap(healthyRoadmapMd, "healthy-ROADMAP.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const phase1 = result.value.phases[0];
    expect(phase1.goal.kind).toBe("ok");
    if (phase1.goal.kind === "ok") {
      expect(phase1.goal.value.length).toBeGreaterThan(0);
    }
  });

  it("a fase 1 lista exatamente os 7 requisitos do ROADMAP", () => {
    const result = parseRoadmap(healthyRoadmapMd, "healthy-ROADMAP.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const phase1 = result.value.phases[0];
    expect(phase1.requirementIds).toEqual({
      kind: "ok",
      value: [
        "PROJ-02",
        "BOARD-01",
        "BOARD-02",
        "BOARD-03",
        "BOARD-04",
        "BOARD-05",
        "BOARD-06",
      ],
    });
  });

  it("a fase 1 tem success criteria com pelo menos 5 itens", () => {
    const result = parseRoadmap(healthyRoadmapMd, "healthy-ROADMAP.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const phase1 = result.value.phases[0];
    expect(phase1.successCriteria.kind).toBe("ok");
    if (phase1.successCriteria.kind === "ok") {
      expect(phase1.successCriteria.value.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("a fase 2 depende da fase 1 (dependsOn não vazio)", () => {
    const result = parseRoadmap(healthyRoadmapMd, "healthy-ROADMAP.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const phase2 = result.value.phases[1];
    expect(phase2.dependsOn.kind).toBe("ok");
    if (phase2.dependsOn.kind === "ok") {
      expect(phase2.dependsOn.value.toLowerCase()).toContain("phase 1");
    }
  });

  it("phaseOrder extraído da checklist '## Phases' é [1, 2, 3, 4, 5]", () => {
    const result = parseRoadmap(healthyRoadmapMd, "healthy-ROADMAP.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value.phaseOrder).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("parseRoadmap — degradação graciosa", () => {
  it("heading de fase fora do padrão vira unrecognized só naquele campo, sem derrubar a fase nem o roadmap", () => {
    const raw = `## Phase Details

### Nao Casa O Padrao De Heading

**Goal**: Um objetivo qualquer.
**Requirements**: FOO-01
`;
    const result = parseRoadmap(raw, "malformed-heading.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value.phases).toHaveLength(1);
    expect(isUnrecognized(result.value.phases[0].number)).toBe(true);
    expect(result.value.phases[0].goal).toEqual({ kind: "ok", value: "Um objetivo qualquer." });
  });

  it("fase sem campo Requirements: requirementIds vira unrecognized, goal continua disponível", () => {
    const raw = `## Phase Details

### Phase 1: Fase sem requisitos

**Goal**: Objetivo presente.
**Mode:** mvp
`;
    const result = parseRoadmap(raw, "no-requirements.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const phase = result.value.phases[0];
    expect(phase.goal).toEqual({ kind: "ok", value: "Objetivo presente." });
    expect(isUnrecognized(phase.requirementIds)).toBe(true);
  });

  it("ausência total de '## Phase Details' -> roadmap inteiro unrecognized, sem lançar exceção", () => {
    const raw = `# Roadmap sem a seção esperada

Nada aqui parece com o formato do gsd-core.
`;
    expect(() => {
      const result = parseRoadmap(raw, "no-phase-details.md");
      expect(result.kind).toBe("unrecognized");
      expect(isUnrecognized(result)).toBe(true);
    }).not.toThrow();
  });

  it("Requirements com colchetes envolventes tem os colchetes removidos", () => {
    const raw = `## Phase Details

### Phase 1: Fase com colchetes

**Requirements**: [FOO-01, FOO-02]
`;
    const result = parseRoadmap(raw, "bracketed-requirements.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value.phases[0].requirementIds).toEqual({
      kind: "ok",
      value: ["FOO-01", "FOO-02"],
    });
  });
});
