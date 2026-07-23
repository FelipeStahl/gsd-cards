import { describe, expect, it } from "vitest";

import { parsePlanFile } from "./plan";
import { isUnrecognized } from "../parse-result";

import realPlanMd from "../__fixtures__/artifacts/01-01-PLAN.md?raw";
import corruptedPlanMd from "../__fixtures__/artifacts/corrupted-01-02-PLAN.md?raw";

describe("parsePlanFile — fixture real (01-01-PLAN.md)", () => {
  it("devolve o frontmatter tipado (phase, plan, type, wave, dependsOn, filesModified, autonomous, requirements, mustHaves)", () => {
    const result = parsePlanFile(realPlanMd, "01-01-PLAN.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value.frontmatter.phase).toBe("01-espelho-fiel");
    expect(result.value.frontmatter.type).toBe("execute");
    expect(result.value.frontmatter.wave).toBe(1);
    expect(result.value.frontmatter.dependsOn).toEqual([]);
    expect(result.value.frontmatter.filesModified).toContain("package.json");
    expect(result.value.frontmatter.autonomous).toBe(false);
    expect(result.value.frontmatter.requirements).toEqual(["PROJ-02"]);
    expect(result.value.frontmatter.mustHaves).toBeDefined();
  });

  it("devolve a lista de tarefas com nome e tipo, na ordem do arquivo", () => {
    const result = parsePlanFile(realPlanMd, "01-01-PLAN.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value.tasks).toHaveLength(4);
    expect(result.value.tasks[0].name).toContain("Desbloquear o toolchain");
    expect(result.value.tasks[0].type).toBe("auto");
    expect(result.value.tasks[2].type).toBe("auto");
    expect(result.value.tasks[3].name).toContain("Design tokens");
  });

  it("distingue uma tarefa de checkpoint de uma tarefa automática pelo atributo type", () => {
    const result = parsePlanFile(realPlanMd, "01-01-PLAN.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const checkpointTask = result.value.tasks.find((task) =>
      task.type.startsWith("checkpoint:"),
    );
    expect(checkpointTask).toBeDefined();
    expect(checkpointTask?.type).toBe("checkpoint:human-verify");
    expect(checkpointTask?.name).toContain("Gate de legitimidade");
  });
});

describe("parsePlanFile — degradação graciosa", () => {
  it("PLAN corrompido (sem delimitador de frontmatter) resulta em unrecognized com motivo legível, sem lançar exceção", () => {
    expect(() => {
      const result = parsePlanFile(corruptedPlanMd, "corrupted-01-02-PLAN.md");
      expect(isUnrecognized(result)).toBe(true);
      if (isUnrecognized(result)) {
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues[0].reason.length).toBeGreaterThan(0);
      }
    }).not.toThrow();
  });

  it("região <tasks> ausente ou vazia devolve unrecognized com motivo — nunca uma lista vazia de tarefas", () => {
    const raw = `---
phase: 09-teste
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: [TEST-01]
must_haves:
  truths: []
---

<objective>Plano sem região de tarefas reconhecível.</objective>
`;
    const result = parsePlanFile(raw, "no-tasks-region.md");
    expect(isUnrecognized(result)).toBe(true);
    if (isUnrecognized(result)) {
      expect(result.issues.some((issue) => issue.field === "tasks")).toBe(true);
      expect(result.issues[0].reason).toContain("não foi possível localizar as tarefas");
    }
  });

  it("<tasks> presente mas sem nenhum bloco <task> reconhecível devolve unrecognized, não lista vazia", () => {
    const raw = `---
phase: 09-teste
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: [TEST-01]
must_haves:
  truths: []
---

<tasks>
Nenhum bloco de tarefa aqui, só texto solto.
</tasks>
`;
    const result = parsePlanFile(raw, "empty-tasks-region.md");
    expect(isUnrecognized(result)).toBe(true);
  });

  it("frontmatter YAML malformado (sem campo phase) resulta em unrecognized", () => {
    const raw = `---
plan: 01
type: execute
---

<tasks>
<task type="auto">
  <name>Tarefa sem fase</name>
</task>
</tasks>
`;
    const result = parsePlanFile(raw, "no-phase.md");
    expect(isUnrecognized(result)).toBe(true);
  });
});
