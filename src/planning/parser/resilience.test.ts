// BOARD-05 — degradação graciosa da árvore de artefatos: um artefato
// corrompido nunca derruba os demais artefatos/planos da mesma fase.
// Também cobre a regra de granularidade tudo-ou-nada por plano (T-01-06d).

import { describe, expect, it } from "vitest";

import { buildPhaseArtifactTree } from "../artifact-tree";

import realPlanMd from "../__fixtures__/artifacts/01-01-PLAN.md?raw";
import summaryMd from "../__fixtures__/artifacts/01-01-SUMMARY.md?raw";
import corruptedPlanMd from "../__fixtures__/artifacts/corrupted-01-02-PLAN.md?raw";
import verificationMd from "../__fixtures__/artifacts/01-VERIFICATION.md?raw";

function makeLoader(files: Record<string, string>) {
  return async (path: string): Promise<string> => {
    const fileName = path.split("/").pop() ?? path;
    if (fileName in files) return files[fileName];
    throw new Error(`Arquivo sintético não encontrado: ${path}`);
  };
}

describe("buildPhaseArtifactTree — granularidade de tarefa (tudo-ou-nada por plano)", () => {
  it("plano sem SUMMARY correspondente produz todas as tarefas em estado neutro (pending)", async () => {
    const load = makeLoader({ "01-01-PLAN.md": realPlanMd });
    const tree = await buildPhaseArtifactTree("/fake/phase", ["01-01-PLAN.md"], load);

    expect(tree.plans).toHaveLength(1);
    expect(tree.plans[0].tasks.length).toBeGreaterThan(0);
    expect(tree.plans[0].tasks.every((task) => task.state === "pending")).toBe(true);
  });

  it("o mesmo plano com SUMMARY correspondente produz todas as tarefas em estado concluído (done)", async () => {
    const load = makeLoader({
      "01-01-PLAN.md": realPlanMd,
      "01-01-SUMMARY.md": summaryMd,
    });
    const tree = await buildPhaseArtifactTree(
      "/fake/phase",
      ["01-01-PLAN.md", "01-01-SUMMARY.md"],
      load,
    );

    expect(tree.plans).toHaveLength(1);
    expect(tree.plans[0].tasks.length).toBeGreaterThan(0);
    expect(tree.plans[0].tasks.every((task) => task.state === "done")).toBe(true);
  });
});

describe("buildPhaseArtifactTree — resiliência (BOARD-05)", () => {
  it("um PLAN corrompido não impede a montagem dos demais artefatos da mesma fase, e nenhuma chamada lança exceção", async () => {
    const load = makeLoader({
      "01-01-PLAN.md": realPlanMd,
      "01-02-PLAN.md": corruptedPlanMd,
      "01-VERIFICATION.md": verificationMd,
    });

    const tree = await buildPhaseArtifactTree(
      "/fake/phase",
      ["01-01-PLAN.md", "01-02-PLAN.md", "01-VERIFICATION.md"],
      load,
    );

    const validPlan = tree.plans.find((plan) => plan.id === "01");
    expect(validPlan?.parsed).toBe("ok");
    expect(validPlan?.tasks.length).toBeGreaterThan(0);

    const corruptedPlan = tree.plans.find((plan) => plan.id === "02");
    expect(corruptedPlan?.parsed).toBe("unrecognized");
    expect(corruptedPlan?.tasks).toEqual([]);

    const corruptedRef = tree.artifacts.find((ref) => ref.fileName === "01-02-PLAN.md");
    expect(corruptedRef?.parsed).toBe("unrecognized");
    expect(corruptedRef?.issues.length).toBeGreaterThan(0);
    expect(corruptedRef?.issues[0].reason.length).toBeGreaterThan(0);

    const validRef = tree.artifacts.find((ref) => ref.fileName === "01-01-PLAN.md");
    expect(validRef?.parsed).toBe("ok");

    const verificationRef = tree.artifacts.find((ref) => ref.fileName === "01-VERIFICATION.md");
    expect(verificationRef?.parsed).toBe("ok");
  });

  it("um artefato cuja leitura falha (I/O) vira unrecognized localizado, sem lançar exceção", async () => {
    const load = makeLoader({ "01-01-PLAN.md": realPlanMd });
    // "01-02-SUMMARY.md" não está no mapa de arquivos sintéticos — load() lança.
    const tree = await buildPhaseArtifactTree(
      "/fake/phase",
      ["01-01-PLAN.md", "01-02-SUMMARY.md"],
      load,
    );

    const summaryRef = tree.artifacts.find((ref) => ref.fileName === "01-02-SUMMARY.md");
    expect(summaryRef?.parsed).toBe("unrecognized");
    expect(summaryRef?.issues.length).toBeGreaterThan(0);

    const validRef = tree.artifacts.find((ref) => ref.fileName === "01-01-PLAN.md");
    expect(validRef?.parsed).toBe("ok");
  });
});
