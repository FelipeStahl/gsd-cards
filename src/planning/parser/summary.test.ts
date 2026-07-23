import { describe, expect, it } from "vitest";

import { parseSummaryFile } from "./summary";
import { isUnrecognized } from "../parse-result";

import summaryMd from "../__fixtures__/artifacts/01-01-SUMMARY.md?raw";

describe("parseSummaryFile — fixture real (01-01-SUMMARY.md)", () => {
  it("devolve o frontmatter (requirementsCompleted, status, completed, duration)", () => {
    const result = parseSummaryFile(summaryMd, "01-01-SUMMARY.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value.frontmatter.phase).toBe("01-espelho-fiel");
    expect(result.value.frontmatter.requirementsCompleted).toEqual(["PROJ-02"]);
    expect(result.value.frontmatter.status).toBe("complete");
    expect(result.value.frontmatter.duration).toBe("16min");
    expect(result.value.frontmatter.completed).toContain("2026-07-22");
  });

  it("extrai a lista de commits de ## Task Commits com descrição e hash por item", () => {
    const result = parseSummaryFile(summaryMd, "01-01-SUMMARY.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value.taskCommits).toHaveLength(4);
    expect(result.value.taskCommits[0].description).toContain("Desbloquear o toolchain");
    expect(result.value.taskCommits[0].hash).toBe("1a2b3c4");
    expect(result.value.taskCommits[3].hash).toBe("4d5e6f7");
  });
});

describe("parseSummaryFile — degradação graciosa", () => {
  it("frontmatter YAML malformado (sem campo phase) resulta em unrecognized, sem lançar exceção", () => {
    expect(() => {
      const raw = `---
plan: 01
status: complete
---

## Task Commits

1. **Task 1: algo** - \`abc1234\` (feat)
`;
      const result = parseSummaryFile(raw, "no-phase-SUMMARY.md");
      expect(isUnrecognized(result)).toBe(true);
    }).not.toThrow();
  });

  it("SUMMARY sem a seção ## Task Commits ainda é ok, com taskCommits vazio", () => {
    const raw = `---
phase: 09-teste
plan: 01
status: complete
---

# Summary sem lista de commits
`;
    const result = parseSummaryFile(raw, "no-commits-SUMMARY.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.value.taskCommits).toEqual([]);
  });
});
